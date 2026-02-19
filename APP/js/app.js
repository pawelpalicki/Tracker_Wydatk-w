// Tracker Wydatków - Main Application Functions

// --- Konfiguracja Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyCLwUZBI4N31kz4UKWmOyqNvszzygKFvWE",
    authDomain: "trackerwydatkowapp.firebaseapp.com",
    projectId: "trackerwydatkowapp",
    storageBucket: "trackerwydatkowapp.firebasestorage.app",
    messagingSenderId: "985262621512",
    appId: "1:985262621512:web:87348caca12ca4c453297d",
    measurementId: "G-SSDG9QGDL4"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Konfiguracja ---
// Używamy Firebase Functions jako API
const IS_DEVELOPMENT = false; // Zawsze używamy Firebase Functions
const API_BASE_URL = ''; // Puste, bo Firebase Hosting automatycznie przekierowuje /api/** do funkcji

// --- Stan Aplikacji ---
let allPurchases = [];
let allCategories = [];
let allShops = [];
let allSpecialBudgets = [];
let allRecurringExpenses = [];
let editingSpecialBudgetId = null;
let editingRecurringExpenseId = null; // ID for editing recurring expense
let nextPurchaseCursor = null;
let isLoadingPurchases = false;
let editMode = { active: false, purchaseId: null };
let currentFile = null;
let cameraStream = null;
let categoryChart = null;
let comparisonChart = null;
let shopChart = null;
let fp; // Declare fp globally
let fp_range; // For date range filter
let lastScrollY = 0; // For FAB scroll detection

// --- Elementy DOM ---
const loadingSection = document.getElementById('loading-section');
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const registerEmail = document.getElementById('register-email');
const registerPassword = document.getElementById('register-password');
const authTitle = document.getElementById('auth-title');
const switchAuthLink = document.getElementById('switch-auth-link');
const authErrorDiv = document.getElementById('auth-error');

// Elementy Głównej Aplikacji
const bottomNavBtns = document.querySelectorAll('.bottom-nav-btn');
const drawerNavBtns = document.querySelectorAll('.drawer-nav-btn');
const purchaseForm = document.getElementById('purchase-form');
const purchaseFormTitle = document.getElementById('purchase-form-title');
const purchaseFormSubmitBtn = purchaseForm.querySelector('button[type="submit"]');
const addItemBtn = document.getElementById('add-item-btn');
const purchasesList = document.getElementById('purchases-list');
const itemsContainer = document.getElementById('items-container');
const shopInput = document.getElementById('shop');
const dateInput = document.getElementById('date');
const categoriesList = document.getElementById('categories-list');
const addCategoryForm = document.getElementById('add-category-form');
const newCategoryInput = document.getElementById('new-category-name');
const monthlyBalanceValue = document.getElementById('monthly-balance-value');
const monthlyBalanceLabel = document.getElementById('monthly-balance-label');
const receiptFileInput = document.getElementById('receipt-file-input');
const analyzeReceiptBtn = document.getElementById('analyze-receipt-btn');
const analysisSpinner = document.getElementById('analysis-spinner');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const startCameraBtn = document.getElementById('start-camera-btn');
const cameraView = document.getElementById('camera-view');
const cameraStreamEl = document.getElementById('camera-stream');
const capturePhotoBtn = document.getElementById('capture-photo-btn');
const cancelCameraBtn = document.getElementById('cancel-camera-btn');
const purchaseSummary = document.getElementById('purchase-summary');
const statsTitle = document.getElementById('stats-title');
const statsMonthSelect = document.getElementById('stats-month-select');
const categoryChartContainer = document.getElementById('category-chart-container');
const noDataPieChart = document.getElementById('no-data-pie-chart');
const comparisonChartContainer = document.getElementById('comparison-chart-container');
const noDataBarChart = document.getElementById('no-data-bar-chart');
const shopChartContainer = document.getElementById('shop-chart-container');
const noDataShopChart = document.getElementById('no-data-shop-chart');
const categoryDetailsModal = document.getElementById('category-details-modal');
const closeCategoryDetailsBtn = document.getElementById('close-category-details-btn');
const categoryDetailsTitle = document.getElementById('category-details-title');
const categoryDetailsTableBody = document.getElementById('category-details-table-body');
const budgetMonthSelect = document.getElementById('budget-month-select');
const budgetsList = document.getElementById('budgets-list');
const saveBudgetBtn = document.getElementById('save-budget-btn');
const copyBudgetBtn = document.getElementById('copy-budget-btn');
const copyBudgetModal = document.getElementById('copy-budget-modal');
const closeCopyBudgetModal = document.getElementById('close-copy-budget-modal');
const cancelCopyBudget = document.getElementById('cancel-copy-budget');
const copyMonthsBtns = document.querySelectorAll('.copy-months-btn');

