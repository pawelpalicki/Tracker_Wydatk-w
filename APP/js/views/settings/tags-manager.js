/**
 * Moduł Zarządzania Tagami (Ustawienia).
 */
import state from '../../core/state.js';
import { apiCall } from '../../core/api.js';
import { getTagGroups, getTagGroupLabel, getTagOptions } from '../../shared/tags.js';
import { fetchInitialData } from '../../core/data-loader.js';
import Drawer from '../../shared/drawer.js';

let initialized = false;

function el(id) {
    return document.getElementById(id);
}

/**
 * Inicjalizuje moduł managera tagów.
 */
export function initTagsManager() {
    if (initialized) return;

    // Przyciski i eventy dla tags-manager inicjalizowane są inline lub przez delegację
    // Przycisk "Dodaj grupę tagów"
    el('add-tag-group-btn')?.addEventListener('click', () => openTagGroupModal(null));

    // Delegacja eventów w kontenerze grup
    el('tags-groups-container')?.addEventListener('click', handleTagsContainerClick);

    initialized = true;
    renderTagsManager();
}

/**
 * Renderuje wszystkie grupy tagów.
 */
export function renderTagsManager() {
    const container = el('tags-groups-container');
    if (!container) return;

    const groups = getTagGroups();
    if (groups.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic">Brak grup tagów.</p>';
        return;
    }
    container.innerHTML = groups.map(renderTagGroupSection).join('');
}

