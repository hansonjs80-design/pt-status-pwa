const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function fixture(platform = 'Win32') {
  const events = {}, tasks = [];
  const body = {}, sheet = {};
  const document = {body, activeElement: body, visibilityState: 'visible', focused: true,
    hasFocus() { return this.focused; }, overlays: [], querySelectorAll() { return this.overlays; },
    addEventListener(type, fn) { events[type] = fn; }};
  const context = vm.createContext({navigator: {platform}, document,
    window: {addEventListener(type, fn) { events[type] = fn; }},
    setTimeout(fn) { tasks.push(fn); }, clearTimeout() {}, localStorage: {getItem() { return null; }}});
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  const cell = {isConnected: true, editor: null, getClientRects: () => [{}], querySelector() { return this.editor; }};
  app.currentDate = '2026-10-16'; app.activeCell = {rowIdx: 0, colKey: 'memo'};
  app.elTableBody = {querySelector: () => cell}; app.elSheetContainer = sheet;
  const calls = [];
  const editor = (armed = true, value = '가상 메모') => ({value, selectionStart: 1, selectionEnd: 3,
    dataset: {}, classList: {contains: name => name === 'is-armed' && armed},
    focus() { calls.push('focus'); document.activeElement = this; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }});
  app.startInlineEdit = (row, col, target, armed) => {
    calls.push({row, col, armed}); target.editor = editor(armed); target.editor.focus();
  };
  app.initCellWindowFocus();
  return {app, cell, document, events, tasks, calls, editor};
}

test('window return prepares the selected input before the first key regardless of blur order', () => {
  for (const elementFirst of [true, false]) {
    const f = fixture(); const input = f.cell.editor = f.editor(); f.document.activeElement = input;
    f.document.focused = false;
    if (!elementFirst) f.events.blur();
    f.app.rememberCellWindowInput(input); f.cell.editor = null; f.document.activeElement = f.document.body;
    if (elementFirst) f.events.blur();
    f.document.focused = true; f.events.focus();
    assert.equal(f.document.activeElement, f.cell.editor);
    assert.deepEqual(f.calls[0], {row: 0, col: 'memo', armed: true});
    f.tasks.forEach(task => task());
    assert.equal(f.calls.length, 2, 'deferred retry must not create/refocus the editor twice');
  }
});

test('return restores an editing caret after commit removed the input', () => {
  const f = fixture(); const input = f.cell.editor = f.editor(false); f.document.activeElement = input;
  f.app.rememberCellWindowInput(input); f.cell.editor = null; f.document.activeElement = f.document.body;
  f.events.focus();
  assert.equal(f.calls[0].armed, false);
  assert.equal(f.cell.editor.selectionStart, 1); assert.equal(f.cell.editor.selectionEnd, 3);
});

test('an existing native composition survives return without recreation or selection changes', () => {
  const f = fixture(); const input = f.cell.editor = f.editor(false, '가상ㄱ');
  input.dataset.nativeComposing = 'true'; f.document.activeElement = input;
  f.events.blur(); f.events.focus();
  assert.equal(f.calls.length, 0); assert.equal(input.value, '가상ㄱ');
  assert.equal(input.dataset.nativeComposing, 'true'); assert.equal(input.selectionStart, 1);
  f.events.blur(); f.document.activeElement = f.document.body; f.events.focus();
  assert.deepEqual(f.calls, ['focus']); assert.equal(f.cell.editor, input);
});

test('visible dialogs and another focused control keep focus when the window returns', () => {
  for (const blocked of ['dialog', 'control']) {
    const f = fixture(); f.cell.editor = f.editor(); f.document.activeElement = f.cell.editor; f.events.blur();
    f.document.activeElement = blocked === 'control' ? {} : f.document.body;
    if (blocked === 'dialog') f.document.overlays = [{getClientRects: () => [{}]}];
    f.events.focus(); f.tasks.forEach(task => task());
    assert.equal(f.calls.length, 0, blocked); assert.equal(f.app.cellWindowInput, null);
  }
});

test('selection, date, and recovery changes invalidate an old return target', () => {
  for (const changed of ['date', 'cell', 'range', 'history', 'restore']) {
    const f = fixture(); f.cell.editor = f.editor(); f.document.activeElement = f.cell.editor; f.events.blur();
    f.document.activeElement = f.document.body;
    if (changed === 'date') f.app.currentDate = '2026-10-17';
    if (changed === 'cell') f.app.activeCell = {rowIdx: 1, colKey: 'memo'};
    if (changed === 'range') f.app.selectedRange = {minRow: 0, maxRow: 1, minCol: 8, maxCol: 8};
    if (changed === 'history') f.app.crossDateSelection = {};
    if (changed === 'restore') f.app._recordsRestorePending = true;
    f.events.focus(); assert.equal(f.calls.length, 0, changed);
  }
});

test('visibility return retries after focus is restored and leaves platforms without native input enabled alone', () => {
  const f = fixture(); f.cell.editor = f.editor(); f.document.activeElement = f.cell.editor;
  f.document.visibilityState = 'hidden'; f.document.focused = false; f.events.visibilitychange();
  f.cell.editor = null; f.document.activeElement = f.document.body;
  f.document.visibilityState = 'visible'; f.events.visibilitychange(); assert.equal(f.calls.length, 0);
  f.document.focused = true; f.tasks.forEach(task => task());
  assert.equal(f.document.activeElement, f.cell.editor);
  const mac = fixture('Linux x86_64'); mac.events.blur(); mac.events.focus();
  assert.equal(mac.calls.length, 0);
});
