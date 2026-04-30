import state from '../core/state.js';
import { apiCall, apiCallWithFile } from '../core/api.js';
import { formatAmount } from '../shared/format.js';
import { switchTab, acquireOverlayNavigationLock, releaseOverlayNavigationLock, hasVisibleBlockingOverlay } from '../shared/ui.js';
import { applyCategorySelectionState, openHierarchicalCategoryDrawer } from '../shared/categories.js';
import {
    buildTagsSummary,
    getDefaultTagValues,
    getTagDefaultValue,
    getTagGroups,
    getTagGroupLabel,
    getTagLabel,
    openTagsDrawer
} from '../shared/tags.js';

let purchaseFormInitialized = false;
let productDrawerInitialized = false;
let voiceExpenseInitialized = false;
let productDrawerTags = {};

const analysisAnimation = createAnalysisAnimation();

function el(id) {
    return document.getElementById(id);
}

function purchaseFormEl() {
    return el('purchase-form');
}

function itemsContainerEl() {
    return el('items-container');
}

function purchaseSummaryEl() {
    return el('purchase-summary');
}

export function initPurchaseForm() {
    if (purchaseFormInitialized) {
        initProductDrawer();
        initVoiceExpense();
        return;
    }
    purchaseFormInitialized = true;

    initProductDrawer();
    initVoiceExpense();

    purchaseFormEl()?.addEventListener('submit', handlePurchaseFormSubmit);
    el('cancel-edit-btn')?.addEventListener('click', () => {
        exitEditMode();
        switchTab('list');
    });
    el('add-item-btn')?.addEventListener('click', () => openProductDrawer());
    itemsContainerEl()?.addEventListener('input', (e) => {
        if (e.target.classList.contains('item-price') || e.target.classList.contains('item-name')) {
            updatePurchaseSummary();
        }
    });

    el('analyze-receipt-btn')?.addEventListener('click', handleAnalyzeReceipt);
    el('receipt-file-input')?.addEventListener('change', handleFileSelect);
    el('start-camera-btn')?.addEventListener('click', startCamera);
    el('cancel-camera-btn')?.addEventListener('click', stopCamera);
    el('capture-photo-btn')?.addEventListener('click', capturePhoto);

    initShopAutocomplete();
    initBudgetTypeButton();
    initFabActions();
}

export function updatePurchaseSummary() {
    const total = state.currentPurchaseItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
    const summary = purchaseSummaryEl();
    if (summary) summary.textContent = `Suma: ${formatAmount(total)}`;
}

export function clearPurchaseItems() {
    state.currentPurchaseItems = [];
    renderPurchaseItems();
}

export function addItemRow(item = {}) {
    const defaultTags = getDefaultTagValues();
    state.currentPurchaseItems.push({
        name: item.name || '',
        price: typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0),
        category: item.category || 'Inne',
        subCategory: item.subCategory || '',
        tags: Object.assign({}, defaultTags, item.tags || {})
    });
    renderPurchaseItems();
}

export function renderPurchaseItems() {
    const container = itemsContainerEl();
    if (!container) return;
    container.innerHTML = '';

    state.currentPurchaseItems.forEach((item, index) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'glass-card rounded-xl p-3 mb-2 flex flex-col gap-2 relative border border-white/5 bg-white/5';

        let labelText = item.category || 'Inne';
        if (item.subCategory) labelText += ` / ${item.subCategory}`;

        const parentCat = state.structuredCategories.find(c => c.name === item.category && !c.parentId);
        const subCat = parentCat
            ? state.structuredCategories.find(c => c.name === item.subCategory && c.parentId === parentCat.id)
            : null;
        const iconName = (subCat && subCat.icon) || (parentCat && parentCat.icon) || 'fa-tag';
        const color = (parentCat && parentCat.color) || '#6b7280';

        const tagsHtml = item.tags && typeof item.tags === 'object'
            ? getTagGroups()
                .filter(group => item.tags[group])
                .map(group => {
                    const groupLabel = getTagGroupLabel(group);
                    const tagLabel = getTagLabel(group, item.tags[group]) || item.tags[group];
                    return `<span class="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-gray-400">${groupLabel.charAt(0)}: <span class="text-gray-200 font-medium">${tagLabel}</span></span>`;
                }).join('')
            : '';

        itemRow.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg" style="background-color: ${color}20; color: ${color}">
                    <i class="fas ${iconName} text-lg"></i>
                </div>
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
                    <div class="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
                        <div class="flex flex-wrap gap-1.5">${tagsHtml}</div>
                        <div class="flex gap-1 ml-2">
                            <button type="button" class="edit-item-btn text-white/60 hover:text-white hover:bg-white/10 w-8 h-8 flex items-center justify-center rounded-lg transition-all" data-index="${index}">
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
        container.appendChild(itemRow);
    });

    container.querySelectorAll('.edit-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openProductDrawer(parseInt(e.currentTarget.dataset.index, 10)));
    });

    container.querySelectorAll('.remove-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.dataset.index, 10);
            state.currentPurchaseItems.splice(index, 1);
            renderPurchaseItems();
        });
    });

    updatePurchaseSummary();
}

