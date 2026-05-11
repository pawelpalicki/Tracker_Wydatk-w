/**
 * Moduł UI - Warstwa współdzielona.
 * Wydzielony z ui.js w Etapie 2 refaktoryzacji.
 * 
 * Odpowiada za:
 * - Konfigurację i nazewnictwo zakładek (VIEW_DEPTH, NAV_TITLES)
 * - Główną funkcję nawigacji (switchTab) i pasek nawigacji (updateNavbar)
 * - Mechanizm blokowania historii (OverlayNavigationLock) 
 * - Otwieranie i zamykanie drawerów oraz nakładek (openDrawer, openOverlay)
 * - Obsługę drawerów filtrowania i wyboru
 * - Szufladę szczegółów kategorii (Category Details Modal)
 */
import state from '../core/state.js';
import Drawer from './drawer.js';
import { formatAmount } from './format.js';


export const VIEW_DEPTH = {
    'home': 0,
    'list': 1,
    'add': 1,
    'analysis': 1,
    'special-budgets': 2,
    'more': 1,
    'settings': 2,
    'edit-purchase': 2,
    'settings-categories': 3,
    'settings-tags': 3,
    'settings-budget': 3,
    'settings-special': 3,
    'settings-recurring': 3
};

export const NAV_TITLES = {
    'home': 'Przegląd',
    'list': 'Lista zakupów',
    'add': 'Dodaj zakup',
    'analysis': 'Analiza',
    'special-budgets': 'Budżety specjalne',
    'more': 'Więcej',
    'settings': 'Ustawienia',
    'settings-categories': 'Kategorie wydatków',
    'settings-tags': 'Tagi produktów',
    'settings-budget': 'Miesięczny Budżet',
    'settings-special': 'Zarządzaj budżetami',
    'settings-recurring': 'Stałe Opłaty',
};

const TABS_WITH_BACK = ['special-budgets', 'settings', 'settings-categories', 'settings-tags', 'settings-budget', 'settings-special', 'settings-recurring'];
const registeredBlockingOverlays = new Map();

export function updateNavbar(tabName) {
    const title = document.getElementById('nav-title');
    const backBtn = document.getElementById('nav-back-btn');
    if (!title) return;

    title.textContent = NAV_TITLES[tabName] || tabName;

    const showBack = TABS_WITH_BACK.includes(tabName);
    if (backBtn) backBtn.classList.toggle('hidden', !showBack);
}

export function switchTab(tabName, pushToHistory = true) {
    const activeTab = document.querySelector('.tab-content.active');
    const currentTabId = activeTab ? activeTab.id.replace('-tab', '') : '';

    const effectiveCurrentId = (currentTabId === 'add' && state.editMode.active) ? 'edit-purchase' : currentTabId;
    const effectiveTargetName = (tabName === 'add' && state.editMode.active) ? 'edit-purchase' : tabName;

    if (tabName === currentTabId && effectiveCurrentId === effectiveTargetName) return;

    if (pushToHistory) {
        const currentDepth = VIEW_DEPTH[effectiveCurrentId] || 0;
        const newDepth = VIEW_DEPTH[effectiveTargetName] || 0;

        if (history.state && history.state.overlayLock) {
            history.replaceState({ type: 'tab', id: tabName }, "", "");
            history.pushState({ type: 'tab', id: tabName, overlayLock: true, overlayDepth: overlayNavigationLockDepth }, "", "");
        } else if (newDepth === 0) {
            history.pushState({ type: 'tab', id: tabName }, "", "");
        } else if (newDepth > currentDepth) {
            history.pushState({ type: 'tab', id: tabName }, "", "");
        } else if (newDepth === currentDepth) {
            history.replaceState({ type: 'tab', id: tabName }, "", "");
        } else if (newDepth < currentDepth && newDepth >= 1) {
            history.pushState({ type: 'tab', id: tabName }, "", "");
        } else {
            history.pushState({ type: 'tab', id: tabName }, "", "");
        }
    }
    scrollTo({ top: 0, behavior: 'instant' });
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    if (tabName !== 'add') {
        import('../views/purchase-form.js').then(m => m.stopCamera?.());
        document.getElementById('scanner-container')?.classList.add('hidden');
    }

    if (tabName === 'add') {
        setTimeout(() => {
            document.querySelectorAll('#items-container textarea.item-name').forEach(textarea => {
                textarea.dispatchEvent(new Event('input'));
            });
        }, 50);
    }

    if (tabName === 'home') {
        import('../views/dashboard.js').then(m => m.renderDashboard());
    }

    if (tabName === 'analysis') {
        import('../views/analysis.js').then(m => m.initializeLongTermBudget().catch(console.error));
    }

    if (tabName === 'special-budgets') {
        import('../views/special-budgets.js').then(m => m.renderSpecialBudgetsTab());
    }

    if (tabName === 'settings' || tabName.startsWith('settings-')) {
        import('../views/settings/categories-manager.js').then(m => m.renderCategoriesListV2?.());
        import('../views/settings/tags-manager.js').then(m => m.renderTagsManager?.());
        import('../views/settings/monthly-budget.js').then(m => {
            m.populateBudgetMonthSelector?.();
            m.renderBudgetInputs?.();
        });
        import('../views/settings/recurring-expenses.js').then(m => m.renderRecurringExpenses?.());
    }

    if (tabName === 'list') {
        import('../views/purchase-list.js').then(m => m.initPurchaseListFilters?.());
    }

    if (!(tabName === 'add' && state.editMode.active)) {
        updateNavbar(tabName);
    }
}

