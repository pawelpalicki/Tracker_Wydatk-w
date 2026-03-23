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
const filterDateStart = document.getElementById('filter-date-start');
const filterDateEnd = document.getElementById('filter-date-end');
const filterDateRange = document.getElementById('filter-date-range');
let filterCategoryValue = '';
let filterShopValue = '';
let filterBudgetValue = '';
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
let recurringCategoryValue = '';
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
const categoryColors = {};
const colorPalette = ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#64748b', '#06b6d4', '#a855f7', '#eab308', '#0ea5e9', '#be185d', '#16a34a', '#f43f5e', '#84cc16', '#6366f1', '#d946ef', '#fb7185'];
let colorIndex = 0;

const categoryIcons = {
    'jedzenie': 'fa-utensils',
    'spożywcze': 'fa-shopping-basket',
    'dom': 'fa-home',
    'transport': 'fa-car',
    'rozrywka': 'fa-film',
    'zdrowie': 'fa-heartbeat',
    'zakupy': 'fa-shopping-bag',
    'rachunki': 'fa-file-invoice-dollar',
    'edukacja': 'fa-graduation-cap',
    'sport': 'fa-running',
    'chemia': 'fa-jug-detergent',
    'kosmetyki': 'fa-pump-soap',
    'ubrania': 'fa-tshirt',
    'oszczędności': 'fa-piggy-bank',
    'słodycze i przekąski': 'fa-cookie-bite',
    'kaucje': 'fa-recycle',
    'inne': 'fa-ellipsis-h'
};

let activeCategoryRow = null; // Track which row is opening the drawer

function getCategoryColor(category) {
    if (!categoryColors[category]) {
        categoryColors[category] = colorPalette[colorIndex % colorPalette.length];
        colorIndex++;
    }
    return categoryColors[category];
}

function updateCustomDropdownValue(selectId, labelId) {
    const select = document.getElementById(selectId);
    const label = document.getElementById(labelId);
    if (!select || !label) return;
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption) {
        label.textContent = selectedOption.textContent;
    }
}

// --- Category Drawer Logic ---
function openCategoryDrawer(row, currentCategory, onSelect = null) {
    activeCategoryRow = row;

    const options = allCategories.map(cat => {
        const parentCat = (typeof structuredCategories !== 'undefined')
            ? structuredCategories.find(c => c.name === cat && !c.parentId)
            : null;
        const color = (parentCat && parentCat.color) || (typeof getCategoryColor === 'function' ? getCategoryColor(cat) : '#6b7280');
        const icon = (parentCat && parentCat.icon) || (typeof categoryIcons !== 'undefined' ? categoryIcons[cat.toLowerCase()] : 'fa-tag') || 'fa-tag';
        
        return {
            value: cat,
            label: cat.charAt(0).toUpperCase() + cat.slice(1),
            icon: `<i class="fas ${icon}"></i>`,
            color: color + '20'
        };
    });

    const itemName = row ? (row.querySelector('.item-name')?.value || 'produkcie') : 'filtrach';
    const title = `Kategoria dla: ${itemName}`;

    openSelectionDrawer(title, options, (val) => {
        if (onSelect) {
            onSelect(val);
        } else {
            selectCategoryFromDrawer(val);
        }
    }, currentCategory, 'grid', row !== null);
}

function closeSelectionDrawer(isFromPopState = false) {
    const overlay = document.getElementById('category-drawer-overlay');
    const drawer = document.getElementById('category-drawer');

    if (!overlay || !drawer) return;

    // If closed manually (not via back button), trigger back to sync history
    if (!isFromPopState) {
        history.back();
        return;
    }

    overlay.classList.remove('active');
    drawer.classList.remove('active');
    setTimeout(() => {
        overlay.classList.add('hidden');
        drawer.classList.add('hidden');
        document.body.style.overflow = '';
        activeCategoryRow = null;
    }, 300);
}



