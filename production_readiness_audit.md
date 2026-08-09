# 🟢 Audyt Gotowości Produkcyjnej — Tracker Wydatków (Zaktualizowano 09.08.2026)

**Data audytu pierwotnego:** 31.05.2026  
**Aktualny status po poprawkach bezpieczeństwa:** Krytyczne podatności bezpieczeństwa i brak zgodności z RODO zostały naprawione.

Poniżej prezentuję zaktualizowaną ocenę po wdrożeniu pakietu bezpieczeństwa i RODO. Skala: 🟢 OK / Rozwiązane | 🟡 Do poprawy | 🔴 Blokujące.

---

## 1. 🟢 BEZPIECZEŃSTWO — Ocena: 8/10 (Poprawiono)

Większość krytycznych podatności została wyeliminowana i wdrożona na produkcję.

### 🟢 [NAPRAWIONE] Firestore Rules — uszczelniony zapis `users`

Zmieniono reguły w `firestore.rules`. Zapis do dokumentu użytkownika jest teraz możliwy wyłącznie po uwierzytelnieniu (`request.auth.uid == userId`).

### 🟢 [NAPRAWIONE] Rate Limiting na API

Dodano `express-rate-limit` w backendzie (`functions/index.js`):
- Globalny limiter: 200 żądań na 15 minut per IP.
- Auth limiter: 10 żądań na 15 minut dla ścieżek `/auth/*`.
- AI limiter: 30 operacji na godzinę dla kosztownych endpointów AI (`/analyze-receipt`, `/transcribe-audio`, `/ai/natural-search`).

### 🟢 [NAPRAWIONE] Walidacja danych wejściowych i Helmet.js

- Dodano `helmet` do Express.js z nagłówkami security (HSTS, X-Frame-Options itp.).
- Dodano centralną funkcję `escapeHTML()` w `APP/js/shared/format.js` i zaaplikowano sanityzację w 11 modułach widoków JS.

### 🟢 [NAPRAWIONE] CORS ograniczony do dozwolonych domen

Zastąpiono wildcard `origin: true` w `functions/index.js` ścisłą białą listą domen (localhost, `*.web.app`, `*.firebaseapp.com`).

### 🟢 [NAPRAWIONE] Ukryty stack trace w błędach

Middleware błędów `functions/middleware.js` ukrywa stack trace na produkcji.

### 🟡 Brak weryfikacji email przy rejestracji

`auth.createUserWithEmailAndPassword()` nie wymaga weryfikacji emaila. Użytkownik z fake emailem może natychmiast korzystać z aplikacji, co ułatwia tworzenie fake kont i abuse AI.

---

## 2. 🔴 SKALOWALNOŚĆ BACKENDU — Ocena: 4/10

### 🔴 N+1 Query Problem — Budżety Specjalne

```javascript
// routes/init.js, linia 167
const specialBudgetsWithSpent = await Promise.all(specialBudgets.map(async (budget) => {
    const spentSnapshot = await purchasesCollection
        .where('userId', '==', userId)
        .where('specialBudgetId', '==', budget.id)
        .get();
    // ...
}));
```

Jeśli użytkownik ma 20 budżetów specjalnych → **20 dodatkowych zapytań Firestore** na każde załadowanie aplikacji. Przy 1000 użytkowników otwierających aplikację rano = **20,000 reads w ciągu minut**. Ten sam wzorzec jest w `routes/budgets.js` (linia 33).

### 🔴 `/api/init` — kosztowny megaendpoint bez cache

