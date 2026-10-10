const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./helpers/load-app-source.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
function createApp(db = new Map()) {
  const storage = new Map();
  const context = vm.createContext({ window: { addEventListener() {} }, document: { activeElement: null },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }, setTimeout, clearTimeout, AbortController,
    confirm: () => true, alert: () => {} });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  Object.assign(app, { currentDate: '2026-09-30', dataStore: {}, syncBaselines: new Map(), pendingSyncDates: new Set(), activePushes: new Map(), syncTimers: new Map(), editHistory: new Map() });
  for (const key of ['showSaveIndicator', 'notifyCloudChange', 'renderTable', 'updateSidebarStats', 'updateHistoryButtons', 'renderQuickChips', 'refreshSearchSuggestions']) app[key] = () => {};
  app.isEditingCell = () => false;
  app.supabaseClient = { from() {
    let action = 'read', record, conditions = [];
    const query = { select() { return query; }, abortSignal() { return query; }, eq(k,v) { conditions.push([k,v]); return query; }, is(k,v) { conditions.push([k,v]); return query; }, update(r) { action='update'; record=r; return query; }, insert(r) { action='insert'; record=r; return query; }, upsert(r) { action='upsert'; record=r; return query; }, maybeSingle() { return query; }, then(resolve, reject) {
      return Promise.resolve().then(() => {
        if (action === 'read') return { data: clone(db.get(conditions.find(([k]) => k === 'date')[1]) || null) };
        const old = db.get(record.date);
        if (action === 'insert' && old) return { error: { code: '23505' } };
        if (action === 'update' && !conditions.every(([k,v]) => old?.[k] === v)) return { data: [] };
        db.set(record.date, clone(record)); return { data: [{ date: record.date }] };
      }).then(resolve, reject);
    }}; return query;
  }};
  return { app, storage, context };
}
test('Excel TSV preserves empty cells, multiline cells and escaped quotes', () => {
  const { app } = createApp();
  assert.deepEqual(clone(app.parseClipboardGrid('123\t가상\t\r\n456\t"두\n줄"\t"인용 ""문자"""\r\n')), [['123','가상',''],['456','두\n줄','인용 "문자"']]);
});
test('two computers concurrently editing different cells retain both changes', async () => {
  const date='2026-09-30', db = new Map([[date, { date, rows_data: [{ name: '테스트', memo: '' }], updated_at: '2026-09-30T00:00:00.000Z' }]]);
  const a=createApp(db).app, b=createApp(db).app;
  for (const app of [a,b]) { app.dataStore[date]=clone(db.get(date).rows_data); app.syncBaselines.set(date,clone(app.dataStore[date])); app.pendingSyncDates.add(date); }
  a.dataStore[date][0].name='변경'; b.dataStore[date][0].memo='메모';
  await Promise.all([a.pushToCloud(date), b.pushToCloud(date)]);
  assert.deepEqual(db.get(date).rows_data[0], {name:'변경', memo:'메모'});
  await a.pullFromCloud(date);
  assert.equal(a.dataStore[date][0].memo, '메모');
});
test('offline edits retain their date and baseline for retry after restart', async () => {
  const {app, storage}=createApp(); app.supabaseClient=null;
  app.syncBaselines.set(app.currentDate,[{name:'이전'}]); app.scheduleSupabaseSync(); app.currentDate='2026-10-01';
  await Promise.resolve(); await app._baselineWrite;
  assert.deepEqual(JSON.parse(storage.get('PT_PENDING_DATES')), ['2026-09-30']);
  assert.equal(JSON.parse(storage.get('PT_SYNC_BASELINES'))['2026-09-30'][0].name, '이전');
});
test('preset edits and deletions propagate to another computer', async () => {
  const db=new Map(), a=createApp(db), b=createApp(db);
  vm.runInContext('COLUMN_PRESETS = { prescription: ["새 처방"], extra: ["도수"] };', a.context);
  a.app.presetsDirty=true; await a.app.pushSharedPresets(); await b.app.pullSharedPresets();
  assert.deepEqual(clone(vm.runInContext('COLUMN_PRESETS',b.context)), {prescription:['새 처방'],extra:['도수']});
  vm.runInContext('COLUMN_PRESETS.extra = [];', a.context);
  a.app.presetsDirty=true; await a.app.pushSharedPresets(); await b.app.pullSharedPresets();
  assert.deepEqual(clone(vm.runInContext('COLUMN_PRESETS.extra',b.context)), []);
  assert.equal(a.app.presetsDirty,false);
});

