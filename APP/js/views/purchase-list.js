/**
 * Widok listy zakupow po Etapie 3.
 * Odpowiada za render kart zakupow, rozwiniecie szczegolow, edycje/usuwanie,
 * filtry oraz paginacje infinite scroll.
 */
import state from '../core/state.js';
import { apiCall } from '../core/api.js';
import { formatAmount } from '../shared/format.js';
import { openSelectionDrawer } from '../shared/ui.js';
import Drawer from '../shared/drawer.js';
import { openHierarchicalCategoryDrawer } from '../shared/categories.js';
import { getTagGroups, getTagGroupLabel, getTagLabel } from '../shared/tags.js';
import { fetchInitialData } from '../core/data-loader.js';
import { enterEditMode } from './purchase-form.js';

let purchaseListInitialized = false;
let filtersInitialized = false;
let currentFilterType = null;
let currentFilterOnApply = null;
let aiSearchMode = false;
let aiSearchRequestId = 0;
let aiSearchResult = null;

const AI_SEARCH_PLACEHOLDER = 'Zapytaj AI i nacisnij Enter, np. Ile wydalem na slodycze?';
const DEFAULT_SEARCH_PLACEHOLDER = 'Szukaj produktu...';
const AI_SEARCH_MIN_LENGTH = 3;
const AI_SEARCH_MAX_RECORDING_MS = 20000;
const AI_SEARCH_SILENCE_GRACE_MS = 1200;
const AI_SEARCH_SILENCE_STOP_MS = 1700;
const AI_SEARCH_SILENCE_RMS_THRESHOLD = 0.012;

const aiVoiceState = {
    mediaRecorder: null,
    mediaStream: null,
    audioChunks: [],
    audioBlob: null,
    mimeType: '',
    isRecording: false,
    isBusy: false,
    discardOnStop: false,
    autoStopTimeoutId: null,
    silenceCheckIntervalId: null,
    silenceStartedAt: 0,
    recordingStartedAt: 0,
    audioContext: null,
    analyser: null
};

function el(id) {
    return document.getElementById(id);
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function localDateContext() {
    const now = new Date();
    return {
        localDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw'
    };
}

function buildAiSearchFallbackAnswer(summary = {}) {
    const total = typeof summary.totalAmount === 'number' ? formatAmount(summary.totalAmount) : null;
    const purchaseCount = typeof summary.purchaseCount === 'number' ? summary.purchaseCount : 0;
    const itemCount = typeof summary.itemCount === 'number' ? summary.itemCount : 0;

    if (!purchaseCount) {
        return 'Nie znalazlem pasujacych transakcji dla tego pytania.';
    }

    const itemPart = itemCount ? `, obejmujacych ${itemCount} pasujacych pozycji` : '';
    return `Wynik: ${total || '0,00 zl'} w ${purchaseCount} zakupach${itemPart}.`;
}

const PURCHASES_LOAD_MORE_SENTINEL_ID = 'purchases-load-more-sentinel';
let purchasesListLoadMoreIO = null;

function teardownPurchasesLoadMoreObserver() {
    if (purchasesListLoadMoreIO) {
        purchasesListLoadMoreIO.disconnect();
        purchasesListLoadMoreIO = null;
    }
    el(PURCHASES_LOAD_MORE_SENTINEL_ID)?.remove();
}

function setupPurchasesLoadMoreObserver() {
    teardownPurchasesLoadMoreObserver();
    if (!state.nextPurchaseCursor) return;
    const list = el('purchases-list');
    if (!list) return;

    const sentinel = document.createElement('div');
    sentinel.id = PURCHASES_LOAD_MORE_SENTINEL_ID;
    sentinel.className = 'h-px w-full shrink-0';
    sentinel.setAttribute('aria-hidden', 'true');
    list.appendChild(sentinel);

    purchasesListLoadMoreIO = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                if (!el('list-tab')?.classList.contains('active')) continue;
                fetchMorePurchases();
            }
        },
        { root: null, rootMargin: '320px 0px', threshold: 0 }
    );
    purchasesListLoadMoreIO.observe(sentinel);
}

