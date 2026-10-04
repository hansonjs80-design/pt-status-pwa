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
  const header = { getBoundingClientRect: () => ({ height: headerHeight }) };
  context.document.querySelector = () => master;
  context.document.getElementById = id => id === 'excelTable'
    ? { querySelector: () => header }
    : { querySelectorAll: () => [dividerCell] };
  app.updateCrossDateStickyOffsets();
  assert.equal(master.style.top, '51px');
  assert.equal(dividerCell.style.top, '416px');
  headerHeight = 58; panelHeight = 112;
  app.updateCrossDateStickyOffsets();
  assert.equal(master.style.top, '58px');
  assert.equal(dividerCell.style.top, '170px');
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


test('selected nonediting cells also open a prompt instead of searching directly', () => {
  const { app } = createApp([{ part: '가상 부위' }]);
  app.activeCell.colKey = 'part';
  let prompt;
  app.openSearchPromptModal = (...args) => { prompt = args; };
  app.searchAllDates = () => { assert.fail('selection must not search directly'); };
  app.findActiveCell();
  assert.deepEqual(prompt, [0, '가상 부위']);
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


test('history only applies after the search key is released and a fresh plain Enter is pressed', () => {
  const { app } = createApp([{ name: '가상환자', chartNo: 'T001' }]);
  app.crossDateSelection = { minRow: 0 };
  app.crossDateResults = [{ name: '가상환자', chartNo: 'T001', part: '이전 내역' }];
  let applied = 0;
  app.applyHistoryRow = () => { applied++; };
  const enter = { key: 'Enter', target: { tagName: 'DIV', closest: () => null }, preventDefault() {}, stopPropagation() {} };
  for (const searchKey of ['f', 'enter']) {
    app.historyApplyBlockedKey = searchKey;
    app.handleGlobalKeyDown(enter);
    assert.equal(applied, 0);
    app.releaseHistorySearchKey({ key: searchKey });
  }
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) app.handleGlobalKeyDown({ ...enter, [modifier]: true });
  assert.equal(applied, 0);
  app.handleGlobalKeyDown(enter);
  assert.equal(applied, 1);
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
