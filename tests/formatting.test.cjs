const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const storage = new Map();
const context = vm.createContext({ window: { addEventListener() {} }, localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); } } });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8') + '\nglobalThis.App = PTApp;', context);
const app = Object.create(context.App.prototype);
const plain = value => JSON.parse(JSON.stringify(value));
test('partial colors preserve unselected characters and replace only overlapping ranges', () => {
  const row = { name: '가나다라' };
  app.setPartialTextColor(row, 'name', 1, 3, '#ff0000');
  app.setPartialTextColor(row, 'name', 2, 4, '#0000ff');
  assert.deepEqual(plain(row._richText.name.colors), [null, '#ff0000', '#0000ff', '#0000ff']);
  app.setPartialTextColor(row, 'name', 2, 3, null);
  assert.equal(row._richText.name.colors[2], null);
  row.name = '새 내용'; app.setPartialTextColor(row, 'name', 0, 1, '#000000');
  assert.deepEqual(plain(row._richText.name.colors), ['#000000', null, null, null]);
});
test('history partial apply preserves unselected data, date and formatting', () => {
  const destination = { name:'오늘', memo:'메모', date:'2026.09.30', _textColors:{ name:'#000', memo:'#123' } };
  const source = { name:'이전', memo:'덮어쓰면 안됨', date:'2026.09.01', _textStyles:{name:{fontSize:20}}, _richText:{name:{text:'이전',colors:['#f00',null]}} };
  app.copyHistoryFields(destination, source, ['name']);
  assert.equal(destination.name, '이전'); assert.equal(destination.memo, '메모'); assert.equal(destination.date,'2026.09.30');
  assert.deepEqual(destination._textColors, {memo:'#123'});
  assert.equal(destination._textStyles.name.fontSize, 20);
  destination._richText.name.colors[0]='#000'; assert.equal(source._richText.name.colors[0],'#f00');
});
test('multiple column font settings preserve other properties and columns', () => {
  const instance = Object.create(context.App.prototype), rows=[{_textStyles:{name:{fontWeight:700},memo:{fontSize:11}}},{}];
  instance.selectedColumnRange={minCol:3,maxCol:4}; instance.selectedRange={minCol:3,maxCol:4,minRow:0,maxRow:1}; instance.isEditingCell=()=>false; instance.getCurrentRows=()=>rows;
  instance.saveDataStore=instance.renderTable=instance.selectEntireColumn=()=>{};
  instance.applyColumnTypography('fontSize',20);
  assert.deepEqual(plain(rows[0]._textStyles.name),{fontWeight:700,fontSize:20});
  assert.equal(rows[1]._textStyles.part.fontSize,20); assert.equal(rows[0]._textStyles.memo.fontSize,11);
  instance.applyColumnTypography('fontSize',null); assert.equal(rows[0]._textStyles.name.fontWeight,700); assert.equal(rows[0]._textStyles.name.fontSize,undefined);
});

test('sorting confirms, cycles ascending descending original and cancellation changes nothing', () => {
  const instance = Object.create(context.App.prototype);
  const data = [{name:'나'}, {name:'가'}, {name:'다'}, {}];
  instance.currentDate='2026-10-01'; instance.dataStore={ [instance.currentDate]:data };
  instance.getCurrentRows=()=>instance.dataStore[instance.currentDate]; instance.sortState={colKey:null,direction:'asc'};
  instance.isEditingCell=()=>false;
  instance.captureHistory=instance.clearHeaderSelections=instance.saveDataStore=instance.renderTable=()=>{};
  context.document={querySelectorAll:()=>[],querySelector:()=>null}; context.confirm=()=>false;
  instance.sortByColumn('name'); assert.deepEqual(instance.getCurrentRows(),data); assert.equal(instance.sortState.colKey,null);
  context.confirm=()=>true;
  instance.sortByColumn('name'); assert.deepEqual(instance.getCurrentRows().map(r=>r.name),['가','나','다',undefined]);
  instance.sortByColumn('name'); assert.deepEqual(instance.getCurrentRows().map(r=>r.name),['다','나','가',undefined]);
  instance.sortByColumn('name'); assert.deepEqual(instance.getCurrentRows().map(r=>r.name),['나','가','다',undefined]);
});

