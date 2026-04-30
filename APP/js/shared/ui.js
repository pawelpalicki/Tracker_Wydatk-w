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
 */
import state from '../core/state.js';

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
    'settings-categories': 'Zarządzaj kategoriami',
    'settings-budget': 'Miesięczny Budżet',
    'settings-special': 'Zarządzaj budżetami',
    'settings-recurring': 'Stałe Opłaty',
};

const TABS_WITH_BACK = ['special-budgets', 'settings', 'settings-categories', 'settings-budget', 'settings-special', 'settings-recurring'];

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

        if (newDepth === 0) {
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
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    if (tabName !== 'add') {
        if (typeof window.exitEditMode === 'function') window.exitEditMode();
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
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }

    if (tabName === 'analysis') {
        if (typeof window.initializeLongTermBudget === 'function') {
            window.initializeLongTermBudget().catch(console.error);
        }
    }

    if (tabName === 'special-budgets') {
        if (typeof window.renderSpecialBudgetsTab === 'function') window.renderSpecialBudgetsTab();
    }

    if (tabName === 'settings' || tabName.startsWith('settings-')) {
        if (typeof window.renderCategoriesListV2 === 'function') {
            window.renderCategoriesListV2();
            if (typeof window.renderTagsManager === 'function') window.renderTagsManager();
        }
        if (typeof window.populateBudgetMonthSelector === 'function') window.populateBudgetMonthSelector();
        if (typeof window.renderBudgetInputs === 'function') window.renderBudgetInputs();
        if (typeof window.renderRecurringExpenses === 'function') window.renderRecurringExpenses();
    }

    if (tabName === 'list') {
        if (typeof window.initFilterDrawers === 'function') window.initFilterDrawers();
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
    return !!document.querySelector(`
        #filter-drawer-overlay.active,
        #category-drawer-overlay.active,
        #category-details-drawer-overlay.active,
        #product-drawer-overlay.active,
        #tags-selection-overlay.active,
        #category-editor-drawer-overlay.active,
        #copy-budget-modal:not(.hidden),
        #edit-special-budget-modal:not(.hidden),
        #tag-form-modal:not(.hidden),
        #tag-group-modal:not(.hidden)
    `);
}

export function acquireOverlayNavigationLock() {
    overlayNavigationLockDepth += 1;
    if (overlayNavigationLockDepth > 1) return;

    const currentState = history.state;
    const baseState = currentState && currentState.type === 'tab'
        ? { type: 'tab', id: currentState.id }
        : getCurrentTabHistoryState();

    history.pushState({ ...baseState, overlayLock: true }, "", "");
}

export function releaseOverlayNavigationLock() {
    if (overlayNavigationLockDepth === 0) return;

    overlayNavigationLockDepth -= 1;
    if (overlayNavigationLockDepth > 0) return;

    if (history.state && history.state.overlayLock) {
        shouldIgnoreNextOverlayLockPopstate = true;
        history.back();
    }
}

export function reapplyOverlayNavigationLock() {
    const baseState = getCurrentTabHistoryState();
    history.pushState({ ...baseState, overlayLock: true }, "", "");
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

export function openDrawer(drawerId, overlayId) {
    const drawer = document.getElementById(drawerId);
    const overlay = document.getElementById(overlayId);
    if (!drawer || !overlay) return;

    const wasAlreadyOpen = overlay.classList.contains('active') || !overlay.classList.contains('hidden');
    if (!wasAlreadyOpen) {
        acquireOverlayNavigationLock();
    }
    drawer.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        drawer.classList.add('active');
        overlay.classList.add('active');
    }, 10);
}

export function closeDrawer(drawerId, overlayId) {
    const drawer = document.getElementById(drawerId);
    const overlay = document.getElementById(overlayId);
    if (!drawer || !overlay) return;

    releaseOverlayNavigationLock();
    drawer.classList.remove('active');
    overlay.classList.remove('active');

    setTimeout(() => {
        drawer.classList.add('hidden');
        overlay.classList.add('hidden');
        restoreBodyScrollIfNeeded();
    }, 300);
}

export function openOverlay(elementId) {
    const el = document.getElementById(elementId);
    const overlay = document.getElementById(elementId + '-overlay');
    if (!el) return;

    const wasAlreadyOpen = el.classList.contains('active') || !el.classList.contains('hidden');
    if (!wasAlreadyOpen) {
        acquireOverlayNavigationLock();
    }
    el.classList.remove('hidden');
    if (overlay) overlay.classList.remove('hidden');

    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        el.classList.add('active');
        if (overlay) overlay.classList.add('active');
    }, 10);
}

export function closeOverlay(elementId) {
    const el = document.getElementById(elementId);
    const overlay = document.getElementById(elementId + '-overlay');
    if (!el) return;

    releaseOverlayNavigationLock();
    el.classList.remove('active');
    if (overlay) overlay.classList.remove('active');

    setTimeout(() => {
        el.classList.add('hidden');
        if (overlay) overlay.classList.add('hidden');
        restoreBodyScrollIfNeeded();
    }, 300);
}



