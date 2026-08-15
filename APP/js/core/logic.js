/**
 * core/logic.js — Współdzielona logika biznesowa aplikacji
 */
import state from './state.js';
import { apiCall } from './api.js';
import { isCategoryExcluded } from '../shared/categories.js';

/**
 * Pomocnicza funkcja obliczająca sumę rezerwacji z historii skarbonek.
 */
function calculateReservations(history, monthKey) {
    let total = 0;
    history.forEach(tx => {
        const txDate = new Date(tx.date?._seconds ? tx.date._seconds * 1000 : tx.date);
        const txMonthKey = txDate.toISOString().substring(0, 7);

        if (txMonthKey === monthKey) {
            const isSystemAllocation = tx.note && (tx.note.includes('Alokacja nadwyżki') || tx.note.includes('Pokrycie deficytu'));
            if (!isSystemAllocation) {
                if (tx.type === 'deposit') total += tx.amount || 0;
                if (tx.type === 'withdraw' || tx.type === 'realization') total -= tx.amount || 0;
            }
        }
    });
    return total;
}

/**
 * Oblicza ile razy dany wydatek cykliczny powinien wystąpić w podanym miesiącu.
 */
function countExpectedOccurrences(r, year, month) {
    if (!r.schedule) return 0;
    
    switch (r.schedule.type) {
        case 'monthly':
            return 1;
            
        case 'weekly': {
            let count = 0;
            const d = new Date(year, month, 1);
            while (d.getMonth() === month) {
                if (d.getDay() === r.schedule.dayOfWeek) count++;
                d.setDate(d.getDate() + 1);
            }
            return count;
        }
            
        case 'daily_interval': {
            let count = 0;
            const startDate = new Date(r.schedule.startDate);
            const monthStart = new Date(year, month, 1);
            const monthEnd = new Date(year, month + 1, 0);
            
            // Znajdź pierwsze wystąpienie od daty startu
            let current = new Date(startDate);
            
            // Jeśli start jest po końcu miesiąca - 0 wystąpień
            if (current > monthEnd) return 0;

            // Przesuń się do przodu aż do osiągnięcia badanego miesiąca
            while (current < monthStart) {
                current.setDate(current.getDate() + r.schedule.interval);
            }

            // Licz wystąpienia wewnątrz miesiąca
            while (current <= monthEnd) {
                if (current >= monthStart) count++;
                current.setDate(current.getDate() + r.schedule.interval);
            }
            return count;
        }
        default:
            return 0;
    }
}

/**
 * Oblicza prognozę wydatków dla bieżącego miesiąca (z uwzględnieniem cache'u).
 * Używane przez Kokpit oraz Skarbonkę.
 * 
 * @param {Object} [providedData] - Opcjonalne dane (purchases, totalBudget), jeśli już je mamy.
 * @returns {Promise<Object>} Dane prognozy.
 */