let overlayNavigationLockDepth = 0;
let shouldIgnoreNextOverlayLockPopstate = false;

export function getCurrentTabHistoryState() {
    const activeTab = document.querySelector('.tab-content.active');
    const currentTabId = activeTab ? activeTab.id.replace('-tab', '') : 'home';
    return { type: 'tab', id: currentTabId };
}

export function hasVisibleBlockingOverlay() {
    return Drawer.isOpen || Array.from(registeredBlockingOverlays.values()).some(overlay => {
        if (typeof overlay.isVisible !== 'function') return false;
        return overlay.isVisible();
    });
}

export function registerBlockingOverlay(id, handlers) {
    if (!id || !handlers) return () => {};
    registeredBlockingOverlays.set(id, handlers);
    return () => registeredBlockingOverlays.delete(id);
}

export function handleBlockingOverlayBackNavigation() {
    if (Drawer.isOpen && typeof Drawer.handleBackNavigation === 'function') {
        return Drawer.handleBackNavigation();
    }

    const visibleOverlays = Array.from(registeredBlockingOverlays.values())
        .filter(overlay => typeof overlay.isVisible === 'function' && overlay.isVisible());
    const topOverlay = visibleOverlays[visibleOverlays.length - 1];

    if (topOverlay && typeof topOverlay.onBack === 'function') {
        const result = topOverlay.onBack();
        return { handled: true, overlayClosed: result !== false };
    }

    return { handled: false, overlayClosed: false };
}

export function acquireOverlayNavigationLock() {
    overlayNavigationLockDepth += 1;

    const currentState = history.state;
    const baseState = currentState && currentState.type === 'tab'
        ? { type: 'tab', id: currentState.id }
        : getCurrentTabHistoryState();

    history.pushState({ ...baseState, overlayLock: true, overlayDepth: overlayNavigationLockDepth }, "", "");
}

export function pushOverlayNavigationStep() {
    const currentState = history.state;
    const baseState = currentState && currentState.type === 'tab'
        ? { type: 'tab', id: currentState.id }
        : getCurrentTabHistoryState();

    history.pushState({
        ...baseState,
        overlayLock: true,
        overlayDepth: overlayNavigationLockDepth,
        overlayStep: true
    }, "", "");
}

export function releaseOverlayNavigationLock(options = {}) {
    if (overlayNavigationLockDepth === 0) return;

    overlayNavigationLockDepth -= 1;

    if (!options.skipHistoryBack && history.state && history.state.overlayLock) {
        shouldIgnoreNextOverlayLockPopstate = true;
        history.back();
    }
}

export function reapplyOverlayNavigationLock(options = {}) {
    if (!options.force && history.state && history.state.overlayLock) return;
    const baseState = getCurrentTabHistoryState();
    history.pushState({ ...baseState, overlayLock: true, overlayDepth: overlayNavigationLockDepth }, "", "");
}

export function replaceOverlayLockWithCurrentTabState() {
    if (history.state && history.state.overlayLock) {
        history.replaceState(getCurrentTabHistoryState(), "", "");
    }
}

export function consumeOverlayLockPopstateIgnore() {
    if (!shouldIgnoreNextOverlayLockPopstate) return false;
    shouldIgnoreNextOverlayLockPopstate = false;
    return true;
}

export function restoreBodyScrollIfNeeded() {
    if (!hasVisibleBlockingOverlay()) {
        document.body.style.overflow = '';
    }
}


