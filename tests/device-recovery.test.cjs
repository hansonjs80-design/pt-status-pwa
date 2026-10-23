const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {webcrypto:crypto} = require('node:crypto');
const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
const defaults = {pdf:false,backup:false,time:'09:10',backupIntervalType:'daily',backupTime:'18:00',
  backupIntervalHours:2,backupMaxCount:15,workHoursOnly:false,workStartTime:'09:00',workEndTime:'18:00'};

function fixture({disk=new Map(),fast=new Map(),files=new Map(),folderConnected=true}={}) {
  const context = vm.createContext({crypto,Date,setTimeout,clearTimeout,console,
    localStorage:{getItem:key=>fast.get(key)||null,setItem:(key,value)=>fast.set(key,value)},
    navigator:{storage:{persisted:async()=>false}},location:{origin:'https://virtual.invalid',pathname:'/index.html'}});
  vm.runInContext(['device-settings.js','device-recovery.js'].map(file=>fs.readFileSync(require.resolve('../'+file),'utf8')).join('\n')+
    '\nglobalThis.Recovery=PTDeviceRecovery;globalThis.Settings=PTDeviceSettings;',context);
  let permission='granted',failWrite=false;
  const entry = name => ({kind:'file',name,getFile:async()=>({text:async()=>files.get(name)}),createWritable:async()=>{
    let pending;return {write:async value=>{pending=value;},close:async()=>{if(failWrite)throw Error('external disk unavailable');files.set(name,pending);},abort:async()=>{}};
  }});
  const folder={name:'virtual external folder',queryPermission:async()=>permission,
    getFileHandle:async(name,options)=>{if(!files.has(name) && !options?.create)throw Object.assign(Error('missing file'),{name:'NotFoundError'});return entry(name);},
    async *values(){for(const name of files.keys())yield entry(name);}};
  const tools={settings:{...defaults},folder:folderConnected?folder:null,report(){},syncSettingsControls(){},
    store:async(key,value)=>{
      if(value!==undefined)disk.set(key,clone(context.Settings.mergeStored(key,disk.get(key),value)));
      return clone(disk.get(key));
    }};
  let prefs={};
  tools.app={appVersion:'virtual',readDevicePreferences:()=>prefs,restoreDeviceSettings:async store=>{
    prefs=context.Settings.mergeUI([await store('device-ui-preferences-v1'),context.Settings.widthPreferences(await store('device-column-widths-v1'))]);
  }};
  tools._restoreSettingsFromDisk=async()=>{tools.settings={...defaults,...context.Settings.mergeExports([tools.settings,await tools.store('device-export-settings-v1')])};};
  const recovery=new context.Recovery(tools);
  const configure=async(width=235)=>{
    prefs={columnWidths:{name:width,part:330},columnWidthUpdatedAt:{name:100,part:100},columnWidthsUpdatedAt:100};
    tools.settings={...defaults,pdf:true,backup:true,time:'06:25',backupIntervalHours:6,backupMaxCount:30,
      _fieldUpdatedAt:Object.fromEntries(Object.keys(defaults).map(key=>[key,100]))};
    await tools.store('device-column-widths-v1',context.Settings.widthSnapshot(prefs));
    await tools.store('device-export-settings-v1',tools.settings);
  };
  return {recovery,tools,disk,fast,files,folder,context,configure,prefs:()=>prefs,
    permission:value=>{permission=value;},failWrite:value=>{failWrite=value;}};
}

test('settings file is verified outside browser data and contains no records or credentials',async()=>{
  const f=fixture();await f.configure();f.tools.settings.secret='not exported';f.tools.app.dataStore={private:'not exported'};
  await f.recovery.initialize();await f.recovery.flush();
  const text=f.files.get(f.recovery.filename),file=f.context.Recovery.parse(text);
  assert.equal(file.ui.columnWidths.name,235);assert.equal(file.exports.time,'06:25');
  assert.equal(file.exports.backup,true);assert.ok(!text.includes('not exported'));
  assert.equal(f.recovery.dirty,false);assert.ok(f.recovery.lastFileSavedAt);
});

test('complete browser storage deletion keeps external recovery files and explicit restore rebuilds all settings',async()=>{
  const first=fixture();await first.configure();await first.recovery.initialize();await first.recovery.flush();
  const preserved=first.files.get(first.recovery.filename),oldId=first.recovery.meta.id;
  first.disk.clear();first.fast.clear();
  const cold=fixture({files:first.files,folderConnected:false});await cold.recovery.inspectStartup();await cold.recovery.initialize();
  assert.equal(cold.tools.settings.pdf,false);assert.equal(cold.tools.folder,null);
  assert.equal(cold.recovery.startup['folder-selection-v1'].state,'missing');
  assert.notEqual(cold.recovery.meta.id,oldId);
  cold.tools.folder=cold.folder;await cold.recovery.initialize();await cold.recovery.flush();
  assert.equal(cold.tools.settings.pdf,false,'do not apply another device file automatically');
  assert.equal(cold.recovery.candidates.length,1);assert.equal(first.files.size,1,'no new defaults-only file');
  await cold.recovery.apply(cold.context.Recovery.parse(preserved),true);await cold.recovery.flush();
  assert.equal(cold.tools.settings.pdf,true);assert.equal(cold.tools.settings.backup,true);
  assert.equal(cold.tools.settings.time,'06:25');assert.equal(cold.prefs().columnWidths.name,235);
  assert.equal(first.files.get(first.recovery.filename),preserved,'original recovery file remains intact');
});

