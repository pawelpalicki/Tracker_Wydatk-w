// Tracker Wydatków - Long-term Budget Analysis Functions

let longTermBudgetChart;
let longTermBudgetInitialized = false;

// --- Funkcje analizy długoterminowej ---
async function initializeLongTermBudget() {
    // Sprawdź czy już zainicjalizowano
    if (longTermBudgetInitialized) {
        return;
    }
    
    const periodTypeSelect = document.getElementById('period-type-select');
    const customRangeContainer = document.getElementById('custom-range-container');
    const refreshBtn = document.getElementById('refresh-long-term-btn');
    const toggleMonthlyDetails = document.getElementById('toggle-monthly-details');
    const customStartMonth = document.getElementById('custom-start-month');
    const customEndMonth = document.getElementById('custom-end-month');

    // Sprawdź czy elementy istnieją
    if (!periodTypeSelect || !refreshBtn) {
        console.warn('Elementy długoterminowej analizy budżetu nie zostały znalezione');
        return;
    }

    // Ustaw domyślne daty dla zakresu niestandardowego
    const today = new Date();
    const currentMonth = today.toISOString().substring(0, 7);
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().substring(0, 7);
    
    customStartMonth.value = sixMonthsAgo;
    customEndMonth.value = currentMonth;

    // Event listenery
    periodTypeSelect.addEventListener('change', handlePeriodTypeChange);
    refreshBtn.addEventListener('click', renderLongTermBudgetAnalysis);
    if (toggleMonthlyDetails) {
        toggleMonthlyDetails.addEventListener('click', toggleMonthlyDetailsTable);
    }

    // Oznacz jako zainicjalizowane
    longTermBudgetInitialized = true;

    // Załaduj domyślne dane
    await renderLongTermBudgetAnalysis();
}

function handlePeriodTypeChange() {
    const periodType = document.getElementById('period-type-select').value;
    const customRangeContainer = document.getElementById('custom-range-container');
    
    if (periodType === 'custom') {
        customRangeContainer.classList.remove('hidden');
    } else {
        customRangeContainer.classList.add('hidden');
    }
}

function getDateRange() {
    const periodType = document.getElementById('period-type-select').value;
    const today = new Date();
    
    if (periodType === 'custom') {
        const startMonth = document.getElementById('custom-start-month').value;
        const endMonth = document.getElementById('custom-end-month').value;
        
        if (!startMonth || !endMonth) {
            throw new Error('Proszę wybrać zakres dat');
        }
        
        return { startMonth, endMonth };
    } else {
        const monthsBack = parseInt(periodType);
        const endDate = new Date(today.getFullYear(), today.getMonth(), 1);
        const startDate = new Date(today.getFullYear(), today.getMonth() - monthsBack + 1, 1);
        
        return {
            startMonth: startDate.toISOString().substring(0, 7),
            endMonth: endDate.toISOString().substring(0, 7)
        };
    }
}

function generateMonthRange(startMonth, endMonth) {
    const months = [];
    const start = new Date(startMonth + '-01');
    const end = new Date(endMonth + '-01');
    
    const current = new Date(start);
    while (current <= end) {
        months.push(current.toISOString().substring(0, 7));
        current.setMonth(current.getMonth() + 1);
    }
    
    return months;
}

async function fetchLongTermData(startMonth, endMonth) {
    const months = generateMonthRange(startMonth, endMonth);
    const promises = months.map(async (month) => {
        const [year, monthNum] = month.split('-');
        
        try {
            const [statsData, budgetData] = await Promise.all([
                apiCall(`/api/statistics?year=${year}&month=${monthNum}`),
                apiCall(`/api/budgets/${year}/${monthNum}`)
            ]);
            
            const totalSpending = Object.values(statsData.spendingByCategory || {}).reduce((sum, amount) => sum + amount, 0);
            const totalBudget = Object.values(budgetData.budgets || {}).reduce((sum, amount) => sum + amount, 0);
            
            return {
                month,
                spending: totalSpending,
                budget: totalBudget,
                spendingByCategory: statsData.spendingByCategory || {},
                budgets: budgetData.budgets || {}
            };
        } catch (error) {
            console.warn(`Brak danych dla miesiąca ${month}:`, error);
            return {
                month,
                spending: 0,
                budget: 0,
                spendingByCategory: {},
                budgets: {}
            };
        }
    });
    
    return await Promise.all(promises);
}

