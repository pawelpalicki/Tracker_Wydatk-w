// Tracker Wydatków - Main Application Functions

// --- Konfiguracja Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyCotoNKJ1Y9BCt6N8ZKCXny9PTcgCJc2fk",
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
let editingSpecialBudgetId = null;
let editMode = { active: false, purchaseId: null };
let currentFile = null;
let cameraStream = null;
let categoryChart = null;
let comparisonChart = null;
let shopChart = null;
let fp; // Declare fp globally
let fp_range; // For date range filter

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
const logoutBtn = document.getElementById('logout-btn');
const navBtns = document.querySelectorAll('.nav-btn');
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
const quickAddManualBtn = document.getElementById('quick-add-manual-btn');
const quickAddScanBtn = document.getElementById('quick-add-scan-btn');
const budgetMonthSelect = document.getElementById('budget-month-select');
const budgetsList = document.getElementById('budgets-list');
const saveBudgetBtn = document.getElementById('save-budget-btn');
const copyBudgetBtn = document.getElementById('copy-budget-btn');
const copyBudgetModal = document.getElementById('copy-budget-modal');
const closeCopyBudgetModal = document.getElementById('close-copy-budget-modal');
const cancelCopyBudget = document.getElementById('cancel-copy-budget');
const copyMonthsBtns = document.querySelectorAll('.copy-months-btn');

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
const recurringDay = document.getElementById('recurring-day');

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
const colorPalette = ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#64748b', '#06b6d4'];
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
    navBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
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

    // Szybkie akcje z kokpitu
    quickAddManualBtn.addEventListener('click', () => {
        switchTab('add');
        setTimeout(() => shopInput.focus(), 100);
    });
    quickAddScanBtn.addEventListener('click', () => {
        switchTab('add');
        setTimeout(() => startCamera(), 100);
    });

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

    [filterKeyword, filterCategory, filterShop, filterBudget, filterMinAmount, filterMaxAmount].forEach(el => {
        el.addEventListener('input', () => renderPurchasesList());
    });
    filterDateRange.addEventListener('change', () => renderPurchasesList()); // Flatpickr trigger

    clearFiltersBtn.addEventListener('click', () => {
        filterKeyword.value = '';
        if (fp_range) fp_range.clear();
        filterCategory.value = '';
        filterShop.value = '';
        filterMinAmount.value = '';
        filterMaxAmount.value = '';
        renderPurchasesList();
    });

    // Logika wydatków cyklicznych
    addRecurringExpenseForm.addEventListener('submit', handleAddRecurringExpense);
    recurringExpensesList.addEventListener('click', handleDeleteRecurringExpense);

    // Logika budżetów specjalnych
    addSpecialBudgetForm.addEventListener('submit', handleAddSpecialBudget);
    specialBudgetsList.addEventListener('click', handleSpecialBudgetActions);
    editSpecialBudgetForm.addEventListener('submit', handleEditSpecialBudgetSubmit);
    closeEditSpecialBudgetModalBtn.addEventListener('click', () => editSpecialBudgetModal.classList.add('hidden'));
    cancelEditSpecialBudgetBtn.addEventListener('click', () => editSpecialBudgetModal.classList.add('hidden'));

    // DODAJ TEN EVENT LISTENER TUTAJ:
    document.getElementById('toggle-budget-details').addEventListener('click', toggleBudgetDetails);
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
        [allPurchases, allCategories, allShops, allSpecialBudgets] = await Promise.all([
            apiCall('/api/purchases'),
            apiCall('/api/categories'),
            apiCall('/api/shops'),
            apiCall('/api/special-budgets')
        ]);
        renderAll();
        populateAllSelects();
        populateBudgetMonthSelector(); // Wypełnij selektor miesięcy w budżecie
        if (shouldSwitchToDefault) {
            switchTab('stats'); // Domyślna zakładka to kokpit
        }
    } catch (error) {
        alert(error.message);
    }
}

function renderAll() {
    renderPurchasesList();
    updateMonthlyBalance();
    renderStatistics(); // Od razu renderuj statystyki
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
        budgetEl.className = 'flex items-center justify-between p-2 rounded-md bg-gray-50 dark:bg-gray-700';
        budgetEl.innerHTML = `
            <div>
                <span class="font-medium text-gray-800 dark:text-gray-200">${budget.name}</span>
                <span class="text-sm text-gray-500 dark:text-gray-400 ml-2">${budget.amount.toFixed(2)} zł</span>
            </div>
            <div class="flex items-center space-x-2">
                <button class="edit-special-budget-btn p-1 text-gray-500 hover:text-blue-500" data-id="${budget.id}" title="Edytuj">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"></path></svg>
                </button>
                <button class="delete-special-budget-btn p-1 text-gray-500 hover:text-red-500" data-id="${budget.id}" title="Usuń">
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

function updateMonthlyBalance() {
    const now = new Date();
    // Użyj roku i miesiąca z `now` do stworzenia daty w lokalnej strefie czasowej, unikając problemów z UTC
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const year = firstDayOfMonth.getFullYear();
    const month = (firstDayOfMonth.getMonth() + 1).toString().padStart(2, '0');
    const firstDayOfMonthStr = `${year}-${month}-01`;

    const monthlyPurchases = allPurchases.filter(p => p.date >= firstDayOfMonthStr);
    const total = monthlyPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    monthlyBalanceValue.textContent = `${total.toFixed(2)} zł`;

    const monthName = now.toLocaleString('pl-PL', { month: 'long' });
    monthlyBalanceLabel.textContent = `Wydatki w ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;
}

// --- Inicjalizacja Aplikacji ---
async function initializeApp() {
    setupAppEventListeners();
    // Dodaj małe opóźnienie, żeby token Firebase Auth był gotowy
    await new Promise(resolve => setTimeout(resolve, 100));
    await fetchInitialData();
    exitEditMode();
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
});