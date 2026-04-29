/**
 * Moduł Tagów - Warstwa współdzielona.
 * Wydzielony z tags.js w Etapie 2 refaktoryzacji.
 * 
 * Odpowiada za:
 * - Pobieranie definicji i opcji tagów z centralnego stanu (getTagOptions, getTagGroups)
 * - Zarządzanie zbiorczym drawerem (panelem wysuwanym) do wielokrotnego wyboru tagów (openTagsDrawer, closeTagsDrawer)
 * - Obsługę dynamicznego drawera wyboru pojedynczego tagu (openDynamicTagSelection)
 * - Formatowanie i budowanie opisów tagów w UI (buildTagsSummary, getTagGroupLabel)
 */
import state from '../core/state.js';
import { openSelectionDrawer, acquireOverlayNavigationLock, releaseOverlayNavigationLock, hasVisibleBlockingOverlay } from './ui.js';

export function getTagOptions(group) {
    return (state.tagDefinitions && Array.isArray(state.tagDefinitions[group])) ? state.tagDefinitions[group] : [];
}

export function getTagDefaultValue(group, fallback = '') {
    const options = getTagOptions(group);
    if (options.length > 0 && options[0].value) return options[0].value;
    return fallback;
}

export function getTagLabel(group, value) {
    const options = getTagOptions(group);
    const match = options.find(t => t.value === value);
    return (match && match.label) ? match.label : (value || '');
}

export function openDynamicTagSelection(group, title, currentValue, onSelect, allLabel = null) {
    const options = getTagOptions(group).map(t => ({
        value: t.value,
        label: t.label || t.value,
        icon: t.icon || ''
    }));
    const finalOptions = allLabel ? [{ value: 'all', label: allLabel }, ...options] : options;
    if (!finalOptions.length) {
        alert('Brak zdefiniowanych tagów dla tej grupy.');
        return;
    }
    openSelectionDrawer(title, finalOptions, (val, label) => onSelect(val, label), currentValue || (allLabel ? 'all' : finalOptions[0].value));
}

export function getTagGroupLabel(group) {
    if (!group) return '';
    const labelKey = group + '_label';
    if (state.tagDefinitions && typeof state.tagDefinitions[labelKey] === 'string' && state.tagDefinitions[labelKey]) {
        return state.tagDefinitions[labelKey];
    }
    const defaultLabels = { nature: 'Natura', purpose: 'Celowość' };
    if (defaultLabels[group]) return defaultLabels[group];
    
    // Fallback do sformatowanego klucza
    const sGroup = String(group);
    if (!sGroup) return '';
    return sGroup.charAt(0).toUpperCase() + sGroup.slice(1);
}

export function buildTagsSummary(tagsObj) {
    if (!tagsObj || typeof tagsObj !== 'object') return 'Wybierz tagi...';
    const groups = getTagGroups();
    const parts = groups
        .map(group => {
            const val = tagsObj[group];
            if (!val) return null;
            return getTagLabel(group, val);
        })
        .filter(Boolean);
    return parts.length > 0 ? parts.join(' • ') : 'Wybierz tagi...';
}

export function getTagGroups() {
    return Object.keys(state.tagDefinitions || {}).filter(k => !k.endsWith('_label') && Array.isArray(state.tagDefinitions[k]));
}

export function getDefaultTagValues() {
    const result = {};
    getTagGroups().forEach(group => {
        result[group] = getTagDefaultValue(group, '');
    });
    return result;
}

let _tagsDrawerCallback = null;
let _tagsDrawerCurrentValues = {};
let _tagsDrawerIsFilter = false;

