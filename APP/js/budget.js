// Tracker Wydatków - Budget Functions

let budgetDonutChart;

// --- Logika Budżetowania ---
function populateBudgetMonthSelector() {
    budgetMonthSelect.innerHTML = '';
    const months = [];
    const today = new Date();
    const currentMonthStr = today.toISOString().substring(0, 7);

    // Generuj listę miesięcy: 2 poprzednie, bieżący i 12 przyszłych
    for (let i = -2; i <= 12; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        months.push(d.toISOString().substring(0, 7));
    }

    // Sortuj od najnowszego do najstarszego
    months.sort().reverse();

    months.forEach(monthStr => {
        const option = document.createElement('option');
        option.value = monthStr;
        const [y, m] = monthStr.split('-');
        option.textContent = new Date(y, m - 1).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });

        // Ustaw bieżący miesiąc jako domyślnie wybrany
        if (monthStr === currentMonthStr) {
            option.selected = true;
        }

        budgetMonthSelect.appendChild(option);
    });
}

async function renderBudgetInputs() {
    if (!budgetMonthSelect.value) {
        console.warn("budgetMonthSelect.value jest puste, pomijam renderowanie budżetu");
        return;
    }

    const [year, month] = budgetMonthSelect.value.split('-');
    if (!year || !month) {
        console.error("Nieprawidłowy format daty:", budgetMonthSelect.value);
        return;
    }

    try {
        const { budgets } = await apiCall(`/api/budgets/${year}/${month}`);
        budgetsList.innerHTML = allCategories.map(cat => `
            <div class="flex justify-between items-center">
                <label for="budget-${cat}" class="text-gray-800 dark:text-gray-200">${cat.charAt(0).toUpperCase() + cat.slice(1)}</label>
                <input type="number" id="budget-${cat}" data-category="${cat}"
                       class="budget-input w-32 rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-1"
                       placeholder="0.00" value="${budgets[cat] || ''}">
            </div>
        `).join('');
    } catch (error) {
        console.error("Błąd renderowania pól budżetu:", error);
        budgetsList.innerHTML = `<p class="text-red-500">Nie udało się załadować danych budżetu.</p>`;
    }
}

async function handleSaveBudget() {
    const [year, month] = budgetMonthSelect.value.split('-');
    const budgetInputs = budgetsList.querySelectorAll('.budget-input');
    const budgets = {};

    budgetInputs.forEach(input => {
        const category = input.dataset.category;
        const amount = parseFloat(input.value);
        if (amount > 0) {
            budgets[category] = amount;
        }
    });

    try {
        await apiCall(`/api/budgets/${year}/${month}`, 'POST', { budgets });
        alert('Budżet został pomyślnie zapisany!');
        // Odśwież statystyki, jeśli widok kokpitu jest aktywny
        if (document.getElementById('stats-tab').classList.contains('active')) {
            renderStatistics();
        }
    } catch (error) {
        alert('Nie udało się zapisać budżetu: ' + error.message);
    }
}

async function handleCopyBudget(monthsCount) {
    const [currentYear, currentMonth] = budgetMonthSelect.value.split('-');
    const budgetInputs = budgetsList.querySelectorAll('.budget-input');
    const budgets = {};

    // Pobierz obecny budżet
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

    try {
        // Zapisz budżet na następne miesiące
        const promises = [];
        for (let i = 1; i <= monthsCount; i++) {
            const targetDate = new Date(currentYear, currentMonth - 1 + i, 1);
            const targetYear = targetDate.getFullYear();
            const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');

            promises.push(
                apiCall(`/api/budgets/${targetYear}/${targetMonth}`, 'POST', { budgets })
            );
        }

        await Promise.all(promises);

        const monthText = monthsCount === 1 ? '1 miesiąc' : `${monthsCount} miesięcy`;
        alert(`✅ Budżet został skopiowany na następne ${monthText}!`);

        // Zamknij modal
        copyBudgetModal.classList.add('hidden');

    } catch (error) {
        alert('Błąd podczas kopiowania budżetu: ' + error.message);
    }
}

function renderBudgetProgress(spending, budgets) {
    console.log('renderBudgetProgress called with:', { spending, budgets }); // DEBUG
    const container = document.getElementById('budget-progress-container');
    const toggleButton = document.getElementById('toggle-budget-details');
    
    console.log('Toggle button found:', toggleButton); // DEBUG
    console.log('Categories with budget:', Object.keys(budgets)); // DEBUG

    
    container.innerHTML = ''; // Wyczyść poprzednie paski

    const categoriesWithBudget = Object.keys(budgets);

    if (categoriesWithBudget.length === 0) {
        container.innerHTML = '<p class="text-center text-sm text-gray-500 dark:text-gray-400">Nie zdefiniowano budżetu na ten miesiąc.</p>';
        toggleButton.classList.add('hidden'); // DODANE - ukryj przycisk gdy brak danych
        return;
    }

    // DODANE - pokaż przycisk gdy są dane budżetowe
    toggleButton.classList.remove('hidden');

    categoriesWithBudget.forEach(cat => {
        const budgetAmount = budgets[cat];
        const spentAmount = spending[cat] || 0;
        const percentage = Math.min((spentAmount / budgetAmount) * 100, 100);

        const categoryColor = getCategoryColor(cat);
        let warningIcon = '';
        let amountClass = 'text-gray-600 dark:text-gray-400';

        if (spentAmount > budgetAmount) {
            warningIcon = '<span class="text-red-500 ml-2">⚠️</span>';
            amountClass = 'text-red-500 font-semibold';
        }

        const progressElement = document.createElement('div');
        progressElement.innerHTML = `
            <div class="flex justify-between items-center text-sm mb-1">
                <span class="font-medium text-gray-800 dark:text-gray-200 flex items-center">${cat.charAt(0).toUpperCase() + cat.slice(1)} ${warningIcon}</span>
                <span class="${amountClass}">${spentAmount.toFixed(2)} zł / ${budgetAmount.toFixed(2)} zł</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div class="h-2.5 rounded-full" style="width: ${percentage}%; background-color: ${categoryColor};"></div>
            </div>
        `;
        container.appendChild(progressElement);
    });

    // DODANE - domyślnie ukryj szczegóły (paski będą ukryte do momentu kliknięcia)
    container.classList.add('hidden');
}

