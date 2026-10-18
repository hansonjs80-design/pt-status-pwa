const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function worker(overrides = {}, selfOverrides = {}) {
  const handlers = {};
  const self = { addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting() {}, ...selfOverrides };
  const context = vm.createContext({ self, URL: globalThis.URL, ...overrides });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), context);
  return handlers;
}

test('installed app scripts stay in one release instead of mixing background network versions', async () => {
  const cached = { release: 'installed' };
  const handlers = worker({ caches: { match: async () => cached }, fetch: () => assert.fail('must not replace part of an installed release') });
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://example.test/app.js' }, respondWith(value) { response = value; } });
  assert.equal(await response, cached);
});

test('new app releases bypass stale HTTP cache when installing every bundled asset', async () => {
  let requests, installed;
  const handlers = worker({
    Request: class { constructor(url, options) { this.url = url; this.cache = options.cache; } },
    caches: { open: async () => ({ addAll: async values => { requests = values; } }) },
  });
  handlers.install({ waitUntil(value) { installed = value; } });
  await installed;
  for (const file of ['app.js', 'history-search.js', 'table-formatting.js', 'summary.js', 'cell-input-tools.js']) {
    assert.ok(requests.some(r => r.url === './' + file));
  }
  assert.ok(requests.some(r => r.url === './local-tools.js'));
  assert.ok(requests.every(r => r.cache === 'reload'));
});

test('navigation falls back to installed bundled HTML when offline or network fails', async () => {
  const installedHTML = { release: 'installed HTML' };
  const handlers = worker({
    caches: { match: async request => request === './index.html' ? installedHTML : undefined },
    fetch: async () => { throw new Error('network offline'); },
  });
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/?new-query' }, respondWith(value) { response = value; } });
  assert.equal(await response, installedHTML);
});

test('navigation online fetches fresh HTML from network to apply updates upon refresh', async () => {
  const freshHTML = { status: 200, clone() { return this; } };
  let putCalled = false;
  const handlers = worker({
    caches: { open: async () => ({ put: async () => { putCalled = true; } }), match: async () => undefined },
    fetch: async () => freshHTML,
  });
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/' }, respondWith(value) { response = value; } });
  assert.equal(await response, freshHTML);
  assert.equal(putCalled, true);
});

test('service worker handles SKIP_WAITING message from client', () => {
  let skipWaitingCalled = false;
  const handlers = worker({}, { skipWaiting: () => { skipWaitingCalled = true; } });
  assert.ok(handlers.message, 'message event listener must be registered');
  handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.strictEqual(skipWaitingCalled, true, 'skipWaiting must be called when receiving SKIP_WAITING message');
});

test('manifest and icon requests use network first to pick up icon changes without reinstallation', async () => {
  let fetchedUrl = null;
  const networkResponse = { status: 200, clone() { return this; } };
  let cachePut = null;
  const handlers = worker({
    caches: { open: async () => ({ put: async (req, res) => { cachePut = req; } }), match: async () => assert.fail('should not use cache first') },
    fetch: async req => { fetchedUrl = req; return networkResponse; }
  });
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://example.test/manifest.json?v=434' }, respondWith(value) { response = value; } });
  const result = await response;
  assert.equal(result, networkResponse);
  assert.equal(fetchedUrl.url, 'https://example.test/manifest.json?v=434');
});

test('reload navigation requests fetch from network to pick up new releases upon refresh', async () => {
  let fetchedUrl = null;
  const networkHTML = { status: 200, clone() { return this; } };
  const handlers = worker({
    caches: { open: async () => ({ put: async () => {} }), match: async () => assert.fail('should not use cache first for reload') },
    fetch: async req => { fetchedUrl = req; return networkHTML; }
  });
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', cache: 'reload', url: 'https://example.test/?_reload=123' }, respondWith(value) { response = value; } });
  const result = await response;
  assert.equal(result, networkHTML);
});

