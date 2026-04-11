// Notifications Module for Tracker Wydatków

let currentNotifications = [];

/**
 * Inicjalizacja modułu powiadomień
 */
function initNotifications() {
    const btn = document.getElementById('nav-notifications-btn');
    const closeBtn = document.getElementById('close-notifications-drawer');
    const overlay = document.getElementById('notifications-overlay');

    if (btn) btn.onclick = openNotificationsDrawer;
    if (closeBtn) closeBtn.onclick = closeNotificationsDrawer;
    if (overlay) overlay.onclick = closeNotificationsDrawer;

    // Przycisk AI na Kokpicie
    const aiBtn = document.getElementById('ai-insight-btn');
    if (aiBtn) aiBtn.onclick = generateAIInsights;
}

/**
 * Pobiera powiadomienia z serwera i odświeża badge
 */
async function loadNotifications() {
    try {
        currentNotifications = await apiCall('/api/notifications');
        updateNotificationBadge();
        renderNotifications();
    } catch (err) {
        console.error('Błąd loadNotifications:', err);
    }
}

/**
 * Aktualizuje czerwoną kropkę na dzwonku
 */
function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;
    
    const unreadCount = currentNotifications.filter(n => !n.isRead).length;
    badge.classList.toggle('hidden', unreadCount === 0);
}

/**
 * Otwiera szufladę i oznacza widoczne powiadomienia jako przeczytane
 */
function openNotificationsDrawer() {
    const drawer = document.getElementById('notifications-drawer');
    const overlay = document.getElementById('notifications-overlay');
    
    if (!drawer || !overlay) return;

    drawer.classList.remove('hidden');
    overlay.classList.remove('hidden');
    
    setTimeout(() => {
        drawer.classList.remove('translate-y-full');
        overlay.classList.remove('opacity-0');
    }, 10);
    
    // Oznacz jako przeczytane po otwarciu
    const unreadIds = currentNotifications.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length > 0) {
        markNotificationsAsRead(unreadIds);
    }
}

function closeNotificationsDrawer() {
    const drawer = document.getElementById('notifications-drawer');
    const overlay = document.getElementById('notifications-overlay');
    
    if (!drawer || !overlay) return;

    drawer.classList.add('translate-y-full');
    overlay.classList.add('opacity-0');
    
    setTimeout(() => {
        drawer.classList.add('hidden');
        overlay.classList.add('hidden');
    }, 300);
}

/**
 * Wysyła listę ID do oznaczenia jako przeczytane
 */