function renderBudgetSummary(spending, budgets) {
    const summaryContainer = document.getElementById('budget-summary-container');
    const unbudgetedExpensesEl = document.getElementById('unbudgeted-expenses');
    const unbudgetedAmountEl = document.getElementById('unbudgeted-amount');
    const unbudgetedCategoriesEl = document.getElementById('unbudgeted-categories');
    const budgetProgressBar = document.getElementById('budget-progress-bar');
    const budgetPercentage = document.getElementById('budget-percentage');
    const summarySpent = document.getElementById('summary-spent');
    const summaryBudget = document.getElementById('summary-budget');
    const summaryRemaining = document.getElementById('summary-remaining');

    // Oblicz sumy
    const totalBudget = Object.values(budgets).reduce((sum, amount) => sum + amount, 0);
    const totalSpentInBudget = Object.keys(budgets).reduce((sum, cat) => sum + (spending[cat] || 0), 0);
    const totalRemaining = totalBudget - totalSpentInBudget;
    const percentage = totalBudget > 0 ? (totalSpentInBudget / totalBudget) * 100 : 0;

    // Znajdź wydatki bez budżetu
    const unbudgetedCategories = Object.keys(spending).filter(cat => !budgets[cat]);
    const unbudgetedAmount = unbudgetedCategories.reduce((sum, cat) => sum + spending[cat], 0);

    // Aktualizuj wartości
    summarySpent.textContent = `${totalSpentInBudget.toFixed(2)} zł`;
    summaryBudget.textContent = `${totalBudget.toFixed(2)} zł`;
    summaryRemaining.textContent = `${totalRemaining.toFixed(2)} zł`;
    budgetPercentage.textContent = `${percentage.toFixed(0)}%`;
    budgetProgressBar.style.width = `${percentage}%`;

    // Kolor dla paska postępu i pozostałej kwoty
    if (percentage > 100) {
        budgetProgressBar.classList.remove('bg-green-600');
        budgetProgressBar.classList.add('bg-red-600');
        summaryRemaining.classList.remove('text-gray-900', 'dark:text-white');
        summaryRemaining.classList.add('text-red-600', 'dark:text-red-400');
    } else {
        budgetProgressBar.classList.remove('bg-red-600');
        budgetProgressBar.classList.add('bg-green-600');
        summaryRemaining.classList.remove('text-red-600', 'dark:text-red-400');
        summaryRemaining.classList.add('text-gray-900', 'dark:text-white');
    }

    // Pokaż/ukryj wydatki bez budżetu
    if (unbudgetedAmount > 0) {
        unbudgetedAmountEl.textContent = `${unbudgetedAmount.toFixed(2)} zł`;
        unbudgetedCategoriesEl.textContent = `Kategorie: ${unbudgetedCategories.map(cat => cat.charAt(0).toUpperCase() + cat.slice(1)).join(', ')}`;
        unbudgetedExpensesEl.classList.remove('hidden');
    } else {
        unbudgetedExpensesEl.classList.add('hidden');
    }

    // Pokaż podsumowanie tylko jeśli jest budżet
    if (totalBudget > 0 || unbudgetedAmount > 0) {
        summaryContainer.classList.remove('hidden');
    } else {
        summaryContainer.classList.add('hidden');
    }
}

// --- Logika Wydatków Cyklicznych ---
async function renderRecurringExpenses() {
    try {
        const expenses = await apiCall('/api/recurring-expenses');
        recurringExpensesList.innerHTML = expenses.map(exp => `
            <div class="flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700">
                <div>
                    <p class="font-semibold text-gray-900 dark:text-white">${exp.name}</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">${exp.amount.toFixed(2)} zł, kategoria: ${exp.category}, dzień: ${exp.dayOfMonth}</p>
                </div>
                <button data-id="${exp.id}" class="delete-recurring-btn p-1 text-red-500 hover:text-red-700" title="Usuń">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                </button>
            </div>
        `).join('');
    } catch (error) {
        recurringExpensesList.innerHTML = `<p class="text-red-500">Nie udało się załadować wydatków cyklicznych.</p>`;
    }
}

async function handleAddRecurringExpense(e) {
    e.preventDefault();
    const data = {
        name: recurringName.value,
        amount: recurringAmount.value,
        category: recurringCategory.value,
        dayOfMonth: recurringDay.value
    };

    try {
        await apiCall('/api/recurring-expenses', 'POST', data);
        addRecurringExpenseForm.reset();
        renderRecurringExpenses();
    } catch (error) {
        alert('Błąd dodawania wydatku: ' + error.message);
    }
}

async function handleDeleteRecurringExpense(e) {
    const deleteBtn = e.target.closest('.delete-recurring-btn');
    if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        if (confirm('Czy na pewno chcesz usunąć ten wydatek cykliczny?')) {
            try {
                await apiCall(`/api/recurring-expenses/${id}`, 'DELETE');
                renderRecurringExpenses();
            } catch (error) {
                alert('Błąd usuwania wydatku: ' + error.message);
            }
        }
    }
}
