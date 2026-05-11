// views/analysis.js — Analiza długoterminowa wydatków (ES Module)
//
// Zawiera całą logikę widoku analitycznego z długoterminowymi porównaniami wydatków,
// budżetami, filtrami kategorii i tagów, oraz wykresy interaktywne.

import state from '../core/state.js';
import { apiCall } from '../core/api.js';
import { formatAmount } from '../shared/format.js';
import { renderCategoryDetailsModal, openSelectionDrawer } from '../shared/ui.js';
import { getParentCategoryByName, getSubCategoryByName, applyCategorySelectionState } from '../shared/categories.js';
import { buildTagsSummary, openTagsDrawer, getTagGroups, getTagLabel, getTagGroupLabel } from '../shared/tags.js';
import Drawer from '../shared/drawer.js';

// =====================================================================
// STAN LOKALNY MODUŁU — Variables
// =====================================================================

let longTermBudgetChart = null;
let longTermBudgetInitialized = false;

let currentComparisonCategory = null;
let currentComparisonSubCategory = null;
let currentComparisonTags = {};

let comparisonAvailableMonths = [];
let comparisonAvailableYears = [];
let comparisonSelectedYear = new Date().getFullYear();
let comparisonPeriod = '6months';
let comparisonBucketDetails = [];
let comparisonReferenceDate = new Date();
let comparisonLongPressTimer = null;
let comparisonLongPressTriggered = false;
let comparisonSuppressNextClick = false;
let comparisonTouchMoved = false;
let comparisonParentChipsScrollLeft = 0;
let comparisonSubChipsScrollLeft = 0;
let comparisonShouldPreserveChipScroll = false;
let comparisonSwipeStartX = 0;
let comparisonSwipeStartY = 0;
let comparisonSwipeLocked = false;

const ANALYSIS_MONTH_NAMES_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paz', 'lis', 'gru'];
const ANALYSIS_WEEKDAY_LABELS = ['Pon', 'Wt', 'Sr', 'Czw', 'Pt', 'Sob', 'Nd'];

let shopBarChart = null;

/** Kontekst ostatniego renderu wykresu — do payloadu AI (zakres + filtry + pozycje). */
let lastAnalysisInsightContext = null;

// =====================================================================
// HELPERY DATY
// =====================================================================

function normalizeAnalysisTagValue(value) {
    return value == null ? '' : String(value).trim().toLowerCase();
}

function toDateString(date) {
    return date.toISOString().split('T')[0];
}

function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
}

function getMonthKeyFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDaysInMonth(year, monthNumber) {
    return new Date(year, monthNumber, 0).getDate();
}

function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    return `${ANALYSIS_MONTH_NAMES_SHORT[(month || 1) - 1]} ${year}`;
}

function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatDateRange(startDate, endDate) {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    return `${start.toLocaleDateString('pl-PL')} - ${end.toLocaleDateString('pl-PL')}`;
}

// =====================================================================
// POBIERANIE DANYCH Z BACKENDU
// =====================================================================

async function ensureComparisonAvailableMonths() {
    if (comparisonAvailableMonths.length > 0) {
        return comparisonAvailableMonths;
    }

    const cached = Array.isArray(state.availableMonthsList) ? state.availableMonthsList : [];
    if (cached.length > 0) {
        comparisonAvailableMonths = [...cached].sort().reverse();
    } else {
        try {
            const stats = await apiCall('/api/statistics');
            comparisonAvailableMonths = Array.isArray(stats.availableMonths) ? [...stats.availableMonths].sort().reverse() : [];
            state.availableMonthsList = comparisonAvailableMonths;
        } catch (error) {
            console.error('Blad pobierania dostepnych miesiecy analizy:', error);
            comparisonAvailableMonths = [];
        }
    }

    const years = new Set(comparisonAvailableMonths.map(month => parseInt(month.split('-')[0], 10)).filter(Boolean));
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    comparisonAvailableYears = Array.from(years).sort((a, b) => b - a);
    if (!comparisonAvailableYears.includes(comparisonSelectedYear)) {
        comparisonSelectedYear = comparisonAvailableYears[0] || currentYear;
    }

    return comparisonAvailableMonths;
}

async function fetchAllPurchasesInRange(startDate, endDate) {
    let lastVisible = '';
    let hasMore = true;
    const purchases = [];

    while (hasMore) {
        const params = new URLSearchParams({ startDate, endDate });
        if (lastVisible) params.append('lastVisible', lastVisible);

        const response = await apiCall(`/api/purchases?${params.toString()}`);
        const page = Array.isArray(response.purchases) ? response.purchases : [];
        purchases.push(...page.filter(purchase => !purchase.specialBudgetId));

        lastVisible = response.nextCursor || '';
        hasMore = Boolean(lastVisible);
    }

    return purchases;
}

async function fetchBudgetMapForMonths(monthKeys) {
    const uniqueMonths = Array.from(new Set(monthKeys.filter(Boolean)));
    const entries = await Promise.all(uniqueMonths.map(async (monthKey) => {
        const [year, month] = monthKey.split('-');
        try {
            const response = await apiCall(`/api/budgets/${year}/${month}`);
            return [monthKey, response && typeof response.budgets === 'object' ? response.budgets : {}];
        } catch (error) {
            console.warn(`Brak budzetu dla ${monthKey}:`, error);
            return [monthKey, {}];
        }
    }));

    return new Map(entries);
}

function getBudgetValueForMonth(budgetMap, monthKey) {
    const monthBudget = budgetMap.get(monthKey) || {};
    if (currentComparisonCategory) {
        return Number(monthBudget[currentComparisonCategory] || 0);
    }
    return Object.values(monthBudget).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

// =====================================================================
// FILTROWANIE DANYCH
// =====================================================================

function getFilteredPurchaseItems(purchases) {
    return purchases.flatMap(purchase => {
        const purchaseTags = purchase.tags || {};
        return (purchase.items || [])
            .filter(item => {
                if (currentComparisonCategory && (item.category || 'inne') !== currentComparisonCategory) {
                    return false;
                }
                if (currentComparisonSubCategory && (item.subCategory || '') !== currentComparisonSubCategory) {
                    return false;
                }

                for (const [group, expectedValue] of Object.entries(currentComparisonTags || {})) {
                    if (!expectedValue) continue;
                    const itemValue = normalizeAnalysisTagValue((item.tags && item.tags[group]) || purchaseTags[group]);
                    if (itemValue !== normalizeAnalysisTagValue(expectedValue)) {
                        return false;
                    }
                }

                return true;
            })
            .map(item => {
                const itemTags = item.tags && typeof item.tags === 'object' ? item.tags : {};
                const mergedTags = { ...purchaseTags, ...itemTags };
                return {
                    name: item.name || 'Wydatek',
                    price: Number(item.price || 0),
                    category: item.category || 'inne',
                    subCategory: item.subCategory || '',
                    purchaseDate: purchase.date,
                    shop: purchase.shop || '',
                    tags: mergedTags
                };
            });
    });
}

// =====================================================================
// BUDKETY DANYCH DLA OKRESU
// =====================================================================

function getCurrentWeekBuckets(referenceDate = comparisonReferenceDate) {
    const dayIndex = (referenceDate.getDay() + 6) % 7;
    const monday = new Date(referenceDate);
    monday.setDate(referenceDate.getDate() - dayIndex);

    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return {
            key: toDateString(date),
            label: ANALYSIS_WEEKDAY_LABELS[index],
            title: `${ANALYSIS_WEEKDAY_LABELS[index]} ${date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}`,
            startDate: toDateString(date),
            endDate: toDateString(date),
            monthKey: getMonthKeyFromDate(date),
            dayNumber: date.getDate()
        };
    });
}

