// Formatowanie kwot i dat
/**
 * Moduł odpowiedzialny za formatowanie danych wyświetlanych w UI.
 * Wydzielony z ui.js w Etapie 2 refaktoryzacji.
 */

// Standardowy format waluty: "1 234,56 zł"
export function formatAmount(amount) {
    if (amount === undefined || amount === null) amount = 0;
    // Formatujemy liczbę ręcznie
    const parts = amount.toFixed(2).split('.');
    // Wstawiamy zwykłą spację co 3 cyfry dla 100% widoczności
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join(',') + ' zł';
}
