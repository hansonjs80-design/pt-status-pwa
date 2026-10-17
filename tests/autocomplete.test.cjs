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

test('exact duplicates across dates and presets are shown once while case variants remain selectable', () => {
  const app = createApp({
    '2026-09-30': [{ name: 'Kim', chartNo: '12345' }],
    '2026-09-29': [{ name: ' KIM ', chartNo: 12345 }, null],
    '2026-09-28': [{ name: 'kim', chartNo: '12345' }, { name: 'Kim', chartNo: '12345' }],
  }, { name: ['Kim'] });
  assert.deepEqual(suggestions(app, 'name', 'ki'), ['Kim', 'KIM', 'kim']);
  assert.deepEqual(suggestions(app, 'chartNo', '123'), ['123', '12345']);
  assert.deepEqual(suggestions(app, 'name', 'Kim'), ['Kim', 'KIM', 'kim']);
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
        select(columns) { assert.equal(columns, 'date, rows_data, updated_at'); return this; },
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

test('initial-specific special notes survive syllable composition and honor explicit edits', () => {
  const presets = {
    specialNote: ['아토피 > MW'],
    '__query:specialNote:ㅇ': ['여자T', '안 들리심', '올인원'],
  };
  const app = createApp({}, presets);
  for (const composing of [false, true]) {
    for (const query of ['ㅇ', '아', '안', '안 ㄷ', '안 드', '안 들']) {
      assert.ok(Array.from(app.getAutocompleteSuggestions('specialNote', query, composing)).includes('안 들리심'), query);
    }
    for (const query of ['어', '오', '앗', '김']) {
      assert.equal(Array.from(app.getAutocompleteSuggestions('specialNote', query, composing)).includes('안 들리심'), false, query);
    }
  }
  presets['__hidden:specialNote:ㅇ'] = ['안 들리심'];
  assert.equal(suggestions(app, 'specialNote', '아').includes('안 들리심'), false);
  delete presets['__hidden:specialNote:ㅇ'];
  presets['__query:specialNote:아'] = ['아토피 > MW'];
  assert.deepEqual(suggestions(app, 'specialNote', '아'), ['아토피 > MW']);
  presets['__query:specialNote:아'] = [];
  assert.deepEqual(suggestions(app, 'specialNote', '아'), []);
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
  const prescriptionInput = { value: '사지', dataset: {} };
  app.showAutocompleteMenu(0, 'prescription', cell, prescriptionInput, ['척추', '사지', '한랭'], { includeTypedValue: false, preferCurrentValue: true });
  assert.equal(app.autocompleteState.selectedIndex, 1);
  assert.equal(app.getSelectedAutocompleteItem(), '사지');
  app.closeAutocompleteMenu();
  prescriptionInput.value = '';
  app.showAutocompleteMenu(0, 'prescription', cell, prescriptionInput, ['척추', '사지', '한랭'], { includeTypedValue: false, preferCurrentValue: true });
  assert.equal(app.autocompleteState.selectedIndex, 0);
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
  const pending = app.loadSearchHistory();
  for (let attempt = 0; attempt < 4; attempt++) {
    expire();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(await pending, false);
  assert.equal(signal.aborted, true);
  assert.equal(app.searchHistoryRequest, null);
  assert.match(app.searchHistoryLoadError.message, /시간/);
  stalled = false;
  assert.equal(await app.loadSearchHistory(), true);
  assert.equal(app.searchHistoryLoadError, null);
  assert.equal(cleared, 5);
});

function createVersionedHistoryFixture(cap = 200) {
  const app=createApp({});const requests=[];
  app.getSearchPeriod=()=> '1year_plus';app.refreshSearchSuggestions=()=>{};
  let records=[{date:'2026-09-01',updated_at:'v1',rows_data:[{name:'가상환자',chartNo:'100'}]}];
  let fail=false;
  app.supabaseClient={from(){let columns,dates;return {
    select(value){columns=value;return this;},order(){return this;},
    in(key,value){dates=value;return this;},
    async range(start,end){
      requests.push({columns,dates,start,end});
      if(fail)return {error:new Error('offline')};
      const selected=records.filter(row=>!dates||dates.includes(row.date));
      const data=selected.slice(start,Math.min(end+1,start+cap)).map(row=>columns==='date, updated_at'?{date:row.date,updated_at:row.updated_at}:row);
      return {data,count:selected.length};
    }
  };}};
  return {app,requests,setRecords(value){records=value;},fail(value){fail=value;}};
}

test('expired unchanged history validates only timestamps without reloading patient details or an empty last page', async () => {
  const {app,requests}=createVersionedHistoryFixture();
  assert.equal(await app.loadSearchHistory(),true);
  assert.equal(requests.length,1,'exact total avoids an empty final request');
  const before=app.cloudSearchHistory['2026-09-01'];
  app.searchHistoryLoadedAt=0;
  assert.equal(await app.loadSearchHistory(),true);
  assert.equal(requests.length,2);
  assert.equal(requests[1].columns,'date, updated_at');
  assert.equal(app.cloudSearchHistory['2026-09-01'],before);
  assert.equal(app.hasRecordedPatientValue('없는환자',0,'name'),false);
});

test('version validation fetches new, changed and null-timestamp dates and honors server caps', async () => {
  const {app,requests,setRecords}=createVersionedHistoryFixture(1);
  await app.loadSearchHistory();
  setRecords([
    {date:'2026-09-01',updated_at:'v2',rows_data:[{name:'변경가상환자'}]},
    {date:'2026-08-31',updated_at:null,rows_data:[{name:'이전가상환자'}]},
    {date:'2025-01-01',updated_at:'old',rows_data:[{name:'옛가상환자'}]},
  ]);
  app.searchHistoryLoadedAt=0;
  assert.equal(await app.loadSearchHistory(),true);
  assert.equal(app.cloudSearchHistory['2026-09-01'][0].name,'변경가상환자');
  assert.equal(app.cloudSearchHistory['2025-01-01'][0].name,'옛가상환자');
  const changed=requests.filter(r=>r.dates);
  assert.equal(changed.length,3,'server caps must not truncate changed-date downloads');
  assert.equal(changed[2].start,2);
  requests.length=0;app.searchHistoryLoadedAt=0;
  await app.loadSearchHistory();
  const nullRefresh=requests.filter(r=>r.dates);
  assert.equal(nullRefresh.length,1);
  assert.deepEqual(Array.from(nullRefresh[0].dates),['2026-08-31'],'null timestamp is never treated as safely unchanged');
});

test('failed timestamp validation retains records and does not mark an expired cache fresh', async () => {
  const {app,fail}=createVersionedHistoryFixture();await app.loadSearchHistory();
  app.searchHistoryLoadedAt=0;fail(true);
  assert.equal(await app.loadSearchHistory(),false);
  assert.equal(app.searchHistoryLoadedAt,0);
  assert.equal(app.cloudSearchHistory['2026-09-01'][0].name,'가상환자');
  assert.match(app.searchHistoryLoadError.message,/offline/);
});

test('explicit forced history reload still downloads complete records for backup and bulk-edit checks', async () => {
  const {app,requests}=createVersionedHistoryFixture();await app.loadSearchHistory();
  requests.length=0;
  await app.loadSearchHistory(true);
  assert.equal(requests.length,1);
  assert.equal(requests[0].columns,'date, rows_data, updated_at');
  assert.equal(requests[0].dates,undefined);
});

test('a forced reload during lightweight validation waits then performs its own complete download', async () => {
  const {app,requests}=createVersionedHistoryFixture();await app.loadSearchHistory();
  requests.length=0;app.searchHistoryLoadedAt=0;
  const original=app.readSearchHistoryPages;let finish;
  app.readSearchHistoryPages=function(client,columns,...rest){
    if(columns==='date, updated_at')return new Promise(resolve=>{finish=resolve;});
    return original.call(this,client,columns,...rest);
  };
  const background=app.loadSearchHistory();const forced=app.loadSearchHistory(true);
  finish([{date:'2026-09-01',updated_at:'v1'}]);
  await Promise.all([background,forced]);
  assert.equal(requests.length,1);assert.equal(requests[0].columns,'date, rows_data, updated_at');
});

test('native editor reuses historical candidates and formatting while current-day edits remain live', () => {
  const input={isConnected:true,matches:()=>true};const document={activeElement:input};
  const app=createApp({'2026-09-30':[{name:'김오늘'}],'2026-09-29':[{name:'김과거',_textColors:{name:'#ff0000'}}]}, {}, {document});
  const original=app.getSearchDataStore;let reads=0;app.getSearchDataStore=function(){reads++;return original.call(this);};
  assert.deepEqual(suggestions(app,'name','김'),['김오늘','김과거']);
  assert.deepEqual(suggestions(app,'name','김과'),['김과거']);
  assert.equal(app.getAutocompleteValueFormatting('name','김과거').color,'#ff0000');
  assert.equal(app.getAutocompleteValueFormatting('name','김과거').color,'#ff0000');
  assert.equal(reads,1,'each keystroke and candidate color share one history snapshot');
  app.dataStore['2026-09-30'][0].name='김변경';
  assert.deepEqual(suggestions(app,'name','김'),['김변경','김과거']);
  assert.equal(reads,1,'current-day changes must not rebuild every historical row');
  document.activeElement={isConnected:true,matches:()=>true};suggestions(app,'name','김');
  assert.equal(reads,2,'a new editor gets a new snapshot');
});

test('history snapshots refresh for cloud changes, same-array sync edits, date changes and undo row replacement', () => {
  const document={activeElement:{isConnected:true,matches:()=>true}};
  const app=createApp({'2026-09-30':[],'2026-09-29':[{name:'김옛값'}]}, {}, {document});
  assert.ok(suggestions(app,'name','김').includes('김옛값'));
  app.dataStore['2026-09-29'][0].name='김동기화';app.invalidateAutocompleteHistory();
  assert.deepEqual(suggestions(app,'name','김'),['김동기화']);
  app.cloudSearchHistory={'2026-09-28':[{name:'김클라우드'}]};
  assert.ok(suggestions(app,'name','김').includes('김클라우드'));
  app.dataStore['2026-09-30']=[{name:'김복원'}];
  assert.ok(suggestions(app,'name','김').includes('김복원'));
  app.currentDate='2026-09-29';assert.ok(suggestions(app,'name','김').includes('김동기화'));
  assert.equal(app.getAutocompleteSearchSnapshot().date,'2026-09-29');
});

test('cached formatting chooses the latest matching date and skips the excluded row without caching current-day color', () => {
  const document={activeElement:{isConnected:true,matches:()=>true}};
  const latest={name:'동일',_textColors:{name:'#ff0000'}},second={name:'동일',_textColors:{name:'#00ff00'}};
  const app=createApp({'2026-09-30':[latest,second],'2026-09-29':[{name:'동일',_textColors:{name:'#0000ff'}}]}, {}, {document});
  assert.equal(app.getAutocompleteValueFormatting('name','동일',null,latest).color,'#00ff00');
  second._textColors.name='#123456';
  assert.equal(app.getAutocompleteValueFormatting('name','동일',null,latest).color,'#123456');
  app.cloudSearchHistory={'2026-10-01':[{name:'동일',_textColors:{name:'#abcdef'}}]};
  assert.equal(app.getAutocompleteValueFormatting('name','동일',null,latest).color,'#abcdef','future-date ranking is unchanged');
});

test('native English menu query and typed-value option use visible English instead of hidden Korean', () => {
  let menu = null;
  const element = () => ({ style: {}, children: [], isConnected: true, offsetWidth: 160, offsetHeight: 100,
    appendChild(child) { this.children.push(child); }, setAttribute() {}, addEventListener() {}, remove() { menu = null; } });
  const document = { createElement: element, getElementById: () => menu,
    body: { appendChild(child) { menu = child; } }, addEventListener() {}, removeEventListener() {} };
  const window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1000, innerHeight: 800 };
  const app = createApp({}, { specialNote: ['laser 12kg', 'laser 20kg'] }, { document, window });
  app.moveAutocompleteSelection = () => {};
  app.updateInlineAutocompletePreview = () => {};
  const cell = { isConnected: true, getBoundingClientRect: () => ({left: 100, top: 100, bottom: 130, width: 100}) };
  const input = { value: 'lㅁ', dataset: {}, _inputLanguage: 'eng', _nativeCellComposition: {prefix:'l',suffix:'',data:'ㅁ'} };
  app.showAutocompleteMenu(0, 'specialNote', cell, input, ['laser 12kg', 'laser 20kg']);
  assert.equal(app.autocompleteState.query, 'la');
  assert.equal(input.dataset.autocompleteQuery, 'la');
  assert.deepEqual(Array.from(app.autocompleteState.candidates), ['la', 'laser 12kg', 'laser 20kg']);
  app.autocompleteState.selectedIndex = 2;
  input.value = 'la'; delete input._nativeCellComposition;
  app.showAutocompleteMenu(0, 'specialNote', cell, input, ['laser 12kg', 'laser 20kg']);
  assert.equal(app.getSelectedAutocompleteItem(), 'laser 20kg', 'native commit preserves candidate selection');
});

test('historical English case variants remain distinct for every autocomplete column', () => {
  for (const col of ['chartNo', 'name', 'part', 'prescription', 'extra', 'memo', 'specialNote']) {
    const app = createApp({
      '2026-09-30': [],
      '2026-09-29': [{ [col]: 'MW' }, { [col]: 'mw' }],
      '2026-09-28': [{ [col]: 'MW' }, { [col]: 'Mw' }],
    });
    const variants = suggestions(app, col, 'm');
    for (const value of ['MW', 'mw', 'Mw']) assert.equal(variants.filter(item => item === value).length, 1, `${col}: ${value}`);
    assert.ok(suggestions(app, col, 'mw').includes('MW'), `${col}: full lowercase query must retain uppercase history`);
    assert.ok(suggestions(app, col, 'MW').includes('mw'), `${col}: full uppercase query must retain lowercase history`);
  }
});

test('lowercase input keeps registered case variants in the menu and commits their exact spelling', () => {
  for (const native of [false, true]) {
    let menu = null, committed = null;
    const element = () => ({ style: {}, children: [], listeners: {}, isConnected: true, offsetWidth: 160, offsetHeight: 100,
      appendChild(child) { this.children.push(child); }, setAttribute() {},
      addEventListener(type, callback) { this.listeners[type] = callback; }, remove() { menu = null; } });
    const document = { createElement: element, getElementById: () => menu,
      body: { appendChild(child) { menu = child; } }, addEventListener() {}, removeEventListener() {} };
    const window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1000, innerHeight: 800 };
    const presets = { '__query:specialNote:mw': ['MW', 'Mw', 'MW말고 ICT선호'] };
    const app = createApp({'2026-09-30': [{}]}, presets, { document, window });
    app.moveAutocompleteSelection = () => {};
    app.updateInlineAutocompletePreview = () => {};
    app.selectCell = () => {};
    const cell = { isConnected: true, getBoundingClientRect: () => ({left: 100, top: 100, bottom: 130, width: 100}) };
    const input = { value: native ? 'mㅈ' : 'mw', dataset: {}, _inputLanguage: 'eng',
      commitAutocompleteValue(value) { committed = value; return true; } };
    if (native) input._nativeCellComposition = { prefix: 'm', suffix: '', data: 'ㅈ' };
    const show = () => app.showAutocompleteMenu(0, 'specialNote', cell, input, app.getAutocompleteSuggestions('specialNote', app.getCellEditorValue(input)));
    show();
    assert.deepEqual(Array.from(app.autocompleteState.candidates), ['mw', 'MW', 'Mw', 'MW말고 ICT선호']);
    assert.equal(app.getSelectedAutocompleteItem(), 'MW', 'registered uppercase spelling stays preferred');
    app.autocompleteState.selectedIndex = 2;
    show();
    assert.equal(app.getSelectedAutocompleteItem(), 'Mw', 'refresh must preserve the exact selected case');
    menu.children[1].listeners.click({stopPropagation() {}});
    assert.equal(committed, 'MW');
    show();
    let managed;
    app.openPresetManager = (col, context) => { managed = context; };
    app.openAutocompletePresetManager('specialNote', 'MW', input);
    assert.equal(managed.query, 'mw');
    assert.deepEqual(Array.from(managed.items), ['MW', 'Mw', 'MW말고 ICT선호']);
  }
});

test('preset whole and character weights persist, render and apply with query precedence', () => {
  const presets={specialNote:['허리핀']};
  const app=createApp({},presets,{localStorage:{getItem(){return null;},setItem(){}}});
  app.setAutocompleteValueColor('specialNote','허리핀','#123456',null,600);
  const scope=app.getAutocompleteRuleKey('specialNote','허');
  app.setAutocompleteValueColor(scope,'허리핀',null,{text:'허리핀',colors:[null,null,null],styles:[null,null,{fontWeight:900}]},400);
  const formatting=app.getAutocompleteValueFormatting('specialNote','허리핀','허');
  assert.equal(formatting.fontWeight,400);assert.equal(formatting.richText.styles[2].fontWeight,900);
  assert.equal(app.getAutocompleteValueFormatting('specialNote','허리핀').fontWeight,600);
  const row={specialNote:'허리핀'};app.applyAutocompleteColor(row,'specialNote','허리핀','허');
  assert.equal(app.getCellFormatting(row,'specialNote','fontWeight'),400);
  assert.equal(app.getEffectiveCellRichText(row,'specialNote').styles[2].fontWeight,900);
  row._richText.specialNote.styles[2].fontWeight=500;
  assert.equal(app.getAutocompleteValueFormatting('specialNote','허리핀','허').richText.styles[2].fontWeight,900);
  app.setAutocompleteValueColor('specialNote','허리핀','#abcdef');
  assert.equal(app.getAutocompleteValueFormatting('specialNote','허리핀').fontWeight,600,'color-only edits preserve weight');
  const relaunched=createApp({},JSON.parse(JSON.stringify(presets)));
  assert.equal(relaunched.getAutocompleteValueFormatting('specialNote','허리핀','허').fontWeight,400);
});

test('candidate weights inherit the latest formatted history record', () => {
  const app=createApp({'2026-09-28':[{part:'허리',_textStyles:{part:{fontWeight:700}}}],'2026-09-29':[{part:'허리',_textStyles:{part:{fontWeight:500}}}]});
  assert.equal(app.getAutocompleteValueFormatting('part','허리').fontWeight,500);
  const target={part:'허리'};app.applyAutocompleteColor(target,'part','허리');
  assert.equal(app.getCellFormatting(target,'part','fontWeight'),500);
});

test('history text edits persist weights only after the existing backup succeeds', async () => {
  const presets={memo:['기존']};
  const app=createApp({'2026-09-29':[{memo:'기존',_textStyles:{memo:{fontWeight:400}}}]},presets,{localStorage:{getItem(){return null;},setItem(){}}});
  app.syncBaselines=new Map();app.pendingSyncDates=new Set();let backedUp=false;
  app.persistTextEditBackup=async()=>{backedUp=true;};
  app.persistSyncBaselines=async()=>{assert.equal(backedUp,true);};
  app.persistDataStore=async()=>{assert.equal(backedUp,true);};
  app.scheduleSupabaseSync=()=>{};
  assert.equal(await app.renameAutocompleteValue('memo','기존','변경',null,null,800),1);
  assert.equal(app.getCellFormatting(app.dataStore['2026-09-29'][0],'memo','fontWeight'),800);
  assert.equal(app.getAutocompleteValueFormatting('memo','변경').fontWeight,800);
});

test('query-specific whole formatting masks lower-priority character formatting', () => {
  const presets={};const app=createApp({},presets,{localStorage:{getItem(){return null;},setItem(){}}});
  app.setAutocompleteValueColor('memo','문구','#ff0000',{text:'문구',colors:[null,'#0000ff'],styles:[null,{fontWeight:900}]},700);
  app.setAutocompleteValueColor(app.getAutocompleteRuleKey('memo','문'),'문구',null,null,400);
  const formatted=app.getAutocompleteValueFormatting('memo','문구','문');
  assert.equal(formatted.color,null);assert.equal(formatted.fontWeight,400);assert.equal(formatted.richText,null);
});

test('stale autocomplete mouse actions refresh the visible query without committing or opening old settings', () => {
  for(const change of ['typing','forced projection','detached editor','replaced menu','date']) {
    let menu=null,committed=null,managed=0,refreshes=0;
    const element=()=>({style:{},children:[],listeners:{},isConnected:true,offsetWidth:160,offsetHeight:100,
      appendChild(child){this.children.push(child);},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;},remove(){menu=null;}});
    const document={createElement:element,getElementById:()=>menu,body:{appendChild(child){menu=child;}},addEventListener(){},removeEventListener(){}};
    const window={addEventListener(){},removeEventListener(){},innerWidth:1000,innerHeight:800};
    const app=createApp({'2026-09-30':[{}]}, {}, {document,window});
    app.updateInlineAutocompletePreview=()=>{};app.moveAutocompleteSelection=()=>{};app.selectCell=()=>{};
    app.refreshSearchSuggestions=()=>{refreshes++;};app.openAutocompletePresetManager=()=>{managed++;};
    const cell={isConnected:true,getBoundingClientRect:()=>({left:100,top:100,bottom:130,width:100})};
    const input={value:'La',dataset:{},isConnected:true,commitAutocompleteValue(value){committed=value;return true;}};
    app.showAutocompleteMenu(0,'specialNote',cell,input,['Laser']);
    const item=menu.children[1],button=item.children[1];
    if(change==='typing')input.value='ICT';
    if(change==='forced projection')input._forcedCorrectionProjection={value:'MW'};
    if(change==='detached editor')input.isConnected=false;
    if(change==='replaced menu')menu=element();
    if(change==='date')app.currentDate='2026-10-01';
    const event={preventDefault(){},stopPropagation(){}};
    item.listeners.click(event);button.listeners.click(event);
    assert.equal(committed,null,change);assert.equal(managed,0,change);
    if(change==='typing'||change==='forced projection')assert.equal(refreshes,2,change);
  }
});
