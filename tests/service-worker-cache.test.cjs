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

test('navigation without an installed document falls back to the network', async () => {
  const freshHTML = { status: 200, clone() { return this; } };
  let putCalled = false;
  const handlers = worker({
    caches: { open: async () => ({ put: async () => { putCalled = true; } }), match: async () => undefined },
    fetch: async () => freshHTML,
  });
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/' }, respondWith(value) { response = value; } });
  assert.equal(await response, freshHTML);
  assert.equal(putCalled, false);
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

test('reload keeps the installed HTML and scripts together while an update waits', async () => {
  const installedHTML = { release: 'installed' };
  const handlers = worker({
    caches: { match: async (request, options) => {
      assert.equal(request, './index.html');
      assert.match(options.cacheName, /^pt-status-pwa-v\d+$/);
      return installedHTML;
    } },
    fetch: async () => assert.fail('must not mix new HTML with installed scripts'),
  });
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', cache: 'reload', url: 'https://example.test/?_reload=123' }, respondWith(value) { response = value; } });
  assert.equal(await response, installedHTML);
});

test('version.json requests always fetch from network without cache to detect updates in real-time', async () => {
  let fetchedReq = null;
  const versionResponse = { status: 200, json: async () => ({ version: 'v446' }) };
  const handlers = worker({
    caches: { match: async () => assert.fail('must not use cache for version.json') },
    fetch: async (req, opts) => { fetchedReq = { req, opts }; return versionResponse; }
  });
  let response;
  handlers.fetch({ request: { method: 'GET', url: 'https://example.test/version.json?_t=123' }, respondWith(value) { response = value; } });
  const result = await response;
  assert.equal(result, versionResponse);
  assert.equal(fetchedReq.opts?.cache, 'no-store');
});

test('PTApp.prototype.checkForUpdate detects newer server version from version.json and dispatches pt-app-update-available', async () => {
  let dispatched = null;
  const context = vm.createContext({
    window: {
      addEventListener() {},
      dispatchEvent(e) { if (e.type === "pt-app-update-available") dispatched = e; }
    },
    document: { addEventListener() {} },
    navigator: {},
    fetch: async () => ({
      ok: true,
      json: async () => ({ version: 'v446' })
    }),
    Date, AbortSignal,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  app.appVersion = 'v441';
  app.isUpdateAvailable = false;

  const hasUpdate = await app.checkForUpdate();
  assert.equal(hasUpdate, true);
  assert.equal(app.isUpdateAvailable, true);
  assert.equal(app.latestServerVersion, 'v446');
  assert.ok(dispatched);
  assert.equal(dispatched.type, 'pt-app-update-available');
  assert.equal(dispatched.detail.version, 'v446');
});



