const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function createApp() {
  const storage = new Map();
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { activeElement: null, getElementById() { return null; } },
    localStorage: { getItem() { return null; }, setItem(k, v) { storage.set(k, v); } },
    clearTimeout,
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  app.currentDate = '2026-09-30';
  app.dataStore = {};
  app.editHistory = new Map();
  app.getCurrentRows();
  app.getEditHistory();
  for (const method of ['clearHeaderSelections', 'closeAutocompleteMenu', 'closeGenderDropdown', 'renderTable', 'showSaveIndicator', 'updateSidebarStats', 'scheduleSupabaseSync']) app[method] = () => {};
  for (const element of ['elSearchInput', 'elFormulaInput', 'elCellAddress', 'elSelectedCellCoords']) app[element] = { value: "" };
  app.elBtnClearSearch = { style: {} };
  app.elSheetContainer = { focus() {} };
  return { app, storage, context };
}

test('history Apply undoes the whole row allocation and restores the prior row-header selection', () => {
  const {app}=createApp();
  const rows=app.getCurrentRows();rows[118].name='기존환자';app.saveDataStore();
  app.selectRowRange=(minRow,maxRow)=>{app.selectedRowRange={minRow,maxRow};app.activeCell=null;};
  app.selectRowRange(118,118);app.selectedRange={minCol:0,maxCol:9};
  app.clearHeaderSelections=()=>{app.selectedRowRange=null;app.selectedRange=null;};
  app.elTableBody={querySelector:()=>null,querySelectorAll:()=>[]};
  app.historyApplyTarget={date:app.currentDate,row:rows[118],rowIdx:118,rows};
  app.elSearchInput.value='새환자';
  app.searchAllDates=()=>{};
  app.renderTable=()=>app.getCurrentRows();
  app.restoreAppliedHistorySelection=target=>{app.activeCell={rowIdx:target.rowIdx,colKey:'no'};};
  const before=JSON.stringify(app.getCurrentRows());
  app.captureHistory();
  const undoBefore=app.getEditHistory().undo.length;
  app.applyHistoryRow({name:'새환자',chartNo:'TEST',part:'허리',_sourceDate:'2026-09-01'},{focusAppliedRow:true});
  const after=JSON.stringify(app.getCurrentRows());
  assert.equal(app.getCurrentRows()[119].name,'새환자');
  assert.equal(app.getEditHistory().undo.length,undoBefore+1);
  app.restoreEditHistory();
  assert.equal(JSON.stringify(app.getCurrentRows()),before);
  assert.deepEqual(app.selectedRowRange,{minRow:118,maxRow:118});
  assert.equal(app.lastHistoryAppliedTarget,null);
  app.selectCell=(rowIdx,colKey)=>{app.activeCell={rowIdx,colKey};};
  app.elTableBody.querySelector=()=>({});
  app.restoreEditHistory(true);
  assert.equal(JSON.stringify(app.getCurrentRows()),after);
  assert.deepEqual(app.activeCell,{rowIdx:119,colKey:'no'});
});

