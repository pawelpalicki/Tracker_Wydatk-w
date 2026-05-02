/**
 * Moduł Bootstrap - Inicjalizacja aplikacji.
 * Zawiera funkcje odpowiedzialne za:
 * - Pobieranie początkowych danych (fetchInitialData)
 * - Inicjalizację event listenerów (setupAppEventListeners)
 * - Główną funkcję inicjalizacyjną (initializeApp)
 * - Auto-migrację kategorii
 * - Aktualizację salda miesięcznego
 */

import state from './state.js';
import { apiCall } from './api.js';
import { auth } from './config.js';
import { switchTab } from '../shared/ui.js';
import { formatAmount } from '../shared/format.js';

let appEventListenersInitialized = false;

/**
 * Konfiguruje event listenery dla głównej aplikacji.
 */
function setupAppEventListeners() {
    if (appEventListenersInitialized) {
        return;
    }
    appEventListenersInitialized = true;

    // Bottom nav tabs
    const bottomNavBtns = document.querySelectorAll('.bottom-nav-btn');
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
        const stateData = event.state;
        
        if (typeof window.consumeOverlayLockPopstateIgnore === 'function' && window.consumeOverlayLockPopstateIgnore()) {
            return;
        }

        if (typeof window.hasVisibleBlockingOverlay === 'function' && window.hasVisibleBlockingOverlay()) {
            if (typeof window.reapplyOverlayNavigationLock === 'function') {
                window.reapplyOverlayNavigationLock();
            }
            return;
        }

        if (stateData && stateData.type === 'tab') {
            switchTab(stateData.id, false);
        } else if (!stateData) {
            switchTab('home', false);
        }
    });

    // Inicjalizacja modułów
    if (typeof window.initPurchaseForm === 'function') window.initPurchaseForm();
    if (typeof window.initPurchaseList === 'function') window.initPurchaseList();
    if (typeof window.initSpecialBudgets === 'function') window.initSpecialBudgets();
    if (typeof window.initSettingsRecurring === 'function') window.initSettingsRecurring();
    if (typeof window.initMonthlyBudget === 'function') window.initMonthlyBudget();
    if (typeof window.initCategoriesManager === 'function') window.initCategoriesManager();
    if (typeof window.initTagsManager === 'function') window.initTagsManager();

    // Dynamic Navbar buttons
    document.getElementById('nav-back-btn')?.addEventListener('click', () => {
        window.history.back();
    });

    document.getElementById('nav-user-btn')?.addEventListener('click', () => {
        switchTab('more');
    });

    // Inicjalizuj powiadomienia
    if (typeof window.initNotifications === 'function') window.initNotifications();

    // Zamiana inline onclick na event listenery
    setupInlineClickHandlers();
}

/**
 * Zamienia inline onclick na event listenery.
 */
function setupInlineClickHandlers() {
    // Dashboard - link do analizy
    const analysisLink = document.getElementById('dashboard-analysis-link');
    if (analysisLink) {
        analysisLink.addEventListener('click', () => switchTab('analysis'));
    }

    // Dashboard - link do listy zakupów
    const listLink = document.getElementById('dashboard-list-link');
    if (listLink) {
        listLink.addEventListener('click', () => switchTab('list'));
    }

    // Settings - przyciski nawigacji
    const settingsButtons = [
        { id: 'settings-categories-link', tab: 'settings-categories' },
        { id: 'settings-budget-link', tab: 'settings-budget' },
        { id: 'settings-special-link', tab: 'settings-special' },
        { id: 'settings-recurring-link', tab: 'settings-recurring' }
    ];

    settingsButtons.forEach(({ id, tab }) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => switchTab(tab));
        }
    });
}

/**
 * Auto-migracja starych kategorii do struktury hierarchicznej.
 */
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
    state.structuredCategories = state.allCategories.map((catName, index) => {
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
        await apiCall('/api/categories/v2', 'POST', { structuredCategories: state.structuredCategories });
        console.log("Pomyślnie zmigrowano kategorie.");
    } catch (err) {
        console.error("Błąd podczas migracji kategorii:", err);
    }
}

