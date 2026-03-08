// Tracker Wydatków - UI Functions

// --- Nawigacja i zakładki ---
function switchTab(tabName, pushToHistory = true) {
    if (pushToHistory) {
        history.pushState({ tab: tabName }, "", "");
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

    if (tabName === 'stats') {
        const container = document.getElementById('stats-swipe-container');
        if (container) container.scrollTo({ left: 0, behavior: 'instant' });
        renderStatistics();
    }

    if (tabName === 'analysis') {
        const container = document.getElementById('analysis-swipe-container');
        if (container) container.scrollTo({ left: 0, behavior: 'instant' });

        if (typeof initializeLongTermBudget === 'function') {
            initializeLongTermBudget().catch(console.error);
        }
    }

    if (tabName === 'special-budgets') {
        renderSpecialBudgetsTab();
    }

    // Settings sub-tabs logic
    if (tabName === 'settings' || tabName.startsWith('settings-')) {
        renderCategoriesList();
        populateBudgetMonthSelector();
        renderBudgetInputs();
        renderRecurringExpenses();
    }

    // Initialize custom dropdowns IF we are on the 'add' tab
    if (tabName === 'add') {
        initCustomDropdown('budget-type-btn', 'budget-type-popup', 'budget-type-label', 'budget-type-select');
    }

    if (tabName === 'list') {
        initFilterDrawers();
    }
}

function initFilterDrawers() {
    const categoryBtn = document.getElementById('filter-category-btn');
    const filterCategoryEl = document.getElementById('filter-category');
    if (categoryBtn && filterCategoryEl) {
        categoryBtn.onclick = () => {
            openCategoryDrawer(null, filterCategoryEl.value, (cat) => {
                filterCategoryEl.value = cat;
                document.getElementById('filter-category-label').textContent = cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Wszystkie kategorie';
                if (typeof handleFilterChange === 'function') handleFilterChange();
            });
        };
    }

    const budgetBtn = document.getElementById('filter-budget-btn');
    const filterBudgetEl = document.getElementById('filter-budget');
    if (budgetBtn && filterBudgetEl) {
        budgetBtn.onclick = () => {
            const options = Array.from(filterBudgetEl.options).map(opt => ({ value: opt.value, label: opt.textContent }));
            openSelectionDrawer('Wybierz budżet', options, (val, label) => {
                filterBudgetEl.value = val;
                document.getElementById('filter-budget-label').textContent = label;
                if (typeof handleFilterChange === 'function') handleFilterChange();
            }, filterBudgetEl.value);
        };
    }

    const shopBtn = document.getElementById('filter-shop-btn');
    const filterShopEl = document.getElementById('filter-shop');
    if (shopBtn && filterShopEl) {
        shopBtn.onclick = () => {
            const options = Array.from(filterShopEl.options).map(opt => ({ value: opt.value, label: opt.textContent }));
            openSelectionDrawer('Wybierz sklep', options, (val, label) => {
                filterShopEl.value = val;
                document.getElementById('filter-shop-label').textContent = label;
                if (typeof handleFilterChange === 'function') handleFilterChange();
            }, filterShopEl.value);
        };
    }

    // Native date pickers don't need initialization, but we can add event listeners
    const filterDateStart = document.getElementById('filter-date-start');
    const filterDateEnd = document.getElementById('filter-date-end');
    [filterDateStart, filterDateEnd].forEach(el => {
        if (el) el.onchange = () => { if (typeof handleFilterChange === 'function') handleFilterChange(); };
    });
}

function openSelectionDrawer(title, options, onSelect, selectedValue = null, layoutType = 'list') {
    const overlay = document.getElementById('category-drawer-overlay');
    const drawer = document.getElementById('category-drawer');
    const titleEl = document.getElementById('category-drawer-title');
    const grid = document.getElementById('category-drawer-grid');
    const addBtn = document.getElementById('add-category-drawer-btn');

    if (!overlay || !drawer || !titleEl || !grid) return;

    titleEl.textContent = title;
    grid.innerHTML = '';

    // Apply layout classes
    grid.classList.remove('drawer-grid-layout', 'drawer-list-layout', 'space-y-1');
    if (layoutType === 'grid') {
        grid.classList.add('drawer-grid-layout');
    } else {
        grid.classList.add('drawer-list-layout');
    }

    // Hide/Show Add Category button
    if (addBtn) {
        if (layoutType === 'grid') {
            addBtn.classList.remove('hidden');
        } else {
            addBtn.classList.add('hidden');
        }
    }

    options.forEach(opt => {
        const item = document.createElement('div');
        item.className = 'category-drawer-item';
        if (selectedValue === opt.value) {
            item.classList.add('active');
        }

        if (layoutType === 'grid') {
            const iconWrapper = document.createElement('div');
            iconWrapper.className = 'category-icon-wrapper';
            iconWrapper.style.backgroundColor = opt.color || 'rgba(255, 255, 255, 0.1)';
            iconWrapper.innerHTML = opt.icon || '<span>?</span>';
            item.appendChild(iconWrapper);
        }

        const nameLabel = document.createElement('div');
        nameLabel.className = 'category-name-label';
        nameLabel.textContent = opt.label;
        item.appendChild(nameLabel);

        item.onclick = () => {
            onSelect(opt.value, opt.label);
            closeSelectionDrawer();
        };

        grid.appendChild(item);
    });

    overlay.classList.add('active');
    overlay.classList.remove('hidden');
    drawer.classList.add('active');
    drawer.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}


// --- Custom Dropdown Helper ---
function initCustomDropdown(btnId, popupId, labelId, selectId, onChange = null) {
    const btn = typeof btnId === 'string' ? document.getElementById(btnId) : btnId;
    const popup = typeof popupId === 'string' ? document.getElementById(popupId) : popupId;
    const label = typeof labelId === 'string' ? document.getElementById(labelId) : labelId;
    const select = typeof selectId === 'string' ? document.getElementById(selectId) : selectId;

    if (!btn || !popup || !label || !select) return;

    // Open/Close popup
    btn.onclick = (e) => {
        e.stopPropagation();
        const isHidden = popup.classList.contains('hidden');
        // Close all other popups first
        document.querySelectorAll('[id$="-popup"]').forEach(p => p.classList.add('hidden'));
        if (isHidden) popup.classList.remove('hidden');
    };

    // Global listener to close this specific popup is handled by a single document listener below
}

// Global click listener for custom dropdowns
document.addEventListener('click', (e) => {
    const popups = document.querySelectorAll('[id$="-popup"]');
    popups.forEach(popup => {
        // If the click is outside the popup and its corresponding button
        const btnId = popup.id.replace('-popup', '-btn');
        const btn = document.getElementById(btnId);
        // Special case for dynamic item category dropdowns
        const isDynamic = popup.classList.contains('item-category-popup');

        if (!popup.contains(e.target) && (!btn || !btn.contains(e.target))) {
            if (isDynamic) {
                // For dynamic popups, we check if the click was on the specific button that belongs to this popup
                const parentRow = popup.closest('.item-row');
                const rowBtn = parentRow ? parentRow.querySelector('.item-category-btn') : null;
                if (rowBtn && rowBtn.contains(e.target)) return;
            }
            popup.classList.add('hidden');
        }
    });
});



// --- Swipe Container ---
function setupSwipeTracking(containerId, dotsSelector) {
    const container = document.getElementById(containerId);
    const dots = document.querySelectorAll(dotsSelector);
    if (!container || dots.length === 0) return;

    let lastIndex = 0;
    container.addEventListener('scroll', () => {
        const scrollLeft = container.scrollLeft;
        const slideWidth = container.offsetWidth;
        if (slideWidth === 0) return;
        const activeIndex = Math.round(scrollLeft / slideWidth);

        if (activeIndex !== lastIndex) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            lastIndex = activeIndex;
        }

        dots.forEach((dot, i) => dot.classList.toggle('active', i === activeIndex));
    }, { passive: true });

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const index = parseInt(dot.dataset.index);
            const slideWidth = container.offsetWidth;
            container.scrollTo({
                left: index * slideWidth,
                behavior: 'smooth'
            });
        });
    });
}

