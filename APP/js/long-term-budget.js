// Tracker Wydatków - Long-term Budget Analysis Functions

let longTermBudgetChart;
let longTermBudgetInitialized = false;

let currentComparisonCategory = null;

// Helper dla customowych pickerów miesięcy (długoterminowa analiza zakresu)
function initCustomMonthPicker(btnId, popupId, labelId, inputId, defaultVal, availableMonths) {
    const btn = document.getElementById(btnId);
    const popup = document.getElementById(popupId);
    const label = document.getElementById(labelId);
    const input = document.getElementById(inputId);
    if (!btn || !popup || !label || !input) return;

    const monthNames = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
    popup.innerHTML = '';

    let monthsToDisplay = availableMonths && availableMonths.length > 0 ? availableMonths : [];
    if (monthsToDisplay.length === 0) {
        const today = new Date();
        monthsToDisplay = [`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`];
    }

    monthsToDisplay.forEach(valStr => {
        const [yy, mm] = valStr.split('-');
        const labelStr = `${monthNames[parseInt(mm, 10) - 1]} ${yy}`;
        const option = document.createElement('button');
        option.className = 'w-full text-left px-3 py-2 rounded-lg text-sm text-white hover:bg-white/10 transition-colors';
        option.textContent = labelStr;
        option.onclick = (e) => {
            e.stopPropagation();
            input.value = valStr;
            label.textContent = labelStr;
            popup.classList.add('hidden');
        };
        popup.appendChild(option);
    });

    const setDisplay = (val) => {
        if (!val) return;
        const [yy, mm] = val.split('-');
        label.textContent = `${monthNames[parseInt(mm, 10) - 1]} ${yy}`;
        input.value = val;
    };
    setDisplay(defaultVal);

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        popup.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
        if (!popup.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            popup.classList.add('hidden');
        }
    });
}

// --- Funkcje analizy długoterminowej ---
async function initializeLongTermBudget() {
    // Rejestrujemy wtyczkę, aby mieć pewność, że jest dostępna
    Chart.register(ChartDataLabels);

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

    // Pobierz dostępne miesiące (korzystamy z globalnej zmiennej jeśli jest, albo pobieramy API)
    let availableMonths = window.availableMonthsListGlobal || [];
    if (availableMonths.length === 0) {
        try {
            const stats = await apiCall('/api/statistics');
            if (stats.availableMonths) {
                availableMonths = [...stats.availableMonths].sort().reverse();
                window.availableMonthsListGlobal = availableMonths;
            }
        } catch (e) {
            console.error("Błąd pobierania miesięcy", e);
        }
    }

    // Ustaw domyślne daty dla zakresu niestandardowego
    const currentMonth = availableMonths.length > 0 ? availableMonths[0] : new Date().toISOString().substring(0, 7);
    const sixMonthsAgo = availableMonths.length > 5 ? availableMonths[5] : (availableMonths[availableMonths.length - 1] || currentMonth);

    initCustomMonthPicker('custom-start-btn', 'custom-start-popup', 'custom-start-label', 'custom-start-month', sixMonthsAgo, availableMonths);
    initCustomMonthPicker('custom-end-btn', 'custom-end-popup', 'custom-end-label', 'custom-end-month', currentMonth, availableMonths);

    // Custom Dropdown dla periodTypeSelect
    const periodTypeBtn = document.getElementById('period-type-btn');
    const periodTypeLabel = document.getElementById('period-type-label');
    const periodTypePopup = document.getElementById('period-type-popup');
    const periodOptionBtns = document.querySelectorAll('.period-option-btn');

    if (periodTypeBtn && periodTypePopup && periodTypeLabel) {
        periodTypeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            periodTypePopup.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!periodTypePopup.contains(e.target) && e.target !== periodTypeBtn && !periodTypeBtn.contains(e.target)) {
                periodTypePopup.classList.add('hidden');
            }
        });
        periodOptionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                periodTypeSelect.value = btn.dataset.value;
                periodTypeLabel.textContent = btn.textContent;
                periodTypePopup.classList.add('hidden');
                handlePeriodTypeChange();
                // Opcjonalnie wywołaj zmianę, ale handlePeriodTypeChange robi to co trzeba
            });
        });
        const initOpt = periodTypeSelect.querySelector(`option[value="${periodTypeSelect.value}"]`);
        if (initOpt) periodTypeLabel.textContent = initOpt.textContent;
    }

    // Event listenery
    periodTypeSelect.addEventListener('change', handlePeriodTypeChange);
    refreshBtn.addEventListener('click', renderLongTermBudgetAnalysis);
    if (toggleMonthlyDetails) {
        toggleMonthlyDetails.addEventListener('click', toggleMonthlyDetailsTable);
    }

    // Oznacz jako zainicjalizowane
    longTermBudgetInitialized = true;

    // Załaduj domyślne dane budżetów
    await renderLongTermBudgetAnalysis();

    // Inicjalizacja wykresu porównawczego
    await initializeComparisonChart(availableMonths);
}