function getCurrentMonthBuckets(referenceDate = comparisonReferenceDate) {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth() + 1;
    const daysInMonth = getDaysInMonth(year, month);
    const ranges = [
        { start: 1, end: Math.min(7, daysInMonth) },
        { start: 8, end: Math.min(14, daysInMonth) },
        { start: 15, end: Math.min(21, daysInMonth) },
        { start: 22, end: Math.min(28, daysInMonth) }
    ];

    if (daysInMonth > 28) {
        ranges.push({ start: 29, end: daysInMonth });
    }

    return ranges.map(range => ({
        key: `${year}-${String(month).padStart(2, '0')}:${range.start}-${range.end}`,
        label: `${range.start}-${range.end}`,
        title: `${range.start}-${range.end} ${referenceDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}`,
        startDate: `${year}-${String(month).padStart(2, '0')}-${String(range.start).padStart(2, '0')}`,
        endDate: `${year}-${String(month).padStart(2, '0')}-${String(range.end).padStart(2, '0')}`,
        monthKey: `${year}-${String(month).padStart(2, '0')}`,
        rangeDays: range.end - range.start + 1
    }));
}

function getRollingMonthBuckets(monthCount, referenceDate = comparisonReferenceDate) {
    const buckets = [];
    const monthStart = getMonthStart(referenceDate);

    for (let offset = monthCount - 1; offset >= 0; offset--) {
        const date = addMonths(monthStart, -offset);
        const monthKey = getMonthKeyFromDate(date);
        buckets.push({
            key: monthKey,
            label: formatMonthLabel(monthKey),
            title: date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }),
            startDate: `${monthKey}-01`,
            endDate: `${monthKey}-${String(getDaysInMonth(date.getFullYear(), date.getMonth() + 1)).padStart(2, '0')}`,
            monthKey
        });
    }

    return buckets;
}

function getYearBuckets(selectedYear) {
    return Array.from({ length: 12 }, (_, index) => {
        const monthNumber = index + 1;
        const monthKey = `${selectedYear}-${String(monthNumber).padStart(2, '0')}`;
        return {
            key: monthKey,
            label: ANALYSIS_MONTH_NAMES_SHORT[index],
            title: new Date(selectedYear, index, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }),
            startDate: `${monthKey}-01`,
            endDate: `${monthKey}-${String(getDaysInMonth(selectedYear, monthNumber)).padStart(2, '0')}`,
            monthKey
        };
    });
}

function getComparisonBuckets() {
    if (comparisonPeriod === 'week') return getCurrentWeekBuckets();
    if (comparisonPeriod === 'month') return getCurrentMonthBuckets();
    if (comparisonPeriod === '6months') return getRollingMonthBuckets(6);
    return getYearBuckets(comparisonSelectedYear);
}

function getDisplayedComparisonRangeText(buckets) {
    if (!buckets.length) return '';

    if (comparisonPeriod === 'week') {
        return formatDateRange(buckets[0].startDate, buckets[buckets.length - 1].endDate);
    }

    if (comparisonPeriod === 'month') {
        return parseLocalDate(buckets[0].startDate).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    }

    if (comparisonPeriod === '6months') {
        return `${formatMonthLabel(buckets[0].monthKey)} - ${formatMonthLabel(buckets[buckets.length - 1].monthKey)}`;
    }

    return `styczen - grudzien ${comparisonSelectedYear}`;
}

// =====================================================================
// LOGIKA FILTRÓW
// =====================================================================

function shouldUseToDateMode() {
    return (comparisonPeriod === '6months' || comparisonPeriod === 'year') &&
        Boolean(document.getElementById('comparison-mode-toggle')?.checked);
}

function hasActiveComparisonTagFilters() {
    return Object.values(currentComparisonTags || {}).some(value => Boolean(value));
}

function canShowBudgetComparison() {
    return (comparisonPeriod === 'month' || comparisonPeriod === '6months' || comparisonPeriod === 'year') &&
        !hasActiveComparisonTagFilters() &&
        !currentComparisonSubCategory;
}

function getComparisonParentCategories() {
    if (!Array.isArray(state.structuredCategories)) return [];
    return state.structuredCategories.filter(category => !category.parentId);
}

function getComparisonSelectedParentCategory() {
    return getParentCategoryByName(currentComparisonCategory || '');
}

function getComparisonSubCategories() {
    const parentCategory = getComparisonSelectedParentCategory();
    if (!parentCategory || !Array.isArray(state.structuredCategories)) return [];
    return state.structuredCategories.filter(category => category.parentId === parentCategory.id);
}

function getComparisonSelectedSubCategory() {
    return getSubCategoryByName(currentComparisonCategory || '', currentComparisonSubCategory || '');
}

// =====================================================================
// RENDEROWANIE CHIPÓW KATEGORII
// =====================================================================

