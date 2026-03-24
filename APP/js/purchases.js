// Tracker Wydatków - Purchases Functions

// --- Logika Formularza Zakupu ---
let currentPurchaseItems = [];

function updatePurchaseSummary() {
    const total = currentPurchaseItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
    if (typeof purchaseSummary !== 'undefined' && purchaseSummary) {
        purchaseSummary.textContent = `Suma: ${formatAmount(total)}`;
    }
}

function clearPurchaseItems() {
    currentPurchaseItems = [];
    renderPurchaseItems();
}

function addItemRow(item = {}) {
    const defaultNature = typeof purchaseTagNature !== 'undefined' ? purchaseTagNature : 'zmienny';
    const defaultPurpose = typeof purchaseTagPurpose !== 'undefined' ? purchaseTagPurpose : 'konieczny';

    const newItem = {
        name: item.name || '',
        price: typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0),
        category: item.category || 'inne',
        subCategory: item.subCategory || '',
        tags: {
            nature: (item.tags && item.tags.nature) || defaultNature,
            purpose: (item.tags && item.tags.purpose) || defaultPurpose
        }
    };
    currentPurchaseItems.push(newItem);
    renderPurchaseItems();
}

function renderPurchaseItems() {
    if (!itemsContainer) return;
    itemsContainer.innerHTML = '';
        currentPurchaseItems.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'glass-card rounded-xl p-3 mb-2 flex flex-col gap-2 relative border border-white/5 bg-white/5';
        
        let labelText = item.category || 'inne';
        if (item.subCategory) {
            labelText += ` / ${item.subCategory}`;
        }
        
        const parentCat = (typeof structuredCategories !== 'undefined') 
            ? structuredCategories.find(c => c.name === item.category && !c.parentId)
            : null;
        
        const subCat = (typeof structuredCategories !== 'undefined' && parentCat)
            ? structuredCategories.find(c => c.name === item.subCategory && c.parentId === parentCat.id)
            : null;

        const iconName = (subCat && subCat.icon) || (parentCat && parentCat.icon) || (typeof categoryIcons !== 'undefined' ? categoryIcons[item.category] : 'fa-tag') || 'fa-tag';
        const color = (parentCat && parentCat.color) || (typeof getCategoryColor === 'function' ? getCategoryColor(item.category) : '#6b7280');

        itemRow.innerHTML = `
            <div class="flex items-start gap-3">
                <!-- Ikona kategorii -->
                <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg" style="background-color: ${color}20; color: ${color}">
                    <i class="fas ${iconName} text-lg"></i>
                </div>
                
                <!-- Treść główna -->
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start gap-2">
                        <div class="min-w-0">
                            <p class="text-[10px] text-gray-500 uppercase tracking-widest font-semibold truncate mb-0.5">${labelText}</p>
                            <h4 class="text-sm font-bold text-white leading-tight break-words pr-1">${item.name}</h4>
                        </div>
                        <div class="text-right shrink-0">
                            <p class="text-sm font-black text-white">${formatAmount(item.price || 0)}</p>
                        </div>
                    </div>
                    
                    <!-- Tagi i akcje -->
                    <div class="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
                        <div class="flex flex-wrap gap-1.5">
                            <span class="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-gray-400">
                                N: <span class="text-gray-200 font-medium">${item.tags?.nature || 'zmienny'}</span>
                            </span>
                            <span class="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-gray-400">
                                C: <span class="text-gray-200 font-medium">${item.tags?.purpose || 'konieczny'}</span>
                            </span>
                        </div>
                        <div class="flex gap-1 ml-2">
                            <button type="button" class="edit-item-btn text-blue-400 hover:text-white hover:bg-blue-500/20 w-8 h-8 flex items-center justify-center rounded-lg transition-all" data-index="${index}">
                                <i class="fas fa-edit text-xs"></i>
                            </button>
                            <button type="button" class="remove-item-btn text-red-500 hover:text-white hover:bg-red-500/20 w-8 h-8 flex items-center justify-center rounded-lg transition-all" data-index="${index}">
                                <i class="fas fa-trash-alt text-xs"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        itemsContainer.appendChild(itemRow);
    });;

    itemsContainer.querySelectorAll('.edit-item-btn').forEach(btn => {
        btn.onclick = (e) => {
            const index = parseInt(e.currentTarget.dataset.index);
            openProductDrawer(index);
        };
    });

    itemsContainer.querySelectorAll('.remove-item-btn').forEach(btn => {
        btn.onclick = (e) => {
            const index = parseInt(e.currentTarget.dataset.index);
            currentPurchaseItems.splice(index, 1);
            renderPurchaseItems();
        };
    });

    updatePurchaseSummary();
}

// --- Product Drawer Logic ---
function initProductDrawer() {
    const drawerOverlay = document.getElementById('product-drawer-overlay');
    const drawer = document.getElementById('product-drawer');
    const closeBtn = document.getElementById('close-product-drawer');
    const form = document.getElementById('product-drawer-form');
    
    // Category Selector in Drawer
    const categoryBtn = document.getElementById('product-drawer-category-btn');
    
    // Tags Selectors in Drawer
    const natureBtn = document.getElementById('product-drawer-nature-btn');
    const purposeBtn = document.getElementById('product-drawer-purpose-btn');

    if (!drawer) return; // Wait until DOM is loaded

    closeBtn.addEventListener('click', closeProductDrawer);
    drawerOverlay.addEventListener('click', closeProductDrawer);

    natureBtn.addEventListener('click', () => {
        const options = [
            { value: 'zmienny', label: 'Zmienny (np. jedzenie, chemia)' },
            { value: 'stały', label: 'Stały (np. czynsz, raty)' },
            { value: 'jednorazowy', label: 'Jednorazowy (np. AGD, meble)' }
        ];
        openSelectionDrawer('Natura produktu', options, (val) => {
            natureBtn.dataset.value = val;
            document.getElementById('product-drawer-nature-label').textContent = val;
        }, natureBtn.dataset.value);
    });

    purposeBtn.addEventListener('click', () => {
        const options = [
            { value: 'konieczny', label: 'Konieczny (potrzeby)' },
            { value: 'przyjemność', label: 'Przyjemność (zachcianki)' },
            { value: 'inwestycja', label: 'Inwestycja (na rozwój)' }
        ];
        openSelectionDrawer('Celowość produktu', options, (val) => {
            purposeBtn.dataset.value = val;
            document.getElementById('product-drawer-purpose-label').textContent = val;
        }, purposeBtn.dataset.value);
    });

    categoryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const currentVal = document.getElementById('product-drawer-category-value').value || '';
        let [vCat, vSub] = currentVal.split('|');
        if (typeof openHierarchicalCategoryDrawer === 'function') {
            openHierarchicalCategoryDrawer(drawer, vCat || '', vSub || '', (pName, sName) => {
                const combined = sName ? `${pName}|${sName}` : pName;
                document.getElementById('product-drawer-category-value').value = combined;
                
                const labelText = sName ? `${pName} / ${sName}` : pName;
                document.getElementById('product-drawer-category-label').textContent = labelText;
                
                const parentCat = (typeof structuredCategories !== 'undefined') 
                    ? structuredCategories.find(c => c.name === pName && !c.parentId)
                    : null;
                
                const subCat = (typeof structuredCategories !== 'undefined' && parentCat)
                    ? structuredCategories.find(c => c.name === sName && c.parentId === parentCat.id)
                    : null;

                const iconName = (subCat && subCat.icon) || (parentCat && parentCat.icon) || (typeof categoryIcons !== 'undefined' ? categoryIcons[pName] : 'fa-tag') || 'fa-tag';
                const color = (parentCat && parentCat.color) || (typeof getCategoryColor === 'function' ? getCategoryColor(pName) : '#6b7280');
                
                const iconEl = document.getElementById('product-drawer-category-icon');
                iconEl.innerHTML = `<i class="fas ${iconName}"></i>`;
                iconEl.style.color = color;
                iconEl.style.backgroundColor = `${color}20`;
            });
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const indexStr = document.getElementById('product-drawer-index').value;
        const name = document.getElementById('product-drawer-name').value.trim();
        const price = parseFloat(document.getElementById('product-drawer-price').value);
        const compositeCat = document.getElementById('product-drawer-category-value').value || 'inne';
        
        let category = 'inne';
        let subCategory = '';
        if (compositeCat.includes('|')) {
            const [p, s] = compositeCat.split('|');
            category = p;
            subCategory = s;
        } else {
            category = compositeCat;
        }

        const tags = {
            nature: natureBtn.dataset.value || 'zmienny',
            purpose: purposeBtn.dataset.value || 'konieczny'
        };

        const newItem = { name, price, category, subCategory, tags };

        // Aktualizacja autouzupełniania kategorii przy locie
        if (category && !allCategories.includes(category)) {
            allCategories.push(category);
            allCategories.sort();
        }

        if (indexStr !== "") {
            const idx = parseInt(indexStr);
            currentPurchaseItems[idx] = newItem;
        } else {
            currentPurchaseItems.push(newItem);
        }

        renderPurchaseItems();
        closeProductDrawer();
    });
}

// Wywołaj inicjalizację zdarzeń po załadowaniu DOM
document.addEventListener('DOMContentLoaded', initProductDrawer);

function openProductDrawer(index = null) {
    const drawerOverlay = document.getElementById('product-drawer-overlay');
    const drawer = document.getElementById('product-drawer');
    const title = document.getElementById('product-drawer-title');
    const form = document.getElementById('product-drawer-form');
    
    // Form fields
    const idxInput = document.getElementById('product-drawer-index');
    const nameInput = document.getElementById('product-drawer-name');
    const priceInput = document.getElementById('product-drawer-price');
    const catValue = document.getElementById('product-drawer-category-value');
    const catLabel = document.getElementById('product-drawer-category-label');
    const catIcon = document.getElementById('product-drawer-category-icon');
    
    const natureBtn = document.getElementById('product-drawer-nature-btn');
    const natureLabel = document.getElementById('product-drawer-nature-label');
    const purposeBtn = document.getElementById('product-drawer-purpose-btn');
    const purposeLabel = document.getElementById('product-drawer-purpose-label');
    
    // Ustawienie początkowych lub predefiniowanych wartości
    if (index !== null && index >= 0 && index < currentPurchaseItems.length) {
        title.textContent = 'Edytuj produkt';
        const item = currentPurchaseItems[index];
        
        idxInput.value = index;
        nameInput.value = item.name;
        priceInput.value = item.price.toFixed(2);
        
        const combinedCat = item.subCategory ? `${item.category}|${item.subCategory}` : item.category;
        catValue.value = combinedCat;
        catLabel.textContent = item.subCategory ? `${item.category} / ${item.subCategory}` : item.category;
        
        // Konfiguracja kolorów ikon i labeli dla kategorii
        const parentCat = (typeof structuredCategories !== 'undefined') 
            ? structuredCategories.find(c => c.name === item.category && !c.parentId)
            : null;
            
        const subCat = (typeof structuredCategories !== 'undefined' && parentCat)
            ? structuredCategories.find(c => c.name === item.subCategory && c.parentId === parentCat.id)
            : null;

        const iconName = (subCat && subCat.icon) || (parentCat && parentCat.icon) || (typeof categoryIcons !== 'undefined' ? categoryIcons[item.category] : 'fa-tag') || 'fa-tag';
        const color = (parentCat && parentCat.color) || (typeof getCategoryColor === 'function' ? getCategoryColor(item.category) : '#6b7280');
        
        catIcon.innerHTML = `<i class="fas ${iconName}"></i>`;
        catIcon.style.color = color;
        catIcon.style.backgroundColor = `${color}20`;
        
        const nVal = item.tags?.nature || 'zmienny';
        natureBtn.dataset.value = nVal;
        natureLabel.textContent = nVal;
        
        const pVal = item.tags?.purpose || 'konieczny';
        purposeBtn.dataset.value = pVal;
        purposeLabel.textContent = pVal;
        
    } else {
        title.textContent = 'Dodaj produkt';
        form.reset();
        idxInput.value = "";
        
        // Wartości domyślne dla nowego produktu
        catValue.value = 'inne';
        catLabel.textContent = 'Inne';
        catIcon.innerHTML = '<i class="fas fa-tag"></i>';
        catIcon.style.color = '#6b7280';
        catIcon.style.backgroundColor = '#6b728020';
        
        const defaultNature = typeof purchaseTagNature !== 'undefined' ? purchaseTagNature : 'zmienny';
        const defaultPurpose = typeof purchaseTagPurpose !== 'undefined' ? purchaseTagPurpose : 'konieczny';
        
        natureBtn.dataset.value = defaultNature;
        natureLabel.textContent = defaultNature;
        purposeBtn.dataset.value = defaultPurpose;
        purposeLabel.textContent = defaultPurpose;
    }

    drawerOverlay.classList.remove('hidden');
    drawer.classList.remove('hidden');
    
    // Uruchomienie animacji CSS
    setTimeout(() => {
        drawerOverlay.classList.remove('opacity-0');
        drawer.classList.remove('translate-y-full');
    }, 10);
    
    setTimeout(() => {
        nameInput.focus(); // Ułatwienie natychmiastowego pisania nazwy
    }, 300);
}

function closeProductDrawer() {
    const drawerOverlay = document.getElementById('product-drawer-overlay');
    const drawer = document.getElementById('product-drawer');
    
    drawerOverlay.classList.add('opacity-0');
    drawer.classList.add('translate-y-full');
    
    setTimeout(() => {
        drawerOverlay.classList.add('hidden');
        drawer.classList.add('hidden');
    }, 300);
}

async function handlePurchaseFormSubmit(e) {
    e.preventDefault();
    
    if (currentPurchaseItems.length === 0) {
        alert('Dodaj przynajmniej jedną pozycję do zakupu.');
        return;
    }

    const purchaseData = {
        shop: shopInput.value,
        date: dateInput.value,
        specialBudgetId: budgetTypeSelectValue === 'monthly' ? null : budgetTypeSelectValue,
        tags: {
            nature: typeof purchaseTagNature !== 'undefined' ? purchaseTagNature : 'zmienny',
            purpose: typeof purchaseTagPurpose !== 'undefined' ? purchaseTagPurpose : 'konieczny'
        },
        items: currentPurchaseItems.map(item => ({
            name: item.name,
            price: item.price,
            category: item.category,
            subCategory: item.subCategory || '',
            tags: item.tags || { nature: 'zmienny', purpose: 'konieczny' }
        }))
    };

    try {
        if (editMode.active) {
            await apiCall(`/api/purchases/${editMode.purchaseId}`, 'PUT', purchaseData);
        } else {
            await apiCall('/api/purchases', 'POST', purchaseData);
        }
        await fetchInitialData(false);
        switchTab('list');
    } catch (error) {
        alert('Błąd zapisu: ' + error.message);
    }
}

// --- Logika Listy Zakupów ---
function renderPurchasesList(purchasesToRender, append = false) {
    // Jeśli nie dołączamy, wyczyść listę i pokaż nagłówek filtrów
    if (!append) {
        purchasesList.innerHTML = '';
    }

    if (purchasesToRender.length === 0 && !append) {
        purchasesList.innerHTML = '<div class="text-center py-12"><svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg><h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Brak zakupów</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Brak wyników dla podanych kryteriów.</p></div>';
        return;
    }

    const newContent = purchasesToRender.map(p => {
        const specialBudgetName = p.specialBudgetId ? (allSpecialBudgets.find(b => b.id === p.specialBudgetId) || {}).name : null;
        const budgetIcon = specialBudgetName
            ? `<span class="ml-2 text-xs text-blue-500" title="Budżet: ${specialBudgetName}">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a1 1 0 011-1h5a.997.997 0 01.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>
               </span>`
            : '';

        return `
        <div class="glass-card rounded-2xl mb-4" data-purchase-id="${p.id}">
            <div class="purchase-header flex justify-between items-center p-4 cursor-pointer">
                <div class="flex items-center">
                    <div>
                        <p class="font-bold text-lg text-white">${p.shop}</p>
                        <p class="text-sm text-gray-400">${p.date}</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="text-right">
                        <p class="font-bold text-xl text-gray-900 dark:text-white whitespace-nowrap">${formatAmount(p.totalAmount || 0)}${budgetIcon}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">${(p.items || []).length} poz.</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 toggle-arrow text-gray-500 dark:text-gray-400 transition-transform transform" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                </div>
            </div>
            <div class="purchase-items hidden p-4 space-y-4 bg-white/5 rounded-b-2xl border-t border-white/5">
                <!-- Tagi paragonu -->
                ${p.tags ? `
                <div class="flex gap-2 mb-2 p-2 bg-white/5 rounded-xl border border-white/5">
                    <div class="flex flex-col flex-1">
                        <span class="text-[10px] text-gray-500 uppercase tracking-widest">N</span>
                        <span class="text-sm text-white font-medium">${p.tags.nature || 'zmienny'}</span>
                    </div>
                    <div class="flex flex-col flex-1">
                        <span class="text-[10px] text-gray-500 uppercase tracking-widest">C</span>
                        <span class="text-sm text-white font-medium">${p.tags.purpose || 'konieczny'}</span>
                    </div>
                </div>` : ''}

                ${(p.items || []).map(item => {
                    const catName = item.category || 'inne';
                    const subName = item.subCategory || '';
                    const parentCat = (typeof structuredCategories !== 'undefined') 
                        ? structuredCategories.find(c => c.name === catName && !c.parentId)
                        : null;
                    
                    const subCat = (typeof structuredCategories !== 'undefined' && parentCat)
                        ? structuredCategories.find(c => c.name === subName && c.parentId === parentCat.id)
                        : null;

                    const icon = (subCat && subCat.icon) || (parentCat && parentCat.icon) || (typeof categoryIcons !== 'undefined' ? categoryIcons[catName] : 'fa-tag') || 'fa-tag';
                    const color = (parentCat && parentCat.color) || (typeof getCategoryColor === 'function' ? getCategoryColor(catName) : '#6b7280');
                    const labelText = subName ? `${catName} / ${subName}` : catName;

                    return `
                    <div class="flex justify-between items-end py-1 border-b border-white/5 last:border-0">
                        <div class="flex flex-col">
                            <div class="category-tag-mini flex items-center gap-2 mb-1">
                                <div class="category-icon-mini" style="background-color: ${color}20; color: ${color}">
                                    <i class="fas ${icon}"></i>
                                </div>
                                <span class="text-[10px] text-gray-400 uppercase tracking-tight">${labelText}</span>
                            </div>
                            <div class="text-sm font-semibold text-white">${item.name}</div>
                            <!-- Tagi pozycji w historii -->
                            <div class="flex gap-1.5 mt-1">
                                <span class="text-[10px] text-gray-500">N: <span class="text-gray-300">${item.tags?.nature || 'zmienny'}</span></span>
                                <span class="text-[10px] text-gray-500">C: <span class="text-gray-300">${item.tags?.purpose || 'konieczny'}</span></span>
                            </div>
                        </div>
                        <div class="font-bold text-white whitespace-nowrap text-base">${formatAmount(item.price || 0)}</div>
                    </div>
                `;}).join('')}
                
                <!-- Expanded view actions -->
                <div class="flex gap-3 pt-2 mt-2 border-t border-white/5">
                    <button class="edit-purchase-btn flex-1 py-2.5 px-5 bg-white/5 hover:bg-white/10 text-blue-400 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm font-medium">
                        <i class="fas fa-edit"></i>
                        <span>Edytuj</span>
                    </button>
                    <button class="delete-purchase-btn flex-1 py-2.5 px-5 bg-white/5 hover:bg-white/10 text-red-500 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm font-medium">
                        <i class="fas fa-trash-alt"></i>
                        <span>Usuń</span>
                    </button>
                </div>
            </div>
        </div>
    `}).join('');

    if (append) {
        purchasesList.insertAdjacentHTML('beforeend', newContent);
    } else {
        purchasesList.innerHTML = newContent;
    }
}

// --- Logika Zarządzania Kategoriami ---
function renderCategoriesList() {
    categoriesList.innerHTML = allCategories.map(cat => `
        <div class="flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700" data-category-name="${cat}">
            <span class="category-text text-gray-900 dark:text-white">${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
            <div class="category-actions">
                <button class="rename-cat-btn p-1 text-blue-500 hover:text-blue-700" title="Zmień nazwę"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                <button class="delete-cat-btn p-1 text-red-500 hover:text-red-700" title="Usuń"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button>
            </div>
        </div>
    `).join('');
}

async function handleCategoryActions(e) {
    const renameBtn = e.target.closest('.rename-cat-btn');
    if (renameBtn) {
        const categoryDiv = e.target.closest('[data-category-name]');
        const oldName = categoryDiv.dataset.categoryName;
        const newName = prompt(`Wprowadź nową nazwę dla kategorii "${oldName}":`, oldName);
        if (newName && newName.trim() !== '' && newName !== oldName) {
            try {
                await apiCall(`/api/categories/${oldName}`, 'PUT', { newName: newName.trim().toLowerCase() });
                await fetchInitialData(false);
                renderCategoriesList();
                renderBudgetInputs(); // DODANE
            } catch (error) {
                alert('Nie udało się zmienić nazwy: ' + error.message);
            }
        }
    }

    const deleteBtn = e.target.closest('.delete-cat-btn');
    if (deleteBtn) {
        const categoryDiv = e.target.closest('[data-category-name]');
        const name = categoryDiv.dataset.categoryName;
        if (confirm(`Czy na pewno chcesz usunąć kategorię "${name}"? Wszystkie produkty z tą kategorią zostaną oznaczone jako "inne".`)) {
            try {
                await apiCall(`/api/categories/${name}`, 'DELETE');
                await fetchInitialData(false);
                renderCategoriesList();
                renderBudgetInputs(); // DODANE
            } catch (error) {
                alert('Nie udało się usunąć kategorii: ' + error.message);
            }
        }
    }
}

// --- Analiza paragonów ---
async function handleAnalyzeReceipt() {
    if (!currentFile) {
        alert('Najpierw wybierz plik z paragonem.');
        return;
    }
    const globalLoader = document.getElementById('global-analysis-loader');
    if (globalLoader) globalLoader.classList.remove('hidden');
    const scannerContainer = document.getElementById('scanner-container');
    if (scannerContainer) scannerContainer.classList.remove('hidden');

    analysisSpinner.classList.remove('hidden');
    analyzeReceiptBtn.disabled = true;
    imagePreviewContainer.classList.add('hidden');
    try {
        let fileToSend = currentFile;
        if (currentFile.type.startsWith('image/')) {
            fileToSend = await resizeImage(currentFile);
        }
        const { analysis } = await apiCallWithFile('/api/analyze-receipt', fileToSend);
        await fillFormWithAnalysis(analysis);
    } catch (error) {
        alert('Błąd analizy paragonu: ' + error.message);
    } finally {
        const globalLoader = document.getElementById('global-analysis-loader');
        if (globalLoader) globalLoader.classList.add('hidden');
        const scannerContainer = document.getElementById('scanner-container');
        if (scannerContainer) scannerContainer.classList.add('hidden');

        analysisSpinner.classList.add('hidden');
        analyzeReceiptBtn.disabled = false;
        receiptFileInput.value = '';
        currentFile = null;
    }
}
async function fillFormWithAnalysis(analysis) {
    shopInput.value = analysis.shop || '';
    dateInput.value = analysis.date || new Date().toISOString().split('T')[0];
    itemsContainer.innerHTML = '';

    // Obsługa konwersji waluty
    if (analysis.originalCurrency && analysis.originalCurrency !== 'PLN') {
        const rate = analysis.exchangeRate ? analysis.exchangeRate.toFixed(4) : 'nieznany';
        const itemCount = (analysis.items || []).length;
        const originalTotal = (analysis.items || []).reduce((sum, item) => sum + (item.price / analysis.exchangeRate), 0);
        const convertedTotal = (analysis.items || []).reduce((sum, item) => sum + item.price, 0);

        // Sprawdź czy kurs został pobrany pomyślnie
        if (analysis.rateSuccess === false) {
            // Nie udało się pobrać kursu - zaproponuj ręczne wprowadzenie
            const userRate = prompt(
                `⚠️ Nie udało się automatycznie pobrać kursu wymiany dla ${analysis.originalCurrency}!\n\n` +
                `Wykryto ${itemCount} produktów w walucie ${analysis.originalCurrency}.\n` +
                `Suma oryginalna: ${originalTotal.toFixed(2)} ${analysis.originalCurrency}\n\n` +
                `Wprowadź kurs wymiany ręcznie:\n` +
                `1 ${analysis.originalCurrency} = ? PLN`,
                '1.0'
            );

            if (userRate && !isNaN(parseFloat(userRate)) && parseFloat(userRate) > 0) {
                try {
                    // Wywołaj endpoint do ręcznego przeliczenia
                    const originalItems = (analysis.items || []).map(item => ({
                        ...item,
                        price: item.price / analysis.exchangeRate // Przywróć oryginalną cenę
                    }));

                    const conversionResult = await apiCall('/api/convert-currency', 'POST', {
                        items: originalItems,
                        fromCurrency: analysis.originalCurrency,
                        exchangeRate: parseFloat(userRate)
                    });

                    // Zaktualizuj analizę z nowym kursem
                    analysis.items = conversionResult.items;
                    analysis.exchangeRate = conversionResult.exchangeRate;
                    analysis.rateSuccess = true;

                    const newConvertedTotal = conversionResult.items.reduce((sum, item) => sum + item.price, 0);

                    alert(
                        `✅ Kurs został zaktualizowany!\n\n` +
                        `📊 Szczegóły przeliczenia:\n` +
                        `• Waluta oryginalna: ${analysis.originalCurrency}\n` +
                        `• Kurs wymiany: 1 ${analysis.originalCurrency} = ${userRate} PLN\n` +
                        `• Liczba produktów: ${itemCount}\n` +
                        `• Suma oryginalna: ${originalTotal.toFixed(2)} ${analysis.originalCurrency}\n` +
                        `• Suma po przeliczeniu: ${newConvertedTotal.toFixed(2)} PLN\n\n` +
                        `✅ Wszystkie ceny zostały przeliczone z nowym kursem.`
                    );
                } catch (error) {
                    alert('Błąd podczas przeliczania kursu: ' + error.message);
                    return;
                }
            } else {
                alert('Anulowano przeliczenie. Produkty pozostaną w oryginalnej walucie.');
            }
        } else {
            // Kurs został pobrany pomyślnie - pokaż standardowy komunikat
            const message = `💱 Wykryto paragon w walucie ${analysis.originalCurrency}!\n\n` +
                `📊 Szczegóły przeliczenia:\n` +
                `• Waluta oryginalna: ${analysis.originalCurrency}\n` +
                `• Kurs wymiany: 1 ${analysis.originalCurrency} = ${rate} PLN\n` +
                `• Liczba produktów: ${itemCount}\n` +
                `• Suma oryginalna: ${(originalTotal || 0).toFixed(2)} ${analysis.originalCurrency}\n` +
                `• Suma po przeliczeniu: ${formatAmount(convertedTotal)}\n\n` +
                `✅ Wszystkie ceny zostały automatycznie przeliczone na PLN.`;

            alert(message);
        }
    }

    const processedItems = (analysis.items || []).map(item => {
        const rawPrice = item.price ? item.price.toString().replace(',', '.') : '0';
        const parsedPrice = parseFloat(rawPrice);
        return {
            ...item,
            price: isNaN(parsedPrice) ? 0 : parseFloat(parsedPrice.toFixed(2))
        };
    });

    currentPurchaseItems = processedItems.map(item => {
        // Podstawowe wartości domyślne (jeśli AI zawiedzie)
        const defaultNature = typeof purchaseTagNature !== 'undefined' ? purchaseTagNature : 'zmienny';
        const defaultPurpose = typeof purchaseTagPurpose !== 'undefined' ? purchaseTagPurpose : 'konieczny';
        
        // Znajdź kategorię nadrzędną
        let categoryName = item.category || 'inne';
        let subCategoryName = item.subCategory || '';

        // Walidacja kategorii nadrzędnej
        const parentCat = (typeof structuredCategories !== 'undefined') 
            ? structuredCategories.find(c => c.name.toLowerCase() === categoryName.toLowerCase() && !c.parentId)
            : null;

        if (parentCat) {
            categoryName = parentCat.name; // Ujednolicenie wielkości liter
            
            // Walidacja podkategorii
            if (subCategoryName) {
                const subCat = structuredCategories.find(c => 
                    c.name.toLowerCase() === subCategoryName.toLowerCase() && 
                    c.parentId === parentCat.id
                );
                if (subCat) {
                    subCategoryName = subCat.name;
                } else {
                    subCategoryName = ''; // Jeśli podkategoria nie pasuje do rodzica, wyczyść
                }
            }
        } else {
            categoryName = 'inne';
            subCategoryName = '';
        }

        return {
            name: item.name || '',
            price: typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0),
            category: categoryName,
            subCategory: subCategoryName,
            tags: {
                nature: (item.tags && item.tags.nature) || defaultNature,
                purpose: (item.tags && item.tags.purpose) || defaultPurpose
            }
        };
    });
    
    renderPurchaseItems();
    updatePurchaseSummary();
    alert('Formularz został wypełniony danymi z paragonu. AI zasugerowało kategorie i tagi pozycji.');
}