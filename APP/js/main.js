// main.js — Punkt wejścia aplikacji (ES Module)
//
// Ten plik jest jedynym <script type="module"> w index.html.
// Importuje moduły core/ i eksponuje niezbędne globale dla starych skryptów,
// które nie zostały jeszcze zmigrowane na ESM.

import { auth, db, IS_DEVELOPMENT, API_BASE_URL } from './core/config.js';
import state from './core/state.js';
import { apiCall, apiCallWithFile } from './core/api.js';
import { setupAuthEventListeners, logout } from './core/auth.js';
import { initializeApp, fetchInitialData } from './core/bootstrap.js';

// Import warstwy współdzielonej
import * as format from './shared/format.js';
import * as ui from './shared/ui.js';
import * as categories from './shared/categories.js';
import * as tags from './shared/tags.js';
import * as dashboard from './views/dashboard.js';
import * as purchaseForm from './views/purchase-form.js';
import * as purchaseList from './views/purchase-list.js';
import * as analysis from './views/analysis.js';
import * as specialBudgets from './views/special-budgets.js';
import * as recurringExpenses from './views/settings/recurring-expenses.js';
import * as monthlyBudget from './views/settings/monthly-budget.js';
import * as categoriesManager from './views/settings/categories-manager.js';
import * as tagsManager from './views/settings/tags-manager.js';
import * as notifications from './shared/notifications.js';

// =====================================================================
// EKSPOZYCJA GLOBALI DLA STARYCH SKRYPTÓW
// =====================================================================
// Stare pliki (ui.js, statistics.js, purchases.js itd.) wciąż działają
// jako zwykłe <script> i potrzebują tych zmiennych w globalnym scope.
// Te eksporty zostaną usunięte w Etapie 5 po pełnej migracji.

window.auth = auth;
window.db = db;
window.IS_DEVELOPMENT = IS_DEVELOPMENT;
window.API_BASE_URL = API_BASE_URL;
window.apiCall = apiCall;
window.apiCallWithFile = apiCallWithFile;
window.logout = logout;
window.initializeApp = initializeApp;
window.fetchInitialData = fetchInitialData;

// Eksport formatowania
window.formatAmount = format.formatAmount;

// Eksport UI
window.switchTab = ui.switchTab;
window.updateNavbar = ui.updateNavbar;
window.openSelectionDrawer = ui.openSelectionDrawer;
window.closeSelectionDrawer = ui.closeSelectionDrawer;
window.openDrawer = ui.openDrawer;
window.closeDrawer = ui.closeDrawer;
window.openOverlay = ui.openOverlay;
window.closeOverlay = ui.closeOverlay;
window.hasVisibleBlockingOverlay = ui.hasVisibleBlockingOverlay;
window.acquireOverlayNavigationLock = ui.acquireOverlayNavigationLock;
window.releaseOverlayNavigationLock = ui.releaseOverlayNavigationLock;
window.reapplyOverlayNavigationLock = ui.reapplyOverlayNavigationLock;
window.consumeOverlayLockPopstateIgnore = ui.consumeOverlayLockPopstateIgnore;

// Eksport Kategorii
window.openHierarchicalCategoryDrawer = categories.openHierarchicalCategoryDrawer;
window.applyCategorySelectionState = categories.applyCategorySelectionState;
window.getParentCategoryByName = categories.getParentCategoryByName;
window.getSubCategoryByName = categories.getSubCategoryByName;
window.getCategorySelectionState = categories.getCategorySelectionState;

// Eksport Tagów
window.getTagOptions = tags.getTagOptions;
window.getTagDefaultValue = tags.getTagDefaultValue;
window.getTagLabel = tags.getTagLabel;
window.openDynamicTagSelection = tags.openDynamicTagSelection;
window.getTagGroupLabel = tags.getTagGroupLabel;
window.buildTagsSummary = tags.buildTagsSummary;
window.getTagGroups = tags.getTagGroups;
window.getDefaultTagValues = tags.getDefaultTagValues;
window.openTagsDrawer = tags.openTagsDrawer;
window.closeTagsDrawer = tags.closeTagsDrawer;
window.confirmTagsSelection = tags.confirmTagsSelection;
window.initTagsSelectionDrawer = tags.initTagsSelectionDrawer;

window.renderDashboard = dashboard.renderDashboard;
window.initDashboard = dashboard.initDashboard;
window.initHomeDashboardControls = dashboard.initHomeDashboardControls;

// Eksport modala kategorii (przeniesiony do shared/ui.js)
window.renderCategoryDetailsModal = ui.renderCategoryDetailsModal;
window.closeCategoryDetailsDrawer = ui.closeCategoryDetailsDrawer;

// Eksport powiadomień (przeniesiony do shared/notifications.js)
window.initNotifications = notifications.initNotifications;
window.loadNotifications = notifications.loadNotifications;
window.openNotificationsDrawer = notifications.openNotificationsDrawer;
window.closeNotificationsDrawer = notifications.closeNotificationsDrawer;
window.deleteNotification = notifications.deleteNotification;
window.checkAndGenerateNotifications = notifications.checkAndGenerateNotifications;
window.generateAIInsights = notifications.generateAIInsights;
window.calculateCurrentMonthStats = notifications.calculateCurrentMonthStats;

