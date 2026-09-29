const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

// Load the real suggestion engine without starting the UI or accessing cloud data.
function createApp(dataStore, presets = {}) {
  const context = vm.createContext({
    window: { addEventListener() {} },
    localStorage: { getItem() { return null; } },
  });
  vm.runInContext(readFileSync(resolve(__dirname, '../app.js'), 'utf8') +
    '\n globalThis.App = PTApp; globalThis.setPresets = value => { COLUMN_PRESETS = value; };', context);
  context.setPresets(presets);
  const app = Object.create(context.App.prototype);
  app.currentDate = '2026-09-30';
  app.dataStore = dataStore;
  return app;
}

const suggestions = (app, col, query) => Array.from(app.getAutocompleteSuggestions(col, query));

test('names, numeric chart numbers and other fields include previous dates', () => {
  const data = {
    '2026-09-30': [{ name: '오늘기록', chartNo: '200' }],
    '2026-09-29': [{ name: '김가상', chartNo: 12345, part: '왼쪽 팔', memo: '예약 확인' }],
    '2025-01-01': [{ name: '김과거', chartNo: '001234' }],
  };
  const app = createApp(data);
  const before = JSON.stringify(data);
  assert.deepEqual(suggestions(app, 'name', '김'), ['김가상', '김과거', '오늘기록']);
  assert.deepEqual(suggestions(app, 'name', 'ㄱㄱㅅ'), ['김가상']);
  assert.deepEqual(suggestions(app, 'chartNo', '123'), ['12345', '001234']);
  assert.deepEqual(suggestions(app, 'memo', '예약'), ['예약 확인']);
  assert.deepEqual(suggestions(app, 'part', '왼'), ['왼', '왼쪽 팔']);
  assert.equal(JSON.stringify(data), before);
});

test('duplicates across dates and presets are shown once', () => {
  const app = createApp({
    '2026-09-30': [{ name: 'Kim', chartNo: '12345' }],
    '2026-09-29': [{ name: ' KIM ', chartNo: 12345 }, null],
    '2026-09-28': [{ name: 'kim', chartNo: '12345' }],
  }, { name: ['Kim'] });
  assert.deepEqual(suggestions(app, 'name', 'ki'), ['Kim']);
  assert.deepEqual(suggestions(app, 'chartNo', '123'), ['12345']);
  assert.deepEqual(suggestions(app, 'name', 'Kim'), []);
});

test('suggestions reflect history edits and keep the ten-item limit', () => {
  const app = createApp({
    '2026-09-29': Array.from({ length: 15 }, (_, i) => ({ name: `테스트${i}` })),
  });
  assert.equal(suggestions(app, 'name', '테스트').length, 10);
  app.dataStore['2026-09-29'] = [{ name: '변경기록' }];
  assert.deepEqual(suggestions(app, 'name', '테스트'), []);
  assert.deepEqual(suggestions(app, 'name', '변경'), ['변경기록']);
  assert.deepEqual(suggestions(app, 'name', ' '), []);
});
