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
let structuredCategories = []; // Tablica obiektów {id, name, parentId, color, icon}
let allShops = [];
let allSpecialBudgets = [];
let allRecurringExpenses = [];
let tagDefinitions = {
    nature: [
        { value: 'zmienny', label: 'Zmienny', icon: '📊' },
        { value: 'stały', label: 'Stały', icon: '📌' },
        { value: 'jednorazowy', label: 'Jednorazowy', icon: '⚡' }
    ],
    purpose: [
        { value: 'konieczny', label: 'Konieczny', icon: '🏠' },
        { value: 'przyjemność', label: 'Przyjemność', icon: '🎉' },
        { value: 'inwestycja', label: 'Inwestycja', icon: '📈' }
    ]
};
let editingSpecialBudgetId = null;
let editingRecurringExpenseId = null; // ID for editing recurring expense
let nextPurchaseCursor = null;
let isLoadingPurchases = false;
let editMode = { active: false, purchaseId: null };
let currentFile = null;
let cameraStream = null;
let appEventListenersInitialized = false;
// (Charts references moved to statistics.js or removed)
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
const bottomNavBtns = document.querySelectorAll('.bottom-nav-btn');

const purchaseForm = document.getElementById('purchase-form');
const purchaseFormTitle = null; // Usunięte z HTML, dynamicznie ustawiaj nav-title zamiast
const purchaseFormSubmitBtn = purchaseForm.querySelector('button[type="submit"]');
const addItemBtn = document.getElementById('add-item-btn');
const purchasesList = document.getElementById('purchases-list');
const itemsContainer = document.getElementById('items-container');
const shopInput = document.getElementById('shop');
const dateInput = document.getElementById('date');
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

const categoryChartContainer = document.getElementById('category-chart-container');
const noDataPieChart = document.getElementById('no-data-pie-chart');
const comparisonChartContainer = document.getElementById('comparison-chart-container');
const noDataBarChart = document.getElementById('no-data-bar-chart');
const shopChartContainer = document.getElementById('shop-chart-container');
const noDataShopChart = document.getElementById('no-data-shop-chart');
// Oczyszczono stare referencje do modalu analizy

const budgetsList = document.getElementById('budgets-list');
const saveBudgetBtn = document.getElementById('save-budget-btn');
const copyBudgetBtn = document.getElementById('copy-budget-btn');
const copyBudgetModal = document.getElementById('copy-budget-modal');
const closeCopyBudgetModal = document.getElementById('close-copy-budget-modal');
const cancelCopyBudget = document.getElementById('cancel-copy-budget');
const copyMonthsBtns = document.querySelectorAll('.copy-months-btn');

// Menu action buttons (wyświetlane w fab-actions)
const fabAddManualBtn = document.getElementById('fab-add-manual-btn');
const fabSelectFileBtn = document.getElementById('fab-select-file-btn');
const fabScanReceiptBtn = document.getElementById('fab-scan-receipt-btn');

// Elementy filtrów
const filterKeyword = document.getElementById('filter-keyword');
const filterDateStart = document.getElementById('filter-date-start');
const filterDateEnd = document.getElementById('filter-date-end');
const filterDateRange = document.getElementById('filter-date-range');
let filterCategoryValue = '';
let filterSubCategoryValue = '';
let filterShopValue = '';
let filterBudgetValue = '';
const filterMinAmount = document.getElementById('filter-min-amount');
const filterMaxAmount = document.getElementById('filter-max-amount');
const clearFiltersBtn = document.getElementById('clear-filters-btn');

// Elementy wydatków cyklicznych
const recurringExpensesList = document.getElementById('recurring-expenses-list');
const addRecurringExpenseForm = document.getElementById('add-recurring-expense-form');
const recurringName = document.getElementById('recurring-name');
const recurringAmount = document.getElementById('recurring-amount');
let recurringCategoryValue = '';
let recurringSubCategoryValue = ''; // NOWA ZMIENNA
let recurringTagValues = {}; // Tagi dla cyklicznego (wszystkie grupy)
let scheduleTypeValue = 'monthly';
const monthlySettings = document.getElementById('recurring-monthly-settings');
const weeklySettings = document.getElementById('recurring-weekly-settings');
const intervalSettings = document.getElementById('recurring-interval-settings');
const recurringDayOfMonth = document.getElementById('recurring-day-of-month');
let recurringDayOfWeekValue = '1';
const recurringInterval = document.getElementById('recurring-interval');
const recurringStartDate = document.getElementById('recurring-start-date');

