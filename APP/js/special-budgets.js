// Tracker Wydatków - Special Budgets Tab Functions

function renderSpecialBudgetsTab() {
    const tabContent = document.getElementById('special-budgets-tab');
    if (!tabContent) return;

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

    const budgetCards = allSpecialBudgets.map(budget => {
        const spent = allPurchases
            .filter(p => p.specialBudgetId === budget.id)
            .reduce((sum, p) => sum + p.totalAmount, 0);
        
        const remaining = budget.amount - spent;
        const progress = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

        return `
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">${budget.name}</h3>
                <div class="mb-2">
                    <div class="flex justify-between mb-1">
                        <span class="text-base font-medium text-gray-700 dark:text-gray-300">Postęp</span>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">${progress.toFixed(0)}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
                        <div class="bg-blue-600 h-4 rounded-full" style="width: ${progress}%"></div>
                    </div>
                </div>
                <div class="mt-4 grid grid-cols-3 gap-4 text-center">
                    <div>
                        <p class="text-sm text-gray-600 dark:text-gray-400">Budżet</p>
                        <p class="text-lg font-bold text-gray-900 dark:text-white">${budget.amount.toFixed(2)} zł</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600 dark:text-gray-400">Wydano</p>
                        <p class="text-lg font-bold text-blue-600 dark:text-blue-400">${spent.toFixed(2)} zł</p>
                    </div>
                    <div>
                        <p class="text-sm text-gray-600 dark:text-gray-400">Pozostało</p>
                        <p class="text-lg font-bold text-green-600 dark:text-green-400">${remaining.toFixed(2)} zł</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    tabContent.innerHTML = `<div class="flex justify-center"><div class="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">${budgetCards}</div></div>`;
}
