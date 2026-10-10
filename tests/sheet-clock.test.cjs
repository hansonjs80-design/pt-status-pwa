const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../sheet-clock.js'),'utf8');
function create(storage=new Map(),failLocal=false){
  const context={window:{addEventListener(){},dispatchEvent(){}},Event:class{},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{if(failLocal)throw Error('quota');storage.set(key,value);}}};
  vm.runInNewContext(source,context);
  return context.window.ptSheetClock;
}
test('clock off survives restart and disk fallback without changing another device',async()=>{
  const local=new Map(),disk=new Map();
  const store=async(key,value)=>{if(value!==undefined)disk.set(key,structuredClone(value));return disk.get(key);};
  const first=create(local);await first.restore(store);await first.setEnabled(false);
  assert.equal(create(local).enabled,false);
  const fallback=create(new Map(),true);await fallback.restore(store);
  assert.equal(fallback.enabled,false);
  await fallback.setEnabled(true);
  const reopened=create(new Map());await reopened.restore(store);
  assert.equal(reopened.enabled,true);
  assert.equal(create().enabled,true);
});
test('clock toggle during delayed startup restore wins over stale disk state',async()=>{
  const app=create(),disk=new Map();let release;
  const store=async(key,value)=>{if(value!==undefined){disk.set(key,structuredClone(value));return value;}return new Promise(resolve=>{release=resolve;});};
  const loading=app.restore(store);
  await app.setEnabled(false);
  release({enabled:true,updatedAt:Date.now()+10000});
  await loading;
  assert.equal(app.enabled,false);
  assert.equal(disk.get('device-sheet-clock-v1').enabled,false);
});
