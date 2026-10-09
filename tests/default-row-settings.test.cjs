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

test('Ctrl/Cmd+Down keeps the last-patient destination across repeated row-default changes and every selection mode',()=>{
  for(const scope of ['all','month']) for(const modifier of ['ctrlKey','metaKey']) {
    const {app,context}=setup();
    context.document={activeElement:null,querySelectorAll:()=>[]};
    app.elSearchInput={value:''};
    const rows=app.dataStore[app.currentDate];
    rows[20].name='성함만 있는 가상환자';
    rows[42].chartNo='99999';
    rows[70].writer='S';rows[75].memo='환자가 아닌 준비 내용';
    rows[90]._textStyles={part:{textAlign:'left'}};
    const cell={closest:()=>({style:{}}),scrollIntoView(){}};
    app.elTableBody={querySelector:()=>cell};
    let selected,scrollOptions;
    app.selectCell=(rowIdx,colKey)=>{selected={rowIdx,colKey};};
    app.selectRowRange=(minRow,maxRow)=>{selected={minRow,maxRow};};
    app.ensureCurrentCellVisible=(target,options)=>{assert.equal(target,cell);scrollOptions=options;};
    for(const count of [2000,1,150,60,300,120]) {
      assert.equal(app.applyDefaultRowCount(count,scope),true);
      assert.equal(app.getDefaultRowCount('2026-09-30'),scope==='month'?120:count);
      assert.equal(app.getDefaultRowCount('2026-11-02'),count);
      assert.equal(app.getLastPatientRowIndex(),42);
      assert.equal(app.getCurrentRows()[42].chartNo,'99999');
      for(const mode of ['cell','range','row','rows','history']) {
        app.activeCell=null;app.selectedRange=null;app.selectedRowRange=null;app.selectedRowIdx=null;app.crossDateSelection=null;
        if(mode==='cell')app.activeCell={rowIdx:0,colKey:'part'};
        if(mode==='range')app.selectedRange={minRow:0,maxRow:3,minCol:4,maxCol:6};
        if(mode==='row'||mode==='rows') {
          app.selectedRowRange={minRow:0,maxRow:mode==='row'?0:3};
          app.selectedRange={minRow:0,maxRow:3,minCol:0,maxCol:9};
        }
        if(mode==='history')app.crossDateSelection={minRow:0,maxRow:0,minCol:4,maxCol:6};
        selected=null;scrollOptions=null;
        app.handleGlobalKeyDown({key:'ArrowDown',[modifier]:true,target:{tagName:'DIV'},preventDefault(){}});
        assert.deepEqual(selected,mode==='row'||mode==='rows'?{minRow:42,maxRow:42}:{rowIdx:42,colKey:'part'},`${scope}/${modifier}/${count}/${mode}`);
        assert.equal(scrollOptions.center,true);
        assert.equal(scrollOptions.viewportRatio,mode==='history'?0.5:0.65);
      }
    }
    rows[42].chartNo='';assert.equal(app.getLastPatientRowIndex(),20);
    rows[20].name=' ';assert.equal(app.getLastPatientRowIndex(),-1);
  }
});
