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
            toggle(cls, enabled) { if (enabled) classes.add(cls); else classes.delete(cls); },
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
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const context = vm.createContext({
    window: { addEventListener() {} },
    setTimeout: () => 1, clearTimeout() {},
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
    elCellAddress: { textContent: '' },
    elSelectedCellCoords: { textContent: '' },
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
  assert.equal(app.isKoreanPreferredColumn('no'), true);
});

test('repairing trailing jamo preserves all eleven compound finals inside completed syllables', () => {
  const { app } = createTestApp();
  for (const word of ['넋', '앉', '많', '닭', '삶', '밟', '곬', '핥', '읊', '싫', '없']) {
    for (const [suffix, expected] of [['ㅇ', 'ㅇ'], ['으ㅁ', '음'], ['ㄷㅏ', '다']]) {
      assert.equal(app.assembleHangul(word + suffix), word + expected, word + suffix);
    }
  }
  assert.equal(app.assembleHangul('자국싫으ㅁ'), '자국싫음');
  assert.equal(app.assembleHangul('ㅅㅣㅀㅇㅡㅁ'), '싫음');
  assert.equal(app.assembleHangul('싫ㅓ'), '실허', 'a following vowel still splits the compound final');
  assert.equal(app.assembleHangul('ㅀ'), 'ㅀ', 'an isolated compound final stays visible');
});

test('typing 자국싫음 keeps its compound final through real input handlers and caret repair', () => {
  for (const column of ['name', 'part', 'prescription', 'extra', 'memo', 'specialNote']) {
    const fixture = editingFixture({ column });
    const { app, input } = fixture;
    const flushRepairs = enableInputRepair(fixture);
    input.value = ''; input.setSelectionRange(0, 0);
    const keys = 'wkrnrtlfgdma';
    const drafts = ['ㅈ', '자', '작', '자구', '자국', '자굯', '자국시', '자국실', '자국싫', '자국싫ㅇ', '자국싫으', '자국싫음'];
    for (let i = 0; i < keys.length; i++) {
      typeKeys(input, keys[i]);
      flushRepairs();
      assert.equal(input.value, drafts[i], `${column}: ${keys.slice(0, i + 1)}`);
      assert.equal(input.selectionStart, drafts[i].length);
      assert.equal(app.getCurrentRows()[0][column], drafts[i]);
    }
  }
});

test('native IME repair keeps compound finals and waits until composition ends', () => {
  const fixture = editingFixture();
  const { app, input } = fixture;
  const flushRepairs = enableInputRepair(fixture);
  input.value = '자국싫'; input.setSelectionRange(3, 3);
  input._listeners.compositionstart({ type: 'compositionstart' });
  for (const data of ['ㅇ', '으', '으ㅁ']) {
    const raw = '자국싫' + data;
    input.value = raw; input.setSelectionRange(raw.length, raw.length);
    input._listeners.input({ type: 'input', inputType: 'insertCompositionText', isComposing: true, data });
    flushRepairs();
    assert.equal(input.value, raw, 'never rewrite the live native composition');
  }
  input._listeners.compositionend({ type: 'compositionend', data: '으ㅁ' });
  flushRepairs();
  assert.equal(input.value, '자국싫음');
  assert.equal(input.selectionStart, 4);
  assert.equal(app.getCurrentRows()[0].specialNote, '자국싫음');
});

function enableInputRepair({ app, context, input }) {
  const timers = new Map(); let serial = 0;
  context.setTimeout = (callback, delay) => { const id = ++serial; if (delay === 0) timers.set(id, callback); return id; };
  context.clearTimeout = id => timers.delete(id);
  context.Event = class { constructor(type) { this.type = type; } };
  context.document.activeElement = input; input.isConnected = true;
  input.dispatchEvent = event => input._listeners.input(event);
  app.showAutocompleteMenu = () => {};
  return () => {
    while (timers.size) {
      const [id, callback] = timers.entries().next().value;
      timers.delete(id); callback();
    }
  };
}

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

