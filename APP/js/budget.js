// Tracker Wydatków - Budget Functions

// --- Logika Budżetowania ---
let budgetMonthValue = '';

function populateBudgetMonthSelector() {
    const today = new Date();
    budgetMonthValue = today.toISOString().substring(0, 7);
    let label = new Date(today.getFullYear(), today.getMonth()).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
    label = label.charAt(0).toUpperCase() + label.slice(1);

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
        const response = await apiCall(`/api/budgets/${year}/${month}`);
        const budgets = response.budgets || {};
        
        // Użyj kategorii nadrzędnych ze structuredCategories jeśli są dostępne, 
        // w przeciwnym razie spadnij na allCategories (płaska lista)
        let categoriesToRender = [];
        if (typeof structuredCategories !== 'undefined' && structuredCategories.length > 0) {
            categoriesToRender = structuredCategories.filter(c => !c.parentId).map(c => c.name);
        } else {
            categoriesToRender = allCategories;
        }

        budgetsList.innerHTML = categoriesToRender.map(cat => `
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
        if (document.getElementById('home-tab').classList.contains('active')) {
            if (typeof renderDashboard === 'function') renderDashboard();
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

