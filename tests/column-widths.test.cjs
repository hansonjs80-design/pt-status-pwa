const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function device(storage = new Map(), extraHeaders = []) {
  const listeners = {};
  const table = { style: {}, group: null, querySelector() { return this.group; }, insertBefore(group) { this.group = group; } };
  const headers = [ ['', 48], ['name', 100], ['part', 130], ['visitTime', 148], ...extraHeaders ].map(([col, width]) => ({
    dataset: col ? { col } : {}, style: { width: `${width}px` }, hidden: false,
    get offsetWidth() { return parseFloat(this.style.width); },
    getBoundingClientRect() { return { width: this.offsetWidth, right: 500 }; },
    closest() { return null; }, querySelector() { return { classList: { remove() {} } }; },
  }));
  const document = {
    createElement() { return { style: {}, dataset: {}, children: [], replaceChildren(...cols) { this.children = cols; } }; },
    body: { style: {} }, addEventListener(name, fn) { listeners[name] = fn; },
    querySelectorAll(selector) { return selector.endsWith('th.col-letter') ? headers.slice(1) : headers; },
    getElementById() { return table; },
  };
  const context = vm.createContext({
    document, window: { addEventListener() {}, getComputedStyle(th) { return { display: th.hidden ? 'none' : 'table-cell', width: th.style.width }; } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  app.elSheetContainer = { scrollLeft: 0 };
  app.syncCrossDateColWidths = () => app.syncMainColumnWidths();
  app.initColumnResizing();
  return { app, table, headers, listeners, storage, context };
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

function diskStore(disk = new Map()) {
  return async (key, value) => {
    if (value !== undefined) disk.set(key, JSON.parse(JSON.stringify(value)));
    return disk.get(key);
  };
}

test('atomic width snapshot survives interrupted legacy timestamp writes and a backward clock', () => {
  const storage=new Map([['PT_APP_COL_WIDTHS_STORAGE_V1','{"part":160}'],['PT_APP_COL_WIDTHS_STORAGE_V1_UPDATED_AT','500']]);
  const first=device(storage);first.context.Date=class extends Date {static now(){return 100;}};
  const original=first.context.localStorage.setItem;
  first.context.localStorage.setItem=(key,value)=>{if(key.endsWith('_UPDATED_AT'))throw Error('quota');original(key,value);};
  first.app.saveColumnWidth('part',245.5);first.app.saveColumnWidth('part',260.5);
  const snapshot=JSON.parse(storage.get('PT_APP_COL_WIDTHS_STORAGE_V1_SNAPSHOT'));
  assert.equal(snapshot.updatedAt,502);assert.equal(snapshot.widths.part,260.5);
  assert.equal(device(storage).headers[2].style.width,'260.5px');
});

test('IndexedDB wins timestamp ties with stale local widths and repopulates the local snapshot', async () => {
  const storage=new Map([['PT_APP_COL_WIDTHS_STORAGE_V1','{"part":160}'],['PT_APP_COL_WIDTHS_STORAGE_V1_UPDATED_AT','10']]);
  const disk=new Map([['device-column-widths-v1',{widths:{part:260.5},updatedAt:10}]]);
  const first=device(storage);await first.app.restoreDeviceColumnWidths(diskStore(disk));
  assert.equal(first.headers[2].style.width,'260.5px');
  assert.equal(device(storage).headers[2].style.width,'260.5px');
});

test('drag writes are started immediately and verification accepts a newer saved drag position', async () => {
  const first=device();const disk=new Map(),pending=[];
  first.app.columnWidthsStore=async(key,value)=>{
    if(value!==undefined){disk.set(key,JSON.parse(JSON.stringify(value)));await new Promise(resolve=>pending.push(resolve));}
    return disk.get(key);
  };
  first.app.saveColumnWidth('part',200);first.app.saveColumnWidth('part',220);first.app.saveColumnWidth('part',240.5);
  assert.equal(pending.length,3);assert.equal(disk.get('device-column-widths-v1').widths.part,240.5);
  pending.forEach(resolve=>resolve());await first.app.columnWidthsWrite;
  assert.equal(disk.get('device-column-widths-v1').widths.part,240.5);
});

test('full localStorage does not interrupt resizing and IndexedDB restores widths on a fresh app', async () => {
  const storage = new Map();
  const first = device(storage);
  const disk = new Map();
  const store = diskStore(disk);
  await first.app.restoreDeviceColumnWidths(store);
  // Reproduce quota failure in the settings store, independently of IndexedDB.
  vm.runInContext("localStorage.setItem = () => { throw new Error('QuotaExceededError'); };", first.context);
  const th = first.headers[2];
  first.listeners.mousedown({ target: { classList: { contains: () => true, add() {} }, closest: () => th }, pageX: 200, preventDefault() {}, stopPropagation() {} });
  first.listeners.mousemove({ pageX: 281.5 });
  first.listeners.mousemove({ pageX: 292.5 });
  first.listeners.mouseup();
  await first.app.columnWidthsWrite;
  assert.equal(th.style.width, '222.5px');
  assert.equal(disk.get('device-column-widths-v1').widths.part, 222.5);
  const restarted = device(storage);
  await restarted.app.restoreDeviceColumnWidths(store);
  assert.equal(restarted.headers[2].style.width, '222.5px');
  restarted.headers[3].hidden = true;
  restarted.app.syncMainColumnWidths();
  assert.equal(restarted.headers[2].style.width, '222.5px');
  assert.equal(device().headers[2].style.width, '130px');
});

test('startup disk restoration does not overwrite a resize performed while it is loading', async () => {
  const first = device();
  const disk = new Map([['device-column-widths-v1', { widths: { part: 160 }, updatedAt: 10 }]]);
  const store = diskStore(disk);
  let release;
  const loading = first.app.restoreDeviceColumnWidths(async (key, value) => {
    if (!release && value === undefined) return new Promise(resolve => { release = () => resolve(disk.get(key)); });
    return store(key, value);
  });
  first.app.saveColumnWidth('part', 260);
  release();
  await loading;
  await first.app.columnWidthsWrite;
  assert.equal(first.app.getSavedColumnWidths().part, 260);
  assert.equal(disk.get('device-column-widths-v1').widths.part, 260);
});

test('legacy local widths migrate and a reset remains reset after restarting', async () => {
  const storage = new Map([['PT_APP_COL_WIDTHS_STORAGE_V1', '{"part":245}']]);
  const disk = new Map();
  const first = device(storage);
  const store = diskStore(disk);
  await first.app.restoreDeviceColumnWidths(store);
  assert.equal(disk.get('device-column-widths-v1').widths.part, 245);
  const widths = first.app.getSavedColumnWidths();
  delete widths.part;
  first.app.persistColumnWidths(widths);
  await first.app.columnWidthsWrite;
  const restarted = device(storage);
  await restarted.app.restoreDeviceColumnWidths(store);
  assert.equal(restarted.headers[2].style.width, '130px');
});


test('first launch pins every track including spacer and hiding visit time preserves widths', () => {
  const first = device(new Map(), [['spacer', 180]]);
  assert.equal(first.table.style.width, '606px');
  assert.deepEqual(first.table.group.children.map(col => [col.dataset.col, col.style.width]), [
    ['rowHeader', '48px'], ['name', '100px'], ['part', '130px'], ['visitTime', '148px'], ['spacer', '180px'],
  ]);
  first.headers[3].hidden = true;
  first.app.syncMainColumnWidths();
  assert.equal(first.table.style.width, '458px');
  assert.deepEqual(first.table.group.children.map(col => col.dataset.col), ['rowHeader', 'name', 'part', 'spacer']);
  first.headers[3].hidden = false;
  first.app.syncMainColumnWidths();
  assert.equal(first.table.style.width, '606px');
});

test('resizing spacer preserves other saved widths despite rendered width differences', () => {
  const first = device(new Map(), [['spacer', 180]]);
  first.app.saveColumnWidth('name', 153.5);
  // Layout measurements must never replace canonical device widths on a drag.
  first.headers.forEach(th => { th.getBoundingClientRect = () => ({ width: 300, right: 500 }); });
  const th = first.headers[4];
  const start = () => first.listeners.mousedown({ target: { classList: { contains: () => true, add() {} }, closest: () => th }, pageX: 200, preventDefault() {}, stopPropagation() {} });
  start();
  first.listeners.mousemove({ pageX: 160 });
  first.listeners.mouseup();
  assert.equal(first.app.getSavedColumnWidths().spacer, 220);
  assert.equal(first.app.getSavedColumnWidths().name, 153.5);
  assert.equal(first.app.getSavedColumnWidths().part, 130);
  start();
  first.listeners.mousemove({ pageX: 225 });
  first.listeners.mouseup();
  const restarted = device(first.storage, [['spacer', 180]]);
  assert.equal(restarted.headers[4].style.width, '195px');
  assert.equal(restarted.headers[1].style.width, '153.5px');
  assert.equal(restarted.headers[2].style.width, '130px');
});