function initProductDrawer() {
    if (productDrawerInitialized) return;

    const drawerOverlay = el('product-drawer-overlay');
    const drawer = el('product-drawer');
    const closeBtn = el('close-product-drawer');
    const form = el('product-drawer-form');
    const categoryBtn = el('product-drawer-category-btn');
    const tagsBtn = el('product-drawer-tags-btn');
    if (!drawer || !drawerOverlay || !form) return;

    productDrawerInitialized = true;

    closeBtn?.addEventListener('click', closeProductDrawer);
    drawerOverlay.addEventListener('click', (e) => {
        if (e.target === drawerOverlay) closeProductDrawer();
    });

    tagsBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        openTagsDrawer(productDrawerTags, (newTags) => {
            productDrawerTags = newTags;
            const summary = el('product-drawer-tags-summary');
            if (summary) summary.textContent = buildTagsSummary(newTags);
        });
    });

    categoryBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const currentVal = el('product-drawer-category-value')?.value || '';
        const [currentCat, currentSub] = currentVal.split('|');
        openHierarchicalCategoryDrawer(drawer, currentCat || '', currentSub || '', (parentName, subName) => {
            applyCategorySelectionState({
                valueEl: el('product-drawer-category-value'),
                labelEl: el('product-drawer-category-label'),
                iconEl: el('product-drawer-category-icon')
            }, parentName, subName, 'Wybierz kategorie');
        });
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const indexStr = el('product-drawer-index')?.value || '';
        const name = el('product-drawer-name')?.value.trim() || '';
        const price = parseFloat(el('product-drawer-price')?.value || '0');
        const compositeCat = el('product-drawer-category-value')?.value || 'Inne';

        let category = 'Inne';
        let subCategory = '';
        if (compositeCat.includes('|')) {
            [category, subCategory] = compositeCat.split('|');
        } else {
            category = compositeCat;
        }

        const newItem = {
            name,
            price,
            category,
            subCategory,
            tags: Object.assign({}, productDrawerTags)
        };

        if (category && !state.allCategories.includes(category)) {
            state.allCategories.push(category);
            state.allCategories.sort();
        }

        if (indexStr !== '') {
            state.currentPurchaseItems[parseInt(indexStr, 10)] = newItem;
        } else {
            state.currentPurchaseItems.push(newItem);
        }

        renderPurchaseItems();
        closeProductDrawer();
    });
}

export function openProductDrawer(index = null) {
    const drawerOverlay = el('product-drawer-overlay');
    const drawer = el('product-drawer');
    const title = el('product-drawer-title');
    const form = el('product-drawer-form');
    const idxInput = el('product-drawer-index');
    const nameInput = el('product-drawer-name');
    const priceInput = el('product-drawer-price');
    const catValue = el('product-drawer-category-value');
    const catLabel = el('product-drawer-category-label');
    const catIcon = el('product-drawer-category-icon');
    if (!drawerOverlay || !drawer || !title || !form || !idxInput || !nameInput || !priceInput) return;

    if (index !== null && index >= 0 && index < state.currentPurchaseItems.length) {
        title.textContent = 'Edytuj produkt';
        const item = state.currentPurchaseItems[index];
        idxInput.value = String(index);
        nameInput.value = item.name;
        priceInput.value = Number(item.price || 0).toFixed(2);
        applyCategorySelectionState({ valueEl: catValue, labelEl: catLabel, iconEl: catIcon }, item.category, item.subCategory, 'Wybierz kategorie');
        productDrawerTags = Object.assign({}, getDefaultTagValues(), item.tags || {});
    } else {
        title.textContent = 'Dodaj produkt';
        form.reset();
        idxInput.value = '';
        applyCategorySelectionState({ valueEl: catValue, labelEl: catLabel, iconEl: catIcon }, 'Inne', '', 'Wybierz kategorie');
        productDrawerTags = Object.assign({}, getDefaultTagValues());
    }

    const tagsSummary = el('product-drawer-tags-summary');
    if (tagsSummary) tagsSummary.textContent = buildTagsSummary(productDrawerTags);

    const wasAlreadyOpen = drawerOverlay.classList.contains('active') || !drawerOverlay.classList.contains('hidden');
    if (!wasAlreadyOpen) acquireOverlayNavigationLock();

    drawerOverlay.classList.remove('hidden');
    drawer.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        drawerOverlay.classList.add('active');
        drawer.classList.add('active');
    }, 10);
    setTimeout(() => nameInput.focus(), 300);
}

export function closeProductDrawer() {
    const drawerOverlay = el('product-drawer-overlay');
    const drawer = el('product-drawer');
    if (!drawerOverlay || !drawer) return;

    releaseOverlayNavigationLock();
    drawerOverlay.classList.remove('active');
    drawer.classList.remove('active');

    setTimeout(() => {
        drawerOverlay.classList.add('hidden');
        drawer.classList.add('hidden');
        if (!hasVisibleBlockingOverlay()) document.body.style.overflow = '';
    }, 300);
}

export async function handlePurchaseFormSubmit(e) {
    e.preventDefault();

    if (state.currentPurchaseItems.length === 0) {
        alert('Dodaj przynajmniej jedna pozycje do zakupu.');
        return;
    }

    const purchaseData = {
        shop: el('shop')?.value || '',
        date: el('date')?.value || new Date().toISOString().split('T')[0],
        specialBudgetId: state.budgetTypeSelectValue === 'monthly' ? null : state.budgetTypeSelectValue,
        items: state.currentPurchaseItems.map(item => ({
            name: item.name,
            price: item.price,
            category: item.category,
            subCategory: item.subCategory || '',
            tags: item.tags || getDefaultTagValues()
        }))
    };

    try {
        if (state.editMode.active) {
            await apiCall(`/api/purchases/${state.editMode.purchaseId}`, 'PUT', purchaseData);
        } else {
            await apiCall('/api/purchases', 'POST', purchaseData);
        }
        await window.fetchInitialData?.(false);
        switchTab('list');
    } catch (error) {
        alert('Blad zapisu: ' + error.message);
    }
}