export async function getMonthlyProjection(providedData = null) {
    const now = new Date();
    const currentMonthKey = now.toISOString().substring(0, 7);
    const cache = state.monthlyProjectionCache;
    
    // Zwróć cache, jeśli jest świeży (5 min) i nie podano nowych danych
    const isCacheFresh = cache && cache.month === currentMonthKey && (Date.now() - cache.timestamp < 5 * 60 * 1000);
    if (!providedData && isCacheFresh) {
        return cache;
    }

    try {
        let purchases, totalBudget, reservationsTotal = 0;

        if (providedData) {
            purchases = providedData.purchases;
            totalBudget = providedData.totalBudget;
            // Jeśli mamy dane wejściowe, ale cache jest pusty/stary, musimy dociągnąć historię skarbonek
            if (!isCacheFresh) {
                const savingsHistory = await apiCall(`/api/savings-goals/all-history`);
                reservationsTotal = calculateReservations(savingsHistory, currentMonthKey);
            } else {
                reservationsTotal = cache.reservationsTotal || 0;
            }
        } else {
            const [budgetData, purchaseData, savingsHistory] = await Promise.all([
                apiCall(`/api/budgets/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`),
                apiCall(`/api/purchases?startDate=${currentMonthKey}-01&limit=1000`),
                apiCall(`/api/savings-goals/all-history`)
            ]);
            const budgets = budgetData.budgets || {};
            totalBudget = Object.entries(budgets).reduce((sum, [catName, val]) => {
                if (isCategoryExcluded(catName)) return sum;
                return sum + (val || 0);
            }, 0);
            purchases = (purchaseData.purchases || []).filter(p => !p.specialBudgetId);
            reservationsTotal = calculateReservations(savingsHistory, currentMonthKey);
        }

        const day = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const rem = daysInMonth - day;

        let fixed = 0, flexible = 0, oneTime = 0, wants = 0;
        purchases.forEach(p => (p.items || []).forEach(i => {
            // Pomijamy pozycje z wykluczonych kategorii (np. Inwestycje i oszczędności)
            if (isCategoryExcluded(i.category || 'inne', i.subCategory || '')) return;

            const nature = (i.tags?.nature || '').toLowerCase().trim();
            const cat = (i.category || 'inne').toLowerCase().trim();
            const purpose = (i.tags?.purpose || '').toLowerCase().trim();

            const isFixed = p.isRecurring === true || 
                            ['staly', 'stały', 'stałe', 'stale'].includes(nature) || 
                            ['media(prad/gaz/woda)', 'media(prąd/gaz/woda)', 'czynsz', 'finanse', 'rachunki', 'oplaty', 'opłaty'].includes(cat);
            const isOneTime = nature === 'jednorazowy';

            if (isFixed) fixed += i.price || 0;
            else if (isOneTime) oneTime += i.price || 0;
            else flexible += i.price || 0;

            if (purpose === 'przyjemność' || purpose === 'przyjemnosc') {
                wants += i.price || 0;
            }
        }));

        let upcoming = 0;
        if (Array.isArray(state.allRecurringExpenses)) {
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();

            state.allRecurringExpenses.forEach(r => {
                // POMIŃ: Jeśli wydatek cykliczny jest w kategorii wykluczonej z analizy
                if (isCategoryExcluded(r.category || 'inne', r.subCategory || '')) return;

                // 1. Oblicz ile razy wydatek powinien wystąpić w tym miesiącu
                const expected = countExpectedOccurrences(r, currentYear, currentMonth);
                
                // 2. Policz ile razy już został zarejestrowany
                const actualCount = purchases.filter(p => 
                    (p.items || []).some(item => item.name.toLowerCase().includes(r.name.toLowerCase()))
                ).length;

                // 3. Dodaj brakujące kwoty do prognozy
                const missing = Math.max(0, expected - actualCount);
                upcoming += missing * (r.amount || 0);
            });
        }

        // Rezerwacje odejmujemy od dostępnej kwoty, tak jakby były wydatkiem (ale bez statystyk kategorii)
        const projectedTotal = fixed + upcoming + oneTime + flexible + (day > 0 ? (flexible / day) * rem : 0);
        const diff = totalBudget - projectedTotal - reservationsTotal;
        const dailyLimit = Math.max(0, totalBudget - fixed - upcoming - oneTime - flexible - reservationsTotal) / (rem + 1);

        const result = {
            month: currentMonthKey,
            projectedTotal,
            reservationsTotal,
            diff,
            dailyLimit,
            wants,
            fixed,
            flexible,
            upcoming,
            oneTime,
            totalBudget,
            timestamp: Date.now()
        };

        // Aktualizuj cache w state
        state.monthlyProjectionCache = result;

        return result;
    } catch (e) {
        console.error('Błąd obliczania prognozy:', e);
        return cache || { projectedTotal: 0, diff: 0, month: currentMonthKey, timestamp: 0 };
    }
}