test('consecutive search applies and partial history selection undo and redo independently', () => {
  const {app}=createApp();
  const rows=app.getCurrentRows();Object.assign(rows[0],{name:'가상환자',chartNo:'TEST',part:'원래',memo:'보존'});app.saveDataStore();
  app.elTableBody={querySelector:()=>null,querySelectorAll:()=>[]};
  app.elSearchInput.value='가상환자';app.searchAllDates=()=>{};
  app.renderTable=()=>app.getCurrentRows();
  app.historyApplyTarget={date:app.currentDate,row:rows[0],rowIdx:0,rows};
  const baseline=JSON.stringify(rows);
  const source={name:'가상환자',chartNo:'TEST',part:'첫 적용',memo:'변경 금지',_sourceDate:'2026-09-01',_sourceRowIdx:0};
  app.crossDateResults=[source];
  app.selectCrossDateCell=(row,col,extend)=>{app.crossDateSelection={startRow:0,endRow:row,startCol:4,endCol:col,minRow:0,maxRow:row,minCol:4,maxCol:col};};
  app.selectCrossDateCell(0,4);
  app.applyHistoryRow(source);
  const first=JSON.stringify(app.getCurrentRows());
  assert.equal(app.getCurrentRows()[0].part,'첫 적용');assert.equal(app.getCurrentRows()[0].memo,'보존');
  source.part='두번째 적용';app.applyHistoryRow(source);
  app.restoreEditHistory();assert.equal(JSON.stringify(app.getCurrentRows()),first);
  assert.equal(app.crossDateSelection.minCol,4);
  app.restoreEditHistory();assert.equal(JSON.stringify(app.getCurrentRows()),baseline);
  assert.equal(app.crossDateSelection.minCol,4);
  app.restoreEditHistory(true);assert.equal(JSON.stringify(app.getCurrentRows()),first);
  app.restoreEditHistory(true);assert.equal(app.getCurrentRows()[0].part,'두번째 적용');
  assert.equal(app.getCurrentRows()[0].memo,'보존');
});

test('repeated Apply and history-range paste undo survive synchronization between every cycle', async () => {
  for (const operation of ['apply','paste']) {
    const {app,context}=createApp();context.navigator={};
    app.getCurrentRows()[0].name='기존환자';app.saveDataStore();
    app.elSearchInput.value='검색환자';
    app.elTableBody={querySelector:()=>({scrollIntoView(){}}),querySelectorAll:()=>[]};
    app.renderClipboardSelection=()=>{};
    app.renderTable=()=>app.getCurrentRows();
    app.updateRangeSelection=()=>{};
    app.selectCell=(rowIdx,colKey)=>{app.activeCell={rowIdx,colKey};app.selectedRange=null;};
    app.selectRowRange=(minRow,maxRow)=>{app.selectedRowRange={minRow,maxRow};app.activeCell=null;app.selectedRange={minRow,maxRow,minCol:0,maxCol:9};};
    app.clearHeaderSelections=()=>{app.selectedRowRange=null;app.selectedRange=null;};
    app.searchAllDates=()=>{const rows=app.getCurrentRows();app.historyApplyTarget={date:app.currentDate,row:rows[1],rowIdx:1,rows};};
    app.restoreAppliedHistorySelection=target=>app.selectCell(target.rowIdx,'no');
    for(let cycle=0;cycle<4;cycle++) {
      app.searchAllDates();app.selectRowRange(1,1);
      if(operation==='apply') app.applyHistoryRow({name:'검색환자',chartNo:'TEST',part:'허리',_sourceDate:'2026-09-01'},{focusAppliedRow:true});
      else {
        app.clipboardBuffer='1\tF\tTEST\t검색환자\t허리\t치료\t\tJ\t메모\t특이사항';
        app.clipboardSelection={kind:'history',minRow:0,maxRow:0,minCol:0,maxCol:9};
        await app.pasteSelection(app.clipboardBuffer);
      }
      assert.equal(app.getCurrentRows()[1].name,'검색환자',`${operation}/${cycle} apply`);
      const previous=JSON.parse(JSON.stringify(app.getCurrentRows()));
      app.getCurrentRows()[4].memo=`원격 메모 ${cycle}`;
      app.rebaseEditHistoryAfterSync(app.currentDate,previous);
      app.restoreEditHistory();
      assert.equal(app.getCurrentRows()[1].name,'',`${operation}/${cycle} undo`);
      assert.equal(app.getCurrentRows()[4].memo,`원격 메모 ${cycle}`);
      assert.equal(app.getEditHistory().redo.length,1);
    }
  }
});

test('multi-cell changes restore as one transaction and persist undo/redo', () => {
  const { app, storage } = createApp();
  const rows = app.getCurrentRows();
  rows[0].name = '가상환자'; rows[0].chartNo = '123'; rows[1].memo = '테스트';
  app.saveDataStore();
  app.saveDataStore();
  assert.equal(app.getEditHistory().undo.length, 1);
  app.restoreEditHistory();
  assert.equal(app.getCurrentRows()[0].name, '');
  assert.equal(app.getCurrentRows()[1].memo, '');
  assert.equal(JSON.parse([...storage.values()][0])['2026-09-30'][0].chartNo, '');
  app.restoreEditHistory(true);
  assert.equal(app.getCurrentRows()[0].chartNo, '123');
  assert.equal(app.getCurrentRows()[1].memo, '테스트');
});

