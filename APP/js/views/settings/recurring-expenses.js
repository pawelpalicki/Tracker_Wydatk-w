/**
 * Moduł Zarządzania Wydatkami Cyklicznymi (Ustawienia).
 */
import state from '../../core/state.js';
import { apiCall } from '../../core/api.js';
import { formatAmount } from '../../shared/format.js';
import { openSelectionDrawer, openOverlay, closeOverlay } from '../../shared/ui.js';
import { applyCategorySelectionState, openHierarchicalCategoryDrawer } from '../../shared/categories.js';
import { buildTagsSummary, openTagsDrawer, getDefaultTagValues } from '../../shared/tags.js';
import { fetchInitialData } from '../../core/data-loader.js';

// Stan lokalny formularza
let editingRecurringExpenseId = null;
let recurringCategoryValue = '';
let recurringSubCategoryValue = '';
let recurringTagValues = {};
let scheduleTypeValue = 'monthly';
let recurringDayOfWeekValue = '1';
let initialized = false;

function el(id) {
    return document.getElementById(id);
}

/**
 * Inicjalizuje moduł wydatków cyklicznych.
 */
export function initSettingsRecurring() {
    if (initialized) return;

    const form = el('add-recurring-expense-form');
    const list = el('recurring-expenses-list');
    
    if (form) {
        form.addEventListener('submit', handleAddOrUpdateRecurringExpense);
    }
    
    if (list) {
        list.addEventListener('click', handleRecurringExpenseActions);
    }

    // Przycisk Anuluj
    el('cancel-recurring-edit-btn')?.addEventListener('click', exitRecurringExpenseEditMode);

    // Eventy dla przycisków typu "select" (szuflady)
    el('recurring-category-btn')?.addEventListener('click', () => {
        const currentCat = recurringCategoryValue || '';
        const currentSub = recurringSubCategoryValue || '';
        openHierarchicalCategoryDrawer(null, currentCat, currentSub, (pName, sName) => {
            applyRecurringCategorySelection(pName, sName);
        });
    });

    el('recurring-tags-btn')?.addEventListener('click', () => {
        openTagsDrawer(recurringTagValues, (newTags) => {
            recurringTagValues = newTags;
            const summaryEl = el('recurring-tags-summary');
            if (summaryEl) summaryEl.textContent = buildTagsSummary(newTags);
        });
    });

    el('recurring-schedule-btn')?.addEventListener('click', () => {
        const options = [
            { value: 'monthly', label: 'Co miesiąc', icon: '📅' },
            { value: 'weekly', label: 'Co tydzień', icon: '🔁' },
            { value: 'daily_interval', label: 'Interwał dni', icon: '🔢' }
        ];
        openSelectionDrawer('Częstotliwość', options, (val, label) => {
            scheduleTypeValue = val;
            const labelEl = el('recurring-schedule-label');
            if (labelEl) labelEl.textContent = label;
            handleScheduleTypeChange();
        }, scheduleTypeValue);
    });

    el('recurring-day-of-week-btn')?.addEventListener('click', () => {
        const options = [
            { value: '1', label: 'Poniedziałek' },
            { value: '2', label: 'Wtorek' },
            { value: '3', label: 'Środa' },
            { value: '4', label: 'Czwartek' },
            { value: '5', label: 'Piątek' },
            { value: '6', label: 'Sobota' },
            { value: '0', label: 'Niedziela' }
        ];
        openSelectionDrawer('Dzień tygodnia', options, (val, label) => {
            recurringDayOfWeekValue = val;
            const labelEl = el('recurring-day-of-week-label');
            if (labelEl) labelEl.textContent = label;
        }, recurringDayOfWeekValue);
    });

    // Inicjalizacja domyślnych wartości tagów
    recurringTagValues = getDefaultTagValues();
    const summaryEl = el('recurring-tags-summary');
    if (summaryEl) summaryEl.textContent = buildTagsSummary(recurringTagValues);

    initialized = true;
    renderRecurringExpenses();
}

/**
 * Renderuje listę wydatków cyklicznych.
 */