export function openSelectionDrawer(title, options, onSelect, selectedValue = null, layoutType = 'list', showAddBtn = false, autoClose = true, onBack = null, forceReplace = false) {
    // Rozpoznajemy czy to jest krok wewnątrz szukania kategorii/budżetu (replace) czy nowa szuflada (push)
    // Jeśli mamy onBack lub tytuł zawiera "Kategorie:", to prawdopodobnie jesteśmy w przepływie wyboru
    const lowerTitle = title.toLowerCase();
    const isReplacing = Drawer.isOpen && (forceReplace ||
        lowerTitle.includes('kategorie:') || 
        lowerTitle.includes('wybierz kategorię') && Drawer.current?.opts.title.toLowerCase().includes('kategorie:') ||
        lowerTitle.includes('budżet') && Drawer.current?.opts.title.toLowerCase().includes('budżet')
    );

    if (isReplacing && typeof onBack === 'function') {
        pushOverlayNavigationStep();
    }

    const buildContent = () => {
        const wrapper = document.createElement('div');
        wrapper.className = 'selection-drawer-wrapper';

        const searchHtml = options.length > 5 ? `
            <div class="mb-4">
                <input type="text" id="u-selection-search" class="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:border-brand-500 focus:bg-white/10 transition-all outline-none" placeholder="Wyszukaj...">
            </div>
        ` : '';

        const gridHtml = `<div id="u-selection-grid" class="${layoutType === 'grid' ? 'drawer-grid-layout' : 'drawer-list-layout'}"></div>`;

        const addBtnHtml = showAddBtn ? `
            <div class="mt-6 border-t border-white/5 pt-4">
                <button id="u-selection-add-btn" class="w-full py-4 px-4 bg-white/5 border border-dashed border-white/20 rounded-2xl text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center space-x-2">
                    <i class="fas fa-cog"></i>
                    <span>Zarządzaj kategoriami</span>
                </button>
            </div>
        ` : '';

        wrapper.innerHTML = searchHtml + gridHtml + addBtnHtml;
        return wrapper;
    };

    const drawerObj = Drawer.open({
        title,
        content: buildContent(),
        size: 'lg',
        onBack: onBack,
        showCloseBtn: true
    }, isReplacing);

    const panel = drawerObj.panel;
    const grid = panel.querySelector('#u-selection-grid');
    const searchInput = panel.querySelector('#u-selection-search');
    const addBtn = panel.querySelector('#u-selection-add-btn');

    const renderOptions = (filterText = '') => {
        if (!grid) return;
        grid.innerHTML = '';
        const lowFilter = filterText.toLowerCase();
        
        const filtered = options.filter(opt => {
            const matchesMain = opt.label.toLowerCase().includes(lowFilter);
            if (matchesMain) return true;

            // Logika wyszukiwania w podkategoriach gdy jesteśmy w widoku kategorii głównych
            if (lowerTitle.includes('kategori') && !lowerTitle.includes(':')) {
                const parent = state.structuredCategories.find(c => c.name === opt.label && !c.parentId);
                if (parent) {
                    return state.structuredCategories.some(c => c.parentId === parent.id && c.name.toLowerCase().includes(lowFilter));
                }
            }
            return false;
        });

        filtered.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'category-drawer-item';
            if (selectedValue === opt.value) item.classList.add('active');

            if (layoutType === 'grid') {
                const iconWrapper = document.createElement('div');
                iconWrapper.className = 'category-icon-wrapper';
                iconWrapper.style.backgroundColor = opt.color ? (opt.color + '25') : 'rgba(255, 255, 255, 0.1)';
                iconWrapper.style.color = opt.color || 'white';
                iconWrapper.style.border = `1px solid ${opt.color ? opt.color + '40' : 'rgba(255,255,255,0.1)'}`;
                iconWrapper.innerHTML = opt.icon || '<span>?</span>';
                item.appendChild(iconWrapper);
            }

            const nameLabel = document.createElement('div');
            nameLabel.className = 'category-name-label';
            nameLabel.textContent = opt.label;
            item.appendChild(nameLabel);

            item.onclick = (e) => {
                e.stopPropagation();
                onSelect(opt.value, opt.label);
                if (autoClose) Drawer.close();
            };
            grid.appendChild(item);
        });
        
        if (filtered.length === 0) {
            grid.innerHTML = '<div class="text-center py-8 text-gray-500 text-sm">Nie znaleziono...</div>';
        }
    };

    if (searchInput) {
        searchInput.oninput = (e) => renderOptions(e.target.value);
    }
    if (addBtn) {
        addBtn.onclick = (e) => {
            e.stopPropagation();
            navigateToCategoryManagementFromDrawer();
        };
    }

    renderOptions();
}

