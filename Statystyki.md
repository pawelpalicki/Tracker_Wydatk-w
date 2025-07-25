 3. Rozbudowa statystyk:
       * Wydatki wg sklepów: Dodam nowy wykres lub tabelę pokazującą podział wydatków na poszczególne sklepy.
       * Szczegóły kategorii: Umożliwię kliknięcie na fragment wykresu kołowego, co wyświetli listę wszystkich produktów kupionych w ramach tej kategorii w danym miesiącu (pkt 4).
 
 Przechodzimy do trzeciego etapu: rozbudowy statystyk.

  Zgodnie z planem, zajmę się teraz pierwszą częścią tego zadania: dodaniem wykresu wydatków w podziale na sklepy.

  Plan na ten etap:

   1. Backend (`server.js`): Stworzę nowy endpoint API (/api/statistics/by-shop), który będzie agregował wydatki według sklepów dla wybranego miesiąca i zwracał te dane.
   2. Frontend (`tracker.html`):
       * Dodam w zakładce "Statystyki" nowy kontener na wykres.
       * Napiszę funkcję w JavaScripcie, która pobierze dane z nowego endpointu i wygeneruje wykres słupkowy (bar chart) przedstawiający sumę wydatków w poszczególnych sklepach.

  Zacznę od modyfikacji backendu. Odczytam plik APP/server.js, aby dodać nowy endpoint.
 ╭────────────────────────────╮
 │ ✔  ReadFile APP/server.js  │
 ╰────────────────────────────╯
✦ Dziękuję. Mam aktualną zawartość pliku.

  Teraz dodam nowy endpoint /api/statistics/by-shop tuż po istniejącym endpoincie /api/statistics/comparison. Będzie on działał w bardzo podobny sposób, ale grupując dane po
  sklepach.
 ╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
 │ ✔  Edit APP/server.js: app.get('/api/statistics/compa... => app.get('/api/statistics/compa...                                                                           │
 │                                                                                                                                                                         │
 │    491       }                                                                                                                                                          │
 │    492   });                                                                                                                                                            │
 │    493                                                                                                                                                                  │
 │    494 + app.get('/api/statistics/by-shop', authMiddleware, async (req, res) => {                                                                                       │
 │    495 +     try {                                                                                                                                                      │
 │    496 +         const { year, month } = req.query;                                                                                                                     │
 │    497 +         if (!year || !month) {                                                                                                                                 │
 │    498 +             return res.status(400).json({ error: 'Rok i miesiąc są wymagane.' });                                                                              │
 │    499 +         }                                                                                                                                                      │
 │    500 +                                                                                                                                                                │
 │    501 +         const snapshot = await purchasesCollection.where('userId', '==', req.userId).get();                                                                    │
 │    502 +         if (snapshot.empty) {                                                                                                                                  │
 │    503 +             return res.json({ spendingByShop: {} });                                                                                                           │
 │    504 +         }                                                                                                                                                      │
 │    505 +                                                                                                                                                                │
 │    506 +         const purchases = snapshot.docs.map(doc => doc.data());                                                                                                │
 │    507 +                                                                                                                                                                │
 │    508 +         const firstDayOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];                                                  │
 │    509 +         const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];                                                       │
 │    510 +                                                                                                                                                                │
 │    511 +         const monthlyPurchases = purchases.filter(p => p.date >= firstDayOfMonth && p.date <= lastDayOfMonth);                                                 │
 │    512 +                                                                                                                                                                │
 │    513 +         const spendingByShop = monthlyPurchases.reduce((acc, p) => {                                                                                           │
 │    514 +             const shop = p.shop || 'Nieznany sklep';                                                                                                           │
 │    515 +             const amount = p.totalAmount || 0;                                                                                                                 │
 │    516 +             acc[shop] = (acc[shop] || 0) + amount;                                                                                                             │
 │    517 +             return acc;                                                                                                                                        │
 │    518 +         }, {});                                                                                                                                                │
 │    519 +                                                                                                                                                                │
 │    520 +         res.json({ spendingByShop });                                                                                                                          │
 │    521 +                                                                                                                                                                │
 │    522 +     } catch (error) {                                                                                                                                          │
 │    523 +         console.error("Błąd pobierania statystyk wg sklepów:", error);                                                                                         │
 │    524 +         res.status(500).json({ error: 'Błąd serwera' });                                                                                                       │
 │    525 +     }                                                                                                                                                          │
 │    526 + });                                                                                                                                                            │
 │    527 +                                                                                                                                                                │
 │    528   // --- Trasy Główne ---                                                                                                                                        │
 │    529   app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'tracker.html')));                                                                                │
 │    530   app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'icon.svg')));                                                                         │
 ╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