export function renderRecurringExpenses() {
    const list = el('recurring-expenses-list');
    if (!list) return;

    list.innerHTML = '';
    
    if (!state.allRecurringExpenses || state.allRecurringExpenses.length === 0) {
        list.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm">Brak zdefiniowanych wydatków cyklicznych.</p>`;
        return;
    }

    state.allRecurringExpenses.forEach(expense => {
        const expenseEl = document.createElement('div');
        expenseEl.className = 'w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all group';
        expenseEl.dataset.id = expense.id;

        const scheduleText = getScheduleText(expense.schedule);
        const fullCategoryText = expense.subCategory ? `${expense.category} / ${expense.subCategory}` : expense.category;

        expenseEl.innerHTML = `
            <div>
                <p class="font-semibold text-gray-900 dark:text-white">${expense.name}</p>
                <p class="text-sm text-gray-600 dark:text-gray-400">${formatAmount(expense.amount)} - ${fullCategoryText} (${scheduleText})</p>
            </div>
            <div class="flex items-center space-x-1">
                 <button class="edit-recurring-expense-btn p-2 text-blue-500 hover:text-blue-700" title="Edytuj">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                </button>
                <button class="delete-recurring-expense-btn p-2 text-red-500 hover:text-red-700" title="Usuń">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>
                </button>
            </div>
        `;
        list.appendChild(expenseEl);
    });
}

function getScheduleText(schedule) {
    if (!schedule) return 'Brak harmonogramu';
    
    switch (schedule.type) {
        case 'monthly':
            return `co miesiąc, ${schedule.dayOfMonth} dnia`;
        case 'weekly':
            const weekdays = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
            return `co tydzień, w ${weekdays[schedule.dayOfWeek]}`;
        case 'daily_interval':
            return `co ${schedule.interval} dni od ${schedule.startDate}`;
        default:
            return 'Nieznany harmonogram';
    }
}

