// views/special-budgets.js — Budżety Specjalne (ES Module)
//
// Zawiera logikę wyświetlania, edytowania i usuwania budżetów specjalnych
// z wykresami doughnut pokazującymi rozkład wydatków.

import state from '../core/state.js';
import { apiCall } from '../core/api.js';
import { formatAmount } from '../shared/format.js';
import { openOverlay, closeOverlay } from '../shared/ui.js';

// =====================================================================
// STAN LOKALNY MODUŁU
// =====================================================================

let specialBudgetCharts = {};
let editingSpecialBudgetId = null;
let specialBudgetsInitialized = false;

function el(id) {
    return document.getElementById(id);
}

/**
 * Inicjalizuje listenery dla widoku budżetów specjalnych.
 * Wywoływana raz przy starcie aplikacji.
 */
export function initSpecialBudgets() {
    if (specialBudgetsInitialized) return;

    el('add-special-budget-form')?.addEventListener('submit', handleAddSpecialBudget);
    el('special-budgets-list')?.addEventListener('click', handleSpecialBudgetActions);
    el('edit-special-budget-form')?.addEventListener('submit', handleEditSpecialBudgetSubmit);
    
    el('close-edit-special-budget-modal')?.addEventListener('click', () => closeOverlay('edit-special-budget-modal'));
    el('cancel-edit-special-budget')?.addEventListener('click', () => closeOverlay('edit-special-budget-modal'));
    
    // Zamknięcie modala przez kliknięcie w overlay
    el('edit-special-budget-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'edit-special-budget-modal') {
            closeOverlay('edit-special-budget-modal');
        }
    });

    specialBudgetsInitialized = true;
}

// =====================================================================
// RENDEROWANIE WIDOKU GŁÓWNEGO
// =====================================================================

export function renderSpecialBudgetsTab() {
    const tabContent = document.getElementById('special-budgets-tab');
    if (!tabContent) return;

    // Zniszcz istniejące instancje wykresów, aby uniknąć wycieków pamięci
    Object.values(specialBudgetCharts).forEach(chart => chart.destroy());
    specialBudgetCharts = {};

    if (!state.allSpecialBudgets || state.allSpecialBudgets.length === 0) {
        tabContent.innerHTML = `
            <div class="text-center py-12 px-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-16 w-16 text-gray-500 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <h3 class="text-lg font-bold text-white mb-2">Brak budżetów specjalnych</h3>
                <p class="text-sm text-gray-400 mb-8 max-w-xs mx-auto">Zdefiniuj cele oszczędnościowe lub limity na konkretne okazje w ustawieniach.</p>
                <div class="flex justify-center">
                    <button onclick="switchTab('settings-special')" class="px-8 py-3.5 btn-primary rounded-xl text-sm font-bold transition-all active:scale-95 shadow-xl">
                        Dodaj budżet specjalny
                    </button>
                </div>
            </div>
        `;
        return;
    }

    const budgetsWithData = state.allSpecialBudgets.map(budget => {
        const budgetPurchases = state.allPurchases.filter(p => p.specialBudgetId === budget.id);
        const spent = budgetPurchases.reduce((sum, p) => sum + p.totalAmount, 0);
        const remaining = budget.amount - spent;
        const progress = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

        const spendingByCategory = budgetPurchases
            .flatMap(p => p.items || [])
            .reduce((acc, item) => {
                const category = item.category || 'inne';
                acc[category] = (acc[category] || 0) + (item.price || 0);
                return acc;
            }, {});

        return { ...budget, spent, remaining, progress, spendingByCategory };
    });

    const budgetCards = budgetsWithData.map(budget => {
        const hasSpending = Object.keys(budget.spendingByCategory).length > 0;
        return `
            <div class="bg-[#141414] border border-white/5 rounded-2xl shadow-xl p-6 flex flex-col justify-between">
                <div>
                    <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">${budget.name}</h3>
                    <div class="mb-2">
                        <div class="flex justify-between mb-1">
                            <span class="text-base font-medium text-gray-700 dark:text-gray-300">Postęp</span>
                            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">${budget.progress.toFixed(0)}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                            <div class="bg-brand-400 h-4 rounded-full" style="width: ${budget.progress}%"></div>
                        </div>
                    </div>
                    <div class="mt-4 grid grid-cols-3 gap-4 text-center">
                        <div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Budżet</p>
                            <p class="text-lg font-bold text-gray-900 dark:text-white">${formatAmount(budget.amount)}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Wydano</p>
                            <p class="text-lg font-bold text-brand-500 dark:text-brand-400">${formatAmount(budget.spent)}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Pozostało</p>
                            <p class="text-lg font-bold text-green-600 dark:text-green-400">${formatAmount(budget.remaining)}</p>
                        </div>
                    </div>
                </div>
                <div class="mt-6 h-48 flex items-center justify-center">
                    ${hasSpending ? `<canvas id="chart-special-${budget.id}"></canvas>` : '<p class="text-sm text-gray-500 dark:text-gray-400">Brak wydatków w tym budżecie.</p>'
            }
                </div>
            </div>
        `;
    }).join('');

    const header = `
        <div class="flex justify-between items-center mb-6 max-w-4xl mx-auto px-4">
            <h2 class="text-2xl font-bold text-white">Budżety Specjalne</h2>
            <button onclick="switchTab('settings-special')" class="flex items-center space-x-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-brand-400 transition-all text-xs font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
                <span>Zarządzaj</span>
            </button>
        </div>
    `;

    tabContent.innerHTML = `
        <div class="py-4">
            ${header}
            <div class="flex justify-center">
                <div class="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 pb-20">
                    ${budgetCards}
                </div>
            </div>
        </div>
    `;

    // Renderuj wykresy po dodaniu canvasów do DOM
    budgetsWithData.forEach(budget => {
        if (Object.keys(budget.spendingByCategory).length > 0) {
            const ctx = document.getElementById(`chart-special-${budget.id}`)?.getContext('2d');
            if (!ctx) return;

            const chartData = Object.entries(budget.spendingByCategory);

            specialBudgetCharts[budget.id] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: chartData.map(d => d[0]),
                    datasets: [{
                        data: chartData.map(d => d[1]),
                        backgroundColor: chartData.map(d => {
                            const pCat = Array.isArray(state.structuredCategories)
                                ? state.structuredCategories.find(c => c.name === d[0] && !c.parentId)
                                : null;
                            return (pCat && pCat.color) || '#6b7280';
                        }),
                        borderColor: '#4a5568',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#d1d5db',
                                boxWidth: 12,
                                padding: 15
                            }
                        }
                    }
                }
            });
        }
    });
}