function renderComparisonCategoryChips() {
    const container = document.getElementById('comparison-category-filters');
    if (!container) return;

    const previousParentScroller = document.getElementById('comparison-parent-chips');
    const previousSubScroller = document.getElementById('comparison-subcategory-chips');
    if (previousParentScroller && !comparisonShouldPreserveChipScroll) {
        comparisonParentChipsScrollLeft = previousParentScroller.scrollLeft;
    }
    if (previousSubScroller && !comparisonShouldPreserveChipScroll) {
        comparisonSubChipsScrollLeft = previousSubScroller.scrollLeft;
    }

    const parents = getComparisonParentCategories();
    const subCategories = getComparisonSubCategories();
    const selectedParent = getComparisonSelectedParentCategory();

    const createChipButton = ({ label, isActive, onClick, compact = false, color = '#64748b', icon = 'fa-tag', preserveScroll = null }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.tabIndex = -1;
        button.className = [
            'shrink-0 rounded-full border transition-colors whitespace-nowrap',
            compact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-[11px]',
            isActive
                ? 'border-brand-500 bg-brand-500/15 text-white'
                : 'border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/10 hover:text-white'
        ].join(' ');
        button.innerHTML = `
            <span class="flex items-center gap-2">
                <span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px]" style="background:${isActive ? color : `${color}22`}; color:${isActive ? '#ffffff' : color};">
                    <i class="fas ${icon}"></i>
                </span>
                <span>${label}</span>
            </span>
        `;
        button.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            comparisonShouldPreserveChipScroll = true;
            if (typeof preserveScroll === 'function') {
                preserveScroll();
            }
        });
        button.addEventListener('click', onClick);
        return button;
    };

    const parentSection = document.createElement('div');
    parentSection.className = 'block';
    const parentScroller = document.createElement('div');
    parentScroller.id = 'comparison-parent-chips';
    parentScroller.className = 'flex w-full gap-2 overflow-x-auto pb-1 scrollbar-hide';
    parentScroller.addEventListener('scroll', () => {
        comparisonParentChipsScrollLeft = parentScroller.scrollLeft;
    }, { passive: true });
    parentScroller.appendChild(createChipButton({ label: 'Wszystkie', isActive: !currentComparisonCategory, preserveScroll: () => {
        comparisonParentChipsScrollLeft = parentScroller.scrollLeft;
    }, onClick: async () => {
        currentComparisonCategory = null;
        currentComparisonSubCategory = null;
        updateComparisonCategoryFilterUI();
        await renderUnifiedComparisonChart();
    }, color: '#64748b', icon: 'fa-layer-group' }));

    parents.forEach(parent => {
        parentScroller.appendChild(createChipButton({
            label: parent.name,
            isActive: currentComparisonCategory === parent.name,
            color: parent.color || '#64748b',
            icon: parent.icon || 'fa-tag',
            preserveScroll: () => {
                comparisonParentChipsScrollLeft = parentScroller.scrollLeft;
            },
            onClick: async () => {
            currentComparisonCategory = currentComparisonCategory === parent.name ? null : parent.name;
            currentComparisonSubCategory = null;
            updateComparisonControlsVisibility();
            updateComparisonCategoryFilterUI();
            await renderUnifiedComparisonChart();
        }}));
    });
    parentSection.appendChild(parentScroller);

    const fragment = document.createDocumentFragment();
    fragment.appendChild(parentSection);

    if (currentComparisonCategory && subCategories.length > 0) {
        const subSection = document.createElement('div');
        subSection.className = 'block mt-2';
        const subScroller = document.createElement('div');
        subScroller.id = 'comparison-subcategory-chips';
        subScroller.className = 'flex w-full gap-2 overflow-x-auto pb-1 scrollbar-hide';
        subScroller.addEventListener('scroll', () => {
            comparisonSubChipsScrollLeft = subScroller.scrollLeft;
        }, { passive: true });
        subScroller.appendChild(createChipButton({
            label: 'Wszystkie podkategorie',
            isActive: !currentComparisonSubCategory,
            preserveScroll: () => {
            comparisonParentChipsScrollLeft = parentScroller.scrollLeft;
            comparisonSubChipsScrollLeft = subScroller.scrollLeft;
        },
            onClick: async () => {
            currentComparisonCategory = selectedParent?.name || currentComparisonCategory;
            currentComparisonSubCategory = null;
            updateComparisonControlsVisibility();
            updateComparisonCategoryFilterUI();
            await renderUnifiedComparisonChart();
        }, compact: true, color: selectedParent?.color || '#64748b', icon: selectedParent?.icon || 'fa-tag' }));

        subCategories.forEach(subCategory => {
            subScroller.appendChild(createChipButton({
                label: subCategory.name,
                isActive: currentComparisonSubCategory === subCategory.name,
                color: selectedParent?.color || '#64748b',
                icon: subCategory.icon || selectedParent?.icon || 'fa-tag',
                preserveScroll: () => {
                comparisonParentChipsScrollLeft = parentScroller.scrollLeft;
                comparisonSubChipsScrollLeft = subScroller.scrollLeft;
            },
                onClick: async () => {
                currentComparisonCategory = selectedParent?.name || currentComparisonCategory;
                currentComparisonSubCategory = currentComparisonSubCategory === subCategory.name ? null : subCategory.name;
                updateComparisonControlsVisibility();
                updateComparisonCategoryFilterUI();
                await renderUnifiedComparisonChart();
            }, compact: true }));
        });

        subSection.appendChild(subScroller);
        fragment.appendChild(subSection);
    }

    container.replaceChildren(fragment);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const nextParentScroller = document.getElementById('comparison-parent-chips');
            const nextSubScroller = document.getElementById('comparison-subcategory-chips');

            if (nextParentScroller) {
                nextParentScroller.scrollLeft = comparisonParentChipsScrollLeft;
            }

            if (nextSubScroller) {
                nextSubScroller.scrollLeft = comparisonSubChipsScrollLeft;
            } else {
                comparisonSubChipsScrollLeft = 0;
            }

            comparisonShouldPreserveChipScroll = false;
        });
    });
}

function updateComparisonControlsVisibility() {
    const yearWrapper = document.getElementById('comparison-year-wrapper');
    const toggleWrapper = document.getElementById('comparison-mode-toggle-wrapper');
    const subCategoryButton = document.getElementById('analysis-filter-subcategory-btn');
    const subCategories = getComparisonSubCategories();

    if (yearWrapper) {
        yearWrapper.classList.add('hidden');
    }

    if (toggleWrapper) {
        toggleWrapper.classList.toggle('hidden', !(comparisonPeriod === '6months' || comparisonPeriod === 'year'));
    }

    if (subCategoryButton) {
        subCategoryButton.classList.toggle('hidden', subCategories.length === 0);
    }
}

function updateComparisonSummary(totalSpending, totalBudget) {
    const showBudget = canShowBudgetComparison();
    const difference = totalBudget - totalSpending;
    const spendingEl = document.getElementById('comparison-total-spending');
    const budgetEl = document.getElementById('comparison-total-budget');
    const differenceEl = document.getElementById('comparison-total-difference');

    if (spendingEl) spendingEl.textContent = formatAmount(totalSpending);
    if (budgetEl) budgetEl.textContent = showBudget ? formatAmount(totalBudget) : '—';
    if (differenceEl) {
        differenceEl.textContent = showBudget ? `${difference >= 0 ? '+' : '-'}${formatAmount(Math.abs(difference))}` : '—';
        differenceEl.classList.toggle('text-green-400', showBudget && difference >= 0);
        differenceEl.classList.toggle('text-red-400', showBudget && difference < 0);
        differenceEl.classList.toggle('text-white', !showBudget);
    }
}

function updateComparisonCategoryFilterUI() {
    const parentButton = document.getElementById('analysis-filter-category-btn');
    const labelEl = document.getElementById('analysis-filter-category-label');
    const iconEl = document.getElementById('analysis-filter-category-icon');
    const clearBtn = document.getElementById('analysis-filter-category-clear');
    const subCategoryLabelEl = document.getElementById('analysis-filter-subcategory-label');
    const selectedParent = getComparisonSelectedParentCategory();
    const subCategories = getComparisonSubCategories();

    if (parentButton && labelEl && iconEl) {
        applyCategorySelectionState({
            buttonEl: parentButton,
            labelEl,
            iconEl
        }, currentComparisonCategory || '', '', 'Wszystkie kategorie');
    }

    if (subCategoryLabelEl) {
        if (!selectedParent || subCategories.length === 0) {
            subCategoryLabelEl.textContent = 'Wszystkie podkategorie';
        } else {
            subCategoryLabelEl.textContent = currentComparisonSubCategory || 'Wszystkie podkategorie';
        }
    }

    if (clearBtn) {
        clearBtn.classList.toggle('hidden', !currentComparisonCategory);
    }

    renderComparisonCategoryChips();
}

function updateComparisonMetaInfo(bucketCount) {
    const titleEl = document.getElementById('comparison-chart-title');
    const rangeEl = document.getElementById('comparison-selected-range') || document.getElementById('comparison-category-filters');
    const toDateMode = shouldUseToDateMode();
    const showBudget = canShowBudgetComparison();
    const rangeText = getDisplayedComparisonRangeText(comparisonBucketDetails);

    let title = 'Analiza okresu';
    if (comparisonPeriod === 'week') title = 'Wydatki dziennie dla biezacego tygodnia';
    if (comparisonPeriod === 'month') title = 'Wydatki tygodniami biezacego miesiaca';
    if (comparisonPeriod === '6months') title = showBudget
        ? (toDateMode ? 'Ostatnie 6 miesiecy do tego samego dnia' : 'Ostatnie 6 miesiecy')
        : 'Ostatnie 6 miesiecy wydatkow';
    if (comparisonPeriod === 'year') title = showBudget
        ? (toDateMode ? `Rok ${comparisonSelectedYear} do tego samego dnia miesiaca` : `Rok ${comparisonSelectedYear}`)
        : `Rok ${comparisonSelectedYear} miesiac po miesiacu`;

    if (titleEl) {
        titleEl.textContent = title;
        titleEl.classList.add('hidden');
    }
    if (rangeEl) {
        rangeEl.className = 'text-[11px] sm:text-xs font-medium text-gray-400';
        rangeEl.textContent = bucketCount > 0
            ? rangeText
            : 'Brak danych dla wybranego zakresu.';
    }
}