async function renderLongTermBudgetAnalysis() {
    try {
        const { startMonth, endMonth } = getDateRange();
        const data = await fetchLongTermData(startMonth, endMonth);
        
        // Filtruj miesiące z danymi
        const dataWithBudget = data.filter(item => item.budget > 0 || item.spending > 0);
        
        if (dataWithBudget.length === 0) {
            showNoLongTermData();
            return;
        }
        
        // Renderuj komponenty
        renderLongTermSummary(dataWithBudget);
        renderLongTermChart(dataWithBudget);
        renderCategoryProgressBars(dataWithBudget);
        renderMonthlyDetailsTable(dataWithBudget);
        
        // Pokaż kontenery
        document.getElementById('category-analysis-container').classList.remove('hidden');
        document.getElementById('monthly-details-container').classList.remove('hidden');
        document.getElementById('no-long-term-data').classList.add('hidden');
        
    } catch (error) {
        console.error('Błąd analizy długoterminowej:', error);
        alert('Błąd podczas ładowania analizy długoterminowej: ' + error.message);
        showNoLongTermData();
    }
}

function showNoLongTermData() {
    document.getElementById('no-long-term-data').classList.remove('hidden');
    document.getElementById('category-analysis-container').classList.add('hidden');
    document.getElementById('monthly-details-container').classList.add('hidden');
    
    // Wyczyść podsumowanie
    document.getElementById('avg-monthly-spending').textContent = '0.00 zł';
    document.getElementById('avg-monthly-budget').textContent = '0.00 zł';
    document.getElementById('budget-effectiveness').textContent = '0%';
    
    // Zniszcz wykres jeśli istnieje
    if (longTermBudgetChart) {
        longTermBudgetChart.destroy();
        longTermBudgetChart = null;
    }
}

function renderLongTermSummary(data) {
    const totalSpending = data.reduce((sum, item) => sum + item.spending, 0);
    const totalBudget = data.reduce((sum, item) => sum + item.budget, 0);
    const monthsCount = data.length;
    
    const avgMonthlySpending = totalSpending / monthsCount;
    const avgMonthlyBudget = totalBudget / monthsCount;
    const effectiveness = totalBudget > 0 ? ((totalBudget - totalSpending) / totalBudget) * 100 : 0;
    
    document.getElementById('avg-monthly-spending').textContent = `${avgMonthlySpending.toFixed(2)} zł`;
    document.getElementById('avg-monthly-budget').textContent = `${avgMonthlyBudget.toFixed(2)} zł`;
    document.getElementById('budget-effectiveness').textContent = `${Math.max(0, effectiveness).toFixed(0)}%`;
}

