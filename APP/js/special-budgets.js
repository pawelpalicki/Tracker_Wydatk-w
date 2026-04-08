// Tracker Wydatków - Special Budgets Tab Functions

let specialBudgetCharts = {};

function renderSpecialBudgetsTab() {
    const tabContent = document.getElementById('special-budgets-tab');
    if (!tabContent) return;

    // Zniszcz istniejące instancje wykresów, aby uniknąć wycieków pamięci
    Object.values(specialBudgetCharts).forEach(chart => chart.destroy());
    specialBudgetCharts = {};

    if (!allSpecialBudgets || allSpecialBudgets.length === 0) {
        tabContent.innerHTML = `
            <div class="text-center py-12">
                <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Brak budżetów specjalnych</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Możesz dodać budżet specjalny w ustawieniach.</p>
                <button onclick="switchTab('settings-special')" class="mt-4 px-6 py-2.5 btn-primary rounded-xl text-sm font-medium transition-all active:scale-95 shadow-lg">
                    Dodaj budżet specjalny
                </button>
            </div>
        `;
        return;
    }

    const budgetsWithData = allSpecialBudgets.map(budget => {
        const budgetPurchases = allPurchases.filter(p => p.specialBudgetId === budget.id);
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
            const ctx = document.getElementById(`chart-special-${budget.id}`).getContext('2d');
            const chartData = Object.entries(budget.spendingByCategory);

            specialBudgetCharts[budget.id] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: chartData.map(d => d[0]),
                    datasets: [{
                        data: chartData.map(d => d[1]),
                        backgroundColor: chartData.map(d => {
                            const pCat = typeof structuredCategories !== 'undefined' ? structuredCategories.find(c => c.name === d[0] && !c.parentId) : null;
                            return (pCat && pCat.color) || '#6b7280';
                        }),
                        borderColor: '#4a5568', // dark:bg-gray-700
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
                                color: '#d1d5db', // text-gray-300
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

function populateBudgetTypeSelect() {
    budgetTypeSelectValue = 'monthly';
    const label = document.getElementById('budget-type-label');
    if (label) {
        label.textContent = 'Budżet miesięczny';
    }
}

function renderSpecialBudgetsList() {
    specialBudgetsList.innerHTML = '';
    if (!allSpecialBudgets || allSpecialBudgets.length === 0) {
        specialBudgetsList.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm">Brak budżetów specjalnych. Dodaj nowy poniżej.</p>`;
        return;
    }

    allSpecialBudgets.forEach(budget => {
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

async function handleAddSpecialBudget(e) {
    e.preventDefault();
    const nameInput = document.getElementById('new-special-budget-name');
    const amountInput = document.getElementById('new-special-budget-amount');
    const name = nameInput.value.trim();
    const amount = parseFloat(amountInput.value);

    if (name && amount > 0) {
        try {
            await apiCall('/api/special-budgets', 'POST', { name, amount });
            nameInput.value = '';
            amountInput.value = '';
            await fetchInitialData(false);
        } catch (error) {
            alert('Nie udało się dodać budżetu specjalnego: ' + error.message);
        }
    }
}

async function handleSpecialBudgetActions(e) {
    const deleteBtn = e.target.closest('.delete-special-budget-btn');
    if (deleteBtn) {
        const budgetId = deleteBtn.dataset.id;
        const budget = allSpecialBudgets.find(b => b.id === budgetId);
        if (confirm(`Czy na pewno chcesz usunąć budżet "${budget.name}"?`)) {
            try {
                await apiCall(`/api/special-budgets/${budgetId}`, 'DELETE');
                await fetchInitialData(false);
            } catch (error) {
                alert('Nie udało się usunąć budżetu: ' + error.message);
            }
        }
        return; // Zatrzymaj dalsze wykonywanie
    }

    const editBtn = e.target.closest('.edit-special-budget-btn');
    if (editBtn) {
        const budgetId = editBtn.dataset.id;
        const budget = allSpecialBudgets.find(b => b.id === budgetId);
        if (budget) {
            editingSpecialBudgetId = budgetId;
            editSpecialBudgetNameInput.value = budget.name;
            editSpecialBudgetAmountInput.value = budget.amount;
            openOverlay('edit-special-budget-modal');
        }
    }
}

async function handleEditSpecialBudgetSubmit(e) {
    e.preventDefault();
    if (!editingSpecialBudgetId) return;

    const name = editSpecialBudgetNameInput.value.trim();
    const amount = parseFloat(editSpecialBudgetAmountInput.value);

    if (name && amount > 0) {
        try {
            await apiCall(`/api/special-budgets/${editingSpecialBudgetId}`, 'PUT', { name, amount });
            editSpecialBudgetModal.classList.add('hidden');
            editingSpecialBudgetId = null;
            await fetchInitialData(false);
        } catch (error) {
            alert('Nie udało się zaktualizować budżetu: ' + error.message);
        }
    }
}
