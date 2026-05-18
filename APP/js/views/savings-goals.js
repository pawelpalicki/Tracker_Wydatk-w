// views/savings-goals.js — Cele Oszczędnościowe / Skarbonka (ES Module)
//
// Odpowiada za wyświetlanie listy celów, animowanie pasków postępu,
// oraz szuflady do wpłat/wypłat, dodawania nowych celów i alokacji nadwyżki.

import state from '../core/state.js';
import { apiCall } from '../core/api.js';
import { formatAmount } from '../shared/format.js';
import { switchTab } from '../shared/ui.js';
import Drawer from '../shared/drawer.js';
import { fetchInitialData } from '../core/data-loader.js';

let savingsGoalsInitialized = false;

function el(id) {
    return document.getElementById(id);
}

// Kolory i gradienty dla kart celów
const COLOR_PRESETS = [
    { value: '#10b981', name: 'Szmaragdowy', bg: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/25 text-emerald-400' },
    { value: '#3b82f6', name: 'Niebieski', bg: 'from-blue-500/10 to-blue-500/5 border-blue-500/25 text-blue-400' },
    { value: '#f59e0b', name: 'Bursztynowy', bg: 'from-amber-500/10 to-amber-500/5 border-amber-500/25 text-amber-400' },
    { value: '#8b5cf6', name: 'Fioletowy', bg: 'from-purple-500/10 to-purple-500/5 border-purple-500/25 text-purple-400' },
    { value: '#ec4899', name: 'Różowy', bg: 'from-pink-500/10 to-pink-500/5 border-pink-500/25 text-pink-400' },
    { value: '#ef4444', name: 'Czerwony', bg: 'from-red-500/10 to-red-500/5 border-red-500/25 text-red-400' }
];

// Dostępne ikony
const ICON_PRESETS = [
    { value: 'fa-piggy-bank', label: 'Skarbonka' },
    { value: 'fa-bicycle', label: 'Rower' },
    { value: 'fa-car', label: 'Auto' },
    { value: 'fa-home', label: 'Dom' },
    { value: 'fa-plane', label: 'Podróże' },
    { value: 'fa-laptop', label: 'Laptop' },
    { value: 'fa-gift', label: 'Prezent' },
    { value: 'fa-shopping-cart', label: 'Zakupy' },
    { value: 'fa-graduation-cap', label: 'Edukacja' }
];

/**
 * Główna funkcja renderująca widok Skarbonki
 */
export async function renderSavingsGoalsTab() {
    const container = el('savings-goals-tab');
    if (!container) return;

    // Inicjalizacja szkieletu HTML (tylko za pierwszym razem)
    container.innerHTML = `
        <div class="flex flex-col h-[calc(100vh-10rem)] pb-4 px-2">
            <!-- Premium Header Card -->
            <div class="glass-card p-5 mb-4 border border-white/10 rounded-2xl flex flex-col justify-between shrink-0 relative overflow-hidden bg-gradient-to-br from-brand-500/10 to-brand-500/0">
                <div class="flex justify-between items-center z-10">
                    <div>
                        <p class="text-xs text-gray-400 font-semibold uppercase tracking-wider">Suma wszystkich oszczędności</p>
                        <h2 id="total-savings-amount" class="text-3xl font-extrabold text-white mt-1">0.00 zł</h2>
                    </div>
                    <button id="add-savings-goal-btn" class="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 rounded-lg border border-brand-500/20 transition-all text-xs font-bold active:scale-95">
                        <i class="fas fa-plus text-[10px]"></i>
                        <span>Nowy Cel</span>
                    </button>
                </div>
                <div class="flex gap-4 mt-4 text-xs text-gray-400 z-10 border-t border-white/5 pt-3">
                    <div>Aktywne cele: <span id="active-goals-count" class="text-white font-bold">0</span></div>
                    <div>Zrealizowane: <span id="completed-goals-count" class="text-brand-400 font-bold">0</span></div>
                </div>
            </div>

            <!-- Surplus History Container -->
            <div id="savings-surplus-history-container" class="shrink-0"></div>

            <!-- Goals List -->
            <div id="savings-goals-list" class="flex-1 space-y-4 overflow-y-auto pr-1 pb-4 scrollbar-hide">
                <div class="flex items-center justify-center py-10">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
                </div>
            </div>
        </div>
    `;

    // Podłącz listenery do elementów szkieletu
    el('add-savings-goal-btn')?.addEventListener('click', () => openAddEditGoalDrawer());

    // Pobierz i zaktualizuj listę celów w stanie
    try {
        const goals = await apiCall('/api/savings-goals');
        state.allSavingsGoals = goals || [];
    } catch (e) {
        console.error('Błąd pobierania celów:', e);
    }

    // Wyrenderuj zawartość celów
    updateSavingsGoalsList();

    // Sprawdź nadwyżkę budżetową z zeszłych miesięcy
    checkAndRenderSurplus();
}

/**
 * Aktualizuje listę celów i statystyki w nagłówku
 */
function updateSavingsGoalsList() {
    const listContainer = el('savings-goals-list');
    const totalAmountEl = el('total-savings-amount');
    const activeCountEl = el('active-goals-count');
    const completedCountEl = el('completed-goals-count');

    if (!listContainer) return;

    const goals = state.allSavingsGoals || [];

    // Oblicz statystyki
    const totalSavings = goals.reduce((sum, g) => sum + (parseFloat(g.currentAmount) || 0), 0);
    const activeCount = goals.filter(g => g.currentAmount < g.targetAmount).length;
    const completedCount = goals.filter(g => g.currentAmount >= g.targetAmount).length;

    if (totalAmountEl) totalAmountEl.textContent = formatAmount(totalSavings);
    if (activeCountEl) activeCountEl.textContent = activeCount;
    if (completedCountEl) completedCountEl.textContent = completedCount;

    if (goals.length === 0) {
        listContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 text-center">
                <div class="w-16 h-16 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-gray-500 mb-4">
                    <i class="fas fa-piggy-bank text-2xl"></i>
                </div>
                <p class="text-gray-300 font-semibold text-sm">Nie masz jeszcze żadnych celów</p>
                <p class="text-gray-500 text-xs mt-1 max-w-[240px]">Dodaj swój pierwszy cel oszczędnościowy, np. na wakacje lub nowy rower!</p>
            </div>
        `;
        return;
    }

    let html = '';
    goals.forEach(goal => {
        const percent = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
        const isCompleted = goal.currentAmount >= goal.targetAmount;
        
        // Dopasuj kolor presetu
        const preset = COLOR_PRESETS.find(p => p.value === goal.color) || COLOR_PRESETS[0];

        // Formatowanie daty terminu
        let deadlineHtml = '';
        if (goal.deadline) {
            const today = new Date();
            today.setHours(0,0,0,0);
            const dlDate = new Date(goal.deadline);
            dlDate.setHours(0,0,0,0);
            const diffTime = dlDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (isCompleted) {
                deadlineHtml = `<span class="text-brand-400 font-bold"><i class="fas fa-check-circle mr-1"></i> Zrealizowano!</span>`;
            } else if (diffDays > 0) {
                deadlineHtml = `<span class="text-gray-400 font-medium"><i class="far fa-clock mr-1"></i> Zostało ${diffDays} dni</span>`;
            } else if (diffDays === 0) {
                deadlineHtml = `<span class="text-amber-400 font-bold"><i class="fas fa-exclamation-triangle mr-1"></i> Termin dzisiaj!</span>`;
            } else {
                deadlineHtml = `<span class="text-red-400 font-bold"><i class="fas fa-exclamation-circle mr-1"></i> Po terminie o ${Math.abs(diffDays)} dni</span>`;
            }
        } else if (isCompleted) {
            deadlineHtml = `<span class="text-brand-400 font-bold"><i class="fas fa-check-circle mr-1"></i> Zrealizowano!</span>`;
        }

        html += `
            <div class="glass-card p-4 border border-white/10 rounded-2xl bg-gradient-to-br ${preset.bg} relative overflow-hidden transition-all duration-300 hover:scale-[1.01]" data-id="${goal.id}">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center" style="color: ${goal.color}">
                            <i class="fas ${goal.icon || 'fa-piggy-bank'} text-lg"></i>
                        </div>
                        <div>
                            <h3 class="font-bold text-white text-sm sm:text-base leading-tight">${goal.name}</h3>
                            <div class="text-[11px] mt-1">${deadlineHtml}</div>
                        </div>
                    </div>
                    
                    <button class="manage-goal-btn w-8 h-8 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors active:scale-95" title="Zarządzaj">
                        <i class="fas fa-cog text-xs"></i>
                    </button>
                </div>

                <!-- Progress Section -->
                <div class="space-y-1.5 mb-4">
                    <div class="flex justify-between text-xs font-semibold">
                        <span class="text-gray-300">${formatAmount(goal.currentAmount)} / <span class="text-gray-400 font-normal">${formatAmount(goal.targetAmount)}</span></span>
                        <span style="color: ${goal.color}">${percent}%</span>
                    </div>
                    
                    <!-- Progress Bar Container -->
                    <div class="w-full bg-white/5 h-2.5 rounded-full overflow-hidden border border-white/5">
                        <div class="progress-bar-fill h-full rounded-full transition-all duration-1000 ease-out" 
                             style="width: 0%; background: ${goal.color}" 
                             data-target-width="${percent}%"></div>
                    </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2 pt-1">
                    <button class="deposit-btn flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 active:scale-[0.97]">
                        <i class="fas fa-plus text-[9px]"></i>
                        <span>Wpłać</span>
                    </button>
                    <button class="withdraw-btn flex-1 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 active:scale-[0.97]">
                        <i class="fas fa-minus text-[9px]"></i>
                        <span>Wypłać</span>
                    </button>
                </div>
            </div>
        `;
    });

    listContainer.innerHTML = html;

    // Uruchomienie mikro-animacji paska postępu
    setTimeout(() => {
        listContainer.querySelectorAll('.progress-bar-fill').forEach(fill => {
            fill.style.width = fill.dataset.targetWidth;
        });
    }, 50);

    // Podłączenie listenerów do przycisków na kartach
    listContainer.querySelectorAll('.deposit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('[data-id]').dataset.id;
            const goal = goals.find(g => g.id === id);
            if (goal) openDepositWithdrawDrawer(goal, 'deposit');
        });
    });

    listContainer.querySelectorAll('.withdraw-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('[data-id]').dataset.id;
            const goal = goals.find(g => g.id === id);
            if (goal) openDepositWithdrawDrawer(goal, 'withdraw');
        });
    });

    listContainer.querySelectorAll('.manage-goal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('[data-id]').dataset.id;
            const goal = goals.find(g => g.id === id);
            if (goal) openAddEditGoalDrawer(goal);
        });
    });
}

/**
 * Sprawdza i renderuje banner o nadwyżce budżetowej z zeszłego miesiąca
 */
let surplusHistoryCollapsed = localStorage.getItem('surplus_history_collapsed') === 'true';

/**
 * Pobiera listę ostatnich N zamkniętych miesięcy w formacie YYYY-MM
 */
function getPreviousClosedMonths(count = 5) {
    const months = [];
    const now = new Date();
    for (let i = 1; i <= count; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        
        // Uzyskaj polską nazwę miesiąca (np. Kwiecień 2026)
        const label = d.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        months.push({
            value: `${yyyy}-${mm}`,
            label: label.charAt(0).toUpperCase() + label.slice(1)
        });
    }
    return months;
}

/**
 * Sprawdza i renderuje interaktywną sekcję analizy nadwyżek budżetowych z ostatnich 5 zamkniętych miesięcy
 */
async function checkAndRenderSurplus() {
    const historyContainer = el('savings-surplus-history-container');
    if (!historyContainer) return;

    // 1. Renderuj skeleton ładowania i strukturę panelu
    const isHiddenClass = surplusHistoryCollapsed ? 'hidden' : 'block';
    const chevronIconClass = surplusHistoryCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';

    historyContainer.innerHTML = `
        <div class="glass-card p-4 mb-4 border border-white/10 rounded-2xl relative overflow-hidden bg-gradient-to-br from-brand-500/5 to-transparent">
            <!-- Header (Toggle trigger) -->
            <button id="toggle-surplus-history-btn" class="w-full flex justify-between items-center text-left focus:outline-none group">
                <div class="flex items-center space-x-2">
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-widest group-hover:text-white transition-colors">Analiza nadwyżek budżetowych</span>
                    <span id="surplus-pending-badge" class="hidden px-1.5 py-0.5 bg-brand-500/20 text-brand-400 border border-brand-500/20 rounded-md text-[9px] font-bold uppercase animate-pulse">Oczekuje</span>
                </div>
                <div class="flex items-center space-x-2 text-gray-400 group-hover:text-white transition-colors">
                    <i class="fas fa-history text-xs text-brand-400"></i>
                    <i id="surplus-chevron" class="fas ${chevronIconClass} text-xs"></i>
                </div>
            </button>
            
            <!-- Collapsible Body -->
            <div id="surplus-history-body" class="${isHiddenClass} mt-3">
                <div id="surplus-months-loader" class="space-y-2 py-4 flex flex-col items-center justify-center">
                    <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-500"></div>
                </div>
                <div id="surplus-months-list" class="space-y-2.5 hidden"></div>
            </div>
        </div>
    `;

    // Podłącz zdarzenie zwijania/rozwijania
    el('toggle-surplus-history-btn')?.addEventListener('click', () => {
        surplusHistoryCollapsed = !surplusHistoryCollapsed;
        localStorage.setItem('surplus_history_collapsed', surplusHistoryCollapsed);
        
        const body = el('surplus-history-body');
        const chevron = el('surplus-chevron');
        if (body) {
            body.classList.toggle('hidden');
        }
        if (chevron) {
            chevron.classList.toggle('fa-chevron-down');
            chevron.classList.toggle('fa-chevron-up');
        }
    });

    try {
        // Pobierz rozliczone miesiące z Firestore
        const settledMonths = await apiCall('/api/savings-goals/settled');
        const settledSet = new Set(settledMonths.map(s => s.month));

        // Skanujemy 12 zamkniętych miesięcy wstecz
        const prevMonths = getPreviousClosedMonths(12);
        
        // Pobierz dane dla wszystkich miesięcy równolegle
        const promises = prevMonths.map(async (m) => {
            try {
                const res = await apiCall(`/api/savings-goals/surplus?month=${m.value}`);
                return { ...m, ...res };
            } catch (err) {
                console.error(`Błąd pobierania nadwyżki dla ${m.value}:`, err);
                return { ...m, surplus: 0, deficit: 0, totalBudget: 0, totalSpent: 0, error: true };
            }
        });
        
        const results = await Promise.all(promises);
        
        // Filtrujemy tylko te miesiące, które wymagają akcji (posiadają nadwyżkę/deficyt > 0 i nie są rozliczone)
        const actionableResults = results.filter(res => (res.surplus > 0 || res.deficit > 0) && !settledSet.has(res.month));
        
        let listHtml = '';

        if (actionableResults.length === 0) {
            listHtml = `
                <div class="flex flex-col items-center justify-center py-6 text-center border-t border-white/5 mt-2">
                    <div class="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2.5 border border-emerald-500/20">
                        <i class="fas fa-check text-sm"></i>
                    </div>
                    <span class="text-xs font-bold text-white mb-0.5">Wszystko rozliczone!</span>
                    <span class="text-[10px] text-gray-500 max-w-[220px] leading-normal">Wszystkie zeszłe miesiące są w pełni rozliczone. Dobra robota! 🎉</span>
                </div>
            `;
        } else {
            actionableResults.forEach(res => {
                let statusActionHtml = '';
                let amountHtml = '';
                
                if (res.surplus > 0) {
                    amountHtml = `
                        <div class="text-right">
                            <div class="text-xs font-extrabold text-emerald-400">${formatAmount(res.surplus)}</div>
                            <div class="text-[9px] text-gray-400">nadwyżki</div>
                        </div>
                    `;
                    statusActionHtml = `
                        <button class="allocate-surplus-item-btn px-2.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1 shrink-0 active:scale-95 shadow-md" 
                                data-month="${res.month}" 
                                data-surplus="${res.surplus}">
                            <span>Zaalokuj</span>
                            <i class="fas fa-arrow-right text-[8px]"></i>
                        </button>
                    `;
                } else if (res.deficit > 0) {
                    amountHtml = `
                        <div class="text-right">
                            <div class="text-xs font-extrabold text-red-400">-${formatAmount(res.deficit)}</div>
                            <div class="text-[9px] text-gray-400">przekroczenia</div>
                        </div>
                    `;
                    statusActionHtml = `
                        <button class="cover-deficit-item-btn px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1 shrink-0 active:scale-95" 
                                data-month="${res.month}" 
                                data-deficit="${res.deficit}">
                            <span>Pokryj deficyt</span>
                            <i class="fas fa-exclamation-triangle text-[8px]"></i>
                        </button>
                    `;
                }

                listHtml += `
                    <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all gap-2">
                        <div class="space-y-0.5 overflow-hidden">
                            <span class="text-xs font-bold text-white block truncate">${res.label}</span>
                            <div class="text-[10px] text-gray-500 truncate font-medium">Budżet: ${formatAmount(res.totalBudget)} • Wydano: ${formatAmount(res.totalSpent)}</div>
                        </div>
                        
                        <div class="flex items-center space-x-3 shrink-0">
                            ${amountHtml}
                            ${statusActionHtml}
                        </div>
                    </div>
                `;
            });
        }

        // Ukryj loader, pokaż listę
        const loader = el('surplus-months-loader');
        const listContainer = el('surplus-months-list');
        if (loader) loader.classList.add('hidden');
        if (listContainer) {
            listContainer.innerHTML = listHtml;
            listContainer.classList.remove('hidden');
            
            // Podłącz listenery do przycisków alokacji
            listContainer.querySelectorAll('.allocate-surplus-item-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetBtn = e.currentTarget;
                    const surplusVal = parseFloat(targetBtn.dataset.surplus);
                    const monthVal = targetBtn.dataset.month;
                    openAllocateSurplusDrawer(surplusVal, monthVal);
                });
            });

            // Podłącz listenery do przycisków pokrywania deficytów
            listContainer.querySelectorAll('.cover-deficit-item-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetBtn = e.currentTarget;
                    const deficitVal = parseFloat(targetBtn.dataset.deficit);
                    const monthVal = targetBtn.dataset.month;
                    openCoverDeficitDrawer(deficitVal, monthVal);
                });
            });
        }

        // Pokaż pulsing badge "Oczekuje", jeśli są wolne nadwyżki/deficyty do zatwierdzenia
        const pendingBadge = el('surplus-pending-badge');
        if (pendingBadge) {
            if (actionableResults.length > 0) {
                pendingBadge.textContent = `${actionableResults.length} NOWE`;
                pendingBadge.classList.remove('hidden');
            } else {
                pendingBadge.classList.add('hidden');
            }
        }

    } catch (err) {
        console.error('Błąd inicjalizacji analizy nadwyżek:', err);
        const loader = el('surplus-months-loader');
        if (loader) {
            loader.innerHTML = `<span class="text-xs text-red-400">Nie udało się załadować danych historycznych.</span>`;
        }
    }
}

/**
 * Szuflada (Drawer): Dodawanie i Edycja Skarbonki
 */
function openAddEditGoalDrawer(goal = null) {
    const isEdit = !!goal;
    const title = isEdit ? 'Edytuj cel oszczędnościowy' : 'Nowy cel oszczędnościowy';

    // Wygeneruj opcje ikon
    let iconOptionsHtml = '';
    ICON_PRESETS.forEach(item => {
        const isSelected = isEdit ? goal.icon === item.value : item.value === 'fa-piggy-bank';
        iconOptionsHtml += `
            <button type="button" data-icon="${item.value}" class="icon-preset-btn p-3 rounded-xl border ${isSelected ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'bg-white/5 border-white/5 text-gray-400'} hover:bg-white/10 flex flex-col items-center gap-1 transition-all">
                <i class="fas ${item.value} text-lg"></i>
                <span class="text-[9px] font-medium leading-none">${item.label}</span>
            </button>
        `;
    });

    // Wygeneruj opcje kolorów
    let colorOptionsHtml = '';
    COLOR_PRESETS.forEach(preset => {
        const isSelected = isEdit ? goal.color === preset.value : preset.value === '#10b981';
        colorOptionsHtml += `
            <button type="button" data-color="${preset.value}" class="color-preset-btn w-9 h-9 rounded-full border-2 ${isSelected ? 'border-white scale-105' : 'border-transparent'} hover:scale-105 transition-all flex items-center justify-center shadow-lg" style="background-color: ${preset.value}">
                ${isSelected ? '<i class="fas fa-check text-[10px] text-white"></i>' : ''}
            </button>
        `;
    });

    // Renderuj historię transakcji, jeśli jesteśmy w trybie edycji
    let historyHtml = '';
    if (isEdit) {
        const historyList = goal.history || [];
        if (historyList.length === 0) {
            historyHtml = `<div class="text-[11px] text-gray-500 italic py-3 text-center border border-white/5 rounded-xl bg-white/5">Brak historii transakcji</div>`;
        } else {
            const sortedHistory = [...historyList].sort((a, b) => new Date(b.date) - new Date(a.date));
            sortedHistory.forEach(item => {
                const isPositive = item.type === 'deposit' || item.type === 'transfer_in';
                const amtClass = isPositive ? 'text-emerald-400 font-extrabold' : 'text-red-400 font-extrabold';
                const amtSign = isPositive ? '+' : '-';
                let dateObj = new Date();
                if (item.date) {
                    if (typeof item.date === 'string') {
                        dateObj = new Date(item.date);
                    } else if (item.date._seconds !== undefined) {
                        dateObj = new Date(item.date._seconds * 1000);
                    } else if (item.date.seconds !== undefined) {
                        dateObj = new Date(item.date.seconds * 1000);
                    } else if (typeof item.date.toDate === 'function') {
                        dateObj = item.date.toDate();
                    } else {
                        dateObj = new Date(item.date);
                    }
                }
                const formattedDate = dateObj.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                
                let iconClass = 'fa-arrow-down text-emerald-400';
                if (item.type === 'withdraw') iconClass = 'fa-arrow-up text-red-400';
                else if (item.type === 'transfer_in') iconClass = 'fa-exchange-alt text-emerald-400';
                else if (item.type === 'transfer_out') iconClass = 'fa-exchange-alt text-red-400';

                historyHtml += `
                    <div class="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 text-[11px] gap-2">
                        <div class="flex items-center space-x-2 overflow-hidden">
                            <div class="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                                <i class="fas ${iconClass} text-[10px]"></i>
                            </div>
                            <div class="overflow-hidden">
                                <span class="text-white font-semibold block truncate leading-normal">${item.note || 'Transakcja'}</span>
                                <span class="text-[9px] text-gray-500 block leading-none mt-0.5">${formattedDate}</span>
                            </div>
                        </div>
                        <span class="${amtClass} shrink-0 text-right">${amtSign}${formatAmount(item.amount)}</span>
                    </div>
                `;
            });
        }
    }

    const contentHtml = `
        <form id="goal-drawer-form" class="space-y-4 pt-2">
            <div>
                <label for="goal-name" class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nazwa celu *</label>
                <input type="text" id="goal-name" value="${isEdit ? goal.name : ''}" required maxlength="40"
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-medium"
                    placeholder="np. Nowy Rower, Wakacje w Hiszpanii">
            </div>
            
            <div>
                <label for="goal-target" class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Kwota docelowa (zł) *</label>
                <input type="number" id="goal-target" value="${isEdit ? goal.targetAmount : ''}" step="0.01" min="0.01" required
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-medium"
                    placeholder="0.00">
            </div>

            <div>
                <label for="goal-deadline" class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Termin realizacji (opcjonalnie)</label>
                <input type="date" id="goal-deadline" value="${isEdit && goal.deadline ? goal.deadline : ''}"
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-medium">
            </div>

            <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ikona celu</label>
                <div class="grid grid-cols-3 gap-2" id="icon-presets-container">
                    ${iconOptionsHtml}
                </div>
                <input type="hidden" id="selected-goal-icon" value="${isEdit ? goal.icon : 'fa-piggy-bank'}">
            </div>

            <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Kolor przewodni</label>
                <div class="flex items-center gap-3 py-1 flex-wrap" id="color-presets-container">
                    ${colorOptionsHtml}
                </div>
                <input type="hidden" id="selected-goal-color" value="${isEdit ? goal.color : '#10b981'}">
            </div>

            ${isEdit ? `
                <div class="pt-4 border-t border-white/5 space-y-2">
                    <button type="button" id="transfer-goal-funds-btn" class="w-full py-3 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/20 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                        <i class="fas fa-exchange-alt"></i>
                        <span>Przelej do innego celu</span>
                    </button>
                    <button type="button" id="delete-goal-btn" class="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                        <i class="fas fa-trash-alt"></i>
                        <span>Usuń cel oszczędnościowy</span>
                    </button>
                </div>
                
                <div class="pt-4 border-t border-white/5">
                    <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Historia transakcji</label>
                    <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        ${historyHtml}
                    </div>
                </div>
            ` : ''}
        </form>
    `;

    Drawer.open({
        title,
        content: contentHtml,
        size: 'sm',
        confirmLabel: isEdit ? 'Zapisz zmiany' : 'Stwórz cel',
        cancelLabel: 'Anuluj',
        onConfirm: async () => {
            const form = el('goal-drawer-form');
            if (!form.reportValidity()) return;

            const name = el('goal-name').value.trim();
            const targetAmount = parseFloat(el('goal-target').value);
            const deadline = el('goal-deadline').value || null;
            const icon = el('selected-goal-icon').value;
            const color = el('selected-goal-color').value;

            try {
                if (isEdit) {
                    await apiCall(`/api/savings-goals/${goal.id}`, 'PUT', { name, targetAmount, deadline, icon, color });
                } else {
                    await apiCall('/api/savings-goals', 'POST', { name, targetAmount, deadline, icon, color });
                }
                
                // Odśwież i zamknij
                await renderSavingsGoalsTab();
                Drawer.close();
            } catch (err) {
                alert('Błąd zapisu celu: ' + err.message);
                throw err;
            }
        }
    });

    // Zdarzenia klikania ikon
    const iconContainer = el('icon-presets-container');
    iconContainer?.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-preset-btn');
        if (!btn) return;
        iconContainer.querySelectorAll('.icon-preset-btn').forEach(b => {
            b.classList.remove('bg-brand-500/20', 'border-brand-500', 'text-brand-400');
            b.classList.add('bg-white/5', 'border-white/5', 'text-gray-400');
        });
        btn.classList.remove('bg-white/5', 'border-white/5', 'text-gray-400');
        btn.classList.add('bg-brand-500/20', 'border-brand-500', 'text-brand-400');
        el('selected-goal-icon').value = btn.dataset.icon;
    });

    // Zdarzenia klikania kolorów
    const colorContainer = el('color-presets-container');
    colorContainer?.addEventListener('click', (e) => {
        const btn = e.target.closest('.color-preset-btn');
        if (!btn) return;
        colorContainer.querySelectorAll('.color-preset-btn').forEach(b => {
            b.classList.remove('border-white', 'scale-105');
            b.classList.add('border-transparent');
            b.innerHTML = '';
        });
        btn.classList.remove('border-transparent');
        btn.classList.add('border-white', 'scale-105');
        btn.innerHTML = '<i class="fas fa-check text-[10px] text-white"></i>';
        el('selected-goal-color').value = btn.dataset.color;
    });

    // Przelew środków
    el('transfer-goal-funds-btn')?.addEventListener('click', () => {
        openTransferBetweenGoalsDrawer(goal);
    });

    // Usuwanie celu
    el('delete-goal-btn')?.addEventListener('click', async () => {
        if (!confirm(`Czy na pewno chcesz usunąć cel "${goal.name}"? Zgromadzone środki zostaną usunięte z systemu.`)) return;
        try {
            await apiCall(`/api/savings-goals/${goal.id}`, 'DELETE');
            await renderSavingsGoalsTab();
            Drawer.close();
        } catch (e) {
            alert('Błąd usuwania celu: ' + e.message);
        }
    });

    setTimeout(() => el('goal-name')?.focus(), 50);
}

/**
 * Szuflada (Drawer): Wpłata / Wypłata środków
 */
function openDepositWithdrawDrawer(goal, mode = 'deposit') {
    const isDeposit = mode === 'deposit';
    const title = isDeposit ? `Wpłać do: ${goal.name}` : `Wypłać z: ${goal.name}`;
    const actionLabel = isDeposit ? 'Wpłać środki' : 'Wypłać środki';
    
    const quickAmounts = isDeposit ? [20, 50, 100, 200, 500] : [20, 50, 100, 200];
    let quickButtonsHtml = '';
    quickAmounts.forEach(amt => {
        quickButtonsHtml += `
            <button type="button" data-amount="${amt}" class="quick-amt-btn py-2.5 px-3 bg-white/5 border border-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all active:scale-95">
                +${amt} zł
            </button>
        `;
    });

    const contentHtml = `
        <form id="tx-drawer-form" class="space-y-4 pt-2">
            <div class="p-4 rounded-xl border border-white/5 bg-white/5 flex justify-between items-center text-xs">
                <span class="text-gray-400 font-medium">Aktualny stan skarbonki:</span>
                <span class="text-white font-bold text-sm">${formatAmount(goal.currentAmount)}</span>
            </div>

            <div>
                <label for="tx-amount" class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Kwota transakcji (zł) *</label>
                <input type="number" id="tx-amount" step="0.01" min="0.01" required
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-semibold"
                    placeholder="0.00">
            </div>

            <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Szybkie kwoty</label>
                <div class="grid grid-cols-4 gap-2">
                    ${quickButtonsHtml}
                </div>
            </div>
        </form>
    `;

    Drawer.open({
        title,
        content: contentHtml,
        size: 'sm',
        confirmLabel: actionLabel,
        cancelLabel: 'Anuluj',
        onConfirm: async () => {
            const form = el('tx-drawer-form');
            if (!form.reportValidity()) return;

            const amount = parseFloat(el('tx-amount').value);

            try {
                const endpoint = `/api/savings-goals/${goal.id}/${mode}`;
                await apiCall(endpoint, 'POST', { amount });
                
                // Odśwież widok
                await renderSavingsGoalsTab();
                Drawer.close();
            } catch (err) {
                alert('Błąd transakcji: ' + err.message);
                throw err;
            }
        }
    });

    // Zdarzenia klikania szybkich kwot
    document.querySelectorAll('.quick-amt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = el('tx-amount');
            const addedVal = parseFloat(btn.dataset.amount);
            const currentVal = parseFloat(input.value) || 0;
            input.value = (currentVal + addedVal).toFixed(2);
            input.dispatchEvent(new Event('input'));
        });
    });

    setTimeout(() => el('tx-amount')?.focus(), 50);
}

/**
 * Szuflada (Drawer): Alokacja nadwyżki budżetowej z zeszłego miesiąca
 */
function openAllocateSurplusDrawer(surplus, month) {
    const activeGoals = (state.allSavingsGoals || []).filter(g => g.currentAmount < g.targetAmount);

    if (activeGoals.length === 0) {
        alert('Nie masz aktywnych celów oszczędnościowych, do których możesz przelać nadwyżkę. Stwórz najpierw cel!');
        return;
    }

    let goalOptionsHtml = '';
    activeGoals.forEach((goal, idx) => {
        goalOptionsHtml += `
            <label class="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 cursor-pointer group transition-all">
                <div class="flex items-center space-x-3">
                    <input type="radio" name="surplus-target-goal" value="${goal.id}" ${idx === 0 ? 'checked' : ''} class="w-4 h-4 text-brand-500 focus:ring-brand-500 border-white/10 bg-white/5">
                    <div class="flex items-center space-x-2">
                        <i class="fas ${goal.icon || 'fa-piggy-bank'}" style="color: ${goal.color}"></i>
                        <span class="text-white text-sm font-semibold">${goal.name}</span>
                    </div>
                </div>
                <span class="text-xs text-gray-400 font-medium">${formatAmount(goal.currentAmount)} / ${formatAmount(goal.targetAmount)}</span>
            </label>
        `;
    });

    const contentHtml = `
        <form id="surplus-drawer-form" class="space-y-4 pt-2">
            <div class="p-4 rounded-xl border border-brand-500/20 bg-brand-500/5 text-xs space-y-1">
                <div class="flex justify-between">
                    <span class="text-brand-300 font-semibold">Całkowita nadwyżka za ${month}:</span>
                    <span class="text-white font-extrabold text-sm">${formatAmount(surplus)}</span>
                </div>
            </div>

            <div>
                <label for="surplus-amount" class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Kwota transferu (zł) *</label>
                <input type="number" id="surplus-amount" value="${surplus.toFixed(2)}" step="0.01" min="0.01" max="${surplus}" required
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-semibold">
            </div>

            <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Wybierz cel docelowy *</label>
                <div class="space-y-2">
                    ${goalOptionsHtml}
                </div>
            </div>
        </form>
    `;

    Drawer.open({
        title: 'Przelej nadwyżkę budżetową',
        content: contentHtml,
        size: 'sm',
        confirmLabel: 'Przelej oszczędności',
        cancelLabel: 'Anuluj',
        onConfirm: async () => {
            const form = el('surplus-drawer-form');
            if (!form.reportValidity()) return;

            const amount = parseFloat(el('surplus-amount').value);
            const goalId = document.querySelector('input[name="surplus-target-goal"]:checked')?.value;

            if (!goalId) {
                alert('Proszę wybrać cel oszczędnościowy.');
                return;
            }

            try {
                // Wykonaj wpłatę na cel wraz z notatką transakcyjną
                await apiCall(`/api/savings-goals/${goalId}/deposit`, 'POST', {
                    amount,
                    note: `Alokacja nadwyżki za ${month}`
                });
                
                // Zapisz rozliczenie miesiąca w Firestore (zsynchronizowane na wszystkich urządzeniach!)
                await apiCall('/api/savings-goals/settled', 'POST', {
                    month,
                    type: 'surplus'
                });

                // Odśwież widok
                await renderSavingsGoalsTab();
                Drawer.close();
            } catch (err) {
                alert('Błąd alokacji nadwyżki: ' + err.message);
                throw err;
            }
        }
    });
}

/**
 * Szuflada (Drawer): Pokrycie deficytu budżetowego z zeszłego miesiąca
 */
function openCoverDeficitDrawer(deficit, month) {
    const activeGoals = (state.allSavingsGoals || []).filter(g => g.currentAmount > 0);

    if (activeGoals.length === 0) {
        alert('Nie masz środków w żadnym celu oszczędnościowym, aby pokryć ten deficyt. Wpłać najpierw środki do skarbonki.');
        return;
    }

    let goalOptionsHtml = '';
    activeGoals.forEach((goal, idx) => {
        goalOptionsHtml += `
            <label class="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 cursor-pointer group transition-all">
                <div class="flex items-center space-x-3">
                    <input type="radio" name="deficit-source-goal" value="${goal.id}" ${idx === 0 ? 'checked' : ''} class="w-4 h-4 text-red-500 focus:ring-red-500 border-white/10 bg-white/5">
                    <div class="flex items-center space-x-2">
                        <i class="fas ${goal.icon || 'fa-piggy-bank'}" style="color: ${goal.color}"></i>
                        <span class="text-white text-sm font-semibold">${goal.name}</span>
                    </div>
                </div>
                <span class="text-xs text-gray-400 font-medium">Zgromadzono: ${formatAmount(goal.currentAmount)}</span>
            </label>
        `;
    });

    const contentHtml = `
        <form id="deficit-drawer-form" class="space-y-4 pt-2">
            <div class="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-xs space-y-1">
                <div class="flex justify-between">
                    <span class="text-red-300 font-semibold">Deficyt do pokrycia za ${month}:</span>
                    <span class="text-white font-extrabold text-sm">${formatAmount(deficit)}</span>
                </div>
            </div>

            <div>
                <label for="deficit-amount" class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Kwota pobrania (zł) *</label>
                <input type="number" id="deficit-amount" value="${deficit.toFixed(2)}" step="0.01" min="0.01" max="${deficit}" required
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-semibold">
            </div>

            <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Pobierz środki z celu *</label>
                <div class="space-y-2">
                    ${goalOptionsHtml}
                </div>
            </div>
        </form>
    `;

    Drawer.open({
        title: 'Pokryj deficyt budżetowy',
        content: contentHtml,
        size: 'sm',
        confirmLabel: 'Pokryj deficyt',
        cancelLabel: 'Anuluj',
        onConfirm: async () => {
            const form = el('deficit-drawer-form');
            if (!form.reportValidity()) return;

            const amount = parseFloat(el('deficit-amount').value);
            const goalId = document.querySelector('input[name="deficit-source-goal"]:checked')?.value;

            if (!goalId) {
                alert('Proszę wybrać cel oszczędnościowy.');
                return;
            }

            const chosenGoal = activeGoals.find(g => g.id === goalId);
            if (chosenGoal.currentAmount < amount) {
                alert(`Wybrany cel posiada niewystarczające środki (${formatAmount(chosenGoal.currentAmount)}).`);
                return;
            }

            try {
                // Wykonaj wypłatę z celu z notatką o pokryciu deficytu
                await apiCall(`/api/savings-goals/${goalId}/withdraw`, 'POST', {
                    amount,
                    note: `Pokrycie deficytu za ${month}`
                });
                
                // Zapisz rozliczenie deficytu w Firestore
                await apiCall('/api/savings-goals/settled', 'POST', {
                    month,
                    type: 'deficit'
                });

                // Odśwież widok
                await renderSavingsGoalsTab();
                Drawer.close();
            } catch (err) {
                alert('Błąd pokrywania deficytu: ' + err.message);
                throw err;
            }
        }
    });
}

/**
 * Szuflada (Drawer): Przelew bezpośredni między celami oszczędnościowymi
 */
function openTransferBetweenGoalsDrawer(sourceGoal) {
    const activeGoals = (state.allSavingsGoals || []).filter(g => g.id !== sourceGoal.id && g.currentAmount < g.targetAmount);

    if (activeGoals.length === 0) {
        alert('Nie masz innych aktywnych celów oszczędnościowych, do których możesz przelać środki. Stwórz najpierw inny cel!');
        return;
    }

    let goalOptionsHtml = '';
    activeGoals.forEach((goal, idx) => {
        goalOptionsHtml += `
            <label class="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 cursor-pointer group transition-all">
                <div class="flex items-center space-x-3">
                    <input type="radio" name="transfer-target-goal" value="${goal.id}" ${idx === 0 ? 'checked' : ''} class="w-4 h-4 text-brand-500 focus:ring-brand-500 border-white/10 bg-white/5">
                    <div class="flex items-center space-x-2">
                        <i class="fas ${goal.icon || 'fa-piggy-bank'}" style="color: ${goal.color}"></i>
                        <span class="text-white text-sm font-semibold">${goal.name}</span>
                    </div>
                </div>
                <span class="text-xs text-gray-400 font-medium">${formatAmount(goal.currentAmount)} / ${formatAmount(goal.targetAmount)}</span>
            </label>
        `;
    });

    const contentHtml = `
        <form id="transfer-drawer-form" class="space-y-4 pt-2">
            <div class="p-4 rounded-xl border border-white/5 bg-white/5 flex justify-between items-center text-xs">
                <span class="text-gray-400 font-medium">Środki w celu źródłowym (${sourceGoal.name}):</span>
                <span class="text-white font-bold text-sm">${formatAmount(sourceGoal.currentAmount)}</span>
            </div>

            <div>
                <label for="transfer-amount" class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Kwota przelewu (zł) *</label>
                <input type="number" id="transfer-amount" step="0.01" min="0.01" max="${sourceGoal.currentAmount}" required
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-semibold"
                    placeholder="0.00">
            </div>

            <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Wybierz cel docelowy *</label>
                <div class="space-y-2">
                    ${goalOptionsHtml}
                </div>
            </div>
        </form>
    `;

    Drawer.open({
        title: 'Przelej środki między celami',
        content: contentHtml,
        size: 'sm',
        confirmLabel: 'Przelej środki',
        cancelLabel: 'Anuluj',
        onConfirm: async () => {
            const form = el('transfer-drawer-form');
            if (!form.reportValidity()) return;

            const amount = parseFloat(el('transfer-amount').value);
            const targetGoalId = document.querySelector('input[name="transfer-target-goal"]:checked')?.value;

            if (!targetGoalId) {
                alert('Proszę wybrać cel docelowy.');
                return;
            }

            try {
                await apiCall('/api/savings-goals/transfer', 'POST', {
                    sourceGoalId: sourceGoal.id,
                    targetGoalId,
                    amount
                });
                
                await renderSavingsGoalsTab();
                Drawer.close();
            } catch (err) {
                alert('Błąd przelewu: ' + err.message);
                throw err;
            }
        }
    });
}
