/**
 * Moduł Zarządzania Budżetem Miesięcznym (Ustawienia).
 */
import state from '../../core/state.js';
import { apiCall } from '../../core/api.js';
import { openSelectionDrawer } from '../../shared/ui.js';
import Drawer from '../../shared/drawer.js';
import { formatNumber } from '../../shared/format.js';
import { renderDashboard } from '../dashboard.js';

let budgetMonthValue = '';
let initialized = false;

function el(id) {
    return document.getElementById(id);
}

/**
 * Inicjalizuje moduł budżetu.
 */
export function initMonthlyBudget() {
    if (initialized) return;

    populateBudgetMonthSelector();

    el('budget-month-btn')?.addEventListener('click', () => {
        const options = [];
        const today = new Date();
        // Generuj 12 miesięcy wstecz i 12 w przód
        for (let i = -12; i <= 12; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const mStr = d.toISOString().substring(0, 7);
            let label = d.toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
            label = label.charAt(0).toUpperCase() + label.slice(1);
            options.push({ value: mStr, label: label });
        }
        options.sort((a, b) => b.value.localeCompare(a.value));

        openSelectionDrawer('Wybierz miesiąc', options, (val, label) => {
            budgetMonthValue = val;
            const labelEl = el('budget-month-label');
            if (labelEl) labelEl.textContent = label;
            renderBudgetInputs();
        }, budgetMonthValue);
    });

    el('save-budget-btn')?.addEventListener('click', handleSaveBudget);
    el('copy-budget-btn')?.addEventListener('click', () => {
        Drawer.open({
            title: 'Kopiuj budżet na następne miesiące',
            content: `
                <div class="space-y-4">
                    <p class="text-gray-600 dark:text-gray-300 text-sm">Na ile miesięcy do przodu chcesz skopiować obecny budżet?</p>
                    <div class="grid grid-cols-2 gap-3">
                        <button class="copy-months-btn btn-secondary rounded-xl font-medium" data-months="1">1 miesiąc</button>
                        <button class="copy-months-btn btn-secondary rounded-xl font-medium" data-months="3">3 miesiące</button>
                        <button class="copy-months-btn btn-secondary rounded-xl font-medium" data-months="6">6 miesięcy</button>
                        <button class="copy-months-btn btn-secondary rounded-xl font-medium" data-months="12">12 miesięcy</button>
                    </div>
                </div>
            `,
            size: 'sm',
            showCloseBtn: true,
            triggerId: 'copy-budget-btn',
        });
        
        setTimeout(() => {
            const copyMonthsBtns = document.querySelectorAll('.copy-months-btn');
            copyMonthsBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const months = parseInt(btn.dataset.months);
                    handleCopyBudget(months, btn);
                });
            });
        }, 50);
    });

    initialized = true;
    renderBudgetInputs();
}

/**
 * Ustawia domyślny miesiąc w selektorze.
 */
export function populateBudgetMonthSelector() {
    const today = new Date();
    budgetMonthValue = today.toISOString().substring(0, 7);
    let label = new Date(today.getFullYear(), today.getMonth()).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
    label = label.charAt(0).toUpperCase() + label.slice(1);

    const labelEl = el('budget-month-label');
    if (labelEl) labelEl.textContent = label;
}

/**
 * Renderuje pola do wpisywania budżetu dla poszczególnych kategorii.
 */
