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
    scrollTo({ top: 0, behavior: 'instant' });
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    if (tabName !== 'add') {
        import('../views/purchase-form.js').then(m => m.exitEditMode?.());
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

    if (addBtn) addBtn.classList.remove('hidden');
    if (addForm) addForm.classList.add('hidden');
    if (searchInput) searchInput.value = '';

    if (backBtn) {
        if (onBack) {
            backBtn.classList.remove('hidden');
            backBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                onBack();
            });
        } else {
            backBtn.classList.add('hidden');
        }
    }

    const handleClose = () => closeSelectionDrawer();
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleClose();
        });
    }
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) handleClose();
        });
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
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateToCategoryManagementFromDrawer();
            });
        } else {
            addBtn.classList.add('hidden');
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

            item.addEventListener('click', () => {
                onSelect(opt.value, opt.label);
                if (autoClose) closeSelectionDrawer();
            });

            grid.appendChild(item);
        });

        if (filtered.length === 0) {
            grid.innerHTML = '<div class="text-center py-8 text-gray-500 text-sm">Nie znaleziono...</div>';
        }
    };

    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderOptions(e.target.value));
    }

    renderOptions();

    openDrawer('category-drawer', 'category-drawer-overlay');
}

export function closeSelectionDrawer() {
    closeDrawer('category-drawer', 'category-drawer-overlay');
}

/**
 * Renderuje szufladę ze szczegółami wydatków w danej kategorii.
 * Współdzielona między Kokpitem a widokiem Analizy.
 */
export function renderCategoryDetailsModal(category, items, isSubCategoryView = false) {
    const listContainer = document.getElementById('category-details-list');
    const titleEl = document.getElementById('category-details-title');
    if (!listContainer || !titleEl) return;

    titleEl.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    listContainer.innerHTML = '';

    if (items.length === 0) {
        listContainer.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">Brak wydatków w tym okresie.</div>';
    } else {
        if (!isSubCategoryView) {
            const bySub = {};
            items.forEach(item => {
                const sub = item.subCategory || 'Inne';
                bySub[sub] = (bySub[sub] || 0) + (item.price || 0);
            });

            const sortedSub = Object.entries(bySub).sort((a, b) => b[1] - a[1]);
            if (sortedSub.length > 1 || (sortedSub.length === 1 && sortedSub[0][0] !== 'Inne')) {
                const breakdown = document.createElement('div');
                breakdown.className = 'mb-4 space-y-2';
                breakdown.innerHTML = `
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
                `;
                listContainer.appendChild(breakdown);
            }
        }

        items.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
        items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 mb-2';

            let dateStr = item.purchaseDate;
            try {
                const parts = item.purchaseDate.split('-');
                if (parts.length === 3) {
                    const d = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
                    dateStr = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
                }
            } catch (e) {}

            const subLabel = item.subCategory ? `<span class="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 mr-2">${item.subCategory}</span>` : '';
            itemEl.innerHTML = `
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
            `;
            listContainer.appendChild(itemEl);
        });
    }

    const drawer = document.getElementById('category-details-drawer');
    const overlay = document.getElementById('category-details-drawer-overlay');
    const closeBtn = document.getElementById('close-category-details-drawer');
    if (!drawer || !overlay) return;

    const handleClose = () => closeCategoryDetailsDrawer();
    const wasAlreadyOpen = overlay.classList.contains('active') || !overlay.classList.contains('hidden');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleClose();
        });
    }
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) handleClose();
    });

    drawer.classList.remove('hidden');
    overlay.classList.remove('hidden');
    if (!wasAlreadyOpen) acquireOverlayNavigationLock();
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        drawer.classList.add('active');
        overlay.classList.add('active');
    }, 10);
}

export function closeCategoryDetailsDrawer() {
    closeDrawer('category-details-drawer', 'category-details-drawer-overlay');
}

export function navigateToCategoryManagementFromDrawer() {
    const filterDrawerOverlay = document.getElementById('filter-drawer-overlay');
    if (filterDrawerOverlay && filterDrawerOverlay.classList.contains('active')) {
        import('../views/purchase-list.js').then(m => m.closeFilterDrawer?.());
    }

    const productDrawerOverlay = document.getElementById('product-drawer-overlay');
    if (productDrawerOverlay && productDrawerOverlay.classList.contains('active')) {
        import('../views/purchase-form.js').then(m => m.closeProductDrawer?.());
    }

    closeSelectionDrawer();
    switchTab('settings-categories');
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