async function initializeComparisonChart(availableMonths = []) {
    const periodSelect = document.getElementById('comparison-period-select');
    const yearSelect = document.getElementById('comparison-year-select');
    const yearWrapper = document.getElementById('comparison-year-wrapper');
    const modeToggle = document.getElementById('comparison-mode-toggle');
    const segmentBtns = document.querySelectorAll('.segment-btn');

    const yearBtn = document.getElementById('comparison-year-dropdown-btn');
    const yearPopup = document.getElementById('comparison-year-popup');
    const yearLabel = document.getElementById('comparison-year-label');

    if (!periodSelect || !yearSelect || !modeToggle) return;

    // Generowanie dostępnych lat na podstawie availableMonths
    let availableYears = [];
    if (availableMonths && availableMonths.length > 0) {
        const yearsSet = new Set(availableMonths.map(m => m.split('-')[0]));
        availableYears = Array.from(yearsSet).map(Number).sort((a, b) => b - a);
    }
    if (availableYears.length === 0) {
        availableYears = [new Date().getFullYear()];
    }

    let currentSelYear = availableYears[0];
    yearSelect.innerHTML = availableYears.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSelect.value = currentSelYear;

    const renderChart = () => {
        const mode = periodSelect.value;
        const isMtd = modeToggle.checked ? 'mtd' : 'full';
        renderComparisonBarChart(isMtd, mode, currentSelYear);
    };

    if (yearBtn && yearPopup && yearLabel) {
        yearPopup.innerHTML = availableYears.map(y =>
            `<button class="year-option-btn w-full text-center px-3 py-2 rounded-lg text-sm text-white hover:bg-white/10 transition-colors" data-value="${y}">${y}</button>`
        ).join('');
        yearLabel.textContent = currentSelYear;

        yearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            yearPopup.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!yearPopup.contains(e.target) && e.target !== yearBtn && !yearBtn.contains(e.target)) {
                yearPopup.classList.add('hidden');
            }
        });

        yearPopup.querySelectorAll('.year-option-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentSelYear = parseInt(btn.dataset.value, 10);
                yearLabel.textContent = currentSelYear;
                yearSelect.value = currentSelYear;
                yearPopup.classList.add('hidden');
                renderChart();
            });
        });
    }

    // Segments Logic
    segmentBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            segmentBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            periodSelect.value = e.target.dataset.value;
            handlePeriodChange();
            renderChart();
        });
    });

    const handlePeriodChange = () => {
        if (periodSelect.value === 'year') {
            if (yearWrapper) yearWrapper.classList.remove('hidden');
            else yearSelect.classList.remove('hidden');
        } else {
            if (yearWrapper) yearWrapper.classList.add('hidden');
            else yearSelect.classList.add('hidden');
        }
    };

    periodSelect.addEventListener('change', () => {
        handlePeriodChange();
        renderChart();
    });

    yearSelect.addEventListener('change', (e) => {
        currentSelYear = parseInt(e.target.value, 10);
        if (yearLabel) yearLabel.textContent = currentSelYear;
        renderChart();
    });

    modeToggle.addEventListener('change', renderChart);

    handlePeriodChange();
    renderChart();
}