// Elementy budżetów specjalnych
const specialBudgetsList = document.getElementById('special-budgets-list');
const addSpecialBudgetForm = document.getElementById('add-special-budget-form');
let budgetTypeSelectValue = 'monthly';

// Elementy modala edycji budżetu specjalnego
const editSpecialBudgetModal = document.getElementById('edit-special-budget-modal');
const editSpecialBudgetForm = document.getElementById('edit-special-budget-form');
const closeEditSpecialBudgetModalBtn = document.getElementById('close-edit-special-budget-modal');
const cancelEditSpecialBudgetBtn = document.getElementById('cancel-edit-special-budget');
const editSpecialBudgetNameInput = document.getElementById('edit-special-budget-name');
const editSpecialBudgetAmountInput = document.getElementById('edit-special-budget-amount');

const shopAutocompleteList = document.getElementById('shop-autocomplete-list');

// --- Funkcje Pomocnicze ---
// Tagi i inne pomocnicze funkcje obsługujące kategorie i widoki

function applyRecurringCategorySelection(parentName = '', subCategoryName = '') {
    recurringCategoryValue = parentName || '';
    recurringSubCategoryValue = subCategoryName || '';

    applyCategorySelectionState({
        buttonEl: document.getElementById('recurring-category-btn'),
        labelEl: document.getElementById('recurring-category-label'),
        iconEl: document.getElementById('recurring-category-icon')
    }, recurringCategoryValue, recurringSubCategoryValue, 'Wybierz kategorię');
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
    if (appEventListenersInitialized) {
        return;
    }
    appEventListenersInitialized = true;

    // Bottom nav tabs
    bottomNavBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    // More tab buttons
    const moreSettingsBtn = document.getElementById('more-settings-btn');
    if (moreSettingsBtn) {
        moreSettingsBtn.addEventListener('click', () => {
            switchTab('settings');
        });
    }

    const moreLogoutBtn = document.getElementById('more-logout-btn');
    if (moreLogoutBtn) {
        moreLogoutBtn.addEventListener('click', () => {
            auth.signOut();
        });
    }

    const moreSpecialBudgetsBtn = document.getElementById('more-special-budgets-btn');
    if (moreSpecialBudgetsBtn) {
        moreSpecialBudgetsBtn.addEventListener('click', () => {
            switchTab('special-budgets');
        });
        }

        // Browser back button support (obsługuje też natywny systemowy gest swipe wstecz: iOS / Android)
    window.addEventListener('popstate', (event) => {
        const state = event.state;
        
        if (typeof consumeOverlayLockPopstateIgnore === 'function' && consumeOverlayLockPopstateIgnore()) {
            return;
        }

        if (typeof hasVisibleBlockingOverlay === 'function' && hasVisibleBlockingOverlay()) {
            if (typeof reapplyOverlayNavigationLock === 'function') {
                reapplyOverlayNavigationLock();
            }
            return;
        }

        if (state && state.type === 'tab') {
            switchTab(state.id, false);
        } else if (!state) {
            switchTab('home', false);
        }
    });

    // Handle Resize for Charts
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {

            if (document.getElementById('home-tab').classList.contains('active')) {
                if (typeof renderDashboard === 'function') renderDashboard();
            }
        }, 300); // Wait 300ms for rotation animation to finish
    });

    purchaseForm.addEventListener('submit', handlePurchaseFormSubmit);
    document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
        if (typeof exitEditMode === 'function') exitEditMode();
        switchTab('list'); // Go back to list after canceling
    });
    addItemBtn.addEventListener('click', () => {
        if (typeof openProductDrawer === 'function') openProductDrawer();
    });
    itemsContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('item-price') || e.target.classList.contains('item-name')) {
            updatePurchaseSummary();
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

    analyzeReceiptBtn.addEventListener('click', handleAnalyzeReceipt);
    receiptFileInput.addEventListener('change', handleFileSelect);
    startCameraBtn.addEventListener('click', startCamera);
    cancelCameraBtn.addEventListener('click', stopCamera);
    capturePhotoBtn.addEventListener('click', capturePhoto);


    // (Obsługa szuflady szczegółów odbywa się w ui.js)

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

    saveBudgetBtn.addEventListener('click', handleSaveBudget);
    copyBudgetBtn.addEventListener('click', () => openOverlay('copy-budget-modal'));

    // Modal kopiowania budżetu
    closeCopyBudgetModal.addEventListener('click', () => closeOverlay('copy-budget-modal'));
    cancelCopyBudget.addEventListener('click', () => closeOverlay('copy-budget-modal'));
    copyBudgetModal.addEventListener('click', (e) => {
        if (e.target === copyBudgetModal) {
            closeOverlay('copy-budget-modal');
        }
    });

    // Przyciski wyboru liczby miesięcy
    copyMonthsBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const monthsCount = parseInt(btn.dataset.months);
            handleCopyBudget(monthsCount);
            closeOverlay('copy-budget-modal');
        });
    });

    // Logika wydatków cyklicznych
    addRecurringExpenseForm.addEventListener('submit', handleAddOrUpdateRecurringExpense);
    recurringExpensesList.addEventListener('click', handleRecurringExpenseActions);
    // scheduleTypeSelect event is now called directly from drawer callback

    // Logika budżetów specjalnych
    addSpecialBudgetForm.addEventListener('submit', handleAddSpecialBudget);
    specialBudgetsList.addEventListener('click', handleSpecialBudgetActions);
    editSpecialBudgetForm.addEventListener('submit', handleEditSpecialBudgetSubmit);
    closeEditSpecialBudgetModalBtn.addEventListener('click', () => closeOverlay('edit-special-budget-modal'));
    cancelEditSpecialBudgetBtn.addEventListener('click', () => closeOverlay('edit-special-budget-modal'));

    // Custom Triggers for Selects (Drawer version)
    document.getElementById('budget-type-btn')?.addEventListener('click', () => {
        const options = [
            { value: 'monthly', label: 'Miesięczny', icon: '📅' }
        ];

        // Dodaj wszystkie budżety specjalne użytkownika
        if (typeof allSpecialBudgets !== 'undefined' && allSpecialBudgets.length > 0) {
            allSpecialBudgets.forEach(sb => {
                options.push({ value: sb.id, label: sb.name, icon: '⭐' });
            });
        }

        openSelectionDrawer('Wybierz budżet', options, (val, label) => {
            budgetTypeSelectValue = val;
            document.getElementById('budget-type-label').textContent = label;
            document.getElementById('budget-type-icon').innerHTML = `<span>${val === 'monthly' ? '📅' : '⭐'}</span>`;
        }, budgetTypeSelectValue);
    });

    document.getElementById('budget-month-btn')?.addEventListener('click', () => {
        const options = [];
        const today = new Date();
        for (let i = -12; i <= 12; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const mStr = d.toISOString().substring(0, 7);
            const label = d.toLocaleString('pl-PL', { month: 'long', year: 'numeric' });
            options.push({ value: mStr, label: label });
        }
        options.sort((a, b) => b.value.localeCompare(a.value));

        openSelectionDrawer('Wybierz miesiąc', options, (val, label) => {
            budgetMonthValue = val;
            document.getElementById('budget-month-label').textContent = label;
            if (typeof renderBudgetInputs === 'function') renderBudgetInputs();
        }, budgetMonthValue);
    });

    document.getElementById('recurring-category-btn')?.addEventListener('click', () => {
        if (typeof openHierarchicalCategoryDrawer === 'function') {
            const currentCat = recurringCategoryValue || '';
            const currentSub = recurringSubCategoryValue || '';
            openHierarchicalCategoryDrawer(null, currentCat, currentSub, (pName, sName) => {
                applyRecurringCategorySelection(pName, sName);
            });
        }
    });

    // Tagi dla wydatków cyklicznych - jeden przycisk
    document.getElementById('recurring-tags-btn')?.addEventListener('click', () => {
        openTagsDrawer(recurringTagValues, (newTags) => {
            recurringTagValues = newTags;
            const summaryEl = document.getElementById('recurring-tags-summary');
            if (summaryEl) summaryEl.textContent = buildTagsSummary(newTags);
        });
    });

    // Initializuj szufladę tagów
    initTagsSelectionDrawer();

    // Refresh Shops Logic
    document.getElementById('refresh-shops-btn')?.addEventListener('click', async () => {
        if (confirm('Czy na pewno chcesz odświeżyć listę sklepów? Spowoduje to usunięcie z filtrów i autouzupełniania sklepów, które nie mają przypisanych żadnych zakupów.')) {
            try {
                // Set flag on backend
                await apiCall('/api/user/metadata', 'PATCH', { shopsStale: true });
                // Force data refresh
                await fetchInitialData(true);
                alert('Lista sklepów została zaktualizowana.');
            } catch (error) {
                alert('Błąd podczas odświeżania listy sklepów: ' + error.message);
            }
        }
    });

    document.getElementById('recurring-schedule-btn')?.addEventListener('click', () => {
        const options = [
            { value: 'monthly', label: 'Co miesiąc', icon: '📅' },
            { value: 'weekly', label: 'Co tydzień', icon: '🔁' },
            { value: 'daily_interval', label: 'Interwał dni', icon: '🔢' }
        ];
        openSelectionDrawer('Częstotliwość', options, (val, label) => {
            scheduleTypeValue = val;
            document.getElementById('recurring-schedule-label').textContent = label;
            handleScheduleTypeChange();
        }, scheduleTypeValue);
    });

    document.getElementById('recurring-day-of-week-btn')?.addEventListener('click', () => {
        const options = [
            { value: '1', label: 'Poniedziałek' },
            { value: '2', label: 'Wtorek' },
            { value: '3', label: 'Środa' },
            { value: '4', label: 'Czwartek' },
            { value: '5', label: 'Piątek' },
            { value: '6', label: 'Sobota' },
            { value: '0', label: 'Niedziela' }
        ];
        openSelectionDrawer('Dzień tygodnia', options, (val, label) => {
            recurringDayOfWeekValue = val;
            document.getElementById('recurring-day-of-week-label').textContent = label;
        }, recurringDayOfWeekValue);
    });

    // Main FAB button to show/hide action menu
    const mainFabBtn = document.getElementById('main-fab-btn');
    const fabActions = document.getElementById('fab-actions');
    const fabOverlay = document.getElementById('fab-overlay');
    
    mainFabBtn?.addEventListener('click', () => {
        const isHidden = fabActions.classList.contains('hidden');
        if (isHidden) {
            // Show the actions
            fabActions.classList.remove('hidden', 'opacity-0', 'translate-y-4');
            fabActions.classList.add('opacity-100', 'translate-y-0');
            fabOverlay.classList.remove('hidden');
            fabOverlay.classList.add('pointer-events-auto');
            mainFabBtn.classList.add('expanded');
        } else {
            // Hide the actions
            fabActions.classList.add('opacity-0', 'translate-y-4');
            fabActions.classList.remove('opacity-100', 'translate-y-0');
            fabOverlay.classList.add('hidden');
            fabOverlay.classList.remove('pointer-events-auto');
            mainFabBtn.classList.remove('expanded');
            setTimeout(() => fabActions.classList.add('hidden'), 300); // Wait for transition
        }
    });

    // Hide actions when clicking overlay
    fabOverlay?.addEventListener('click', () => {
        fabActions.classList.add('opacity-0', 'translate-y-4');
        fabActions.classList.remove('opacity-100', 'translate-y-0');
        fabOverlay.classList.add('hidden');
        fabOverlay.classList.remove('pointer-events-auto');
        mainFabBtn.classList.remove('expanded');
        setTimeout(() => fabActions.classList.add('hidden'), 300);
    });

    // Menu action buttons
    fabAddManualBtn?.addEventListener('click', () => {
        // Hide the actions menu
        fabActions.classList.add('opacity-0', 'translate-y-4');
        fabActions.classList.remove('opacity-100', 'translate-y-0');
        fabOverlay.classList.add('hidden');
        fabOverlay.classList.remove('pointer-events-auto');
        mainFabBtn.classList.remove('expanded');
        setTimeout(() => fabActions.classList.add('hidden'), 300);
        
        if (typeof clearPurchaseItems === 'function') clearPurchaseItems();
        switchTab('add');
        setTimeout(() => shopInput.focus(), 100);
    });

    fabSelectFileBtn?.addEventListener('click', () => {
        // Hide the actions menu
        fabActions.classList.add('opacity-0', 'translate-y-4');
        fabActions.classList.remove('opacity-100', 'translate-y-0');
        fabOverlay.classList.add('hidden');
        fabOverlay.classList.remove('pointer-events-auto');
        mainFabBtn.classList.remove('expanded');
        setTimeout(() => fabActions.classList.add('hidden'), 300);
        
        receiptFileInput.click(); // Trigger the hidden file input
    });

    fabScanReceiptBtn?.addEventListener('click', () => {
        // Hide the actions menu
        fabActions.classList.add('opacity-0', 'translate-y-4');
        fabActions.classList.remove('opacity-100', 'translate-y-0');
        fabOverlay.classList.add('hidden');
        fabOverlay.classList.remove('pointer-events-auto');
        mainFabBtn.classList.remove('expanded');
        setTimeout(() => fabActions.classList.add('hidden'), 300);
        
        switchTab('add');
        setTimeout(() => startCamera(), 100);
    });

    // Infinite scroll
    window.addEventListener('scroll', handleInfiniteScroll);

    // Dynamic Navbar buttons
    document.getElementById('nav-back-btn')?.addEventListener('click', () => {
        window.history.back();
    });

    document.getElementById('nav-user-btn')?.addEventListener('click', () => {
        switchTab('settings');
    });

    document.getElementById('nav-notifications-btn')?.addEventListener('click', () => {
        alert('Powiadomienia będą dostępne wkrótce! (Etap 4)');
    });

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
    if (filterCategoryValue) params.append('category', filterCategoryValue);
    if (filterSubCategoryValue) params.append('subCategory', filterSubCategoryValue);
    if (filterShopValue) params.append('shop', filterShopValue);
    if (filterBudgetValue) params.append('budget', filterBudgetValue);
    if (filterMinAmount.value) params.append('minAmount', filterMinAmount.value);
    if (filterMaxAmount.value) params.append('maxAmount', filterMaxAmount.value);

    if (filterDateStart.value && filterDateEnd.value) {
        params.append('startDate', filterDateStart.value);
        params.append('endDate', filterDateEnd.value);
    } else if (fp_range && Array.isArray(fp_range.selectedDates) && fp_range.selectedDates.length === 2) {
        params.append('startDate', fp_range.selectedDates[0].toISOString().split('T')[0]);
        params.append('endDate', fp_range.selectedDates[1].toISOString().split('T')[0]);
    }

    const queryString = params.toString();

    if (!queryString) {
        window.addEventListener('scroll', handleInfiniteScroll);
        await loadInitialPurchases();
        if (structuredCategories.length === 0 && allCategories.length > 0) {
            const refetchedStructuredCategories = await apiCall('/api/categories/v2');
            if (Array.isArray(refetchedStructuredCategories) && refetchedStructuredCategories.length > 0) {
                structuredCategories = refetchedStructuredCategories;
            }
        }
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
    // Zmienne powiązane (recurringCategory) są zarządzane dynamicznie, a populate już tylko dla filterCategory... 
    // czekaj, filterCategory zrobiliśmy bez DOM.Więc nie mapujemy opcji.

    // Update dynamic item category selects if the function exists
    if (typeof updateAllCategorySelects === 'function') {
        updateAllCategorySelects();
    }

    // Sklepy (tylko zmienne globalne - brak ukrytych selectów dla filtrów)
    populateBudgetFilterSelect();
}

