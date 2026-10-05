const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

// Load the real suggestion engine without starting the UI or accessing cloud data.
function createApp(dataStore, presets = {}, environment = {}) {
  const context = vm.createContext({
    window: { addEventListener() {} },
    localStorage: { getItem() { return null; } },
    ...environment,
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') +
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
  assert.deepEqual(suggestions(app, 'name', '김'), ['김가상', '김과거']);
  assert.deepEqual(suggestions(app, 'name', 'ㄱㄱㅅ'), ['김가상']);
  assert.deepEqual(suggestions(app, 'chartNo', '123'), ['123', '12345', '001234']);
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
  assert.deepEqual(suggestions(app, 'chartNo', '123'), ['123', '12345']);
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

test('cloud-only dates are searched while local edits override the same cloud date', () => {
  const app = createApp({ '2026-09-29': [{ name: '수정이름' }] });
  app.cloudSearchHistory = {
    '2026-09-28': [{ name: '과거이름', chartNo: '001234' }],
    '2026-09-29': [{ name: '오래된이름' }],
  };
  assert.deepEqual(suggestions(app, 'name', '과거'), ['과거이름']);
  assert.deepEqual(suggestions(app, 'name', '오래된'), []);
  assert.deepEqual(suggestions(app, 'chartNo', '001'), ['001', '001234']);
  assert.deepEqual(suggestions(app, 'chartNo', '001234'), ['001234']);
});

test('cloud history loads every page without modifying local records and reuses its cache', async () => {
  const app = createApp({ '2026-09-30': [{ name: '로컬입력' }] });
  const calls = [];
  const page = Array.from({ length: 200 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10), rows_data: [{ name: `이름${i}` }] }));
  app.supabaseClient = {
    from(table) {
      assert.equal(table, 'pt_daily_records');
      return {
        select(columns) { assert.equal(columns, 'date, rows_data'); return this; },
        order() { return this; },
        async range(start, end) { calls.push([start, end]); return { data: start === 0 ? page : [{ date: '2024-01-01', rows_data: [{ chartNo: '9876' }] }] }; },
      };
    },
  };
  app.refreshSearchSuggestions = () => {};
  const before = JSON.stringify(app.dataStore);
  await Promise.all([app.loadSearchHistory(), app.loadSearchHistory()]);
  assert.deepEqual(calls, [[0, 199], [200, 399]]);
  assert.equal(Object.keys(app.cloudSearchHistory).length, 201);
  assert.equal(JSON.stringify(app.dataStore), before);
  assert.deepEqual(suggestions(app, 'chartNo', '987'), ['987', '9876']);
  await app.loadSearchHistory();
  assert.equal(calls.length, 2);
});


test('completed Korean syllables exclude unrelated names while explicit initials still work', () => {
  const app = createApp({ '2026-09-29': [
    { name: '주한솔' }, { name: '정화자' }, { name: '전재윤' }, { name: '전지훈' },
  ] });
  assert.deepEqual(suggestions(app, 'name', '주한'), ['주한솔']);
  assert.deepEqual(suggestions(app, 'name', '주ㅎ'), ['주한솔']);
  assert.deepEqual(suggestions(app, 'name', '주해'), []);
  assert.deepEqual(suggestions(app, 'name', '전ㅈ'), ['전재윤', '전지훈']);
  assert.deepEqual(suggestions(app, 'name', 'ㅈㅎ'), ['주한솔', '정화자']);
});

test('unfinished final syllable narrows Korean autocomplete before the final consonant', () => {
  const app = createApp({}, { extra: ['충격파', '도수치료', '운동치료'] });
  assert.deepEqual(suggestions(app, 'extra', '추'), ['충격파']);
  assert.deepEqual(suggestions(app, 'extra', '충'), ['충격파']);
  assert.ok(suggestions(app, 'extra', 'ㅊ').includes('충격파'));
});


test('autocomplete refresh preserves the selected value until the query or editor changes', () => {
  let menu = null;
  const element = () => ({
    style: {}, children: [], isConnected: true, offsetWidth: 160, offsetHeight: 100,
    appendChild(child) { this.children.push(child); },
    setAttribute() {}, addEventListener() {}, remove() { menu = null; },
  });
  const document = {
    createElement: element, getElementById: () => menu,
    body: { appendChild(child) { menu = child; } },
    addEventListener() {}, removeEventListener() {},
  };
  const window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1000, innerHeight: 800 };
  const app = createApp({}, {}, { document, window });
  app.moveAutocompleteSelection = () => {};
  const cell = { isConnected: true, getBoundingClientRect: () => ({left: 100, top: 100, bottom: 130, width: 100}) };
  const input = { value: '김' };
  const show = candidates => app.showAutocompleteMenu(0, 'name', cell, input, candidates);
  show(['김가', '김나', '김다']);
  assert.deepEqual(Array.from(app.autocompleteState.candidates), ['김', '김가', '김나', '김다']);
  assert.equal(app.autocompleteState.selectedIndex, 1);
  app.autocompleteState.selectedIndex = 3;
  const originalMenu = menu;
  show(['김가', '김나', '김다']);
  assert.equal(menu, originalMenu);
  assert.equal(app.getSelectedAutocompleteItem(), '김다');
  show(['김새', '김다', '김가', '김나']);
  assert.equal(app.autocompleteState.selectedIndex, 2);
  assert.equal(app.getSelectedAutocompleteItem(), '김다');
  assert.match(menu.children[2].className, /is-selected/);
  input.value = '김가'; show(['김가', '김가나']);
  assert.equal(app.autocompleteState.selectedIndex, 1);
  app.autocompleteState.selectedIndex = 1;
  show(['김가']);
  assert.equal(app.getSelectedAutocompleteItem(), '김가');
  show(['김가', '김가나']); app.autocompleteState.selectedIndex = 1;
  app.showAutocompleteMenu(1, 'name', cell, {value: '김가'}, ['김가', '김가나']);
  assert.equal(app.autocompleteState.selectedIndex, 1);
});


