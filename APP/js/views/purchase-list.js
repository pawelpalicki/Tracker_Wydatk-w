/**
 * Widok listy zakupow po Etapie 3.
 * Odpowiada za render kart zakupow, rozwiniecie szczegolow, edycje/usuwanie,
 * filtry oraz paginacje infinite scroll.
 */
import state from '../core/state.js';
import { apiCall } from '../core/api.js';
import { formatAmount } from '../shared/format.js';
import { openSelectionDrawer } from '../shared/ui.js';
import Drawer from '../shared/drawer.js';
import { openHierarchicalCategoryDrawer } from '../shared/categories.js';
import { getTagGroups, getTagGroupLabel, getTagLabel } from '../shared/tags.js';
import { fetchInitialData } from '../core/data-loader.js';
import { enterEditMode } from './purchase-form.js';

let purchaseListInitialized = false;
let filtersInitialized = false;
let currentFilterType = null;
let currentFilterOnApply = null;

function el(id) {
    return document.getElementById(id);
}

// Delegacja klikniec zostaje na kontenerze listy, dzieki czemu dziala tez dla kolejnych stron.
export function initPurchaseList() {
    if (purchaseListInitialized) return;
    purchaseListInitialized = true;

    el('purchases-list')?.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-purchase-btn');
        if (editBtn) {
            const purchaseId = e.target.closest('[data-purchase-id]')?.dataset.purchaseId;
            if (purchaseId) enterEditMode(purchaseId);
            return;
        }

        const deleteBtn = e.target.closest('.delete-purchase-btn');
        if (deleteBtn) {
            const purchaseId = e.target.closest('[data-purchase-id]')?.dataset.purchaseId;
            if (!purchaseId) return;
            if (confirm('Czy na pewno chcesz usunac ten zakup? Operacja jest nieodwracalna.')) {
                const originalContent = deleteBtn.innerHTML;
                try {
                    deleteBtn.disabled = true;
                    deleteBtn.innerHTML = '<i class="fas fa-spinner animate-spin"></i>';
                    await apiCall(`/api/purchases/${purchaseId}`, 'DELETE');
                    await fetchInitialData(false);
                } catch (error) {
                    alert('Nie udalo sie usunac zakupu: ' + error.message);
                    deleteBtn.disabled = false;
                    deleteBtn.innerHTML = originalContent;
                }
            }
            return;
        }

        const header = e.target.closest('.purchase-header');
        if (header) {
            const itemsDiv = header.nextElementSibling;
            itemsDiv?.classList.toggle('hidden');
            header.querySelector('.toggle-arrow')?.classList.toggle('rotate-180');
        }
    });

    addEventListener('scroll', handleInfiniteScroll);
    initPurchaseListFilters();
}

