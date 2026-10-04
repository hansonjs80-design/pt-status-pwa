const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function createApp(rows = []) {
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { activeElement: null, querySelectorAll: () => [] },
    setTimeout: fn => fn(), clearTimeout, alert() {},
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

test('row-header Ctrl/Cmd+Down keeps row selection on the last actual record, independent of copied columns', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) for (const lastCol of [9, 10]) {
    const rows = [{ no: '3', chartNo: '1', name: '첫 환자' }, {}, { name: '마지막 환자' }, {}, {}];
    const { app } = createApp(rows);
    app.activeCell = null;
    app.selectedRowRange = { minRow: 0, maxRow: 1 };
    app.selectedRange = { minRow: 0, maxRow: 1, minCol: 0, maxCol: lastCol };
    app.clipboardSelection = { date: app.currentDate, minCol: 2, maxCol: 5 };
    let selected, scrolled = 0, prevented = 0;
    const tr = { style: { display: 'none' } };
    app.elTableBody.querySelector = () => ({ closest: () => tr, scrollIntoView() { scrolled++; } });
    app.selectCell = () => assert.fail('row selection must remain a row selection');
    app.selectRowRange = (...args) => { selected = args; };
    const event = { key: 'ArrowDown', [modifier]: true, target: { tagName: 'DIV' }, preventDefault() { prevented++; } };
    app.handleGlobalKeyDown(event);
    assert.deepEqual(selected, [2, 2, lastCol]);
    assert.equal(tr.style.display, '');
    assert.equal(scrolled, 1);
    rows[2] = {};
    app.handleGlobalKeyDown(event);
    assert.deepEqual(selected, [0, 0, lastCol]);
    rows[0] = {};
    app.handleGlobalKeyDown(event);
    assert.deepEqual(selected, [0, 0, lastCol]);
    assert.equal(prevented, 3);
  }
});

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

test('Ctrl/Cmd+Up goes to the first daily row or the newest history date while keeping cell or row selection', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) for (const rowSelected of [false, true]) {
    const { app } = createApp([{}, {}, { name: '가상환자' }]);
    app.activeCell = rowSelected ? null : { rowIdx: 2, colKey: 'name' };
    app.selectedRowRange = rowSelected ? { minRow: 2, maxRow: 2 } : null;
    app.isCrossDateRowSelected = true; // A previous history header selection may leave this flag set.
    app.selectedRange = rowSelected ? { minRow: 2, maxRow: 2, minCol: 0, maxCol: 9 } : null;
    let selected;
    app.elTableBody.querySelector = () => ({ closest: () => ({ style: {} }), scrollIntoView() {} });
    app.selectCell = (row, col) => { selected = ['cell', row, col]; };
    app.selectRowRange = (...args) => { selected = ['row', ...args]; };
    app.selectCrossDateCell = (...args) => { selected = ['history-cell', ...args]; };
    app.selectCrossDateRow = row => { selected = ['history-row', row]; };
    const event = { key: 'ArrowUp', [modifier]: true, target: { tagName: 'DIV' }, preventDefault() {} };
    app.handleGlobalKeyDown(event);
    assert.deepEqual(selected, rowSelected ? ['row', 0, 0, 9] : ['cell', 0, 'name']);
    app.crossDateResults = [{ _sourceDate: '2026-09-01' }, { _sourceDate: '2026-10-03' }, { _sourceDate: '2026-09-12' }];
    app.handleGlobalKeyDown(event);
    assert.deepEqual(selected, rowSelected ? ['history-row', 1] : ['history-cell', 1, 3]);
  }
});

