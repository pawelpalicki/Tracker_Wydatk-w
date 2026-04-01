# Requirements Document

## Introduction

Przed deployem aplikacji Tracker Wydatków na główny kanał produkcyjny Firebase, należy usunąć martwy kod i nieużywane elementy pozostałe po poprzedniej wersji UI. Celem jest zmniejszenie rozmiaru ładowanych zasobów, wyeliminowanie potencjalnych błędów wynikających z podwójnych wywołań inicjalizacji oraz uproszczenie bazy kodu do stanu odpowiadającego aktualnemu UI.

Zakres obejmuje: martwe elementy HTML (archiwalne divy ze zduplikowanymi ID), nieużywane funkcje i zmienne globalne JavaScript w `statistics.js`, brakujący guard przed podwójną inicjalizacją w `long-term-budget.js`, oraz nieużywane reguły CSS dla usuniętych komponentów swipe.

## Glossary

- **Application**: Aplikacja webowa Tracker Wydatków (frontend w `APP/`).
- **Dead_Code**: Kod JavaScript, HTML lub CSS, który nie jest wywoływany ani renderowany w żadnej ścieżce wykonania aktualnego UI.
- **Stats_Archive_Block**: Blok HTML `<div id="stats-tab-archived">` zawierający canvas i divy ze starych statystyk miesięcznych.
- **Slide2_Block**: Blok HTML `<div class="swipe-slide hidden">` (Slide 2) wewnątrz `#analysis-swipe-container` zawierający UI analizy budżetu długoterminowego.
- **Statistics_Module**: Plik `APP/js/statistics.js` zawierający zarówno aktywne funkcje kokpitu, jak i nieużywane funkcje starych statystyk miesięcznych.
- **LongTermBudget_Module**: Plik `APP/js/long-term-budget.js` zawierający logikę wykresu porównawczego w zakładce Analiza.
- **Swipe_Dots_CSS**: Reguły CSS dla selektorów `.swipe-dot` i `#analysis-swipe-container .swipe-slide` w `APP/css/styles.css`.
- **Guard**: Warunek sprawdzający flagę inicjalizacji na początku funkcji, zapobiegający wielokrotnemu wykonaniu.

## Requirements

### Requirement 1: Usunięcie archiwalnego bloku HTML ze starymi statystykami

**User Story:** As a developer, I want to remove the archived stats HTML block, so that the DOM does not contain dead elements with duplicate IDs that could cause JavaScript errors.

#### Acceptance Criteria

1. THE Application SHALL NOT contain a DOM element with `id="stats-tab-archived"` after the cleanup.
2. THE Application SHALL NOT contain canvas elements with `id="category-chart"`, `id="time-chart"`, or `id="shop-chart-old"` outside of active UI components after the cleanup.
3. THE Application SHALL NOT contain div elements with `id="no-data-pie-chart"`, `id="category-chart-container"`, `id="interactive-legend-container"`, `id="time-chart-container"`, `id="no-data-time-chart"`, `id="shop-chart-container-old"`, `id="no-data-shop-chart-old"` after the cleanup.
4. THE Application SHALL NOT contain elements with `id="month-picker-popup"`, `id="month-picker-body"`, `id="month-label-btn"`, `id="month-label-text"`, `id="budget-progress-container"`, `id="budget-summary-container"`, or `id="toggle-budget-details"` inside the archived block after the cleanup.
5. WHEN the Application loads, THE Application SHALL render without JavaScript errors related to duplicate element IDs.

### Requirement 2: Usunięcie Slide 2 z zakładki Analiza

**User Story:** As a developer, I want to remove the hidden Slide 2 from the analysis tab, so that the swipe container contains only the active comparison chart slide.

#### Acceptance Criteria

1. THE Application SHALL NOT contain a second `swipe-slide` element inside `#analysis-swipe-container` after the cleanup.
2. THE Application SHALL NOT contain elements with `id="period-type-btn"`, `id="period-type-popup"`, `id="period-type-select"`, `id="period-type-wrapper"`, `id="custom-range-container"`, `id="refresh-long-term-btn"`, `id="long-term-summary"`, `id="long-term-chart-container"`, `id="no-long-term-data"`, or `id="category-analysis-container"` after the cleanup.
3. THE Application SHALL NOT contain the `#analysis-swipe-dots` indicator element after the cleanup, as it served only the two-slide layout.
4. WHEN a user navigates to the analysis tab, THE Application SHALL display only the comparison chart slide without any swipe navigation dots.