// Filtry trzymaja wartosci w core/state.js, a UI filtrow jest budowany na podstawie aktualnych danych.
export function initPurchaseListFilters() {
    if (filtersInitialized) return;
    filtersInitialized = true;

    const categoryBtn = el('filter-category-btn');
    const budgetBtn = el('filter-budget-btn');
    const shopBtn = el('filter-shop-btn');
    const dateBtn = el('filter-date-btn');
    const amountBtn = el('filter-amount-btn');
    const keywordInput = el('filter-keyword');
    const clearBtn = el('clear-filters-btn');

    const categoryClear = categoryBtn?.querySelector('.filter-clear');
    const budgetClear = budgetBtn?.querySelector('.filter-clear');
    const shopClear = shopBtn?.querySelector('.filter-clear');
    const dateClear = dateBtn?.querySelector('.filter-clear');
    const amountClear = amountBtn?.querySelector('.filter-clear');

    const setFilterButtonState = (btn, clearEl, active) => {
        if (!btn) return;
        btn.classList.toggle('border-brand-500/50', active);
        btn.classList.toggle('bg-brand-500/10', active);
        clearEl?.classList.toggle('hidden', !active);
    };

    categoryBtn?.addEventListener('click', () => {
        openHierarchicalCategoryDrawer(
            null,
            state.filterCategoryValue || '',
            state.filterSubCategoryValue || '',
            (parentName, subName) => {
                state.filterCategoryValue = parentName || '';
                state.filterSubCategoryValue = subName || '';
                const labelText = parentName ? (subName ? `${parentName} / ${subName}` : parentName) : 'Kategoria';
                const label = el('filter-category-label');
                if (label) label.textContent = labelText;
                setFilterButtonState(categoryBtn, categoryClear, !!parentName);
                handleFilterChange();
            }
        );
    });

    budgetBtn?.addEventListener('click', () => {
        const options = [
            { value: '', label: 'Wszystkie budzety' },
            { value: 'monthly', label: 'Budzet miesieczny' }
        ];
        state.allSpecialBudgets.forEach(budget => options.push({ value: budget.id, label: budget.name }));
        openSelectionDrawer('Wybierz budzet', options, (value, label) => {
            state.filterBudgetValue = value;
            const labelEl = el('filter-budget-label');
            if (labelEl) labelEl.textContent = value ? label : 'Budzet';
            setFilterButtonState(budgetBtn, budgetClear, !!value);
            handleFilterChange();
        }, state.filterBudgetValue || '');
    });

    shopBtn?.addEventListener('click', () => {
        const options = [{ value: '', label: 'Wszystkie sklepy' }];
        state.allShops.forEach(shop => options.push({ value: shop, label: shop }));
        openSelectionDrawer('Wybierz sklep', options, (value, label) => {
            state.filterShopValue = value;
            const labelEl = el('filter-shop-label');
            if (labelEl) labelEl.textContent = value ? label : 'Sklep';
            setFilterButtonState(shopBtn, shopClear, !!value);
            handleFilterChange();
        }, state.filterShopValue || '');
    });

    dateBtn?.addEventListener('click', () => {
        openFilterDrawer('Wybierz zakres dat', 'date', () => {
            const active = !!(state.filterDateStart || state.filterDateEnd);
            const labelEl = el('filter-date-label');
            if (labelEl) labelEl.textContent = active ? 'Data (ustawiona)' : 'Data';
            setFilterButtonState(dateBtn, dateClear, active);
            handleFilterChange();
        });
    });

    amountBtn?.addEventListener('click', () => {
        openFilterDrawer('Wybierz zakres kwot', 'amount', () => {
            const active = !!(state.filterMinAmount || state.filterMaxAmount);
            const labelEl = el('filter-amount-label');
            if (labelEl) labelEl.textContent = active ? 'Kwota (ustawiona)' : 'Kwota';
            setFilterButtonState(amountBtn, amountClear, active);
            handleFilterChange();
        });
    });

    const clearFilterValue = (type) => {
        if (type === 'category') {
            state.filterCategoryValue = '';
            state.filterSubCategoryValue = '';
            setText('filter-category-label', 'Kategoria');
            setFilterButtonState(categoryBtn, categoryClear, false);
        } else if (type === 'budget') {
            state.filterBudgetValue = '';
            setText('filter-budget-label', 'Budzet');
            setFilterButtonState(budgetBtn, budgetClear, false);
        } else if (type === 'shop') {
            state.filterShopValue = '';
            setText('filter-shop-label', 'Sklep');
            setFilterButtonState(shopBtn, shopClear, false);
        } else if (type === 'date') {
            state.filterDateStart = '';
            state.filterDateEnd = '';
            setText('filter-date-label', 'Data');
            setFilterButtonState(dateBtn, dateClear, false);
        } else if (type === 'amount') {
            state.filterMinAmount = '';
            state.filterMaxAmount = '';
            setText('filter-amount-label', 'Kwota');
            setFilterButtonState(amountBtn, amountClear, false);
        }
        handleFilterChange();
    };

    [
        [categoryClear, 'category'],
        [budgetClear, 'budget'],
        [shopClear, 'shop'],
        [dateClear, 'date'],
        [amountClear, 'amount']
    ].forEach(([clearEl, type]) => {
        clearEl?.addEventListener('click', (e) => {
            e.stopPropagation();
            clearFilterValue(type);
        });
    });

    keywordInput?.addEventListener('input', () => handleFilterChange());
    clearBtn?.addEventListener('click', () => {
        if (keywordInput) keywordInput.value = '';
        state.filterCategoryValue = '';
        state.filterSubCategoryValue = '';
        state.filterBudgetValue = '';
        state.filterShopValue = '';
        state.filterDateStart = '';
        state.filterDateEnd = '';
        state.filterMinAmount = '';
        state.filterMaxAmount = '';

        const labels = {
            'filter-category-label': 'Kategoria',
            'filter-budget-label': 'Budzet',
            'filter-shop-label': 'Sklep',
            'filter-date-label': 'Data',
            'filter-amount-label': 'Kwota'
        };
        Object.entries(labels).forEach(([id, text]) => {
            setText(id, text);
            const btn = el(id)?.parentElement;
            btn?.classList.remove('border-brand-500/50', 'bg-brand-500/10');
        });

        document.querySelectorAll('.filter-clear').forEach(clear => clear.classList.add('hidden'));
        handleFilterChange();
    });


}