// Floating Action Button (FAB) elements
const fabContainer = document.getElementById('fab-container');
const mainFabBtn = document.getElementById('main-fab-btn');
const fabActions = document.getElementById('fab-actions');
const fabAddManualBtn = document.getElementById('fab-add-manual-btn');
const fabSelectFileBtn = document.getElementById('fab-select-file-btn');
const fabScanReceiptBtn = document.getElementById('fab-scan-receipt-btn'); // New FAB scan button

// Elementy filtrów
const filterKeyword = document.getElementById('filter-keyword');
const filterDateRange = document.getElementById('filter-date-range');
const filterCategory = document.getElementById('filter-category');
const filterShop = document.getElementById('filter-shop');
const filterBudget = document.getElementById('filter-budget');
const filterMinAmount = document.getElementById('filter-min-amount');
const filterMaxAmount = document.getElementById('filter-max-amount');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const filterToggle = document.getElementById('filter-toggle');
const filtersContainer = document.getElementById('filters-container');
const filterArrow = document.getElementById('filter-arrow');

// Elementy wydatków cyklicznych
const recurringExpensesList = document.getElementById('recurring-expenses-list');
const addRecurringExpenseForm = document.getElementById('add-recurring-expense-form');
const recurringName = document.getElementById('recurring-name');
const recurringAmount = document.getElementById('recurring-amount');
const recurringCategory = document.getElementById('recurring-category');
const scheduleTypeSelect = document.getElementById('recurring-schedule-type');
const monthlySettings = document.getElementById('recurring-monthly-settings');
const weeklySettings = document.getElementById('recurring-weekly-settings');
const intervalSettings = document.getElementById('recurring-interval-settings');
const recurringDayOfMonth = document.getElementById('recurring-day-of-month');
const recurringDayOfWeek = document.getElementById('recurring-day-of-week');
const recurringInterval = document.getElementById('recurring-interval');
const recurringStartDate = document.getElementById('recurring-start-date');

// Elementy budżetów specjalnych
const specialBudgetsList = document.getElementById('special-budgets-list');
const addSpecialBudgetForm = document.getElementById('add-special-budget-form');
const budgetTypeSelect = document.getElementById('budget-type-select');

// Elementy modala edycji budżetu specjalnego
const editSpecialBudgetModal = document.getElementById('edit-special-budget-modal');
const editSpecialBudgetForm = document.getElementById('edit-special-budget-form');
const closeEditSpecialBudgetModalBtn = document.getElementById('close-edit-special-budget-modal');
const cancelEditSpecialBudgetBtn = document.getElementById('cancel-edit-special-budget');
const editSpecialBudgetNameInput = document.getElementById('edit-special-budget-name');
const editSpecialBudgetAmountInput = document.getElementById('edit-special-budget-amount');

const shopAutocompleteList = document.getElementById('shop-autocomplete-list');

// --- Funkcje Pomocnicze ---
const categoryColors = {};
const colorPalette = ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#64748b', '#06b6d4', '#a855f7', '#eab308', '#0ea5e9', '#be185d', '#16a34a', '#f43f5e', '#84cc16', '#6366f1', '#d946ef', '#fb7185'];
let colorIndex = 0;

function getCategoryColor(category) {
    if (!categoryColors[category]) {
        categoryColors[category] = colorPalette[colorIndex % colorPalette.length];
        colorIndex++;
    }
    return categoryColors[category];
}

// --- Funkcja kompresji/optymalizacji obrazu ---
async function resizeImage(file, maxSize = 1920, quality = 0.92) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            let { width, height } = image;

            // Skaluj obraz tylko jeśli jest za duży
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            // Popraw jakość renderowania
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Zwiększ kontrast dla lepszej czytelności tekstu
            ctx.filter = 'contrast(1.1) brightness(1.05)';
            ctx.drawImage(image, 0, 0, width, height);

            canvas.toBlob(blob => {
                resolve(new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                }));
            }, 'image/jpeg', quality); // Zwiększona jakość z 0.8 do 0.92
        };
        image.onerror = error => reject(error);
        image.src = URL.createObjectURL(file);
    });
}

