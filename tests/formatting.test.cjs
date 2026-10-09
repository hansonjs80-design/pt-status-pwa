const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const storage = new Map();
const context = vm.createContext({ window: { addEventListener() {} }, localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); } } });
vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
const app = Object.create(context.App.prototype);
const plain = value => JSON.parse(JSON.stringify(value));
test('font color indicator follows selection, applied colors and reset without coloring the A label', () => {
  const instance = Object.create(context.App.prototype);
  const icon = { style: { color: '#495057' } }, attributes = {};
  const button = { querySelector: () => icon, setAttribute: (name, value) => { attributes[name] = value; } };
  context.document = { getElementById: () => button };
  try {
    instance.getFormattingStatus = () => ({ value: 'rgb(0, 0, 255)', label: '#0000ff' });
    instance.updateFontColorIndicator();
    assert.equal(icon.style.borderBottomColor, 'rgb(0, 0, 255)');
    assert.equal(icon.style.borderBottomStyle, 'solid');
    instance.updateFontColorIndicator('#ff0000');
    assert.equal(icon.style.borderBottomColor, '#ff0000');
    instance.updateFontColorIndicator(null);
    assert.equal(icon.style.borderBottomColor, 'rgb(0, 0, 255)', 'reset reflects the effective column color');
    instance.getFormattingStatus = () => ({ value: null, label: '여러 값' });
    instance.updateFontColorIndicator();
    assert.equal(icon.style.borderBottomStyle, 'dashed');
    assert.equal(attributes['aria-label'], '글자색: 여러 값');
    instance.getFormattingStatus = () => ({ value: null, label: '선택 없음' });
    instance.updateFontColorIndicator();
    assert.equal(icon.style.borderBottomColor, '#000000');
    assert.equal(icon.style.borderBottomStyle, 'solid');
    assert.equal(icon.style.color, '#495057');
  } finally { delete context.document; }
});
test('font-size Enter applies only its own column instead of submitting every column', () => {
  let applied = 0, prevented = 0;
  const row = { querySelector(selector) { assert.equal(selector, '[data-apply-column]'); return { click() { applied++; } }; } };
  const target = { matches(selector) { assert.equal(selector, 'input[type="number"]'); return true; }, closest(selector) { assert.equal(selector, 'tr'); return row; } };
  const event = { key: 'Enter', target, preventDefault() { prevented++; } };
  assert.equal(app.handleColumnFontSettingsEnter(event), true);
  assert.equal(applied, 1);
  assert.equal(prevented, 1);
  for (const extra of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }]) {
    assert.equal(app.handleColumnFontSettingsEnter({ ...event, ...extra }), true);
  }
  assert.equal(applied, 1, 'IME confirmation and held Enter must not apply again');
  assert.equal(prevented, 4, 'prevent implicit whole-form submission while waiting');
});
test('column font Enter leaves selects, buttons and other keys to their normal controls', () => {
  const preventDefault = () => assert.fail('unrelated controls must keep their native behavior');
  assert.equal(app.handleColumnFontSettingsEnter({key: 'Enter', target: { matches: () => false }, preventDefault}), false);
  assert.equal(app.handleColumnFontSettingsEnter({key: 'ArrowUp', target: { matches: () => true }, preventDefault}), false);
});
test('explicit column apply replaces all existing cell styles and rich colors, preserving later exceptions', () => {
  const instance=Object.create(context.App.prototype);
  instance.columnFormatting={};instance.renderTable=()=>{};instance.showSaveIndicator=()=>{};
  const rows=[{name:'과거',_textStyles:{name:{fontSize:25,fontWeight:900}},_textColors:{name:'#ff0000'},_richText:{name:{text:'과거',colors:['#ff0000','#0000ff']}}},{name:'현재'},{name:'미래'}];
  const snapshot=JSON.stringify(rows);
  const name={...instance.getColumnFontSettings()[3],fontSize:18.5,fontWeight:'700',color:'#123456'};
  assert.equal(instance.applyColumnFontSettings([name]),true);
  for(const row of rows) {
    assert.equal(instance.getCellFormatting(row,'name','fontSize'),18.5);
    assert.equal(instance.getCellFormatting(row,'name','fontWeight'),'700');
    assert.equal(instance.getCellFormatting(row,'name','color'),'#123456');
    assert.equal(instance.getEffectiveCellRichText(row,'name'),undefined);
  }
  assert.equal(JSON.stringify(rows),snapshot);
  assert.equal(instance.getCellFormatting(rows[0],'memo','color'),undefined);
  rows[0]._textStyles.name={fontSize:12,fontWeight:400};rows[0]._textColors.name='#00ff00';
  for(const property of ['fontSize','fontWeight','color'])instance.markCellFormatting(rows[0],'name',property);
  assert.equal(instance.getCellFormatting(rows[0],'name','fontSize'),12);
  assert.equal(instance.getCellFormatting(rows[0],'name','fontWeight'),400);
  assert.equal(instance.getCellFormatting(rows[0],'name','color'),'#00ff00');
  instance.applyColumnFontSettings([name]);
  assert.equal(instance.getCellFormatting(rows[0],'name','fontSize'),18.5);
  assert.equal(instance.getCellFormatting(rows[0],'name','color'),'#123456');
});
test('partial color edits after column apply start from the applied color and do not revive old character colors', () => {
  const instance=Object.create(context.App.prototype);instance.columnFormatting={};instance.renderTable=()=>{};instance.showSaveIndicator=()=>{};
  const row={name:'가나다',_textColors:{name:'#ff0000'},_richText:{name:{text:'가나다',colors:['#ff0000','#ff0000','#ff0000']}}};
  instance.applyColumnFontSettings([{...instance.getColumnFontSettings()[3],color:'#0000ff'}]);
  instance.setPartialTextColor(row,'name',1,2,'#00ff00');instance.markCellFormatting(row,'name','color');
  assert.equal(instance.getCellFormatting(row,'name','color'),'#0000ff');
  assert.deepEqual(plain(instance.getEffectiveCellRichText(row,'name').colors),[null,'#00ff00',null]);
});
test('invalid column apply cannot reset any existing defaults or cell formatting', () => {
  const instance=Object.create(context.App.prototype);instance.columnFormatting={};instance.renderTable=()=>assert.fail('invalid input must not repaint');
  const settings=instance.getColumnFontSettings();settings[3].fontSize=14.3;
  assert.equal(instance.applyColumnFontSettings(settings),false);assert.deepEqual(plain(instance.columnFormatting),{});
});
test('editing colored text retains prefix and suffix colors and inherits inserted text color', () => {
  const row = {name:'가나다',_richText:{name:{text:'가나다',colors:['#ff0000','#0000ff','#00ff00']}}};
  app.updateEditorTextColors(row,'name','가새나다');
  assert.deepEqual(plain(row._richText.name),{text:'가새나다',colors:['#ff0000','#0000ff','#0000ff','#00ff00']});
  app.updateEditorTextColors(row,'name','가다');
  assert.deepEqual(plain(row._richText.name),{text:'가다',colors:['#ff0000','#00ff00']});
  app.updateEditorTextColors(row,'name','');
  assert.deepEqual(plain(row._richText.name),{text:'',colors:[]});
});
test('manager saves durable defaults for every column across current and history dates', () => {
  const instance = Object.create(context.App.prototype);
  instance.columnFormatting = {};
  const settings = instance.getColumnFontSettings();
  Object.assign(settings[3], { fontSize: 22, fontWeight: '700', color: '#123abc' });
  assert.equal(instance.saveColumnFontSettings(settings), true);
  const reloaded = Object.create(context.App.prototype);
  reloaded.columnFormatting = reloaded.loadColumnFormatting();
  for (const row of [{name:'현재'}, {name:'이전',_textStyles:{name:{fontSize:11,fontWeight:400}},_textColors:{name:'#ff0000'}}, {}]) {
    assert.equal(reloaded.getCellFormatting(row, 'name', 'fontSize'), row._textStyles?.name?.fontSize ?? 22);
    assert.equal(reloaded.getCellFormatting(row, 'name', 'fontWeight'), row._textStyles?.name?.fontWeight ?? '700');
    assert.equal(reloaded.getCellFormatting(row, 'name', 'color'), row._textColors?.name ?? '#123abc');
  }
  assert.deepEqual(plain(reloaded.getColumnFontSettings()), plain(settings));
});
test('unchanged manager saves preserve cell exceptions and changed properties update all dates', () => {
  const instance = Object.create(context.App.prototype);
  instance.columnFormatting = {};
  instance.saveColumnFontSettings(instance.getColumnFontSettings());
  const row = {_textStyles:{name:{fontSize:24,fontWeight:700}},_textColors:{name:'#ff0000'}};
  for (const property of ['fontSize','fontWeight','color']) instance.markCellFormatting(row,'name',property);
  const before = plain(instance.columnFormatting);
  assert.equal(instance.saveColumnFontSettings(instance.getColumnFontSettings()), true);
  assert.deepEqual(plain(instance.columnFormatting), before);
  assert.equal(instance.getCellFormatting(row,'name','fontSize'),24);
  assert.equal(instance.getCellFormatting(row,'name','color'),'#ff0000');
  const settings = instance.getColumnFontSettings(); settings[3].fontSize = 20;
  instance.saveColumnFontSettings(settings);
  assert.equal(instance.getCellFormatting(row,'name','fontSize'),24);
  assert.equal(instance.getCellFormatting(row,'name','color'),'#ff0000');
  assert.equal(instance.getCellFormatting(row,'name','fontWeight'),700);
  assert.deepEqual(plain(instance.columnFormatting.memo),before.memo);
});
test('invalid manager values cannot partially change saved defaults', () => {
  const instance = Object.create(context.App.prototype); instance.columnFormatting = {};
  instance.saveColumnFontSettings(instance.getColumnFontSettings());
  const before = plain(instance.columnFormatting), settings=instance.getColumnFontSettings();
  settings[0].color='#abcdef'; settings[9].fontSize=73;
  assert.equal(instance.saveColumnFontSettings(settings),false);
  assert.deepEqual(plain(instance.columnFormatting),before);
});
test('column font settings persist half-point sizes and reject smaller steps', () => {
  const instance = Object.create(context.App.prototype); instance.columnFormatting = {};
  const settings = instance.getColumnFontSettings(); settings[3].fontSize = 14.5;
  assert.equal(instance.saveColumnFontSettings(settings), true);
  instance.columnFormatting = instance.loadColumnFormatting();
  assert.equal(instance.getColumnFontSettings()[3].fontSize, 14.5);
  assert.equal(instance.getCellFormatting({}, 'name', 'fontSize'), 14.5);
  const before = plain(instance.columnFormatting);
  settings[3].fontSize = 14.25;
  assert.equal(instance.saveColumnFontSettings(settings), false);
  assert.deepEqual(plain(instance.columnFormatting), before);
});
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
  assert.deepEqual(plain(rows[0]._textStyles.name),{fontWeight:700});
  assert.equal(instance.getCellFormatting(rows[1],'part','fontSize'),20); assert.equal(rows[0]._textStyles.memo.fontSize,11);
  instance.applyColumnTypography('fontSize',null); assert.equal(rows[0]._textStyles.name.fontWeight,700); assert.equal(instance.getCellFormatting(rows[0],'name','fontSize'),null);
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

