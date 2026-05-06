# DRAWER AUDIT — Tracker Wydatków

> Etap 1: tylko czytanie, zero zmian w kodzie.

---

## 1. Pełna lista modali i drawerów

### A. DRAWER: Category Selection (`#category-drawer`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 1227–1269 |
| **Overlay** | `#category-drawer-overlay` |
| **Otwiera** | `openSelectionDrawer()` → `openDrawer(...)` w `shared/ui.js` L.411 |
| **Zamyka** | `closeSelectionDrawer()` → `closeDrawer(...)` `shared/ui.js` L.414 |
| **Stan** | klasy `.active` / `.hidden` + `transform: translateY` |
| **Animacja** | CSS transition `transform 0.3s cubic-bezier` |
| **Zawartość** | Lista/siatka: kategorie, budżet, sklep, miesiąc, harmonogram |
| **Nagłówek** | Tak – dynamiczny tytuł, wstecz, X, wyszukiwarka |
| **Stopka** | Tak – „Zarządzaj kategoriami" |
| **Wywołuje** | `shared/ui.js`, `views/purchase-form.js`, `views/purchase-list.js`, `views/settings/monthly-budget.js` |

### B. DRAWER: Product (`#product-drawer`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 1272–1343 |
| **Overlay** | `#product-drawer-overlay` |
| **Otwiera** | `openProductDrawer(index?)` `views/purchase-form.js` L.282 |
| **Zamyka** | `closeProductDrawer()` `views/purchase-form.js` L.328 |
| **Stan** | klasy `.active`/`.hidden` + `acquireOverlayNavigationLock()` — własna implementacja |
| **Animacja** | CSS transition `transform 0.3s` |
| **Zawartość** | Formularz: nazwa, cena, kategoria (trigger), tagi (trigger), submit |
| **Nagłówek** | Tak – tytuł dynamiczny, X |
| **Stopka** | Nie – submit wewnątrz formularza |

### C. DRAWER: Filter (`#filter-drawer`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 1345–1364 |
| **Overlay** | `#filter-drawer-overlay` |
| **Otwiera** | `openFilterDrawer(title, type, onApply)` `views/purchase-list.js` L.261 → `openDrawer(...)` |
| **Zamyka** | `closeFilterDrawer()` L.309 → `closeDrawer(...)` |
| **Stan** | `openDrawer` / `closeDrawer` z `shared/ui.js` |
| **Zawartość** | Dynamiczna: zakres dat lub zakres kwot |
| **Nagłówek** | Tak – dynamiczny, X |
| **Stopka** | Tak – „Zastosuj" |

### D. DRAWER: Category Details (`#category-details-drawer`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 1366–1386 |
| **Overlay** | `#category-details-drawer-overlay` |
| **Otwiera** | `renderCategoryDetailsModal()` `shared/ui.js` L.422 — inline open (nie używa `openDrawer`) |
| **Zamyka** | `closeCategoryDetailsDrawer()` `shared/ui.js` L.522 → `closeDrawer(...)` |
| **Stan** | Mieszany: inline classList + setTimeout |
| **Zawartość** | Lista transakcji danej kategorii + breakdown podkategorii |
| **Nagłówek** | Tak – nazwa kategorii, X |
| **Stopka** | Nie |
| **Wywołuje** | `views/dashboard.js`, `views/analysis.js` |

### E. DRAWER: Category Editor (`#category-editor-drawer`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 1388–1453 |
| **Overlay** | `#category-editor-drawer-overlay` |
| **Otwiera** | `openOverlay('category-editor-drawer')` `views/settings/categories-manager.js` L.268, 301 |
| **Zamyka** | `closeOverlay('category-editor-drawer')` L.54, 334, 367 |
| **Stan** | `openOverlay` / `closeOverlay` z `shared/ui.js` |
| **Zawartość** | Formularz kat. głównej (nazwa+ikona+kolor) LUB podkategorii — 2 alt. div |
| **Nagłówek** | Tak – dynamiczny, X |
| **Stopka** | Nie – submit wewnątrz |

### F. DRAWER: Tags Selection (`#tags-selection-drawer`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 1533–1556 |
| **Overlay** | `#tags-selection-overlay` |
| **Otwiera** | `openTagsDrawer(tags, onConfirm, isFilter)` `shared/tags.js` L.88 — własna implementacja |
| **Zamyka** | `closeTagsDrawer()` `shared/tags.js` L.163 — własna implementacja |
| **Stan** | Własny — NIE używa `openDrawer`/`closeDrawer` |
| **Zawartość** | Grupy tagów z przyciskami wyboru |
| **Nagłówek** | Tak – „Wybierz tagi", X |
| **Stopka** | Tak – „Zatwierdź tagi" |
| **Wywołuje** | `views/purchase-form.js`, `views/analysis.js` |