test('cut keeps content until paste and handles overlapping destination', async () => {
  const instance=Object.create(context.App.prototype), rows=[{name:'첫째'},{name:'둘째'},{}];
  context.navigator={clipboard:{writeText:async()=>{}}};
  Object.assign(instance,{currentDate:'2026-10-01',selectedRange:{minRow:0,maxRow:1,minCol:3,maxCol:3},selectedColKey:null,selectedRowIdx:null,activeCell:null});
  instance.getCurrentRows=()=>rows;
  instance.renderClipboardSelection=instance.showSaveIndicator=instance.saveDataStore=instance.renderTable=()=>{};
  instance.cutSelection(); assert.equal(rows[0].name,'첫째'); assert.equal(rows[1].name,'둘째'); assert.ok(instance.pendingCut);
  instance.selectedRange={minRow:1,maxRow:1,minCol:3,maxCol:3};
  await instance.pasteSelection(instance.clipboardBuffer);
  assert.deepEqual(rows.map(r=>r.name),['','첫째','둘째']); assert.equal(instance.pendingCut,null);
});

test('clipboard jump uses leftmost column and its last populated row', () => {
  const instance=Object.create(context.App.prototype), rows=[{chartNo:'1'},{chartNo:'2'},{memo:'later other column'}];
  Object.assign(instance,{currentDate:'2026-10-01',activeCell:{rowIdx:0,colKey:'prescription'},clipboardSelection:{date:'2026-10-01',minCol:2,maxCol:5}});
  instance.getCurrentRows=()=>rows;
  instance.elTableBody={querySelector:()=>({closest:()=>({style:{}}),scrollIntoView(){}})};
  let target; instance.selectCell=(rowIdx,colKey)=>{target={rowIdx,colKey};};
  instance.jumpToLastRecord(); assert.deepEqual(target,{rowIdx:1,colKey:'chartNo'});
  instance.clipboardSelection.minCol=0; instance.jumpToLastRecord(); assert.deepEqual(target,{rowIdx:2,colKey:'no'});
  instance.clipboardSelection.minCol=2; instance.crossDateSelection={minCol:2,maxCol:5};
  instance.historyApplyTarget={date:'2026-10-01',row:rows[2],rowIdx:2,colKey:'name'}; instance.scrollToHistoryTarget=()=>{};
  instance.jumpToLastRecord(); assert.deepEqual(target,{rowIdx:2,colKey:'chartNo'});
});

test('compound patient entry splits chart and name and removes suffixes', () => {
  for (const key of ['chartNo','name']) for (const [input,chartNo,name] of [
    ['8364/최정원(3)','8364','최정원'], ['15575/유은정M(3)','15575','유은정'],
    ['00123 / 가상환자F(12)','00123','가상환자'], ['123/가상환자','123','가상환자'],
  ]) {
    const row={memo:'유지'};assert.equal(app.applyCompoundPatientInput(row,key,input),true);
    assert.deepEqual(row,{memo:'유지',chartNo,name});
  }
  const row={name:'유지'};
  assert.equal(app.applyCompoundPatientInput(row,'part','123/다른이름(3)'),false);
  assert.equal(app.applyCompoundPatientInput(row,'name','일반성함'),false);
  assert.equal(app.applyCompoundPatientInput(row,'name','123/'),false);
  assert.equal(row.name,'유지');
});


test('history Ctrl/Cmd+Down finds the actual last daily record after deletion instead of a stale apply target', () => {
  const instance = Object.create(context.App.prototype);
  const deletedRow = { name: '삭제한 마지막 환자', chartNo: 'OLD' };
  const rows = [{ name: '첫 환자', chartNo: '1' }, { memo: '마지막 내용' }, {}, {}, {}];
  Object.assign(instance, {
    currentDate: '2026-10-04',
    crossDateSelection: { minCol: 2, maxCol: 9 },
    historyApplyTarget: { date: '2026-10-04', row: deletedRow, rowIdx: 4 },
  });
  instance.getCurrentRows = () => rows;
  instance.elTableBody = { querySelector: () => ({ closest: () => ({ style: {} }), scrollIntoView() {} }) };
  let selected;
  instance.selectCell = (rowIdx, colKey) => { selected = { rowIdx, colKey }; };
  instance.jumpToLastRecord();
  assert.deepEqual(selected, { rowIdx: 1, colKey: 'chartNo' });
  rows[1] = {};
  instance.jumpToLastRecord();
  assert.deepEqual(selected, { rowIdx: 0, colKey: 'chartNo' });
  rows[0] = {};
  instance.jumpToLastRecord();
  assert.deepEqual(selected, { rowIdx: 0, colKey: 'chartNo' });
});

