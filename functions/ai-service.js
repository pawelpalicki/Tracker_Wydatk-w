const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAuth } = require('google-auth-library');
const { retryWithBackoff } = require('./utils');
const { getPrompt, getVoiceExpensePrompt } = require('./prompt.js');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY, { apiVersion: 'v1beta' });
const model = gemini.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

const speechAuth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// Gemini czasem zwraca JSON w bloku ```json ... ```, więc czyścimy odpowiedź do samego payloadu.
function extractJsonFromText(rawText) {
    let jsonString = rawText;
    const jsonFenceMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/i);

    if (jsonFenceMatch && jsonFenceMatch[1]) {
        jsonString = jsonFenceMatch[1];
    }

    try {
        return JSON.parse(jsonString);
    } catch (parseError) {
        console.error('Błąd parsowania JSON z odpowiedzi AI:', parseError);
        console.error('Tekst, który zawiódł:', jsonString);
        throw new Error('AI zwróciło odpowiedź w nieprawidłowym formacie JSON.');
    }
}

// Front wysyła krótkie nagrania z MediaRecorder, więc mapujemy MIME typu przeglądarki
// na kodowanie rozumiane przez Google Speech-to-Text.
function normalizeSpeechEncoding(mimeType = '') {
    const normalizedMimeType = mimeType.toLowerCase();

    if (normalizedMimeType.includes('webm')) {
        return { encoding: 'WEBM_OPUS', sampleRateHertz: 48000 };
    }

    if (normalizedMimeType.includes('ogg')) {
        return { encoding: 'OGG_OPUS', sampleRateHertz: 48000 };
    }

    if (normalizedMimeType.includes('wav')) {
        return { encoding: 'LINEAR16' };
    }

    throw new Error('Nieobsługiwany format audio. Użyj nagrania WEBM/Opus, OGG/Opus lub WAV.');
}

// Speech-to-Text używa konta usługi Firebase Functions, więc pobieramy token OAuth runtime.
async function getSpeechAccessToken() {
    const client = await speechAuth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const token = typeof accessTokenResponse === 'string'
        ? accessTokenResponse
        : accessTokenResponse?.token;

    if (!token) {
        throw new Error('Nie udało się pobrać tokenu dostępu do Google Speech-to-Text.');
    }

    return token;
}

// Łączymy częściowe wyniki STT w jeden tekst do dalszej, ręcznie edytowalnej transkrypcji.
function extractTranscriptFromSpeechResponse(payload = {}) {
    const transcripts = (payload.results || [])
        .map(result => result?.alternatives?.[0]?.transcript || '')
        .filter(Boolean);

    return transcripts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Wyodrębnianie danych z paragonu i kategoryzacja przy użyciu AI
 */
async function extractAndCategorizePurchase(file, categories) {
    const imagePart = { inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype } };
    const prompt = getPrompt(categories, categories.tags || {});

    try {
        const generationFn = () => model.generateContent([prompt, imagePart]);
        const result = await retryWithBackoff(generationFn);

        const rawText = result.response.text();
        console.log('Surowa odpowiedź od AI:', rawText);

        const data = extractJsonFromText(rawText);
        if (data.error) {
            throw new Error(data.error);
        }

        return data;
    } catch (error) {
        throw error;
    }
}

async function transcribeAudio(file, options = {}) {
    const { encoding, sampleRateHertz } = normalizeSpeechEncoding(file.mimetype);
    const accessToken = await getSpeechAccessToken();

    // Dla krótkich nagrań z popupu wystarcza synchroniczne recognize z inline base64.
    const requestPayload = {
        config: {
            encoding,
            languageCode: options.languageCode || 'pl-PL',
            enableAutomaticPunctuation: true,
            model: options.model || 'latest_long'
        },
        audio: {
            content: file.buffer.toString('base64')
        }
    };

    if (sampleRateHertz) {
        requestPayload.config.sampleRateHertz = sampleRateHertz;
    }

    const response = await fetch('https://speech.googleapis.com/v1/speech:recognize', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
    });

    const payload = await response.json();

    if (!response.ok) {
        console.error('Błąd Speech-to-Text:', payload);
        throw new Error(payload.error?.message || 'Nie udało się przetworzyć nagrania.');
    }

    const transcript = extractTranscriptFromSpeechResponse(payload);
    if (!transcript) {
        throw new Error('Nie udało się rozpoznać tekstu w nagraniu. Spróbuj nagrać jeszcze raz.');
    }

    return {
        transcript,
        results: payload.results || []
    };
}