async function markNotificationsAsRead(ids) {
    try {
        await apiCall('/api/notifications/read', 'POST', { notificationIds: ids });
        
        // Lokalnie zaktualizuj stan
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

/**
 * Renderuje listę powiadomień w szufladzie
 */
function renderNotifications() {
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
    
    container.innerHTML = currentNotifications.map(n => {
        const dateStr = n.date || new Date().toISOString();
        const date = new Date(dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        let icon = 'fa-info-circle';
        let color = 'text-blue-400';
        let bgColor = 'bg-blue-500/10';

        if (n.type === 'budget_80' || n.type?.startsWith('budget_cat_80')) { 
            icon = 'fa-triangle-exclamation'; color = 'text-yellow-400'; bgColor = 'bg-yellow-500/10'; 
        }
        else if (n.type === 'budget_100' || n.type?.startsWith('budget_cat_100')) { 
            icon = 'fa-circle-exclamation'; color = 'text-red-400'; bgColor = 'bg-red-500/10'; 
        }
        else if (n.type?.startsWith('recurring')) { 
            icon = 'fa-calendar-check'; color = 'text-brand-400'; bgColor = 'bg-brand-500/10'; 
        }
        else if (n.type === 'ai_insight') {
            icon = 'fa-wand-magic-sparkles'; color = 'text-purple-400'; bgColor = 'bg-purple-500/10';
        }

        return `
            <div class="notif-swipe-wrapper" data-id="${n.id}">
                <div class="notif-action-layer" onclick="deleteNotification('${n.id}')">
                    <i class="fas fa-trash-can mb-1"></i>
                    <span>Usuń</span>
                </div>
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
    }).join('');

    setupNotificationSwipes();
}

/**
 * Obsługa gestów swipe
 */
function setupNotificationSwipes() {
    const wrappers = document.querySelectorAll('.notif-swipe-wrapper');
    wrappers.forEach(wrapper => {
        const content = wrapper.querySelector('.notif-content-layer');
        let startX = 0;
        let diffX = 0;
        const maxSwipe = -80; 

        wrapper.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            content.classList.add('swiping');
        }, { passive: true });

        wrapper.addEventListener('touchmove', e => {
            const currentX = e.touches[0].clientX;
            diffX = currentX - startX;
            
            // Tylko w lewo i z ograniczeniem
            if (diffX < 0) {
                const move = Math.max(diffX, maxSwipe - 20);
                content.style.transform = `translateX(${move}px)`;
            } else {
                content.style.transform = `translateX(0px)`;
            }
        }, { passive: true });

        wrapper.addEventListener('touchend', () => {
            content.classList.remove('swiping');
            const id = wrapper.getAttribute('data-id');
            
            // Jeśli przesunięto znacząco (np. więcej niż 100px) - usuwamy
            if (diffX < -100) {
                content.style.transform = 'translateX(-100%)';
                content.style.opacity = '0';
                setTimeout(() => deleteNotification(id), 200);
            } else {
                // Za mały swipe - wracamy do zera
                content.style.transform = 'translateX(0px)';
            }
            diffX = 0;
        });
    });
}

/**
 * Usuwanie powiadomienia
 */
async function deleteNotification(id) {
    if (!confirm('Czy na pewno chcesz usunąć to powiadomienie?')) {
        // Zresetuj pozycję swipe po rezygnacji
        const wrapper = document.querySelector(`.notif-swipe-wrapper[data-id="${id}"]`);
        if (wrapper) {
            const content = wrapper.querySelector('.notif-content-layer');
            if (content) {
                content.style.transform = 'translateX(0px)';
                content.style.opacity = '1';
            }
        }
        return;
    }

    try {
        await apiCall(`/api/notifications/${id}`, 'DELETE');
        
        // Usuń lokalnie i odśwież widok
        currentNotifications = currentNotifications.filter(n => n.id !== id);
        updateNotificationBadge();
        renderNotifications();
    } catch (err) {
        console.error('Błąd deleteNotification:', err);
        alert('Nie udało się usunąć powiadomienia.');
    }
}

/**
 * System sprawdzania progów i generowania powiadomień
 */
async function checkAndGenerateNotifications(data) {
    const monthKey = new Date().toISOString().substring(0, 7);
    const notificationsToPush = [];

    // 1. Sprawdzanie budżetu całkowitego
    if (data.totalBudget > 0) {
        const pct = (data.totalSpent / data.totalBudget) * 100;
        if (pct >= 100) {
            notificationsToPush.push({ type: 'budget_100', message: `Przekroczono budżet całkowity (${formatAmount(data.totalSpent)}).`, monthKey });
        } else if (pct >= 80) {
            notificationsToPush.push({ type: 'budget_80', message: `Wykorzystano już 80% budżetu całkowitego.`, monthKey });
        }
    }

    // 2. Sprawdzanie budżetów kategorii
    if (data.budgets) {
        for (const [catName, budget] of Object.entries(data.budgets)) {
            if (budget > 0) {
                const spent = data.categoryTotals[catName] || 0;
                const pct = (spent / budget) * 100;
                if (pct >= 100) {
                    notificationsToPush.push({ type: `budget_cat_100_${catName}`, message: `Przekroczono budżet w kategorii ${catName}!`, monthKey });
                } else if (pct >= 80) {
                    notificationsToPush.push({ type: `budget_cat_80_${catName}`, message: `Uwaga: 80% budżetu w kategorii ${catName} już wydane.`, monthKey });
                }
            }
        }
    }

    // 3. Sprawdzanie rachunków (recurring)
    const now = new Date();
    if (Array.isArray(allRecurringExpenses)) {
        allRecurringExpenses.forEach(r => {
            const alreadyPaid = allPurchases.some(p => 
                p.date.substring(0, 7) === monthKey && 
                p.shop.toLowerCase().includes(r.name.toLowerCase())
            );
            
            if (!alreadyPaid) {
                const today = now.getDate();
                const dueDay = r.dayOfMonth || 1;
                // Jeśli termin jest blisko (3 dni przed lub 1 dzień po)
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

    // Wyślij nowe na serwer
    for (const notif of notificationsToPush) {
        await pushNotificationToServer(notif);
    }
}

async function pushNotificationToServer(notif) {
    try {
        await apiCall('/api/notifications', 'POST', notif);
    } catch (e) {
        console.error('Błąd pushNotificationToServer:', e);
    }
}

/**
 * Wyzwalanie analizy AI
 */
async function generateAIInsights() {
    const btn = document.getElementById('ai-insight-btn');
    if (!btn) return;
    const originalContent = btn.innerHTML;
    
    try {
        const todayKey = new Date().toISOString().substring(0, 10);
        
        // Sprawdź na froncie przed wysłaniem zapytania
        const hasTodayInsight = Array.isArray(currentNotifications) && 
            currentNotifications.some(n => n.type === 'ai_insight' && n.monthKey === todayKey);
            
        if (hasTodayInsight) {
            alert('Dzisiejsza analiza AI została już wygenerowana. Zapraszamy jutro!');
            return;
        }

        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analiza Gemini...';
        
        // Przygotuj dane
        const stats = calculateCurrentMonthStats();
        const data = await apiCall('/api/analysis/insights', 'POST', stats);

        // Pokazujemy wyniki jako specjalne powiadomienia
        if (data.insights && Array.isArray(data.insights)) {
            for (const insight of data.insights) {
                 await pushNotificationToServer({
                     type: 'ai_insight',
                     message: insight.text,
                     monthKey: new Date().toISOString().substring(0, 10)
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

function calculateCurrentMonthStats() {
    const now = new Date();
    const curMonth = now.toISOString().substring(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = prevDate.toISOString().substring(0, 7);

    const stats = {
        currentMonthData: { total: 0, topCategories: [] },
        previousMonthData: { total: 0 },
        categories: structuredCategories.map(c => c.name)
    };

    const curTotals = {};
    allPurchases.forEach(p => {
        const m = p.date.substring(0, 7);
        if (m === curMonth) {
            stats.currentMonthData.total += p.totalAmount || 0;
            if (Array.isArray(p.items)) {
                p.items.forEach(i => {
                    const cat = i.category || 'inne';
                    curTotals[cat] = (curTotals[cat] || 0) + (i.price || 0);
                });
            }
        } else if (m === prevMonth) {
            stats.previousMonthData.total += p.totalAmount || 0;
        }
    });

    stats.currentMonthData.topCategories = Object.entries(curTotals)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, value]) => ({ name, value }));

    return stats;
}
