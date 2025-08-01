const CACHE_NAME = 'tracker-wydatkow-cache-v11'; // Poprawka błędu składniowego
const APP_SHELL_URLS = [
    '/',
    '/tracker.html',
    '/icon-new.svg',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js',
    'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
    'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css',
    'https://cdn.jsdelivr.net/npm/flatpickr',
    'https://cdn.jsdelivr.net/npm/idb@7/build/umd.js'
];
const API_BASE_URL = 'https://tracker-wydatkow-backend.onrender.com';
const SW_SYNC_SECRET = 'bardzo-tajny-klucz-synchronizacji';

self.importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/umd.js');

self.addEventListener('install', event => {
    console.log('[SW] Instalacja v12...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Cache-owanie App Shell...');
            const requests = APP_SHELL_URLS.map(url => {
                // Dla zasobów z innych domen, użyj trybu 'no-cors'
                if (url.startsWith('http')) {
                    return new Request(url, { mode: 'no-cors' });
                }
                return new Request(url);
            });
            return Promise.all(requests.map(req => cache.add(req).catch(e => console.warn(`[SW] Nie udało się dodać do cache: ${req.url}`, e))));
        })
    );
});

self.addEventListener('activate', event => {
    console.log('[SW] Aktywacja...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Usuwanie starego cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignoruj żądania do Firebase
    if (url.hostname.includes('firebaseapp.com') || url.hostname.includes('googleapis.com')) {
        return; 
    }

    // Dla zapytań do API, użyj strategii Network First
    if (url.href.startsWith(API_BASE_URL + '/api/')) {
        // Ta strategia najpierw próbuje pobrać z sieci.
        // Jeśli się nie uda (jesteś offline), zwraca ostatnią wersję z cache.
        event.respondWith(networkFirst(request));
    }
    // Dla statycznych zasobów aplikacji (App Shell), użyj strategii Cache First
    else if (APP_SHELL_URLS.some(shellUrl => url.href === new URL(shellUrl, self.location.origin).href)) {
        // Ta strategia najpierw sprawdza cache.
        // Jeśli zasób jest w cache, zwraca go natychmiast.
        event.respondWith(cacheFirst(request));
    }
    // Dla wszystkich innych zapytań, również spróbuj najpierw sieci
    else {
        event.respondWith(networkFirst(request));
    }
});

async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
            return caches.open(CACHE_NAME).then(cache => {
                cache.put(request, networkResponse.clone());
                return networkResponse;
            });
        }
        return networkResponse;
    });
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    const fetchPromise = fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(err => {
        console.error('[SW] Błąd sieci w SWR:', err);
    });
    return cachedResponse || fetchPromise;
}

async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        // Zapisuj w cache tylko udane odpowiedzi na żądania GET
        if (networkResponse.ok && request.method === 'GET') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('[SW] Błąd sieci, próba pobrania z cache dla:', request.url);
        const cachedResponse = await caches.match(request);
        return cachedResponse;
    }
}

self.addEventListener('sync', event => {
    if (event.tag === 'sync-outbox') {
        console.log('[SW] Rozpoczynam synchronizację w tle...');
        event.waitUntil(syncOutbox());
    }
});

async function syncOutbox() {
    let db;
    try {
        db = await idb.openDB('tracker-db', 1);
        const allRequests = await db.getAll('outbox');

        for (const request of allRequests) {
            try {
                console.log('[SW] Przetwarzam żądanie z outbox:', request);

                const fetchOptions = {
                    method: request.method,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Sync-Key': SW_SYNC_SECRET
                    }
                };

                // Dodaj body tylko jeśli istnieje (dla POST, PUT)
                if (request.body) {
                    // Upewnij się, że userId jest w ciele żądania dla serwera
                    if (request.userId && !request.body.userId) {
                        request.body.userId = request.userId;
                    }
                    fetchOptions.body = JSON.stringify(request.body);
                } else {
                    // Dla żądań bez body (DELETE), przekaż userId w inny sposób, jeśli to konieczne
                    // W tym przypadku middleware serwera oczekuje go w body, więc musimy je stworzyć
                    fetchOptions.body = JSON.stringify({ userId: request.userId });
                }

                const response = await fetch(API_BASE_URL + request.endpoint, fetchOptions);

                if (response.ok) {
                    console.log(`[SW] Żądanie ${request.id} wysłane pomyślnie.`);
                    await db.delete('outbox', request.id);
                } else {
                    console.error(`[SW] Błąd serwera dla żądania ${request.id}: ${response.status} ${response.statusText}`);
                    const responseBody = await response.text();
                    console.error('[SW] Odpowiedź serwera:', responseBody);
                    if (response.status >= 400 && response.status < 500) {
                        await db.delete('outbox', request.id);
                    }
                }
            } catch (error) {
                console.error(`[SW] Błąd sieci podczas wysyłania żądania ${request.id}:`, error);
                break; 
            }
        }

        // Wyślij wiadomość do wszystkich aktywnych klientów (kart przeglądarki)
        self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
            if (clients && clients.length) {
                clients.forEach(client => {
                    client.postMessage({ type: 'SYNC_COMPLETE' });
                });
            }
        });
        console.log('[SW] Synchronizacja zakończona.');

    } catch (error) {
        console.error('[SW] Nie udało się otworzyć bazy danych do synchronizacji:', error);
    } finally {
        if (db) {
            db.close();
        }
    }
}
