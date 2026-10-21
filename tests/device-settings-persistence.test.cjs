const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value));
function fixture(disk = new Map(), shared = {}) {
  const local = shared.local || new Map(), session = new Map(), cookies = shared.cookies || new Map();
  const storage = map => ({getItem:key => map.get(key) ?? null, setItem:(key,value) => map.set(key,String(value))});
  const document = {};
  Object.defineProperty(document,'cookie',{
    get:() => [...cookies].map(([k,v]) => k+'='+v).join('; '),
    set:value => {const [key,...parts] = value.split(';')[0].split('=');cookies.set(key,parts.join('='));},
  });
  const window = {addEventListener(){}};
  vm.runInNewContext(['device-settings.js','local-tools.js'].map(file => fs.readFileSync(require.resolve('../'+file),'utf8')).join('\n'),
    {window,document,localStorage:storage(local),sessionStorage:storage(session),Blob,TextEncoder,Date,setTimeout});
  const l = Object.create(window.PTLocalTools.LocalTools.prototype), writes = [], reports = [];
  l.settings = {pdf:false,backup:false,time:'09:10',backupIntervalType:'daily',backupTime:'18:00',backupIntervalHours:2,
    backupMaxCount:15,workHoursOnly:false,workStartTime:'09:00',workEndTime:'18:00',lastBackup:null,lastBackupDay:null,lastBackupTimestamp:0};
  l._savedSettingsSnapshot = clone(l.settings);
  l.store = async (key,value) => {
    if (value !== undefined) {writes.push(clone(value));disk.set(key,clone(value));}
    return clone(disk.get(key));
  };
  l._settingsDiskStore = (...args) => l.store(...args);
  l.report = text => reports.push(text);
  return {l,local,session,cookies,disk,writes,reports};
}
const key = 'device-export-settings-v1';

test('disabled export options still restore customized times, intervals and work hours from disk', async () => {
  const saved = {pdf:false,backup:false,time:'08:35',backupTime:'17:45',backupIntervalType:'hourly',backupIntervalHours:6,
    backupMaxCount:30,workHoursOnly:true,workStartTime:'08:00',workEndTime:'20:30'};
  const disk = new Map([[key,saved]]);
  for (let launch=0;launch<3;launch++) {
    const {l} = fixture(disk); // Each restart loses all fast copies; only IndexedDB remains.
    await l._restoreSettingsFromDisk();
    for (const [name,value] of Object.entries(saved)) assert.equal(l.settings[name],value,`launch ${launch}: ${name}`);
  }
});

test('a newer explicit false in session storage wins over stale enabled disk and local copies', async () => {
  const {l,local,session,disk} = fixture(new Map([[key,{pdf:true,backup:true,time:'07:45',_updatedAt:10}]]));
  local.set('PT_DEVICE_EXPORTS_V1',JSON.stringify({pdf:true,backup:true,_updatedAt:20}));
  session.set('PT_DEVICE_EXPORTS_V1',JSON.stringify({pdf:false,backup:false,_fieldUpdatedAt:{pdf:30,backup:31}}));
  await l._restoreSettingsFromDisk();
  assert.equal(l.settings.pdf,false);assert.equal(l.settings.backup,false);assert.equal(l.settings.time,'07:45');
  const again = fixture(disk).l;await again._restoreSettingsFromDisk();
  assert.equal(again.settings.pdf,false);assert.equal(again.settings.backup,false);
});

test('saving during a delayed recovery changes only touched fields and never publishes defaults first', async () => {
  const {l,disk,writes} = fixture(new Map([[key,{pdf:true,backup:true,time:'07:30',backupIntervalHours:4}]]));
  let release;const gate = new Promise(resolve => {release=resolve;});const original = l.store;
  l.store = async (name,value) => {if (value === undefined && !writes.length) await gate;return original(name,value);};
  l._settingsRestoreTask = l._restoreSettingsFromDisk();
  l.settings.backup=true;const first = l.save();
  l.settings.backup=false;l.settings.backupIntervalHours=6;const second=l.save();
  assert.equal(writes.length,0);
  release();await Promise.all([l._settingsRestoreTask,first,second]);
  assert.equal(l.settings.pdf,true);assert.equal(l.settings.time,'07:30');
  assert.equal(l.settings.backup,false);assert.equal(l.settings.backupIntervalHours,6);
  assert.ok(writes.every(value => value.pdf === true && value.time === '07:30'));
  assert.equal(disk.get(key).backup,false);
});