function openComparisonBucketDetails(bucket) {
    if (!bucket) return;
    renderCategoryDetailsModal(bucket.title || bucket.label || 'Szczegoly', bucket.items || [], false);
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function captureAnalysisInsightContext(filteredItems, enrichedBuckets, startDate, endDate) {
    const totalSpending = enrichedBuckets.reduce((s, b) => s + (Number(b.spending) || 0), 0);
    const totalBudget = enrichedBuckets.reduce((s, b) => s + (Number(b.budget) || 0), 0);
    const bucketSeries = enrichedBuckets.map(b => ({
        key: b.key,
        label: b.label,
        monthKey: b.monthKey || null,
        startDate: b.startDate,
        endDate: b.endDate,
        spending: round2(b.spending),
        budget: round2(b.budget)
    }));
    const tagFilterDescription = [];
    for (const [g, v] of Object.entries(currentComparisonTags || {})) {
        if (!v) continue;
        tagFilterDescription.push({ group: getTagGroupLabel(g), value: getTagLabel(g, v) });
    }
    lastAnalysisInsightContext = {
        filteredItems,
        bucketSeries,
        range: {
            startDate,
            endDate,
            label: getDisplayedComparisonRangeText(enrichedBuckets),
            periodType: comparisonPeriod,
            toDateMode: shouldUseToDateMode()
        },
        filtersApplied: {
            category: currentComparisonCategory || null,
            subCategory: currentComparisonSubCategory || null,
            tags: tagFilterDescription
        },
        totals: {
            spending: round2(totalSpending),
            budget: round2(totalBudget),
            difference: round2(totalBudget - totalSpending)
        }
    };
}

function buildAnalysisRangeApiPayload() {
    const ctx = lastAnalysisInsightContext;
    if (!ctx?.filteredItems?.length) return null;
    const items = ctx.filteredItems;
    const spendTotal = ctx.totals.spending || 0;

    const catMap = {};
    const subMap = {};
    const shopMap = {};
    for (const it of items) {
        const c = it.category || 'inne';
        catMap[c] = (catMap[c] || 0) + it.price;
        const sub = (it.subCategory || '').trim();
        if (sub) {
            const path = `${c} / ${sub}`;
            subMap[path] = (subMap[path] || 0) + it.price;
        }
        const sh = (it.shop || '').trim();
        if (sh && !sh.toLowerCase().startsWith('wydatek cykliczny')) {
            shopMap[sh] = (shopMap[sh] || 0) + it.price;
        }
    }

    const topFromMap = (map, n) => Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([name, amount]) => {
            const a = round2(amount);
            return {
                name,
                amount: a,
                pctOfSpend: spendTotal > 0 ? round2((a / spendTotal) * 100) : 0
            };
        });

    const tagSpendByGroup = {};
    for (const group of getTagGroups()) {
        const valMap = {};
        for (const it of items) {
            const tags = it.tags || {};
            const val = tags[group];
            if (val == null || val === '') continue;
            const key = String(val);
            valMap[key] = (valMap[key] || 0) + it.price;
        }
        const entries = Object.entries(valMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (entries.length > 0) {
            tagSpendByGroup[getTagGroupLabel(group)] = entries.map(([value, amount]) => {
                const am = round2(amount);
                return {
                    value,
                    label: getTagLabel(group, value),
                    amount: am,
                    pctOfSpend: spendTotal > 0 ? round2((am / spendTotal) * 100) : 0
                };
            });
        }
    }

    const spends = ctx.bucketSeries.map(b => b.spending);
    const mean = spends.length ? spends.reduce((a, b) => a + b, 0) / spends.length : 0;
    let volatilityPct = 0;
    if (spends.length > 1 && mean > 0) {
        const variance = spends.reduce((a, s) => a + (s - mean) ** 2, 0) / spends.length;
        volatilityPct = round2((Math.sqrt(variance) / mean) * 100);
    }

    let maxB = null;
    let minB = null;
    for (const b of ctx.bucketSeries) {
        if (!maxB || b.spending > maxB.spending) maxB = b;
        if (!minB || b.spending < minB.spending) minB = b;
    }

    const startD = parseLocalDate(ctx.range.startDate);
    const endD = parseLocalDate(ctx.range.endDate);
    const daySpan = Math.max(1, Math.floor((endD - startD) / 86400000) + 1);
    const activeDays = new Set(items.map(i => i.purchaseDate)).size;

    return {
        locale: 'pl-PL',
        currency: 'PLN',
        range: ctx.range,
        filtersApplied: ctx.filtersApplied,
        totals: ctx.totals,
        bucketSeries: ctx.bucketSeries,
        aggregates: {
            lineItemCount: items.length,
            activeSpendDays: activeDays,
            calendarDaysInRange: daySpan,
            avgSpendingPerDay: round2(spendTotal / daySpan),
            topCategories: topFromMap(catMap, 12),
            topSubcategoryPaths: topFromMap(subMap, 12),
            topShops: topFromMap(shopMap, 12),
            tagSpendByGroup,
            bucketVolatilityPct: volatilityPct,
            richestPeriod: maxB ? { label: maxB.label, spending: maxB.spending } : null,
            leanestPeriod: minB ? { label: minB.label, spending: minB.spending } : null
        }
    };
}

function escapeHtmlInsight(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const ANALYSIS_AI_LS_PREFIX = 'tw_analysis_ai_v1_';

function hashDjb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
}

function analysisAiStorageKey(payload) {
    return `${ANALYSIS_AI_LS_PREFIX}${hashDjb2(JSON.stringify(payload)).toString(36)}`;
}

function readAnalysisAiCache(storageKey, payload) {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data.v !== 1 || data.fingerprint !== hashDjb2(JSON.stringify(payload))) return null;
        if (!Array.isArray(data.insights) || data.insights.length === 0) return null;
        return { insights: data.insights, quota: data.quota || null };
    } catch {
        return null;
    }
}