// Delegacja klikniec zostaje na kontenerze listy, dzieki czemu dziala tez dla kolejnych stron.
export function initPurchaseList() {
    if (purchaseListInitialized) return;
    purchaseListInitialized = true;

    el('purchases-list')?.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-purchase-btn');
        if (editBtn) {
            const purchaseId = e.target.closest('[data-purchase-id]')?.dataset.purchaseId;
            if (purchaseId) enterEditMode(purchaseId);
            return;
        }

        const deleteBtn = e.target.closest('.delete-purchase-btn');
        if (deleteBtn) {
            const purchaseId = e.target.closest('[data-purchase-id]')?.dataset.purchaseId;
            if (!purchaseId) return;
            if (confirm('Czy na pewno chcesz usunac ten zakup? Operacja jest nieodwracalna.')) {
                const originalContent = deleteBtn.innerHTML;
                try {
                    deleteBtn.disabled = true;
                    deleteBtn.innerHTML = '<i class="fas fa-spinner animate-spin"></i>';
                    await apiCall(`/api/purchases/${purchaseId}`, 'DELETE');
                    await fetchInitialData(false);
                } catch (error) {
                    alert('Nie udalo sie usunac zakupu: ' + error.message);
                    deleteBtn.disabled = false;
                    deleteBtn.innerHTML = originalContent;
                }
            }
            return;
        }

        const header = e.target.closest('.purchase-header');
        if (header) {
            const itemsDiv = header.nextElementSibling;
            itemsDiv?.classList.toggle('hidden');
            header.querySelector('.toggle-arrow')?.classList.toggle('rotate-180');
        }
    });

    addEventListener('scroll', handleInfiniteScroll);
    initPurchaseListFilters();
}

// Filtry trzymaja wartosci w core/state.js, a UI filtrow jest budowany na podstawie aktualnych danych.
export function initPurchaseListFilters() {
    if (filtersInitialized) return;
    filtersInitialized = true;

    const categoryBtn = el('filter-category-btn');
    const budgetBtn = el('filter-budget-btn');
    const shopBtn = el('filter-shop-btn');
    const dateBtn = el('filter-date-btn');
    const amountBtn = el('filter-amount-btn');
    const keywordInput = el('filter-keyword');
    const aiModeBtn = el('search-ai-mode-btn');
    const voiceBtn = el('search-voice-btn');
    const clearBtn = el('clear-filters-btn');

    const categoryClear = categoryBtn?.querySelector('.filter-clear');
    const budgetClear = budgetBtn?.querySelector('.filter-clear');
    const shopClear = shopBtn?.querySelector('.filter-clear');
    const dateClear = dateBtn?.querySelector('.filter-clear');
    const amountClear = amountBtn?.querySelector('.filter-clear');

    const setFilterButtonState = (btn, clearEl, active) => {
        if (!btn) return;
        btn.classList.toggle('border-brand-500/50', active);
        btn.classList.toggle('bg-brand-500/10', active);
        clearEl?.classList.toggle('hidden', !active);
    };

    categoryBtn?.addEventListener('click', () => {
        openHierarchicalCategoryDrawer(
            null,
            state.filterCategoryValue || '',
            state.filterSubCategoryValue || '',
            (parentName, subName) => {
                state.filterCategoryValue = parentName || '';
                state.filterSubCategoryValue = subName || '';
                const labelText = parentName ? (subName ? `${parentName} / ${subName}` : parentName) : 'Kategoria';
                const label = el('filter-category-label');
                if (label) label.textContent = labelText;
                setFilterButtonState(categoryBtn, categoryClear, !!parentName);
                handleFilterChange();
            }
        );
    });

    budgetBtn?.addEventListener('click', () => {
        const options = [
            { value: '', label: 'Wszystkie budzety' },
            { value: 'monthly', label: 'Budzet miesieczny' }
        ];
        state.allSpecialBudgets.forEach(budget => options.push({ value: budget.id, label: budget.name }));
        openSelectionDrawer('Wybierz budzet', options, (value, label) => {
            state.filterBudgetValue = value;
            const labelEl = el('filter-budget-label');
            if (labelEl) labelEl.textContent = value ? label : 'Budzet';
            setFilterButtonState(budgetBtn, budgetClear, !!value);
            handleFilterChange();
        }, state.filterBudgetValue || '');
    });

    shopBtn?.addEventListener('click', () => {
        const options = [{ value: '', label: 'Wszystkie sklepy' }];
        state.allShops.forEach(shop => options.push({ value: shop, label: shop }));
        openSelectionDrawer('Wybierz sklep', options, (value, label) => {
            state.filterShopValue = value;
            const labelEl = el('filter-shop-label');
            if (labelEl) labelEl.textContent = value ? label : 'Sklep';
            setFilterButtonState(shopBtn, shopClear, !!value);
            handleFilterChange();
        }, state.filterShopValue || '');
    });

    dateBtn?.addEventListener('click', () => {
        openFilterDrawer('Wybierz zakres dat', 'date', () => {
            const active = !!(state.filterDateStart || state.filterDateEnd);
            const labelEl = el('filter-date-label');
            if (labelEl) labelEl.textContent = active ? 'Data (ustawiona)' : 'Data';
            setFilterButtonState(dateBtn, dateClear, active);
            handleFilterChange();
        });
    });

    amountBtn?.addEventListener('click', () => {
        openFilterDrawer('Wybierz zakres kwot', 'amount', () => {
            const active = !!(state.filterMinAmount || state.filterMaxAmount);
            const labelEl = el('filter-amount-label');
            if (labelEl) labelEl.textContent = active ? 'Kwota (ustawiona)' : 'Kwota';
            setFilterButtonState(amountBtn, amountClear, active);
            handleFilterChange();
        });
    });

    const clearFilterValue = (type) => {
        if (type === 'category') {
            state.filterCategoryValue = '';
            state.filterSubCategoryValue = '';
            setText('filter-category-label', 'Kategoria');
            setFilterButtonState(categoryBtn, categoryClear, false);
        } else if (type === 'budget') {
            state.filterBudgetValue = '';
            setText('filter-budget-label', 'Budzet');
            setFilterButtonState(budgetBtn, budgetClear, false);
        } else if (type === 'shop') {
            state.filterShopValue = '';
            setText('filter-shop-label', 'Sklep');
            setFilterButtonState(shopBtn, shopClear, false);
        } else if (type === 'date') {
            state.filterDateStart = '';
            state.filterDateEnd = '';
            setText('filter-date-label', 'Data');
            setFilterButtonState(dateBtn, dateClear, false);
        } else if (type === 'amount') {
            state.filterMinAmount = '';
            state.filterMaxAmount = '';
            setText('filter-amount-label', 'Kwota');
            setFilterButtonState(amountBtn, amountClear, false);
        }
        handleFilterChange();
    };

    [
        [categoryClear, 'category'],
        [budgetClear, 'budget'],
        [shopClear, 'shop'],
        [dateClear, 'date'],
        [amountClear, 'amount']
    ].forEach(([clearEl, type]) => {
        clearEl?.addEventListener('click', (e) => {
            e.stopPropagation();
            clearFilterValue(type);
        });
    });

    keywordInput?.addEventListener('input', () => {
        if (aiSearchMode) {
            aiSearchRequestId += 1;
            if (aiSearchResult) {
                aiSearchResult = null;
                renderPurchasesList(state.allPurchases || [], false);
            }
            return;
        }
        handleFilterChange();
    });
    keywordInput?.addEventListener('keydown', (event) => {
        if (!aiSearchMode || event.key !== 'Enter') return;
        event.preventDefault();
        runNaturalSearch(keywordInput.value.trim());
    });
    aiModeBtn?.addEventListener('click', () => toggleAiSearchMode(!aiSearchMode));
    voiceBtn?.addEventListener('click', () => {
        if (aiVoiceState.isBusy) return;
        if (aiVoiceState.isRecording) stopAiSearchRecording(false);
        else startAiSearchRecording();
    });
    clearBtn?.addEventListener('click', () => {
        if (aiSearchMode) {
            resetAiSearchMode({ clearInput: true, reloadList: true });
            return;
        }
        if (keywordInput) keywordInput.value = '';
        state.filterCategoryValue = '';
        state.filterSubCategoryValue = '';
        state.filterBudgetValue = '';
        state.filterShopValue = '';
        state.filterDateStart = '';
        state.filterDateEnd = '';
        state.filterMinAmount = '';
        state.filterMaxAmount = '';

        const labels = {
            'filter-category-label': 'Kategoria',
            'filter-budget-label': 'Budzet',
            'filter-shop-label': 'Sklep',
            'filter-date-label': 'Data',
            'filter-amount-label': 'Kwota'
        };
        Object.entries(labels).forEach(([id, text]) => {
            setText(id, text);
            const btn = el(id)?.parentElement;
            btn?.classList.remove('border-brand-500/50', 'bg-brand-500/10');
        });

        document.querySelectorAll('.filter-clear').forEach(clear => clear.classList.add('hidden'));
        handleFilterChange();
    });

    updateAiSearchUi();
}

