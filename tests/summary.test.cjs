const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ window: { addEventListener() {} }, localStorage: { getItem() { return null; } } });
vm.runInContext(readFileSync(resolve(__dirname, '../app.js'), 'utf8') + '\nglobalThis.App = PTApp;', context);
const app = Object.create(context.App.prototype);

test('summary includes treatment-only rows but excludes unused rows and whitespace', () => {
  const result = app.getDailySummary([
    { name: '가상환자', gender: ' m ', prescription: '사지 ( HP / Laser )' },
    { prescription: '학생 ( HP / Laser )', gender: 'F' },
    { extra: '도수치료, 견인' },
    { chartNo: 123, prescription: 'X', gender: 'F' },
    { gender: 'F', writer: 'S' },
    { name: '  ', chartNo: '', part: '\n' },
    {}, null,
  ]);
  assert.equal(result.total, 4);
  assert.equal(result.male, 1);
  assert.equal(result.female, 2);
  assert.equal(result.unknown, 1);
  assert.equal(result.male + result.female + result.unknown, result.total);
  assert.equal(result.extras.get('도수치료'), 1);
  assert.equal(result.extras.get('견인'), 1);
  assert.equal(result.prescriptions.get('X'), 1);
  assert.equal(result.prescriptions.get('미입력'), 1);
  assert.equal([...result.prescriptions.values()].reduce((a, b) => a + b, 0), result.total);
});

test('mixed additional treatments are separate and repeated items in one row count once', () => {
  const result = app.getDailySummary([
    { extra: '충격파, 도수치료, 테이핑, 충격파' },
    { extra: '이온 / 윈백 + 견인' },
    { extra: '도수; 테이핑' },
  ]);
  assert.equal(result.extras.get('충격파'), 1);
  assert.equal(result.extras.get('도수치료'), 1);
  assert.equal(result.extras.get('도수'), 1);
  assert.equal(result.extras.get('테이핑'), 2);
  for (const label of ['이온', '윈백', '견인']) assert.equal(result.extras.get(label), 1);
});

test('prescriptions reflect entered labels rather than a broad other category', () => {
  const result = app.getDailySummary([
    { prescription: '학생 (HP / Laser)' },
    { prescription: '학생  (HP / Laser)' },
    { prescription: '항냉 (ICE / Laser)' },
  ]);
  assert.equal(result.prescriptions.get('학생 (HP / Laser)'), 2);
  assert.equal(result.prescriptions.get('항냉 (ICE / Laser)'), 1);
  assert.equal(app.getDailySummary([]).total, 0);
});


test('summary omits unused preset treatments and keeps the labels actually entered', () => {
  const result = app.getDailySummary([
    { name: '가상1', extra: '충격파, 도수' },
    { name: '가상2', extra: '이온' },
    { name: '가상3', extra: '충격파' },
  ]);
  assert.deepEqual(Array.from(result.extras, ([label, count]) => [label, count]), [['충격파', 2], ['도수', 1], ['이온', 1]]);
  assert.equal(result.extras.has('윈백'), false);
  assert.equal(result.extras.has('견인'), false);
  assert.equal(result.extras.has('도수치료'), false);
  assert.equal(app.getDailySummary([]).extras.size, 0);
});

test('shockwave count includes kidney-note subcount only on shockwave rows', () => {
  const rows = [
    {extra:'충격파',specialNote:'신장2.5'}, {extra:'충격파',specialNote:'신장4.0'},
    {extra:'충격파, 충격파',specialNote:'신장 3.0'}, {extra:'충격파'}, {extra:'충격파'}, {extra:'충격파'},
    {extra:'도수치료',specialNote:'신장4.0'},
  ];
  const result=app.getDailySummary(rows);
  assert.equal(result.extras.get('충격파'),6);
  assert.equal(app.formatExtraCount(result,'충격파',6),'6(3)');
  assert.equal(app.formatExtraCount(result,'도수치료',1),'1');
});
