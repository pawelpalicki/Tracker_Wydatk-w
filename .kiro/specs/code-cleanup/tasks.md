# Implementation Plan: Code Cleanup

## Overview

Usunięcie martwego kodu HTML, JS i CSS przed deployem produkcyjnym. Każde zadanie jest niezależne i dotyczy konkretnego pliku.

## Tasks

- [x] 1. Usuń blok `#stats-tab-archived` z `index.html`
  - Usuń cały `<div id="stats-tab-archived">` wraz z zawartością (canvas `category-chart`, `time-chart`, `shop-chart-old`, divy `no-data-pie-chart`, `category-chart-container`, `interactive-legend-container`, `time-chart-container`, `no-data-time-chart`, `shop-chart-container-old`, `no-data-shop-chart-old`, elementy `month-picker-popup`, `month-picker-body`, `month-label-btn`, `month-label-text`, `budget-progress-container`, `budget-summary-container`, `toggle-budget-details`)
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Usuń Slide 2 i `#analysis-swipe-dots` z `index.html`
  - Usuń `<div class="swipe-slide hidden">` (Slide 2) wewnątrz `#analysis-swipe-container` wraz z całą zawartością (elementy `period-type-btn`, `period-type-popup`, `period-type-select`, `period-type-wrapper`, `custom-range-container`, `refresh-long-term-btn`, `long-term-summary`, `long-term-chart-container`, `no-long-term-data`, `category-analysis-container`)
  - Usuń `<div id="analysis-swipe-dots">` z jego dwoma przyciskami `swipe-dot`
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 3. Usuń 10 nieużywanych funkcji z `statistics.js` i referencję w `app.js`
  - [ ] 3.1 Usuń funkcje z `statistics.js`: `renderStatistics`, `renderShopBarChart`, `renderTimeChart`, `updateCategoryPieChart`, `renderInteractiveLegend`, `handleCategoryChartClick`, `setupTimeChartListeners`, `initMonthNavigator`, `populateMonthSelector`, `buildMonthPickerPopup`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_
  - [ ] 3.2 Usuń z `app.js` linię rejestrującą event listener `handleCategoryChartClick` na `#category-chart` (linia ~831: `document.getElementById('category-chart')?.addEventListener('click', handleCategoryChartClick)`)
    - _Requirements: 3.11_

- [ ] 4. Usuń 5 martwych zmiennych globalnych z `statistics.js`
  - Usuń deklaracje: `let timeChartMode`, `let currentMonthlyPurchases`, `let currentStatsMonth`, `let availableMonthsList`, `let currentPickerYear`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 5. Dodaj guard w `initializeLongTermBudget` i usuń duplikat w `long-term-budget.js`
  - Dodaj na początku funkcji `initializeLongTermBudget` guard: `if (longTermBudgetInitialized) return;`
  - Usuń duplikat `window.initializeLongTermBudget = initializeLongTermBudget` z linii ~1418 (pozostaw tylko jedno przypisanie, które już istnieje w tym samym bloku)
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 6. Usuń martwe reguły CSS z `styles.css`
  - Usuń reguły `.swipe-dot` i `.swipe-dot.active`
  - Oceń i usuń reguły `#analysis-swipe-container .swipe-slide` jeśli nie są już potrzebne po usunięciu Slide 2 (kontener nadal istnieje z jednym slajdem, więc sprawdź czy override jest nadal wymagany)
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 7. Checkpoint — upewnij się że aplikacja ładuje się bez błędów JS
  - Sprawdź konsolę przeglądarki po załadowaniu aplikacji pod kątem błędów związanych z usuniętymi ID lub funkcjami
  - Upewnij się że zakładka Analiza wyświetla się poprawnie (tylko wykres porównawczy, bez dots)
  - Upewnij się że zakładka Kokpit renderuje się bez błędów