function selectCategoryFromDrawer(category) {
    if (activeCategoryRow) {
        const select = activeCategoryRow.querySelector('.item-category-select');
        const label = activeCategoryRow.querySelector('.item-category-label') || activeCategoryRow.querySelector('.category-trigger-label');
        const iconEl = activeCategoryRow.querySelector('.item-category-icon') || activeCategoryRow.querySelector('.category-trigger-icon');

        select.value = category;
        label.textContent = category.charAt(0).toUpperCase() + category.slice(1);

        // Update icon on the button if it exists
        if (iconEl) {
            const icon = categoryIcons[category] || 'fa-tag';
            const color = getCategoryColor(category);
            iconEl.innerHTML = `<i class="fas ${icon}" style="color: ${color}"></i>`;
        }

        select.dispatchEvent(new Event('change'));
        closeSelectionDrawer();
    }
}

// Global listeners for drawer
document.addEventListener('click', (e) => {
    if (e.target.id === 'close-category-drawer' || e.target.id === 'category-drawer-overlay') {
        closeSelectionDrawer();
    }

    if (e.target.closest('#drawer-add-category-btn')) {
        if (activeCategoryRow) {
            const select = activeCategoryRow.querySelector('.item-category-select');
            select.value = '__add_new__';
            select.dispatchEvent(new Event('change'));
        }
        closeSelectionDrawer();
    }
});

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

// --- FAB Scroll Logic ---
// --- FAB Scroll Logic (Multi-Container Support) ---
const lastScrollPositions = new WeakMap();

function handleFABScroll(e) {
    const target = e.target;
    // Determine current scroll position
    let currentScrollY = 0;

    if (target === window || target === document) {
        currentScrollY = window.pageYOffset || document.documentElement.scrollTop || window.scrollY || 0;
    } else if (target instanceof Element) {
        currentScrollY = target.scrollTop;
    }

    // Get last scroll position for this specific target
    let lastScrollY = lastScrollPositions.get(target) || 0;

    // Update last scroll position immediately
    lastScrollPositions.set(target, currentScrollY);

    // Skip if difference is negligible (e.g. overscroll or tiny movements)
    if (Math.abs(currentScrollY - lastScrollY) < 5) return;

    // Auto-show FAB at the very bottom (of the specific container or window)
    let containerHeight = 0;
    let contentHeight = 0;

    if (target === window || target === document) {
        containerHeight = window.innerHeight;
        contentHeight = document.body.offsetHeight;
    } else if (target instanceof Element) {
        containerHeight = target.clientHeight;
        contentHeight = target.scrollHeight;
    }

    // If near bottom, show
    if (containerHeight + currentScrollY >= contentHeight - 50) {
        if (fabContainer.classList.contains('hide')) {

            fabContainer.classList.remove('hide');
        }
        return;
    }

    // Direction check
    if (currentScrollY > lastScrollY && currentScrollY > 50) {
        // Scrolling DOWN
        if (!fabContainer.classList.contains('hide')) {

            fabContainer.classList.add('hide');
            fabActions.classList.add('hidden');
            mainFabBtn.classList.remove('expanded');
        }
    } else if (currentScrollY < lastScrollY) {
        // Scrolling UP
        if (fabContainer.classList.contains('hide')) {

            fabContainer.classList.remove('hide');
        }
    }
}

// Floating Action Button (FAB) logic
let isFabExpanded = false;

function toggleFab(isFromPopState = false) {
    if (!isFromPopState && !isFabExpanded) {
        // Opening FAB - push state
        history.pushState({ type: 'fab' }, "", "");
    } else if (!isFromPopState && isFabExpanded) {
        // Closing manually - sync history
        history.back();
        return;
    }

    isFabExpanded = !isFabExpanded;
    fabActions.classList.toggle('hidden', !isFabExpanded);
    fabActions.classList.toggle('expanded', isFabExpanded);
    mainFabBtn.classList.toggle('expanded', isFabExpanded);

    const overlay = document.getElementById('fab-overlay');
    overlay.classList.toggle('hidden', !isFabExpanded);
    setTimeout(() => {
        overlay.classList.toggle('active', isFabExpanded);
    }, 10);

    // Animate sub-buttons
    const subItems = fabActions.querySelectorAll('.fab-sub-item');
    subItems.forEach((item, index) => {
        if (isFabExpanded) {
            item.style.transitionDelay = `${index * 50}ms`;
        } else {
            item.style.transitionDelay = `${(subItems.length - 1 - index) * 50}ms`;
        }
    });
}

