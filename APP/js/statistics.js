// Tracker Wydatków - Statistics Functions

let legendMouseoutHandler = null;
let timeChartMode = 'week'; // 'week' lub 'day'
let currentMonthlyPurchases = [];
let currentStatsMonth = 'Brak danych'; // Zastępuje ukryty statsMonthSelect

// --- KOKPIT (Dashboard) ---

// State for the home dashboard
let homeDashboardMonth = null; // 'YYYY-MM'
let homeAvailableMonths = [];
let homeDashboardPickerYear = null;

async function renderDashboard() {
    try {
        // Load available months if not yet loaded
        if (homeAvailableMonths.length === 0) {
            const stats = await apiCall('/api/statistics');
            if (stats.availableMonths && stats.availableMonths.length > 0) {
                homeAvailableMonths = [...stats.availableMonths].sort().reverse();
            } else {
                homeAvailableMonths = [new Date().toISOString().substring(0, 7)];
            }
        }
        if (!homeDashboardMonth) {
            const currentMonth = new Date().toISOString().substring(0, 7);
            homeDashboardMonth = homeAvailableMonths.includes(currentMonth)
                ? currentMonth
                : homeAvailableMonths[0];
        }

        updateHomeMonthLabel();
        buildHomeMonthPickerPopup();
        await renderHomeSummary();
        renderHomeRecentTransactions();
    } catch (err) {
        console.error('Błąd renderowania kokpitu:', err);
    }
}

function updateHomeMonthLabel() {
    const label = document.getElementById('home-month-label-text');
    if (!label || !homeDashboardMonth) return;
    const [year, month] = homeDashboardMonth.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    label.textContent = date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
}

function buildHomeMonthPickerPopup() {
    const body = document.getElementById('home-month-picker-body');
    if (!body) return;

    // Group months by year
    const byYear = {};
    homeAvailableMonths.forEach(m => {
        const [y] = m.split('-');
        if (!byYear[y]) byYear[y] = [];
        byYear[y].push(m);
    });

    const availableYears = Object.keys(byYear).sort().reverse();
    if (availableYears.length === 0) {
        body.innerHTML = '<div class="text-center text-sm text-gray-500 py-4">Brak danych</div>';
        return;
    }

    if (!homeDashboardPickerYear || !availableYears.includes(homeDashboardPickerYear)) {
        homeDashboardPickerYear = homeDashboardMonth ? homeDashboardMonth.split('-')[0] : availableYears[0];
    }

    const renderYearView = (year) => {
        body.innerHTML = '';

        // Nagłówek z przełącznikiem roku
        const header = document.createElement('div');
        header.className = 'flex justify-between items-center mb-4 px-1';

        const prevYearBtn = document.createElement('button');
        prevYearBtn.className = 'p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
        prevYearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>';

        const yearIndex = availableYears.indexOf(year);
        // previous button -> starszy rok, czyli index + 1
        prevYearBtn.disabled = yearIndex >= availableYears.length - 1;
        prevYearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (yearIndex < availableYears.length - 1) {
                homeDashboardPickerYear = availableYears[yearIndex + 1];
                renderYearView(homeDashboardPickerYear);
            }
        });

        const nextYearBtn = document.createElement('button');
        nextYearBtn.className = 'p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
        nextYearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>';
        // next button -> nowszy rok, czyli index - 1
        nextYearBtn.disabled = yearIndex <= 0;
        nextYearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (yearIndex > 0) {
                homeDashboardPickerYear = availableYears[yearIndex - 1];
                renderYearView(homeDashboardPickerYear);
            }
        });

        const yearLabel = document.createElement('span');
        yearLabel.className = 'font-bold text-white tracking-wide';
        yearLabel.textContent = year;

        header.appendChild(prevYearBtn);
        header.appendChild(yearLabel);
        header.appendChild(nextYearBtn);
        body.appendChild(header);

        // Siatka z miesiącami dla wybranego roku
        const grid = document.createElement('div');
        grid.className = 'month-picker-grid';

        // 12 miesięcy
        const monthsInYearStr = byYear[year] || [];
        for (let m = 1; m <= 12; m++) {
            const mStr = String(m).padStart(2, '0');
            const ms = `${year}-${mStr}`;
            const btn = document.createElement('button');
            const isAvailable = monthsInYearStr.includes(ms);

            btn.textContent = new Date(year, m - 1).toLocaleString('pl-PL', { month: 'short' });

            if (isAvailable) {
                btn.className = 'month-picker-item' + (ms === homeDashboardMonth ? ' active' : '');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    homeDashboardMonth = ms;
                    document.getElementById('home-month-picker-popup').classList.add('hidden');
                    updateHomeMonthLabel();
                    renderHomeSummary();
                    renderHomeRecentTransactions();
                });
            } else {
                btn.className = 'month-picker-item opacity-20 cursor-not-allowed';
                btn.disabled = true;
                btn.addEventListener('click', (e) => e.stopPropagation());
            }
            grid.appendChild(btn);
        }
        body.appendChild(grid);
    };

    renderYearView(homeDashboardPickerYear);
}