test('last-patient jump preserves the active column and ignores older copied ranges and prepared notes', () => {
  const instance=Object.create(context.App.prototype), rows=[{chartNo:'1'},{chartNo:'2'},{memo:'later other column'}];
  Object.assign(instance,{currentDate:'2026-10-01',activeCell:{rowIdx:0,colKey:'prescription'},clipboardSelection:{date:'2026-10-01',minCol:2,maxCol:5}});
  instance.getCurrentRows=()=>rows;
  instance.elTableBody={querySelector:()=>({closest:()=>({style:{}}),scrollIntoView(){}})};
  let target; instance.selectCell=(rowIdx,colKey)=>{target={rowIdx,colKey};};
  instance.jumpToLastRecord(); assert.deepEqual(target,{rowIdx:1,colKey:'prescription'});
  instance.clipboardSelection.minCol=0; instance.jumpToLastRecord(); assert.deepEqual(target,{rowIdx:1,colKey:'prescription'});
  instance.clipboardSelection.minCol=2; instance.crossDateSelection={minCol:2,maxCol:5};
  instance.historyApplyTarget={date:'2026-10-01',row:rows[2],rowIdx:2,colKey:'name'}; instance.scrollToHistoryTarget=()=>{};
  instance.jumpToLastRecord(); assert.deepEqual(target,{rowIdx:1,colKey:'chartNo'});
});

