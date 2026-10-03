const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function createApp(rows = []) {
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { activeElement: null, querySelectorAll: () => [] },
    setTimeout: fn => fn(), clearTimeout,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  Object.assign(app, {
    currentDate: '2026-10-04', activeCell: { rowIdx: 0, colKey: 'name' },
    elSearchInput: { value: '' }, elTableBody: { querySelector: () => ({}) },
    elSheetContainer: { focus() {} },
    historyApplyTarget: { date: '2026-10-04', rows, row: rows[0], rowIdx: 0, colKey: 'name' },
  });
  app.getCurrentRows = () => rows;
  for (const key of ['saveDataStore', 'renderTable', 'clearHeaderSelections', 'selectCell', 'showSaveIndicator']) app[key] = () => {};
  return { app, context };
}

test('selected chart/name opens prefilled prompt with all text selected, including an empty cell', () => {
  for (const colKey of ['name', 'chartNo']) for (const value of ['가상환자', '']) {
    const { app } = createApp([{ [colKey]: value }]);
    app.activeCell.colKey = colKey;
    let selected = false, focused = false;
    app.elSearchPromptModal = { style: {} };
    app.elSearchPromptInput = { value: 'old', focus() { focused = true; }, select() { selected = true; } };
    app.updateSearchPromptAutocomplete = () => {};
    app.elSearchInput.value = 'old query';
    app.findActiveCell();
    assert.equal(app.elSearchPromptModal.style.display, 'flex');
    assert.equal(app.elSearchPromptInput.value, value);
    assert.equal(app.searchPromptTargetRowIdx, 0);
    assert.ok(selected && focused);
  }
});

test('Ctrl/Cmd+F in a live cell editor still searches directly', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const { app } = createApp([{ name: '가상환자', chartNo: 'T001' }]);
    let searched;
    app.searchAllDates = (...args) => { searched = args; };
    const row = { dataset: { rowIdx: '0' }, classList: { add() {} } };
    const input = { tagName: 'INPUT', value: '가상환자', closest: selector => selector === '.excel-row' ? row : {}, blur() {} };
    app.handleGlobalKeyDown({ key: 'f', [modifier]: true, target: input, preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(searched, ['가상환자', 0]);
  }
});

test('history applies to matching patient and otherwise appends after the last populated row', () => {
  for (const identity of [
    { name: '가상환자', chartNo: 'T001' },
    { name: '가상환자', chartNo: 'T002' },
    { name: '다른환자', chartNo: 'T001' },
    { name: '', chartNo: '' },
  ]) {
    const rows = [{ name: '가상환자', chartNo: 'T001', part: '원본' }, {}, { name: '마지막환자', memo: '보존' }, {}, {}];
    const { app } = createApp(rows);
    const same = identity.name === rows[0].name && identity.chartNo === rows[0].chartNo;
    app.applyHistoryRow({ ...identity, part: '새 부위', _sourceDate: '2026-10-01' });
    const idx = same ? 0 : 3;
    assert.equal(rows[idx].part, '새 부위');
    assert.equal(rows[2].memo, '보존');
    if (!same) assert.equal(rows[0].part, '원본');
    assert.equal(app.lastHistoryAppliedTarget.rowIdx, idx);
    assert.match(rows[idx].visitTime, /시 .*분/);
  }
});

test('multiple history rows append consecutively without overwriting other patients', () => {
  const rows = [{ name: '원본환자', chartNo: 'T000' }, { name: '마지막환자', chartNo: 'T999' }, {}, {}];
  const { app } = createApp(rows);
  app.crossDateResults = [
    { name: '첫환자', chartNo: 'T001', part: '목', _sourceDate: '2026-10-01' },
    { name: '둘환자', chartNo: 'T002', part: '허리', _sourceDate: '2026-10-02' },
  ];
  app.crossDateSelection = { minRow: 0, maxRow: 1, minCol: 0, maxCol: 9 };
  app.applyHistoryRow(app.crossDateResults[0]);
  assert.deepEqual(rows.map(row => row.name), ['원본환자', '마지막환자', '첫환자', '둘환자']);
});

test('history partial apply preserves unrelated fields on a matching row', () => {
  const rows = [{ name: '가상환자', chartNo: 'T001', part: '목', memo: '유지' }];
  const { app } = createApp(rows);
  const source = { name: '가상환자', chartNo: 'T001', part: '허리', memo: '바뀌면 안됨' };
  app.crossDateResults = [source];
  app.crossDateSelection = { minRow: 0, maxRow: 0, minCol: 4, maxCol: 4 };
  app.applyHistoryRow(source);
  assert.equal(rows[0].part, '허리');
  assert.equal(rows[0].memo, '유지');
});


test('leaving history restores the applied row at No. with a selection border', () => {
  const rows = [{ name: '가상환자' }, { name: '적용환자' }];
  const { app } = createApp(rows);
  let selected, scrolled = false;
  const cell = { scrollIntoView() { scrolled = true; } };
  app.elTableBody.querySelector = selector => {
    assert.equal(selector, '[data-row="1"][data-col="no"]');
    return cell;
  };
  app.selectCell = (...args) => { selected = args; };
  app.restoreAppliedHistorySelection({ date: app.currentDate, row: rows[1], rowIdx: 0 });
  assert.deepEqual(selected, [1, 'no', cell, false]);
  assert.ok(scrolled);
});
