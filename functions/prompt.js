// Wspólny kontekst kategorii i tagów dla promptów AI.
// Dzięki temu analiza paragonu i analiza wydatku głosowego korzystają z tych samych zasad mapowania.
function buildCategoryContext(categoriesData = {}, tagDefinitions = {}) {
  const { structured = [] } = categoriesData;

  // Budowa uproszczonego drzewa: kategoria nadrzędna -> lista podkategorii.
  const hierarchyMap = {};
  const parents = structured.filter(category => !category.parentId);

  parents.forEach(parent => {
    hierarchyMap[parent.name] = structured
      .filter(category => category.parentId === parent.id)
      .map(category => category.name);
  });

  let kaucjeParent = null;
  let hasKaucjeSub = false;

  // Sprawdzamy, czy użytkownik ma już kategorię lub podkategorię "kaucje".
  Object.entries(hierarchyMap).forEach(([parent, subCategories]) => {
    if (parent.toLowerCase() === 'kaucje') {
      kaucjeParent = parent;
    }

    if (subCategories.some(subCategory => subCategory.toLowerCase() === 'kaucje')) {
      kaucjeParent = parent;
      hasKaucjeSub = true;
    }
  });

  if (!kaucjeParent) {
    hierarchyMap.kaucje = [];
    kaucjeParent = 'kaucje';
  }

  const hierarchyString = Object.entries(hierarchyMap)
    .map(([parent, subCategories]) => `- ${parent}${subCategories.length > 0 ? `: [${subCategories.join(', ')}]` : ''}`)
    .join('\n');

  const groups = Object.keys(tagDefinitions).filter(group => Array.isArray(tagDefinitions[group]));
  const tagDescriptions = [];
  const tagsSchema = {};

  // Definicje tagów budują jednocześnie opis dla promptu i schemat oczekiwanego JSON-a.
  groups.forEach(group => {
    const values = tagDefinitions[group]
      .map(tag => tag.value)
      .filter(Boolean);

    if (values.length > 0) {
      const valuesString = values.join(' | ');
      tagDescriptions.push(`- **${group}**: wybierz jedną wartość z listy: ${valuesString}`);
      tagsSchema[group] = `string (${valuesString})`;
    }
  });

  if (tagDescriptions.length === 0) {
    tagDescriptions.push('- **nature**: wybierz jedną wartość z listy: stały | zmienny | jednorazowy');
    tagDescriptions.push('- **purpose**: wybierz jedną wartość z listy: konieczny | przyjemność | inwestycja');
    tagsSchema.nature = 'string (stały | zmienny | jednorazowy)';
    tagsSchema.purpose = 'string (konieczny | przyjemność | inwestycja)';
  }

  return {
    hierarchyString,
    tagDescriptions,
    tagsSchema,
    kaucjeInstruction: hasKaucjeSub
      ? `Użyj kategorii '${kaucjeParent}' i podkategorii 'kaucje'.`
      : `Użyj kategorii '${kaucjeParent}'.`
  };
}

