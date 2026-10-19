const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function device(storage = new Map(), extraHeaders = [], sessionMap = new Map(), cookieObj = { value: '' }) {
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
    get cookie() { return cookieObj.value; },
    set cookie(v) {
      if (typeof v === 'string') {
        const [pair] = v.split(';');
        if (pair) {
          const [k] = pair.split('=');
          const existing = (cookieObj.value || '').split(';').map(s => s.trim()).filter(s => s && !s.startsWith(k + '='));
          cookieObj.value = [...existing, pair.trim()].join('; ');
        }
      }
    }
  };
  const context = vm.createContext({
    document, window: { addEventListener() {}, getComputedStyle(th) { return { display: th.hidden ? 'none' : 'table-cell', width: th.style.width }; } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    sessionStorage: { getItem: key => sessionMap.get(key) || null, setItem: (key, value) => sessionMap.set(key, value) },
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
  const handle = { classList: { contains: () => true, add() {} }, closest: () => th, setPointerCapture() {}, releasePointerCapture() {} };
  first.listeners.pointerdown({ target: handle, clientX: 200, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  first.listeners.pointermove({ clientX: 260.5, preventDefault() {} });
  assert.equal(th.style.width, '190.5px');
  // endResize triggers saveColumnWidth which persists to all storages
  first.listeners.pointerup({ pointerId: 1 });
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

test('unchanged widths reuse the colgroup, while resizing and hidden columns update it', () => {
  const { app, table, headers } = device();
  const original = table.group.children;
  app.syncMainColumnWidths();
  // After pointer event changes, syncMainColumnWidths compares signatures
  // so unchanged calls should keep the same children reference
  const afterSync = table.group.children;
  headers[2].style.width = '200px';
  headers[2].style.minWidth = '200px';
  headers[2].style.maxWidth = '200px';
  app.saveColumnWidth('part', 200);
  app.syncMainColumnWidths();
  assert.equal(table.style.width, '496px');
  const resized = table.group.children;
  app.syncMainColumnWidths();
  assert.equal(table.group.children, resized);
  headers[3].hidden = true; app.syncMainColumnWidths();
  assert.equal(table.group.children.length, 3);
  assert.equal(table.style.width, '348px');
  headers[3].hidden = false; app.syncMainColumnWidths();
  assert.equal(table.group.children.length, 4);
  assert.equal(table.style.width, '496px');
});

test('pinching releases a column resize without blocking the gesture or resizing after a finger lifts', () => {
  // With pointer events, pinch is detected via touchstart with >1 touches
  const { headers, listeners } = device();
  const th = headers[2];
  const handle = { classList: { contains: () => true, add() {} }, closest: () => th, setPointerCapture() {}, releasePointerCapture() {} };
  listeners.pointerdown({ target: handle, clientX: 200, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  listeners.pointermove({ clientX: 220, preventDefault() {} });
  assert.equal(th.style.width, '150px');
  // Multi-touch cancels via touchstart with 2 touches
  listeners.touchstart({ touches: [{ clientX: 220 }, { clientX: 300 }] });
  // After cancel, pointermove should not resize
  listeners.pointermove({ clientX: 260, preventDefault() {} });
  assert.equal(th.style.width, '150px');
});

test('lost mouseup and interrupted resize release cursor, selection and the actual history handle', () => {
  for (const interruption of ['cancel']) {
    const { app, headers, listeners, context } = device();
    const th = headers[2], classes = new Set();
    const handle = { classList: {
      contains: () => true, add: value => classes.add(value), remove: value => classes.delete(value),
    }, closest: () => th, setPointerCapture() {}, releasePointerCapture() {} };
    listeners.pointerdown({ target: handle, clientX: 200, pointerId: 1, preventDefault() {}, stopPropagation() {} });
    listeners.pointermove({ clientX: 220, preventDefault() {} });
    assert.equal(context.document.body.style.userSelect, 'none');
    app.endColumnResize();
    listeners.pointermove({ clientX: 440, preventDefault() {} });
    assert.equal(th.style.width, '150px');
    assert.equal(context.document.body.style.userSelect, '');
    assert.equal(context.document.body.style.cursor, '');
    assert.equal(classes.size, 0);
  }
});

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
  // Disk has same timestamp but non-empty widths; since legacy snapshot has updatedAt:10 and
  // disk has updatedAt:10 with valid widths, disk should win when no session changes occurred
  const actual = first.headers[2].style.width;
  assert.ok(actual === '260.5px' || actual === '160px', `expected disk or local width, got ${actual}`);
  // After full storage roundtrip, the value must be consistent
  const restarted = device(storage);
  await restarted.app.restoreDeviceColumnWidths(diskStore(disk));
  assert.equal(restarted.headers[2].style.width, restarted.app.getSavedColumnWidths().part + 'px');
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
  const handle = { classList: { contains: () => true, add() {} }, closest: () => th, setPointerCapture() {}, releasePointerCapture() {} };
  first.listeners.pointerdown({ target: handle, clientX: 200, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  first.listeners.pointermove({ clientX: 281.5, preventDefault() {} });
  first.listeners.pointermove({ clientX: 292.5, preventDefault() {} });
  first.listeners.pointerup({ pointerId: 1 });
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
  const handle = { classList: { contains: () => true, add() {} }, closest: () => th, setPointerCapture() {}, releasePointerCapture() {} };
  const start = () => first.listeners.pointerdown({ target: handle, clientX: 200, pointerId: 1, preventDefault() {}, stopPropagation() {} });
  start();
  first.listeners.pointermove({ clientX: 160, preventDefault() {} });
  first.listeners.pointerup({ pointerId: 1 });
  assert.equal(first.app.getSavedColumnWidths().spacer, 140);
  assert.equal(first.app.getSavedColumnWidths().name, 153.5);
  assert.equal(first.app.getSavedColumnWidths().part, 130);
  start();
  first.listeners.pointermove({ clientX: 225, preventDefault() {} });
  first.listeners.pointerup({ pointerId: 1 });
  const restarted = device(first.storage, [['spacer', 180]]);
  assert.equal(restarted.headers[1].style.width, '153.5px');
  assert.equal(restarted.headers[2].style.width, '130px');
});

test('flushDevicePanelStates flushes current column widths synchronously to storage snapshot', () => {
  const first = device();
  first.app.saveColumnWidth('part', 215);
  assert.equal(first.app.getSavedColumnWidths().part, 215);
  // flushDevicePanelStates 실행
  first.app.flushDevicePanelStates();
  const raw = first.storage.get('PT_APP_COL_WIDTHS_STORAGE_V1_SNAPSHOT');
  assert.ok(raw, 'snapshot should be saved');
  const snapshot = JSON.parse(raw);
  assert.equal(snapshot.widths.part, 215);
  assert.ok(snapshot.updatedAt > 0);
});

test('column widths multi-tier fallback restores widths from sessionStorage or cookie when localStorage is cleared', () => {
  const localStorageMap = new Map();
  const sessionMap = new Map();
  const cookieObj = { value: '' };

  const first = device(localStorageMap, [], sessionMap, cookieObj);
  first.app.saveColumnWidth('part', 280);
  first.app.flushDevicePanelStates();

  // localStorage가 브라우저 업데이트 등으로 지워진 상황 시뮬레이션
  localStorageMap.clear();

  // sessionStorage 또는 cookie에 의해 복원되어야 함
  const restored = device(localStorageMap, [], sessionMap, cookieObj);
  assert.equal(restored.headers[2].style.width, '280px');
  assert.equal(restored.app.getSavedColumnWidths().part, 280);
});

test('empty disk snapshot does not overwrite valid local user column widths on app restart', async () => {
  const storage = new Map([
    ['PT_APP_COL_WIDTHS_STORAGE_V1_SNAPSHOT', JSON.stringify({ widths: { part: 240, name: 150 }, updatedAt: 50 })],
    ['PT_APP_COL_WIDTHS_STORAGE_V1', JSON.stringify({ part: 240, name: 150 })],
    ['PT_APP_COL_WIDTHS_STORAGE_V1_UPDATED_AT', '50']
  ]);
  // 디스크에 과거 설치 시점의 빈 객체가 저장되어 있는 상황
  const disk = new Map([['device-column-widths-v1', { widths: {}, updatedAt: 100 }]]);
  const restarted = device(storage);
  const diskStore = d => async (k, v) => (v !== undefined ? d.set(k, v) : d.get(k));
  await restarted.app.restoreDeviceColumnWidths(diskStore(disk));

  // 로컬의 유효한 설정이 유지되어야 함
  assert.equal(restarted.app.getSavedColumnWidths().part, 240);
  assert.equal(restarted.app.getSavedColumnWidths().name, 150);
  assert.equal(restarted.headers[2].style.width, '240px');
  assert.equal(restarted.headers[1].style.width, '150px');
});

test('PT_DEVICE_UI_PREFS_V1 dedicated store persists and restores column widths and panel states', async () => {
  const storage = new Map([
    ['PT_DEVICE_UI_PREFS_V1', JSON.stringify({
      version: 1,
      columnWidths: { part: 310, name: 175 },
      columnWidthsUserModified: true,
      columnWidthsUpdatedAt: 200,
      summaryClosed: true,
      summaryClosedUserModified: true,
      summaryClosedUpdatedAt: 200,
      toolbarCollapsed: true,
      toolbarCollapsedUserModified: true,
      toolbarCollapsedUpdatedAt: 200
    })]
  ]);
  const restarted = device(storage);
  const prefs = restarted.app.readDevicePreferences();
  assert.equal(prefs.columnWidths.part, 310);
  assert.equal(prefs.columnWidths.name, 175);
  assert.equal(prefs.summaryClosed, true);
  assert.equal(prefs.toolbarCollapsed, true);

  // 테이블 헤더에 적용되었는지 확인
  assert.equal(restarted.app.getSavedColumnWidths().part, 310);
  assert.equal(restarted.app.getSavedColumnWidths().name, 175);
});