// --- Główna Logika Aplikacji ---
function setupAppEventListeners() {
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
    // Initialize swipe container
    initSwipeContainer();

    // Browser back button support (obsługuje też natywny systemowy gest swipe wtecz: iOS / Android)
    window.addEventListener('popstate', (event) => {
        const state = event.state;

        // --- 1. OBSŁUGA WARSTW (OVERLAYS) ---
        
        // A. Zamknij FAB
        if (isFabExpanded) {
            isFabExpanded = false;
            fabActions.classList.add('hidden');
            fabActions.classList.remove('expanded');
            mainFabBtn.classList.remove('expanded');
            const overlay = document.getElementById('fab-overlay');
            if (overlay) {
                overlay.classList.add('hidden');
                overlay.classList.remove('active');
            }
            return; // Przechwycono wstecz
        }

        // B. Zamknij Overlay (Modal/Popup) jeśli stan to 'overlay'
        if (state && state.type === 'overlay') {
            // Myślimy odwrotnie: jeśli w historii JEST stan overlay, to go pokazujemy
            // Ale tu jesteśmy w popstate, co oznacza że WŁAŚNIE WRÓCILIŚMY ze stanu overlay.
            // Więc szukamy co jest aktualnie otwarte w DOM i to zamykamy.
        }

        // B. Zamknij Szuflady (Selection Drawer)
        const drawerOverlay = document.getElementById('category-drawer-overlay');
        if (drawerOverlay && drawerOverlay.classList.contains('active')) {
            closeSelectionDrawer(true);
            return; // Przechwycono wstecz
        }

        // C. Zamknij Modale i Pop-upy
        const activeModals = document.querySelectorAll(`
            #category-details-modal:not(.hidden), 
            #receipt-modal:not(.hidden), 
            #receipt-modal-analysis:not(.hidden), 
            #month-picker-popup:not(.hidden), 
            #comparison-year-popup:not(.hidden), 
            #period-type-popup:not(.hidden), 
            #shop-autocomplete-list:not(.hidden),
            #custom-start-popup:not(.hidden),
            #custom-end-popup:not(.hidden),
            #copy-budget-modal:not(.hidden),
            #edit-special-budget-modal:not(.hidden)
        `);

        if (activeModals.length > 0) {
            activeModals.forEach(m => {
                if (typeof closeOverlay === 'function') {
                    closeOverlay(m.id, true);
                } else {
                    m.classList.add('hidden');
                }
            });
            return; // Przechwycono wstecz
        }

        // --- 2. NAWIGACJA MIĘDZY WIDOKAMI (TABS) ---
        
        if (state && state.type === 'tab') {
            switchTab(state.id, false);
        } else if (!state) {
            // Jeśli brak stanu (np. powrót do startu sesji), wymuś Kokpit
            switchTab('home', false);
        }
    });

    // Initialize swipe container
    initSwipeContainer();

    // FAB scroll handling - attach to ALL potential scroll containers
    window.addEventListener('scroll', handleFABScroll, { passive: true });
    document.body.addEventListener('scroll', handleFABScroll, { passive: true });

    // Attach to specific scrollable elements (like legends and budget details)
    const scrollableElements = document.querySelectorAll('.overflow-y-auto');
    scrollableElements.forEach(el => {
        el.addEventListener('scroll', handleFABScroll, { passive: true });
    });

    // Re-attach listeners when DOM might change (e.g. after rendering stats)
    const observer = new MutationObserver(() => {
        const newScrollables = document.querySelectorAll('.overflow-y-auto');
        newScrollables.forEach(el => {
            el.removeEventListener('scroll', handleFABScroll); // avoid duplicates
            el.addEventListener('scroll', handleFABScroll, { passive: true });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });

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
    addItemBtn.addEventListener('click', () => addItemRow());
    itemsContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('item-price') || e.target.classList.contains('item-name')) {
            updatePurchaseSummary();
        }
    });
    function exitEditMode() {
    editMode.active = false;
    editMode.purchaseId = null;
    purchaseForm.reset();
    purchaseFormTitle.textContent = 'Dodaj nowy zakup ręcznie';
    cancelEditBtn.classList.add('hidden');
    itemsContainer.innerHTML = '';
    addItemRow();
    updatePurchaseSummary();
    if (typeof resetPurchaseTags === 'function') resetPurchaseTags();
}
    document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
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


    // Obsługa modala szczegółów kategorii
    closeCategoryDetailsBtn.addEventListener('click', () => closeOverlay('category-details-modal'));
    categoryDetailsModal.addEventListener('click', (e) => {
        if (e.target === categoryDetailsModal) {
            closeOverlay('category-details-modal');
        }
    });
    document.getElementById('category-chart')?.addEventListener('click', handleCategoryChartClick);

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

    // Logika filtrów
    filterToggle?.addEventListener('click', () => {
        filtersContainer.classList.toggle('hidden');
        filterArrow.classList.toggle('rotate-180');
    });

    const filterElements = [filterKeyword, filterMinAmount, filterMaxAmount, filterDateRange, filterDateStart, filterDateEnd];
    filterElements.forEach(el => {
        if (el) el.addEventListener('change', handleFilterChange);
    });

    clearFiltersBtn.addEventListener('click', () => {
        filterKeyword.value = '';
        filterDateStart.value = '';
        filterDateEnd.value = '';
        filterCategoryValue = '';
        const catLabel = document.getElementById('filter-category-label');
        if (catLabel) catLabel.textContent = 'Wszystkie kategorie';

        filterShopValue = '';
        const shopLabel = document.getElementById('filter-shop-label');
        if (shopLabel) shopLabel.textContent = 'Wszystkie sklepy';

        filterBudgetValue = '';
        const budgetLabel = document.getElementById('filter-budget-label');
        if (budgetLabel) budgetLabel.textContent = 'Wszystkie budżety';

        filterMinAmount.value = '';
        filterMaxAmount.value = '';
        handleFilterChange();
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
        for (let i = -2; i <= 12; i++) {
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
        const options = allCategories.map(cat => ({
            value: cat,
            label: cat.charAt(0).toUpperCase() + cat.slice(1),
            icon: `<i class="fas ${categoryIcons[cat] || 'fa-tag'}"></i>`,
            color: getCategoryColor(cat) + '20'
        }));
        openSelectionDrawer('Kategoria subskrypcji', options, (val, label) => {
            recurringCategoryValue = val;
            document.getElementById('recurring-category-label').textContent = label;
            const icon = categoryIcons[val] || 'fa-tag';
            const color = getCategoryColor(val);
            document.getElementById('recurring-category-icon').innerHTML = `<i class="fas ${icon}" style="color: ${color}"></i>`;
        }, recurringCategoryValue, 'grid', false);
    });

    const addCategoryDrawerBtn = document.getElementById('add-category-drawer-btn');
    const newCategoryDrawerForm = document.getElementById('new-category-drawer-form');
    const newCategoryDrawerInput = document.getElementById('new-category-drawer-input');
    const cancelAddCategoryDrawerBtn = document.getElementById('cancel-add-category-drawer-btn');
    const saveCategoryDrawerBtn = document.getElementById('save-category-drawer-btn');

    addCategoryDrawerBtn?.addEventListener('click', () => {
        addCategoryDrawerBtn.classList.add('hidden');
        newCategoryDrawerForm.classList.remove('hidden');
        newCategoryDrawerInput.value = '';
        newCategoryDrawerInput.focus();
    });

    cancelAddCategoryDrawerBtn?.addEventListener('click', () => {
        newCategoryDrawerForm.classList.add('hidden');
        addCategoryDrawerBtn.classList.remove('hidden');
    });

    saveCategoryDrawerBtn?.addEventListener('click', async () => {
        const newName = newCategoryDrawerInput.value.trim().toLowerCase();
        if (newName) {
            if (allCategories.includes(newName)) {
                alert('Taka kategoria już istnieje.');
                return;
            }
            try {
                await apiCall('/api/categories', 'POST', { name: newName });
                await fetchInitialData(false);
                if (typeof renderCategoriesList === 'function') renderCategoriesList();

                // Auto-select the newly added category
                if (window.currentOnSelect) {
                    window.currentOnSelect(newName, newName.charAt(0).toUpperCase() + newName.slice(1));
                }

                closeSelectionDrawer();
            } catch (error) {
                alert('Nie udało się dodać kategorii: ' + error.message);
            }
        }
    });

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

    // DODAJ TEN EVENT LISTENER TUTAJ:
    document.getElementById('toggle-budget-details')?.addEventListener('click', toggleBudgetDetails);
    document.getElementById('toggle-legend-details')?.addEventListener('click', toggleChartLegend);

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
    if (filterShopValue) params.append('shop', filterShopValue);
    if (filterBudgetValue) params.append('budget', filterBudgetValue);
    if (filterMinAmount.value) params.append('minAmount', filterMinAmount.value);
    if (filterMaxAmount.value) params.append('maxAmount', filterMaxAmount.value);

    if (filterDateStart.value && filterDateEnd.value) {
        params.append('startDate', filterDateStart.value);
        params.append('endDate', filterDateEnd.value);
    } else if (fp_range && fp_range.selectedDates.length === 2) {
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
        [allCategories, structuredCategories, allShops, allSpecialBudgets, allRecurringExpenses] = await Promise.all([
            apiCall('/api/categories'),
            apiCall('/api/categories/v2'),
            apiCall('/api/shops'),
            apiCall('/api/special-budgets'),
            apiCall('/api/recurring-expenses') // Fetch recurring expenses
        ]);

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
        'chemia': 'fa-pump-soap',
        'transport': 'fa-car',
        'rozrywka': 'fa-film',
        'zdrowie': 'fa-heartbeat',
        'ubrania': 'fa-tshirt',
        'dom': 'fa-home',
        'rachunki': 'fa-file-invoice-dollar',
        'kaucje': 'fa-piggy-bank',
        'inne': 'fa-tag'
    };

    // Generuj nową strukturę
    structuredCategories = allCategories.map((catName, index) => {
        const color = CAT_COLOR_OPTIONS[index % CAT_COLOR_OPTIONS.length];
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
    await renderDashboard(); // Renduruj kokpit zamiast starych statystyk
    renderSpecialBudgetsList();
    populateBudgetTypeSelect();
}

function populateBudgetTypeSelect() {
    budgetTypeSelectValue = 'monthly';
    const label = document.getElementById('budget-type-label');
    if (label) {
        label.textContent = 'Budżet miesięczny';
    }
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
                <span class="text-sm text-gray-500 dark:text-gray-400 ml-2">${formatAmount(budget.amount)}</span>
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
            openOverlay('edit-special-budget-modal');
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
                <p class="text-sm text-gray-600 dark:text-gray-400">${formatAmount(expense.amount)} - ${expense.category} (${scheduleText})</p>
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
    const category = recurringCategoryValue;
    const scheduleType = scheduleTypeValue;

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
            const dayOfWeek = parseInt(recurringDayOfWeekValue);
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
    recurringCategoryValue = expense.category;

    if (expense.schedule) {
        scheduleTypeValue = expense.schedule.type;
        handleScheduleTypeChange(); // Update visibility and required attributes
        switch (expense.schedule.type) {
            case 'monthly':
                recurringDayOfMonth.value = expense.schedule.dayOfMonth;
                break;
            case 'weekly':
                recurringDayOfWeekValue = String(expense.schedule.dayOfWeek);
                break;
            case 'daily_interval':
                recurringInterval.value = expense.schedule.interval;
                recurringStartDate.value = expense.schedule.startDate;
                break;
        }
    } else {
        // Handle legacy data with no schedule
        scheduleTypeValue = 'monthly';
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
    const type = scheduleTypeValue;

    // Toggle visibility
    monthlySettings.classList.toggle('hidden', type !== 'monthly');
    weeklySettings.classList.toggle('hidden', type !== 'weekly');
    intervalSettings.classList.toggle('hidden', type !== 'daily_interval');

    // Toggle required attribute
    recurringDayOfMonth.required = (type === 'monthly');
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
    exitEditMode();
    handleScheduleTypeChange();
    if (typeof initHomeDashboardControls === 'function') initHomeDashboardControls();
    if (typeof initPurchaseTags === 'function') initPurchaseTags();
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

    // Initialize Flatpickr only for the range filter (and others that need it)
    // #date and recurring-start-date will use native browser date pickers
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