// Prompt do analizy zdjęcia paragonu lub faktury.
function getPrompt(categoriesData, tagDefinitions = {}) {
  const {
    hierarchyString,
    tagDescriptions,
    tagsSchema,
    kaucjeInstruction
  } = buildCategoryContext(categoriesData, tagDefinitions);

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
        3. **Kategoryzacja**: Wybierz Kategorię i (jeśli to możliwe) Podkategorię z listy poniżej:
        ${hierarchyString}
        - Jeśli brak pasującej podkategorii, pozostaw "subCategory" jako pusty ciąg.
        - Jeśli brak pasującej kategorii nadrzędnej, użyj "inne".
        4. **Inteligentne Tagi**: Przypisz tagi na podstawie nazwy i typu produktu dla każdej grupy:
        ${tagDescriptions.join('\n')}
        5. **Nazwy**: Zachowaj oryginalne, popraw tylko skróty jeśli jesteś PEWIEN.
        6. **Weryfikacja końcowa**: Suma price wszystkich items[] MUSI być równa kwocie DO ZAPŁATY z paragonu (pamiętaj, że zwroty kaucji obniżają tę sumę).
        7. **Format Wyjściowy**: Tylko czysty JSON.
    `;
}

// Prompt do analizy tekstu pochodzącego z transkrypcji nagrania głosowego.
// Zawiera jawny kontekst daty lokalnej, żeby model poprawnie rozumiał wyrażenia względne.
function getVoiceExpensePrompt(categoriesData, tagDefinitions = {}, context = {}) {
  const {
    hierarchyString,
    tagDescriptions,
    tagsSchema,
    kaucjeInstruction
  } = buildCategoryContext(categoriesData, tagDefinitions);

  const referenceDate = context.localDate || 'nieznana';
  const referenceTimezone = context.timezone || 'Europe/Warsaw';

  return `
        Zamieniasz polską wypowiedź użytkownika o wydatku na ustrukturyzowany JSON do aplikacji finansowej.
        Odpowiedz WYŁĄCZNIE poprawnym JSON-em zgodnym ze schematem poniżej.

        KONTEKST CZASOWY:
        - Lokalna data użytkownika: ${referenceDate}
        - Strefa czasowa użytkownika: ${referenceTimezone}
        - Interpretuj wyrażenia względne względem tej daty.
        - "wczoraj" = 1 dzień przed lokalną datą użytkownika.
        - "przedwczoraj" = 2 dni przed lokalną datą użytkownika.
        - "w zeszły poniedziałek" = poprzedni poniedziałek przed lokalną datą użytkownika, nie przyszły.
        - Jeśli użytkownik nie poda daty, użyj lokalnej daty użytkownika.

        ZASADY ANALIZY:
        - Wypowiedź może być potoczna, niepełna i zawierać błędy transkrypcji.
        - Poprawiaj oczywiste błędy transkrypcji tylko wtedy, gdy znaczenie jest jednoznaczne.
        - Nie wymyślaj danych. Jeśli sklep nie padł, ustaw shop na "Zakup głosowy".
        - Jeśli waluta nie została podana, przyjmij PLN.
        - Jeśli użytkownik wymienia kilka produktów, ZAWSZE rozbij je na osobne elementy w items[], nawet gdy podał tylko jedną kwotę łączną całego zakupu.
        - Jeśli użytkownik podał kilka produktów i jedną kwotę łączną, oszacuj rozsądny podział tej kwoty pomiędzy produkty proporcjonalnie do typowych relacji cen tych produktów. Suma wszystkich price w items[] musi być równa podanej kwocie łącznej.
        - Jeśli użytkownik podał część cen dokładnie, zachowaj te ceny, a brakującą część kwoty rozdziel pomiędzy pozostałe produkty w sposób możliwie najbardziej realistyczny.
        - Dopiero gdy nie da się wiarygodnie rozdzielić zakupu na produkty, możesz zwrócić jeden element zbiorczy w items[].
        - Zachowaj kaucje i zwroty jako osobne pozycje. Zwroty muszą mieć wartość ujemną.
        - **KATEGORYZACJA KAUCJI**: ${kaucjeInstruction}

        Dostępne kategorie i podkategorie:
        ${hierarchyString}

        Dostępne grupy tagów:
        ${tagDescriptions.join('\n')}

        Schemat JSON:
        {
          "shop": "string",
          "date": "string (YYYY-MM-DD)",
          "currency": "string (np. PLN)",
          "items": [
            {
              "name": "string",
              "price": "number",
              "category": "string (kategoria nadrzędna)",
              "subCategory": "string (podkategoria z listy, jeśli pasuje)",
              "tags": ${JSON.stringify(tagsSchema, null, 2)}
            }
          ]
        }

        Wymagania jakościowe:
        1. Użyj dokładnej daty w formacie YYYY-MM-DD.
        2. Jeśli brak pasującej podkategorii, ustaw pusty ciąg.
        3. Jeśli brak pasującej kategorii, użyj "inne".
        4. Każdy element musi mieć nazwę i liczbę w price.
        5. Jeśli w wypowiedzi pada kwota łączna zakupu, suma price wszystkich elementów musi być dokładnie równa tej kwocie.
        6. Zwróć tylko czysty JSON, bez markdownu i bez komentarzy.
    `;
}

module.exports = {
  getPrompt,
  getVoiceExpensePrompt
};