function updateAiSearchUi(status = '') {
    const searchShell = el('natural-search-shell');
    const keywordInput = el('filter-keyword');
    const aiModeBtn = el('search-ai-mode-btn');
    const voiceBtn = el('search-voice-btn');

    searchShell?.classList.toggle('ai-search-active', aiSearchMode);
    searchShell?.classList.toggle('ai-search-recording', aiVoiceState.isRecording);
    aiModeBtn?.classList.toggle('ai-search-active', aiSearchMode);
    voiceBtn?.classList.toggle('hidden', !aiSearchMode);
    voiceBtn?.classList.toggle('flex', aiSearchMode);
    voiceBtn?.classList.toggle('ai-search-recording', aiVoiceState.isRecording);

    if (keywordInput) {
        keywordInput.placeholder = status || (aiSearchMode ? AI_SEARCH_PLACEHOLDER : DEFAULT_SEARCH_PLACEHOLDER);
    }
    if (voiceBtn) {
        voiceBtn.disabled = !aiSearchMode || aiVoiceState.isBusy;
        voiceBtn.title = aiVoiceState.isRecording ? 'Zakoncz nagrywanie' : 'Zapytaj glosem';
        voiceBtn.setAttribute('aria-label', voiceBtn.title);
        voiceBtn.innerHTML = aiVoiceState.isBusy
            ? '<i class="fas fa-spinner animate-spin text-sm"></i>'
            : '<i class="fas fa-microphone text-sm"></i>';
    }
}

