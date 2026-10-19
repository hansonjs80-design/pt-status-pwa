const CACHE_NAME = 'pt-status-pwa-v453';

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
  './manifest.json?v=445',
  './icon.svg?v=445',
  './icon-32.png?v=445',
  './icon-48.png?v=445',
  './icon-192.png?v=445',
  './icon-256.png?v=445',
  './icon-512.png?v=445',
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

  // version.json은 항상 네트워크에서 가져와 실시간 새 버전 감지 지원
  if (reqUrl.includes('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => new Response(JSON.stringify({ version: 'unknown' }), {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

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

  // HTML 네비게이션(페이지 접속 / 새로고침): Network First with Cache Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 정적 리소스(JS, CSS 등): Cache First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
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
      });
    })
  );
});
