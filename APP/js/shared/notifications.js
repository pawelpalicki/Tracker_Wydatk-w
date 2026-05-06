/**
 * Moduł powiadomień - Warstwa współdzielona.
 * Wydzielony z dashboard.js dla zachowania czystości i reużywalności.
 * 
 * Odpowiada za:
 * - Pobieranie i renderowanie listy powiadomień
 * - Obsługę szuflady powiadomień (drawera)
 * - Generowanie alertów budżetowych i cyklicznych
 * - Integrację z AI Insights (Gemini)
 */
import state from '../core/state.js';
import { apiCall } from '../core/api.js';
import { formatAmount } from './format.js';
import Drawer from './drawer.js';

let notificationsInitialized = false;
let currentNotifications = [];

export function initNotifications() {
    if (notificationsInitialized) return;
    notificationsInitialized = true;

    document.getElementById('nav-notifications-btn')?.addEventListener('click', openNotificationsDrawer);
    document.getElementById('ai-insight-btn')?.addEventListener('click', generateAIInsights);
}

export async function loadNotifications() {
    try {
        currentNotifications = await apiCall('/api/notifications');
        updateNotificationBadge();
        renderNotifications();
    } catch (err) {
        console.error('Błąd loadNotifications:', err);
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    const unreadCount = currentNotifications.filter(n => !n.isRead).length;
    badge.classList.toggle('hidden', unreadCount === 0);
}

export function openNotificationsDrawer() {
    let contentHtml = '';
    
    if (!Array.isArray(currentNotifications) || currentNotifications.length === 0) {
        contentHtml = `
            <div id="notifications-content">
                <div class="text-center py-10 opacity-50">
                    <i class="fas fa-bell-slash text-3xl mb-3 block"></i>
                    <p class="text-sm">Brak nowych powiadomień</p>
                </div>
            </div>
        `;
    } else {
        contentHtml = `
            <div id="notifications-content" class="space-y-3">
                ${currentNotifications.map(notificationTemplate).join('')}
            </div>
        `;
    }

    Drawer.open({
        title: 'Powiadomienia',
        content: `
            <p class="text-xs text-gray-400 mt-0.5 mb-4 -translate-y-2">Twoje alerty i wskazówki</p>
            ${contentHtml}
        `,
        size: 'md',
        showCloseBtn: true,
        closeOnBackdrop: true
    });

    if (Array.isArray(currentNotifications) && currentNotifications.length > 0) {
        setTimeout(() => {
            const container = document.getElementById('notifications-content');
            if (container) {
                container.querySelectorAll('[data-delete-notification-id]').forEach(btn => {
                    btn.addEventListener('click', () => deleteNotification(btn.dataset.deleteNotificationId));
                });
                setupNotificationSwipes();
            }
        }, 50);
    }

    const unreadIds = currentNotifications.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length > 0) {
        markNotificationsAsRead(unreadIds);
    }
}

export function closeNotificationsDrawer() {
    Drawer.close();
}

async function markNotificationsAsRead(ids) {
    try {
        await apiCall('/api/notifications/read', 'POST', { notificationIds: ids });
        currentNotifications.forEach(n => {
            if (ids.includes(n.id)) {
                n.isRead = true;
                n.readAt = Date.now();
            }
        });
        updateNotificationBadge();
    } catch (err) {
        console.error('Błąd markNotificationsAsRead:', err);
    }
}

