# MIGRATION PLAN — Drawer Refactoring

> Cel: zastąpić wszystkie 11 modali/drawerów (poza `#voice-expense-modal`) nowym `Drawer.open()`.
> Każdy krok to osobny commit. Nie usuwamy HTML starych elementów dopóki JS nie jest podmieniony.

---

## Kolejność migracji (od najprostszych do najbardziej złożonych)

```
✅ ETAP 3A → tag-form-modal        (zakończone)
✅ ETAP 3B → tag-group-modal       (zakończone)
✅ ETAP 3C → copy-budget-modal     (zakończone)
✅ ETAP 3D → edit-special-budget-modal (zakończone)
✅ ETAP 3E → filter-drawer         (zakończone)
✅ ETAP 3F → category-details-drawer  (zakończone)
✅ ETAP 3G → notifications-drawer  (zakończone)
✅ ETAP 3H → tags-selection-drawer (zakończone)
✅ ETAP 3I → category-editor-drawer (zakończone)
✅ ETAP 3J → product-drawer        (zakończone)
✅ ETAP 3K → category-drawer       (zakończone)
```

---

## ETAP 4 — Porządki końcowe (ZAKOŃCZONE)

Po zakończeniu wszystkich kroków 3A–3K:

### 1. `shared/ui.js` — usunąć martwe funkcje (ZROBIONE)
- `openDrawer()` / `closeDrawer()`
- `openOverlay()` / `closeOverlay()`
- `renderCategoryDetailsModal()` (zaktualizowana do Drawer.open)
- `closeCategoryDetailsDrawer()`
- Uproszczenie `hasVisibleBlockingOverlay()`

### 2. `styles.css` — usunąć sekcję "Drawer & Bottom Sheet" (ZROBIONE)
- Linie 295–447 (selektory starych drawerów usunięte, layouty treści przeniesione do `drawer.css`)
- Linie 604–658 (notif-swipe style przeniesione do `drawer.css`)

### 3. `index.html` — weryfikacja (ZROBIONE)
- Potwierdzony brak osieroconych `id` (stare overlay/panel)
- `#voice-expense-modal` i `#voice-expense-overlay` zachowane (zgodnie z planem)

---

## Czego NIE migrujemy

| Element | Powód |
|---|---|
| `#voice-expense-modal` | Modal centralny, 5-krokowy state machine, MediaRecorder — zbyt specyficzny. Zostaje jako osobny komponent. |

---

## Weryfikacja po każdym etapie

```
✅ Drawer otwiera się poprawnie (animacja, treść)
✅ Zamknięcie przez X działa
✅ Zamknięcie przez Escape działa
✅ Zamknięcie przez klik w overlay działa
✅ Scroll body zablokowany gdy drawer otwarty
✅ Focus trap działa (Tab, Shift+Tab)
✅ Focus wraca do triggera po zamknięciu
✅ Stary HTML usunięty (devtools: brak starych ID w DOM)
✅ Stary CSS usunięty lub nieaktywny
✅ Brak błędów w konsoli
```