function initSwipeContainer() {
    // Statystyki
    setupSwipeTracking('stats-swipe-container', '#swipe-dots .swipe-dot');
    // Analiza
    setupSwipeTracking('analysis-swipe-container', '#analysis-swipe-dots .swipe-dot');
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
    itemsContainer.innerHTML = '';
    purchase.items.forEach(item => addItemRow(item));

    // Set the budget type dropdown
    if (purchase.specialBudgetId) {
        budgetTypeSelect.value = purchase.specialBudgetId;
    } else {
        budgetTypeSelect.value = 'monthly';
    }
    updateCustomDropdownValue('budget-type-select', 'budget-type-label');

    purchaseFormTitle.textContent = 'Edytuj istniejący zakup';
    purchaseFormSubmitBtn.textContent = 'Zaktualizuj zakup';
    purchaseFormSubmitBtn.classList.replace('bg-blue-600', 'bg-green-600');
    purchaseFormSubmitBtn.classList.replace('hover:bg-blue-700', 'hover:bg-green-700');
    document.getElementById('cancel-edit-btn').classList.remove('hidden');

    updatePurchaseSummary();
    switchTab('add');
}

function exitEditMode() {
    editMode.active = false;
    editMode.purchaseId = null;

    purchaseForm.reset();
    itemsContainer.innerHTML = '';
    const dateEl = document.getElementById('date');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    budgetTypeSelect.value = 'monthly'; // Reset budget dropdown
    if (typeof updateCustomDropdownValue === 'function') {
        updateCustomDropdownValue('budget-type-select', 'budget-type-label');
    }
    addItemRow();

    purchaseFormTitle.textContent = 'Dodaj nowy zakup ręcznie';
    purchaseFormSubmitBtn.textContent = 'Zapisz cały zakup';
    purchaseFormSubmitBtn.classList.replace('bg-green-600', 'bg-blue-600');
    purchaseFormSubmitBtn.classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
    document.getElementById('cancel-edit-btn').classList.add('hidden');

    // Ensure scanner is hidden when resetting form
    document.getElementById('scanner-container')?.classList.add('hidden');

    updatePurchaseSummary();
}