async function renderHomeSummary() {
    const month = homeDashboardMonth;
    if (!month) return;

    const [year, mon] = month.split('-');
    const monInt = parseInt(mon);
    const yrInt = parseInt(year);
    const daysInMonth = new Date(yrInt, monInt, 0).getDate();
    const startDate = `${year}-${mon.padStart(2, '0')}-01`;
    const endDate = `${year}-${mon.padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    // Fetch accurate statistics and budget from API
    try {
        const [stats, budgetData, purchaseData] = await Promise.all([
            apiCall(`/api/statistics?year=${year}&month=${mon.padStart(2, '0')}`),
            apiCall(`/api/budgets/${year}/${mon.padStart(2, '0')}`),
            apiCall(`/api/purchases?startDate=${startDate}&endDate=${endDate}`)
        ]);

        const purchases = purchaseData.purchases || [];
        // Używamy sumy p.totalAmount dla pełnej zgodności z danymi
        const totalSpent = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        const budgets = budgetData.budgets || {};
        const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);

        // Update total
        const totalEl = document.getElementById('home-total-spent');
        if (totalEl) totalEl.textContent = formatAmount(totalSpent);

        const infoEl = document.getElementById('home-budget-info');
        const barWrapper = document.getElementById('home-budget-bar-wrapper');
        const progressEl = document.getElementById('home-budget-progress');
        const pctEl = document.getElementById('home-budget-pct');
        const maxEl = document.getElementById('home-budget-max');

        if (totalBudget > 0) {
            const pct = Math.round((totalSpent / totalBudget) * 100);
            const isOver = totalSpent > totalBudget;
            
            if (infoEl) {
                if (isOver) {
                    const over = totalSpent - totalBudget;
                    infoEl.innerHTML = `<span class="text-red-400 font-semibold">Przekroczono o: ${formatAmount(over)}</span> <span class="text-gray-400 text-xs">z ${formatAmount(totalBudget)}</span>`;
                } else {
                    const remaining = totalBudget - totalSpent;
                    infoEl.textContent = `Pozostało: ${formatAmount(remaining)} z ${formatAmount(totalBudget)}`;
                }
            }

            if (barWrapper) barWrapper.classList.remove('hidden');
            if (progressEl) {
                // Bar width capped at 100% visually, but label shows real %
                progressEl.style.width = Math.min(pct, 100) + '%';
                progressEl.className = `h-2 rounded-full transition-all duration-500 ${isOver ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-brand-500'}`;
            }
            if (pctEl) pctEl.textContent = pct + '%';
            if (maxEl) maxEl.textContent = formatAmount(totalBudget);
        } else {
            if (infoEl) infoEl.textContent = 'Brak ustawionego budżetu';
            if (barWrapper) barWrapper.classList.add('hidden');
        }

        // Render category tiles using the purchases we just fetched for this specific month
        renderHomeCategoryTiles(purchases, budgets);
        renderHomeSubCategoryTiles(purchases);

    } catch (err) {
        console.error('Błąd pobierania danych podsumowania:', err);
    }
}

function renderHomeCategoryTiles(purchases, budgets = {}) {
    const container = document.getElementById('home-category-tiles');
    if (!container) return;
    container.innerHTML = '';

    // Group by parent category
    const byParentCategory = {};
    purchases.forEach(p => {
        (p.items || []).forEach(item => {
            const cat = item.category || 'inne';
            if (!byParentCategory[cat]) byParentCategory[cat] = 0;
            byParentCategory[cat] += item.price || 0;
        });
    });

    const sorted = Object.entries(byParentCategory).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic pl-1">Brak danych</p>';
        return;
    }

    sorted.forEach(([cat, amount]) => {
        // Find parent category in structuredCategories for icon/color
        const parentCat = (typeof structuredCategories !== 'undefined')
            ? structuredCategories.find(c => c.name === cat && !c.parentId)
            : null;

        const color = (parentCat && parentCat.color) || (typeof getCategoryColor === 'function' ? getCategoryColor(cat) : '#6b7280');
        const icon = (parentCat && parentCat.icon) || (typeof categoryIcons !== 'undefined' ? categoryIcons[cat.toLowerCase()] : 'fa-tag') || 'fa-tag';
        
        const budget = budgets[cat] || 0;
        const pct = budget > 0 ? Math.round((amount / budget) * 100) : null;
        
        const tile = document.createElement('div');
        tile.className = 'flex-shrink-0 snap-start flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer min-w-[130px] text-center active:scale-95';
        tile.innerHTML = `
            <div class="w-9 h-9 rounded-full flex items-center justify-center mb-0.5" style="background-color:${color}22;color:${color}">
                <i class="fas ${icon} text-sm"></i>
            </div>
            <p class="text-[11px] text-gray-300 font-medium leading-tight max-w-[110px] truncate">${cat}</p>
            <div class="flex flex-col items-center w-full">
                <p class="text-xs font-bold text-white whitespace-nowrap">
                    ${formatAmount(amount).replace(' zł', '')} 
                    <span class="text-[10px] font-normal text-gray-400">/ ${budget > 0 ? formatAmount(budget).replace(' zł', '') : '---'}</span>
                </p>
                ${budget > 0 ? `
                    <div class="w-16 h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                        <div class="h-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-brand-500'}" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                    <p class="text-[9px] text-gray-500 mt-1">${pct}% wykorzystania</p>
                ` : ''}
            </div>
        `;
        
        tile.addEventListener('click', async () => {
            const allItems = purchases.flatMap(p => 
                (p.items || [])
                    .filter(item => (item.category || 'inne').toLowerCase() === cat.toLowerCase())
                    .map(item => ({
                        ...item,
                        purchaseDate: p.date,
                        shop: p.shop
                    }))
            );
            if(typeof renderCategoryDetailsModal === 'function') {
                renderCategoryDetailsModal(cat, allItems, false); // It's a main category
            }
        });

        container.appendChild(tile);
    });
}

