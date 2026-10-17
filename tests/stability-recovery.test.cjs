const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./helpers/load-app-source.cjs');

function harness() {
  const storage = new Map(), timers = new Map(), opens = [], states = [];
  let timerId = 0;
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { activeElement: null }, AbortController,
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    indexedDB: { open() { const request = {}; opens.push(request); return request; } },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  Object.assign(app, {
    currentDate: '2026-10-15', dataStore: {}, syncBaselines: new Map(), editHistory: new Map(),
    pendingSyncDates: new Set(), activePushes: new Map(), syncTimers: new Map(), columnFormatting: {},
  });
  for (const method of ['showSaveIndicator', 'renderTable', 'updateSidebarStats', 'updateHistoryButtons', 'notifyCloudChange']) app[method] = () => {};
  app.isEditingCell = () => false;
  app.updateLocalRestoreUI = state => states.push({ state, locked: app._recordsRestorePending });
  const expire = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); };
  return { app, storage, timers, opens, states, context, expire };
}
const drain = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
function database() {
  const transactions = [];
  return {
    closed: 0, transactions,
    close() { this.closed++; },
    transaction() {
      const request = {}, tx = {
        request, aborted: 0,
        objectStore: () => ({ get: () => request, put: () => request }),
        abort() { this.aborted++; this.onabort?.(); },
      };
      transactions.push(tx);
      return tx;
    },
  };
}

test('blocked database open fails visibly, closes late success and permits a fresh attempt', async () => {
  const { app, opens, timers } = harness();
  const first = app.openLocalDatabase('PT_SYNC_STATE', 'state');
  const rejected = assert.rejects(first, /다른 창/);
  opens[0].onblocked();
  await rejected;
  const late = database(); opens[0].result = late; opens[0].onsuccess();
  assert.equal(late.closed, 1);
  const next = app.openLocalDatabase('PT_SYNC_STATE', 'state');
  assert.equal(opens.length, 2);
  const db = database(); opens[1].result = db; opens[1].onsuccess();
  assert.equal(await next, db);
  assert.equal(timers.size, 0);
  db.onversionchange();
  assert.equal(db.closed, 1);
  assert.equal(app._localDatabases.size, 0);
});

test('database timeout aborts an unfinished write and a retry reads from a new connection', async () => {
  const { app, opens, expire, timers } = harness();
  const first = app.syncStateDisk('records', 'draft');
  const db = database(); opens[0].result = db; opens[0].onsuccess();
  await drain();
  const failure = assert.rejects(first, /응답 시간/);
  expire(); await failure;
  assert.equal(db.transactions[0].aborted, 1);
  assert.equal(db.closed, 1);
  // Late completion must not turn the failed write into a successful save.
  db.transactions[0].oncomplete();
  const retry = app.syncStateDisk('records');
  const reopened = database(); opens[1].result = reopened; opens[1].onsuccess();
  await drain();
  reopened.transactions[0].request.result = 'preserved';
  reopened.transactions[0].oncomplete();
  assert.equal(await retry, 'preserved');
  assert.equal(timers.size, 0);
});

test('database open without any callback times out and releases its cached promise', async () => {
  const { app, expire } = harness();
  const pending = app.openLocalDatabase('PT_SYNC_STATE', 'state');
  const rejected = assert.rejects(pending, /연결 시간/);
  expire(); await rejected;
  assert.equal(app._localDatabases.size, 0);
});

test('failed disk restoration preserves stored bytes, blocks saving and recovers on retry', async () => {
  const { app, storage, states } = harness();
  storage.set('PT_APP_DATA_STORAGE_V1', '"indexedDB"');
  app._recordsOnDisk = true;
  let fail = true;
  app.syncStateDisk = async key => {
    if (key !== 'records') return '{}';
    if (fail) throw Error('temporary storage failure');
    return JSON.stringify({ '2026-10-15': [{ name: '가상 복원', memo: '보존됨' }] });
  };
  await app.restoreLocalState();
  assert.equal(states.at(-1).state, 'records-error');
  assert.equal(app._recordsRestorePending, true);
  await assert.rejects(app.persistDataStore({}), /복원 중/);
  assert.equal(storage.get('PT_APP_DATA_STORAGE_V1'), '"indexedDB"');
  fail = false;
  await app.restoreLocalState();
  assert.equal(app._recordsRestorePending, false);
  assert.equal(states.at(-1).state, '');
  assert.equal(app.dataStore['2026-10-15'][0].memo, '보존됨');
  await app.syncBaselinesReady;
});

