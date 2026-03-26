const VERSION = "v4.7.6.10"; // Increment this to update the app
const CACHE_NAME = `DailyGrind-${VERSION}`;

const ASSETS = [
    "./",
    "index.html",
    // --- CSS Architecture ---
    "css/variables.css",
    "css/base.css",
    "css/layout.css",
    "css/components.css",
    // --- JS Architecture --
    "js/init-firebase.js",
    "js/store.js",
    "js/ui.js",
    "js/main.js",
    // --- Manifest & Icons ---
    "manifest.json",
    "img/pushup-icon.PNG",
    "img/Google_G_logo.png",
    "img/workout-app-icon.PNG",
    "img/screenshot-mobile.png",
    "img/pushup-tile.PNG",
    "img/pullup-tile.PNG",
    "img/situp-tile.PNG",
    "img/squat-tile.PNG",
];

// 1. Install
self.addEventListener("install", (event) => {
    // 1. Force the SW to take over immediately
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // 2. Map through assets so one failure doesn't break the whole install
            return Promise.all(
                ASSETS.map((url) => {
                    return cache.add(url).catch((err) => {
                        console.error(`PWA: Failed to cache file: ${url}`, err);
                        // We don't re-throw the error, so the SW keeps installing
                    });
                }),
            );
        }),
    );
});

// 2. Activate: CLEAN UP OLD CACHES
self.addEventListener("activate", (event) => {
    event.waitUntil(
        Promise.all([
            // NEW: Claim all open tabs (clients) immediately so they use the new SW
            self.clients.claim(),

            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cache) => {
                        if (cache !== CACHE_NAME) {
                            console.log("Service Worker: Clearing Old Cache");
                            return caches.delete(cache);
                        }
                    }),
                );
            }),
        ]),
    );
});

// 3. Fetch
self.addEventListener("fetch", (event) => {
    // Skip Firebase/Google API calls - let the SDK handle those
    if (event.request.url.includes("googleapis.com") || event.request.url.includes("firebase")) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Start the network fetch
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    // If it's a good response, clone it and save it to cache
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // If network fails and there's no cache, this is where you'd return an offline page
                    return cachedResponse;
                });

            // Return the cached response immediately if we have it,
            // otherwise wait for the network fetch
            return cachedResponse || fetchPromise;
        }),
    );
});

// 4. Message Listener
self.addEventListener("message", (event) => {
    if (event.data.type === "GET_VERSION") {
        event.ports[0].postMessage({ version: VERSION });
    }
    if (event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});
