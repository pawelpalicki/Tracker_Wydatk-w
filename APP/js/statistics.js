// Tracker Wydatków - Statistics Functions

let legendMouseoutHandler = null;
let timeChartMode = 'week'; // 'week' lub 'day'
let currentMonthlyPurchases = [];

// --- Logika Statystyk ---
async function renderStatistics() {
    try {
        const initialStats = await apiCall('/api/statistics');
        populateMonthSelector(initialStats.availableMonths);
        await updateCategoryPieChart();

        setupTimeChartListeners();
        renderTimeChart(); // Nowy wykres w czasie (zastępuje comparison)

        await renderShopBarChart();
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

    // Zawsze sortuj malejąco (najnowsze miesiące na górze), niezależnie od kolejności z backendu
    const sortedMonths = [...availableMonths].sort().reverse();
    const currentMonth = new Date().toISOString().substring(0, 7);

    sortedMonths.forEach(monthStr => {
        const option = document.createElement('option');
        option.value = monthStr;
        const [y, m] = monthStr.split('-');
        option.textContent = new Date(y, m - 1).toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
        // Zaznacz bieżący miesiąc lub najnowszy dostępny
        if (monthStr === currentMonth) {
            option.selected = true;
        }
        statsMonthSelect.appendChild(option);
    });

    // Jeśli bieżący miesiąc nie jest w liście, wybierz pierwszy (najnowszy)
    if (!sortedMonths.includes(currentMonth)) {
        statsMonthSelect.options[0].selected = true;
    }
}

async function updateCategoryPieChart() {
    Chart.register(ChartDataLabels);
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

    // Fetch purchases for Time Chart
    // WAŻNE: nie konwertuj przez new Date().toISOString() - to przesuwa czas do UTC i zmienia datę!
    // Użyj daty bezpośrednio jako string w formacie YYYY-MM-DD
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = `${year}-${month.padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const { purchases } = await apiCall(`/api/purchases?startDate=${startDate}&endDate=${endDate}`);
    currentMonthlyPurchases = purchases.filter(p => !p.specialBudgetId);

    renderTimeChart();

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
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 0,
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
                    },
                    datalabels: {
                        display: function (context) {
                            const value = context.dataset.data[context.dataIndex];
                            const total = context.chart.getDatasetMeta(0).total;
                            const percentage = (value / total) * 100;
                            // Ukryj etykietę, jeśli jest za mała lub gdy tooltip jest aktywny dla tego segmentu
                            const activeElements = context.chart.getActiveElements();
                            if (activeElements.length > 0) {
                                if (activeElements[0].datasetIndex === context.datasetIndex && activeElements[0].index === context.dataIndex) {
                                    return false;
                                }
                            }
                            return percentage > 4;
                        },
                        formatter: (value, context) => {
                            const label = context.chart.data.labels[context.dataIndex];
                            const total = context.chart.getDatasetMeta(0).total;
                            const percentage = (value / total * 100).toFixed(1) + '%';
                            return label + '\n' + percentage;
                        },
                        color: '#fff',
                        textAlign: 'center',
                        font: {
                            weight: 'bold',
                            size: 11
                        }
                    }
                }
            },
            plugins: [{
                id: 'doughnut-center-text',
                beforeDraw: function (chart) {
                    const { width, height, ctx } = chart;
                    ctx.restore();

                    // Calculate available space in the middle (cutout)
                    const innerRadius = chart.getDatasetMeta(0).data[0].innerRadius;
                    const maxTextWidth = innerRadius * 2 * 0.9; // 90% of inner diameter

                    const text = `${total.toFixed(2)} zł`;

                    // Dynamic font size calculation
                    let fontSize = (height / 150).toFixed(2);
                    ctx.font = `bold ${fontSize}em sans-serif`;

                    // Ensure text fits within maxTextWidth
                    let textWidth = ctx.measureText(text).width;
                    if (textWidth > maxTextWidth) {
                        fontSize = (fontSize * (maxTextWidth / textWidth)).toFixed(2);
                        ctx.font = `bold ${fontSize}em sans-serif`;
                    }

                    ctx.textBaseline = 'middle';
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
                <li data-index="${originalIndex}" data-label="${item.label.toLowerCase()}" class="flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer transition-colors select-none">
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
        if (!chart || chart.destroyed) return; // <-- THE FIX
        // Aktualizuj podświetlenie na wykresie
        const newBorderWidths = Array(chart.data.labels.length).fill(originalBorderWidths);
        if (index !== -1) {
            newBorderWidths[index] = 8;
        }
        chart.data.datasets[0].borderWidth = newBorderWidths;
        chart.update('none');

        // Aktualizuj podświetlenie tła w legendzie
        const listItems = legendContainer.querySelectorAll('li');
        listItems.forEach(li => {
            li.classList.remove('bg-gray-200', 'dark:bg-gray-700');
            if (parseInt(li.dataset.index) === index) {
                li.classList.add('bg-gray-200', 'dark:bg-gray-700');
            }
        });
    };

    const openDetailsModal = async (label) => {
        const selectedMonth = statsMonthSelect.value;
        const [year, month] = selectedMonth.split('-');
        try {
            const { items } = await apiCall(`/api/statistics/category-details?year=${year}&month=${month}&category=${label}`);
            renderCategoryDetailsModal(label, items);
        } catch (error) {
            alert('Błąd pobierania szczegółów kategorii: ' + error.message);
        }
    };

    legendContainer.querySelectorAll('li').forEach(li => {
        const index = parseInt(li.dataset.index);
        const label = li.dataset.label;

        if ('ontouchstart' in window) {
            let pressTimer;
            let longPress = false;
            li.addEventListener('touchstart', (e) => {
                longPress = false;
                pressTimer = window.setTimeout(() => {
                    longPress = true;
                    highlightSegment(index); // DODANE: Podświetl przy długim przytrzymaniu
                    openDetailsModal(label);
                }, 500);
            }, { passive: true });
            li.addEventListener('touchend', (e) => {
                clearTimeout(pressTimer);
                if (!longPress) {
                    e.preventDefault();
                    highlightSegment(index);
                }
            });
            li.addEventListener('touchmove', () => clearTimeout(pressTimer));
        } else {
            li.addEventListener('mouseover', () => highlightSegment(index));
            li.addEventListener('click', () => openDetailsModal(label));
        }
    });

    // Remove the old listener before adding a new one
    if (legendMouseoutHandler) {
        legendContainer.removeEventListener('mouseout', legendMouseoutHandler);
    }

    if (!('ontouchstart' in window)) {
        legendMouseoutHandler = () => {
            highlightSegment(-1);
        };
        legendContainer.addEventListener('mouseout', legendMouseoutHandler);
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

// --- Wydatki w czasie (Time Chart) ---
function setupTimeChartListeners() {
    const weekBtn = document.getElementById('time-chart-week-btn');
    const dayBtn = document.getElementById('time-chart-day-btn');
    if (!weekBtn || !dayBtn) return;

    if (!weekBtn.hasAttribute('data-listener')) {
        weekBtn.addEventListener('click', () => {
            timeChartMode = 'week';
            weekBtn.classList.replace('text-gray-400', 'text-white');
            weekBtn.classList.replace('hover:text-white', 'shadow');
            weekBtn.classList.add('bg-white/10', 'font-medium');

            dayBtn.classList.replace('text-white', 'text-gray-400');
            dayBtn.classList.replace('shadow', 'hover:text-white');
            dayBtn.classList.remove('bg-white/10', 'font-medium');

            renderTimeChart();
        });
        weekBtn.setAttribute('data-listener', 'true');
    }

    if (!dayBtn.hasAttribute('data-listener')) {
        dayBtn.addEventListener('click', () => {
            timeChartMode = 'day';
            dayBtn.classList.replace('text-gray-400', 'text-white');
            dayBtn.classList.replace('hover:text-white', 'shadow');
            dayBtn.classList.add('bg-white/10', 'font-medium');

            weekBtn.classList.replace('text-white', 'text-gray-400');
            weekBtn.classList.replace('shadow', 'hover:text-white');
            weekBtn.classList.remove('bg-white/10', 'font-medium');

            renderTimeChart();
        });
        dayBtn.setAttribute('data-listener', 'true');
    }
}

function renderTimeChart() {
    const container = document.getElementById('time-chart-container');
    const noData = document.getElementById('no-data-time-chart');
    const ctx = document.getElementById('time-chart')?.getContext('2d');

    if (!container || !noData || !ctx) return;

    if (window.timeChartInstance) {
        window.timeChartInstance.destroy();
    }

    if (!currentMonthlyPurchases || currentMonthlyPurchases.length === 0) {
        container.classList.add('hidden');
        noData.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    noData.classList.add('hidden');

    let labels = [];
    let dataSeries = [];

    const selectedMonth = document.getElementById('stats-month-select').value;
    const [y, m] = selectedMonth.split('-');
    const endOfMonth = new Date(y, m, 0).getDate();

    if (timeChartMode === 'week') {
        const weekLabels = ['1-7', '8-14', '15-21', '22-28'];
        if (endOfMonth > 28) {
            weekLabels.push(`29-${endOfMonth}`);
        }

        const weeks = {};
        weekLabels.forEach(l => weeks[l] = 0);

        currentMonthlyPurchases.forEach(p => {
            // Parsuj datę bezpośrednio ze stringa aby uniknąć przesunięcia strefy czasowej
            const day = parseInt(p.date.split('-')[2], 10);
            const weekNum = Math.ceil(day / 7);
            const idx = Math.min(weekNum - 1, weekLabels.length - 1);
            weeks[weekLabels[idx]] += p.totalAmount || 0;
        });

        labels = weekLabels;
        dataSeries = labels.map(l => weeks[l] || 0);

    } else {
        // Agregacja dzienna
        const days = {};

        for (let i = 1; i <= endOfMonth; i++) {
            days[i] = 0;
        }

        currentMonthlyPurchases.forEach(p => {
            // Parsuj datę bezpośrednio ze stringa aby uniknąć przesunięcia strefy czasowej
            const day = parseInt(p.date.split('-')[2], 10);
            days[day] += p.totalAmount || 0;
        });

        labels = Object.keys(days);
        dataSeries = Object.values(days);
    }

    const showDatalabels = (timeChartMode === 'week');

    window.timeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(l => isNaN(l) ? l : `${l}.`),
            datasets: [{
                data: dataSeries,
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(context.parsed.y)
                    }
                },
                datalabels: {
                    display: showDatalabels,
                    color: 'white',
                    anchor: 'end',
                    align: 'top',
                    offset: 4,
                    formatter: (value) => value > 0 ? Math.round(value) + ' zł' : '',
                    font: { size: 10, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        font: { size: 10 },
                        callback: (value) => Math.round(value) + ' zł'
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        font: { size: 10 }
                    },
                    grid: { display: false }
                }
            },
            layout: {
                padding: { top: 20 }
            }
        }
    });
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
                resizeDelay: 0,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        display: context => context.dataset.data[context.dataIndex] > 0,
                        color: '#fff',
                        anchor: 'end',
                        align: 'end',
                        formatter: (value) => value.toFixed(2) + ' zł',
                        overlap: false,
                        clamp: true
                    }
                },
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
                        suggestedMax: Math.max(...data) * 1.20,
                        ticks: { color: 'white' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    }
                }
            }
        });
    }
}