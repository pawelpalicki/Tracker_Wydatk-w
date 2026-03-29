const getPrompt = (categoriesData, tagDefinitions = {}) => {
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

  const natureValues = (Array.isArray(tagDefinitions.nature) && tagDefinitions.nature.length > 0)
    ? tagDefinitions.nature.map(t => t.value).filter(Boolean)
    : ['stały', 'zmienny', 'jednorazowy'];
  const purposeValues = (Array.isArray(tagDefinitions.purpose) && tagDefinitions.purpose.length > 0)
    ? tagDefinitions.purpose.map(t => t.value).filter(Boolean)
    : ['konieczny', 'przyjemność', 'inwestycja'];
  const natureValuesStr = natureValues.join(' | ');
  const purposeValuesStr = purposeValues.join(' | ');

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
        - Przykład: "MLEKO 3,50 / RABAT -0,50" → price: 3.00

        **TYP 2 — Rabat globalny na dole paragonu (rabat od całości):**
        - Rozpoznasz go po tym, że pojawia się NA DOLE paragonu, po wszystkich pozycjach, często z napisem "RABAT ŁĄCZNY", "RABAT OD ZAKUPÓW", "KUPON", "VOUCHER" lub podobnym.
        - **Działanie**: Rozłóż rabat PROPORCJONALNIE na każdy produkt wg wzoru:
          rabat_produktu = cena_produktu / suma_wszystkich_produktów × wartość_rabatu_globalnego
        - Przykład: suma 100 zł, rabat globalny -10 zł, produkt A = 40 zł → price: 40 - (40/100 × 10) = 36.00
        - Zaokrąglaj wynik do 2 miejsc po przecinku.
        - **NIE DODAWAJ** rabatu globalnego jako osobnej pozycji w items[].

        **ZASADA OGÓLNA**: Nigdy nie dodawaj rabatów jako osobnych pozycji w items[]. Rabat zawsze wchodzi w cenę produktu.
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
              "tags": {
                "nature": "string (${natureValuesStr})",
                "purpose": "string (${purposeValuesStr})"
              }
            }
          ]
        }

        **Postępuj wg kroków:**
        1. **Dane Główne**: shop, date, currency.
        2. **Identyfikacja rabatów PRZED kategoryzacją**:
           a. Przeskanuj cały paragon i zidentyfikuj WSZYSTKIE rabaty.
           b. Określ typ każdego rabatu (pozycyjny lub globalny).
           c. Dla rabatów pozycyjnych: zastosuj je od razu do cen konkretnych produktów.
           d. Dla rabatów globalnych: oblicz proporcjonalny udział dla każdego produktu (wg wzoru z TYP 2).
           e. Dopiero na cenach po rabatach buduj listę items[].
        3. **Kategoryzacja**: Wybierz Kategorię i (jeśli to możliwe) Podkategorię z listy poniżej:
        ${hierarchyString}
        - Jeśli brak pasującej podkategorii, pozostaw "subCategory" jako pusty ciąg.
        - Jeśli brak pasującej kategorii nadrzędnej, użyj "inne".
        4. **Inteligentne Tagi**: Przypisz tagi na podstawie nazwy i typu produktu:
           - **nature**: wybierz jedną wartość z listy: ${natureValuesStr}
           - **purpose**: wybierz jedną wartość z listy: ${purposeValuesStr}
        5. **Nazwy**: Zachowaj oryginalne, popraw tylko skróty jeśli jesteś PEWIEN (np. "CHLEB RAZ" -> "Chleb Razowy").
        6. **Weryfikacja końcowa**: Suma price wszystkich items[] MUSI być równa kwocie DO ZAPŁATY z paragonu. Jeśli się nie zgadza — sprawdź obliczenia rabatów.
        7. **Format Wyjściowy**: Tylko czysty JSON.
    `;
}

module.exports = { getPrompt };
