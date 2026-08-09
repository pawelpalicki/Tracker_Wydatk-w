/**
 * Moduł Zarządzania Kategoriami Hierarchicznymi (Ustawienia).
 */
import state from '../../core/state.js';
import { apiCall } from '../../core/api.js';
import Drawer from '../../shared/drawer.js';
import { escapeHTML } from '../../shared/format.js';
import { fetchInitialData } from '../../core/data-loader.js';

// =====================================================================
// STAŁE: paleta ikon i kolorów
// =====================================================================
const CAT_ICON_OPTIONS = [
    'fa-tag', 'fa-shopping-basket', 'fa-home', 'fa-car', 'fa-film',
    'fa-heartbeat', 'fa-shopping-bag', 'fa-file-invoice-dollar',
    'fa-graduation-cap', 'fa-running', 'fa-jug-detergent', 'fa-pump-soap',
    'fa-tshirt', 'fa-piggy-bank', 'fa-cookie-bite', 'fa-recycle',
    'fa-utensils', 'fa-plane', 'fa-gift', 'fa-dumbbell', 'fa-baby',
    'fa-paw', 'fa-laptop', 'fa-music', 'fa-book', 'fa-hammer',
    'fa-ellipsis-h',
    'fa-apple-alt', 'fa-candy-cane', 'fa-ice-cream', 'fa-truck', 'fa-coffee', 'fa-wine-glass',
    'fa-building', 'fa-bolt', 'fa-tint', 'fa-fire', 'fa-couch', 'fa-paint-roller', 'fa-tools', 'fa-lightbulb',
    'fa-stethoscope', 'fa-pills', 'fa-capsules', 'fa-cut', 'fa-spa', 'fa-toilet-paper', 'fa-tooth',
    'fa-gas-pump', 'fa-taxi', 'fa-bus', 'fa-subway', 'fa-train', 'fa-suitcase-rolling', 'fa-bicycle',
    'fa-hamburger', 'fa-theater-masks', 'fa-ticket-alt', 'fa-play-circle', 'fa-gamepad', 'fa-palette', 'fa-football-ball',
    'fa-hand-holding-usd', 'fa-chart-line', 'fa-wallet', 'fa-coins', 'fa-credit-card',
    'fa-shoe-prints', 'fa-gem', 'fa-hat-cowboy',
    'fa-chalkboard-teacher', 'fa-book-open', 'fa-language',
    'fa-smoking', 'fa-beer', 'fa-archive', 'fa-wifi', 'fa-tv', 'fa-mobile-alt', 'fa-microchip', 'fa-headphones', 'fa-dog', 'fa-camera', 'fa-baby-carriage', 'fa-briefcase', 'fa-church'
];

const CAT_COLOR_OPTIONS = [
    '#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6',
    '#ec4899', '#f59e0b', '#14b8a6', '#64748b', '#06b6d4',
    '#a855f7', '#eab308', '#0ea5e9', '#be185d', '#16a34a',
    '#f43f5e', '#84cc16', '#6366f1', '#d946ef', '#fb7185'
];

let initialized = false;

function el(id) {
    return document.getElementById(id);
}

/**
 * Inicjalizuje moduł kategorii.
 */
export function initCategoriesManager() {
    if (initialized) return;

    el('add-parent-category-btn')?.addEventListener('click', () => showParentCategoryForm());

    initialized = true;
    renderCategoriesListV2();
}

/**
 * Renderuje listę kategorii i podkategorii w ustawieniach.
 */
