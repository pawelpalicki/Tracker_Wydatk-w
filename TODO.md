# TODO - Ulepszenia Tracker Wydatków

## 🎨 Poprawki wyglądu na desktop (PRIORYTET)

### Layout główny
- [ ] Zwiększyć szerokość aplikacji z `max-w-4xl` na `max-w-6xl` - zajmie więcej miejsca na monitorze
- [ ] Zmienić główny grid kokpitu na 3 kolumny (`lg:grid-cols-3`) na dużych ekranach
- [ ] Umieścić wykresy "Porównanie wydatków" i "Wydatki w sklepach" obok siebie w grid 2-kolumnowy

### Kafelki podsumowania budżetu
- [ ] Dodać `lg:grid-cols-4` dla kafelków budżetu na większych ekranach
- [ ] Więcej miejsca na kwoty - teraz są za wąskie i kwoty się nie mieszczą

### Kontener "Szybkie Akcje"
- [x] ✅ ZROBIONE - Naprawiono wysokość kontenera (usunięto `flex-col justify-center`)

### Styl "Wydatki bez budżetu"
- [ ] Zmienić z ostrzegawczego żółtego na informacyjny niebieski
- [ ] Zmienić ikonę z ⚠️ na ℹ️
- [ ] To nie jest ostrzeżenie, tylko informacja

## 📊 Budżet długoterminowy (GŁÓWNA FUNKCJA)

### Backend - API
- [ ] Naprawić endpoint `/api/budgets/longterm` - obecnie błąd 500
- [ ] Problem: Firestore wymaga indeksu dla zapytania `userId + date`
- [ ] Rozwiązanie: Filtrować po dacie w kodzie zamiast w zapytaniu Firestore

### Frontend - Nowa zakładka
- [ ] Dodać 5. zakładkę "Długoterminowy" z ikoną 📈 trendu
- [ ] Widok z wyborem okresu (3, 6, 12 miesięcy)
- [ ] Podsumowanie: łączny budżet, wydatki, bilans, średnia/miesiąc
- [ ] Wykres trendu budżet vs wydatki przez miesiące (Chart.js)
- [ ] Tabela miesięczna z detalami i statusem (✅/⚠️)

### Funkcje JavaScript
- [ ] `renderLongtermBudget()` - główna funkcja
- [ ] `renderLongtermSummary()` - kafelki podsumowania
- [ ] `renderLongtermChart()` - wykres liniowy
- [ ] `renderLongtermTable()` - tabela miesięczna
- [ ] `showNoLongtermData()` - gdy brak danych

## 🔧 Porządek techniczny

### Gałęzie Git
- [x] ✅ ZROBIONE - Uporządkowano gałęzie (patrz sekcja poniżej)

### Nawigacja
- [x] ✅ ZROBIONE - Zamieniono teksty na ikony SVG z tooltipami

### Funkcje budżetu
- [x] ✅ ZROBIONE - Kopiowanie budżetu na kilka miesięcy
- [x] ✅ ZROBIONE - Podsumowanie budżetu w kokpicie

---

## 📋 Stan gałęzi (Stan na 13.08.2025)

### ✅ Główne gałęzie (DZIAŁAJĄCE)
- **`master`** - Stabilna wersja produkcyjna
- **`feature/long-term-budget`** - AKTUALNA WERSJA z ikonami i poprawkami budżetu

### 🗑️ Stare gałęzie (można usunąć)
- `feature/multi-month-budget` - zmergowane do long-term-budget
- `auth-migration` - stara migracja
- `ui-ux-refresh` - stare zmiany UI

### 🎯 Następne kroki
1. Merge `feature/long-term-budget` do `master` gdy będzie gotowy
2. Usunąć stare gałęzie
3. Kontynuować pracę na `feature/long-term-budget` lub nowej gałęzi

---

## 💡 Pomysły na przyszłość

### Funkcje
- [ ] Eksport danych do CSV/Excel
- [ ] Powiadomienia o przekroczeniu budżetu
- [ ] Cele oszczędnościowe
- [ ] Analiza trendów wydatków
- [ ] Porównanie z poprzednim rokiem

### UX/UI
- [ ] Dark mode toggle
- [ ] Personalizacja kolorów kategorii
- [ ] Skróty klawiszowe
- [ ] Lepsze animacje przejść

---

**Ostatnia aktualizacja:** 13.08.2025  
**Aktualna wersja:** `feature/long-term-budget` (commit: 3d44eeb)  
**Status:** Aplikacja działa stabilnie z ikonami w nawigacji i poprawkami budżetu