✦ Backend został zaktualizowany.

  Teraz przechodzę do frontendu. Dodam nowy kontener na wykres w zakładce "Statystyki" w pliku APP/tracker.html.
 ╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
 │ ✔  Edit APP/tracker.html:                     <div id="n... =>                     <div id="n...                                                                        │
 │                                                                                                                                                                         │
 │    219                       <p class="text-gray-500">Brak historii wydatków do porównania.</p>                                                                         │
 │    220                   </div>                                                                                                                                         │
 │    221               </div>                                                                                                                                             │
 │    222 +             <div class="bg-white rounded-lg shadow p-6 mt-6">                                                                                                  │
 │    223 +                 <h3 class="text-lg font-semibold mb-4">Wydatki w podziale na sklepy</h3>                                                                       │
 │    224 +                 <div id="shop-chart-container">                                                                                                                │
 │    225 +                     <canvas id="shop-chart"></canvas>                                                                                                          │
 │    226                   </div>                                                                                                                                         │
 │    227 +                 <div id="no-data-shop-chart" class="hidden text-center py-12">                                                                                 │
 │    228 +                     <p class="text-gray-500">Brak danych o wydatkach w sklepach w wybranym miesiącu.</p>                                                       │
 │    229 +                 </div>                                                                                                                                         │
 │    230 +             </div>                                                                                                                                             │
 │    231 +         </div>                                                                                                                                                 │
 │    232       </main>                                                                                                                                                    │
 │    233   </div>                                                                                                                                                         │
 │    234                                                                                                                                                                  │
 ╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
✦ Struktura HTML jest gotowa.

  Na koniec dodam kod JavaScript, który pobierze dane z nowego endpointu i wyrenderuje wykres wydatków w podziale na sklepy. Dodam również wywołanie tej funkcji w odpowiednich
  miejscach, aby wykres aktualizował się wraz ze zmianą miesiąca.
 ╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
 │ ✔  Edit APP/tracker.html:     let cameraStream = null;... =>     let cameraStream = null;...                                                                            │
 │                                                                                                                                                                         │
 │    244   let cameraStream = null;                                                                                                                                       │
 │    245   let categoryChart = null;                                                                                                                                      │
 │    246   let comparisonChart = null;                                                                                                                                    │
 │    247 + let shopChart = null;                                                                                                                                          │
 │    248                                                                                                                                                                  │
 │    249   // --- Elementy DOM ---                                                                                                                                        │
 │    250   const loadingSection = document.getElementById('loading-section');                                                                                             │
 ╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
✦ Zaktualizowałem zmienne globalne. Teraz dodam referencje do nowych elementów DOM.
 ╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
 │ ✔  Edit APP/tracker.html:     const noDataPieChart = doc... =>     const noDataPieChart = doc...                                                                        │
 │                                                                                                                                                                         │
 │    296   const noDataPieChart = document.getElementById('no-data-pie-chart');                                                                                           │
 │    297   const comparisonChartContainer = document.getElementById('comparison-chart-container');                                                                        │
 │    298   const noDataBarChart = document.getElementById('no-data-bar-chart');                                                                                           │
 │    299 + const shopChartContainer = document.getElementById('shop-chart-container');                                                                                    │
 │    300 + const noDataShopChart = document.getElementById('no-data-shop-chart');                                                                                         │
 │    301                                                                                                                                                                  │
 │    302   // --- Funkcje Pomocnicze ---                                                                                                                                  │
 │    303   const categoryColors = {};                                                                                                                                     │
 ╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
