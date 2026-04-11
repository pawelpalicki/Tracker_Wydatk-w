const DEFAULT_STRUCTURED_CATEGORIES = [
    { id: 'def_1', name: 'Spożywcze', icon: 'fa-shopping-basket', color: '#10b981', children: ['Jedzenie', 'Napoje', 'Przekąski'] },
    { id: 'def_2', name: 'Mieszkanie', icon: 'fa-home', color: '#3b82f6', children: ['Czynsz', 'Media', 'Chemia'] },
    { id: 'def_3', name: 'Transport', icon: 'fa-car', color: '#f59e0b', children: ['Paliwo', 'Bilety', 'Taxi'] },
    { id: 'def_4', name: 'Rozrywka', icon: 'fa-film', color: '#8b5cf6', children: ['Gastronomia', 'Kino/Kultura', 'Hobby'] },
    { id: 'def_5', name: 'Zdrowie', icon: 'fa-heartbeat', color: '#ef4444', children: ['Lekarstwa', 'Lekarz', 'Higiena'] },
    { id: 'def_6', name: 'Inne', icon: 'fa-ellipsis-h', color: '#64748b', children: ['Pozostałe', 'Prezenty', 'Elektronika'] }
];

const DEFAULT_TAG_DEFINITIONS = {
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
};

const DEFAULT_GROUP_LABELS = {
    nature: 'Natura',
    purpose: 'Celowość'
};

const CATEGORY_ICONS = {
    'spożywcze': 'fa-shopping-basket', 'jedzenie/napoje': 'fa-apple-alt', 'słodycze/przekąski': 'fa-cookie-bite',
    'dania gotowe/z dostawy': 'fa-moped', 'mieszkanie': 'fa-home', 'dom': 'fa-home', 'czynsz': 'fa-building',
    'media(prąd/gaz/woda)': 'fa-bolt', 'wyposażenie': 'fa-couch', 'chemia': 'fa-jug-detergent',
    'remonty/naprawy': 'fa-tools', 'artykuły gospodarcze': 'fa-recycle', 'zdrowie & uroda': 'fa-heartbeat',
    'zdrowie': 'fa-heartbeat', 'lekarz': 'fa-stethoscope', 'apteka': 'fa-pills', 'usługi kosmetyczne': 'fa-cut',
    'kosmetyki': 'fa-spa', 'higieniczne': 'fa-toilet-paper', 'suplementy': 'fa-capsules', 'transport': 'fa-car',
    'samochód': 'fa-gas-pump', 'taxi': 'fa-taxi', 'komunikacja miejska': 'fa-bus', 'podróże': 'fa-suitcase-rolling',
    'rozrywka': 'fa-film', 'gastronomia': 'fa-hamburger', 'kultura': 'fa-theater-masks',
    'subskrypcje (vod)': 'fa-play-circle', 'hobby': 'fa-gamepad', 'sport': 'fa-football-ball',
    'rachunki': 'fa-file-invoice-dollar', 'finanse': 'fa-file-invoice-dollar', 'spłata kredytów': 'fa-hand-holding-usd',
    'oszczędności / inwestycje': 'fa-piggy-bank', 'odzież': 'fa-tshirt', 'ubrania': 'fa-tshirt',
    'ubrania i biżuteria': 'fa-tshirt', 'buty': 'fa-shoe-prints', 'dodatki': 'fa-gem',
    'edukacja': 'fa-graduation-cap', 'kursy/szkolenia': 'fa-chalkboard-teacher', 'książki': 'fa-book-open',
    'alkohol/papierosy': 'fa-smoking', 'kaucje': 'fa-archive', 'internet/tv': 'fa-tv', 'telefon': 'fa-mobile-alt',
    'elektronika': 'fa-microchip', 'prezenty': 'fa-gift', 'zwierzęta': 'fa-dog', 'inne': 'fa-tag'
};

const COLOR_PALETTE = ['#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#64748b', '#06b6d4', '#a855f7', '#eab308', '#0ea5e9', '#be185d', '#16a34a', '#f43f5e', '#84cc16', '#6366f1', '#d946ef', '#fb7185'];

module.exports = {
    DEFAULT_STRUCTURED_CATEGORIES,
    DEFAULT_TAG_DEFINITIONS,
    DEFAULT_GROUP_LABELS,
    CATEGORY_ICONS,
    COLOR_PALETTE
};
