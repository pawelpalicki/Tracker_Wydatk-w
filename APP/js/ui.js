// Tracker Wydatków - UI Functions

// Standardowy format waluty: "1 234,56 zł"
function formatAmount(amount) {
    if (amount === undefined || amount === null) amount = 0;
    // Formatujemy liczbę ręcznie
    const parts = amount.toFixed(2).split('.');
    // Wstawiamy zwykłą spację co 3 cyfry dla 100% widoczności
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join(',') + ' zł';
}

// --- Hierarchia widoków dla nawigacji ---
const VIEW_DEPTH = {
    'home': 0,
    'list': 1,
    'add': 1,
    'analysis': 1,
    'special-budgets': 2,
    'more': 1,
    'settings': 2,
    'edit-purchase': 2, // Wirtualna zakładka dla edycji (głębiej niż lista)
    'settings-categories': 3,
    'settings-budget': 3,
    'settings-special': 3,
    'settings-recurring': 3
};

// --- Nawigacja i zakładki ---
function switchTab(tabName, pushToHistory = true) {
    const activeTab = document.querySelector('.tab-content.active');
    const currentTabId = activeTab ? activeTab.id.replace('-tab', '') : '';

    // Jeśli jesteśmy w trybie edycji, traktujemy obecny widok jako 'edit-purchase' dla potrzeb historii
    const effectiveCurrentId = (currentTabId === 'add' && editMode.active) ? 'edit-purchase' : currentTabId;
    // Jeśli idziemy do 'add' w trybie edycji, traktujemy cel jako 'edit-purchase'
    const effectiveTargetName = (tabName === 'add' && editMode.active) ? 'edit-purchase' : tabName;

    if (tabName === currentTabId && effectiveCurrentId === effectiveTargetName) return;

    if (pushToHistory) {
        const currentDepth = VIEW_DEPTH[effectiveCurrentId] || 0;
        const newDepth = VIEW_DEPTH[effectiveTargetName] || 0;

        if (newDepth === 0) {
            history.pushState({ type: 'tab', id: tabName }, "", "");
        } else if (newDepth > currentDepth) {
            // Wchodzimy głębiej (np. list -> edit-purchase) - PUSH
            history.pushState({ type: 'tab', id: tabName }, "", "");
        } else if (newDepth === currentDepth) {
            // Ten sam poziom - REPLACE
            history.replaceState({ type: 'tab', id: tabName }, "", "");
        } else if (newDepth < currentDepth && newDepth >= 1) {
            // Powrót wyżej - PUSH (aby stworzyć punkt powrotu w historii)
            history.pushState({ type: 'tab', id: tabName }, "", "");
        } else {
            history.pushState({ type: 'tab', id: tabName }, "", "");
        }
    }
    // Reset scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });
    // Update bottom nav buttons
    document.querySelectorAll('.bottom-nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));

    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    if (tabName !== 'add') {
        exitEditMode();
        // Hide scanner when leaving add tab
        document.getElementById('scanner-container')?.classList.add('hidden');
    }

    if (tabName === 'add') {
        // Trigger resize for textareas that might have been rendered while hidden
        setTimeout(() => {
            document.querySelectorAll('#items-container textarea.item-name').forEach(textarea => {
                textarea.dispatchEvent(new Event('input'));
            });
        }, 50);
    }

    if (tabName === 'home') {
        if (typeof renderDashboard === 'function') renderDashboard();
    }

    if (tabName === 'analysis') {
        if (typeof initializeLongTermBudget === 'function') {
            initializeLongTermBudget().catch(console.error);
        }
    }

    if (tabName === 'special-budgets') {
        renderSpecialBudgetsTab();
    }

    // Settings sub-tabs logic
    if (tabName === 'settings' || tabName.startsWith('settings-')) {
        if (typeof renderCategoriesListV2 === 'function') {
            renderCategoriesListV2();
            if (typeof renderTagsManager === 'function') renderTagsManager();
        }
        populateBudgetMonthSelector();
        renderBudgetInputs();
        renderRecurringExpenses();
    }

    if (tabName === 'list') {
        initFilterDrawers();
    }

    // Dodaj aktualizację Navbaru przy każdej zmianie zakładki
    // (ale nie gdy jesteśmy w trybie edycji na tab 'add')
    if (!(tabName === 'add' && editMode.active)) {
        updateNavbar(tabName);
    }
}

// Ustaw początkowy tytuł po załadowaniu DOM
document.addEventListener('DOMContentLoaded', () => {
    const currentTab = document.querySelector('.bottom-nav-btn.active')?.dataset.tab || 'home';
    updateNavbar(currentTab);
});

// --- Dynamic Navbar ---
const NAV_TITLES = {
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

function updateNavbar(tabName) {
    const title = document.getElementById('nav-title');
    const backBtn = document.getElementById('nav-back-btn');
    if (!title) return;

    title.textContent = NAV_TITLES[tabName] || tabName;

    const showBack = TABS_WITH_BACK.includes(tabName);
    if (backBtn) backBtn.classList.toggle('hidden', !showBack);
}

function initFilterDrawers() {
    const categoryBtn = document.getElementById('filter-category-btn');
    if (categoryBtn) {
        categoryBtn.onclick = () => {
                openHierarchicalCategoryDrawer(
                    null,
                    typeof filterCategoryValue !== 'undefined' ? filterCategoryValue : '',
                    typeof filterSubCategoryValue !== 'undefined' ? filterSubCategoryValue : '',
                    (pName, sName) => {
                        if (typeof filterCategoryValue !== 'undefined') filterCategoryValue = pName || '';
                        if (typeof filterSubCategoryValue !== 'undefined') filterSubCategoryValue = sName || '';
                        const labelText = pName ? (sName ? `${pName} / ${sName}` : pName) : 'Kategoria';
                        document.getElementById('filter-category-label').textContent = labelText;
                        setFilterButtonState(categoryBtn, categoryClear, !!pName);
                        if (typeof handleFilterChange === 'function') handleFilterChange();
                    }
                );
        };
    }

    const budgetBtn = document.getElementById('filter-budget-btn');
    if (budgetBtn) {
        budgetBtn.onclick = () => {
            const options = [
                { value: '', label: 'Wszystkie budżety' },
                { value: 'monthly', label: 'Budżet miesięczny' }
            ];
            if (typeof allSpecialBudgets !== 'undefined') {
                allSpecialBudgets.forEach(b => options.push({ value: b.id, label: b.name }));
            }
            const currentVal = typeof filterBudgetValue !== 'undefined' ? filterBudgetValue : '';
            openSelectionDrawer('Wybierz budżet', options, (val, label) => {
                if (typeof filterBudgetValue !== 'undefined') filterBudgetValue = val;
                document.getElementById('filter-budget-label').textContent = val ? label : 'Budżet';
                setFilterButtonState(budgetBtn, budgetClear, !!val);
                if (typeof handleFilterChange === 'function') handleFilterChange();
            }, currentVal);
        };
    }

    const shopBtn = document.getElementById('filter-shop-btn');
    if (shopBtn) {
        shopBtn.onclick = () => {
            const options = [{ value: '', label: 'Wszystkie sklepy' }];
            if (typeof allShops !== 'undefined') {
                allShops.forEach(shop => options.push({ value: shop, label: shop }));
            }
            const currentVal = typeof filterShopValue !== 'undefined' ? filterShopValue : '';
            openSelectionDrawer('Wybierz sklep', options, (val, label) => {
                if (typeof filterShopValue !== 'undefined') filterShopValue = val;
                document.getElementById('filter-shop-label').textContent = val ? label : 'Sklep';
                setFilterButtonState(shopBtn, shopClear, !!val);
                if (typeof handleFilterChange === 'function') handleFilterChange();
            }, currentVal);
        };
    }

    const dateBtn = document.getElementById('filter-date-btn');
    if (dateBtn) {
        dateBtn.onclick = () => {
            openFilterDrawer('Wybierz zakres dat', 'date', () => {
                const start = document.getElementById('filter-date-start').value;
                const end = document.getElementById('filter-date-end').value;
                const active = !!(start || end);
                document.getElementById('filter-date-label').textContent = active ? 'Data (ustawiona)' : 'Data';
                setFilterButtonState(dateBtn, dateClear, active);
                if (typeof handleFilterChange === 'function') handleFilterChange();
            });
        };
    }

    const amountBtn = document.getElementById('filter-amount-btn');
    const categoryClear = categoryBtn?.querySelector('.filter-clear');
    const budgetClear = budgetBtn?.querySelector('.filter-clear');
    const shopClear = shopBtn?.querySelector('.filter-clear');
    const dateClear = dateBtn?.querySelector('.filter-clear');
    const amountClear = amountBtn?.querySelector('.filter-clear');

    const setFilterButtonState = (btn, clearEl, active) => {
        if (!btn) return;
        btn.classList.toggle('border-brand-500/50', active);
        btn.classList.toggle('bg-brand-500/10', active);
        clearEl?.classList.toggle('hidden', !active);
    };

    const clearFilterValue = (type) => {
        if (type === 'category') {
            filterCategoryValue = '';
            if (typeof filterSubCategoryValue !== 'undefined') filterSubCategoryValue = '';
            document.getElementById('filter-category-label').textContent = 'Kategoria';
            setFilterButtonState(categoryBtn, categoryClear, false);
        } else if (type === 'budget') {
            filterBudgetValue = '';
            document.getElementById('filter-budget-label').textContent = 'Budżet';
            setFilterButtonState(budgetBtn, budgetClear, false);
        } else if (type === 'shop') {
            filterShopValue = '';
            document.getElementById('filter-shop-label').textContent = 'Sklep';
            setFilterButtonState(shopBtn, shopClear, false);
        } else if (type === 'date') {
            filterDateStart.value = '';
            filterDateEnd.value = '';
            document.getElementById('filter-date-label').textContent = 'Data';
            setFilterButtonState(dateBtn, dateClear, false);
        } else if (type === 'amount') {
            filterMinAmount.value = '';
            filterMaxAmount.value = '';
            document.getElementById('filter-amount-label').textContent = 'Kwota';
            setFilterButtonState(amountBtn, amountClear, false);
        }
        if (typeof handleFilterChange === 'function') handleFilterChange();
    };

    const addClearHandler = (clearEl, type) => {
        clearEl?.addEventListener('click', (e) => {
            e.stopPropagation();
            clearFilterValue(type);
        });
    };

    addClearHandler(categoryClear, 'category');
    addClearHandler(budgetClear, 'budget');
    addClearHandler(shopClear, 'shop');
    addClearHandler(dateClear, 'date');
    addClearHandler(amountClear, 'amount');

    if (amountBtn) {
        amountBtn.onclick = () => {
            openFilterDrawer('Wybierz zakres kwot', 'amount', () => {
                const min = document.getElementById('filter-min-amount').value;
                const max = document.getElementById('filter-max-amount').value;
                const active = !!(min || max);
                document.getElementById('filter-amount-label').textContent = active ? 'Kwota (ustawiona)' : 'Kwota';
                setFilterButtonState(amountBtn, amountClear, active);
                if (typeof handleFilterChange === 'function') handleFilterChange();
            });
        };
    }

    const keywordInput = document.getElementById('filter-keyword');
    if (keywordInput) {
        keywordInput.oninput = () => {
            if (typeof handleFilterChange === 'function') handleFilterChange();
        };
    }

    const clearBtn = document.getElementById('clear-filters-btn');
    if (clearBtn) {
        clearBtn.onclick = () => {
            if (keywordInput) keywordInput.value = '';
            if (typeof filterCategoryValue !== 'undefined') filterCategoryValue = '';
            if (typeof filterSubCategoryValue !== 'undefined') filterSubCategoryValue = '';
            if (typeof filterBudgetValue !== 'undefined') filterBudgetValue = '';
            if (typeof filterShopValue !== 'undefined') filterShopValue = '';
            
            const start = document.getElementById('filter-date-start');
            const end = document.getElementById('filter-date-end');
            const min = document.getElementById('filter-min-amount');
            const max = document.getElementById('filter-max-amount');
            
            if (start) start.value = '';
            if (end) end.value = '';
            if (min) min.value = '';
            if (max) max.value = '';

            // Reset labels and styles
            const labels = {
                'filter-category-label': 'Kategoria',
                'filter-budget-label': 'Budżet',
                'filter-shop-label': 'Sklep',
                'filter-date-label': 'Data',
                'filter-amount-label': 'Kwota'
            };

            for (const [id, text] of Object.entries(labels)) {
                const el = document.getElementById(id);
                if (el) el.textContent = text;
                const btn = el.parentElement;
                if (btn) {
                    btn.classList.remove('border-brand-500/50', 'bg-brand-500/10');
                }
            }

            document.querySelectorAll('.filter-clear').forEach(el => el.classList.add('hidden'));

            if (typeof handleFilterChange === 'function') handleFilterChange();
        };
    }
}

function getParentCategoryByName(parentName) {
    if (!parentName || typeof structuredCategories === 'undefined' || !Array.isArray(structuredCategories)) {
        return null;
    }
    return structuredCategories.find(category => category.name === parentName && !category.parentId) || null;
}

function getSubCategoryByName(parentName, subCategoryName) {
    if (!subCategoryName) return null;
    const parentCategory = getParentCategoryByName(parentName);
    if (!parentCategory || typeof structuredCategories === 'undefined' || !Array.isArray(structuredCategories)) {
        return null;
    }
    return structuredCategories.find(category => category.name === subCategoryName && category.parentId === parentCategory.id) || null;
}

function getCategorySelectionState(parentName = '', subCategoryName = '', fallbackLabel = 'Wybierz kategorię') {
    const safeParentName = parentName || '';
    const safeSubCategoryName = subCategoryName || '';
    const parentCategory = getParentCategoryByName(safeParentName);
    const subCategory = getSubCategoryByName(safeParentName, safeSubCategoryName);
    const iconName =
        (subCategory && subCategory.icon) ||
        (parentCategory && parentCategory.icon) ||
        ((typeof categoryIcons !== 'undefined' && safeParentName) ? categoryIcons[safeParentName.toLowerCase()] : null) ||
        'fa-tag';
    const color =
        (parentCategory && parentCategory.color) ||
        (typeof getCategoryColor === 'function' && safeParentName ? getCategoryColor(safeParentName) : '#6b7280');

    return {
        parentName: safeParentName,
        subCategoryName: safeSubCategoryName,
        parentCategory,
        subCategory,
        iconName,
        color,
        labelText: safeParentName ? (safeSubCategoryName ? `${safeParentName} / ${safeSubCategoryName}` : safeParentName) : fallbackLabel,
        compositeValue: safeSubCategoryName ? `${safeParentName}|${safeSubCategoryName}` : safeParentName
    };
}

function applyCategorySelectionState(targets = {}, parentName = '', subCategoryName = '', fallbackLabel = 'Wybierz kategorię') {
    const state = getCategorySelectionState(parentName, subCategoryName, fallbackLabel);
    const { labelEl, iconEl, valueEl, buttonEl } = targets;

    if (labelEl) {
        labelEl.textContent = state.labelText;
    }

    if (valueEl) {
        valueEl.value = state.compositeValue;
    }

    if (buttonEl) {
        buttonEl.dataset.value = state.compositeValue;
    }

    if (iconEl) {
        iconEl.innerHTML = `<i class="fas ${state.iconName}"></i>`;
        iconEl.style.color = state.color;
        if (iconEl.classList.contains('rounded-xl') || iconEl.classList.contains('rounded-lg') || iconEl.classList.contains('rounded-full')) {
            iconEl.style.backgroundColor = `${state.color}20`;
        }
    }

    return state;
}

function openFilterDrawer(title, type, onApply) {
    const overlay = document.getElementById('filter-drawer-overlay');
    const drawer = document.getElementById('filter-drawer');
    const titleEl = document.getElementById('filter-drawer-title');
    const content = document.getElementById('filter-drawer-content');
    const applyBtn = document.getElementById('filter-drawer-apply-btn');
    const closeBtn = document.getElementById('close-filter-drawer');

    if (!overlay || !drawer || !content) return;

    titleEl.textContent = title;
    content.innerHTML = '';

    if (type === 'date') {
        const startVal = document.getElementById('filter-date-start').value;
        const endVal = document.getElementById('filter-date-end').value;
        content.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Data od</label>
                    <input type="date" id="drawer-date-start" value="${startVal}"
                        class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Data do</label>
                    <input type="date" id="drawer-date-end" value="${endVal}"
                        class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
            </div>
        `;
    } else if (type === 'amount') {
        const minVal = document.getElementById('filter-min-amount').value;
        const maxVal = document.getElementById('filter-max-amount').value;
        content.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Kwota minimalna</label>
                    <input type="number" id="drawer-min-amount" value="${minVal}" placeholder="0.00" step="0.01"
                        class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Kwota maksymalna</label>
                    <input type="number" id="drawer-max-amount" value="${maxVal}" placeholder="Brak limitu" step="0.01"
                        class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
            </div>
        `;
    }

    applyBtn.onclick = () => {
        if (type === 'date') {
            document.getElementById('filter-date-start').value = document.getElementById('drawer-date-start').value;
            document.getElementById('filter-date-end').value = document.getElementById('drawer-date-end').value;
        } else if (type === 'amount') {
            document.getElementById('filter-min-amount').value = document.getElementById('drawer-min-amount').value;
            document.getElementById('filter-max-amount').value = document.getElementById('drawer-max-amount').value;
        }
        onApply();
        closeFilterDrawer();
    };

    const handleClose = () => closeFilterDrawer();
    closeBtn.onclick = handleClose;
    overlay.onclick = (e) => {
        if (e.target === overlay) handleClose();
    };

    openDrawer('filter-drawer', 'filter-drawer-overlay');
}

function openSelectionDrawer(title, options, onSelect, selectedValue = null, layoutType = 'list', showAddBtn = false, autoClose = true, onBack = null) {
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

    // Store the callback globally for auto-selection
    window.currentOnSelect = (...args) => {
        onSelect(...args);
        if (autoClose) closeSelectionDrawer();
    };

    // Reset drawer state
    if (addBtn) addBtn.classList.remove('hidden');
    if (addForm) addForm.classList.add('hidden');
    if (searchInput) searchInput.value = '';

    // Obsługa przycisku wstecz
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

    // Obsługa przycisku zamknij/widok poza drawerem
    const handleClose = () => closeSelectionDrawer();
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            handleClose();
        };
    }
    if (overlay) {
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                handleClose();
            }
        };
    }

    // Show search container only if there are more than 5 options
    if (searchContainer) {
        if (options.length > 5) {
            searchContainer.classList.remove('hidden');
        } else {
            searchContainer.classList.add('hidden');
        }
    }

    // Show Manage button if requested
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

    // Apply layout classes
    grid.classList.remove('drawer-grid-layout', 'drawer-list-layout');
    grid.classList.add(layoutType === 'grid' ? 'drawer-grid-layout' : 'drawer-list-layout');

    const renderOptions = (filterText = '') => {
        grid.innerHTML = '';
        
        // Point 11: Search includes subcategories if it's a category drawer
        let filtered = options;
        if (filterText.length > 0) {
            const lowFilter = filterText.toLowerCase();
            filtered = options.filter(opt => {
                const matchesMain = opt.label.toLowerCase().includes(lowFilter);
                if (matchesMain) return true;
                
                // If it's a category, check its subcategories in structuredCategories
                if (title.toLowerCase().includes('kategori')) {
                    const parent = structuredCategories.find(c => c.name === opt.label && !c.parentId);
                    if (parent) {
                        return structuredCategories.some(c => c.parentId === parent.id && c.name.toLowerCase().includes(lowFilter));
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

    // Show drawer
    openDrawer('category-drawer', 'category-drawer-overlay');
}

function closeFilterDrawer() {
    closeDrawer('filter-drawer', 'filter-drawer-overlay');
}

function navigateToCategoryManagementFromDrawer() {
    const filterDrawerOverlay = document.getElementById('filter-drawer-overlay');
    if (filterDrawerOverlay && filterDrawerOverlay.classList.contains('active')) {
        closeFilterDrawer();
    }

    const productDrawerOverlay = document.getElementById('product-drawer-overlay');
    if (productDrawerOverlay && productDrawerOverlay.classList.contains('active')) {
        if (typeof closeProductDrawer === 'function') {
            closeProductDrawer();
        }
    }

    closeDrawer('category-drawer', 'category-drawer-overlay');
    switchTab('settings-categories');
}

function closeSelectionDrawer() {
    closeDrawer('category-drawer', 'category-drawer-overlay');
}

window.closeSelectionDrawer = closeSelectionDrawer;




// --- Tryb edycji ---
function enterEditMode(purchaseId) {
    const purchase = allPurchases.find(p => p.id === purchaseId);
    if (!purchase) return;

    editMode.active = true;
    editMode.purchaseId = purchaseId;

    shopInput.value = purchase.shop;
    const dateEl = document.getElementById('date');
    if (dateEl) dateEl.value = purchase.date;
    
    // Load tags
    if (purchase.tags && typeof setPurchaseTags === 'function') {
        setPurchaseTags(purchase.tags.nature, purchase.tags.purpose);
    } else if (typeof resetPurchaseTags === 'function') {
        resetPurchaseTags();
    }

    if (typeof clearPurchaseItems === 'function') {
        currentPurchaseItems = purchase.items.map(item => ({
            name: item.name || '',
            price: typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0),
            category: item.category || 'Inne',
            subCategory: item.subCategory || '',
            tags: {
                nature: (item.tags && item.tags.nature) || (purchase.tags && purchase.tags.nature) || 'zmienny',
                purpose: (item.tags && item.tags.purpose) || (purchase.tags && purchase.tags.purpose) || 'konieczny'
            }
        }));
        renderPurchaseItems();
    } else {
        itemsContainer.innerHTML = '';
        purchase.items.forEach(item => addItemRow(item));
    }

    // Set the budget type dropdown
    if (purchase.specialBudgetId) {
        budgetTypeSelectValue = purchase.specialBudgetId;
    } else {
        budgetTypeSelectValue = 'monthly';
    }
    // Update label text based on budget type
    const budgetLabel = document.getElementById('budget-type-label');
    if (budgetLabel) {
        budgetLabel.textContent = budgetTypeSelectValue === 'monthly' ? 'Miesięczny' : 'Specjalny'; // Or find full name from allSpecialBudgets
    }

    const navTitle = document.getElementById('nav-title');
    if (navTitle) navTitle.textContent = 'Edytuj istniejący zakup';
    purchaseFormSubmitBtn.textContent = 'Zaktualizuj zakup';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');

    updatePurchaseSummary();
    // Wymuszamy pushState, aby powrót z edycji prowadził do Listy
    switchTab('add', true);
}

function exitEditMode() {
    editMode.active = false;
    editMode.purchaseId = null;

    purchaseForm.reset();
    itemsContainer.innerHTML = '';
    const dateEl = document.getElementById('date');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    budgetTypeSelectValue = 'monthly'; // Reset budget dropdown
    document.getElementById('budget-type-label').textContent = 'Miesięczny';
    document.getElementById('budget-type-icon').innerHTML = '<span>📅</span>';
    // addItemRow(); // USUNIĘTE - nie chcemy pustego wiersza na starcie

    // Zmień navbar TYLKO jeśli tab 'add' jest aktualnie widoczny
    const activeTab = document.querySelector('.tab-content.active')?.id.replace('-tab', '');
    if (activeTab === 'add') {
        const navTitle = document.getElementById('nav-title');
        if (navTitle) navTitle.textContent = 'Dodaj zakup';
    }
    purchaseFormSubmitBtn.textContent = 'Zapisz cały zakup';
    document.getElementById('cancel-edit-btn').classList.add('hidden');

    // Ensure scanner is hidden when resetting form
    document.getElementById('scanner-container')?.classList.add('hidden');

    updatePurchaseSummary();
}

// --- Wspólne funkcje dla drawer'ów ---
let overlayNavigationLockDepth = 0;
let shouldIgnoreNextOverlayLockPopstate = false;

function getCurrentTabHistoryState() {
    const activeTab = document.querySelector('.tab-content.active');
    const currentTabId = activeTab ? activeTab.id.replace('-tab', '') : 'home';
    return { type: 'tab', id: currentTabId };
}

function hasVisibleBlockingOverlay() {
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

function acquireOverlayNavigationLock() {
    overlayNavigationLockDepth += 1;
    if (overlayNavigationLockDepth > 1) return;

    const currentState = history.state;
    const baseState = currentState && currentState.type === 'tab'
        ? { type: 'tab', id: currentState.id }
        : getCurrentTabHistoryState();

    history.pushState({ ...baseState, overlayLock: true }, "", "");
}

function releaseOverlayNavigationLock() {
    if (overlayNavigationLockDepth === 0) return;

    overlayNavigationLockDepth -= 1;
    if (overlayNavigationLockDepth > 0) return;

    if (history.state && history.state.overlayLock) {
        shouldIgnoreNextOverlayLockPopstate = true;
        history.back();
    }
}

function reapplyOverlayNavigationLock() {
    const baseState = getCurrentTabHistoryState();
    history.pushState({ ...baseState, overlayLock: true }, "", "");
}

function consumeOverlayLockPopstateIgnore() {
    if (!shouldIgnoreNextOverlayLockPopstate) return false;
    shouldIgnoreNextOverlayLockPopstate = false;
    return true;
}

function restoreBodyScrollIfNeeded() {
    if (!hasVisibleBlockingOverlay()) {
        document.body.style.overflow = '';
    }
}

window.hasVisibleBlockingOverlay = hasVisibleBlockingOverlay;
window.reapplyOverlayNavigationLock = reapplyOverlayNavigationLock;
window.consumeOverlayLockPopstateIgnore = consumeOverlayLockPopstateIgnore;
window.acquireOverlayNavigationLock = acquireOverlayNavigationLock;
window.releaseOverlayNavigationLock = releaseOverlayNavigationLock;

function openDrawer(drawerId, overlayId) {
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

function closeDrawer(drawerId, overlayId) {
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

function openOverlay(elementId) {
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

function closeOverlay(elementId) {
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

// --- Modale / Drawers ---
function renderCategoryDetailsModal(category, items, isSubCategoryView = false) {
    const listContainer = document.getElementById('category-details-list');
    const titleEl = document.getElementById('category-details-title');
    
    if (!listContainer || !titleEl) return;

    titleEl.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    listContainer.innerHTML = '';

    if (items.length === 0) {
        listContainer.innerHTML = '<div class="text-center py-6 text-gray-500 text-sm">Brak wydatków w tym miesiącu.</div>';
    } else {
        // --- BREAKDOWN BY SUBCATEGORY (only for main category view) ---
        if (!isSubCategoryView) {
            const bySub = {};
            items.forEach(it => {
                const sub = it.subCategory || 'Inne';
                if (!bySub[sub]) bySub[sub] = 0;
                bySub[sub] += it.price || 0;
            });
            
            const sortedSub = Object.entries(bySub).sort((a, b) => b[1] - a[1]);
            
            if (sortedSub.length > 1 || (sortedSub.length === 1 && sortedSub[0][0] !== 'Inne')) {
                let breakdownHtml = `
                    <div class="mb-4 space-y-2">
                        <p class="text-[10px] text-gray-500 uppercase tracking-widest font-bold ml-1 mb-2">Podział na podkategorie</p>
                        <div class="grid grid-cols-2 gap-2">`;
                
                sortedSub.forEach(([sub, amt]) => {
                    breakdownHtml += `
                    <div class="bg-white/5 border border-white/10 rounded-xl p-2 px-3">
                        <p class="text-[10px] text-gray-400 truncate">${sub}</p>
                        <p class="text-sm font-bold text-white">${formatAmount(amt).replace(' zł', '')}</p>
                    </div>`;
                });
                breakdownHtml += `</div></div><hr class="border-white/5 mb-4">`;
                listContainer.innerHTML = breakdownHtml;
            }
        }

        // --- ITEMS LIST ---
        items.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
        
        items.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 mb-2';
            
            let dateStr = item.purchaseDate;
            try {
                const parts = item.purchaseDate.split('-');
                if(parts.length === 3) {
                    const d = new Date(parts[0], parseInt(parts[1])-1, parts[2]);
                    dateStr = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
                }
            } catch(e) {}

            const subLabel = item.subCategory ? `<span class="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400 mr-2">${item.subCategory}</span>` : '';

            itemEl.innerHTML = `
                <div class="flex flex-col overflow-hidden mr-3">
                    <span class="text-sm font-medium text-white truncate w-full">${item.name}</span>
                    <div class="flex items-center text-xs text-gray-400 mt-1 space-x-2">
                        ${isSubCategoryView ? '' : subLabel}
                        <span class="truncate max-w-[80px]">${item.shop || 'Inny'}</span>
                        <span>•</span>
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

    // Otwórz drawer
    const handleClose = () => closeCategoryDetailsDrawer();
    const drawer = document.getElementById('category-details-drawer');
    const overlay = document.getElementById('category-details-drawer-overlay');
    const closeBtn = document.getElementById('close-category-details-drawer');
    
    if (drawer && overlay) {
        const wasAlreadyOpen = overlay.classList.contains('active') || !overlay.classList.contains('hidden');
        // Ustawić handlery zamykania
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                handleClose();
            };
        }
        if (overlay) {
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    handleClose();
                }
            };
        }

        drawer.classList.remove('hidden');
        overlay.classList.remove('hidden');
        
        if (!wasAlreadyOpen) {
            acquireOverlayNavigationLock();
        }
        document.body.style.overflow = 'hidden';

        setTimeout(() => {
            drawer.classList.add('active');
            overlay.classList.add('active');
        }, 10);
    }
}

function closeCategoryDetailsDrawer() {
    closeDrawer('category-details-drawer', 'category-details-drawer-overlay');
}

// --- Obsługa aparatu ---
async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Twoja przeglądarka nie wspiera dostępu do aparatu.");
        return;
    }
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        document.getElementById('scanner-container').classList.remove('hidden');
        document.getElementById('scanner-controls').classList.add('hidden');
        cameraView.classList.remove('hidden');
        cameraStreamEl.srcObject = cameraStream;

        // Po włączeniu kamery przewiń, aby przycisk był widoczny
        setTimeout(() => {
            const captureBtn = document.getElementById('capture-photo-btn');
            if (captureBtn) {
                captureBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);

    } catch (err) {
        alert("Nie udało się uzyskać dostępu do aparatu. Sprawdź uprawnienia w przeglądarce.");
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }
    cameraView.classList.add('hidden');
    document.getElementById('scanner-controls').classList.remove('hidden');
    cameraStream = null;
}

function capturePhoto() {
    const canvas = document.createElement('canvas');
    canvas.width = cameraStreamEl.videoWidth;
    canvas.height = cameraStreamEl.videoHeight;
    canvas.getContext('2d').drawImage(cameraStreamEl, 0, 0);
    stopCamera();
    canvas.toBlob(blob => {
        currentFile = new File([blob], "paragon.jpg", { type: "image/jpeg" });
        handleAnalyzeReceipt();
    }, 'image/jpeg');
}

// --- Obsługa plików ---
function handleFileSelect(event) {

    currentFile = event.target.files[0]; // sets currentFile from app.js
    if (currentFile) {

        if (currentFile.type.startsWith('image/')) {
            imagePreview.src = URL.createObjectURL(currentFile);
            imagePreviewContainer.classList.remove('hidden');

        } else {
            imagePreviewContainer.classList.add('hidden');

        }

        // --- FIX: Automatically trigger analysis and switch to 'add' tab ---

        try {
            // Ensure handleAnalyzeReceipt is accessible globally or imported
            if (typeof handleAnalyzeReceipt === 'function') {
                handleAnalyzeReceipt();


                // --- NEW: Switch to 'add' tab after analysis starts ---

                switchTab('add');
                // --- END NEW ---

            } else {
                console.error("handleAnalyzeReceipt function is not defined or accessible.");
            }
        } catch (error) {
            console.error("Error calling handleAnalyzeReceipt:", error);
        }
        // --- END FIX ---

    } else {

        imagePreviewContainer.classList.add('hidden');
        currentFile = null; // Ensure currentFile is null if no file is selected
    }
}

// --- Autouzupełnianie sklepów ---
function renderShopAutocomplete(query) {
    if (!query) {
        shopAutocompleteList.classList.add('hidden');
        return;
    }
    const filteredShops = allShops.filter(shop => shop.toLowerCase().includes(query.toLowerCase()));

    if (filteredShops.length === 0) {
        shopAutocompleteList.classList.add('hidden');
        return;
    }

    shopAutocompleteList.innerHTML = filteredShops.map(shop =>
        `<div class="p-2 hover:bg-gray-100 dark:hover:bg-gray-500 cursor-pointer">${shop}</div>`
    ).join('');
    shopAutocompleteList.classList.remove('hidden');
}
// --- Przełączanie szczegółów budżetu ---