// --- Główna Logika Aplikacji ---
function setupAppEventListeners() {
    // Bottom nav tabs
    bottomNavBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    // Drawer nav tabs
    drawerNavBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    // Hamburger menu
    document.getElementById('hamburger-btn').addEventListener('click', openDrawer);
    // Drawer overlay close
    document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);
    // Drawer close button
    document.getElementById('close-drawer-btn').addEventListener('click', closeDrawer);
    // Drawer logout
    document.getElementById('drawer-logout-btn').addEventListener('click', () => {
        closeDrawer();
        auth.signOut();
    });
    // Initialize swipe container
    initSwipeContainer();
    purchaseForm.addEventListener('submit', handlePurchaseFormSubmit);
    addItemBtn.addEventListener('click', () => addItemRow());
    itemsContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('item-price') || e.target.classList.contains('item-name')) {
            updatePurchaseSummary();
        }
    });
    document.getElementById('cancel-edit-btn').addEventListener('click', () => {
        exitEditMode();
        switchTab('list');
    });

    addCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = newCategoryInput.value.trim().toLowerCase();
        if (newName && !allCategories.includes(newName)) {
            try {
                await apiCall('/api/categories', 'POST', { name: newName });
                newCategoryInput.value = '';
                // Odśwież wszystko, aby pobrać nową listę kategorii i przerysować interfejs
                await fetchInitialData(false);
                renderCategoriesList(); // Odśwież listę w ustawieniach
                renderBudgetInputs(); // DODANE: Odśwież listę budżetów
            } catch (error) {
                alert('Nie udało się dodać kategorii: ' + error.message);
            }
        } else if (allCategories.includes(newName)) {
            alert('Taka kategoria już istnieje.');
        }
    });

    purchasesList.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-purchase-btn');
        if (editBtn) {
            const purchaseId = e.target.closest('[data-purchase-id]').dataset.purchaseId;
            enterEditMode(purchaseId);
            return;
        }

        const deleteBtn = e.target.closest('.delete-purchase-btn');
        if (deleteBtn) {
            const purchaseId = e.target.closest('[data-purchase-id]').dataset.purchaseId;
            if (confirm('Czy na pewno chcesz usunąć ten zakup? Operacja jest nieodwracalna.')) {
                try {
                    await apiCall(`/api/purchases/${purchaseId}`, 'DELETE');
                    await fetchInitialData(false); // nie przełączaj zakładki
                } catch (error) {
                    alert('Nie udało się usunąć zakupu: ' + error.message);
                }
            }
            return;
        }

        const header = e.target.closest('.purchase-header');
        if (header) {
            const itemsDiv = header.nextElementSibling;
            itemsDiv.classList.toggle('hidden');
            const arrow = header.querySelector('.toggle-arrow');
            arrow.classList.toggle('rotate-180');
        }
    });

    categoriesList.addEventListener('click', handleCategoryActions);
    analyzeReceiptBtn.addEventListener('click', handleAnalyzeReceipt);
    receiptFileInput.addEventListener('change', handleFileSelect);
    startCameraBtn.addEventListener('click', startCamera);
    cancelCameraBtn.addEventListener('click', stopCamera);
    capturePhotoBtn.addEventListener('click', capturePhoto);
    statsMonthSelect.addEventListener('change', updateCategoryPieChart);

    // Obsługa modala szczegółów kategorii
    closeCategoryDetailsBtn.addEventListener('click', () => categoryDetailsModal.classList.add('hidden'));
    categoryDetailsModal.addEventListener('click', (e) => {
        if (e.target === categoryDetailsModal) {
            categoryDetailsModal.classList.add('hidden');
        }
    });
    document.getElementById('category-chart').addEventListener('click', handleCategoryChartClick);

    // Autouzupełnianie sklepu
    shopInput.addEventListener('input', () => renderShopAutocomplete(shopInput.value));
    shopInput.addEventListener('focus', () => renderShopAutocomplete(shopInput.value));

    shopAutocompleteList.addEventListener('click', (e) => {
        if (e.target.tagName === 'DIV') {
            shopInput.value = e.target.textContent;
            shopAutocompleteList.classList.add('hidden');
        }
    });

    // Ukryj autouzupełnianie po kliknięciu gdziekolwiek indziej
    document.addEventListener('click', (e) => {
        if (!shopInput.contains(e.target) && !shopAutocompleteList.contains(e.target)) {
            shopAutocompleteList.classList.add('hidden');
        }
    });

    // Zarządzanie budżetem
    budgetMonthSelect.addEventListener('change', renderBudgetInputs);
    saveBudgetBtn.addEventListener('click', handleSaveBudget);
    copyBudgetBtn.addEventListener('click', () => copyBudgetModal.classList.remove('hidden'));

    // Modal kopiowania budżetu
    closeCopyBudgetModal.addEventListener('click', () => copyBudgetModal.classList.add('hidden'));
    cancelCopyBudget.addEventListener('click', () => copyBudgetModal.classList.add('hidden'));
    copyBudgetModal.addEventListener('click', (e) => {
        if (e.target === copyBudgetModal) {
            copyBudgetModal.classList.add('hidden');
        }
    });

    // Przyciski wyboru liczby miesięcy
    copyMonthsBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const monthsCount = parseInt(btn.dataset.months);
            handleCopyBudget(monthsCount);
        });
    });

    // Logika filtrów
    filterToggle.addEventListener('click', () => {
        filtersContainer.classList.toggle('hidden');
        filterArrow.classList.toggle('rotate-180');
    });

    const filterElements = [filterKeyword, filterCategory, filterShop, filterBudget, filterMinAmount, filterMaxAmount, filterDateRange];
    filterElements.forEach(el => {
        el.addEventListener('change', handleFilterChange); // Użyj 'change', aby reagować po zakończeniu edycji
    });

    clearFiltersBtn.addEventListener('click', () => {
        filterKeyword.value = '';
        if (fp_range) fp_range.clear();
        filterCategory.value = '';
        filterShop.value = '';
        filterBudget.value = '';
        filterMinAmount.value = '';
        filterMaxAmount.value = '';
        handleFilterChange(); // Wywołaj zmianę, aby przeładować do paginacji
    });

    // Logika wydatków cyklicznych
    addRecurringExpenseForm.addEventListener('submit', handleAddOrUpdateRecurringExpense);
    recurringExpensesList.addEventListener('click', handleRecurringExpenseActions);
    scheduleTypeSelect.addEventListener('change', handleScheduleTypeChange);

    // Logika budżetów specjalnych
    addSpecialBudgetForm.addEventListener('submit', handleAddSpecialBudget);
    specialBudgetsList.addEventListener('click', handleSpecialBudgetActions);
    editSpecialBudgetForm.addEventListener('submit', handleEditSpecialBudgetSubmit);
    closeEditSpecialBudgetModalBtn.addEventListener('click', () => editSpecialBudgetModal.classList.add('hidden'));
    cancelEditSpecialBudgetBtn.addEventListener('click', () => editSpecialBudgetModal.classList.add('hidden'));

    // DODAJ TEN EVENT LISTENER TUTAJ:
    document.getElementById('toggle-budget-details').addEventListener('click', toggleBudgetDetails);
    document.getElementById('toggle-legend-details').addEventListener('click', toggleChartLegend);

    // Floating Action Button (FAB) logic
    let isFabExpanded = false;

    function toggleFab() {
        isFabExpanded = !isFabExpanded;
        fabActions.classList.toggle('hidden', !isFabExpanded);
        fabActions.classList.toggle('expanded', isFabExpanded);
        mainFabBtn.classList.toggle('expanded', isFabExpanded);

        // Animate sub-buttons
        const subBtns = fabActions.querySelectorAll('.fab-sub-btn');
        subBtns.forEach((btn, index) => {
            if (isFabExpanded) {
                btn.style.transitionDelay = `${index * 50}ms`;
            } else {
                btn.style.transitionDelay = `${(subBtns.length - 1 - index) * 50}ms`;
            }
        });
    }

    mainFabBtn.addEventListener('click', () => {
        toggleFab();
    });

    fabAddManualBtn.addEventListener('click', () => {
        switchTab('add');
        setTimeout(() => shopInput.focus(), 100);
        toggleFab();
    });

    fabSelectFileBtn.addEventListener('click', () => {
        receiptFileInput.click(); // Trigger the hidden file input
        toggleFab();
    });

    fabScanReceiptBtn.addEventListener('click', () => {
        switchTab('add');
        setTimeout(() => startCamera(), 100);
        toggleFab();
    });

    // Scroll detection for FAB visibility
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;

        if (currentScrollY > lastScrollY && currentScrollY > 100) { // Scrolling down and not at the very top
            fabContainer.classList.add('hide');
            if (isFabExpanded) {
                toggleFab(); // Collapse FAB if scrolling down while expanded
            }
        } else {
            fabContainer.classList.remove('hide');
        }
        lastScrollY = currentScrollY;
    });

    // Infinite scroll
    window.addEventListener('scroll', handleInfiniteScroll);
}

