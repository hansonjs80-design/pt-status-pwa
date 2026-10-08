const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function createApp(rows = []) {
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { activeElement: null, querySelectorAll: () => [], getElementById: () => null },
    setTimeout: fn => fn(), clearTimeout, alert() {},
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
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

test('history range paste hands all four arrows to the pasted current-date cells', async () => {
  const rows = Array.from({ length: 10 }, () => ({}));
  const { app } = createApp(rows);
  const source = { startRow: 0, endRow: 1, minRow: 0, maxRow: 1, startCol: 3, endCol: 4, minCol: 3, maxCol: 4 };
  app.crossDateSelection = source;
  app.crossDateResults = [{ name: '복사환자' }, { name: '다음환자' }];
  app.elSearchInput.value = '복사환자';
  app.activeCell = { rowIdx: 4, colKey: 'name' };
  app.selectedRange = null;
  app.clipboardBuffer = '복사환자\t목\n다음환자\t허리';
  app.clipboardSelection = { ...source, kind: 'history' };
  app.elTableBody = { querySelector: () => ({}), querySelectorAll: () => [] };
  app.elSheetContainer.scrollTop = 240;
  app.renderClipboardSelection = () => {};
  let highlighted;
  app.renderCrossDateSelectionHighlight = () => { highlighted = app.crossDateSelection; };
  app.selectCell = (rowIdx, colKey) => { app.activeCell = { rowIdx, colKey }; };
  app.updateRangeSelection = () => {
    app.selectedRange = { minRow: 4, maxRow: 5, minCol: 3, maxCol: 4 };
  };
  app.ensureCurrentCellVisible = () => {};
  await app.pasteSelection(app.clipboardBuffer);
  assert.equal(rows[4].name, '복사환자');
  assert.equal(rows[5].part, '허리');
  assert.deepEqual(JSON.parse(JSON.stringify(highlighted)), source);
  assert.equal(app.crossDateSelection, null);
  assert.equal(app.elSheetContainer.scrollTop, 240);
  for (const [key, rowIdx, colKey] of [
    ['ArrowDown', 5, 'name'], ['ArrowUp', 4, 'name'],
    ['ArrowRight', 4, 'part'], ['ArrowLeft', 4, 'name'],
  ]) {
    app.handleGlobalKeyDown({ key, target: { tagName: 'DIV', closest: () => null }, preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(app.activeCell, { rowIdx, colKey });
    assert.equal(app.crossDateSelection, null);
  }
});

test('holding Left moves the current cell through every column to No. and Right repeats still work', () => {
  const { app, context } = createApp([{}, {}, {}]);
  context.document.querySelector = () => null;
  const keys = ['no', 'gender', 'chartNo', 'name', 'part', 'prescription', 'extra', 'writer', 'memo', 'specialNote'];
  app.activeCell = { rowIdx: 1, colKey: 'specialNote' };
  app.elTableBody = { querySelector: () => ({}) };
  app.selectCell = (rowIdx, colKey) => { app.activeCell = { rowIdx, colKey }; };
  app.ensureCurrentCellVisible = () => {};
  const target = { tagName: 'DIV', closest: () => null };
  for (let i = 0; i < 12; i++) {
    app.handleGlobalKeyDown({ key: 'ArrowLeft', code: 'ArrowLeft', repeat: i > 0, target, preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(app.activeCell, { rowIdx: 1, colKey: keys[Math.max(0, 8 - i)] });
  }
  for (let i = 0; i < 9; i++) {
    app.handleGlobalKeyDown({ key: 'ArrowRight', code: 'ArrowRight', repeat: i > 0, target, preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(app.activeCell, { rowIdx: 1, colKey: keys[i + 1] });
  }
});

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

test('history Ctrl/Cmd+Down after copy or cut ignores prepared writer rows and selects the last patient', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) for (const cut of [false, true]) {
    const rows = [{ name: '첫 환자' }, {}, { chartNo: 'LAST' }, { writer: 'J' }, { writer: 'S', memo: '미리 입력' }];
    const { app } = createApp(rows);
    app.crossDateSelection = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 9 };
    app.clipboardSelection = { date: '2026-10-03', minRow: 0, maxRow: 0, minCol: 0, maxCol: 9 };
    app.pendingCut = cut ? { date: '2026-10-03', cells: [] } : null;
    let selected, scrolled = 0;
    app.selectCell = (rowIdx, colKey) => { selected = { rowIdx, colKey }; };
    app.elTableBody.querySelector = () => ({ closest: () => ({ style: {} }), scrollIntoView() { scrolled++; } });
    app.handleGlobalKeyDown({ key: 'ArrowDown', [modifier]: true, target: { tagName: 'DIV' }, preventDefault() {} });
    assert.deepEqual(selected, { rowIdx: 2, colKey: 'no' });
    assert.equal(scrolled, 1);
    assert.equal(Boolean(app.pendingCut), cut);
    rows[2] = { writer: 'K' };
    app.jumpToLastRecord();
    assert.deepEqual(selected, { rowIdx: 0, colKey: 'no' });
  }
});

test('selected chart/name opens prefilled prompt with all text selected, including an empty cell', () => {
  for (const colKey of ['name', 'chartNo']) for (const value of ['가상환자', '']) {
    const { app } = createApp([{ [colKey]: value }]);
    app.activeCell.colKey = colKey;
    let selected = false, focused = false;
    app.elSearchPromptModal = { style: {}, querySelector: () => null };
    app.elSearchPromptInput = { value: 'old', focus() { focused = true; }, select() { selected = true; } };
    app.closeSearchPromptAutocomplete = () => {};
    app.elSearchInput.value = 'old query';
    app.findActiveCell();
    assert.equal(app.elSearchPromptModal.style.display, 'flex');
    assert.equal(app.elSearchPromptInput.value, value);
    assert.equal(app.searchPromptTargetRowIdx, 0);
    assert.ok(selected && focused);
  }
});

test('Ctrl/Cmd+Up selects the newest history row in full from either a daily cell or row selection', () => {
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
    assert.deepEqual(selected, ['history-row', 1]);
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

test('chart/name live and formula editors route Ctrl/Cmd+F directly before other selection shortcuts', () => {
  for (const colKey of ['chartNo', 'name']) for (const formula of [false, true]) for (const modifier of ['ctrlKey', 'metaKey']) {
    const { app } = createApp([{ name: '가상환자', chartNo: 'T001' }]);
    app.activeCell = { rowIdx: 0, colKey };
    const cell = { dataset: { row: '0', col: colKey } };
    const input = { tagName: 'INPUT', value: colKey === 'name' ? '가상환자' : 'T001',
      closest: () => formula ? null : cell, blur() {} };
    if (formula) app.elFormulaInput = input;
    let searched;
    app.searchPatientHistory = (...args) => { searched = args; };
    app.openSearchPromptModal = () => assert.fail('live editors must skip the prompt');
    app.handleCellRowSelectShortcut = () => assert.fail('search must run before selection shortcuts');
    app.handleGlobalKeyDown({ key: 'ㄹ', code: 'KeyF', isComposing: true, [modifier]: true,
      target: input, preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(searched, [input.value, 0]);
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

test('exiting history without applying restores the original cell, or the last patient name when unselected', () => {
  for (const original of [true, false]) {
    const rows = [{ name: '첫 환자' }, { chartNo: 'LAST' }, { writer: 'J' }];
    const { app } = createApp(rows);
    app.activeCell = original ? { rowIdx: 0, colKey: 'part' } : null;
    app.captureHistoryOriginSelection();
    app.activeCell = null;
    app.elBtnClearSearch = { style: {} };
    app.clearCrossDateRows = () => {};
    app.historyApplyTarget = null;
    let selected;
    const cell = { scrollIntoView() {} };
    app.elTableBody.querySelector = () => cell;
    app.selectCell = (...args) => { selected = args; };
    app.handleSearch();
    assert.deepEqual(selected, [original ? 0 : 1, original ? 'part' : 'name', cell, false]);
    assert.equal(app.historyOriginSelection, undefined);
  }
});

test('Escape exits history without clearing the restored selection again', () => {
  const { app } = createApp([{ name: '원래 환자' }]);
  app.activeCell = null;
  app.elSearchInput.value = '검색';
  app.crossDateSelection = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 9 };
  for (const key of ['closeAutocompleteMenu', 'closeGenderDropdown', 'hideContextMenu', 'renderClipboardSelection']) app[key] = () => {};
  app.handleSearch = () => { app.activeCell = { rowIdx: 0, colKey: 'name' }; };
  app.handleGlobalKeyDown({ key: 'Escape', target: { tagName: 'DIV' }, preventDefault() {} });
  assert.equal(app.elSearchInput.value, '');
  assert.deepEqual(app.activeCell, { rowIdx: 0, colKey: 'name' });
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
  app.elSearchPromptModal = { style: {}, querySelector: () => null };
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
    app.elSearchPromptModal = { style: {}, querySelector: () => null };
    app.elSearchPromptInput = { value: '기존 입력', focus() { focused = true; }, select() {} };
    app.closeSearchPromptAutocomplete = () => { cleared = app.elSearchPromptInput.value === ''; };
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
    let restored, searched;
    app.elSearchInput.value = '가상환자';
    app.searchAllDates = (...args) => { searched = args; };
    app.restoreAppliedHistorySelection = target => { restored = target; };
    app.applyHistoryRow({ name: '가상환자', chartNo: 'T001', part: '목' }, { focusAppliedRow: true });
    const expected = match ? 0 : 1;
    assert.equal(restored.rowIdx, expected);
    assert.equal(restored.row, rows[expected]);
    assert.deepEqual(searched.slice(0, 2), ['가상환자', expected]);
    assert.equal(searched[2].scrollToAppliedRow, true);
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

test('history appends after the last patient identity despite prepared initials and notes below it', () => {
  const rows = Array.from({ length: 80 }, (_, index) => ({ writer: index >= 50 ? 'J' : '' }));
  rows[0] = { name: '첫 환자' };
  rows[49] = { chartNo: 'LAST' };
  rows[69].memo = '미리 입력';
  rows[79].visitTime = '09:00';
  const { app } = createApp(rows);
  const source = { name: '새 환자', chartNo: 'NEW', part: '허리', writer: 'K' };
  assert.equal(app.getHistoryDestinationIndex(source, 69), 50);
  app.applyHistoryRow(source);
  assert.equal(rows[50].name, '새 환자');
  assert.equal(rows[50].chartNo, 'NEW');
  assert.equal(rows[50].writer, 'K');
  assert.equal(rows[69].writer, 'J');
  assert.equal(rows[69].memo, '미리 입력');
  assert.equal(app.lastHistoryAppliedTarget.rowIdx, 50);
});

test('history starts at the first row when only initials have been prepared', () => {
  const { app } = createApp([{ writer: 'J' }, { writer: 'K', part: '허리' }, { writer: 'S' }]);
  assert.equal(app.getHistoryDestinationIndex({ name: '새 환자', chartNo: 'NEW' }, 2), 0);
});


test('daily row selections end at specialNote and exclude the hidden visitTime column', () => {
  const { app, context } = createApp([{}]);
  context.window.getSelection = () => ({ removeAllRanges() {} });
  context.document.querySelector = () => null;
  app.elCellAddress = {}; app.elSelectedCellCoords = {}; app.elFormulaInput = {};
  app.elTableBody.querySelectorAll=()=>[];
  app.selectEntireRow(0);
  assert.equal(app.selectedRange.minCol, 0);
  assert.equal(app.selectedRange.maxCol, 9);
  app.selectRowRange(0, 0);
  assert.equal(app.selectedRange.maxCol, 9);
  app.selectRowRange(0, 0, 10);
  assert.equal(app.selectedRange.maxCol, 9);
});

test('Tab navigation skips hidden visitTime when wrapping at specialNote', () => {
  const {app, context} = createApp([{}, {}]);
  context.document.querySelector = () => ({});
  let selected;
  app.selectCell = (row, col) => {selected = [row, col];};
  app.navigateCol(0, 'specialNote', 1);
  assert.deepEqual(selected, [1, 'no']);
  app.navigateCol(1, 'no', -1);
  assert.deepEqual(selected, [0, 'specialNote']);
});

test('search autocomplete puts the typed value first and omits matching duplicates', () => {
  const {app} = createApp();
  app.getSearchPromptSuggestions = () => [{value:'이연진',name:'이연진'}, {value:'이연',name:'이연'}];
  assert.deepEqual(JSON.parse(JSON.stringify(app.getSearchPromptAutocompleteItems('이연'))),
    [{value:'이연',typed:true}, {value:'이연진',name:'이연진'}]);
  assert.equal(app.getSearchPromptAutocompleteItems('')[0], undefined);
  app.getSearchPromptSuggestions = () => [];
  assert.equal(app.getSearchPromptAutocompleteItems('없는이름')[0].value, '없는이름');
});

test('search autocomplete keeps input focus and selects the typed first item until arrows choose a candidate', async () => {
  const {app} = createApp([{}]);
  app.dataStore = {'2026-10-04':[{}], '2026-09-28':[{name:'이연진'}]};
  app.searchPromptTargetRowIdx = 0;
  app.elSearchPromptInput = {value:'이연',setAttribute(){}};
  app._searchPromptACSuggestions = [{value:'이연',typed:true},{value:'이연진'}];
  app._searchPromptACIndex = 0;
  const selected = new Set();
  app._searchPromptACMenu = {querySelectorAll: () => [0,1].map(index => ({id:`option${index}`,
    classList:{toggle: (_, value) => value ? selected.add(index) : selected.delete(index)},
    setAttribute(){},scrollIntoView(){}}))};
  app.moveSearchPromptAutocompleteSelection(0);
  assert.deepEqual([...selected], [0]);
  assert.equal(app._searchPromptACExplicit, false);
  app.moveSearchPromptAutocompleteSelection(1);
  assert.deepEqual([...selected], [1]);
  assert.equal(app.elSearchPromptInput.value, '이연', 'arrow navigation does not replace the live input');
  let searched;
  app.closeSearchPromptModal = () => {};
  app.searchAllDates = query => {searched=query;};
  await app.submitSearchPrompt();
  assert.equal(searched, '이연진');
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
  app.searchPromptCellName = '이연';
  app.elSearchPromptInput = {value:'이연',focus(){},select(){}};
  app._searchPromptACMenu = {querySelector:()=>({querySelector:()=>({textContent:'이연진'})})};
  let searched, closed = 0, message;
  app.closeSearchPromptModal = () => { closed++; };
  app.searchAllDates = (...args) => { searched = args; };
  context.alert = text => { message = text; };
  await app.submitSearchPrompt();
  assert.equal(message,'해당 챠트번호/성함이 내역에 없습니다.');
  assert.equal(app.elSearchPromptInput.value,'이연');
  assert.equal(searched,undefined);
  assert.equal(closed,1);
  app.dataStore['2026-09-27'] = [{name:'이연'}];
  await app.submitSearchPrompt();
  assert.deepEqual(JSON.parse(JSON.stringify(searched)),['이연',0,{focusCurrentTarget:true}]);
  assert.equal(closed,2);
});

test('one-year-plus missing name refreshes cached history before reporting not found', async () => {
  const { app, context } = createApp([{}]);
  app.dataStore = {};
  app.supabaseClient = {};
  app.getSearchPeriod = () => '1year_plus';
  app.searchPromptTargetRowIdx = 0;
  app.elSearchPromptInput = { value: '양명자' };
  const loads = [];
  app.loadSearchHistory = async force => {
    loads.push(Boolean(force));
    if (force) app.cloudSearchHistory = { '2025-09-09': [{ name: '양명자' }] };
  };
  app.closeSearchPromptModal = () => {};
  let searched;
  app.searchAllDates = query => { searched = query; };
  context.alert = () => assert.fail('refreshed previous-year name must be found');
  await app.submitSearchPrompt();
  assert.deepEqual(loads, [false, true]);
  assert.equal(searched, '양명자');
});

test('cloud-only exact names and chart search remain usable', async () => {
  const {app,context} = createApp([{}]);
  app.searchPromptTargetRowIdx = 0;
  app.elSearchPromptInput = {value:'이연진',focus(){},select(){}};
  app._searchPromptACExplicit = true;
  app._searchPromptACMenu = {querySelector:()=>({querySelector:()=>({textContent:'이연진'})})};
  app.supabaseClient = {};
  app.loadSearchHistory = async () => {app.cloudSearchHistory={'2026-09-28':[{name:'이연진',chartNo:'15889'}]};};
  app.closeSearchPromptModal = () => {};
  const searches = [];
  app.searchAllDates = (...args) => searches.push(args);
  context.alert = () => assert.fail('known name and chart search must not report missing name');
  await app.submitSearchPrompt();
  assert.deepEqual(JSON.parse(JSON.stringify(searches[0])),['이연진',0,{focusCurrentTarget:false}]);
  app._searchPromptACExplicit = false;
  app._searchPromptACMenu = null;
  app.elSearchPromptInput.value = '15889';
  await app.submitSearchPrompt();
  assert.deepEqual(JSON.parse(JSON.stringify(searches[1])),['15889',0,{focusCurrentTarget:false}]);
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
  assert.equal(message,'해당 챠트번호/성함이 내역에 없습니다.');
  assert.equal(searched,false);
  assert.equal(JSON.stringify(rows),before);
});


test('missing typed names and chart numbers close the search popup after the alert without changing records', async () => {
  for (const query of ['이연', '99999']) {
    const {app,context}=createApp([{name:'다른환자'}]);
    app.dataStore={'2026-09-28':[{name:'이연진',chartNo:'15889'}]};
    app.elSearchPromptInput={value:query};
    app.searchPromptTargetRowIdx=0;
    const before=JSON.stringify(app.dataStore), events=[];
    app.closeSearchPromptModal=()=>events.push('closed');
    app.searchAllDates=()=>assert.fail('missing identity must not open results');
    context.alert=message=>events.push(message);
    await app.submitSearchPrompt();
    assert.deepEqual(events,['해당 챠트번호/성함이 내역에 없습니다.','closed']);
    assert.equal(JSON.stringify(app.dataStore),before);
    assert.equal(app.searchPromptSubmitting,false);
  }
});

test('searchNotFoundModal opens with message and closes on Enter or Escape key', () => {
  const {app,context} = createApp([]);
  const modal = { style: { display: 'none' } };
  const msgEl = { textContent: '' };
  let focusedBtn = false;
  const btnClose = { focus() { focusedBtn = true; } };
  let searchInputFocused = false;
  app.elSearchInput = { focus() { searchInputFocused = true; } };

  const listeners = [];
  context.document.addEventListener = (type, fn) => { listeners.push({ type, fn }); };
  context.document.removeEventListener = (type, fn) => {
    const idx = listeners.findIndex(l => l.type === type && l.fn === fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
  context.document.dispatchEvent = (event) => {
    [...listeners].filter(l => l.type === 'keydown').forEach(l => l.fn(event));
  };

  context.document.getElementById = (id) => {
    if (id === 'searchNotFoundModal') return modal;
    if (id === 'searchNotFoundMessage') return msgEl;
    if (id === 'btnCloseSearchNotFound') return btnClose;
    return null;
  };

  // 1. Enter key closes modal
  app.showSearchNotFoundModal('해당 챠트번호/성함이 내역에 없습니다.');
  assert.equal(modal.style.display, 'flex');
  assert.equal(msgEl.textContent, '해당 챠트번호/성함이 내역에 없습니다.');
  assert.equal(focusedBtn, true);

  const enterEvent = { key: 'Enter', preventDefault() {}, stopPropagation() {} };
  context.document.dispatchEvent(enterEvent);
  assert.equal(modal.style.display, 'none');
  assert.equal(searchInputFocused, true);

  // 2. Escape key closes modal
  modal.style.display = 'none';
  searchInputFocused = false;
  app.showSearchNotFoundModal();
  assert.equal(modal.style.display, 'flex');

  const escEvent = { key: 'Escape', preventDefault() {}, stopPropagation() {} };
  context.document.dispatchEvent(escEvent);
  assert.equal(modal.style.display, 'none');
  assert.equal(searchInputFocused, true);
});


test('Escape ends a cell edit or armed selection without clearing its border, including history current rows', () => {
  for (const editing of [true,false]) {
    const {app}=createApp([{name:'입력값'}]);
    app.activeCell={rowIdx:0,colKey:'name'};
    app.elSearchInput.value=editing?'검색중':'';
    const cell={};
    app.elTableBody.querySelector=()=>cell;
    let selected,blurred=false,focused=false;
    app.selectCell=(rowIdx,colKey,element)=>{selected={rowIdx,colKey,element};};
    app.closeAutocompleteMenu=app.closeGenderDropdown=app.hideContextMenu=app.renderClipboardSelection=()=>{};
    app.elSheetContainer={focus(){focused=true;}};
    const target=editing?{tagName:'INPUT',closest:()=>cell,blur(){blurred=true;}}:app.elSheetContainer;
    let prevented=false;
    app.handleGlobalKeyDown({key:'Escape',target,preventDefault(){prevented=true;},stopPropagation(){}});
    assert.equal(selected.rowIdx,0);
    assert.equal(selected.colKey,'name');
    assert.equal(selected.element,cell);
    assert.equal(blurred,editing);
    assert.ok(prevented && focused);
    assert.equal(app.getCurrentRows()[0].name,'입력값');
    assert.equal(app.elSearchInput.value,editing?'검색중':'');
  }
});


test('Ctrl/Cmd+F in nonidentity live editors opens the empty patient popup without searching the cell text', () => {
  for (const modifier of ['ctrlKey','metaKey']) for(const colKey of ['no','gender','part','prescription','extra','writer','memo','specialNote','visitTime']) {
    const {app}=createApp([{[colKey]:'입력중인 내용'}]);
    app.activeCell={rowIdx:0,colKey};
    let opened,blurred=false;
    app.openSearchPromptModal=(...args)=>{opened=args;};
    app.searchAllDates=app.searchPatientHistory=()=>assert.fail('nonidentity cells must not search their text');
    const cell={dataset:{col:colKey,row:'0'}};
    const input={tagName:'INPUT',value:'입력중인 내용',classList:{contains:()=>false},closest:()=>cell,blur(){blurred=true;}};
    app.handleGlobalKeyDown({key:'f',[modifier]:true,target:input,preventDefault(){},stopPropagation(){}});
    assert.deepEqual(opened,[0,'']);
    assert.equal(blurred,true);
  }
});

test('current-cell navigation scrolls past pinned history headers only when obscured', () => {
  const {app}=createApp();
  let position={top:380,bottom:408};
  const cell={getBoundingClientRect:()=>position,scrollIntoView(){}};
  app.elSheetContainer={scrollTop:700,clientTop:0,clientHeight:900,
    getBoundingClientRect:()=>({top:100}),
    querySelectorAll:()=>[{getBoundingClientRect:()=>({top:100,bottom:130,height:30})},
      {getBoundingClientRect:()=>({top:640,bottom:670,height:30})}]};
  app.ensureCurrentCellVisible(cell);
  assert.equal(app.elSheetContainer.scrollTop,410);
  position={top:670,bottom:698};
  app.ensureCurrentCellVisible(cell);
  assert.equal(app.elSheetContainer.scrollTop,410);
  position={top:985,bottom:1013};
  app.ensureCurrentCellVisible(cell);
  assert.equal(app.elSheetContainer.scrollTop,423);
});

test('destination tint follows actual Apply destination or selected paste row without modifying records', () => {
  const rows=[{name:'가상환자',chartNo:'T1'},{name:'다른환자'},{}];
  const {app}=createApp(rows);
  const before=JSON.stringify(rows);
  const highlighted=new Set();
  const elements=rows.map((_,index)=>({dataset:{rowIdx:String(index)},
    classList:{add(){highlighted.add(index);},remove(){highlighted.delete(index);}},querySelector:()=>null}));
  app.elTableBody={querySelectorAll:()=>[...highlighted].map(index=>elements[index]),
    querySelector:selector=>elements[Number(selector.match(/data-row-idx="(\d+)"/)[1])]};
  app.elSearchInput.value='가상환자';
  app.activeCell=null;
  app.crossDateSelection={minRow:0};
  app.crossDateResults=[{name:'가상환자',chartNo:'T1'}];
  app.updateHistoryDestinationHighlight();
  assert.deepEqual([...highlighted],[0]);
  app.updateHistoryDestinationHighlight({name:'새환자',chartNo:'NEW'});
  assert.deepEqual([...highlighted],[2]);
  app.crossDateSelection=null;
  app.activeCell={rowIdx:1,colKey:'memo'};
  app.updateHistoryDestinationHighlight();
  assert.deepEqual([...highlighted],[1]);
  app.activeCell=null;
  app.selectedRange={minRow:1,maxRow:2};
  app.updateHistoryDestinationHighlight();
  assert.deepEqual([...highlighted],[1,2]);
  app.elSearchInput.value='';
  app.updateHistoryDestinationHighlight();
  assert.equal(highlighted.size,0);
  assert.equal(JSON.stringify(rows),before);
});

test('history Down transition targets the first current row actually visible below sticky headers', () => {
  const {app}=createApp();
  const rows=Array.from({length:80},(_,i)=>({dataset:{rowIdx:String(i)},
    getBoundingClientRect:()=>({top:100+i*30-1200,bottom:130+i*30-1200})}));
  app.elTableBody={querySelectorAll:()=>rows};
  app.elSheetContainer={clientTop:0,clientHeight:900,getBoundingClientRect:()=>({top:100}),
    querySelectorAll:()=>[{getBoundingClientRect:()=>({top:100,bottom:500,height:400})}]};
  assert.equal(app.getTopVisibleCurrentRow().dataset.rowIdx,'53');
});

test('search prompt keeps last history selection while revealing the middle-row destination before deferred layout', () => {
  const rows=Array.from({length:80},(_,i)=>({name:i===19?'가상환자':`시험${i}`}));
  const {app,context}=createApp(rows);
  app.activeCell={rowIdx:19,colKey:'name'};
  app.dataStore={'2026-10-04':rows,'2026-09-21':[{name:'가상환자',part:'허리'}]};
  const targetCell={},currentElements=rows.map((_,i)=>({dataset:{rowIdx:String(i)},style:{}}));
  app.elTableBody={querySelectorAll:()=>currentElements,querySelector:selector=>selector.includes('history-destination-row')||selector.includes('data-col="no"')?targetCell:{querySelector:()=>targetCell}};
  app.elSheetContainer={classList:{add(){}},focus(){}};
  app.elBtnClearSearch={style:{}};
  app.loadSearchHistory=app.clearCrossDateRows=app.syncMainColumnWidths=()=>{};
  let preserve,revealed=0,highlighted=0;
  app.renderCrossDateSection=options=>{preserve=options.preserveCurrentSelection;app.activeCell=null;app.crossDateSelection={minRow:6,maxRow:6};};
  app.selectCell=()=>assert.fail('daily selection must not replace the history selection');
  app.updateHistoryDestinationHighlight=()=>{highlighted++;};
  app.ensureCurrentCellVisible=cell=>{assert.equal(cell,targetCell);revealed++;};
  const deferred=[];context.setTimeout=fn=>{deferred.push(fn);};
  app.searchAllDates('가상환자',19,{focusCurrentTarget:true});
  assert.equal(preserve,false);
  assert.equal(app.activeCell,null);
  assert.equal(app.historyApplyTarget.colKey,'no');
  assert.deepEqual(app.crossDateSelection,{minRow:6,maxRow:6});
  assert.equal(revealed,1,'target is visible immediately, before the timer');
  assert.equal(highlighted,1);
  deferred[0]();assert.equal(revealed,2);
  app.activeCell={rowIdx:20,colKey:'memo'};
  deferred[0]();assert.equal(revealed,2,'deferred layout must not undo subsequent navigation');
});

test('destination highlighting touches only old marks and destination cells, independent of table size', () => {
  const rows=Array.from({length:1000},(_,i)=>({name:`시험${i}`}));
  const {app}=createApp(rows);
  app.elSearchInput.value='시험500';
  app.activeCell={rowIdx:500,colKey:'name'};
  let cleared=0,rowLookups=0,cellLookups=0;
  const oldMarks=Array.from({length:2},()=>({classList:{remove(){cleared++;}}}));
  const row={classList:{add(){}},querySelector(){cellLookups++;return null;}};
  app.elTableBody={querySelectorAll(selector){assert.equal(selector,'.history-destination-row, .history-destination-cell');return oldMarks;},
    querySelector(selector){rowLookups++;assert.equal(selector,'.excel-row[data-row-idx="500"]');return row;}};
  app.updateHistoryDestinationHighlight();
  assert.equal(cleared,2);
  assert.equal(rowLookups,1);
  assert.equal(cellLookups,0,'active daily selection needs no per-cell preview work');
});

test('tail destinations retain twelve preceding rows after immediate and deferred reveals', () => {
  const rows = Array.from({length: 35}, (_, i) => i <= 30 ? {name: `시험${i}`} : {});
  const {app} = createApp(rows);
  let tailSpace;
  const container = {scrollTop: 0, clientTop: 0, clientHeight: 900,
    style: {setProperty: (name, value) => {assert.equal(name, '--history-tail-space'); tailSpace = value;}},
    getBoundingClientRect: () => ({top: 100}),
    querySelectorAll: () => [{getBoundingClientRect: () => ({top: 100, bottom: 400, height: 300})}]};
  const cells = rows.map((_, i) => ({dataset: {row: String(i)}, scrollIntoView() {},
    getBoundingClientRect: () => ({top: 400 + i * 30 - container.scrollTop, bottom: 430 + i * 30 - container.scrollTop})}));
  app.elSheetContainer = container;
  app.elTableBody = {querySelector: selector => cells[Number(selector.match(/data-row="(\d+)"/)[1])]};
  for (const idx of [30, 31]) {
    app.revealHistoryDestination(cells[idx]);
    assert.equal(container.scrollTop, (idx - 12) * 30);
    assert.equal(cells[idx - 12].getBoundingClientRect().top, 400);
    assert.ok(cells[idx].getBoundingClientRect().bottom <= 1000);
    assert.equal(tailSpace, '210px', 'trailing space permits context alignment at the scroll limit');
    app.revealHistoryDestination(cells[idx]);
    assert.equal(container.scrollTop, (idx - 12) * 30, 'later layout keeps the same context');
  }
  container.scrollTop = 150;
  app.revealHistoryDestination(cells[10]);
  assert.equal(container.scrollTop, 0, 'middle destinations also show preceding rows from the beginning');
  container.clientHeight = 450;
  app.revealHistoryDestination(cells[30]);
  assert.equal(tailSpace, '0px');
  assert.equal(cells[30].getBoundingClientRect().bottom, 550, 'small screens still reveal the destination');
});

test('row selection arrows reveal the endpoint below pinned history headers, including Shift extension', () => {
  for (const shiftKey of [false, true]) for (const key of ['ArrowUp', 'ArrowDown']) {
    const {app} = createApp(Array.from({length: 80}, (_, i) => ({name: `시험${i}`})));
    app.activeCell = null;
    app.selectedRowRange = {minRow: 40, maxRow: 40};
    app.rowRangeStart = app.rowRangeEnd = 40;
    app.crossDateResults = [{}];
    const targetRow = key === 'ArrowUp' ? 39 : 41;
    const header = {scrollIntoView: () => assert.fail('native scrolling alone misses pinned headers')};
    app.elTableBody = {querySelectorAll: () => [{dataset: {rowIdx: '0'}}],
      querySelector: selector => {assert.equal(selector, `tr[data-row-idx="${targetRow}"] .row-num`); return header;}};
    let selected, revealed = 0;
    app.selectRowRange = (...args) => {selected = args;};
    app.ensureCurrentCellVisible = cell => {assert.equal(cell, header); revealed++;};
    app.handleGlobalKeyDown({key, shiftKey, target: {tagName: 'DIV'}, preventDefault() {}});
    assert.deepEqual(selected, [shiftKey ? 40 : targetRow, targetRow]);
    assert.equal(revealed, 1);
  }
});

test('current rows keep at least 150 rows and fifteen blank rows after the last entered cell', () => {
  for (const [lastIdx, count] of [[49, 150], [149, 165], [179, 195]]) {
    const {app, context} = createApp();
    const rows = Array.from({length: lastIdx + 1}, () => ({}));
    rows[lastIdx] = {name: '가상환자'};
    app.dataStore = {[app.currentDate]: rows};
    const before = JSON.stringify(rows);
    const result = context.App.prototype.getCurrentRows.call(app);
    assert.equal(result.length, count);
    assert.equal(JSON.stringify(result.slice(0, lastIdx + 1)), before);
    assert.ok(result.slice(lastIdx + 1).every(row => !row.name && !row.writer && !row.prescription));
    context.App.prototype.getCurrentRows.call(app);
    assert.equal(result.length, count, 'repeated reads must not continually add blank rows');
  }
});


test('selected chart, name, part and memo cells move right on Enter with or without contents', () => {
  for (const value of ['', '기존 값']) for (const [colKey, nextKey] of [
    ['chartNo', 'name'], ['name', 'part'], ['part', 'prescription'], ['memo', 'specialNote'],
  ]) {
    const { app, context } = createApp([{}, { [colKey]: value }, {}]);
    context.document.querySelector = () => ({});
    app.activeCell = { rowIdx: 1, colKey };
    app.selectCell = (rowIdx, colKey) => { app.activeCell = { rowIdx, colKey }; };
    app.focusSelectedCellEditor = () => {};
    const event = { key: 'Enter', target: { tagName: 'DIV', closest: () => null }, preventDefault() {}, stopPropagation() {} };
    app.handleGlobalKeyDown(event);
    assert.deepEqual(app.activeCell, { rowIdx: 1, colKey: nextKey });
    app.activeCell = { rowIdx: 1, colKey };
    app.handleGlobalKeyDown({ ...event, shiftKey: true });
    assert.deepEqual(app.activeCell, { rowIdx: 0, colKey });
  }
  const { app, context } = createApp([{ no: '1' }, { no: '2' }, {}]);
  context.document.querySelector = () => ({});
  app.activeCell = { rowIdx: 0, colKey: 'no' };
  app.selectCell = (rowIdx, colKey) => { app.activeCell = { rowIdx, colKey }; };
  app.handleGlobalKeyDown({ key: 'Enter', target: { tagName: 'DIV', closest: () => null }, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(app.activeCell, { rowIdx: 1, colKey: 'no' });
});

test('date navigation starts at row one and cancels delayed empty-row focus', () => {
  for (const autoFocus of [false, true]) {
    const { app, context } = createApp(Array.from({ length: 80 }, () => ({ name: '가상 환자' })));
    const pending = new Map();
    let timerId = 0;
    context.setTimeout = fn => { pending.set(++timerId, fn); return timerId; };
    context.clearTimeout = id => pending.delete(id);
    app.isEditingCell = () => false;
    for (const name of ['getEditHistory', 'updateHistoryButtons', 'updateSidebarStats']) app[name] = () => {};
    app.elDatePicker = {};
    app.elDateLabel = { classList: { toggle() {} } };
    app.elSidebarDateTag = {};
    app.elSheetTabTitle = {};
    app.focusFirstEmptyCell = () => { app.elSheetContainer.scrollTop = 2500; };
    app.setDate(app.currentDate, true); // A pending startup/Today focus must not leak into the next date.
    app.activeCell = { rowIdx: 79, colKey: 'memo' };
    app.selectedRowIdx = 79;
    app.rangeStart = app.rangeEnd = { rowIdx: 79, colKey: 'memo' };
    app.elSheetContainer.scrollTop = 2500;
    app.renderTable = () => { assert.equal(app.activeCell, null); assert.equal(app.elSheetContainer.scrollTop, 0); };
    app.setDate('2026-10-05', autoFocus);
    for (const fn of pending.values()) fn();
    assert.equal(app.elSheetContainer.scrollTop, 0);
    assert.equal(app.selectedRowIdx, null);
    assert.equal(app.rangeStart, null);
    assert.equal(app.rangeEnd, null);
    assert.equal(app.elDatePicker.value, '2026-10-05');
  }
});