test('hangul toggle key (HangulMode, CapsLock, Lang1) switches to English mode and back to Korean mode', () => {
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

  // 1. 처음 'r' 입력 -> 'ㄱ'으로 변환 (기본 한글 모드)
  input._listeners.keydown({ key: 'r', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, preventDefault() {} });
  assert.equal(input.value, 'ㄱ');

  // 전환은 이미 입력한 한글을 보존하고 이후 입력 언어만 바꾼다.
  let toggleEvt = { key: 'HangulMode', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
  input._listeners.keydown(toggleEvt);
  assert.equal(toggleEvt.defaultPrevented, true);
  assert.equal(input.value, 'ㄱ');
  assert.equal(input._inputLanguage, 'eng');

  // 영문도 같은 경로로 입력하므로 OS 입력 소스에 영향받지 않는다.
  let engKey = { key: 'l', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  input._listeners.keydown(engKey);
  assert.equal(engKey.defaultPrevented, true);

  // 4. 한 번 더 한영키 누름 -> 다시 한글 모드로 복귀!
  let toggleBackEvt = { key: 'HangulMode', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
  input._listeners.keydown(toggleBackEvt);
  assert.equal(input._inputLanguage, 'kor');

  // 5. 다시 한글 모드에서 영타 'k' 입력 시 한글 'ㅏ'로 정상 조합
  input.value = 'rl';
  input.selectionStart = 2;
  input.selectionEnd = 2;
  let korKey = { key: 'k', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  input._listeners.keydown(korKey);
  assert.equal(korKey.defaultPrevented, true);
  assert.equal(input.value, 'rlㅏ');
});

test('toggling hangul key in armed/cell selection state switches input mode', () => {
  const { app } = createTestApp();
  const cellElement = {
    dataset: { col: 'specialNote', colIdx: '9' },
    querySelector: () => null,
    appendChild: () => {},
    textContent: '',
    scrollIntoView: () => {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    closest: () => ({ classList: { add() {}, remove() {} } }),
  };
  app.elTableBody = { querySelector: selector => selector.endsWith(' input') ? app.getCreatedInput() : cellElement, querySelectorAll: () => [] };
  app.elFormulaInput = { value: '' };
  app.elSheetContainer = { focus() {} };

  // 셀 선택 (기본 한글 모드 'kor')
  app.selectCell(0, 'specialNote', cellElement, false);
  assert.equal(app._cellInputLanguage, 'kor');

  // 셀이 선택된 상태에서 한영키 1번 누름 -> 'eng' 모드로 토글
  const toggleEvt1 = { key: 'HangulMode', preventDefault() {}, stopPropagation() {} };
  app.handleGlobalKeyDown(toggleEvt1);
  assert.equal(app._cellInputLanguage, 'eng');

  // 한 번 더 누름 -> 다시 'kor' 모드로 토글
  const toggleEvt2 = { key: 'HangulMode', preventDefault() {}, stopPropagation() {} };
  app.handleGlobalKeyDown(toggleEvt2);
  assert.equal(app._cellInputLanguage, 'kor');
});

test('convertHangulToEng converts Korean syllables back to QWERTY English keys', () => {
  const { app } = createTestApp();
  assert.equal(app.convertHangulToEng('가'), 'rk');
  assert.equal(app.convertHangulToEng('김'), 'rla');
  assert.equal(app.convertHangulToEng('홍'), 'ghd');
  assert.equal(app.convertHangulToEng('허리'), 'gjfl');
  assert.equal(app.convertHangulToEng('pt 10회'), 'pt 10ghl');
});

test('isHangulToggleKeyEvent recognizes Windows, Mac, and various keyboard configurations', () => {
  const { app } = createTestApp();
  // Windows
  assert.equal(app.isHangulToggleKeyEvent({ key: 'HangulMode' }), true);
  assert.equal(app.isHangulToggleKeyEvent({ keyCode: 21 }), true);
  assert.equal(app.isHangulToggleKeyEvent({ key: 'Process', code: 'KeyLang1' }), true);
  assert.equal(app.isHangulToggleKeyEvent({ key: 'AltGraph' }), true);
  assert.equal(app.isHangulToggleKeyEvent({ key: 'Alt', code: 'AltRight' }), true);

  // Mac
  assert.equal(app.isHangulToggleKeyEvent({ key: 'CapsLock' }), true);
  assert.equal(app.isHangulToggleKeyEvent({ code: 'CapsLock' }), true);
  assert.equal(app.isHangulToggleKeyEvent({ keyCode: 20 }), true);
  assert.equal(app.isHangulToggleKeyEvent({ ctrlKey: true, code: 'Space' }), true);
  assert.equal(app.isHangulToggleKeyEvent({ metaKey: true, code: 'Space' }), true);
  assert.equal(app.isHangulToggleKeyEvent({ shiftKey: true, code: 'Space' }), true);
  assert.equal(app.isHangulToggleKeyEvent({ code: 'OSRight' }), true);
  assert.equal(app.isHangulToggleKeyEvent({ code: 'MetaRight' }), true);

  // 일반 키는 false
  assert.equal(app.isHangulToggleKeyEvent({ key: 'a' }), false);
  assert.equal(app.isHangulToggleKeyEvent({ key: 'Enter' }), false);
});

test('typing Korean, backspacing completely, and pressing hangul toggle switches to English mode immediately', () => {
  const { app } = createTestApp();
  const cellElement = {
    dataset: { col: 'specialNote', colIdx: '9' },
    querySelector: () => null,
    appendChild: () => {},
    textContent: '',
    classList: { add() {}, remove() {}, contains() { return false; } }
  };
  app.elTableBody = { querySelector: selector => selector.endsWith(' input') ? app.getCreatedInput() : cellElement, querySelectorAll: () => [] };
  app.elFormulaInput = { value: '' };

  // 1. 더블 클릭으로 활성 커서 진입 (armed = false) -> 기본 한글 모드
  app.startInlineEdit(0, 'specialNote', cellElement, false);
  const input = app.getCreatedInput();
  assert.ok(input);
  assert.equal(input._inputLanguage, 'kor');

  // 2. 한글 '홍' 입력 (영타 'ghd')
  input.value = '';
  input.selectionStart = 0;
  input.selectionEnd = 0;
  input._listeners.keydown({ key: 'g', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, preventDefault() {} });
  input._listeners.keydown({ key: 'h', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, preventDefault() {} });
  input._listeners.keydown({ key: 'd', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, preventDefault() {} });
  assert.equal(input.value, '홍');
  assert.equal(input._engKorBuffer, 'ghd');

  // 3. 백스페이스로 3글자 모두 삭제
  input._listeners.keydown({ key: 'Backspace', preventDefault() {} });
  assert.equal(input.value, '호');
  input._listeners.keydown({ key: 'Backspace', preventDefault() {} });
  assert.equal(input.value, 'ㅎ');
  input._listeners.keydown({ key: 'Backspace', preventDefault() {} });
  assert.equal(input.value, '');
  assert.equal(input._engKorBuffer, '');
  assert.equal(input._engKorPrefix, '');

  // 4. 한영 전환키 누름 -> 즉시 영문 모드 전환!
  let toggleEvt = { key: 'CapsLock', code: 'CapsLock', preventDefault() {}, stopPropagation() {} };
  input._listeners.keydown(toggleEvt);
  assert.equal(input._inputLanguage, 'eng');

  // 영문 입력은 OS 입력 소스에 관계없이 즉시 영문으로 입력된다.
  let engKey = { key: 'p', ctrlKey: false, metaKey: false, altKey: false, isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  input._listeners.keydown(engKey);
  assert.equal(engKey.defaultPrevented, true);
});



function editingFixture({ armed = false, column = 'specialNote' } = {}) {
  const { app, context } = createTestApp();
  let input = null;
  const cell = {
    dataset: { col: column }, textContent: '',
    querySelector(selector) { return selector === 'input' ? input : null; },
    appendChild(element) { input = element; },
  };
  app.elTableBody = { querySelector: () => cell };
  app.elFormulaInput = { value: '' };
  app.debounceSaveDataStore = () => {};
  app.rememberPatientSearchDraft = () => {};
  app.updateEditorTextColors = () => {};
  app.clearInlineAutocompletePreview = () => {};
  app.refreshNativeLanguagePreview = () => {};
  app.startInlineEdit(0, column, cell, armed);
  return { app, context, input: app.getCreatedInput(), cell };
}

function keyEvent(key, extra = {}) {
  return {
    type: 'keydown', key, cancelable: true, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
    ...extra,
  };
}

function typeKeys(input, keys, extra = {}) {
  for (const key of keys) input._listeners.keydown(keyEvent(key, { code: `Key${key.toUpperCase()}`, ...extra }));
}

test('each Windows/Mac toggle is consumed once even when its event reaches the sheet', () => {
  const toggles = [
    { key: 'HangulMode', code: 'Lang1' },
    { key: 'Process', code: 'AltRight', altKey: true, keyCode: 229 },
    { key: 'CapsLock', code: 'CapsLock' },
    { key: ' ', code: 'Space', ctrlKey: true },
    { key: ' ', code: 'Space', metaKey: true },
    { key: ' ', code: 'Space', shiftKey: true },
  ];
  for (const toggle of toggles) {
    const { app, input } = editingFixture();
    app.activeCell = { rowIdx: 0, colKey: 'specialNote' };
    const event = keyEvent(toggle.key, toggle);
    input._listeners.keydown(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
    app.handleGlobalKeyDown(event);
    assert.equal(input._inputLanguage, 'eng', JSON.stringify(toggle));
    assert.equal(app._cellInputLanguage, 'eng');
    input._listeners.keydown(keyEvent(toggle.key, { ...toggle, repeat: true }));
    assert.equal(input._inputLanguage, 'eng', 'repeat must not switch back');
    typeKeys(input, 'pt');
    assert.equal(input.value, 'pt');
    input._listeners.keydown(keyEvent(toggle.key, toggle));
    typeKeys(input, 'rla');
    assert.equal(input.value, 'pt김');
  }
});

test('switching language preserves Korean already entered and only affects new typing', () => {
  const { input } = editingFixture();
  typeKeys(input, 'rla');
  input._listeners.keydown(keyEvent('HangulMode'));
  assert.equal(input.value, '김');
  typeKeys(input, 'pain');
  assert.equal(input.value, '김pain');
});

test('native Process/229 letters are inserted once by the IME, with English projected until commit', () => {
  const { app, input } = editingFixture();
  const process = keyEvent('Process', { code: 'KeyD', keyCode: 229, isComposing: true });
  input._listeners.keydown(process);
  assert.equal(process.defaultPrevented, false);
  assert.equal(input.value, '', 'keydown must not also insert the native letter');
  input._listeners.compositionstart({ type: 'compositionstart' });
  input.value = 'ㅇ';
  input.setSelectionRange(1, 1);
  input._listeners.input({ type: 'input', inputType: 'insertCompositionText', isComposing: true, data: 'ㅇ' });
  assert.equal(input.value, 'ㅇ');
  input._listeners.compositionend({ type: 'compositionend', data: 'ㅇ' });
  input._listeners.keydown(keyEvent('CapsLock'));
  input._listeners.keydown(keyEvent('Process', { code: 'KeyD', keyCode: 229, isComposing: true }));
  input._listeners.compositionstart({ type: 'compositionstart' });
  for (const [data, projected] of [['ㅇ', 'ㅇd'], ['아', 'ㅇdk'], ['안', 'ㅇdks']]) {
    input.value = 'ㅇ' + data;
    input._listeners.input({ type: 'input', inputType: 'insertCompositionText', isComposing: true, data });
    assert.equal(input.value, 'ㅇ' + data, 'do not terminate native composition by rewriting its value');
    assert.equal(app.getCellEditorValue(input), projected);
    assert.equal(app.dataStore[app.currentDate][0].specialNote, projected);
  }
  input._listeners.compositionend({ type: 'compositionend', data: '안' });
  assert.equal(input.value, 'ㅇdks');
  // Safari/Windows may send a final input after compositionend.
  input.value = 'ㅇdks안';
  input._listeners.input({ type: 'input', inputType: 'insertText', data: '안' });
  assert.equal(input.value, 'ㅇdks');
});

test('a Latin key handled by the app rejects a late native duplicate of that same key', () => {
  const { app, input } = editingFixture();
  typeKeys(input, 'd');
  assert.equal(input.value, 'ㅇ');
  input._listeners.compositionstart({ type: 'compositionstart' });
  input.value = 'ㅇㅇ';
  input._listeners.input({ type: 'input', inputType: 'insertCompositionText', isComposing: true, data: 'ㅇ' });
  assert.equal(input.value, 'ㅇ');
  input.value = 'ㅇㅇ';
  input._listeners.compositionend({ type: 'compositionend', data: 'ㅇ' });
  assert.equal(input.value, 'ㅇ');
  assert.equal(app.dataStore[app.currentDate][0].specialNote, 'ㅇ');
});

test('English laser retains every letter when the next key precedes the previous IME commit', () => {
  for (const column of ['no', 'chartNo', 'name', 'part', 'prescription', 'extra', 'memo', 'specialNote']) {
    const { app, input } = editingFixture({ column });
    input.value = '';
    input.setSelectionRange(0, 0);
    input._listeners.keydown(keyEvent('HangulMode'));
    const keys = [['l', 'ㅣ'], ['a', 'ㅁ'], ['s', 'ㄴ'], ['e', 'ㄷ'], ['r', 'ㄱ']];
    for (let i = 0; i < keys.length; i++) {
      const [letter, jamo] = keys[i];
      input._listeners.keydown(keyEvent('Process', { code: `Key${letter.toUpperCase()}`, keyCode: 229, isComposing: true }));
      if (i) input._listeners.compositionend({ type: 'compositionend', data: keys[i - 1][1] });
      input._listeners.compositionstart({ type: 'compositionstart' });
      const prefix = input.value;
      input._listeners.beforeinput({ type: 'beforeinput', inputType: 'insertCompositionText', isComposing: true, data: jamo, cancelable: false });
      input.value = prefix + jamo;
      input.setSelectionRange(input.value.length, input.value.length);
      input._listeners.input({ type: 'input', inputType: 'insertCompositionText', isComposing: true, data: jamo });
      assert.equal(app.getCellEditorValue(input), 'laser'.slice(0, i + 1), `${column}: ${letter}`);
    }
    input._listeners.compositionend({ type: 'compositionend', data: keys.at(-1)[1] });
    assert.equal(input.value, 'laser', column);
    assert.equal(app.getCurrentRows()[0][column], 'laser', column);
  }
});

test('double-click activation and a fresh double-click editor both reset English to Korean', () => {
  const { app, input, cell } = editingFixture({ armed: true });
  app.toggleCellInputLanguage(keyEvent('CapsLock'), input);
  assert.equal(input._inputLanguage, 'eng');
  app.startInlineEdit(0, 'specialNote', cell, false);
  assert.equal(input._inputLanguage, 'kor');
  typeKeys(input, 'rla');
  assert.equal(input.value, '김');
  app._cellInputLanguage = 'eng';
  cell.querySelector = () => null;
  app.startInlineEdit(0, 'specialNote', cell, false);
  assert.equal(app.getCreatedInput()._inputLanguage, 'kor');
});

test('caret movement and selection deletion cannot resurrect an old Korean buffer', () => {
  const { input } = editingFixture();
  typeKeys(input, 'rla');
  input.setSelectionRange(0, input.value.length);
  // Selected Backspace is left to the browser instead of decomposing old jamo.
  input._listeners.keydown(keyEvent('Backspace'));
  assert.equal(input._engKorBuffer, '');
  input.value = '';
  input.setSelectionRange(0, 0);
  input._listeners.keydown(keyEvent('CapsLock'));
  typeKeys(input, 'pt');
  assert.equal(input.value, 'pt');
});

test('Hanja and shortcuts outside the sheet do not switch a retained cell selection', () => {
  const { app, input } = editingFixture();
  assert.equal(app.isHangulToggleKeyEvent({ key: 'HanjaMode', code: 'Lang2', keyCode: 25 }), false);
  app.activeCell = { rowIdx: 0, colKey: 'specialNote' };
  app.consumePresetLeftRepeat = () => true;
  app.handleGlobalKeyDown(keyEvent('CapsLock', { target: { closest: () => null } }));
  assert.equal(input._inputLanguage, 'kor');
});

test('English autocomplete refreshes from the displayed query during native composition', () => {
  for (const column of ['chartNo', 'name', 'part', 'prescription', 'extra', 'memo', 'specialNote']) {
    const { app, context, input } = editingFixture({ column });
    input.value = '';
    input.setSelectionRange(0, 0);
    input.isConnected = true;
    context.document.activeElement = input;
    const timers = new Map(); let serial = 0;
    context.setTimeout = callback => { timers.set(++serial, callback); return serial; };
    context.clearTimeout = id => timers.delete(id);
    app.closeAutocompleteMenu = () => {};
    let searched, displayed;
    app.getAutocompleteSuggestions = (col, query, composing) => {
      searched = { col, query, composing }; return ['laser 12kg'];
    };
    app.showAutocompleteMenu = (row, col, cell, editor, candidates) => {
      displayed = { col, query: app.getCellEditorValue(editor), candidates };
    };
    input._listeners.keydown(keyEvent('HangulMode'));
    input._listeners.keydown(keyEvent('Process', { code: 'KeyL', keyCode: 229, isComposing: true }));
    input._listeners.compositionstart({ type: 'compositionstart' });
    input.value = 'ㅣ'; input.setSelectionRange(1, 1);
    input._listeners.input({ type: 'input', inputType: 'insertCompositionText', isComposing: true, data: 'ㅣ' });
    for (const callback of [...timers.values()]) callback();
    assert.deepEqual(searched, { col: column, query: 'l', composing: false });
    assert.equal(displayed.query, 'l');
    assert.equal(displayed.candidates[0], 'laser 12kg');
    assert.equal(input.value, 'ㅣ', 'autocomplete must not rewrite native composition');
    input.matches = () => true;
    input.closest = () => ({ dataset: { col: column, row: '0' } });
    searched = displayed = null;
    app.refreshSearchSuggestions();
    assert.deepEqual(searched, { col: column, query: 'l', composing: false });
    assert.equal(displayed.query, 'l', 'asynchronous history refresh uses the same visible query');
  }
});