function toggleAiSearchMode(enabled) {
    if (enabled === aiSearchMode) return;
    aiSearchMode = enabled;
    aiSearchResult = null;
    if (!enabled) {
        aiSearchRequestId += 1;
        stopAiSearchRecording(true);
        const keywordInput = el('filter-keyword');
        if (keywordInput) keywordInput.value = '';
        updateAiSearchUi();
        handleFilterChange();
        return;
    }
    updateAiSearchUi();
    const keywordInput = el('filter-keyword');
    keywordInput?.focus();
}

function resetAiSearchMode({ clearInput = false, reloadList = false } = {}) {
    aiSearchRequestId += 1;
    aiSearchResult = null;
    stopAiSearchRecording(true);
    if (clearInput) {
        const keywordInput = el('filter-keyword');
        if (keywordInput) keywordInput.value = '';
    }
    updateAiSearchUi();
    if (reloadList) handleFilterChange();
}

async function runNaturalSearch(query) {
    if (!aiSearchMode || !query) return;
    if (query.trim().length < AI_SEARCH_MIN_LENGTH) return;
    const requestId = ++aiSearchRequestId;
    const list = el('purchases-list');
    aiSearchResult = {
        loading: true,
        answer: 'Analizuje pytanie i szukam pasujacych transakcji...',
        summary: null
    };
    removeEventListener('scroll', handleInfiniteScroll);
    teardownPurchasesLoadMoreObserver();
    if (list) renderPurchasesList([], false);

    try {
        const context = localDateContext();
        const response = await apiCall('/api/ai/natural-search', 'POST', {
            query,
            localDate: context.localDate,
            timezone: context.timezone
        });
        if (requestId !== aiSearchRequestId) return;

        aiSearchResult = {
            loading: false,
            answer: response.answer || buildAiSearchFallbackAnswer(response.summary),
            summary: response.summary || null
        };
        state.allPurchases = Array.isArray(response.purchases) ? response.purchases : [];
        state.nextPurchaseCursor = null;
        renderPurchasesList(state.allPurchases, false);
    } catch (error) {
        if (requestId !== aiSearchRequestId) return;
        aiSearchResult = {
            loading: false,
            error: true,
            answer: `Nie udalo sie wykonac wyszukiwania AI. ${error.message}`,
            summary: null
        };
        state.allPurchases = [];
        state.nextPurchaseCursor = null;
        renderPurchasesList([], false);
    }
}

function supportedSearchRecordingMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    return [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg'
    ].find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function stopAiSearchMediaStream() {
    if (aiVoiceState.mediaStream) {
        aiVoiceState.mediaStream.getTracks().forEach(track => track.stop());
        aiVoiceState.mediaStream = null;
    }
    if (aiVoiceState.autoStopTimeoutId) {
        clearTimeout(aiVoiceState.autoStopTimeoutId);
        aiVoiceState.autoStopTimeoutId = null;
    }
    if (aiVoiceState.silenceCheckIntervalId) {
        clearInterval(aiVoiceState.silenceCheckIntervalId);
        aiVoiceState.silenceCheckIntervalId = null;
    }
    if (aiVoiceState.audioContext) {
        aiVoiceState.audioContext.close().catch(() => {});
        aiVoiceState.audioContext = null;
    }
    aiVoiceState.analyser = null;
    aiVoiceState.silenceStartedAt = 0;
}

function resetAiVoiceState() {
    stopAiSearchMediaStream();
    aiVoiceState.mediaRecorder = null;
    aiVoiceState.audioChunks = [];
    aiVoiceState.audioBlob = null;
    aiVoiceState.mimeType = '';
    aiVoiceState.isRecording = false;
    aiVoiceState.isBusy = false;
    aiVoiceState.discardOnStop = false;
    aiVoiceState.recordingStartedAt = 0;
}

function readMicrophoneRms(analyser) {
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let total = 0;
    for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        total += normalized * normalized;
    }
    return Math.sqrt(total / samples.length);
}

function startAiSearchSilenceAutoStop(stream) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
        const audioContext = new AudioContextClass();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);

        aiVoiceState.audioContext = audioContext;
        aiVoiceState.analyser = analyser;
        aiVoiceState.silenceStartedAt = 0;
        aiVoiceState.silenceCheckIntervalId = setInterval(() => {
            if (!aiVoiceState.isRecording || aiVoiceState.mediaRecorder?.state !== 'recording') return;
            if (Date.now() - aiVoiceState.recordingStartedAt < AI_SEARCH_SILENCE_GRACE_MS) return;

            const rms = readMicrophoneRms(analyser);
            if (rms < AI_SEARCH_SILENCE_RMS_THRESHOLD) {
                if (!aiVoiceState.silenceStartedAt) aiVoiceState.silenceStartedAt = Date.now();
                if (Date.now() - aiVoiceState.silenceStartedAt >= AI_SEARCH_SILENCE_STOP_MS) {
                    stopAiSearchRecording(false);
                }
                return;
            }

            aiVoiceState.silenceStartedAt = 0;
        }, 250);
    } catch (error) {
        console.warn('Nie udalo sie wlaczyc automatycznego zatrzymania po ciszy:', error);
    }
}

