// Isolated browser, synthetic records, external requests blocked.
// PT_PLAYWRIGHT_MODULE can point to an existing Playwright installation.
const { chromium } = require(process.env.PT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + (new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let body = await fs.readFile(file);
    if (file.endsWith('index.html')) body = Buffer.from(body.toString().replace(/<script id="supabaseSdk"[^>]*><\/script>/, ''));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); res.end(body);
  } catch { res.writeHead(404).end(); }
});
(async () => {
  let browser;
  const errors = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1500, height: 1000 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      localStorage.setItem('PT_APP_DATA_STORAGE_V1', '{}');
      localStorage.setItem('PT_SEARCH_PERIOD', '1year_plus');
      window.addEventListener('DOMContentLoaded', () => {
        PTApp.prototype.initSupabase = () => {};
        PTLocalTools.LocalTools.prototype.tick = async () => {};
      }, { once: true });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);
    await page.waitForFunction(() => window.ptApp && !ptApp._recordsRestorePending);
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const app = ptApp;
      app.cloudSearchHistory = Object.fromEntries(Array.from({ length: 300 }, (_, day) => [
        new Date(Date.UTC(2024, 0, day + 1)).toISOString().slice(0, 10),
        Array.from({ length: 100 }, (_, i) => ({ name: `가상${day}-${i}`, chartNo: `${day * 100 + i}`, memo: `확인${day}-${i}` }))
      ]));
      app.cloudSearchHistory['2025-01-01'] = [{ name: '김가상', memo: '확인 완료' }];
      app.invalidateAutocompleteHistory();
      window.inputTimes = [];
      const original = app.getAutocompleteSuggestions;
      app.getAutocompleteSuggestions = function (...args) {
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { inputTimes.push(performance.now() - start); }
      };
    });
    const cell = page.locator('.excel-cell[data-row="0"][data-col="name"]');
    await cell.dblclick();
    await page.keyboard.type('rlarktkd', { delay: 1 });
    await page.waitForTimeout(100);
    assert.equal(await cell.locator('input').inputValue(), '김가상');
    await page.keyboard.press('Enter');
    for (let i = 1; i <= 50; i++) {
      await page.locator(`.excel-cell[data-row="${i}"][data-col="name"]`).dblclick();
      await page.keyboard.type('rlarktkd', { delay: 0 });
      await page.keyboard.press(i % 2 ? 'Tab' : 'Enter');
    }
    const result = await page.evaluate(() => ({ names: ptApp.getCurrentRows().slice(0, 51).map(r => r.name),
      suggestions: inputTimes.length, maxMs: Math.max(...inputTimes), totalMs: inputTimes.reduce((a, b) => a + b, 0),
      editors: document.querySelectorAll('.cell-input-element').length }));
    assert.deepEqual(errors, []);
    assert.ok(result.names.every(name => name === '김가상'));
    assert.ok(result.editors <= 1);
    // Missing compositionend: recover from a genuine non-composing edit;
    // Enter must work in name and the other native-editor columns afterward.
    for (const col of ['name', 'part', 'memo', 'specialNote']) {
      await page.locator(`.excel-cell[data-row="51"][data-col="${col}"]`).dblclick();
      await page.evaluate(() => {
        const input = document.activeElement;window.testedInput=input;
        input.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true,data:''}));
        input.value='가';input.setSelectionRange(1,1);
        input.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertCompositionText',isComposing:true,data:'가'}));
        input.value='가나';input.setSelectionRange(2,2);
        input.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertText',isComposing:false,data:'나'}));
      });
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(col => ptApp.getCurrentRows()[51][col], col), '가나');
      assert.equal(await page.evaluate(() => !testedInput.isConnected), true);
    }
    await page.evaluate(() => {document.activeElement.blur();ptApp.openSearchPromptModal(0,'');});
    assert.equal(await page.evaluate(() => document.activeElement === ptApp.elSearchPromptInput), true);
    await page.keyboard.insertText('김');
    await page.waitForTimeout(70);
    assert.equal(await page.evaluate(() => ptApp.elSearchPromptInput.selectionStart), 1, 'delayed focus must not reselect typed text');
    await page.keyboard.insertText('가상');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => ptApp.elSearchPromptModal.style.display === 'none' && ptApp.crossDateResults?.length);
    assert.equal(await page.evaluate(() => ptApp.elSearchInput.value), '김가상');
    assert.ok(await page.evaluate(() => ptApp.crossDateResults.every(row => row.name === '김가상')));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({rapidNames:result.names.length,historyRows:30001,suggestions:result.suggestions,
      autocompleteMaxMs:result.maxMs,compositionRecoveryColumns:4,searchPrompt:true,errors:0,externalWrites:0}));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