function setText(id, text) {
    const node = el(id);
    if (node) node.textContent = text;
}

export function openFilterDrawer(title, type, onApply) {
    let content = '';

    if (type === 'date') {
        const startVal = state.filterDateStart || '';
        const endVal = state.filterDateEnd || '';
        content = `
            <div class="space-y-4">
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Data od</label>
                    <input type="date" id="drawer-date-start" value="${startVal}" class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Data do</label>
                    <input type="date" id="drawer-date-end" value="${endVal}" class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
            </div>
        `;
    } else if (type === 'amount') {
        const minVal = state.filterMinAmount || '';
        const maxVal = state.filterMaxAmount || '';
        content = `
            <div class="space-y-4">
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Kwota minimalna</label>
                    <input type="number" id="drawer-min-amount" value="${minVal}" placeholder="0.00" step="0.01" class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Kwota maksymalna</label>
                    <input type="number" id="drawer-max-amount" value="${maxVal}" placeholder="Brak limitu" step="0.01" class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
            </div>
        `;
    }

    Drawer.open({
        title,
        content,
        size: 'sm',
        confirmLabel: 'Zastosuj',
        cancelLabel: 'Anuluj',
        onConfirm: () => {
            if (type === 'date') {
                state.filterDateStart = el('drawer-date-start')?.value || '';
                state.filterDateEnd = el('drawer-date-end')?.value || '';
            } else if (type === 'amount') {
                state.filterMinAmount = el('drawer-min-amount')?.value || '';
                state.filterMaxAmount = el('drawer-max-amount')?.value || '';
            }
            if (typeof onApply === 'function') onApply();
            Drawer.close();
        },
        triggerId: type === 'date' ? 'filter-date-btn' : 'filter-amount-btn',
    });
}

export function closeFilterDrawer() {
    Drawer.close();
}

export const handleInfiniteScroll = () => {
    if (!el('list-tab')?.classList.contains('active')) return;
    if ((innerHeight + scrollY) >= document.body.offsetHeight - 200) {
        fetchMorePurchases();
    }
};

export async function handleFilterChange() {
    const queryString = getFilterQueryParams();

    if (!queryString) {
        addEventListener('scroll', handleInfiniteScroll);
        await loadInitialPurchases();
        if (state.structuredCategories.length === 0 && state.allCategories.length > 0) {
            const refetchedStructuredCategories = await apiCall('/api/categories/v2');
            if (Array.isArray(refetchedStructuredCategories) && refetchedStructuredCategories.length > 0) {
                state.structuredCategories = refetchedStructuredCategories;
            }
        }
        return;
    }

    removeEventListener('scroll', handleInfiniteScroll);
    state.isLoadingPurchases = true;
    const list = el('purchases-list');
    if (list) list.innerHTML = '<div class="text-center py-12">Filtrowanie...</div>';

    try {
        const { purchases } = await apiCall(`/api/purchases?${queryString}`);
        state.allPurchases = purchases || [];
        state.nextPurchaseCursor = null;
        renderPurchasesList(state.allPurchases, false);
    } catch (error) {
        console.error('Blad podczas filtrowania zakupow:', error);
        if (list) list.innerHTML = '<div class="text-center py-12 text-red-500">Wystapil blad podczas filtrowania.</div>';
    } finally {
        state.isLoadingPurchases = false;
    }
}