const handleInfiniteScroll = () => {
    if (!document.getElementById('list-tab').classList.contains('active')) {
        return;
    }
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
        fetchMorePurchases();
    }
};

async function handleFilterChange() {
    const params = new URLSearchParams();
    if (filterKeyword.value) params.append('keyword', filterKeyword.value);
    if (filterCategory.value) params.append('category', filterCategory.value);
    if (filterShop.value) params.append('shop', filterShop.value);
    if (filterBudget.value) params.append('budget', filterBudget.value);
    if (filterMinAmount.value) params.append('minAmount', filterMinAmount.value);
    if (filterMaxAmount.value) params.append('maxAmount', filterMaxAmount.value);
    if (fp_range.selectedDates.length === 2) {
        params.append('startDate', fp_range.selectedDates[0].toISOString().split('T')[0]);
        params.append('endDate', fp_range.selectedDates[1].toISOString().split('T')[0]);
    }

    const queryString = params.toString();

    if (!queryString) {
        window.addEventListener('scroll', handleInfiniteScroll);
        await loadInitialPurchases();
        return;
    }

    window.removeEventListener('scroll', handleInfiniteScroll);
    isLoadingPurchases = true;
    purchasesList.innerHTML = '<div class="text-center py-12">Filtrowanie...</div>';

    try {
        const { purchases } = await apiCall(`/api/purchases?${queryString}`);
        allPurchases = purchases;
        nextPurchaseCursor = null;
        renderPurchasesList(allPurchases, false);
    } catch (error) {
        console.error('Błąd podczas filtrowania zakupów:', error);
        purchasesList.innerHTML = '<div class="text-center py-12 text-red-500">Wystąpił błąd podczas filtrowania.</div>';
    } finally {
        isLoadingPurchases = false;
    }
}