// Drugi etap dla wydatku głosowego:
// Gemini zamienia transkrypcję na ten sam schemat JSON, którego używa analiza paragonu.
async function analyzeVoiceExpenseText(transcript, categories, context = {}) {
    const prompt = getVoiceExpensePrompt(categories, categories.tags || {}, context);
    const fullPrompt = `${prompt}\n\nTRANSKRYPCJA UŻYTKOWNIKA:\n${transcript}`;

    const generationFn = () => model.generateContent(fullPrompt);
    const result = await retryWithBackoff(generationFn);
    const rawText = result.response.text();

    console.log('Surowa odpowiedź AI dla wydatku głosowego:', rawText);

    const data = extractJsonFromText(rawText);
    if (data.error) {
        throw new Error(data.error);
    }

    return data;
}

/**
 * Generowanie wniosków finansowych przy użyciu AI
 */
async function generateInsights(userId, currentMonthData, previousMonthData, categories) {
    const prompt = `
        Jesteś inteligentnym asystentem finansowym. Przeanalizuj poniższe dane o wydatkach użytkownika i sformułuj 3 krótkie, konkretne wnioski/rady (insights).
        Używaj bezpośredniego, zachęcającego tonu. Każdy wniosek powinien być krótki (max 150 znaków).

        DANE:
        - Bieżący miesiąc total: ${currentMonthData.total} zł
        - Poprzedni miesiąc total: ${previousMonthData.total} zł
        - Kategorie z największymi wydatkami: ${JSON.stringify(currentMonthData.topCategories)}
        - Dostępne kategorie: ${categories.join(', ')}

        Zwróć odpowiedź WYŁĄCZNIE w formacie JSON:
        {
          "insights": [
            { "icon": "fa-icon-name", "text": "Treść wniosku..." },
            ...
          ]
        }
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Nieprawidłowy format odpowiedzi AI');
        }

        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error('Błąd generowania wniosków AI:', error);
        throw error;
    }
}

/**
 * Wnioski AI dla widoku Analizy (dłuższy okres, bogatszy kontekst JSON).
 */
async function generateInsightsRange(userId, payload) {
    const safe = typeof payload === 'object' && payload !== null ? payload : {};
    const dataJson = JSON.stringify(safe, null, 0);
    if (dataJson.length > 120000) {
        throw new Error('Zbyt obszerny zestaw danych do analizy AI.');
    }

    const prompt = `
Jesteś asystentem finansowym w aplikacji do śledzenia wydatków (Polska, waluta PLN).
Przeanalizuj WYŁĄCZNIE dane z JSON poniżej — nie zmyślaj kwot, kategorii ani trendów, których nie ma w danych.
Użytkownik widzi wykres dla okresu i filtrów opisanych w polu "range" i "filtersApplied".

ZADANIE:
- Zbuduj tablicę "insights" z minimum 5 pozycjami (zalecenie: 5–7).
- Pozycje od pierwszej do przedostatniej: konkretne obserwacje (trend w czasie, kategorie, sklepy, tagi, budżet vs wydatki, nieregularności itd.).
- **Ostatnia pozycja** w tablicy MUSI być praktyczną radą działania: co użytkownik może zmienić lub nad czym popracować (nawyki, planowanie, jedna konkretna zmiana), o ile dane JSON na to pozwalają. Jeśli dane są zbyt ubogie lub niejednoznaczne, ostatni wniosek krótko wyjaśnij (np. żeby dłużej zbierać dane albo rozważyć szerszy zakres) — bez wymyślania liczb.
- Ton: bezpośredni, pomocny, bez moralizowania.
- Każdy wniosek max 220 znaków, po polsku.
- Odwołuj się do liczb z JSON tylko tam, gdzie są dostępne.

DANE JSON:
${dataJson}

Zwróć WYŁĄCZNIE poprawny JSON (bez markdown) w schemacie:
{
  "insights": [
    { "icon": "fa-chart-line", "text": "..." }
  ]
}
Użyj ikon Font Awesome 5 (prefiks fa-), np. fa-chart-line, fa-store, fa-tags, fa-piggy-bank, fa-seedling (ostatnia rada).
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return extractJsonFromText(text);
    } catch (error) {
        console.error('Błąd generateInsightsRange:', error);
        throw error;
    }
}

module.exports = {
    analyzeVoiceExpenseText,
    extractAndCategorizePurchase,
    generateInsights,
    generateInsightsRange,
    transcribeAudio
};
