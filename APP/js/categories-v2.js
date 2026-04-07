// Tracker Wydatków — Kategorie Hierarchiczne v2 + Tagi Paragonu

// =====================================================================
// STAŁE: paleta ikon i kolorów
// =====================================================================
const CAT_ICON_OPTIONS = [
    // --- OBECNE ---
    'fa-tag', 'fa-shopping-basket', 'fa-home', 'fa-car', 'fa-film',
    'fa-heartbeat', 'fa-shopping-bag', 'fa-file-invoice-dollar',
    'fa-graduation-cap', 'fa-running', 'fa-jug-detergent', 'fa-pump-soap',
    'fa-tshirt', 'fa-piggy-bank', 'fa-cookie-bite', 'fa-recycle',
    'fa-utensils', 'fa-plane', 'fa-gift', 'fa-dumbbell', 'fa-baby',
    'fa-paw', 'fa-laptop', 'fa-music', 'fa-book', 'fa-hammer',
    'fa-ellipsis-h',

    // --- SPOŻYWCZE ---
    'fa-apple-alt',        // Jedzenie/Napoje
    'fa-candy-cane',       // Słodycze/Przekąski
    'fa-ice-cream',        // Słodycze
    'fa-truck',            // Dania z dostawy
    'fa-coffee',           // Napoje
    'fa-wine-glass',       // Napoje

    // --- MIESZKANIE ---
    'fa-building',         // Czynsz
    'fa-bolt',             // Prąd
    'fa-tint',             // Woda
    'fa-fire',             // Gaz
    'fa-couch',            // Wyposażenie
    'fa-paint-roller',     // Remonty
    'fa-tools',            // Naprawy
    'fa-lightbulb',        // Media ogólnie

    // --- ZDROWIE & URODA ---
    'fa-stethoscope',      // Lekarz
    'fa-pills',            // Apteka
    'fa-capsules',         // Suplementy
    'fa-cut',              // Usługi kosmetyczne/fryzjer
    'fa-spa',              // Kosmetyki/uroda
    'fa-toilet-paper',     // Higieniczne
    'fa-tooth',            // Dentysta

    // --- TRANSPORT ---
    'fa-gas-pump',         // Samochód/paliwo
    'fa-taxi',             // Taxi
    'fa-bus',              // Komunikacja miejska
    'fa-subway',           // Metro
    'fa-train',            // Pociąg
    'fa-suitcase-rolling', // Podróże
    'fa-bicycle',          // Rower

    // --- ROZRYWKA ---
    'fa-hamburger',        // Gastronomia
    'fa-theater-masks',    // Kultura
    'fa-ticket-alt',       // Bilety
    'fa-play-circle',      // VOD/Subskrypcje
    'fa-gamepad',          // Hobby/Gry
    'fa-palette',          // Hobby artystyczne
    'fa-football-ball',    // Sport

    // --- FINANSE ---
    'fa-hand-holding-usd', // Spłata kredytów
    'fa-chart-line',       // Inwestycje
    'fa-wallet',           // Oszczędności
    'fa-coins',            // Finanse ogólnie
    'fa-credit-card',      // Karty/płatności

    // --- ODZIEŻ ---
    'fa-shoe-prints',      // Buty
    'fa-gem',              // Dodatki/biżuteria
    'fa-hat-cowboy',       // Nakrycia głowy

    // --- EDUKACJA ---
    'fa-chalkboard-teacher', // Kursy/Szkolenia
    'fa-book-open',          // Książki
    'fa-language',           // Języki

    // --- INNE ---
    'fa-smoking',          // Alkohol/Papierosy
    'fa-beer',             // Alkohol
    'fa-archive',          // Kaucje
    'fa-wifi',             // Internet
    'fa-tv',               // TV
    'fa-mobile-alt',       // Telefon
    'fa-microchip',        // Elektronika
    'fa-headphones',       // Elektronika/audio
    'fa-dog',              // Zwierzęta
    'fa-camera',           // Hobby/Elektronika
    'fa-baby-carriage',    // Dzieci
    'fa-briefcase',        // Praca
    'fa-church',           // Inne wydatki
];

const CAT_COLOR_OPTIONS = [
    '#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6',
    '#ec4899', '#f59e0b', '#14b8a6', '#64748b', '#06b6d4',
    '#a855f7', '#eab308', '#0ea5e9', '#be185d', '#16a34a',
    '#f43f5e', '#84cc16', '#6366f1', '#d946ef', '#fb7185'
];