async function renderComparisonBarChart(mtdMode, periodMode, selectedYear) {
    const container = document.getElementById('comparison-chart-container');
    const noData = document.getElementById('no-data-bar-chart');
    if (!container || !noData) return;

    // The backend uses mode = '6months', 'year', 'mtd' or 'full'.
    // If we want mtd AND 6months, wait, the backend currently accepts ONLY ONE mode.
    // Let's modify the apiCall slightly. We can pass period & mtd natively if we update frontend logic.
    // Wait, the backend currently checks if `mode==='mtd'`, if `mode==='6months'`, etc.
    // So if it's '6months', it will NOT do 'mtd'.
    // We should pass them separately. Let's send `mode=${periodMode}` and `mtd=${mtdMode==='mtd'}` if needed, or update backend?
    // Actually, in the backend I wrote: `if (mode === 'mtd')`.
    // It's fine for now, we'll just send mode=periodMode if not MTD, or mode='mtd' if MTD? No, that breaks period bounds!
    // Let me use query strings `mode=${isMtd}` and `period=${periodMode}` if I update backend later, but for now fallback to:

    let url = `/api/statistics/comparison?mode=${periodMode}`;
    if (periodMode === 'year' && selectedYear) {
        url += `&year=${selectedYear}`;
    }
    // Append a custom mtd param to the backend
    if (mtdMode === 'mtd') {
        url += `&mtd=true`; // I will update backend to read custom 'mtd' param shortly.
    }

    if (currentComparisonCategory) {
        url += `&category=${encodeURIComponent(currentComparisonCategory)}`;
    }

    try {
        const stats = await apiCall(url);
        const ctx = document.getElementById('comparison-chart').getContext('2d');
        const currentDay = new Date().getDate();

        renderComparisonCategoryFilters(mtdMode, periodMode, selectedYear);

        const textColor = '#e5e7eb';
        const gridColor = 'rgba(255, 255, 255, 0.1)';
        const mutedTextColor = '#9ca3af';

        if (comparisonChart) comparisonChart.destroy();

        if (!stats.monthlyTotals || stats.monthlyTotals.length === 0) {
            noData.classList.remove('hidden');
            container.classList.add('hidden');
        } else {
            noData.classList.add('hidden');
            container.classList.remove('hidden');
            const labels = stats.monthlyTotals.map(item => {
                const [y, m] = item.month.split('-');
                return `${m}/${y.slice(-2)}`;
            });
            const data = stats.monthlyTotals.map(item => item.total);

            // Pobierz kolor z głównego skryptu jeśli dostępny, lub użyj domyślnego
            const barColor = currentComparisonCategory ? window.getCategoryColor(currentComparisonCategory) : '#3B82F6';
            const titleStr = currentComparisonCategory
                ? `Porównanie: ${currentComparisonCategory}`
                : 'Suma wydatków';

            const datasetLabel = mtdMode === 'mtd' ? `Wydano (do ${currentDay}. dnia)` : titleStr;

            // Ustawienie dynamicznego tytułu nad wykresem
            const titleElement = document.getElementById('comparison-chart-title');
            if (titleElement) {
                if (currentComparisonCategory) {
                    titleElement.textContent = `Porównanie: ${currentComparisonCategory.charAt(0).toUpperCase() + currentComparisonCategory.slice(1)}`;
                } else if (mtdMode === 'mtd') {
                    titleElement.textContent = `Porównanie do ${currentDay}. dnia miesiąca`;
                } else {
                    titleElement.textContent = 'Pełne sumy miesięczne';
                }
            }

            comparisonChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: datasetLabel,
                        data,
                        backgroundColor: barColor,
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
                                label: function (context) { return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(context.parsed.y); }
                            }
                        },
                        datalabels: {
                            display: context => context.dataset.data[context.dataIndex] > 0 && data.length <= 8,
                            color: textColor,
                            anchor: 'end',
                            align: 'top',
                            offset: 2,
                            formatter: (value) => Math.round(value) + ' zł',
                            font: { weight: 'bold', size: 10 }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            suggestedMax: Math.max(...data) * 1.2,
                            ticks: { color: mutedTextColor, callback: (v) => v + ' zł' },
                            grid: { color: gridColor }
                        },
                        x: {
                            ticks: { color: mutedTextColor },
                            grid: { display: false }
                        }
                    },
                    layout: { padding: { top: 20 } }
                }
            });
        }
    } catch (e) {
        console.error("Błąd wykresu porównawczego:", e);
    }
}

async function renderComparisonCategoryFilters(mtdMode, periodMode, selectedYear) {
    const filterContainer = document.getElementById('comparison-category-filters');
    if (!filterContainer) return;

    let categories = window.allCategories || [];
    if (categories.length === 0) {
        try { categories = await apiCall('/api/categories'); } catch (e) { }
    }

    let html = `<button class="filter-chip px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-200 ${!currentComparisonCategory ? 'bg-brand-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}" data-category="all">Wszystkie</button>`;

    categories.forEach(cat => {
        const isSelected = currentComparisonCategory === cat;
        html += `<button class="filter-chip px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-200 ${isSelected ? 'bg-brand-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}" data-category="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</button>`;
    });

    filterContainer.innerHTML = html;

    filterContainer.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const cat = e.target.dataset.category;
            currentComparisonCategory = cat === 'all' ? null : cat;
            renderComparisonBarChart(mtdMode, periodMode, selectedYear);
        });
    });

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

        let endYear = today.getFullYear();
        let endMonth = today.getMonth(); // 0-indexed current month

        // Adjust to the last day of the previous month
        if (endMonth === 0) { // If current month is January
            endMonth = 11; // Previous month is December
            endYear--;     // Previous year
        } else {
            endMonth--; // Previous month
        }

        // endMonth is now 0-indexed month of the *previous* month (e.g., 10 for November if today is December)
        // endYear is the year of that previous month

        let startYear = endYear;
        let startMonth = endMonth - monthsBack + 1; // Calculate start month index

        if (startMonth < 0) {
            startYear += Math.floor(startMonth / 12); // Adjust year if startMonth goes into previous year
            startMonth = (startMonth % 12 + 12) % 12; // Normalize month to 0-11 range
        }

        const startMonthStr = `${startYear}-${String(startMonth + 1).padStart(2, '0')}`; // +1 because months are 1-indexed for display
        const endMonthStr = `${endYear}-${String(endMonth + 1).padStart(2, '0')}`; // +1 because months are 1-indexed for display

        return {
            startMonth: startMonthStr,
            endMonth: endMonthStr
        };
    }
}

