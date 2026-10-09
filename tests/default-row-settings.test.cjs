const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
function setup() {
  const storage = new Map();
  const context = vm.createContext({window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
  vm.runInContext(require('./helpers/load-app-source.cjs')+'\nglobalThis.App=PTApp;',context);
  const app=Object.create(context.App.prototype);
  app.currentDate='2026-10-08';app.getTodayString=()=>'2026-10-10';app.dataStore={};app.editHistory=new Map();
  app.isEditingCell=()=>false;app.clearHeaderSelections=()=>{};app.renderTable=()=>{};app.showSaveIndicator=()=>{};
  for(const date of ['2026-09-30','2026-10-08','2026-11-01'])app.dataStore[date]=app.createDefaultEmptyRows(120,date);
  return {app,context,storage};
}
test('current-month row defaults preserve earlier months and persist for new dates after reload',()=>{
  const {app,context}=setup();
  assert.equal(app.applyDefaultRowCount(80,'month'),true);
  assert.equal(app.dataStore['2026-09-30'].length,120);
  assert.equal(app.dataStore['2026-10-08'].length,80);
  assert.equal(app.dataStore['2026-11-01'].length,80);
  const fresh=Object.create(context.App.prototype);fresh.currentDate='2026-11-02';
  assert.equal(fresh.createDefaultEmptyRows().length,80);
  assert.equal(fresh.getDefaultRowCount('2026-09-30'),120);
  app.getTodayString=()=>'2026-11-03';app.applyDefaultRowCount(60,'month');
  assert.equal(app.getDefaultRowCount('2026-10-08'),80);
  assert.equal(app.getDefaultRowCount('2026-11-20'),60);
});
test('all-date row defaults retain records, formatting and fifteen empty rows while shrinking or growing',()=>{
  const {app}=setup();
  app.dataStore['2026-09-30'][100].name='가상 환자';
  app.dataStore['2026-10-08'][110]._textStyles={part:{textAlign:'right'}};
  app.applyDefaultRowCount(60,'all');
  assert.equal(app.dataStore['2026-09-30'].length,116);
  assert.equal(app.dataStore['2026-09-30'][100].name,'가상 환자');
  assert.equal(app.dataStore['2026-10-08'].length,111);
  assert.equal(app.dataStore['2026-10-08'][110]._textStyles.part.textAlign,'right');
  assert.equal(app.dataStore['2026-11-01'].length,60);
  app.applyDefaultRowCount(180,'all');
  for(const [date,rows] of Object.entries(app.dataStore)){
    assert.equal(rows.length,180);
    assert.equal(rows[179].date,date.replace(/-/g,'.'));
  }
});
test('invalid row defaults leave stored configuration and records unchanged',()=>{
  const {app,storage}=setup();const before=JSON.stringify(app.dataStore);
  for(const count of [0,-1,2001,1.5,NaN])assert.equal(app.applyDefaultRowCount(count,'all'),false);
  assert.equal(app.applyDefaultRowCount(80,'invalid'),false);
  assert.equal(storage.size,0);assert.equal(JSON.stringify(app.dataStore),before);
});
