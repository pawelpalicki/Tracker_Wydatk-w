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

  // Gwarantujemy istnienie 'kaucje'
  if (!hierarchyMap['kaucje']) {
    hierarchyMap['kaucje'] = [];
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

        **NIE DODAWAJ** rabatu globalnego jako osobnej pozycji w items[]. Rabat zawsze wchodzi w cenę produktu.
        ---

        **ZASADA: KAUCJE (BUTELKI, OPAKOWANIA)**
        - **ZAWSZE UWZGLĘDNIAJ KAUCJE**: "KAUCJA", "BUTELKA ZWR", "OPAKOWANIE".
        - **KATEGORIA 'kaucje'**: Wszystkie kaucje MUSZĄ mieć kategorię 'kaucje'.
        - **ZWROTY = WARTOŚĆ UJEMNA**: Zwrot kaucji musi być liczbą ujemną w JSON (np. -0.50).
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
        2. **Identyfikacja rabatów**: Najpierw oblicz ceny netto wszystkich produktów uwzględniając rabaty.
        3. **Kategoryzacja**: Wybierz Kategorię i (jeśli to możliwe) Podkategorię z listy poniżej:
        ${hierarchyString}
        - Jeśli brak pasującej podkategorii, pozostaw "subCategory" jako pusty ciąg.
        - Jeśli brak pasującej kategorii nadrzędnej, użyj "inne".
        4. **Inteligentne Tagi**: Przypisz tagi na podstawie nazwy i typu produktu dla każdej grupy:
        ${tagDescriptions.join('\n')}
        5. **Nazwy**: Zachowaj oryginalne, popraw tylko skróty jeśli jesteś PEWIEN.
        6. **Weryfikacja końcowa**: Suma price wszystkich items[] MUSI być równa kwocie DO ZAPŁATY z paragonu.
        7. **Format Wyjściowy**: Tylko czysty JSON.
    `;
};

module.exports = { getPrompt };