export function enterEditMode(purchaseId) {
    const purchase = state.allPurchases.find(p => p.id === purchaseId);
    if (!purchase) return;

    state.editMode.active = true;
    state.editMode.purchaseId = purchaseId;

    const shopInput = el('shop');
    const dateInput = el('date');
    if (shopInput) shopInput.value = purchase.shop || '';
    if (dateInput) dateInput.value = purchase.date || new Date().toISOString().split('T')[0];

    state.currentPurchaseItems = (purchase.items || []).map(item => ({
        name: item.name || '',
        price: typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0),
        category: item.category || 'Inne',
        subCategory: item.subCategory || '',
        tags: Object.assign({}, getDefaultTagValues(), purchase.tags || {}, item.tags || {})
    }));
    renderPurchaseItems();

    setPurchaseBudgetType(purchase.specialBudgetId || 'monthly');

    const navTitle = el('nav-title');
    if (navTitle) navTitle.textContent = 'Edytuj istniejacy zakup';
    const submitBtn = purchaseFormEl()?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Zaktualizuj zakup';
    el('cancel-edit-btn')?.classList.remove('hidden');

    updatePurchaseSummary();
    switchTab('add', true);
}

export function exitEditMode() {
    state.editMode.active = false;
    state.editMode.purchaseId = null;

    purchaseFormEl()?.reset();
    state.currentPurchaseItems = [];
    const container = itemsContainerEl();
    if (container) container.innerHTML = '';
    const dateInput = el('date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    setPurchaseBudgetType('monthly');

    const activeTab = document.querySelector('.tab-content.active')?.id.replace('-tab', '');
    if (activeTab === 'add') {
        const navTitle = el('nav-title');
        if (navTitle) navTitle.textContent = 'Dodaj zakup';
    }

    const submitBtn = purchaseFormEl()?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Zapisz caly zakup';
    el('cancel-edit-btn')?.classList.add('hidden');
    el('scanner-container')?.classList.add('hidden');
    updatePurchaseSummary();
}

export function setPurchaseBudgetType(value = 'monthly', label = null) {
    state.budgetTypeSelectValue = value || 'monthly';
    const selectedBudget = state.allSpecialBudgets.find(b => b.id === state.budgetTypeSelectValue);
    const resolvedLabel = label || (state.budgetTypeSelectValue === 'monthly' ? 'Miesieczny' : (selectedBudget?.name || 'Specjalny'));
    const labelEl = el('budget-type-label');
    const iconEl = el('budget-type-icon');
    if (labelEl) labelEl.textContent = resolvedLabel;
    if (iconEl) iconEl.innerHTML = `<span>${state.budgetTypeSelectValue === 'monthly' ? '📅' : '⭐'}</span>`;
}

function initBudgetTypeButton() {
    el('budget-type-btn')?.addEventListener('click', () => {
        const options = [{ value: 'monthly', label: 'Miesieczny', icon: '📅' }];
        state.allSpecialBudgets.forEach(budget => {
            options.push({ value: budget.id, label: budget.name, icon: '⭐' });
        });

        window.openSelectionDrawer?.('Wybierz budzet', options, (value, label) => {
            setPurchaseBudgetType(value, label);
        }, state.budgetTypeSelectValue);
    });
}

export async function resizeImage(file, maxSize = 1400, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            let { width, height } = image;

            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height *= maxSize / width;
                    width = maxSize;
                } else {
                    width *= maxSize / height;
                    height = maxSize;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.filter = 'contrast(1.1) brightness(1.05)';
            ctx.drawImage(image, 0, 0, width, height);

            canvas.toBlob(blob => {
                URL.revokeObjectURL(image.src);
                resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            }, 'image/jpeg', quality);
        };
        image.onerror = reject;
        image.src = URL.createObjectURL(file);
    });
}

export async function handleAnalyzeReceipt() {
    if (!state.currentFile) {
        alert('Prosze, wybierz najpierw plik z paragonem.');
        return;
    }

    const globalLoader = el('global-analysis-loader');
    if (globalLoader) globalLoader.classList.remove('hidden');

    const scannerContainer = el('scanner-container');
    const scannerControls = el('scanner-controls');
    const analysisSpinnerEl = el('analysis-spinner');
    const imagePreview = el('image-preview-container');
    const animationContainer = el('analysis-animation-container');

    if (scannerContainer) {
        scannerContainer.classList.remove('hidden');
        scannerContainer.style.minHeight = '350px';
    }

    if (animationContainer) {
        scannerControls?.classList.add('hidden');
        analysisSpinnerEl?.classList.add('hidden');
        imagePreview?.classList.add('hidden');
        Object.assign(animationContainer.style, {
            display: 'flex',
            position: 'absolute',
            top: '-1.5rem',
            left: '0.2rem',
            right: '0.2rem',
            bottom: '0.5rem',
            width: 'calc(100% )',
            height: 'calc(100% )',
            minHeight: '0',
            padding: '0',
            margin: '0',
            maxWidth: 'none',
            border: 'none',
            background: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(10px)',
            zIndex: '10',
            boxSizing: 'border-box'
        });
    }

    analysisAnimation.start();
    el('analyze-receipt-btn')?.setAttribute('disabled', 'disabled');
    el('image-preview-container')?.classList.add('hidden');

    try {
        let fileToSend = state.currentFile;
        if (state.currentFile.type.startsWith('image/')) {
            fileToSend = await resizeImage(state.currentFile);
        }
        const { analysis } = await apiCallWithFile('/api/analyze-receipt', fileToSend);
        await fillFormWithAnalysis(analysis);
    } catch (error) {
        alert('Wystapil blad podczas analizy paragonu. Sprobuj ponownie. Blad: ' + error.message);
    } finally {
        if (globalLoader) globalLoader.classList.add('hidden');
        if (animationContainer) animationContainer.style.display = 'none';
        analysisAnimation.stop();

        const analyzeBtn = el('analyze-receipt-btn');
        if (analyzeBtn) analyzeBtn.disabled = false;
        const receiptInput = el('receipt-file-input');
        if (receiptInput) receiptInput.value = '';
        state.currentFile = null;
        if (scannerContainer) {
            scannerContainer.style.minHeight = '';
            scannerContainer.classList.add('hidden');
        }
    }
}

