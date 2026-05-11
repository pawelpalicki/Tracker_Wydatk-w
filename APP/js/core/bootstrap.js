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
import {
    switchTab,
    consumeOverlayLockPopstateIgnore,
    hasVisibleBlockingOverlay,
    reapplyOverlayNavigationLock,
    handleBlockingOverlayBackNavigation
} from '../shared/ui.js';
import { formatAmount } from '../shared/format.js';

// Importy widoków i ich inicjalizacji
import { initPurchaseForm, exitEditMode } from '../views/purchase-form.js';
import { initPurchaseList, initPurchaseListFilters } from '../views/purchase-list.js';
import {
    initSpecialBudgets,
} from '../views/special-budgets.js';
import { initSettingsRecurring } from '../views/settings/recurring-expenses.js';
import { initMonthlyBudget } from '../views/settings/monthly-budget.js';
import { initCategoriesManager } from '../views/settings/categories-manager.js';
import { initTagsManager } from '../views/settings/tags-manager.js';
import { initNotifications } from '../shared/notifications.js';
import { initHomeDashboardControls } from '../views/dashboard.js';

// Importy serwisu danych
import { fetchInitialData } from './data-loader.js';

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
    addEventListener('popstate', (event) => {
        const stateData = event.state;
        
        if (consumeOverlayLockPopstateIgnore()) {
            return;
        }

        if (hasVisibleBlockingOverlay()) {
            const overlayBackResult = handleBlockingOverlayBackNavigation();
            if (hasVisibleBlockingOverlay() && overlayBackResult?.overlayClosed !== false) {
                reapplyOverlayNavigationLock();
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
    initPurchaseForm();
    initPurchaseList();
    initSpecialBudgets();
    initSettingsRecurring();
    initMonthlyBudget();
    initCategoriesManager();
    initTagsManager();

    // Dynamic Navbar buttons
    document.getElementById('nav-back-btn')?.addEventListener('click', () => {
        history.back();
    });

    // Inicjalizuj powiadomienia
    initNotifications();

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
        { id: 'settings-tags-link', tab: 'settings-tags' },
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

    exitEditMode();
    initHomeDashboardControls();
}
