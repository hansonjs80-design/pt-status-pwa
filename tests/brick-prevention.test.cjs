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