export function openTagsDrawer(currentTags, onConfirm, isFilter = false) {
    const overlay = document.getElementById('tags-selection-overlay');
    const drawer = document.getElementById('tags-selection-drawer');
    const content = document.getElementById('tags-selection-content');
    if (!drawer || !content) {
        console.warn('Tags selection drawer not found in DOM');
        return;
    }

    _tagsDrawerCallback = onConfirm;
    _tagsDrawerIsFilter = isFilter;
    _tagsDrawerCurrentValues = Object.assign({}, isFilter ? {} : getDefaultTagValues(), currentTags || {});

    const groups = getTagGroups();
    content.innerHTML = '';

    groups.forEach(group => {
        const options = getTagOptions(group);
        const groupLabel = String(getTagGroupLabel(group) || group || '');
        const currentVal = _tagsDrawerCurrentValues[group] || (isFilter ? 'all' : (options[0] && options[0].value) || '');

        const groupEl = document.createElement('div');
        groupEl.innerHTML = `
            <div class="mb-2">
                <p class="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-2">${groupLabel}</p>
                <div class="flex flex-wrap gap-2">
                    ${isFilter ? `
                        <button class="tag-select-btn px-3 py-1.5 rounded-lg text-xs transition-all border ${currentVal === 'all' || !currentVal ? 'bg-brand-600 text-white border-brand-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}"
                            data-group="${group}" data-value="all">
                            Wszystkie
                        </button>
                    ` : ''}
                    ${options.map(opt => `
                        <button class="tag-select-btn px-3 py-1.5 rounded-lg text-xs transition-all border ${currentVal === opt.value ? 'bg-brand-600 text-white border-brand-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}"
                            data-group="${group}" data-value="${opt.value}">
                            ${opt.label || opt.value}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        content.appendChild(groupEl);
    });

    content.onclick = (e) => {
        const btn = e.target.closest('.tag-select-btn');
        if (!btn) return;
        const group = btn.dataset.group;
        const val = btn.dataset.value;

        const btns = content.querySelectorAll(`.tag-select-btn[data-group="${group}"]`);
        btns.forEach(b => b.classList.replace('bg-brand-600', 'bg-white/5'));
        btns.forEach(b => b.classList.replace('text-white', 'text-gray-400'));
        btns.forEach(b => b.classList.replace('border-brand-500', 'border-white/10'));

        btn.classList.replace('bg-white/5', 'bg-brand-600');
        btn.classList.replace('text-gray-400', 'text-white');
        btn.classList.replace('border-white/10', 'border-brand-500');

        _tagsDrawerCurrentValues[group] = (val === 'all') ? null : val;
    };
    
    const wasAlreadyOpen = overlay.classList.contains('active') || !overlay.classList.contains('hidden');
    if (!wasAlreadyOpen && typeof acquireOverlayNavigationLock === 'function') {
        acquireOverlayNavigationLock();
    }
    overlay.classList.remove('hidden');
    drawer.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.add('active');
        drawer.classList.add('active');
    }, 10);
    document.body.style.overflow = 'hidden';
}

export function closeTagsDrawer() {
    const overlay = document.getElementById('tags-selection-overlay');
    const drawer = document.getElementById('tags-selection-drawer');
    if (!overlay || !drawer) return;

    if (typeof releaseOverlayNavigationLock === 'function') {
        releaseOverlayNavigationLock();
    }
    overlay.classList.remove('active');
    drawer.classList.remove('active');
    setTimeout(() => {
        overlay.classList.add('hidden');
        drawer.classList.add('hidden');
        if (typeof hasVisibleBlockingOverlay === 'function' && !hasVisibleBlockingOverlay()) {
            document.body.style.overflow = '';
        }
    }, 300);
}

export function confirmTagsSelection() {
    if (_tagsDrawerCallback) {
        _tagsDrawerCallback(_tagsDrawerCurrentValues);
    }
    closeTagsDrawer();
}

export function initTagsSelectionDrawer() {
    document.getElementById('close-tags-selection-drawer')?.addEventListener('click', closeTagsDrawer);
    document.getElementById('tags-selection-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'tags-selection-overlay') closeTagsDrawer();
    });
    document.getElementById('tags-selection-confirm-btn')?.addEventListener('click', confirmTagsSelection);
}