function generateMonthRange(startMonth, endMonth) {
    const months = [];
    const [startYear, startM] = startMonth.split('-').map(Number);
    const [endYear, endM] = endMonth.split('-').map(Number);

    let currentYear = startYear;
    let currentMonth = startM;

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endM)) {
        const monthStr = String(currentMonth).padStart(2, '0');
        months.push(`${currentYear}-${monthStr}`);

        currentMonth++;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }
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
    document.getElementById('avg-monthly-spending').textContent = formatAmount(0);
    document.getElementById('avg-monthly-budget').textContent = formatAmount(0);
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

    document.getElementById('avg-monthly-spending').textContent = formatAmount(avgMonthlySpending);
    document.getElementById('avg-monthly-budget').textContent = formatAmount(avgMonthlyBudget);
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

    // Oblicz dynamiczne minimum (zaokrąglone w dół do pełnego tysiąca)
    const allValues = [...budgetData, ...spendingData].filter(v => v > 0);
    const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
    const yAxisMin = Math.max(0, Math.floor(minVal / 1000) * 1000);

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
                    tension: 0.1,
                    pointRadius: data.length > 9 ? 2 : 4
                },
                {
                    label: 'Wydatki',
                    data: spendingData,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: false,
                    tension: 0.1,
                    pointRadius: data.length > 9 ? 2 : 4
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
                        usePointStyle: true,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            return context.dataset.label + ': ' +
                                new Intl.NumberFormat('pl-PL', {
                                    style: 'currency',
                                    currency: 'PLN',
                                    minimumFractionDigits: 2
                                }).format(context.parsed.y);
                        }
                    }
                },
                datalabels: {
                    display: context => {
                        // Jeśli mamy dużo punktów, wyświetlaj co drugi labelek dla czytelności
                        if (data.length > 9) {
                            return context.dataIndex % 2 === 0 && context.dataset.data[context.dataIndex] > 0;
                        }
                        return context.dataset.data[context.dataIndex] > 0;
                    },
                    formatter: (value) => Math.round(value) + ' zł',
                    color: 'white',
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderRadius: 4,
                    padding: 3,
                    font: {
                        weight: 'bold',
                        size: data.length > 8 ? 9 : 10
                    },
                    align: 'top',
                    anchor: 'end',
                    offset: 2,
                    clip: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: yAxisMin,
                    ticks: {
                        color: 'white',
                        font: { size: 10 },
                        callback: function (value) {
                            return Math.round(value) + ' zł';
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: 'white',
                        font: { size: 10 },
                        maxRotation: 45,
                        minRotation: 0
                    },
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
                    ${formatAmount(item.budget)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    ${formatAmount(item.spending)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm ${differenceClass}">
                    ${difference >= 0 ? '+' : ''}${formatAmount(difference)}
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
}

function renderCategoryProgressBars(data) {

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
        .sort(([, a], [, b]) => b.budget - a.budget);

    // Renderuj paski postępu
    sortedCategories.forEach(([category, totals]) => {
        const rawPercentage = totals.budget > 0 ? (totals.spending / totals.budget) * 100 : 0;
        const visualPercentage = Math.min(rawPercentage, 100);
        const remaining = totals.budget - totals.spending;

        let progressColor = 'bg-green-500';
        if (rawPercentage > 100) progressColor = 'bg-red-500';
        else if (rawPercentage > 75) progressColor = 'bg-yellow-500';

        const progressBar = document.createElement('div');
        progressBar.className = 'bg-gray-200 dark:bg-gray-600 rounded-lg p-3';
        progressBar.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-medium text-gray-900 dark:text-white">${category.charAt(0).toUpperCase() + category.slice(1)}</span>
                <span class="text-sm text-gray-600 dark:text-gray-400">${rawPercentage.toFixed(1)}%</span>
            </div>
            <div class="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2 mb-2">
                <div class="${progressColor} h-2 rounded-full transition-all duration-300" style="width: ${visualPercentage}%"></div>
            </div>
            <div class="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>Wydano: ${formatAmount(totals.spending)}</span>
                <span>Budżet: ${formatAmount(totals.budget)}</span>
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                ${remaining >= 0 ? 'Pozostało' : 'Przekroczono o'}: ${formatAmount(Math.abs(remaining))}
            </div>
        `;

        container.appendChild(progressBar);
    });
}