// =====================================================================
// LISTA BUDŻETÓW W USTAWIENIACH
// =====================================================================

export function renderSpecialBudgetsList() {
    const specialBudgetsList = document.getElementById('special-budgets-list');
    if (!specialBudgetsList) return;

    specialBudgetsList.innerHTML = '';
    if (!state.allSpecialBudgets || state.allSpecialBudgets.length === 0) {
        specialBudgetsList.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm">Brak budżetów specjalnych. Dodaj nowy poniżej.</p>`;
        return;
    }

    state.allSpecialBudgets.forEach(budget => {
        const budgetEl = document.createElement('div');
        budgetEl.className = 'w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all group';
        budgetEl.innerHTML = `
            <div>
                <span class="font-medium text-white">${budget.name}</span>
                <span class="text-sm text-gray-400 ml-2">${formatAmount(budget.amount)}</span>
            </div>
            <div class="flex items-center space-x-2">
                <button class="edit-special-budget-btn p-1 text-brand-400 hover:text-brand-300" data-id="${budget.id}" title="Edytuj">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"></path></svg>
                </button>
                <button class="delete-special-budget-btn p-1 text-red-500 hover:text-red-700" data-id="${budget.id}" title="Usuń">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
        specialBudgetsList.appendChild(budgetEl);
    });
}

// =====================================================================
// OBSŁUGA FORMULARZY I AKCJI
// =====================================================================

export async function handleAddSpecialBudget(e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const nameInput = el('new-special-budget-name');
    const amountInput = el('new-special-budget-amount');
    const name = nameInput?.value.trim();
    const amount = parseFloat(amountInput?.value);

    if (name && amount > 0) {
        const originalText = submitBtn.innerHTML;
        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i> Zapisywanie...';
            
            await apiCall('/api/special-budgets', 'POST', { name, amount });
            
            if (nameInput) nameInput.value = '';
            if (amountInput) amountInput.value = '';
            
            // fetchInitialData odświeża stan i wywołuje renderowanie
            if (typeof window.fetchInitialData === 'function') {
                await window.fetchInitialData(false);
            }
        } catch (error) {
            alert('Nie udało się dodać budżetu specjalnego: ' + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

export async function handleSpecialBudgetActions(e) {
    const deleteBtn = e.target.closest('.delete-special-budget-btn');
    if (deleteBtn) {
        const budgetId = deleteBtn.dataset.id;
        const budget = state.allSpecialBudgets.find(b => b.id === budgetId);
        if (confirm(`Czy na pewno chcesz usunąć budżet "${budget.name}"?`)) {
            const originalContent = deleteBtn.innerHTML;
            try {
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<i class="fas fa-spinner animate-spin"></i>';
                await apiCall(`/api/special-budgets/${budgetId}`, 'DELETE');
                if (typeof window.fetchInitialData === 'function') {
                    await window.fetchInitialData(false);
                }
            } catch (error) {
                alert('Nie udało się usunąć budżetu: ' + error.message);
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = originalContent;
            }
        }
        return;
    }

    const editBtn = e.target.closest('.edit-special-budget-btn');
    if (editBtn) {
        const budgetId = editBtn.dataset.id;
        const budget = state.allSpecialBudgets.find(b => b.id === budgetId);
        if (budget) {
            editingSpecialBudgetId = budgetId;
            const editNameInput = el('edit-special-budget-name');
            const editAmountInput = el('edit-special-budget-amount');
            if (editNameInput) editNameInput.value = budget.name;
            if (editAmountInput) editAmountInput.value = budget.amount;
            openOverlay('edit-special-budget-modal');
        }
    }
}

export function populateBudgetTypeSelect() {
    state.budgetTypeSelectValue = 'monthly';
    if (typeof window.setPurchaseBudgetType === 'function') {
        window.setPurchaseBudgetType('monthly');
    }
    const label = document.getElementById('budget-type-label');
    if (label) {
        label.textContent = 'Budżet miesięczny';
    }
}

export async function handleEditSpecialBudgetSubmit(e) {
    e.preventDefault();
    if (!editingSpecialBudgetId) return;

    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const editNameInput = el('edit-special-budget-name');
    const editAmountInput = el('edit-special-budget-amount');
    const name = editNameInput?.value.trim();
    const amount = parseFloat(editAmountInput?.value);

    if (name && amount > 0) {
        const originalText = submitBtn.innerHTML;
        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i> Zapisywanie...';
            
            await apiCall(`/api/special-budgets/${editingSpecialBudgetId}`, 'PUT', { name, amount });
            
            // fetchInitialData odświeża stan i wywołuje renderowanie
            if (typeof window.fetchInitialData === 'function') {
                await window.fetchInitialData(false);
            }
            
            closeOverlay('edit-special-budget-modal');
            editingSpecialBudgetId = null;
        } catch (error) {
            alert('Nie udało się zaktualizować budżetu: ' + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}
