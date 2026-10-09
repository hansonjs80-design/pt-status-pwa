const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
function setup() {
  let pending, opened = 0;
  const listeners = new Map();
  const context = vm.createContext({ window: { addEventListener() {} }, localStorage: { getItem() { return null; } }, setTimeout(fn) { pending = fn; return 1; }, clearTimeout() { pending = null; } });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
  const app = Object.create(context.App.prototype);
  app.elSheetContainer = { addEventListener(type, callback) { listeners.set(type, callback); } };
  const cell = { isConnected: true, closest() { return null; } };
  const target = { closest(selector) { return selector === '.excel-cell' ? cell : null; } };
  app.handleTableContextMenu = event => { opened++; assert.equal(event.target, cell); assert.equal(event.clientX, 50); };
  app.initCellLongPressMenu();
  return { listeners, target, cell, fire() { pending?.(); }, get opened() { return opened; } };
}
const start = target => ({ target, touches: [{clientX: 50, clientY: 60}] });
test('stationary cell long press opens the existing context menu and suppresses the release click', () => {
  const s = setup();s.listeners.get('touchstart')(start(s.target));s.fire();assert.equal(s.opened,1);
  let prevented=false,stopped=false;
  s.listeners.get('touchend')({preventDefault(){prevented=true;}});assert.equal(prevented,true);
  s.listeners.get('click')({preventDefault(){},stopImmediatePropagation(){stopped=true;}});assert.equal(stopped,true);
});
test('short tap, movement, scrolling, cancellation and multiple fingers cancel long press', () => {
  for (const kind of ['tap','move','scroll','cancel','multi']) {
    const s=setup();s.listeners.get('touchstart')(start(s.target));
    if(kind==='tap')s.listeners.get('touchend')({preventDefault(){throw Error('short tap blocked');}});
    if(kind==='move')s.listeners.get('touchmove')({touches:[{clientX:65,clientY:60}]});
    if(kind==='scroll')s.listeners.get('scroll')();
    if(kind==='cancel')s.listeners.get('touchcancel')();
    if(kind==='multi')s.listeners.get('touchstart')({target:s.target,touches:[{},{}]});
    s.fire();assert.equal(s.opened,0,kind);
  }
});
test('active text editors retain native selection and disconnected cells cannot open a menu', () => {
  const s=setup();const target={closest(selector){return selector==='.excel-cell'?s.cell:selector==='input:not(.is-armed), textarea'?{}:null;}};
  s.listeners.get('touchstart')(start(target));s.fire();assert.equal(s.opened,0);
  s.listeners.get('touchstart')(start(s.target));s.cell.isConnected=false;s.fire();assert.equal(s.opened,0);
});