// =====================================================================
// RENDER: lista kategorii v2
// =====================================================================
function renderCategoriesListV2() {
    const container = document.getElementById('categories-v2-list');
    if (!container) return;

    const parents = structuredCategories.filter(c => !c.parentId);
    const children = structuredCategories.filter(c => c.parentId);

    if (parents.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500 text-sm">
                <i class="fas fa-folder-open text-3xl mb-3 block opacity-40"></i>
                Brak kategorii. Kliknij „Dodaj kategorię", aby zacząć.
            </div>`;
        return;
    }

    container.innerHTML = parents.map(parent => {
        const subs = children.filter(c => c.parentId === parent.id);
        const color = parent.color || '#64748b';
        const icon = parent.icon || 'fa-tag';

        return `
        <div class="cat-v2-parent-row rounded-2xl border border-white/10 overflow-hidden" data-id="${parent.id}">
            <!-- Nagłówek kategorii głównej -->
            <div class="flex items-center px-3 py-3 bg-white/5 cursor-pointer cat-v2-toggle-btn">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mr-3"
                     style="background-color:${color}25; color:${color}">
                    <i class="fas ${icon} text-sm"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <span class="font-semibold text-white text-sm">${parent.name}</span>
                    <span class="text-xs text-gray-500 ml-2">${subs.length} podkat.</span>
                </div>
                <div class="flex items-center gap-1 ml-2">
                    <button class="cat-v2-add-sub-btn p-1.5 rounded-lg text-gray-400 hover:text-green-400 hover:bg-white/5 transition-colors"
                            data-parent-id="${parent.id}" title="Dodaj podkategorię">
                        <i class="fas fa-plus text-xs"></i>
                    </button>
                    <button class="cat-v2-edit-parent-btn p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-white/5 transition-colors"
                            data-id="${parent.id}" title="Edytuj">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button class="cat-v2-delete-parent-btn p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/5 transition-colors"
                            data-id="${parent.id}" title="Usuń">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                    <i class="fas fa-chevron-down text-xs text-gray-500 ml-1 cat-v2-chevron transition-transform"></i>
                </div>
            </div>
            <!-- Podkategorie (rozwijane) -->
            <div class="cat-v2-sub-list hidden border-t border-white/5">
                ${subs.length === 0
                    ? `<p class="text-xs text-gray-600 italic px-12 py-2">Brak podkategorii</p>`
                    : subs.map(sub => `
                    <div class="flex items-center px-4 py-2.5 border-b border-white/5 last:border-0" data-sub-id="${sub.id}">
                        ${sub.icon 
                            ? `<div class="w-6 h-6 rounded-lg flex items-center justify-center mr-2.5 flex-shrink-0" style="background-color:${color}20; color:${color}">
                                 <i class="fas ${sub.icon} text-[10px]"></i>
                               </div>`
                            : `<div class="w-1.5 h-1.5 rounded-full mr-3 flex-shrink-0" style="background-color:${color}"></div>`
                        }
                        <span class="flex-1 text-sm text-gray-300">${sub.name}</span>
                        <div class="flex items-center gap-1">
                            <button class="cat-v2-edit-sub-btn p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-white/5 transition-colors"
                                    data-id="${sub.id}" data-parent-id="${parent.id}" title="Edytuj">
                                <i class="fas fa-pen text-xs"></i>
                            </button>
                            <button class="cat-v2-delete-sub-btn p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors"
                                    data-id="${sub.id}" title="Usuń">
                                <i class="fas fa-trash text-xs"></i>
                            </button>
                        </div>
                    </div>`).join('')}
            </div>
        </div>`;
    }).join('');

    // Deleguj eventy
    container.querySelectorAll('.cat-v2-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.closest('button')) return; // nie toggle przy kliknięciu przycisku akcji
            const row = btn.closest('.cat-v2-parent-row');
            const subList = row.querySelector('.cat-v2-sub-list');
            const chevron = row.querySelector('.cat-v2-chevron');
            subList.classList.toggle('hidden');
            chevron.classList.toggle('rotate-180');
        });
    });

    container.querySelectorAll('.cat-v2-add-sub-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); showSubCategoryForm(btn.dataset.parentId); });
    });

    container.querySelectorAll('.cat-v2-edit-parent-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); editParentCategory(btn.dataset.id); });
    });

    container.querySelectorAll('.cat-v2-delete-parent-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); deleteCategory(btn.dataset.id, true); });
    });

    container.querySelectorAll('.cat-v2-edit-sub-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); editSubCategory(btn.dataset.id, btn.dataset.parentId); });
    });

    container.querySelectorAll('.cat-v2-delete-sub-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); deleteCategory(btn.dataset.id, false); });
    });
}

// =====================================================================
// PICKER ikon i kolorów
// =====================================================================
function renderIconPicker(selectedIcon = 'fa-tag', containerId = 'cat-v2-icon-picker', inputId = 'cat-v2-icon-value') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = CAT_ICON_OPTIONS.map(icon => `
        <button type="button" data-icon="${icon}" title="${icon}"
            class="icon-pick-btn w-12 h-12 rounded-xl flex items-center justify-center text-base transition-all
                   ${icon === selectedIcon ? 'bg-brand-600 text-white ring-2 ring-brand-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}">
            <i class="fas ${icon}"></i>
        </button>`).join('');

    container.querySelectorAll('.icon-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById(inputId).value = btn.dataset.icon;
            container.querySelectorAll('.icon-pick-btn').forEach(b => {
                b.className = b.className.replace('bg-brand-600 text-white ring-2 ring-brand-400', 'bg-white/5 text-gray-400 hover:bg-white/10');
            });
            btn.className = btn.className.replace('bg-white/5 text-gray-400 hover:bg-white/10', 'bg-brand-600 text-white ring-2 ring-brand-400');
        });
    });
}

function renderColorPicker(selectedColor = '#3b82f6') {
    const container = document.getElementById('cat-v2-color-picker');
    if (!container) return;
    container.innerHTML = CAT_COLOR_OPTIONS.map(color => `
        <button type="button" data-color="${color}"
            class="color-pick-btn w-7 h-7 rounded-full transition-all border-2
                   ${color === selectedColor ? 'border-white scale-110' : 'border-transparent hover:scale-105'}"
            style="background-color:${color}">
        </button>`).join('');

    container.querySelectorAll('.color-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('cat-v2-color-value').value = btn.dataset.color;
            container.querySelectorAll('.color-pick-btn').forEach(b => {
                b.classList.remove('border-white', 'scale-110');
                b.classList.add('border-transparent', 'hover:scale-105');
            });
            btn.classList.remove('border-transparent', 'hover:scale-105');
            btn.classList.add('border-white', 'scale-110');
        });
    });
}

// =====================================================================
// SHOW FORMS (Now in Drawers)
// =====================================================================
function openCategoryEditorDrawer(title) {
    const titleEl = document.getElementById('category-editor-drawer-title');
    if (titleEl) titleEl.textContent = title;
    
    if (typeof openOverlay === 'function') {
        openOverlay('category-editor-drawer');
    } else {
        const overlay = document.getElementById('category-editor-drawer-overlay');
        const drawer = document.getElementById('category-editor-drawer');
        if (!overlay || !drawer) return;
        
        overlay.classList.remove('hidden');
        drawer.classList.remove('hidden');
        setTimeout(() => {
            overlay.classList.add('active');
            drawer.classList.add('active');
        }, 10);
    }
}

function closeCategoryEditorDrawer() {
    if (typeof closeOverlay === 'function') {
        closeOverlay('category-editor-drawer', true); 
    } else {
        const overlay = document.getElementById('category-editor-drawer-overlay');
        const drawer = document.getElementById('category-editor-drawer');
        if (!overlay || !drawer) return;
        
        overlay.classList.remove('active');
        drawer.classList.remove('active');
        setTimeout(() => {
            overlay.classList.add('hidden');
            drawer.classList.add('hidden');
        }, 300);
    }
}

function showParentCategoryForm(editId = null) {
    const parentForm = document.getElementById('cat-v2-parent-form');
    const subForm = document.getElementById('cat-v2-sub-form');
    const nameInput = document.getElementById('cat-v2-name-input');
    const editIdInput = document.getElementById('cat-v2-edit-id');

    if (!parentForm || !subForm || !nameInput) return;

    parentForm.classList.remove('hidden');
    subForm.classList.add('hidden');

    if (editId) {
        const cat = structuredCategories.find(c => c.id === editId);
        if (!cat) return;
        openCategoryEditorDrawer(`Edytuj: ${cat.name}`);
        nameInput.value = cat.name;
        editIdInput.value = editId;
        renderIconPicker(cat.icon || 'fa-tag');
        renderColorPicker(cat.color || '#3b82f6');
        document.getElementById('cat-v2-icon-value').value = cat.icon || 'fa-tag';
        document.getElementById('cat-v2-color-value').value = cat.color || '#3b82f6';
    } else {
        openCategoryEditorDrawer('Nowa kategoria główna');
        nameInput.value = '';
        editIdInput.value = '';
        renderIconPicker();
        renderColorPicker();
    }

    setTimeout(() => nameInput.focus(), 400);
}

function showSubCategoryForm(parentId, editId = null) {
    const parentForm = document.getElementById('cat-v2-parent-form');
    const subForm = document.getElementById('cat-v2-sub-form');
    const nameInput = document.getElementById('cat-v2-sub-name-input');

    if (!parentForm || !subForm || !nameInput) return;

    parentForm.classList.add('hidden');
    subForm.classList.remove('hidden');
    document.getElementById('cat-v2-sub-parent-id').value = parentId;
    document.getElementById('cat-v2-sub-edit-id').value = editId || '';

    const parent = structuredCategories.find(c => c.id === parentId);
    const parentName = parent ? parent.name : '';

    if (editId) {
        const sub = structuredCategories.find(c => c.id === editId);
        openCategoryEditorDrawer(`Edytuj podkategorię`);
        nameInput.value = sub ? sub.name : '';
        const currentIcon = (sub && sub.icon) ? sub.icon : '';
        renderIconPicker(currentIcon, 'cat-v2-sub-icon-picker', 'cat-v2-sub-icon-value');
        document.getElementById('cat-v2-sub-icon-value').value = currentIcon;
    } else {
        openCategoryEditorDrawer(`Nowa podkategoria → ${parentName}`);
        nameInput.value = '';
        renderIconPicker('', 'cat-v2-sub-icon-picker', 'cat-v2-sub-icon-value');
        document.getElementById('cat-v2-sub-icon-value').value = '';
    }

    setTimeout(() => nameInput.focus(), 400);
}

function editParentCategory(id) { showParentCategoryForm(id); }
function editSubCategory(id, parentId) { showSubCategoryForm(parentId, id); }

// =====================================================================
// CRUD ACTIONS
// =====================================================================
function updateLocalPurchasesAfterCategoryChange(oldName, newName, parentId, isDelete) {
    if (typeof allPurchases === 'undefined') return;

    allPurchases.forEach(p => {
        let needsUpdate = false;

        // 1. Obsługa kategorii głównej
        if (parentId === null) {
            if (p.category === oldName) {
                p.category = isDelete ? 'inne' : newName;
                needsUpdate = true;
            }
            if (p.items && Array.isArray(p.items)) {
                p.items.forEach(item => {
                    if (item.category === oldName) {
                        item.category = isDelete ? 'inne' : newName;
                        if (isDelete) item.subCategory = '';
                    }
                });
                needsUpdate = true;
            }
        } 
        // 2. Obsługa podkategorii
        else {
            // Znajdź nazwę rodzica
            const parentCat = structuredCategories.find(c => c.id === parentId);
            const parentName = parentCat ? parentCat.name : null;

            if (p.items && Array.isArray(p.items)) {
                p.items.forEach(item => {
                    if (item.subCategory === oldName && item.category === parentName) {
                        item.subCategory = isDelete ? '' : newName;
                        needsUpdate = true;
                    }
                });
            }
        }
    });

    // Odśwież widok listy zakupów
    if (typeof renderPurchasesList === 'function') {
        renderPurchasesList(allPurchases);
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function saveParentCategory() {
    const name = document.getElementById('cat-v2-name-input').value.trim();
    const editId = document.getElementById('cat-v2-edit-id').value;
    const icon = document.getElementById('cat-v2-icon-value').value;
    const color = document.getElementById('cat-v2-color-value').value;

    if (!name) { alert('Podaj nazwę kategorii.'); return; }

    try {
        if (editId) {
            // Edycja przez backend PUT
            const idx = structuredCategories.findIndex(c => c.id === editId);
            let oldName = null;
            if (idx !== -1) {
                 oldName = structuredCategories[idx].name;
                 structuredCategories[idx] = { ...structuredCategories[idx], name, icon, color };
            }
            
            await apiCall(`/api/categories/v2/${editId}`, 'PUT', { name, icon, color });
            
            if (oldName && oldName !== name) {
                updateLocalPurchasesAfterCategoryChange(oldName, name, null, false);
            }
        } else {
            // Nowa kategoria — dodaj lokalnie i zapisz całą tablicę
            const newCat = { id: generateId(), name, parentId: null, icon, color };
            structuredCategories.push(newCat);
            await apiCall('/api/categories/v2', 'POST', { structuredCategories });
        }
        closeCategoryEditorDrawer();
        renderCategoriesListV2();
    } catch (err) {
        alert('Błąd: ' + err.message);
    }
}

async function saveSubCategory() {
    const name = document.getElementById('cat-v2-sub-name-input').value.trim();
    const parentId = document.getElementById('cat-v2-sub-parent-id').value;
    const editId = document.getElementById('cat-v2-sub-edit-id').value;

    if (!name) { alert('Podaj nazwę podkategorii.'); return; }

    try {
        const icon = document.getElementById('cat-v2-sub-icon-value').value;
        if (editId) {
            const idx = structuredCategories.findIndex(c => c.id === editId);
            let oldName = null;
            if (idx !== -1) {
                oldName = structuredCategories[idx].name;
                structuredCategories[idx] = { ...structuredCategories[idx], name, icon };
            }

            await apiCall(`/api/categories/v2/${editId}`, 'PUT', { name, icon });

            if (oldName && oldName !== name) {
                updateLocalPurchasesAfterCategoryChange(oldName, name, parentId, false);
            }
        } else {
            const newSub = { id: generateId(), name, parentId, icon };
            structuredCategories.push(newSub);
            await apiCall('/api/categories/v2', 'POST', { structuredCategories });
        }
        closeCategoryEditorDrawer();
        renderCategoriesListV2();
    } catch (err) {
        alert('Błąd: ' + err.message);
    }
}

async function deleteCategory(id, isParent) {
    const cat = structuredCategories.find(c => c.id === id);
    if (!cat) return;

    const msg = isParent
        ? `Usunąć kategorię „${cat.name}" i wszystkie jej podkategorie?`
        : `Usunąć podkategorię „${cat.name}"?`;

    if (!confirm(msg)) return;

    try {
        await apiCall(`/api/categories/v2/${id}`, 'DELETE');

        // Po usunięciu kategorii backend ustawia fallback (Inne/Pozostałe albo inne),
        // więc odświeżamy dane z serwera zamiast lokalnej symulacji.
        if (typeof fetchInitialData === 'function') {
            await fetchInitialData(false);
            if (typeof renderCategoriesListV2 === 'function') renderCategoriesListV2();
            if (typeof renderCategoriesListV2 === 'function') renderCategoriesListV2();
        } else {
            if (isParent) {
                structuredCategories = structuredCategories.filter(c => c.id !== id && c.parentId !== id);
            } else {
                structuredCategories = structuredCategories.filter(c => c.id !== id);
            }
            renderCategoriesListV2();
        }
    } catch (err) {
        alert('Błąd: ' + err.message);
    }
}

// =====================================================================
// TAGI PARAGONU — dynamiczny manager grup
// =====================================================================

// Renderuje jedną grupę tagów jako kafelki z przyciskami edycji/usuwania
function renderTagGroupSection(group) {
    const groupLabel = typeof getTagGroupLabel === 'function' ? getTagGroupLabel(group) : group;
    const tags = typeof getTagOptions === 'function' ? getTagOptions(group) : [];
    const isBuiltin = ['nature', 'purpose'].includes(group);

    const tagsHtml = tags.length === 0
        ? `<p class="text-xs text-gray-500 italic">Brak tagów</p>`
        : tags.map(tag => `
            <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                <div class="min-w-0">
                    <div class="text-sm text-white truncate">${tag.icon || ''} ${tag.label || tag.value}</div>
                    <div class="text-[10px] text-gray-500 mt-0.5">${tag.value}</div>
                </div>
                <div class="flex items-center gap-1 ml-2">
                    <button class="tag-edit-btn p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-white/5 transition-colors"
                        data-group="${group}" data-value="${tag.value}" title="Edytuj">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button class="tag-delete-btn p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/5 transition-colors"
                        data-group="${group}" data-value="${tag.value}" title="Usuń">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
            </div>
        `).join('');

    return `
        <div class="bg-white/5 border border-white/10 rounded-2xl p-3" data-tag-group="${group}">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <h4 class="text-sm font-semibold text-white">${groupLabel}</h4>
                    ${isBuiltin ? '<span class="text-[10px] text-gray-600 px-1.5 py-0.5 rounded bg-white/5">wbudowana</span>' : ''}
                </div>
                <div class="flex items-center gap-1">
                    <button class="add-tag-in-group-btn px-2.5 py-1.5 text-xs rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                        data-group="${group}">Dodaj</button>
                    ${!isBuiltin ? `
                        <button class="edit-tag-group-btn p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-white/5 transition-colors" data-group="${group}" title="Edytuj nazwę grupy">
                            <i class="fas fa-edit text-xs"></i>
                        </button>
                        <button class="delete-tag-group-btn p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors" data-group="${group}" title="Usuń grupę">
                            <i class="fas fa-times text-xs"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
            <div class="space-y-2">
                ${tagsHtml}
            </div>
        </div>
    `;
}

// Główna funkcja renderująca wszystkie grupy
function renderTagsManager() {
    const container = document.getElementById('tags-groups-container');
    if (!container) return;

    const groups = typeof getTagGroups === 'function' ? getTagGroups() : ['nature', 'purpose'];
    if (groups.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic">Brak grup tagów.</p>';
        return;
    }
    container.innerHTML = groups.map(renderTagGroupSection).join('');
}

// --- FORMULARZE TAGÓW (zamiast prompt()) ---

function openTagFormModal(group, oldValue = null) {
    const modal = document.getElementById('tag-form-modal');
    const titleEl = document.getElementById('tag-form-modal-title');
    const labelInput = document.getElementById('tag-form-label-input');
    const valuePreview = document.getElementById('tag-form-value-preview');
    const iconInput = document.getElementById('tag-form-icon-input');
    const groupInput = document.getElementById('tag-form-group');
    const oldValInput = document.getElementById('tag-form-old-value');
    if (!modal) return;

    groupInput.value = group;
    oldValInput.value = oldValue || '';

    if (oldValue) {
        const existing = (typeof getTagOptions === 'function' ? getTagOptions(group) : []).find(t => t.value === oldValue);
        titleEl.textContent = 'Edytuj tag';
        labelInput.value = existing ? existing.label : oldValue;
        iconInput.value = existing ? existing.icon : '';
        valuePreview.textContent = oldValue;
    } else {
        titleEl.textContent = 'Nowy tag';
        labelInput.value = '';
        iconInput.value = '';
        valuePreview.textContent = '—';
    }

    // Auto-generuj value preview ze label
    const updatePreview = () => {
        const raw = labelInput.value.trim().toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_\u00e0-\u017e-]/g, '')
            .slice(0, 32);
        valuePreview.textContent = raw || '—';
    };
    labelInput.oninput = updatePreview;

    modal.classList.remove('hidden');
}

async function saveTagFromModal() {
    const group = document.getElementById('tag-form-group').value;
    const oldValue = document.getElementById('tag-form-old-value').value;
    const labelRaw = document.getElementById('tag-form-label-input').value.trim();
    const icon = document.getElementById('tag-form-icon-input').value.trim();

    if (!labelRaw) { alert('Podaj etykietę tagu.'); return; }

    const value = labelRaw.toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_\u00e0-\u017e-]/g, '')
        .slice(0, 32);

    if (!value) { alert('Nie można wygenerować wartości. Spróbuj innej etykiety.'); return; }

    try {
        if (oldValue) {
            await apiCall(`/api/tags/${group}/${encodeURIComponent(oldValue)}`, 'PUT', { value, label: labelRaw, icon });
        } else {
            await apiCall(`/api/tags/${group}`, 'POST', { value, label: labelRaw, icon });
        }
        document.getElementById('tag-form-modal').classList.add('hidden');
        if (typeof fetchInitialData === 'function') await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
    }
}

async function deleteTagConfirm(group, value) {
    if (!confirm(`Usunąć tag "${value}"? Wydatki z tym tagiem zostaną przypisane do domyślnej wartości grupy.`)) return;
    try {
        await apiCall(`/api/tags/${group}/${encodeURIComponent(value)}`, 'DELETE');
        if (typeof fetchInitialData === 'function') await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
    }
}

function openTagGroupModal(existingGroup = null) {
    const modal = document.getElementById('tag-group-modal');
    const titleEl = document.getElementById('tag-group-modal-title') || { textContent: '' };
    const labelInput = document.getElementById('tag-group-label-input');
    const keyPreview = document.getElementById('tag-group-key-preview');
    const firstLabel = document.getElementById('tag-group-first-label');
    const firstIcon = document.getElementById('tag-group-first-icon');
    const editGroupInput = document.getElementById('tag-group-edit-id') || { value: '' };
    const initialTagContainer = document.getElementById('tag-group-initial-tag-container');
    
    if (!modal) return;

    if (existingGroup) {
        const label = typeof getTagGroupLabel === 'function' ? getTagGroupLabel(existingGroup) : existingGroup;
        titleEl.textContent = 'Edytuj grupę tagów';
        labelInput.value = label;
        keyPreview.textContent = existingGroup;
        editGroupInput.value = existingGroup;
        if (initialTagContainer) initialTagContainer.classList.add('hidden');
    } else {
        titleEl.textContent = 'Nowa grupa tagów';
        labelInput.value = '';
        keyPreview.textContent = '—';
        editGroupInput.value = '';
        if (firstLabel) firstLabel.value = '';
        if (firstIcon) firstIcon.value = '';
        if (initialTagContainer) initialTagContainer.classList.remove('hidden');
    }

    const updateKey = () => {
        const raw = labelInput.value.trim().toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_-]/g, '')
            .slice(0, 32);
        keyPreview.textContent = raw || '—';
    };
    labelInput.oninput = updateKey;
    modal.classList.remove('hidden');
}

async function saveTagGroup() {
    const labelInput = document.getElementById('tag-group-label-input');
    const firstLabelInput = document.getElementById('tag-group-first-label');
    const firstIconInput = document.getElementById('tag-group-first-icon');
    const keyPreview = document.getElementById('tag-group-key-preview');
    const editGroupId = (document.getElementById('tag-group-edit-id') || { value: '' }).value;

    const label = labelInput ? labelInput.value.trim() : '';
    const firstLabel = firstLabelInput ? firstLabelInput.value.trim() : '';
    const firstIcon = firstIconInput ? firstIconInput.value.trim() : '';
    const groupKey = keyPreview ? keyPreview.textContent.trim() : '';

    if (!label) { alert('Podaj nazwę grupy.'); return; }
    
    try {
        if (editGroupId) {
            // Edycja istniejącej grupy
            await apiCall(`/api/tags/groups/${encodeURIComponent(editGroupId)}`, 'PUT', { label });
        } else {
            // Tworzenie nowej grupy
            if (!firstLabel) { alert('Podaj pierwszą wartość grupy.'); return; }
            if (groupKey === '—' || !groupKey) { alert('Błąd: Nieprawidłowy klucz grupy.'); return; }
            await apiCall('/api/tags/groups', 'POST', { group: groupKey, label, firstLabel, firstIcon });
        }
        document.getElementById('tag-group-modal').classList.add('hidden');
        if (typeof fetchInitialData === 'function') await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
    }
}

async function deleteTagGroup(group) {
    const groupLabel = typeof getTagGroupLabel === 'function' ? getTagGroupLabel(group) : group;
    if (!confirm(`Usunąć całą grupę "${groupLabel}"? Wydatki z tymi tagami zostaną bez tagu dla tej grupy.`)) return;
    try {
        await apiCall(`/api/tags/groups/${encodeURIComponent(group)}`, 'DELETE');
        if (typeof fetchInitialData === 'function') await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
    }
}

function initTagsManagerEvents() {
    // Przycisk "Dodaj grupę tagów"
    document.getElementById('add-tag-group-btn')?.addEventListener('click', () => openTagGroupModal(null));

    // Przyciski modalu tagu
    document.getElementById('tag-form-cancel-btn')?.addEventListener('click', () => {
        document.getElementById('tag-form-modal').classList.add('hidden');
    });
    document.getElementById('tag-form-modal-backdrop')?.addEventListener('click', () => {
        document.getElementById('tag-form-modal').classList.add('hidden');
    });
    document.getElementById('tag-form-save-btn')?.addEventListener('click', saveTagFromModal);

    // Przyciski modalu grupy
    document.getElementById('tag-group-cancel-btn')?.addEventListener('click', () => {
        document.getElementById('tag-group-modal').classList.add('hidden');
    });
    document.getElementById('tag-group-modal-backdrop')?.addEventListener('click', () => {
        document.getElementById('tag-group-modal').classList.add('hidden');
    });
    document.getElementById('tag-group-save-btn')?.addEventListener('click', saveTagGroup);

    // Delegacja eventów w kontenre grup (edycja/usuwanie tagów, usuwanie grupy)
    document.getElementById('tags-groups-container')?.addEventListener('click', (e) => {
        const addBtn = e.target.closest('.add-tag-in-group-btn');
        if (addBtn) {
            openTagFormModal(addBtn.dataset.group, null);
            return;
        }
        const editBtn = e.target.closest('.tag-edit-btn');
        if (editBtn) {
            openTagFormModal(editBtn.dataset.group, editBtn.dataset.value);
            return;
        }
        const deleteBtn = e.target.closest('.tag-delete-btn');
        if (deleteBtn) {
            deleteTagConfirm(deleteBtn.dataset.group, deleteBtn.dataset.value)
                .catch(err => alert('Błąd: ' + err.message));
            return;
        }
        const editGroupBtn = e.target.closest('.edit-tag-group-btn');
        if (editGroupBtn) {
            openTagGroupModal(editGroupBtn.dataset.group);
            return;
        }
        const delGroupBtn = e.target.closest('.delete-tag-group-btn');
        if (delGroupBtn) {
            deleteTagGroup(delGroupBtn.dataset.group)
                .catch(err => alert('Błąd: ' + err.message));
        }
    });
}

// =====================================================================
// HIERARCHICZNY DRAWER WYBORU KATEGORII
// =====================================================================
let hierarchicalDrawerStep = 1; // 1 = parent, 2 = sub
let hierarchicalDrawerParent = null;
let hierarchicalDrawerCallback = null;

function openHierarchicalCategoryDrawer(row, currentCategory, currentSubCategory, onSelect, showManageButton = true) {
    hierarchicalDrawerCallback = onSelect;
    hierarchicalDrawerStep = 1;
    hierarchicalDrawerParent = null;

    const parents = structuredCategories.filter(c => !c.parentId);

    if (parents.length === 0) {
        // Fallback: otwórz stary płaski drawer
        openCategoryDrawer(row, currentCategory, onSelect);
        return;
    }

    const openStep1 = () => {
        const currentParentDoc = parents.find(p => p.name === currentCategory);
        const currentParentId = currentParentDoc ? currentParentDoc.id : null;

        const options = parents.map(p => ({
            value: p.id,
            label: p.name,
            icon: `<i class="fas ${p.icon || 'fa-tag'}"></i>`,
            color: (p.color || '#64748b') + '20'
        }));

        openSelectionDrawer('Wybierz kategorię', options, (parentId) => {
            const parent = structuredCategories.find(c => c.id === parentId);
            const subs = structuredCategories.filter(c => c.parentId === parentId);

            if (subs.length === 0) {
                if (onSelect) onSelect(parent.name, '');
                if (typeof closeSelectionDrawer === 'function') closeSelectionDrawer();
                return;
            }

            const subOptions = subs.map(s => ({
                value: s.id,
                label: s.name,
                icon: s.icon ? `<i class="fas ${s.icon}"></i>` : `<i class="fas ${parent.icon || 'fa-tag'}"></i>`,
                color: (parent.color || '#64748b') + '20'
            }));

            openSelectionDrawer(
                `Kategorie: ${parent.name}`,
                subOptions,
                (subId) => {
                    const sub = structuredCategories.find(c => c.id === subId);
                    if (onSelect) onSelect(parent.name, sub ? sub.name : '');
                },
                currentSubCategory || '',
                'grid',
                showManageButton,
                true,
                () => openStep1()
            );
        }, currentParentId, 'grid', showManageButton, false);
    };

    openStep1();
}

// =====================================================================
// INIT
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Przyciski formularza kategorii głównej
    document.getElementById('add-parent-category-btn')?.addEventListener('click', () => showParentCategoryForm());
    document.getElementById('cat-v2-save-btn')?.addEventListener('click', saveParentCategory);
    document.getElementById('cat-v2-cancel-btn')?.addEventListener('click', () => {
        closeCategoryEditorDrawer();
    });

    // Przyciski formularza podkategorii
    document.getElementById('cat-v2-sub-save-btn')?.addEventListener('click', saveSubCategory);
    document.getElementById('cat-v2-sub-cancel-btn')?.addEventListener('click', () => {
        closeCategoryEditorDrawer();
    });

    // Event listenery dla zamknięcia szuflady edycji kategorii
    document.getElementById('close-category-editor-drawer')?.addEventListener('click', () => {
        closeCategoryEditorDrawer();
    });
    document.getElementById('category-editor-drawer-overlay')?.addEventListener('click', (e) => {
        // Zamknij na klikniecie bezpośrednio na overlay (nie na elementy dziecka)
        if (e.target.id === 'category-editor-drawer-overlay') {
            closeCategoryEditorDrawer();
        }
    });

    // Manager tagów
    initTagsManagerEvents();
    renderTagsManager();
});

window.renderTagsManager = renderTagsManager;
