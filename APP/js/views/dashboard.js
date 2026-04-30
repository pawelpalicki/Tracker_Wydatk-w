import state from '../core/state.js';
import { apiCall } from '../core/api.js';
import { formatAmount } from '../shared/format.js';
import { closeDrawer, acquireOverlayNavigationLock, hasVisibleBlockingOverlay } from '../shared/ui.js';
import { getTagGroups, getTagGroupLabel, getTagLabel } from '../shared/tags.js';

let homeDashboardMonth = null;
let homeAvailableMonths = [];
let homeDashboardPickerYear = null;
let homeSwipeInitialized = false;
let notificationsInitialized = false;
let currentNotifications = [];

export async function renderDashboard() {
    try {
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
        console.error('Blad renderowania kokpitu:', err);
    }
}

export function initDashboard() {
    initHomeDashboardControls();
    initNotifications();
}

function updateHomeMonthLabel() {
    const label = document.getElementById('home-month-label-text');
    if (!label || !homeDashboardMonth) return;
    const [year, month] = homeDashboardMonth.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    label.textContent = date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
}

function buildHomeMonthPickerPopup() {
    const body = document.getElementById('home-month-picker-body');
    if (!body) return;

    const byYear = {};
    homeAvailableMonths.forEach(monthKey => {
        const [year] = monthKey.split('-');
        if (!byYear[year]) byYear[year] = [];
        byYear[year].push(monthKey);
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

        const header = document.createElement('div');
        header.className = 'flex justify-between items-center mb-4 px-1';

        const prevYearBtn = document.createElement('button');
        prevYearBtn.className = 'p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
        prevYearBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>';

        const yearIndex = availableYears.indexOf(year);
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

        const grid = document.createElement('div');
        grid.className = 'month-picker-grid';

        const monthsInYear = byYear[year] || [];
        for (let m = 1; m <= 12; m += 1) {
            const mStr = String(m).padStart(2, '0');
            const monthKey = `${year}-${mStr}`;
            const btn = document.createElement('button');
            const isAvailable = monthsInYear.includes(monthKey);

            btn.textContent = new Date(year, m - 1).toLocaleString('pl-PL', { month: 'short' });

            if (isAvailable) {
                btn.className = 'month-picker-item' + (monthKey === homeDashboardMonth ? ' active' : '');
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    homeDashboardMonth = monthKey;
                    document.getElementById('home-month-picker-popup')?.classList.add('hidden');
                    updateHomeMonthLabel();
                    buildHomeMonthPickerPopup();
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
    const monInt = parseInt(mon, 10);
    const yrInt = parseInt(year, 10);
    const daysInMonth = new Date(yrInt, monInt, 0).getDate();
    const startDate = `${year}-${mon.padStart(2, '0')}-01`;
    const endDate = `${year}-${mon.padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const prevMonthDate = new Date(yrInt, monInt - 2, 1);
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentMonth = month === currentMonthKey;
    const mtdParam = isCurrentMonth ? 'true' : 'false';

    try {
        const [budgetData, purchaseData, comparisonData] = await Promise.all([
            apiCall(`/api/budgets/${year}/${mon.padStart(2, '0')}`),
            apiCall(`/api/purchases?startDate=${startDate}&endDate=${endDate}`),
            apiCall(`/api/statistics/comparison?mode=6months&mtd=${mtdParam}`)
        ]);

        const purchases = purchaseData.purchases || [];
        const totalSpent = purchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        const budgets = budgetData.budgets || {};
        const totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);

        const totalEl = document.getElementById('home-total-spent');
        const budgetTotalEl = document.getElementById('home-budget-total');
        const infoEl = document.getElementById('home-budget-info');

        if (totalEl) totalEl.textContent = formatAmount(totalSpent);
        if (budgetTotalEl) budgetTotalEl.textContent = formatAmount(totalBudget);
        if (infoEl) {
            infoEl.textContent = 'Brak budzetu';
            infoEl.classList.toggle('hidden', totalBudget > 0);
        }

        updateHomeComparisonBadge(comparisonData.monthlyTotals, month, prevMonthKey, isCurrentMonth);
        renderHomeMobilizationInsights(purchases, totalBudget, isCurrentMonth);

        const barWrapper = document.getElementById('home-budget-bar-wrapper');
        const progressEl = document.getElementById('home-budget-progress');
        const pctEl = document.getElementById('home-budget-pct');
        if (totalBudget > 0) {
            const pct = Math.round((totalSpent / totalBudget) * 100);
            const isOver = totalSpent > totalBudget;

            if (barWrapper) barWrapper.classList.remove('hidden');
            if (progressEl) {
                progressEl.style.width = Math.min(pct, 100) + '%';
                progressEl.className = `h-2 rounded-full transition-all duration-500 ${isOver ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-brand-500'}`;
            }
            if (pctEl) pctEl.textContent = pct + '%';
        } else if (barWrapper) {
            barWrapper.classList.add('hidden');
        }

        renderHomeCategoryTiles(purchases, budgets);
        renderHomeSubCategoryTiles(purchases);

        if (isCurrentMonth) {
            const categoryTotals = {};
            purchases.forEach(p => (p.items || []).forEach(i => {
                const cat = i.category || 'inne';
                categoryTotals[cat] = (categoryTotals[cat] || 0) + (i.price || 0);
            }));

            checkAndGenerateNotifications({
                totalSpent,
                totalBudget,
                budgets,
                categoryTotals
            });
        }
    } catch (err) {
        console.error('Blad pobierania danych podsumowania:', err);
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
    if (!section || !isCurrentMonth || totalBudget <= 0) {
        if (section) section.classList.add('hidden');
        return;
    }

    const now = new Date();
    const day = now.getDate();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const rem = days - day;
    let fixed = 0;
    let flexible = 0;
    let wants = 0;
    let oneTime = 0;

    purchases.forEach(p => (p.items || []).forEach(i => {
        const nature = (i.tags?.nature || '').toLowerCase().trim();
        const cat = (i.category || 'inne').toLowerCase().trim();
        const isFixed = p.isRecurring === true ||
            nature === 'staly' ||
            nature === 'stale' ||
            nature === 'stały' ||
            nature === 'stałe' ||
            ['media(prad/gaz/woda)', 'media(prąd/gaz/woda)', 'czynsz', 'finanse', 'rachunki', 'oplaty', 'opłaty'].includes(cat);
        const isOneTime = nature === 'jednorazowy';

        if (isFixed) {
            fixed += i.price || 0;
        } else if (isOneTime) {
            oneTime += i.price || 0;
        } else {
            flexible += i.price || 0;
            if (i.tags?.purpose === 'przyjemność' || i.tags?.purpose === 'przyjemnosc') {
                wants += i.price || 0;
            }
        }
    }));

    let upcoming = 0;
    if (Array.isArray(state.allRecurringExpenses)) {
        const currentMonthStr = now.toISOString().substring(0, 7);
        state.allRecurringExpenses.forEach(r => {
            const alreadyPaid = purchases.some(p =>
                p.date.substring(0, 7) === currentMonthStr &&
                (p.items || []).some(item => item.name.toLowerCase().includes(r.name.toLowerCase()))
            );

            if (!alreadyPaid) {
                upcoming += r.amount || 0;
            }
        });
    }

    const projection = fixed + upcoming + oneTime + flexible + (day > 0 ? flexible / day * rem : 0);
    const dailyLimit = Math.max(0, totalBudget - fixed - upcoming - oneTime - flexible) / (rem + 1);

    const dailyLimitEl = document.getElementById('insight-daily-limit');
    const projectionEl = document.getElementById('insight-projection');
    const wantsEl = document.getElementById('insight-wants');

    if (dailyLimitEl) dailyLimitEl.textContent = formatAmount(dailyLimit);
    if (projectionEl) projectionEl.textContent = formatAmount(projection);
    if (wantsEl) wantsEl.textContent = formatAmount(wants);

    const diffEl = document.getElementById('insight-projection-diff');
    if (diffEl) {
        const diff = totalBudget - projection;
        diffEl.textContent = `${formatAmount(Math.abs(diff))} ${diff >= 0 ? 'zapasu' : 'przekroczenia'}`;
        diffEl.className = `text-[9px] font-bold leading-tight mt-0.5 break-words ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`;
    }

    const textContainer = document.getElementById('insight-text-container');
    if (textContainer) {
        textContainer.innerHTML = '';
        if (projection > totalBudget) {
            const warning = document.createElement('div');
            warning.className = 'text-[8px] text-red-300 font-bold flex items-center gap-1';
            warning.innerHTML = `<i class="fas fa-triangle-exclamation"></i> Przekroczysz o ~${formatAmount(projection - totalBudget)}`;
            textContainer.appendChild(warning);
        }
    }

    section.classList.remove('hidden');
}

function renderHomeCategoryTiles(purchases, budgets = {}) {
    const container = document.getElementById('home-category-tiles');
    if (!container) return;
    container.innerHTML = '';

    const byParentCategory = {};
    purchases.forEach(p => {
        (p.items || []).forEach(item => {
            const cat = item.category || 'inne';
            byParentCategory[cat] = (byParentCategory[cat] || 0) + (item.price || 0);
        });
    });

    Object.keys(budgets).forEach(cat => {
        if (typeof byParentCategory[cat] !== 'number') byParentCategory[cat] = 0;
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
        const parentCat = state.structuredCategories.find(c => c.name === cat && !c.parentId);
        const color = (parentCat && parentCat.color) || '#6b7280';
        const icon = (parentCat && parentCat.icon) || 'fa-tag';
        const budget = budgets[cat] || 0;
        const pct = budget > 0 ? Math.round((amount / budget) * 100) : 0;
        const cappedPct = Math.min(pct, 100);
        const ringBgStyle = budget > 0
            ? `background: conic-gradient(${color} ${cappedPct}%, rgba(255,255,255,0.08) ${cappedPct}%); -webkit-mask: radial-gradient(transparent 58%, black 61%); mask: radial-gradient(transparent 58%, black 61%);`
            : 'border: 3px solid rgba(255,255,255,0.1);';

        const tile = document.createElement('div');
        tile.className = 'flex-none snap-start flex flex-col items-center justify-center gap-1.5 p-2 rounded-2xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer w-28 h-28 text-center active:scale-95 border border-transparent box-border overflow-hidden';
        tile.style.minWidth = '112px';
        tile.style.maxWidth = '112px';
        tile.innerHTML = `
            <div class="relative flex items-center justify-center w-12 h-12 mb-0.5">
                <div class="absolute inset-0 rounded-full" style="${ringBgStyle}"></div>
                <i class="fas ${icon} text-lg relative z-10" style="color:${color}"></i>
            </div>
            <div class="flex flex-col items-center w-full min-w-0">
                <p class="text-[10px] text-gray-300 font-bold leading-tight w-full truncate px-1">${cat}</p>
                <div class="flex items-center justify-center gap-1 mt-0.5">
                    <p class="text-xs font-extrabold text-white whitespace-nowrap">${formatAmount(amount).replace(' zł', '').replace(' zl', '')}</p>
                    ${budget > 0 ? `<span class="text-[9px] font-bold ${pct >= 100 ? 'text-red-400' : pct >= 80 ? 'text-yellow-400' : 'text-brand-400'}">${pct}%</span>` : ''}
                </div>
                <p class="text-[9px] text-gray-400 font-bold leading-none mt-0.5">z ${budget > 0 ? formatAmount(budget).replace(' zł', '').replace(' zl', '') : '---'}</p>
            </div>
        `;

        tile.addEventListener('click', () => {
            const allItems = purchases.flatMap(p =>
                (p.items || [])
                    .filter(item => (item.category || 'inne').toLowerCase() === cat.toLowerCase())
                    .map(item => ({
                        ...item,
                        purchaseDate: p.date,
                        shop: p.shop
                    }))
            );
            renderCategoryDetailsModal(cat, allItems, false);
        });

        container.appendChild(tile);
    });
}

async function renderHomeRecentTransactions() {
    const container = document.getElementById('home-recent-transactions');
    const noData = document.getElementById('home-no-transactions');
    if (!container) return;

    try {
        const { purchases } = await apiCall('/api/purchases?limit=10');
        const recent = (purchases || []).slice(0, 10);

        container.innerHTML = '';
        if (recent.length === 0) {
            if (noData) noData.classList.remove('hidden');
            return;
        }
        if (noData) noData.classList.add('hidden');

        recent.forEach(purchase => {
            const total = (purchase.items || []).reduce((sum, item) => sum + (item.price || 0), 0);
            const specialBudgetName = purchase.specialBudgetId ? (state.allSpecialBudgets.find(b => b.id === purchase.specialBudgetId) || {}).name : null;
            const specialBudgetIcon = specialBudgetName
                ? `<p class="text-[9px] text-blue-400 font-bold uppercase tracking-wider flex items-center gap-1 mb-1"><i class="fas fa-piggy-bank text-[8px]"></i><span>${specialBudgetName}</span></p>`
                : '';
            const date = new Date(purchase.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
            const shopName = purchase.shop || 'Nieznany';
            const firstLetter = shopName.charAt(0).toUpperCase();

            const el = document.createElement('div');
            el.className = 'bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all overflow-hidden';
            el.innerHTML = `
                <div class="transaction-header p-3 cursor-pointer select-none group">
                    <div class="flex items-center gap-3">
                        <div class="shrink-0">
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/5 text-white font-bold text-lg select-none">${firstLetter}</div>
                        </div>
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
                        ${(purchase.items || []).map(item => renderRecentTransactionItem(item)).join('')}
                    </div>
                </div>
            `;

            el.querySelector('.transaction-header')?.addEventListener('click', () => {
                const details = el.querySelector('.transaction-details');
                const arrow = el.querySelector('.fa-chevron-down');
                details?.classList.toggle('hidden');
                if (arrow && details) {
                    arrow.style.transform = details.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
                }
            });

            container.appendChild(el);
        });
    } catch (err) {
        console.error('Blad pobierania ostatnich transakcji:', err);
    }
}

function renderRecentTransactionItem(item) {
    const itemCat = item.category || 'inne';
    const itemSub = item.subCategory || '';
    const parentCat = state.structuredCategories.find(c => c.name === itemCat && !c.parentId);
    const subCat = parentCat ? state.structuredCategories.find(c => c.name === itemSub && c.parentId === parentCat.id) : null;
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
                ${getTagGroups().map(group => {
                    const val = item.tags?.[group];
                    if (!val) return '';
                    const groupLabel = getTagGroupLabel(group);
                    const tagLabel = getTagLabel(group, val);
                    return `<span class="text-[10px] text-gray-500">${groupLabel.charAt(0).toUpperCase()}: <span class="text-gray-400">${tagLabel}</span></span>`;
                }).join('')}
            </div>
        </div>
    `;
}

export function initHomeDashboardControls() {
    if (homeSwipeInitialized) return;
    homeSwipeInitialized = true;

    document.getElementById('home-prev-month-btn')?.addEventListener('click', () => {
        const idx = homeAvailableMonths.indexOf(homeDashboardMonth);
        if (idx < homeAvailableMonths.length - 1) {
            homeDashboardMonth = homeAvailableMonths[idx + 1];
            updateHomeMonthLabel();
            renderHomeSummary();
            buildHomeMonthPickerPopup();
        }
    });

    document.getElementById('home-next-month-btn')?.addEventListener('click', () => {
        const idx = homeAvailableMonths.indexOf(homeDashboardMonth);
        if (idx > 0) {
            homeDashboardMonth = homeAvailableMonths[idx - 1];
            updateHomeMonthLabel();
            renderHomeSummary();
            buildHomeMonthPickerPopup();
        }
    });

    document.getElementById('home-month-label-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('home-month-picker-popup')?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        const popup = document.getElementById('home-month-picker-popup');
        if (popup && !popup.classList.contains('hidden')) {
            if (!popup.contains(e.target) && e.target.id !== 'home-month-label-btn') {
                popup.classList.add('hidden');
            }
        }
    });

    initHomeSwipe();
}

function initHomeSwipe() {
    const summaryCard = document.querySelector('#home-tab .glass-card:first-child');
    if (!summaryCard) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let ignoreSwipe = false;
    const stopProp = (e) => e.stopPropagation();

    ['home-category-tiles', 'home-subcategory-tiles'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('touchstart', stopProp, { passive: true });
            el.addEventListener('touchmove', stopProp, { passive: true });
            el.addEventListener('touchend', stopProp, { passive: true });
        }
    });

    summaryCard.addEventListener('touchstart', (e) => {
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
        if (diffX > diffY && e.cancelable) e.preventDefault();
    }, { passive: false });

    summaryCard.addEventListener('touchend', (e) => {
        if (ignoreSwipe) return;
        touchEndX = e.changedTouches[0].screenX;
        handleHomeSwipe(touchStartX, touchEndX);
    }, { passive: true });
}

function handleHomeSwipe(touchStartX, touchEndX) {
    const swipeThreshold = 50;
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) < swipeThreshold) return;

    const idx = homeAvailableMonths.indexOf(homeDashboardMonth);
    if (diff > 0 && idx < homeAvailableMonths.length - 1) {
        homeDashboardMonth = homeAvailableMonths[idx + 1];
        showSwipeAnimation('right');
    } else if (diff < 0 && idx > 0) {
        homeDashboardMonth = homeAvailableMonths[idx - 1];
        showSwipeAnimation('left');
    }
}

function showSwipeAnimation(direction) {
    const content = document.getElementById('home-summary-content');
    if (!content) return;

    content.style.pointerEvents = 'none';
    content.style.transition = 'transform 0.15s ease-out, opacity 0.15s ease-out';
    content.style.opacity = '0.3';
    content.style.transform = direction === 'left' ? 'translateX(-15px)' : 'translateX(15px)';

    setTimeout(async () => {
        updateHomeMonthLabel();
        await renderHomeSummary();
        buildHomeMonthPickerPopup();

        content.style.transition = 'none';
        content.style.transform = direction === 'left' ? 'translateX(15px)' : 'translateX(-15px)';
        content.offsetHeight;
        content.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        content.style.transform = 'translateX(0)';
        content.style.opacity = '1';

        setTimeout(() => {
            content.style.pointerEvents = '';
        }, 200);
    }, 150);
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
        container.innerHTML = '<p class="text-xs text-gray-500 italic pl-1">Brak wydatkow w podkategoriach</p>';
        return;
    }

    sorted.forEach(([subCat, data]) => {
        const parentCat = state.structuredCategories.find(c => c.name === data.parentCategory && !c.parentId);
        const color = (parentCat && parentCat.color) || '#6b7280';
        const subCatData = parentCat ? state.structuredCategories.find(c => c.name === subCat && c.parentId === parentCat.id) : null;
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

            renderCategoryDetailsModal(subCat, itemsInSubCategory, true);
        });

        container.appendChild(tile);
    });
}

export function renderCategoryDetailsModal(category, items, isSubCategoryView = false) {
    const listContainer = document.getElementById('category-details-list');
    const titleEl = document.getElementById('category-details-title');
    if (!listContainer || !titleEl) return;

    titleEl.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    listContainer.innerHTML = '';

    if (items.length === 0) {
        listContainer.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">Brak wydatkow w tym miesiacu.</div>';
    } else {
        if (!isSubCategoryView) {
            const bySub = {};
            items.forEach(item => {
                const sub = item.subCategory || 'Inne';
                bySub[sub] = (bySub[sub] || 0) + (item.price || 0);
            });

            const sortedSub = Object.entries(bySub).sort((a, b) => b[1] - a[1]);
            if (sortedSub.length > 1 || (sortedSub.length === 1 && sortedSub[0][0] !== 'Inne')) {
                const breakdown = document.createElement('div');
                breakdown.className = 'mb-4 space-y-2';
                breakdown.innerHTML = `
                    <p class="text-[10px] text-gray-500 uppercase tracking-widest font-bold ml-1 mb-2">Podzial na podkategorie</p>
                    <div class="grid grid-cols-2 gap-2">
                        ${sortedSub.map(([sub, amount]) => `
                            <div class="bg-white/5 border border-white/10 rounded-xl p-2 px-3">
                                <p class="text-[10px] text-gray-400 truncate">${sub}</p>
                                <p class="text-sm font-bold text-white">${formatAmount(amount).replace(' zł', '').replace(' zl', '')}</p>
                            </div>
                        `).join('')}
                    </div>
                    <hr class="border-white/5 mt-4">
                `;
                listContainer.appendChild(breakdown);
            }
        }

        items.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
        items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 mb-2';

            let dateStr = item.purchaseDate;
            try {
                const parts = item.purchaseDate.split('-');
                if (parts.length === 3) {
                    const d = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
                    dateStr = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
                }
            } catch (e) {
                // Keep the raw date string if parsing fails.
            }

            const subLabel = item.subCategory ? `<span class="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 mr-2">${item.subCategory}</span>` : '';
            itemEl.innerHTML = `
                <div class="flex flex-col overflow-hidden mr-3">
                    <span class="text-sm font-medium text-white truncate w-full">${item.name}</span>
                    <div class="flex items-center text-xs text-gray-400 mt-1 space-x-2">
                        ${isSubCategoryView ? '' : subLabel}
                        <span class="truncate max-w-[80px]">${item.shop || 'Inny'}</span>
                        <span>*</span>
                        <span>${dateStr}</span>
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="text-sm font-bold text-white">${formatAmount(item.price || 0)}</span>
                </div>
            `;
            listContainer.appendChild(itemEl);
        });
    }

    const drawer = document.getElementById('category-details-drawer');
    const overlay = document.getElementById('category-details-drawer-overlay');
    const closeBtn = document.getElementById('close-category-details-drawer');
    if (!drawer || !overlay) return;

    const handleClose = () => closeCategoryDetailsDrawer();
    const wasAlreadyOpen = overlay.classList.contains('active') || !overlay.classList.contains('hidden');
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            handleClose();
        };
    }
    overlay.onclick = (e) => {
        if (e.target === overlay) handleClose();
    };

    drawer.classList.remove('hidden');
    overlay.classList.remove('hidden');
    if (!wasAlreadyOpen) acquireOverlayNavigationLock();
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        drawer.classList.add('active');
        overlay.classList.add('active');
    }, 10);
}

export function closeCategoryDetailsDrawer() {
    closeDrawer('category-details-drawer', 'category-details-drawer-overlay');
}

export function initNotifications() {
    if (notificationsInitialized) return;
    notificationsInitialized = true;

    document.getElementById('nav-notifications-btn')?.addEventListener('click', openNotificationsDrawer);
    document.getElementById('close-notifications-drawer')?.addEventListener('click', closeNotificationsDrawer);
    document.getElementById('notifications-overlay')?.addEventListener('click', closeNotificationsDrawer);
    document.getElementById('ai-insight-btn')?.addEventListener('click', generateAIInsights);
}

export async function loadNotifications() {
    try {
        currentNotifications = await apiCall('/api/notifications');
        updateNotificationBadge();
        renderNotifications();
    } catch (err) {
        console.error('Blad loadNotifications:', err);
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    const unreadCount = currentNotifications.filter(n => !n.isRead).length;
    badge.classList.toggle('hidden', unreadCount === 0);
}

export function openNotificationsDrawer() {
    const drawer = document.getElementById('notifications-drawer');
    const overlay = document.getElementById('notifications-overlay');
    if (!drawer || !overlay) return;

    drawer.classList.remove('hidden');
    overlay.classList.remove('hidden');
    setTimeout(() => {
        drawer.classList.remove('translate-y-full');
        overlay.classList.remove('opacity-0');
    }, 10);

    const unreadIds = currentNotifications.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length > 0) {
        markNotificationsAsRead(unreadIds);
    }
}

export function closeNotificationsDrawer() {
    const drawer = document.getElementById('notifications-drawer');
    const overlay = document.getElementById('notifications-overlay');
    if (!drawer || !overlay) return;

    drawer.classList.add('translate-y-full');
    overlay.classList.add('opacity-0');
    setTimeout(() => {
        drawer.classList.add('hidden');
        overlay.classList.add('hidden');
        if (!hasVisibleBlockingOverlay()) document.body.style.overflow = '';
    }, 300);
}

async function markNotificationsAsRead(ids) {
    try {
        await apiCall('/api/notifications/read', 'POST', { notificationIds: ids });
        currentNotifications.forEach(n => {
            if (ids.includes(n.id)) {
                n.isRead = true;
                n.readAt = Date.now();
            }
        });
        updateNotificationBadge();
    } catch (err) {
        console.error('Blad markNotificationsAsRead:', err);
    }
}

function renderNotifications() {
    const container = document.getElementById('notifications-content');
    if (!container) return;

    if (!Array.isArray(currentNotifications) || currentNotifications.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 opacity-50">
                <i class="fas fa-bell-slash text-3xl mb-3 block"></i>
                <p class="text-sm">Brak nowych powiadomien</p>
            </div>
        `;
        return;
    }

    container.innerHTML = currentNotifications.map(notificationTemplate).join('');
    container.querySelectorAll('[data-delete-notification-id]').forEach(btn => {
        btn.addEventListener('click', () => deleteNotification(btn.dataset.deleteNotificationId));
    });
    setupNotificationSwipes();
}

function notificationTemplate(n) {
    const dateStr = n.date || new Date().toISOString();
    const date = new Date(dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    let icon = 'fa-info-circle';
    let color = 'text-blue-400';
    let bgColor = 'bg-blue-500/10';

    if (n.type === 'budget_80' || n.type?.startsWith('budget_cat_80')) {
        icon = 'fa-triangle-exclamation'; color = 'text-yellow-400'; bgColor = 'bg-yellow-500/10';
    } else if (n.type === 'budget_100' || n.type?.startsWith('budget_cat_100')) {
        icon = 'fa-circle-exclamation'; color = 'text-red-400'; bgColor = 'bg-red-500/10';
    } else if (n.type?.startsWith('recurring')) {
        icon = 'fa-calendar-check'; color = 'text-brand-400'; bgColor = 'bg-brand-500/10';
    } else if (n.type === 'ai_insight') {
        icon = 'fa-wand-magic-sparkles'; color = 'text-purple-400'; bgColor = 'bg-purple-500/10';
    }

    return `
        <div class="notif-swipe-wrapper" data-id="${n.id}">
            <button type="button" class="notif-action-layer" data-delete-notification-id="${n.id}">
                <i class="fas fa-trash-can mb-1"></i>
                <span>Usun</span>
            </button>
            <div class="notif-content-layer flex gap-3 p-3 rounded-xl border border-white/5 ${n.isRead ? 'notif-bg-solid-read' : 'notif-bg-solid border-l-2 border-l-brand-500'}">
                <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg ${bgColor} ${color}">
                    <i class="fas ${icon} text-lg"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-white mb-0.5 leading-snug">${n.message}</p>
                    <p class="text-[10px] text-gray-500">${date}</p>
                </div>
            </div>
        </div>
    `;
}

function setupNotificationSwipes() {
    document.querySelectorAll('.notif-swipe-wrapper').forEach(wrapper => {
        const content = wrapper.querySelector('.notif-content-layer');
        let startX = 0;
        let diffX = 0;
        const maxSwipe = -80;

        wrapper.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            content?.classList.add('swiping');
        }, { passive: true });

        wrapper.addEventListener('touchmove', e => {
            if (!content) return;
            const currentX = e.touches[0].clientX;
            diffX = currentX - startX;
            content.style.transform = diffX < 0 ? `translateX(${Math.max(diffX, maxSwipe - 20)}px)` : 'translateX(0px)';
        }, { passive: true });

        wrapper.addEventListener('touchend', () => {
            if (!content) return;
            content.classList.remove('swiping');
            const id = wrapper.getAttribute('data-id');
            if (diffX < -100) {
                content.style.transform = 'translateX(-100%)';
                content.style.opacity = '0';
                setTimeout(() => deleteNotification(id), 200);
            } else {
                content.style.transform = 'translateX(0px)';
            }
            diffX = 0;
        });
    });
}

export async function deleteNotification(id) {
    if (!confirm('Czy na pewno chcesz usunac to powiadomienie?')) {
        const wrapper = document.querySelector(`.notif-swipe-wrapper[data-id="${id}"]`);
        const content = wrapper?.querySelector('.notif-content-layer');
        if (content) {
            content.style.transform = 'translateX(0px)';
            content.style.opacity = '1';
        }
        return;
    }

    try {
        await apiCall(`/api/notifications/${id}`, 'DELETE');
        currentNotifications = currentNotifications.filter(n => n.id !== id);
        updateNotificationBadge();
        renderNotifications();
    } catch (err) {
        console.error('Blad deleteNotification:', err);
        alert('Nie udalo sie usunac powiadomienia.');
    }
}

export async function checkAndGenerateNotifications(data) {
    const monthKey = new Date().toISOString().substring(0, 7);
    const notificationsToPush = [];

    if (data.totalBudget > 0) {
        const pct = (data.totalSpent / data.totalBudget) * 100;
        if (pct >= 100) {
            notificationsToPush.push({ type: 'budget_100', message: `Przekroczono budzet calkowity (${formatAmount(data.totalSpent)}).`, monthKey });
        } else if (pct >= 80) {
            notificationsToPush.push({ type: 'budget_80', message: 'Wykorzystano juz 80% budzetu calkowitego.', monthKey });
        }
    }

    if (data.budgets) {
        Object.entries(data.budgets).forEach(([catName, budget]) => {
            if (budget > 0) {
                const spent = data.categoryTotals[catName] || 0;
                const pct = (spent / budget) * 100;
                if (pct >= 100) {
                    notificationsToPush.push({ type: `budget_cat_100_${catName}`, message: `Przekroczono budzet w kategorii ${catName}!`, monthKey });
                } else if (pct >= 80) {
                    notificationsToPush.push({ type: `budget_cat_80_${catName}`, message: `Uwaga: 80% budzetu w kategorii ${catName} juz wydane.`, monthKey });
                }
            }
        });
    }

    const now = new Date();
    if (Array.isArray(state.allRecurringExpenses)) {
        state.allRecurringExpenses.forEach(r => {
            const alreadyPaid = state.allPurchases.some(p =>
                p.date.substring(0, 7) === monthKey &&
                p.shop.toLowerCase().includes(r.name.toLowerCase())
            );

            if (!alreadyPaid) {
                const today = now.getDate();
                const dueDay = r.dayOfMonth || 1;
                if (dueDay - today <= 3 && dueDay - today >= -1) {
                    notificationsToPush.push({
                        type: `recurring_${r.name}`,
                        message: `Nadchodzi termin platnosci: ${r.name} (${formatAmount(r.amount)})`,
                        monthKey
                    });
                }
            }
        });
    }

    for (const notification of notificationsToPush) {
        await pushNotificationToServer(notification);
    }
}

async function pushNotificationToServer(notification) {
    try {
        await apiCall('/api/notifications', 'POST', notification);
    } catch (e) {
        console.error('Blad pushNotificationToServer:', e);
    }
}

export async function generateAIInsights() {
    const btn = document.getElementById('ai-insight-btn');
    if (!btn) return;
    const originalContent = btn.innerHTML;

    try {
        const todayKey = new Date().toISOString().substring(0, 10);
        const hasTodayInsight = Array.isArray(currentNotifications) &&
            currentNotifications.some(n => n.type === 'ai_insight' && n.monthKey === todayKey);

        if (hasTodayInsight) {
            alert('Dzisiejsza analiza AI zostala juz wygenerowana. Zapraszamy jutro!');
            return;
        }

        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const stats = calculateCurrentMonthStats();
        const data = await apiCall('/api/analysis/insights', 'POST', stats);

        if (data.insights && Array.isArray(data.insights)) {
            for (const insight of data.insights) {
                await pushNotificationToServer({
                    type: 'ai_insight',
                    message: insight.text,
                    monthKey: todayKey
                });
            }
            await loadNotifications();
            openNotificationsDrawer();
        }
    } catch (err) {
        console.error('Blad generateAIInsights:', err);
        alert('Nie udalo sie wygenerowac wnioskow AI: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = originalContent;
    }
}

export function calculateCurrentMonthStats() {
    const now = new Date();
    const curMonth = now.toISOString().substring(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = prevDate.toISOString().substring(0, 7);

    const stats = {
        currentMonthData: { total: 0, topCategories: [] },
        previousMonthData: { total: 0 },
        categories: state.structuredCategories.map(c => c.name)
    };

    const curTotals = {};
    state.allPurchases.forEach(p => {
        const month = p.date.substring(0, 7);
        if (month === curMonth) {
            stats.currentMonthData.total += p.totalAmount || 0;
            (p.items || []).forEach(i => {
                const cat = i.category || 'inne';
                curTotals[cat] = (curTotals[cat] || 0) + (i.price || 0);
            });
        } else if (month === prevMonth) {
            stats.previousMonthData.total += p.totalAmount || 0;
        }
    });

    stats.currentMonthData.topCategories = Object.entries(curTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, value]) => ({ name, value }));

    return stats;
}