function populateBudgetFilterSelect() {
    // Ta funkcja wcześniej wpisywała opcje do ukrytego selecta filterBudgetValue. 
    // Teraz nie robi nic z DOM, ponieważ opcje budowane są w locie w ui.js.
}

async function fetchInitialData(shouldSwitchToDefault = true) {
    try {
        // Pobierz dane, które nie wymagają paginacji
        [allCategories, structuredCategories, allShops, allSpecialBudgets, allRecurringExpenses, tagDefinitions] = await Promise.all([
            apiCall('/api/categories'),
            apiCall('/api/categories/v2'),
            apiCall('/api/shops'),
            apiCall('/api/special-budgets'),
            apiCall('/api/recurring-expenses'),
            apiCall('/api/tags')
        ]);

        // Inicjalizuj domyślne tagi cykliczne ze wszystkich grup
        recurringTagValues = getDefaultTagValues();
        const recurringTagsSummaryEl = document.getElementById('recurring-tags-summary');
        if (recurringTagsSummaryEl) recurringTagsSummaryEl.textContent = buildTagsSummary(recurringTagValues);
        // Renderuj dynamiczne filtry tagów w analizie
        if (typeof renderAnalysisTagFilterButton === 'function') renderAnalysisTagFilterButton();

        // Załaduj pierwszą stronę zakupów
        await loadInitialPurchases();

        // Auto-migracja, jeśli brak kategorii hierarchicznych
        if (structuredCategories.length === 0 && allCategories.length > 0) {
            console.log("Wykryto brak kategorii hierarchicznych. Uruchamiam auto-migrację...");
            await migrateToStructuredCategories();
        }

        // Renderuj wszystko po załadowaniu wszystkich danych
        renderAll();
        populateAllSelects();
        populateBudgetMonthSelector();
        renderRecurringExpenses(); // Render recurring expenses list
        if (shouldSwitchToDefault) {
            switchTab('home');
        }
    } catch (error) {
        alert(error.message);
    }
}

