const getPrompt = (categories) => {
  // Dodaj 'kaucje' do listy kategorii, jeśli jej nie ma
  const extendedCategories = [...new Set([...categories, 'kaucje'])];
  
  return `
        Twoim zadaniem jest BARDZO DOKŁADNA analiza paragonu lub faktury i zwrócenie danych WYŁĄCZNIE w formacie JSON.

        ---
        **ZASADA KLUCZOWA: CENA BRUTTO (NAJWAŻNIEJSZE!)**
        Twoim absolutnym priorytetem jest znalezienie **końcowej wartości BRUTTO** dla każdego produktu na liście.
        - **WARTOŚĆ > CENA JEDNOSTKOWA**: Na fakturach często występuje "cena jednostkowa" i "wartość" (cena * ilość). Twoim celem jest zawsze **końcowa "wartość" brutto** dla danej pozycji.
        - **BRUTTO > NETTO**: Jeśli widzisz wartość netto i brutto, ZAWSZE wybieraj **BRUTTO**.
        - **IGNORUJ SUMY**: Nie szukaj sumy całkowitej paragonu. Skup się wyłącznie na wartościach poszczególnych produktów.
        ---

        **ZASADA: KAUCJE (BUTELKI, OPAKOWANIA)**
        - **ZAWSZE UWZGLĘDNIAJ KAUCJE**: Nigdy nie pomijaj pozycji takich jak "KAUCJA", "BUTELKA ZWR", "OPAKOWANIE" itp.
        - **KATEGORIA 'kaucje'**: Wszystkie pozycje dotyczące kaucji (zakup lub zwrot) MUSZĄ otrzymać kategorię 'kaucje'.
        - **ZWROTY = WARTOŚĆ UJEMNA**: Jeśli na paragonie widnieje zwrot kaucji (często oznaczony minusem, skrótem "ZWR" lub w sekcji umniejszającej sumę), wartość w JSON musi być **LICZBĄ UJEMNĄ** (np. -0.50).
        ---

        Struktura JSON, której masz użyć:
        {
          "shop": "string",
          "date": "string (format YYYY-MM-DD)",
          "currency": "string (kod waluty: PLN, EUR, USD, GBP, etc.)",
          "items": [
            { "name": "string", "price": "number (końcowa WARTOŚĆ brutto pozycji po rabacie, użyj minusa dla zwrotów)", "category": "string" }
          ]
        }

        Postępuj DOKŁADNIE według tych kroków:
        1.  **Dane Główne**: Wyodrębnij nazwę sklepu ('shop'), datę transakcji ('date') w formacie YYYY-MM-DD i walutę ('currency').
        2.  **Analiza Rabatów i Kaucji**: 
            - Znajdź wszystkie rabaty i dopasuj je do produktów.
            - Znajdź wszystkie kaucje i zwroty. Pamiętaj: zwrot kaucji = cena ujemna.
        3.  **Kategoryzacja**: Dla każdego produktu przypisz kategorię ('category') z tej listy: ${JSON.stringify(extendedCategories)}. Jeśli żadna nie pasuje, użyj "inne". Pozycje kaucji MUSZĄ być w kategorii "kaucje".
        4.  **Nazwy Produktów (WAŻNE)**: Domyślnie zachowaj nazwy produktów DOKŁADNIE tak, jak widnieją na paragonie. Możesz rozwinąć skrót lub poprawić nazwę na bardziej czytelną WYŁĄCZNIE, jeśli jesteś w 100% pewien znaczenia (np. 'CHLEB ŻYT RAZ' -> 'Chleb Żytni Razowy'). Jeśli masz jakiekolwiek wątpliwości, pozostaw nazwę oryginalną. Nie zmieniaj produktów na inne.
        5.  **Format Wyjściowy**: Złóż ostateczną listę ('items') i zwróć ją w wymaganym formacie JSON. Nie dodawaj żadnych wyjaśnień.

        **PRZYKŁADY RABATÓW I KAUCJI:**
        - Produkt z rabatem bezpośrednio przy nim = odejmij rabat od ceny produktu.
        - "KAUCJA BUTELKA" 0.50 -> {"name": "Kaucja butelka", "price": 0.50, "category": "kaucje"}
        - "ZWROT KAUCJI" 1.00 -> {"name": "Zwrot kaucji", "price": -1.00, "category": "kaucje"}

        **Obsługa Błędów**: Jeśli plik jest nieczytelny lub nie jest paragonem/fakturą, zwróć DOKŁADNIE ten JSON:
        { "error": "Nie udało się odczytać danych z dokumentu. Obraz może być nieczytelny lub nie jest paragonem." }
        
        **Przykłady idealnych odpowiedzi**:
        
        {
          "shop": "Biedronka",
          "date": "2025-07-25",
          "currency": "PLN",
          "items": [
            {"name": "Sok pomarańczowy", "price": 4.50, "category": "spożywcze"},
            {"name": "Mleko 2%", "price": 2.00, "category": "spożywcze"},
            {"name": "Butelka zwrotna", "price": 1.00, "category": "kaucje"},
            {"name": "Zwrot butelek", "price": -2.00, "category": "kaucje"}
          ]
        }
    `;
}

module.exports = { getPrompt };

module.exports = { getPrompt };
