// Tracker Wydatków - Purchases Functions

// --- Logika Formularza Zakupu ---
function updatePurchaseSummary() {
    const itemPrices = Array.from(document.querySelectorAll('.item-price'));
    const total = itemPrices.reduce((sum, input) => {
        const price = parseFloat(input.value.replace(',', '.')) || 0;
        return sum + price;
    }, 0);
    purchaseSummary.textContent = `Suma: ${total.toFixed(2)} zł`;
}

function addItemRow(item = {}) {
    const itemRow = document.createElement('div');
    itemRow.className = 'item-row grid grid-cols-12 gap-2 items-start'; // Zmienione na 12 kolumn dla lepszego układu

    const categoryOptions = allCategories.map(cat => `<option value="${cat}" ${item.category === cat ? 'selected' : ''}>${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`).join('');

    const priceValue = typeof item.price === 'number' ? item.price.toFixed(2) : '';

    itemRow.innerHTML = `
        <div class="md:col-span-5 col-span-12 break-words">
            <textarea class="item-name mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-3 resize-none overflow-hidden" placeholder="Nazwa produktu" rows="1" required>${item.name || ''}</textarea>
        </div>
        <div class="md:col-span-2 col-span-4">
            <input type="number" step="0.01" class="item-price mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-3" placeholder="Cena" value="${priceValue}" required>
        </div>
        <div class="md:col-span-4 col-span-6">
            <select class="item-category-select mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-3">
                <option value="">Wybierz kategorię</option>
                ${categoryOptions}
                <option value="__add_new__">-- Dodaj nową --</option>
            </select>
            <input type="text" class="new-category-input hidden mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-3" placeholder="Nazwa nowej kategorii">
        </div>
        <div class="md:col-span-1 col-span-2 text-right flex items-start justify-end">
            <button type="button" class="remove-item-btn p-3 text-red-500 hover:text-red-700 rounded-full mt-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /></svg></button>
        </div>
    `;
    itemsContainer.appendChild(itemRow);

    const itemNameInput = itemRow.querySelector('.item-name');
    const categorySelect = itemRow.querySelector('.item-category-select');
    const newCategoryInput = itemRow.querySelector('.new-category-input');

    // Automatyczne dopasowanie wysokości pola textarea
    function autoResizeTextarea() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    }
    itemNameInput.addEventListener('input', autoResizeTextarea, false);
    // Ustawienie początkowej wysokości (ważne przy edycji)
    setTimeout(() => autoResizeTextarea.call(itemNameInput), 0);

    categorySelect.addEventListener('change', () => {
        if (categorySelect.value === '__add_new__') {
            categorySelect.classList.add('hidden');
            newCategoryInput.classList.remove('hidden');
            newCategoryInput.focus();
        }
    });

    newCategoryInput.addEventListener('blur', () => handleNewCategory(newCategoryInput, categorySelect));
    newCategoryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleNewCategory(newCategoryInput, categorySelect);
        }
    });

    itemRow.querySelector('.remove-item-btn').addEventListener('click', () => {
        itemRow.remove();
        updatePurchaseSummary();
    });

    updatePurchaseSummary();
}

function handleNewCategory(newCategoryInput, categorySelect) {
    const newCategory = newCategoryInput.value.trim().toLowerCase();
    newCategoryInput.value = '';
    newCategoryInput.classList.add('hidden');
    categorySelect.classList.remove('hidden');

    if (newCategory && !allCategories.includes(newCategory)) {
        allCategories.push(newCategory);
        allCategories.sort();
        updateAllCategorySelects(newCategory, categorySelect);
        // Kategoria zostanie ustawiona w updateAllCategorySelects
    } else if (newCategory && allCategories.includes(newCategory)) {
        // Jeśli kategoria już istnieje, ustaw ją
        categorySelect.value = newCategory;
    } else {
        // Jeśli nie ma kategorii, wyczyść select
        categorySelect.value = '';
    }
}