function renderTagGroupSection(group) {
    const groupLabel = getTagGroupLabel(group);
    const tags = getTagOptions(group);
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
                    <button class="tag-edit-btn p-1.5 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-white/5 transition-colors"
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
        <div class="w-full p-3.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all" data-tag-group="${group}">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2 min-w-0">
                    <h4 class="text-sm font-semibold text-white truncate">${groupLabel}</h4>
                    ${isBuiltin ? '<span class="text-[10px] text-gray-600 px-1.5 py-0.5 rounded bg-white/5 shrink-0">wbudowana</span>' : ''}
                </div>
                <div class="flex items-center gap-1">
                    <button type="button" class="add-tag-in-group-btn p-1.5 rounded-lg text-gray-400 hover:text-green-400 hover:bg-white/5 transition-colors"
                        data-group="${group}" title="Dodaj tag">
                        <i class="fas fa-plus text-xs"></i>
                    </button>
                    ${!isBuiltin ? `
                        <button class="edit-tag-group-btn p-1.5 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-white/5 transition-colors" data-group="${group}" title="Edytuj nazwę grupy">
                            <i class="fas fa-pen text-xs"></i>
                        </button>
                        <button class="delete-tag-group-btn p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/5 transition-colors" data-group="${group}" title="Usuń grupę">
                            <i class="fas fa-trash text-xs"></i>
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

function handleTagsContainerClick(e) {
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
        deleteTagConfirm(deleteBtn.dataset.group, deleteBtn.dataset.value, deleteBtn);
        return;
    }
    const editGroupBtn = e.target.closest('.edit-tag-group-btn');
    if (editGroupBtn) {
        openTagGroupModal(editGroupBtn.dataset.group);
        return;
    }
    const delGroupBtn = e.target.closest('.delete-tag-group-btn');
    if (delGroupBtn) {
        deleteTagGroup(delGroupBtn.dataset.group, delGroupBtn);
    }
}

// --- MODALE TAGÓW ---

function openTagFormModal(group, oldValue = null) {
    const isEdit = !!oldValue;
    
    let label = '';
    let icon = '';
    if (isEdit) {
        const tags = getTagOptions(group);
        const existing = tags.find(t => t.value === oldValue);
        label = existing ? existing.label : oldValue;
        icon = existing ? existing.icon : '';
    }

    const content = `
        <div class="space-y-4">
            <div>
                <label class="block text-xs text-gray-400 mb-1">Etykieta (nazwa wyświetlana) *</label>
                <input type="text" id="tag-form-label-input" value="${label.replace(/"/g, '&quot;')}"
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 focus:ring-1 focus:ring-brand-500 transition-all outline-none text-sm"
                    placeholder="np. Okazjonalny">
            </div>
            <div>
                <label class="block text-xs text-gray-400 mb-1">Podgląd wartości (auto)</label>
                <div class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span class="text-xs text-gray-500">value:</span>
                    <span id="tag-form-value-preview" class="text-brand-500 font-mono text-sm">${oldValue || '—'}</span>
                </div>
            </div>
            <div>
                <label class="block text-xs text-gray-400 mb-1">Emoji (opcjonalnie)</label>
                <input type="text" id="tag-form-icon-input" value="${icon.replace(/"/g, '&quot;')}"
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 focus:ring-1 focus:ring-brand-500 transition-all outline-none text-sm"
                    placeholder="np. ⭐" maxlength="4">
            </div>
            <input type="hidden" id="tag-form-group" value="${group}">
            <input type="hidden" id="tag-form-old-value" value="${oldValue || ''}">
        </div>
    `;

    Drawer.open({
        title: isEdit ? 'Edytuj tag' : 'Nowy tag',
        content,
        size: 'sm',
        confirmLabel: 'Zapisz',
        cancelLabel: 'Anuluj',
        onConfirm: async () => {
            await saveTagFromModal();
        },
        triggerId: isEdit ? null : 'add-tag-group-btn',
    });

    // Podepnij nasłuchiwanie na input dla podglądu wartości
    setTimeout(() => {
        const labelInput = el('tag-form-label-input');
        const valuePreview = el('tag-form-value-preview');
        if (labelInput && valuePreview) {
            labelInput.oninput = () => {
                const raw = labelInput.value.trim().toLowerCase()
                    .replace(/\s+/g, '_')
                    .replace(/[^a-z0-9_\u00e0-\u017e-]/g, '')
                    .slice(0, 32);
                valuePreview.textContent = raw || '—';
            };
            labelInput.focus();
        }
    }, 50);
}

async function saveTagFromModal() {
    const group = el('tag-form-group').value;
    const oldValue = el('tag-form-old-value').value;
    const labelRaw = el('tag-form-label-input').value.trim();
    const icon = el('tag-form-icon-input').value.trim();

    if (!labelRaw) { alert('Podaj etykietę tagu.'); throw new Error('Brak etykiety'); }

    const value = labelRaw.toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_\u00e0-\u017e-]/g, '')
        .slice(0, 32);

    if (!value) { alert('Nie można wygenerować wartości.'); throw new Error('Błąd generacji wartości'); }

    try {
        if (oldValue) {
            await apiCall(`/api/tags/${group}/${encodeURIComponent(oldValue)}`, 'PUT', { value, label: labelRaw, icon });
        } else {
            await apiCall(`/api/tags/${group}`, 'POST', { value, label: labelRaw, icon });
        }
        Drawer.close();
        await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
        throw err;
    }
}

function setTagDeleteButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn._deleteOriginalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner animate-spin text-xs"></i>';
    } else {
        btn.disabled = false;
        if (btn._deleteOriginalHtml != null) btn.innerHTML = btn._deleteOriginalHtml;
        delete btn._deleteOriginalHtml;
    }
}

async function deleteTagConfirm(group, value, btn) {
    if (!confirm(`Usunąć tag "${value}"?`)) return;
    setTagDeleteButtonLoading(btn, true);
    try {
        await apiCall(`/api/tags/${group}/${encodeURIComponent(value)}`, 'DELETE');
        await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
        setTagDeleteButtonLoading(btn, false);
    }
}

// --- MODALE GRUP ---

function openTagGroupModal(existingGroup = null) {
    let label = '';
    let keyPreview = '—';
    if (existingGroup) {
        label = getTagGroupLabel(existingGroup);
        keyPreview = existingGroup;
    }

    const content = `
        <div class="space-y-4">
            <input type="hidden" id="tag-group-edit-id" value="${existingGroup || ''}">
            <div>
                <label class="block text-xs text-gray-400 mb-1">Nazwa grupy (wyświetlana) *</label>
                <input type="text" id="tag-group-label-input" value="${label.replace(/"/g, '&quot;')}"
                    class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 focus:ring-1 focus:ring-brand-500 transition-all outline-none text-sm"
                    placeholder="np. Sezon">
            </div>
            <div>
                <label class="block text-xs text-gray-400 mb-1">Klucz grupy (auto)</label>
                <div class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span class="text-xs text-gray-500">key:</span>
                    <span id="tag-group-key-preview" class="text-brand-500 font-mono text-sm">${keyPreview}</span>
                </div>
            </div>
            ${!existingGroup ? `
            <div id="tag-group-initial-tag-container" class="border-t border-white/10 pt-4">
                <p class="text-xs text-gray-400 mb-2">Pierwsza wartość (wymagana)</p>
                <div class="flex gap-2">
                    <input type="text" id="tag-group-first-label"
                        class="flex-1 rounded-xl border-white/10 bg-white/5 text-white py-2.5 px-3 focus:bg-white/10 transition-all outline-none text-sm"
                        placeholder="np. Letni">
                    <input type="text" id="tag-group-first-icon"
                        class="w-16 rounded-xl border-white/10 bg-white/5 text-white py-2.5 px-3 focus:bg-white/10 transition-all outline-none text-sm text-center"
                        placeholder="emoji" maxlength="4">
                </div>
            </div>` : ''}
        </div>
    `;

    Drawer.open({
        title: existingGroup ? 'Edytuj grupę tagów' : 'Nowa grupa tagów',
        content,
        size: 'sm',
        confirmLabel: 'Zapisz',
        cancelLabel: 'Anuluj',
        onConfirm: async () => {
            await saveTagGroup();
        },
        triggerId: 'add-tag-group-btn',
    });

    setTimeout(() => {
        const labelInput = el('tag-group-label-input');
        const keyPreviewEl = el('tag-group-key-preview');
        if (labelInput && keyPreviewEl) {
            labelInput.oninput = () => {
                const raw = labelInput.value.trim().toLowerCase()
                    .replace(/\s+/g, '_')
                    .replace(/[^a-z0-9_-]/g, '')
                    .slice(0, 32);
                keyPreviewEl.textContent = raw || '—';
            };
            labelInput.focus();
        }
    }, 50);
}

async function saveTagGroup() {
    const label = el('tag-group-label-input').value.trim();
    const groupKey = el('tag-group-key-preview').textContent.trim();
    const editGroupId = el('tag-group-edit-id').value;

    if (!label) { alert('Podaj nazwę grupy.'); throw new Error('Brak nazwy grupy'); }

    try {
        if (editGroupId) {
            await apiCall(`/api/tags/groups/${encodeURIComponent(editGroupId)}`, 'PUT', { label });
        } else {
            const firstLabel = el('tag-group-first-label').value.trim();
            const firstIcon = el('tag-group-first-icon').value.trim();
            if (!firstLabel) { alert('Podaj pierwszą wartość grupy.'); throw new Error('Brak pierwszej wartości'); }
            if (groupKey === '—' || !groupKey) { alert('Błąd: Nieprawidłowy klucz grupy.'); throw new Error('Nieprawidłowy klucz'); }
            await apiCall('/api/tags/groups', 'POST', { group: groupKey, label, firstLabel, firstIcon });
        }
        Drawer.close();
        await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
        throw err;
    }
}

async function deleteTagGroup(group, btn) {
    if (!confirm(`Usunąć grupę "${group}"?`)) return;
    setTagDeleteButtonLoading(btn, true);
    try {
        await apiCall(`/api/tags/groups/${encodeURIComponent(group)}`, 'DELETE');
        await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
        setTagDeleteButtonLoading(btn, false);
    }
}
