// Tracker Wydatków - UI Functions
// (funkcje współdzielone przeniesione do shared/ui.js i shared/format.js)

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


function closeFilterDrawer() {
    closeDrawer('filter-drawer', 'filter-drawer-overlay');
}






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