export function closeSelectionDrawer() {
    Drawer.close();
}

/**
 * Renderuje szufladę ze szczegółami wydatków w danej kategorii.
 * Współdzielona między Kokpitem a widokiem Analizy.
 */
export function renderCategoryDetailsModal(category, items, isSubCategoryView = false) {
    const title = category.charAt(0).toUpperCase() + category.slice(1);
    const subtitle = 'Wydatki z wybranego miesiąca';
    let content = '';

    if (items.length === 0) {
        content = '<div class="text-center py-6 text-gray-500 text-sm">Brak wydatków w tym okresie.</div>';
    } else {
        if (!isSubCategoryView) {
            const bySub = {};
            items.forEach(item => {
                const sub = item.subCategory || 'Inne';
                bySub[sub] = (bySub[sub] || 0) + (item.price || 0);
            });

            const sortedSub = Object.entries(bySub).sort((a, b) => b[1] - a[1]);
            if (sortedSub.length > 1 || (sortedSub.length === 1 && sortedSub[0][0] !== 'Inne')) {
                content += `
                    <div class="mb-4 space-y-2">
                        <p class="text-[10px] text-gray-500 uppercase tracking-widest font-bold ml-1 mb-2">Podział na podkategorie</p>
                        <div class="grid grid-cols-2 gap-2">
                            ${sortedSub.map(([sub, amount]) => `
                                <div class="bg-white/5 border border-white/10 rounded-xl p-2 px-3">
                                    <p class="text-[10px] text-gray-400 truncate">${sub}</p>
                                    <p class="text-sm font-bold text-white">${formatAmount(amount).replace(' zł', '').replace(' zl', '')}</p>
                                </div>
                            `).join('')}
                        </div>
                        <hr class="border-white/5 mt-4">
                    </div>
                `;
            }
        }

        items.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
        
        const listItems = items.map(item => {
            let dateStr = item.purchaseDate;
            try {
                const parts = item.purchaseDate.split('-');
                if (parts.length === 3) {
                    const d = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
                    dateStr = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
                }
            } catch (e) {}

            const subLabel = item.subCategory ? `<span class="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 mr-2">${item.subCategory}</span>` : '';
            return `
                <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 mb-2">
                    <div class="flex flex-col overflow-hidden mr-3">
                        <span class="text-sm font-medium text-white truncate w-full">${item.name}</span>
                        <div class="flex items-center text-xs text-gray-400 mt-1 space-x-2">
                            ${isSubCategoryView ? '' : subLabel}
                            <span class="truncate max-w-[80px]">${item.shop || 'Inny'}</span>
                            <span>*</span>
                            <span>${dateStr}</span>
                        </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                        <span class="text-sm font-bold text-white">${formatAmount(item.price || 0)}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        content += `<div class="space-y-2 pb-safe">${listItems}</div>`;
    }

    Drawer.open({
        title,
        content: `
            <p class="text-xs text-gray-400 mt-0.5 mb-4 -translate-y-2">${subtitle}</p>
            ${content}
        `,
        size: 'md',
        showCloseBtn: true,
        closeOnBackdrop: true
    });
}

export function navigateToCategoryManagementFromDrawer() {
    Drawer.closeAll({ skipHistoryBack: true });
    replaceOverlayLockWithCurrentTabState();
    switchTab('settings-categories');
}

export function navigateToTagManagementFromDrawer() {
    Drawer.closeAll({ skipHistoryBack: true });
    replaceOverlayLockWithCurrentTabState();
    switchTab('settings-tags');
}

document.addEventListener('DOMContentLoaded', () => {
    const currentTab = document.querySelector('.bottom-nav-btn.active')?.dataset.tab || 'home';
    updateNavbar(currentTab);

    // Globalny listener zmiany rozmiaru okna (np. obrót telefonu)
    let resizeTimer;
    addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const activeTab = document.querySelector('.tab-content.active');
            if (!activeTab) return;

            const tabId = activeTab.id.replace('-tab', '');

            // Odśwież wykresy w zależności od aktywnej zakładki
            if (tabId === 'home') {
                import('../views/dashboard.js').then(m => m.renderDashboard());
            } else if (tabId === 'analysis') {
                import('../views/analysis.js').then(m => m.renderUnifiedComparisonChart().catch(console.error));
            }
        }, 300); // 300ms opóźnienia, aby poczekać na zakończenie animacji obrotu
    });
});