### G. DRAWER: Notifications (`#notifications-drawer`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 1558–1580 |
| **Overlay** | `#notifications-overlay` |
| **Otwiera** | `openNotificationsDrawer()` `shared/notifications.js` L.46 — własna implementacja |
| **Zamyka** | `closeNotificationsDrawer()` `shared/notifications.js` L.64 — własna implementacja |
| **Stan** | Własny: `classList.remove('translate-y-full')` + `opacity-0` (Tailwind-based) |
| **Zawartość** | Lista powiadomień z swipe-to-delete |
| **Nagłówek** | Tak – „Powiadomienia", X |
| **Stopka** | Nie |
| **Wywołuje** | Bell w navbarze, po AI insights |

### H. MODAL: Voice Expense (`#voice-expense-modal`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 1150–1224 |
| **Overlay** | `#voice-expense-overlay` |
| **Otwiera** | `openVoiceExpenseModal()` `views/purchase-form.js` ~L.973 — inline open |
| **Zamyka** | `closeVoiceExpenseModal()` ~L.1335 — inline close |
| **Stan** | Własny: klasy CSS + `scale-95 opacity-0` usuwane przez JS |
| **Animacja** | `transition-all duration-300` scale + opacity (nie translateY) |
| **Zawartość** | State-machine 5-krokowy: intro → nagrywanie → review → analiza AI → gotowe |
| **Nagłówek** | Tak – status badge, tytuł, opis, X |
| **Stopka** | Tak – przyciski Primary/Secondary zmienne wg kroku |
| **Specyfika** | Jedyny modal CENTRALNY (nie bottom sheet), MediaRecorder API |

### I. MODAL: Copy Budget (`#copy-budget-modal`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 955–984 |
| **Overlay** | Sam element jest overlayem (`fixed inset-0`) |
| **Otwiera** | `openOverlay('copy-budget-modal')` `views/settings/monthly-budget.js` L.47 |
| **Zamyka** | `closeOverlay('copy-budget-modal')` L.50–51, 251 |
| **Stan** | `openOverlay` / `closeOverlay` z `shared/ui.js` |
| **Animacja** | Brak dedykowanej |
| **Zawartość** | 4 przyciski wyboru liczby miesięcy + Anuluj |
| **Nagłówek** | Tak – tytuł, X |

### J. MODAL: Edit Special Budget (`#edit-special-budget-modal`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 986–1020 |
| **Overlay** | Sam element jest overlayem (`fixed inset-0`) |
| **Otwiera** | `openOverlay('edit-special-budget-modal')` `views/special-budgets.js` L.326 |
| **Zamyka** | `closeOverlay('edit-special-budget-modal')` L.36–37, 361 |
| **Stan** | `openOverlay` / `closeOverlay` z `shared/ui.js` |
| **Zawartość** | Formularz: Nazwa + Kwota |
| **Nagłówek** | Tak – „Edytuj budżet specjalny", X |
| **Stopka** | Tak – Anuluj + Zapisz zmiany |

### K. MODAL: Tag Form (`#tag-form-modal`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 1455–1490 |
| **Overlay** | `#tag-form-modal-backdrop` (wewnętrzny div) |
| **Otwiera** | `openTagFormModal()` `views/settings/tags-manager.js` L.138 — `modal.classList.remove('hidden')` |
| **Zamyka** | `closeTagFormModal()` L.174 — `modal.classList.add('hidden')` |
| **Stan** | Tylko klasa `.hidden` — brak animacji, brak blokady scrolla, brak historii |
| **Zawartość** | Formularz: etykieta, podgląd value (auto), emoji |
| **Nagłówek** | Tak – „Nowy tag" / „Edytuj tag" |
| **Stopka** | Tak – Anuluj + Zapisz |

### L. MODAL: Tag Group (`#tag-group-modal`)

