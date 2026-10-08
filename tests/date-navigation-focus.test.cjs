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
    const match = selector.match(/data-row="(\d+)".*data-col="name"/);
    if (!match) return null;
    const idx = Number(match[1]);
    if (!app.getCurrentRows()[idx]) return null;
    return { closest: () => ({ style: {} }), getBoundingClientRect: () => ({ top: 160 + idx * 30 - container.scrollTop, bottom: 190 + idx * 30 - container.scrollTop }) };
  } };
  app.selectCell = (rowIdx, colKey) => { app.activeCell = { rowIdx, colKey }; app.crossDateSelection = null; };
  return app;
}

test('every route to Today selects the name below the last entered row and centers the last record', () => {
  for (const route of ['today', 'calendar', 'picker', 'next', 'previous']) {
    const app = createApp(Array.from({ length: 80 }, (_, i) => ({ name: i === 15 ? '' : `가상 ${i}` })));
    if (route === 'previous') app.currentDate = '2026-10-09';
    if (route === 'next') app.shiftDay(1);
    else if (route === 'previous') app.shiftDay(-1);
    else app.setDate('2026-10-08', route !== 'picker');
    assert.deepEqual(app.activeCell, { rowIdx: 80, colKey: 'name' });
    const rect = app.elTableBody.querySelector('[data-row="79"][data-col="name"]').getBoundingClientRect();
    assert.equal((rect.top + rect.bottom) / 2, 430);
    app.activeCell = { rowIdx: 0, colKey: 'memo' };
    app.setDate('2026-10-08', true);
    assert.deepEqual(app.activeCell, { rowIdx: 80, colKey: 'name' });
    app.setDate('2026-10-07', true);
    assert.equal(app.elSheetContainer.scrollTop, 0);
    assert.equal(app.activeCell, null);
  }
});

test('Today uses row one when empty, skips internal gaps and counts other entered columns', () => {
  for (const [rows, target] of [[[], 0], [[{name:'첫 기록'}, {}, {name:'끝 기록'}, {}, {memo:'준비 내용'}], 5]]) {
    const app = createApp(rows);
    app.setDate('2026-10-08');
    assert.deepEqual(app.activeCell, { rowIdx: target, colKey: 'name' });
    assert.equal(app.elSheetContainer.scrollTop, 0);
  }
});

test('cloud records update the Today destination without stealing later navigation, selection or editing', async () => {
  for (const action of ['untouched', 'leave', 'select', 'edit']) {
    const app = createApp([{name:'로컬 기록'}]);
    let finish;
    app.supabaseClient = {};
    app.pullFromCloud = date => date === '2026-10-08' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve();
    app.setDate('2026-10-08');
    if (action === 'leave') app.setDate('2026-10-07');
    if (action === 'select') app.selectCell(0, 'memo');
    if (action === 'edit') app.editing = true;
    app.dataStore['2026-10-08'] = Array.from({ length: 90 }, () => ({name:'클라우드 가상 기록'}));
    finish();
    await new Promise(resolve => setImmediate(resolve));
    if (action === 'untouched') assert.deepEqual(app.activeCell, { rowIdx: 90, colKey: 'name' });
    if (action === 'leave') { assert.equal(app.currentDate, '2026-10-07'); assert.equal(app.elSheetContainer.scrollTop, 0); }
    if (action === 'select') assert.deepEqual(app.activeCell, { rowIdx: 0, colKey: 'memo' });
    if (action === 'edit') assert.deepEqual(app.activeCell, { rowIdx: 1, colKey: 'name' });
  }
});
