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
}



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
    fp.setDate(purchase.date); // Use flatpickr's setDate method
    itemsContainer.innerHTML = '';
    purchase.items.forEach(item => addItemRow(item));

    // Set the budget type dropdown
    if (purchase.specialBudgetId) {
        budgetTypeSelect.value = purchase.specialBudgetId;
    } else {
        budgetTypeSelect.value = 'monthly';
    }

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
    fp.setDate(new Date()); // Reset date using flatpickr's setDate
    budgetTypeSelect.value = 'monthly'; // Reset budget dropdown
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

// --- Obsługa gestu powrotu (swipe w prawo) ---
let touchstartX = 0;
let touchendX = 0;

function checkSwipe() {
    // Jeśli swipujemy od lewej do prawej (min 100px)
    if (touchendX - touchstartX > 100) {
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab) {
            if (activeTab.id.startsWith('settings-')) {
                switchTab('settings');
            } else if (activeTab.id === 'settings-tab') {
                switchTab('more');
            }
        }
    }
}

document.addEventListener('touchstart', e => {
    touchstartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', e => {
    touchendX = e.changedTouches[0].screenX;
    checkSwipe();
}, { passive: true });