test('undo is isolated by date and new edits invalidate redo', () => {
  const { app } = createApp();
  app.getCurrentRows()[0].name = '오늘'; app.saveDataStore();
  app.currentDate = '2026-09-29'; app.getCurrentRows(); app.getEditHistory();
  app.getCurrentRows()[0].name = '어제'; app.saveDataStore();
  app.restoreEditHistory();
  assert.equal(app.getCurrentRows()[0].name, '');
  assert.equal(app.dataStore['2026-09-30'][0].name, '오늘');
  app.getCurrentRows()[0].name = '새수정'; app.saveDataStore();
  assert.equal(app.getEditHistory().redo.length, 0);
  app.currentDate = '2026-09-30'; app.restoreEditHistory();
  assert.equal(app.getCurrentRows()[0].name, '');
  assert.equal(app.dataStore['2026-09-29'][0].name, '새수정');
});

test('undo history is bounded and captures a pending edit before undo', () => {
  const { app } = createApp();
  for (let i = 0; i < 60; i++) { app.getCurrentRows()[0].memo = String(i); app.saveDataStore(); }
  assert.equal(app.getEditHistory().undo.length, 50);
  app.getCurrentRows()[0].memo = '미저장 입력';
  app.restoreEditHistory();
  assert.equal(app.getCurrentRows()[0].memo, '59');
  app.restoreEditHistory(true);
  assert.equal(app.getCurrentRows()[0].memo, '미저장 입력');
});


test('undo and redo retain history search and its destination row', () => {
  const { app } = createApp();
  app.getCurrentRows()[0].name = '테스트'; app.saveDataStore();
  app.elSearchInput.value = '테스트';
  app.historyApplyTarget = { rowIdx: 0 };
  const searches = [];
  app.searchAllDates = (query, rowIdx) => searches.push([query, rowIdx]);
  app.restoreEditHistory();
  assert.equal(app.elSearchInput.value, '테스트');
  assert.equal(app.elBtnClearSearch.style.display, 'block');
  app.restoreEditHistory(true);
  assert.deepEqual(searches, [['테스트', 0], ['테스트', 0]]);
  assert.equal(app.getCurrentRows()[0].name, '테스트');
});

test('visit time manual changes and deletion survive saves and reloads', () => {
  const {app}=createApp();const row=app.getCurrentRows()[0];row.name='가상환자';app.saveDataStore();
  assert.match(row.visitTime,/\d{2}시 \d{2}분 \d{2}초/);
  row.visitTime='10시 20분';app.saveDataStore();assert.equal(app.getVisitTime(row),'10시 20분');assert.equal(row._visitTimeEdited,true);
  row.visitTime='';app.saveDataStore();app.saveDataStore();assert.equal(row.visitTime,'');
  app.dataStore[app.currentDate]=JSON.parse(JSON.stringify(app.getCurrentRows()));app.getCurrentRows();app.saveDataStore();assert.equal(app.getCurrentRows()[0].visitTime,'');
});


test('clearing a name clears its visit time in the same undo transaction', () => {
  const {app}=createApp();const row=app.getCurrentRows()[0];row.name='가상환자';app.saveDataStore();
  const originalTime=row.visitTime;
  row.name='   ';app.saveDataStore();
  assert.equal(row.visitTime,'');assert.equal(row._visitedAt,undefined);assert.equal(row._visitTimeEdited,undefined);
  app.restoreEditHistory();assert.equal(app.getCurrentRows()[0].name,'가상환자');assert.equal(app.getCurrentRows()[0].visitTime,originalTime);
  app.restoreEditHistory(true);assert.equal(app.getCurrentRows()[0].visitTime,'');
  app.getCurrentRows()[0].name='새환자';app.saveDataStore();assert.match(app.getCurrentRows()[0].visitTime,/\d{2}시 \d{2}분 \d{2}초/);
});