function populateAllSelects() {
    // Kategorie
    const categoryOptions = allCategories.map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`).join('');
    filterCategory.innerHTML = '<option value="">Wszystkie kategorie</option>' + categoryOptions;
    recurringCategory.innerHTML = categoryOptions;

    // Sklepy
    const shopOptions = allShops.map(shop => `<option value="${shop}">${shop}</option>`).join('');
    filterShop.innerHTML = '<option value="">Wszystkie sklepy</option>' + shopOptions;

    populateBudgetFilterSelect();
}

function populateBudgetFilterSelect() {
    let budgetOptionsHTML = '<option value="">Wszystkie budżety</option><option value="monthly">Budżet miesięczny</option>';
    allSpecialBudgets.forEach(budget => {
        budgetOptionsHTML += `<option value="${budget.id}">${budget.name}</option>`;
    });
    filterBudget.innerHTML = budgetOptionsHTML;
}

async function fetchInitialData(shouldSwitchToDefault = true) {
    try {
        // Pobierz dane, które nie wymagają paginacji
        [allCategories, allShops, allSpecialBudgets, allRecurringExpenses] = await Promise.all([
            apiCall('/api/categories'),
            apiCall('/api/shops'),
            apiCall('/api/special-budgets'),
            apiCall('/api/recurring-expenses') // Fetch recurring expenses
        ]);

        // Załaduj pierwszą stronę zakupów
        await loadInitialPurchases();

        // Renderuj wszystko po załadowaniu wszystkich danych
        renderAll();
        populateAllSelects();
        populateBudgetMonthSelector();
        renderRecurringExpenses(); // Render recurring expenses list
        if (shouldSwitchToDefault) {
            switchTab('stats');
        }
    } catch (error) {
        alert(error.message);
    }
}

async function loadInitialPurchases() {
    isLoadingPurchases = true;
    // Zawsze usuń listener, aby uniknąć duplikatów i zresetować stan
    window.removeEventListener('scroll', handleInfiniteScroll);
    try {
        const { purchases, nextCursor } = await apiCall('/api/purchases');
        allPurchases = purchases;
        nextPurchaseCursor = nextCursor;
        renderPurchasesList(allPurchases); // Renderuj tylko listę zakupów

        // Jeśli jest następna strona, ponownie dodaj listener
        if (nextCursor) {
            window.addEventListener('scroll', handleInfiniteScroll);
        }
    } catch (error) {
        console.error('Błąd ładowania początkowych zakupów:', error);
    } finally {
        isLoadingPurchases = false;
    }
}

async function fetchMorePurchases() {
    if (isLoadingPurchases || !nextPurchaseCursor) return;

    isLoadingPurchases = true;
    // Opcjonalnie: pokaż spinner ładowania na dole listy

    try {
        const { purchases, nextCursor } = await apiCall(`/api/purchases?lastVisible=${nextPurchaseCursor}`);
        if (purchases && purchases.length > 0) {
            allPurchases.push(...purchases);
            renderPurchasesList(purchases, true); // Renderuj tylko nowe zakupy
        }
        nextPurchaseCursor = nextCursor; // Zaktualizuj kursor nawet jeśli jest null
        if (!nextCursor) {
            window.removeEventListener('scroll', handleInfiniteScroll);
        }
    } catch (error) {
        console.error('Błąd doładowywania zakupów:', error);
    } finally {
        isLoadingPurchases = false;
        // Ukryj spinner ładowania
    }
}

async function renderAll() {
    await updateMonthlyBalance();
    await renderStatistics(); // Od razu renderuj statystyki
    renderSpecialBudgetsList();
    populateBudgetTypeSelect();
}

function populateBudgetTypeSelect() {
    budgetTypeSelect.innerHTML = '<option value="monthly">Budżet miesięczny</option>';
    allSpecialBudgets.forEach(budget => {
        const option = document.createElement('option');
        option.value = budget.id;
        option.textContent = budget.name;
        budgetTypeSelect.appendChild(option);
    });
}

function renderSpecialBudgetsList() {
    specialBudgetsList.innerHTML = '';
    if (!allSpecialBudgets || allSpecialBudgets.length === 0) {
        specialBudgetsList.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm">Brak budżetów specjalnych. Dodaj nowy poniżej.</p>`;
        return;
    }

    allSpecialBudgets.forEach(budget => {
        const budgetEl = document.createElement('div');
        budgetEl.className = 'flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700';
        budgetEl.innerHTML = `
            <div>
                <span class="font-medium text-gray-800 dark:text-gray-200">${budget.name}</span>
                <span class="text-sm text-gray-500 dark:text-gray-400 ml-2">${budget.amount.toFixed(2)} zł</span>
            </div>
            <div class="flex items-center space-x-2">
                <button class="edit-special-budget-btn p-1 text-blue-500 hover:text-blue-700" data-id="${budget.id}" title="Edytuj">
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
            editSpecialBudgetModal.classList.remove('hidden');
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

// --- Recurring Expenses Logic ---
function renderRecurringExpenses() {
    recurringExpensesList.innerHTML = '';
    if (allRecurringExpenses.length === 0) {
        recurringExpensesList.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm">Brak zdefiniowanych wydatków cyklicznych.</p>`;
        return;
    }

    allRecurringExpenses.forEach(expense => {
        const expenseEl = document.createElement('div');
        expenseEl.className = 'flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-lg';
        expenseEl.dataset.id = expense.id;

        const scheduleText = getScheduleText(expense.schedule);

        expenseEl.innerHTML = `
            <div>
                <p class="font-semibold text-gray-900 dark:text-white">${expense.name}</p>
                <p class="text-sm text-gray-600 dark:text-gray-400">${expense.amount.toFixed(2)} zł - ${expense.category} (${scheduleText})</p>
            </div>
            <div class="flex items-center space-x-1">
                 <button class="edit-recurring-expense-btn p-2 text-blue-500 hover:text-blue-700" title="Edytuj">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
                </button>
                <button class="delete-recurring-expense-btn p-2 text-red-500 hover:text-red-700" title="Usuń">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>
                </button>
            </div>
        `;
        recurringExpensesList.appendChild(expenseEl);
    });
}