test('baseline failure does not lock restored records or replace edits when retried', async () => {
  const { app, storage, states } = harness();
  storage.set('PT_SYNC_BASELINES', '"indexedDB"');
  app._recordsOnDisk = true;
  let fail = true, reads = 0;
  app.syncStateDisk = async key => {
    if (key === 'baselines' && fail) throw Error('baseline unavailable');
    if (key === 'records') { reads++; return '{"2026-10-15":[{"name":"가상"}]}'; }
    return '{}';
  };
  await app.restoreLocalState();
  assert.equal(app._recordsRestorePending, false);
  assert.equal(states.at(-1).state, 'sync-error');
  app.dataStore['2026-10-15'][0].memo = '복원 뒤 편집';
  fail = false;
  await app.restoreLocalState();
  assert.equal(reads, 1, 'retry only failed synchronization state, not editable records');
  assert.equal(app.dataStore['2026-10-15'][0].memo, '복원 뒤 편집');
});

test('retry is coalesced until all restoration tasks settle', async () => {
  const { app } = harness();
  app._recordsOnDisk = true;
  let release;
  app.restoreSyncBaselines = async () => { throw Error('baseline failure'); };
  app.restoreManualDateDeletions = async () => {};
  app.restoreDiskRecords = () => new Promise(resolve => { release = resolve; });
  const first = app.restoreLocalState();
  await drain();
  assert.equal(app.restoreLocalState(), first);
  release(); await first;
  assert.equal(app._localRestoreTask, null);
});

test('malformed date rows are retained for recovery instead of crashing table initialization', async () => {
  const { app, storage } = harness();
  for (const value of ['{"2026-10-15":{}}', '{"2026-10-15":[null]}']) {
    storage.set('PT_APP_DATA_STORAGE_V1', value);
    app.loadDataStore();
    await assert.rejects(app.persistDataStore({}), /기록 저장 형식/);
    assert.equal(storage.get('PT_APP_DATA_STORAGE_V1'), value);
  }
});

test('cloud timeout releases the preset lock, keeps unsaved changes and can retry', async () => {
  const { app, storage, expire, timers } = harness();
  app.presetsDirty = true;
  storage.set('PT_PRESETS_PENDING', '1');
  let aborted = false;
  const query = { upsert() { return this; }, abortSignal(signal) { signal.addEventListener('abort', () => { aborted = true; }); return this; }, then() {} };
  app.supabaseClient = { from: () => query };
  const first = app.pushSharedPresets();
  await drain();
  assert.equal(app.presetsPushing, true);
  expire(); await first;
  assert.equal(aborted, true);
  assert.equal(app.presetsDirty, true);
  assert.equal(app.presetsPushing, false);
  app.supabaseClient = { from: () => ({ upsert: () => Promise.resolve({}) }) };
  await app.pushSharedPresets();
  // Successful retry clears the persisted pending flag.
  assert.equal(app.presetsDirty, false);
  assert.equal(storage.has('PT_PRESETS_PENDING'), false);
  assert.equal(timers.size, 0);
});

