const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function fixture(count = 300) {
  const calls = { rows: 0, scan: 0, lookup: 0, computed: 0 };
  const context = vm.createContext({ window: { addEventListener() {} }, document: { activeElement: null },
    getComputedStyle(cell) { calls.computed++; return cell.computed; } });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  const keys = ['no', 'gender', 'chartNo', 'name', 'part', 'prescription', 'extra', 'writer', 'memo', 'specialNote', 'visitTime'];
  const rows = Array.from({ length: count }, () => ({}));
  const cells = rows.flatMap((row, r) => keys.map((key, c) => ({ dataset: { row: String(r), colIdx: String(c), col: key }, computed: { color: 'rgb(0, 0, 0)', fontWeight: '400' } })));
  app.selectedRange = { minRow: 0, maxRow: count - 1, minCol: 0, maxCol: 9 };
  app.getCurrentRows = () => { calls.rows++; return rows; };
  app.elTableBody = {
    querySelectorAll() { calls.scan++; return cells; },
    querySelector() { calls.lookup++; return cells[0]; },
  };
  return { app, rows, cells, calls };
}

test('whole-sheet background status reads rows and scans cells once, excluding the hidden visit column', () => {
  const { app, rows, calls } = fixture();
  rows.forEach(row => { row._textStyles = { visitTime: { backgroundColor: '#ff0000' } }; });
  assert.deepEqual(JSON.parse(JSON.stringify(app.getFormattingStatus('backgroundColor'))), { value: '#ffffff', label: '#ffffff' });
  assert.deepEqual(calls, { rows: 1, scan: 1, lookup: 0, computed: 0 });
});

test('mixed formatting stops reading styles as soon as two selected values differ', () => {
  const { app, cells, calls } = fixture();
  cells[1].computed.color = 'rgb(255, 0, 0)';
  assert.equal(app.getFormattingStatus('color').label, '여러 값');
  assert.equal(calls.computed, 2);
  assert.equal(calls.scan, 1);
  assert.equal(calls.rows, 0);
});

test('formatting scans honor both range bounds and sparse cell membership', () => {
  const { app, rows, calls } = fixture(8);
  app.selectedRange = { minRow: 2, maxRow: 4, minCol: 3, maxCol: 5 };
  app.selectedCellSet = new Set(['2:3', '4:5']);
  rows[2]._textStyles = { name: { backgroundColor: '#ff0000' } };
  rows[4]._textStyles = { prescription: { backgroundColor: '#ff0000' } };
  assert.equal(app.getFormattingStatus('backgroundColor').value, '#ff0000');
  assert.equal(calls.rows, 1);
});

test('single-cell formatting keeps one direct lookup instead of scanning a large sheet', () => {
  const { app, calls } = fixture();
  app.selectedRange = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 };
  assert.equal(app.getFormattingStatus('color').value, 'rgb(0, 0, 0)');
  assert.deepEqual(calls, { rows: 0, scan: 0, lookup: 1, computed: 1 });
});

test('highlight status detects mixed character styles while reading row data once', () => {
  const { app, rows, calls } = fixture(2);
  rows[0].no = 'AB';
  app.getEffectiveCellRichText = () => ({ text: 'AB', styles: [{ highlight: '#ffff00' }, {}] });
  assert.equal(app.getFormattingStatus('highlight').label, '여러 값');
  assert.equal(calls.rows, 1);
});
