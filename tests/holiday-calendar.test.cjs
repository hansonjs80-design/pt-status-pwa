const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
function setup(fetch) {
  const storage=new Map();
  const context=vm.createContext({window:{addEventListener(){}},document:{getElementById:()=>null},fetch,URLSearchParams,AbortController,setTimeout,clearTimeout,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
  vm.runInContext(require('./helpers/load-app-source.cjs')+'\nglobalThis.App=PTApp;',context);
  const app=Object.create(context.App.prototype);app.currentDate='2026-10-10';app.dataStore={'2026-10-10':[{name:'가상보존환자'}]};
  return {app,storage,context};
}
test('scheduler holidays use only GET date/name reads, paginate capped responses and never modify patient data',async()=>{
  const calls=[];const {app}=setup(async(url,options)=>{
    assert.equal(options.method,'GET');assert.equal(options.body,undefined);
    const params=new URLSearchParams(url.split("?")[1]);calls.push(params);
    assert.match(url,/\/rest\/v1\/holidays\?/);assert.equal(params.get('select'),'date,name');
    assert.deepEqual(params.getAll('date'),['gte.2025-12-01','lt.2027-02-01']);
    return {ok:true,json:async()=>calls.length===1?[{date:'2026-10-10',name:'가상공휴일'}]:calls.length===2?[{date:'2027-01-01',name:'다음해공휴일'}]:[]};
  });
  const before=JSON.stringify(app.dataStore);
  await Promise.all([app.loadCalendarHolidays(2026),app.loadCalendarHolidays(2026)]);
  assert.deepEqual(calls.map(q=>q.get('offset')),['0','1','2']);
  assert.equal(app.getCalendarHolidayName('2026-10-10'),'가상공휴일');
  assert.equal(app.getCalendarHolidayName('2027-01-01',2026),'다음해공휴일');
  assert.equal(JSON.stringify(app.dataStore),before);
  await app.loadCalendarHolidays(2026);assert.equal(calls.length,3);
});
test('offline holiday cache survives failed refresh and successful empty refresh removes deleted holidays',async()=>{
  let mode='saved',calls=0;
  const {app,storage,context}=setup(async()=>{
    if(mode==='offline')throw new Error('offline');
    return {ok:true,json:async()=>mode==='saved'&&calls++===0?[{date:'2026-10-10',name:'공휴일'}]:[]};
  });
  await app.loadCalendarHolidays(2026);
  const fresh=Object.create(context.App.prototype);fresh.currentDate=app.currentDate;
  assert.equal(fresh.getCalendarHolidayName('2026-10-10'),'공휴일');
  const before=JSON.stringify([...storage]);mode='offline';
  assert.equal(await fresh.loadCalendarHolidays(2026),false);
  assert.equal(fresh.getCalendarHolidayName('2026-10-10'),'공휴일');
  assert.equal(JSON.stringify([...storage]),before);
  assert.equal(fresh.getCalendarHolidayCache(2026).request,null);
  mode='empty';assert.equal(await fresh.loadCalendarHolidays(2026),true);
  assert.equal(fresh.getCalendarHolidayName('2026-10-10'),'');
});
test('invalid holiday dates are skipped and source errors do not overwrite cached holidays',async()=>{
  const {app}=setup(async()=>({ok:false,status:403}));
  const normalized=app.normalizeCalendarHolidays([{date:'2026-02-30',name:'invalid'},{date:'bad'},{date:'2026-10-10T00:00:00',name:'정상'}]);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)),{'2026-10-10':'정상'});
  app.getCalendarHolidayCache(2026).holidays=normalized;
  assert.equal(await app.loadCalendarHolidays(2026),false);
  assert.equal(app.getCalendarHolidayName('2026-10-10'),'정상');
});
test('holiday appearance follows the currently displayed year when earlier requests finish late',()=>{
  const {app,context}=setup();const classes=new Set();const attributes={};
  const button={dataset:{date:'2027-01-01'},classList:{toggle:(k,value)=>value?classes.add(k):classes.delete(k)},setAttribute:(k,v)=>attributes[k]=v};
  const hint={textContent:''};
  context.document.getElementById=()=>({dataset:{year:'2027'},querySelectorAll:()=>[button],querySelector:selector=>selector==='.calendar-holiday-status'?hint:null});
  app.getCalendarHolidayCache(2026).holidays={'2027-01-01':'오래된 이름'};
  app.getCalendarHolidayCache(2027).holidays={'2027-01-01':'최신공휴일'};
  app.refreshCalendarHolidayAppearance();
  assert.ok(classes.has('is-holiday'));assert.equal(button.title,'최신공휴일');assert.match(attributes['aria-label'],/최신공휴일/);
  app.getCalendarHolidayCache(2027).holidays={};app.refreshCalendarHolidayAppearance();
  assert.equal(classes.has('is-holiday'),false);assert.equal(button.title,'');
});
