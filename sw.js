const VERSION = "v5.0.4.3"; // Increment this to update the app
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

    // ONLY skip actual external API calls.
    // We check for "googleapis.com" and "firebaseapp.com" (the hosted domains),
    // but we ALLOW files like "init-firebase.js" that are on your own domain.
    if (url.includes("googleapis.com") || url.includes("firebaseapp.com")) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Stale-while-revalidate logic
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse);

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
