const test = require('node:test');
const assert = require('node:assert/strict');

test('PTClinicAuth: default password is "1" and unlocks correctly', () => {
  const store = {};
  const mockLocalStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };

  global.localStorage = mockLocalStorage;
  global.document = {
    documentElement: {
      classList: {
        classes: new Set(['clinic-locked']),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); }
      }
    },
    getElementById: () => null
  };
  global.window = {
    localStorage: mockLocalStorage,
    ptApp: null
  };

  delete require.cache[require.resolve('../clinic-auth.js')];
  const PTClinicAuth = require('../clinic-auth.js');

  // Initial state should be locked
  assert.equal(PTClinicAuth.isUnlocked(), false);
  assert.equal(PTClinicAuth.getPassword(), '1');

  // Wrong password fails
  const failResult = PTClinicAuth.unlock('wrong-password');
  assert.equal(failResult, false);
  assert.equal(PTClinicAuth.isUnlocked(), false);
  assert.equal(document.documentElement.classList.contains('clinic-locked'), true);

  // Correct password '1' succeeds
  const successResult = PTClinicAuth.unlock('1');
  assert.equal(successResult, true);
  assert.equal(PTClinicAuth.isUnlocked(), true);
  assert.equal(document.documentElement.classList.contains('clinic-locked'), false);
  assert.equal(mockLocalStorage.getItem(PTClinicAuth.AUTH_STORAGE_KEY), 'unlocked');

  // Lock function locks app again
  PTClinicAuth.lock();
  assert.equal(PTClinicAuth.isUnlocked(), false);
  assert.equal(document.documentElement.classList.contains('clinic-locked'), true);
  assert.equal(mockLocalStorage.getItem(PTClinicAuth.AUTH_STORAGE_KEY), null);

  // Changing password
  PTClinicAuth.setPassword('2026');
  assert.equal(PTClinicAuth.getPassword(), '2026');
  assert.equal(PTClinicAuth.unlock('1'), false);
  assert.equal(PTClinicAuth.unlock('2026'), true);
  assert.equal(PTClinicAuth.isUnlocked(), true);
});

