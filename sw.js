const VERSION = "v5.0.6.11"; // Increment this to update the app
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
    "js/dom.js",
    "js/store.js",
    "js/ui.js",
    "js/main.js",
    "js/vendor/chart.js",
    // --- Manifest & Icons ---
    "webmanifest.json",
    "img/Google_G_logo.png",
    "img/dailygrind-icon.PNG",
    "img/screenshot-mobile.png",
    // --- Background Images ---
    "img/bg/bg-pushups.webp",
    "img/bg/bg-pullups.webp",
    "img/bg/bg-situps.webp",
    "img/bg/bg-squats.webp",
    "img/bg/bg-plank.webp",
    "img/bg/bg-lunges.webp",
    "img/bg/bg-dips.webp",
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
    const url = event.request.url;

    // Skip external Firebase/Google API calls
    if (url.includes("googleapis.com") || url.includes("firebaseapp.com")) {
        return;
    }

    // Only handle GET requests
    if (event.request.method !== "GET") return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            
            // 1. Fire off the background revalidation check
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Silently absorb network errors when offline or on poor connection
                });

            // 2. IF WE HAVE A CACHED MATCH: Return it instantly (0ms)
            if (cachedResponse) {
                return cachedResponse;
            }

            // 3. IF CACHE MISSED & IT'S A PAGE NAVIGATION: Fall back to index.html immediately!
            if (event.request.mode === "navigate") {
                return caches.match("index.html").then((indexResponse) => {
                    return indexResponse || fetchPromise;
                });
            }

            // 4. Otherwise wait for network (for unexpected external assets)
            return fetchPromise;
        })
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