function createPasteApp(rows, colKey = 'no') {
  const instance = Object.create(context.App.prototype);
  Object.assign(instance, { currentDate: '2026-10-04', activeCell: { rowIdx: 0, colKey }, selectedRange: null, selectedRowIdx: null, selectedColKey: null });
  instance.getCurrentRows = () => rows;
  instance.renderClipboardSelection = instance.showSaveIndicator = instance.saveDataStore = instance.renderTable = () => {};
  instance.addNewRow = () => rows.push({});
  return instance;
}

test('full-row clipboard paste replaces copied old visit times with one current timestamp for every named row', async () => {
  const rows = [{ name: '기존 이름', visitTime: '01시 00분 00초' }];
  const app = createPasteApp(rows);
  const before = Date.now();
  await app.pasteSelection('1\tF\tT001\t첫째\t목\t치료\t\tK\t메모\t특이 사항\t02시 00분 00초\n2\tM\tT002\t둘째\t허리\t치료\t\tJ\t\t\t03시 00분 00초');
  assert.equal(rows[0].name, '첫째'); assert.equal(rows[1].name, '둘째');
  assert.ok(Date.parse(rows[0]._visitedAt) >= before && Date.parse(rows[0]._visitedAt) <= Date.now());
  assert.equal(rows[0]._visitedAt, rows[1]._visitedAt);
  assert.equal(rows[0].visitTime, rows[1].visitTime);
  assert.notEqual(rows[0].visitTime, '02시 00분 00초');
  assert.equal(rows[0]._visitTimeEdited, true);
});

test('name-only and compound chart/name paste refresh visits while memo-only paste preserves the existing time', async () => {
  for (const [column, text, name] of [['name', '새 이름', '새 이름'], ['chartNo', '12345 / 김선', '김선']]) {
    const rows = [{ name: '기존', visitTime: '00시 00분 00초', _visitedAt: '2000-01-01T00:00:00Z' }];
    const app = createPasteApp(rows, column);
    await app.pasteSelection(text);
    assert.equal(rows[0].name, name);
    assert.ok(Date.parse(rows[0]._visitedAt) > Date.parse('2000-01-01'));
  }
  const rows = [{ name: '유지', visitTime: '00시 00분 00초', _visitedAt: '2000-01-01T00:00:00Z' }];
  await createPasteApp(rows, 'memo').pasteSelection('메모 변경');
  assert.equal(rows[0].visitTime, '00시 00분 00초');
  assert.equal(rows[0]._visitedAt, '2000-01-01T00:00:00Z');
});

test('unselected name gaps in a discrete clipboard copy do not refresh visit times', async () => {
  const rows = [{ name: '유지환자', visitTime: '00시 00분 00초' }];
  const app = createPasteApp(rows, 'chartNo');
  app.clipboardBuffer = 'T001\t이름 제외\t목';
  app.clipboardSelection = { minRow: 0, minCol: 2, cells: ['0:2', '0:4'] };
  await app.pasteSelection(app.clipboardBuffer);
  assert.equal(rows[0].name, '유지환자');
  assert.equal(rows[0].part, '목');
  assert.equal(rows[0].visitTime, '00시 00분 00초');
});


test('partial history paste remembers the destination row for No. selection when search closes', async () => {
  const rows=[{name:'기존'},{}];
  const app=createPasteApp(rows,'part');
  app.activeCell.rowIdx=1;
  app.clipboardBuffer='허리\t치료';
  app.clipboardSelection={kind:'history',minRow:0,minCol:4,cells:['0:4','0:5']};
  app.elSearchInput={value:'검색환자'};
  await app.pasteSelection(app.clipboardBuffer);
  assert.equal(rows[1].part,'허리');
  assert.equal(rows[1].prescription,'치료');
  assert.equal(app.lastHistoryAppliedTarget.row,rows[1]);
  assert.equal(app.lastHistoryAppliedTarget.rowIdx,1);
  let selected;
  app.elTableBody={querySelector:()=>({closest:()=>({style:{}}),scrollIntoView(){}})};
  app.selectCell=(rowIdx,colKey)=>{selected={rowIdx,colKey};};
  app.elSheetContainer={focus(){}};
  app.restoreAppliedHistorySelection(app.lastHistoryAppliedTarget);
  assert.deepEqual(selected,{rowIdx:1,colKey:'no'});
});


