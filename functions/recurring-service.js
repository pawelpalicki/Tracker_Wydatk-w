/**
 * Funkcja pomocnicza do określania, czy wydatek cykliczny powinien zostać dodany dzisiaj
 */
function shouldAddExpenseToday(expense, today) {
    const lastAddedDate = expense.lastAdded
        ? new Date(expense.lastAdded)
        : (expense.createdAt ? new Date(expense.createdAt.toDate()) : new Date(0));

    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const lastAddedUTC = new Date(Date.UTC(lastAddedDate.getFullYear(), lastAddedDate.getMonth(), lastAddedDate.getDate()));

    if (lastAddedUTC.getTime() === todayUTC.getTime()) {
        console.log(`[Recurring] Wydatek "${expense.name}" (ID: ${expense.id}) już dodany dzisiaj (${expense.lastAdded}).`);
        return false;
    }

    switch (expense.schedule.type) {
        case 'monthly': {
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const dueDay = Math.min(expense.schedule.dayOfMonth, daysInMonth);
            const dueDateUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), dueDay));

            const isDue = todayUTC >= dueDateUTC && lastAddedUTC < dueDateUTC;
            if (!isDue) {
                console.log(`[Recurring] Wydatek "${expense.name}" (ID: ${expense.id}) - Miesięczny. Dziś: ${todayUTC.toISOString().split('T')[0]}, Plan: ${dueDateUTC.toISOString().split('T')[0]}, Ostatnio: ${lastAddedUTC.toISOString().split('T')[0]}. Wynik: POMINIĘTO.`);
            }
            return isDue;
        }

        case 'weekly': {
            const daysSinceLastAdded = Math.floor((todayUTC - lastAddedUTC) / (1000 * 60 * 60 * 24));
            const isDue = daysSinceLastAdded >= 7;
            if (!isDue) {
                console.log(`[Recurring] Wydatek "${expense.name}" (ID: ${expense.id}) - Tygodniowy. Dni od ostatniego: ${daysSinceLastAdded}. Wynik: POMINIĘTO.`);
            }
            return isDue;
        }

        case 'daily_interval': {
            const startDate = new Date(expense.schedule.startDate);
            const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));

            if (todayUTC < startUTC) {
                console.log(`[Recurring] Wydatek "${expense.name}" (ID: ${expense.id}) - Start w przyszłości: ${startUTC.toISOString().split('T')[0]}. Wynik: POMINIĘTO.`);
                return false;
            }

            const daysSinceLast = Math.floor((todayUTC - lastAddedUTC) / (1000 * 60 * 60 * 24));
            const isDue = daysSinceLast >= expense.schedule.interval;
            if (!isDue) {
                console.log(`[Recurring] Wydatek "${expense.name}" (ID: ${expense.id}) - Interwał: ${expense.schedule.interval}, Dni od ostatniego: ${daysSinceLast}. Wynik: POMINIĘTO.`);
            }
            return isDue;
        }

        default:
            console.warn(`[Recurring] Wydatek "${expense.name}" (ID: ${expense.id}) ma nieznany typ harmonogramu: ${expense.schedule.type}`);
            return false;
    }
}

module.exports = {
    shouldAddExpenseToday
};
