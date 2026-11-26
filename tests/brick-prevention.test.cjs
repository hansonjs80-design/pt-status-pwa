const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto: crypto } = require('node:crypto');
const source = require('./helpers/load-app-source.cjs');

function makeElement(tagName, doc) {
  const listeners = new Map();
  const classes = new Set();
  const styleProps = new Map();
  const style = new Proxy({
    setProperty: (k, v) => styleProps.set(k, v),
    removeProperty: k => styleProps.delete(k),
    getPropertyValue: k => styleProps.get(k) || '',
  }, {
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
  const el = {
    tagName: tagName.toUpperCase(),
    dataset: {},
    style,
    children: [],
    parentElement: null,
    isConnected: false,
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
    _className: '',
    textContent: '',
    classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      toggle: (n, force) => {
        const next = force === undefined ? !classes.has(n) : Boolean(force);
        if (next) classes.add(n);
        else classes.delete(n);
        return next;
      },
      contains: n => classes.has(n),
    },
    matches(selector) {
      const hasClass = String(el.className || '').split(/\s+/).filter(Boolean);
      const isArmed = classes.has('is-armed') || hasClass.includes('is-armed');
      const isCellInput = classes.has('cell-input-element') || hasClass.includes('cell-input-element');
      if (selector.includes('.cell-input-element:not(.is-armed)')) return isCellInput && !isArmed;
      if (selector.includes('.cell-input-element')) return isCellInput;
      return false;
    },
    closest: () => null,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent(event) {
      let stopped = false;
      const ev = {
        type: event.type || 'keydown',
        target: el,
        defaultPrevented: false,
        preventDefault() { ev.defaultPrevented = true; },
        stopPropagation() {},
        stopImmediatePropagation() { stopped = true; },
        ...event,
      };
      for (const fn of [...(listeners.get(ev.type) || [])]) {
        if (stopped) break;
        fn(ev);
      }
      return ev;
    },
    appendChild(child) {
      child.parentElement = el;
      child.isConnected = el.isConnected;
      el.children.push(child);
      return child;
    },
    append(...nodes) {
      nodes.forEach(n => { if (n && typeof n === 'object') el.appendChild(n); });
    },
    remove() {
      if (el.parentElement) {
        el.parentElement.children = el.parentElement.children.filter(c => c !== el);
        el.parentElement = null;
      }
      el.isConnected = false;
      if (doc.activeElement === el) doc.activeElement = doc.body;
    },
    querySelector(sel) {
      return el.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      if (sel === 'input[data-committed="true"]') {
        return el.children.filter(c => c.tagName === 'INPUT' && c.dataset?.committed === 'true');
      }
      if (sel === 'input') {
        return el.children.filter(c => c.tagName === 'INPUT');
      }
      return [];
    },
    focus() {
      if (el.isConnected) doc.activeElement = el;
    },
    setSelectionRange(start, end) {
      el.selectionStart = start;
      el.selectionEnd = end;
    },
    select() {},
    get listeners() { return listeners; },
  };
  Object.defineProperty(el, 'className', {
    get: () => [...classes].join(' '),
    set: v => {
      classes.clear();
      String(v ?? '').split(/\s+/).filter(Boolean).forEach(n => classes.add(n));
    }
  });
  Object.defineProperty(el, 'textContent', {
    get: () => el._textContent || '',
    set: v => {
      el._textContent = String(v ?? '');
      if (el._textContent === '') {
        [...el.children].forEach(c => c.remove());
      }
    }
  });
  return el;
}

test('PTDeviceRecovery.flush breaks cleanly instead of spinning forever when folder disconnects or switches repeatedly', async () => {
  const context = vm.createContext({
    crypto,
    Date,
    setTimeout,
    clearTimeout,
    console,
    navigator: { storage: { persisted: async () => false } },
    location: { origin: 'https://virtual.invalid', pathname: '/index.html' },
  });
  const recoverySrc = ['device-settings.js', 'device-recovery.js']
    .map(file => fs.readFileSync(require.resolve('../' + file), 'utf8')).join('\n');
  vm.runInContext(recoverySrc + '\nglobalThis.Recovery = PTDeviceRecovery;', context);

  let snapshotCalls = 0;
  let locksHeld = 0;
  context.navigator.locks = {
    request: async (_name, fn) => {
      locksHeld++;
      try { return await fn(); } finally { locksHeld--; }
    }
  };

  const folder = { name: 'ext', queryPermission: async () => 'granted' };
  const tools = {
    folder,
    settings: {},
    app: { readDevicePreferences: () => ({ columnWidths: { name: 200 }, columnWidthUpdatedAt: { name: 1 } }) },
    store: async () => ({})
  };
  const recovery = new context.Recovery(tools);
  recovery.ready = true;
  recovery.dirty = true;
  recovery.meta = { id: 'dev-1' };
  recovery.connection = 1;
  recovery.snapshot = async () => {
    snapshotCalls++;
    tools.folder = null; // folder detached mid-flush
    return {
      version: 1,
      deviceId: 'dev-1',
      savedAt: new Date().toISOString(),
      ui: { columnWidths: { name: 200 }, columnWidthUpdatedAt: { name: 1 } },
      exports: { _fieldUpdatedAt: {} }
    };
  };

  await recovery.flush();
  assert.equal(snapshotCalls, 1, 'flush must exit on detached folder without looping infinitely');
  assert.equal(recovery.dirty, true);
  assert.equal(recovery.writing, null);
  assert.equal(locksHeld, 0);

  // Rapid folder-switching case must stop cleanly rather than holding lock forever
  let switchSnapshots = 0;
  const scheduled = [];
  const timersContext = vm.createContext({
    crypto, Date, console,
    setTimeout: fn => { scheduled.push(fn); return scheduled.length; },
    clearTimeout() {},
    navigator: context.navigator,
    location: context.location,
  });
  vm.runInContext(recoverySrc + '\nglobalThis.Recovery = PTDeviceRecovery;', timersContext);
  const tools2 = { folder: { name: 'a' }, settings: {} };
  const recovery2 = new timersContext.Recovery(tools2);
  recovery2.ready = true;
  recovery2.dirty = true;
  recovery2.meta = { id: 'dev-2' };
  recovery2.connection = 1;
  recovery2.snapshot = async () => {
    switchSnapshots++;
    recovery2.connection++;
    return {
      version: 1,
      deviceId: 'dev-2',
      savedAt: new Date().toISOString(),
      ui: { columnWidths: { name: 200 }, columnWidthUpdatedAt: { name: 1 } },
      exports: { _fieldUpdatedAt: {} }
    };
  };
  await recovery2.flush();
  assert.equal(switchSnapshots, 5);
  assert.equal(locksHeld, 0);
  assert.equal(scheduled.length, 1, 'bounded retry scheduled after loop limit');
});

test('committed or stale cell inputs never brick isEditingCell or swallow Escape/navigation keys', () => {
  const doc = { activeElement: null, hasFocus: () => true, querySelectorAll: () => [], getElementById: () => null };
  doc.body = makeElement('body', doc);
  doc.body.isConnected = true;
  doc.createElement = tag => makeElement(tag, doc);

  const context = vm.createContext({
    window: { addEventListener() {} },
    document: doc,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: () => 0,
    clearTimeout() {},
    Date,
    Event: class Event { constructor(type) { this.type = type; } },
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  const row = { name: '김환자' };
  const sheet = makeElement('div', doc);
  sheet.isConnected = true;
  const cell = makeElement('td', doc);
  cell.isConnected = true;
  cell.dataset = { row: '0', col: 'name' };
  sheet.appendChild(cell);

  Object.assign(app, {
    currentDate: '2026-11-14',
    dataStore: { '2026-11-14': [row] },
    activeCell: { rowIdx: 0, colKey: 'name' },
    elTableBody: sheet,
    elSheetContainer: sheet,
    elFormulaInput: null,
    getCurrentRows: () => [row],
    usesNativeCellInput: () => true,
    getCellInputLanguage: () => 'kor',
    isKoreanPreferredColumn: () => true,
    initMemoInput() {},
    closeAutocompleteMenu() {},
    loadSearchHistory: async () => {},
    saveDataStore() {},
    debounceSaveDataStore() {},
    applyCellFormatting() {},
    renderColoredText(el, r, k) { el.textContent = r[k] || ''; },
    getEffectiveCellRichText: () => null,
    normalizeCellEditorValue: (_i, v) => v,
    assembleCellEditorText: (_i, v) => v,
    endNativeCellEditing() {},
    applyCompoundPatientInput: () => false,
    applyAutocompleteColor() {},
    refreshNewPatientRows() {},
    getCellEditorValue: input => input.value,
    isHangulToggleKeyEvent: () => false,
    toggleCellInputLanguage: () => false,
    clearKoreanKeyBuffer() {},
    releaseNavigationInputGuard() {},
    blockInheritedNavigationInput: () => false,
    handleClipboardArrowHandoff: () => false,
    handleForcedCorrectionDelete: () => false,
    updateAutocomplete() {},
  });

  app.startInlineEdit(0, 'name', cell, false);
  const input = cell.querySelector('input');
  assert.ok(input);
  assert.equal(doc.activeElement, input);
  assert.equal(app.isEditingCell(), true);

  // Committing via commitAutocompleteValue marks committed, detaches input, and restores sheet focus
  assert.equal(input.commitAutocompleteValue('박수정'), true);
  assert.equal(input.dataset.committed, 'true');
  assert.equal(input.isConnected, false);
  assert.equal(doc.activeElement, sheet);
  assert.equal(app.isEditingCell(), false);

  // Even if a dead committed input somehow retains focus or stays in DOM, it cannot trap keys
  cell.appendChild(input);
  doc.activeElement = input;
  assert.equal(app.isEditingCell(), false, 'committed input must never lock isEditingCell()');
  const keyEv = input.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(keyEv.defaultPrevented, false, 'stale input must not swallow Escape');
  assert.equal(doc.activeElement, sheet, 'stale input keydown restores focus to sheet');
  assert.equal(cell.querySelector('input'), null, 'stale input removes itself');

  // Re-entering edit ignores leftover data-committed="true" input and opens fresh live editor
  const stale = makeElement('input', doc);
  stale.dataset.committed = 'true';
  cell.appendChild(stale);
  app.startInlineEdit(0, 'name', cell, false);
  const fresh = cell.querySelector('input');
  assert.ok(fresh && fresh !== stale);
  assert.equal(fresh.dataset.committed, undefined);
});

test('blocked inherited composition and armed navigation keys clear stuck composing flags', () => {
  const forwarded = [];
  const doc = {
    activeElement: null,
    hasFocus: () => true,
    dispatchEvent: ev => {
      forwarded.push({ ev, editing: app.isEditingCell() });
      return true;
    }
  };
  doc.body = makeElement('body', doc);
  doc.body.isConnected = true;
  doc.createElement = tag => makeElement(tag, doc);

  const context = vm.createContext({
    window: { addEventListener() {} },
    document: doc,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: () => 0,
    clearTimeout() {},
    Date,
    KeyboardEvent: class KeyboardEvent { constructor(type, init = {}) { Object.assign(this, init, { type }); } },
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  const sheet = makeElement('div', doc);
  sheet.isConnected = true;
  const origSheetDispatch = sheet.dispatchEvent.bind(sheet);
  sheet.dispatchEvent = ev => {
    forwarded.push({ ev, editing: app.isEditingCell() });
    return origSheetDispatch(ev);
  };
  const cell = makeElement('td', doc);
  cell.isConnected = true;
  sheet.appendChild(cell);

  Object.assign(app, {
    currentDate: '2026-11-14',
    elTableBody: sheet,
    elSheetContainer: sheet,
    getCurrentRows: () => [{ name: '' }],
    usesNativeCellInput: () => true,
    getCellInputLanguage: () => 'kor',
    isKoreanPreferredColumn: () => true,
    initMemoInput() {},
    closeAutocompleteMenu() {},
    saveDataStore() {},
    debounceSaveDataStore() {},
    getEffectiveCellRichText: () => null,
    getCellEditorValue: input => input.value,
    isHangulToggleKeyEvent: () => false,
    toggleCellInputLanguage: () => false,
    clearKoreanKeyBuffer() {},
    handleClipboardArrowHandoff: () => false,
    handleForcedCorrectionDelete: () => false,
  });

  // 1. Blocked inherited composition on armed input resets nativeComposing / composing
  app.guardNextCellInput = true;
  app.startInlineEdit(0, 'name', cell, true);
  const armedInput = cell.querySelector('input');
  armedInput.dataset.nativeComposing = 'true';
  armedInput.dataset.composing = 'true';
  const blocked = app.blockInheritedNavigationInput(armedInput, { cancelable: true, preventDefault() {} }, '');
  assert.equal(blocked, true);
  assert.equal(armedInput.dataset.nativeComposing, 'false');
  assert.equal(armedInput.dataset.composing, 'false');
  assert.equal(app.isEditingCell(), false);

  // 2. Stuck composing on armed input is cleared by non-composing ArrowRight and forwarded with isEditingCell() === false
  armedInput.dataset.nativeComposing = 'true';
  armedInput.dataset.composing = 'true';
  doc.activeElement = armedInput;
  armedInput.dispatchEvent({ type: 'keydown', key: 'ArrowRight', isComposing: false, keyCode: 39 });
  assert.equal(armedInput.dataset.nativeComposing, 'false');
  assert.equal(armedInput.dataset.composing, 'false');
  assert.equal(app.isEditingCell(), false);
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].ev.key, 'ArrowRight');
  assert.equal(forwarded[0].editing, false);
});

test('toggleUnderline toggles off brush mode and initHighlightBrush exits when clicking controls or outside', () => {
  const docListeners = new Map();
  const doc = {
    activeElement: null,
    addEventListener: (type, fn) => {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    getElementById: () => null,
  };
  const sheetListeners = new Map();
  const sheet = {
    _contains: new Set(),
    contains: target => target === sheet || sheet._contains.has(target),
    classList: { add() {}, toggle() {}, remove() {} },
    style: { setProperty() {}, removeProperty() {} },
    addEventListener: (type, fn) => {
      if (!sheetListeners.has(type)) sheetListeners.set(type, []);
      sheetListeners.get(type).push(fn);
    },
  };
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: doc,
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  app.elSheetContainer = sheet;
  app.elTableBody = { contains: () => false };
  app.getUnderlineTargets = () => [];
  app.getFormattingRange = () => ({ minRow: 0, maxRow: 0, minCol: 8, maxCol: 8 });
  app.getSelectedUnderline = () => ({ value: null, hasUnderline: false });
  app.isEditingCell = () => false;
  app.normalizeColumnColor = c => c;
  app.updateUnderlineIndicator = () => {};
  app.updateTextHighlightIndicator = () => {};

  // First click enters underline brush, second main-button click exits it
  app.toggleUnderline();
  assert.ok(app.underlineBrushStyle);
  assert.ok(app.highlightBrushColor);
  app.toggleUnderline();
  assert.equal(app.underlineBrushStyle, null);
  assert.equal(app.highlightBrushColor, null);

  // Brush never swallows interactive buttons inside sheet and exits on click
  app.initHighlightBrush();
  app.setHighlightBrush('#ffff00');
  const applyButton = { closest: sel => sel.includes('button') ? applyButton : null };
  sheet._contains.add(applyButton);
  let prevented = false, stopped = false;
  for (const fn of sheetListeners.get('mousedown') || []) {
    fn({ type: 'mousedown', target: applyButton, button: 0, preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  }
  assert.equal(prevented, false);
  assert.equal(stopped, false);
  assert.equal(app.highlightBrushColor, null);

  // Clicking outside sheet also exits brush mode
  app.setHighlightBrush('#ffff00');
  const outsideControl = { closest: () => null };
  for (const fn of docListeners.get('mousedown') || []) fn({ target: outsideControl });
  assert.equal(app.highlightBrushColor, null);
});

test('closeForcedCorrectionManager resets inert and column resizing cleans up on window blur', () => {
  const docListeners = new Map();
  const winListeners = new Map();
  const doc = {
    hidden: false,
    body: { style: { cursor: '', userSelect: '' } },
    addEventListener: (type, fn) => {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    querySelectorAll: () => [],
    getElementById: id => id === 'forcedCorrectionModal' ? { style: { display: 'none' } } : null,
  };
  const context = vm.createContext({
    window: {
      addEventListener: (type, fn) => {
        if (!winListeners.has(type)) winListeners.set(type, []);
        winListeners.get(type).push(fn);
      },
      getComputedStyle: () => ({ display: 'table-cell' }),
    },
    document: doc,
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);

  // 1. inert reset even if modal is already non-flex
  app.elPresetManagerModal = { inert: true };
  app.closeForcedCorrectionManager(false);
  assert.equal(app.elPresetManagerModal.inert, false);

  // 2. Column resize cleans up on window blur
  app.getSavedColumnWidths = () => ({ name: 120 });
  app.applySavedColumnWidths = () => {};
  app.syncMainColumnWidths = () => {};
  app.saveColumnWidth = () => {};
  app.initColumnResizing();

  const th = { dataset: { col: 'name' }, style: { width: '120px' }, closest: () => null, getBoundingClientRect: () => ({ width: 120 }) };
  const resizer = {
    classList: { contains: name => name === 'col-resizer', add() {}, remove() {} },
    closest: sel => sel === 'th' ? th : null,
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  for (const fn of docListeners.get('pointerdown') || []) {
    fn({ target: resizer, pointerId: 1, clientX: 100, preventDefault() {}, stopPropagation() {} });
  }
  assert.equal(doc.body.style.cursor, 'col-resize');
  assert.equal(doc.body.style.userSelect, 'none');

  for (const fn of winListeners.get('blur') || []) fn();
  assert.equal(doc.body.style.cursor, '');
  assert.equal(doc.body.style.userSelect, '');

  let movePrevented = false;
  for (const fn of docListeners.get('pointermove') || []) {
    fn({ clientX: 250, pointerType: 'mouse', buttons: 1, preventDefault() { movePrevented = true; } });
  }
  assert.equal(movePrevented, false);
});

test('clinic unlock restores sheet focus and clinic-locked blocks sheet keyboard shortcuts', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const authSource = fs.readFileSync(path.join(__dirname, '..', 'clinic-auth.js'), 'utf8');
  const storage = new Map();
  let restoredWith = null;
  let pwBlurred = false;
  const modal = { style: { display: 'flex' }, contains: el => el === pwInput };
  const pwInput = { value: '1', blur() { pwBlurred = true; }, addEventListener() {}, focus() {}, select() {} };
  const errEl = { style: { display: 'none' } };
  const docClasses = new Set(['clinic-locked']);
  const doc = {
    readyState: 'complete',
    documentElement: {
      classList: {
        add: c => docClasses.add(c),
        remove: c => docClasses.delete(c),
        contains: c => docClasses.has(c),
      },
    },
    getElementById: id => ({ clinicLoginModal: modal, clinicPasswordInput: pwInput, clinicLoginError: errEl }[id] || null),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const win = {
    ptApp: {
      restoreSheetFocusAfterModal(m) { restoredWith = m; },
    },
  };
  const authCtx = vm.createContext({
    window: win,
    document: doc,
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    setTimeout,
  });
  vm.runInContext(authSource, authCtx);

  // While locked, PTApp.handleGlobalKeyDown ignores navigation/deletion shortcuts
  const appCtx = vm.createContext({
    window: { addEventListener() {} },
    document: doc,
    localStorage: { getItem: () => null, setItem() {} },
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', appCtx);
  const app = Object.create(appCtx.App.prototype);
  let cleared = 0;
  app.activeCell = { rowIdx: 0, colKey: 'name' };
  app.clearSelection = () => { cleared++; };
  app.elSheetContainer = { focus() {} };
  app.handleGlobalKeyDown({ key: 'Delete', target: app.elSheetContainer, preventDefault() {}, stopPropagation() {} });
  assert.equal(cleared, 0, 'locked clinic screen must block sheet keyboard mutations');

  // Unlocking blurs password input, hides modal, and restores sheet focus via PTApp
  assert.equal(win.PTClinicAuth.unlock('1'), true);
  assert.equal(pwBlurred, true);
  assert.equal(modal.style.display, 'none');
  assert.equal(docClasses.has('clinic-locked'), false);
  assert.equal(restoredWith, modal);
});

test('modal close restores cell focus instead of td.focus no-op and blocks background keys while open', () => {
  const overlays = [];
  const doc = {
    activeElement: null,
    documentElement: { classList: { contains: () => false } },
    body: { tagName: 'BODY' },
    contains: () => true,
    querySelector: sel => sel === '.excel-cell[data-row="0"][data-col="name"]' ? cell : null,
    querySelectorAll: sel => sel === '.modal-overlay' ? overlays : [],
    getElementById: id => elements[id] || null,
  };
  let selectedArgs = null;
  let editorFocused = 0;
  let sheetFocused = 0;
  const cell = { dataset: { row: '0', col: 'name' }, querySelector: () => null };
  const fcInput = { blur() { doc.activeElement = doc.body; } };
  const fcModal = { style: { display: 'flex' }, contains: el => el === fcModal || el === fcInput };
  const qtInput = { blur() { doc.activeElement = doc.body; } };
  const qtModal = { style: { display: 'flex' }, contains: el => el === qtModal || el === qtInput };
  const elements = { forcedCorrectionModal: fcModal, quickTextEditModal: qtModal };

  const context = vm.createContext({
    window: { addEventListener() {} },
    document: doc,
    localStorage: { getItem: () => null, setItem() {} },
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  app.activeCell = { rowIdx: 0, colKey: 'name' };
  app.elTableBody = { querySelector: sel => sel === '[data-row="0"][data-col="name"]' ? cell : null };
  app.elSheetContainer = { focus() { sheetFocused++; doc.activeElement = app.elSheetContainer; } };
  app.selectCell = (...args) => { selectedArgs = args; };
  app.focusSelectedCellEditor = () => { editorFocused++; };
  app.startInlineEdit = () => {};
  app.cancelSheetPointerInteraction = () => {};

  // 1. While a modal overlay is open, handleGlobalKeyDown does not mutate sheet rows
  overlays.push(fcModal);
  let deleted = 0;
  app.clearSelection = () => { deleted++; };
  app.handleGlobalKeyDown({ key: 'Delete', target: fcModal, preventDefault() {}, stopPropagation() {} });
  assert.equal(deleted, 0);

  // 2. Closing forcedCorrectionModal when previous input detached calls selectCell + focusSelectedCellEditor
  doc.activeElement = fcInput;
  app._forcedCorrectionPreviousFocus = { isConnected: false, dataset: { committed: 'true' }, matches: () => true, focus() { assert.fail('must not focus detached committed input'); } };
  app.elPresetManagerModal = { inert: true, style: { display: 'none' } };
  app.closeForcedCorrectionManager(true);
  assert.equal(fcModal.style.display, 'none');
  assert.equal(app.elPresetManagerModal.inert, false);
  assert.deepEqual(selectedArgs, [0, 'name', cell, false]);
  assert.equal(editorFocused, 1);

  // 3. Closing quickTextEditModal when original cell editor detached restores sheet/editor focus
  overlays.length = 0;
  overlays.push(qtModal);
  doc.activeElement = qtInput;
  app.textEditorState = { input: { isConnected: false } };
  app.closeQuickTextEditDialog();
  assert.equal(qtModal.style.display, 'none');
  assert.equal(editorFocused, 2);
});

test('arrow keys recover when activeCell is null or a committed cell input is stuck, and setDate/IME Escape clean up overlays', () => {
  const docListeners = new Map();
  const doc = {
    activeElement: null,
    documentElement: { classList: { contains: () => false } },
    body: { tagName: 'BODY' },
    addEventListener(type, fn) { (docListeners.get(type) || docListeners.set(type, []).get(type)).push(fn); },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  const sheet = {
    classList: { add() {}, remove() {}, toggle() {} },
    style: { setProperty() {}, removeProperty() {} },
    contains: () => true,
    matches: () => false,
    addEventListener() {},
    focus() { doc.activeElement = sheet; },
  };
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: doc,
    localStorage: { getItem: () => null, setItem() {} },
    clearTimeout,
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  const fallbackCell = { dataset: { row: '0', col: 'no' } };
  let selected = null;
  Object.assign(app, {
    currentDate: '2026-11-19',
    dataStore: { '2026-11-19': [{ no: '1', name: '환자' }] },
    activeCell: null,
    crossDateSelection: null,
    selectedRowRange: null,
    elSheetContainer: sheet,
    elTableBody: { querySelector: sel => sel === '[data-row="0"][data-col="no"]' ? fallbackCell : null },
    selectCell(r, c, el, edit) { selected = { r, c, el, edit }; app.activeCell = { rowIdx: r, colKey: c }; },
    ensureCurrentCellVisible() {},
  });

  // 1. ArrowDown with activeCell === null recovers selection instead of dead keyboard
  app.handleGlobalKeyDown({ key: 'ArrowDown', code: 'ArrowDown', target: sheet, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(selected, { r: 0, c: 'no', el: fallbackCell, edit: false });

  // 2. Detached/committed .cell-input-element target does not trap ArrowRight in handleGlobalKeyDown
  let removed = false;
  const staleInput = {
    tagName: 'INPUT',
    isConnected: true,
    dataset: { committed: 'true' },
    matches: sel => sel === '.cell-input-element',
    remove() { removed = true; this.isConnected = false; },
  };
  const genderCell = { dataset: { row: '0', col: 'gender' } };
  app.elTableBody.querySelector = sel => sel === '[data-row="0"][data-col="gender"]' ? genderCell : fallbackCell;
  app.handleGlobalKeyDown({ key: 'ArrowRight', code: 'ArrowRight', target: staleInput, preventDefault() {}, stopPropagation() {} });
  assert.equal(removed, true);
  assert.deepEqual(app.activeCell, { rowIdx: 0, colKey: 'gender' });

  // 3. Highlight brush exits on Korean IME Escape (Process + code Escape / keyCode 27)
  app.initHighlightBrush();
  app.highlightBrushColor = '#ffff00';
  for (const fn of docListeners.get('keydown') || []) {
    fn({ key: 'Process', code: 'Escape', keyCode: 27, preventDefault() {}, stopImmediatePropagation() {} });
  }
  assert.equal(app.highlightBrushColor, null);

  // 4. setDate cleans up open searchNotFoundModal, gender picker, brush, and pointer drag
  let notFoundClosed = false, genderClosed = false, pointerCancelled = false, brushCleared = false;
  app.elSearchNotFoundModal = { style: { display: 'flex' } };
  app.elSearchPromptModal = { style: { display: 'none' } };
  app.elDatePicker = { value: '' };
  app.elDateLabel = { textContent: '' };
  app.elSidebarDateTag = { textContent: '' };
  app.elSheetTabTitle = { textContent: '' };
  app.highlightBrushColor = '#ffff00';
  app.setHighlightBrush = c => { if (c === null) brushCleared = true; };
  app.closeSearchNotFoundModal = () => { notFoundClosed = true; };
  app.closeGenderDropdown = () => { genderClosed = true; };
  app.cancelSheetPointerInteraction = () => { pointerCancelled = true; };
  for (const fn of ['closeAutocompleteMenu', 'hideContextMenu', 'closeFontColorMenu', 'closeDateCalendar', 'clearHeaderSelections', 'refreshCalendarHolidayAppearance', 'loadCalendarHolidays', 'renderTable', 'updateHistoryButtons', 'updateSidebarStats', 'focusDateEntryCell']) {
    app[fn] = () => {};
  }
  app.setDate('2026-11-20');
  assert.equal(notFoundClosed, true);
  assert.equal(genderClosed, true);
  assert.equal(pointerCancelled, true);
  assert.equal(brushCleared, true);
});

test('live cell editor clears stuck composing state when compositionend was omitted by OS IME and allows Arrow/Enter exit', () => {
  const doc = { activeElement: null, hasFocus: () => true, querySelectorAll: () => [], getElementById: () => null };
  doc.body = makeElement('body', doc);
  doc.body.isConnected = true;
  doc.createElement = tag => makeElement(tag, doc);

  const context = vm.createContext({
    window: { addEventListener() {} },
    document: doc,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0,
    clearTimeout() {},
    Date,
    Event: class Event { constructor(type) { this.type = type; } },
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  const rows = [{ name: '', part: '' }, { name: '', part: '' }];
  const sheet = makeElement('div', doc);
  sheet.isConnected = true;
  const cells = {
    '0:name': makeElement('td', doc),
    '1:name': makeElement('td', doc),
    '0:part': makeElement('td', doc),
  };
  for (const [key, cell] of Object.entries(cells)) {
    const [r, c] = key.split(':');
    cell.dataset = { row: r, col: c };
    sheet.appendChild(cell);
  }
  sheet.querySelector = sel => {
    const m = sel.match(/\[data-row="(\d+)"\]\[data-col="(\w+)"\]/);
    return m ? cells[`${m[1]}:${m[2]}`] || null : null;
  };

  let selected = null;
  Object.assign(app, {
    currentDate: '2026-11-25',
    dataStore: { '2026-11-25': rows },
    activeCell: { rowIdx: 0, colKey: 'name' },
    elTableBody: sheet,
    elSheetContainer: sheet,
    elFormulaInput: { value: '' },
    getCurrentRows: () => rows,
    usesNativeCellInput: () => true,
    getCellInputLanguage: () => 'kor',
    isKoreanPreferredColumn: () => true,
    isCellAutocompleteEnabled: () => false,
    isAutocompleteOpen: () => false,
    initMemoInput() {},
    closeAutocompleteMenu() {},
    loadSearchHistory: async () => {},
    saveDataStore() {},
    debounceSaveDataStore() {},
    applyCellFormatting() {},
    renderColoredText(el, r, k) { el.textContent = r[k] || ''; },
    getEffectiveCellRichText: () => null,
    normalizeCellEditorValue: (_i, v) => v,
    assembleCellEditorText: (_i, v) => v,
    endNativeCellEditing(inp) { inp.dataset.composing = 'false'; inp.dataset.nativeComposing = 'false'; },
    applyCompoundPatientInput: () => false,
    applyAutocompleteColor() {},
    refreshNewPatientRows() {},
    getCellEditorValue: inp => inp.value,
    isHangulToggleKeyEvent: () => false,
    toggleCellInputLanguage: () => false,
    clearKoreanKeyBuffer() {},
    releaseNavigationInputGuard() {},
    blockInheritedNavigationInput: () => false,
    handleClipboardArrowHandoff: () => false,
    handleForcedCorrectionDelete: () => false,
    handleForcedCorrectionShortcut: () => false,
    handleCellRowSelectShortcut: () => false,
    handleHistoryShortcut: () => false,
    handleRowDeleteShortcut: () => false,
    rememberPatientSearchDraft() {},
    updateForcedCorrection() {},
    refreshNativeLanguagePreview() {},
    isSearchShortcut: () => false,
    selectCell(r, c, el, edit) { selected = { r, c, el, edit }; app.activeCell = { rowIdx: r, colKey: c }; },
    focusSelectedCellEditor() {},
  });

  app.startInlineEdit(0, 'name', cells['0:name'], false);
  const input = cells['0:name'].querySelector('input');
  assert.ok(input);
  // Start Korean composition, type syllable, then OS omits compositionend before user presses ArrowDown
  input.dispatchEvent({ type: 'compositionstart' });
  input.value = '신';
  input.setSelectionRange(1, 1);
  input.dispatchEvent({ type: 'input', inputType: 'insertCompositionText', isComposing: true, data: '신' });
  assert.equal(input.dataset.composing, 'true');
  assert.equal(input.dataset.nativeComposing, 'true');

  const arrowEv = input.dispatchEvent({ type: 'keydown', key: 'ArrowDown', code: 'ArrowDown', isComposing: false, keyCode: 40 });
  assert.equal(arrowEv.defaultPrevented, true, 'ArrowDown must not be swallowed by stale composing state');
  assert.equal(rows[0].name, '신', 'typed syllable committed cleanly');
  assert.deepEqual(selected, { r: 1, c: 'name', el: cells['1:name'], edit: false });
  assert.equal(app.isEditingCell(), false);
});

test('hidden modal input retaining focus, search load failure, and bounded search prompt guard never brick keyboard navigation', async () => {
  const doc = {
    activeElement: null,
    documentElement: { classList: { contains: () => false } },
    body: { tagName: 'BODY' },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: doc,
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 0,
    clearTimeout() {},
    Date,
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);

  const sheet = { focus() { doc.activeElement = sheet; }, classList: { remove() {} } };
  const promptModal = {
    style: { display: 'flex' },
    contains: el => el === promptInput,
    querySelector: () => null,
  };
  let promptBlurred = false;
  const promptInput = {
    tagName: 'INPUT',
    isConnected: true,
    value: '12345',
    dataset: {},
    style: {},
    matches: () => false,
    closest: sel => sel === '.modal-overlay' ? promptModal : null,
    blur() { promptBlurred = true; if (doc.activeElement === promptInput) doc.activeElement = doc.body; },
    focus() { doc.activeElement = promptInput; },
    select() {},
    setSelectionRange() {},
  };
  const cell0 = { dataset: { row: '0', col: 'no' }, querySelector: () => null };
  const cell1 = { dataset: { row: '0', col: 'gender' }, querySelector: () => null };
  let selected = null;
  let restoredModal = null;

  Object.assign(app, {
    currentDate: '2026-11-25',
    dataStore: { '2026-11-25': [{ no: '1', chartNo: '12345' }] },
    activeCell: { rowIdx: 0, colKey: 'no' },
    elSheetContainer: sheet,
    elSearchPromptModal: promptModal,
    elSearchPromptInput: promptInput,
    elTableBody: {
      querySelector: sel => sel === '[data-row="0"][data-col="gender"]' ? cell1 : cell0,
    },
    getCurrentRows: () => app.dataStore['2026-11-25'],
    selectCell(r, c, el, edit) { selected = { r, c, el, edit }; app.activeCell = { rowIdx: r, colKey: c }; },
    ensureCurrentCellVisible() {},
  });

  // 1. openSearchPromptModal bounds navigationInputGuard with navigationInputGuardUntil
  app.openSearchPromptModal(0, '12345');
  assert.equal(promptInput.dataset.navigationInputGuard, 'true');
  assert.ok(Number(promptInput.dataset.navigationInputGuardUntil) > Date.now(), 'search prompt guard must expire automatically');

  // 2. closeSearchPromptModal({ restoreFocus: false }) still blurs promptInput so hidden modal never keeps activeElement
  promptBlurred = false;
  doc.activeElement = promptInput;
  app.closeSearchPromptModal({ restoreFocus: false });
  assert.equal(promptModal.style.display, 'none');
  assert.equal(promptBlurred, true);

  // 3. Even if a browser dispatches keydown with target = input inside a hidden modal, handleGlobalKeyDown recovers and navigates
  promptBlurred = false;
  doc.activeElement = promptInput;
  app.handleGlobalKeyDown({ key: 'ArrowRight', code: 'ArrowRight', target: promptInput, preventDefault() {}, stopPropagation() {} });
  assert.equal(promptBlurred, true);
  assert.deepEqual(selected, { r: 0, c: 'gender', el: cell1, edit: false });

  // 4. Async searchPatientHistory network/cloud error restores focus instead of stranding keyboard
  app.supabaseClient = {};
  app.searchHistoryLoadError = new Error('network');
  app.preparePatientHistorySearch = async () => ({ searchStore: {}, exists: false });
  app.showSaveIndicator = () => {};
  app.restoreSheetFocusAfterModal = m => { restoredModal = m; };
  const ok = await app.searchPatientHistory('12345', 0);
  assert.equal(ok, false);
  assert.equal(restoredModal, promptModal);
});

test('active Korean IME composition (Process/229) allows ArrowUp/Down/Right/Tab cell exit without leaking text or losing focus, and blocks IME replay', () => {
  const doc = { activeElement: null, hasFocus: () => true, querySelectorAll: () => [], getElementById: () => null };
  doc.body = makeElement('body', doc);
  doc.body.isConnected = true;
  doc.createElement = tag => makeElement(tag, doc);

  const context = vm.createContext({
    window: { addEventListener() {} },
    document: doc,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout: () => 0,
    clearTimeout() {},
    Date,
    Event: class Event { constructor(type) { this.type = type; } },
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  const rows = [
    { no: '', gender: '', chartNo: '', name: '', part: '', memo: '' },
    { no: '', gender: '', chartNo: '', name: '', part: '', memo: '' },
  ];
  const sheet = makeElement('div', doc);
  sheet.isConnected = true;
  const cells = {};
  for (const r of [0, 1]) {
    for (const c of ['name', 'part', 'memo']) {
      const td = makeElement('td', doc);
      td.dataset = { row: String(r), col: c };
      sheet.appendChild(td);
      cells[`${r}:${c}`] = td;
    }
  }
  sheet.querySelector = sel => {
    const m = sel.match(/\[data-row="(\d+)"\]\[data-col="(\w+)"\]( input)?/);
    if (!m) return null;
    const cell = cells[`${m[1]}:${m[2]}`] || null;
    return m[3] ? cell?.querySelector('input') || null : cell;
  };

  const selections = [];
  let navigatedCols = [];
  Object.assign(app, {
    currentDate: '2026-11-26',
    dataStore: { '2026-11-26': rows },
    activeCell: { rowIdx: 0, colKey: 'name' },
    elTableBody: sheet,
    elSheetContainer: sheet,
    elFormulaInput: { value: '' },
    getCurrentRows: () => rows,
    usesNativeCellInput: () => true,
    getCellInputLanguage: () => 'kor',
    isKoreanPreferredColumn: () => true,
    isCellAutocompleteEnabled: col => col !== 'name',
    isAutocompleteOpen: () => false,
    initMemoInput() {},
    closeAutocompleteMenu() {},
    loadSearchHistory: async () => {},
    saveDataStore() {},
    debounceSaveDataStore() {},
    applyCellFormatting() {},
    renderColoredText(el, r, k) { el.textContent = r[k] || ''; },
    getEffectiveCellRichText: () => null,
    normalizeCellEditorValue: (_i, v) => v,
    assembleCellEditorText: (_i, v) => v,
    endNativeCellEditing(inp) { inp.blur?.(); inp.dataset.composing = 'false'; inp.dataset.nativeComposing = 'false'; },
    applyCompoundPatientInput: () => false,
    applyAutocompleteColor() {},
    refreshNewPatientRows() {},
    getCellEditorValue: inp => inp.value,
    isHangulToggleKeyEvent: () => false,
    toggleCellInputLanguage: () => false,
    clearKoreanKeyBuffer() {},
    handleClipboardArrowHandoff: () => false,
    handleForcedCorrectionDelete: () => false,
    handleForcedCorrectionShortcut: () => false,
    handleCellRowSelectShortcut: () => false,
    handleHistoryShortcut: () => false,
    handleRowDeleteShortcut: () => false,
    rememberPatientSearchDraft() {},
    updateForcedCorrection() {},
    refreshNativeLanguagePreview() {},
    isSearchShortcut: () => false,
    navigateCol(r, col, dir) { navigatedCols.push({ r, col, dir }); },
    selectCell(r, c, el, edit) {
      selections.push({ r, c, edit });
      app.activeCell = { rowIdx: r, colKey: c };
      app.startInlineEdit(r, c, el, !edit);
    },
  });

  // 1. ArrowDown during active Korean IME composition (Process/229) commits '신' and moves to row 1 without double-jumping on IME replay
  app.startInlineEdit(0, 'name', cells['0:name'], false);
  const nameInput = cells['0:name'].querySelector('input');
  nameInput.dispatchEvent({ type: 'compositionstart' });
  nameInput.value = '신';
  nameInput.setSelectionRange(1, 1);
  nameInput.dispatchEvent({ type: 'input', inputType: 'insertCompositionText', isComposing: true, data: '신' });
  const downEv = nameInput.dispatchEvent({ type: 'keydown', key: 'Process', code: 'ArrowDown', isComposing: true, keyCode: 229 });
  assert.equal(downEv.defaultPrevented, true);
  assert.equal(rows[0].name, '신');
  assert.deepEqual(selections.at(-1), { r: 1, c: 'name', edit: false });
  const destInput = cells['1:name'].querySelector('input');
  assert.equal(destInput.dataset.navigationInputGuard, 'true', 'destination cell guarded against inherited IME syllable');
  // Replayed Process/229 ArrowDown from OS IME is consumed
  const replayDown = destInput.dispatchEvent({ type: 'keydown', key: 'Process', code: 'ArrowDown', isComposing: true, keyCode: 229 });
  assert.equal(replayDown.defaultPrevented, true);
  assert.equal(selections.length, 1, 'IME replay must not jump a second row');

  // 2. ArrowRight at caret end during active Korean IME composition commits '허리' and moves right
  app.startInlineEdit(0, 'part', cells['0:part'], false);
  const partInput = cells['0:part'].querySelector('input');
  partInput.dispatchEvent({ type: 'compositionstart' });
  partInput.value = '허리';
  partInput.setSelectionRange(2, 2);
  partInput.dispatchEvent({ type: 'input', inputType: 'insertCompositionText', isComposing: true, data: '허리' });
  const rightEv = partInput.dispatchEvent({ type: 'keydown', key: 'Process', code: 'ArrowRight', isComposing: true, keyCode: 229 });
  assert.equal(rightEv.defaultPrevented, true);
  assert.equal(rows[0].part, '허리');

  // 3. Tab during active Korean IME composition calls preventDefault (never leaks focus to toolbar) and navigates column
  app.startInlineEdit(0, 'memo', cells['0:memo'], false);
  const memoInput = cells['0:memo'].querySelector('input');
  memoInput.dispatchEvent({ type: 'compositionstart' });
  memoInput.value = '충완';
  memoInput.setSelectionRange(2, 2);
  memoInput.dispatchEvent({ type: 'input', inputType: 'insertCompositionText', isComposing: true, data: '충완' });
  const tabEv = memoInput.dispatchEvent({ type: 'keydown', key: 'Process', code: 'Tab', isComposing: true, keyCode: 229 });
  assert.equal(tabEv.defaultPrevented, true, 'Tab must prevent browser focus escape');
  assert.equal(rows[0].memo, '충완');
  assert.deepEqual(navigatedCols, [{ r: 0, col: 'memo', dir: 1 }]);
});

test('self-echoed clinic schedule count realtime updates and unchanged disk snapshots are skipped, while concurrent push edits schedule follow-up sync', async () => {
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { activeElement: null, getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout,
    clearTimeout,
    Date,
  });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);

  // 1. Self-echoed postgres_changes matching cloudRecordVersions does not trigger redundant pullFromCloud
  const client = {};
  let pulls = 0;
  app.supabaseClient = client;
  app.currentDate = '2026-11-26';
  app.pendingSyncDates = new Set();
  app.cloudRecordVersions = new Map([['2026-11-26', { client, version: '2026-11-26T02:00:00.000Z', snapshot: '[]' }]]);
  app.isCellInteractionActive = () => false;
  app.pullFromCloud = async () => { pulls++; };

  app.handleRealtimeCloudChange('2026-11-26', '2026-11-26T02:00:00.000Z');
  assert.equal(pulls, 0, 'own echoed postgres_changes update must not re-pull full daily rows');

  app.handleRealtimeCloudChange('2026-11-26', '2026-11-26T02:01:00.000Z');
  assert.equal(pulls, 1, 'newer remote revision must still trigger pullFromCloud');

  // 2. Deduplicated persistDataStore / persistSyncBaselines skip redundant IndexedDB writes for identical verified snapshots
  const disk = new Map();
  let diskWrites = 0;
  const app2 = Object.create(context.App.prototype);
  app2._recordsOnDisk = true;
  app2._baselinesOnDisk = true;
  app2.syncStateDisk = async (key, value) => {
    if (value !== undefined) { diskWrites++; disk.set(key, value); }
    return disk.get(key);
  };
  const records = { '2026-11-26': [{ name: '김환자' }] };
  await app2.persistDataStore(records);
  await app2.persistDataStore(records);
  assert.equal(diskWrites, 1, 'identical already-verified records snapshot skips redundant disk transaction');
  records['2026-11-26'][0].memo = '추가';
  await app2.persistDataStore(records);
  assert.equal(diskWrites, 2, 'modified records snapshot persists immediately');

  // 3. Closed summary sidebar in month/year mode updates header count without scanning historical dates until opened
  let scannedDates = 0;
  const headerCount = { textContent: '' };
  const closedSidebar = { classList: { contains: cls => cls === 'summary-closed', toggle() {} }, setAttribute() {} };
  const summaryDoc = {
    documentElement: { classList: { toggle() {} } },
    getElementById: id => id === 'summarySidebar' ? closedSidebar : id === 'headerTotalCount' ? headerCount : null,
    querySelector: () => null,
  };
  const summaryCtx = vm.createContext({ window: { addEventListener() {} }, document: summaryDoc, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(source + '\nglobalThis.App = PTApp;', summaryCtx);
  const app3 = Object.create(summaryCtx.App.prototype);
  app3.summaryPeriod = 'month';
  app3.currentDate = '2026-11-26';
  app3.getDailySummary = () => ({ total: 17 });
  app3.getSummaryDates = () => { scannedDates++; return []; };
  app3.renderSummaryAnalytics = () => {};
  app3.renderWriterSummaryList = () => {};
  app3.renderSummaryList = () => {};
  app3.appendSummaryAverages = () => {};
  app3.updateSidebarStats();
  assert.equal(headerCount.textContent, '17');
  assert.equal(scannedDates, 0, 'closed sidebar must not scan multi-date history on every cell save');
});