test('typing during asynchronous baseline persistence stays pending and is not overwritten', async () => {
  const date='2026-09-30', db=new Map([[date,{date,rows_data:[{name:'가상',memo:'서버'}],updated_at:null}]]);
  const {app}=createApp(db);
  app.dataStore[date]=[{name:'가상',memo:'로컬'}];
  app.syncBaselines.set(date,[{name:'가상',memo:''}]);
  app.pendingSyncDates.add(date);
  let release,started;
  let saving=new Promise(resolve=>{started=resolve;});
  app.persistSyncBaselines=()=>{started();return new Promise(resolve=>{release=resolve;});};
  const push=app.pushToCloud(date);
  await saving;app.dataStore[date][0].memo='저장 도중 입력';release();await push;
  assert.equal(app.pendingSyncDates.has(date),true);
  assert.equal(app.dataStore[date][0].memo,'저장 도중 입력');
  app.pendingSyncDates.clear();
  saving=new Promise(resolve=>{started=resolve;});
  const pull=app.pullFromCloud(date);
  await saving;app.dataStore[date][0].memo='수신 도중 입력';release();await pull;
  assert.equal(app.dataStore[date][0].memo,'수신 도중 입력');
});


test('cloud merge preserves local undo and redo while retaining unrelated remote edits', async () => {
  const db=new Map(),{app}=createApp(db),date=app.currentDate;
  app.dataStore[date]=app.createDefaultEmptyRows();
  const baseline=clone(app.dataStore[date]);
  app.syncBaselines.set(date,baseline);app.getEditHistory();
  app.dataStore[date][0].name='적용환자';app.captureHistory();
  const remote=clone(baseline);remote[1].memo='다른 기기 메모';
  db.set(date,{date,rows_data:remote,updated_at:null});
  app.pendingSyncDates.add(date);
  await app.pushToCloud(date);
  assert.equal(app.getEditHistory().undo.length,1,'sync must not erase the Apply transaction');
  const undone=JSON.parse(app.getEditHistory().undo.at(-1));
  assert.equal(undone[0].name,'');assert.equal(undone[1].memo,'다른 기기 메모');
  app.dataStore[date]=undone;
  const history=app.getEditHistory();history.redo.push(history.current);history.current=history.undo.pop();
  const incoming=clone(db.get(date).rows_data);incoming[2].memo='추가 원격 메모';
  db.set(date,{date,rows_data:incoming,updated_at:'2026-10-01T00:00:00Z'});
  app.pendingSyncDates.clear();await app.pullFromCloud(date);
  assert.equal(history.redo.length,1);
  const redone=JSON.parse(history.redo[0]);
  assert.equal(redone[0].name,'적용환자');assert.equal(redone[1].memo,'다른 기기 메모');assert.equal(redone[2].memo,'추가 원격 메모');
});

test('older dates missing on the server retain all local rows on upload and another device receives them', async () => {
  for (const date of ['2026-03-05','2026-06-07','2026-06-08']) {
    const db=new Map(),a=createApp(db).app,b=createApp(db).app;
    a.dataStore[date]=[{name:'보존1'},{name:'보존2'}];a.syncBaselines.set(date,clone(a.dataStore[date]));a.pendingSyncDates.add(date);
    await a.pushToCloud(date);assert.equal(a.dataStore[date][0].name,'보존1');assert.equal(db.get(date).rows_data[1].name,'보존2');
    await b.pullFromCloud(date);assert.equal(b.dataStore[date][0].name,'보존1');
  }
});
test('legacy local records without a confirmed baseline survive an empty cloud result', async () => {
  const {app}=createApp();const date='2026-03-05';app.dataStore[date]=[{name:'미전송기록'}];
  await app.pullFromCloud(date);assert.equal(app.dataStore[date][0].name,'미전송기록');assert.equal(app.pendingSyncDates.has(date),false);
});
test('older cloud rows with a null timestamp can be updated',async()=>{
  const date='2026-03-05',db=new Map([[date,{date,rows_data:[{name:'이전'}],updated_at:null}]]),{app}=createApp(db);
  app.dataStore[date]=[{name:'변경'}];app.syncBaselines.set(date,[{name:'이전'}]);app.pendingSyncDates.add(date);await app.pushToCloud(date);
  assert.equal(db.get(date).rows_data[0].name,'변경');assert.equal(app.pendingSyncDates.has(date),false);
});