function getScheduleText(schedule) {
    if (!schedule) {
        return 'Brak harmonogramu';
    }
    switch (schedule.type) {
        case 'monthly':
            return `co miesiąc, ${schedule.dayOfMonth} dnia`;
        case 'weekly':
            const weekdays = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
            return `co tydzień, w ${weekdays[schedule.dayOfWeek]}`;
        case 'daily_interval':
            return `co ${schedule.interval} dni od ${schedule.startDate}`;
        default:
            return 'Nieznany harmonogram';
    }
}

async function handleAddOrUpdateRecurringExpense(e) {
    e.preventDefault();

    const name = recurringName.value.trim();
    const amount = parseFloat(recurringAmount.value);
    const category = recurringCategory.value;
    const scheduleType = scheduleTypeSelect.value;

    let schedule = { type: scheduleType };
    let isValid = false;

    switch (scheduleType) {
        case 'monthly':
            const dayOfMonth = parseInt(recurringDayOfMonth.value);
            if (dayOfMonth >= 1 && dayOfMonth <= 31) {
                schedule.dayOfMonth = dayOfMonth;
                isValid = true;
            }
            break;
        case 'weekly':
            const dayOfWeek = parseInt(recurringDayOfWeek.value);
            if (dayOfWeek >= 0 && dayOfWeek <= 6) {
                schedule.dayOfWeek = dayOfWeek;
                isValid = true;
            }
            break;
        case 'daily_interval':
            const interval = parseInt(recurringInterval.value);
            const startDate = recurringStartDate.value;
            if (interval > 0 && startDate) {
                schedule.interval = interval;
                schedule.startDate = startDate;
                isValid = true;
            }
            break;
    }

    if (!name || !amount || !category || !isValid) {
        alert('Wypełnij poprawnie wszystkie pola, aby dodać lub zaktualizować wydatek cykliczny.');
        return;
    }

    const expenseData = { name, amount, category, schedule };

    try {
        if (editingRecurringExpenseId) {
            await apiCall(`/api/recurring-expenses/${editingRecurringExpenseId}`, 'PUT', expenseData);
        } else {
            await apiCall('/api/recurring-expenses', 'POST', expenseData);
        }

        exitRecurringExpenseEditMode();
        allRecurringExpenses = await apiCall('/api/recurring-expenses');
        renderRecurringExpenses();
    } catch (error) {
        alert(`Nie udało się zapisać wydatku cyklicznego: ${error.message}`);
    }
}

