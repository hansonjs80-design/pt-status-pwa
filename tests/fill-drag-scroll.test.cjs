const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
function setup() {
  const frames=new Map();let next=0,time=0,scroll=0;
  const container={classList:{remove(){}},getBoundingClientRect:()=>({left:0,right:300,top:100,bottom:400}),get scrollTop(){return scroll;},set scrollTop(v){scroll=Math.max(0,Math.min(1000,v));}};
  const document={getElementById:()=>({querySelector:()=>({getBoundingClientRect:()=>({bottom:150})})}),elementFromPoint:(x,y)=>({closest:()=>({dataset:{rowIdx:String(Math.floor((scroll+y-150)/25))}})})};
  const context=vm.createContext({window:{addEventListener(){}},localStorage:{getItem(){return null;}},document,requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)});
  vm.runInContext(require('./helpers/load-app-source.cjs')+'\nglobalThis.App=PTApp;',context);
  const app=Object.create(context.App.prototype);
  app.currentDate='2026-10-10';app.elSheetContainer=container;
  app.elTableBody={contains:()=>true,querySelectorAll:()=>[],querySelector:()=>({classList:{add(){}}})};
  app.fillDrag={rowIdx:2,colKey:'writer',colIdx:7,value:'S',endRow:2,date:app.currentDate};
  app._updateFillDragBadge=()=>{};app._removeFillDragBadge=()=>{};
  return {app,container,frames,step(){const current=[...frames.values()];frames.clear();time+=16;for(const fn of current)fn(time);}};
}
test('stationary pointer at the bottom scrolls and extends fill beyond the initial visible rows',()=>{
  const s=setup();s.app.updateFillDrag({clientX:150,clientY:410});const initial=s.app.fillDrag.endRow;
  for(let i=0;i<30;i++)s.step();
  assert.ok(s.container.scrollTop>300);assert.ok(s.app.fillDrag.endRow>initial);
  s.app.updateFillDrag({clientX:150,clientY:110});const before=s.container.scrollTop;
  for(let i=0;i<10;i++)s.step();
  assert.ok(s.container.scrollTop<before);
  s.app.cancelFillDrag();assert.equal(s.frames.size,0);assert.equal(s.app.fillDrag,null);
});
test('leaving the edge stops scrolling and releasing below the sheet commits the extended range once',()=>{
  const s=setup();s.app.updateFillDrag({clientX:150,clientY:410});for(let i=0;i<10;i++)s.step();
  s.app.updateFillDrag({clientX:150,clientY:250});const before=s.container.scrollTop;s.step();assert.equal(s.container.scrollTop,before);
  const rows=Array.from({length:120},()=>({writer:''}));rows[2].writer='S';let saves=0;
  s.app.getCurrentRows=()=>rows;s.app.saveDataStore=()=>saves++;
  for(const method of ['renderTable','selectCell','updateRangeSelection','updateSidebarStats','showSaveIndicator'])s.app[method]=()=>{};
  s.app.finishFillDrag({clientX:150,clientY:410});
  const end=s.app.rangeEnd.rowIdx;assert.ok(end>2);
  assert.ok(rows.slice(2,end+1).every(r=>r.writer==='S'));assert.equal(rows[end+1].writer,'');
  assert.equal(saves,1);assert.equal(s.frames.size,0);
});