test('restoring backup resets baselines, registers pending sync, and uploads to cloud', async () => {
  const db = new Map();
  const a = createApp(db).app, b = createApp(db).app;
  a.confirm = () => true; a.alert = () => {}; a.closeBackupModal = () => {}; a.setDate = () => {}; a.getCurrentRows = () => (a.dataStore[a.currentDate] || []);
  globalThis.confirm = () => true; globalThis.alert = () => {};

  const payload = {
    version: 1,
    dataStore: {
      '2026-10-01': [{ name: '복원환자1', chartNo: '1001' }],
      '2026-10-02': [{ name: '복원환자2', chartNo: '1002' }]
    },
    presets: { prescription: ['복원처방'], extra: ['복원추가'] }
  };

  // 기존 baseline이 남아있던 상태를 시뮬레이션
  a.syncBaselines.set('2026-10-01', [{ name: '예전환자', chartNo: '9999' }]);

  await a.restoreDataPayload(payload);

  // 복원된 날짜의 이전 baseline이 삭제되었는지 확인 (잘못된 3-way 병합 방지)
  assert.equal(a.syncBaselines.has('2026-10-01'), false);
  assert.equal(a.pendingSyncDates.has('2026-10-01'), true);
  assert.equal(a.pendingSyncDates.has('2026-10-02'), true);

  // 클라우드로 push 수행
  await a.pushToCloud('2026-10-01');
  await a.pushToCloud('2026-10-02');

  // 다른 기기(b)에서 pull했을 때 복원된 데이터가 온전히 도착하는지 확인
  await b.pullFromCloud('2026-10-01');
  assert.equal(b.dataStore['2026-10-01'][0].name, '복원환자1');
  assert.equal(b.dataStore['2026-10-01'][0].chartNo, '1001');

  await b.pullFromCloud('2026-10-02');
  assert.equal(b.dataStore['2026-10-02'][0].name, '복원환자2');
});


function setSharedColumn(app, column, property, value) {
  const client=app.supabaseClient;app.supabaseClient=null;
  app.setColumnFormatting({minCol:column,maxCol:column},property,value);
  app.supabaseClient=client;
}

test('legacy HSL and RGB column colors load, save and synchronize without rejecting the entire configuration', async () => {
  const db=new Map([['__pt_shared_column_formatting_v1__',{date:'__pt_shared_column_formatting_v1__',updated_at:'2026-10-08T07:15:12.677+00:00',rows_data:[{columnFormatting:{
    extra:{color:{value:'hsl(215 55% 48%)',revision:'old-extra'}},
    memo:{color:{value:'rgb(255, 0, 0)',revision:'old-memo'}}
  }}]}]]);
  const a=createApp(db),b=createApp(db);const notices=[];a.app.showSaveIndicator=value=>notices.push(value);
  await a.app.pullSharedColumnFormatting();
  assert.equal(a.app.getColumnFontSettings()[6].color,'#376fbe');
  assert.equal(a.app.getCellFormatting({},'memo','color'),'#ff0000');
  const beforeMemo=clone(a.app.columnFormatting.memo);
  setSharedColumn(a.app,3,'fontSize',18.5);setSharedColumn(a.app,3,'color','hsl(120 100% 25%)');
  assert.equal(await a.app.syncSharedColumnFormatting(),true);
  assert.equal(a.app.getCellFormatting({},'name','color'),'#008000');
  assert.deepEqual(clone(a.app.columnFormatting.memo),beforeMemo);
  assert.equal(notices.some(value=>value.includes('대기')||value.includes('재시도')),false);
  a.app.columnFormatting=a.app.loadColumnFormatting();await b.app.pullSharedColumnFormatting();
  assert.deepEqual(clone(a.app.columnFormatting),clone(b.app.columnFormatting));
  assert.equal(b.app.getCellFormatting({},'name','fontSize'),18.5);
});

