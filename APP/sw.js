const CACHE_NAME = 'tracker-wydatkow-cache-v14';

// Tylko pliki faktycznie serwowane z hostingu (APP/). Brak 404 = cala instalacja SW nie pada.
const urlsToCache = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/css/drawer.css',
    '/js/main.js',
    '/dist/output.css',
    '/manifest.json',
    '/icon-new.svg'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            console.log('Otwarto cache:', CACHE_NAME);
            await Promise.all(
                urlsToCache.map(async url => {
                    try {
                        const res = await fetch(url);
                        if (res.ok) await cache.put(url, res);
                        else console.warn('[SW] Pominieto (odpowiedz nie OK):', url, res.status);
                    } catch (e) {
                        console.warn('[SW] Pominieto (brak pliku lub siec):', url, e && e.message);
                    }
                })
            );
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Usuwanie starego cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            )
        )
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