async function renderHomeRecentTransactions() {
    const container = document.getElementById('home-recent-transactions');
    const noData = document.getElementById('home-no-transactions');
    if (!container) return;
    try {
        // Zawsze pobieraj 10 najnowszych zakupów niezależnie od wybranego miesiąca
        const { purchases } = await apiCall(`/api/purchases?limit=10`);
        // Force limit to 10 in case API returns more or for client-side safety
        const recent = (purchases || []).slice(0, 10);

        container.innerHTML = '';
        if (recent.length === 0) {
            if (noData) noData.classList.remove('hidden');
            return;
        }
        if (noData) noData.classList.add('hidden');

        recent.forEach(purchase => {
            const total = (purchase.items || []).reduce((s, i) => s + (i.price || 0), 0);
            const date = new Date(purchase.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
            const firstCat = purchase.items?.[0]?.category || 'inne';
            const shopName = purchase.shop || 'Nieznany';
            const shopLower = shopName.toLowerCase();
            const firstLetter = shopName.charAt(0).toUpperCase();

            const el = document.createElement('div');
            el.className = 'flex flex-col py-3 border-b border-white/5 last:border-0';
            
            // Jednorodne ikony z literą (identyfikator to tylko litera)
            const iconHtml = `
                <div class="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 border border-white/10 shadow-lg">
                    <span class="text-white font-bold text-sm select-none">${firstLetter}</span>
                </div>
            `;

            el.innerHTML = `
                <div class="transaction-header flex items-center gap-3 cursor-pointer select-none transition-opacity active:opacity-60">
                    <div class="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-white/5 overflow-hidden shadow-inner relative">
                        ${iconHtml}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-white truncate">${shopName}</p>
                        <p class="text-[10px] text-gray-400 uppercase tracking-tight font-medium">${date}</p>
                    </div>
                    <div class="flex flex-col items-end">
                        <p class="text-sm font-bold text-white">${formatAmount(total)}</p>
                        <i class="fas fa-chevron-down text-[8px] text-gray-500 mt-1 transition-transform"></i>
                    </div>
                </div>
                <div class="transaction-details hidden mt-3 space-y-2 p-3 bg-white/5 rounded-xl border border-white/5 w-full">
                    ${(purchase.items || []).map(item => {
                        const itemCat = item.category || 'inne';
                        const itemSub = item.subCategory || '';
                        const parentCat = (typeof structuredCategories !== 'undefined')
                            ? structuredCategories.find(c => c.name === itemCat && !c.parentId)
                            : null;
                        
                        const subCat = (typeof structuredCategories !== 'undefined' && parentCat)
                            ? structuredCategories.find(c => c.name === itemSub && c.parentId === parentCat.id)
                            : null;

                        const itemColor = (parentCat && parentCat.color) || (typeof getCategoryColor === 'function' ? getCategoryColor(itemCat) : '#6b7280');
                        const itemIcon = (subCat && subCat.icon) || (parentCat && parentCat.icon) || (typeof categoryIcons !== 'undefined' ? categoryIcons[itemCat.toLowerCase()] : 'fa-tag') || 'fa-tag';
                        return `
                            <div class="flex flex-col py-1">
                                <div class="flex justify-between items-center text-[12px]">
                                    <div class="flex items-center gap-2 min-w-0 pr-4">
                                        <i class="fas ${itemIcon} text-[9px]" style="color:${itemColor}"></i>
                                        <span class="text-gray-200 truncate font-medium">${item.name}</span>
                                    </div>
                                    <span class="text-white font-bold whitespace-nowrap">${formatAmount(item.price)}</span>
                                </div>
                                <div class="flex gap-2 ml-5 mt-0.5">
                                    <span class="text-[10px] text-gray-500">N: <span class="text-gray-400">${item.tags?.nature || 'zmienny'}</span></span>
                                    <span class="text-[10px] text-gray-500">C: <span class="text-gray-400">${item.tags?.purpose || 'konieczny'}</span></span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            el.querySelector('.transaction-header').addEventListener('click', () => {
                const details = el.querySelector('.transaction-details');
                const arrow = el.querySelector('.fa-chevron-down');
                details.classList.toggle('hidden');
                if (arrow) {
                    arrow.style.transform = details.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
                }
            });
            
            container.appendChild(el);
        });
    } catch (err) {
        console.error('Błąd pobierania ostatnich transakcji:', err);
    }
}

let homeSwipeInitialized = false;

function initHomeDashboardControls() {
    if (homeSwipeInitialized) return;
    homeSwipeInitialized = true;
    document.getElementById('home-prev-month-btn')?.addEventListener('click', () => {
        const idx = homeAvailableMonths.indexOf(homeDashboardMonth);
        if (idx < homeAvailableMonths.length - 1) {
            homeDashboardMonth = homeAvailableMonths[idx + 1];
            updateHomeMonthLabel();
            renderHomeSummary();
            // Nie odświeżamy ostatnich transakcji przy zmianie miesiąca
        }
    });

    document.getElementById('home-next-month-btn')?.addEventListener('click', () => {
        const idx = homeAvailableMonths.indexOf(homeDashboardMonth);
        if (idx > 0) {
            homeDashboardMonth = homeAvailableMonths[idx - 1];
            updateHomeMonthLabel();
            renderHomeSummary();
            // Nie odświeżamy ostatnich transakcji przy zmianie miesiąca
        }
    });

    document.getElementById('home-month-label-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const popup = document.getElementById('home-month-picker-popup');
        if (popup) popup.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        const popup = document.getElementById('home-month-picker-popup');
        if (popup && !popup.classList.contains('hidden')) {
            if (!popup.contains(e.target) && e.target.id !== 'home-month-label-btn') {
                popup.classList.add('hidden');
            }
        }
    });

    // --- Obsługa swipe (Gest zmiany miesiąca) ---
    const summaryCard = document.querySelector('#home-tab .glass-card:first-child');
    if (summaryCard) {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let ignoreSwipe = false;

        // Blokujemy propagację z kafelków kategorii, aby ich scrollowanie nie zmieniało miesiąca
        const tilesContainer = document.getElementById('home-category-tiles');
        if (tilesContainer) {
            const stopProp = (e) => e.stopPropagation();
            tilesContainer.addEventListener('touchstart', stopProp, { passive: true });
            tilesContainer.addEventListener('touchmove', stopProp, { passive: true });
            tilesContainer.addEventListener('touchend', stopProp, { passive: true });
        }

        summaryCard.addEventListener('touchstart', (e) => {
            // Ignorujemy dotyk na przyciskach i interaktywnych elementach
            if (e.target.closest('button, #home-category-tiles, a')) {
                ignoreSwipe = true;
                return;
            }
            ignoreSwipe = false;
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        summaryCard.addEventListener('touchmove', (e) => {
            if (ignoreSwipe) return;

            const touchMoveX = e.changedTouches[0].screenX;
            const touchMoveY = e.changedTouches[0].screenY;
            const diffX = Math.abs(touchMoveX - touchStartX);
            const diffY = Math.abs(touchMoveY - touchStartY);

            // Jeśli ruch jest bardziej poziomy niż pionowy (nawet minimalnie), blokujemy scrollowanie strony
            if (diffX > diffY) {
                if (e.cancelable) e.preventDefault();
            }
        }, { passive: false });

        summaryCard.addEventListener('touchend', (e) => {
            if (ignoreSwipe) return;
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        }, { passive: true });

        function handleSwipe() {
            const swipeThreshold = 50; // minimalna odległość przesunięcia
            const diff = touchEndX - touchStartX;

            if (Math.abs(diff) < swipeThreshold) return;

            const idx = homeAvailableMonths.indexOf(homeDashboardMonth);
            
            if (diff > 0) {
                // Swipe w prawo -> Poprzedni miesiąc (wstecz w czasie)
                if (idx < homeAvailableMonths.length - 1) {
                    homeDashboardMonth = homeAvailableMonths[idx + 1];
                    showSwipeAnimation('right');
                }
            } else {
                // Swipe w lewo -> Następny miesiąc (w przód w czasie)
                if (idx > 0) {
                    homeDashboardMonth = homeAvailableMonths[idx - 1];
                    showSwipeAnimation('left');
                }
            }
        }

        function showSwipeAnimation(direction) {
            const content = document.getElementById('home-summary-content');
            if (!content) return;

            // Disable interactions during animation
            content.style.pointerEvents = 'none';
            content.style.transition = 'transform 0.15s ease-out, opacity 0.15s ease-out';
            
            // Phase 1: Quick subtle slide out
            content.style.opacity = '0.3';
            content.style.transform = direction === 'left' ? 'translateX(-15px)' : 'translateX(15px)';
            
            setTimeout(async () => {
                // Update data while content is dimmed
                updateHomeMonthLabel();
                await renderHomeSummary();
                
                // Content is re-rendered, so we might need to find it again if innerHTML was used 
                // (but here renderHomeSummary updates specific elements, so content ref stays valid)
                
                // Prepare for slide in
                content.style.transition = 'none';
                content.style.transform = direction === 'left' ? 'translateX(15px)' : 'translateX(-15px)';
                
                // Force layout
                content.offsetHeight; 
                
                // Phase 2: Smooth slide in
                content.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
                content.style.transform = 'translateX(0)';
                content.style.opacity = '1';
                
                setTimeout(() => {
                    content.style.pointerEvents = '';
                }, 200);
            }, 150);
        }
    }
}

// --- Logika Statystyk ---
async function renderStatistics() {
    try {
        const initialStats = await apiCall('/api/statistics');
        populateMonthSelector(initialStats.availableMonths);
        initMonthNavigator(); // Podepnij event listenery dla nawigacji miesiąca
        await updateCategoryPieChart();

        setupTimeChartListeners();
        renderTimeChart(); // Nowy wykres w czasie (zastępuje comparison)

        await renderShopBarChart();
    } catch (error) {
        console.error("Błąd ładowania statystyk:", error);
    }
}

// Tablica dostępnych miesięcy (potrzebna do month navigator)
let availableMonthsList = [];

function populateMonthSelector(availableMonths) {
    if (!availableMonths || availableMonths.length === 0) {
        currentStatsMonth = 'Brak danych';
        availableMonthsList = [];
        syncMonthNavigatorUI();
        return;
    }

    // Zawsze sortuj malejąco (najnowsze miesiące na górze), niezależnie od kolejności z backendu
    const sortedMonths = [...availableMonths].sort().reverse();
    availableMonthsList = sortedMonths;
    const currentMonth = new Date().toISOString().substring(0, 7);
    currentStatsMonth = sortedMonths.includes(currentMonth) ? currentMonth : sortedMonths[0];

    // Zbuduj popup i zsynchronizuj UI navigatora
    buildMonthPickerPopup(sortedMonths);
    syncMonthNavigatorUI();
}

let currentPickerYear = null;

function buildMonthPickerPopup(sortedMonths) {
    const body = document.getElementById('month-picker-body');
    if (!body) return;

    // Grupuj miesiące po roku (sortedMonths jest malejąco)
    const byYear = {};
    sortedMonths.forEach(ms => {
        const y = ms.split('-')[0];
        if (!byYear[y]) byYear[y] = [];
        byYear[y].push(ms);
    });

    const availableYears = Object.keys(byYear).sort().reverse();
    if (availableYears.length === 0) {
        body.innerHTML = '<div class="text-center text-sm text-gray-500 py-4">Brak danych</div>';
        return;
    }

    // Ustaw rok na podstawie bieżącego wyboru lub domyślnie najnowszy
    const selVal = currentStatsMonth;
    if (selVal && selVal !== 'Brak danych') {
        currentPickerYear = selVal.split('-')[0];
    }
    if (!currentPickerYear || !availableYears.includes(currentPickerYear)) {
        currentPickerYear = availableYears[0];
    }

    const renderYearView = (year) => {
        body.innerHTML = '';

        // Nagłówek z przełącznikiem roku
        const header = document.createElement('div');
        header.className = 'flex justify-between items-center mb-4 px-1';

        const prevYearBtn = document.createElement('button');
        prevYearBtn.className = 'p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
        prevYearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>';

        const yearIndex = availableYears.indexOf(year);
        // previous button -> starszy rok, czyli index + 1
        prevYearBtn.disabled = yearIndex >= availableYears.length - 1;
        prevYearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (yearIndex < availableYears.length - 1) {
                currentPickerYear = availableYears[yearIndex + 1];
                renderYearView(currentPickerYear);
            }
        });

        const nextYearBtn = document.createElement('button');
        nextYearBtn.className = 'p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
        nextYearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>';
        // next button -> nowszy rok, czyli index - 1
        nextYearBtn.disabled = yearIndex <= 0;
        nextYearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (yearIndex > 0) {
                currentPickerYear = availableYears[yearIndex - 1];
                renderYearView(currentPickerYear);
            }
        });

        const yearLabel = document.createElement('span');
        yearLabel.className = 'font-bold text-white tracking-wide';
        yearLabel.textContent = year;

        header.appendChild(prevYearBtn);
        header.appendChild(yearLabel);
        header.appendChild(nextYearBtn);
        body.appendChild(header);

        // Siatka z miesiącami dla wybranego roku
        const grid = document.createElement('div');
        grid.className = 'month-picker-grid';

        // 12 miesięcy - wyświetlamy wszystkie, ale niedostępne są zablokowane i nieco wygaszone
        const monthsInYearStr = byYear[year];
        for (let m = 1; m <= 12; m++) {
            const mStr = String(m).padStart(2, '0');
            const ms = `${year}-${mStr}`;
            const btn = document.createElement('button');
            const isAvailable = monthsInYearStr.includes(ms);

            btn.textContent = new Date(year, m - 1).toLocaleString('pl-PL', { month: 'short' });

            if (isAvailable) {
                btn.className = 'month-picker-item' + (ms === currentStatsMonth ? ' active' : '');
                btn.dataset.month = ms;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    currentStatsMonth = ms;
                    closeMonthPicker();
                    syncMonthNavigatorUI();
                    updateCategoryPieChart();
                });
            } else {
                btn.className = 'month-picker-item opacity-20 cursor-not-allowed';
                btn.disabled = true;
                btn.addEventListener('click', (e) => e.stopPropagation());
            }
            grid.appendChild(btn);
        }
        body.appendChild(grid);
    };

    renderYearView(currentPickerYear);
}