// Jedno miejsce budowania query stringa dla pierwszego ladowania, filtrowania i kolejnych stron.
export function getFilterQueryParams() {
    const params = new URLSearchParams();
    const keyword = el('filter-keyword')?.value;
    if (keyword) params.append('keyword', keyword);
    if (state.filterCategoryValue) params.append('category', state.filterCategoryValue);
    if (state.filterSubCategoryValue) params.append('subCategory', state.filterSubCategoryValue);
    if (state.filterBudgetValue) params.append('budget', state.filterBudgetValue);
    if (state.filterShopValue) params.append('shop', state.filterShopValue);

    if (state.filterDateStart) params.append('startDate', state.filterDateStart);
    if (state.filterDateEnd) params.append('endDate', state.filterDateEnd);

    if (state.filterMinAmount) params.append('minAmount', state.filterMinAmount);
    if (state.filterMaxAmount) params.append('maxAmount', state.filterMaxAmount);

    return params.toString();
}

export async function loadInitialPurchases() {
    state.isLoadingPurchases = true;
    removeEventListener('scroll', handleInfiniteScroll);
    try {
        const query = getFilterQueryParams();
        const suffix = query ? `?${query}` : '';
        const { purchases, nextCursor } = await apiCall(`/api/purchases${suffix}`);
        state.allPurchases = purchases || [];
        state.nextPurchaseCursor = nextCursor || null;
        renderPurchasesList(state.allPurchases);
        if (state.nextPurchaseCursor) {
            addEventListener('scroll', handleInfiniteScroll);
        }
    } catch (error) {
        console.error('Blad ladowania poczatkowych zakupow:', error);
    } finally {
        state.isLoadingPurchases = false;
    }
}

export async function fetchMorePurchases() {
    if (state.isLoadingPurchases || !state.nextPurchaseCursor) return;

    state.isLoadingPurchases = true;
    try {
        const query = getFilterQueryParams();
        const queryPart = query ? `&${query}` : '';
        const { purchases, nextCursor } = await apiCall(`/api/purchases?lastVisible=${state.nextPurchaseCursor}${queryPart}`);
        if (purchases && purchases.length > 0) {
            state.allPurchases.push(...purchases);
            renderPurchasesList(purchases, true);
        }
        state.nextPurchaseCursor = nextCursor || null;
        if (!state.nextPurchaseCursor) {
            removeEventListener('scroll', handleInfiniteScroll);
        }
    } catch (error) {
        console.error('Blad doladowywania zakupow:', error);
    } finally {
        state.isLoadingPurchases = false;
    }
}

export function renderPurchasesList(purchasesToRender, append = false) {
    const list = el('purchases-list');
    if (!list) return;

    if (!append) list.innerHTML = '';
    if (purchasesToRender.length === 0 && !append) {
        list.innerHTML = '<div class="text-center py-12"><svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg><h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Brak zakupow</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Brak wynikow dla podanych kryteriow.</p></div>';
        return;
    }

    const newContent = purchasesToRender.map(renderPurchaseCard).join('');
    if (append) {
        list.insertAdjacentHTML('beforeend', newContent);
    } else {
        list.innerHTML = newContent;
    }
}

