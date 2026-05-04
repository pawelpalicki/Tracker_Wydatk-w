/**
 * Moduł Data Loader - Zarządzanie pobieraniem danych i migracją.
 */
import state from './state.js';
import { apiCall } from './api.js';
import { switchTab } from '../shared/ui.js';
import { loadInitialPurchases } from '../views/purchase-list.js';
import { renderAnalysisTagFilterButton } from '../views/analysis.js';
import { renderDashboard } from '../views/dashboard.js';
import { renderSpecialBudgetsList, populateBudgetTypeSelect, renderSpecialBudgetsTab } from '../views/special-budgets.js';
import { populateBudgetMonthSelector, renderBudgetInputs } from '../views/settings/monthly-budget.js';
import { renderRecurringExpenses } from '../views/settings/recurring-expenses.js';
import { loadNotifications } from '../shared/notifications.js';

/**
 * Auto-migracja starych kategorii do struktury hierarchicznej.
 */
export async function migrateToStructuredCategories() {
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

    const colorPalette = ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#64748b', '#06b6d4', '#a855f7', '#eab308', '#0ea5e9', '#be185d', '#16a34a', '#f43f5e', '#84cc16', '#6366f1', '#d946ef', '#fb7185'];

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
        await apiCall('/api/categories/v2', 'POST', { structuredCategories: state.structuredCategories });
        console.log("Pomyślnie zmigrowano kategorie.");
    } catch (err) {
        console.error("Błąd podczas migracji kategorii:", err);
    }
}

/**
 * Renderuje wszystkie widoki aplikacji.
 */
export async function renderAll() {
    renderDashboard().catch(err => console.error('Błąd kokpitu:', err));
    renderSpecialBudgetsList();
    populateBudgetTypeSelect();
    if (document.getElementById('special-budgets-tab')?.classList.contains('active')) {
        renderSpecialBudgetsTab();
    }
}

/**
 * Pobiera początkowe dane aplikacji.
 */
export async function fetchInitialData(shouldSwitchToDefault = true) {
    try {
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

        renderAnalysisTagFilterButton();
        await loadInitialPurchases();

        if (state.structuredCategories.length === 0 && state.allCategories.length > 0) {
            await migrateToStructuredCategories();
        }

        await renderAll();
        populateBudgetMonthSelector();
        renderRecurringExpenses();
        
        if (shouldSwitchToDefault) {
            switchTab('home');
        }

        loadNotifications();
    } catch (error) {
        alert(error.message);
    }
}