// --- Modale ---
function renderCategoryDetailsModal(category, items) {
    categoryDetailsTitle.textContent = `Szczegóły dla: ${category.charAt(0).toUpperCase() + category.slice(1)}`;
    categoryDetailsTableBody.innerHTML = '';

    if (items.length === 0) {
        categoryDetailsTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Brak produktów w tej kategorii.</td></tr>';
    } else {
        items.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
        items.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${item.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${item.shop || 'Brak'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${item.purchaseDate}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">${(item.price || 0).toFixed(2)} zł</td>
            `;
            categoryDetailsTableBody.appendChild(row);
        });
    }
    categoryDetailsModal.classList.remove('hidden');
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
    console.log("File selection initiated.");
    currentFile = event.target.files[0]; // sets currentFile from app.js
    if (currentFile) {
        console.log(`File selected: ${currentFile.name} (Type: ${currentFile.type})`);
        if (currentFile.type.startsWith('image/')) {
            imagePreview.src = URL.createObjectURL(currentFile);
            imagePreviewContainer.classList.remove('hidden');
            console.log("Image preview updated.");
        } else {
            imagePreviewContainer.classList.add('hidden');
            console.log("Non-image file selected, hiding preview.");
        }

        // --- FIX: Automatically trigger analysis and switch to 'add' tab ---
        console.log("Attempting to call handleAnalyzeReceipt...");
        try {
            // Ensure handleAnalyzeReceipt is accessible globally or imported
            if (typeof handleAnalyzeReceipt === 'function') {
                handleAnalyzeReceipt();
                console.log("handleAnalyzeReceipt() called successfully.");

                // --- NEW: Switch to 'add' tab after analysis starts ---
                console.log("Switching to 'add' tab.");
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
        console.log("No file was selected.");
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
function toggleBudgetDetails() {
    // Funkcja działa tylko na urządzeniach mobilnych
    if (window.innerWidth >= 1024) {
        return;
    }

    const container = document.getElementById('budget-progress-container');
    const text = document.getElementById('toggle-budget-text');
    const icon = document.getElementById('toggle-budget-icon');

    const isHidden = container.classList.contains('hidden');

    if (isHidden) {
        container.classList.remove('hidden');
        text.textContent = 'Ukryj szczegóły budżetu';
        icon.classList.add('rotate-180');
    } else {
        container.classList.add('hidden');
        text.textContent = 'Pokaż szczegóły budżetu';
        icon.classList.remove('rotate-180');
    }
}

function toggleChartLegend() {
    const legendContainer = document.getElementById('interactive-legend-container');
    const icon = document.getElementById('toggle-legend-icon');
    const text = document.getElementById('toggle-legend-text');

    const isHidden = legendContainer.classList.contains('hidden');

    legendContainer.classList.toggle('hidden');
    icon.classList.toggle('rotate-180');

    if (legendContainer.classList.contains('hidden')) {
        text.textContent = 'Pokaż legendę';
    } else {
        text.textContent = 'Ukryj legendę';
    }
}