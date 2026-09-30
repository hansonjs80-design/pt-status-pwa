const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = vm.createContext({ window: { addEventListener() {} }, localStorage: { getItem() { return null; } } });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8') + '\nglobalThis.App = PTApp;', context);
const app = Object.create(context.App.prototype);
const plain = value => JSON.parse(JSON.stringify(value));
test('partial colors preserve unselected characters and replace only overlapping ranges', () => {
  const row = { name: '가나다라' };
  app.setPartialTextColor(row, 'name', 1, 3, '#ff0000');
  app.setPartialTextColor(row, 'name', 2, 4, '#0000ff');
  assert.deepEqual(plain(row._richText.name.colors), [null, '#ff0000', '#0000ff', '#0000ff']);
  app.setPartialTextColor(row, 'name', 2, 3, null);
  assert.equal(row._richText.name.colors[2], null);
  row.name = '새 내용'; app.setPartialTextColor(row, 'name', 0, 1, '#000000');
  assert.deepEqual(plain(row._richText.name.colors), ['#000000', null, null, null]);
});
test('history partial apply preserves unselected data, date and formatting', () => {
  const destination = { name:'오늘', memo:'메모', date:'2026.09.30', _textColors:{ name:'#000', memo:'#123' } };
  const source = { name:'이전', memo:'덮어쓰면 안됨', date:'2026.09.01', _textStyles:{name:{fontSize:20}}, _richText:{name:{text:'이전',colors:['#f00',null]}} };
  app.copyHistoryFields(destination, source, ['name']);
  assert.equal(destination.name, '이전'); assert.equal(destination.memo, '메모'); assert.equal(destination.date,'2026.09.30');
  assert.deepEqual(destination._textColors, {memo:'#123'});
  assert.equal(destination._textStyles.name.fontSize, 20);
  destination._richText.name.colors[0]='#000'; assert.equal(source._richText.name.colors[0],'#f00');
});
test('multiple column font settings preserve other properties and columns', () => {
  const instance = Object.create(context.App.prototype), rows=[{_textStyles:{name:{fontWeight:700},memo:{fontSize:11}}},{}];
  instance.selectedColumnRange={minCol:3,maxCol:4}; instance.getCurrentRows=()=>rows;
  instance.saveDataStore=instance.renderTable=instance.selectEntireColumn=()=>{};
  instance.applyColumnTypography('fontSize',20);
  assert.deepEqual(plain(rows[0]._textStyles.name),{fontWeight:700,fontSize:20});
  assert.equal(rows[1]._textStyles.part.fontSize,20); assert.equal(rows[0]._textStyles.memo.fontSize,11);
  instance.applyColumnTypography('fontSize',null); assert.equal(rows[0]._textStyles.name.fontWeight,700); assert.equal(rows[0]._textStyles.name.fontSize,undefined);
});