test('cloud timeout releases record and formatting locks while retaining their pending edits', async () => {
  for (const kind of ['records', 'formatting']) {
    const { app, expire } = harness();
    const date = app.currentDate;
    app.dataStore[date] = [{ name: '가상 기록' }];
    app.pendingSyncDates.add(date);
    app.columnFormattingPending = { name: { fontSize: { value: 16, revision: 'local' } } };
    const query = { select() { return this; }, eq() { return this; }, maybeSingle() { return this; }, then() {} };
    app.supabaseClient = { from: () => query };
    const pending = kind === 'records' ? app.pushToCloud(date) : app.syncSharedColumnFormatting();
    await drain(); expire(); await pending;
    assert.equal(app.activePushes.size, 0);
    assert.equal(Boolean(app.columnFormattingSyncBusy), false);
    assert.equal(Boolean(app.columnFormattingSyncTask), false);
    assert.equal(app.pendingSyncDates.has(date), true);
    assert.equal(app.columnFormattingPending.name.fontSize.value, 16);
    assert.equal(app.dataStore[date][0].name, '가상 기록');
  }
});

test('an old success message cannot hide a newer storage failure', () => {
  const { app, timers, expire } = harness();
  app.showSaveIndicator = Object.getPrototypeOf(app).showSaveIndicator;
  app.elSaveStatus = {};
  app.showSaveIndicator('클라우드 동기화 완료');
  assert.equal(timers.size, 1);
  app.showSaveIndicator('저장 실패', true);
  expire();
  assert.equal(app.elSaveStatus.textContent, '저장 실패');
  assert.equal(app.elSaveStatus.className, 'save-status unsaved');
});

test('a late cloud SDK starts synchronization without delaying local app initialization', () => {
  const { app, context } = harness();
  let onLoad, starts = 0;
  context.document.getElementById = () => ({ addEventListener(type, callback) { assert.equal(type, 'load'); onLoad = callback; } });
  app.startLiveSync = () => starts++;
  app.pullFromCloud = () => {};
  app.loadSearchHistory = () => {};
  app.updateSupabaseUI = () => {};
  app.initSupabase();
  assert.equal(starts, 0);
  const client = {};
  context.window.supabase = { createClient: () => client };
  onLoad();
  assert.equal(app.supabaseClient, client);
  assert.equal(starts, 1);
});

test('a superseded live refresh cannot release the busy flag of a newer session', async () => {
  const { app, context } = harness();
  context.setInterval = () => 1; context.clearInterval = () => {};
  app.setupNetworkSyncListeners = () => {};
  app.syncSharedColumnFormatting = () => {};
  app.syncStaffCountSettings = () => {};
  app.pullFromCloud = () => {};
  const releases = [];
  app.pullSharedPresets = () => new Promise(resolve => releases.push(resolve));
  app.supabaseClient = {
    channel: () => ({ on() { return this; }, subscribe() {} }), removeChannel() {},
  };
  app.startLiveSync(); app.startLiveSync();
  assert.equal(app.liveRefreshBusy, true);
  releases[0](); await drain();
  assert.equal(app.liveRefreshBusy, true);
  releases[1](); await drain();
  assert.equal(app.liveRefreshBusy, false);
  app.stopLiveSync();
});


test('large records and merge baselines move to verified asynchronous storage before quota failure', async () => {
  const {app,storage}=harness();
  const records={'2026-10-15':[{name:'가상 대용량',memo:'x'.repeat(300000)}]};
  const disk=new Map(), writes=[];
  app.syncStateDisk=async (key,value)=>{
    if(value!==undefined){writes.push(key);disk.set(key,value);}
    return disk.get(key);
  };
  await app.persistDataStore(records);
  await app.persistSyncBaselines(new Map(Object.entries(records)));
  assert.deepEqual(writes,['records','baselines']);
  assert.equal(storage.get('PT_APP_DATA_STORAGE_V1'),'"indexedDB"');
  assert.equal(storage.get('PT_SYNC_BASELINES'),'"indexedDB"');
  assert.deepEqual(JSON.parse(disk.get('records')),records);
  assert.deepEqual(JSON.parse(disk.get('baselines')),records);
  app._recordsOnDisk=true;await app.restoreDiskRecords();
  await app.restoreSyncBaselines();
  assert.equal(app.dataStore['2026-10-15'][0].memo,records['2026-10-15'][0].memo);
  assert.equal(app.syncBaselines.get('2026-10-15')[0].name,'가상 대용량');
});