test('explicit visit refresh records seconds and supports undo without changing another row', () => {
  const {app}=createApp(),rows=app.getCurrentRows();
  rows[0].name='가상환자';app.saveDataStore();rows[0].visitTime='09시 01분 02초';app.saveDataStore();
  rows[1].visitTime='08시 00분 00초';app.saveDataStore();
  const now=new Date(2026,9,1,14,23,45);
  app.setVisitTimeNow(rows[0],now);app.saveDataStore();
  assert.equal(rows[0].visitTime,'14시 23분 45초');assert.equal(rows[0]._visitedAt,now.toISOString());
  assert.equal(rows[1].visitTime,'08시 00분 00초');
  app.restoreEditHistory();assert.equal(app.getCurrentRows()[0].visitTime,'09시 01분 02초');
});

test('handleHistoryShortcut triggers undo and redo during Korean IME with KeyZ and KeyY', () => {
  const { app } = createApp();
  const row = app.getCurrentRows()[0];
  row.name = '원래이름';
  app.saveDataStore();
  row.name = '새이름';
  app.saveDataStore();

  let prevented = false;
  // Mac Korean IME: Cmd + ㅋ (code: KeyZ, keyCode: 229)
  const koreanUndoEvent = {
    metaKey: true, ctrlKey: false, altKey: false, shiftKey: false,
    key: 'ㅋ', code: 'KeyZ', keyCode: 229,
    target: { matches: () => false },
    preventDefault() { prevented = true; },
    stopPropagation() {}
  };
  const handled = app.handleHistoryShortcut(koreanUndoEvent);
  assert.ok(handled);
  assert.ok(prevented);
  assert.equal(app.getCurrentRows()[0].name, '원래이름');

  // Redo with Shift + Cmd + ㅋ (code: KeyZ)
  const koreanRedoEvent = {
    metaKey: true, ctrlKey: false, altKey: false, shiftKey: true,
    key: 'ㅋ', code: 'KeyZ', keyCode: 229,
    target: { matches: () => false },
    preventDefault() {},
    stopPropagation() {}
  };
  assert.ok(app.handleHistoryShortcut(koreanRedoEvent));
  assert.equal(app.getCurrentRows()[0].name, '새이름');
});



test('background formatting records undo even while editor focus suppresses normal save history', () => {
  const { app, context } = createApp();
  context.document.activeElement = { blur() {}, matches() { return false; } };
  app.dataStore[app.currentDate] = [{memo:'가상 메모',_textColors:{memo:'#0000ff'},_textStyles:{memo:{backgroundColor:'#ffff00'}}}];
  app.editHistory.clear(); // Also cover the first formatting change for a date.
  app.getFormattingRange = () => ({minRow:0,maxRow:0,minCol:8,maxCol:8});
  app.getSelectedFormattingColumns = () => null;
  app.isSelectedCoordinate = () => true;
  app.isEditingCell = () => true;
  app.updateBackgroundColorIndicator = app.closeFontColorMenu = () => {};
  app.applyBackgroundColor('#ff0000');
  assert.equal(app.getEditHistory().undo.length,1);
  assert.equal(app.getCurrentRows()[0]._textStyles.memo.backgroundColor,'#ff0000');
  app.restoreEditHistory();
  assert.equal(app.getCurrentRows()[0]._textStyles.memo.backgroundColor,'#ffff00');
  assert.equal(app.getCurrentRows()[0]._textColors.memo,'#0000ff');
  app.restoreEditHistory(true);
  assert.equal(app.getCurrentRows()[0]._textStyles.memo.backgroundColor,'#ff0000');
  app.applyBackgroundColor(null);
  app.restoreEditHistory();
  assert.equal(app.getCurrentRows()[0]._textStyles.memo.backgroundColor,'#ff0000');
});