test('Ctrl/Cmd+F in a live cell editor still searches directly', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const { app } = createApp([{ name: '가상환자', chartNo: 'T001' }]);
    let searched;
    app.dataStore = {'2026-10-03':[{name:'가상환자'}]};
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
    const same = identity.name === rows[0].name;
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

test('history divider follows header and panel height changes', () => {
  const { app, context } = createApp();
  let headerHeight = 51, panelHeight = 365;
  const master = { style: {}, getBoundingClientRect: () => ({ height: panelHeight }) };
  const dividerCell = { style: {} };
  const currentHeaderCell = { style: {} };
  const header = { getBoundingClientRect: () => ({ height: headerHeight }) };
  context.document.querySelector = selector => selector === '.current-history-headers'
    ? { querySelectorAll: () => [currentHeaderCell] } : master;
  context.document.getElementById = id => id === 'excelTable'
    ? { querySelector: () => header }
    : { querySelectorAll: () => [dividerCell], getBoundingClientRect: () => ({ height: 30 }) };
  app.updateCrossDateStickyOffsets();
  assert.equal(master.style.top, '51px');
  assert.equal(dividerCell.style.top, '416px');
  assert.equal(currentHeaderCell.style.top, '446px');
  headerHeight = 58; panelHeight = 112;
  app.updateCrossDateStickyOffsets();
  assert.equal(master.style.top, '58px');
  assert.equal(dividerCell.style.top, '170px');
  assert.equal(currentHeaderCell.style.top, '200px');
  context.document.querySelector = () => null;
  assert.doesNotThrow(() => app.updateCrossDateStickyOffsets());
});


test('history ignores Enter repeats and handled search events until a fresh Enter press', () => {
  const { app } = createApp([{ name: '가상환자', chartNo: 'T001' }]);
  app.crossDateSelection = { minRow: 0 };
  app.crossDateResults = [{ name: '가상환자', chartNo: 'T001', part: '새 내역' }];
  let applied = 0;
  app.applyHistoryRow = () => { applied++; };
  const target = { tagName: 'DIV', closest: () => null };
  const event = { key: 'Enter', target, preventDefault() {}, stopPropagation() {} };
  app.handleGlobalKeyDown({ ...event, repeat: true });
  app.handleGlobalKeyDown({ ...event, defaultPrevented: true });
  app.handleGlobalKeyDown({ ...event, target: { tagName: 'BUTTON', closest: () => ({}) } });
  assert.equal(applied, 0);
  app.handleGlobalKeyDown(event);
  assert.equal(applied, 1);
});

test('opening and submitting a history search never changes daily records', () => {
  const rows = [{ name: '가상환자', chartNo: 'T001', memo: '보존' }];
  const { app } = createApp(rows);
  const before = JSON.stringify(rows);
  app.elSearchPromptModal = { style: {} };
  app.elSearchPromptInput = { value: '', focus() {}, select() {} };
  app.updateSearchPromptAutocomplete = app.closeSearchPromptAutocomplete = () => {};
  app.searchAllDates = () => {};
  app.findActiveCell();
  assert.equal(JSON.stringify(rows), before);
  app.submitSearchPrompt();
  assert.equal(JSON.stringify(rows), before);
});


test('selected cells outside chart/name open an empty focused prompt and clear old suggestions', () => {
  for (const colKey of ['no', 'gender', 'part', 'prescription', 'extra', 'writer', 'memo', 'specialNote', 'visitTime']) {
    const { app } = createApp([{ [colKey]: '가상 내용' }]);
    app.activeCell.colKey = colKey;
    app.elSearchInput.value = '이전 검색어';
    let focused = false, cleared = false;
    app.elSearchPromptModal = { style: {} };
    app.elSearchPromptInput = { value: '기존 입력', focus() { focused = true; }, select() {} };
    app.updateSearchPromptAutocomplete = () => { cleared = app.elSearchPromptInput.value === ''; };
    app.findActiveCell();
    assert.equal(app.elSearchPromptInput.value, '');
    assert.ok(focused && cleared);
    assert.equal(app.searchPromptTargetRowIdx, 0);
  }
});

test('history nonidentity cells also open an empty search prompt with the original daily target', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const { app } = createApp([{ name: '가상환자' }]);
    app.crossDateResults = [{ memo: '검색에 넣지 않을 문구' }];
    app.crossDateSelection = { endRow: 0, endCol: 8 };
    let prompt;
    app.openSearchPromptModal = (...args) => { prompt = args; };
    app.searchAllDates = () => assert.fail('must open empty prompt');
    app.handleGlobalKeyDown({ key: 'f', [modifier]: true, target: { tagName: 'DIV' }, preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(prompt, [0, '']);
  }
});

test('a transparent armed chart/name input is a selected cell, not an active editor', () => {
  for (const colKey of ['name', 'chartNo']) {
    const { app } = createApp([{ name: '가상환자', chartNo: 'T001' }]);
    app.activeCell.colKey = colKey;
    let prompt;
    app.openSearchPromptModal = (...args) => { prompt = args; };
    app.searchAllDates = () => { assert.fail('armed input must open a prompt'); };
    const input = { tagName: 'INPUT', value: '가상환자', closest: () => ({}), classList: { contains: name => name === 'is-armed' } };
    app.handleGlobalKeyDown({ key: 'f', metaKey: true, target: input, preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(prompt, [0, app.getCurrentRows()[0][colKey]]);
  }
});


test('a fresh plain history Enter applies even if the previous search keyup was lost', () => {
  const { app } = createApp([{ name: '가상환자', chartNo: 'T001' }]);
  app.crossDateSelection = { minRow: 0 };
  app.crossDateResults = [{ name: '가상환자', chartNo: 'T001', part: '이전 내역' }];
  let applied = 0;
  app.applyHistoryRow = () => { applied++; };
  const enter = { key: 'Enter', target: { tagName: 'DIV', closest: () => null }, preventDefault() {}, stopPropagation() {} };
  for (const searchKey of ['f', 'enter']) {
    app.historyApplyBlockedKey = searchKey;
    app.handleGlobalKeyDown({ ...enter, repeat: true });
    const before = applied;
    app.handleGlobalKeyDown(enter);
    assert.equal(applied, before + 1);
    assert.equal(app.historyApplyBlockedKey, null);
  }
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) app.handleGlobalKeyDown({ ...enter, [modifier]: true });
  assert.equal(applied, 2);
  app.handleGlobalKeyDown(enter);
  assert.equal(applied, 3);
});


test('horizontal arrows collapse a one-row range to the requested edge in daily and history tables', () => {
  for (const history of [false, true]) for (const key of ['ArrowLeft', 'ArrowRight']) for (const startFromRight of [false, true]) {
    const { app } = createApp([{}]);
    const range = { minRow: 0, maxRow: 0, minCol: 2, maxCol: 9, startCol: startFromRight ? 9 : 2, endCol: startFromRight ? 2 : 9 };
    if (history) app.crossDateSelection = range;
    else app.selectedRange = range;
    const cell = { scrollIntoView() {} };
    app.elTableBody = { querySelector: () => cell, querySelectorAll: () => [] };
    let selected;
    app.selectCell = (row, col) => { selected = [row, col]; };
    app.selectCrossDateCell = (row, col) => { selected = [row, col]; };
    const handled = app.collapseSelectedRowToEdge({ key, preventDefault() {}, stopPropagation() {} });
    assert.equal(handled, true);
    assert.deepEqual(selected, [0, history ? (key === 'ArrowLeft' ? 2 : 9) : (key === 'ArrowLeft' ? 'chartNo' : 'specialNote')]);
  }
});

test('Ctrl/Cmd+Shift+Left collapses the extended range while ordinary Shift+arrows keep extending', () => {
  for (const history of [false, true]) for (const modifier of ['ctrlKey', 'metaKey']) {
    const { app } = createApp([{}]);
    const range = { minRow: 0, maxRow: 0, minCol: 2, maxCol: 5 };
    if (history) app.crossDateSelection = range;
    else app.selectedRange = range;
    app.elTableBody = { querySelector: () => ({ scrollIntoView() {} }), querySelectorAll: () => [] };
    let selected;
    app.selectCell = (row, col) => { selected = [row, col]; };
    app.selectCrossDateCell = (row, col) => { selected = [row, col]; };
    const event = { key: 'ArrowLeft', shiftKey: true, preventDefault() {}, stopPropagation() {} };
    assert.equal(app.collapseSelectedRowToEdge(event), false);
    assert.equal(app.collapseSelectedRowToEdge({ ...event, [modifier]: true }), true);
    assert.deepEqual(selected, [0, history ? 2 : 'chartNo']);
    range.maxRow = 1;
    assert.equal(app.collapseSelectedRowToEdge({ ...event, shiftKey: false }), false);
  }
});


test('search prompt lists only names for a name query and only chart numbers for a chart query', () => {
  const { app } = createApp();
  app.getSearchDataStore = () => ({
    [app.currentDate]: [{ name: '임수영', chartNo: '11650' }, { name: '임수민', chartNo: '12323' }],
    '2026-10-01': [{ name: '임수영', chartNo: '14252' }, { name: '임수정', chartNo: '14081' }],
  });
  assert.deepEqual(Array.from(app.getSearchPromptSuggestions('임수'), item => item.value), ['임수영', '임수민', '임수정']);
  assert.deepEqual(Array.from(app.getSearchPromptSuggestions('14'), item => item.value), ['14252', '14081']);
  app.getSearchDataStore = () => ({ [app.currentDate]: [{ name: '가상환자', chartNo: 'T001' }] });
  assert.deepEqual(Array.from(app.getSearchPromptSuggestions('T00'), item => item.value), ['T001']);
});


test('apply button moves selection to No. on the actual destination row', () => {
  for (const match of [true, false]) {
    const rows = [{ name: match ? '가상환자' : '다른환자', chartNo: match ? 'T001' : 'OTHER' }, {}, {}];
    const { app } = createApp(rows);
    let restored;
    app.restoreAppliedHistorySelection = target => { restored = target; };
    app.applyHistoryRow({ name: '가상환자', chartNo: 'T001', part: '목' }, { focusAppliedRow: true });
    const expected = match ? 0 : 1;
    assert.equal(restored.rowIdx, expected);
    assert.equal(restored.row, rows[expected]);
  }
});


test('the first physical Ctrl/Cmd+F searches a composing editor and releases its apply guard on Korean keyup', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const { app } = createApp([{ name: '가상환자' }]);
    const searches = [];
    app.dataStore = {'2026-10-03':[{name:'확정된이름'}]};
    app.searchAllDates = (...args) => searches.push(args);
    const row = { dataset: { rowIdx: '0' }, classList: { add() {} } };
    const input = { tagName: 'INPUT', value: '가상환자', closest: selector => selector === '.excel-row' ? row : {},
      blur() { this.value = '확정된이름'; } };
    const event = { key: 'ㄹ', code: 'KeyF', keyCode: 229, isComposing: true, [modifier]: true,
      target: input, preventDefault() {}, stopPropagation() {} };
    assert.ok(app.isSearchShortcut(event));
    app.handleGlobalKeyDown(event);
    assert.equal(searches.length, 1);
    assert.deepEqual(searches[0], ['확정된이름', 0]);
    assert.equal(app.historyApplyBlockedKey, 'f');
    app.releaseHistorySearchKey({ key: 'ㄹ', code: 'KeyF' });
    assert.equal(app.historyApplyBlockedKey, null);
    assert.equal(app.isSearchShortcut({ ...event, ctrlKey: false, metaKey: false }), false);
    assert.equal(app.isSearchShortcut({ ...event, altKey: true }), false);
  }
});


