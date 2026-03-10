// Tracker Wydatków - API Communication Functions

// --- Funkcja do komunikacji z API ---
async function apiCall(endpoint, method = 'GET', body = null) {
    const user = auth.currentUser;
    if (!user) {
        console.error('apiCall: Użytkownik nie jest zalogowany');
        logout();
        throw new Error('Użytkownik nie jest zalogowany.');
    }

    try {
        const token = await user.getIdToken();


        // Wybierz odpowiedni nagłówek w zależności od środowiska
        const authHeaderName = IS_DEVELOPMENT ? 'X-Firebase-Token' : 'Authorization';


        const headers = {
            'Content-Type': 'application/json',
            [authHeaderName]: `Bearer ${token}`
        };

        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);


        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);



        if (response.status === 401) {
            console.error('apiCall: Błąd 401 - token nieprawidłowy');
            logout();
            throw new Error('Sesja wygasła lub jest nieprawidłowa. Zaloguj się ponownie.');
        }

        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (!response.ok) {
            console.error('apiCall: Błąd odpowiedzi:', response.status, data);
            throw new Error(data.error || 'Błąd serwera');
        }
        return data;
    } catch (error) {
        console.error('apiCall: Błąd:', error);
        throw error;
    }
}

async function apiCallWithFile(endpoint, file) {
    const user = auth.currentUser;
    if (!user) {
        logout();
        throw new Error('Użytkownik nie jest zalogowany.');
    }

    const token = await user.getIdToken();
    const authHeaderName = IS_DEVELOPMENT ? 'X-Firebase-Token' : 'Authorization';

    // Konwertuj plik na base64
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]); // Usuń prefix "data:image/...;base64,"
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const requestBody = {
        image: base64,
        mimetype: file.type,
        filename: file.name,
        size: file.size
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            [authHeaderName]: `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
    });
    if (response.status === 401) {
        logout();
        throw new Error('Sesja wygasła lub jest nieprawidłowa. Zaloguj się ponownie.');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Błąd serwera');
    return data;
}