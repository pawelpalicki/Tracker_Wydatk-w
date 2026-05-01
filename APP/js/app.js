// Tracker Wydatków - Main Application Functions
//
// Konfiguracja Firebase, stan aplikacji i logika auth są w:
//   core/config.js, core/state.js, core/auth.js, main.js
// Zmienne globalne (allPurchases, editMode, itp.) dostępne przez window
// dzięki proxy w main.js.
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
const fabVoiceExpenseBtn = document.getElementById('fab-voice-expense-btn');
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

const shopAutocompleteList = document.getElementById('shop-autocomplete-list');

// --- Funkcje Pomocnicze ---

// --- Funkcja kompresji/optymalizacji obrazu ---
async function resizeImage(file, maxSize = 1400, quality = 0.75) {
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

    if (typeof initPurchaseForm === 'function') initPurchaseForm();
    if (typeof initPurchaseList === 'function') initPurchaseList();
    if (typeof initSpecialBudgets === 'function') initSpecialBudgets();
    if (typeof initSettingsRecurring === 'function') initSettingsRecurring();
    if (typeof initMonthlyBudget === 'function') initMonthlyBudget();
    if (typeof initCategoriesManager === 'function') initCategoriesManager();
    if (typeof initTagsManager === 'function') initTagsManager();

    // Custom Triggers for Selects (Drawer version)

    // Dynamic Navbar buttons
    document.getElementById('nav-back-btn')?.addEventListener('click', () => {
        window.history.back();
    });

    document.getElementById('nav-user-btn')?.addEventListener('click', () => {
        switchTab('more');
    });

    // Inicjalizuj powiadomienia
    if (typeof initNotifications === 'function') initNotifications();

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
        await window.loadInitialPurchases();
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

        // Renderuj dynamiczne filtry tagów w analizie
        if (typeof renderAnalysisTagFilterButton === 'function') renderAnalysisTagFilterButton();

        // Załaduj pierwszą stronę zakupów
        await window.loadInitialPurchases();

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

        // Załaduj powiadomienia po starcie
        if (typeof loadNotifications === 'function') loadNotifications();
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

async function renderAll() {
    // Uruchamiamy procesy niezależnie, aby nie blokować renderowania prostych list
    updateMonthlyBalance().catch(err => console.error('Błąd salda:', err));
    window.renderDashboard?.().catch(err => console.error('Błąd kokpitu:', err));
    
    // To renderuje się natychmiast, bo nie wymaga oczekiwania na powyższe
    renderSpecialBudgetsList();
    populateBudgetTypeSelect();
    
    // Jeśli jesteśmy na zakładce budżetów specjalnych, odświeżamy też karty z wykresami
    if (typeof renderSpecialBudgetsTab === 'function' && document.getElementById('special-budgets-tab')?.classList.contains('active')) {
        renderSpecialBudgetsTab();
    }
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
