// main.js — Punkt wejścia aplikacji (ES Module)
//
// Ten plik jest jedynym <script type="module"> w index.html.
// Importuje moduły core/ i inicjalizuje aplikację.

import { auth } from './core/config.js';
import { setupAuthEventListeners } from './core/auth.js';
import { initializeApp } from './core/bootstrap.js';

// Importy dla inicjalizacji DOM (te moduły same podpinają listenery jeśli trzeba, 
// lub są wywoływane w initializeApp)
import { initNotifications } from './shared/notifications.js';

// =====================================================================
// AUTH OBSERVER
// =====================================================================

const loadingSection = document.getElementById('loading-section');
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');

/**
 * Resetuje stan menu FAB przy zmianie widoku lub logowaniu.
 */
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
        
        // Inicjalizacja logiki aplikacji po zalogowaniu
        initializeApp();
    } else {
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }
});

// =====================================================================
// DOM CONTENT LOADED
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {
    setupAuthEventListeners();
    initNotifications();

    // Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker zarejestrowany:', reg))
            .catch(err => console.log('Błąd rejestracji Service Workera:', err));
    }
});