test('reload restores queued column settings even if the cache snapshot is missing or stale', () => {
  const {app,storage}=createApp();
  storage.set('PT_COLUMN_FORMATTING',JSON.stringify({name:{fontSize:{value:14,revision:'cache'}}}));
  storage.set('PT_COLUMN_FORMATTING_PENDING',JSON.stringify({name:{fontSize:{value:20.5,revision:'queued'},color:{value:'hsl(215 55% 48%)',revision:'queued-color'}}}));
  app.columnFormatting=app.loadColumnFormatting();assert.equal(app.getColumnFontSettings()[3].fontSize,20.5);
  assert.match(app.getColumnFontSettings()[3].color,/^#[0-9a-f]{6}$/);
  storage.delete('PT_COLUMN_FORMATTING');app.columnFormatting=app.loadColumnFormatting();
  assert.equal(app.getColumnFontSettings()[3].fontSize,20.5);
});

test('overlapping column save requests share one operation instead of losing or duplicating writes', async () => {
  const {app}=createApp();app.columnFormatting={};setSharedColumn(app,3,'fontSize',20.5);
  const original=app.supabaseClient.from;let release,reads=0,writes=0;
  const gate=new Promise(resolve=>{release=resolve;});
  app.supabaseClient.from=()=>{
    const query=original();const update=query.insert;
    query.insert=record=>{writes++;return update(record);};
    query.maybeSingle=()=>{reads++;return gate.then(()=>query);};return query;
  };
  const one=app.syncSharedColumnFormatting(),two=app.syncSharedColumnFormatting();assert.equal(reads,1);
  release();assert.equal(await one,true);assert.equal(await two,true);assert.equal(writes,1);
});

test('connection failure keeps queued settings across restart and reports one waiting notice until recovery', async () => {
  const {app}=createApp();app.columnFormatting={};setSharedColumn(app,3,'fontSize',21.5);
  const notices=[];app.showSaveIndicator=value=>notices.push(value);const client=app.supabaseClient;
  app.supabaseClient={from(){throw Error('offline');}};
  assert.equal(await app.syncSharedColumnFormatting(),false);assert.equal(await app.syncSharedColumnFormatting(),false);
  assert.equal(notices.filter(value=>value.includes('대기')).length,1);
  app.columnFormatting=app.loadColumnFormatting();assert.equal(app.getColumnFontSettings()[3].fontSize,21.5);
  app.supabaseClient=client;assert.equal(await app.syncSharedColumnFormatting(),true);
  assert.equal(app.columnFormattingSyncFailed,false);assert.equal(Object.keys(app.columnFormattingPending).length,0);
});

test('column settings save independently while the daily-record synchronization is blocked', async () => {
  const {app,context}=createApp();app.columnFormatting={};setSharedColumn(app,3,'fontSize',22.5);
  context.setInterval=setInterval;context.clearInterval=clearInterval;
  context.document.addEventListener=()=>{};
  app.supabaseClient.channel=()=>{const channel={on(){return channel;},subscribe(){},send(){}};return channel;};
  app.supabaseClient.removeChannel=()=>{};
  app.pendingSyncDates.add('2026-09-30');app.pushToCloud=()=>new Promise(()=>{});
  app.startLiveSync();
  try {
    await app.columnFormattingSyncTask;
    await app.staffCountSyncTask?.promise;
    assert.equal(Object.keys(app.columnFormattingPending).length,0);
    assert.equal(app.liveRefreshBusy,true);
  } finally {app.stopLiveSync();}
});

test('explicit column apply propagates resets to other devices and retains subsequent cell edits after reload', async () => {
  const db=new Map(),a=createApp(db).app,b=createApp(db).app;a.columnFormatting={};b.columnFormatting={};
  const client=a.supabaseClient;a.supabaseClient=null;
  a.applyColumnFontSettings([{...a.getColumnFontSettings()[3],fontSize:20.5,fontWeight:'800',color:'#123456'}]);
  a.supabaseClient=client;await a.pushSharedColumnFormatting();await b.pullSharedColumnFormatting();
  const row={name:'이전색',_textColors:{name:'#ff0000'},_textStyles:{name:{fontSize:10,fontWeight:400}},_richText:{name:{text:'이전색',colors:['#ff0000',null,null]}}};
  assert.equal(b.getCellFormatting(row,'name','color'),'#123456');assert.equal(b.getEffectiveCellRichText(row,'name'),undefined);
  assert.equal(b.getCellFormatting(row,'name','fontSize'),20.5);assert.equal(b.getCellFormatting(row,'name','fontWeight'),'800');
  b.applyPastedCellColors(row,'name',{color:'#0000ff'});
  b.columnFormatting=b.loadColumnFormatting();
  assert.equal(b.getCellFormatting(row,'name','color'),'#0000ff');
  assert.equal(b.getCellFormatting(row,'name','fontSize'),20.5);
});

test('column defaults synchronize between devices, replacing old device caches and preserving cell exceptions', async () => {
  const db=new Map(),a=createApp(db),b=createApp(db);
  a.app.columnFormatting={};b.app.columnFormatting={name:{fontSize:{value:9,revision:'old-device'}}};
  setSharedColumn(a.app,3,'fontSize',18.5);setSharedColumn(a.app,3,'fontWeight','700');setSharedColumn(a.app,3,'color','#123456');
  await a.app.pushSharedColumnFormatting();await b.app.pullSharedColumnFormatting();
  assert.deepEqual(clone(b.app.columnFormatting),clone(a.app.columnFormatting));
  assert.equal(b.app.getCellFormatting({},'name','fontSize'),18.5);
  const exception={_textStyles:{name:{fontSize:12,fontWeight:400}},_textColors:{name:'#ff0000'}};
  assert.equal(b.app.getCellFormatting(exception,'name','fontSize'),12);
  assert.equal(b.app.getCellFormatting(exception,'name','fontWeight'),400);
  assert.equal(b.app.getCellFormatting(exception,'name','color'),'#ff0000');
  assert.deepEqual(clone(a.app.columnFormattingPending),{});
  assert.equal(JSON.parse(b.storage.get('PT_COLUMN_FORMATTING')).name.fontSize.value,18.5);
});

test('simultaneous column edits on different devices merge without overwriting unrelated settings', async () => {
  const db=new Map(),a=createApp(db).app,b=createApp(db).app;a.columnFormatting={};b.columnFormatting={};
  await a.pullSharedColumnFormatting();await b.pullSharedColumnFormatting();
  setSharedColumn(a,3,'fontSize',22.5);setSharedColumn(b,8,'color','#ff0000');
  await Promise.all([a.pushSharedColumnFormatting(),b.pushSharedColumnFormatting()]);
  await a.pullSharedColumnFormatting();await b.pullSharedColumnFormatting();
  assert.equal(a.getCellFormatting({},'name','fontSize'),22.5);
  assert.equal(a.getCellFormatting({},'memo','color'),'#ff0000');
  assert.deepEqual(clone(a.columnFormatting),clone(b.columnFormatting));
});

test('offline pending column settings survive reload and merge with newer shared settings on reconnect', async () => {
  const db=new Map(),a=createApp(db),b=createApp(db);a.app.columnFormatting={};b.app.columnFormatting={};
  await a.app.pullSharedColumnFormatting();await b.app.pullSharedColumnFormatting();
  setSharedColumn(a.app,3,'fontSize',19.5);
  setSharedColumn(b.app,8,'fontWeight','700');await b.app.pushSharedColumnFormatting();
  a.app.columnFormatting=a.app.loadColumnFormatting();
  assert.equal(a.app.columnFormattingPending.name.fontSize.value,19.5);
  await a.app.pushSharedColumnFormatting();await b.app.pullSharedColumnFormatting();
  assert.equal(b.app.getCellFormatting({},'name','fontSize'),19.5);
  assert.equal(b.app.getCellFormatting({},'memo','fontWeight'),'700');
});

test('shared column changes preserve an active native editor and repaint after composition finishes', () => {
  const {app}=createApp();app.columnFormatting={};let editing=true,renders=0;
  app.isEditingCell=()=>editing;app.renderTable=()=>renders++;
  const shared={name:{fontSize:{value:16.5,revision:'shared'}}};
  app.acceptSharedColumnFormatting(shared);assert.equal(renders,0);assert.equal(app.getCellFormatting({},'name','fontSize'),16.5);
  editing=false;app.acceptSharedColumnFormatting(shared);assert.equal(renders,1);
});

test('saving an open manager only publishes edited fields and preserves newly received defaults', () => {
  const {app}=createApp();app.supabaseClient=null;app.columnFormatting={};
  app.saveColumnFontSettings(app.getColumnFontSettings());app.columnFormattingPending={};
  const baseline=app.getColumnFontSettings(),draft=clone(baseline);
  draft[3].fontSize=21.5;
  const remote=clone(app.columnFormatting);remote.memo.color={value:'#ff0000',revision:'new-remote'};
  app.acceptSharedColumnFormatting(remote);
  app.saveColumnFontSettings(draft,baseline);
  assert.equal(app.columnFormatting.memo.color.value,'#ff0000');
  assert.equal(app.columnFormatting.name.fontSize.value,21.5);
});
