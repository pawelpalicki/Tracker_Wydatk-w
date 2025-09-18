const getPrompt = (categories) => {
    return `
        Twoim zadaniem jest BARDZO DOKŁADNA analiza paragonu lub faktury i zwrócenie danych WYŁĄCZNIE w formacie JSON.

        ---
        **ZASADA KLUCZOWA: CENA BRUTTO (NAJWAŻNIEJSZE!)**
        Twoim absolutnym priorytetem jest znalezienie **końcowej wartości BRUTTO** dla każdego produktu na liście.
        - **WARTOŚĆ > CENA JEDNOSTKOWA**: Na fakturach często występuje "cena jednostkowa" i "wartość" (cena * ilość). Twoim celem jest zawsze **końcowa "wartość" brutto** dla danej pozycji.
        - **BRUTTO > NETTO**: Jeśli widzisz wartość netto i brutto, ZAWSZE wybieraj **BRUTTO**.
        - **IGNORUJ SUMY**: Nie szukaj sumy całkowitej paragonu. Skup się wyłącznie na wartościach poszczególnych produktów.
        ---

        Struktura JSON, której masz użyć:
        {
          "shop": "string",
          "date": "string (format YYYY-MM-DD)",
          "currency": "string (kod waluty: PLN, EUR, USD, GBP, etc.)",
          "items": [
            { "name": "string", "price": "number (końcowa WARTOŚĆ brutto pozycji po rabacie)", "category": "string" }
          ]
        }

        Postępuj DOKŁADNIE według tych kroków:
        1.  **Dane Główne**: Wyodrębnij nazwę sklepu ('shop'), datę transakcji ('date') w formacie YYYY-MM-DD i walutę ('currency').
        2.  **Analiza Rabatów**: Znajdź wszystkie rabaty na paragonie i dopasuj je do odpowiednich produktów, aby na ich podstawie obliczyć cenę końcową (zgodnie z ZASADĄ KLUCZOWĄ powyżej):
            -   Rabaty bezpośrednio przy produkcie (pod, obok, w tej samej linii).
            -   Rabaty na dole paragonu z nazwą produktu (np. "Rabat Mleko").
            -   Rabaty ogólne (bez nazwy produktu) - rozdziel proporcjonalnie między wszystkie produkty.
        3.  **Kategoryzacja**: Dla każdego produktu przypisz kategorię ('category') z tej listy: ${JSON.stringify(categories)}. Jeśli żadna nie pasuje, użyj "inne".
        4.  **Format Wyjściowy**: Złóż ostateczną listę ('items') i zwróć ją w wymaganym formacie JSON. Nie dodawaj żadnych wyjaśnień.

        **PRZYKŁADY RABATÓW:**
        - Produkt z rabatem bezpośrednio przy nim = odejmij rabat od ceny produktu.
        - Rabat z nazwą produktu gdziekolwiek na paragonie = przypisz do tego produktu.
        - Rabat ogólny bez nazwy produktu = rozdziel między wszystkie produkty.

        **Obsługa Błędów**: Jeśli plik jest nieczytelny lub nie jest paragonem/fakturą, zwróć DOKŁADNIE ten JSON:
        { "error": "Nie udało się odczytać danych z dokumentu. Obraz może być nieczytelny lub nie jest paragonem." }
        
        **Przykłady idealnych odpowiedzi**:
        
        Przykład 1:
        {
          "shop": "Biedronka",
          "date": "2025-07-25",
          "currency": "PLN",
          "items": [
            {"name": "Sok pomarańczowy", "price": 4.50, "category": "spożywcze"},
            {"name": "Mleko 2%", "price": 2.00, "category": "spożywcze"}
          ]
        }
        
        Przykład 2:
        {
          "shop": "Carrefour",
          "date": "2025-07-25", 
          "currency": "EUR",
          "items": [
            {"name": "Orange Juice", "price": 2.50, "category": "spożywcze"},
            {"name": "Milk", "price": 1.20, "category": "spożywcze"}
          ]
        }
    `;
}

module.exports = { getPrompt };
