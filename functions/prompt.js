const getPrompt = (categoriesData) => {
  const { flat, structured } = categoriesData;

  // Budowa czytelnego drzewa kategorii dla Gemini
  const hierarchyMap = {};
  const parents = structured.filter(c => !c.parentId);

  parents.forEach(p => {
    hierarchyMap[p.name] = structured
      .filter(c => c.parentId === p.id)
      .map(c => c.name);
  });

  // Gwarantujemy istnienie 'kaucje' w kategorii nadrzędnej
  if (!hierarchyMap['kaucje']) {
    hierarchyMap['kaucje'] = [];
  }

  const hierarchyString = Object.entries(hierarchyMap)
    .map(([parent, subs]) => `- ${parent}${subs.length > 0 ? ': [' + subs.join(', ') + ']' : ''}`)
    .join('\n');

  return `
        Twoim zadaniem jest BARDZO DOKŁADNA analiza paragonu lub faktury i zwrócenie danych WYŁĄCZNIE w formacie JSON.

        ---
        **ZASADA KLUCZOWA: CENA BRUTTO**
        Znajdź końcową wartość BRUTTO dla każdego produktu (wartość po rabacie, uwzględniająca ilość).
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
              "price": "number (końcowa wartość brutto)", 
              "category": "string (kategoria nadrzędna)",
              "subCategory": "string (podkategoria z listy, jeśli pasuje)",
              "tags": {
                "nature": "string (stały | zmienny | jednorazowy)",
                "purpose": "string (konieczny | przyjemność | inwestycja)"
              }
            }
          ]
        }

        **Postępuj wg kroków:**
        1. **Dane Główne**: shop, date, currency.
        2. **Kategoryzacja**: Wybierz Kategorię i (jeśli to możliwe) Podkategorię z listy poniżej:
        ${hierarchyString}
        - Jeśli brak pasującej podkategorii, pozostaw "subCategory" jako pusty ciąg.
        - Jeśli brak pasującej kategorii nadrzędnej, użyj "inne".
        3. **Inteligentne Tagi**: Przypisz tagi na podstawie nazwy i typu produktu:
           - **nature**: 
             - "stały" (rachunki, czynsz, abonamenty, stałe opłaty)
             - "zmienny" (jedzenie, chemia, drobne zakupy codzienne)
             - "jednorazowy" (rzadkie zakupy, sprzęt, meble, ubrania kupowane okazjonalnie)
           - **purpose**:
             - "konieczny" (podstawowe potrzeby, leki, media, transport)
             - "przyjemność" (zachcianki, rozrywka, przekąski, hobby)
             - "inwestycja" (produkty i usługi budujące wartość, edukacja, rozwój)
        4. **Nazwy**: Zachowaj oryginalne, popraw tylko skróty jeśli jesteś PEWIEN (np. "CHLEB RAZ" -> "Chleb Razowy").
        5. **Format Wyjściowy**: Tylko czysty JSON.
    `;
}

module.exports = { getPrompt };
