const getPrompt = (categoriesData, tagDefinitions = {}) => {
  const { flat, structured } = categoriesData;

  // 1. Budowa drzewa kategorii (hierarchia)
  const hierarchyMap = {};
  const parents = (structured || []).filter(c => !c.parentId);

  parents.forEach(p => {
    hierarchyMap[p.name] = (structured || [])
      .filter(c => c.parentId === p.id)
      .map(c => c.name);
  });

  // Szukamy gdzie w hierarchii jest 'kaucje' (jako kategoria lub podkategoria)
  let kaucjeParent = null;
  let hasKaucjeSub = false;

  Object.entries(hierarchyMap).forEach(([parent, subs]) => {
    if (parent.toLowerCase() === 'kaucje') {
      kaucjeParent = parent;
    }
    if (subs.some(s => s.toLowerCase() === 'kaucje')) {
      kaucjeParent = parent;
      hasKaucjeSub = true;
    }
  });

  // Jeśli nie ma w ogóle, dodajemy jako top-level dla AI, 
  // ale UI i tak to pewnie zmapuje na Inne jeśli użytkownik nie ma takiej kategorii
  if (!kaucjeParent) {
    hierarchyMap['kaucje'] = [];
    kaucjeParent = 'kaucje';
  }

  const hierarchyString = Object.entries(hierarchyMap)
    .map(([parent, subs]) => `- ${parent}${subs.length > 0 ? ': [' + subs.join(', ') + ']' : ''}`)
    .join('\n');

  // 2. Dynamiczne tagi
  // Upewniamy się, że mamy przynajmniej nature i purpose
  const groups = Object.keys(tagDefinitions).filter(k => Array.isArray(tagDefinitions[k]));

  const tagDescriptions = [];
  const tagsSchema = {};

  groups.forEach(group => {
    const values = tagDefinitions[group]
      .map(t => t.value)
      .filter(Boolean);

    if (values.length > 0) {
      const valuesStr = values.join(' | ');
      tagDescriptions.push(`- **${group}**: wybierz jedną wartość z listy: ${valuesStr}`);
      tagsSchema[group] = `string (${valuesStr})`;
    }
  });

  // Fallback dla starych definicji (jeśli brak)
  if (tagDescriptions.length === 0) {
    tagDescriptions.push('- **nature**: wybierz jedną wartość z listy: stały | zmienny | jednorazowy');
    tagDescriptions.push('- **purpose**: wybierz jedną wartość z listy: konieczny | przyjemność | inwestycja');
    tagsSchema.nature = 'string (stały | zmienny | jednorazowy)';
    tagsSchema.purpose = 'string (konieczny | przyjemność | inwestycja)';
  }

  const kaucjeInstruction = hasKaucjeSub
    ? `Użyj kategorii '${kaucjeParent}' i podkategorii 'kaucje'.`
    : `Użyj kategorii '${kaucjeParent}'.`;

  return `
        Twoim zadaniem jest BARDZO DOKŁADNA analiza paragonu lub faktury i zwrócenie danych WYŁĄCZNIE w formacie JSON.

        ---
        **ZASADA KLUCZOWA: CENA BRUTTO PO RABATACH**
        Znajdź końcową wartość BRUTTO dla każdego produktu (wartość po wszelkich rabatach, uwzględniająca ilość).
        ---

        **ZASADA: OBSŁUGA RABATÓW**
        Paragony mogą zawierać dwa typy rabatów — musisz je obsłużyć RÓŻNIE:

        **TYP 1 — Rabat pod konkretnym produktem (rabat pozycyjny):**
        - Rozpoznasz go po tym, że pojawia się bezpośrednio pod nazwą produktu, często z napisem "RABAT", "OPUST", "ZNIZKA", "OSZ." lub symbolem "*".
        - **Działanie**: Odejmij wartość rabatu od ceny tego konkretnego produktu.

        **TYP 2 — Rabat globalny na dole paragonu (rabat od całości):**
        - Rozpoznasz go po tym, że pojawia się NA DOLE paragonu, po wszystkich pozycjach, często z napisem "RABAT ŁĄCZNY", "RABAT OD ZAKUPÓW", "KUPON", "VOUCHER" lub podobnym.
        - **Działanie**: Rozłóż rabat PROPORCJONALNIE na każdy produkt wg wzoru:
          rabat_produktu = cena_produktu / suma_wszystkich_produktów × wartość_rabatu_globalnego

        **NIE DODAWAJ** rabatu globalnego jako osobnej pozycji w items[] jako ujemnej kwoty, jeśli jest to rabat od sumy. Rabat zawsze wchodzi w cenę produktu.
        ---

        **ZASADA: KAUCJE I ZWROTY (BUTELKI, OPAKOWANIA)**
        - **SZUKAJ WSZĘDZIE**: Kaucje mogą być na liście produktów LUB pod podsumowaniem (po słowach "SUMA", "RAZEM", "DO ZAPŁATY").
        - **SŁOWA KLUCZOWE**: "KAUCJA", "BUTELKA", "OPAKOWANIE", "ZWR", "SZKŁO", "BON", "OPAK".
        - **WYODRĘBNIAJ JAKO POZYCJE**: Nawet jeśli zwrot kaucji (np. "BON - zwrot opakowania") znajduje się pod sumą, MUSISZ dodać go jako osobny element w tablicy items[].
        - **ZWROTY = WARTOŚĆ UJEMNA**: Jeśli widzisz zwrot kaucji (często z minusem, napisem "ZWROT", "ZWRTO", "BON" lub "RABAT" w sekcji kaucji), zwróć to jako ujemną liczbę (np. price: -1.50).
        - **KATEGORYZACJA**: ${kaucjeInstruction}
        ---

        Struktura JSON:
        {
          "shop": "string",
          "date": "string (YYYY-MM-DD)",
          "currency": "string (np. PLN)",
          "items": [
            { 
              "name": "string", 
              "price": "number (końcowa wartość brutto po rabatach)", 
              "category": "string (kategoria nadrzędna)",
              "subCategory": "string (podkategoria z listy, jeśli pasuje)",
              "tags": ${JSON.stringify(tagsSchema, null, 2)}
            }
          ]
        }

        **Postępuj wg kroków:**
        1. **Dane Główne**: shop, date, currency.
        2. **Identyfikacja rabatów i kaucji**: Oblicz ceny produktów uwzględniając rabaty. Znajdź wszystkie kaucje i zwroty (nawet te na samym dole paragonu).
        3. **Kategoryzacja**: Wybierz Kategorię i (jeśli to możliwe) Podkategorie z listy poniżej:
        ${hierarchyString}
        - Jeśli brak pasującej podkategorii, pozostaw "subCategory" jako pusty ciąg.
        - Jeśli brak pasującej kategorii nadrzędnej, użyj "inne".
        4. **Inteligentne Tagi**: Przypisz tagi na podstawie nazwy i typu produktu dla każdej grupy:
        ${tagDescriptions.join('\n')}
        5. **Nazwy**: Zachowaj oryginalne, popraw tylko skróty jeśli jesteś PEWIEN.
        6. **Weryfikacja końcowa**: Suma price wszystkich items[] MUSI być równa kwocie DO ZAPŁATY z paragonu (pamiętaj, że zwroty kaucji obniżają tę sumę).
        7. **Format Wyjściowy**: Tylko czysty JSON.
    `;
};

module.exports = { getPrompt };