test('compound patient entry splits chart and name and removes suffixes', () => {
  for (const key of ['chartNo','name']) for (const [input,chartNo,name] of [
    ['8364/최정원(3)','8364','최정원'], ['15575/유은정M(3)','15575','유은정'],
    ['00123 / 가상환자F(12)','00123','가상환자'], ['123/가상환자','123','가상환자'],
    ['823/김광진60','823','김광진'], ['823/김광진40','823','김광진'],
    ['823/김광진M','823','김광진'], ['823/김광진*','823','김광진'],
    ['823/김광진40M*','823','김광진'],
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
  const rows = [{ name: '첫 환자', chartNo: '1' }, { chartNo: 'LAST' }, { writer: 'J' }, { memo: '미리 입력' }, {}];
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
  app.focusSelectedCellEditor=()=>{};
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
    assert.equal(instance.getCellFormatting(oldRow,'name',property),property === 'color' ? '#ff0000' : oldRow._textStyles.name[property] ?? value);
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
  assert.equal(instance.getCellFormatting(oldRow,'name','fontSize'),24);
  instance.setColumnFormatting({minCol:3,maxCol:3},'color',null);
  assert.equal(instance.getCellFormatting(oldRow,'name','color'),'#ff0000');
});


test('column defaults persist across past, future, empty and search rows with independent cell overrides', () => {
  const instance = Object.create(context.App.prototype);
  const dates = {
    '2026-09-01': [{ name: '이전', _textStyles: { name: { fontSize: 11, fontWeight: 700 } } }],
    '2026-10-06': [{ name: '현재' }],
    '2026-12-01': [{ name: '미래', _textColors: { name: '#ff0000' } }, {}]
  };
  for (const [property, value] of [['fontSize',18], ['fontWeight',600], ['color','#123456']]) {
    instance.setColumnFormatting({minCol:2,maxCol:9}, property, value);
  }
  instance.columnFormatting = instance.loadColumnFormatting();
  const searchRows = Object.entries(dates).flatMap(([date, rows]) => rows.map(row => ({...row, _sourceDate:date})));
  for (const row of [...Object.values(dates).flat(), ...searchRows, {name:'새 날짜'}]) {
    for (const key of ['chartNo','name','part','prescription','extra','writer','memo','specialNote']) {
      const element = {style:{}};
      instance.applyCellFormatting(element,row,key);
      assert.deepEqual(element.style,{color:row._textColors?.[key] ?? '#123456',fontSize:(row._textStyles?.[key]?.fontSize ?? 18)+'px',fontWeight:row._textStyles?.[key]?.fontWeight ?? 600});
    }
    assert.equal(instance.getCellFormatting(row,'no','fontSize'),undefined);
  }
  const local = dates['2026-12-01'][0];
  instance.markCellFormatting(local,'name','fontSize');
  local._textStyles = {name:{fontSize:24}};
  assert.equal(instance.getCellFormatting(local,'name','fontSize'),24);
  assert.equal(instance.getCellFormatting(dates['2026-09-01'][0],'name','fontSize'),11);
  instance.setColumnFormatting({minCol:3,maxCol:3},'fontSize',16);
  assert.equal(instance.getCellFormatting(local,'name','fontSize'),24);
});


test('header formatting updates every date without copying defaults into individual records', () => {
  const instance=Object.create(context.App.prototype);
  const rows=[{name:'현재',_textStyles:{name:{fontSize:11,fontWeight:700}},_textColors:{name:'#ff0000'}},{}];
  const history={name:'이전',_textStyles:{name:{fontSize:10,fontWeight:400}},_textColors:{name:'#00ff00'}};
  const before=JSON.stringify(rows);
  Object.assign(instance,{selectedColumnRange:{minCol:3,maxCol:3},selectedRange:{minRow:0,maxRow:1,minCol:3,maxCol:3}});
  instance.getCurrentRows=()=>rows;instance.isEditingCell=()=>false;
  instance.renderTable=instance.selectEntireColumn=instance.closeFontColorMenu=()=>{};
  instance.saveDataStore=()=>assert.fail('column defaults must not rewrite patient records');
  instance.applyColumnTypography('fontSize',20);
  instance.applyColumnTypography('fontWeight',500);
  instance.applyTextColor('#123456');
  for(const row of [...rows,history,{name:'미래'}]) {
    assert.equal(instance.getCellFormatting(row,'name','fontSize'),row._textStyles?.name?.fontSize ?? 20);
    assert.equal(instance.getCellFormatting(row,'name','fontWeight'),row._textStyles?.name?.fontWeight ?? 500);
    assert.equal(instance.getCellFormatting(row,'name','color'),row._textColors?.name ?? '#123456');
  }
  assert.equal(JSON.stringify(rows),before);
});

test('single cell typography/color do not change defaults even with a stale column marker; reset inherits defaults', () => {
  const instance=Object.create(context.App.prototype),rows=[{name:'한 셀'},{name:'다른 셀'}];
  for(const [property,value] of [['fontSize',20],['fontWeight',500],['color','#123456']]) instance.setColumnFormatting({minCol:3,maxCol:3},property,value);
  const defaults=JSON.stringify(instance.columnFormatting);
  Object.assign(instance,{activeCell:{rowIdx:0,colKey:'name'},selectedColumnRange:{minCol:3,maxCol:3},selectedRange:{minRow:0,maxRow:0,minCol:3,maxCol:3}});
  instance.getCurrentRows=()=>rows;instance.isEditingCell=()=>false;
  instance.saveDataStore=instance.renderTable=instance.closeFontColorMenu=()=>{};
  instance.selectEntireColumn=()=>assert.fail('cell formatting must not select a column');
  instance.applyColumnTypography('fontSize',24);instance.applyColumnTypography('fontWeight',700);instance.applyTextColor('#ff0000');
  assert.equal(JSON.stringify(instance.columnFormatting),defaults);
  for(const [property,local,base] of [['fontSize',24,20],['fontWeight',700,500],['color','#ff0000','#123456']]) {
    assert.equal(instance.getCellFormatting(rows[0],'name',property),local);
    assert.equal(instance.getCellFormatting(rows[1],'name',property),base);
  }
  instance.applyColumnTypography('fontSize',null);instance.applyColumnTypography('fontWeight',null);instance.applyTextColor(null);
  const element={style:{color:'old',fontSize:'old',fontWeight:'old'}};
  instance.applyCellFormatting(element,rows[0],'name');
  assert.deepEqual(element.style,{color:'#123456',fontSize:'20px',fontWeight:500});
  assert.equal(JSON.stringify(instance.columnFormatting),defaults);
  instance.setColumnFormatting({minCol:3,maxCol:3},'fontSize',null);
  instance.applyCellFormatting(element,rows[0],'name');
  assert.equal(element.style.fontSize,'');
});


test('history range clipboard preserves cell color and partial text colors without changing column defaults', async () => {
  context.navigator={clipboard:{writeText:async()=>{}}};
  const rows=[{name:'기존'},{}],instance=createPasteApp(rows,'name');
  instance.setColumnFormatting({minCol:3,maxCol:3},'color','#000000');
  const source={memo:'메모',_textColors:{memo:'#0000ff'},_richText:{memo:{text:'메모',colors:['#ff0000',null]}}};
  instance.setColumnFormatting({minCol:8,maxCol:8},'color','#000000');
  instance.crossDateResults=[source];instance.crossDateSelection={minRow:0,maxRow:0,minCol:8,maxCol:8};
  const defaults=JSON.stringify(instance.columnFormatting);
  instance.copySelection();
  // The copied style is a snapshot, not a reference to the source record.
  source._textColors.memo='#00ff00';source._richText.memo.colors[0]='#00ff00';
  instance.crossDateSelection=null;instance.activeCell={rowIdx:1,colKey:'name'};
  await instance.pasteSelection(instance.clipboardBuffer);
  assert.equal(rows[1].name,'메모');
  assert.equal(instance.getCellFormatting(rows[1],'name','color'),'#0000ff');
  assert.equal(rows[1]._richText.name.colors[0],'#ff0000');
  assert.equal(instance.getCellFormatting(rows[0],'name','color'),'#000000');
  assert.equal(JSON.stringify(instance.columnFormatting),defaults);
});

test('history Apply keeps explicit cell colors after column defaults change', () => {
  const instance=Object.create(context.App.prototype);
  instance.setColumnFormatting({minCol:3,maxCol:3},'color','#000000');
  const source={name:'색상 환자',_textColors:{name:'#ff0000'}};
  const destination={memo:'보존'};
  const defaults=JSON.stringify(instance.columnFormatting);
  instance.copyHistoryFields(destination,source,['name']);
  assert.equal(instance.getCellFormatting(destination,'name','color'),'#ff0000');
  assert.equal(destination.memo,'보존');
  assert.equal(JSON.stringify(instance.columnFormatting),defaults);
  instance.setColumnFormatting({minCol:3,maxCol:3},'color','#123456');
  instance.copyHistoryFields(destination,source,['name']);
  assert.equal(instance.getCellFormatting(destination,'name','color'),'#ff0000');
});

test('editing a character color preserves earlier colors despite stale column revisions', () => {
  const instance=Object.create(context.App.prototype);
  const row={name:'가나다',_textColors:{name:'#0000ff'},_richText:{name:{text:'가나다',colors:['#ff0000',null,'#00ff00']}},_formatRevisions:{name:{color:'old'}}};
  instance.setColumnFormatting({minCol:3,maxCol:3},'color','#000000');
  instance.activeCell={rowIdx:0,colKey:'name'};
  instance.textColorSelection={rowIdx:0,colKey:'name',text:'가나다',start:1,end:2};
  instance.getCurrentRows=()=>[row];instance.isEditingCell=()=>false;
  instance.saveDataStore=instance.renderTable=instance.closeFontColorMenu=()=>{};
  instance.applyTextColor('#9900ff');
  assert.equal(row._textColors.name,'#0000ff');
  assert.deepEqual(plain(row._richText.name.colors),['#ff0000','#9900ff','#00ff00']);
  const captured=instance.captureCellFormatting(row,'name');
  assert.equal(captured.color,'#0000ff');
  assert.deepEqual(plain(captured.richText),plain(row._richText.name));
});

test('large paste allocates destination rows once and saves and renders one transaction', async () => {
  const rows=[{}],app=createPasteApp(rows,'name');
  let saves=0,renders=0;
  app.saveDataStore=()=>saves++;
  app.renderTable=()=>renders++;
  app.addNewRow=()=>assert.fail('per-row allocation must not save or render during paste');
  await app.pasteSelection(Array.from({length:200},(_,i)=>`가상${i}`).join('\n'));
  assert.equal(rows.length,200);
  assert.equal(rows[199].name,'가상199');
  assert.equal(saves,1);assert.equal(renders,1);
  assert.equal(rows[0]._visitedAt,rows[199]._visitedAt);
});

test('external Excel colors override matching internal text without changing column defaults or cell typography', async () => {
  const rows=[{name:'기존',_textStyles:{name:{fontSize:18,fontWeight:700}}}],app=createPasteApp(rows,'name');
  app.setColumnFormatting({minCol:3,maxCol:3},'color','#000000');
  const defaults=JSON.stringify(app.columnFormatting);
  app.clipboardBuffer='엑셀이름';app.clipboardSelection={formatting:[[{color:'#00ff00'}]]};
  app.parseClipboardHtmlColors=()=>[[{text:'엑셀이름',formatting:{color:'#ff0000',richText:{text:'엑셀이름',colors:[null,'#0000ff',null,null]}}}]];
  await app.pasteSelection('엑셀이름','<table>Excel HTML</table>');
  assert.equal(rows[0].name,'엑셀이름');assert.equal(rows[0]._textColors.name,'#ff0000');
  assert.equal(rows[0]._richText.name.colors[1],'#0000ff');
  assert.deepEqual(rows[0]._textStyles.name,{fontSize:18,fontWeight:700});
  assert.equal(JSON.stringify(app.columnFormatting),defaults);
});

test('context-menu paste reads HTML clipboard colors and falls back to plain text when access fails', async () => {
  for(const allowed of [true,false]) {
    const rows=[{}],app=createPasteApp(rows,'memo');
    context.navigator={clipboard:{read:async()=>{if(!allowed)throw Error('unavailable');return [{types:['text/plain','text/html'],getType:async type=>({text:async()=>type==='text/plain'?'엑셀메모':'<table>colored</table>'})}];},readText:async()=> '일반메모'}};
    app.parseClipboardHtmlColors=html=>html ? [[{text:'엑셀메모',formatting:{color:'#ff0000'}}]] : null;
    await app.pasteSelection();
    assert.equal(rows[0].memo,allowed?'엑셀메모':'일반메모');
    assert.equal(rows[0]._textColors?.memo,allowed?'#ff0000':undefined);
  }
});

test('cell backgrounds apply to sparse selections, survive cloud row transfer and reset independently of text', () => {
  const instance = Object.create(context.App.prototype);
  const rows = [{name:'가상',_textColors:{name:'#0000ff'}},{name:'다른 셀'}];
  instance.columnFormatting={};instance.getCurrentRows=()=>rows;
  instance.getFormattingRange=()=>({minRow:0,maxRow:1,minCol:3,maxCol:3});
  instance.getSelectedFormattingColumns=()=>null;instance.isEditingCell=()=>false;
  instance.isSelectedCoordinate=r=>r===0;instance.renderTable=()=>{};
  instance.saveDataStore=()=>{};instance.closeFontColorMenu=()=>{};
  instance.applyBackgroundColor('#ffff00');
  assert.equal(rows[0]._textStyles.name.backgroundColor,'#ffff00');
  assert.equal(rows[1]._textStyles,undefined);
  const remote = instance.mergeCloudRows([{name:'가상'},{name:'다른 셀'}],rows,[{name:'가상',memo:'다른 기기 메모'},{name:'다른 셀'}]);
  assert.equal(remote[0].memo,'다른 기기 메모');
  const otherDevice=Object.create(context.App.prototype);
  assert.equal(otherDevice.getCellFormatting(plain(remote)[0],'name','backgroundColor'),'#ffff00');
  instance.applyBackgroundColor(null);
  assert.equal(instance.getCellFormatting(rows[0],'name','backgroundColor'),undefined);
  assert.equal(rows[0]._textColors.name,'#0000ff');
});

test('column backgrounds persist and transfer between devices while preserving cell exceptions', () => {
  const first=Object.create(context.App.prototype);first.columnFormatting={};first.columnFormattingPending={};
  first.setColumnFormatting({minCol:3,maxCol:3},'backgroundColor','#e2efda');
  const restored=first.loadColumnFormatting();
  assert.equal(first.validateSharedColumnFormatting(restored),true);
  const second=Object.create(context.App.prototype);second.columnFormatting={};second.columnFormattingPending={};
  second.isEditingCell=()=>false;second.renderTable=()=>{};
  second.acceptSharedColumnFormatting(plain(restored));
  assert.equal(second.getCellFormatting({},'name','backgroundColor'),'#e2efda');
  const exception={_textStyles:{name:{backgroundColor:'#ffff00'}}};
  assert.equal(second.getCellFormatting(exception,'name','backgroundColor'),'#ffff00');
  first.setColumnFormatting({minCol:3,maxCol:3},'backgroundColor',null);
  second.acceptSharedColumnFormatting(plain(first.columnFormatting));
  assert.equal(second.getCellFormatting({},'name','backgroundColor'),null);
  assert.equal(second.getCellFormatting(exception,'name','backgroundColor'),'#ffff00');
});

test('copy preserves assigned backgrounds without copying transient selection tint', () => {
  const instance=Object.create(context.App.prototype);
  const source={name:'가상',_textStyles:{name:{backgroundColor:'#ffff00'}}};
  const target={};instance.applyCopiedCellFormatting(target,'memo',instance.captureCellFormatting(source,'name'));
  assert.equal(target._textStyles.memo.backgroundColor,'#ffff00');
  context.getComputedStyle=()=>({backgroundColor:'#c6e6d0',color:'#000000'});
  try { assert.equal(instance.captureCellFormatting({},'name',{}).backgroundColor,undefined); }
  finally { delete context.getComputedStyle; }
});

test('column settings background apply survives reload and device transfer with later cell overrides', () => {
  const first=Object.create(context.App.prototype);
  first.columnFormatting={};first.columnFormattingPending={};first.renderTable=()=>{};first.showSaveIndicator=()=>{};
  const oldRow={name:'가상',_textStyles:{name:{backgroundColor:'#ff0000'}}};
  const settings={...first.getColumnFontSettings()[3],backgroundColor:'#e2efda'};
  assert.equal(first.applyColumnFontSettings([settings]),true);
  assert.equal(first.getCellFormatting(oldRow,'name','backgroundColor'),'#e2efda');
  const second=Object.create(context.App.prototype);
  second.columnFormatting=second.loadColumnFormatting();second.columnFormattingPending={};second.renderTable=()=>{};second.isEditingCell=()=>false;
  second.acceptSharedColumnFormatting(plain(first.columnFormatting));
  assert.equal(second.getColumnFontSettings()[3].backgroundColor,'#e2efda');
  assert.equal(second.getCellFormatting(oldRow,'name','backgroundColor'),'#e2efda');
  second.markCellFormatting(oldRow,'name','backgroundColor');
  assert.equal(second.getCellFormatting(oldRow,'name','backgroundColor'),'#ff0000');
  assert.equal(second.getCellFormatting({},'memo','backgroundColor'),undefined);
});

test('column background none clears old fills without rewriting patient records or later exceptions', () => {
  const instance=Object.create(context.App.prototype);
  instance.columnFormatting={};instance.renderTable=()=>{};instance.showSaveIndicator=()=>{};
  const row={name:'가상',_textColors:{name:'#0000ff'},_textStyles:{name:{backgroundColor:'#ff0000'}}};
  const before=JSON.stringify(row),settings={...instance.getColumnFontSettings()[3],color:'#0000ff',backgroundColor:null};
  assert.equal(instance.applyColumnFontSettings([settings]),true);
  assert.equal(instance.getCellFormatting(row,'name','backgroundColor'),null);
  assert.equal(instance.getCellFormatting(row,'name','color'),'#0000ff');
  assert.equal(JSON.stringify(row),before);
  instance.markCellFormatting(row,'name','backgroundColor');
  assert.equal(instance.getCellFormatting(row,'name','backgroundColor'),'#ff0000');
});

test('column background validation is atomic and legacy font-only calls preserve the background', () => {
  const instance=Object.create(context.App.prototype);
  instance.columnFormatting={};instance.renderTable=()=>{};instance.showSaveIndicator=()=>{};
  instance.setColumnFormatting({minCol:3,maxCol:3},'backgroundColor','#e2efda');
  const before=JSON.stringify(instance.columnFormatting);
  assert.equal(instance.applyColumnFontSettings([{...instance.getColumnFontSettings()[3],backgroundColor:'invalid'}]),false);
  const all=instance.getColumnFontSettings();all[2].backgroundColor='invalid';
  assert.equal(instance.saveColumnFontSettings(all),false);
  assert.equal(JSON.stringify(instance.columnFormatting),before);
  const fontOnly={...instance.getColumnFontSettings()[3],fontSize:20};delete fontOnly.backgroundColor;
  assert.equal(instance.applyColumnFontSettings([fontOnly]),true);
  assert.equal(instance.getColumnFontSettings()[3].backgroundColor,'#e2efda');
});

test('left-aligned display removes imported leading spaces without changing values or character colors', () => {
  const instance = Object.create(context.App.prototype);
  instance.columnFormatting = {};
  const originalDocument = context.document;
  context.document = {createElement() { return {style:{},textContent:''}; }};
  const element = {children:[],_text:'',set textContent(value){this._text=value;this.children=[];},get textContent(){return this._text+this.children.map(c=>c.textContent).join('');},append(child){this.children.push(child);}};
  try {
    const row = {part:'\u3000\u00a0허리',_textStyles:{part:{textAlign:'left'}},_richText:{part:{text:'\u3000\u00a0허리',colors:['#ff0000','#ff0000','#123456','#123456']}}};
    const before = JSON.stringify(row);
    instance.renderColoredText(element,row,'part');
    assert.equal(element.textContent,'허리');
    assert.equal(element.children[0].style.color,'#123456');
    assert.equal(JSON.stringify(row),before);
    delete row._richText;
    instance.renderColoredText(element,row,'part');
    assert.equal(element.textContent,'허리');
    row._textStyles.part.textAlign='center';
    instance.renderColoredText(element,row,'part');
    assert.equal(element.textContent,row.part);
  } finally {context.document=originalDocument;}
});

test('alignment applies only selected cells while keeping native input and column defaults', () => {
  const instance=Object.create(context.App.prototype), rows=[{name:'가상'},{name:'다른 셀'}];
  let refreshed=0, snapshots=0, saves=0;
  const cell={dataset:{},style:{},querySelector(){return {refreshEditorColors(){refreshed++;}};}};
  instance.columnFormatting={};instance.getCurrentRows=()=>rows;
  instance.getFormattingRange=()=>({minRow:0,maxRow:1,minCol:3,maxCol:3});
  instance.getSelectedFormattingColumns=()=>null;instance.isSelectedCoordinate=r=>r===0;
  instance.elTableBody={querySelector:()=>cell};instance.captureHistory=()=>snapshots++;
  instance.saveDataStore=record=>{assert.equal(record,false);saves++;};
  instance.updateInlineAutocompletePreview=()=>{};instance.updateAlignmentIndicator=()=>{};
  instance.renderTable=()=>assert.fail('must keep native editor alive');
  instance.applyAlignment('left');
  assert.equal(rows[0]._textStyles.name.textAlign,'left');assert.equal(rows[1]._textStyles,undefined);
  assert.equal(cell.style.textAlign,'left');assert.equal(cell.style.paddingLeft,'20px');assert.equal(cell.dataset.cellAlignment,'left');
  assert.equal(refreshed,1);assert.equal(snapshots,2);assert.equal(saves,1);assert.deepEqual(plain(instance.columnFormatting),{});
  instance.applyAlignment('right');assert.equal(cell.style.paddingLeft,'6px');assert.equal(cell.style.paddingRight,'20px');assert.equal(cell.style.textAlign,'right');
});

test('header alignment replaces all prior cell overrides, including when reapplying the same alignment', () => {
  const instance = Object.create(context.App.prototype);
  instance.columnFormatting = {};
  const rows = [{name:'첫 행'}, {name:'개별 정렬',_textStyles:{name:{textAlign:'right',fontSize:18}},_textColors:{name:'#123456'}}, {name:'마지막 행'}];
  instance.getCurrentRows = () => rows;
  instance.selectedColumnRange = {minCol:3,maxCol:3};
  instance.selectedRange = {minRow:0,maxRow:2,minCol:3,maxCol:3};
  instance.isEditingCell = () => false;
  instance.renderTable = () => {};
  instance.selectEntireColumn = () => {};
  instance.updateAlignmentIndicator = () => {};
  instance.applyAlignment('left');
  for (const row of rows) assert.equal(instance.getCellFormatting(row,'name','textAlign'),'left');
  assert.equal(instance.getCellFormatting(rows[1],'name','fontSize'),18);
  assert.equal(instance.getCellFormatting(rows[1],'name','color'),'#123456');
  instance.markCellFormatting(rows[1],'name','textAlign');
  assert.equal(instance.getCellFormatting(rows[1],'name','textAlign'),'right');
  instance.applyAlignment('left');
  const reloaded = Object.create(context.App.prototype);
  reloaded.columnFormatting = reloaded.loadColumnFormatting();
  for (const row of rows) assert.equal(reloaded.getCellFormatting(plain(row),'name','textAlign'),'left');
  reloaded.markCellFormatting(rows[1],'name','textAlign');
  assert.equal(reloaded.getCellFormatting(rows[1],'name','textAlign'),'right');
});

test('column alignment persists and later cell alignment stays independent across devices and copies', () => {
  const first=Object.create(context.App.prototype);first.columnFormatting={};first.renderTable=()=>{};first.showSaveIndicator=()=>{};
  const setting={...first.getColumnFontSettings()[3],textAlign:'right'};
  assert.equal(first.applyColumnFontSettings([setting]),true);
  const old={name:'과거',_textStyles:{name:{textAlign:'left'}}};
  assert.equal(first.getCellFormatting(old,'name','textAlign'),'right');
  first.markCellFormatting(old,'name','textAlign');
  assert.equal(first.getCellFormatting(old,'name','textAlign'),'left');
  const second=Object.create(context.App.prototype);second.columnFormatting=second.loadColumnFormatting();
  assert.equal(second.validateSharedColumnFormatting(second.columnFormatting),true);
  assert.equal(second.getColumnFontSettings()[3].textAlign,'right');
  assert.equal(second.getCellFormatting(plain(old),'name','textAlign'),'left');
  const copy={};second.applyCopiedCellFormatting(copy,'memo',first.captureCellFormatting(old,'name'));
  assert.equal(copy._textStyles.memo.textAlign,'left');
  const before=JSON.stringify(first.columnFormatting);
  assert.equal(first.applyColumnFontSettings([{...setting,textAlign:'justify'}]),false);
  assert.equal(JSON.stringify(first.columnFormatting),before);
});

test('colored editor overlays follow centered and right native text with scrolling and left padding', () => {
  const instance=Object.create(context.App.prototype);
  instance.editorMeasurementCanvas={getContext:()=>({measureText:()=>({width:40})})};
  const input={value:'가상',clientWidth:120,offsetLeft:0,scrollLeft:0};
  const font={paddingLeft:'20px',paddingRight:'6px',textAlign:'left',letterSpacing:'normal',font:'14px Arial'};
  assert.equal(instance.getEditorTextLeft(input,font),20);
  assert.equal(instance.getEditorTextLeft(input,{...font,textAlign:'center'}),47);
  assert.equal(instance.getEditorTextLeft(input,{...font,textAlign:'right'}),74);
  input.scrollLeft=10;assert.equal(instance.getEditorTextLeft(input,{...font,textAlign:'right'}),64);
  input.clientWidth=30;assert.equal(instance.getEditorTextLeft(input,{...font,textAlign:'right'}),10);
});
