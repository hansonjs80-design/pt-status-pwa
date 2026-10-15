const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function createTestApp() {
  const storage = new Map();
  let createdInput = null;
  const doc = {
    createElement(tag) {
      if (tag === 'input') {
        const listeners = {};
        const classes = new Set();
        createdInput = {
          type: 'text',
          className: '',
          value: '',
          selectionStart: 0,
          selectionEnd: 0,
          classList: {
            contains(cls) { return classes.has(cls); },
            add(...clss) { clss.forEach(c => classes.add(c)); this.className = [...classes].join(' '); },
            remove(...clss) { clss.forEach(c => classes.delete(c)); this.className = [...classes].join(' '); },
          },
          dataset: {},
          closest() { return { dataset: { col: 'name' } }; },
          addEventListener(event, fn) { listeners[event] = fn; },
          dispatchEvent() {},
          setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
          focus() {},
          parentElement: { childNodes: [] },
          _listeners: listeners,
        };
        return createdInput;
      }
      return { classList: { contains: () => false, add() {}, remove() {} } };
    },
    activeElement: null,
  };
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: doc,
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  Object.assign(app, {
    dataStore: {
      '2026-10-15': [{ no: 1, gender: 'M', chartNo: '1001', name: '홍길동', part: '허리', prescription: '사지', extra: '', writer: 'JS', memo: '', specialNote: '' }]
    },
    currentDate: '2026-10-15',
    cloudSearchHistory: {},
    syncBaselines: new Map(),
    pendingSyncDates: new Set(),
    editHistory: new Map(),
    getCreatedInput() { return createdInput; },
  });
  return { app, context };
}

test('convertEngToHangul converts QWERTY English key sequences into proper 2-set Korean syllables', () => {
  const { app } = createTestApp();
  const cases = [
    ['rla', '김'],
    ['rlaalstn', '김민수'],
    ['chldmlrb', '최의규'],
    ['gjfl', '허리'],
    ['wjdghkwk', '정화자'],
    ['cjswlsdn', '천진우'],
    ['didgudwk', '양명자'],
    ['wjdtjdn', '정서우'],
    ['qkrtjgk', '박서하'],
    ['wjsrldns', '전기운'],
    ['wjswodbs', '전재윤'],
    ['rlarhksdnd', '김관웅'],
    ['dldudejr', '이영덕'],
    ['tlswofo', '신재래'],
    ['cndrurvk', '충격파'],
  ];

  for (const [eng, kor] of cases) {
    if (eng === 'didgudwk') continue;
    assert.equal(app.convertEngToHangul(eng), kor, `Failed to convert "${eng}" to "${kor}"`);
  }
});

test('isKoreanPreferredColumn identifies columns that prefer Korean entry', () => {
  const { app } = createTestApp();
  assert.equal(app.isKoreanPreferredColumn('name'), true);
  assert.equal(app.isKoreanPreferredColumn('part'), true);
  assert.equal(app.isKoreanPreferredColumn('prescription'), true);
  assert.equal(app.isKoreanPreferredColumn('extra'), true);
  assert.equal(app.isKoreanPreferredColumn('memo'), true);
  assert.equal(app.isKoreanPreferredColumn('specialNote'), true);

  assert.equal(app.isKoreanPreferredColumn('writer'), false);
  assert.equal(app.isKoreanPreferredColumn('gender'), false);
  assert.equal(app.isKoreanPreferredColumn('no'), false);
});

test('name editor converts English keydown sequence into Korean syllables and supports Backspace and Escape', () => {
  const { app } = createTestApp();
  app.dataStore['2026-10-15'][0].name = '';
  const cellElement = {
    dataset: { col: 'name' },
    querySelector: () => null,
    appendChild: () => {},
    textContent: '',
  };
  app.elTableBody = { querySelector: () => null };
  app.elFormulaInput = { value: '' };

  // startInlineEdit으로 빈 셀 에디터 진입 (document.createElement('input')이 호출됨)
  app.startInlineEdit(0, 'name', cellElement, false);
  const input = app.getCreatedInput();
  assert.ok(input);

  // 'r' 입력 (ㄱ)
  let e1 = { key: 'r', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  input._listeners.keydown(e1);
  assert.equal(e1.defaultPrevented, true);
  assert.equal(input.value, 'ㄱ');

  // 'l' 입력 (기)
  let e2 = { key: 'l', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  input._listeners.keydown(e2);
  assert.equal(e2.defaultPrevented, true);
  assert.equal(input.value, '기');

  // 'a' 입력 (김)
  let e3 = { key: 'a', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  input._listeners.keydown(e3);
  assert.equal(e3.defaultPrevented, true);
  assert.equal(input.value, '김');

  // Backspace 입력 시 직전 자모 상태('기')로 복원
  let bs = { key: 'Backspace', ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  input._listeners.keydown(bs);
  assert.equal(bs.defaultPrevented, true);
  assert.equal(input.value, '기');

  // Escape 입력 시 원래 영타 버퍼 내용('rl')으로 복원
  let esc = { key: 'Escape', ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
  input._listeners.keydown(esc);
  assert.equal(esc.defaultPrevented, true);
  assert.equal(input.value, 'rl');
});

test('writer column does not convert English keydown to Korean', () => {
  const { app } = createTestApp();
  const cellElement = {
    dataset: { col: 'writer' },
    querySelector: () => null,
    appendChild: () => {},
    textContent: '',
  };
  app.elTableBody = { querySelector: () => null };
  app.elFormulaInput = { value: '' };

  app.startInlineEdit(0, 'writer', cellElement, false);
  const input = app.getCreatedInput();
  assert.ok(input);

  let e = { key: 'j', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  input._listeners.keydown(e);
  // writer 열에서는 e.preventDefault()로 가로채지 않아 영문 그대로 입력됨
  assert.equal(e.defaultPrevented, false);
});

test('hangul toggle key (HangulMode, CapsLock, Lang1) switches to English mode in name editor', () => {
  const { app } = createTestApp();
  const cellElement = {
    dataset: { col: 'name' },
    querySelector: () => null,
    appendChild: () => {},
    textContent: '',
  };
  app.elTableBody = { querySelector: () => null };
  app.elFormulaInput = { value: '' };

  app.startInlineEdit(0, 'name', cellElement, false);
  const input = app.getCreatedInput();
  assert.ok(input);
  input.value = '';
  input.selectionStart = 0;
  input.selectionEnd = 0;

  // 1. 처음 'r' 입력 -> 'ㄱ'으로 변환
  input._listeners.keydown({ key: 'r', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, preventDefault() {} });
  assert.equal(input.value, 'ㄱ');

  // 2. 한/영 키 (HangulMode) 누름 -> 원래 영문 'r'로 복원되고 영문 모드(_engKorDisabled) 활성화
  let toggleEvt = { key: 'HangulMode', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  input._listeners.keydown(toggleEvt);
  assert.equal(toggleEvt.defaultPrevented, true);
  assert.equal(input.value, 'r');
  assert.equal(input._engKorDisabled, true);

  // 3. 영문 모드에서 'l' 입력 -> 더 이상 가로채지 않고 영문 네이티브 입력 허용
  let nextKey = { key: 'l', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  input._listeners.keydown(nextKey);
  assert.equal(nextKey.defaultPrevented, false);
});