export async function fillFormWithAnalysis(analysis) {
    const shopInput = el('shop');
    const dateInput = el('date');
    if (shopInput) shopInput.value = analysis.shop || '';
    if (dateInput) dateInput.value = analysis.date || new Date().toISOString().split('T')[0];
    const container = itemsContainerEl();
    if (container) container.innerHTML = '';

    if (analysis.originalCurrency && analysis.originalCurrency !== 'PLN') {
        const rate = analysis.exchangeRate ? analysis.exchangeRate.toFixed(4) : 'nieznany';
        const itemCount = (analysis.items || []).length;
        const originalTotal = (analysis.items || []).reduce((sum, item) => sum + (item.price / (analysis.exchangeRate || 1)), 0);
        const convertedTotal = (analysis.items || []).reduce((sum, item) => sum + item.price, 0);

        if (analysis.rateSuccess === false) {
            const userRate = prompt(
                `Nie udalo sie automatycznie pobrac kursu wymiany dla ${analysis.originalCurrency}!\n\n` +
                `Wykryto ${itemCount} produktow za laczna kwote ${originalTotal.toFixed(2)} ${analysis.originalCurrency}.\n\n` +
                `Wprowadz kurs wymiany recznie (np. 4.32 dla EUR):\n` +
                `1 ${analysis.originalCurrency} = ? PLN`,
                '1.0'
            );

            if (userRate && !Number.isNaN(parseFloat(userRate)) && parseFloat(userRate) > 0) {
                try {
                    const originalItems = (analysis.items || []).map(item => ({
                        ...item,
                        price: item.price / (analysis.exchangeRate || 1)
                    }));

                    const conversionResult = await apiCall('/api/convert-currency', 'POST', {
                        items: originalItems,
                        fromCurrency: analysis.originalCurrency,
                        exchangeRate: parseFloat(userRate)
                    });

                    analysis.items = conversionResult.items;
                    analysis.exchangeRate = conversionResult.exchangeRate;
                    analysis.rateSuccess = true;
                    const newConvertedTotal = conversionResult.items.reduce((sum, item) => sum + item.price, 0);
                    alert(`Kurs zostal zaktualizowany.\n\nKurs: 1 ${analysis.originalCurrency} = ${userRate} PLN\nSuma oryginalna: ${originalTotal.toFixed(2)} ${analysis.originalCurrency}\nSuma po przeliczeniu: ${newConvertedTotal.toFixed(2)} PLN`);
                } catch (error) {
                    alert('Blad podczas recznego przeliczania kursu: ' + error.message);
                    return;
                }
            } else {
                alert('Anulowano przeliczenie. Ceny moga byc nieprawidlowe.');
            }
        } else {
            alert(
                `Wykryto paragon w walucie obcej: ${analysis.originalCurrency}.\n\n` +
                `Dokonano automatycznego przeliczenia na PLN.\n\n` +
                `Kurs: 1 ${analysis.originalCurrency} ~= ${rate} PLN\n` +
                `Suma oryginalna: ${(originalTotal || 0).toFixed(2)} ${analysis.originalCurrency}\n` +
                `Suma po przeliczeniu: ${formatAmount(convertedTotal)}\n\n` +
                `Sprawdz, czy kwoty w formularzu sa poprawne.`
            );
        }
    }

    const processedItems = (analysis.items || []).map(item => {
        const rawPrice = item.price ? item.price.toString().replace(',', '.') : '0';
        const parsedPrice = parseFloat(rawPrice);
        return {
            ...item,
            price: Number.isNaN(parsedPrice) ? 0 : parseFloat(parsedPrice.toFixed(2))
        };
    });

    state.currentPurchaseItems = processedItems.map(item => normalizeAnalyzedItem(item));
    renderPurchaseItems();
    updatePurchaseSummary();
    alert('Gotowe! Analiza AI zakonczona. Sprawdz i uzupelnij dane, a nastepnie zapisz caly zakup.');
}

function normalizeAnalyzedItem(item) {
    let categoryName = item.category || 'Inne';
    let subCategoryName = item.subCategory || '';

    const parentCat = state.structuredCategories.find(c =>
        c.name.toLowerCase() === categoryName.toLowerCase() && !c.parentId
    );

    if (parentCat) {
        categoryName = parentCat.name;
        if (subCategoryName) {
            const subCat = state.structuredCategories.find(c =>
                c.name.toLowerCase() === subCategoryName.toLowerCase() &&
                c.parentId === parentCat.id
            );
            subCategoryName = subCat ? subCat.name : '';
        }
    } else {
        categoryName = 'Inne';
        subCategoryName = '';
    }

    const tags = {};
    getTagGroups().forEach(group => {
        const aiValue = item.tags && item.tags[group];
        tags[group] = aiValue || getTagDefaultValue(group);
    });

    return {
        name: item.name || '',
        price: typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0),
        category: categoryName,
        subCategory: subCategoryName,
        tags
    };
}

export async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
        alert('Twoja przegladarka nie wspiera dostepu do aparatu.');
        return;
    }

    try {
        state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        el('scanner-container')?.classList.remove('hidden');
        el('scanner-controls')?.classList.add('hidden');
        el('camera-view')?.classList.remove('hidden');
        const cameraStreamEl = el('camera-stream');
        if (cameraStreamEl) cameraStreamEl.srcObject = state.cameraStream;

        setTimeout(() => el('capture-photo-btn')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
    } catch (err) {
        alert('Nie udalo sie uzyskac dostepu do aparatu. Sprawdz uprawnienia w przegladarce.');
    }
}

