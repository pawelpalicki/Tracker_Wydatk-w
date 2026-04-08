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
        // Fetch stats to get current available months and potentially trigger background recalculation
        const stats = await apiCall('/api/statistics');
        
        if (stats.availableMonths && stats.availableMonths.length > 0) {
            homeAvailableMonths = [...stats.availableMonths].sort().reverse();
        } else if (homeAvailableMonths.length === 0) {
            homeAvailableMonths = [new Date().toISOString().substring(0, 7)];
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
                    buildHomeMonthPickerPopup(); // Rebuild to update active state
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

    // Poprzedni miesiąc dla porównania
    const prevMonthDate = new Date(yrInt, monInt - 2, 1);
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentMonth = month === currentMonthKey;
    const mtdParam = isCurrentMonth ? 'true' : 'false';

    // Fetch accurate statistics and budget from API
    try {
        const [stats, budgetData, purchaseData, comparisonData] = await Promise.all([
            apiCall(`/api/statistics?year=${year}&month=${mon.padStart(2, '0')}`),
            apiCall(`/api/budgets/${year}/${mon.padStart(2, '0')}`),
            apiCall(`/api/purchases?startDate=${startDate}&endDate=${endDate}`),
            apiCall(`/api/statistics/comparison?mode=6months&mtd=${mtdParam}`)
        ]);

        const purchases = purchaseData.purchases || [];
        // Używamy sumy p.totalAmount dla pełnej zgodności z danymi
        const totalSpent = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        const budgets = budgetData.budgets || {};
        const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);

        // Update total
        const totalEl = document.getElementById('home-total-spent');
        const budgetTotalEl = document.getElementById('home-budget-total');
        const infoEl = document.getElementById('home-budget-info');
        
        if (totalEl) {
            totalEl.textContent = formatAmount(totalSpent);
        }
        if (budgetTotalEl) {
            budgetTotalEl.textContent = formatAmount(totalBudget);
        }
        if (infoEl) {
            infoEl.textContent = 'Brak budżetu';
            infoEl.classList.toggle('hidden', totalBudget > 0);
        }

        // --- PRZYWRÓCONO: Aktualizacja plakietki porównania ---
        updateHomeComparisonBadge(comparisonData.monthlyTotals, month, prevMonthKey, isCurrentMonth);

        // --- AKTUALIZACJA SEKCJI MOBILIZACJI ---
        renderHomeMobilizationInsights(purchases, totalBudget, isCurrentMonth);

        const barWrapper = document.getElementById('home-budget-bar-wrapper');
        const progressEl = document.getElementById('home-budget-progress');
        const pctEl = document.getElementById('home-budget-pct');
        if (totalBudget > 0) {
            const pct = Math.round((totalSpent / totalBudget) * 100);
            const isOver = totalSpent > totalBudget;

            if (barWrapper) barWrapper.classList.remove('hidden');
            if (progressEl) {
                // Bar width capped at 100% visually, but label shows real %
                progressEl.style.width = Math.min(pct, 100) + '%';
                progressEl.className = `h-2 rounded-full transition-all duration-500 ${isOver ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-brand-500'}`;
            }
            if (pctEl) pctEl.textContent = pct + '%';
        } else {
            if (barWrapper) barWrapper.classList.add('hidden');
        }

        // Render category tiles using the purchases we just fetched for this specific month
        renderHomeCategoryTiles(purchases, budgets);
        renderHomeSubCategoryTiles(purchases);

    } catch (err) {
        console.error('Błąd pobierania danych podsumowania:', err);
    }
}