test('rapid settings saves serialize disk commits and preserve the final choice after relaunch', async () => {
  const {l,disk} = fixture();await l._restoreSettingsFromDisk();
  l.settings.pdf=true;l.settings.time='06:25';const a=l.save();
  l.settings.pdf=false;l.settings.backup=true;l.settings.backupTime='20:15';const b=l.save();
  await Promise.all([a,b]);
  const again=fixture(disk).l;await again._restoreSettingsFromDisk();
  assert.equal(again.settings.pdf,false);assert.equal(again.settings.backup,true);
  assert.equal(again.settings.time,'06:25');assert.equal(again.settings.backupTime,'20:15');
});

test('a failed settings read never overwrites the preserved disk snapshot with defaults', async () => {
  const {l,writes} = fixture();l.store = async () => {throw Error('disk unavailable');};
  await assert.rejects(l._restoreSettingsFromDisk(),/disk unavailable/);
  assert.equal(writes.length,0);assert.equal(l._settingsRestorePending,true);
});

test('settings save rejects a silently lost disk write instead of reporting success', async () => {
  const {l,reports} = fixture();await l._restoreSettingsFromDisk();
  l._settingsDiskStore=async () => ({pdf:false});l.settings.pdf=true;
  await assert.rejects(l.save(),/저장소 확인/);
  assert.ok(reports.some(text => text.includes('저장 실패')));
});

test('lost folder permission leaves automatic PDF and backup preferences enabled', async () => {
  const {l,disk} = fixture();await l._restoreSettingsFromDisk();
  l.settings.pdf=true;l.settings.backup=true;l.settings.time='05:45';await l.save();
  l.folder={queryPermission:async () => 'prompt',requestPermission:() => assert.fail('automatic writes cannot prompt')};
  await assert.rejects(l.write('virtual.pdf',new Blob(['virtual']),true),/권한/);
  assert.equal(l.settings.pdf,true);assert.equal(l.settings.backup,true);assert.equal(l.settings.time,'05:45');
  const again=fixture(disk).l;await again._restoreSettingsFromDisk();assert.equal(again.settings.pdf,true);
});

test('an older window saving backup options preserves PDF choices made in another window after restart', async () => {
  const disk = new Map(), first = fixture(disk);
  await first.l._restoreSettingsFromDisk();
  const second = fixture(disk,first);await second.l._restoreSettingsFromDisk();
  second.l.settings.pdf=true;second.l.settings.time='07:25';await second.l.save();
  first.l.settings.backup=true;first.l.settings.backupIntervalType='hourly';await first.l.save();
  const restarted=fixture(disk).l;await restarted._restoreSettingsFromDisk();
  assert.equal(restarted.settings.pdf,true);
  assert.equal(restarted.settings.time,'07:25');
  assert.equal(restarted.settings.backup,true);
  assert.equal(restarted.settings.backupIntervalType,'hourly');
});

test('a temporarily unavailable startup store can be retried without losing saved options',async()=>{
  const {l}=fixture(new Map([[key,{pdf:true,time:'06:45',backup:true}]]));
  l.app={};let attempts=0;
  l.init=async()=>{if(++attempts===1)throw Error('temporarily unavailable');await l._restoreSettingsFromDisk();l._initialized=true;};
  await assert.rejects(l.initialize(),/temporarily unavailable/);
  assert.equal(l._initializing,false);
  await l.initialize();
  assert.equal(attempts,2);assert.equal(l.settings.pdf,true);assert.equal(l.settings.backup,true);assert.equal(l.settings.time,'06:45');
  assert.equal(l.app.deviceSettingsReady,l.ready);
});

test('valid time input persists without blur and incomplete times cannot replace saved preferences',async()=>{
  for(const key of ['time','backupTime','workStartTime','workEndTime']) {
    const {l,disk}=fixture();await l._restoreSettingsFromDisk();
    const handlers={},input={value:l.settings[key],addEventListener:(name,fn)=>handlers[name]=fn};
    l.bindTimeSetting(input,key);input.value='22:45';handlers.input();await l._settingsDiskWrite;
    const restarted=fixture(disk).l;await restarted._restoreSettingsFromDisk();assert.equal(restarted.settings[key],'22:45');
    input.value='';handlers.input();assert.equal(l.settings[key],'22:45');
    handlers.change();assert.equal(input.value,'22:45');assert.equal(l.settings[key],'22:45');
  }
});