function handleRecurringExpenseActions(e) {
    const deleteBtn = e.target.closest('.delete-recurring-expense-btn');
    if (deleteBtn) {
        const expenseDiv = e.target.closest('[data-id]');
        const expenseId = expenseDiv.dataset.id;
        const expense = allRecurringExpenses.find(exp => exp.id === expenseId);

        if (confirm(`Czy na pewno chcesz usunąć wydatek cykliczny "${expense.name}"?`)) {
            deleteRecurringExpense(expenseId);
        }
        return;
    }

    const editBtn = e.target.closest('.edit-recurring-expense-btn');
    if (editBtn) {
        const expenseDiv = e.target.closest('[data-id]');
        const expenseId = expenseDiv.dataset.id;
        enterRecurringExpenseEditMode(expenseId);
    }
}

async function deleteRecurringExpense(expenseId) {
    try {
        await apiCall(`/api/recurring-expenses/${expenseId}`, 'DELETE');
        allRecurringExpenses = await apiCall('/api/recurring-expenses');
        renderRecurringExpenses();
    } catch (error) {
        alert('Nie udało się usunąć wydatku: ' + error.message);
    }
}

function enterRecurringExpenseEditMode(expenseId) {
    const expense = allRecurringExpenses.find(exp => exp.id === expenseId);
    if (!expense) return;

    editingRecurringExpenseId = expenseId;

    recurringName.value = expense.name;
    recurringAmount.value = expense.amount;
    recurringCategory.value = expense.category;

    if (expense.schedule) {
        scheduleTypeSelect.value = expense.schedule.type;
        handleScheduleTypeChange(); // Update visibility and required attributes
        switch (expense.schedule.type) {
            case 'monthly':
                recurringDayOfMonth.value = expense.schedule.dayOfMonth;
                break;
            case 'weekly':
                recurringDayOfWeek.value = expense.schedule.dayOfWeek;
                break;
            case 'daily_interval':
                recurringInterval.value = expense.schedule.interval;
                recurringStartDate.value = expense.schedule.startDate;
                break;
        }
    } else {
        // Handle legacy data with no schedule
        scheduleTypeSelect.value = 'monthly';
        handleScheduleTypeChange();
    }

    addRecurringExpenseForm.querySelector('button[type="submit"]').textContent = 'Zaktualizuj subskrypcję';
    addRecurringExpenseForm.scrollIntoView({ behavior: 'smooth' });
}

