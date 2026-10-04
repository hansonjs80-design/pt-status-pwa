const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function worker(overrides) {
  const handlers = {};
  const context = vm.createContext({ self: { addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting() {} }, ...overrides });
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
  assert.ok(requests.some(r => r.url === './app.js'));
  assert.ok(requests.some(r => r.url === './local-tools.js'));
  assert.ok(requests.every(r => r.cache === 'reload'));
});

test('navigation with a new query uses the HTML bundled with the installed scripts', async () => {
  const installedHTML = { release: 'installed HTML' };
  const handlers = worker({
    caches: { match: async request => request === './index.html' ? installedHTML : undefined },
    fetch: () => assert.fail('navigation must not mix new HTML into the old installed release'),
  });
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.test/?new-query' }, respondWith(value) { response = value; } });
  assert.equal(await response, installedHTML);
});
