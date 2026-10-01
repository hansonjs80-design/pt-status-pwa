const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

function createApp() {
  const storage = new Map();
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { activeElement: null, getElementById() { return null; } },
    localStorage: { getItem() { return null; }, setItem(k, v) { storage.set(k, v); } },
    clearTimeout,
  });
  vm.runInContext(readFileSync(resolve(__dirname, '../app.js'), 'utf8') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  app.currentDate = '2026-09-30';
  app.dataStore = {};
  app.editHistory = new Map();
  app.getCurrentRows();
  app.getEditHistory();
  for (const method of ['clearHeaderSelections', 'closeAutocompleteMenu', 'closeGenderDropdown', 'renderTable', 'showSaveIndicator', 'updateSidebarStats', 'scheduleSupabaseSync']) app[method] = () => {};
  for (const element of ['elSearchInput', 'elFormulaInput', 'elCellAddress', 'elSelectedCellCoords']) app[element] = { value: "" };
  app.elBtnClearSearch = { style: {} };
  app.elSheetContainer = { focus() {} };
  return { app, storage };
}

test('multi-cell changes restore as one transaction and persist undo/redo', () => {
  const { app, storage } = createApp();
  const rows = app.getCurrentRows();
  rows[0].name = '가상환자'; rows[0].chartNo = '123'; rows[1].memo = '테스트';
  app.saveDataStore();
  app.saveDataStore();
  assert.equal(app.getEditHistory().undo.length, 1);
  app.restoreEditHistory();
  assert.equal(app.getCurrentRows()[0].name, '');
  assert.equal(app.getCurrentRows()[1].memo, '');
  assert.equal(JSON.parse([...storage.values()][0])['2026-09-30'][0].chartNo, '');
  app.restoreEditHistory(true);
  assert.equal(app.getCurrentRows()[0].chartNo, '123');
  assert.equal(app.getCurrentRows()[1].memo, '테스트');
});

test('undo is isolated by date and new edits invalidate redo', () => {
  const { app } = createApp();
  app.getCurrentRows()[0].name = '오늘'; app.saveDataStore();
  app.currentDate = '2026-09-29'; app.getCurrentRows(); app.getEditHistory();
  app.getCurrentRows()[0].name = '어제'; app.saveDataStore();
  app.restoreEditHistory();
  assert.equal(app.getCurrentRows()[0].name, '');
  assert.equal(app.dataStore['2026-09-30'][0].name, '오늘');
  app.getCurrentRows()[0].name = '새수정'; app.saveDataStore();
  assert.equal(app.getEditHistory().redo.length, 0);
  app.currentDate = '2026-09-30'; app.restoreEditHistory();
  assert.equal(app.getCurrentRows()[0].name, '');
  assert.equal(app.dataStore['2026-09-29'][0].name, '새수정');
});

test('undo history is bounded and captures a pending edit before undo', () => {
  const { app } = createApp();
  for (let i = 0; i < 60; i++) { app.getCurrentRows()[0].memo = String(i); app.saveDataStore(); }
  assert.equal(app.getEditHistory().undo.length, 50);
  app.getCurrentRows()[0].memo = '미저장 입력';
  app.restoreEditHistory();
  assert.equal(app.getCurrentRows()[0].memo, '59');
  app.restoreEditHistory(true);
  assert.equal(app.getCurrentRows()[0].memo, '미저장 입력');
});


test('undo and redo retain history search and its destination row', () => {
  const { app } = createApp();
  app.getCurrentRows()[0].name = '테스트'; app.saveDataStore();
  app.elSearchInput.value = '테스트';
  app.historyApplyTarget = { rowIdx: 0 };
  const searches = [];
  app.searchAllDates = (query, rowIdx) => searches.push([query, rowIdx]);
  app.restoreEditHistory();
  assert.equal(app.elSearchInput.value, '테스트');
  assert.equal(app.elBtnClearSearch.style.display, 'block');
  app.restoreEditHistory(true);
  assert.deepEqual(searches, [['테스트', 0], ['테스트', 0]]);
  assert.equal(app.getCurrentRows()[0].name, '테스트');
});

test('visit time manual changes and deletion survive saves and reloads', () => {
  const {app}=createApp();const row=app.getCurrentRows()[0];row.name='가상환자';app.saveDataStore();
  assert.match(row.visitTime,/\d{2}시 \d{2}분 \d{2}초/);
  row.visitTime='10시 20분';app.saveDataStore();assert.equal(app.getVisitTime(row),'10시 20분');assert.equal(row._visitTimeEdited,true);
  row.visitTime='';app.saveDataStore();app.saveDataStore();assert.equal(row.visitTime,'');
  app.dataStore[app.currentDate]=JSON.parse(JSON.stringify(app.getCurrentRows()));app.getCurrentRows();app.saveDataStore();assert.equal(app.getCurrentRows()[0].visitTime,'');
});


test('clearing a name clears its visit time in the same undo transaction', () => {
  const {app}=createApp();const row=app.getCurrentRows()[0];row.name='가상환자';app.saveDataStore();
  const originalTime=row.visitTime;
  row.name='   ';app.saveDataStore();
  assert.equal(row.visitTime,'');assert.equal(row._visitedAt,undefined);assert.equal(row._visitTimeEdited,undefined);
  app.restoreEditHistory();assert.equal(app.getCurrentRows()[0].name,'가상환자');assert.equal(app.getCurrentRows()[0].visitTime,originalTime);
  app.restoreEditHistory(true);assert.equal(app.getCurrentRows()[0].visitTime,'');
  app.getCurrentRows()[0].name='새환자';app.saveDataStore();assert.match(app.getCurrentRows()[0].visitTime,/\d{2}시 \d{2}분 \d{2}초/);
});

test('explicit visit refresh records seconds and supports undo without changing another row', () => {
  const {app}=createApp(),rows=app.getCurrentRows();
  rows[0].name='가상환자';app.saveDataStore();rows[0].visitTime='09시 01분 02초';app.saveDataStore();
  rows[1].visitTime='08시 00분 00초';app.saveDataStore();
  const now=new Date(2026,9,1,14,23,45);
  app.setVisitTimeNow(rows[0],now);app.saveDataStore();
  assert.equal(rows[0].visitTime,'14시 23분 45초');assert.equal(rows[0]._visitedAt,now.toISOString());
  assert.equal(rows[1].visitTime,'08시 00분 00초');
  app.restoreEditHistory();assert.equal(app.getCurrentRows()[0].visitTime,'09시 01분 02초');
});
