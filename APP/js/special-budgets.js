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
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Przejdź do Ustawień, aby dodać swój pierwszy budżet specjalny.</p>
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
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 flex flex-col justify-between">
                <div>
                    <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">${budget.name}</h3>
                    <div class="mb-2">
                        <div class="flex justify-between mb-1">
                            <span class="text-base font-medium text-gray-700 dark:text-gray-300">Postęp</span>
                            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">${budget.progress.toFixed(0)}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                            <div class="bg-blue-600 h-4 rounded-full" style="width: ${budget.progress}%"></div>
                        </div>
                    </div>
                    <div class="mt-4 grid grid-cols-3 gap-4 text-center">
                        <div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Budżet</p>
                            <p class="text-lg font-bold text-gray-900 dark:text-white">${budget.amount.toFixed(2)} zł</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Wydano</p>
                            <p class="text-lg font-bold text-blue-600 dark:text-blue-400">${budget.spent.toFixed(2)} zł</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Pozostało</p>
                            <p class="text-lg font-bold text-green-600 dark:text-green-400">${budget.remaining.toFixed(2)} zł</p>
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

    tabContent.innerHTML = `<div class="flex justify-center"><div class="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">${budgetCards}</div></div>`;

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
                        backgroundColor: chartData.map(d => getCategoryColor(d[0])),
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