function syncMonthNavigatorUI() {
    const labelEl = document.getElementById('month-label-text');
    if (!labelEl) return;

    const val = currentStatsMonth;
    if (!val || val === 'Brak danych') {
        labelEl.textContent = 'Brak danych';
        return;
    }

    const [y, m] = val.split('-');
    let label = new Date(y, m - 1).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
    label = label.charAt(0).toUpperCase() + label.slice(1);
    labelEl.textContent = label;

    // Odbuduj widok na wypadek zmiany z zewnątrz
    if (availableMonthsList.length > 0) {
        buildMonthPickerPopup(availableMonthsList);
    }
}

function closeMonthPicker(isFromPopState = false) {
    if (typeof closeOverlay === 'function') {
        closeOverlay('month-picker-popup', isFromPopState);
    } else {
        const popup = document.getElementById('month-picker-popup');
        if (popup) popup.classList.add('hidden');
    }
}

function initMonthNavigator() {
    const labelBtn = document.getElementById('month-label-btn');
    const popup = document.getElementById('month-picker-popup');
    if (!labelBtn || !popup) return;

    if (labelBtn.dataset.navInit) return;
    labelBtn.dataset.navInit = 'true';

    labelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof openOverlay === 'function') {
            openOverlay('month-picker-popup');
        } else {
            popup.classList.toggle('hidden');
        }
    });

    // Zamknij popup po kliknięciu poza nim
    document.addEventListener('click', (e) => {
        if (!popup.classList.contains('hidden') && !popup.contains(e.target) && e.target !== labelBtn) {
            closeMonthPicker();
        }
    });
}