window.initPurchaseForm = purchaseForm.initPurchaseForm;
window.updatePurchaseSummary = purchaseForm.updatePurchaseSummary;
window.clearPurchaseItems = purchaseForm.clearPurchaseItems;
window.addItemRow = purchaseForm.addItemRow;
window.renderPurchaseItems = purchaseForm.renderPurchaseItems;
window.openProductDrawer = purchaseForm.openProductDrawer;
window.closeProductDrawer = purchaseForm.closeProductDrawer;
window.handlePurchaseFormSubmit = purchaseForm.handlePurchaseFormSubmit;
window.handleAnalyzeReceipt = purchaseForm.handleAnalyzeReceipt;
window.fillFormWithAnalysis = purchaseForm.fillFormWithAnalysis;
window.enterEditMode = purchaseForm.enterEditMode;
window.exitEditMode = purchaseForm.exitEditMode;
window.setPurchaseBudgetType = purchaseForm.setPurchaseBudgetType;
window.startCamera = purchaseForm.startCamera;
window.stopCamera = purchaseForm.stopCamera;
window.capturePhoto = purchaseForm.capturePhoto;
window.handleFileSelect = purchaseForm.handleFileSelect;
window.renderShopAutocomplete = purchaseForm.renderShopAutocomplete;
window.resizeImage = purchaseForm.resizeImage;
window.openVoiceExpenseModal = purchaseForm.openVoiceExpenseModal;
window.analysisAnimation = purchaseForm.analysisAnimation;

window.initPurchaseList = purchaseList.initPurchaseList;
window.initPurchaseListFilters = purchaseList.initPurchaseListFilters;
window.initFilterDrawers = purchaseList.initPurchaseListFilters;
window.openFilterDrawer = purchaseList.openFilterDrawer;
window.closeFilterDrawer = purchaseList.closeFilterDrawer;
window.handleFilterChange = purchaseList.handleFilterChange;
window.handleInfiniteScroll = purchaseList.handleInfiniteScroll;
window.getFilterQueryParams = purchaseList.getFilterQueryParams;
window.loadInitialPurchases = purchaseList.loadInitialPurchases;
window.fetchMorePurchases = purchaseList.fetchMorePurchases;
window.renderPurchasesList = purchaseList.renderPurchasesList;

// Eksport budżetów specjalnych (views/special-budgets.js)
window.initSpecialBudgets = specialBudgets.initSpecialBudgets;
window.renderSpecialBudgetsTab = specialBudgets.renderSpecialBudgetsTab;
window.renderSpecialBudgetsList = specialBudgets.renderSpecialBudgetsList;
window.populateBudgetTypeSelect = specialBudgets.populateBudgetTypeSelect;
window.handleAddSpecialBudget = specialBudgets.handleAddSpecialBudget;
window.handleSpecialBudgetActions = specialBudgets.handleSpecialBudgetActions;
window.handleEditSpecialBudgetSubmit = specialBudgets.handleEditSpecialBudgetSubmit;

// Eksport wydatków cyklicznych (views/settings/recurring-expenses.js)
window.initSettingsRecurring = recurringExpenses.initSettingsRecurring;
window.renderRecurringExpenses = recurringExpenses.renderRecurringExpenses;
window.handleScheduleTypeChange = recurringExpenses.handleScheduleTypeChange;

// Eksport budżetu miesięcznego (views/settings/monthly-budget.js)
window.initMonthlyBudget = monthlyBudget.initMonthlyBudget;
window.renderBudgetInputs = monthlyBudget.renderBudgetInputs;
window.populateBudgetMonthSelector = monthlyBudget.populateBudgetMonthSelector;

// Eksport managera kategorii (views/settings/categories-manager.js)
window.initCategoriesManager = categoriesManager.initCategoriesManager;
window.renderCategoriesListV2 = categoriesManager.renderCategoriesListV2;

// Eksport managera tagów (views/settings/tags-manager.js)
window.initTagsManager = tagsManager.initTagsManager;
window.renderTagsManager = tagsManager.renderTagsManager;

// Eksport analizy (views/analysis.js)
window.initializeLongTermBudget = analysis.initializeLongTermBudget;
window.renderUnifiedComparisonChart = analysis.renderUnifiedComparisonChart;
window.renderAnalysisTagFilterButton = analysis.renderAnalysisTagFilterButton;

// Stan aplikacji — proxy na window, żeby stare skrypty mogły czytać/pisać
// zmienne jak allPurchases, structuredCategories itp.
// Używamy Object.defineProperty, żeby zmiany w state.X były widoczne globalnie
// i odwrotnie.
const stateKeys = Object.keys(state);
for (const key of stateKeys) {
    Object.defineProperty(window, key, {
        get() { return state[key]; },
        set(value) { state[key] = value; },
        configurable: true,
        enumerable: true
    });
}

// =====================================================================
// AUTH OBSERVER
// =====================================================================

const loadingSection = document.getElementById('loading-section');
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');

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
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        // initializeApp() jest zdefiniowana w app.js (stary skrypt)
        if (typeof window.initializeApp === 'function') {
            window.initializeApp();
        }
    } else {
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach(track => track.stop());
            state.cameraStream = null;
        }
    }
});

// =====================================================================
// DOM CONTENT LOADED
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {
    setupAuthEventListeners();
    notifications.initNotifications();
    tags.initTagsSelectionDrawer();

    // Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker zarejestrowany:', reg))
            .catch(err => console.log('Błąd rejestracji Service Workera:', err));
    }

    // Flatpickr (ładowany z CDN jako zwykły <script>)
    const rangeEl = document.querySelector('#filter-date-range');
    if (rangeEl && typeof flatpickr !== 'undefined') {
        state.fp_range = flatpickr(rangeEl, {
            mode: "range",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d.m.Y",
            theme: "dark",
            locale: "pl",
            allowInput: true
        });
    }
});