function renderPurchaseCard(purchase) {
    const specialBudgetName = purchase.specialBudgetId ? (state.allSpecialBudgets.find(b => b.id === purchase.specialBudgetId) || {}).name : null;
    const budgetIcon = specialBudgetName
        ? `<p class="text-xs text-brand-400 mb-1 flex items-center gap-1">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a1 1 0 011-1h5a.997.997 0 01.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>
             <span>${specialBudgetName}</span>
           </p>`
        : '';

    return `
        <div class="glass-card rounded-2xl mb-4" data-purchase-id="${purchase.id}">
            <div class="purchase-header p-4 cursor-pointer">
                ${budgetIcon ? `<div class="mb-3 w-full border-b border-white/5 pb-1">${budgetIcon}</div>` : ''}
                <div class="flex items-end w-full">
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-end w-full mb-1">
                            <span class="font-bold text-lg text-white truncate pr-2 leading-none">${purchase.shop}</span>
                            <span class="font-bold text-xl text-white whitespace-nowrap leading-none">${formatAmount(purchase.totalAmount || 0)}</span>
                        </div>
                        <div class="flex justify-between items-end w-full">
                            <span class="text-sm text-gray-400 leading-none">${purchase.date}</span>
                            <div class="flex items-center gap-2 shrink-0 leading-none">
                                <span class="text-[10px] text-gray-500 uppercase tracking-tighter">${(purchase.items || []).length} poz.</span>
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 toggle-arrow text-gray-500 transition-transform transform" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="purchase-items hidden p-4 space-y-4 bg-white/5 rounded-b-2xl border-t border-white/5">
                ${renderPurchaseTags(purchase)}
                <div class="space-y-4">
                    ${(purchase.items || []).map(renderPurchaseItem).join('')}
                </div>
                <div class="flex gap-3 pt-2 mt-2 border-t border-white/5">
                    <button class="edit-purchase-btn flex-1 py-2.5 px-5 bg-white/5 hover:bg-white/10 text-brand-400 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm font-medium">
                        <i class="fas fa-edit"></i>
                        <span>Edytuj</span>
                    </button>
                    <button class="delete-purchase-btn flex-1 py-2.5 px-5 bg-white/5 hover:bg-white/10 text-red-500 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm font-medium">
                        <i class="fas fa-trash-alt"></i>
                        <span>Usun</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderPurchaseTags(purchase) {
    if (!purchase.tags || Object.keys(purchase.tags).length === 0) return '';

    return `
        <div class="flex flex-wrap gap-4 px-4 py-3 bg-white/5 border-t border-white/5 rounded-xl border border-white/10 mb-4">
            ${getTagGroups().map(group => {
                const val = purchase.tags[group];
                if (!val) return '';
                const groupLabel = String(getTagGroupLabel(group) || group || '');
                const tagLabel = getTagLabel(group, val) || val;
                return `
                    <div class="flex flex-col">
                        <span class="text-[10px] text-gray-500 uppercase tracking-widest">${groupLabel.charAt(0)}</span>
                        <span class="text-xs text-white font-medium">${tagLabel}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderPurchaseItem(item) {
    const catName = item.category || 'Inne';
    const subName = item.subCategory || '';
    const parentCat = state.structuredCategories.find(c => c.name === catName && !c.parentId);
    const subCat = parentCat ? state.structuredCategories.find(c => c.name === subName && c.parentId === parentCat.id) : null;
    const icon = (subCat && subCat.icon) || (parentCat && parentCat.icon) || 'fa-tag';
    const color = (parentCat && parentCat.color) || '#6b7280';
    const labelText = subName ? `${catName} / ${subName}` : catName;
    const itemTagsHtml = getTagGroups().map(group => {
        const val = item.tags && item.tags[group];
        if (!val) return '';
        const groupLabel = String(getTagGroupLabel(group) || group || '');
        const tagLabel = getTagLabel(group, val) || val;
        return `<span class="text-[10px] text-gray-500">${groupLabel.charAt(0)}: <span class="text-gray-300">${tagLabel}</span></span>`;
    }).join(' ');

    return `
        <div class="flex justify-between items-end py-1 border-b border-white/5 last:border-0 text-sm">
            <div class="flex flex-col">
                <div class="flex items-center gap-2 mb-1">
                    <div class="w-5 h-5 rounded flex items-center justify-center text-[10px]" style="background-color: ${color}20; color: ${color}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <span class="text-[10px] text-gray-400 tracking-tight">${labelText}</span>
                </div>
                <div class="font-semibold text-white">${item.name}</div>
                ${itemTagsHtml ? `<div class="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">${itemTagsHtml}</div>` : ''}
            </div>
            <div class="font-bold text-white whitespace-nowrap text-base">${formatAmount(item.price || 0)}</div>
        </div>
    `;
}
