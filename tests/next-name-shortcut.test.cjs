const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function fixture(rows = []) {
  const document = { activeElement: null, querySelector: () => null, querySelectorAll: () => [] };
  const context = vm.createContext({ window: { addEventListener() {} }, document });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  const cells = new Map();
  const calls = [];
  Object.assign(app, {
    currentDate: '2026-10-21', dataStore: { '2026-10-21': rows },
    rowCountSettings: { baseCount: 20, changes: [], allocations: [] },
    elSearchInput: { value: '' },
    elTableBody: { querySelector: selector => cells.get(selector) },
    elSheetContainer: { focus: options => calls.push(['focus', options.preventScroll]) },
    closeAutocompleteMenu() {}, hideContextMenu() {},
    renderTable() {
      calls.push(['render']);
      app.getCurrentRows().forEach((_, i) => cells.set(`.excel-cell[data-row="${i}"][data-col="name"]`, {
        closest: () => ({ style: {} }),
      }));
    },
    selectCell: (row, col, cell, edit) => calls.push(['select', row, col, edit]),
    ensureCurrentCellVisible: (cell, options) => calls.push(['scroll', options.center]),
  });
  app.renderTable(); calls.length = 0;
  const press = (extra = {}) => {
    const event = { key: 't', code: 'KeyT', ctrlKey: true, target: {},
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
    return { handled: app.handleNextNameCellShortcut(event), event };
  };
  return { app, document, rows, calls, press };
}

test('Ctrl/Cmd+T selects immediately below the last nonblank name, ignoring gaps and other columns', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const { calls, press } = fixture([{ name: '처음' }, {}, { name: '마지막' }, { name: '　 ' }, { chartNo: '9999', memo: '준비' }]);
    const result = press({ ctrlKey: false, [modifier]: true });
    assert.equal(result.handled, true);
    assert.equal(result.event.defaultPrevented, true);
    assert.deepEqual(calls, [['select', 3, 'name', false], ['focus', true], ['scroll', true]]);
  }
});

test('an empty name column selects the first name cell, also with a Korean physical KeyT', () => {
  const { calls, press } = fixture([{ chartNo: '123' }, { name: ' ' }]);
  assert.equal(press({ key: 'ㅅ' }).handled, true);
  assert.deepEqual(calls[0], ['select', 0, 'name', false]);
});

test('the corner toggle exits a full-sheet selection through the same next-name-cell path', () => {
  const { app, calls } = fixture([{ name: '첫 성함' }, {}, { name: '마지막 성함' }]);
  app.selectAllCells = () => calls.push(['all']);
  app.toggleAllCells();
  assert.deepEqual(calls, [['all']]);
  calls.length = 0;
  app.selectedRange = { minRow: 0, maxRow: app.getCurrentRows().length - 1, minCol: 0, maxCol: 9 };
  app.selectedRowRange = { minRow: 0, maxRow: app.selectedRange.maxRow };
  app.toggleAllCells();
  assert.deepEqual(calls, [['select', 3, 'name', false], ['focus', true], ['scroll', true]]);
});

test('partial rows, columns and sparse selections still select the whole sheet on a corner click', () => {
  for (const mode of ['partial', 'column', 'sparse']) {
    const { app, calls } = fixture();
    app.selectAllCells = () => calls.push(['all']);
    app.selectedRange = { minRow: 0, maxRow: app.getCurrentRows().length - 1, minCol: 0, maxCol: 9 };
    if (mode !== 'column') app.selectedRowRange = { minRow: 0, maxRow: app.selectedRange.maxRow };
    if (mode === 'partial') app.selectedRange.maxRow--;
    if (mode === 'sparse') app.selectedCellSet = new Set(['0:0']);
    app.toggleAllCells();
    assert.deepEqual(calls, [['all']]);
  }
});

test('a live draft is committed before finding the destination and newly allocated rows are rendered', () => {
  const { app, rows, document, calls, press } = fixture();
  document.activeElement = { blur() { rows[rows.length - 1].name = '새 성함'; } };
  const originalCount = rows.length;
  press();
  assert.equal(rows[originalCount - 1].name, '새 성함');
  assert.ok(rows.length > originalCount);
  assert.deepEqual(calls, [['render'], ['select', originalCount, 'name', false], ['focus', true], ['scroll', true]]);
  assert.equal(app.getCurrentRows()[originalCount].name, '');
});

test('a history search closes before selecting in the current date table', () => {
  const { app, calls, press } = fixture([{ name: '현재 이름' }]);
  app.elSearchInput.value = '이전 내역';
  app.crossDateResults = [{ name: '검색 결과' }];
  app.closeHistorySearch = () => calls.push(['closeSearch']);
  press();
  assert.deepEqual(calls, [['closeSearch'], ['select', 1, 'name', false], ['focus', true], ['scroll', true]]);
});

test('unrelated shortcuts, composing text, external inputs and open dialogs do not move selection', () => {
  const { app, document, calls, press } = fixture();
  for (const extra of [
    { ctrlKey: false }, { shiftKey: true }, { altKey: true }, { isComposing: true },
    { defaultPrevented: true }, { code: 'KeyF', key: 'f' },
    { target: { matches: () => true, closest: () => null } },
    { target: { closest: () => ({}) } },
  ]) assert.equal(press(extra).handled, false);
  document.querySelector = () => ({});
  assert.equal(press().handled, false);
  document.querySelector = () => null;
  document.querySelectorAll = () => [{ style: { display: 'flex' } }];
  assert.equal(press().handled, false);
  document.querySelectorAll = () => [];
  app._recordsRestorePending = true;
  assert.equal(press().handled, false);
  app._recordsRestorePending = false;
  assert.equal(press({ repeat: true }).handled, true);
  assert.deepEqual(calls, []);
});