### Requirement 3: Usunięcie nieużywanych funkcji z statistics.js

**User Story:** As a developer, I want to remove unused monthly statistics functions from statistics.js, so that the file contains only code that is actively called by the current UI.

#### Acceptance Criteria

1. THE Statistics_Module SHALL NOT contain the function `renderStatistics` after the cleanup.
2. THE Statistics_Module SHALL NOT contain the function `renderShopBarChart` after the cleanup.
3. THE Statistics_Module SHALL NOT contain the function `renderTimeChart` after the cleanup.
4. THE Statistics_Module SHALL NOT contain the function `updateCategoryPieChart` after the cleanup.
5. THE Statistics_Module SHALL NOT contain the function `renderInteractiveLegend` after the cleanup.
6. THE Statistics_Module SHALL NOT contain the function `handleCategoryChartClick` after the cleanup.
7. THE Statistics_Module SHALL NOT contain the function `setupTimeChartListeners` after the cleanup.
8. THE Statistics_Module SHALL NOT contain the function `initMonthNavigator` after the cleanup.
9. THE Statistics_Module SHALL NOT contain the function `populateMonthSelector` after the cleanup.
10. THE Statistics_Module SHALL NOT contain the function `buildMonthPickerPopup` after the cleanup.
11. WHEN the Application loads, THE Application SHALL NOT register the `handleCategoryChartClick` event listener on `#category-chart` (currently registered in `app.js`).

### Requirement 4: Usunięcie nieużywanych zmiennych globalnych z statistics.js

**User Story:** As a developer, I want to remove global variables that were only used by the deleted statistics functions, so that the global scope is not polluted with dead state.

#### Acceptance Criteria

1. THE Statistics_Module SHALL NOT declare the global variable `timeChartMode` after the cleanup.
2. THE Statistics_Module SHALL NOT declare the global variable `currentMonthlyPurchases` after the cleanup.
3. THE Statistics_Module SHALL NOT declare the global variable `currentStatsMonth` after the cleanup.
4. THE Statistics_Module SHALL NOT declare the global variable `availableMonthsList` after the cleanup.
5. THE Statistics_Module SHALL NOT declare the global variable `currentPickerYear` after the cleanup.

### Requirement 5: Dodanie guardu przed podwójną inicjalizacją w long-term-budget.js

**User Story:** As a developer, I want the `initializeLongTermBudget` function to guard against double invocation, so that the chart and event listeners are not registered twice when the analysis tab is opened multiple times.

#### Acceptance Criteria

1. WHEN `initializeLongTermBudget` is called and `longTermBudgetInitialized` is `true`, THE LongTermBudget_Module SHALL return immediately without re-executing initialization logic.
2. WHEN `initializeLongTermBudget` is called and `longTermBudgetInitialized` is `false`, THE LongTermBudget_Module SHALL execute the full initialization sequence and set `longTermBudgetInitialized` to `true`.
3. THE LongTermBudget_Module SHALL NOT assign `window.initializeLongTermBudget` more than once (the duplicate assignment on line 1418 SHALL be removed).
4. WHEN `initializeLongTermBudget` is called a second time after successful initialization, THE Application SHALL NOT register duplicate Chart.js event listeners or re-render the chart unnecessarily.

### Requirement 6: Usunięcie nieużywanych reguł CSS

**User Story:** As a developer, I want to remove CSS rules that only apply to removed HTML elements, so that the stylesheet does not contain dead rules.

#### Acceptance Criteria

1. IF the `#analysis-swipe-dots` element and the second `swipe-slide` are removed from HTML, THEN THE Application SHALL remove the `.swipe-dot` and `.swipe-dot.active` CSS rules from `styles.css`.
2. IF the `#analysis-swipe-container .swipe-slide` override rules exist solely to fix layout for the two-slide swipe container, THEN THE Application SHALL evaluate whether those rules are still needed and remove them if they are no longer referenced by active HTML.
3. WHEN the Application loads after cleanup, THE Application SHALL NOT load CSS rules that target only removed HTML elements.
