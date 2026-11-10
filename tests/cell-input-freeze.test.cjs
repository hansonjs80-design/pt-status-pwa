const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('./helpers/load-app-source.cjs');

test('cell input guard auto-releases on timeout or valid typing key, but blocks inherited IME Process key', () => {
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { activeElement: null },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout, clearTimeout, Date
  });
  vm.runInContext(source + '\nglobalThis.Tools = PTCellInputTools;', context);
  const tools = new context.Tools();

  const mockInput = {
    dataset: {
      navigationInputGuard: 'true',
      navigationInputGuardUntil: String(Date.now() - 10) // already expired
    },
    value: '김철수',
    classList: { contains: () => false }
  };

  const mockEvent = {
    inputType: 'insertCompositionText',
    cancelable: true,
    preventDefault: () => { mockEvent.defaultPrevented = true; }
  };

  // 1. Expired guard should not block input
  const blocked = tools.blockInheritedNavigationInput(mockInput, mockEvent, '김철수');
  assert.equal(blocked, false, 'Expired guard must return false and not block input');
  assert.equal(mockInput.dataset.navigationInputGuard, undefined);

  // 2. Active guard with Process (IME residual) key should NOT release guard
  mockInput.dataset.navigationInputGuard = 'true';
  mockInput.dataset.navigationInputGuardUntil = String(Date.now() + 5000);
  tools.releaseNavigationInputGuard(mockInput, { key: 'Process', keyCode: 229, code: '' });
  assert.equal(mockInput.dataset.navigationInputGuard, 'true', 'IME Process key must NOT release guard (prevents copying to adjacent cell)');

  // 3. Fresh guard with regular typing key release
  tools.releaseNavigationInputGuard(mockInput, { key: 'a', code: 'KeyA' });
  assert.equal(mockInput.dataset.navigationInputGuard, undefined, 'Letter key must release navigation guard');
});
