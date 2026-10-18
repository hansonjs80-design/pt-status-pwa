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
    getBoundingClientRect: () => ({ width: 220, height: 280 }),
    offsetWidth: 220,
    offsetHeight: 280,
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

  const tdCell = {
    dataset: { row: '0', col: 'memo', colIdx: '8' },
    style: {},
    getBoundingClientRect: () => ({ top: 100, bottom: 130, left: 200, right: 350, width: 150, height: 30 }),
    closest: (sel) => sel === '.excel-cell' ? tdCell : null
  };

  const mockInput = {
    value: '테스트 메모 텍스트',
    style: {},
    selectionStart: 4,
    selectionEnd: 6,
    setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
    focus() {},
    dispatchEvent() {},
    matches: () => true,
    isConnected: true,
    closest: (sel) => sel === '.excel-cell' ? tdCell : null
  };

  tdCell.querySelector = (sel) => sel.includes('input:not(.is-armed)') ? mockInput : null;

  menu.captureTextColorSelection = () => {};
  let selectCellCalled = false;
  menu.selectCell = () => { selectCellCalled = true; };

  // Set mock window dimensions
  global.window = {
    innerWidth: 1000,
    innerHeight: 800
  };

  // Context menu on active text editor
  menu.handleTableContextMenu({
    target: mockInput,
    clientX: 250,
    clientY: 115,
    preventDefault: () => {}
  });

  // verify selectCell was NOT called (editor preserved)
  assert.strictEqual(selectCellCalled, false, 'selectCell must not be called when editing current cell');
  assert.ok(menu.textEditorState, 'textEditorState should be populated');
  assert.strictEqual(menu.textEditorState.selectedText, '메모');
  assert.strictEqual(menu.textEditorState.start, 4);
  assert.strictEqual(menu.textEditorState.end, 6);

  // verify menu positioning does not obscure cell (placed below cell)
  assert.strictEqual(menu.elContextMenu.style.top, `${130 + 4}px`, 'Context menu should be placed right below the cell to avoid obscuring it');

  // verify quick text edit replacement & left-alignment enforcement
  let historyCaptured = false;
  menu.captureHistory = () => { historyCaptured = true; };
  menu.showSaveIndicator = () => {};

  // Mock quick edit DOM
  const quickInput = { value: '치료내용' };
  const targetEl = { textContent: '' };
  const cardEl = { style: {}, offsetHeight: 180 };
  const modalEl = {
    style: {},
    querySelector: (sel) => sel === '.quick-text-card' ? cardEl : null
  };

  global.document = {
    getElementById: (id) => {
      if (id === 'quickTextInput') return quickInput;
      if (id === 'quickTextTarget') return targetEl;
      if (id === 'quickTextEditModal') return modalEl;
      return null;
    }
  };

  // Open quick text edit dialog
  menu.openQuickTextEditDialog();
  assert.strictEqual(modalEl.style.display, 'block');
  assert.strictEqual(cardEl.style.top, `${130 + 8}px`, 'Quick text card should be placed below the target cell to keep cell text visible');
  assert.strictEqual(cardEl.style.left, `${200}px`, 'Quick text card left should align with cell left');

  // Apply replacement
  menu.applyQuickTextEdit();
  assert.strictEqual(mockInput.value, '테스트 치료내용 텍스트');
  assert.strictEqual(mockRows[0].memo, '테스트 치료내용 텍스트');
  assert.strictEqual(mockInput.selectionStart, 4);
  assert.strictEqual(mockInput.selectionEnd, 4 + '치료내용'.length);
  assert.strictEqual(mockInput.style.textAlign, 'left', 'Input text-align should be explicitly left');
  assert.strictEqual(tdCell.style.textAlign, 'left', 'Cell text-align should be explicitly left');

  // Test boundary clamping when near the screen right edge
  menu.showContextMenu(990, 750, tdCell);
  const leftNum = parseInt(menu.elContextMenu.style.left, 10);
  const topNum = parseInt(menu.elContextMenu.style.top, 10);
  assert.ok(leftNum <= 1000 - 220 - 14, 'Context menu should be clamped within right viewport boundary');
  assert.ok(topNum <= 800 - 280 - 14, 'Context menu should be clamped within bottom viewport boundary');

  delete global.document;
  delete global.window;
});