function updateHomeComparisonBadge(monthlyTotals, currentKey, prevKey, isCurrentMonth) {
    const badgeEl = document.getElementById('home-comparison-badge');
    const labelEl = document.getElementById('home-comparison-label');
    if (!badgeEl) return;
    if (!monthlyTotals || !Array.isArray(monthlyTotals)) { 
        badgeEl.classList.add('hidden'); 
        if (labelEl) labelEl.classList.add('hidden');
        return; 
    }
    const cur = monthlyTotals.find(m => m.month === currentKey);
    const pre = monthlyTotals.find(m => m.month === prevKey);
    if (!cur || !pre || pre.total <= 0) { 
        badgeEl.classList.add('hidden'); 
        if (labelEl) labelEl.classList.add('hidden');
        return; 
    }
    const pct = Math.round(((cur.total - pre.total) / pre.total) * 100);
    const up = pct > 0;
    badgeEl.className = `flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${up ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`;
    badgeEl.innerHTML = `<i class="fas fa-arrow-trend-${up ? 'up' : 'down'}"></i> <span>${up ? '+' : ''}${pct}%</span>`;
    badgeEl.classList.remove('hidden');
    if (labelEl) labelEl.classList.remove('hidden');
}

function renderHomeMobilizationInsights(purchases, totalBudget, isCurrentMonth) {
    const section = document.getElementById('home-mobilization-section');
    if (!section || !isCurrentMonth || totalBudget <= 0) { if (section) section.classList.add('hidden'); return; }
    const now = new Date(), day = now.getDate(), days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), rem = days - day;
    let fxd = 0, flx = 0, wants = 0;

    purchases.forEach(p => (p.items || []).forEach(i => {
        const isFixed = i.tags?.nature === 'stały' || ['rachunki', 'czynsz', 'kaucje'].includes(i.category?.toLowerCase());
        if (isFixed) {
            fxd += i.price || 0;
        } else {
            flx += i.price || 0;
            if (i.tags?.purpose === 'przyjemność') {
                wants += i.price || 0;
            }
        }
    }));

    let upc = 0;
    if (Array.isArray(allRecurringExpenses)) {
        allRecurringExpenses.forEach(r => {
            if (!purchases.some(p => p.date.substring(0, 7) === now.toISOString().substring(0, 7) && p.shop.toLowerCase().includes(r.name.toLowerCase()))) {
                upc += r.amount || 0;
            }
        });
    }

    const proj = fxd + upc + flx + (flx / day * rem);
    const lim = Math.max(0, totalBudget - fxd - upc - flx) / (rem + 1);
    const dailyLimitEl = document.getElementById('insight-daily-limit');
    const projectionEl = document.getElementById('insight-projection');
    const wantsEl = document.getElementById('insight-wants');

    if (dailyLimitEl) dailyLimitEl.textContent = formatAmount(lim);
    if (projectionEl) projectionEl.textContent = formatAmount(proj);
    if (wantsEl) wantsEl.textContent = formatAmount(wants);

    const dEl = document.getElementById('insight-projection-diff');
    if (dEl) {
        const df = totalBudget - proj;
        dEl.textContent = `${formatAmount(Math.abs(df))} ${df >= 0 ? 'zapasu' : 'przekroczenia'}`;
        dEl.className = `text-[9px] font-bold leading-tight mt-0.5 break-words ${df >= 0 ? 'text-green-400' : 'text-red-400'}`;
    }

    const c = document.getElementById('insight-text-container');
    c.innerHTML = '';

    if (proj > totalBudget) {
        const d = document.createElement('div');
        d.className = 'text-[8px] text-red-300 font-bold flex items-center gap-1';
        d.innerHTML = `<i class="fas fa-triangle-exclamation"></i> Przekroczysz o ~${formatAmount(proj - totalBudget)}`;
        c.appendChild(d);
    }

    section.classList.remove('hidden');
}
/** KONIEC SEKCJI MOBILIZACJA */

