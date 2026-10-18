const CACHE_NAME = 'pt-status-pwa-v435';

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    );
  }
});

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './history-search.js',
  './preset-candidates.js',
  './autocomplete-formatting.js',
  './table-formatting.js',
  './summary.js',
  './cell-input-tools.js',
  './device-layout.js',
  './sheet-clock.js',
  './document-tools.js',
  './local-record-store.js',
  './cloud-sync.js',
  './context-menu.js',
  './preset-manager.js',
  './forced-corrections.js',
  './history-text-edit.js',
  './autocomplete.js',
  './cell-editor.js',
  './sheet-selection.js',
  './sheet-actions.js',
  './sheet-keyboard.js',
  './column-settings.js',
  './staff-calendar-settings.js',
  './app-events.js',
  './date-navigation.js',
  './holiday-calendar.js',
  './table-view.js',
  './cell-pickers.js',
  './patient-search-index.js',
  './patient-search-dialog.js',
  './history-table.js',
  './app.js',
  './local-tools.js',
  './manifest.json',
  './manifest.json?v=435',
  './icon.svg?v=435',
  './icon-32.png?v=435',
  './icon-48.png?v=435',
  './icon-192.png?v=435',
  './icon-256.png?v=435',
  './icon-512.png?v=435',
  './icon.svg',
  './icon-32.png',
  './icon-48.png',
  './icon-192.png',
  './icon-256.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE.map(url => new Request(url, { cache: 'reload' })));
    }).then(() => self.skipWaiting())
  );
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
    }).then(() => self.clients.claim())
      .then(() => {
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_NAME });
          });
        });
      })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const reqUrl = event.request.url || '';
  const isManifestOrIcon = reqUrl.includes('manifest.json') || reqUrl.includes('/icon');

  if (isManifestOrIcon) {
    // Network First for manifest and icons so icon/metadata changes update without reinstalling
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // 새로고침 요청이거나 강제 리로드 쿼리가 붙은 경우 네트워크 우선
  const isReload = event.request.cache === 'reload' ||
                   reqUrl.includes('_reload=') ||
                   reqUrl.includes('force_update=');

  if (isReload && event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', responseToCache));
        }
        return networkResponse;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cachedResponse) => {
      if (!cachedResponse && event.request.mode === 'navigate') {
        cachedResponse = await caches.match('./index.html');
      }
      if (cachedResponse) {
        // Keep each installed release intact. Mixing newly fetched scripts into
        // an older release can skip device settings restoration during startup.
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback for html navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
