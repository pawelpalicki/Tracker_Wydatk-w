/**
 * Moduł obsługi motywów kolorystycznych.
 */
import { switchTab } from '../../shared/ui.js';

const THEMES = [
    { id: 'ocean', name: 'Ocean', color: '#0ea5e9', description: 'Domyślny błękit' },
    { id: 'emerald', name: 'Emerald', color: '#10b981', description: 'Szmaragdowa zieleń' },
    { id: 'sunset', name: 'Sunset', color: '#f97316', description: 'Ciepły pomarańcz' },
    { id: 'amethyst', name: 'Amethyst', color: '#a855f7', description: 'Głęboki fiolet' },
    { id: 'ruby', name: 'Ruby', color: '#f43f5e', description: 'Malinowa czerwień' }
];

let themeInitialized = false;

/**
 * Inicjalizuje widok wyboru motywu.
 */
export function initThemeSettings() {
    if (themeInitialized) return;
    themeInitialized = true;

    renderThemeOptions();
}

/**
 * Renderuje kafelki motywów w widoku ustawień.
 */
function renderThemeOptions() {
    const container = document.getElementById('theme-options-list');
    if (!container) return;

    const currentTheme = localStorage.getItem('app-theme') || 'ocean';

    container.innerHTML = THEMES.map(theme => `
        <button class="theme-option-card w-full flex items-center p-4 bg-white/5 hover:bg-white/10 rounded-2xl border ${theme.id === currentTheme ? 'border-brand-500 bg-brand-500/5' : 'border-white/5'} transition-all group" 
                data-theme-id="${theme.id}">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg mr-4" style="background-color: ${theme.color}">
                <i class="fas ${theme.id === currentTheme ? 'fa-check' : 'fa-palette'} text-white"></i>
            </div>
            <div class="flex-1 text-left">
                <h4 class="text-sm font-bold text-white">${theme.name}</h4>
                <p class="text-xs text-gray-500">${theme.description}</p>
            </div>
            ${theme.id === currentTheme ? '<span class="text-[10px] font-bold text-brand-500 uppercase tracking-widest">Aktywny</span>' : ''}
        </button>
    `).join('');

    // Dodaj event listenery
    container.querySelectorAll('.theme-option-card').forEach(btn => {
        btn.addEventListener('click', () => {
            const themeId = btn.dataset.themeId;
            applyTheme(themeId);
            renderThemeOptions(); // Odśwież widok (obwódki)
        });
    });
}

/**
 * Aplikuje wybrany motyw do dokumentu i zapisuje w localStorage.
 */
export function applyTheme(themeId) {
    if (themeId === 'ocean') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeId);
    }
    localStorage.setItem('app-theme', themeId);
}

/**
 * Wczytuje i aplikuje zapisany motyw (wywoływane przy starcie).
 */
export function loadSavedTheme() {
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    }
}