async function updateCategoryPieChart() {
    Chart.register(ChartDataLabels);
    const selectedMonth = currentStatsMonth;
    if (!selectedMonth || selectedMonth === 'Brak danych') {
        noDataPieChart.classList.remove('hidden');
        categoryChartContainer.classList.add('hidden');
        document.getElementById('interactive-legend-container').classList.add('hidden');
        document.getElementById('budget-progress-container').innerHTML = ''; // Wyczyść paski postępu
        document.getElementById('budget-summary-container').classList.add('hidden'); // Ukryj podsumowanie
        return;
    };

    const [year, month] = selectedMonth.split('-');

    const [stats, budgetData] = await Promise.all([
        apiCall(`/api/statistics?year=${year}&month=${month}`),
        apiCall(`/api/budgets/${year}/${month}`)
    ]);

    const spendingByCategory = stats.spendingByCategory;
    const budgets = budgetData.budgets || {};

    // Fetch purchases for Time Chart
    // WAŻNE: nie konwertuj przez new Date().toISOString() - to przesuwa czas do UTC i zmienia datę!
    // Użyj daty bezpośrednio jako string w formacie YYYY-MM-DD
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = `${year}-${month.padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const { purchases } = await apiCall(`/api/purchases?startDate=${startDate}&endDate=${endDate}`);
    currentMonthlyPurchases = purchases.filter(p => !p.specialBudgetId);

    renderTimeChart();

    renderBudgetProgress(spendingByCategory, budgets);
    renderBudgetSummary(spendingByCategory, budgets);

    const ctx = document.getElementById('category-chart').getContext('2d');
    const labels = Object.keys(spendingByCategory);
    const data = Object.values(spendingByCategory);
    const total = data.reduce((a, b) => a + b, 0);
    const backgroundColors = labels.map(label => {
        const parentCat = (typeof structuredCategories !== 'undefined')
            ? structuredCategories.find(c => c.name === label && !c.parentId)
            : null;
        return (parentCat && parentCat.color) || (typeof getCategoryColor === 'function' ? getCategoryColor(label) : '#6b7280');
    });

    if (categoryChart) categoryChart.destroy();

    if (labels.length === 0) {
        noDataPieChart.classList.remove('hidden');
        categoryChartContainer.classList.add('hidden');
        document.getElementById('interactive-legend-container').classList.add('hidden');
    } else {
        noDataPieChart.classList.add('hidden');
        categoryChartContainer.classList.remove('hidden');

        categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
                datasets: [{
                    data,
                    backgroundColor: backgroundColors,
                    borderWidth: 2,
                    borderColor: document.body.classList.contains('dark') ? '#1f2937' : '#f9fafb'
                }]
            },
            options: {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 0,
                cutout: '60%',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    const percentage = (context.parsed / total * 100).toFixed(2);
                                    label += `${new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(context.parsed)} (${percentage}%)`;
                                }
                                return label;
                            }
                        }
                    },
                    datalabels: {
                        display: function (context) {
                            const value = context.dataset.data[context.dataIndex];
                            const total = context.chart.getDatasetMeta(0).total;
                            const percentage = (value / total) * 100;
                            // Ukryj etykietę, jeśli jest za mała lub gdy tooltip jest aktywny dla tego segmentu
                            const activeElements = context.chart.getActiveElements();
                            if (activeElements.length > 0) {
                                if (activeElements[0].datasetIndex === context.datasetIndex && activeElements[0].index === context.dataIndex) {
                                    return false;
                                }
                            }
                            return percentage > 4;
                        },
                        formatter: (value, context) => {
                            const label = context.chart.data.labels[context.dataIndex];
                            const total = context.chart.getDatasetMeta(0).total;
                            const percentage = (value / total * 100).toFixed(1) + '%';
                            return label + '\n' + percentage;
                        },
                        color: '#fff',
                        textAlign: 'center',
                        font: {
                            weight: 'bold',
                            size: 11
                        }
                    }
                }
            },
            plugins: [{
                id: 'doughnut-center-text',
                beforeDraw: function (chart) {
                    const { width, height, ctx } = chart;
                    ctx.restore();

                    // Calculate available space in the middle (cutout)
                    const innerRadius = chart.getDatasetMeta(0).data[0].innerRadius;
                    const maxTextWidth = innerRadius * 2 * 0.9; // 90% of inner diameter

                    const text = `${total.toFixed(2)} zł`;

                    // Dynamic font size calculation
                    let fontSize = (height / 150).toFixed(2);
                    ctx.font = `bold ${fontSize}em sans-serif`;

                    // Ensure text fits within maxTextWidth
                    let textWidth = ctx.measureText(text).width;
                    if (textWidth > maxTextWidth) {
                        fontSize = (fontSize * (maxTextWidth / textWidth)).toFixed(2);
                        ctx.font = `bold ${fontSize}em sans-serif`;
                    }

                    ctx.textBaseline = 'middle';
                    const textX = Math.round((width - ctx.measureText(text).width) / 2);
                    const textY = height / 2;

                    ctx.fillStyle = document.body.classList.contains('dark') ? 'white' : '#1f2937';
                    ctx.fillText(text, textX, textY);
                    ctx.save();
                }
            }]
        });
        renderInteractiveLegend(categoryChart, total);
    }
    await renderShopBarChart();
}

function renderInteractiveLegend(chart, total) {
    const legendContainer = document.getElementById('interactive-legend-container');
    const { labels, datasets } = chart.data;
    const originalBorderWidths = datasets[0].borderWidth;

    if (window.innerWidth >= 1024) {
        legendContainer.classList.remove('hidden');
    }

    const sortedData = labels.map((label, index) => ({
        label: label,
        value: datasets[0].data[index],
        color: datasets[0].backgroundColor[index],
        percentage: total > 0 ? (datasets[0].data[index] / total * 100).toFixed(2) : 0
    })).sort((a, b) => b.value - a.value);

    legendContainer.innerHTML = `
        <ul class="space-y-1 pr-2">
            ${sortedData.map(item => {
                const originalIndex = labels.indexOf(item.label);
                const currentLabel = item.label.toLowerCase();
                const parentCat = (typeof structuredCategories !== 'undefined')
                    ? structuredCategories.find(c => c.name.toLowerCase() === currentLabel && !c.parentId)
                    : null;
                const icon = (parentCat && parentCat.icon) || (typeof categoryIcons !== 'undefined' ? categoryIcons[currentLabel] : 'fa-tag') || 'fa-tag';

                return `
                <li data-index="${originalIndex}" data-label="${currentLabel}" class="flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer transition-colors select-none">
                    <div class="flex items-center truncate">
                        <div class="category-icon-mini mr-3 flex-shrink-0" style="background-color: ${item.color}20; color: ${item.color}">
                            <i class="fas ${icon}"></i>
                        </div>
                        <span class="font-medium text-gray-800 dark:text-gray-200 truncate" title="${item.label}">${item.label}</span>
                    </div>
                    <div class="text-right flex-shrink-0 ml-2">
                        <p class="font-bold text-sm text-gray-900 dark:text-white">${item.value.toFixed(2)} zł</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">${item.percentage}%</p>
                    </div>
                </li>
            `;}).join('')}
        </ul>
    `;

    const highlightSegment = (index) => {
        if (!chart || chart.destroyed) return; // <-- THE FIX
        // Aktualizuj podświetlenie na wykresie
        const newBorderWidths = Array(chart.data.labels.length).fill(originalBorderWidths);
        if (index !== -1) {
            newBorderWidths[index] = 8;
        }
        chart.data.datasets[0].borderWidth = newBorderWidths;
        chart.update('none');

        // Aktualizuj podświetlenie tła w legendzie
        const listItems = legendContainer.querySelectorAll('li');
        listItems.forEach(li => {
            li.classList.remove('bg-gray-200', 'dark:bg-gray-700');
            if (parseInt(li.dataset.index) === index) {
                li.classList.add('bg-gray-200', 'dark:bg-gray-700');
            }
        });
    };

    const openDetailsModal = async (label) => {
        const selectedMonth = currentStatsMonth;
        const [year, month] = selectedMonth.split('-');
        try {
            const { items } = await apiCall(`/api/statistics/category-details?year=${year}&month=${month}&category=${label}`);
            renderCategoryDetailsModal(label, items);
        } catch (error) {
            alert('Błąd pobierania szczegółów kategorii: ' + error.message);
        }
    };

    legendContainer.querySelectorAll('li').forEach(li => {
        const index = parseInt(li.dataset.index);
        const label = li.dataset.label;

        if ('ontouchstart' in window) {
            let pressTimer;
            let longPress = false;
            li.addEventListener('touchstart', (e) => {
                longPress = false;
                pressTimer = window.setTimeout(() => {
                    longPress = true;
                    highlightSegment(index); // DODANE: Podświetl przy długim przytrzymaniu
                    openDetailsModal(label);
                }, 500);
            }, { passive: true });
            li.addEventListener('touchend', (e) => {
                clearTimeout(pressTimer);
                if (!longPress) {
                    e.preventDefault();
                    highlightSegment(index);
                }
            });
            li.addEventListener('touchmove', () => clearTimeout(pressTimer));
        } else {
            li.addEventListener('mouseover', () => highlightSegment(index));
            li.addEventListener('click', () => openDetailsModal(label));
        }
    });

    // Remove the old listener before adding a new one
    if (legendMouseoutHandler) {
        legendContainer.removeEventListener('mouseout', legendMouseoutHandler);
    }

    if (!('ontouchstart' in window)) {
        legendMouseoutHandler = () => {
            highlightSegment(-1);
        };
        legendContainer.addEventListener('mouseout', legendMouseoutHandler);
    }
}


async function handleCategoryChartClick(event) {
    if (!categoryChart) return;
    const points = categoryChart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);

    if (points.length) {
        const firstPoint = points[0];
        const label = categoryChart.data.labels[firstPoint.index].toLowerCase();
        const selectedMonth = currentStatsMonth;
        const [year, month] = selectedMonth.split('-');

        try {
            const { items } = await apiCall(`/api/statistics/category-details?year=${year}&month=${month}&category=${label}`);
            renderCategoryDetailsModal(label, items);
        } catch (error) {
            alert('Błąd pobierania szczegółów kategorii: ' + error.message);
        }
    }
}

// --- Wydatki w czasie (Time Chart) ---
function setupTimeChartListeners() {
    const weekBtn = document.getElementById('time-chart-week-btn');
    const dayBtn = document.getElementById('time-chart-day-btn');
    if (!weekBtn || !dayBtn) return;

    if (!weekBtn.hasAttribute('data-listener')) {
        weekBtn.addEventListener('click', () => {
            timeChartMode = 'week';
            weekBtn.classList.replace('text-gray-400', 'text-white');
            weekBtn.classList.replace('hover:text-white', 'shadow');
            weekBtn.classList.add('bg-white/10', 'font-medium');

            dayBtn.classList.replace('text-white', 'text-gray-400');
            dayBtn.classList.replace('shadow', 'hover:text-white');
            dayBtn.classList.remove('bg-white/10', 'font-medium');

            renderTimeChart();
        });
        weekBtn.setAttribute('data-listener', 'true');
    }

    if (!dayBtn.hasAttribute('data-listener')) {
        dayBtn.addEventListener('click', () => {
            timeChartMode = 'day';
            dayBtn.classList.replace('text-gray-400', 'text-white');
            dayBtn.classList.replace('hover:text-white', 'shadow');
            dayBtn.classList.add('bg-white/10', 'font-medium');

            weekBtn.classList.replace('text-white', 'text-gray-400');
            weekBtn.classList.replace('shadow', 'hover:text-white');
            weekBtn.classList.remove('bg-white/10', 'font-medium');

            renderTimeChart();
        });
        dayBtn.setAttribute('data-listener', 'true');
    }
}

function renderTimeChart() {
    const container = document.getElementById('time-chart-container');
    const noData = document.getElementById('no-data-time-chart');
    const ctx = document.getElementById('time-chart')?.getContext('2d');

    if (!container || !noData || !ctx) return;

    if (window.timeChartInstance) {
        window.timeChartInstance.destroy();
    }

    if (!currentMonthlyPurchases || currentMonthlyPurchases.length === 0) {
        container.classList.add('hidden');
        noData.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    noData.classList.add('hidden');

    let labels = [];
    let dataSeries = [];

    const selectedMonth = currentStatsMonth;
    const [y, m] = selectedMonth.split('-');
    const endOfMonth = new Date(y, m, 0).getDate();

    if (timeChartMode === 'week') {
        const weekLabels = ['1-7', '8-14', '15-21', '22-28'];
        if (endOfMonth > 28) {
            weekLabels.push(`29-${endOfMonth}`);
        }

        const weeks = {};
        weekLabels.forEach(l => weeks[l] = 0);

        currentMonthlyPurchases.forEach(p => {
            // Parsuj datę bezpośrednio ze stringa aby uniknąć przesunięcia strefy czasowej
            const day = parseInt(p.date.split('-')[2], 10);
            const weekNum = Math.ceil(day / 7);
            const idx = Math.min(weekNum - 1, weekLabels.length - 1);
            weeks[weekLabels[idx]] += p.totalAmount || 0;
        });

        labels = weekLabels;
        dataSeries = labels.map(l => weeks[l] || 0);

    } else {
        // Agregacja dzienna
        const days = {};

        for (let i = 1; i <= endOfMonth; i++) {
            days[i] = 0;
        }

        currentMonthlyPurchases.forEach(p => {
            // Parsuj datę bezpośrednio ze stringa aby uniknąć przesunięcia strefy czasowej
            const day = parseInt(p.date.split('-')[2], 10);
            days[day] += p.totalAmount || 0;
        });

        labels = Object.keys(days);
        dataSeries = Object.values(days);
    }

    const showDatalabels = (timeChartMode === 'week');

    window.timeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => isNaN(l) ? l : `${l}.`),
            datasets: [{
                data: dataSeries,
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(context.parsed.y)
                    }
                },
                datalabels: {
                    display: showDatalabels,
                    color: 'white',
                    anchor: 'end',
                    align: 'top',
                    offset: 4,
                    formatter: (value) => value > 0 ? Math.round(value) + ' zł' : '',
                    font: { size: 10, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        font: { size: 10 },
                        callback: (value) => Math.round(value) + ' zł'
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        font: { size: 10 }
                    },
                    grid: { display: false }
                }
            },
            layout: {
                padding: { top: 20 }
            }
        }
    });
}

async function renderShopBarChart() {
    const selectedMonth = currentStatsMonth;
    if (!selectedMonth || selectedMonth === 'Brak danych') {
        noDataShopChart.classList.remove('hidden');
        shopChartContainer.classList.add('hidden');
        return;
    };

    const [year, month] = selectedMonth.split('-');
    const stats = await apiCall(`/api/statistics/by-shop?year=${year}&month=${month}`);
    const ctx = document.getElementById('shop-chart').getContext('2d');

    if (shopChart) shopChart.destroy();

    const labels = Object.keys(stats.spendingByShop);
    const data = Object.values(stats.spendingByShop);

    if (labels.length === 0) {
        noDataShopChart.classList.remove('hidden');
        shopChartContainer.classList.add('hidden');
    } else {
        noDataShopChart.classList.add('hidden');
        shopChartContainer.classList.remove('hidden');

        const barHeight = 25;
        const chartHeight = labels.length * barHeight;
        shopChartContainer.style.height = `${Math.max(chartHeight, 200)}px`;

        shopChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Wydatki w sklepie',
                    data,
                    backgroundColor: colorPalette
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 0,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        display: context => context.dataset.data[context.dataIndex] > 0,
                        color: '#fff',
                        anchor: 'end',
                        align: 'end',
                        formatter: (value) => value.toFixed(2) + ' zł',
                        overlap: false,
                        clamp: true
                    }
                },
                indexAxis: 'y',
                scales: {
                    y: {
                        ticks: {
                            color: 'white',
                            autoSkip: false
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        suggestedMax: Math.max(...data) * 1.20,
                        ticks: { color: 'white' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    }
                }
            }
        });
    }
}

function renderHomeSubCategoryTiles(purchases) {
    const container = document.getElementById('home-subcategory-tiles');
    if (!container) return;
    container.innerHTML = '';

    const bySubCategory = {};
    purchases.forEach(p => {
        (p.items || []).forEach(item => {
            if (item.subCategory) {
                const subCat = item.subCategory;
                if (!bySubCategory[subCat]) {
                    bySubCategory[subCat] = {
                        amount: 0,
                        parentCategory: item.category || 'inne'
                    };
                }
                bySubCategory[subCat].amount += item.price || 0;
            }
        });
    });

    const sorted = Object.entries(bySubCategory).sort((a, b) => b[1].amount - a[1].amount);

    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic pl-1">Brak wydatków w podkategoriach</p>';
        return;
    }

    sorted.forEach(([subCat, data]) => {
        const parentCat = (typeof structuredCategories !== 'undefined')
            ? structuredCategories.find(c => c.name === data.parentCategory && !c.parentId)
            : null;

        const color = (parentCat && parentCat.color) || '#6b7280'; // Grey as fallback
        const subCatData = (typeof structuredCategories !== 'undefined' && parentCat)
            ? structuredCategories.find(c => c.name === subCat && c.parentId === parentCat.id)
            : null;
        
        const icon = (subCatData && subCatData.icon) || (parentCat && parentCat.icon) || 'fa-tag';

        const tile = document.createElement('div');
        tile.className = 'flex-shrink-0 snap-start flex flex-col items-center justify-center gap-1 p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer min-w-[100px] text-center active:scale-95';
        tile.innerHTML = `
            <div class="w-8 h-8 rounded-full flex items-center justify-center mb-1" style="background-color:${color}22;color:${color}">
                <i class="fas ${icon} text-xs"></i>
            </div>
            <p class="text-[11px] text-gray-300 font-medium leading-tight max-w-[90px] truncate">${subCat}</p>
            <p class="text-xs font-bold text-white whitespace-nowrap">${formatAmount(data.amount)}</p>
        `;
        
        tile.addEventListener('click', () => {
            const itemsInSubCategory = purchases.flatMap(p => 
                (p.items || [])
                    .filter(item => (item.subCategory || '').toLowerCase() === subCat.toLowerCase())
                    .map(item => ({
                        ...item,
                        purchaseDate: p.date,
                        shop: p.shop
                    }))
            );
            
            if (typeof renderCategoryDetailsModal === 'function') {
                renderCategoryDetailsModal(subCat, itemsInSubCategory, true);
            }
        });

        container.appendChild(tile);
    });
}
