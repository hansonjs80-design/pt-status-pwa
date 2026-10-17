const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('./helpers/load-app-source.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const date='__pt_shared_presets_v1__';
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function harness() {
  const timers=new Map(),storage=new Map(),requests=[],db=new Map(),status=[];
  let serial=0,hook=async()=>{},clock=Date.now();
  class Clock extends Date {static now(){return clock;}}
  const context=vm.createContext({window:{addEventListener(){}},document:{activeElement:null},Date:Clock,AbortController,
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    setTimeout:(fn,delay)=>{timers.set(++serial,{fn,delay});return serial;},clearTimeout:id=>timers.delete(id),
    setInterval:(fn,delay)=>{timers.set(++serial,{fn,delay,interval:true});return serial;},clearInterval:id=>timers.delete(id)});
  vm.runInContext(source+'\nglobalThis.App=PTApp;globalThis.setPresets=v=>COLUMN_PRESETS=v;globalThis.getPresets=()=>COLUMN_PRESETS;',context);
  const app=Object.create(context.App.prototype);
  app.elSaveStatus={textContent:'저장 완료됨'};
  app.showSaveIndicator=(text,error)=>{app.elSaveStatus.textContent=text;app.elSaveStatus.title='';status.push({text,error});};
  app.renderQuickChips=app.refreshSearchSuggestions=app.notifyCloudChange=()=>{};
  Object.assign(app,{dataStore:{},currentDate:'2026-10-18',pendingSyncDates:new Set(),activePushes:new Map(),syncTimers:new Map()});
  const makeClient=()=>({from(){
    let action='read',fields,record;
    const query={select(value){fields=value;return query;},eq(){return query;},maybeSingle(){return query;},abortSignal(){return query;},
      upsert(value){action='upsert';record=clone(value);return query;},insert(value){action='insert';record=clone(value);return query;},
      then(resolve,reject){return Promise.resolve().then(async()=>{
        const request={action,fields,record};requests.push(request);
        const data=action==='read'?clone(db.get(date)||null):null;
        await hook(request);
        if(action==='read')return {data:fields==='updated_at'&&data?{updated_at:data.updated_at}:data};
        if(action==='insert'&&db.has(date))return {error:{code:'23505'}};
        db.set(date,record);return {};
      }).then(resolve,reject);}};return query;
  },channel(){return {on(){return this;},subscribe(){}};},removeChannel(){}});
  app.supabaseClient=makeClient();
  context.setPresets({memo:['초기 문구']});
  const seed=(presets={memo:['서버 문구']},updated_at='2026-10-18T00:00:00.000Z')=>db.set(date,{date,rows_data:[{presets}],total_count:0,updated_at});
  const edit=presets=>{context.setPresets(presets);app.schedulePresetSync();};
  const run=delay=>{for(const [id,timer]of [...timers])if(timer.delay===delay){if(!timer.interval)timers.delete(id);timer.fn();}};
  return {app,context,requests,db,timers,storage,status,seed,edit,run,makeClient,setHook:value=>{hook=value;},advance:ms=>{clock+=ms;}};
}

test('settings changed during upload are coalesced and sent immediately after the active snapshot',async()=>{
  const h=harness();let release;
  h.setHook(request=>request.action==='upsert'&&h.requests.filter(r=>r.action==='upsert').length===1?new Promise(resolve=>{release=resolve;}):undefined);
  h.edit({memo:['첫 문구']});const first=h.app.pushSharedPresets();await drain();
  for(let i=0;i<100;i++)h.edit({memo:['최신 문구 '+i]});
  const same=h.app.pushSharedPresets();assert.equal(first,same);assert.equal(h.requests.length,1);
  release();await first;
  assert.equal(h.requests.length,2);assert.equal(h.db.get(date).rows_data[0].presets.memo[0],'최신 문구 99');
  assert.equal(h.app.presetsDirty,false);assert.equal(h.storage.has('PT_PRESETS_PENDING'),false);
});

test('concurrent polls share one request and unchanged revisions avoid downloading the full list',async()=>{
  const h=harness();h.seed();let release;
  h.setHook(()=>new Promise(resolve=>{release=resolve;}));
  const tasks=Array.from({length:20},()=>h.app.pullSharedPresets());await drain();assert.equal(h.requests.length,1);
  release();await Promise.all(tasks);h.setHook(async()=>{});
  await h.app.pullSharedPresets();await h.app.pullSharedPresets();
  assert.deepEqual(h.requests.map(r=>r.fields),['rows_data, updated_at','updated_at','updated_at']);
  h.seed({memo:['새 서버 문구']},'2026-10-18T00:00:01.000Z');await h.app.pullSharedPresets();
  assert.deepEqual(h.requests.slice(-2).map(r=>r.fields),['updated_at','rows_data, updated_at']);
  assert.equal(h.context.getPresets().memo[0],'새 서버 문구');
  h.advance(30001);h.seed({memo:['버전이 같은 외부 변경']},'2026-10-18T00:00:01.000Z');await h.app.pullSharedPresets();
  assert.equal(h.requests.at(-1).fields,'rows_data, updated_at');assert.equal(h.context.getPresets().memo[0],'버전이 같은 외부 변경');
});

test('a forced realtime refresh arriving during a metadata poll upgrades that poll to a full read',async()=>{
  const h=harness();h.seed();await h.app.pullSharedPresets();let release;
  h.setHook(request=>request.fields==='updated_at'?new Promise(resolve=>{release=resolve;}):undefined);
  const task=h.app.pullSharedPresets();await drain();
  const forced=h.app.pullSharedPresets({force:true});assert.equal(task,forced);
  h.seed({memo:['실시간 변경']});release();await task;
  assert.equal(h.requests.at(-1).fields,'rows_data, updated_at');assert.equal(h.context.getPresets().memo[0],'실시간 변경');
});

test('a stale read cannot overwrite a local edit even if its upload already completed',async()=>{
  const h=harness();h.seed();let release;
  h.setHook(request=>request.action==='read'?new Promise(resolve=>{release=resolve;}):undefined);
  const read=h.app.pullSharedPresets();await drain();h.edit({memo:['저장한 최신 문구']});await h.app.pushSharedPresets();
  assert.equal(h.app.presetsDirty,false);release();await read;
  assert.equal(h.context.getPresets().memo[0],'저장한 최신 문구');assert.equal(h.db.get(date).rows_data[0].presets.memo[0],'저장한 최신 문구');
});

test('a failed upload retains pending settings and recovery clears only its own retry message',async()=>{
  const h=harness();h.edit({memo:['안전하게 보관']});h.setHook(()=>{throw Error('network offline');});
  await h.app.pushSharedPresets();assert.equal(h.app.presetsDirty,true);assert.equal(h.storage.get('PT_PRESETS_PENDING'),'1');
  assert.match(h.app.elSaveStatus.textContent,/빠른 입력 도구 동기화 대기/);assert.equal(h.app.elSaveStatus.title,'network offline');
  h.setHook(async()=>{});await h.app.pushSharedPresets();assert.equal(h.app.elSaveStatus.textContent,'빠른 입력 도구 동기화 완료');
  assert.equal(h.app.presetsSyncFailed,false);assert.equal(h.app.elSaveStatus.title,'');
  h.setHook(()=>{throw Error('offline again');});await h.app.pullSharedPresets();h.app.showSaveIndicator('기록 저장 실패',true);
  h.setHook(async()=>{});await h.app.pullSharedPresets();assert.equal(h.app.elSaveStatus.textContent,'기록 저장 실패');
});

test('missing or invalid shared data and persistence errors preserve local settings',async()=>{
  const h=harness();h.seed({memo:[123]});await h.app.pullSharedPresets();
  assert.equal(h.context.getPresets().memo[0],'초기 문구');assert.equal(h.app.presetsSyncFailed,true);
  h.seed();const original=h.context.localStorage.setItem;
  h.context.localStorage.setItem=(key,value)=>{if(key==='PT_APP_CUSTOM_PRESETS_V1')throw Error('quota');original(key,value);};
  await h.app.pullSharedPresets();assert.equal(h.context.getPresets().memo[0],'초기 문구');assert.match(h.app.presetSyncLastError,/quota/);
  h.context.localStorage.setItem=original;h.db.clear();await h.app.pullSharedPresets();
  assert.equal(h.db.get(date).rows_data[0].presets.memo[0],'초기 문구');assert.equal(h.app.presetsSyncFailed,false);
});

test('changing clients serializes uploads so an old connection cannot overwrite the latest settings late',async()=>{
  const h=harness();let release;
  h.setHook(request=>request.record?.rows_data[0].presets.memo[0]==='이전 연결 문구'?new Promise(resolve=>{release=resolve;}):undefined);
  h.edit({memo:['이전 연결 문구']});const old=h.app.pushSharedPresets();await drain();
  h.app.supabaseClient=h.makeClient();h.edit({memo:['새 연결 문구']});const next=h.app.pushSharedPresets();await drain();
  assert.equal(h.requests.length,1);h.edit({memo:['새 연결 대기 수정']});release();await old;await next;
  assert.equal(h.app.presetsDirty,false);assert.equal(h.storage.has('PT_PRESETS_PENDING'),false);
  assert.equal(h.context.getPresets().memo[0],'새 연결 대기 수정');
  assert.equal(h.db.get(date).rows_data[0].presets.memo[0],'새 연결 대기 수정');
});

test('preset sync starts independently while pending patient records wait on the network',async()=>{
  const h=harness();let release;h.edit({memo:['빠른 설정']});h.app.pendingSyncDates.add('2026-10-18');
  h.app.pushToCloud=()=>new Promise(resolve=>{release=resolve;});h.app.pullFromCloud=async()=>{};
  h.app.setupNetworkSyncListeners=()=>{};h.app.syncSharedColumnFormatting=h.app.syncStaffCountSettings=()=>{};
  h.app.startLiveSync();await drain();
  assert.equal(h.app.liveRefreshBusy,true);assert.equal(h.app.presetsDirty,false);assert.equal(h.db.get(date).rows_data[0].presets.memo[0],'빠른 설정');
  release();await drain();h.app.stopLiveSync();assert.equal([...h.timers.values()].filter(t=>t.interval).length,0);
});

test('a failed optional broadcast does not report an acknowledged upload as failed',async()=>{
  for(const send of [()=>{throw Error('channel closed');},()=>Promise.reject(Error('broadcast offline'))]) {
    const h=harness();h.app.liveChannel={send};h.app.notifyCloudChange=Object.getPrototypeOf(h.app).notifyCloudChange;
    h.edit({memo:['저장 완료']});await h.app.pushSharedPresets();await drain();
    assert.equal(h.app.presetsDirty,false);assert.equal(h.app.presetsSyncFailed,false);
    assert.equal(h.db.get(date).rows_data[0].presets.memo[0],'저장 완료');
  }
});

test('styled candidate identities are JSONB safe and legacy hidden variants retain their exact styles',()=>{
  const h=harness(),key='__query:memo:문',hidden='__hidden:memo:문';
  const red=h.app.makePresetCandidate('문구',{color:'#ff0000',fontWeight:600,richText:null});
  const blue=h.app.makePresetCandidate('문구',{color:'#0000ff',fontWeight:400,richText:null});
  h.app.storePresetCandidates(key,[red,blue]);
  const presets=h.context.getPresets();
  presets[hidden]=['문구\u0000'+JSON.stringify(red._presetFormatting)];
  const original=JSON.stringify(presets);
  h.storage.set('PT_APP_CUSTOM_PRESETS_V1',original);
  h.context.setPresets(h.context.loadColumnPresets());
  const loaded=h.context.getPresets();
  assert.equal(h.storage.get('PT_APP_CUSTOM_PRESETS_V1'),original,'load leaves original storage untouched');
  assert.equal(loaded[hidden][0],h.app.getPresetCandidateIdentity(red));
  assert.ok(!loaded[hidden][0].includes('\u0000'));
  assert.notEqual(h.app.getPresetCandidateIdentity(red),h.app.getPresetCandidateIdentity(blue));
  const visible=h.app.getPresetCandidates(key).filter(item=>!loaded[hidden].includes(h.app.getPresetCandidateIdentity(item)));
  assert.equal(visible.length,1);assert.equal(visible[0]._presetFormatting.color,'#0000ff');
  h.context.saveColumnPresets(loaded);
  assert.equal(h.storage.get('PT_APP_CUSTOM_PRESETS_V1_LEGACY_CANDIDATE_IDS_V1'),original);
  assert.equal(JSON.parse(h.storage.get('PT_APP_CUSTOM_PRESETS_V1'))[hidden][0],loaded[hidden][0]);
  const first=h.storage.get('PT_APP_CUSTOM_PRESETS_V1');h.context.saveColumnPresets(loaded);
  assert.equal(h.storage.get('PT_APP_CUSTOM_PRESETS_V1'),first);
  assert.equal(h.storage.get('PT_APP_CUSTOM_PRESETS_V1_LEGACY_CANDIDATE_IDS_V1'),original);
});

test('pending legacy settings recover from JSONB rejection without dropping phrases or hidden styles',async()=>{
  const h=harness(),format={color:'#ff0000',fontWeight:600,richText:null};
  const legacy={memo:['문구','문구','띄어쓰기 '],'__hidden:memo:문':['문구\u0000'+JSON.stringify(format)],'__autocorrect:all':[' rt =>Rt. ']};
  const original=JSON.stringify(legacy);h.storage.set('PT_APP_CUSTOM_PRESETS_V1',original);
  h.edit(legacy);h.app.reportPresetSyncFailure({code:'22P05',message:'unsupported Unicode escape sequence'});
  h.setHook(request=>{
    if(request.record&&Object.values(request.record.rows_data[0].presets).some(values=>values.some(value=>value.includes('\u0000')))) {
      throw Error('unsupported Unicode escape sequence');
    }
  });
  await h.app.pushSharedPresets();
  const saved=h.db.get(date).rows_data[0].presets;
  assert.deepEqual(saved.memo,legacy.memo);assert.deepEqual(saved['__autocorrect:all'],legacy['__autocorrect:all']);
  assert.equal(saved['__hidden:memo:문'][0],h.app.getPresetCandidateIdentity(h.app.makePresetCandidate('문구',format)));
  assert.equal(h.app.presetsDirty,false);assert.equal(h.app.presetsSyncFailed,false);
  assert.equal(h.storage.has('PT_PRESETS_PENDING'),false);assert.equal(h.requests.length,1);
  assert.equal(h.storage.get('PT_APP_CUSTOM_PRESETS_V1_LEGACY_CANDIDATE_IDS_V1'),original);
});

test('legacy migration backup failure retains the original settings and pending upload for retry',async()=>{
  const h=harness(),legacy={memo:['문구'],'__hidden:memo:문':['문구\u0000{"fontWeight":600}']};
  const original=JSON.stringify(legacy);h.storage.set('PT_APP_CUSTOM_PRESETS_V1',original);h.edit(legacy);
  const setItem=h.context.localStorage.setItem;
  h.context.localStorage.setItem=(key,value)=>{if(key.endsWith('_LEGACY_CANDIDATE_IDS_V1'))throw Error('quota');setItem(key,value);};
  await h.app.pushSharedPresets();
  assert.equal(h.requests.length,0);assert.equal(h.storage.get('PT_APP_CUSTOM_PRESETS_V1'),original);
  assert.equal(h.app.presetsDirty,true);assert.equal(h.storage.get('PT_PRESETS_PENDING'),'1');
  h.context.localStorage.setItem=setItem;await h.app.pushSharedPresets();assert.equal(h.app.presetsDirty,false);
});

test('remote legacy hidden identifiers are normalized without changing ordinary words or metadata',async()=>{
  const h=harness(),legacy='문구\u0000{"fontWeight":600}',untouched='보통 문구';
  h.seed({'__hidden:memo:문':[legacy,untouched],memo:['문구','문구'],extra:['문구\\u0000문자']});
  await h.app.pullSharedPresets();
  assert.ok(!h.context.getPresets()['__hidden:memo:문'][0].includes('\u0000'));
  assert.equal(h.context.getPresets()['__hidden:memo:문'][1],untouched);
  assert.equal(h.context.getPresets().memo.length,2);assert.equal(h.context.getPresets().extra[0],'문구\\u0000문자');
  assert.equal(h.app.presetsSyncFailed,false);
});
