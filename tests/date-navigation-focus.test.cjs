const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function createApp(records = []) {
  const context = vm.createContext({ window: { addEventListener() {} }, document: { activeElement: null }, clearTimeout, setTimeout });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App=PTApp;', context);
  const app = Object.create(context.App.prototype);
  Object.assign(app, {
    currentDate: '2026-10-07', dataStore: { '2026-10-08': records },
    elDatePicker: {}, elDateLabel: { classList: { toggle() {} } }, elSidebarDateTag: {}, elSheetTabTitle: {},
    activeCell: null,
  });
  app.getTodayString = () => '2026-10-08';
  app.isEditingCell = () => Boolean(app.editing);
  for (const method of ['clearHeaderSelections', 'getEditHistory', 'renderTable', 'updateHistoryButtons', 'updateSidebarStats']) app[method] = () => {};
  const container = app.elSheetContainer = {
    scrollTop: 0, clientTop: 0, clientHeight: 600,
    get scrollHeight() { return app.getCurrentRows().length * 30 + 60; },
    getBoundingClientRect: () => ({ top: 100, bottom: 700 }),
    querySelectorAll: () => [{ getBoundingClientRect: () => ({ top: 100, bottom: 160, height: 60 }) }],
  };
  app.elTableBody = { querySelector(selector) {
    const match = selector.match(/data-row="(\d+)".*data-col="(?:name|no)"/);
    if (!match) return null;
    const idx = Number(match[1]);
    if (!app.getCurrentRows()[idx]) return null;
    return { closest: () => ({ style: {} }), getBoundingClientRect: () => ({ top: 160 + idx * 30 - container.scrollTop, bottom: 190 + idx * 30 - container.scrollTop, height:30 }) };
  } };
  app.selectCell = (rowIdx, colKey) => { app.activeCell = { rowIdx, colKey }; app.crossDateSelection = null; };
  return app;
}

test('all dates select the name below the last entered row and center the last record through every route', () => {
  for (const date of ['2026-10-08', '2025-09-09', '2026-10-10']) for (const route of ['button', 'calendar', 'picker', 'next', 'previous']) {
    const records = Array.from({ length: 80 }, (_, i) => ({ name: i === 15 ? '' : `가상 ${i}` }));
    const app = createApp();
    app.dataStore[date] = records;
    if (route === 'previous' || route === 'next') {
      const adjacent = new Date(date + 'T12:00:00');
      adjacent.setDate(adjacent.getDate() + (route === 'previous' ? 1 : -1));
      app.currentDate = `${adjacent.getFullYear()}-${String(adjacent.getMonth()+1).padStart(2,'0')}-${String(adjacent.getDate()).padStart(2,'0')}`;
      app.shiftDay(route === 'previous' ? -1 : 1);
    } else app.setDate(date, route !== 'picker');
    assert.deepEqual(app.activeCell, { rowIdx: 80, colKey: 'name' });
    const rect = app.elTableBody.querySelector('[data-row="79"][data-col="name"]').getBoundingClientRect();
    assert.equal((rect.top + rect.bottom) / 2, 430);
    app.activeCell = { rowIdx: 0, colKey: 'memo' };
    app.setDate(date, true);
    assert.deepEqual(app.activeCell, { rowIdx: 80, colKey: 'name' });
    app.setDate('2026-10-07', true);
    assert.equal(app.elSheetContainer.scrollTop, 0);
    assert.deepEqual(app.activeCell, {rowIdx:0,colKey:'no'});
  }
});

test('all dates use A1 when empty, skip internal gaps and count other entered columns', () => {
  for (const date of ['2026-10-08', '2025-09-09']) for (const [rows, target] of [[[], 0], [[{name:'첫 기록'}, {}, {name:'끝 기록'}, {}, {memo:'준비 내용'}], 5]]) {
    const app = createApp(rows);
    app.dataStore[date]=rows;
    app.setDate(date);
    assert.deepEqual(app.activeCell, { rowIdx: target, colKey: target ? 'name' : 'no' });
    assert.equal(app.elSheetContainer.scrollTop, 0);
  }
});

test('cloud records update any date destination without stealing later navigation, selection or editing', async () => {
  for (const date of ['2026-10-08','2025-09-09']) for (const action of ['untouched', 'leave', 'select', 'edit']) {
    const app = createApp([{name:'로컬 기록'}]);
    app.dataStore[date]=[{name:'로컬 기록'}];
    let finish;
    app.supabaseClient = {};
    app.pullFromCloud = requested => requested === date ? new Promise(resolve => { finish = resolve; }) : Promise.resolve();
    app.setDate(date);
    if (action === 'leave') app.setDate('2026-10-07');
    if (action === 'select') app.selectCell(0, 'memo');
    if (action === 'edit') app.editing = true;
    app.dataStore[date] = Array.from({ length: 90 }, () => ({name:'클라우드 가상 기록'}));
    finish();
    await new Promise(resolve => setImmediate(resolve));
    if (action === 'untouched') assert.deepEqual(app.activeCell, { rowIdx: 90, colKey: 'name' });
    if (action === 'leave') { assert.equal(app.currentDate, '2026-10-07'); assert.equal(app.elSheetContainer.scrollTop, 0); }
    if (action === 'select') assert.deepEqual(app.activeCell, { rowIdx: 0, colKey: 'memo' });
    if (action === 'edit') assert.deepEqual(app.activeCell, { rowIdx: 1, colKey: 'name' });
  }
});
