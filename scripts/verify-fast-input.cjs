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
      if (localStorage.getItem('PT_APP_DATA_STORAGE_V1') === null) localStorage.setItem('PT_APP_DATA_STORAGE_V1', '{}');
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
    // Exercise selection-to-type and double-click editing across the other
    // text columns. Every key is sent with zero intentional delay.
    const otherColumns = ['no','chartNo','part','prescription','extra','writer','memo','specialNote'];
    let rapidOtherCells = 0;
    for (const mode of ['selected', 'double']) for (let round = 0; round < 3; round++) {
      const row = 60 + (mode === 'double' ? 3 : 0) + round;
      for (const col of otherColumns) {
        const target = page.locator(`.excel-cell[data-row="${row}"][data-col="${col}"]`);
        // Writer double-click intentionally opens its preset picker; F2 edits text.
        if (mode === 'double' && col !== 'writer') await target.dblclick();
        else { await target.click(); if (mode === 'double') await page.keyboard.press('F2'); }
        const value = col === 'no' ? `${round + 1}` : col === 'chartNo' ? `9876${row}` :
          col === 'writer' ? 'JS' : `rapid-${row}-${col}`;
        await target.locator('input').evaluate(input => input.setSelectionRange(0, input.value.length));
        await page.keyboard.type(value, {delay:0});
        await page.keyboard.press(round % 2 ? 'Tab' : 'Enter');
        assert.equal(await page.evaluate(({row,col}) => String(ptApp.getCurrentRows()[row][col]), {row,col}), value, `${mode}: ${col}`);
        rapidOtherCells++;
      }
    }
    // A discarded selection editor must not process late native events.
    for (const col of otherColumns) {
      const target = page.locator(`.excel-cell[data-row="70"][data-col="${col}"]`);
      await target.click();
      await page.evaluate(() => { window.retiredEditor = document.activeElement; });
      await page.locator('.excel-cell[data-row="71"][data-col="memo"]').click();
      const before = await page.evaluate(col => ptApp.getCurrentRows()[70][col], col);
      await page.evaluate(() => {
        retiredEditor.value = 'late';
        retiredEditor.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertText',isComposing:false,data:'late'}));
        retiredEditor.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true,data:'late'}));
      });
      assert.equal(await page.evaluate(col => ptApp.getCurrentRows()[70][col], col), before, `retired: ${col}`);
    }
    // Enter -> reselect -> clear, plus deletion while the caret is still
    // editing. Wait past autosave and autocomplete timers to catch resurrection.
    const deletionColumns = ['name', ...otherColumns];
    let deletionChecks = 0;
    for (const col of deletionColumns) {
      for (const key of ['Delete','Backspace']) {
        const row = key === 'Delete' ? 74 : 75;
        const target = page.locator(`.excel-cell[data-row="${row}"][data-col="${col}"]`);
        await target.click();
        await target.locator('input').evaluate(input => input.setSelectionRange(0,input.value.length));
        await page.keyboard.type(col === 'name' ? 'rlarktkd' : col === 'writer' ? 'JS' : '123456', {delay:0});
        await page.keyboard.press('Enter');
        await target.click();
        await page.evaluate(() => { window.clearedEditor = document.activeElement; });
        await page.keyboard.press(key);
        await page.evaluate(() => {
          clearedEditor.value = 'late';
          clearedEditor.dispatchEvent(new InputEvent('input',{inputType:'insertText',isComposing:false,data:'late'}));
          clearedEditor.dispatchEvent(new CompositionEvent('compositionend',{data:'late'}));
          clearedEditor.dispatchEvent(new FocusEvent('blur'));
        });
        assert.equal(await page.evaluate(({row,col}) => ptApp.getCurrentRows()[row][col],{row,col}), '', `clear ${key}: ${col}`);
        deletionChecks++;
      }
      const target = page.locator(`.excel-cell[data-row="76"][data-col="${col}"]`);
      await target.click();
      await target.locator('input').evaluate(input => input.setSelectionRange(0,input.value.length));
      await page.keyboard.type(col === 'name' ? 'rlarktkd' : col === 'writer' ? 'JS' : '123456', {delay:0});
      await target.locator('input').evaluate(input => input.setSelectionRange(0,input.value.length));
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(col => ptApp.getCurrentRows()[76][col],col), '', `editing Backspace: ${col}`);
      deletionChecks++;
    }
    await page.waitForTimeout(500);
    for (const row of [74,75,76]) for (const col of deletionColumns) {
      assert.equal(await page.evaluate(({row,col}) => ptApp.getCurrentRows()[row][col],{row,col}), '', `delayed clear: ${row}/${col}`);
    }
    for (const col of deletionColumns) {
      const target = page.locator(`.excel-cell[data-row="77"][data-col="${col}"]`);
      await target.click();
      await target.locator('input').evaluate(input=>input.setSelectionRange(0,input.value.length));
      await page.keyboard.type(col==='name'?'rlarktkd':col==='writer'?'JS':'123456',{delay:0});
      await page.evaluate(() => {
        const editor=document.activeElement;
        ptApp.clearSelection();
        editor.dispatchEvent(new FocusEvent('blur'));
      });
      assert.equal(await page.evaluate(col=>ptApp.getCurrentRows()[77][col],col),'',`clear active editor: ${col}`);
      deletionChecks++;
    }
    // Gender uses its own picker rather than a text editor.
    const gender = page.locator('.excel-cell[data-row="72"][data-col="gender"]');
    await gender.click();
    await page.keyboard.press('f');
    assert.equal(await page.evaluate(() => ptApp.getCurrentRows()[72].gender), 'F');
    await gender.click();
    await page.keyboard.press('m');
    assert.equal(await page.evaluate(() => ptApp.getCurrentRows()[72].gender), 'M');
    // Missing compositionend: recover from a genuine non-composing edit;
    // Enter must work in name and the other native-editor columns afterward.
    for (const col of ['no', 'chartNo', 'name', 'part', 'prescription', 'extra', 'memo', 'specialNote']) {
      await page.locator(`.excel-cell[data-row="51"][data-col="${col}"]`).dblclick();
      await page.evaluate(col => {
        const input = document.activeElement;window.testedInput=input;
        input.dispatchEvent(new CompositionEvent('compositionstart', {bubbles:true,data:''}));
        input.value='가';input.setSelectionRange(1,1);
        input.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertCompositionText',isComposing:true,data:'가'}));
        input.value=['no','chartNo'].includes(col)?'123':'가나';input.setSelectionRange(input.value.length,input.value.length);
        input.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertText',isComposing:false,data:'나'}));
      }, col);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(col => ptApp.getCurrentRows()[51][col], col), ['no','chartNo'].includes(col)?'123':'가나');
      assert.equal(await page.evaluate(() => !testedInput.isConnected), true);
    }
    // Both shortcut variants must own even the very first rapidly typed key.
    await page.locator('.excel-cell[data-row="80"][data-col="name"]').click();
    let koreanPromptRuns = 0;
    for (const shortcut of ['Control+f','Meta+f']) for (let run=0;run<10;run++) {
      await page.keyboard.press(shortcut);
      await page.waitForFunction(()=>ptApp.elSearchPromptModal.style.display==='flex');
      await page.keyboard.type('rlarktkd',{delay:0});
      assert.equal(await page.locator('#searchPromptInput').inputValue(),'김가상');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('d',{delay:0});
      assert.equal(await page.locator('#searchPromptInput').inputValue(),'김가상');
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>ptApp.elSearchPromptModal.style.display==='none');
      koreanPromptRuns++;
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
    await page.evaluate(()=>ptApp.openSearchPromptModal(0,''));
    await page.keyboard.type('rlarktkd',{delay:0});
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>ptApp.elSearchPromptModal.style.display==='none' && ptApp.crossDateResults?.length);
    assert.equal(await page.evaluate(()=>ptApp.elSearchInput.value),'김가상');
    assert.ok(await page.evaluate(()=>ptApp.crossDateResults.every(row=>row.name==='김가상')));

    assert.deepEqual(errors, []);
    // Disk restore must retain actual empty values, not just empty rendering.
    await page.waitForTimeout(500);
    await page.evaluate(async()=>{await ptApp._recordWrite;});
    await page.reload();
    await page.waitForFunction(()=>window.ptApp && !ptApp._recordsRestorePending);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>ptApp.getCurrentRows()[0].name),'김가상');
    for (const row of [74,75,76,77]) for (const col of deletionColumns) {
      assert.equal(await page.evaluate(({row,col})=>ptApp.getCurrentRows()[row][col],{row,col}),'',`reload deletion: ${row}/${col}`);
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({rapidNames:result.names.length,historyRows:30001,suggestions:result.suggestions,
      autocompleteMaxMs:result.maxMs,rapidOtherCells,deletionChecks,deletionReload:true,retiredColumns:otherColumns.length,genderPicker:true,compositionRecoveryColumns:8,searchPrompt:true,koreanPromptRuns,errors:0,externalWrites:0}));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
