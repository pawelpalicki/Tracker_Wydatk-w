// core/state.js — Centralny stan aplikacji
//
// Wszystkie zmienne globalne z app.js zebrane w jednym miejscu.
// Inne moduły importują ten obiekt i modyfikują go bezpośrednio.

const state = {
    // =====================================================================
    // DANE Z BACKENDU
    // =====================================================================
    allPurchases: [],
    allCategories: [],
    structuredCategories: [],  // Tablica obiektów {id, name, parentId, color, icon}
    allShops: [],
    allSpecialBudgets: [],
    allRecurringExpenses: [],
    tagDefinitions: {
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
    },

    // =====================================================================
    // STAN EDYCJI
    // =====================================================================
    editMode: { active: false, purchaseId: null },
    editingSpecialBudgetId: null,
    editingRecurringExpenseId: null,

    // =====================================================================
    // STAN FORMULARZA ZAKUPÓW
    // =====================================================================
    currentFile: null,
    cameraStream: null,

    // =====================================================================
    // PAGINACJA
    // =====================================================================
    nextPurchaseCursor: null,
    isLoadingPurchases: false,

    // =====================================================================
    // FILTRY LISTY ZAKUPÓW
    // =====================================================================
    filterCategoryValue: '',
    filterSubCategoryValue: '',
    filterShopValue: '',
    filterBudgetValue: '',

    // =====================================================================
    // WYDATKI CYKLICZNE
    // =====================================================================
    recurringCategoryValue: '',
    recurringSubCategoryValue: '',
    recurringTagValues: {},
    scheduleTypeValue: 'monthly',
    recurringDayOfWeekValue: '1',

    // =====================================================================
    // BUDŻETY SPECJALNE
    // =====================================================================
    budgetTypeSelectValue: 'monthly',

    // =====================================================================
    // FLAGI
    // =====================================================================
    appEventListenersInitialized: false,

    // =====================================================================
    // FLATPICKR
    // =====================================================================
    fp_range: null,
};

export default state;