test('Ctrl/Cmd+A selects the cell row exactly like its current/history row header, including live IME editors', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) for (const history of [false, true]) {
    const { app } = createApp();
    let selected;
    app.selectEntireRow = row => { selected = ['current', row]; };
    app.selectCrossDateRow = row => { selected = ['history', row]; };
    app.crossDateSelection = history ? { endRow: 4 } : null;
    app.activeCell = history ? null : { rowIdx: 3, colKey: 'memo' };
    const cell = { dataset: history ? { crossIdx: '4' } : { row: '3' } };
    const event = { key: 'ㅁ', code: 'KeyA', keyCode: 229, isComposing: true, [modifier]: true,
      target: { tagName: 'INPUT', closest: () => cell }, preventDefault() {}, stopPropagation() {} };
    app.handleGlobalKeyDown(event);
    assert.deepEqual(selected, [history ? 'history' : 'current', history ? 4 : 3]);
    // A selected cell with sheet focus uses the same row, and repeated presses stay on that row.
    selected = null;
    app.handleGlobalKeyDown({ ...event, key: 'a', target: { tagName: 'DIV', closest: () => null } });
    assert.deepEqual(selected, [history ? 'history' : 'current', history ? 4 : 3]);
  }
});

test('Ctrl/Cmd+A leaves search and other external input text selection intact', () => {
  const { app } = createApp();
  app.selectEntireRow = () => assert.fail('must not select a row from an external input');
  app.selectCrossDateRow = () => assert.fail('must not select history from an external input');
  const event = { key: 'a', ctrlKey: true, target: { closest: () => null, matches: () => true },
    preventDefault: () => assert.fail('must preserve native text selection'), stopPropagation() {} };
  assert.equal(app.handleCellRowSelectShortcut(event), false);
  assert.equal(app.handleCellRowSelectShortcut({ ...event, altKey: true }), false);
});


