/**
 * Funkcja pomocnicza do określania, czy wydatek cykliczny powinien zostać dodany dzisiaj
 */
function shouldAddExpenseToday(expense, today) {
    const lastAddedDate = expense.lastAdded
        ? new Date(expense.lastAdded)
        : new Date(expense.createdAt.toDate());

    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const lastAddedUTC = new Date(Date.UTC(lastAddedDate.getFullYear(), lastAddedDate.getMonth(), lastAddedDate.getDate()));

    if (lastAddedUTC.getTime() === todayUTC.getTime()) {
        return false;
    }

    switch (expense.schedule.type) {
        case 'monthly': {
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const dueDay = Math.min(expense.schedule.dayOfMonth, daysInMonth);
            const dueDateUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), dueDay));

            return todayUTC >= dueDateUTC && lastAddedUTC < dueDateUTC;
        }

        case 'weekly': {
            const daysSinceLastAdded = Math.floor((todayUTC - lastAddedUTC) / (1000 * 60 * 60 * 24));
            return daysSinceLastAdded >= 7;
        }

        case 'daily_interval': {
            const startDate = new Date(expense.schedule.startDate);
            const startUTC = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));

            if (todayUTC < startUTC) return false;

            const daysSinceLast = Math.floor((todayUTC - lastAddedUTC) / (1000 * 60 * 60 * 24));
            return daysSinceLast >= expense.schedule.interval;
        }

        default:
            return false;
    }
}

module.exports = {
    shouldAddExpenseToday
};
