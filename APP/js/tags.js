// Tracker Wydatków - Tags Functions

// Funkcje pomocnicze dla tagów

function getTagOptions(group) {
    return (tagDefinitions && Array.isArray(tagDefinitions[group])) ? tagDefinitions[group] : [];
}

function getTagDefaultValue(group, fallback = '') {
    const options = getTagOptions(group);
    if (options.length > 0 && options[0].value) return options[0].value;
    return fallback;
}

function getTagLabel(group, value) {
    const options = getTagOptions(group);
    const match = options.find(t => t.value === value);
    return (match && match.label) ? match.label : (value || '');
}

function openDynamicTagSelection(group, title, currentValue, onSelect, allLabel = null) {
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

function getTagGroupLabel(group) {
    if (!group) return '';
    const labelKey = group + '_label';
    if (tagDefinitions && typeof tagDefinitions[labelKey] === 'string' && tagDefinitions[labelKey]) {
        return tagDefinitions[labelKey];
    }
    const defaultLabels = { nature: 'Natura', purpose: 'Celowość' };
    if (defaultLabels[group]) return defaultLabels[group];
    
    // Fallback do sformatowanego klucza
    const sGroup = String(group);
    if (!sGroup) return '';
    return sGroup.charAt(0).toUpperCase() + sGroup.slice(1);
}

// Zwraca tekst podsumowania tagów (np. 'Zmienny • Konieczny')
function buildTagsSummary(tagsObj) {
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

// Zwraca listę wszystkich kluczy grup tagów (z wyłączeniem meta-kluczy _label)
function getTagGroups() {
    return Object.keys(tagDefinitions || {}).filter(k => !k.endsWith('_label') && Array.isArray(tagDefinitions[k]));
}

// Inicjalizuje wartości domyślne tagów dla wszystkich grup
function getDefaultTagValues() {
    const result = {};
    getTagGroups().forEach(group => {
        result[group] = getTagDefaultValue(group, '');
    });
    return result;
}

let _tagsDrawerCallback = null;
let _tagsDrawerCurrentValues = {};
let _tagsDrawerIsFilter = false;

// Otwiera jeden, zbiorczy szufladę tagów dla wszystkich grup
function openTagsDrawer(currentTags, onConfirm, isFilter = false) {
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

    // Delegacja kliknięć w tagi
    content.onclick = (e) => {
        const btn = e.target.closest('.tag-select-btn');
        if (!btn) return;
        const group = btn.dataset.group;
        const val = btn.dataset.value;

        // Odznacz poprzedni w tej grupie
        const btns = content.querySelectorAll(`.tag-select-btn[data-group="${group}"]`);
        btns.forEach(b => b.classList.replace('bg-brand-600', 'bg-white/5'));
        btns.forEach(b => b.classList.replace('text-white', 'text-gray-400'));
        btns.forEach(b => b.classList.replace('border-brand-500', 'border-white/10'));

        // Zaznacz nowy
        btn.classList.replace('bg-white/5', 'bg-brand-600');
        btn.classList.replace('text-gray-400', 'text-white');
        btn.classList.replace('border-white/10', 'border-brand-500');

        _tagsDrawerCurrentValues[group] = (val === 'all') ? null : val;
    };

    overlay.classList.remove('hidden');
    drawer.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.add('active');
        drawer.classList.add('active');
    }, 10);
    document.body.style.overflow = 'hidden';
}

function closeTagsDrawer() {
    const overlay = document.getElementById('tags-selection-overlay');
    const drawer = document.getElementById('tags-selection-drawer');
    if (!overlay || !drawer) return;

    overlay.classList.remove('active');
    drawer.classList.remove('active');
    setTimeout(() => {
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
    }, 300);
}

function confirmTagsSelection() {
    if (_tagsDrawerCallback) {
        _tagsDrawerCallback(_tagsDrawerCurrentValues);
    }
    closeTagsDrawer();
}

// Dodaj Listenery dla przycisków szuflady tagów (zatwierdź/anuluj)
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('tags-selection-confirm')?.addEventListener('click', confirmTagsSelection);
    document.getElementById('tags-selection-cancel')?.addEventListener('click', closeTagsDrawer);
    document.getElementById('tags-selection-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'tags-selection-overlay') closeTagsDrawer();
    });
});

function initTagsSelectionDrawer() {
    document.getElementById('close-tags-selection-drawer')?.addEventListener('click', closeTagsDrawer);
    document.getElementById('tags-selection-overlay')?.addEventListener('click', closeTagsDrawer);
    document.getElementById('tags-selection-confirm-btn')?.addEventListener('click', () => {
        if (typeof _tagsDrawerCallback === 'function') {
            _tagsDrawerCallback(Object.assign({}, _tagsDrawerCurrentValues));
        }
        closeTagsDrawer();
    });
}

window.getTagOptions = getTagOptions;
window.getTagDefaultValue = getTagDefaultValue;
window.getTagLabel = getTagLabel;
window.getTagGroupLabel = getTagGroupLabel;
window.getTagGroups = getTagGroups;
window.getDefaultTagValues = getDefaultTagValues;
window.buildTagsSummary = buildTagsSummary;
window.openDynamicTagSelection = openDynamicTagSelection;
window.openTagsDrawer = openTagsDrawer;
window.closeTagsDrawer = closeTagsDrawer;