function updateAllCategorySelects(newlySelected = null, targetSelect = null) {
    const categoryOptions = allCategories.map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`).join('');
    const fullHtml = `<option value="">Wybierz kategorię</option>${categoryOptions}<option value="__add_new__">-- Dodaj nową --</option>`;

    document.querySelectorAll('.item-category-select').forEach(select => {
        const currentValue = select.value;
        select.innerHTML = fullHtml;

        // Ustaw nową kategorię tylko w tym konkretnym select, który ją dodał
        if (targetSelect && select === targetSelect && newlySelected) {
            select.value = newlySelected;
        } else {
            select.value = currentValue;
        }
    });
}

async function handlePurchaseFormSubmit(e) {
    e.preventDefault();
    const purchaseData = {
        shop: shopInput.value,
        date: dateInput.value,
        items: Array.from(document.querySelectorAll('.item-row')).map(row => {
            const name = row.querySelector('.item-name').value;
            const price = parseFloat(row.querySelector('.item-price').value.replace(',', '.'));
            let category = row.querySelector('.item-category-select').value;
            if (!category || category === '__add_new__') category = 'inne';
            return { name, price, category };
        }).filter(item => item.name && !isNaN(item.price))
    };

    if (purchaseData.items.length === 0) {
        alert('Dodaj przynajmniej jedną pozycję do zakupu.');
        return;
    }

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
function applyFilters() {
    const keyword = filterKeyword.value.toLowerCase();
    const category = filterCategory.value;
    const shop = filterShop.value;
    const minAmount = parseFloat(filterMinAmount.value) || 0;
    const maxAmount = parseFloat(filterMaxAmount.value) || Infinity;
    const dateRange = fp_range.selectedDates;

    let filtered = allPurchases;

    // 1. Filtrowanie po dacie zakupu (poprawione, aby uwzględniać cały dzień)
    if (dateRange.length === 2) {
        const startDate = dateRange[0];
        const endDate = new Date(dateRange[1]); // Utwórz kopię, aby nie modyfikować oryginału
        endDate.setHours(23, 59, 59, 999); // Ustaw czas na koniec dnia dla pełnej inkluzywności

        filtered = filtered.filter(p => {
            // Parsuj datę zakupu jako lokalną, aby uniknąć problemów ze strefą czasową
            const parts = p.date.split('-').map(Number);
            const purchaseDate = new Date(parts[0], parts[1] - 1, parts[2]);
            return purchaseDate >= startDate && purchaseDate <= endDate;
        });
    }

    // 2. Filtrowanie po sklepie i kwocie całego zakupu
    if (shop) filtered = filtered.filter(p => p.shop === shop);
    filtered = filtered.filter(p => p.totalAmount >= minAmount && p.totalAmount <= maxAmount);

    // 3. Filtrowanie po produktach (słowo kluczowe, kategoria)
    if (keyword || category) {
        filtered = filtered.map(p => {
            const matchingItems = p.items.filter(item => {
                const keywordMatch = !keyword || item.name.toLowerCase().includes(keyword);
                const categoryMatch = !category || item.category === category;
                return keywordMatch && categoryMatch;
            });

            if (matchingItems.length > 0) {
                // Zwróć kopię zakupu tylko z pasującymi produktami
                return { ...p, items: matchingItems };
            }
            return null;
        }).filter(p => p !== null); // Usuń zakupy, które nie mają pasujących produktów
    }

    return filtered;
}

function renderPurchasesList() {
    const filteredPurchases = applyFilters();
    if (filteredPurchases.length === 0) {
        purchasesList.innerHTML = '<div class="text-center py-12"><svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg><h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Brak zakupów</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Zacznij dodawać wydatki, aby zobaczyć je tutaj.</p></div>';
        return;
    }
    purchasesList.innerHTML = filteredPurchases.map(p => `
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm" data-purchase-id="${p.id}">
            <div class="purchase-header flex justify-between items-center p-4 cursor-pointer">
                <div class="flex items-center space-x-4">
                    <div class="flex-shrink-0 h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <div>
                        <p class="font-bold text-lg text-gray-900 dark:text-white">${p.shop}</p>
                        <p class="text-sm text-gray-600 dark:text-gray-400">${p.date}</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="text-right">
                        <p class="font-bold text-xl text-gray-900 dark:text-white whitespace-nowrap">${(p.totalAmount || 0).toFixed(2)} zł</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">${(p.items || []).length} poz.</p>
                    </div>
                    <div class="flex items-center">
                        <button class="edit-purchase-btn p-2 text-blue-500 hover:text-blue-700" title="Edytuj"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg></button>
                        <button class="delete-purchase-btn p-2 text-red-500 hover:text-red-700" title="Usuń"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg></button>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 toggle-arrow text-gray-500 dark:text-gray-400 transition-transform transform" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                    </div>
                </div>
            </div>
            <div class="purchase-items hidden border-t border-gray-200 dark:border-gray-700 p-4 space-y-2">
                ${(p.items || []).map(item => `
                    <div class="flex justify-between items-center">
                        <span class="text-gray-800 dark:text-gray-200 break-words">${item.name}</span>
                        <div class="flex items-center space-x-2 flex-shrink-0">
                            <span class="category-tag text-white text-xs font-semibold" style="background-color: ${getCategoryColor(item.category)}; padding: 3px 10px; border-radius: 9999px;">${item.category}</span>
                             <span class="font-medium text-gray-900 dark:text-white whitespace-nowrap">${(item.price || 0).toFixed(2)}&nbsp;zł</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
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
                `• Suma oryginalna: ${originalTotal.toFixed(2)} ${analysis.originalCurrency}\n` +
                `• Suma po przeliczeniu: ${convertedTotal.toFixed(2)} PLN\n\n` +
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

    processedItems.forEach(item => {
        if (item.category && !allCategories.includes(item.category)) {
            allCategories.push(item.category);
            allCategories.sort();
        }
        addItemRow(item);
    });

    if (processedItems.length === 0) {
        addItemRow();
    }
    updateAllCategorySelects();
    updatePurchaseSummary();
    alert('Formularz został wypełniony danymi z paragonu. Sprawdź dane przed zapisem.');
}