export function renderCategoriesListV2() {
    const container = el('categories-v2-list');
    if (!container) return;

    if (!state.structuredCategories || state.structuredCategories.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500 text-sm">
                <i class="fas fa-folder-open text-3xl mb-3 block opacity-40"></i>
                Brak kategorii. Kliknij „Dodaj kategorię", aby zacząć.
            </div>`;
        return;
    }

    const parents = state.structuredCategories.filter(c => !c.parentId);
    const children = state.structuredCategories.filter(c => c.parentId);

    container.innerHTML = parents.map(parent => {
        const subs = children.filter(c => c.parentId === parent.id);
        const color = parent.color || '#64748b';
        const icon = parent.icon || 'fa-tag';

        return `
        <div class="cat-v2-parent-row rounded-2xl border border-white/10 overflow-hidden mb-2" data-id="${parent.id}">
            <div class="flex items-center px-3 py-3 bg-white/5 cursor-pointer cat-v2-toggle-btn">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mr-3"
                     style="background-color:${color}25; color:${color}">
                    <i class="fas ${icon} text-sm"></i>
                </div>
                <div class="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                    <span class="font-semibold text-white text-sm">${escapeHTML(parent.name)}</span>
                    ${parent.excludeFromExpenses ? '<span class="text-[9px] font-extrabold text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded-lg uppercase tracking-wider shrink-0">Wyklucz.</span>' : ''}
                    <span class="text-xs text-gray-500 font-medium shrink-0">${subs.length} podkat.</span>
                </div>
                <div class="flex items-center gap-1 ml-2">
                    <button class="cat-v2-add-sub-btn p-1.5 rounded-lg text-gray-400 hover:text-green-400 hover:bg-white/5 transition-colors"
                            data-parent-id="${parent.id}" title="Dodaj podkategorię">
                        <i class="fas fa-plus text-xs"></i>
                    </button>
                    <button class="cat-v2-edit-parent-btn p-1.5 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-white/5 transition-colors"
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
                        <span class="flex-1 text-sm text-gray-300 flex items-center gap-1.5 flex-wrap">
                            <span>${escapeHTML(sub.name)}</span>
                            ${sub.excludeFromExpenses ? '<span class="text-[8px] font-extrabold text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1 py-0.5 rounded-lg uppercase tracking-wider shrink-0">Wyklucz.</span>' : ''}
                        </span>
                        <div class="flex items-center gap-1">
                            <button class="cat-v2-edit-sub-btn p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-white/5 transition-colors"
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

    // Delegacja eventów
    setupListEvents(container);
}

function setupListEvents(container) {
    container.querySelectorAll('.cat-v2-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
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
        btn.addEventListener('click', (e) => { e.stopPropagation(); deleteCategory(btn.dataset.id, true, btn); });
    });

    container.querySelectorAll('.cat-v2-edit-sub-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); editSubCategory(btn.dataset.id, btn.dataset.parentId); });
    });

    container.querySelectorAll('.cat-v2-delete-sub-btn').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); deleteCategory(btn.dataset.id, false, btn); });
    });
}

/**
 * Renderuje picker ikon.
 */
function renderIconPicker(selectedIcon = 'fa-tag', containerId = 'cat-v2-icon-picker', inputId = 'cat-v2-icon-value') {
    const container = el(containerId);
    if (!container) return;
    container.innerHTML = CAT_ICON_OPTIONS.map(icon => `
        <button type="button" data-icon="${icon}" title="${icon}"
            class="icon-pick-btn w-10 h-10 rounded-xl flex items-center justify-center text-sm transition-all
                   ${icon === selectedIcon ? 'bg-brand-600 text-white ring-2 ring-brand-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'}">
            <i class="fas ${icon}"></i>
        </button>`).join('');

    container.querySelectorAll('.icon-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            el(inputId).value = btn.dataset.icon;
            container.querySelectorAll('.icon-pick-btn').forEach(b => {
                b.classList.remove('bg-brand-600', 'text-white', 'ring-2', 'ring-brand-400');
                b.classList.add('bg-white/5', 'text-gray-400', 'hover:bg-white/10');
            });
            btn.classList.add('bg-brand-600', 'text-white', 'ring-2', 'ring-brand-400');
            btn.classList.remove('bg-white/5', 'text-gray-400', 'hover:bg-white/10');
        });
    });
}

/**
 * Renderuje picker kolorów.
 */
function renderColorPicker(selectedColor = '#3b82f6') {
    const container = el('cat-v2-color-picker');
    if (!container) return;
    container.innerHTML = CAT_COLOR_OPTIONS.map(color => `
        <button type="button" data-color="${color}"
            class="color-pick-btn w-7 h-7 rounded-full transition-all border-2
                   ${color === selectedColor ? 'border-white scale-110' : 'border-transparent hover:scale-105'}"
            style="background-color:${color}">
        </button>`).join('');

    container.querySelectorAll('.color-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            el('cat-v2-color-value').value = btn.dataset.color;
            container.querySelectorAll('.color-pick-btn').forEach(b => {
                b.classList.remove('border-white', 'scale-110');
                b.classList.add('border-transparent', 'hover:scale-105');
            });
            btn.classList.remove('border-transparent', 'hover:scale-105');
            btn.classList.add('border-white', 'scale-110');
        });
    });
}

