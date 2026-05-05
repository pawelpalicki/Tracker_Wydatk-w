// Formatowanie kwot i dat
/**
 * Moduł odpowiedzialny za formatowanie danych wyświetlanych w UI.
 * Wydzielony z ui.js w Etapie 2 refaktoryzacji.
 */

// Standardowy format waluty: "1 234,56 zł"
export function formatAmount(amount) {
    if (amount === undefined || amount === null) amount = 0;
    const formatted = formatNumber(amount.toFixed(2));
    return formatted.replace('.', ',') + ' zł';
}

// Formatowanie samej liczby (tysiące)
export function formatNumber(num) {
    if (num === undefined || num === null) return '';
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join('.');
}
