/**
 * Moduł obsługi prywatności i praw RODO (Eksport danych, Usuwanie konta).
 */
import { apiCall } from '../core/api.js';
import { switchTab } from './ui.js';
import Drawer from './drawer.js';

let privacyInitialized = false;

export function initPrivacySettings() {
    if (privacyInitialized) return;
    privacyInitialized = true;

    const privacyLink = document.getElementById('settings-privacy-link');
    if (privacyLink) {
        privacyLink.addEventListener('click', () => {
            switchTab('settings-privacy');
        });
    }

    const exportBtn = document.getElementById('rodo-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExportData);
    }

    const deleteBtn = document.getElementById('rodo-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleDeleteAccount);
    }
}

async function handleExportData() {
    const exportBtn = document.getElementById('rodo-export-btn');
    if (!exportBtn) return;

    const originalContent = exportBtn.innerHTML;
    try {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> Przygotowanie pliku danych...';

        const data = await apiCall('/api/user/export-data', 'GET');
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tracker-wydatkow-export-${new Date().toISOString().substring(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        alert('Nie udało się wyeksportować danych: ' + error.message);
    } finally {
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalContent;
    }
}

function handleDeleteAccount() {
    Drawer.open({
        title: 'Usuwanie konta i danych (RODO)',
        content: `
            <div class="space-y-4">
                <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-xs">
                    <i class="fas fa-triangle-exclamation mr-1"></i>
                    <strong>Ostrzeżenie:</strong> Czy na pewno chcesz trwale usunąć swoje konto?
                </div>
                <p class="text-xs text-gray-300 leading-relaxed">
                    Wszystkie Twoje wpisy zakupowe, kategorie, budżety cykliczne oraz cele oszczędnościowe zostaną 
                    <strong>bezpowrotnie usunięte z bazy danych</strong>. Operacja ta spełnia wymogi Art. 17 RODO (Prawo do bycia zapomnianym) 
                    i nie można jej cofnąć.
                </p>
                <div>
                    <label class="block text-[11px] text-gray-400 mb-1">Wpisz "USUŃ" aby potwierdzić:</label>
                    <input type="text" id="delete-confirm-input" placeholder="USUŃ" class="block w-full rounded-xl border border-white/10 bg-white/5 text-white py-3 px-4 focus:bg-white/10 outline-none text-xs">
                </div>
            </div>
        `,
        size: 'sm',
        confirmLabel: 'Usuń bezpowrotnie',
        cancelLabel: 'Anuluj',
        onConfirm: async () => {
            const inputVal = document.getElementById('delete-confirm-input')?.value || '';
            if (inputVal.trim().toUpperCase() !== 'USUŃ') {
                alert('Musisz wpisać "USUŃ" aby potwierdzić operację.');
                return;
            }

            try {
                await apiCall('/api/user/delete-account', 'DELETE');
                alert('Twoje konto i wszystkie dane zostały trwale usunięte. Nastąpi wylogowanie.');
                window.location.reload();
            } catch (err) {
                alert('Nie udało się usunąć konta: ' + err.message);
            }
        }
    });
}
