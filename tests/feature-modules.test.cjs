const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const files = [...read('index.html').matchAll(/<script src="([^" ]+\.js)"><\/script>/g)]
  .map(match => match[1]);

test('tests load the same feature scripts and order as the browser', () => {
  const coreFiles = files.filter(file => file !== 'local-tools.js');
  assert.equal(require('./helpers/load-app-source.cjs'), coreFiles.map(read).join('\n'));
  assert.equal(coreFiles.at(-1), 'app.js');
});

test('every browser script is installed in the offline release', async () => {
  let installed, requests;
  const handlers = {};
  vm.runInNewContext(read('sw.js'), {
    self: { addEventListener(name, fn) { handlers[name] = fn; }, skipWaiting() {} },
    Request: class { constructor(url) { this.url = url; } },
    caches: { open: async () => ({ addAll: async values => { requests = values; } }) }
  });
  handlers.install({ waitUntil(value) { installed = value; } });
  await installed;
  for (const file of files) assert.ok(requests.some(request => request.url === './' + file), file);
});

test('feature methods do not collide and are installed before the app starts', () => {
  const ready = [];
  const context = vm.createContext({
    window: { addEventListener(name, fn) { if (name === 'DOMContentLoaded') ready.push(fn); } },
    localStorage: { getItem() { return null; } }
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') + `
    globalThis.App = PTApp;
    globalThis.features = [PTHistorySearch, PTTableFormatting, PTSummary, PTCellInputTools,
      PTDeviceLayout, PTDocumentTools, PTCloudSync, PTContextMenu, PTPresetManager,
      PTAutocomplete, PTCellEditor, PTSheetSelection, PTSheetActions, PTSheetKeyboard, PTColumnSettings];
  `, context);
  const owners = new Map();
  for (const feature of context.features) {
    for (const name of Object.getOwnPropertyNames(feature.prototype)) {
      if (name === 'constructor') continue;
      assert.ok(!owners.has(name), name + ' duplicated in ' + feature.name + ' and ' + owners.get(name));
      owners.set(name, feature.name);
      assert.deepEqual(Object.getOwnPropertyDescriptor(context.App.prototype, name),
        Object.getOwnPropertyDescriptor(feature.prototype, name), feature.name + '.' + name);
    }
  }
  assert.equal(ready.length, 1);
});