✦ Na koniec dodaję funkcję renderującą wykres i podpinam ją pod odpowiednie zdarzenia.
 ╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
 │ ✔  Edit APP/tracker.html:     async function renderStati... =>     async function renderStati...                                                                        │
 │                                                                                                                                                                         │
 │     964           populateMonthSelector(initialStats.availableMonths);                                                                                                  │
 │     965           await updateCategoryPieChart();                                                                                                                       │
 │     966           await renderComparisonBarChart();                                                                                                                     │
 │     967 +         await renderShopBarChart(); // Dodane wywołanie                                                                                                       │
 │     968       } catch (error) {                                                                                                                                         │
 │     969           console.error("Błąd ładowania statystyk:", error);                                                                                                    │
 │     970       }                                                                                                                                                         │
 │    ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════  │
 │    1018               options: { responsive: true, plugins: { legend: { position: 'top' } } }                                                                           │
 │    1019           });                                                                                                                                                   │
 │    1020       }                                                                                                                                                         │
 │    1021 +     // Po zmianie miesiąca, zaktualizuj też wykres sklepów                                                                                                    │
 │    1022 +     await renderShopBarChart();                                                                                                                               │
 │    1023   }                                                                                                                                                             │
 │    1024                                                                                                                                                                 │
 │    1025   async function renderComparisonBarChart() {                                                                                                                   │
 │    ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════  │
 │    1055       }                                                                                                                                                         │
 │    1056   }                                                                                                                                                             │
 │    1057                                                                                                                                                                 │
 │    1058 + async function renderShopBarChart() {                                                                                                                         │
 │    1059 +     const selectedMonth = statsMonthSelect.value;                                                                                                             │
 │    1060 +     if (!selectedMonth || selectedMonth === 'Brak danych') {                                                                                                  │
 │    1061 +         noDataShopChart.classList.remove('hidden');                                                                                                           │
 │    1062 +         shopChartContainer.classList.add('hidden');                                                                                                           │
 │    1063 +         return;                                                                                                                                               │
 │    1064 +     };                                                                                                                                                        │
 │    1065 +                                                                                                                                                               │
 │    1066 +     const [year, month] = selectedMonth.split('-');                                                                                                           │
 │    1067 +     const stats = await apiCall(`/api/statistics/by-shop?year=${year}&month=${month}`);                                                                       │
 │    1068 +     const ctx = document.getElementById('shop-chart').getContext('2d');                                                                                       │
 │    1069 +                                                                                                                                                               │
 │    1070 +     if (shopChart) shopChart.destroy();                                                                                                                       │
 │    1071 +                                                                                                                                                               │
 │    1072 +     const labels = Object.keys(stats.spendingByShop);                                                                                                         │
 │    1073 +     const data = Object.values(stats.spendingByShop);                                                                                                         │
 │    1074 +                                                                                                                                                               │
 │    1075 +     if (labels.length === 0) {                                                                                                                                │
 │    1076 +         noDataShopChart.classList.remove('hidden');                                                                                                           │
 │    1077 +         shopChartContainer.classList.add('hidden');                                                                                                           │
 │    1078 +     } else {                                                                                                                                                  │
 │    1079 +         noDataShopChart.classList.add('hidden');                                                                                                              │
 │    1080 +         shopChartContainer.classList.remove('hidden');                                                                                                        │
 │    1081 +                                                                                                                                                               │
 │    1082 +         shopChart = new Chart(ctx, {                                                                                                                          │
 │    1083 +             type: 'bar',                                                                                                                                      │
 │    1084 +             data: {                                                                                                                                           │
 │    1085 +                 labels,                                                                                                                                       │
 │    1086 +                 datasets: [{                                                                                                                                  │
 │    1087 +                     label: 'Wydatki w sklepie',                                                                                                               │
 │    1088 +                     data,                                                                                                                                     │
 │    1089 +                     backgroundColor: colorPalette                                                                                                             │
 │    1090 +                 }]                                                                                                                                            │
 │    1091 +             },                                                                                                                                                │
 │    1092 +             options: {                                                                                                                                        │
 │    1093 +                 responsive: true,                                                                                                                             │
 │    1094 +                 plugins: { legend: { display: false } },                                                                                                      │
 │    1095 +                 indexAxis: 'y', // Wykres horyzontalny dla lepszej czytelności nazw sklepów                                                                   │
 │    1096 +             }                                                                                                                                                 │
 │    1097 +         });                                                                                                                                                   │
 │    1098 +     }                                                                                                                                                         │
 │    1099 + }                                                                                                                                                             │
 │    1100 +                                                                                                                                                               │
 │    1101   // --- Inicjalizacja Aplikacji ---                                                                                                                            │
 │    1102   async function main() {                                                                                                                                       │
 │    1103       loadingSection.classList.add('hidden');                                                                                                                   │
 ╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
✕ [API Error: {"error":{"message":"{\n  \"error\": {\n    \"code\": 429,\n    \"message\": \"You exceeded your current quota, please check your plan and billing details. For more 
  information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\",\n    \"status\": \"RESOURCE_EXHAUSTED\",\n    \"details\": [\n      {\n        
  \"@type\": \"type.googleapis.com/google.rpc.QuotaFailure\",\n        \"violations\": [\n          {\n            \"quotaMetric\": 
  \"generativelanguage.googleapis.com/generate_content_free_tier_input_token_count\",\n            \"quotaId\": \"GenerateContentInputTokensPerModelPerDay-FreeTier\",\n            
  \"quotaDimensions\": {\n              \"location\": \"global\",\n              \"model\": \"gemini-2.5-pro\"\n            },\n            \"quotaValue\": \"6000000\"\n          
  }\n        ]\n      },\n      {\n        \"@type\": \"type.googleapis.com/google.rpc.Help\",\n        \"links\": [\n          {\n            \"description\": \"Learn more about 
  Gemini API quotas\",\n            \"url\": \"https://ai.google.dev/gemini-api/docs/rate-limits\"\n          }\n        ]\n      },\n      {\n        \"@type\": 
  \"type.googleapis.com/google.rpc.RetryInfo\",\n        \"retryDelay\": \"5s\"\n      }\n    ]\n  }\n}\n","code":429,"status":"Too Many Requests"}}]
  Please wait and try again later. To increase your limits, request a quota increase through AI Studio, or switch to another /auth method
