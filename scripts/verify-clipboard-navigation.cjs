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
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}}});
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
    let checked = 0;
    for (const action of ['copy','cut']) for (const mode of ['selected','editing','composing','Control','Meta'])
    for (const [key,row,col] of [['ArrowUp',9,'memo'],['ArrowDown',11,'memo'],['ArrowLeft',10,'writer'],['ArrowRight',10,'specialNote']]) {
      await page.evaluate(()=>{
        document.activeElement.blur();
        const rows=ptApp.getCurrentRows();
        for(let i=9;i<=11;i++) for(const col of ['memo','writer','specialNote']) rows[i][col]='';
        rows[10].memo='가상 원본';
        ptApp.clipboardSelection=null;ptApp.pendingCut=null;
        ptApp.renderTable();
      });
      const source=page.locator('.excel-cell[data-row="10"][data-col="memo"]');
      if(['selected','Control','Meta'].includes(mode))await source.click();else {
        await source.dblclick();await page.keyboard.press('End');
        if(mode==='composing') await source.locator('input').evaluate(input=>{
          input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
          input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',isComposing:true,data:'본'}));
        });
      }
      if(['Control','Meta'].includes(mode))await page.keyboard.press(`${mode}+${action==='copy'?'c':'x'}`);
      else {
        await source.click({button:'right'});
        await page.locator(`#excelContextMenu [data-action="${action}"]`).click();
      }
      assert.ok(await source.evaluate(cell=>cell.classList.contains('clipboard-source')),`${action}/${mode}: dotted source`);
      await page.keyboard.press(key);
      assert.deepEqual(await page.evaluate(()=>ptApp.activeCell),{rowIdx:row,colKey:col},`${action}/${mode}/${key}: first arrow`);
      const target=page.locator(`.excel-cell[data-row="${row}"][data-col="${col}"]`);
      assert.ok(await target.evaluate(cell=>cell.classList.contains('cell-focused')),`${action}/${mode}/${key}: target border`);
      assert.ok(await source.evaluate(cell=>cell.classList.contains('clipboard-source')));
      await page.evaluate(()=>ptApp.pasteSelection(ptApp.clipboardBuffer));
      assert.equal(await page.evaluate(({row,col})=>ptApp.getCurrentRows()[row][col],{row,col}), col==='writer'?'RKTKDDNJSQHS':'가상 원본');
      assert.equal(await page.evaluate(()=>ptApp.getCurrentRows()[10].memo),action==='cut'?'':'가상 원본');
      checked++;
    }
    let heldModifierCases=0;
    for(const action of ['copy','cut']) for(const modifier of ['Control','Meta'])
    for(const [key,row,col] of [['ArrowUp',9,'part'],['ArrowDown',11,'part'],['ArrowLeft',10,'name'],['ArrowRight',10,'prescription']]) {
      await page.evaluate(()=>{
        document.activeElement.blur();const rows=ptApp.getCurrentRows();
        for(let i=9;i<=12;i++)for(const col of ['name','part','prescription','extra'])rows[i][col]='';
        rows[0].name='가상 기록';rows[10].part='가상 부위';
        ptApp.clipboardSelection=null;ptApp.pendingCut=null;ptApp.renderTable();
      });
      await page.locator('.excel-cell[data-row="10"][data-col="part"]').click();
      await page.keyboard.down(modifier);
      await page.keyboard.press(action==='copy'?'c':'x');
      await page.keyboard.press(key);
      assert.deepEqual(await page.evaluate(()=>ptApp.activeCell),{rowIdx:row,colKey:col},`${action}/${modifier} held/${key}`);
      await page.keyboard.press(key);
      const next={rowIdx:key==='ArrowDown'?12:key==='ArrowUp'?8:10,
        colKey:key==='ArrowRight'?'extra':key==='ArrowLeft'?'chartNo':'part'};
      assert.deepEqual(await page.evaluate(()=>ptApp.activeCell),next,`${modifier}/${key}: second arrow with modifier held`);
      await page.keyboard.up(modifier);
      if(key==='ArrowRight') {
        await page.keyboard.press(`${modifier}+ArrowRight`);
        assert.equal(await page.evaluate(()=>ptApp.activeCell.colKey),'specialNote','fresh modifier press keeps deliberate edge shortcut');
      }
      heldModifierCases++;
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({clipboardNavigationCases:checked,heldModifierCases,errors:0,externalWrites:0}));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
