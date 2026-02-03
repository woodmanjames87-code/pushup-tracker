const CACHE_NAME = 'workout-v4.1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './pushup-icon.PNG'
];

// 1. Install: Save files to the phone's storage
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 2. Fetch: Show cached content immediately, update in background
self.addEventListener('fetch', (event) => {
  // 1. CHECK: Is this a Firebase/Google request?
  if (event.request.url.includes('googleapis.com') || 
      event.request.url.includes('firebase')) {
    return; // Do nothing, let the browser handle it normally
  }

  // 2. REGULAR CACHE LOGIC (for your CSS, JS, HTML)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Only cache successful, standard responses
        if (networkResponse && networkResponse.status === 200) {
           caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, networkResponse.clone());
           });
        }
        return networkResponse;
      }).catch(() => cachedResponse); // Fallback to cache if network fails

      return cachedResponse || fetchPromise;
    })
  );
});