export async function renderBudgetInputs() {
    const list = el('budgets-list');
    if (!list) return;

    if (!budgetMonthValue) {
        console.warn("budgetMonthValue jest puste, pomijam renderowanie budżetu");
        return;
    }

    const [year, month] = budgetMonthValue.split('-');
    if (!year || !month) {
        console.error("Nieprawidłowy format daty:", budgetMonthValue);
        return;
    }

    try {
        const response = await apiCall(`/api/budgets/${year}/${month}`);
        const budgets = response.budgets || {};
        
        // Użyj kategorii nadrzędnych ze state.structuredCategories
        let categoriesToRender = [];
        if (state.structuredCategories && state.structuredCategories.length > 0) {
            categoriesToRender = state.structuredCategories.filter(c => !c.parentId).map(c => c.name);
        } else {
            categoriesToRender = state.allCategories;
        }

        list.innerHTML = categoriesToRender.map(cat => {
            const val = budgets[cat] || '';
            const formatted = formatNumber(val);
            return `
                <div class="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                    <label for="budget-${cat}" class="text-gray-800 dark:text-gray-200">${cat.charAt(0).toUpperCase() + cat.slice(1)}</label>
                    <div class="relative">
                        <input type="text" inputmode="decimal" id="budget-${cat}" data-category="${cat}"
                               class="budget-input rounded-md border-white/10 bg-white/5 text-white text-right py-2 focus:bg-white/10 transition-all text-base font-semibold"
                               style="padding-right: 2.2rem !important; width: 9rem !important;"
                               placeholder="0" value="${formatted}">
                        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-bold">zł</span>
                    </div>
                </div>
            `;
        }).join('');

        // Dodaj listener do formatowania w locie
        list.querySelectorAll('.budget-input').forEach(input => {
            input.addEventListener('input', (e) => {
                let cursorPosition = e.target.selectionStart;
                let originalLength = e.target.value.length;
                
                let rawVal = e.target.value.replace(/\s/g, '').replace(',', '.');
                if (rawVal === '' || isNaN(rawVal.replace('.', ''))) {
                    if (rawVal !== '') {
                        e.target.value = rawVal.replace(/[^0-9.]/g, '');
                    }
                    return;
                }

                const newVal = formatNumber(rawVal);
                e.target.value = newVal;

                // Przywróć pozycję kursora
                let newLength = newVal.length;
                e.target.setSelectionRange(cursorPosition + (newLength - originalLength), cursorPosition + (newLength - originalLength));
            });
        });
    } catch (error) {
        console.error("Błąd renderowania pól budżetu:", error);
        list.innerHTML = `<p class="text-red-500 text-sm">Nie udało się załadować danych budżetu.</p>`;
    }
}

/**
 * Zapisuje budżet na serwerze.
 */
async function handleSaveBudget() {
    const list = el('budgets-list');
    if (!list) return;

    const [year, month] = budgetMonthValue.split('-');
    const budgetInputs = list.querySelectorAll('.budget-input');
    const budgets = {};

    budgetInputs.forEach(input => {
        const category = input.dataset.category;
        const amount = parseFloat(input.value.replace(/\s/g, '').replace(',', '.'));
        if (amount > 0) {
            budgets[category] = amount;
        }
    });

    const saveBtn = el('save-budget-btn');
    const originalText = saveBtn.textContent;

    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i> Zapisywanie...';

        await apiCall(`/api/budgets/${year}/${month}`, 'POST', { budgets });
        alert('Budżet został pomyślnie zapisany!');
        
        // Odśwież statystyki kokpitu jeśli są widoczne
        if (typeof renderDashboard === 'function') {
            renderDashboard();
        }
    } catch (error) {
        alert('Nie udało się zapisać budżetu: ' + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}

/**
 * Kopiuje budżet na kolejne miesiące.
 */
async function handleCopyBudget(monthsCount, btn = null) {
    const list = el('budgets-list');
    if (!list) return;

    const [currentYear, currentMonth] = budgetMonthValue.split('-');
    const budgetInputs = list.querySelectorAll('.budget-input');
    const budgets = {};

    budgetInputs.forEach(input => {
        const category = input.dataset.category;
        const amount = parseFloat(input.value);
        if (amount > 0) {
            budgets[category] = amount;
        }
    });

    if (Object.keys(budgets).length === 0) {
        alert('Brak budżetu do skopiowania. Najpierw ustaw budżet dla obecnego miesiąca.');
        return;
    }

    const originalContent = btn ? btn.innerHTML : null;
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i>';
        }

        const promises = [];
        for (let i = 1; i <= monthsCount; i++) {
            const targetDate = new Date(currentYear, parseInt(currentMonth) - 1 + i, 1);
            const targetYear = targetDate.getFullYear();
            const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');

            promises.push(
                apiCall(`/api/budgets/${targetYear}/${targetMonth}`, 'POST', { budgets })
            );
        }

        await Promise.all(promises);

        const monthText = monthsCount === 1 ? '1 miesiąc' : `${monthsCount} miesięcy`;
        alert(`✅ Budżet został skopiowany na następne ${monthText}!`);
        Drawer.close();

    } catch (error) {
        alert('Błąd podczas kopiowania budżetu: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}
