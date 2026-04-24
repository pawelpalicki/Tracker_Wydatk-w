// Tracker Wydatkow - Voice expense flow

(function () {
    // Limit pojedynczego nagrania trzymamy poniżej ~1 minuty,
    // żeby bezpiecznie mieścić się w synchronicznym STT i zachować szybki UX.
    const MAX_RECORDING_MS = 55_000;

    const overlay = document.getElementById('voice-expense-overlay');
    const modal = document.getElementById('voice-expense-modal');
    const closeBtn = document.getElementById('voice-expense-close-btn');
    const primaryBtn = document.getElementById('voice-expense-primary-btn');
    const secondaryBtn = document.getElementById('voice-expense-secondary-btn');
    const titleEl = document.getElementById('voice-expense-title');
    const descriptionEl = document.getElementById('voice-expense-description');
    const hintCardEl = document.getElementById('voice-expense-hint-card');
    const progressEl = document.getElementById('voice-expense-progress');
    const progressTitleEl = document.getElementById('voice-expense-progress-title');
    const progressTextEl = document.getElementById('voice-expense-progress-text');
    const transcriptSectionEl = document.getElementById('voice-expense-transcript-section');
    const transcriptInput = document.getElementById('voice-expense-transcript');
    const recordingIndicatorEl = document.getElementById('voice-expense-recording-indicator');
    const timerEl = document.getElementById('voice-expense-timer');
    const statusBadgeEl = document.getElementById('voice-expense-status-badge');

    const state = {
        // Prosty state machine modala: intro -> recording -> transcribing -> review -> analyzing -> success.
        step: 'intro',
        mediaRecorder: null,
        mediaStream: null,
        audioChunks: [],
        audioBlob: null,
        mimeType: '',
        startedAt: 0,
        timerIntervalId: null,
        autoStopTimeoutId: null,
        isBusy: false,
        discardOnStop: false
    };

    function updateTimer() {
        if (!timerEl || !state.startedAt) {
            return;
        }

        const elapsedMs = Math.min(Date.now() - state.startedAt, MAX_RECORDING_MS);
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const totalSeconds = Math.floor(MAX_RECORDING_MS / 1000);

        const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        timerEl.textContent = `${formatTime(elapsedSeconds)} / ${formatTime(totalSeconds)}`;
    }

    function startTimer() {
        stopTimer();
        state.startedAt = Date.now();
        updateTimer();
        state.timerIntervalId = window.setInterval(updateTimer, 250);
        // Auto-stop chroni przed zbyt długim nagraniem i przypadkowym "wiszeniem" mikrofonu.
        state.autoStopTimeoutId = window.setTimeout(() => {
            if (state.mediaRecorder?.state === 'recording') {
                stopRecording(true);
            }
        }, MAX_RECORDING_MS);
    }

    function stopTimer() {
        if (state.timerIntervalId) {
            window.clearInterval(state.timerIntervalId);
            state.timerIntervalId = null;
        }

        if (state.autoStopTimeoutId) {
            window.clearTimeout(state.autoStopTimeoutId);
            state.autoStopTimeoutId = null;
        }

        state.startedAt = 0;
    }

    function stopMediaStream() {
        if (state.mediaStream) {
            state.mediaStream.getTracks().forEach(track => track.stop());
            state.mediaStream = null;
        }
    }

    function supportedRecordingMimeType() {
        if (typeof MediaRecorder === 'undefined') {
            return '';
        }

        const preferredTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg'
        ];

        return preferredTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
    }

    // Lokalną datę wysyłamy do backendu, żeby model dobrze interpretował "wczoraj" i podobne zwroty.
    function localDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function voiceContextPayload() {
        return {
            localDate: localDateString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw',
            locale: navigator.language || 'pl-PL'
        };
    }

    function setBusyState(isBusy) {
        state.isBusy = isBusy;
        primaryBtn.disabled = isBusy;
        secondaryBtn.disabled = isBusy;
        closeBtn.disabled = isBusy;

        primaryBtn.classList.toggle('opacity-70', isBusy);
        secondaryBtn.classList.toggle('opacity-70', isBusy);
        closeBtn.classList.toggle('opacity-70', isBusy);
    }

    function setStatusBadge(step) {
        const statusMap = {
            intro: { label: 'Tryb głosowy', classes: ['text-brand-400', 'bg-brand-500/10', 'border-brand-500/20'] },
            recording: { label: 'Nagrywanie', classes: ['text-red-300', 'bg-red-500/10', 'border-red-500/20'] },
            transcribing: { label: 'Transkrypcja', classes: ['text-brand-400', 'bg-brand-500/10', 'border-brand-500/20'] },
            review: { label: 'Sprawdź tekst', classes: ['text-amber-300', 'bg-amber-500/10', 'border-amber-500/20'] },
            analyzing: { label: 'Analiza Gemini', classes: ['text-brand-400', 'bg-brand-500/10', 'border-brand-500/20'] },
            success: { label: 'Gotowe', classes: ['text-emerald-300', 'bg-emerald-500/10', 'border-emerald-500/20'] }
        };

        const config = statusMap[step] || statusMap.intro;
        statusBadgeEl.className = 'voice-status-badge inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] border';
        config.classes.forEach(className => statusBadgeEl.classList.add(className));
        statusBadgeEl.querySelector('span:last-child').textContent = config.label;
    }

    // Jeden renderer steruje całym popupem, dzięki czemu wszystkie etapy zachowują spójny wygląd.
    function renderStep(step) {
        state.step = step;
        setStatusBadge(step);

        progressEl.classList.add('hidden');
        transcriptSectionEl.classList.add('hidden');
        recordingIndicatorEl.classList.add('hidden');
        secondaryBtn.classList.add('hidden');
        hintCardEl.classList.remove('hidden');

        if (step === 'intro') {
            titleEl.textContent = 'Dodaj wydatek głosem';
            descriptionEl.textContent = 'Możesz powiedzieć na przykład: "Wczoraj w Lidlu kupiłem chleb za 4,80 i mleko za 3,20".';
            primaryBtn.textContent = 'Rozpocznij nagrywanie';
            primaryBtn.disabled = false;
            transcriptInput.value = '';
        }

        if (step === 'recording') {
            titleEl.textContent = 'Nagrywam Twój wydatek';
            descriptionEl.textContent = 'Gdy skończysz mówić, kliknij zakończenie nagrywania albo poczekaj na automatyczne zatrzymanie.';
            recordingIndicatorEl.classList.remove('hidden');
            primaryBtn.textContent = 'Zakończ nagrywanie';
        }

        if (step === 'transcribing') {
            titleEl.textContent = 'Przetwarzam nagranie';
            descriptionEl.textContent = 'Wysyłam audio do rozpoznania mowy i przygotowuję tekst do Twojej akceptacji.';
            progressEl.classList.remove('hidden');
            progressTitleEl.textContent = 'Trwa transkrypcja nagrania';
            progressTextEl.textContent = 'To zwykle zajmuje kilka sekund.';
            primaryBtn.textContent = 'Poczekaj...';
            hintCardEl.classList.add('hidden');
        }

        if (step === 'review') {
            titleEl.textContent = 'Sprawdź transkrypcję';
            descriptionEl.textContent = 'Jeśli trzeba, popraw tekst ręcznie. Gdy wszystko się zgadza, wyślij go do analizy.';
            transcriptSectionEl.classList.remove('hidden');
            secondaryBtn.classList.remove('hidden');
            primaryBtn.textContent = 'Wyślij do analizy';
            secondaryBtn.textContent = 'Nagraj ponownie';
        }

        if (step === 'analyzing') {
            titleEl.textContent = 'Analizuję wydatek';
            descriptionEl.textContent = 'Gemini zamienia transkrypcję na uzupełniony formularz zakupu.';
            progressEl.classList.remove('hidden');
            progressTitleEl.textContent = 'Trwa analiza wydatku';
            progressTextEl.textContent = 'Za chwilę formularz zostanie uzupełniony.';
            transcriptSectionEl.classList.remove('hidden');
            primaryBtn.textContent = 'Analizuję...';
            secondaryBtn.classList.remove('hidden');
            secondaryBtn.textContent = 'Nagraj ponownie';
            hintCardEl.classList.add('hidden');
        }

        if (step === 'success') {
            titleEl.textContent = 'Formularz został uzupełniony';
            descriptionEl.textContent = 'Możesz jeszcze sprawdzić dane i zapisać zakup tak jak zwykle.';
            progressEl.classList.remove('hidden');
            progressTitleEl.textContent = 'Gotowe';
            progressTextEl.textContent = 'Za chwilę zamknę okno.';
            transcriptSectionEl.classList.remove('hidden');
            primaryBtn.textContent = 'Zamknij';
            secondaryBtn.classList.add('hidden');
            hintCardEl.classList.add('hidden');
        }
    }

    function openVoiceExpenseModal() {
        if (!overlay || !modal) {
            return;
        }

        renderStep('intro');
        setBusyState(false);
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');

        requestAnimationFrame(() => {
            overlay.classList.remove('opacity-0');
            modal.classList.remove('opacity-0', 'scale-95');
        });
    }

    function resetRecordingState() {
        stopTimer();
        stopMediaStream();
        state.audioChunks = [];
        state.audioBlob = null;
        state.mimeType = '';
        state.mediaRecorder = null;
        state.discardOnStop = false;
    }

    function closeVoiceExpenseModal() {
        if (!overlay || !modal || state.isBusy) {
            return;
        }

        const wasRecording = state.mediaRecorder?.state === 'recording';

        if (wasRecording) {
            state.discardOnStop = true;
            state.mediaRecorder.stop();
        }
        overlay.classList.add('opacity-0');
        modal.classList.add('opacity-0', 'scale-95');

        window.setTimeout(() => {
            if (!wasRecording) {
                resetRecordingState();
            }
            overlay.classList.add('hidden');
            modal.classList.add('hidden');
            renderStep('intro');
        }, 300);
    }

    async function blobToBase64(blob) {
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result || '').toString().split(',')[1] || '');
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function transcribeCurrentAudio() {
        if (!state.audioBlob) {
            throw new Error('Brak nagrania do transkrypcji.');
        }

        // Wysyłamy raw audio do backendu, a dopiero tam wykonujemy właściwą transkrypcję w Google STT.
        const base64 = await blobToBase64(state.audioBlob);
        const extension = state.mimeType.includes('ogg') ? 'ogg' : 'webm';
        const response = await apiCall('/api/transcribe-audio', 'POST', {
            audio: base64,
            mimetype: state.mimeType,
            filename: `voice-expense.${extension}`,
            size: state.audioBlob.size,
            languageCode: 'pl-PL'
        });

        return response.transcript || '';
    }

    async function analyzeTranscript() {
        const transcript = transcriptInput.value.trim();
        if (!transcript) {
            alert('Najpierw przygotuj transkrypcję. Możesz nagrać ją ponownie albo wpisać ręcznie.');
            return;
        }

        renderStep('analyzing');
        setBusyState(true);

        try {
            switchTab('add');
            // Wynik analizy trafia do tej samej ścieżki wypełnienia formularza, co analiza paragonu.
            const { analysis } = await apiCall('/api/analyze-voice-expense', 'POST', {
                transcript,
                context: voiceContextPayload()
            });

            await fillFormWithAnalysis(analysis);
            renderStep('success');
            setBusyState(false);
            window.setTimeout(() => {
                if (!state.isBusy) {
                    closeVoiceExpenseModal();
                }
            }, 900);
        } catch (error) {
            setBusyState(false);
            renderStep('review');
            alert(`Nie udało się przeanalizować tekstu. ${error.message}`);
        }
    }

    async function startRecording() {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            alert('Ta przeglądarka nie obsługuje stabilnego nagrywania audio dla tej funkcji.');
            return;
        }

        const mimeType = supportedRecordingMimeType();
        if (!mimeType) {
            alert('Ta przeglądarka nie obsługuje wymaganego formatu nagrania audio.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType });

            state.mediaStream = stream;
            state.mediaRecorder = recorder;
            state.audioChunks = [];
            state.audioBlob = null;
            state.mimeType = mimeType;

            recorder.addEventListener('dataavailable', event => {
                if (event.data && event.data.size > 0) {
                    state.audioChunks.push(event.data);
                }
            });

            recorder.addEventListener('stop', async () => {
                stopTimer();
                stopMediaStream();

                // Przy zamknięciu modala w trakcie nagrania ignorujemy dalsze przetwarzanie.
                if (state.discardOnStop) {
                    resetRecordingState();
                    return;
                }

                if (!state.audioChunks.length) {
                    renderStep('intro');
                    alert('Nagranie jest puste. Spróbuj jeszcze raz.');
                    return;
                }

                state.audioBlob = new Blob(state.audioChunks, { type: state.mimeType });
                renderStep('transcribing');
                setBusyState(true);

                try {
                    const transcript = await transcribeCurrentAudio();
                    transcriptInput.value = transcript;
                    renderStep('review');
                    setBusyState(false);
                    transcriptInput.focus();
                    transcriptInput.setSelectionRange(transcriptInput.value.length, transcriptInput.value.length);
                } catch (error) {
                    setBusyState(false);
                    renderStep('intro');
                    alert(`Nie udało się przygotować transkrypcji. ${error.message}`);
                }
            });

            recorder.addEventListener('error', () => {
                stopTimer();
                stopMediaStream();
                setBusyState(false);
                renderStep('intro');
                alert('Wystąpił problem podczas nagrywania audio. Spróbuj ponownie.');
            });

            recorder.start();
            renderStep('recording');
            startTimer();
        } catch (error) {
            stopTimer();
            stopMediaStream();
            renderStep('intro');
            alert('Nie udało się uzyskać dostępu do mikrofonu. Sprawdź uprawnienia w przeglądarce.');
        }
    }

    function stopRecording(fromAutoStop = false) {
        if (state.mediaRecorder?.state === 'recording') {
            state.mediaRecorder.stop();
            if (fromAutoStop) {
                descriptionEl.textContent = 'Limit jednego nagrania został osiągnięty. Przygotowuję transkrypcję.';
            }
        }
    }

    primaryBtn?.addEventListener('click', () => {
        if (state.step === 'intro') {
            startRecording();
            return;
        }

        if (state.step === 'recording') {
            stopRecording(false);
            return;
        }

        if (state.step === 'review') {
            analyzeTranscript();
            return;
        }

        if (state.step === 'success') {
            closeVoiceExpenseModal();
        }
    });

    secondaryBtn?.addEventListener('click', () => {
        if (state.step === 'review' || state.step === 'analyzing') {
            renderStep('intro');
            setBusyState(false);
            transcriptInput.value = '';
            resetRecordingState();
        }
    });

    closeBtn?.addEventListener('click', closeVoiceExpenseModal);
    overlay?.addEventListener('click', closeVoiceExpenseModal);

    window.openVoiceExpenseModal = openVoiceExpenseModal;
})();