test('history applies to the selected name-only row and fills its chart instead of appending', () => {
  for (const chartNo of ['', 'OLD']) {
    const rows = [{ name: '보존환자', chartNo: 'X' }, { name: '김선', chartNo, part: '수정 전' }, {}];
    const { app } = createApp(rows);
    app.historyApplyTarget = { date: app.currentDate, rows, row: rows[1], rowIdx: 1, colKey: 'name' };
    app.applyHistoryRow({ name: '김선', chartNo: 'T001', part: '목' });
    assert.equal(rows[1].part, '목');
    assert.equal(rows[1].chartNo, 'T001');
    assert.equal(rows[0].name, '보존환자');
    assert.equal(rows[2].name, undefined);
    assert.equal(app.lastHistoryAppliedTarget.rowIdx, 1);
  }
});

test('history can populate a chart-only target but does not overwrite a different named patient', () => {
  const rows = [{ name: '', chartNo: 'T001' }, { name: '다른환자', chartNo: 'T001' }, {}];
  const { app } = createApp(rows);
  assert.equal(app.getHistoryDestinationIndex({ name: '김선', chartNo: 'T001' }, 0), 0);
  assert.equal(app.getHistoryDestinationIndex({ name: '김선', chartNo: 'T001' }, 1), 2);
});