test('known device automatically recovers missing preferences from its linked folder',async()=>{
  const first=fixture();await first.configure();await first.recovery.initialize();await first.recovery.flush();
  for(const key of ['device-column-widths-v1','device-ui-preferences-v1','device-export-settings-v1'])first.disk.delete(key);
  const cold=fixture(first);await cold.recovery.initialize();await cold.recovery.flush();
  assert.equal(cold.tools.settings.backupMaxCount,30);assert.equal(cold.tools.settings.pdf,true);
  assert.equal(cold.prefs().columnWidths.part,330);
});

test('two devices sharing an export folder keep separate files and never auto-import each other',async()=>{
  const first=fixture();await first.configure(235);await first.recovery.initialize();await first.recovery.flush();
  const text=first.files.get(first.recovery.filename);
  const second=fixture({files:first.files});await second.configure(340);await second.recovery.initialize();await second.recovery.flush();
  assert.notEqual(first.recovery.filename,second.recovery.filename);assert.equal(first.files.size,2);
  assert.equal(first.files.get(first.recovery.filename),text);
  assert.equal(second.prefs().columnWidths.name,340);
});

test('corrupt or unreadable recovery copies are never overwritten during startup',async()=>{
  const first=fixture();await first.configure();await first.recovery.initialize();await first.recovery.flush();
  first.files.set(first.recovery.filename,'broken original');
  const cold=fixture(first);await assert.rejects(cold.recovery.initialize(),/JSON/);
  assert.equal(cold.recovery.ready,false);cold.recovery.changed();await cold.recovery.flush();
  assert.equal(first.files.get(first.recovery.filename),'broken original');
});

test('a failed external write retains the earlier recovery file and retry saves the latest settings',async()=>{
  const f=fixture();await f.configure();await f.recovery.initialize();await f.recovery.flush();
  const before=f.files.get(f.recovery.filename);
  f.tools.settings.time='22:35';f.tools.settings._fieldUpdatedAt.time=200;
  f.failWrite(true);f.recovery.changed();await assert.rejects(f.recovery.flush(),/external disk/);
  assert.equal(f.files.get(f.recovery.filename),before);assert.equal(f.recovery.dirty,true);
  f.failWrite(false);await f.recovery.flush();
  assert.equal(JSON.parse(f.files.get(f.recovery.filename)).exports.time,'22:35');
});

test('permission loss does not clear saved preferences or claim a file was updated',async()=>{
  const f=fixture();await f.configure();await f.recovery.initialize();await f.recovery.flush();
  const before=f.files.get(f.recovery.filename);f.permission('prompt');f.recovery.changed();
  await assert.rejects(f.recovery.flush(),/권한/);
  assert.equal(f.files.get(f.recovery.filename),before);assert.equal(f.tools.settings.pdf,true);
});

test('import validates before any mutation and explicit restore wins over newer local values',async()=>{
  const f=fixture();await f.configure();await f.recovery.initialize();await f.recovery.flush();
  const file=await f.recovery.snapshot(),before=JSON.stringify([...f.disk]);
  file.exports.pdf='false';await assert.rejects(f.recovery.apply(file,true),/올바르지/);
  assert.equal(JSON.stringify([...f.disk]),before);
  file.exports.pdf=false;delete file.ui.columnWidths.part;delete file.ui.columnWidthUpdatedAt.part;
  f.tools.settings._fieldUpdatedAt.pdf=Date.now()+1000000;
  await f.recovery.apply(file,true);await f.recovery.flush();
  assert.equal(f.tools.settings.pdf,false);assert.equal(f.prefs().columnWidths.part,undefined);
  assert.ok(f.prefs().columnWidthUpdatedAt.part>100);
});

test('startup evidence distinguishes missing storage from a failed read before defaults are saved',async()=>{
  const f=fixture({folderConnected:false});const store=f.tools.store;
  f.tools.store=async(key,value)=>{if(key==='folder-selection-v1')throw Error('blocked');return store(key,value);};
  await f.recovery.inspectStartup();
  assert.equal(f.recovery.startup['device-column-widths-v1'].state,'missing');
  assert.equal(f.recovery.startup['folder-selection-v1'].state,'read-error');
  await f.configure();await f.recovery.inspectStartup();
  assert.equal(f.recovery.startup['device-column-widths-v1'].state,'missing','retain original startup evidence');
});

test('a failed identity save retries before creating an external file',async()=>{
  const f=fixture();await f.configure();const store=f.tools.store;let fail=true;
  f.tools.store=async(key,value)=>{
    if(key===f.context.Recovery.META_KEY && value!==undefined && fail)throw Error('disk unavailable');
    return store(key,value);
  };
  await assert.rejects(f.recovery.initialize(),/disk unavailable/);
  assert.equal(f.recovery.meta,undefined);assert.equal(f.files.size,0);
  fail=false;await f.recovery.initialize();await f.recovery.flush();
  assert.equal(f.disk.get(f.context.Recovery.META_KEY).id,f.recovery.meta.id);
  assert.equal(f.files.size,1);
});

test('a late read from an old folder cannot replace the current folder recovery state',async()=>{
  const f=fixture();await f.configure();await f.recovery.initialize();await f.recovery.flush();
  const get=f.folder.getFileHandle;let release,started;
  const reading=new Promise(resolve=>{started=resolve;});
  f.folder.getFileHandle=async(...args)=>{started();await new Promise(resolve=>{release=resolve;});return get(...args);};
  const old=f.recovery.connectFolder();await reading;
  const next=fixture();f.tools.folder=next.folder;
  await f.recovery.connectFolder();release();await old;await f.recovery.flush();
  assert.equal(f.recovery.ready,true);assert.equal(f.recovery.candidates.length,0);
  assert.equal(next.files.size,1,'current folder receives the latest settings');
});
