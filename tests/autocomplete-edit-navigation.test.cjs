const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function createApp(dataStore = {}, presets = {}) {
  const storage = new Map();
  const context = vm.createContext({
    window: { addEventListener() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') +
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
    assert.deepEqual(Array.from(app.getAutocompleteSuggestions(column, '충')), ['메모 충 오래된 문구', '충 새 문구', '충 기록']);
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
  app.selectCell=(row,key,target)=>{assert.equal(row,3);assert.equal(key,'gender');assert.equal(target,cell);};
  app.elSheetContainer={focus:()=>{focused=true;}};
  app.handleGenderPickerKeyDown(event('Enter'));
  assert.deepEqual(applied,{row:3,value:'M',target:cell});
  assert.equal(focused,true);
  assert.equal(app.genderPickerState,null);
});
