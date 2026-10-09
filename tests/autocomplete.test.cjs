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
  assert.deepEqual(suggestions(app, 'name', 'Kim'), ['Kim']);
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
        async range(start, end) { calls.push([start, end]); return { data: start === 0 ? page : start === 200 ? [{ date: '2024-01-01', rows_data: [{ chartNo: '9876' }] }] : [] }; },
      };
    },
  };
  app.refreshSearchSuggestions = () => {};
  const before = JSON.stringify(app.dataStore);
  await Promise.all([app.loadSearchHistory(), app.loadSearchHistory()]);
  assert.deepEqual(calls, [[0, 199], [200, 399], [201, 400]]);
  assert.equal(Object.keys(app.cloudSearchHistory).length, 201);
  assert.equal(JSON.stringify(app.dataStore), before);
  assert.deepEqual(suggestions(app, 'chartNo', '987'), ['987', '9876']);
  await app.loadSearchHistory();
  assert.equal(calls.length, 3);
});

test('old server patients remain searchable through blank dates and synced local caches', () => {
  const blank = [{ name: '', writer: 'S', date: '2025.09.09' }];
  const stale = [{ name: '가상환자', chartNo: '100' }];
  const app = createApp({ '2025-09-09': blank, '2025-09-10': stale });
  app.cloudSearchHistory = {
    '2025-09-09': [{ name: '양명자', chartNo: '12500' }],
    '2025-09-10': [...stale, { name: '양명자', chartNo: '12500' }],
  };
  app.syncBaselines = new Map([['2025-09-10', structuredClone(stale)]]);
  app.syncBaselines.set('2025-09-09', []);
  app.pendingSyncDates = new Set();
  const before = JSON.stringify([app.dataStore, app.cloudSearchHistory]);
  assert.deepEqual(suggestions(app, 'name', '양명'), ['양명자']);
  assert.equal(app.getSearchDataStore()['2025-09-09'][0].name, '양명자');
  assert.equal(app.getSearchDataStore()['2025-09-10'][1].name, '양명자');
  assert.equal(JSON.stringify([app.dataStore, app.cloudSearchHistory]), before);
  app.pendingSyncDates.add('2025-09-09');
  assert.equal(app.getSearchDataStore()['2025-09-09'], blank);
  stale[0].memo = '로컬 수정';
  assert.equal(app.getSearchDataStore()['2025-09-10'][0].memo, '로컬 수정');
  assert.equal(app.getSearchDataStore()['2025-09-10'][1].name, '양명자');
});