function showParentCategoryForm(editId = null) {
    const isEdit = !!editId;
    let cat = null;
    if (isEdit) {
        cat = state.structuredCategories.find(c => c.id === editId);
        if (!cat) return;
    }

    const title = isEdit ? `Edytuj: ${cat.name}` : 'Nowa kategoria główna';
    const currentName = cat ? cat.name : '';
    const currentIcon = cat ? (cat.icon || 'fa-tag') : 'fa-tag';
    const currentColor = cat ? (cat.color || '#3b82f6') : '#3b82f6';
    const currentExclude = cat ? !!cat.excludeFromExpenses : false;

    const contentHtml = `
        <div id="cat-v2-parent-form" class="space-y-4 pb-safe">
            <input type="hidden" id="cat-v2-edit-id" value="${editId || ''}">
            <input type="text" id="cat-v2-name-input" value="${currentName}" placeholder="Nazwa kategorii (np. Spożywcze)"
                class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-medium">
            
            <!-- Wykluczenie z wydatków -->
            <div class="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5">
                <div class="flex flex-col pr-4">
                    <span class="text-sm font-semibold text-white">Wyklucz z ogólnej sumy wydatków</span>
                    <span class="text-xs text-gray-400 mt-0.5">Transakcje z tej kategorii nie będą wliczane do głównego budżetu i wykresów wydatków.</span>
                </div>
                <label class="relative inline-flex items-center cursor-pointer align-middle shrink-0">
                    <input type="checkbox" id="cat-v2-exclude-input" class="sr-only peer" ${currentExclude ? 'checked' : ''}>
                    <div class="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
            </div>

            <!-- Wybór ikony -->
            <div>
                <p class="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Wybierz ikonę</p>
                <div id="cat-v2-icon-picker" class="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto p-1 scrollbar-hide">
                    <!-- generowane przez JS -->
                </div>
                <input type="hidden" id="cat-v2-icon-value" value="${currentIcon}">
            </div>
            <!-- Wybór koloru -->
            <div>
                <p class="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Wybierz kolor</p>
                <div id="cat-v2-color-picker" class="flex flex-wrap gap-3 p-1">
                    <!-- generowane przez JS -->
                </div>
                <input type="hidden" id="cat-v2-color-value" value="${currentColor}">
            </div>
        </div>
    `;

    Drawer.open({
        title,
        content: contentHtml,
        size: 'lg',
        showCloseBtn: true,
        confirmLabel: 'Zapisz kategorię',
        onConfirm: async () => {
            await saveParentCategory();
        }
    });

    setTimeout(() => {
        renderIconPicker(currentIcon, 'cat-v2-icon-picker', 'cat-v2-icon-value');
        renderColorPicker(currentColor);
        el('cat-v2-name-input')?.focus();
    }, 50);
}