Endpoint [init.js](file:///c:/Users/pawel/Projekty/Tracker_Wydatk-w/functions/routes/init.js) wykonuje **minimum 9 równoległych zapytań Firestore** + N+1 na special budgets. Na żadnym poziomie nie ma cache'owania. Każdy refresh = pełny koszt.

Przy 1000 DAU, 3 odwiedzin/dzień:
- ~27,000 Firestore reads dziennie **tylko** z `/api/init`
- Free tier: 50,000 reads/dzień — **wyczerpie się w 2 dniach**

### 🔴 Brak limitów paginacji

```javascript
// routes/ai.js, linia 355-356
.limit(1000)  // Natural search — ściąga 1000 dokumentów
```

Użytkownik z 10,000 zakupów wykonujący natural search → 1000 dokumentów ładowanych do pamięci Cloud Function per request.

### 🟡 Cold Start Problem

Aplikacja to pojedyncza Cloud Function (`exports.api`) z dużym importem (Gemini SDK, Express, 10 route'ów). Cold start na Node 22 z tymi zależnościami: **3-8 sekund**. Przy sporadycznym ruchu użytkownik czeka kilka sekund na pierwszy request.

### 🟡 `bulkUpdatePurchasesCategory` — Full Collection Scan

```javascript
// categories-service.js, linia 138
const snapshot = await purchasesCollection.where('userId', '==', userId).get();
```

Zmiana nazwy kategorii ładuje **WSZYSTKIE zakupy użytkownika** do pamięci, iteruje po nich i aktualizuje batch'ami po 400. Użytkownik z 50,000 zakupów → timeout Cloud Function (540s limit).

### 🟡 Brak indeksów Firestore dla specjalistycznych zapytań

[firestore.indexes.json](file:///c:/Users/pawel/Projekty/Tracker_Wydatk-w/firestore.indexes.json) definiuje tylko 2 indeksy (userId + date ASC/DESC). Ale zapytania po `specialBudgetId`, `userId + date range + orderBy`, notifications — mogą wymagać dodatkowych composite indexes, co skutkuje błędami runtime.

---

## 3. 🔴 ARCHITEKTURA FRONTENDOWA — Ocena: 4/10

### 🔴 Monolityczny HTML — 80KB / 1168 linii

[index.html](file:///c:/Users/pawel/Projekty/Tracker_Wydatk-w/APP/index.html) waży **80KB** i zawiera cały UI (auth, dashboard, lista, formularz, analiza, ustawienia, cele oszczędnościowe). Każdy użytkownik pobiera **100% HTML**, nawet jeśli jest niezalogowany.

### 🔴 Masowe użycie `innerHTML` — 50+ miejsc

Znaleziono 51+ użyć `innerHTML` wstawiających dynamiczne dane użytkownika bez escape'owania. To **systemowy problem XSS** i performance bottleneck (re-parsowanie DOM).

### 🔴 Firebase SDK z CDN — przestarzała wersja

```html
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
```

- **Wersja 9.6.1 z 2022 roku** — obecna to ~11.x. Brak poprawek bezpieczeństwa z 4 lat
- Użycie `compat` (compatibility) mode zamiast modularnego SDK = **brak tree-shaking** = ładujesz 100% Firebase SDK
- **Brak bundlera** — wszystkie moduły JS ładowane jako oddzielne requesty HTTP

### 🟡 Brak lazy loading widoków

Wszystkie moduły importowane synchronicznie w [bootstrap.js](file:///c:/Users/pawel/Projekty/Tracker_Wydatk-w/APP/js/core/bootstrap.js). Widoki takie jak `analysis.js` (68KB), `savings-goals.js` (65KB), `purchase-form.js` (52KB) ładowane nawet gdy użytkownik nigdy ich nie odwiedza. Jedyny lazy import:

```javascript
// data-loader.js, linia 107
import('../views/savings-goals.js?v=20260528-1')
```

...z hardcoded cache-bust (`?v=20260528-1`) — nieutrzymywalny wzorzec.

### 🟡 Chart.js ładowany synchronicznie z CDN

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@..."></script>
```

~200KB JavaScriptu blokującego rendering, nawet jeśli użytkownik nigdy nie otworzy zakładki Analizy.

### 🟡 Brak minifikacji i bundlingu JS

Moduły JS serwowane jako surowe pliki (bez Webpack/Vite/esbuild). Na wolnym 3G, ~350KB kodu JS (surowego) + ~300KB bibliotek z CDN = **7-12s First Contentful Paint**.

---

## 4. 🟡 SERVICE WORKER & OFFLINE — Ocena: 5/10

### 🟡 Strategia "Network First" bez fallback UI

```javascript
// sw.js, linia 52-55
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
```

- **Brak fallback dla niezcache'owanych zasobów** — jeśli user jest offline i próbuje załadować nową stronę, dostaje pusty ekran
- **Brak cache'owania API responses** — offline = zero danych
- **Brak strategii stale-while-revalidate** — zawsze czeka na sieć, a cache to last resort
- Sub-moduły JS (`core/`, `shared/`, `views/`) **nie są precache'owane** — offline nie zadziała

### 🟡 Manifest PWA minimalny

```json
"background_color": "#ffffff",  // Biały, ale app jest dark mode
"theme_color": "#2563eb",       // Niebieski, ale <meta theme-color> to #0a0a0a
```

Niespójne kolory, brak `screenshots`, `categories`, `description` — gorsze SEO w App Stores i gorsza instalka PWA.

---

## 5. 🔴 NIEZAWODNOŚĆ & TESTY — Ocena: 2/10

### 🔴 Zero testów

- `firebase-functions-test` jest w `devDependencies`, ale **nie ma ani jednego pliku testowego**
- Brak testów jednostkowych, integracyjnych, e2e
- Brak CI/CD pipeline

Przy tysiącach użytkowników, **każdy deployment to rosyjska ruletka**. Zmiana w `categories-service.js` może zepsuć formularz zakupów, dashboard i analizę jednocześnie — bez żadnego ostrzeżenia.

### 🔴 Brak monitoringu i alertów

- Brak integracji z Firebase Crashlytics, Sentry, czy nawet prostego error trackera
- Brak health check endpointu
- Brak Cloud Monitoring dashboardu
- Jedyne "logowanie" to `console.log` / `console.error` — zniknie w logach Cloud Functions w ciągu godzin

### 🟡 Brak graceful error handling na frontendzie

```javascript
// data-loader.js, linia 236
} catch (error) {
    alert(error.message);  // 💀 Produkcyjny kod nie powinien używać alert()
}
```

`alert()` blokuje UI, jest nieinformatywny i nieprzyjazny użytkownikowi.

### 🟡 CRON bez idempotentności gwarantowanej

[addRecurringExpensesScheduled](file:///c:/Users/pawel/Projekty/Tracker_Wydatk-w/functions/index.js#L65-L125) sprawdza `lastAdded`, ale **nie w transakcji Firestore**. Przy wielokrotnym uruchomieniu (Firebase Scheduler retry) możliwe jest zduplikowanie wydatku cyklicznego.

---

## 6. 🟢 REGULACJE PRAWNE & COMPLIANCE — Ocena: 8/10 (Poprawiono)

### 🟢 [NAPRAWIONE] RODO/GDPR compliance — obsługa praw i UI

- **Eksport danych (Art. 20 RODO)** — dodano endpoint `GET /api/user/export-data` oraz przycisk pobierania pełnego pliku JSON z danymi użytkownika.
- **Usuwanie konta i danych (Art. 17 RODO)** — dodano endpoint `DELETE /api/user/delete-account` (kaskadowe kasowanie wszystkich zakupów, budżetów i danych użytkownika) oraz bezpieczny UI potwierdzenia wpisaniem słowa "USUŃ".
- **Zgoda i informacja o AI (Art. 13 RODO)** — dodano czytelną sekcję w widoku „Prywatność i Konto (RODO)” w Ustawieniach, informującą użytkownika o przekazywaniu próbek mowy i paragonów do uslug Google Generative AI (Gemini i Speech-to-Text).

---

## 7. 🟡 KOSZTY OPERACYJNE — Ocena: 5/10

### Szacunek kosztów dla 1000 DAU

| Zasób | Szacunek dziennie | Koszt miesięczny |
|---|---|---|
| Firestore reads | ~50,000-80,000 | ~$15-25 |
| Firestore writes | ~5,000-10,000 | ~$5-10 |
| Cloud Functions invocations | ~15,000 | ~$5 (po free tier) |
| Cloud Functions compute (GB/s) | ~10,000s | ~$3 |
| Gemini API (flash-lite) | ~2,000-5,000 req | ~$5-15 |
| Speech-to-Text | ~500-1000 min | ~$12-24 |
| Firebase Hosting | ~10GB transfer | Free |
| **TOTAL** | | **~$45-82/miesiąc** |

> [!WARNING]
> Bez rate limiting, **jeden złośliwy użytkownik** może wygenerować powyższe koszty **w ciągu godziny** poprzez spamowanie endpointów AI.

### Eksplozja kosztów przy wzroście

Bez cache'owania i z N+1 queries, koszty rosną **super-liniowo**. 10,000 DAU ≠ 10x koszt, ale raczej 30-50x z powodu braku optymalizacji.

---

## 8. 🟡 UX / DOSTĘPNOŚĆ — Ocena: 6/10

### 🟡 Brak i18n — hardcoded polski

Cała aplikacja jest po polsku (UI, komunikaty błędów, prompty AI). Brak mechanizmu tłumaczenia, co blokuje internacjonalizację.

### 🟡 Brak dostępności (a11y)

- Brak `aria-label` na wielu interaktywnych elementach
- Kontrast tekstu (`text-gray-500` na `bg-[#0a0a0a]`) — niski kontrast, niespełniający WCAG AA
- Brak skip navigation
- Brak focus management w modułach SPA

### 🟢 Dobra UX na mobilnych

- Drawer system, swipe gestures
- FAB menu
- Bottom navigation
- Responsive layout

---

## Podsumowanie Priorytetów Naprawczych

### 🚨 BLOKUJĄCE (Status po poprawkach):

| # | Problem | Trudność | Status |
|---|---|---|---|
| 1 | **Firestore rule `allow create: if true`** | Łatwa | 🟢 Wdrożone |
| 2 | **Rate limiting na wszystkich endpointach** | Średnia | 🟢 Wdrożone |
| 3 | **Input sanitization / escapeHTML** | Duża | 🟢 Wdrożone |
| 4 | **RODO: Polityka Prywatności / Informacja AI** | Średnia | 🟢 Wdrożone |
| 5 | **Informacja o przetwarzaniu danych przez AI** | Łatwa | 🟢 Wdrożone |
| 6 | **Mechanizm usunięcia konta + eksport danych** | Średnia | 🟢 Wdrożone |
| 7 | **CORS ograniczony do domeny produkcyjnej** | Łatwa | 🟢 Wdrożone |
| 8 | **Helmet.js — security headers** | Łatwa | 🟢 Wdrożone |

### ⚠️ WAŻNE (powinny być w krótkim terminie):

| # | Problem | Trudność | Wpływ |
|---|---|---|---|
| 9 | **Firebase SDK upgrade (9.6 → 11.x)** | Średnia | Wysoki |
| 10 | **N+1 queries w special budgets** | Średnia | Wysoki (koszt) |
| 11 | **Cache'owanie `/api/init`** | Średnia | Wysoki (koszt + performance) |
| 12 | **Podstawowe testy (choćby smoke tests)** | Średnia | Wysoki (niezawodność) |
| 13 | **Firebase App Check** | Średnia | Wysoki (bezpieczeństwo) |
| 14 | **Monitoring / Error tracking** | Łatwa | Wysoki (operacyjny) |
| 15 | **NODE_ENV=production w Cloud Functions** | Łatwa | Średni |

### 📋 PRZYSZŁE (do poprawy w miarę wzrostu):

| # | Problem | Trudność |
|---|---|---|
| 16 | Bundler (Vite/esbuild) + code splitting | Duża |
| 17 | Lazy loading widoków | Średnia |
| 18 | Lepszy Service Worker (Workbox) | Średnia |
| 19 | CI/CD pipeline | Średnia |
| 20 | a11y audit + poprawki | Średnia |

---

## Werdykt końcowy

> [!IMPORTANT]
> Aplikacja jest **technicznie funkcjonalna i dobrze zaprojektowana od strony UX/logiki biznesowej**. Widać solidną wiedzę domenową (budżety, cele oszczędnościowe, cykliczne wydatki, analiza AI). Architektura modułowa (core/shared/views) jest rozsądna.
>
> Natomiast do publicznego release'u dla tysięcy użytkowników **brakuje fundamentów bezpieczeństwa, compliance prawnego i odporności na skalę**. Punkty 1-8 z tabeli "Blokujące" to absolutne minimum przed udostępnieniem publicznie.
>
> Szacowany czas naprawienia punktów blokujących: **2-4 tygodnie** przy skupionej pracy.
