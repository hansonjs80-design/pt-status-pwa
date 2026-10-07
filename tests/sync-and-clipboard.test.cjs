const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./helpers/load-app-source.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
function createApp(db = new Map()) {
  const storage = new Map();
  const context = vm.createContext({ window: { addEventListener() {} }, document: { activeElement: null },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }, setTimeout, clearTimeout,
    confirm: () => true, alert: () => {} });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  Object.assign(app, { currentDate: '2026-09-30', dataStore: {}, syncBaselines: new Map(), pendingSyncDates: new Set(), activePushes: new Map(), syncTimers: new Map(), editHistory: new Map() });
  for (const key of ['showSaveIndicator', 'notifyCloudChange', 'renderTable', 'updateSidebarStats', 'updateHistoryButtons', 'renderQuickChips', 'refreshSearchSuggestions']) app[key] = () => {};
  app.isEditingCell = () => false;
  app.supabaseClient = { from() {
    let action = 'read', record, conditions = [];
    const query = { select() { return query; }, eq(k,v) { conditions.push([k,v]); return query; }, is(k,v) { conditions.push([k,v]); return query; }, update(r) { action='update'; record=r; return query; }, insert(r) { action='insert'; record=r; return query; }, upsert(r) { action='upsert'; record=r; return query; }, maybeSingle() { return query; }, then(resolve, reject) {
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
test('offline edits retain their date and baseline for retry after restart', () => {
  const {app, storage}=createApp(); app.supabaseClient=null;
  app.syncBaselines.set(app.currentDate,[{name:'이전'}]); app.scheduleSupabaseSync(); app.currentDate='2026-10-01';
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

