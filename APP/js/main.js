// main.js — Punkt wejścia aplikacji (ES Module)
//
// Ten plik jest jedynym <script type="module"> w index.html.
// Importuje moduły core/ i eksponuje niezbędne globale dla starych skryptów,
// które nie zostały jeszcze zmigrowane na ESM.

import { auth, db, IS_DEVELOPMENT, API_BASE_URL } from './core/config.js';
import state from './core/state.js';
import { apiCall, apiCallWithFile } from './core/api.js';
import { setupAuthEventListeners, logout } from './core/auth.js';

// Import warstwy współdzielonej
import * as format from './shared/format.js';
import * as ui from './shared/ui.js';
import * as categories from './shared/categories.js';
import * as tags from './shared/tags.js';

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
