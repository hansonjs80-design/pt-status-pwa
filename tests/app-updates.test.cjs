const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
function fixture(overrides={}) {
  const events=[],listeners={};let reloads=0;
  const context=vm.createContext({
    console,setTimeout,clearTimeout,AbortSignal,
    window:{addEventListener(name,fn){listeners[name]=fn;},dispatchEvent(e){events.push(e);},location:{reload(){reloads++;}}},
    document:{activeElement:null,addEventListener(){}}, navigator:{},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    ...overrides
  });
  vm.runInContext(fs.readFileSync(require.resolve('../app-updates.js'),'utf8')+'\nglobalThis.Updates=PTAppUpdates;',context);
  const app=Object.create(context.Updates.prototype);
  app.appVersion='v457';app.persistDataStore=async()=>{};app.showSaveIndicator=()=>{};
  return {app,context,events,listeners,reloads:()=>reloads};
}
function fakeWorker(state='installing') {
  const listeners=new Set();
  return {state,addEventListener(name,fn){listeners.add(fn);},removeEventListener(name,fn){listeners.delete(fn);},
    transition(state){this.state=state;for(const listener of [...listeners])listener();},
    postMessage(message){assert.equal(message.type,'SKIP_WAITING');this.transition('activating');setTimeout(()=>this.transition('activated'),10);}};
}
test('release versions agree and mismatches fail before checking production',async()=>{
  const {readReleaseMetadata}=await import('../scripts/release-metadata.mjs');
  const metadata=await readReleaseMetadata();assert.match(metadata.version,/^v\d+$/);
  const dir=await mkdtemp(join(tmpdir(),'pt-release-test-'));
  try {
    for(const file of ['sw.js','app-updates.js','version.json'])await writeFile(join(dir,file),fs.readFileSync(require.resolve('../'+file)));
    await writeFile(join(dir,'version.json'),JSON.stringify({version:'v1'}));
    await assert.rejects(readReleaseMetadata(pathToFileURL(dir+'/')),/Release versions differ/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('unknown, equal and older server versions never display a false update',async()=>{
  for(const version of ['unknown','v456','v457']){
    const {app,events}=fixture({fetch:async()=>({ok:true,json:async()=>({version})})});
    assert.equal(await app.checkForUpdate(),false);
    assert.equal(events.some(e=>e.type==='pt-app-update-available'),false);
    assert.equal(Boolean(app.updateCheckError),version==='unknown');
  }
});
test('concurrent update checks share one request and announce the newer version',async()=>{
  let requests=0,respond;
  const {app,events}=fixture({fetch:()=>{requests++;return new Promise(resolve=>{respond=resolve;});}});
  const first=app.checkForUpdate(),second=app.checkForUpdate();assert.equal(first,second);assert.equal(requests,1);
  respond({ok:true,json:async()=>({version:'v458'})});assert.equal(await first,true);
  assert.equal(app.latestServerVersion,'v458');assert.equal(events[0].detail.currentVersion,'v457');
});
test('offline checks report failure without announcing an update',async()=>{
  const {app}=fixture({fetch:async()=>{throw Error('offline');}});
  assert.equal(await app.checkForUpdate(),false);assert.match(app.updateCheckError.message,/offline/);
});
test('apply waits for a slow installation, commits editors and local writes before one reload',async()=>{
  const worker=fakeWorker(),reg={installing:worker,update:async()=>{}};
  const {app,context,reloads}=fixture({navigator:{serviceWorker:{getRegistration:async()=>reg}}});
  const order=[];
  context.document.activeElement={blur(){order.push('editor committed');}};
  app.persistDataStore=async()=>{await new Promise(r=>setTimeout(r,5));order.push('records saved');};
  app.syncBaselines=new Map();app.persistSyncBaselines=async()=>{order.push('baselines saved');};
  app.flushDevicePanelStates=()=>{order.push('preferences saved');};
  const first=app.applyUpdate(),second=app.applyUpdate();assert.equal(first,second);
  await new Promise(r=>setTimeout(r,40));assert.equal(reloads(),0);
  worker.transition('installed');await first;assert.equal(reloads(),1);
  assert.deepEqual(order.slice(0,4),['editor committed','records saved','baselines saved','preferences saved']);
});
test('saving failure aborts an update without deleting caches, activating a worker or reloading',async()=>{
  const {app,reloads}=fixture({navigator:{serviceWorker:{getRegistration(){assert.fail('must save first');}}}});
  app.persistDataStore=async()=>{throw Error('disk full');};
  await assert.rejects(app.applyUpdate(),/disk full/);assert.equal(reloads(),0);
});
test('first installation does not reload; another tab activation safely reloads once',async()=>{
  const swListeners={};
  const {app,context,reloads}=fixture({navigator:{serviceWorker:{controller:null,addEventListener(name,fn){swListeners[name]=fn;}}}});
  context.document.readyState='loading';app.initPWA();
  swListeners.controllerchange();assert.equal(reloads(),0);
  swListeners.controllerchange();swListeners.controllerchange();await app._updateReloadPromise;
  assert.equal(reloads(),1);
});

test('a failed worker installation leaves the current document open',async()=>{
  const worker=fakeWorker(),reg={installing:worker,update:async()=>{}};
  const {app,reloads}=fixture({navigator:{serviceWorker:{getRegistration:async()=>reg}}});
  const applying=app.applyUpdate();
  const rejected=assert.rejects(applying,/설치에 실패/);
  await new Promise(r=>setTimeout(r,10));worker.transition('redundant');
  await rejected;assert.equal(reloads(),0);
});

test('legacy reload markers complete an already-requested update after local restoration',async()=>{
  const worker=fakeWorker('installed');let restored=false,applied=false,cleaned;
  const reg={waiting:worker,addEventListener(){},update:async()=>{}};
  const {app,context}=fixture({URL,setInterval(){},navigator:{serviceWorker:{controller:{},addEventListener(){},register:async()=>reg}}});
  context.document.readyState='complete';
  context.window.location={search:'?_v=123&view=sheet#test',href:'https://example.test/?_v=123&view=sheet#test'};
  context.window.history={replaceState(a,b,url){cleaned=url;}};
  app.checkForUpdate=async()=>true;
  app.syncBaselinesReady=new Promise(resolve=>setTimeout(()=>{restored=true;resolve();},10));
  app.applyUpdate=async()=>{assert.equal(restored,true);applied=true;};
  app.initPWA();await new Promise(r=>setTimeout(r,30));
  assert.equal(applied,true);assert.equal(cleaned,'/?view=sheet#test');
});

test('update reload waits for baseline recovery and never overwrites a failed recovery',async()=>{
  for(const fails of [false,true]) {
    const {app,reloads}=fixture();let saved=false;
    app.persistDataStore=async()=>{saved=true;};
    let finish;
    app.syncBaselinesReady=new Promise((resolve,reject)=>{finish=()=>fails?reject(Error('baseline recovery failed')):resolve();});
    const reloading=app.reloadUpdatedApp();
    const assertion=fails?assert.rejects(reloading,/baseline recovery failed/):reloading;
    await Promise.resolve();assert.equal(saved,false);assert.equal(reloads(),0);
    finish();await assertion;
    assert.equal(saved,!fails);assert.equal(reloads(),fails?0:1);
  }
});
