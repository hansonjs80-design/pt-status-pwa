const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function fixture() {
  const storage = new Map(), timers = new Map();
  const context = vm.createContext({window:{addEventListener(){}},console,
    setTimeout(fn) { const id = {}; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(require('./helpers/load-app-source.cjs')+'\nglobalThis.App=PTApp;',context);
  const app = Object.create(context.App.prototype);
  app.currentDate = '2026-10-20';
  const source = {name:'가상환자',chartNo:'TEST1',part:'허리',specialNote:'이전 메모',memo:'원본',visitTime:'09시 00분 00초'};
  app.dataStore = {[app.currentDate]:[{name:'현재환자',specialNote:'현재 메모'}]};
  app.cloudSearchHistory = {'2026-09-01':[source, {name:'다른환자',specialNote:'유지'}]};
  app.syncBaselines = new Map(); app.pendingSyncDates = new Set(); app.activePushes = new Map();
  app.crossDateResults = [{...source,_sourceDate:'2026-09-01',_sourceRowIdx:0}];
  app.allCrossDateMatchedRows = [{...app.crossDateResults[0]}];
  app.elSearchInput = {value:'TEST1'};
  const saved=[], queued=[], notices=[];
  app.persistDataStore = () => {saved.push(JSON.stringify(app.dataStore));return Promise.resolve();};
  app.scheduleSupabaseSync = date => queued.push(date);
  app.showSaveIndicator = (...args) => notices.push(args);
  app.refreshLoadedSearchResults = () => {};
  let edit;
  app.startInlineEdit = (index,key,cell,armed,value) => {edit=value;};
  app.startHistoryNoteEdit(0,{querySelector:()=>null});
  return {app,edit,saved,queued,notices,storage,timers,context};
}

function formattingFixture() {
  const result=fixture(), {app}=result;
  const latest={...app.cloudSearchHistory['2026-09-01'][0],specialNote:'다음 날짜',memo:'다음 보존'};
  app.cloudSearchHistory['2026-10-19']=[latest];
  app.crossDateResults.push({...latest,_sourceDate:'2026-10-19',_sourceRowIdx:0});
  app.allCrossDateMatchedRows=[...app.crossDateResults];
  app.crossDateSelection={minRow:0,maxRow:1,minCol:9,maxCol:9,startRow:0,endRow:1,startCol:9,endCol:9};
  app.isCrossDateRowSelected=false;
  app.elTableBody={querySelector:()=>null};
  app.closeFontColorMenu=app.updateFontColorIndicator=app.updateBackgroundColorIndicator=app.updateTextHighlightIndicator=app.updateUnderlineIndicator=app.updateAlignmentIndicator=()=>{};
  return result;
}

function clipboardFixture(cut = false) {
  const result=formattingFixture(),{app,context}=result;
  context.navigator={clipboard:{writeText:()=>Promise.resolve()}};
  context.document={activeElement:null};
  app.elSheetContainer={focus(){context.document.activeElement=this;}};
  app.renderClipboardSelection=()=>{};
  app.selectCrossDateCell=(row,col,extend)=>{app.crossDateSelection={minRow:extend?app.crossDateSelection.minRow:row,
    maxRow:row,minCol:col,maxCol:col,startRow:extend?app.crossDateSelection.startRow:row,endRow:row,startCol:col,endCol:col};};
  app.crossDateSelection=null;app.activeCell={rowIdx:0,colKey:'specialNote'};
  app.selectedColKey=app.selectedRowIdx=null;
  const source=app.getCurrentRows()[0];source.specialNote='ABC DEF';
  source._textColors={specialNote:'#123456'};
  source._textStyles={specialNote:{fontSize:20,fontWeight:700,backgroundColor:'#00ff00',textAlign:'right'}};
  source._richText={specialNote:{text:'ABC DEF',colors:['#ff0000',null,null,null,null,null,null],
    styles:[{highlight:'#ffff00',underline:{style:'wavy',color:'#0000ff'}},null,null,null,null,null,null]}};
  if(cut)app.cutSelection();else app.copySelection();
  app.crossDateSelection={minRow:0,maxRow:0,minCol:9,maxCol:9,startRow:0,endRow:0,startCol:9,endCol:9};
  app.activeCell=null;
  return {...result,source};
}

test('current-to-history paste copies all cell and character formatting and returns to border-only selection', async () => {
  const {app,source,context}=clipboardFixture();
  const current=JSON.stringify(app.getCurrentRows());
  await app.pasteSelection('ABC DEF');
  const target=app.dataStore['2026-09-01'][0];
  assert.equal(target.specialNote,'ABC DEF');
  assert.deepEqual(JSON.parse(JSON.stringify(target._textStyles.specialNote)),source._textStyles.specialNote);
  assert.deepEqual(JSON.parse(JSON.stringify(target._richText.specialNote)),source._richText.specialNote);
  assert.equal(target._textColors.specialNote,'#123456');
  assert.equal(JSON.stringify(app.getCurrentRows()),current);
  assert.equal(context.document.activeElement,app.elSheetContainer);
  assert.equal(app.clipboardSelection,null);
  // System clipboard formatting remains reusable after its source outline ends.
  app.selectCrossDateCell(1,9);
  await app.pasteSelection('ABC DEF');
  assert.deepEqual(JSON.parse(JSON.stringify(app.dataStore['2026-10-19'][0]._richText.specialNote)),source._richText.specialNote);
  assert.equal(app.dataStore['2026-10-19'][0]._textStyles.specialNote.backgroundColor,'#00ff00');
});

test('current-to-history cut moves the text with its formatting and saves the current source once', async () => {
  const {app,source}=clipboardFixture(true);let currentSaves=0;
  app.saveDataStore=()=>{currentSaves++;return Promise.resolve();};
  await app.pasteSelection('ABC DEF');
  assert.equal(source.specialNote,'');assert.equal(app.pendingCut,null);assert.equal(currentSaves,1);
  assert.equal(app.dataStore['2026-09-01'][0].specialNote,'ABC DEF');
  assert.equal(app.dataStore['2026-09-01'][0]._textStyles.specialNote.fontSize,20);
  assert.equal(app.dataStore['2026-09-01'][0]._richText.specialNote.styles[0].highlight,'#ffff00');
});

test('an invalid history destination or multi-column paste never deletes a pending cut source', async () => {
  for(const changed of [false,true]) {
    const {app,source,saved}=clipboardFixture(true);
    if(changed)app.cloudSearchHistory['2026-09-01'][0].name='교체환자';
    await app.pasteSelection(changed?'ABC DEF':'ABC DEF\t추가 열');
    assert.equal(source.specialNote,'ABC DEF');assert.equal(saved.length,0);assert.ok(app.pendingCut);
  }
});

test('cutting a current note onto its included-current-date search cell preserves the original', async () => {
  const {app,source}=clipboardFixture(true);let saves=0;
  app.saveDataStore=()=>{saves++;return Promise.resolve();};
  app.crossDateResults=[{...source,_sourceDate:app.currentDate,_sourceRowIdx:0}];
  await app.pasteSelection('ABC DEF');
  assert.equal(source.specialNote,'ABC DEF');assert.equal(app.getCurrentRows()[0].specialNote,'ABC DEF');
  assert.equal(app.pendingCut,null);assert.equal(saves,0);
});

test('history note color, size, weight, highlight, fill and alignment persist to every selected original date', async () => {
  const {app,saved,queued}=formattingFixture();
  const today=JSON.stringify(app.dataStore[app.currentDate]);
  app.applyTextColor('#ff0000');
  app.applyColumnTypography('fontSize',19);
  app.applyColumnTypography('fontWeight',700);
  app.applyTextHighlight('#ffff00');
  app.applyBackgroundColor('#d9ead3');
  app.applyAlignment('left');
  await Promise.resolve();
  for(const date of ['2026-09-01','2026-10-19']) {
    const row=app.dataStore[date][0];
    assert.equal(row._textColors.specialNote,'#ff0000');
    assert.equal(row._textStyles.specialNote.fontSize,19);assert.equal(row._textStyles.specialNote.fontWeight,700);
    assert.equal(row._textStyles.specialNote.backgroundColor,'#d9ead3');assert.equal(row._textStyles.specialNote.textAlign,'left');
    assert.ok(row._richText.specialNote.styles.every(style=>style.highlight==='#ffff00'));
    assert.equal(row.memo,date==='2026-09-01'?'원본':'다음 보존');
  }
  assert.equal(JSON.stringify(app.dataStore[app.currentDate]),today);
  assert.equal(saved.length,6,'one persistence snapshot per toolbar action, including multiple dates');
  assert.deepEqual([...new Set(queued)].sort(),['2026-09-01','2026-10-19']);
});

test('historical partial text formats only the chosen characters and resets each format independently', () => {
  const {app}=formattingFixture();
  app.crossDateSelection.maxRow=app.crossDateSelection.endRow=0;
  app.cloudSearchHistory['2026-09-01'][0].specialNote=app.crossDateResults[0].specialNote='ABC DEF';
  const select=()=>{app.textColorSelection={history:true,date:'2026-09-01',sourceIndex:0,text:'ABC DEF',start:0,end:3};};
  select();app.applyTextColor('#ff0000');select();app.applyColumnTypography('fontSize',22);
  select();app.applyColumnTypography('fontWeight',700);select();app.applyTextHighlight('#ffff00');
  let rich=app.dataStore['2026-09-01'][0]._richText.specialNote;
  assert.deepEqual(Array.from(rich.colors),['#ff0000','#ff0000','#ff0000',null,null,null,null]);
  assert.ok(rich.styles.slice(0,3).every(style=>style.fontSize===22&&style.fontWeight===700&&style.highlight==='#ffff00'));
  assert.ok(rich.styles.slice(3).every(style=>style===null));
  select();app.applyTextHighlight(null);select();app.applyColumnTypography('fontWeight',null);
  rich=app.dataStore['2026-09-01'][0]._richText.specialNote;
  assert.ok(rich.styles.slice(0,3).every(style=>style.fontSize===22&&!style.highlight&&!style.fontWeight));
  assert.equal(app.dataStore['2026-10-19'],undefined);
});

test('history fill copies source text and formatting to displayed rows across dates without modifying the source', async () => {
  const {app,saved}=formattingFixture();
  const source=app.crossDateResults[1];
  source.specialNote='복사할 특이사항';source._textColors={specialNote:'#123456'};
  source._textStyles={specialNote:{fontWeight:700,fontSize:18,backgroundColor:'#ffff00'}};
  source._richText={specialNote:{text:source.specialNote,colors:Array(source.specialNote.length).fill(null),styles:Array(source.specialNote.length).fill({highlight:'#00ff00'})}};
  const before=JSON.stringify(source),today=JSON.stringify(app.dataStore[app.currentDate]);
  const selection=[];app.selectCrossDateCell=(row,col,extend)=>selection.push([row,col,!!extend]);
  app.finishHistoryNoteFill({rowIdx:1,endRow:0,sources:[...app.crossDateResults],value:source.specialNote,
    formatting:app.captureCellFormatting(source,'specialNote')});
  await Promise.resolve();
  const row=app.dataStore['2026-09-01'][0];
  assert.equal(row.specialNote,'복사할 특이사항');assert.equal(row._textColors.specialNote,'#123456');
  assert.equal(row._textStyles.specialNote.fontWeight,700);assert.equal(row._textStyles.specialNote.fontSize,18);
  assert.equal(row._textStyles.specialNote.backgroundColor,'#ffff00');
  assert.ok(row._richText.specialNote.styles.every(style=>style.highlight==='#00ff00'));
  assert.equal(JSON.stringify(source),before);assert.equal(JSON.stringify(app.dataStore[app.currentDate]),today);
  assert.equal(app.dataStore['2026-10-19'],undefined);assert.equal(saved.length,1);
  assert.deepEqual(selection,[[1,9,false],[0,9,true]]);
});

test('a changed search ordering cancels historical fill and non-note selections cannot format any record', () => {
  const {app,saved}=formattingFixture();
  const sources=[...app.crossDateResults];app.crossDateResults.reverse();
  app.finishHistoryNoteFill({rowIdx:1,endRow:0,sources,value:'취소',formatting:{}});
  assert.equal(saved.length,0);
  app.crossDateSelection.minCol=8;
  app.applyTextColor('#ff0000');app.applyColumnTypography('fontSize',20);app.applyTextHighlight('#ffff00');
  assert.equal(saved.length,0);
});

test('historical highlighter strokes persist only their source date and reject stale source identities', () => {
  const {app}=formattingFixture();
  const edit=app.createHistoryNoteEdit(0);
  const stroke={row:edit.row,key:'specialNote',text:edit.row.specialNote,date:app.currentDate,rowIndex:0,
    start:0,color:'#ffff00',historyEdit:edit};
  assert.equal(app.commitHighlightStroke(stroke,2),true);
  assert.ok(app.dataStore['2026-09-01'][0]._richText.specialNote.styles.slice(0,2).every(style=>style.highlight==='#ffff00'));
  assert.equal(app.dataStore['2026-10-19'],undefined);
  app.crossDateResults.reverse();assert.equal(app.commitHighlightStroke(stroke,3),false);
});

test('opening a prior note creates only a draft and does not read, persist, or queue a date', () => {
  const {app,edit,saved,queued} = fixture();
  assert.equal(edit.row.specialNote,'이전 메모');
  assert.equal(app.dataStore['2026-09-01'],undefined);
  edit.save(true);
  assert.equal(saved.length,0); assert.equal(queued.length,0);
});

test('a cloud-only history note saves its own date and preserves other patients, fields, and remote data', async () => {
  const {app,edit,saved,queued,storage} = fixture();
  const today = JSON.stringify(app.dataStore[app.currentDate]);
  app.cloudSearchHistory['2026-09-01'][0].memo='다른 기기에서 수정';
  edit.row.specialNote='수정한 특이사항'; edit.save(true);
  await Promise.resolve();
  assert.equal(app.dataStore['2026-09-01'][0].specialNote,'수정한 특이사항');
  assert.equal(app.dataStore['2026-09-01'][0].memo,'다른 기기에서 수정');
  assert.equal(app.dataStore['2026-09-01'][0].visitTime,'09시 00분 00초');
  assert.equal(app.dataStore['2026-09-01'][1].specialNote,'유지');
  assert.equal(app.cloudSearchHistory['2026-09-01'][0].specialNote,'이전 메모');
  assert.equal(JSON.stringify(app.dataStore[app.currentDate]),today);
  assert.equal(app.dataStore['2026-09-01'][0]._sourceDate,undefined);
  assert.deepEqual(queued,['2026-09-01']); assert.equal(saved.length,1);
  assert.deepEqual(JSON.parse(storage.get('PT_PENDING_DATES')),['2026-09-01']);
  assert.equal(app.crossDateResults[0].specialNote,'수정한 특이사항');
  assert.equal(app.allCrossDateMatchedRows[0].specialNote,'수정한 특이사항');
});

test('history note rebases pending local fields and newer cloud fields and survives the normal three-way merge', async () => {
  const {app,edit} = fixture();
  const base=JSON.parse(JSON.stringify(app.cloudSearchHistory['2026-09-01']));
  app.syncBaselines.set('2026-09-01',base);
  app.dataStore['2026-09-01']=JSON.parse(JSON.stringify(base));
  app.dataStore['2026-09-01'][0].memo='로컬 미전송';
  app.pendingSyncDates.add('2026-09-01');
  app.cloudSearchHistory['2026-09-01'][0].extra='클라우드 추가';
  edit.row.specialNote='새 메모'; edit.row._textColors={specialNote:'#123456'};edit.save(false);
  const local=app.dataStore['2026-09-01'];
  assert.equal(local[0].memo,'로컬 미전송'); assert.equal(local[0].extra,'클라우드 추가');
  const merged=app.mergeCloudRows(app.syncBaselines.get('2026-09-01'),local,app.cloudSearchHistory['2026-09-01']);
  assert.equal(merged[0].specialNote,'새 메모');assert.equal(merged[0]._textColors.specialNote,'#123456');
  assert.equal(merged[0].memo,'로컬 미전송');assert.equal(merged[0].extra,'클라우드 추가');
});

test('a changed patient at the source row is never overwritten by a stale editor', () => {
  const {app,edit,saved,notices} = fixture();
  app.cloudSearchHistory['2026-09-01'][0]={name:'교체환자',chartNo:'NEW',specialNote:'보존'};
  edit.row.specialNote='이전환자의 메모';edit.save(true);
  assert.equal(saved.length,0);assert.equal(app.dataStore['2026-09-01'],undefined);
  assert.equal(notices.at(-1)[1],true);
});

test('saving a note reads only its source date, even with unrelated local history', () => {
  const {app,edit} = fixture();
  Object.defineProperty(app.dataStore,'2025-01-01',{enumerable:true,get(){throw Error('unrelated date read');}});
  app.persistDataStore=()=>Promise.resolve();
  edit.row.specialNote='해당 날짜만 수정';edit.save(true);
  assert.equal(app.dataStore['2026-09-01'][0].specialNote,'해당 날짜만 수정');
});

test('included current-date results update the normal table cell as well as the source record', () => {
  const {app,edit} = fixture();
  const oldDate=edit.date;
  app.currentDate=oldDate;app.dataStore[oldDate]=JSON.parse(JSON.stringify(app.cloudSearchHistory[oldDate]));
  let rendered;
  app.elTableBody={querySelector:()=>({querySelector:()=>null})};
  app.applyCellFormatting=()=>{};app.renderColoredText=(cell,row,key)=>{rendered=[key,row[key]];};
  edit.row.specialNote='현재날짜 포함 수정';edit.save(true);
  assert.equal(app.getCurrentRows()[0].specialNote,'현재날짜 포함 수정');
  assert.deepEqual(rendered,['specialNote','현재날짜 포함 수정']);
});

test('deleting a history note clears only that cell and its stale rich text', () => {
  const {app,edit} = fixture();
  app.cloudSearchHistory['2026-09-01'][0]._richText={specialNote:{text:'이전 메모'},part:{text:'허리'}};
  edit.row.specialNote='';edit.save(true);
  const row=app.dataStore['2026-09-01'][0];
  assert.equal(row.specialNote,'');assert.equal(row._richText.specialNote,undefined);assert.equal(row._richText.part.text,'허리');
});

test('only a single special-note Enter starts editing; other history Enter retains Apply', () => {
  const {app} = fixture();let edits=0, applies=0;
  app.elTableBody={querySelector:()=>({click:()=>applies++})};
  app.startHistoryNoteEdit=()=>edits++;
  app.crossDateSelection={minRow:0,maxRow:0,minCol:9,maxCol:9};
  const enter=()=>({key:'Enter',target:{},preventDefault(){},stopPropagation(){}});
  app.handleHistoryApplyShortcut(enter());assert.equal(edits,1);assert.equal(applies,0);
  app.isCrossDateRowSelected=true;app.handleHistoryApplyShortcut(enter());assert.equal(applies,1);
  app.isCrossDateRowSelected=false;app.crossDateSelection.maxRow=1;app.handleHistoryApplyShortcut(enter());assert.equal(applies,2);
});