function writeAnalysisAiCache(storageKey, payload, { insights, quota }) {
    try {
        const entry = {
            v: 1,
            fingerprint: hashDjb2(JSON.stringify(payload)),
            savedAt: Date.now(),
            insights,
            quota: quota || null
        };
        localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (e) {
        console.warn('Zapis cache analizy AI:', e);
    }
}

function formatQuotaLine(quota) {
    if (!quota || !quota.daily || !quota.monthly) return '';
    const d = quota.daily;
    const m = quota.monthly;
    return `Dzisiaj: ${d.used}/${d.limit} · W tym miesiącu: ${m.used}/${m.limit}`;
}

function buildAnalysisInsightsListHtml(insights) {
    return insights.map((ins) => {
        const icon = (ins.icon && /^fa-[\w-]+$/.test(ins.icon)) ? ins.icon : 'fa-lightbulb';
        const text = escapeHtmlInsight(ins.text || '');
        return `
                <div class="flex gap-3 p-3 rounded-xl border border-white/10 bg-white/5 mb-2">
                    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                        <i class="fas ${icon}"></i>
                    </div>
                    <p class="text-sm leading-relaxed text-gray-200">${text}</p>
                </div>
            `;
    }).join('');
}

function buildAnalysisInsightsDrawerContent(insights, quota, { fromCache = false } = {}) {
    const quotaText = formatQuotaLine(quota);
    const cacheBanner = fromCache
        ? `<p class="text-[11px] text-brand-300/90 mb-2 rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 py-2">Ten sam zestaw danych co przy ostatniej analizie — wynik z pamięci podręcznej przeglądarki. <strong>Limit API nie został zużyty.</strong></p>`
        : '';
    const quotaBlock = `
            <div id="analysis-ai-quota-line" class="text-[11px] text-gray-400 border border-white/10 rounded-xl px-3 py-2 bg-white/[0.03] mb-2">
                <span class="text-gray-500">Wykorzystanie limitu:</span>
                ${quotaText ? ` <span id="analysis-ai-quota-values">${escapeHtmlInsight(quotaText)}</span>` : ' <span id="analysis-ai-quota-values">Ładowanie…</span>'}
            </div>`;
    return `
        <div class="pb-safe space-y-1 max-h-[70vh] overflow-y-auto pr-1">
            ${cacheBanner}
            ${quotaBlock}
            <div class="space-y-1">${buildAnalysisInsightsListHtml(insights)}</div>
        </div>
    `;
}

async function refreshAnalysisAiQuotaLine() {
    try {
        const q = await apiCall('/api/analysis/insights-range/quota', 'GET');
        const wrap = document.getElementById('analysis-ai-quota-line');
        const slot = document.getElementById('analysis-ai-quota-values');
        const line = formatQuotaLine(q);
        if (slot) slot.textContent = line || '—';
        else if (wrap && line) wrap.innerHTML = `<span class="text-gray-500">Wykorzystanie limitu:</span> ${escapeHtmlInsight(line)}`;
    } catch (e) {
        console.warn('Pobieranie limitu AI:', e);
        const slot = document.getElementById('analysis-ai-quota-values');
        if (slot) slot.textContent = 'nie udało się odczytać';
    }
}

function updateAnalysisAiInsightButtonState() {
    const btn = document.getElementById('analysis-ai-insight-btn');
    if (!btn) return;
    const count = lastAnalysisInsightContext?.filteredItems?.length || 0;
    const enabled = count > 0;
    btn.disabled = !enabled;
    btn.classList.toggle('opacity-40', !enabled);
    btn.classList.toggle('cursor-not-allowed', !enabled);
    btn.title = enabled
        ? 'Wnioski AI dla zakresu wykresu i aktywnych filtrów'
        : 'Brak pozycji w wybranym zakresie (po filtrach)';
}

async function runAnalysisRangeAiInsight() {
    const btn = document.getElementById('analysis-ai-insight-btn');
    if (!btn || btn.disabled) return;

    const payload = buildAnalysisRangeApiPayload();
    if (!payload) {
        alert('Brak danych do analizy AI w tym zakresie.');
        return;
    }

    const storageKey = analysisAiStorageKey(payload);
    const cached = readAnalysisAiCache(storageKey, payload);

    const originalHtml = btn.innerHTML;
    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin text-sm"></i>';

        let insights = [];
        let quota = null;
        let fromCache = false;

        if (cached) {
            insights = cached.insights;
            quota = cached.quota;
            fromCache = true;
        } else {
            const data = await apiCall('/api/analysis/insights-range', 'POST', payload);
            insights = data && Array.isArray(data.insights) ? data.insights : [];
            quota = data && data.quota ? data.quota : null;
            if (insights.length === 0) {
                alert('Model nie zwrócił wniosków. Spróbuj ponownie.');
                return;
            }
            writeAnalysisAiCache(storageKey, payload, { insights, quota });
        }

        if (insights.length === 0) {
            alert('Brak wniosków do wyświetlenia.');
            return;
        }

        Drawer.open({
            title: 'Wnioski AI — analiza okresu',
            content: buildAnalysisInsightsDrawerContent(insights, quota, { fromCache }),
            size: 'md',
            showCloseBtn: true
        });

        refreshAnalysisAiQuotaLine();
    } catch (err) {
        console.error('runAnalysisRangeAiInsight:', err);
        alert(err.message || 'Nie udało się wygenerować analizy AI.');
    } finally {
        btn.innerHTML = originalHtml;
        updateAnalysisAiInsightButtonState();
    }
}

function initAnalysisAiInsightButton() {
    const btn = document.getElementById('analysis-ai-insight-btn');
    if (!btn || btn.dataset.initialized === 'true') return;
    btn.dataset.initialized = 'true';
    btn.addEventListener('click', () => runAnalysisRangeAiInsight());
}

// =====================================================================
// BUDOWANIE WYKRESÓW
// =====================================================================