/**
 * Pobiera początkowe dane aplikacji.
 */
export async function fetchInitialData(shouldSwitchToDefault = true) {
    try {
        // Pobierz dane, które nie wymagają paginacji
        [
            state.allCategories,
            state.structuredCategories,
            state.allShops,
            state.allSpecialBudgets,
            state.allRecurringExpenses,
            state.tagDefinitions
        ] = await Promise.all([
            apiCall('/api/categories'),
            apiCall('/api/categories/v2'),
            apiCall('/api/shops'),
            apiCall('/api/special-budgets'),
            apiCall('/api/recurring-expenses'),
            apiCall('/api/tags')
        ]);

        // Renderuj dynamiczne filtry tagów w analizie
        if (typeof window.renderAnalysisTagFilterButton === 'function') {
            window.renderAnalysisTagFilterButton();
        }

        // Załaduj pierwszą stronę zakupów
        await window.loadInitialPurchases?.();

        // Auto-migracja, jeśli brak kategorii hierarchicznych
        if (state.structuredCategories.length === 0 && state.allCategories.length > 0) {
            console.log("Wykryto brak kategorii hierarchicznych. Uruchamiam auto-migrację...");
            await migrateToStructuredCategories();
        }

        // Renderuj wszystko po załadowaniu wszystkich danych
        await renderAll();
        
        if (typeof window.populateBudgetMonthSelector === 'function') {
            window.populateBudgetMonthSelector();
        }
        
        if (typeof window.renderRecurringExpenses === 'function') {
            window.renderRecurringExpenses();
        }
        
        if (shouldSwitchToDefault) {
            switchTab('home');
        }

        // Załaduj powiadomienia po starcie
        if (typeof window.loadNotifications === 'function') {
            window.loadNotifications();
        }
    } catch (error) {
        alert(error.message);
    }
}

/**
 * Renderuje wszystkie widoki aplikacji.
 */
async function renderAll() {
    // Uruchamiamy procesy niezależnie, aby nie blokować renderowania prostych list
    updateMonthlyBalance().catch(err => console.error('Błąd salda:', err));
    window.renderDashboard?.().catch(err => console.error('Błąd kokpitu:', err));
    
    // To renderuje się natychmiast, bo nie wymaga oczekiwania na powyższe
    if (typeof window.renderSpecialBudgetsList === 'function') {
        window.renderSpecialBudgetsList();
    }
    
    if (typeof window.populateBudgetTypeSelect === 'function') {
        window.populateBudgetTypeSelect();
    }
    
    // Jeśli jesteśmy na zakładce budżetów specjalnych, odświeżamy też karty z wykresami
    if (typeof window.renderSpecialBudgetsTab === 'function' && 
        document.getElementById('special-budgets-tab')?.classList.contains('active')) {
        window.renderSpecialBudgetsTab();
    }
}

/**
 * Aktualizuje saldo miesięczne w headerze.
 */
export async function updateMonthlyBalance() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const monthlyBalanceValue = document.getElementById('monthly-balance-value');
    const monthlyBalanceLabel = document.getElementById('monthly-balance-label');

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

/**
 * Główna funkcja inicjalizacyjna aplikacji.
 */
export async function initializeApp() {
    setupAppEventListeners();

    // Set initial history state
    const currentTab = document.querySelector('.bottom-nav-btn.active')?.dataset.tab || 'home';
    history.replaceState({ type: 'tab', id: currentTab }, "", "");

    // Dodaj małe opóźnienie, żeby token Firebase Auth był gotowy
    await new Promise(resolve => setTimeout(resolve, 100));
    await fetchInitialData();
    
    // Safety check for new users: if categories were initialized in backend, they might have been empty in the first fetch
    if (state.structuredCategories.length === 0 && state.allCategories.length === 0) {
        console.log("Re-fetching data for new user...");
        await fetchInitialData(false);
    }

    if (typeof window.exitEditMode === 'function') window.exitEditMode();
    if (typeof window.handleScheduleTypeChange === 'function') window.handleScheduleTypeChange();
    if (typeof window.initHomeDashboardControls === 'function') window.initHomeDashboardControls();
}