export function renderNotifications() {
    const container = document.getElementById('notifications-content');
    if (!container) return;

    if (!Array.isArray(currentNotifications) || currentNotifications.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 opacity-50">
                <i class="fas fa-bell-slash text-3xl mb-3 block"></i>
                <p class="text-sm">Brak nowych powiadomień</p>
            </div>
        `;
        return;
    }

    container.innerHTML = currentNotifications.map(notificationTemplate).join('');
    container.querySelectorAll('[data-delete-notification-id]').forEach(btn => {
        btn.addEventListener('click', () => deleteNotification(btn.dataset.deleteNotificationId));
    });
    setupNotificationSwipes();
}

function notificationTemplate(n) {
    const dateStr = n.date || new Date().toISOString();
    const date = new Date(dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    let icon = 'fa-info-circle';
    let color = 'text-blue-400';
    let bgColor = 'bg-blue-500/10';

    if (n.type === 'budget_80' || n.type?.startsWith('budget_cat_80')) {
        icon = 'fa-triangle-exclamation'; color = 'text-yellow-400'; bgColor = 'bg-yellow-500/10';
    } else if (n.type === 'budget_100' || n.type?.startsWith('budget_cat_100')) {
        icon = 'fa-circle-exclamation'; color = 'text-red-400'; bgColor = 'bg-red-500/10';
    } else if (n.type?.startsWith('recurring')) {
        icon = 'fa-calendar-check'; color = 'text-brand-400'; bgColor = 'bg-brand-500/10';
    } else if (n.type === 'ai_insight') {
        icon = 'fa-wand-magic-sparkles'; color = 'text-purple-400'; bgColor = 'bg-purple-500/10';
    }

    return `
        <div class="notif-swipe-wrapper" data-id="${n.id}">
            <button type="button" class="notif-action-layer" data-delete-notification-id="${n.id}">
                <i class="fas fa-trash-can mb-1"></i>
                <span>Usuń</span>
            </button>
            <div class="notif-content-layer flex gap-3 p-3 rounded-xl border border-white/5 ${n.isRead ? 'notif-bg-solid-read' : 'notif-bg-solid border-l-2 border-l-brand-500'}">
                <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg ${bgColor} ${color}">
                    <i class="fas ${icon} text-lg"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-white mb-0.5 leading-snug">${n.message}</p>
                    <p class="text-[10px] text-gray-500">${date}</p>
                </div>
            </div>
        </div>
    `;
}

function setupNotificationSwipes() {
    document.querySelectorAll('.notif-swipe-wrapper').forEach(wrapper => {
        const content = wrapper.querySelector('.notif-content-layer');
        let startX = 0;
        let diffX = 0;
        const maxSwipe = -80;

        wrapper.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            content?.classList.add('swiping');
        }, { passive: true });

        wrapper.addEventListener('touchmove', e => {
            if (!content) return;
            const currentX = e.touches[0].clientX;
            diffX = currentX - startX;
            content.style.transform = diffX < 0 ? `translateX(${Math.max(diffX, maxSwipe - 20)}px)` : 'translateX(0px)';
        }, { passive: true });

        wrapper.addEventListener('touchend', () => {
            if (!content) return;
            content.classList.remove('swiping');
            const id = wrapper.getAttribute('data-id');
            if (diffX < -100) {
                content.style.transform = 'translateX(-100%)';
                content.style.opacity = '0';
                setTimeout(() => deleteNotification(id), 200);
            } else {
                content.style.transform = 'translateX(0px)';
            }
            diffX = 0;
        });
    });
}

export async function deleteNotification(id) {
    if (!confirm('Czy na pewno chcesz usunąć to powiadomienie?')) {
        const wrapper = document.querySelector(`.notif-swipe-wrapper[data-id="${id}"]`);
        const content = wrapper?.querySelector('.notif-content-layer');
        if (content) {
            content.style.transform = 'translateX(0px)';
            content.style.opacity = '1';
        }
        return;
    }

    try {
        await apiCall(`/api/notifications/${id}`, 'DELETE');
        currentNotifications = currentNotifications.filter(n => n.id !== id);
        updateNotificationBadge();
        renderNotifications();
    } catch (err) {
        console.error('Błąd deleteNotification:', err);
        alert('Nie udało się usunąć powiadomienia.');
    }
}

export async function checkAndGenerateNotifications(data) {
    const monthKey = new Date().toISOString().substring(0, 7);
    const notificationsToPush = [];

    if (data.totalBudget > 0) {
        const pct = (data.totalSpent / data.totalBudget) * 100;
        if (pct >= 100) {
            notificationsToPush.push({ type: 'budget_100', message: `Przekroczono budżet całkowity (${formatAmount(data.totalSpent)}).`, monthKey });
        } else if (pct >= 80) {
            notificationsToPush.push({ type: 'budget_80', message: 'Wykorzystano już 80% budżetu całkowitego.', monthKey });
        }
    }

    if (data.budgets) {
        Object.entries(data.budgets).forEach(([catName, budget]) => {
            if (budget > 0) {
                const spent = data.categoryTotals[catName] || 0;
                const pct = (spent / budget) * 100;
                if (pct >= 100) {
                    notificationsToPush.push({ type: `budget_cat_100_${catName}`, message: `Przekroczono budżet w kategorii ${catName}!`, monthKey });
                } else if (pct >= 80) {
                    notificationsToPush.push({ type: `budget_cat_80_${catName}`, message: `Uwaga: 80% budżetu w kategorii ${catName} już wydane.`, monthKey });
                }
            }
        });
    }

    const now = new Date();
    if (Array.isArray(state.allRecurringExpenses)) {
        state.allRecurringExpenses.forEach(r => {
            const alreadyPaid = state.allPurchases.some(p =>
                p.date.substring(0, 7) === monthKey &&
                p.shop.toLowerCase().includes(r.name.toLowerCase())
            );

            if (!alreadyPaid) {
                const today = now.getDate();
                const dueDay = r.dayOfMonth || 1;
                if (dueDay - today <= 3 && dueDay - today >= -1) {
                    notificationsToPush.push({
                        type: `recurring_${r.name}`,
                        message: `Nadchodzi termin płatności: ${r.name} (${formatAmount(r.amount)})`,
                        monthKey
                    });
                }
            }
        });
    }

    for (const notification of notificationsToPush) {
        await pushNotificationToServer(notification);
    }
}

async function pushNotificationToServer(notification) {
    try {
        await apiCall('/api/notifications', 'POST', notification);
    } catch (e) {
        console.error('Błąd pushNotificationToServer:', e);
    }
}

export async function generateAIInsights() {
    const btn = document.getElementById('ai-insight-btn');
    if (!btn) return;
    const originalContent = btn.innerHTML;

    try {
        const todayKey = new Date().toISOString().substring(0, 10);
        const hasTodayInsight = Array.isArray(currentNotifications) &&
            currentNotifications.some(n => n.type === 'ai_insight' && n.monthKey === todayKey);

        if (hasTodayInsight) {
            alert('Dzisiejsza analiza AI została już wygenerowana. Zapraszamy jutro!');
            return;
        }

        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const stats = calculateCurrentMonthStats();
        const data = await apiCall('/api/analysis/insights', 'POST', stats);

        if (data.insights && Array.isArray(data.insights)) {
            for (const insight of data.insights) {
                await pushNotificationToServer({
                    type: 'ai_insight',
                    message: insight.text,
                    monthKey: todayKey
                });
            }
            await loadNotifications();
            openNotificationsDrawer();
        }
    } catch (err) {
        console.error('Błąd generateAIInsights:', err);
        alert('Nie udało się wygenerować wniosków AI: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = originalContent;
    }
}

/**
 * Wylicza statystyki bieżącego miesiąca na potrzeby AI Insights.
 */
export function calculateCurrentMonthStats() {
    const now = new Date();
    const curMonth = now.toISOString().substring(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = prevDate.toISOString().substring(0, 7);

    const stats = {
        currentMonthData: { total: 0, topCategories: [] },
        previousMonthData: { total: 0 },
        categories: state.structuredCategories.map(c => c.name)
    };

    const curTotals = {};
    state.allPurchases.forEach(p => {
        const month = p.date.substring(0, 7);
        if (month === curMonth) {
            stats.currentMonthData.total += p.totalAmount || 0;
            (p.items || []).forEach(i => {
                const cat = i.category || 'inne';
                curTotals[cat] = (curTotals[cat] || 0) + (i.price || 0);
            });
        } else if (month === prevMonth) {
            stats.previousMonthData.total += p.totalAmount || 0;
        }
    });

    stats.currentMonthData.topCategories = Object.entries(curTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, value]) => ({ name, value }));

    return stats;
}
