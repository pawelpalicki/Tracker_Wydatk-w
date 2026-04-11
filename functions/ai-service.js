const { GoogleGenerativeAI } = require('@google/generative-ai');
const { retryWithBackoff } = require('./utils');
const { getPrompt } = require('./prompt.js');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = gemini.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * Wyodrębnianie danych z paragonu i kategoryzacja przy użyciu AI
 */
async function extractAndCategorizePurchase(file, categories) {
    const imagePart = { inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimetype } };
    const prompt = getPrompt(categories, categories.tags || {});

    try {
        const generationFn = () => model.generateContent([prompt, imagePart]);
        const result = await retryWithBackoff(generationFn);

        const rawText = result.response.text();
        console.log("Surowa odpowiedź od AI:", rawText);

        let jsonString = rawText;
        const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            jsonString = jsonMatch[1];
        }

        let data;
        try {
            data = JSON.parse(jsonString);
        } catch (parseError) {
            console.error("Błąd parsowania JSON z odpowiedzi AI:", parseError);
            console.error("Tekst, który zawiódł:", jsonString);
            throw new Error('AI zwróciło odpowiedź w nieprawidłowym formacie JSON.');
        }

        if (data.error) {
            throw new Error(data.error);
        }

        return data;

    } catch (error) {
        throw error;
    }
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
        if (!jsonMatch) throw new Error('Nieprawidłowy format odpowiedzi AI');
        
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error('Błąd generowania wniosków AI:', error);
        throw error;
    }
}

module.exports = {
    extractAndCategorizePurchase,
    generateInsights
};
