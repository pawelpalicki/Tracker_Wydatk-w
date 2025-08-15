// Tracker Wydatków - UI Functions

// --- Nawigacja i zakładki ---
function switchTab(tabName) {
    navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
    if (tabName !== 'add') exitEditMode();
    if (tabName === 'stats') renderStatistics();
    if (tabName === 'settings') {
        renderCategoriesList();
        populateBudgetMonthSelector(); // Upewnij się, że selektor jest wypełniony
        renderBudgetInputs();
        renderRecurringExpenses();
    }
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
    addItemRow();

    purchaseFormTitle.textContent = 'Dodaj nowy zakup ręcznie';
    purchaseFormSubmitBtn.textContent = 'Zapisz cały zakup';
    purchaseFormSubmitBtn.classList.replace('bg-green-600', 'bg-blue-600');
    purchaseFormSubmitBtn.classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
    document.getElementById('cancel-edit-btn').classList.add('hidden');

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
        cameraView.classList.remove('hidden');
        cameraStreamEl.srcObject = cameraStream;
    } catch (err) {
        alert("Nie udało się uzyskać dostępu do aparatu. Sprawdź uprawnienia w przeglądarce.");
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }
    cameraView.classList.add('hidden');
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
    currentFile = event.target.files[0];
    if (currentFile) {
        if (currentFile.type.startsWith('image/')) {
            imagePreview.src = URL.createObjectURL(currentFile);
            imagePreviewContainer.classList.remove('hidden');
        } else {
            imagePreviewContainer.classList.add('hidden');
        }
    } else {
        imagePreviewContainer.classList.add('hidden');
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
    const container = document.getElementById('budget-progress-container');
    const button = document.getElementById('toggle-budget-details');
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