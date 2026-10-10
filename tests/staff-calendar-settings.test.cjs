const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function fixture(record, conflict = false) {
  const context = vm.createContext({ Date, Intl, AbortController, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../staff-calendar-settings.js'), 'utf8') + '\nglobalThis.Settings = PTStaffCalendarSettings;', context);
  const app = new context.Settings();
  const writes = [], changes = [];
  app.getStaffCountToday = () => '2026-10-10';
  app.notifyCloudChange = date => changes.push(date);
  app.supabaseClient = { from(table) {
    let mode = 'read', payload;
    const chain = {
      select() { return chain; }, eq(key, date) { assert.equal(date, '__pt_staff_calendar_count_settings_v1__'); return chain; },
      maybeSingle() { return chain; }, abortSignal() { return chain; },
      insert(value) { mode = 'insert'; payload = value; return chain; },
      upsert(value) { mode = 'upsert'; payload = value; return chain; },
      then(resolve, reject) {
        if (mode === 'read') return Promise.resolve({ data: record, error: null }).then(resolve, reject);
        writes.push({ table, mode, payload });
        if (mode === 'insert' && conflict) {
          record = { rows_data: [{ staffCalendarCounts: { scope: 'from', startDate: '2026-01-01' } }] };
          return Promise.resolve({ error: { code: '23505' } }).then(resolve, reject);
        }
        record = payload;
        return Promise.resolve({ error: null }).then(resolve, reject);
      },
    };
    return chain;
  } };
  return { app, writes, changes };
}

test('first connection inserts today once and keeps the original start date thereafter', async () => {
  const { app, writes } = fixture(null);
  await Promise.all([app.syncStaffCountSettings(), app.syncStaffCountSettings()]);
  app.getStaffCountToday = () => '2026-10-11';
  await app.syncStaffCountSettings();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].mode, 'insert');
  assert.equal(app.staffCountSettings.startDate, '2026-10-10');
});

test('concurrent device initialization preserves the winning shared scope', async () => {
  const { app, writes } = fixture(null, true);
  const settings = await app.syncStaffCountSettings();
  assert.equal(settings.scope, 'from');
  assert.equal(settings.startDate, '2026-01-01');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].mode, 'insert');
});

test('explicit scope saves write only the reserved settings row and broadcast changes', async () => {
  const { app, writes, changes } = fixture({ rows_data: [{ staffCalendarCounts: { scope: 'all' } }] });
  assert.equal(await app.saveStaffCountSettings({ scope: 'from', startDate: '2026-02-30' }), false);
  assert.equal(writes.length, 0);
  assert.equal(await app.saveStaffCountSettings({ scope: 'from', startDate: '2026-09-01' }), true);
  assert.equal(await app.saveStaffCountSettings({ scope: 'all' }), true);
  assert.equal(writes.length, 2);
  for (const { table, payload } of writes) {
    assert.equal(table, 'pt_daily_records');
    assert.equal(payload.date, '__pt_staff_calendar_count_settings_v1__');
    assert.equal(payload.total_count, 0);
    assert.equal(payload.rows_data.length, 1);
  }
  assert.equal(changes.length, 2);
});

test('read failures never seed or overwrite existing shared settings', async () => {
  const { app, writes } = fixture(null);
  app.supabaseClient.from = () => { throw new Error('offline'); };
  assert.equal(await app.syncStaffCountSettings(), null);
  assert.equal(writes.length, 0);
  assert.equal(app.staffCountSettings, undefined);
});

test('legacy scopes stay enabled and disabled scopes survive refresh and re-enabling', async () => {
  for (const scope of ['today', 'all', 'from']) {
    const value = { scope, startDate: scope === 'all' ? null : '2026-09-01' };
    const { app, writes } = fixture({ rows_data: [{ staffCalendarCounts: value }] });
    assert.equal((await app.syncStaffCountSettings()).enabled, true);
    assert.equal(writes.length, 0);
    assert.equal(await app.saveStaffCountSettings({ ...value, enabled: false }), true);
    const disabled = await app.syncStaffCountSettings();
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.scope, scope);
    assert.equal(disabled.startDate, value.startDate);
    assert.equal(await app.saveStaffCountSettings({ ...disabled, enabled: true }), true);
    const restored = await app.syncStaffCountSettings();
    assert.equal(restored.enabled, true);
    assert.equal(restored.startDate, value.startDate);
    assert.equal(restored.scope, scope);
    assert.equal(writes.length, 2);
  }
});