async function migrateToStructuredCategories() {
    // Mapa ikon dla domyślnych kategorii
    const defaultIcons = {
        'spożywcze': 'fa-shopping-basket',
        'jedzenie/napoje': 'fa-apple-alt',
        'słodycze/przekąski': 'fa-cookie-bite',
        'dania gotowe/z dostawy': 'fa-moped',
        'mieszkanie': 'fa-home',
        'czynsz': 'fa-building',
        'media(prąd/gaz/woda)': 'fa-bolt',
        'wyposażenie': 'fa-couch',
        'chemia': 'fa-jug-detergent',
        'remonty/naprawy': 'fa-tools',
        'artykuły gospodarcze': 'fa-recycle',
        'zdrowie & uroda': 'fa-heartbeat',
        'zdrowie': 'fa-heartbeat',
        'lekarz': 'fa-stethoscope',
        'apteka': 'fa-pills',
        'usługi kosmetyczne': 'fa-cut',
        'kosmetyki': 'fa-spa',
        'higieniczne': 'fa-toilet-paper',
        'suplementy': 'fa-capsules',
        'transport': 'fa-car',
        'samochód': 'fa-gas-pump',
        'taxi': 'fa-taxi',
        'komunikacja miejska': 'fa-bus',
        'podróże': 'fa-suitcase-rolling',
        'rozrywka': 'fa-film',
        'gastronomia': 'fa-hamburger',
        'kultura': 'fa-theater-masks',
        'subskrypcje (vod)': 'fa-play-circle',
        'hobby': 'fa-gamepad',
        'sport': 'fa-football-ball',
        'dom': 'fa-home',
        'rachunki': 'fa-file-invoice-dollar',
        'finanse': 'fa-file-invoice-dollar',
        'spłata kredytów': 'fa-hand-holding-usd',
        'oszczędności / inwestycje': 'fa-piggy-bank',
        'odzież': 'fa-tshirt',
        'ubrania': 'fa-tshirt',
        'ubrania i biżuteria': 'fa-tshirt',
        'buty': 'fa-shoe-prints',
        'dodatki': 'fa-gem',
        'edukacja': 'fa-graduation-cap',
        'kursy/szkolenia': 'fa-chalkboard-teacher',
        'książki': 'fa-book-open',
        'alkohol/papierosy': 'fa-smoking',
        'kaucje': 'fa-archive',
        'internet/tv': 'fa-tv',
        'telefon': 'fa-mobile-alt',
        'elektronika': 'fa-microchip',
        'prezenty': 'fa-gift',
        'zwierzęta': 'fa-dog',
        'inne': 'fa-tag'
    };

    // Paleta domyślna
    const colorPalette = ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#64748b', '#06b6d4', '#a855f7', '#eab308', '#0ea5e9', '#be185d', '#16a34a', '#f43f5e', '#84cc16', '#6366f1', '#d946ef', '#fb7185'];

    // Generuj nową strukturę
    structuredCategories = allCategories.map((catName, index) => {
        const color = colorPalette[index % colorPalette.length];
        const icon = defaultIcons[catName.toLowerCase()] || 'fa-tag';
        return {
            id: `migrated-${index}`,
            name: catName,
            parentId: null,
            color: color,
            icon: icon
        };
    });

    try {
        // Zapisz zmigrowane kategorie do backendu (v2)
        await apiCall('/api/categories/v2', 'POST', { structuredCategories });
        console.log("Pomyślnie zmigrowano kategorie.");
    } catch (err) {
        console.error("Błąd podczas migracji kategorii:", err);
    }
}