test('Ctrl/Cmd+A daily row selection ends at specialNote, while direct row selection still includes visitTime', () => {
  const { app, context } = createApp([{}]);
  context.window.getSelection = () => ({ removeAllRanges() {} });
  context.document.querySelector = () => null;
  app.elCellAddress = {}; app.elSelectedCellCoords = {}; app.elFormulaInput = {};
  app.selectEntireRow(0);
  assert.equal(app.selectedRange.minCol, 0);
  assert.equal(app.selectedRange.maxCol, 9);
  app.selectRowRange(0, 0);
  assert.equal(app.selectedRange.maxCol, 10);
});


test('history Enter uses the same Apply button even with focus in the read-only formula and Korean/numpad key reports', () => {
  for (const key of [{ key: 'Enter' }, { key: 'Process', code: 'Enter', keyCode: 229 }, { key: 'Enter', code: 'NumpadEnter' }]) {
    const { app } = createApp();
    app.crossDateSelection = { minRow: 2 };
    app.crossDateResults = [{}, {}, { name: '가상환자' }];
    let clicks = 0;
    app.elTableBody.querySelector = selector => { assert.equal(selector, '.cross-date-row[data-cross-idx="2"] .history-apply-btn'); return { click() { clicks++; } }; };
    app.elFormulaInput = { tagName: 'INPUT', matches: () => true, closest: () => null };
    app.applyHistoryRow = () => assert.fail('must use the actual Apply button');
    const event = { ...key, target: app.elFormulaInput, preventDefault() {}, stopPropagation() {} };
    app.handleGlobalKeyDown(event);
    assert.equal(clicks, 1);
    app.handleGlobalKeyDown({ ...event, repeat: true });
    assert.equal(clicks, 1);
  }
});


test('row selection Ctrl/Cmd+Left/Right collapses to No./specialNote in the same current or history row', () => {
  for (const history of [false, true]) for (const modifier of ['ctrlKey', 'metaKey']) {
    for (const [key, col, colKey] of [['ArrowLeft', 0, 'no'], ['ArrowRight', 9, 'specialNote']]) {
      for (const lastCol of [9, 10]) {
        const { app } = createApp([{}, {}, { gender: 'F', name: '가상환자', visitTime: '10:00' }]);
        app.activeCell = null;
        let selected, prevented = 0;
        app.elTableBody.querySelector = () => ({ scrollIntoView() {} });
        app.navigateCell = (row, key) => { selected = ['current', row, key]; };
        app.selectCrossDateCell = (row, column, extend) => { selected = ['history', row, column, extend]; };
        if (history) {
          app.crossDateResults = [{}, {}, { gender: 'F', name: '가상환자' }];
          app.crossDateSelection = { startRow: 2, endRow: 2, minRow: 2, maxRow: 2, minCol: 0, maxCol: 9, endCol: 9 };
          app.isCrossDateRowSelected = true;
        } else {
          app.selectedRowRange = { minRow: 2, maxRow: 2 };
          app.rowRangeEnd = 2;
          app.selectedRange = { minRow: 2, maxRow: 2, minCol: 0, maxCol: lastCol };
          // A stale history selection flag must not affect daily navigation.
          app.isCrossDateRowSelected = true;
        }
        app.handleGlobalKeyDown({ key, [modifier]: true, target: { tagName: 'DIV' }, preventDefault() { prevented++; } });
        assert.deepEqual(selected, history ? ['history', 2, col, false] : ['current', 2, colKey]);
        assert.equal(prevented, 1);
      }
    }
  }
});


