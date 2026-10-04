const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function device(storage = new Map()) {
  const listeners = {};
  const table = { style: {} };
  const headers = [ ['', 48], ['name', 100], ['part', 130], ['visitTime', 148] ].map(([col, width]) => ({
    dataset: col ? { col } : {}, style: { width: `${width}px` }, hidden: false,
    get offsetWidth() { return parseFloat(this.style.width); },
    getBoundingClientRect() { return { width: this.offsetWidth, right: 500 }; },
    closest() { return null; }, querySelector() { return { classList: { remove() {} } }; },
  }));
  const document = {
    body: { style: {} }, addEventListener(name, fn) { listeners[name] = fn; },
    querySelectorAll(selector) { return selector.endsWith('th.col-letter') ? headers.slice(1) : headers; },
    getElementById() { return table; },
  };
  const context = vm.createContext({
    document, window: { addEventListener() {}, getComputedStyle(th) { return { display: th.hidden ? 'none' : 'table-cell', width: th.style.width }; } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  app.syncCrossDateColWidths = () => app.syncMainColumnWidths();
  app.initColumnResizing();
  return { app, table, headers, listeners, storage };
}

test('device column widths survive relaunch even before mouseup and history visibility does not redistribute columns', () => {
  const first = device();
  const th = first.headers[2];
  const handle = { classList: { contains: () => true, add() {} }, closest: () => th };
  first.listeners.mousedown({ target: handle, pageX: 200, preventDefault() {}, stopPropagation() {} });
  first.listeners.mousemove({ pageX: 260.5 });
  assert.equal(th.style.width, '190.5px');
  const relaunched = device(first.storage);
  assert.equal(relaunched.headers[2].style.width, '190.5px');
  assert.equal(relaunched.table.style.width, '486.5px');
  relaunched.headers[3].hidden = true;
  relaunched.app.syncMainColumnWidths();
  assert.equal(relaunched.table.style.width, '338.5px');
  assert.equal(relaunched.headers[2].style.width, '190.5px');
  relaunched.headers[3].hidden = false;
  relaunched.app.syncMainColumnWidths();
  assert.equal(relaunched.table.style.width, '486.5px');
  assert.equal(device().headers[2].style.width, '130px');
});