function renderLongTermChart(data) {
    const ctx = document.getElementById('long-term-budget-chart').getContext('2d');
    
    if (longTermBudgetChart) {
        longTermBudgetChart.destroy();
    }
    
    const labels = data.map(item => {
        const [year, month] = item.month.split('-');
        return new Date(year, month - 1).toLocaleString('pl-PL', { month: 'short', year: 'numeric' });
    });
    
    const budgetData = data.map(item => item.budget);
    const spendingData = data.map(item => item.spending);
    
    longTermBudgetChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Budżet',
                    data: budgetData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: false,
                    tension: 0.1
                },
                {
                    label: 'Wydatki',
                    data: spendingData,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: 'white',
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + 
                                   new Intl.NumberFormat('pl-PL', { 
                                       style: 'currency', 
                                       currency: 'PLN' 
                                   }).format(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'white',
                        callback: function(value) {
                            return new Intl.NumberFormat('pl-PL', { 
                                style: 'currency', 
                                currency: 'PLN' 
                            }).format(value);
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: { color: 'white' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });
}

function renderMonthlyDetailsTable(data) {
    const tbody = document.getElementById('monthly-details-tbody');
    
    tbody.innerHTML = data.map(item => {
        const difference = item.budget - item.spending;
        const effectiveness = item.budget > 0 ? ((item.budget - item.spending) / item.budget) * 100 : 0;
        
        const [year, month] = item.month.split('-');
        const monthName = new Date(year, month - 1).toLocaleString('pl-PL', { 
            month: 'long', 
            year: 'numeric' 
        });
        
        const differenceClass = difference >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
        const effectivenessClass = effectiveness >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
        
        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    ${monthName}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    ${item.budget.toFixed(2)} zł
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    ${item.spending.toFixed(2)} zł
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${differenceClass}">
                    ${difference >= 0 ? '+' : ''}${difference.toFixed(2)} zł
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${effectivenessClass}">
                    ${Math.max(0, effectiveness).toFixed(0)}%
                </td>
            </tr>
        `;
    }).join('');
}

function toggleMonthlyDetailsTable() {
    const table = document.getElementById('monthly-details-table');
    const toggleText = document.getElementById('toggle-monthly-text');
    const toggleIcon = document.getElementById('toggle-monthly-icon');
    
    if (table.classList.contains('hidden')) {
        table.classList.remove('hidden');
        toggleText.textContent = 'Ukryj szczegóły miesięczne';
        toggleIcon.style.transform = 'rotate(180deg)';
    } else {
        table.classList.add('hidden');
        toggleText.textContent = 'Pokaż szczegóły miesięczne';
        toggleIcon.style.transform = 'rotate(0deg)';
    }
}function renderCategoryProgressBars(data) {
    const container = document.getElementById('category-progress-bars');
    container.innerHTML = '';
    
    // Agreguj dane po kategoriach
    const categoryTotals = {};
    
    data.forEach(monthData => {
        // Budżety
        Object.keys(monthData.budgets).forEach(category => {
            if (!categoryTotals[category]) {
                categoryTotals[category] = { budget: 0, spending: 0 };
            }
            categoryTotals[category].budget += monthData.budgets[category];
        });
        
        // Wydatki
        Object.keys(monthData.spendingByCategory).forEach(category => {
            if (!categoryTotals[category]) {
                categoryTotals[category] = { budget: 0, spending: 0 };
            }
            categoryTotals[category].spending += monthData.spendingByCategory[category];
        });
    });
    
    // Sortuj kategorie według budżetu (malejąco)
    const sortedCategories = Object.entries(categoryTotals)
        .sort(([,a], [,b]) => b.budget - a.budget);
    
    // Renderuj paski postępu
    sortedCategories.forEach(([category, totals]) => {
        const percentage = totals.budget > 0 ? Math.min((totals.spending / totals.budget) * 100, 100) : 0;
        const remaining = totals.budget - totals.spending;
        
        let progressColor = 'bg-green-500';
        if (percentage > 90) progressColor = 'bg-red-500';
        else if (percentage > 75) progressColor = 'bg-yellow-500';
        
        const progressBar = document.createElement('div');
        progressBar.className = 'bg-gray-200 dark:bg-gray-600 rounded-lg p-3';
        progressBar.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-medium text-gray-900 dark:text-white">${category.charAt(0).toUpperCase() + category.slice(1)}</span>
                <span class="text-sm text-gray-600 dark:text-gray-400">${percentage.toFixed(1)}%</span>
            </div>
            <div class="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2 mb-2">
                <div class="${progressColor} h-2 rounded-full transition-all duration-300" style="width: ${percentage}%"></div>
            </div>
            <div class="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>Wydano: ${new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(totals.spending)}</span>
                <span>Budżet: ${new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(totals.budget)}</span>
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                ${remaining >= 0 ? 'Pozostało' : 'Przekroczono o'}: ${new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(Math.abs(remaining))}
            </div>
        `;
        
        container.appendChild(progressBar);
    });
}