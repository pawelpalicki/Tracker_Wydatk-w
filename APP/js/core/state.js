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
    // STAN GLOBALNY UI
    // =====================================================================
    editMode: { active: false, purchaseId: null },
    
    // =====================================================================
    // PAGINACJA I ŁADOWANIE
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
    filterDateStart: '',
    filterDateEnd: '',
    filterMinAmount: '',
    filterMaxAmount: '',

    // =====================================================================
    // CACHE DANYCH
    // =====================================================================
    availableMonthsList: [], // Wykorzystywane w analizie długoterminowej

    // =====================================================================
    // FLAGI SYSTEMOWE
    // =====================================================================
    appEventListenersInitialized: false,
};

export default state;