| Atrybut | Wartość |
|---|---|
| **HTML** | `index.html` linie 1492–1531 |
| **Overlay** | `#tag-group-modal-backdrop` (wewnętrzny div) |
| **Otwiera** | `openTagGroupModal()` `views/settings/tags-manager.js` L.238 — `modal.classList.remove('hidden')` |
| **Zamyka** | `closeTagGroupModal()` L.274 — `modal.classList.add('hidden')` |
| **Stan** | Tylko klasa `.hidden` — brak animacji, brak blokady scrolla |
| **Zawartość** | Formularz: nazwa grupy, podgląd klucza (auto), pierwsza wartość |
| **Nagłówek** | Tak – „Nowa/Edytuj grupa tagów" |
| **Stopka** | Tak – Anuluj + Zapisz |

---

## 2. Miejsca wywołań w JS

| Element | Funkcja | Plik wywołujący |
|---|---|---|
| `#category-drawer` | `openSelectionDrawer()` | `shared/ui.js`, `views/purchase-form.js` L.467, `views/purchase-list.js` L.118,130, `views/settings/monthly-budget.js` L.38 |
| `#category-drawer` | `openHierarchicalCategoryDrawer()` | `views/purchase-form.js` L.218, `views/purchase-list.js` L.96 |
| `#product-drawer` | `openProductDrawer(idx)` | `views/purchase-form.js` L.69 (add-item-btn), L.172 (edit-item-btn) |
| `#filter-drawer` | `openFilterDrawer(...)` | `views/purchase-list.js` L.140 (data), L.150 (kwota) |
| `#category-details-drawer` | `renderCategoryDetailsModal()` | `views/dashboard.js`, `views/analysis.js` |
| `#category-editor-drawer` | `openOverlay(...)` | `views/settings/categories-manager.js` L.268, 301 |
| `#tags-selection-drawer` | `openTagsDrawer(...)` | `views/purchase-form.js` L.207 (product drawer), L.663 (recurring form), `views/analysis.js` (filter tags) |
| `#notifications-drawer` | `openNotificationsDrawer()` | `shared/notifications.js` L.23 (bell), L.300 (AI insights) |
| `#voice-expense-modal` | `openVoiceExpenseModal()` | `views/purchase-form.js` L.849 (fab-voice-expense-btn) |
| `#copy-budget-modal` | `openOverlay(...)` | `views/settings/monthly-budget.js` L.47 |
| `#edit-special-budget-modal` | `openOverlay(...)` | `views/special-budgets.js` L.326 |
| `#tag-form-modal` | `openTagFormModal()` | `views/settings/tags-manager.js` L.112, 117 |
| `#tag-group-modal` | `openTagGroupModal()` | `views/settings/tags-manager.js` L.22, 127 |

---

## 3. Pliki CSS/Tailwind

| Plik | Sekcja | Co definiuje |
|---|---|---|
| `APP/css/styles.css` | L.295–316 | Overlaye: 6 ID z `opacity`, `backdrop-filter`, `transition` |
| `APP/css/styles.css` | L.317–347 | Drawery: 6 ID z `transition: transform 0.3s` + `.active { transform: translateY(0) }` |
| `APP/css/styles.css` | L.349–448 | `.drawer-grid-layout`, `.drawer-list-layout`, `.category-drawer-item`, `.category-icon-wrapper`, `.category-name-label` |
| `APP/css/styles.css` | L.604–658 | `.notif-swipe-wrapper`, `.notif-action-layer`, `.notif-content-layer` — styl powiadomień |
| `APP/dist/output.css` | (wygenerowany) | Wszystkie klasy Tailwind używane inline |

**Brakujące w styles.css**: Notifications drawer (używa wyłącznie Tailwind `translate-y-full`), voice-expense-modal, copy-budget-modal, edit-special-budget-modal, tag-form-modal, tag-group-modal.

---

## 4. Zidentyfikowane problemy

### P1: Cztery różne mechanizmy otwierania/zamykania

1. **`openDrawer(id, overlayId)` / `closeDrawer()`** (`shared/ui.js`) — `#category-drawer`, `#filter-drawer`
2. **`openOverlay(id)` / `closeOverlay()`** (`shared/ui.js`) — `#category-editor-drawer`, `#copy-budget-modal`, `#edit-special-budget-modal`
3. **Własna inline implementacja** — `#tags-selection-drawer`, `#notifications-drawer`, `#product-drawer`, `#category-details-drawer` (częściowo), `#voice-expense-modal`
4. **Samo `.hidden`** — `#tag-form-modal`, `#tag-group-modal` (brak animacji, blokady scrolla, historii przeglądarki)

### P2: Niespójne z-indexy (brak systemu)