async function blobToBase64(blob) {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result || '').toString().split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function transcribeAiSearchAudio() {
    if (!aiVoiceState.audioBlob) throw new Error('Brak nagrania do transkrypcji.');
    const base64 = await blobToBase64(aiVoiceState.audioBlob);
    const extension = aiVoiceState.mimeType.includes('ogg') ? 'ogg' : 'webm';
    const response = await apiCall('/api/transcribe-audio', 'POST', {
        audio: base64,
        mimetype: aiVoiceState.mimeType,
        filename: `natural-search.${extension}`,
        size: aiVoiceState.audioBlob.size,
        languageCode: 'pl-PL'
    });
    return response.transcript || '';
}

async function startAiSearchRecording() {
    if (!aiSearchMode) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        alert('Ta przegladarka nie obsluguje nagrywania audio dla wyszukiwania.');
        return;
    }
    const mimeType = supportedSearchRecordingMimeType();
    if (!mimeType) {
        alert('Ta przegladarka nie obsluguje wymaganego formatu nagrania audio.');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream, { mimeType });
        aiVoiceState.mediaStream = stream;
        aiVoiceState.mediaRecorder = recorder;
        aiVoiceState.audioChunks = [];
        aiVoiceState.audioBlob = null;
        aiVoiceState.mimeType = mimeType;
        aiVoiceState.discardOnStop = false;

        recorder.addEventListener('dataavailable', event => {
            if (event.data && event.data.size > 0) aiVoiceState.audioChunks.push(event.data);
        });
        recorder.addEventListener('stop', async () => {
            stopAiSearchMediaStream();
            aiVoiceState.isRecording = false;
            if (aiVoiceState.discardOnStop) {
                resetAiVoiceState();
                updateAiSearchUi();
                return;
            }
            if (!aiVoiceState.audioChunks.length) {
                resetAiVoiceState();
                updateAiSearchUi();
                alert('Nagranie jest puste. Sprobuj jeszcze raz.');
                return;
            }
            aiVoiceState.audioBlob = new Blob(aiVoiceState.audioChunks, { type: aiVoiceState.mimeType });
            aiVoiceState.isBusy = true;
            updateAiSearchUi('Przetwarzam nagranie...');
            try {
                const transcript = await transcribeAiSearchAudio();
                const keywordInput = el('filter-keyword');
                if (keywordInput) keywordInput.value = transcript;
                aiVoiceState.isBusy = false;
                updateAiSearchUi();
                await runNaturalSearch(transcript);
            } catch (error) {
                aiVoiceState.isBusy = false;
                updateAiSearchUi();
                alert(`Nie udalo sie rozpoznac pytania. ${error.message}`);
            } finally {
                resetAiVoiceState();
                updateAiSearchUi();
            }
        });
        recorder.addEventListener('error', () => {
            resetAiVoiceState();
            updateAiSearchUi();
            alert('Wystapil problem podczas nagrywania audio. Sprobuj ponownie.');
        });

        recorder.start();
        aiVoiceState.isRecording = true;
        aiVoiceState.recordingStartedAt = Date.now();
        aiVoiceState.autoStopTimeoutId = setTimeout(() => stopAiSearchRecording(false), AI_SEARCH_MAX_RECORDING_MS);
        startAiSearchSilenceAutoStop(stream);
        updateAiSearchUi('Slucham... zatrzymam po ciszy albo kliknij mikrofon');
    } catch (error) {
        resetAiVoiceState();
        updateAiSearchUi();
        alert('Nie udalo sie uzyskac dostepu do mikrofonu. Sprawdz uprawnienia w przegladarce.');
    }
}

function stopAiSearchRecording(discard = false) {
    if (aiVoiceState.mediaRecorder?.state === 'recording') {
        aiVoiceState.discardOnStop = discard;
        aiVoiceState.mediaRecorder.stop();
        return;
    }
    if (discard) resetAiVoiceState();
    updateAiSearchUi();
}

function setText(id, text) {
    const node = el(id);
    if (node) node.textContent = text;
}