export function openSelectionDrawer(title, options, onSelect, selectedValue = null, layoutType = 'list', showAddBtn = false, autoClose = true, onBack = null) {
    const overlay = document.getElementById('category-drawer-overlay');
    const drawer = document.getElementById('category-drawer');
    const titleEl = document.getElementById('category-drawer-title');
    const searchInput = document.getElementById('drawer-search-input');
    const searchContainer = document.getElementById('drawer-search-container');
    const addBtn = document.getElementById('add-category-drawer-btn');
    const addForm = document.getElementById('new-category-drawer-form');
    const backBtn = document.getElementById('category-drawer-back-btn');
    const closeBtn = document.getElementById('close-category-drawer');

    if (!overlay || !drawer) return;

    window.currentOnSelect = (...args) => {
        onSelect(...args);
        if (autoClose) closeSelectionDrawer();
    };

    if (addBtn) addBtn.classList.remove('hidden');
    if (addForm) addForm.classList.add('hidden');
    if (searchInput) searchInput.value = '';

    if (backBtn) {
        if (onBack) {
            backBtn.classList.remove('hidden');
            backBtn.onclick = (e) => {
                e.stopPropagation();
                onBack();
            };
        } else {
            backBtn.classList.add('hidden');
        }
    }

    const handleClose = () => closeSelectionDrawer();
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            handleClose();
        };
    }
    if (overlay) {
        overlay.onclick = (e) => {
            if (e.target === overlay) handleClose();
        };
    }

    if (searchContainer) {
        if (options.length > 5) {
            searchContainer.classList.remove('hidden');
        } else {
            searchContainer.classList.add('hidden');
        }
    }

    if (addBtn) {
        if (showAddBtn) {
            addBtn.classList.remove('hidden');
            addBtn.onclick = (e) => {
                e.stopPropagation();
                navigateToCategoryManagementFromDrawer();
            };
        } else {
            addBtn.classList.add('hidden');
            addBtn.onclick = null;
        }
    }

    if (titleEl) titleEl.textContent = title;

    const grid = document.getElementById('category-drawer-grid');
    if (!grid) return;

    grid.classList.remove('drawer-grid-layout', 'drawer-list-layout');
    grid.classList.add(layoutType === 'grid' ? 'drawer-grid-layout' : 'drawer-list-layout');

    const renderOptions = (filterText = '') => {
        grid.innerHTML = '';
        
        let filtered = options;
        if (filterText.length > 0) {
            const lowFilter = filterText.toLowerCase();
            filtered = options.filter(opt => {
                const matchesMain = opt.label.toLowerCase().includes(lowFilter);
                if (matchesMain) return true;
                
                if (title.toLowerCase().includes('kategori')) {
                    const parent = state.structuredCategories.find(c => c.name === opt.label && !c.parentId);
                    if (parent) {
                        return state.structuredCategories.some(c => c.parentId === parent.id && c.name.toLowerCase().includes(lowFilter));
                    }
                }
                return false;
            });
        }

        if (addBtn && title.toLowerCase().includes('kategori')) {
            if (filterText.length > 0) {
                addBtn.classList.add('hidden');
            } else {
                addBtn.classList.remove('hidden');
            }
        }

        filtered.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'category-drawer-item';
            if (selectedValue === opt.value) item.classList.add('active');

            if (layoutType === 'grid') {
                const iconWrapper = document.createElement('div');
                iconWrapper.className = 'category-icon-wrapper';
                iconWrapper.style.backgroundColor = opt.color ? (opt.color + '44') : 'rgba(255, 255, 255, 0.1)';
                iconWrapper.style.color = opt.color || 'white';
                iconWrapper.style.filter = opt.color ? `drop-shadow(0 0 5px ${opt.color}88)` : 'none';
                iconWrapper.style.border = `1px solid ${opt.color ? opt.color + '66' : 'rgba(255,255,255,0.2)'}`;
                iconWrapper.innerHTML = opt.icon || '<span>?</span>';
                item.appendChild(iconWrapper);
            }

            const nameLabel = document.createElement('div');
            nameLabel.className = 'category-name-label';
            nameLabel.textContent = opt.label;
            item.appendChild(nameLabel);

            item.onclick = () => {
                onSelect(opt.value, opt.label);
                if (autoClose) closeSelectionDrawer();
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

    renderOptions();

    openDrawer('category-drawer', 'category-drawer-overlay');
}

export function closeSelectionDrawer() {
    closeDrawer('category-drawer', 'category-drawer-overlay');
}

export function navigateToCategoryManagementFromDrawer() {
    const filterDrawerOverlay = document.getElementById('filter-drawer-overlay');
    if (filterDrawerOverlay && filterDrawerOverlay.classList.contains('active')) {
        window.closeFilterDrawer?.();
    }

    const productDrawerOverlay = document.getElementById('product-drawer-overlay');
    if (productDrawerOverlay && productDrawerOverlay.classList.contains('active')) {
        if (typeof window.closeProductDrawer === 'function') {
            window.closeProductDrawer();
        }
    }

    closeSelectionDrawer();
    switchTab('settings-categories');
}

document.addEventListener('DOMContentLoaded', () => {
    const currentTab = document.querySelector('.bottom-nav-btn.active')?.dataset.tab || 'home';
    updateNavbar(currentTab);
});
