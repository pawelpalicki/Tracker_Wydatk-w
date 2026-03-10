// Tracker Wydatków - Budget Functions

let budgetDonutChart;

// --- Logika Budżetowania ---
let budgetMonthValue = '';

function populateBudgetMonthSelector() {
    const today = new Date();
    budgetMonthValue = today.toISOString().substring(0, 7);
    const label = new Date(today.getFullYear(), today.getMonth()).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });

    const labelEl = document.getElementById('budget-month-label');
    if (labelEl) labelEl.textContent = label;
}

async function renderBudgetInputs() {
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
    const [year, month] = budgetMonthValue.split('-');
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
    const [currentYear, currentMonth] = budgetMonthValue.split('-');
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

    const container = document.getElementById('budget-progress-container');
    const toggleButton = document.getElementById('toggle-budget-details');





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

    // Always show the budget progress container if we have budgets defined
    container.classList.remove('hidden');
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
    const progressBarPercentage = Math.min(percentage, 100);

    // Znajdź wydatki bez budżetu
    const unbudgetedCategories = Object.keys(spending).filter(cat => !budgets[cat]);
    const unbudgetedAmount = unbudgetedCategories.reduce((sum, cat) => sum + spending[cat], 0);

    // Aktualizuj wartości
    summarySpent.textContent = `${totalSpentInBudget.toFixed(2)} zł`;
    summaryBudget.textContent = `${totalBudget.toFixed(2)} zł`;
    summaryRemaining.textContent = `${totalRemaining.toFixed(2)} zł`;
    budgetPercentage.textContent = `${percentage.toFixed(0)}%`;
    budgetProgressBar.style.width = `${progressBarPercentage}%`;

    // Kolor dla paska postępu i pozostałej kwoty
    if (percentage > 100) {
        budgetProgressBar.classList.remove('bg-blue-600');
        budgetProgressBar.classList.add('bg-red-600');
        summaryRemaining.classList.remove('text-green-600', 'dark:text-green-400');
        summaryRemaining.classList.add('text-red-600', 'dark:text-red-400');
    } else {
        budgetProgressBar.classList.remove('bg-red-600');
        budgetProgressBar.classList.add('bg-blue-600');
        summaryRemaining.classList.remove('text-red-600', 'dark:text-red-400');
        summaryRemaining.classList.add('text-green-600', 'dark:text-green-400');
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