export function openFilterDrawer(title, type, onApply) {
    let content = '';

    if (type === 'date') {
        const startVal = state.filterDateStart || '';
        const endVal = state.filterDateEnd || '';
        content = `
            <div class="space-y-4">
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Data od</label>
                    <input type="date" id="drawer-date-start" value="${startVal}" class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Data do</label>
                    <input type="date" id="drawer-date-end" value="${endVal}" class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
            </div>
        `;
    } else if (type === 'amount') {
        const minVal = state.filterMinAmount || '';
        const maxVal = state.filterMaxAmount || '';
        content = `
            <div class="space-y-4">
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Kwota minimalna</label>
                    <input type="number" id="drawer-min-amount" value="${minVal}" placeholder="0.00" step="0.01" class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-2 ml-1">Kwota maksymalna</label>
                    <input type="number" id="drawer-max-amount" value="${maxVal}" placeholder="Brak limitu" step="0.01" class="block w-full rounded-xl border-white/10 bg-white/5 text-white py-4 px-4 focus:bg-white/10 transition-all outline-none">
                </div>
            </div>
        `;
    }

    Drawer.open({
        title,
        content,
        size: 'sm',
        confirmLabel: 'Zastosuj',
        cancelLabel: 'Anuluj',
        onConfirm: () => {
            if (type === 'date') {
                state.filterDateStart = el('drawer-date-start')?.value || '';
                state.filterDateEnd = el('drawer-date-end')?.value || '';
            } else if (type === 'amount') {
                state.filterMinAmount = el('drawer-min-amount')?.value || '';
                state.filterMaxAmount = el('drawer-max-amount')?.value || '';
            }
            if (typeof onApply === 'function') onApply();
            Drawer.close();
        },
        triggerId: type === 'date' ? 'filter-date-btn' : 'filter-amount-btn',
    });
}

export function closeFilterDrawer() {
    Drawer.close();
}

export const handleInfiniteScroll = () => {
    if (aiSearchMode) return;
    if (!el('list-tab')?.classList.contains('active')) return;
    if ((innerHeight + scrollY) >= document.body.offsetHeight - 200) {
        fetchMorePurchases();
    }
};

export async function handleFilterChange() {
    if (aiSearchMode) {
        aiSearchResult = null;
    }
    const queryString = getFilterQueryParams();
    const list = el('purchases-list');
    if (queryString && list) {
        list.innerHTML = '<div class="text-center py-12">Filtrowanie...</div>';
    }

    await loadInitialPurchases();

    if (state.structuredCategories.length === 0 && state.allCategories.length > 0) {
        const refetchedStructuredCategories = await apiCall('/api/categories/v2');
        if (Array.isArray(refetchedStructuredCategories) && refetchedStructuredCategories.length > 0) {
            state.structuredCategories = refetchedStructuredCategories;
        }
    }
}

// Jedno miejsce budowania query stringa dla pierwszego ladowania, filtrowania i kolejnych stron.
export function getFilterQueryParams() {
    const params = new URLSearchParams();
    const keyword = el('filter-keyword')?.value;
    if (keyword && !aiSearchMode) params.append('keyword', keyword);
    if (state.filterCategoryValue) params.append('category', state.filterCategoryValue);
    if (state.filterSubCategoryValue) params.append('subCategory', state.filterSubCategoryValue);
    if (state.filterBudgetValue) params.append('budget', state.filterBudgetValue);
    if (state.filterShopValue) params.append('shop', state.filterShopValue);

    if (state.filterDateStart) params.append('startDate', state.filterDateStart);
    if (state.filterDateEnd) params.append('endDate', state.filterDateEnd);

    if (state.filterMinAmount) params.append('minAmount', state.filterMinAmount);
    if (state.filterMaxAmount) params.append('maxAmount', state.filterMaxAmount);

    return params.toString();
}

function purchasesListUrl(params) {
    const qs = params.toString();
    return qs ? `/api/purchases?${qs}` : '/api/purchases';
}

export async function loadInitialPurchases() {
    state.isLoadingPurchases = true;
    removeEventListener('scroll', handleInfiniteScroll);
    teardownPurchasesLoadMoreObserver();
    try {
        const query = getFilterQueryParams();
        const hasFilters = Boolean(query);
        const maxPrefetch = hasFilters ? 25 : 1;
        state.allPurchases = [];
        let lastCursorParam = '';
        let lastNext = null;

        for (let i = 0; i < maxPrefetch; i++) {
            const params = new URLSearchParams(query);
            if (lastCursorParam) params.set('lastVisible', lastCursorParam);
            const { purchases, nextCursor } = await apiCall(purchasesListUrl(params));
            const batch = purchases || [];
            lastNext = nextCursor || null;
            state.allPurchases.push(...batch);
            lastCursorParam = lastNext || '';

            if (!hasFilters) break;
            if (!lastNext) break;
            if (batch.length > 0) break;
        }

        state.nextPurchaseCursor = lastNext || null;
        if (state.allPurchases.length === 0 && state.nextPurchaseCursor) {
            const list = el('purchases-list');
            if (list) {
                list.innerHTML = '<div class="text-center py-12"><svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg><h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Brak wynikow na pierwszych stronach</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Trwa szukanie w starszych zakupach albo przewin w dol.</p></div>';
            }
        } else {
            renderPurchasesList(state.allPurchases, false);
        }
        if (state.nextPurchaseCursor) {
            addEventListener('scroll', handleInfiniteScroll);
            setupPurchasesLoadMoreObserver();
        }
    } catch (error) {
        console.error('Blad ladowania poczatkowych zakupow:', error);
        const list = el('purchases-list');
        if (list) list.innerHTML = '<div class="text-center py-12 text-red-500">Wystapil blad podczas ladowania listy zakupow.</div>';
        state.allPurchases = [];
        state.nextPurchaseCursor = null;
        teardownPurchasesLoadMoreObserver();
        removeEventListener('scroll', handleInfiniteScroll);
    } finally {
        state.isLoadingPurchases = false;
    }
}

