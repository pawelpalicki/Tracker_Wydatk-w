/**
 * core/logic.js — Współdzielona logika biznesowa aplikacji
 */
import state from './state.js';
import { apiCall } from './api.js';

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
        let purchases, totalBudget;

        if (providedData) {
            purchases = providedData.purchases;
            totalBudget = providedData.totalBudget;
        } else {
            const [budgetData, purchaseData] = await Promise.all([
                apiCall(`/api/budgets/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`),
                apiCall(`/api/purchases?startDate=${currentMonthKey}-01&limit=1000`)
            ]);
            const budgets = budgetData.budgets || {};
            totalBudget = Object.values(budgets).reduce((a, b) => a + b, 0);
            purchases = (purchaseData.purchases || []).filter(p => !p.specialBudgetId);
        }

        const day = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const rem = daysInMonth - day;

        let fixed = 0, flexible = 0, oneTime = 0, wants = 0;
        purchases.forEach(p => (p.items || []).forEach(i => {
            const nature = (i.tags?.nature || '').toLowerCase().trim();
            const cat = (i.category || 'inne').toLowerCase().trim();
            const purpose = (i.tags?.purpose || '').toLowerCase().trim();

            const isFixed = p.isRecurring === true || 
                            ['staly', 'stały', 'stałe', 'stale'].includes(nature) || 
                            ['media(prad/gaz/woda)', 'media(prąd/gaz/woda)', 'czynsz', 'finanse', 'rachunki', 'oplaty', 'opłaty'].includes(cat);
            const isOneTime = nature === 'jednorazowy';

            if (isFixed) fixed += i.price || 0;
            else if (isOneTime) oneTime += i.price || 0;
            else {
                flexible += i.price || 0;
                if (purpose === 'przyjemność' || purpose === 'przyjemnosc') wants += i.price || 0;
            }
        }));

        let upcoming = 0;
        if (Array.isArray(state.allRecurringExpenses)) {
            state.allRecurringExpenses.forEach(r => {
                const alreadyPaid = purchases.some(p => 
                    (p.items || []).some(item => item.name.toLowerCase().includes(r.name.toLowerCase()))
                );
                if (!alreadyPaid) upcoming += r.amount || 0;
            });
        }

        const projectedTotal = fixed + upcoming + oneTime + flexible + (day > 0 ? (flexible / day) * rem : 0);
        const diff = totalBudget - projectedTotal;
        const dailyLimit = Math.max(0, totalBudget - fixed - upcoming - oneTime - flexible) / (rem + 1);

        const result = {
            month: currentMonthKey,
            projectedTotal,
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