export function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
    }
    el('camera-view')?.classList.add('hidden');
    el('scanner-controls')?.classList.remove('hidden');
    state.cameraStream = null;
}

export function capturePhoto() {
    const cameraStreamEl = el('camera-stream');
    if (!cameraStreamEl) return;

    const canvas = document.createElement('canvas');
    canvas.width = cameraStreamEl.videoWidth;
    canvas.height = cameraStreamEl.videoHeight;
    canvas.getContext('2d').drawImage(cameraStreamEl, 0, 0);
    stopCamera();
    canvas.toBlob(blob => {
        state.currentFile = new File([blob], 'paragon.jpg', { type: 'image/jpeg' });
        handleAnalyzeReceipt();
    }, 'image/jpeg');
}

export function handleFileSelect(event) {
    state.currentFile = event.target.files[0] || null;
    const imagePreview = el('image-preview');
    const previewContainer = el('image-preview-container');

    if (!state.currentFile) {
        previewContainer?.classList.add('hidden');
        return;
    }

    if (state.currentFile.type.startsWith('image/')) {
        if (imagePreview) imagePreview.src = URL.createObjectURL(state.currentFile);
        previewContainer?.classList.remove('hidden');
    } else {
        previewContainer?.classList.add('hidden');
    }

    try {
        handleAnalyzeReceipt();
        switchTab('add');
    } catch (error) {
        console.error('Error calling handleAnalyzeReceipt:', error);
    }
}