function showSubCategoryForm(parentId, editId = null) {
    const parent = state.structuredCategories.find(c => c.id === parentId);
    const parentName = parent ? parent.name : '';

    const isEdit = !!editId;
    let sub = null;
    if (isEdit) {
        sub = state.structuredCategories.find(c => c.id === editId);
    }

    const title = isEdit ? 'Edytuj podkategorię' : `Nowa podkategoria → ${parentName}`;
    const currentName = sub ? sub.name : '';
    const currentIcon = (sub && sub.icon) ? sub.icon : '';
    const currentExclude = sub ? !!sub.excludeFromExpenses : false;

    const contentHtml = `
        <div id="cat-v2-sub-form" class="space-y-4 pb-safe">
            <input type="hidden" id="cat-v2-sub-parent-id" value="${parentId}">
            <input type="hidden" id="cat-v2-sub-edit-id" value="${editId || ''}">
            <input type="text" id="cat-v2-sub-name-input" value="${currentName}" placeholder="Nazwa podkategorii (np. Nabiał)"
                class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 transition-all text-sm font-medium">

            <!-- Wykluczenie z wydatków -->
            <div class="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5">
                <div class="flex flex-col pr-4">
                    <span class="text-sm font-semibold text-white">Wyklucz z ogólnej sumy wydatków</span>
                    <span class="text-xs text-gray-400 mt-0.5">Transakcje z tej podkategorii nie będą wliczane do głównego budżetu i wykresów wydatków.</span>
                </div>
                <label class="relative inline-flex items-center cursor-pointer align-middle shrink-0">
                    <input type="checkbox" id="cat-v2-sub-exclude-input" class="sr-only peer" ${currentExclude ? 'checked' : ''}>
                    <div class="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
            </div>

            <!-- Wybór ikony dla podkategorii -->
            <div>
                <p class="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Ikona (opcjonalnie)</p>
                <div id="cat-v2-sub-icon-picker" class="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto p-1 scrollbar-hide">
                    <!-- generowane przez JS -->
                </div>
                <input type="hidden" id="cat-v2-sub-icon-value" value="${currentIcon}">
            </div>
        </div>
    `;

    Drawer.open({
        title,
        content: contentHtml,
        size: 'lg',
        showCloseBtn: true,
        confirmLabel: 'Zapisz podkategorię',
        onConfirm: async () => {
            await saveSubCategory();
        }
    });

    setTimeout(() => {
        renderIconPicker(currentIcon, 'cat-v2-sub-icon-picker', 'cat-v2-sub-icon-value');
        el('cat-v2-sub-name-input')?.focus();
    }, 50);
}

function editParentCategory(id) { showParentCategoryForm(id); }
function editSubCategory(id, parentId) { showSubCategoryForm(parentId, id); }

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function saveParentCategory() {
    const name = el('cat-v2-name-input')?.value.trim();
    const editId = el('cat-v2-edit-id')?.value;
    const icon = el('cat-v2-icon-value')?.value;
    const color = el('cat-v2-color-value')?.value;
    const excludeFromExpenses = el('cat-v2-exclude-input')?.checked || false;

    if (!name) { 
        alert('Podaj nazwę kategorii.'); 
        throw new Error('Validation Error'); 
    }

    if (editId) {
        await apiCall(`/api/categories/v2/${editId}`, 'PUT', { name, icon, color, excludeFromExpenses });
    } else {
        const newStructured = [...state.structuredCategories, { id: generateId(), name, parentId: null, icon, color, excludeFromExpenses }];
        await apiCall('/api/categories/v2', 'POST', { structuredCategories: newStructured });
    }
    
    Drawer.close();
    await fetchInitialData(false);
    renderCategoriesListV2();
}

async function saveSubCategory() {
    const name = el('cat-v2-sub-name-input')?.value.trim();
    const parentId = el('cat-v2-sub-parent-id')?.value;
    const editId = el('cat-v2-sub-edit-id')?.value;
    const icon = el('cat-v2-sub-icon-value')?.value;
    const excludeFromExpenses = el('cat-v2-sub-exclude-input')?.checked || false;

    if (!name) { 
        alert('Podaj nazwę podkategorii.'); 
        throw new Error('Validation Error'); 
    }

    if (editId) {
        await apiCall(`/api/categories/v2/${editId}`, 'PUT', { name, icon, excludeFromExpenses });
    } else {
        const newStructured = [...state.structuredCategories, { id: generateId(), name, parentId, icon, excludeFromExpenses }];
        await apiCall('/api/categories/v2', 'POST', { structuredCategories: newStructured });
    }
    
    Drawer.close();
    await fetchInitialData(false);
    renderCategoriesListV2();
}

async function deleteCategory(id, isParent, btn) {
    const cat = state.structuredCategories.find(c => c.id === id);
    if (!cat) return;

    const msg = isParent
        ? `Usunąć kategorię „${cat.name}" i wszystkie jej podkategorie?`
        : `Usunąć podkategorię „${cat.name}"?`;

    if (!confirm(msg)) return;

    const originalContent = btn ? btn.innerHTML : '';
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner animate-spin text-xs"></i>';
        }
        await apiCall(`/api/categories/v2/${id}`, 'DELETE');
        await fetchInitialData(false);
        renderCategoriesListV2();
    } catch (err) {
        alert('Błąd: ' + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}