test('the Enter opening search cannot also apply history before its key release', () => {
  const { app } = createApp([{}]);
  app.crossDateSelection = {minRow:0};
  app.crossDateResults = [{name:'가상환자'}];
  app.historyApplyBlockedKey = 'enter';
  app.historySearchEnterAt = Date.now();
  let applied = 0;
  app.applyHistoryRow = () => { applied++; };
  const event = {key:'Enter', target:{tagName:'DIV',closest:()=>null}, preventDefault(){},stopPropagation(){}};
  app.handleGlobalKeyDown(event);
  app.handleGlobalKeyDown({...event,repeat:true});
  assert.equal(applied,0);
  app.releaseHistorySearchKey({key:'Enter'});
  app.handleGlobalKeyDown(event);
  assert.equal(applied,1);
  app.handleHistoryApplyShortcut({...event,defaultPrevented:true});
  assert.equal(applied,1);
});


test('search Enter preserves the typed exact name instead of accepting a highlighted longer name', async () => {
  const { app, context } = createApp([{name:'이연'}]);
  app.dataStore = {'2026-10-04':[{name:'이연'}], '2026-09-28':[{name:'이연진'}]};
  app.searchPromptTargetRowIdx = 0;
  app.elSearchPromptInput = {value:'이연',focus(){},select(){}};
  app._searchPromptACMenu = {querySelector:()=>({querySelector:()=>({textContent:'이연진'})})};
  let searched, closed = 0, message;
  app.closeSearchPromptModal = () => { closed++; };
  app.searchAllDates = (...args) => { searched = args; };
  context.alert = text => { message = text; };
  await app.submitSearchPrompt();
  assert.equal(message,'해당 이름이 존재하지 않습니다.');
  assert.equal(app.elSearchPromptInput.value,'이연');
  assert.equal(searched,undefined);
  assert.equal(closed,0);
  app.dataStore['2026-09-27'] = [{name:'이연'}];
  await app.submitSearchPrompt();
  assert.deepEqual(searched,['이연',0]);
  assert.equal(closed,1);
});

test('explicitly selected names, cloud-only exact names and chart search remain usable', async () => {
  const {app,context} = createApp([{}]);
  app.searchPromptTargetRowIdx = 0;
  app.elSearchPromptInput = {value:'이연',focus(){},select(){}};
  app._searchPromptACExplicit = true;
  app._searchPromptACMenu = {querySelector:()=>({querySelector:()=>({textContent:'이연진'})})};
  app.supabaseClient = {};
  app.loadSearchHistory = async () => {app.cloudSearchHistory={'2026-09-28':[{name:'이연진',chartNo:'15889'}]};};
  app.closeSearchPromptModal = () => {};
  const searches = [];
  app.searchAllDates = (...args) => searches.push(args);
  context.alert = () => assert.fail('known name and chart search must not report missing name');
  await app.submitSearchPrompt();
  assert.deepEqual(searches[0],['이연진',0]);
  app._searchPromptACExplicit = false;
  app.elSearchPromptInput.value = '15889';
  await app.submitSearchPrompt();
  assert.deepEqual(searches[1],['15889',0]);
});


test('direct cell name search also rejects a nonexistent exact name without changing rows', async () => {
  const rows = [{name:'이연'}];
  const {app,context} = createApp(rows);
  app.dataStore={'2026-10-04':rows,'2026-09-28':[{name:'이연진'}]};
  let message, searched=false;
  context.alert = text => {message=text;};
  app.searchAllDates = () => {searched=true;};
  const before=JSON.stringify(rows);
  assert.equal(await app.searchPatientHistory('이연',0),false);
  assert.equal(message,'해당 이름이 존재하지 않습니다.');
  assert.equal(searched,false);
  assert.equal(JSON.stringify(rows),before);
});
