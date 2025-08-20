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
        document.getElementById('interactive-legend-container').classList.add('hidden');
        document.getElementById('budget-progress-container').innerHTML = ''; // Wyczyść paski postępu
        document.getElementById('budget-summary-container').classList.add('hidden'); // Ukryj podsumowanie
        return;
    };

    const [year, month] = selectedMonth.split('-');

    const [stats, budgetData] = await Promise.all([
        apiCall(`/api/statistics?year=${year}&month=${month}`),
        apiCall(`/api/budgets/${year}/${month}`)
    ]);

    const spendingByCategory = stats.spendingByCategory;
    const budgets = budgetData.budgets || {};

    renderBudgetProgress(spendingByCategory, budgets);
    renderBudgetSummary(spendingByCategory, budgets);

    const ctx = document.getElementById('category-chart').getContext('2d');
    const labels = Object.keys(spendingByCategory);
    const data = Object.values(spendingByCategory);
    const total = data.reduce((a, b) => a + b, 0);
    const backgroundColors = labels.map(label => getCategoryColor(label));

    if (categoryChart) categoryChart.destroy();

    if (labels.length === 0) {
        noDataPieChart.classList.remove('hidden');
        categoryChartContainer.classList.add('hidden');
        document.getElementById('interactive-legend-container').classList.add('hidden');
    } else {
        noDataPieChart.classList.add('hidden');
        categoryChartContainer.classList.remove('hidden');
        
        categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
                datasets: [{ 
                    data, 
                    backgroundColor: backgroundColors,
                    borderWidth: 2,
                    borderColor: document.body.classList.contains('dark') ? '#1f2937' : '#f9fafb'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    const percentage = (context.parsed / total * 100).toFixed(2);
                                    label += `${new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(context.parsed)} (${percentage}%)`;
                                }
                                return label;
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'doughnut-center-text',
                beforeDraw: function(chart) {
                    const { width, height, ctx } = chart;
                    ctx.restore();
                    const fontSize = (height / 120).toFixed(2);
                    ctx.font = `bold ${fontSize}em sans-serif`;
                    ctx.textBaseline = 'middle';

                    const text = `${total.toFixed(2)} zł`;
                    const textX = Math.round((width - ctx.measureText(text).width) / 2);
                    const textY = height / 2;
                    
                    ctx.fillStyle = document.body.classList.contains('dark') ? 'white' : '#1f2937';
                    ctx.fillText(text, textX, textY);
                    ctx.save();
                }
            }]
        });
        renderInteractiveLegend(categoryChart, total);
    }
    await renderShopBarChart();
}

function renderInteractiveLegend(chart, total) {
    const legendContainer = document.getElementById('interactive-legend-container');
    const { labels, datasets } = chart.data;
    const originalBorderWidths = datasets[0].borderWidth;
    let highlightedIndex = -1;

    if (window.innerWidth >= 1024) {
        legendContainer.classList.remove('hidden');
    }

    const sortedData = labels.map((label, index) => ({
        label: label,
        value: datasets[0].data[index],
        color: datasets[0].backgroundColor[index],
        percentage: total > 0 ? (datasets[0].data[index] / total * 100).toFixed(2) : 0
    })).sort((a, b) => b.value - a.value);

    legendContainer.innerHTML = `
        <ul class="space-y-1 pr-2">
            ${sortedData.map(item => {
                const originalIndex = labels.indexOf(item.label);
                return `
                <li data-index="${originalIndex}" class="flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    <div class="flex items-center truncate">
                        <span class="w-3 h-3 rounded-full mr-3 flex-shrink-0" style="background-color: ${item.color}"></span>
                        <span class="font-medium text-gray-800 dark:text-gray-200 truncate" title="${item.label}">${item.label}</span>
                    </div>
                    <div class="text-right flex-shrink-0 ml-2">
                        <p class="font-bold text-sm text-gray-900 dark:text-white">${item.value.toFixed(2)} zł</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">${item.percentage}%</p>
                    </div>
                </li>
            `}).join('')}
        </ul>
    `;

    const highlightSegment = (index) => {
        if (highlightedIndex === index) return;

        const newBorderWidths = Array(chart.data.labels.length).fill(originalBorderWidths);
        if (index !== -1) {
            newBorderWidths[index] = 8; // Highlighted border
        }
        
        chart.data.datasets[0].borderWidth = newBorderWidths;
        highlightedIndex = index;
        chart.update();
    };

    legendContainer.querySelectorAll('li').forEach(li => {
        const index = parseInt(li.dataset.index);
        if ('ontouchstart' in window) {
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                highlightSegment(index);
            });
        } else {
            li.addEventListener('mouseover', () => highlightSegment(index));
        }
    });

    if (!('ontouchstart' in window)) {
        legendContainer.addEventListener('mouseout', () => {
            highlightSegment(-1);
        });
    }
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
            const year = y.slice(-2);
            return `${m}/${year}`;
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

        const barHeight = 25;
        const chartHeight = labels.length * barHeight;
        shopChartContainer.style.height = `${Math.max(chartHeight, 200)}px`;

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
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                indexAxis: 'y',
                scales: {
                    y: {
                        ticks: {
                            color: 'white',
                            autoSkip: false
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