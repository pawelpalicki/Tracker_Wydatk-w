/**
 * Moduł Kategorii - Warstwa współdzielona.
 * Wydzielony z categories-v2.js oraz ui.js w Etapie 2 refaktoryzacji.
 * 
 * Odpowiada za:
 * - Wyszukiwanie kategorii rodzica (getParentCategoryByName)
 * - Wyszukiwanie podkategorii (getSubCategoryByName)
 * - Zarządzanie stanem wyboru i aplikowanie go w UI (getCategorySelectionState, applyCategorySelectionState)
 * - Otwieranie wieloetapowego, hierarchicznego drawera wyboru kategorii (openHierarchicalCategoryDrawer)
 */
import state from '../core/state.js';
import { openSelectionDrawer, closeSelectionDrawer } from './ui.js';

export function getParentCategoryByName(parentName) {
    if (!parentName || !state.structuredCategories || !Array.isArray(state.structuredCategories)) {
        return null;
    }
    return state.structuredCategories.find(category => category.name === parentName && !category.parentId) || null;
}

export function getSubCategoryByName(parentName, subCategoryName) {
    if (!subCategoryName) return null;
    const parentCategory = getParentCategoryByName(parentName);
    if (!parentCategory || !state.structuredCategories || !Array.isArray(state.structuredCategories)) {
        return null;
    }
    return state.structuredCategories.find(category => category.name === subCategoryName && category.parentId === parentCategory.id) || null;
}

export function getCategorySelectionState(parentName = '', subCategoryName = '', fallbackLabel = 'Wybierz kategorię') {
    const safeParentName = parentName || '';
    const safeSubCategoryName = subCategoryName || '';
    const parentCategory = getParentCategoryByName(safeParentName);
    const subCategory = getSubCategoryByName(safeParentName, safeSubCategoryName);
    const iconName =
        (subCategory && subCategory.icon) ||
        (parentCategory && parentCategory.icon) ||
        'fa-tag';
    const color =
        (parentCategory && parentCategory.color) ||
        '#6b7280';

    return {
        parentName: safeParentName,
        subCategoryName: safeSubCategoryName,
        parentCategory,
        subCategory,
        iconName,
        color,
        labelText: safeParentName ? (safeSubCategoryName ? `${safeParentName} / ${safeSubCategoryName}` : safeParentName) : fallbackLabel,
        compositeValue: safeSubCategoryName ? `${safeParentName}|${safeSubCategoryName}` : safeParentName
    };
}

export function applyCategorySelectionState(targets = {}, parentName = '', subCategoryName = '', fallbackLabel = 'Wybierz kategorię') {
    const stateObj = getCategorySelectionState(parentName, subCategoryName, fallbackLabel);
    const { labelEl, iconEl, valueEl, buttonEl } = targets;

    if (labelEl) {
        labelEl.textContent = stateObj.labelText;
    }

    if (valueEl) {
        valueEl.value = stateObj.compositeValue;
    }

    if (buttonEl) {
        buttonEl.dataset.value = stateObj.compositeValue;
    }

    if (iconEl) {
        iconEl.innerHTML = `<i class="fas ${stateObj.iconName}"></i>`;
        iconEl.style.color = stateObj.color;
        if (iconEl.classList.contains('rounded-xl') || iconEl.classList.contains('rounded-lg') || iconEl.classList.contains('rounded-full')) {
            iconEl.style.backgroundColor = `${stateObj.color}20`;
        }
    }

    return stateObj;
}

export function openHierarchicalCategoryDrawer(row, currentCategory, currentSubCategory, onSelect, showManageButton = true) {
    const parents = state.structuredCategories.filter(c => !c.parentId);

    if (parents.length === 0) {
        return;
    }

    const openStep1 = (replaceCurrent = false) => {
        const currentParentDoc = parents.find(p => p.name === currentCategory);
        const currentParentId = currentParentDoc ? currentParentDoc.id : null;

        const options = parents.map(p => ({
            value: p.id,
            label: p.name,
            icon: `<i class="fas ${p.icon || 'fa-tag'}"></i>`,
            color: p.color || '#64748b'
        }));

        openSelectionDrawer('Wybierz kategorię', options, (parentId) => {
            const parent = state.structuredCategories.find(c => c.id === parentId);
            const subs = state.structuredCategories.filter(c => c.parentId === parentId);

            if (subs.length === 0) {
                if (onSelect) onSelect(parent.name, '');
                closeSelectionDrawer();
                return;
            }

            const subOptions = subs.map(s => ({
                value: s.id,
                label: s.name,
                icon: s.icon ? `<i class="fas ${s.icon}"></i>` : `<i class="fas ${parent.icon || 'fa-tag'}"></i>`,
                color: parent.color || '#64748b'
            }));

            openSelectionDrawer(
                `Kategorie: ${parent.name}`,
                subOptions,
                (subId) => {
                    const sub = state.structuredCategories.find(c => c.id === subId);
                    if (onSelect) onSelect(parent.name, sub ? sub.name : '');
                },
                currentSubCategory || '',
                'grid',
                showManageButton,
                true,
                () => openStep1(true),
                true
            );
        }, currentParentId, 'grid', showManageButton, false, null, replaceCurrent);
    };

    openStep1();
}