function initShopAutocomplete() {
    const shopInput = el('shop');
    const list = el('shop-autocomplete-list');
    if (!shopInput || !list) return;

    shopInput.addEventListener('input', () => renderShopAutocomplete(shopInput.value));
    shopInput.addEventListener('focus', () => renderShopAutocomplete(shopInput.value));
    list.addEventListener('click', (e) => {
        if (e.target.tagName === 'DIV') {
            shopInput.value = e.target.textContent;
            list.classList.add('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!shopInput.contains(e.target) && !list.contains(e.target)) {
            list.classList.add('hidden');
        }
    });
}

export function renderShopAutocomplete(query) {
    const list = el('shop-autocomplete-list');
    if (!list) return;

    if (!query) {
        list.classList.add('hidden');
        return;
    }

    const filteredShops = state.allShops.filter(shop => shop.toLowerCase().includes(query.toLowerCase()));
    if (filteredShops.length === 0) {
        list.classList.add('hidden');
        return;
    }

    list.innerHTML = filteredShops
        .map(shop => `<div class="p-2 hover:bg-gray-100 dark:hover:bg-gray-500 cursor-pointer">${shop}</div>`)
        .join('');
    list.classList.remove('hidden');
}

function initFabActions() {
    const mainFabBtn = el('main-fab-btn');
    const fabActions = el('fab-actions');
    const fabOverlay = el('fab-overlay');
    if (!mainFabBtn || !fabActions || !fabOverlay) return;

    const closeFabActionsMenu = () => {
        fabActions.classList.add('opacity-0', 'translate-y-4');
        fabActions.classList.remove('opacity-100', 'translate-y-0');
        fabOverlay.classList.add('hidden');
        fabOverlay.classList.remove('pointer-events-auto');
        mainFabBtn.classList.remove('expanded');
        setTimeout(() => fabActions.classList.add('hidden'), 300);
    };

    mainFabBtn.addEventListener('click', () => {
        const isHidden = fabActions.classList.contains('hidden');
        if (isHidden) {
            fabActions.classList.remove('hidden', 'opacity-0', 'translate-y-4');
            fabActions.classList.add('opacity-100', 'translate-y-0');
            fabOverlay.classList.remove('hidden');
            fabOverlay.classList.add('pointer-events-auto');
            mainFabBtn.classList.add('expanded');
        } else {
            closeFabActionsMenu();
        }
    });

    fabOverlay.addEventListener('click', closeFabActionsMenu);
    el('fab-add-manual-btn')?.addEventListener('click', () => {
        closeFabActionsMenu();
        exitEditMode();
        clearPurchaseItems();
        switchTab('add');
        setTimeout(() => el('shop')?.focus(), 100);
    });
    el('fab-select-file-btn')?.addEventListener('click', () => {
        closeFabActionsMenu();
        el('receipt-file-input')?.click();
    });
    el('fab-voice-expense-btn')?.addEventListener('click', () => {
        closeFabActionsMenu();
        openVoiceExpenseModal();
    });
    el('fab-scan-receipt-btn')?.addEventListener('click', () => {
        closeFabActionsMenu();
        switchTab('add');
        setTimeout(() => startCamera(), 100);
    });
}

function createAnalysisAnimation() {
    let canvas;
    let ctx;
    let rafId = null;
    let dotsIntervalId = null;
    let t = 0;

    function draw() {
        if (!ctx || !canvas) return;
        const w = canvas.width;
        const h = canvas.height;
        t += 1;

        ctx.clearRect(0, 0, w, h);
        const gradient = ctx.createLinearGradient(0, 0, w, h);
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(1, '#111827');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#f8fafc';
        roundRect(ctx, 44, 22, 130, 164, 18);
        ctx.fill();

        const scanY = 50 + ((t * 2) % 118);
        ctx.fillStyle = 'rgba(96, 165, 250, 0.16)';
        ctx.fillRect(54, 48, 110, scanY - 48);
        ctx.strokeStyle = '#67e8f9';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(52, scanY);
        ctx.lineTo(166, scanY);
        ctx.stroke();

        ctx.fillStyle = '#475569';
        ctx.font = '700 10px monospace';
        ctx.fillText('PARAGON', 60, 44);
        for (let i = 0; i < 8; i += 1) {
            const y = 66 + i * 14;
            const width = 56 + ((i * 17) % 46);
            ctx.globalAlpha = y < scanY ? 0.9 : 0.25;
            roundRect(ctx, 60, y, width, 4, 3);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        const robotX = 250;
        const robotY = 102 + Math.sin(t * 0.05) * 4;
        ctx.strokeStyle = 'rgba(103, 232, 249, 0.35)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(robotX - 20, robotY);
        ctx.lineTo(174, scanY);
        ctx.stroke();

        ctx.fillStyle = '#1a2436';
        roundRect(ctx, robotX - 36, robotY - 32, 72, 52, 18);
        ctx.fill();
        ctx.fillStyle = '#38bdf8';
        roundRect(ctx, robotX - 22, robotY - 18, 44, 20, 10);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(robotX - 10, robotY - 8, 3, 0, Math.PI * 2);
        ctx.arc(robotX + 10, robotY - 8, 3, 0, Math.PI * 2);
        ctx.fill();

        rafId = requestAnimationFrame(draw);
    }

    return {
        start() {
            canvas = el('analysis-scan-canvas');
            if (!canvas) return;
            ctx = canvas.getContext('2d');
            canvas.width = 360;
            canvas.height = 208;
            t = 0;
            if (rafId) cancelAnimationFrame(rafId);
            draw();

            const dotsEl = el('dots');
            let dotState = 0;
            if (dotsIntervalId) clearInterval(dotsIntervalId);
            dotsIntervalId = setInterval(() => {
                if (dotsEl) {
                    dotState = (dotState + 1) % 4;
                    dotsEl.textContent = ['.', '..', '...', ''][dotState];
                }
            }, 500);
        },
        stop() {
            if (rafId) cancelAnimationFrame(rafId);
            if (dotsIntervalId) clearInterval(dotsIntervalId);
            rafId = null;
            dotsIntervalId = null;
            if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };
}

function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function initVoiceExpense() {
    if (voiceExpenseInitialized) return;

    const overlay = el('voice-expense-overlay');
    const modal = el('voice-expense-modal');
    const closeBtn = el('voice-expense-close-btn');
    const primaryBtn = el('voice-expense-primary-btn');
    const secondaryBtn = el('voice-expense-secondary-btn');
    const titleEl = el('voice-expense-title');
    const descriptionEl = el('voice-expense-description');
    const hintCardEl = el('voice-expense-hint-card');
    const progressEl = el('voice-expense-progress');
    const progressTitleEl = el('voice-expense-progress-title');
    const progressTextEl = el('voice-expense-progress-text');
    const transcriptSectionEl = el('voice-expense-transcript-section');
    const transcriptInput = el('voice-expense-transcript');
    const recordingIndicatorEl = el('voice-expense-recording-indicator');
    const timerEl = el('voice-expense-timer');
    const statusBadgeEl = el('voice-expense-status-badge');

    if (!overlay || !modal || !primaryBtn || !secondaryBtn || !closeBtn || !transcriptInput) return;
    voiceExpenseInitialized = true;

    const MAX_RECORDING_MS = 55000;
    const voiceState = {
        step: 'intro',
        mediaRecorder: null,
        mediaStream: null,
        audioChunks: [],
        audioBlob: null,
        mimeType: '',
        startedAt: 0,
        timerIntervalId: null,
        autoStopTimeoutId: null,
        isBusy: false,
        discardOnStop: false
    };

    const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

    function updateTimer() {
        if (!timerEl || !voiceState.startedAt) return;
        const elapsedMs = Math.min(Date.now() - voiceState.startedAt, MAX_RECORDING_MS);
        timerEl.textContent = `${formatTime(Math.floor(elapsedMs / 1000))} / ${formatTime(Math.floor(MAX_RECORDING_MS / 1000))}`;
    }

    function startTimer() {
        stopTimer();
        voiceState.startedAt = Date.now();
        updateTimer();
        voiceState.timerIntervalId = window.setInterval(updateTimer, 250);
        voiceState.autoStopTimeoutId = window.setTimeout(() => {
            if (voiceState.mediaRecorder?.state === 'recording') stopRecording(true);
        }, MAX_RECORDING_MS);
    }

    function stopTimer() {
        if (voiceState.timerIntervalId) window.clearInterval(voiceState.timerIntervalId);
        if (voiceState.autoStopTimeoutId) window.clearTimeout(voiceState.autoStopTimeoutId);
        voiceState.timerIntervalId = null;
        voiceState.autoStopTimeoutId = null;
        voiceState.startedAt = 0;
    }

    function stopMediaStream() {
        if (voiceState.mediaStream) {
            voiceState.mediaStream.getTracks().forEach(track => track.stop());
            voiceState.mediaStream = null;
        }
    }

    function supportedRecordingMimeType() {
        if (typeof MediaRecorder === 'undefined') return '';
        return [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg'
        ].find(type => MediaRecorder.isTypeSupported(type)) || '';
    }

    function setBusyState(isBusy) {
        voiceState.isBusy = isBusy;
        primaryBtn.disabled = isBusy;
        secondaryBtn.disabled = isBusy;
        closeBtn.disabled = isBusy;
        primaryBtn.classList.toggle('opacity-70', isBusy);
        secondaryBtn.classList.toggle('opacity-70', isBusy);
        closeBtn.classList.toggle('opacity-70', isBusy);
    }

    function setStatusBadge(step) {
        if (!statusBadgeEl) return;
        const statusMap = {
            intro: { label: 'Tryb glosowy', classes: ['text-brand-400', 'bg-brand-500/10', 'border-brand-500/20'] },
            recording: { label: 'Nagrywanie', classes: ['text-red-300', 'bg-red-500/10', 'border-red-500/20'] },
            transcribing: { label: 'Transkrypcja', classes: ['text-brand-400', 'bg-brand-500/10', 'border-brand-500/20'] },
            review: { label: 'Sprawdz tekst', classes: ['text-amber-300', 'bg-amber-500/10', 'border-amber-500/20'] },
            analyzing: { label: 'Analiza Gemini', classes: ['text-brand-400', 'bg-brand-500/10', 'border-brand-500/20'] },
            success: { label: 'Gotowe', classes: ['text-emerald-300', 'bg-emerald-500/10', 'border-emerald-500/20'] }
        };
        const config = statusMap[step] || statusMap.intro;
        statusBadgeEl.className = 'voice-status-badge inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] border';
        config.classes.forEach(className => statusBadgeEl.classList.add(className));
        const label = statusBadgeEl.querySelector('span:last-child');
        if (label) label.textContent = config.label;
    }

    function renderStep(step) {
        voiceState.step = step;
        setStatusBadge(step);

        progressEl?.classList.add('hidden');
        transcriptSectionEl?.classList.add('hidden');
        recordingIndicatorEl?.classList.add('hidden');
        secondaryBtn.classList.add('hidden');
        hintCardEl?.classList.remove('hidden');

        if (step === 'intro') {
            if (titleEl) titleEl.textContent = 'Dodaj wydatek glosem';
            if (descriptionEl) descriptionEl.textContent = 'Mozesz powiedziec na przyklad: "Wczoraj w Lidlu kupilem chleb za 4,80 i mleko za 3,20".';
            primaryBtn.textContent = 'Rozpocznij nagrywanie';
            primaryBtn.disabled = false;
            transcriptInput.value = '';
        }
        if (step === 'recording') {
            if (titleEl) titleEl.textContent = 'Nagrywam Twoj wydatek';
            if (descriptionEl) descriptionEl.textContent = 'Gdy skonczysz mowic, kliknij zakonczenie nagrywania albo poczekaj na automatyczne zatrzymanie.';
            recordingIndicatorEl?.classList.remove('hidden');
            primaryBtn.textContent = 'Zakoncz nagrywanie';
        }
        if (step === 'transcribing') {
            if (titleEl) titleEl.textContent = 'Przetwarzam nagranie';
            if (descriptionEl) descriptionEl.textContent = 'Wysylam audio do rozpoznania mowy i przygotowuje tekst do Twojej akceptacji.';
            progressEl?.classList.remove('hidden');
            if (progressTitleEl) progressTitleEl.textContent = 'Trwa transkrypcja nagrania';
            if (progressTextEl) progressTextEl.textContent = 'To zwykle zajmuje kilka sekund.';
            primaryBtn.textContent = 'Poczekaj...';
            hintCardEl?.classList.add('hidden');
        }
        if (step === 'review') {
            if (titleEl) titleEl.textContent = 'Sprawdz transkrypcje';
            if (descriptionEl) descriptionEl.textContent = 'Jesli trzeba, popraw tekst recznie. Gdy wszystko sie zgadza, wyslij go do analizy.';
            transcriptSectionEl?.classList.remove('hidden');
            secondaryBtn.classList.remove('hidden');
            primaryBtn.textContent = 'Wyslij do analizy';
            secondaryBtn.textContent = 'Nagraj ponownie';
        }
        if (step === 'analyzing') {
            if (titleEl) titleEl.textContent = 'Analizuje wydatek';
            if (descriptionEl) descriptionEl.textContent = 'Gemini zamienia transkrypcje na uzupelniony formularz zakupu.';
            progressEl?.classList.remove('hidden');
            if (progressTitleEl) progressTitleEl.textContent = 'Trwa analiza wydatku';
            if (progressTextEl) progressTextEl.textContent = 'Za chwile formularz zostanie uzupelniony.';
            transcriptSectionEl?.classList.remove('hidden');
            primaryBtn.textContent = 'Analizuje...';
            secondaryBtn.classList.remove('hidden');
            secondaryBtn.textContent = 'Nagraj ponownie';
            hintCardEl?.classList.add('hidden');
        }
        if (step === 'success') {
            if (titleEl) titleEl.textContent = 'Formularz zostal uzupelniony';
            if (descriptionEl) descriptionEl.textContent = 'Mozesz jeszcze sprawdzic dane i zapisac zakup tak jak zwykle.';
            progressEl?.classList.remove('hidden');
            if (progressTitleEl) progressTitleEl.textContent = 'Gotowe';
            if (progressTextEl) progressTextEl.textContent = 'Za chwile zamkne okno.';
            transcriptSectionEl?.classList.remove('hidden');
            primaryBtn.textContent = 'Zamknij';
            secondaryBtn.classList.add('hidden');
            hintCardEl?.classList.add('hidden');
        }
    }

    function resetRecordingState() {
        stopTimer();
        stopMediaStream();
        voiceState.audioChunks = [];
        voiceState.audioBlob = null;
        voiceState.mimeType = '';
        voiceState.mediaRecorder = null;
        voiceState.discardOnStop = false;
    }

    function closeVoiceExpenseModal() {
        if (voiceState.isBusy) return;
        const wasRecording = voiceState.mediaRecorder?.state === 'recording';
        if (wasRecording) {
            voiceState.discardOnStop = true;
            voiceState.mediaRecorder.stop();
        }
        overlay.classList.add('opacity-0');
        modal.classList.add('opacity-0', 'scale-95');

        window.setTimeout(() => {
            if (!wasRecording) resetRecordingState();
            overlay.classList.add('hidden');
            modal.classList.add('hidden');
            renderStep('intro');
        }, 300);
    }

    async function blobToBase64(blob) {
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result || '').toString().split(',')[1] || '');
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function voiceContextPayload() {
        const now = new Date();
        const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        return {
            localDate,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
            locale: navigator.language || 'pl-PL'
        };
    }

    async function transcribeCurrentAudio() {
        if (!voiceState.audioBlob) throw new Error('Brak nagrania do transkrypcji.');
        const base64 = await blobToBase64(voiceState.audioBlob);
        const extension = voiceState.mimeType.includes('ogg') ? 'ogg' : 'webm';
        const response = await apiCall('/api/transcribe-audio', 'POST', {
            audio: base64,
            mimetype: voiceState.mimeType,
            filename: `voice-expense.${extension}`,
            size: voiceState.audioBlob.size,
            languageCode: 'pl-PL'
        });
        return response.transcript || '';
    }

    async function analyzeTranscript() {
        const transcript = transcriptInput.value.trim();
        if (!transcript) {
            alert('Najpierw przygotuj transkrypcje. Mozesz nagrac ja ponownie albo wpisac recznie.');
            return;
        }

        renderStep('analyzing');
        setBusyState(true);
        try {
            switchTab('add');
            const { analysis } = await apiCall('/api/analyze-voice-expense', 'POST', {
                transcript,
                context: voiceContextPayload()
            });
            await fillFormWithAnalysis(analysis);
            renderStep('success');
            setBusyState(false);
            window.setTimeout(() => {
                if (!voiceState.isBusy) closeVoiceExpenseModal();
            }, 900);
        } catch (error) {
            setBusyState(false);
            renderStep('review');
            alert(`Nie udalo sie przeanalizowac tekstu. ${error.message}`);
        }
    }

    async function startRecording() {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            alert('Ta przegladarka nie obsluguje stabilnego nagrywania audio dla tej funkcji.');
            return;
        }
        const mimeType = supportedRecordingMimeType();
        if (!mimeType) {
            alert('Ta przegladarka nie obsluguje wymaganego formatu nagrania audio.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType });
            voiceState.mediaStream = stream;
            voiceState.mediaRecorder = recorder;
            voiceState.audioChunks = [];
            voiceState.audioBlob = null;
            voiceState.mimeType = mimeType;

            recorder.addEventListener('dataavailable', event => {
                if (event.data && event.data.size > 0) voiceState.audioChunks.push(event.data);
            });
            recorder.addEventListener('stop', async () => {
                stopTimer();
                stopMediaStream();
                if (voiceState.discardOnStop) {
                    resetRecordingState();
                    return;
                }
                if (!voiceState.audioChunks.length) {
                    renderStep('intro');
                    alert('Nagranie jest puste. Sprobuj jeszcze raz.');
                    return;
                }
                voiceState.audioBlob = new Blob(voiceState.audioChunks, { type: voiceState.mimeType });
                renderStep('transcribing');
                setBusyState(true);
                try {
                    const transcript = await transcribeCurrentAudio();
                    transcriptInput.value = transcript;
                    renderStep('review');
                    setBusyState(false);
                    transcriptInput.focus();
                    transcriptInput.setSelectionRange(transcriptInput.value.length, transcriptInput.value.length);
                } catch (error) {
                    setBusyState(false);
                    renderStep('intro');
                    alert(`Nie udalo sie przygotowac transkrypcji. ${error.message}`);
                }
            });
            recorder.addEventListener('error', () => {
                stopTimer();
                stopMediaStream();
                setBusyState(false);
                renderStep('intro');
                alert('Wystapil problem podczas nagrywania audio. Sprobuj ponownie.');
            });

            recorder.start();
            renderStep('recording');
            startTimer();
        } catch (error) {
            stopTimer();
            stopMediaStream();
            renderStep('intro');
            alert('Nie udalo sie uzyskac dostepu do mikrofonu. Sprawdz uprawnienia w przegladarce.');
        }
    }

    function stopRecording(fromAutoStop = false) {
        if (voiceState.mediaRecorder?.state === 'recording') {
            voiceState.mediaRecorder.stop();
            if (fromAutoStop && descriptionEl) {
                descriptionEl.textContent = 'Limit jednego nagrania zostal osiagniety. Przygotowuje transkrypcje.';
            }
        }
    }

    primaryBtn.addEventListener('click', () => {
        if (voiceState.step === 'intro') startRecording();
        else if (voiceState.step === 'recording') stopRecording(false);
        else if (voiceState.step === 'review') analyzeTranscript();
        else if (voiceState.step === 'success') closeVoiceExpenseModal();
    });

    secondaryBtn.addEventListener('click', () => {
        if (voiceState.step === 'review' || voiceState.step === 'analyzing') {
            renderStep('intro');
            setBusyState(false);
            transcriptInput.value = '';
            resetRecordingState();
        }
    });

    closeBtn.addEventListener('click', closeVoiceExpenseModal);
    overlay.addEventListener('click', closeVoiceExpenseModal);

    window.__purchaseFormVoiceClose = closeVoiceExpenseModal;
    renderStep('intro');
}

export function openVoiceExpenseModal() {
    initVoiceExpense();
    const overlay = el('voice-expense-overlay');
    const modal = el('voice-expense-modal');
    if (!overlay || !modal) return;

    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        overlay.classList.remove('opacity-0');
        modal.classList.remove('opacity-0', 'scale-95');
    });
}

export { analysisAnimation };
