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

test('upward preview includes only cells above the source and clears when changing direction',()=>{
  const {app}=setup(),preview=new Set(),counts=[];
  app.fillDrag.rowIdx=app.fillDrag.endRow=5;
  app._updateFillDragBadge=(x,y,count)=>counts.push(count);
  app.elTableBody.querySelector=selector=>{const row=Number(selector.match(/data-row="(\d+)"/)[1]);return{classList:{add(){preview.add(row);}}};};
  app.elTableBody.querySelectorAll=()=>[...preview].map(row=>({classList:{remove(){preview.delete(row);}}}));
  app.updateFillDrag({clientX:150,clientY:176});
  assert.equal(app.fillDrag.endRow,1);
  assert.deepEqual([...preview],[1,2,3,4]);
  assert.equal(counts.at(-1),5);
  app.updateFillDrag({clientX:150,clientY:326});
  assert.deepEqual([...preview],[6,7]);
  app.updateFillDrag({clientX:150,clientY:276});
  assert.deepEqual([...preview],[]);
  app.cancelFillDrag();
});

test('upward fill copies the lower source into every target column while preserving source and neighboring cells',()=>{
  const columns=['no','gender','chartNo','name','part','prescription','extra','writer','memo','specialNote','visitTime'];
  for(const [colIdx,colKey] of columns.entries()) {
    const {app,frames}=setup();
    const rows=Array.from({length:8},(_,index)=>({[colKey]:String(index),memo:colKey==='memo'?String(index):'보존'}));
    const value=colKey==='writer'?'S':colKey==='gender'?'M':'가상 원본';rows[5][colKey]=value;
    const original=JSON.stringify(rows[5]);let saves=0;
    app.fillDrag={rowIdx:5,colKey,colIdx,value,endRow:5,date:app.currentDate};
    app.getCurrentRows=()=>rows;app.saveDataStore=()=>saves++;
    for(const method of ['renderTable','selectCell','updateRangeSelection','updateSidebarStats','showSaveIndicator'])app[method]=()=>{};
    app.finishFillDrag({clientX:150,clientY:176});
    assert.ok(rows.slice(1,6).every(row=>row[colKey]===value),colKey);
    assert.equal(rows[0][colKey],'0');assert.equal(rows[6][colKey],'6');
    assert.equal(JSON.stringify(rows[5]),original,'source remains unchanged');
    if(colKey!=='memo')assert.ok(rows.every(row=>row.memo==='보존'));
    assert.equal(app.rangeStart.rowIdx,5);assert.equal(app.rangeEnd.rowIdx,1);
    assert.equal(saves,1);assert.equal(frames.size,0);
  }
});

test('stationary pointer above the sheet scrolls upward and extends the range to the first row',()=>{
  const {app,container,step,frames}=setup();
  container.scrollTop=500;app.fillDrag.rowIdx=app.fillDrag.endRow=30;
  app.updateFillDrag({clientX:150,clientY:110});
  const first=app.fillDrag.endRow;
  assert.ok(first<30);
  for(let i=0;i<60;i++)step();
  assert.equal(container.scrollTop,0);assert.equal(app.fillDrag.endRow,0);
  app.cancelFillDrag();assert.equal(frames.size,0);
});

test('releasing on the source or changing dates cancels fill without saving',()=>{
  for(const differentDate of [false,true]) {
    const {app}=setup();
    app.fillDrag.rowIdx=app.fillDrag.endRow=5;
    if(differentDate)app.fillDrag.date='2020-01-01';
    app.saveDataStore=()=>assert.fail('cancelled fill must not save');
    app.finishFillDrag({clientX:150,clientY:differentDate?176:276});
    assert.equal(app.fillDrag,null);
  }
});
