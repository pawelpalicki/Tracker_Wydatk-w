const { getFirestore } = require('firebase-admin/firestore');

/**
 * Walidacja nazwy grupy tagów (tylko litery, cyfry, podkreślenie, myślnik)
 */
function isValidGroupName(name) {
    return /^[a-z0-9_-]{1,32}$/.test(name);
}

/**
 * Normalizacja wartości tagu
 */
function normalizeTagValue(value) {
    return (value || '').toString().trim().toLowerCase();
}

/**
 * Normalizacja grupy tagów
 */
function normalizeTagGroup(input) {
    const arr = Array.isArray(input) ? input : [];
    const normalized = [];
    arr.forEach(item => {
        const value = normalizeTagValue(item && item.value);
        const label = (item && item.label ? item.label : value).toString().trim();
        if (!value) return;
        if (normalized.some(x => x.value === value)) return;
        normalized.push({
            value,
            label: label || value,
            icon: (item && item.icon ? item.icon : '').toString().trim()
        });
    });
    return normalized;
}

/**
 * Normalizacja definicji tagów
 */
function normalizeTagDefinitions(input, DEFAULT_TAG_DEFINITIONS = {}) {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};

    // Wczytaj wszystkie istniejące grupy z danych (preservuj kolejność)
    Object.keys(src).forEach(group => {
        if (!group || typeof group !== 'string') return;
        const normalized = normalizeTagGroup(src[group]);
        if (normalized.length > 0) {
            out[group] = normalized;
            if (!out[group].label && src[group + '_label']) {
                out[group + '_label'] = src[group + '_label'];
            }
        }
    });

    // Zachowaj etykiety grup (meta-klucze _label)
    Object.keys(src).forEach(key => {
        if (key.endsWith('_label') && typeof src[key] === 'string') {
            out[key] = src[key];
        }
    });

    // Upewnij się, że nature i purpose mają wartości domyślne jeśli brak
    ['nature', 'purpose'].forEach(group => {
        if (!out[group] || out[group].length === 0) {
            if (DEFAULT_TAG_DEFINITIONS[group]) {
                out[group] = DEFAULT_TAG_DEFINITIONS[group].map(t => ({ ...t }));
            }
        }
    });

    return out;
}

/**
 * Pobiera domyślną wartość tagu dla grupy
 */
function getDefaultTagValue(tagDefinitions, group, DEFAULT_TAG_DEFINITIONS = {}) {
    const arr = (tagDefinitions && tagDefinitions[group]) || [];
    if (arr.length > 0 && arr[0].value) return arr[0].value;
    return (DEFAULT_TAG_DEFINITIONS[group] && DEFAULT_TAG_DEFINITIONS[group][0] && DEFAULT_TAG_DEFINITIONS[group][0].value) || '';
}

/**
 * Pobiera etykietę grupy tagów
 */
function getTagGroupLabel(tagDefinitions, group, DEFAULT_GROUP_LABELS = {}) {
    const labelKey = group + '_label';
    if (tagDefinitions && tagDefinitions[labelKey]) return tagDefinitions[labelKey];
    if (DEFAULT_GROUP_LABELS[group]) return DEFAULT_GROUP_LABELS[group];
    // Capitalize first letter as fallback
    return group.charAt(0).toUpperCase() + group.slice(1);
}

/**
 * Pobieranie kursu waluty
 */
async function getExchangeRate(fromCurrency, toCurrency = 'PLN') {
    if (fromCurrency === toCurrency) return { rate: 1, success: true };

    try {
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrency}`);
        const data = await response.json();

        if (data.rates && data.rates[toCurrency]) {
            return { rate: data.rates[toCurrency], success: true };
        }

        console.warn(`Nie znaleziono kursu ${fromCurrency} -> ${toCurrency}, używam 1:1`);
        return { rate: 1, success: false };
    } catch (error) {
        console.error('Błąd pobierania kursu waluty:', error);
        return { rate: 1, success: false };
    }
}

/**
 * Konwersja cen na PLN
 */
async function convertCurrencyToPLN(items, currency) {
    if (currency === 'PLN') {
        return { items, exchangeRate: 1, originalCurrency: 'PLN', rateSuccess: true };
    }

    const { rate: exchangeRate, success: rateSuccess } = await getExchangeRate(currency, 'PLN');
    const convertedItems = items.map(item => ({
        ...item,
        price: Math.round(item.price * exchangeRate * 100) / 100
    }));

    return {
        items: convertedItems,
        exchangeRate,
        originalCurrency: currency,
        rateSuccess
    };
}

/**
 * Walidacja daty
 */
function validateDate(dateStr) {
    if (!dateStr) return null;
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        return date.toISOString().split('T')[0];
    } catch (e) {
        return null;
    }
}

/**
 * Ponawianie prób z exponential backoff
 */
async function retryWithBackoff(fn, retries = 2, delay = 1000) {
    try {
        return await fn();
    } catch (error) {
        if (retries > 0 && error.message && (error.message.includes('503') || error.message.includes('overloaded'))) {
            console.log(`Błąd usługi AI (503). Ponawiam próbę za ${delay / 1000}s... (${retries} prób pozostało)`);
            await new Promise(res => setTimeout(res, delay));
            return retryWithBackoff(fn, retries - 1, delay * 2);
        }
        throw error;
    }
}

/**
 * Normalizacja nazwy kategorii
 */
function normalizeCategoryName(name) {
    return (name || '').toString().trim().toLowerCase();
}

/**
 * Porównanie nazw Case-Insensitive
 */
function namesEqualCI(a, b) {
    return normalizeCategoryName(a) === normalizeCategoryName(b);
}

/**
 * Scalanie unikalnych nazw CI
 */
function mergeUniqueNamesCI(existing = [], namesToAdd = []) {
    const out = [...existing];
    namesToAdd.forEach((name) => {
        if (!name) return;
        const exists = out.some((n) => namesEqualCI(n, name));
        if (!exists) out.push(name);
    });
    return out;
}

/**
 * Usuwanie nazwy CI
 */
function removeNameCI(existing = [], nameToRemove = '') {
    return existing.filter((n) => !namesEqualCI(n, nameToRemove));
}

/**
 * Zmiana nazwy CI
 */
function renameNameCI(existing = [], oldName = '', newName = '') {
    const withoutOld = removeNameCI(existing, oldName);
    return mergeUniqueNamesCI(withoutOld, [newName]);
}

module.exports = {
    isValidGroupName,
    normalizeTagValue,
    normalizeTagGroup,
    normalizeTagDefinitions,
    getDefaultTagValue,
    getTagGroupLabel,
    getExchangeRate,
    convertCurrencyToPLN,
    validateDate,
    retryWithBackoff,
    normalizeCategoryName,
    namesEqualCI,
    mergeUniqueNamesCI,
    removeNameCI,
    renameNameCI
};
