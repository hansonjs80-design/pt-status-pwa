const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

// Use the same local script order as index.html, without starting the UI.
module.exports = [
  'history-search.js',
  'table-formatting.js',
  'summary.js',
  'cell-input-tools.js',
  'device-layout.js',
  'document-tools.js',
  'cloud-sync.js',
  'context-menu.js',
  'preset-manager.js',
  'autocomplete.js',
  'cell-editor.js',
  'sheet-selection.js',
  'sheet-actions.js',
  'sheet-keyboard.js',
  'column-settings.js',
  'app-events.js',
  'date-navigation.js',
  'table-view.js',
  'cell-pickers.js',
  'patient-search-dialog.js',
  'history-table.js',
  'app.js'
].map(file => readFileSync(resolve(__dirname, '../..', file), 'utf8')).join('\n');
