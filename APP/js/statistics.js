// Tracker Wydatków - Statistics Functions

// --- Logika Statystyk ---
async function renderStatistics() {
    try {
        const initialStats = await apiCall('/api/statistics');
        populateMonthSelector(initialStats.availableMonths);
        await updateCategoryPieChart();
        await renderComparisonBarChart();
        await renderShopBarChart(); // Dodane wywołanie
    } catch (error) {
        console.error("Błąd ładowania statystyk:", error);
    }
}

function populateMonthSelector(availableMonths) {
    statsMonthSelect.innerHTML = '';
    if (!availableMonths || availableMonths.length === 0) {
        statsMonthSelect.innerHTML = '<option>Brak danych</option>';
        return;
    }
    availableMonths.forEach(monthStr => {
        const option = document.createElement('option');
        option.value = monthStr;
        const [y, m] = monthStr.split('-');
        option.textContent = new Date(y, m - 1).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
        statsMonthSelect.appendChild(option);
    });
}

async function updateCategoryPieChart() {
    const selectedMonth = statsMonthSelect.value;
    if (!selectedMonth || selectedMonth === 'Brak danych') {
        noDataPieChart.classList.remove('hidden');
        categoryChartContainer.classList.add('hidden');
        document.getElementById('budget-progress-container').innerHTML = ''; // Wyczyść paski postępu
        document.getElementById('budget-summary-container').classList.add('hidden'); // Ukryj podsumowanie
        return;
    };

    const [year, month] = selectedMonth.split('-');

    // Pobierz jednocześnie statystyki wydatków i dane budżetu
    const [stats, budgetData] = await Promise.all([
        apiCall(`/api/statistics?year=${year}&month=${month}`),
        apiCall(`/api/budgets/${year}/${month}`)
    ]);

    const spendingByCategory = stats.spendingByCategory;
    const budgets = budgetData.budgets || {};

    // Renderuj paski postępu budżetu i podsumowanie
    renderBudgetProgress(spendingByCategory, budgets);
    renderBudgetSummary(spendingByCategory, budgets);

    const ctx = document.getElementById('category-chart').getContext('2d');
    const labels = Object.keys(spendingByCategory);
    const data = Object.values(spendingByCategory);
    const backgroundColors = labels.map(label => getCategoryColor(label));

    if (categoryChart) categoryChart.destroy();

    if (labels.length === 0) {
        noDataPieChart.classList.remove('hidden');
        categoryChartContainer.classList.add('hidden');
    } else {
        noDataPieChart.classList.add('hidden');
        categoryChartContainer.classList.remove('hidden');
        categoryChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
                datasets: [{ data, backgroundColor: backgroundColors }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 12,
                            padding: 15,
                            color: 'white'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }
    // Po zmianie miesiąca, zaktualizuj też wykres sklepów
    await renderShopBarChart();
}

async function handleCategoryChartClick(event) {
    if (!categoryChart) return;
    const points = categoryChart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);

    if (points.length) {
        const firstPoint = points[0];
        const label = categoryChart.data.labels[firstPoint.index].toLowerCase();
        const selectedMonth = statsMonthSelect.value;
        const [year, month] = selectedMonth.split('-');

        try {
            const { items } = await apiCall(`/api/statistics/category-details?year=${year}&month=${month}&category=${label}`);
            renderCategoryDetailsModal(label, items);
        } catch (error) {
            alert('Błąd pobierania szczegółów kategorii: ' + error.message);
        }
    }
}

async function renderComparisonBarChart() {
    const stats = await apiCall('/api/statistics/comparison');
    const ctx = document.getElementById('comparison-chart').getContext('2d');

    if (comparisonChart) comparisonChart.destroy();

    if (!stats.monthlyTotals || stats.monthlyTotals.length === 0) {
        noDataBarChart.classList.remove('hidden');
        comparisonChartContainer.classList.add('hidden');
    } else {
        noDataBarChart.classList.add('hidden');
        comparisonChartContainer.classList.remove('hidden');
        const labels = stats.monthlyTotals.map(item => {
            const [y, m] = item.month.split('-');
            return new Date(y, m - 1).toLocaleString('pl-PL', { month: 'short', year: 'numeric' });
        });
        const data = stats.monthlyTotals.map(item => item.total);

        comparisonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Suma wydatków',
                    data,
                    backgroundColor: '#3B82F6'
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        ticks: { color: 'white' },
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
}

async function renderShopBarChart() {
    const selectedMonth = statsMonthSelect.value;
    if (!selectedMonth || selectedMonth === 'Brak danych') {
        noDataShopChart.classList.remove('hidden');
        shopChartContainer.classList.add('hidden');
        return;
    };

    const [year, month] = selectedMonth.split('-');
    const stats = await apiCall(`/api/statistics/by-shop?year=${year}&month=${month}`);
    const ctx = document.getElementById('shop-chart').getContext('2d');

    if (shopChart) shopChart.destroy();

    const labels = Object.keys(stats.spendingByShop);
    const data = Object.values(stats.spendingByShop);

    if (labels.length === 0) {
        noDataShopChart.classList.remove('hidden');
        shopChartContainer.classList.add('hidden');
    } else {
        noDataShopChart.classList.add('hidden');
        shopChartContainer.classList.remove('hidden');

        // Dynamiczne ustawianie wysokości kontenera wykresu
        const barHeight = 25; // Wysokość jednego słupka w pikselach
        const chartHeight = labels.length * barHeight;
        shopChartContainer.style.height = `${Math.max(chartHeight, 200)}px`; // Minimalna wysokość 200px

        shopChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Wydatki w sklepie',
                    data,
                    backgroundColor: colorPalette
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Pozwala na niestandardowe wymiary
                plugins: { legend: { display: false } },
                indexAxis: 'y', // Wykres horyzontalny dla lepszej czytelności nazw sklepów
                scales: {
                    y: {
                        ticks: {
                            color: 'white',
                            autoSkip: false // Wyświetla wszystkie etykiety
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
}