function buildComparisonChart(buckets) {
    const container = document.getElementById('comparison-chart-container');
    const canvas = document.getElementById('comparison-chart');
    const noData = document.getElementById('no-data-bar-chart');
    if (!container || !canvas || !noData) return;

    const hasData = buckets.some(bucket => bucket.spending > 0 || bucket.budget > 0);
    comparisonBucketDetails = buckets;
    updateComparisonMetaInfo(buckets.length);

    if (longTermBudgetChart) {
        longTermBudgetChart.destroy();
        longTermBudgetChart = null;
    }

    container.classList.remove('hidden');
    noData.classList.toggle('hidden', hasData);

    const labels = buckets.map(bucket => bucket.label);
    const spendingData = buckets.map(bucket => Number(bucket.spending.toFixed(2)));
    const budgetData = buckets.map(bucket => Number(bucket.budget.toFixed(2)));
    const totalSpending = spendingData.reduce((sum, value) => sum + value, 0);
    const totalBudget = budgetData.reduce((sum, value) => sum + value, 0);
    const showBudget = canShowBudgetComparison();
    const maxValue = Math.max(0, ...spendingData, ...budgetData);
    updateComparisonSummary(totalSpending, totalBudget);

    const ctx = canvas.getContext('2d');
    longTermBudgetChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                ...(showBudget ? [{
                    label: 'Budzet',
                    data: budgetData,
                    grouped: false,
                    backgroundColor: 'rgba(148, 163, 184, 0.22)',
                    borderColor: '#94a3b8',
                    borderWidth: 2,
                    borderRadius: 12,
                    maxBarThickness: 34,
                    order: 1
                }] : []),
                {
                    label: 'Wydatki',
                    data: spendingData,
                    grouped: false,
                    backgroundColor: 'rgba(226, 232, 240, 0.92)',
                    borderColor: '#f8fafc',
                    borderWidth: 1,
                    borderRadius: 10,
                    maxBarThickness: showBudget ? 18 : 28,
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            events: ['mousemove', 'mouseout', 'click'],
            layout: {
                padding: {
                    top: 12,
                    right: 4,
                    left: 0,
                    bottom: 0
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            onClick: (event, elements, chart) => {
                if (comparisonLongPressTriggered || comparisonSuppressNextClick || comparisonTouchMoved) {
                    comparisonLongPressTriggered = false;
                    comparisonSuppressNextClick = false;
                    return;
                }
                if (!elements.length) return;
                const activeElements = chart.data.datasets.map((_, datasetIndex) => ({
                    datasetIndex,
                    index: elements[0].index
                }));
                chart.setActiveElements(activeElements);
                chart.tooltip.setActiveElements(activeElements, { x: event.x, y: event.y });
                chart.update();
            },
            plugins: {
                legend: {
                    display: false,
                    labels: {
                        color: '#d1d5db',
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatAmount(context.parsed.y)}`
                    }
                },
                datalabels: {
                    display: false,
                    color: '#e5e7eb',
                    anchor: 'end',
                    align: 'top',
                    offset: 2,
                    formatter: (value) => value > 0 ? Math.round(value) : '',
                    font: {
                        weight: 'bold',
                        size: 10
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grace: '8%',
                    suggestedMax: maxValue > 0 ? undefined : 1,
                    ticks: {
                        color: '#9ca3af',
                        callback: value => `${Math.round(value)} zl`
                    },
                    grid: {
                        color: 'rgba(255,255,255,0.08)'
                    }
                },
                x: {
                    ticks: {
                        color: '#d1d5db'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function getFilteredItemsForBucket(allItems, bucket) {
    return allItems.filter(item => item.purchaseDate >= bucket.startDate && item.purchaseDate <= bucket.endDate);
}

function applyToDateFilterForMonthItems(items, monthKey, toDateMode) {
    if (!toDateMode) return items.filter(item => item.purchaseDate.startsWith(monthKey));
    const targetDay = new Date().getDate();
    return items.filter(item => {
        if (!item.purchaseDate.startsWith(monthKey)) return false;
        return parseLocalDate(item.purchaseDate).getDate() <= targetDay;
    });
}

function buildWeekBucketsData(filteredItems, budgetMap) {
    return getCurrentWeekBuckets().map(bucket => {
        const items = getFilteredItemsForBucket(filteredItems, bucket);
        const spending = items.reduce((sum, item) => sum + item.price, 0);
        const budget = 0;
        return { ...bucket, items, spending, budget };
    });
}

function buildMonthBucketsData(filteredItems, budgetMap) {
    const monthKey = `${comparisonReferenceDate.getFullYear()}-${String(comparisonReferenceDate.getMonth() + 1).padStart(2, '0')}`;
    const daysInMonth = getDaysInMonth(comparisonReferenceDate.getFullYear(), comparisonReferenceDate.getMonth() + 1);
    const totalBudget = canShowBudgetComparison() ? getBudgetValueForMonth(budgetMap, monthKey) : 0;

    return getCurrentMonthBuckets().map(bucket => {
        const items = getFilteredItemsForBucket(filteredItems, bucket);
        const spending = items.reduce((sum, item) => sum + item.price, 0);
        const budget = totalBudget > 0 ? totalBudget * (bucket.rangeDays / daysInMonth) : 0;
        return { ...bucket, items, spending, budget };
    });
}

function buildMonthlyBucketsData(filteredItems, budgetMap, monthKeys) {
    const toDateMode = shouldUseToDateMode();
    const targetDay = new Date().getDate();

    return monthKeys.map(monthKey => {
        const [year, month] = monthKey.split('-').map(Number);
        const daysInMonth = getDaysInMonth(year, month);
        const endDay = toDateMode ? Math.min(targetDay, daysInMonth) : daysInMonth;
        const items = applyToDateFilterForMonthItems(filteredItems, monthKey, toDateMode);
        const spending = items.reduce((sum, item) => sum + item.price, 0);
        const baseBudget = canShowBudgetComparison() ? getBudgetValueForMonth(budgetMap, monthKey) : 0;
        const budget = toDateMode ? baseBudget * (endDay / daysInMonth) : baseBudget;
        return {
            key: monthKey,
            label: comparisonPeriod === 'year' ? ANALYSIS_MONTH_NAMES_SHORT[month - 1] : formatMonthLabel(monthKey),
            title: new Date(year, month - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }),
            startDate: `${monthKey}-01`,
            endDate: `${monthKey}-${String(endDay).padStart(2, '0')}`,
            monthKey,
            items,
            spending,
            budget
        };
    });
}

async function renderUnifiedComparisonChart() {
    await ensureComparisonAvailableMonths();
    updateComparisonControlsVisibility();
    updateComparisonCategoryFilterUI();

    const buckets = getComparisonBuckets();
    if (!buckets.length) {
        buildComparisonChart([]);
        buildShopChart([]);
        lastAnalysisInsightContext = null;
        updateAnalysisAiInsightButtonState();
        return;
    }

    const startDate = buckets[0].startDate;
    const endDate = buckets[buckets.length - 1].endDate;
    const purchases = await fetchAllPurchasesInRange(startDate, endDate);
    const filteredItems = getFilteredPurchaseItems(purchases);
    const monthKeys = buckets.map(bucket => bucket.monthKey);
    const budgetMap = canShowBudgetComparison() ? await fetchBudgetMapForMonths(monthKeys) : new Map();

    let enrichedBuckets = [];
    if (comparisonPeriod === 'week') {
        enrichedBuckets = buildWeekBucketsData(filteredItems, budgetMap);
    } else if (comparisonPeriod === 'month') {
        enrichedBuckets = buildMonthBucketsData(filteredItems, budgetMap);
    } else {
        enrichedBuckets = buildMonthlyBucketsData(filteredItems, budgetMap, monthKeys);
    }

    buildComparisonChart(enrichedBuckets);
    buildShopChart(filteredItems);
    captureAnalysisInsightContext(filteredItems, enrichedBuckets, startDate, endDate);
    updateAnalysisAiInsightButtonState();
}

function buildShopChart(filteredItems) {
    const card = document.getElementById('shop-chart-card');
    const container = document.getElementById('shop-chart-container');
    const canvas = document.getElementById('shop-chart');
    const noData = document.getElementById('no-data-shop-chart');
    const rangeEl = document.getElementById('shop-chart-range');
    if (!card || !container || !canvas || !noData) return;

    if (shopBarChart) { shopBarChart.destroy(); shopBarChart = null; }

    const shopTotals = {};
    for (const item of filteredItems) {
        const shop = (item.shop || '').trim();
        if (!shop || shop.toLowerCase().startsWith('wydatek cykliczny')) continue;
        shopTotals[shop] = (shopTotals[shop] || 0) + item.price;
    }

    const TOP_N = 10;
    const sorted = Object.entries(shopTotals).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        noData.style.display = 'block';
        container.style.display = 'none';
        if (rangeEl) rangeEl.textContent = '';
        return;
    }

    noData.style.display = 'none';
    container.style.display = 'block';

    const top = sorted.slice(0, TOP_N);
    const rest = sorted.slice(TOP_N);
    const restEntry = rest.length > 0
        ? [`Pozostałe (${rest.length})`, rest.reduce((s, [, v]) => s + v, 0)]
        : null;

    if (restEntry) top.push(restEntry);
    const labels = top.map(([name]) => name);
    const data = top.map(([, val]) => Number(val.toFixed(2)));

    if (rangeEl) {
        const buckets = getComparisonBuckets();
        rangeEl.textContent = buckets.length ? getDisplayedComparisonRangeText(buckets) : '';
    }

    const barHeight = 28;
    const chartHeight = Math.max(labels.length * barHeight, 120);
    const chartWidth = card.offsetWidth - 24;
    container.style.width = chartWidth + 'px';
    container.style.height = chartHeight + 'px';
    canvas.width = chartWidth;
    canvas.height = chartHeight;

    const maxVal = Math.max(...data);
    const ctx = canvas.getContext('2d');
    shopBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: 'rgba(226, 232, 240, 0.92)',
                borderColor: '#f8fafc',
                borderWidth: 1,
                borderRadius: 8,
                maxBarThickness: 20
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: { padding: { right: 8, top: 4, bottom: 0, left: 0 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (c) => ` ${formatAmount(c.parsed.x)}`
                    }
                },
                datalabels: {
                    display: true,
                    color: '#9ca3af',
                    anchor: 'end',
                    align: 'end',
                    clamp: true,
                    formatter: (value) => formatAmount(value),
                    font: { size: 10, weight: '500' }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    suggestedMax: maxVal * 1.25,
                    ticks: { color: '#9ca3af', callback: v => `${Math.round(v)} zł` },
                    grid: { color: 'rgba(255,255,255,0.08)' }
                },
                y: {
                    ticks: { color: '#d1d5db', autoSkip: false },
                    grid: { display: false }
                }
            }
        }
    });
}

// =====================================================================
// LOGIKA NAWIGACJI I OKRESÓW
// =====================================================================

function setActiveComparisonPeriodButton(period) {
    document.querySelectorAll('#comparison-segment-control .segment-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.value === period);
    });
}

async function setComparisonPeriod(period) {
    const periodSelect = document.getElementById('comparison-period-select');
    comparisonPeriod = period;
    comparisonReferenceDate = new Date();
    comparisonSelectedYear = new Date().getFullYear();
    if (periodSelect) {
        periodSelect.value = comparisonPeriod;
    }
    syncComparisonYearUI();
    setActiveComparisonPeriodButton(comparisonPeriod);
    await renderUnifiedComparisonChart();
}

function syncComparisonYearUI() {
    const yearSelect = document.getElementById('comparison-year-select');
    const yearLabel = document.getElementById('comparison-year-label');
    if (yearSelect) yearSelect.value = String(comparisonSelectedYear);
    if (yearLabel) yearLabel.textContent = String(comparisonSelectedYear);
}

function canNavigateComparisonRange(step) {
    const today = new Date();

    if (comparisonPeriod === 'week') {
        const nextDate = addDays(comparisonReferenceDate, step * 7);
        return step < 0 || nextDate <= today;
    }

    if (comparisonPeriod === 'month' || comparisonPeriod === '6months') {
        const nextMonth = addMonths(comparisonReferenceDate, step);
        return step < 0 || getMonthStart(nextMonth) <= getMonthStart(today);
    }

    const nextYear = comparisonSelectedYear + step;
    return step < 0 || nextYear <= today.getFullYear();
}

async function changeComparisonRangeByStep(step) {
    if (!canNavigateComparisonRange(step)) return;

    if (comparisonPeriod === 'week') {
        comparisonReferenceDate = addDays(comparisonReferenceDate, step * 7);
    } else if (comparisonPeriod === 'month' || comparisonPeriod === '6months') {
        comparisonReferenceDate = addMonths(comparisonReferenceDate, step);
    } else {
        comparisonSelectedYear += step;
        syncComparisonYearUI();
    }

    await renderUnifiedComparisonChart();
}

function showComparisonBarTooltip(chart, nativeEvent) {
    if (!chart) return;
    const elements = chart.getElementsAtEventForMode(nativeEvent, 'nearest', { intersect: false }, true);
    if (!elements.length) return;
    const activeElements = chart.data.datasets.map((_, datasetIndex) => ({
        datasetIndex,
        index: elements[0].index
    }));
    const position = Chart.helpers.getRelativePosition(nativeEvent, chart);
    chart.setActiveElements(activeElements);
    chart.tooltip.setActiveElements(activeElements, position);
    chart.update();
}

function openComparisonDetailsFromTouchEvent(nativeEvent) {
    if (!longTermBudgetChart) return;
    const elements = longTermBudgetChart.getElementsAtEventForMode(nativeEvent, 'nearest', { intersect: false }, true);
    if (!elements.length) return;
    const bucket = comparisonBucketDetails[elements[0].index];
    comparisonLongPressTriggered = true;
    openComparisonBucketDetails(bucket);
}

// =====================================================================
// GESTY NA EKRANIE DOTYKOWYM
// =====================================================================

function initializeComparisonChartGestures() {
    const chartContainer = document.getElementById('comparison-chart-container');
    const canvas = document.getElementById('comparison-chart');
    if (!chartContainer || !canvas || chartContainer.dataset.gesturesInitialized === 'true') {
        return;
    }

    chartContainer.dataset.gesturesInitialized = 'true';

    chartContainer.addEventListener('touchstart', (event) => {
        const touch = event.touches[0];
        if (!touch) return;
        comparisonTouchMoved = false;
        comparisonSuppressNextClick = false;
        comparisonSwipeStartX = touch.clientX;
        comparisonSwipeStartY = touch.clientY;
        comparisonSwipeLocked = false;
    }, { passive: true });

    chartContainer.addEventListener('touchmove', (event) => {
        const touch = event.touches[0];
        if (!touch || comparisonSwipeLocked) return;
        const deltaX = touch.clientX - comparisonSwipeStartX;
        const deltaY = touch.clientY - comparisonSwipeStartY;
        if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) {
            comparisonTouchMoved = true;
            clearTimeout(comparisonLongPressTimer);
        }
    }, { passive: true });

    chartContainer.addEventListener('touchend', async (event) => {
        const touch = event.changedTouches[0];
        if (!touch || comparisonSwipeLocked) return;

        clearTimeout(comparisonLongPressTimer);

        const deltaX = touch.clientX - comparisonSwipeStartX;
        const deltaY = touch.clientY - comparisonSwipeStartY;

        if (Math.abs(deltaX) >= 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
            comparisonSwipeLocked = true;
            comparisonSuppressNextClick = true;
            setTimeout(() => {
                comparisonSuppressNextClick = false;
            }, 400);
            await changeComparisonRangeByStep(deltaX < 0 ? 1 : -1);
        }
    }, { passive: true });

    canvas.addEventListener('touchstart', (event) => {
        comparisonLongPressTriggered = false;
        comparisonTouchMoved = false;
        clearTimeout(comparisonLongPressTimer);
        comparisonLongPressTimer = setTimeout(() => {
            openComparisonDetailsFromTouchEvent(event);
        }, 450);
    }, { passive: true });

    canvas.addEventListener('click', (event) => {
        if (!comparisonSuppressNextClick && !comparisonTouchMoved) return;
        event.preventDefault();
        event.stopPropagation();
        comparisonSuppressNextClick = false;
    }, true);

    ['touchend', 'touchcancel'].forEach(eventName => {
        canvas.addEventListener(eventName, () => {
            clearTimeout(comparisonLongPressTimer);
            if (comparisonTouchMoved) {
                comparisonSuppressNextClick = true;
                setTimeout(() => {
                    comparisonSuppressNextClick = false;
                }, 400);
            }
        }, { passive: true });
    });
}

// =====================================================================
// INICJALIZACJA EVENT LISTENERÓW
// =====================================================================

function initializeComparisonPeriodControls() {
    const periodSelect = document.getElementById('comparison-period-select');
    const yearSelect = document.getElementById('comparison-year-select');
    const yearPopup = document.getElementById('comparison-year-popup');
    const yearLabel = document.getElementById('comparison-year-label');
    const yearButton = document.getElementById('comparison-year-dropdown-btn');
    const categoryButton = document.getElementById('analysis-filter-category-btn');
    const subCategoryButton = document.getElementById('analysis-filter-subcategory-btn');
    const clearCategoryButton = document.getElementById('analysis-filter-category-clear');
    const modeToggle = document.getElementById('comparison-mode-toggle');

    if (!periodSelect || !yearSelect || !yearPopup || !yearLabel || !yearButton || !modeToggle) {
        return;
    }

    if (periodSelect.dataset.initialized === 'true') {
        return;
    }
    periodSelect.dataset.initialized = 'true';

    const refreshYearOptions = () => {
        yearSelect.innerHTML = comparisonAvailableYears.map(year => `<option value="${year}">${year}</option>`).join('');
        syncComparisonYearUI();
        yearPopup.innerHTML = comparisonAvailableYears.map(year => `
            <button class="year-option-btn w-full text-center px-3 py-2 rounded-lg text-sm text-white hover:bg-white/10 transition-colors" data-value="${year}">
                ${year}
            </button>
        `).join('');

        yearPopup.querySelectorAll('.year-option-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                event.stopPropagation();
                comparisonSelectedYear = parseInt(button.dataset.value, 10);
                syncComparisonYearUI();
                yearPopup.classList.add('hidden');
                await renderUnifiedComparisonChart();
            });
        });
    };

    document.querySelectorAll('#comparison-segment-control .segment-btn').forEach(button => {
        button.addEventListener('click', async () => {
            await setComparisonPeriod(button.dataset.value);
        });
    });

    yearButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (comparisonPeriod !== 'year') return;
        yearPopup.classList.toggle('hidden');
    });

    document.addEventListener('click', (event) => {
        if (!yearPopup.contains(event.target) && !yearButton.contains(event.target)) {
            yearPopup.classList.add('hidden');
        }
    });

    yearSelect.addEventListener('change', async (event) => {
        comparisonSelectedYear = parseInt(event.target.value, 10);
        syncComparisonYearUI();
        await renderUnifiedComparisonChart();
    });

    modeToggle.addEventListener('change', async () => {
        await renderUnifiedComparisonChart();
    });

    categoryButton?.addEventListener('click', () => {
        const parents = getComparisonParentCategories();
        if (!parents.length) return;

        openSelectionDrawer('Wybierz kategorie', parents.map(parent => ({
            value: parent.id,
            label: parent.name,
            icon: `<i class="fas ${parent.icon || 'fa-tag'}"></i>`,
            color: (parent.color || '#64748b') + '20'
        })), async (parentId) => {
            const parent = parents.find(category => category.id === parentId);
            currentComparisonCategory = parent ? parent.name : null;
            currentComparisonSubCategory = null;
            updateComparisonControlsVisibility();
            updateComparisonCategoryFilterUI();
            await renderUnifiedComparisonChart();
        }, getComparisonSelectedParentCategory()?.id || null, 'grid', false, true);
    });

    subCategoryButton?.addEventListener('click', () => {
        const parentCategory = getComparisonSelectedParentCategory();
        const subCategories = getComparisonSubCategories();
        if (!parentCategory || !subCategories.length) return;

        openSelectionDrawer(`${parentCategory.name} -> Podkategoria`, [
            { value: '', label: 'Wszystkie podkategorie' },
            ...subCategories.map(subCategory => ({
                value: subCategory.id,
                label: subCategory.name,
                icon: `<i class="fas ${subCategory.icon || parentCategory.icon || 'fa-tag'}"></i>`,
                color: (parentCategory.color || '#64748b') + '20'
            }))
        ], async (subCategoryId) => {
            const selectedSubCategory = subCategories.find(category => category.id === subCategoryId);
            currentComparisonSubCategory = selectedSubCategory ? selectedSubCategory.name : null;
            updateComparisonCategoryFilterUI();
            await renderUnifiedComparisonChart();
        }, getComparisonSelectedSubCategory()?.id || '', 'grid', false, true);
    });

    clearCategoryButton?.addEventListener('click', async (event) => {
        event.stopPropagation();
        currentComparisonCategory = null;
        currentComparisonSubCategory = null;
        updateComparisonCategoryFilterUI();
        await renderUnifiedComparisonChart();
    });

    document.getElementById('comparison-nav-prev')?.addEventListener('click', () => changeComparisonRangeByStep(-1));
    document.getElementById('comparison-nav-next')?.addEventListener('click', () => changeComparisonRangeByStep(1));

    periodSelect.value = comparisonPeriod || '6months';
    comparisonPeriod = periodSelect.value || '6months';
    setActiveComparisonPeriodButton(comparisonPeriod);
    refreshYearOptions();
    initializeComparisonChartGestures();
}

// =====================================================================
// FILTRY TAGÓW
// =====================================================================

/**
 * Aktualizuje wygląd przycisku filtra tagów bez dodawania listenerów.
 */
function updateAnalysisTagFilterUI() {
    const labelEl = document.getElementById('analysis-filter-tags-label');
    const button = document.getElementById('analysis-filter-tags-btn');
    const indicatorEl = document.getElementById('analysis-filter-tags-indicator');
    if (!labelEl || !button) return;

    const summary = buildTagsSummary(currentComparisonTags);
    const isActive = summary !== 'Wybierz tagi...';
    labelEl.textContent = isActive ? summary : 'Wszystkie tagi';
    button.title = isActive ? `Tagi: ${summary}` : 'Filtr tagow';
    button.classList.toggle('border-brand-500', isActive);
    button.classList.toggle('text-white', isActive);
    button.classList.toggle('bg-brand-500/15', isActive);
    button.classList.toggle('shadow-[0_10px_30px_rgba(79,70,229,0.22)]', isActive);
    button.classList.toggle('text-gray-300', !isActive);
    button.classList.toggle('bg-white/5', !isActive);
    button.classList.toggle('shadow-sm', !isActive);
    indicatorEl?.classList.toggle('hidden', !isActive);
}

/**
 * Inicjalizuje listener dla przycisku tagów (wywoływane raz).
 */
function initializeAnalysisTagFilter() {
    const button = document.getElementById('analysis-filter-tags-btn');
    if (!button || button.dataset.initialized === 'true') return;
    button.dataset.initialized = 'true';

    button.addEventListener('click', () => {
        openTagsDrawer(currentComparisonTags, async (newTags) => {
            currentComparisonTags = newTags;
            updateAnalysisTagFilterUI();
            await renderUnifiedComparisonChart();
        }, true);
    });
}

// =====================================================================
// GŁÓWNA FUNKCJA INICJALIZACYJNA
// =====================================================================

export async function initializeLongTermBudget() {
    if (longTermBudgetInitialized) return;

    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }

    await ensureComparisonAvailableMonths();
    initializeComparisonPeriodControls();
    initializeAnalysisTagFilter();
    initAnalysisAiInsightButton();
    updateAnalysisTagFilterUI();

    longTermBudgetInitialized = true;
    await renderUnifiedComparisonChart();
}

/**
 * Publiczny alias dla updateAnalysisTagFilterUI używany przez inne moduły.
 */
export function renderAnalysisTagFilterButton() {
    updateAnalysisTagFilterUI();
}

export { renderUnifiedComparisonChart };
