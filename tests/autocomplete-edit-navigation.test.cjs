const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function createApp(dataStore = {}, presets = {}) {
  const storage = new Map();
  const context = vm.createContext({
    window: { addEventListener() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') +
    '\nglobalThis.App = PTApp; globalThis.setPresets = v => COLUMN_PRESETS = v; globalThis.getPresets = () => COLUMN_PRESETS;', context);
  context.setPresets(presets);
  const app = Object.create(context.App.prototype);
  Object.assign(app, { dataStore, cloudSearchHistory: {}, currentDate: '2026-10-04', syncBaselines: new Map(), pendingSyncDates: new Set(), editHistory: new Map() });
  const queued = [];
  app.scheduleSupabaseSync = date => queued.push(date);
  return { app, storage, context, queued };
}

test('renaming backs up local and cloud-only dates before updating exact same-column cells and presets', async () => {
  const { app, storage, context, queued } = createApp({
    '2026-10-04': [{ memo: '충 완', specialNote: '충 완', _richText: { memo: [{ text: '충 완' }] } }, { memo: '충 완 대기' }],
    '2026-10-03': [{ memo: ' 충 완 ' }],
  }, { memo: ['충 완', '충 완료', '다른 문구'] });
  app.cloudSearchHistory = { '2025-01-01': [{ memo: '충 완', name: '가상환자' }] };
  const before = JSON.stringify(app.dataStore);
  app.scheduleSupabaseSync = date => {
    const key = [...storage.keys()].find(key => key.startsWith('PT_TEXT_EDIT_BACKUP_'));
    assert.ok(key, 'verified backup must precede every queued cloud write');
    assert.equal(JSON.stringify(JSON.parse(storage.get(key)).dataStore), before);
    queued.push(date);
  };
  assert.equal(await app.renameAutocompleteValue('memo', '충 완', '충 완료'), 3);
  assert.equal(app.dataStore['2026-10-04'][0].memo, '충 완료');
  assert.equal(app.dataStore['2026-10-04'][0].specialNote, '충 완');
  assert.equal(app.dataStore['2026-10-04'][1].memo, '충 완 대기');
  assert.equal(app.dataStore['2026-10-04'][0]._richText.memo, undefined);
  assert.equal(app.dataStore['2025-01-01'][0].memo, '충 완료');
  assert.equal(app.syncBaselines.get('2025-01-01')[0].memo, '충 완');
  assert.equal(JSON.parse(storage.get('PT_PENDING_DATES')).length, 3);
  assert.equal(queued.length, 3);
  assert.deepEqual(Array.from(context.getPresets().memo), ['충 완료', '다른 문구']);
});

test('cloud read failure or unverified backup prevents all edits and synchronization', async () => {
  for (const failure of ['cloud', 'backup']) {
    const { app, context, queued } = createApp({ '2026-10-04': [{ memo: '원래 문구' }] });
    if (failure === 'cloud') {
      app.supabaseClient = {};
      app.loadSearchHistory = async force => { assert.equal(force, true); return false; };
    } else context.localStorage.getItem = () => null;
    await assert.rejects(app.renameAutocompleteValue('memo', '원래 문구', '수정 문구'));
    assert.equal(app.dataStore['2026-10-04'][0].memo, '원래 문구');
    assert.equal(queued.length, 0);
  }
});

test('bulk rename refreshes cloud history and preserves all pending merge baselines', async () => {
  const { app } = createApp();
  app.supabaseClient = {};
  app.loadSearchHistory = async force => {
    assert.equal(force, true);
    app.cloudSearchHistory = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, '0')}`, [{ memo: '문구' }]]));
    return true;
  };
  assert.equal(await app.renameAutocompleteValue('memo', '문구', '수정'), 20);
  // Exercise the actual offline scheduler to verify more than 14 pending baselines survive.
  app.supabaseClient = null;
  for (const date of app.pendingSyncDates) Object.getPrototypeOf(app).scheduleSupabaseSync.call(app, date);
  assert.equal(app.syncBaselines.size, 20);
});

test('Ctrl/Cmd horizontal navigation reaches filled runs, gaps and table boundaries', () => {
  const { app } = createApp();
  const keys = ['no', 'gender', 'chartNo', 'name', 'part', 'prescription', 'extra', 'writer', 'memo', 'specialNote', 'visitTime'];
  const row = { gender: 'F', chartNo: 'T001', name: '가상', part: '목', prescription: '치료', writer: 'J', visitTime: '09:00' };
  assert.equal(app.getHorizontalContentEdge(row, 2, 1, keys), 5);
  assert.equal(app.getHorizontalContentEdge(row, 5, -1, keys), 1);
  assert.equal(app.getHorizontalContentEdge(row, 5, 1, keys), 7);
  assert.equal(app.getHorizontalContentEdge(row, 7, -1, keys), 5);
  assert.equal(app.getHorizontalContentEdge(row, 1, -1, keys), 0);
  assert.equal(app.getHorizontalContentEdge(row, 10, 1, keys), 10);
  app.dataStore[app.currentDate] = [row];
  app.activeCell = { rowIdx: 0, colKey: 'chartNo' };
  app.navigateCell = (rowIdx, colKey) => { app.activeCell = { rowIdx, colKey }; };
  assert.ok(app.jumpToHorizontalContentEdge(1));
  assert.equal(app.activeCell.colKey, 'prescription');
  app.crossDateResults = [row];
  app.crossDateSelection = { endRow: 0, endCol: 5 };
  app.selectCrossDateCell = (row, col, extend) => { assert.equal(extend, false); app.crossDateSelection = { endRow: row, endCol: col }; };
  app.elTableBody = { querySelector: () => null };
  app.jumpToHorizontalContentEdge(-1);
  assert.equal(app.crossDateSelection.endCol, 1);
});

test('Ctrl/Cmd+Shift repeats expand and shrink one cell at a time in current and history tables', () => {
  for (const history of [false, true]) for (const modifier of ['ctrlKey', 'metaKey']) {
    const { app } = createApp();
    if (history) {
      app.crossDateSelection = { startRow: 0, startCol: 1, endRow: 0, endCol: 5, minRow: 0, maxRow: 0, minCol: 1, maxCol: 5 };
      app.selectCrossDateCell = (row, col) => {
        app.horizontalSelectionMode = null;
        Object.assign(app.crossDateSelection, { endRow: row, endCol: col, maxCol: col });
      };
    } else {
      app.selectedRange = { minRow: 0, maxRow: 0, minCol: 1, maxCol: 5 };
      app.rangeStart = { rowIdx: 0, colIdx: 1 }; app.rangeEnd = { rowIdx: 0, colIdx: 5 };
      app.extendCellSelection = (row, col) => {
        app.rangeEnd.colIdx = col; app.selectedRange.maxCol = col;
      };
    }
    app.rememberHorizontalSelection();
    const edge = () => history ? app.crossDateSelection.endCol : app.rangeEnd.colIdx;
    const event = key => ({ key, [modifier]: true, shiftKey: true, preventDefault() {}, stopPropagation() {} });
    assert.ok(app.adjustHorizontalSelection(event('ArrowRight'))); assert.equal(edge(), 6);
    assert.ok(app.adjustHorizontalSelection(event('ArrowRight'))); assert.equal(edge(), 7);
    assert.ok(app.adjustHorizontalSelection(event('ArrowLeft'))); assert.equal(edge(), 6);
    for (let i = 0; i < 8; i++) app.adjustHorizontalSelection(event('ArrowLeft'));
    assert.equal(edge(), 1);
    assert.equal(app.adjustHorizontalSelection({ ...event('ArrowRight'), shiftKey: false }), false);
  }
});

test('managed prescription, extra, memo and special-note suggestions keep their priority order', () => {
  for (const column of ['prescription', 'extra', 'memo', 'specialNote']) {
    const { app, context } = createApp({ '2026-10-04': [{ [column]: '충 기록' }] }, { [column]: ['메모 충 오래된 문구', '충 새 문구', '충'] });
    assert.deepEqual(Array.from(app.getAutocompleteSuggestions(column, '충')), column === 'prescription'
      ? ['메모 충 오래된 문구', '충 새 문구', '충', '충 기록'] : ['충 새 문구', '충', '충 기록']);
    // Reordering the manager list changes priority immediately.
    app.activePresetTab = column;
    app.renderPresetManagerList = () => {}; app.renderQuickChips = () => {};
    app.movePresetAt(column, 1, -1);
    assert.equal(context.getPresets()[column][0], '충 새 문구');
    assert.equal(app.getAutocompleteSuggestions(column, '충')[0], '충 새 문구');
  }
});

test('renaming uses verified IndexedDB backups and migrates old backups to free local settings capacity', async () => {
  const { app, context, storage, queued } = createApp({ '2026-10-04': [{ specialNote: '신장1' }] });
  const backups = new Map();
  const oldKey = 'PT_TEXT_EDIT_BACKUP_OLD';
  storage.set(oldKey, JSON.stringify({ dataStore: app.dataStore }));
  Object.defineProperty(context.localStorage, 'length', { get: () => storage.size });
  context.localStorage.key = idx => [...storage.keys()][idx];
  context.localStorage.removeItem = key => storage.delete(key);
  context.localStorage.setItem = (key, value) => {
    assert.ok(!key.startsWith('PT_TEXT_EDIT_BACKUP_'), 'large backups must not consume localStorage');
    assert.ok(!storage.has(oldKey), 'legacy backup must be migrated before records are saved');
    storage.set(key, value);
  };
  context.window.ptLocalTools = { async store(key, value) {
    if (value !== undefined) backups.set(key, value);
    return backups.get(key);
  } };
  assert.equal(await app.renameAutocompleteValue('specialNote', '신장1', '신장 1'), 1);
  assert.equal(app.dataStore['2026-10-04'][0].specialNote, '신장 1');
  assert.equal(backups.size, 2);
  assert.ok(backups.has(oldKey));
  const fresh = [...backups.keys()].find(key => key !== oldKey);
  assert.equal(JSON.parse(backups.get(fresh)).dataStore['2026-10-04'][0].specialNote, '신장1');
  assert.equal(queued.length, 1);
});

test('failed IndexedDB backup verification preserves legacy backups and leaves records unchanged', async () => {
  for (const legacy of [true, false]) {
    const { app, context, storage, queued } = createApp({ '2026-10-04': [{ memo: '원본' }] });
    const key = 'PT_TEXT_EDIT_BACKUP_OLD';
    if (legacy) storage.set(key, JSON.stringify({ dataStore: app.dataStore }));
    Object.defineProperty(context.localStorage, 'length', { get: () => storage.size });
    context.localStorage.key = idx => [...storage.keys()][idx];
    context.localStorage.removeItem = key => storage.delete(key);
    context.window.ptLocalTools = { async store() { return 'bad readback'; } };
    await assert.rejects(app.renameAutocompleteValue('memo', '원본', '변경'));
    assert.equal(app.dataStore['2026-10-04'][0].memo, '원본');
    if (legacy) assert.ok(storage.has(key));
    assert.equal(queued.length, 0);
  }
});


test('prescription x and Korean keyboard equivalent normalize only standalone cancellation markers', () => {
  const {app}=createApp();
  for(const value of ['x','ㅌ',' x ','X']) assert.equal(app.normalizePrescriptionInput(value),'X');
  for(const value of ['ICT x','ㅌ치료','Laser','']) assert.equal(app.normalizePrescriptionInput(value),value);
});

test('writer physical letter keys bypass Korean composition and honor native text selection', () => {
  const {app,context}=createApp();
  context.Event=class {constructor(type){this.type=type;}};
  app.activateNativeEditor=()=>{};
  app.closeAutocompleteMenu=()=>{};
  let dispatched;
  const input={value:'JK',selectionStart:0,selectionEnd:2,dataset:{composing:'true'},
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},dispatchEvent(event){dispatched=event.type;}};
  let prevented=false;
  assert.equal(app.handleWriterLetterKey({code:'KeyS',key:'Process',isComposing:true,preventDefault(){prevented=true;},stopPropagation(){}},input),true);
  assert.equal(input.value,'S');
  assert.equal(input.dataset.composing,'false');
  assert.equal(dispatched,'input');
  assert.equal(prevented,true);
  assert.equal(app.handleWriterLetterKey({code:'KeyC',ctrlKey:true},input),false);
  assert.equal(input.value,'S');
});


test('late writer IME insertion cannot duplicate a handled letter while paste remains editable', () => {
  const {app}=createApp();
  for (const [inputType, isComposing] of [['insertCompositionText',true], ['insertText',false], ['insertFromComposition',false]]) {
    const input={value:'Jㅓ',dataset:{writerKeyValue:'J'}};
    assert.equal(app.normalizeWriterEditorInput(input,{inputType,isComposing}),'J');
    input.value='Jㅓ';
    assert.equal(app.normalizeWriterEditorInput(input,{type:'compositionend'}),'J');
  }
  const input={value:'js',dataset:{writerKeyValue:'J'}};
  assert.equal(app.normalizeWriterEditorInput(input,{inputType:'insertFromPaste'}),'JS');
  assert.equal(input.dataset.writerKeyValue,undefined);
});


test('writer double-click picker uses only configured initials in manager order', () => {
  const {app}=createApp({'2026-10-04':[{writer:'Z'}]}, {writer:['s','ㅓ','K','S']});
  const input={value:'Z'}, cell={querySelector:()=>input};
  let shown;
  app.startInlineEdit=(row,key,target)=>{assert.equal(row,0);assert.equal(key,'writer');assert.equal(target,cell);};
  app.showAutocompleteMenu=(row,key,target,editor,values)=>{shown=Array.from(values);assert.equal(editor,input);};
  app.openWriterPicker(0,cell);
  assert.deepEqual(shown,['S','J','K']);
});

test('empty writer presets open the writer manager instead of suggesting historical initials', () => {
  const {app}=createApp({'2026-10-04':[{writer:'Z'}]});
  let tab;
  app.openPresetManager=value=>{tab=value;};
  app.openWriterPicker(0,{});
  assert.equal(tab,'writer');
});


test('gender picker arrows move the outlined option and Enter applies only that option', () => {
  const {app,context}=createApp();
  const selected=[];
  context.document={getElementById:()=>({querySelectorAll:()=>[0,1,2].map(index=>({
    classList:{toggle:(name,value)=>{selected[index]=value;}},setAttribute(){}
  }))})};
  const cell={};
  app.genderPickerState={rowIdx:3,cellElement:cell,items:[{val:'M'},{val:'F'},{val:''}],selectedIndex:0};
  const event=key=>({key,preventDefault(){},stopImmediatePropagation(){}});
  app.handleGenderPickerKeyDown(event('ArrowDown'));
  assert.deepEqual(selected,[false,true,false]);
  app.handleGenderPickerKeyDown(event('ArrowUp'));
  assert.deepEqual(selected,[true,false,false]);
  let applied,focused=false;
  app.setGenderValue=(row,value,target)=>{applied={row,value,target};};
  app.closeGenderDropdown=()=>{app.genderPickerState=null;};
  app.selectAutocompleteRightCell=(row,key)=>{assert.equal(row,3);assert.equal(key,'gender');};
  app.elSheetContainer={focus:()=>{focused=true;}};
  app.handleGenderPickerKeyDown(event('Enter'));
  assert.deepEqual(applied,{row:3,value:'M',target:cell});
  assert.equal(focused,true);
  assert.equal(app.genderPickerState,null);
});


test('writer Enter opens its picker once and leaves confirmation and modifier shortcuts to the editor', () => {
  const {app}=createApp();
  let opened=0, prevented=0, menuOpen=false;
  const cell={};
  app.isAutocompleteOpen=()=>menuOpen;
  app.openWriterPicker=(row,target)=>{assert.equal(row,2);assert.equal(target,cell);opened++;};
  const event={key:'Enter',preventDefault(){prevented++;},stopPropagation(){}};
  assert.equal(app.handleWriterPickerShortcut(event,2,cell),true);
  menuOpen=true;
  assert.equal(app.handleWriterPickerShortcut(event,2,cell),false);
  menuOpen=false;
  for(const modifier of ['ctrlKey','metaKey','shiftKey','altKey'])
    assert.equal(app.handleWriterPickerShortcut({...event,[modifier]:true},2,cell),false);
  assert.equal(opened,1);
  assert.equal(prevented,1);
});


test('gender picker Right applies highlighted gender, closes and moves to the next column', () => {
  const {app}=createApp();
  const cell={};
  app.genderPickerState={rowIdx:2,cellElement:cell,items:[{val:'M'},{val:'F'},{val:''}],selectedIndex:1};
  const actions=[];
  app.setGenderValue=(row,value,target)=>{assert.equal(target,cell);actions.push(['apply',row,value]);};
  app.closeGenderDropdown=()=>{app.genderPickerState=null;actions.push(['close']);};
  app.navigateCol=(row,key,direction)=>actions.push(['move',row,key,direction]);
  app.elSheetContainer={focus:()=>actions.push(['focus'])};
  app.handleGenderPickerKeyDown({key:'ArrowRight',preventDefault(){},stopImmediatePropagation(){}});
  assert.deepEqual(actions,[['apply',2,'F'],['close'],['move',2,'gender',1],['focus']]);
  assert.equal(app.genderPickerState,null);
});


test('writer Right exits at the text end even while IME reports composition, but retains native caret movement inside text', () => {
  const {app}=createApp();
  let open=false;
  app.isAutocompleteOpen=()=>open;
  const input={value:'JK',selectionStart:2,selectionEnd:2};
  assert.equal(app.isWriterRightExit({key:'Process',code:'ArrowRight',isComposing:true},input),true);
  input.selectionStart=input.selectionEnd=1;
  assert.equal(app.isWriterRightExit({key:'ArrowRight'},input),false);
  open=true;
  assert.equal(app.isWriterRightExit({key:'ArrowRight'},input),true);
  for(const modifier of ['shiftKey','ctrlKey','metaKey','altKey'])
    assert.equal(app.isWriterRightExit({key:'ArrowRight',[modifier]:true},input),false);
});

test('all autocomplete columns Left confirm open suggestions regardless of IME, preserving modified arrows and other columns', () => {
  const { app } = createApp();
  let open = true;
  app.isAutocompleteOpen = () => open;
  for (const column of ['chartNo', 'name', 'part', 'prescription', 'extra', 'writer', 'memo', 'specialNote']) {
    assert.equal(app.isPresetLeftExit({ key: 'ArrowLeft' }, column), true);
    assert.equal(app.isPresetLeftExit({ key: 'Process', code: 'ArrowLeft', isComposing: true }, column), true);
    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
      assert.equal(app.isPresetLeftExit({ key: 'ArrowLeft', [modifier]: true }, column), false);
    }
    assert.equal(app.isPresetLeftExit({ key: 'ArrowRight' }, column), false);
  }
  for (const column of ['no', 'gender', 'visitTime']) {
    assert.equal(app.isPresetLeftExit({ key: 'ArrowLeft' }, column), false);
  }
  open = false;
  assert.equal(app.isPresetLeftExit({ key: 'ArrowLeft' }, 'prescription'), false);
  assert.equal(app.isPresetLeftExit({ key: 'ArrowLeft' }, 'extra'), false);
  assert.equal(app.isPresetLeftExit({ key: 'ArrowLeft' }, 'name'), false);
});

test('inline completion keeps typed syllables and previews only remaining Hangul components', () => {
  const { app } = createApp();
  for (const [query, candidate, suffix] of [
    ['ㅇ', '이청용', 'ㅣ청용'], ['이', '이청용', '청용'], ['이ㅊ', '이청용', 'ㅓㅇ용'],
    ['잋', '이춘식', 'ㅜㄴ식'], ['싡', '신장', 'ㅏㅇ'], ['신', '신장', '장'],
    ['신장', '신장', ''], ['이', '김청용', ''], ['abc', 'abcdef', 'def'],
  ]) assert.equal(app.getInlineCompletionSuffix(query, candidate), suffix);
});

test('autocomplete left confirmation suppresses repeated movement until key release', () => {
  const { app } = createApp();
  let prevented = 0;
  const event = { key: 'ArrowLeft', preventDefault() { prevented++; }, stopPropagation() {} };
  app.presetLeftKeyHeld = true;
  assert.equal(app.consumePresetLeftRepeat(event), true);
  assert.equal(app.consumePresetLeftRepeat({ ...event, repeat: true }), true);
  assert.equal(app.consumePresetLeftRepeat({ ...event, ctrlKey: true }), false);
  app.presetLeftKeyHeld = false;
  assert.equal(app.consumePresetLeftRepeat(event), false);
  assert.equal(prevented, 2);
});

test('memo input preserves English and mixed Korean text without intercepting native typing', () => {
  const { app } = createApp();
  for (const value of ['MW', 'ICT / Laser', 'MW 완료', '신장']) {
    const input = {
      value, dataset: {}, selectionStart: value.length, selectionEnd: value.length,
      addEventListener() { assert.fail('memo must not intercept native input or language shortcuts'); },
      setSelectionRange() { assert.fail('unchanged native input must retain its cursor'); },
    };
    app.initMemoInput(input);
    assert.equal(input.value, value);
    assert.equal(app.normalizeCompletedHangulInput(input), false);
    assert.equal(input.dataset.composing, undefined);
    assert.equal(input.lang, 'ko');
    assert.equal(input.autocapitalize, 'off');
    assert.equal(input.spellcheck, false);
  }
});

test('inline preview displays assembled syllables while leaving native composing text untouched', () => {
  const { app } = createApp();
  for (const [query, candidate, prefix, suffix] of [
    ['ㅇ', '임연', '임', '연'], ['ㅇ', '이청용', '이', '청용'],
    ['이', '이청용', '이', '청용'], ['잋', '이춘식', '이', '춘식'],
    ['싡', '신장', '신', '장'], ['기', '김청용', '김', '청용'],
  ]) {
    const parts = app.getInlineCompletionParts(query, candidate);
    assert.equal(parts.prefix, prefix); assert.equal(parts.suffix, suffix);
    assert.equal(parts.prefix + parts.suffix, candidate);
    assert.equal(/[ㄱ-ㅎㅏ-ㅣ]/.test(parts.prefix + parts.suffix), false);
  }
  assert.equal(app.getInlineCompletionParts('신장', '신장'), null);
  assert.equal(app.getInlineCompletionParts('이', '김청용'), null);
});

test('composed completion tracks only entered initial vowel and final components', () => {
  const {app}=createApp();
  for(const [query, candidate, expected] of [
    ['ㅇ','임연',[1,0]], ['이','임연',[2,0]], ['임','임연',[3,0]],
    ['임ㅇ','임연',[3,1]], ['임여','임연',[3,2]],
    ['ㅇㅊ','이청용',[1,1,0]], ['고','과장',[2,0]],
  ]) {
    const blocks=app.getInlineCompletionComponents(query,candidate);
    assert.deepEqual(Array.from(blocks, block=>block.typed),expected);
    assert.equal(blocks.map(block=>block.char).join(''),candidate);
  }
  assert.equal(app.getInlineCompletionComponents('임연','임연'),null);
});


test('Left confirmation selects exactly the adjacent cell without arming another editor', () => {
  const { app } = createApp();
  const columns = ['no', 'gender', 'chartNo', 'name', 'part', 'prescription', 'extra', 'writer', 'memo', 'specialNote'];
  for (let index = 1; index < columns.length; index++) {
    const cell = {};
    app.elTableBody = { querySelector(selector) {
      assert.equal(selector, `[data-row="4"][data-col="${columns[index - 1]}"]`);
      return cell;
    }};
    let selections = 0;
    app.selectCell = (row, key, target, arm) => {
      selections++;
      assert.equal(row, 4); assert.equal(key, columns[index - 1]);
      assert.equal(target, cell); assert.equal(arm, false);
    };
    app.selectAutocompleteLeftCell(4, columns[index]);
    assert.equal(selections, 1);
  }
});

test('gender Left confirms the highlighted option and keeps modifier shortcuts unchanged', () => {
  const { app } = createApp();
  const cell = {}, leftCell = {}, actions = [];
  app.genderPickerState = { rowIdx: 2, cellElement: cell, items: [{val:'M'}, {val:'F'}], selectedIndex: 1 };
  app.setGenderValue = (row, value) => actions.push(['apply', row, value]);
  app.closeGenderDropdown = () => { app.genderPickerState = null; };
  app.elTableBody = {querySelector: () => leftCell};
  app.selectCell = (row, key, target, arm) => {
    assert.equal(target, leftCell); assert.equal(arm, false); actions.push(['select', row, key]);
  };
  app.elSheetContainer = {focus() {}};
  const event = {key:'ArrowLeft', preventDefault(){}, stopImmediatePropagation(){}};
  app.handleGenderPickerKeyDown({...event, ctrlKey:true});
  assert.equal(actions.length, 0);
  app.handleGenderPickerKeyDown(event);
  assert.deepEqual(actions, [['apply',2,'F'], ['select',2,'no']]);
  assert.equal(app.genderPickerState, null);
  assert.equal(app.presetLeftKeyHeld, true);
});


test('typed final consonants stay in the native syllable while matching candidates remain available', () => {
  const {app}=createApp();
  for (const [query, candidate] of [['이솔','이소림'], ['잋','이춘식'], ['싡','신장']]) {
    assert.equal(app.getInlineCompletionComponents(query, candidate), null);
    assert.equal(app.matchesHangulPrefix(candidate, query, true), true);
  }
  const blocks = app.getInlineCompletionComponents('이솔','이솔희');
  assert.deepEqual(Array.from(blocks, block => block.typed), [2,3,0]);
});


test('preview baseline uses shared font metrics instead of each glyph ink bounds', () => {
  const {app}=createApp();
  const font={fontSize:'14px'};
  const a=app.getCompletionTextLayout(font,{fontBoundingBoxAscent:15,fontBoundingBoxDescent:4,actualBoundingBoxAscent:10,actualBoundingBoxDescent:0});
  const b=app.getCompletionTextLayout(font,{fontBoundingBoxAscent:15,fontBoundingBoxDescent:4,actualBoundingBoxAscent:13,actualBoundingBoxDescent:3});
  assert.equal(a.height,b.height);assert.equal(a.baseline,b.baseline);
  assert.equal(a.height,21);assert.equal(a.baseline,16);
  const fallback=app.getCompletionTextLayout(font,{actualBoundingBoxAscent:12,actualBoundingBoxDescent:3});
  assert.ok(Number.isFinite(fallback.baseline));
});


test('Enter destination moves right exactly once without arming an editor or wrapping rows', () => {
  const {app}=createApp();
  for (const [column,expected] of [['no','gender'],['name','part'],['prescription','extra'],['extra','writer'],['writer','memo'],['memo','specialNote'],['specialNote','specialNote']]) {
    const cell={};let selected=0;
    app.elTableBody={querySelector(selector){assert.equal(selector,`[data-row="3"][data-col="${expected}"]`);return cell;}};
    app.selectCell=(row,key,target,arm)=>{assert.equal(row,3);assert.equal(key,expected);assert.equal(target,cell);assert.equal(arm,false);selected++;};
    app.selectAutocompleteRightCell(3,column);assert.equal(selected,1);
  }
});


test('plain Enter skips empty text cells but leaves gender and writer to their pickers', () => {
  const {app}=createApp({'2026-10-04':[{memo:'',prescription:'',extra:'',writer:'',gender:'',name:'입력됨'}]});
  app.getCurrentRows=()=>app.dataStore[app.currentDate];
  let moved=0,removed=0;
  app.selectAutocompleteRightCell=(row,key)=>{assert.equal(row,0);assert.equal(key,app.activeCell.colKey);moved++;};
  app.elSheetContainer={focus(){}};
  const event={key:'Enter',preventDefault(){},stopPropagation(){}};
  for(const key of ['memo','prescription','extra']) {
    app.activeCell={rowIdx:0,colKey:key};
    assert.equal(app.handleEmptyCellEnter(event,{remove(){removed++;}}),true);
  }
  assert.equal(moved,3);assert.equal(removed,3);
  for(const key of ['gender','writer']) {
    app.activeCell={rowIdx:0,colKey:key};
    assert.equal(app.handleEmptyCellEnter(event,{remove(){assert.fail('picker editor must remain attached');}}),false);
  }
  assert.equal(moved,3);
  for(const modifier of ['ctrlKey','metaKey','altKey','shiftKey']) assert.equal(app.handleEmptyCellEnter({...event,[modifier]:true}),false);
  app.activeCell={rowIdx:0,colKey:'name'};
  assert.equal(app.handleEmptyCellEnter(event),false);
});


test('spaced or partial-vowel matches never hide already typed syllables', () => {
  const {app} = createApp();
  for (const [query,candidate] of [['오어','오 영'],['오 어','오 영'],['오어','오영']]) {
    assert.equal(app.getInlineCompletionComponents(query,candidate),null);
  }
  const blocks=app.getInlineCompletionComponents('오 어','오 어깨');
  assert.deepEqual(Array.from(blocks,block=>block.typed),[2,1,2,0]);
});


test('compact Korean completion colors only untyped finals despite candidate spaces', () => {
  const {app}=createApp();
  for (const candidate of ['오엉','오 엉']) {
    const blocks=app.getInlineCompletionComponents('오어',candidate);
    assert.equal(blocks.map(block=>block.char).join(''),'오엉');
    assert.deepEqual(Array.from(blocks,block=>block.typed),[2,2]);
    assert.deepEqual(Array.from(blocks[1].jamo),['ㅇ','ㅓ','ㅇ']);
  }
  const tail=app.getInlineCompletionComponents('오어','오 엉덩이');
  assert.equal(tail.map(block=>block.char).join(''),'오엉덩이');
  assert.deepEqual(Array.from(tail,block=>block.typed),[2,2,0,0]);
  const completed=app.getInlineCompletionComponents('오엉','오 엉덩이');
  assert.deepEqual(Array.from(completed,block=>block.typed),[2,3,0,0]);
  assert.equal(app.getInlineCompletionComponents('오어','오 영'),null);
});


test('completed Korean jamo repair preserves caret and never rewrites an active native composition', () => {
  const { app } = createApp();
  for (const [source,expected] of [['ㅈㅣㄴ','진'],['지ㄴ','진'],['진','진'],['김ㅈㅣㄴ','김진']]) {
    let writes=0;
    const input={dataset:{nativeComposing:'true'},selectionStart:source.length,selectionEnd:source.length,selectionDirection:'none',
      get value(){return this.text;},set value(value){writes++;this.text=value;},text:source,
      setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}};
    assert.equal(app.normalizeCompletedHangulInput(input),false);
    assert.equal(writes,0); assert.equal(input.value,source);
    input.dataset.nativeComposing='false';
    assert.equal(app.normalizeCompletedHangulInput(input),true);
    assert.equal(input.value,expected); assert.equal(input.selectionStart,expected.length);
    assert.equal(input.selectionEnd,expected.length);
  }
  const input={dataset:{nativeComposing:'false'},value:'ㄱㅅ',selectionStart:2,selectionEnd:2};
  assert.equal(app.normalizeCompletedHangulInput(input),false);
  assert.equal(input.value,'ㄱㅅ');
});

test('name completion previews gray remaining letters during native composition without changing input or focus', () => {
  const { app, context } = createApp();
  let rendered, appended, writes=0;
  const input={dataset:{nativeComposing:'true'},isConnected:true,
    get value(){return '임';},set value(value){writes++;},
    selectionStart:1,selectionEnd:1,offsetLeft:0,offsetTop:0,offsetHeight:28,scrollLeft:0,
    classList:{add(value){assert.equal(value,'has-inline-completion');}},
    focus(){assert.fail('preview must not refocus the composing input');},
    setSelectionRange(){assert.fail('preview must not move the composing caret');}};
  const preview={style:{},setAttribute(){},append(block){rendered=block;}};
  context.document={activeElement:input,createElement(){return preview;}};
  context.getComputedStyle=()=>({font:'14px sans-serif',paddingLeft:'6px',letterSpacing:'normal'});
  app.clearInlineAutocompletePreview=()=>{};
  app.getSelectedAutocompleteItem=()=> '임연';
  app.createPartialHangulPreview=block=>block;
  app.autocompleteState={colKey:'name',input,cellElement:{append(value){appended=value;}}};
  app.updateInlineAutocompletePreview();
  assert.equal(writes,0);
  assert.equal(input.value,'임');
  assert.equal(rendered.char,'연');
  assert.equal(rendered.typed,0);
  assert.equal(appended,preview);
  assert.equal(context.document.activeElement,input);
});


test('moving from writer to memo keeps the destination native editor focused before IME starts', () => {
  const {app}=createApp();
  let editorFocus=0, sheetFocus=0;
  app.activeCell={rowIdx:0,colKey:'memo'};
  app.elTableBody={querySelector(selector) {
    assert.equal(selector, '[data-row="0"][data-col="memo"] input');
    return {focus(){editorFocus++;}};
  }};
  app.elSheetContainer={focus(){sheetFocus++;}};
  app.focusSelectedCellEditor();
  assert.equal(editorFocus,1);
  assert.equal(sheetFocus,0);
  app.elTableBody.querySelector=()=>null;
  app.focusSelectedCellEditor();
  assert.equal(sheetFocus,1);
});


test('manual writer Enter exits even when the IME reports Process or composition, while selected cells open their picker', () => {
  const {app}=createApp();
  let armed=false;
  const input={classList:{contains:()=>armed}};
  for(const event of [{key:'Enter'}, {key:'Process',code:'Enter',isComposing:true,keyCode:229}, {key:'Process',code:'NumpadEnter',isComposing:true}]) {
    assert.equal(app.isWriterEnterExit(event,input),true);
    for(const modifier of ['ctrlKey','metaKey','altKey','shiftKey'])
      assert.equal(app.isWriterEnterExit({...event,[modifier]:true},input),false);
  }
  armed=true;
  assert.equal(app.isWriterEnterExit({key:'Enter'},input),false);
  armed=false;
  assert.equal(app.isWriterEnterExit({key:'ArrowRight'},input),false);
});


test('manual memo and writer Left exits directly regardless of caret or native IME state without intercepting modified selection', () => {
  const {app}=createApp();
  let armed=false;
  const input={value:'K',selectionStart:1,selectionEnd:1,classList:{contains:()=>armed}};
  for(const event of [{key:'ArrowLeft'},{key:'Process',code:'ArrowLeft',isComposing:true,keyCode:229}]) {
    assert.equal(app.isManualCellLeftExit(event,input),true);
    input.selectionStart=input.selectionEnd=0;
    assert.equal(app.isManualCellLeftExit(event,input),true);
    for(const modifier of ['ctrlKey','metaKey','altKey','shiftKey'])
      assert.equal(app.isManualCellLeftExit({...event,[modifier]:true},input),false);
  }
  armed=true;
  assert.equal(app.isManualCellLeftExit({key:'ArrowLeft'},input),false);
  armed=false;
  assert.equal(app.isManualCellLeftExit({key:'Enter'},input),false);
});


test('ending native cell editing blurs the original composing input before destination focus without copying its text', () => {
  const {app,context}=createApp();
  const destination={value:'기존 내용'};
  let blurred=0;
  const input={value:'새 내용',dataset:{nativeComposing:'true',composing:'true'},blur(){blurred++;context.document.activeElement=null;}};
  context.document={activeElement:input};
  app.endNativeCellEditing(input);
  assert.equal(blurred,1);
  assert.equal(input.value,'새 내용');
  assert.equal(destination.value,'기존 내용');
  assert.equal(input.dataset.nativeComposing,'false');
  assert.equal(input.dataset.composing,'false');
  app.endNativeCellEditing(input);
  assert.equal(blurred,1);
});