test('failed proactive disk migration preserves the previous snapshot until a verified retry', async () => {
  for(const kind of ['records','baselines']) {
    const {app,storage}=harness();
    const key=kind==='records'?'PT_APP_DATA_STORAGE_V1':'PT_SYNC_BASELINES';
    const before=JSON.stringify({'2026-10-15':[{name:'기존 가상 기록'}]});storage.set(key,before);
    const records={'2026-10-15':[{name:'새 가상 기록',memo:'x'.repeat(300000)}]};
    const save=()=>kind==='records'?app.persistDataStore(records):app.persistSyncBaselines(new Map(Object.entries(records)));
    app.syncStateDisk=async()=>{throw Error('temporary disk failure');};
    await assert.rejects(save(),/temporary disk failure/);
    assert.equal(storage.get(key),before);
    app.syncStateDisk=async()=> 'invalid verification';
    await assert.rejects(save(),/검증/);
    assert.equal(storage.get(key),before);
    let saved;app.syncStateDisk=async(_key,value)=>value===undefined?saved:(saved=value);
    await save();assert.equal(storage.get(key),'"indexedDB"');
    assert.deepEqual(JSON.parse(saved),records);
  }
});

test('typing avoids row serialization, retains pending dates and retries unavailable storage', () => {
  const {app,context,storage,timers}=harness();
  const buttons={btnUndo:{disabled:true},btnRedo:{disabled:false}};
  context.document.getElementById=id=>buttons[id];
  app.updateHistoryButtons=context.App.prototype.updateHistoryButtons;
  app.dataStore[app.currentDate]=[{memo:'원래'}];app.getEditHistory();
  let serializations=0,writes=0,fail=false;
  app.dataStore[app.currentDate][0].toJSON=function(){serializations++;return {memo:this.memo};};
  context.localStorage.setItem=(key,value)=>{writes++;if(fail)throw Error('temporary storage');storage.set(key,value);};
  for(let i=0;i<100;i++){app.dataStore[app.currentDate][0].memo='입력'+i;app.debounceSaveDataStore();}
  assert.equal(serializations,0);assert.equal(writes,1);assert.equal(timers.size,1);
  assert.equal(buttons.btnUndo.disabled,false);assert.equal(buttons.btnRedo.disabled,true);
  assert.deepEqual(JSON.parse(storage.get('PT_PENDING_DATES')),[app.currentDate]);
  app.pendingSyncDates.clear();storage.set('PT_PENDING_DATES','[]');app.debounceSaveDataStore();
  assert.equal(writes,2);assert.deepEqual(JSON.parse(storage.get('PT_PENDING_DATES')),[app.currentDate]);
  app.currentDate='2026-10-16';app.getEditHistory();fail=true;app.debounceSaveDataStore();
  fail=false;app.debounceSaveDataStore();assert.equal(writes,4);
  assert.deepEqual(JSON.parse(storage.get('PT_PENDING_DATES')),['2026-10-15','2026-10-16']);
});

test('explicit save cancels the trailing input save and restores exact undo state for reverted typing', async () => {
  const {app,context,timers}=harness();
  const buttons={btnUndo:{disabled:true},btnRedo:{disabled:true}};context.document.getElementById=id=>buttons[id];
  app.updateHistoryButtons=context.App.prototype.updateHistoryButtons;
  app.dataStore[app.currentDate]=[{memo:'원래'}];app.getEditHistory();
  let saves=0;app.persistDataStore=async()=>{saves++;};app.scheduleSupabaseSync=()=>{};
  app.dataStore[app.currentDate][0].memo='변경';app.debounceSaveDataStore();
  app.dataStore[app.currentDate][0].memo='원래';app.debounceSaveDataStore();
  assert.equal(buttons.btnUndo.disabled,false);
  await app.saveDataStore();
  assert.equal(saves,1);assert.equal(timers.size,0);assert.equal(app._saveTimer,null);
  assert.equal(buttons.btnUndo.disabled,true);assert.equal(app.getEditHistory().undo.length,0);
});

