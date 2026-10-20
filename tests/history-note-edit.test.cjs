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
  return {app,edit,saved,queued,notices,storage,timers};
}

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