function renderHomeCategoryTiles(purchases, budgets = {}) {
    const container = document.getElementById('home-category-tiles');
    if (!container) return;
    container.innerHTML = '';

    // Group by parent category and keep budget-only categories visible as 0 spent.
    const byParentCategory = {};
    purchases.forEach(p => {
        (p.items || []).forEach(item => {
            const cat = item.category || 'inne';
            if (!byParentCategory[cat]) byParentCategory[cat] = 0;
            byParentCategory[cat] += item.price || 0;
        });
    });

    Object.keys(budgets).forEach(cat => {
        if (typeof byParentCategory[cat] !== 'number') {
            byParentCategory[cat] = 0;
        }
    });

    const sorted = Object.entries(byParentCategory).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0], 'pl');
    });

    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic pl-1">Brak danych</p>';
        return;
    }

    sorted.forEach(([cat, amount]) => {
        // Find parent category in structuredCategories for icon/color
        const parentCat = (typeof structuredCategories !== 'undefined')
            ? structuredCategories.find(c => c.name === cat && !c.parentId)
            : null;

        const color = (parentCat && parentCat.color) || '#6b7280';
        const icon = (parentCat && parentCat.icon) || 'fa-tag';
        
        const budget = budgets[cat] || 0;
        const pct = budget > 0 ? Math.round((amount / budget) * 100) : 0;
        
        // Progress ring logic with THICKER stroke and mask
        const cappedPct = Math.min(pct, 100);
        const ringBgStyle = budget > 0 
            ? `background: conic-gradient(${color} ${cappedPct}%, rgba(255,255,255,0.08) ${cappedPct}%); -webkit-mask: radial-gradient(transparent 58%, black 61%); mask: radial-gradient(transparent 58%, black 61%);`
            : `border: 3px solid rgba(255,255,255,0.1);`;

        const tile = document.createElement('div');
        // STRICTOR SQUARE dimensions using flex-basis and fixed width/height
        tile.className = 'flex-none snap-start flex flex-col items-center justify-center gap-1.5 p-2 rounded-2xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer w-28 h-28 text-center active:scale-95 border border-transparent box-border overflow-hidden';
        tile.style.minWidth = '112px';
        tile.style.maxWidth = '112px';
        
        tile.innerHTML = `
            <div class="relative flex items-center justify-center w-12 h-12 mb-0.5">
                <!-- The Ring (Thicker) -->
                <div class="absolute inset-0 rounded-full" style="${ringBgStyle}"></div>
                <!-- The Icon (Larger) -->
                <i class="fas ${icon} text-lg relative z-10" style="color:${color}"></i>
            </div>
            <div class="flex flex-col items-center w-full min-w-0">
                <p class="text-[10px] text-gray-300 font-bold leading-tight w-full truncate px-1">${cat}</p>
                <div class="flex items-center justify-center gap-1 mt-0.5">
                    <p class="text-xs font-extrabold text-white whitespace-nowrap">
                        ${formatAmount(amount).replace(' zł', '')} 
                    </p>
                    ${budget > 0 ? `
                        <span class="text-[9px] font-bold ${pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-yellow-400' : 'text-brand-400'}">${pct}%</span>
                    ` : ''}
                </div>
                <p class="text-[9px] text-gray-400 font-bold leading-none mt-0.5">z ${budget > 0 ? formatAmount(budget).replace(' zł', '') : '---'}</p>
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
            const specialBudgetName = purchase.specialBudgetId ? (allSpecialBudgets.find(b => b.id === purchase.specialBudgetId) || {}).name : null;
            const specialBudgetIcon = specialBudgetName
                ? `<p class="text-[9px] text-blue-400 font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
                     <i class="fas fa-piggy-bank text-[8px]"></i>
                     <span>${specialBudgetName}</span>
                   </p>`
                : '';
            const date = new Date(purchase.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
            const shopName = purchase.shop || 'Nieznany';
            const firstLetter = shopName.charAt(0).toUpperCase();

            const el = document.createElement('div');
            el.className = 'bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all overflow-hidden';
            
            const iconHtml = `
                <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/5 text-white font-bold text-lg select-none">
                    ${firstLetter}
                </div>
            `;

            el.innerHTML = `
                <div class="transaction-header p-3 cursor-pointer select-none group">
                    <div class="flex items-center gap-3">
                        <!-- Logo -->
                        <div class="shrink-0">
                            ${iconHtml}
                        </div>

                        <!-- Info -->
                        <div class="flex-1 min-w-0">
                            ${specialBudgetIcon}
                            <div class="flex justify-between items-center w-full">
                                <span class="text-sm font-semibold text-white truncate pr-2">${shopName}</span>
                                <span class="text-sm font-bold text-white whitespace-nowrap">${formatAmount(total)}</span>
                            </div>
                            <div class="flex justify-between items-center w-full mt-0.5">
                                <span class="text-[10px] text-gray-500 uppercase tracking-tight font-medium">${date}</span>
                                <i class="fas fa-chevron-down text-[10px] text-gray-600 group-hover:text-white transition-all transform duration-300"></i>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="transaction-details hidden p-3 pt-0 border-t border-white/5 bg-black/10">
                    <div class="space-y-1.5 pt-3">
                        ${(purchase.items || []).map(item => {
                        const itemCat = item.category || 'inne';
                        const itemSub = item.subCategory || '';
                        const parentCat = (typeof structuredCategories !== 'undefined')
                            ? structuredCategories.find(c => c.name === itemCat && !c.parentId)
                            : null;
                        
                        const subCat = (typeof structuredCategories !== 'undefined' && parentCat)
                            ? structuredCategories.find(c => c.name === itemSub && c.parentId === parentCat.id)
                            : null;

                        const itemColor = (parentCat && parentCat.color) || '#6b7280';
                        const itemIcon = (subCat && subCat.icon) || (parentCat && parentCat.icon) || 'fa-tag';
                        return `
                            <div class="flex flex-col py-1">
                                <div class="flex justify-between items-center text-[12px]">
                                    <div class="flex items-center gap-2 min-w-0 pr-4">
                                        <i class="fas ${itemIcon} text-[9px]" style="color:${itemColor}"></i>
                                        <span class="text-gray-200 truncate font-medium">${item.name}</span>
                                    </div>
                                    <span class="text-white font-bold whitespace-nowrap">${formatAmount(item.price)}</span>
                                </div>
                                <div class="flex flex-wrap gap-x-3 gap-y-0.5 ml-5 mt-0.5">
                                    ${(typeof getTagGroups === 'function' ? getTagGroups() : ['nature', 'purpose'])
                                        .map(group => {
                                            const val = item.tags?.[group];
                                            if (!val) return '';
                                            const gLabel = typeof getTagGroupLabel === 'function' ? getTagGroupLabel(group) : group;
                                            const tLabel = typeof getTagLabel === 'function' ? getTagLabel(group, val) : val;
                                            return `<span class="text-[10px] text-gray-500">${gLabel.charAt(0).toUpperCase()}: <span class="text-gray-400">${tLabel}</span></span>`;
                                        }).join('')}
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
            buildHomeMonthPickerPopup(); // Odśwież popup z nowym active miesiącem
        }
    });

    document.getElementById('home-next-month-btn')?.addEventListener('click', () => {
        const idx = homeAvailableMonths.indexOf(homeDashboardMonth);
        if (idx > 0) {
            homeDashboardMonth = homeAvailableMonths[idx - 1];
            updateHomeMonthLabel();
            renderHomeSummary();
            buildHomeMonthPickerPopup(); // Odśwież popup z nowym active miesiącem
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

        // Blokujemy propagację z kafelków kategorii i podkategorii, aby ich scrollowanie nie zmieniało miesiąca
        const stopProp = (e) => e.stopPropagation();
        
        const tilesContainer = document.getElementById('home-category-tiles');
        if (tilesContainer) {
            tilesContainer.addEventListener('touchstart', stopProp, { passive: true });
            tilesContainer.addEventListener('touchmove', stopProp, { passive: true });
            tilesContainer.addEventListener('touchend', stopProp, { passive: true });
        }

        const subTilesContainer = document.getElementById('home-subcategory-tiles');
        if (subTilesContainer) {
            subTilesContainer.addEventListener('touchstart', stopProp, { passive: true });
            subTilesContainer.addEventListener('touchmove', stopProp, { passive: true });
            subTilesContainer.addEventListener('touchend', stopProp, { passive: true });
        }

        summaryCard.addEventListener('touchstart', (e) => {
            // Ignorujemy dotyk na przyciskach i interaktywnych elementach
            if (e.target.closest('button, #home-category-tiles, #home-subcategory-tiles, a')) {
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
                buildHomeMonthPickerPopup(); // Odśwież popup z nowym active miesiącem
                
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