function getFilterQueryParams() {
    const params = new URLSearchParams();
    
    const keyword = document.getElementById('filter-keyword')?.value;
    if (keyword) params.append('keyword', keyword);
    
    if (typeof filterCategoryValue !== 'undefined' && filterCategoryValue) params.append('category', filterCategoryValue);
    if (typeof filterSubCategoryValue !== 'undefined' && filterSubCategoryValue) params.append('subCategory', filterSubCategoryValue);
    if (typeof filterBudgetValue !== 'undefined' && filterBudgetValue) params.append('specialBudgetId', filterBudgetValue);
    if (typeof filterShopValue !== 'undefined' && filterShopValue) params.append('shop', filterShopValue);
    
    const start = document.getElementById('filter-date-start')?.value;
    const end = document.getElementById('filter-date-end')?.value;
    if (start) params.append('startDate', start);
    if (end) params.append('endDate', end);
    
    const min = document.getElementById('filter-min-amount')?.value;
    const max = document.getElementById('filter-max-amount')?.value;
    if (min) params.append('minAmount', min);
    if (max) params.append('maxAmount', max);
    
    return params.toString();
}

async function loadInitialPurchases() {
    isLoadingPurchases = true;
    // Zawsze usuń listener, aby uniknąć duplikatów i zresetować stan
    window.removeEventListener('scroll', handleInfiniteScroll);
    try {
        const query = getFilterQueryParams();
        const { purchases, nextCursor } = await apiCall(`/api/purchases?${query}`);
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
    try {
        const query = getFilterQueryParams();
        const { purchases, nextCursor } = await apiCall(`/api/purchases?lastVisible=${nextPurchaseCursor}&${query}`);
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
    }
}

async function renderAll() {
    await updateMonthlyBalance();
    await renderDashboard(); // Renduruj kokpit zamiast starych statystyk
    renderSpecialBudgetsList();
    populateBudgetTypeSelect();
}







// --- Recurring Expenses Logic ---


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
        if (monthlyBalanceValue) monthlyBalanceValue.textContent = formatAmount(total);

        const monthName = now.toLocaleString('pl-PL', { month: 'long' });
        if (monthlyBalanceLabel) {
            monthlyBalanceLabel.textContent = `Wydatki w ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;
        }

    } catch (error) {
        console.error('Failed to fetch all monthly purchases for header balance:', error);
        if (monthlyBalanceValue) monthlyBalanceValue.textContent = `Błąd`;
    }
}

// --- Inicjalizacja Aplikacji ---
async function initializeApp() {
    setupAppEventListeners();

    // Set initial history state
    const currentTab = document.querySelector('.bottom-nav-btn.active')?.dataset.tab || 'home';
    history.replaceState({ type: 'tab', id: currentTab }, "", "");

    // Dodaj małe opóźnienie, żeby token Firebase Auth był gotowy
    await new Promise(resolve => setTimeout(resolve, 100));
    await fetchInitialData();
    
    // Safety check for new users: if categories were initialized in backend, they might have been empty in the first fetch
    if (structuredCategories.length === 0 && allCategories.length === 0) {
        console.log("Re-fetching data for new user...");
        await fetchInitialData(false);
    }

    exitEditMode();
    handleScheduleTypeChange();
    if (typeof initHomeDashboardControls === 'function') initHomeDashboardControls();
    if (typeof initPurchaseTags === 'function') initPurchaseTags();
}

// Główny mechanizm obsługi stanu uwierzytelnienia
function resetFabMenuState() {
    const mainFabBtn = document.getElementById('main-fab-btn');
    const fabActions = document.getElementById('fab-actions');
    const fabOverlay = document.getElementById('fab-overlay');

    fabActions?.classList.add('hidden', 'opacity-0', 'translate-y-4');
    fabActions?.classList.remove('opacity-100', 'translate-y-0');
    fabOverlay?.classList.add('hidden');
    fabOverlay?.classList.remove('pointer-events-auto');
    mainFabBtn?.classList.remove('expanded');
}

auth.onAuthStateChanged(user => {
    loadingSection.classList.add('hidden');
    resetFabMenuState();
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

function setupAuthEventListeners() {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin();
    });
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleRegister();
    });
    switchAuthLink.addEventListener('click', (e) => {
        e.preventDefault();
        const isLogin = authTitle.textContent.includes('Zaloguj');
        authTitle.textContent = isLogin ? 'Zarejestruj się' : 'Zaloguj się do swojego konta';
        loginForm.classList.toggle('hidden');
        registerForm.classList.toggle('hidden');
        switchAuthLink.textContent = isLogin ? 'Masz już konto? Zaloguj się' : 'Nie masz konta? Zarejestruj się';
        authErrorDiv.classList.add('hidden');
    });
}

async function handleLogin() {
    const email = loginEmail.value;
    const password = loginPassword.value;
    const btn = loginForm.querySelector('button[type="submit"]');
    const btnText = btn.querySelector('.button-text');
    const spinner = btn.querySelector('.button-spinner');

    btn.disabled = true;
    if (btnText) btnText.classList.add('invisible');
    if (spinner) spinner.classList.remove('hidden');
    authErrorDiv.classList.add('hidden');

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        authErrorDiv.textContent = 'Błąd logowania: ' + error.message;
        authErrorDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        if (btnText) btnText.classList.remove('invisible');
        if (spinner) spinner.classList.add('hidden');
    }
}

async function handleRegister() {
    const email = registerEmail.value;
    const password = registerPassword.value;
    const btn = registerForm.querySelector('button[type="submit"]');
    const btnText = btn.querySelector('.button-text');
    const spinner = btn.querySelector('.button-spinner');

    btn.disabled = true;
    if (btnText) btnText.classList.add('invisible');
    if (spinner) spinner.classList.remove('hidden');
    authErrorDiv.classList.add('hidden');

    try {
        await auth.createUserWithEmailAndPassword(email, password);
    } catch (error) {
        authErrorDiv.textContent = 'Błąd rejestracji: ' + error.message;
        authErrorDiv.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        if (btnText) btnText.classList.remove('invisible');
        if (spinner) spinner.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupAuthEventListeners();

    // Usunięto wywołanie main() - teraz onAuthStateChanged zarządza stanem

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker zarejestrowany:', reg))
            .catch(err => console.log('Błąd rejestracji Service Workera:', err));
    }

    // Initialize Flatpickr only for the range filter if the target exists.
    // #date and recurring-start-date will use native browser date pickers.
    const rangeEl = document.querySelector('#filter-date-range');
    if (rangeEl) {
        fp_range = flatpickr(rangeEl, {
            mode: "range",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d.m.Y", // Polski format: "02.08.2025"
            theme: "dark",
            locale: "pl", // Polska lokalizacja
            allowInput: true // Pozwala na ręczne wpisywanie daty
        });
    }
});