async function handleAddOrUpdateRecurringExpense(e) {
    e.preventDefault();

    const name = el('recurring-name').value.trim();
    const amount = parseFloat(el('recurring-amount').value);
    const category = recurringCategoryValue;
    const subCategory = recurringSubCategoryValue;
    const scheduleType = scheduleTypeValue;
    const tags = Object.assign({}, recurringTagValues);

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    let schedule = { type: scheduleType };
    let isValid = false;

    switch (scheduleType) {
        case 'monthly':
            const dayOfMonth = parseInt(el('recurring-day-of-month').value);
            if (dayOfMonth >= 1 && dayOfMonth <= 31) {
                schedule.dayOfMonth = dayOfMonth;
                isValid = true;
            }
            break;
        case 'weekly':
            const dayOfWeek = parseInt(recurringDayOfWeekValue);
            if (dayOfWeek >= 0 && dayOfWeek <= 6) {
                schedule.dayOfWeek = dayOfWeek;
                isValid = true;
            }
            break;
        case 'daily_interval':
            const interval = parseInt(el('recurring-interval').value);
            const startDate = el('recurring-start-date').value;
            if (interval > 0 && startDate) {
                schedule.interval = interval;
                schedule.startDate = startDate;
                isValid = true;
            }
            break;
    }

    if (!name || !amount || !category || !isValid) {
        alert('Wypełnij poprawnie wszystkie pola.');
        return;
    }

    const expenseData = { name, amount, category, subCategory, schedule, tags };

    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i> Zapisywanie...';

        if (editingRecurringExpenseId) {
            await apiCall(`/api/recurring-expenses/${editingRecurringExpenseId}`, 'PUT', expenseData);
        } else {
            await apiCall('/api/recurring-expenses', 'POST', expenseData);
        }

        exitRecurringExpenseEditMode();
        
        await fetchInitialData(false);
    } catch (error) {
        alert(`Nie udało się zapisać wydatku cyklicznego: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

function handleRecurringExpenseActions(e) {
    const deleteBtn = e.target.closest('.delete-recurring-expense-btn');
    if (deleteBtn) {
        const expenseDiv = e.target.closest('[data-id]');
        const expenseId = expenseDiv.dataset.id;
        const expense = state.allRecurringExpenses.find(exp => exp.id === expenseId);

        if (confirm(`Czy na pewno chcesz usunąć wydatek cykliczny "${expense.name}"?`)) {
            deleteRecurringExpense(expenseId, deleteBtn);
        }
        return;
    }

    const editBtn = e.target.closest('.edit-recurring-expense-btn');
    if (editBtn) {
        const expenseDiv = e.target.closest('[data-id]');
        const expenseId = expenseDiv.dataset.id;
        enterRecurringExpenseEditMode(expenseId);
    }
}

async function deleteRecurringExpense(expenseId, btn) {
    const originalContent = btn.innerHTML;
    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i>';
        await apiCall(`/api/recurring-expenses/${expenseId}`, 'DELETE');
        
        await fetchInitialData(false);
    } catch (error) {
        alert('Nie udało się usunąć wydatku: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

function enterRecurringExpenseEditMode(expenseId) {
    const expense = state.allRecurringExpenses.find(exp => exp.id === expenseId);
    if (!expense) return;

    editingRecurringExpenseId = expenseId;

    el('recurring-name').value = expense.name;
    el('recurring-amount').value = expense.amount;
    
    applyRecurringCategorySelection(expense.category || '', expense.subCategory || '');

    const defaults = getDefaultTagValues();
    recurringTagValues = Object.assign({}, defaults, expense.tags || {});
    const tagsSummaryEl = el('recurring-tags-summary');
    if (tagsSummaryEl) tagsSummaryEl.textContent = buildTagsSummary(recurringTagValues);

    if (expense.schedule) {
        scheduleTypeValue = expense.schedule.type;
        const scheduleLabel = el('recurring-schedule-label');
        if (scheduleLabel) {
            const labels = { 'monthly': 'Co miesiąc', 'weekly': 'Co tydzień', 'daily_interval': 'Interwał dni' };
            scheduleLabel.textContent = labels[scheduleTypeValue] || scheduleTypeValue;
        }
        handleScheduleTypeChange(); 
        switch (expense.schedule.type) {
            case 'monthly':
                el('recurring-day-of-month').value = expense.schedule.dayOfMonth;
                break;
            case 'weekly':
                recurringDayOfWeekValue = String(expense.schedule.dayOfWeek);
                const dowLabel = el('recurring-day-of-week-label');
                if (dowLabel) {
                    const days = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
                    dowLabel.textContent = days[expense.schedule.dayOfWeek];
                }
                break;
            case 'daily_interval':
                el('recurring-interval').value = expense.schedule.interval;
                el('recurring-start-date').value = expense.schedule.startDate;
                break;
        }
    } else {
        scheduleTypeValue = 'monthly';
        handleScheduleTypeChange();
    }

    const form = el('add-recurring-expense-form');
    if (form) {
        form.querySelector('button[type="submit"]').textContent = 'Zaktualizuj subskrypcję';
        form.scrollIntoView({ behavior: 'smooth' });
    }

    // Pokaż przycisk Anuluj
    const cancelBtn = el('cancel-recurring-edit-btn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
}

function exitRecurringExpenseEditMode() {
    editingRecurringExpenseId = null;
    const form = el('add-recurring-expense-form');
    if (form) {
        form.reset();
        form.querySelector('button[type="submit"]').textContent = 'Dodaj subskrypcję';
    }

    // Ukryj przycisk Anuluj
    const cancelBtn = el('cancel-recurring-edit-btn');
    if (cancelBtn) cancelBtn.classList.add('hidden');

    recurringTagValues = getDefaultTagValues();
    const tagsSummaryEl = el('recurring-tags-summary');
    if (tagsSummaryEl) tagsSummaryEl.textContent = buildTagsSummary(recurringTagValues);

    applyRecurringCategorySelection('', '');
    scheduleTypeValue = 'monthly';
    const scheduleLabel = el('recurring-schedule-label');
    if (scheduleLabel) scheduleLabel.textContent = 'Co miesiąc';
    handleScheduleTypeChange();
    
    // Przewiń do listy wydatków
    const list = el('recurring-expenses-list');
    if (list) list.scrollIntoView({ behavior: 'smooth' });
}

export function handleScheduleTypeChange() {
    const type = scheduleTypeValue;
    el('recurring-monthly-settings')?.classList.toggle('hidden', type !== 'monthly');
    el('recurring-weekly-settings')?.classList.toggle('hidden', type !== 'weekly');
    el('recurring-interval-settings')?.classList.toggle('hidden', type !== 'daily_interval');
}

function applyRecurringCategorySelection(parentName = '', subCategoryName = '') {
    recurringCategoryValue = parentName || '';
    recurringSubCategoryValue = subCategoryName || '';

    applyCategorySelectionState({
        buttonEl: el('recurring-category-btn'),
        labelEl: el('recurring-category-label'),
        iconEl: el('recurring-category-icon')
    }, recurringCategoryValue, recurringSubCategoryValue, 'Wybierz kategorię');
}