test('new patient identity uses older dates or earlier rows, excluding itself and future dates', () => {
  const app = createApp({
    '2026-09-29': [{name:'기존', chartNo:'10'}],
    '2026-09-30': [{name:'신규', chartNo:'20'}, {name:'신규', chartNo:'20'}],
    '2026-10-01': [{name:'미래', chartNo:'30'}],
  });
  assert.equal(app.isNewPatientRow({name:'신규',chartNo:'20'}, 0), true);
  assert.equal(app.isNewPatientRow({name:'신규',chartNo:'20'}, 1), false);
  assert.equal(app.isNewPatientRow({name:'기존'}, 0), false);
  assert.equal(app.isNewPatientRow({chartNo:'10'}, 0), false);
  assert.equal(app.isNewPatientRow({name:'미래',chartNo:'30'}, 0), true);
  assert.equal(app.isNewPatientRow({}, 0), false);
  app.cloudSearchHistory = {'2026-09-28':[{name:'신규',chartNo:'20'}]};
  assert.equal(app.isNewPatientRow({name:'신규'}, 0), false);
});


test('numeric variants of identical wording sort ascending without moving unrelated groups', () => {
  const app = createApp({'2026-09-29': [
    {specialNote:'L/T 16kg'}, {specialNote:'L/T 14kg'}, {specialNote:'L/T 27kg'},
    {specialNote:'L/T 13kg'}, {specialNote:'L/T 15kg'}, {specialNote:'L/T 12kg'},
  ]});
  assert.deepEqual(suggestions(app,'specialNote','L/T'),[
    'L/T 12kg','L/T 13kg','L/T 14kg','L/T 15kg','L/T 16kg','L/T 27kg',
  ]);
  const mixed = createApp({'2026-09-29': [
    {memo:'신장 10'}, {memo:'신장 2.5'}, {memo:'신장 2'}, {memo:'신장 확인'},
  ]}, {memo:['신장 확인','신장 10','신장 2.5','신장 2']});
  assert.deepEqual(suggestions(mixed,'memo','신장'),['신장 확인','신장 2','신장 2.5','신장 10']);
});

test('numeric variants sort before truncation and compare multiple numbers in order', () => {
  const app=createApp({'2026-09-29':Array.from({length:15},(_,i)=>({specialNote:`L/T ${20-i}kg`}))});
  assert.deepEqual(suggestions(app,'specialNote','L/T'),Array.from({length:10},(_,i)=>`L/T ${6+i}kg`));
  const multi=createApp({'2026-09-29':[
    {memo:'C/T 10kg 2회'}, {memo:'C/T 2kg 10회'}, {memo:'C/T 2kg 3회'},
  ]});
  assert.deepEqual(suggestions(multi,'memo','C/T'),['C/T 2kg 3회','C/T 2kg 10회','C/T 10kg 2회']);
});


test('name IME pending consonants match the next syllable without broadening committed names', () => {
  const app=createApp({'2026-09-29':[
    {name:'이춘식'}, {name:'이창수'}, {name:'이연진'}, {name:'김민수'}, {name:'김홍준'}, {name:'길민수'}, {name:'박세영'},
  ]});
  const composing=query=>Array.from(app.getAutocompleteSuggestions('name',query,true));
  assert.deepEqual(composing('잋'),['이춘식','이창수']);
  assert.deepEqual(composing('긺'),['길민수']);
  assert.deepEqual(composing('밗'),['박세영']);
  assert.deepEqual(suggestions(app,'name','잋'),[]);
  assert.deepEqual(suggestions(app,'name','이연'),['이연진']);
  assert.deepEqual(composing('김홍'),['김홍준']);
  assert.equal(composing('김홍').includes('김민수'),false);
});

test('patient search and name cells match name prefixes rather than middle or final syllables', () => {
  const app = createApp({ '2026-09-29': [
    { name: '김민수' }, { name: '기영수' }, { name: '길민수' },
    { name: '전기운' }, { name: '최일기' }, { name: '이춘식' }, { name: '이창수' }, { name: '이연진' },
  ] });
  const search = query => Array.from(app.getSearchPromptSuggestions(query), item => item.value);
  assert.deepEqual(search('기'), ['김민수', '기영수', '길민수']);
  assert.deepEqual(new Set(suggestions(app, 'name', '기')), new Set(search('기')));
  assert.deepEqual(search('잋'), ['이춘식', '이창수']);
  assert.deepEqual(search('긺'), ['길민수']);
  assert.deepEqual(search('ㄱㅁ'), ['김민수', '길민수']);
  assert.deepEqual(search('이춘식'), ['이춘식']);
  assert.equal(search('김민수').includes('이춘식'), false);
});


test('initial consonant suggestions must match from the first syllable in presets and history', () => {
  const app = createApp({ '2026-09-29': [
    { prescription: '타 치료', name: '김태영', memo: '기타 기록' },
    { prescription: '기타 기록', name: '태가상', memo: '타 기록' },
  ] }, { prescription: ['기타 (HP / La / MW)', '테스트 치료', '기ㅌ 문구'] });
  assert.deepEqual(suggestions(app, 'prescription', 'ㅌ'), ['테스트 치료', '타 치료']);
  assert.deepEqual(suggestions(app, 'name', 'ㅌ'), ['태가상']);
  assert.deepEqual(suggestions(app, 'memo', 'ㅌ'), ['타 기록']);
  assert.deepEqual(suggestions(app, 'name', 'ㄱㅌ'), ['김태영']);
});