export async function fetchMorePurchases() {
    if (aiSearchMode) return;
    if (state.isLoadingPurchases || !state.nextPurchaseCursor) return;

    state.isLoadingPurchases = true;
    try {
        const maxEmptySkips = 25;
        let emptySkips = 0;
        while (state.nextPurchaseCursor && emptySkips < maxEmptySkips) {
            const params = new URLSearchParams(getFilterQueryParams());
            params.set('lastVisible', state.nextPurchaseCursor);
            const { purchases, nextCursor } = await apiCall(purchasesListUrl(params));
            const batch = purchases || [];
            state.nextPurchaseCursor = nextCursor || null;

            if (batch.length > 0) {
                const hadNoRows = state.allPurchases.length === 0;
                state.allPurchases.push(...batch);
                if (hadNoRows) {
                    renderPurchasesList(state.allPurchases, false);
                } else {
                    renderPurchasesList(batch, true);
                }
                break;
            }
            if (!state.nextPurchaseCursor) break;
            emptySkips++;
        }
        if (state.nextPurchaseCursor) {
            setupPurchasesLoadMoreObserver();
        } else {
            removeEventListener('scroll', handleInfiniteScroll);
            teardownPurchasesLoadMoreObserver();
        }
    } catch (error) {
        console.error('Blad doladowywania zakupow:', error);
        removeEventListener('scroll', handleInfiniteScroll);
        teardownPurchasesLoadMoreObserver();
        state.nextPurchaseCursor = null;
    } finally {
        state.isLoadingPurchases = false;
    }
}

export function renderPurchasesList(purchasesToRender, append = false) {
    const list = el('purchases-list');
    if (!list) return;

    if (!append) list.innerHTML = '';
    let renderedAiCard = false;
    if (!append && aiSearchMode && aiSearchResult) {
        list.insertAdjacentHTML('beforeend', renderAiSearchAnswerCard());
        renderedAiCard = true;
        if (aiSearchResult.loading) return;
    }
    if (purchasesToRender.length === 0 && !append) {
        list.insertAdjacentHTML('beforeend', '<div class="text-center py-12"><svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg><h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">Brak zakupow</h3><p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Brak wynikow dla podanych kryteriow.</p></div>');
        return;
    }

    const newContent = purchasesToRender.map(renderPurchaseCard).join('');
    if (append) {
        list.insertAdjacentHTML('beforeend', newContent);
    } else if (renderedAiCard) {
        list.insertAdjacentHTML('beforeend', newContent);
    } else {
        list.innerHTML = newContent;
    }
}

function renderAiSearchAnswerCard() {
    const icon = aiSearchResult.error ? 'fa-triangle-exclamation' : (aiSearchResult.loading ? 'fa-spinner animate-spin' : 'fa-wand-magic-sparkles');
    const accentClass = aiSearchResult.error ? 'text-red-300 bg-red-500/10 border-red-500/20' : 'text-brand-300 bg-brand-500/10 border-brand-500/20';
    const summary = aiSearchResult.summary || {};
    const chips = [];
    if (typeof summary.totalAmount === 'number') chips.push(formatAmount(summary.totalAmount));
    if (typeof summary.purchaseCount === 'number') chips.push(`${summary.purchaseCount} zakupow`);
    if (summary.truncated) chips.push('pokazano pierwsze wyniki');

    return `
        <div class="glass-card rounded-2xl mb-4 p-4 border border-white/10">
            <div class="flex items-start gap-3">
                <div class="h-10 w-10 rounded-xl border ${accentClass} flex items-center justify-center shrink-0">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Asystent AI</div>
                    <p class="text-sm text-white leading-6">${escapeHtml(aiSearchResult.answer || '')}</p>
                    ${chips.length ? `<div class="flex flex-wrap gap-2 mt-3">${chips.map(chip => `<span class="text-[11px] text-gray-300 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">${escapeHtml(chip)}</span>`).join('')}</div>` : ''}
                </div>
            </div>
        </div>
    `;
}

