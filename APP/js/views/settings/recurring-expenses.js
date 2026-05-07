/**
 * Moduł Zarządzania Wydatkami Cyklicznymi (Ustawienia).
 */
import state from '../../core/state.js';
import { apiCall } from '../../core/api.js';
import { formatAmount } from '../../shared/format.js';
import { openSelectionDrawer } from '../../shared/ui.js';
import Drawer from '../../shared/drawer.js';
import { openHierarchicalCategoryDrawer, applyCategorySelectionState } from '../../shared/categories.js';
import { buildTagsSummary, openTagsDrawer, getDefaultTagValues } from '../../shared/tags.js';
import { fetchInitialData } from '../../core/data-loader.js';

let initialized = false;

function el(id) {
    return document.getElementById(id);
}

/**
 * Inicjalizuje moduł wydatków cyklicznych.
 */
export function initSettingsRecurring() {
    if (initialized) return;

    el('add-recurring-expense-btn')?.addEventListener('click', () => openRecurringExpenseDrawer());
    el('recurring-expenses-list')?.addEventListener('click', handleRecurringExpenseActions);

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
        list.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm p-4 text-center">Brak zdefiniowanych wydatków cyklicznych.</p>`;
        return;
    }

    state.allRecurringExpenses.forEach(expense => {
        const expenseEl = document.createElement('div');
        expenseEl.className = 'w-full flex items-center justify-between p-3.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all group';
        expenseEl.dataset.id = expense.id;

        const scheduleText = getScheduleText(expense.schedule);
        const fullCategoryText = expense.subCategory ? `${expense.category} / ${expense.subCategory}` : expense.category;

        expenseEl.innerHTML = `
            <div>
                <p class="font-semibold text-white">${expense.name}</p>
                <p class="text-xs text-gray-500 mt-0.5">${formatAmount(expense.amount)} • ${fullCategoryText}</p>
                <p class="text-[10px] text-brand-400/80 font-medium uppercase tracking-wider mt-1">${scheduleText}</p>
            </div>
            <div class="flex items-center space-x-1">
                 <button class="edit-recurring-expense-btn p-2 text-brand-400 hover:text-brand-300 transition-colors" title="Edytuj">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                </button>
                <button class="delete-recurring-expense-btn p-2 text-red-500 hover:text-red-700 transition-colors" title="Usuń">
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
        const expense = state.allRecurringExpenses.find(exp => exp.id === expenseId);
        if (expense) {
            openRecurringExpenseDrawer(expense);
        }
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

export function openRecurringExpenseDrawer(expense = null) {
    const isEdit = !!expense;
    const title = isEdit ? 'Edytuj wydatek cykliczny' : 'Dodaj wydatek cykliczny';
    
    let localCategory = isEdit ? expense.category : '';
    let localSubCategory = isEdit ? expense.subCategory : '';
    let localTags = isEdit ? Object.assign({}, getDefaultTagValues(), expense.tags || {}) : getDefaultTagValues();
    let localScheduleType = isEdit ? expense.schedule.type : 'monthly';
    let localDayOfWeek = isEdit ? String(expense.schedule.dayOfWeek || 1) : '1';

    const content = `
        <form id="recurring-drawer-form" class="space-y-4 pb-safe">
            <div>
                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider pl-1">Nazwa</label>
                <input type="text" id="rec-name" value="${isEdit ? expense.name.replace(/"/g, '&quot;') : ''}" required
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-medium"
                    placeholder="np. Netflix">
            </div>
            <div>
                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider pl-1">Kwota (zł)</label>
                <input type="number" id="rec-amount" value="${isEdit ? expense.amount : ''}" step="0.01" required
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-medium"
                    placeholder="0.00">
            </div>

            <!-- Kategoria -->
            <div>
                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider pl-1">Kategoria</label>
                <button type="button" id="rec-category-btn"
                        class="w-full flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left">
                    <div class="flex items-center">
                        <div id="rec-category-icon" class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 bg-white/5 mr-3 shrink-0">
                            <i class="fas fa-folder"></i>
                        </div>
                        <span id="rec-category-label" class="text-white text-sm">Wybierz kategorię...</span>
                    </div>
                    <i class="fas fa-chevron-right text-gray-500 text-xs"></i>
                </button>
            </div>

            <!-- Harmonogram -->
            <div>
                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider pl-1">Częstotliwość</label>
                <button type="button" id="rec-schedule-btn"
                        class="w-full flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left">
                    <div class="flex items-center">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 bg-white/5 mr-3 shrink-0">
                            <i class="fas fa-calendar"></i>
                        </div>
                        <span id="rec-schedule-label" class="text-white text-sm">Co miesiąc</span>
                    </div>
                    <i class="fas fa-chevron-right text-gray-500 text-xs"></i>
                </button>
            </div>

            <div id="rec-monthly-settings" class="${localScheduleType === 'monthly' ? '' : 'hidden'}">
                <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Dzień miesiąca (1-31)</label>
                <input type="number" id="rec-day-of-month" value="${isEdit && expense.schedule.type === 'monthly' ? expense.schedule.dayOfMonth : '1'}" min="1" max="31"
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-medium">
            </div>

            <div id="rec-weekly-settings" class="${localScheduleType === 'weekly' ? '' : 'hidden'}">
                <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Dzień tygodnia</label>
                <button type="button" id="rec-day-of-week-btn"
                        class="w-full flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left">
                    <span id="rec-day-of-week-label" class="text-white text-sm">Poniedziałek</span>
                    <i class="fas fa-chevron-right text-gray-500 text-xs"></i>
                </button>
            </div>

            <div id="rec-interval-settings" class="${localScheduleType === 'daily_interval' ? '' : 'hidden'} grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Co ile dni</label>
                    <input type="number" id="rec-interval" value="${isEdit && expense.schedule.type === 'daily_interval' ? expense.schedule.interval : '30'}" min="1"
                        class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-medium">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 ml-1">Data startu</label>
                    <input type="date" id="rec-start-date" value="${isEdit && expense.schedule.type === 'daily_interval' ? expense.schedule.startDate : new Date().toISOString().split('T')[0]}"
                        class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-medium">
                </div>
            </div>

            <!-- Tagi -->
            <div>
                <label class="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider pl-1">Tagi i opcje</label>
                <button type="button" id="rec-tags-btn"
                        class="w-full flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left">
                    <div class="flex items-center min-w-0 mr-3">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 bg-white/5 mr-3 shrink-0">
                            <i class="fas fa-tags"></i>
                        </div>
                        <span id="rec-tags-summary" class="text-white text-sm truncate">Wybierz...</span>
                    </div>
                    <i class="fas fa-chevron-right text-gray-500 text-xs"></i>
                </button>
            </div>
        </form>
    `;

    Drawer.open({
        title,
        content,
        size: 'lg',
        confirmLabel: isEdit ? 'Aktualizuj' : 'Dodaj subskrypcję',
        cancelLabel: 'Anuluj',
        onConfirm: async () => {
            const form = el('recurring-drawer-form');
            if (!form.reportValidity()) return;

            const name = el('rec-name').value.trim();
            const amount = parseFloat(el('rec-amount').value);
            
            let schedule = { type: localScheduleType };
            if (localScheduleType === 'monthly') {
                schedule.dayOfMonth = parseInt(el('rec-day-of-month').value);
            } else if (localScheduleType === 'weekly') {
                schedule.dayOfWeek = parseInt(localDayOfWeek);
            } else if (localScheduleType === 'daily_interval') {
                schedule.interval = parseInt(el('rec-interval').value);
                schedule.startDate = el('rec-start-date').value;
            }

            const expenseData = {
                name,
                amount,
                category: localCategory,
                subCategory: localSubCategory,
                schedule,
                tags: localTags
            };

            try {
                if (isEdit) {
                    await apiCall(`/api/recurring-expenses/${expense.id}`, 'PUT', expenseData);
                } else {
                    await apiCall('/api/recurring-expenses', 'POST', expenseData);
                }
                await fetchInitialData(false);
                Drawer.close();
            } catch (error) {
                alert('Błąd zapisu: ' + error.message);
                throw error;
            }
        }
    });

    setTimeout(() => {
        applyCategorySelectionState({
            labelEl: el('rec-category-label'),
            iconEl: el('rec-category-icon')
        }, localCategory, localSubCategory, 'Wybierz kategorię...');

        el('rec-tags-summary').textContent = buildTagsSummary(localTags);

        if (isEdit && expense.schedule.type === 'weekly') {
             const days = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
             el('rec-day-of-week-label').textContent = days[expense.schedule.dayOfWeek];
        }

        const scheduleLabels = { 'monthly': 'Co miesiąc', 'weekly': 'Co tydzień', 'daily_interval': 'Interwał dni' };
        el('rec-schedule-label').textContent = scheduleLabels[localScheduleType];

        el('rec-category-btn').onclick = () => {
            openHierarchicalCategoryDrawer(null, localCategory, localSubCategory, (p, s) => {
                localCategory = p;
                localSubCategory = s;
                applyCategorySelectionState({
                    labelEl: el('rec-category-label'),
                    iconEl: el('rec-category-icon')
                }, p, s, 'Wybierz kategorię...');
            });
        };

        el('rec-tags-btn').onclick = () => {
            openTagsDrawer(localTags, (newTags) => {
                localTags = newTags;
                el('rec-tags-summary').textContent = buildTagsSummary(newTags);
            });
        };

        el('rec-schedule-btn').onclick = () => {
            const options = [
                { value: 'monthly', label: 'Co miesiąc', icon: '📅' },
                { value: 'weekly', label: 'Co tydzień', icon: '🔁' },
                { value: 'daily_interval', label: 'Interwał dni', icon: '🔢' }
            ];
            openSelectionDrawer('Częstotliwość', options, (val, label) => {
                localScheduleType = val;
                el('rec-schedule-label').textContent = label;
                el('rec-monthly-settings').classList.toggle('hidden', val !== 'monthly');
                el('rec-weekly-settings').classList.toggle('hidden', val !== 'weekly');
                el('rec-interval-settings').classList.toggle('hidden', val !== 'daily_interval');
            }, localScheduleType);
        };

        el('rec-day-of-week-btn').onclick = () => {
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
                localDayOfWeek = val;
                el('rec-day-of-week-label').textContent = label;
            }, localDayOfWeek);
        };

        el('rec-name').focus();
    }, 50);
}
