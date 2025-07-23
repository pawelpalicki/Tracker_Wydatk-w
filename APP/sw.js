const CACHE_NAME = 'tracker-wydatkow-cache-v4'; // Zwiększona wersja
const urlsToCache = [
    '/',
    '/tracker.html',
    '/icon.svg',
    '/manifest.json'
];

// Instalacja Service Workera i cache'owanie zasobów
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Otwarto cache:', CACHE_NAME);
                return cache.addAll(urlsToCache);
            })
    );
});

// Aktywacja Service Workera i czyszczenie starych cache'y
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Usuwanie starego cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Przechwytywanie zapytań sieciowych
self.addEventListener('fetch', event => {
    event.respondWith(
        // Najpierw spróbuj pobrać z sieci, aby zawsze mieć najnowszą wersję
        fetch(event.request).catch(() => {
            // Jeśli sieć zawiedzie, spróbuj pobrać z cache
            return caches.match(event.request);
        })
    );
});
