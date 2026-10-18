const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('PTContextMenu text selection mode logic', () => {
  const contextMenuCode = fs.readFileSync(path.join(__dirname, '../context-menu.js'), 'utf8');
  const contextFactory = new Function(`${contextMenuCode}; return PTContextMenu;`);
  const PTContextMenu = contextFactory();

  const menu = new PTContextMenu();
  const mockRows = [{ memo: '테스트 메모 텍스트' }];
  menu.getCurrentRows = () => mockRows;
  menu.activeCell = { rowIdx: 0, colKey: 'memo' };
  menu.selectedRange = null;
  menu.selectedColumnRange = null;

  // Mock context menu DOM
  const headerEl = { classList: { remove() {}, add() {}, toggle() {} }, style: {} };
  const previewEl = { textContent: '' };
  const lengthEl = { textContent: '' };
  const btnEdit = { classList: { remove() {}, add() {}, toggle() {} } };
  const btnDelete = { classList: { remove() {}, add() {}, toggle() {} } };
  const btnSelectAll = { classList: { remove() {}, add() {}, toggle() {} } };
  const divider = { classList: { remove() {}, add() {}, toggle() {} } };
  const itemCut = { classList: { remove() {}, add() {} }, querySelector: () => ({ textContent: '' }) };
  const itemCopy = { classList: { remove() {}, add() {} }, querySelector: () => ({ textContent: '' }) };
  const itemClear = { classList: { remove() {}, add() {} } };
  const itemFind = { classList: { toggle() {} } };

  menu.elContextMenu = {
    style: {},
    getBoundingClientRect: () => ({ width: 200, height: 200 }),
    offsetWidth: 200,
    offsetHeight: 200,
    querySelector: (sel) => {
      if (sel === '#menuTextSelectionHeader') return headerEl;
      if (sel === '#menuSelectionPreview') return previewEl;
      if (sel === '#menuSelectionLength') return lengthEl;
      if (sel === '[data-action="edit-selected-text"]') return btnEdit;
      if (sel === '[data-action="delete-selected-text"]') return btnDelete;
      if (sel === '[data-action="select-all-text"]') return btnSelectAll;
      if (sel === '#menuTextDivider') return divider;
      if (sel === '[data-action="cut"]') return itemCut;
      if (sel === '[data-action="copy"]') return itemCopy;
      if (sel === '[data-action="clear-contents"]') return itemClear;
      if (sel === '[data-action="find"]') return itemFind;
      return null;
    },
    querySelectorAll: () => []
  };

  const mockInput = {
    value: '테스트 메모 텍스트',
    selectionStart: 4,
    selectionEnd: 6,
    setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
    focus() {},
    dispatchEvent() {},
    matches: () => true,
    isConnected: true
  };

  const tdCell = {
    dataset: { row: '0', col: 'memo', colIdx: '8' },
    querySelector: (sel) => sel.includes('input:not(.is-armed)') ? mockInput : null,
    closest: (sel) => sel === '.excel-cell' ? tdCell : null
  };

  menu.captureTextColorSelection = () => {};
  let selectCellCalled = false;
  menu.selectCell = () => { selectCellCalled = true; };

  // Context menu on active text editor
  menu.handleTableContextMenu({
    target: mockInput,
    clientX: 100,
    clientY: 100,
    preventDefault: () => {}
  });

  // verify selectCell was NOT called (editor preserved)
  assert.strictEqual(selectCellCalled, false, 'selectCell must not be called when editing current cell');
  assert.ok(menu.textEditorState, 'textEditorState should be populated');
  assert.strictEqual(menu.textEditorState.selectedText, '메모');
  assert.strictEqual(menu.textEditorState.start, 4);
  assert.strictEqual(menu.textEditorState.end, 6);

  // verify quick text edit replacement
  let historyCaptured = false;
  menu.captureHistory = () => { historyCaptured = true; };
  menu.showSaveIndicator = () => {};

  // Mock quick edit input
  const quickInput = { value: '치료내용' };
  global.document = {
    getElementById: (id) => id === 'quickTextInput' ? quickInput : null
  };

  menu.applyQuickTextEdit();
  assert.strictEqual(mockInput.value, '테스트 치료내용 텍스트');
  assert.strictEqual(mockRows[0].memo, '테스트 치료내용 텍스트');
  assert.strictEqual(mockInput.selectionStart, 4);
  assert.strictEqual(mockInput.selectionEnd, 4 + '치료내용'.length);

  delete global.document;
});
