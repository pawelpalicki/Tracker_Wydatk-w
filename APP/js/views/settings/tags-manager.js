/**
 * Moduł Zarządzania Tagami (Ustawienia).
 */
import state from '../../core/state.js';
import { apiCall } from '../../core/api.js';
import { getTagGroups, getTagGroupLabel, getTagOptions } from '../../shared/tags.js';
import { fetchInitialData } from '../../core/data-loader.js';

let initialized = false;

function el(id) {
    return document.getElementById(id);
}

/**
 * Inicjalizuje moduł managera tagów.
 */
export function initTagsManager() {
    if (initialized) return;

    // Przycisk "Dodaj grupę tagów"
    el('add-tag-group-btn')?.addEventListener('click', () => openTagGroupModal(null));

    // Przyciski modalu tagu
    el('tag-form-cancel-btn')?.addEventListener('click', closeTagFormModal);
    el('tag-form-modal-backdrop')?.addEventListener('click', closeTagFormModal);
    el('tag-form-save-btn')?.addEventListener('click', saveTagFromModal);

    // Przyciski modalu grupy
    el('tag-group-cancel-btn')?.addEventListener('click', closeTagGroupModal);
    el('tag-group-modal-backdrop')?.addEventListener('click', closeTagGroupModal);
    el('tag-group-save-btn')?.addEventListener('click', saveTagGroup);

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
    const modal = el('tag-form-modal');
    if (!modal) return;

    el('tag-form-group').value = group;
    el('tag-form-old-value').value = oldValue || '';

    const labelInput = el('tag-form-label-input');
    const valuePreview = el('tag-form-value-preview');
    const iconInput = el('tag-form-icon-input');

    if (oldValue) {
        const tags = getTagOptions(group);
        const existing = tags.find(t => t.value === oldValue);
        el('tag-form-modal-title').textContent = 'Edytuj tag';
        labelInput.value = existing ? existing.label : oldValue;
        iconInput.value = existing ? existing.icon : '';
        valuePreview.textContent = oldValue;
    } else {
        el('tag-form-modal-title').textContent = 'Nowy tag';
        labelInput.value = '';
        iconInput.value = '';
        valuePreview.textContent = '—';
    }

    labelInput.oninput = () => {
        const raw = labelInput.value.trim().toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_\u00e0-\u017e-]/g, '')
            .slice(0, 32);
        valuePreview.textContent = raw || '—';
    };

    modal.classList.remove('hidden');
}

function closeTagFormModal() {
    el('tag-form-modal')?.classList.add('hidden');
}

async function saveTagFromModal() {
    const group = el('tag-form-group').value;
    const oldValue = el('tag-form-old-value').value;
    const labelRaw = el('tag-form-label-input').value.trim();
    const icon = el('tag-form-icon-input').value.trim();

    if (!labelRaw) { alert('Podaj etykietę tagu.'); return; }

    const value = labelRaw.toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_\u00e0-\u017e-]/g, '')
        .slice(0, 32);

    if (!value) { alert('Nie można wygenerować wartości.'); return; }

    const saveBtn = el('tag-form-save-btn');
    const originalText = saveBtn ? saveBtn.innerHTML : 'Zapisz';

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i> Zapisywanie...';
        }

        if (oldValue) {
            await apiCall(`/api/tags/${group}/${encodeURIComponent(oldValue)}`, 'PUT', { value, label: labelRaw, icon });
        } else {
            await apiCall(`/api/tags/${group}`, 'POST', { value, label: labelRaw, icon });
        }
        closeTagFormModal();
        await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}

async function deleteTagConfirm(group, value, btn) {
    if (!confirm(`Usunąć tag "${value}"?`)) return;
    const originalContent = btn.innerHTML;
    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i>';
        await apiCall(`/api/tags/${group}/${encodeURIComponent(value)}`, 'DELETE');
        await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// --- MODALE GRUP ---

function openTagGroupModal(existingGroup = null) {
    const modal = el('tag-group-modal');
    if (!modal) return;

    const labelInput = el('tag-group-label-input');
    const keyPreview = el('tag-group-key-preview');
    const initialTagContainer = el('tag-group-initial-tag-container');

    if (existingGroup) {
        const label = getTagGroupLabel(existingGroup);
        el('tag-group-modal-title').textContent = 'Edytuj grupę tagów';
        labelInput.value = label;
        keyPreview.textContent = existingGroup;
        el('tag-group-edit-id').value = existingGroup;
        initialTagContainer?.classList.add('hidden');
    } else {
        el('tag-group-modal-title').textContent = 'Nowa grupa tagów';
        labelInput.value = '';
        keyPreview.textContent = '—';
        el('tag-group-edit-id').value = '';
        el('tag-group-first-label').value = '';
        el('tag-group-first-icon').value = '';
        initialTagContainer?.classList.remove('hidden');
    }

    labelInput.oninput = () => {
        const raw = labelInput.value.trim().toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_-]/g, '')
            .slice(0, 32);
        keyPreview.textContent = raw || '—';
    };

    modal.classList.remove('hidden');
}

function closeTagGroupModal() {
    el('tag-group-modal')?.classList.add('hidden');
}

async function saveTagGroup() {
    const label = el('tag-group-label-input').value.trim();
    const groupKey = el('tag-group-key-preview').textContent.trim();
    const editGroupId = el('tag-group-edit-id').value;

    if (!label) { alert('Podaj nazwę grupy.'); return; }
    
    const saveBtn = el('tag-group-save-btn');
    const originalText = saveBtn ? saveBtn.innerHTML : 'Zapisz';

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i> Zapisywanie...';
        }

        if (editGroupId) {
            await apiCall(`/api/tags/groups/${encodeURIComponent(editGroupId)}`, 'PUT', { label });
        } else {
            const firstLabel = el('tag-group-first-label').value.trim();
            const firstIcon = el('tag-group-first-icon').value.trim();
            if (!firstLabel) { alert('Podaj pierwszą wartość grupy.'); return; }
            if (groupKey === '—' || !groupKey) { alert('Błąd: Nieprawidłowy klucz grupy.'); return; }
            await apiCall('/api/tags/groups', 'POST', { group: groupKey, label, firstLabel, firstIcon });
        }
        closeTagGroupModal();
        await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}

async function deleteTagGroup(group, btn) {
    if (!confirm(`Usunąć grupę "${group}"?`)) return;
    const originalContent = btn.innerHTML;
    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i>';
        await apiCall(`/api/tags/groups/${encodeURIComponent(group)}`, 'DELETE');
        await fetchInitialData(false);
        renderTagsManager();
    } catch (err) {
        alert('Błąd: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}