test('one-year-plus history continues through server-capped pages into older years', async () => {
  const app = createApp({});
  app.getSearchPeriod = () => '1year_plus';
  const entries = [
    { date: '2026-09-09', rows_data: [{ name: '가상환자' }] },
    { date: '2025-09-09', rows_data: [{ name: '양명자', chartNo: '12500' }] },
    { date: '2024-09-09', rows_data: [{ name: '양명자', chartNo: '12500' }] },
  ];
  const offsets = [];
  app.supabaseClient = { from() { return {
    select() { return this; }, order() { return this; },
    gte() { assert.fail('one-year-plus must not have a cutoff'); },
    async range(start) { offsets.push(start); return { data: entries.slice(start, start + 1) }; },
  }; } };
  app.refreshSearchSuggestions = () => {};
  assert.equal(await app.loadSearchHistory(), true);
  assert.deepEqual(offsets, [0, 1, 2, 3]);
  assert.equal(app.cloudSearchHistory['2025-09-09'][0].name, '양명자');
  assert.equal(app.cloudSearchHistory['2024-09-09'][0].name, '양명자');
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
  const input = { value: '김', dataset: {} };
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
  app.showAutocompleteMenu(1, 'name', cell, {value: '김가', dataset: {}}, ['김가', '김가나']);
  assert.equal(app.autocompleteState.selectedIndex, 1);
  input.value = '이솔'; show(['이소림']);
  app.autocompleteState.selectedIndex = 0;
  show([]); // Composition ended while the typed-value option was highlighted.
  assert.deepEqual(Array.from(app.autocompleteState.candidates), ['이솔', '이소림']);
  assert.equal(app.getSelectedAutocompleteItem(), '이솔');
  app.autocompleteState.selectedIndex = 1;
  show([]);
  assert.equal(app.getSelectedAutocompleteItem(), '이소림');
  input.value = '김'; show([]);
  assert.deepEqual(Array.from(app.autocompleteState.candidates), ['김']);
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

test('extra, memo and special note candidates match prefixes and keep pending next initials during IME', () => {
  for (const col of ['extra', 'memo', 'specialNote']) {
    const app = createApp({ '2026-09-29': [
      { [col]: '신장 2.5' }, { [col]: '신장 3' }, { [col]: '신경 확인' },
      { [col]: '내일 신장' }, { [col]: '확인 신장' },
    ] }, { [col]: ['신장 2', '내일 신장 3'] });
    const composing = query => Array.from(app.getAutocompleteSuggestions(col, query, true));
    assert.deepEqual(composing('싡'), ['신장 2', '신장 2.5', '신장 3']);
    assert.deepEqual(suggestions(app, col, 'ㅅㅈ'), ['신장 2', '신장 2.5', '신장 3']);
    assert.deepEqual(suggestions(app, col, '신장'), ['신장 2', '신장 2.5', '신장 3']);
    assert.deepEqual(suggestions(app, col, '싡'), []);
    assert.deepEqual(composing('신경'), ['신경 확인']);
  }
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


test('body part IME matching ignores spacing and keeps managed order for pending initials', () => {
  const app = createApp({'2026-09-29':[{part:'오 엉덩이'}, {part:'왼 오 어'}]}, {part:['오 어','오 엉덩이']});
  assert.deepEqual(Array.from(app.getAutocompleteSuggestions('part','옹',true)),['옹','오 어','오 엉덩이']);
  assert.deepEqual(Array.from(app.getAutocompleteSuggestions('part','오ㅇ',true)),['옹','오 어','오 엉덩이']);
  assert.deepEqual(Array.from(app.getAutocompleteSuggestions('part','오어',false)),['오어','오 어','오 엉덩이']);
  assert.equal(app.matchesHangulPrefix('오 어','옹',true),true);
  assert.equal(app.matchesHangulPrefix('왼 오 어','옹',true),false);
});


test('input-specific candidate management persists order and additions without changing historical rows', async () => {
  const saved=[];
  const app=createApp({'2026-09-29':[{part:'오 엉덩이'}]}, {part:['오 어']}, {
    localStorage:{getItem(){return null;},setItem(key,value){saved.push(JSON.parse(value));}},
    prompt:()=> '오 어깨', confirm:()=>true,
  });
  const key=app.getAutocompleteRuleKey('part','옹');
  app.autocompleteManagerContext={colKey:'part',query:'옹',key,items:['오 어','오 엉덩이']};
  app.activePresetTab='part';
  app.renderPresetManagerList=app.renderQuickChips=app.showSaveIndicator=()=>{};
  app.elManagerNewPresetInput={value:'오 엄지',focus(){}};
  app.openPresetTextColorEditor = async () => ({value:'오 어깨',color:null});
  app.addPresetFromManager();
  app.movePresetAt('part',2,-1);
  await app.editPresetAt('part',0);
  app.deletePresetAt('part',2);
  app.autocompleteManagerContext=null;
  assert.deepEqual(Array.from(app.getAutocompleteSuggestions('part','옹',true)),['옹','오 어깨','오 엄지']);
  assert.deepEqual(Array.from(app.getAutocompleteSuggestions('part','오ㅇ',true)),['옹','오 어깨','오 엄지']);
  assert.equal(app.dataStore['2026-09-29'][0].part,'오 엉덩이');
  assert.deepEqual(saved.at(-1)[key],['오 어깨','오 엄지']);
  assert.deepEqual(saved.at(-1).part,['오 어']);
});


test('detail management includes displayed historical typo and keeps the corrected candidate when reopened', async () => {
  const query = '척추 ( HP / 자기장 / ICT )';
  const bad = query + 'd';
  const app = createApp({ '2026-10-05': [{ prescription: bad }] }, { prescription: [query] }, {
    localStorage: { getItem() { return null; }, setItem() {} }, prompt: () => query,
  });
  app.closeAutocompleteMenu = () => {};
  app.openPresetManager = (col, context) => { app.autocompleteManagerContext = context; };
  app.renderPresetManagerList = app.renderQuickChips = app.showSaveIndicator = () => {};
  app.openPresetTextColorEditor = async () => ({value:query,color:null});
  app.openAutocompletePresetManager('prescription', bad, { value: query });
  assert.deepEqual(Array.from(app.autocompleteManagerContext.items), [query, bad]);
  await app.editPresetAt('prescription', 1);
  app.openAutocompletePresetManager('prescription', null, { value: query });
  assert.equal(app.autocompleteManagerContext.items.includes(bad), false);
  assert.equal(app.autocompleteManagerContext.items.includes(query), true);
  assert.equal(app.dataStore['2026-10-05'][0].prescription, bad);
});


test('hidden detail candidates stay manageable, preserve order and can be restored', async () => {
  const app = createApp({}, { part: ['오어', '오 엉'] }, {
    localStorage: { getItem() { return null; }, setItem() {} }, prompt: () => '오 엉덩이',
  });
  app.closeAutocompleteMenu = () => {};
  app.openPresetManager = (col, context) => { app.autocompleteManagerContext = context; };
  app.renderPresetManagerList = app.renderQuickChips = app.showSaveIndicator = () => {};
  app.openPresetTextColorEditor = async () => ({value:'오 엉덩이',color:null});
  app.openAutocompletePresetManager('part', null, { value: '옹' });
  const original = Array.from(app.autocompleteManagerContext.items);
  app.togglePresetCandidateVisibility('part', 0);
  assert.equal(suggestions(app, 'part', '옹').includes(original[0]), false);
  app.openAutocompletePresetManager('part', null, { value: '옹' });
  assert.deepEqual(Array.from(app.autocompleteManagerContext.items), original);
  await app.editPresetAt('part', 0);
  assert.equal(suggestions(app, 'part', '옹').includes('오 엉덩이'), false);
  app.togglePresetCandidateVisibility('part', 0);
  assert.equal(suggestions(app, 'part', '옹')[1], '오 엉덩이');
  assert.deepEqual(suggestions(app, 'part', '오'), ['오', '오어', '오 엉']);
});

test('column hidden phrases exclude preset, historical and detailed candidates without changing records', () => {
  const presets = { memo: ['신장 2'], '__columnHidden:memo': ['신장 2', '신장 3'], '__query:memo:신': ['신장 3', '신장 4'] };
  const data = { '2026-10-05': [{memo:'신장 3'}, {memo:'신장 4'}] };
  const app = createApp(data, presets);
  assert.deepEqual(suggestions(app, 'memo', '신'), ['신장 4']);
  assert.deepEqual(suggestions(app, 'memo', '신장'), ['신장 4']);
  assert.equal(data['2026-10-05'][0].memo, '신장 3');
  delete presets['__columnHidden:memo'];
  assert.deepEqual(suggestions(app, 'memo', '신'), ['신장 3', '신장 4']);
  assert.deepEqual(suggestions(app, 'memo', '신장'), ['신장 2', '신장 3', '신장 4']);
});


test('name details keep the typed name and an exact registered candidate remains visible', () => {
  const app = createApp({ '2026-10-06': [{name:'김홍준'}] }, {name:['김홍']}, {
    localStorage:{getItem(){return null;},setItem(){}},
  });
  app.closeAutocompleteMenu = () => {};
  app.openPresetManager = (col, context) => { app.autocompleteManagerContext = context; };
  app.openAutocompletePresetManager('name','김홍준',{value:'김홍'});
  assert.deepEqual(Array.from(app.autocompleteManagerContext.items), ['김홍','김홍준']);
  app.savePresetManagerItems('name');
  assert.deepEqual(suggestions(app,'name','김홍'),['김홍','김홍준']);
  app.togglePresetCandidateVisibility = app.togglePresetCandidateVisibility.bind(app);
  app.renderPresetManagerList = () => {};
  app.togglePresetCandidateVisibility('name',0);
  assert.deepEqual(suggestions(app,'name','김홍'),['김홍준']);
});


test('drag reorder moves across multiple rows in either direction and preserves hidden detail candidates', () => {
  const presets = { part:['가','나','다','라'] };
  const app = createApp({}, presets, { localStorage:{getItem(){return null;},setItem(){}} });
  app.renderPresetManagerList = app.renderQuickChips = () => {};
  app.reorderPresetAt('part',0,4);
  assert.deepEqual(Array.from(presets.part),['나','다','라','가']);
  app.reorderPresetAt('part',3,0);
  assert.deepEqual(Array.from(presets.part),['가','나','다','라']);
  const key=app.getAutocompleteRuleKey('part','ㄱ');
  app.autocompleteManagerContext={colKey:'part',key,items:['가','기','구','고'],hidden:['기']};
  app.reorderPresetAt('part',3,0);
  assert.deepEqual(Array.from(app.autocompleteManagerContext.items),['고','가','기','구']);
  assert.deepEqual(suggestions(app,'part','ㄱ'),['ㄱ','고','가','구']);
  assert.deepEqual(Array.from(presets.part),['가','나','다','라']);
  app.reorderPresetAt('part',-1,0);
  assert.deepEqual(Array.from(app.autocompleteManagerContext.items),['고','가','기','구']);
});

test('one-pass patient flags preserve historical identities and update after deletion', () => {
  const rows=[{name:'신규',chartNo:'20'},{name:'신규',chartNo:'20'},{name:' 기존 '},{chartNo:'10'},{name:'미래'},{}];
  const app=createApp({'2026-09-29':[{name:'기존',chartNo:'10'}],'2026-09-30':rows,'2026-10-01':[{name:'미래'}]});
  assert.deepEqual(Array.from(app.getNewPatientRowFlags(rows)),rows.map((row,index)=>app.isNewPatientRow(row,index)));
  rows.splice(0,1);
  assert.deepEqual(Array.from(app.getNewPatientRowFlags(rows)),[true,false,false,true,false]);
  app.cloudSearchHistory={'2026-09-28':[{name:'신규'}]};
  assert.equal(app.getNewPatientRowFlags(rows)[0],false);
});

test('valid cached search history does not wait for an unrelated background refresh', async () => {
  const app=createApp({});const client={from(){assert.fail('a fresh cached search must not download history again');}};
  Object.assign(app,{supabaseClient:client,searchHistoryClient:client,searchHistoryLoadedAt:Date.now(),searchHistoryLoadedPeriod:'1year_plus',searchHistoryRequestPeriod:'1year_plus'});
  app.getSearchPeriod=()=> '1year_plus';
  let finish;app.searchHistoryRequest=new Promise(resolve=>{finish=resolve;});
  assert.equal(await app.loadSearchHistory(),false);
  const forced=app.loadSearchHistory(true);finish(true);assert.equal(await forced,true);
});

test('expired cached history still waits for the in-flight refresh before deciding a miss', async () => {
  const app=createApp({});const client={};
  Object.assign(app,{supabaseClient:client,searchHistoryClient:client,searchHistoryLoadedAt:Date.now()-300001,searchHistoryLoadedPeriod:'1year_plus',searchHistoryRequestPeriod:'1year_plus'});
  app.getSearchPeriod=()=> '1year_plus';let finish,completed=false;
  app.searchHistoryRequest=new Promise(resolve=>{finish=resolve;});
  const loaded=app.loadSearchHistory().then(value=>{completed=true;return value;});
  await Promise.resolve();assert.equal(completed,false);finish(true);assert.equal(await loaded,true);
});

test('preset manager rejects duplicate normalized writer initials and keeps input for correction', () => {
  const app = createApp({}, { writer: ['J'] }, { localStorage: { getItem() { return null; }, setItem() {} } });
  let message = '', focused = 0, saves = 0;
  app.activePresetTab = 'writer';
  app.elManagerNewPresetInput = { value: ' j ', focus() { focused++; } };
  app.renderPresetManagerList = app.renderQuickChips = app.showSaveIndicator = () => {};
  app.setPresetManagerFeedback = value => { message = value; };
  app.savePresetManagerItems = () => { saves++; };
  app.addPresetFromManager();
  assert.deepEqual(Array.from(app.getPresetManagerItems('writer')), ['J']);
  assert.equal(saves, 0);
  assert.equal(app.elManagerNewPresetInput.value, ' j ');
  assert.equal(focused, 1);
  assert.match(message, /이미 등록/);
});

test('preset manager add shortcut waits for completed IME and ignores held Enter', () => {
  const app = createApp({});
  let added = 0, prevented = 0, stopped = 0;
  app.addPresetFromManager = () => { added++; };
  const event = { key: 'Enter', preventDefault() { prevented++; }, stopPropagation() { stopped++; } };
  for (const extra of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { key: 'a' }]) {
    app.handlePresetManagerAddKeyDown({ ...event, ...extra });
  }
  assert.equal(added, 0);
  app.handlePresetManagerAddKeyDown(event);
  assert.equal(added, 1);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
});

test('closing preset manager restores focus and prevents delayed input focus from reopening the editing target', () => {
  let callback, returned = 0, inputFocused = 0;
  const trigger = { isConnected: true, focus() { returned++; } };
  const app = createApp({}, {}, {
    document: { activeElement: trigger, getElementById() { return null; } },
    setTimeout(fn) { callback = fn; return 1; }, clearTimeout() {},
  });
  app.elPresetManagerModal = { style: { display: 'none' } };
  app.elManagerNewPresetInput = { value: '', focus() { inputFocused++; } };
  app.updatePresetManagerTabs = app.renderPresetManagerList = app.clearPresetDrag = () => {};
  app.openPresetManager();
  app.closePresetManager();
  callback();
  assert.equal(app.elPresetManagerModal.style.display, 'none');
  assert.equal(returned, 1);
  assert.equal(inputFocused, 0);
  app.closePresetManager();
  assert.equal(returned, 1);
});

test('stalled cloud history pages time out, release their request and retry successfully', async () => {
  let expire, signal, cleared = 0, stalled = true;
  const app = createApp({}, {}, { AbortController, setTimeout(fn, ms) { assert.equal(ms, 15000); expire = fn; return 1; }, clearTimeout() { cleared++; }, console: { warn() {} } });
  app.refreshSearchSuggestions = () => {};
  app.supabaseClient = { from() { return { select() { return this; }, order() { return this; }, abortSignal(value) { signal = value; return this; }, range() { return stalled ? new Promise(() => {}) : Promise.resolve({ data: [] }); } }; } };
  const pending = app.loadSearchHistory(); expire();
  assert.equal(await pending, false);
  assert.equal(signal.aborted, true);
  assert.equal(app.searchHistoryRequest, null);
  assert.match(app.searchHistoryLoadError.message, /시간/);
  stalled = false;
  assert.equal(await app.loadSearchHistory(), true);
  assert.equal(app.searchHistoryLoadError, null);
  assert.equal(cleared, 2);
});