function exitRecurringExpenseEditMode() {
    editingRecurringExpenseId = null;
    addRecurringExpenseForm.reset();
    handleScheduleTypeChange();
    addRecurringExpenseForm.querySelector('button[type="submit"]').textContent = 'Dodaj subskrypcję';
}

function handleScheduleTypeChange() {
    const type = scheduleTypeSelect.value;

    // Toggle visibility
    monthlySettings.classList.toggle('hidden', type !== 'monthly');
    weeklySettings.classList.toggle('hidden', type !== 'weekly');
    intervalSettings.classList.toggle('hidden', type !== 'daily_interval');

    // Toggle required attribute
    recurringDayOfMonth.required = (type === 'monthly');
    recurringDayOfWeek.required = (type === 'weekly');
    recurringInterval.required = (type === 'daily_interval');
    recurringStartDate.required = (type === 'daily_interval');
}


async function updateMonthlyBalance() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    try {
        let allMonthlyPurchases = [];
        let lastVisible = null;
        let hasMore = true;

        // Fetch all purchases for the current month, handling pagination
        while (hasMore) {
            const queryString = `startDate=${startDate}&endDate=${endDate}` + (lastVisible ? `&lastVisible=${lastVisible}` : '');
            const { purchases, nextCursor } = await apiCall(`/api/purchases?${queryString}`);

            if (purchases && purchases.length > 0) {
                allMonthlyPurchases.push(...purchases);
            }

            if (nextCursor) {
                lastVisible = nextCursor;
            } else {
                hasMore = false;
            }
        }

        const total = allMonthlyPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
        monthlyBalanceValue.textContent = `${total.toFixed(2)} zł`;

        const monthName = now.toLocaleString('pl-PL', { month: 'long' });
        monthlyBalanceLabel.textContent = `Wydatki w ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;

    } catch (error) {
        console.error('Failed to fetch all monthly purchases for header balance:', error);
        monthlyBalanceValue.textContent = `Błąd`;
    }
}

// --- Inicjalizacja Aplikacji ---
async function initializeApp() {
    setupAppEventListeners();
    // Dodaj małe opóźnienie, żeby token Firebase Auth był gotowy
    await new Promise(resolve => setTimeout(resolve, 100));
    await fetchInitialData();
    exitEditMode();
    handleScheduleTypeChange();
}

// Główny mechanizm obsługi stanu uwierzytelnienia
auth.onAuthStateChanged(user => {
    loadingSection.classList.add('hidden');
    if (user) {
        // Użytkownik jest zalogowany
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        initializeApp();
    } else {
        // Użytkownik jest wylogowany
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    setupAuthEventListeners();
    // Usunięto wywołanie main() - teraz onAuthStateChanged zarządza stanem

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker zarejestrowany:', reg))
            .catch(err => console.log('Błąd rejestracji Service Workera:', err));
    }

    // Initialize Flatpickr and store the instance
    fp = flatpickr("#date", {
        dateFormat: "Y-m-d",
        defaultDate: new Date(),
        altInput: true,
        altFormat: "d.m.Y", // Polski format: "02.08.2025"
        theme: "dark",
        locale: "pl", // Polska lokalizacja
        allowInput: true // Pozwala na ręczne wpisywanie daty
    });

    fp_range = flatpickr("#filter-date-range", {
        mode: "range",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d.m.Y", // Polski format: "02.08.2025"
        theme: "dark",
        locale: "pl", // Polska lokalizacja
        allowInput: true // Pozwala na ręczne wpisywanie daty
    });

    flatpickr(recurringStartDate, {
        dateFormat: "Y-m-d",
        defaultDate: new Date(),
        altInput: true,
        altFormat: "d.m.Y",
        theme: "dark",
        locale: "pl",
    });
});