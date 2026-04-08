// Tracker Wydatków - Recurring Expenses Functions

function renderRecurringExpenses() {
    recurringExpensesList.innerHTML = '';
    if (allRecurringExpenses.length === 0) {
        recurringExpensesList.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm">Brak zdefiniowanych wydatków cyklicznych.</p>`;
        return;
    }

    allRecurringExpenses.forEach(expense => {
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
        recurringExpensesList.appendChild(expenseEl);
    });
}

function getScheduleText(schedule) {
    if (!schedule) {
        return 'Brak harmonogramu';
    }
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

    const name = recurringName.value.trim();
    const amount = parseFloat(recurringAmount.value);
    const category = recurringCategoryValue;
    const subCategory = recurringSubCategoryValue; // DODANE
    const scheduleType = scheduleTypeValue;
    const tags = Object.assign({}, recurringTagValues);

    let schedule = { type: scheduleType };
    let isValid = false;

    switch (scheduleType) {
        case 'monthly':
            const dayOfMonth = parseInt(recurringDayOfMonth.value);
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
            const interval = parseInt(recurringInterval.value);
            const startDate = recurringStartDate.value;
            if (interval > 0 && startDate) {
                schedule.interval = interval;
                schedule.startDate = startDate;
                isValid = true;
            }
            break;
    }

    if (!name || !amount || !category || !isValid) {
        alert('Wypełnij poprawnie wszystkie pola, aby dodać lub zaktualizować wydatek cykliczny.');
        return;
    }

    const expenseData = { name, amount, category, subCategory, schedule, tags }; // ZAKTUALIZOWANE

    try {
        if (editingRecurringExpenseId) {
            await apiCall(`/api/recurring-expenses/${editingRecurringExpenseId}`, 'PUT', expenseData);
        } else {
            await apiCall('/api/recurring-expenses', 'POST', expenseData);
        }

        exitRecurringExpenseEditMode();
        allRecurringExpenses = await apiCall('/api/recurring-expenses');
        renderRecurringExpenses();
    } catch (error) {
        alert(`Nie udało się zapisać wydatku cyklicznego: ${error.message}`);
    }
}

function handleRecurringExpenseActions(e) {
    const deleteBtn = e.target.closest('.delete-recurring-expense-btn');
    if (deleteBtn) {
        const expenseDiv = e.target.closest('[data-id]');
        const expenseId = expenseDiv.dataset.id;
        const expense = allRecurringExpenses.find(exp => exp.id === expenseId);

        if (confirm(`Czy na pewno chcesz usunąć wydatek cykliczny "${expense.name}"?`)) {
            deleteRecurringExpense(expenseId);
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

async function deleteRecurringExpense(expenseId) {
    try {
        await apiCall(`/api/recurring-expenses/${expenseId}`, 'DELETE');
        allRecurringExpenses = await apiCall('/api/recurring-expenses');
        renderRecurringExpenses();
    } catch (error) {
        alert('Nie udało się usunąć wydatku: ' + error.message);
    }
}

function enterRecurringExpenseEditMode(expenseId) {
    const expense = allRecurringExpenses.find(exp => exp.id === expenseId);
    if (!expense) return;

    editingRecurringExpenseId = expenseId;

    recurringName.value = expense.name;
    recurringAmount.value = expense.amount;
    
    // Kategoria i Podkategoria
    applyRecurringCategorySelection(expense.category || '', expense.subCategory || '');

    // Tagi (wszystkie grupy)
    const defaults = getDefaultTagValues();
    recurringTagValues = Object.assign({}, defaults, expense.tags || {});
    const tagsSummaryEl = document.getElementById('recurring-tags-summary');
    if (tagsSummaryEl) tagsSummaryEl.textContent = buildTagsSummary(recurringTagValues);

    if (expense.schedule) {
        scheduleTypeValue = expense.schedule.type;
        handleScheduleTypeChange(); 
        switch (expense.schedule.type) {
            case 'monthly':
                recurringDayOfMonth.value = expense.schedule.dayOfMonth;
                break;
            case 'weekly':
                recurringDayOfWeekValue = String(expense.schedule.dayOfWeek);
                break;
            case 'daily_interval':
                recurringInterval.value = expense.schedule.interval;
                recurringStartDate.value = expense.schedule.startDate;
                break;
        }
    } else {
        scheduleTypeValue = 'monthly';
        handleScheduleTypeChange();
    }

    addRecurringExpenseForm.querySelector('button[type="submit"]').textContent = 'Zaktualizuj subskrypcję';
    addRecurringExpenseForm.scrollIntoView({ behavior: 'smooth' });
}

function exitRecurringExpenseEditMode() {
    editingRecurringExpenseId = null;
    addRecurringExpenseForm.reset();

    recurringTagValues = getDefaultTagValues();
    const tagsSummaryEl = document.getElementById('recurring-tags-summary');
    if (tagsSummaryEl) tagsSummaryEl.textContent = buildTagsSummary(recurringTagValues);

    handleScheduleTypeChange();
    addRecurringExpenseForm.querySelector('button[type="submit"]').textContent = 'Dodaj subskrypcję';
}

function handleScheduleTypeChange() {
    const type = scheduleTypeValue;

    // Toggle visibility
    monthlySettings.classList.toggle('hidden', type !== 'monthly');
    weeklySettings.classList.toggle('hidden', type !== 'weekly');
    intervalSettings.classList.toggle('hidden', type !== 'daily_interval');
}