`z-[60]` → `z-[70]` → `z-[80]` → `z-[85]` → `z-[90]` → `z-[100]` → `z-[110]` → `z-[120]` → `z-[200]` — 9 różnych poziomów bez dokumentacji.

### P3: Brak dostępności (a11y)

- Żaden element nie ma `aria-modal="true"`, `role="dialog"`, `aria-labelledby`
- Brak focus trapa — klawiatura może wyjść poza drawer
- Brak obsługi `Escape` w `#tag-form-modal`, `#tag-group-modal`, `#notifications-drawer`
- Focus nie wraca do elementu-triggera po zamknięciu

### P4: Zduplikowana logika (copy-paste ~7x)

- Wzorzec open: `el.classList.remove('hidden') → setTimeout(10ms) → el.classList.add('active') + body.overflow='hidden'`
- Wzorzec close: `el.classList.remove('active') → setTimeout(300ms) → el.classList.add('hidden') + body.overflow=''`
- `acquireOverlayNavigationLock()` wywoływane ręcznie w każdym module

### P5: Brak separacji HTML (modale w złym miejscu)

- `#copy-budget-modal` i `#edit-special-budget-modal` są przed `</div>` kończącym `#app-section` (linia 953), ale po `#bottom-nav` — kolejność w HTML jest niespójna

### P6: `#voice-expense-modal` wymaga specjalnej obsługi

- Centralny (nie bottom sheet), scale+opacity zamiast translateY
- Rozbudowany state machine (5 kroków, MediaRecorder)

---

## 5. Propozycja zunifikowanego API Drawer

```javascript
// APP/js/shared/drawer.js — ES Module

Drawer.open({
  title: 'Tytuł',               // string — nagłówek H3
  content: htmlStringOrNode,    // string HTML lub HTMLElement
  size: 'sm' | 'md' | 'lg' | 'full',  // 50/75/90/100vh, default 'lg'
  confirmLabel: 'Zapisz',       // → stopka z btn-primary
  cancelLabel: 'Anuluj',        // → stopka z btn-secondary
  onConfirm: async () => {},    // klik confirm — może być async
  onCancel: () => {},           // klik cancel
  onClose: () => {},            // X, Escape, backdrop
  closeOnBackdrop: true,        // default true
  showCloseBtn: true,           // default true
  triggerId: 'btn-id',          // focus wraca tu po zamknięciu
});

Drawer.close()                  // zamknij z animacją
Drawer.setContent(htmlOrNode)   // podmień treść bez zamykania
Drawer.setTitle(str)            // podmień nagłówek
Drawer.showConfirmLoading()     // spinner na przycisku confirm
Drawer.hideConfirmLoading()
```

### Mapowanie obecnych elementów → nowe API

| Obecny | Nowe wywołanie | Rozmiar |
|---|---|---|
| `#copy-budget-modal` | `Drawer.open({ title, content: '4 btn', size:'sm' })` | sm |
| `#edit-special-budget-modal` | `Drawer.open({ title, content: form, confirmLabel:'Zapisz', onConfirm })` | sm |
| `#tag-form-modal` | `Drawer.open({ title, content: form, size:'sm', confirmLabel:'Zapisz', onConfirm })` | sm |
| `#tag-group-modal` | `Drawer.open({ title, content: form, size:'sm', confirmLabel:'Zapisz', onConfirm })` | sm |
| `#filter-drawer` | `Drawer.open({ title, content: inputs, size:'sm', confirmLabel:'Zastosuj', onConfirm })` | sm |
| `#category-drawer` | `Drawer.open({ title, content: list, size:'lg' })` | lg |
| `#category-details-drawer` | `Drawer.open({ title, content: list, size:'lg' })` | lg |
| `#category-editor-drawer` | `Drawer.open({ title, content: form, size:'lg' })` | lg |
| `#tags-selection-drawer` | `Drawer.open({ title, content: tags, size:'md', confirmLabel:'Zatwierdź', onConfirm })` | md |
| `#notifications-drawer` | `Drawer.open({ title:'Powiadomienia', content: list, size:'lg' })` | lg |
| `#product-drawer` | `Drawer.open({ title, content: form, size:'md' })` | md |
| `#voice-expense-modal` | **Pozostaje jako osobny komponent** — zbyt specyficzny | — |

> **Wniosek**: 11 z 12 elementów można zastąpić `Drawer.open()`. Jedynym wyjątkiem jest `#voice-expense-modal` (modal centralny, state machine, MediaRecorder).

---

*ETAP 1 zakończony. Czekam na akceptację przed przejściem do Etapu 2.*
