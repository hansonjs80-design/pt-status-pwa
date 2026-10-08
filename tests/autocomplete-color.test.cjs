const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function createApp(dataStore = {}, presets = {}, environment = {}) {
  const storage = new Map();
  const context = vm.createContext({
    window: { addEventListener() {} }, confirm: () => true,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    ...environment,
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') +
    '\nglobalThis.App = PTApp; globalThis.setPresets = v => COLUMN_PRESETS = v; globalThis.getPresets = () => COLUMN_PRESETS;', context);
  context.setPresets(presets);
  const app = Object.create(context.App.prototype);
  Object.assign(app, { dataStore, currentDate: '2026-10-08', cloudSearchHistory: {} });
  app.renderPresetManagerList = app.renderQuickChips = app.renderColumnHiddenPresets = app.showSaveIndicator = () => {};
  return { app, storage, context };
}

test('autocomplete carries historical color without letting the live input become its own source', () => {
  const target = { memo: '충 완료', _textColors: { memo: '#000000', name: '#00ff00' } };
  const source = { memo: '충 완료', _textColors: { memo: '#ff0000' }, _formatRevisions: { memo: { color: 'column' } } };
  const { app } = createApp({ '2026-10-08': [target], '2025-09-09': [source] });
  app.columnFormatting = { memo: { color: { value: '#0000ff', revision: 'column' } } };
  const defaults = JSON.stringify(app.columnFormatting), oldRecord = JSON.stringify(source);
  app.applyAutocompleteColor(target, 'memo', '충 완료', '충');
  assert.equal(app.getCellFormatting(target, 'memo', 'color'), '#ff0000');
  assert.equal(target._textColors.name, '#00ff00');
  assert.equal(JSON.stringify(source), oldRecord);
  assert.equal(JSON.stringify(app.columnFormatting), defaults);
});

test('detail color overrides the general candidate and explicit default uses the column default', () => {
  const { app, storage } = createApp({ '2025-09-09': [{ memo: '충 완료', _textColors: { memo: '#ff0000' } }] });
  const key = app.getAutocompleteRuleKey('memo', '충');
  app.setAutocompleteValueColor('memo', '충 완료', '#00ff00');
  app.setAutocompleteValueColor(key, '충 완료', '#9900ff');
  assert.equal(app.getAutocompleteValueColor('memo', '충 완료', '충'), '#9900ff');
  assert.equal(app.getAutocompleteValueColor('memo', '충 완료', '충 완'), '#00ff00');
  app.setAutocompleteValueColor(key, '충 완료', null);
  app.columnFormatting = { memo: { color: { value: '#0000ff', revision: 'default' } } };
  const target = { memo: '충 완료', _textColors: { memo: '#ff0000' } };
  app.applyAutocompleteColor(target, 'memo', '충 완료', '충');
  assert.equal(app.getCellFormatting(target, 'memo', 'color'), '#0000ff');
  const saved = JSON.parse(storage.get('PT_APP_CUSTOM_PRESETS_V1'));
  assert.ok(Object.values(saved).every(items => Array.isArray(items) && items.every(value => typeof value === 'string')));
  const reloaded = createApp({}, saved).app;
  assert.equal(reloaded.getAutocompleteValueColor('memo', '충 완료', '충 완'), '#00ff00');
  assert.equal(reloaded.getAutocompleteValueColor('memo', '충 완료', '충'), null);
});

test('latest matching history and current column revisions determine inferred candidate color', () => {
  const { app } = createApp({
    '2026-10-07': [{ memo: '기록' }],
    '2026-10-06': [{ memo: '기록', _textColors: { memo: '#ff0000' } }],
  });
  assert.equal(app.getAutocompleteValueColor('memo', '기록'), null);
  app.columnFormatting = { memo: { color: { value: '#00ff00', revision: 'new' } } };
  assert.equal(app.getAutocompleteValueColor('memo', '기록'), '#00ff00');
  app.cloudSearchHistory = { '2026-10-08': [{ part: '목', _richText: { part: { text: '목', colors: ['#ff0000'] } } }] };
  assert.equal(app.getAutocompleteValueColor('part', '목'), '#ff0000');
});

test('new detail items save their color and editing changes only that candidate, with cancel leaving it intact', async () => {
  const checked = { checked: true }, picker = { value: '#ff0000' };
  const { app, context } = createApp({ '2025-09-09': [{ memo: '충 완료' }] }, { memo: ['충 완료'] }, {
    document: { getElementById: id => id === 'managerNewPresetColorEnabled' ? checked : picker },
  });
  const key = app.getAutocompleteRuleKey('memo', '충');
  app.activePresetTab = 'memo';
  app.autocompleteManagerContext = { colKey: 'memo', query: '충', key, items: ['충 완료'], hidden: [] };
  app.elManagerNewPresetInput = { value: '충 대기', focus() {} };
  app.addPresetFromManager();
  assert.equal(app.getAutocompleteValueColor('memo', '충 대기', '충'), '#ff0000');
  app.openPresetTextColorEditor = async () => ({ value: '충 치료 대기', color: '#0000ff' });
  await app.editPresetAt('memo', 1);
  assert.deepEqual(Array.from(context.getPresets()[key]), ['충 완료', '충 치료 대기']);
  assert.equal(app.getAutocompleteValueColor('memo', '충 치료 대기', '충'), '#0000ff');
  assert.equal(context.getPresets()[app.getAutocompleteColorKey(key, '충 대기')], undefined);
  assert.equal(app.dataStore['2025-09-09'][0].memo, '충 완료');
  assert.deepEqual(Array.from(context.getPresets().memo), ['충 완료']);
  const saved = JSON.stringify(context.getPresets());
  app.openPresetTextColorEditor = async () => null;
  await app.editPresetAt('memo', 1);
  assert.equal(JSON.stringify(context.getPresets()), saved);
  app.autocompleteManagerContext.items.push('충 치료 대기');
  app.deletePresetAt('memo', 1);
  assert.equal(app.getAutocompleteValueColor('memo', '충 치료 대기', '충'), '#0000ff');
  app.deletePresetAt('memo', 1);
  assert.equal(context.getPresets()[app.getAutocompleteColorKey(key, '충 치료 대기')], undefined);
});

test('restoring one detail list clears only its colors and restoring general presets preserves other detail colors', () => {
  const { app, context } = createApp({}, { memo: ['충 완료'] });
  const key = app.getAutocompleteRuleKey('memo', '충');
  const other = app.getAutocompleteRuleKey('memo', '충:대기');
  app.setAutocompleteValueColor(key, '충 완료', '#ff0000');
  app.setAutocompleteValueColor(other, '충 대기', '#0000ff');
  app.setAutocompleteValueColor('memo', '충 완료', '#00ff00');
  app.autocompleteManagerContext = { colKey: 'memo', query: '충', key, items: ['충 완료'] };
  app.resetPresetsFromManager();
  assert.equal(app.getAutocompleteValueColor('memo', '충 완료', '충'), '#00ff00');
  assert.equal(app.getAutocompleteValueColor('memo', '충 대기', '충:대기'), '#0000ff');
  app.autocompleteManagerContext = null;
  app.resetPresetsFromManager();
  assert.equal(context.getPresets()[app.getAutocompleteColorKey('memo', '충 완료')], undefined);
  assert.equal(app.getAutocompleteValueColor('memo', '충 대기', '충:대기'), '#0000ff');
});
