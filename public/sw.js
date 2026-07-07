const CACHE_NAME = 'pechat-24-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Warm up cache, handle gracefully if any fails
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Initial cache warming: some non-essential assets skipped', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept Web Share Target POST requests containing shared files/text
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const files = formData.getAll('files');
          const title = formData.get('title') || '';
          const text = formData.get('text') || '';
          const urlParam = formData.get('url') || '';

          // Open or create PWA Share Target IndexedDB database
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('PWA_Share_Target_DB', 1);
            request.onupgradeneeded = (e) => {
              const database = e.target.result;
              if (!database.objectStoreNames.contains('shared_items')) {
                database.createObjectStore('shared_items', { keyPath: 'id', autoIncrement: true });
              }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
          });

          // Write shared items to DB
          const transaction = db.transaction('shared_items', 'readwrite');
          const store = transaction.objectStore('shared_items');

          for (const file of files) {
            if (file && file.size > 0) {
              store.add({
                timestamp: Date.now(),
                file: file, // Blob/File
                name: file.name,
                type: file.type,
                size: file.size
              });
            }
          }

          if (text || urlParam || title) {
            store.add({
              timestamp: Date.now(),
              text: text || urlParam || title
            });
          }

          await new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);
          });
        } catch (error) {
          console.error('Error in Service Worker handling share target POST:', error);
        }

        // Redirect browser using 303 status (redirects as a GET request)
        return Response.redirect('/?shared-target=1', 303);
      })()
    );
    return;
  }

  // Only handle GET requests and local/http/https schemes
  if (event.request.method !== 'GET') return;
  
  // Skip external Chrome extensions, WebSockets, or Firestore direct calls
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('identitytoolkit.googleapis.com')) {
    return; // Pass directly to network
  }

  // Network-first falling back to cache strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache valid responses from our own domain
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback if resource is completely offline and not in cache
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Офлайн режим: Подключение отсутствует', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        });
      })
  );
});