test('row-header and Ctrl/Cmd+A copies and cuts restore the full pasted destination selection', async () => {
  context.navigator={clipboard:{writeText:async()=>{}}};
  for(const maxCol of [9,10]) for(const cut of [false,true]) {
    const rows=[{no:'1',name:'첫째',memo:'유지'},{}];
    const app=createPasteApp(rows);
    app.selectedRowRange={minRow:0,maxRow:0};
    app.selectedRange={minRow:0,maxRow:0,minCol:0,maxCol};
    if(cut) app.cutSelection(); else app.copySelection();
    assert.equal(app.clipboardSelection.rowSelection,true);
    app.selectedRange=null;
    app.selectedRowRange=null;
    app.activeCell={rowIdx:1,colKey:'no'};
    let selection,focused=false;
    app.selectRowRange=(start,end,lastCol)=>{selection={start,end,lastCol};};
    app.elSheetContainer={focus(){focused=true;}};
    await app.pasteSelection(app.clipboardBuffer);
    assert.deepEqual(selection,{start:1,end:1,lastCol:maxCol});
    assert.equal(rows[1].name,'첫째');
    assert.equal(rows[0].name,cut?'':'첫째');
    assert.ok(focused);
  }
});

test('history row and partial-range paste retain the actual destination selection', async () => {
  context.navigator = { clipboard: { writeText: async () => {} } };
  for (const rowSelected of [false, true]) {
    const rows = [{name:'기존'}, {}, {}];
    const app = createPasteApp(rows);
    app.crossDateResults = [{no:'3',gender:'F',chartNo:'T9',name:'가상환자',part:'목'}];
    app.crossDateSelection = {minRow:0,maxRow:0,minCol:0,maxCol:4};
    app.isCrossDateRowSelected = rowSelected;
    app.copySelection();
    assert.equal(app.clipboardSelection.rowSelection, rowSelected);
    app.crossDateSelection = null;
    app.activeCell = {rowIdx:1,colKey:'no'};
    let selected, rangeUpdated = false, scrolled = false;
    const cell = {scrollIntoView(){scrolled=true;}};
    app.elTableBody = {querySelector:()=>cell};
    app.elSheetContainer = {focus(){}};
    app.selectCell = (row,key) => {selected={row,key};};
    app.selectRowRange = (start,end,col) => {selected={start,end,col};};
    app.updateRangeSelection = () => {rangeUpdated=true;};
    await app.pasteSelection(app.clipboardBuffer);
    assert.equal(rows[1].name,'가상환자');
    assert.ok(scrolled);
    if(rowSelected) assert.deepEqual(selected,{start:1,end:1,col:4});
    else {
      assert.deepEqual(selected,{row:1,key:'no'});
      assert.equal(app.rangeEnd.colIdx,4);
      assert.equal(app.rangeEnd.rowIdx,1);
      assert.ok(rangeUpdated);
    }
  }
});


test('whole column formatting covers historical and new rows while later cell overrides remain local', () => {
  const instance = Object.create(context.App.prototype);
  const oldRow = {name:'이전', _textStyles:{name:{fontSize:12}}, _textColors:{name:'#ff0000'}};
  const newRow = {name:'새 행'};
  const before = JSON.stringify(oldRow);
  for (const [property,value] of [['fontSize',20],['fontWeight',400],['color','#123456']]) {
    instance.setColumnFormatting({minCol:3,maxCol:3},property,value);
    assert.equal(instance.getCellFormatting(oldRow,'name',property),value);
    assert.equal(instance.getCellFormatting(newRow,'name',property),value);
    assert.equal(instance.getCellFormatting(newRow,'memo',property),undefined);
  }
  assert.equal(JSON.stringify(oldRow),before);
  instance.columnFormatting = instance.loadColumnFormatting();
  assert.equal(instance.getCellFormatting(newRow,'name','fontSize'),20);
  instance.markCellFormatting(oldRow,'name','fontSize');
  oldRow._textStyles.name.fontSize=24;
  assert.equal(instance.getCellFormatting(oldRow,'name','fontSize'),24);
  assert.equal(instance.getCellFormatting(newRow,'name','fontSize'),20);
  instance.setColumnFormatting({minCol:3,maxCol:3},'fontSize',16);
  assert.equal(instance.getCellFormatting(oldRow,'name','fontSize'),16);
  instance.setColumnFormatting({minCol:3,maxCol:3},'color',null);
  assert.equal(instance.getCellFormatting(oldRow,'name','color'),null);
});