test('slow storage keeps one active write and only the newest waiting snapshot for each data kind', async () => {
  for(const kind of ['records','baselines']) {
    const {app}=harness();app._recordsOnDisk=true;app._baselinesOnDisk=true;
    const disk=new Map(),writes=[],releases=[];
    app.syncStateDisk=async(key,value)=>{
      if(value!==undefined){writes.push(JSON.parse(value));await new Promise(resolve=>releases.push(resolve));disk.set(key,value);}
      return disk.get(key);
    };
    const save=i=>{
      const records={'2026-10-15':[{name:'가상',memo:String(i)}]};
      return kind==='records'?app.persistDataStore(records):app.persistSyncBaselines(new Map(Object.entries(records)));
    };
    const first=save(0);await drain();
    let finished=0;const waiting=Array.from({length:100},(_,i)=>save(i+1).then(()=>{finished++;}));
    await drain();assert.equal(writes.length,1);assert.equal(finished,0);
    releases[0]();await first;await drain();
    assert.equal(writes.length,2);assert.equal(writes[1]['2026-10-15'][0].memo,'100',kind);
    assert.equal(finished,0,'superseded requests must wait for the latest snapshot to be verified');
    releases[1]();await Promise.all(waiting);await drain();
    assert.equal(writes.length,2);assert.equal(finished,100);
    assert.equal(JSON.parse(disk.get(kind))['2026-10-15'][0].memo,'100');
  }
});

test('a failed active write does not block the newest queued save or a later retry', async () => {
  const {app}=harness();app._recordsOnDisk=true;
  let failFirst,releaseLatest;const writes=[];let disk;
  app.syncStateDisk=async(_key,value)=>{
    if(value!==undefined){writes.push(value);if(writes.length===1)await new Promise((_,reject)=>{failFirst=reject;});
      else if(writes.length===2)await new Promise(resolve=>{releaseLatest=resolve;});disk=value;}
    return disk;
  };
  const first=app.persistDataStore({'2026-10-15':[{memo:'first'}]});
  const rejected=assert.rejects(first,/temporary write failure/);await drain();
  const queued=[app.persistDataStore({'2026-10-15':[{memo:'middle'}]}),app.persistDataStore({'2026-10-15':[{memo:'latest'}]})];
  failFirst(Error('temporary write failure'));await rejected;await drain();
  assert.equal(writes.length,2);assert.equal(JSON.parse(writes[1])['2026-10-15'][0].memo,'latest');
  releaseLatest();await Promise.all(queued);
  await app.persistDataStore({'2026-10-15':[{memo:'retry'}]});
  assert.equal(JSON.parse(disk)['2026-10-15'][0].memo,'retry');
});

test('verification failure rejects every coalesced caller and leaves both storage queues reusable', async()=>{
  const {app}=harness();app._recordsOnDisk=true;app._baselinesOnDisk=true;
  let release,first=true,fail=false;const disk=new Map();
  app.syncStateDisk=async(key,value)=>{
    if(value!==undefined){if(key==='records'&&first){first=false;await new Promise(resolve=>{release=resolve;});}disk.set(key,value);}
    return fail&&key==='records'&&value===undefined?'unverified':disk.get(key);
  };
  const active=app.persistDataStore({'2026-10-15':[{memo:'active'}]});await drain();
  const waiting=[app.persistDataStore({'2026-10-15':[{memo:'middle'}]}),app.persistDataStore({'2026-10-15':[{memo:'latest'}]})];
  const settled=Promise.allSettled(waiting);
  await app.persistSyncBaselines(new Map([['2026-10-15',[]]]));
  assert.ok(disk.has('baselines'),'a blocked record write must not block baseline storage');
  release();await active;fail=true;
  const results=await settled;assert.equal(results.every(result=>result.status==='rejected'&&/검증/.test(result.reason.message)),true);
  fail=false;await app.persistDataStore({'2026-10-15':[{memo:'retry'}]});
  assert.equal(JSON.parse(disk.get('records'))['2026-10-15'][0].memo,'retry');
});
