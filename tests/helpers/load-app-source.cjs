const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

// Use the same local script order as index.html, without starting the UI.
module.exports = ['history-search.js', 'table-formatting.js', 'app.js']
  .map(file => readFileSync(resolve(__dirname, '../..', file), 'utf8')).join('\n');
