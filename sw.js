const VERSION = 'v4.7.1.6'; // Increment this to update the app
const CACHE_NAME = `workout-${VERSION}`; 

const ASSETS = [
  './',
  'index.html',
  'css/vars.css',
  'css/layout.css',
  'css/components.css',
  'css/theme.css',
  'js/app.js',
  'manifest.json',
  'pushup-icon.PNG',
  'Google_G_logo.png'
];

// 1. Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 2. Activate: CLEAN UP OLD CACHES
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Service Worker: Clearing Old Cache");
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 3. Fetch (Your existing logic)
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('googleapis.com') || event.request.url.includes('firebase')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
           caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, networkResponse.clone());
           });
        }
        return networkResponse;
      }).catch(() => cachedResponse);
      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Message Listener: To talk to the Settings Page
self.addEventListener('message', (event) => {
  if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSION });
  }
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});