function renderPurchaseCard(purchase) {
    const specialBudgetName = purchase.specialBudgetId ? (state.allSpecialBudgets.find(b => b.id === purchase.specialBudgetId) || {}).name : null;
    const budgetIcon = specialBudgetName
        ? `<p class="text-xs text-brand-400 mb-1 flex items-center gap-1">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a1 1 0 011-1h5a.997.997 0 01.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>
             <span>${specialBudgetName}</span>
           </p>`
        : '';

    return `
        <div class="glass-card rounded-2xl mb-4" data-purchase-id="${purchase.id}">
            <div class="purchase-header p-4 cursor-pointer">
                ${budgetIcon ? `<div class="mb-3 w-full border-b border-white/5 pb-1">${budgetIcon}</div>` : ''}
                <div class="flex items-end w-full">
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-end w-full mb-1">
                            <span class="font-bold text-lg text-white truncate pr-2 leading-none">${purchase.shop}</span>
                            <span class="font-bold text-xl text-white whitespace-nowrap leading-none">${formatAmount(purchase.totalAmount || 0)}</span>
                        </div>
                        <div class="flex justify-between items-end w-full">
                            <span class="text-sm text-gray-400 leading-none">${purchase.date}</span>
                            <div class="flex items-center gap-2 shrink-0 leading-none">
                                <span class="text-[10px] text-gray-500 uppercase tracking-tighter">${(purchase.items || []).length} poz.</span>
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 toggle-arrow text-gray-500 transition-transform transform" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="purchase-items hidden p-4 space-y-4 bg-white/5 rounded-b-2xl border-t border-white/5">
                ${renderPurchaseTags(purchase)}
                <div class="space-y-4">
                    ${(purchase.items || []).map(renderPurchaseItem).join('')}
                </div>
                <div class="flex gap-3 pt-2 mt-2 border-t border-white/5">
                    <button class="edit-purchase-btn flex-1 py-2.5 px-5 bg-white/5 hover:bg-white/10 text-brand-400 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm font-medium">
                        <i class="fas fa-edit"></i>
                        <span>Edytuj</span>
                    </button>
                    <button class="delete-purchase-btn flex-1 py-2.5 px-5 bg-white/5 hover:bg-white/10 text-red-500 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm font-medium">
                        <i class="fas fa-trash-alt"></i>
                        <span>Usun</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderPurchaseTags(purchase) {
    if (!purchase.tags || Object.keys(purchase.tags).length === 0) return '';

    return `
        <div class="flex flex-wrap gap-4 px-4 py-3 bg-white/5 border-t border-white/5 rounded-xl border border-white/10 mb-4">
            ${getTagGroups().map(group => {
                const val = purchase.tags[group];
                if (!val) return '';
                const groupLabel = String(getTagGroupLabel(group) || group || '');
                const tagLabel = getTagLabel(group, val) || val;
                return `
                    <div class="flex flex-col">
                        <span class="text-[10px] text-gray-500 uppercase tracking-widest">${groupLabel.charAt(0)}</span>
                        <span class="text-xs text-white font-medium">${tagLabel}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderPurchaseItem(item) {
    const catName = item.category || 'Inne';
    const subName = item.subCategory || '';
    const parentCat = state.structuredCategories.find(c => c.name === catName && !c.parentId);
    const subCat = parentCat ? state.structuredCategories.find(c => c.name === subName && c.parentId === parentCat.id) : null;
    const icon = (subCat && subCat.icon) || (parentCat && parentCat.icon) || 'fa-tag';
    const color = (parentCat && parentCat.color) || '#6b7280';
    const labelText = subName ? `${catName} / ${subName}` : catName;
    const itemTagsHtml = getTagGroups().map(group => {
        const val = item.tags && item.tags[group];
        if (!val) return '';
        const groupLabel = String(getTagGroupLabel(group) || group || '');
        const tagLabel = getTagLabel(group, val) || val;
        return `<span class="text-[10px] text-gray-500">${groupLabel.charAt(0)}: <span class="text-gray-300">${tagLabel}</span></span>`;
    }).join(' ');

    return `
        <div class="flex justify-between items-end py-1 border-b border-white/5 last:border-0 text-sm">
            <div class="flex flex-col">
                <div class="flex items-center gap-2 mb-1">
                    <div class="w-5 h-5 rounded flex items-center justify-center text-[10px]" style="background-color: ${color}20; color: ${color}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <span class="text-[10px] text-gray-400 tracking-tight">${labelText}</span>
                </div>
                <div class="font-semibold text-white">${item.name}</div>
                ${itemTagsHtml ? `<div class="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">${itemTagsHtml}</div>` : ''}
            </div>
            <div class="font-bold text-white whitespace-nowrap text-base">${formatAmount(item.price || 0)}</div>
        </div>
    `;
}
