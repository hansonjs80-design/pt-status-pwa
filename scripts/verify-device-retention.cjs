// Real Chrome/Edge preferences, service workers and cold browser restarts.
// Temporary profiles + virtual data only; no production requests or real profiles.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname,'..');
let release = 1, checks = 0;
const check = (actual,expected,label) => {assert.deepEqual(actual,expected,label);checks++;};
const expected = {name:243,part:317,pdf:true,backup:true,time:'23:59',backupTime:'23:55',
  backupIntervalType:'hourly',backupIntervalHours:6,backupMaxCount:30,workHoursOnly:true,workStartTime:'23:50',workEndTime:'23:59'};
const contexts = new Set(), errors = [];
const server = http.createServer(async(req,res)=>{
  const relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'') || 'index.html';
  if (relative === 'probe.html') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Virtual unrelated site</title>');return;}
  const file = path.resolve(root,relative);
  if (!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
  try {
    let data = await fs.readFile(file);
    // Strip the remote SDK even in worker-cached HTML. Cloud init is also disabled below.
    if (relative === 'index.html') data = Buffer.from(data.toString().replace(/<script id="supabaseSdk"[^>]*><\/script>/,''));
    if (relative === 'sw.js') data = Buffer.from(data.toString().replace(/pt-status-pwa-v\d+/,`pt-status-pwa-retention-${release}`));
    if (relative === 'app-updates.js') data = Buffer.from(data.toString().replace(/static VERSION = "v\d+"/,`static VERSION = "v9${release}"`));
    if (relative === 'version.json') data = Buffer.from(JSON.stringify({version:`v9${release}`}));
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {res.writeHead(404);res.end();}
});

(async()=>{
  const profiles = await fs.mkdtemp(path.join(os.tmpdir(),'pt-retention-check-'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const unrelated = `http://localhost:${server.address().port}`;
  async function launch(profile,channel,offline=false) {
    const context = await chromium.launchPersistentContext(profile,{channel,headless:true,serviceWorkers:'allow',
      viewport:{width:1500,height:1000},timeout:30000});
    contexts.add(context);context.on('close',()=>contexts.delete(context));
    await context.route('**/*',route=>[origin,unrelated].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
    await context.addInitScript(()=>{
      if (location.pathname === '/probe.html') return;
      if (!localStorage.getItem('PT_RETENTION_VIRTUAL')) {
        localStorage.setItem('PT_APP_DATA_STORAGE_V1','{}');localStorage.setItem('PT_RETENTION_VIRTUAL','1');
      }
      window.addEventListener('DOMContentLoaded',()=>{
        PTApp.prototype.initSupabase=()=>{};
        // No scheduled export side effects; real settings controls and persistence run unchanged.
        PTLocalTools.LocalTools.prototype.tick=async()=>{};
      },{once:true});
    });
    if (offline) await context.setOffline(true);
    const page=context.pages()[0] || await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/index.html');
    await page.waitForFunction(()=>window.ptLocalTools?._initialized);
    await page.evaluate(()=>ptLocalTools.ready);
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    return {context,page};
  }
  async function configure(page) {
    for (const [key,width] of [['name',expected.name],['part',expected.part]]) {
      const handle=page.locator(`.col-headers-row th[data-col="${key}"] .col-resizer`);
      const box=await handle.boundingBox();
      const before=await page.evaluate(key=>ptApp.getSavedColumnWidths()[key],key);
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      await page.mouse.move(box.x+box.width/2+width-before,box.y+box.height/2,{steps:3});await page.mouse.up();
    }
    await page.evaluate(()=>ptLocalTools.open('backup'));
    const dialog=page.locator('.device-settings-dialog');
    await dialog.locator('[data-backup]').check();
    await dialog.locator('[data-backup-time]').fill(expected.backupTime);
    await dialog.locator('[name="backupIntervalType"][value="hourly"]').check();
    await dialog.locator('[data-backup-interval]').selectOption('6');
    await dialog.locator('[data-backup-max-count]').selectOption('30');
    await dialog.locator('[data-workhours-only]').check();
    await dialog.locator('[data-work-start-time]').fill(expected.workStartTime);
    await dialog.locator('[data-work-end-time]').fill(expected.workEndTime);
    await dialog.locator('[data-tab="exports"]').click();
    await dialog.locator('[data-time]').fill(expected.time);await dialog.locator('[data-pdf]').check();
    await page.evaluate(()=>Promise.all([ptApp.columnWidthsWrite,ptApp.devicePreferencesWrite,ptLocalTools._settingsDiskWrite]));
    await dialog.locator('[data-close]').click();
  }
  async function values(page) {
    return page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,['name','part'].includes(key)
      ? parseFloat(document.querySelector(`.col-headers-row th[data-col="${key}"]`).style.width)
      : ptLocalTools.settings[key]])),Object.keys(expected));
  }
  try {
    for(const channel of (process.env.PT_TEST_BROWSER_CHANNELS || 'chrome,msedge').split(',')) {
      for(const allow of [false,true]) {
        release=1;
        const profile=path.join(profiles,channel+'-'+allow);
        await fs.mkdir(path.join(profile,'Default'),{recursive:true});
        await fs.writeFile(path.join(profile,'Default','Preferences'),JSON.stringify({profile:{default_content_setting_values:{cookies:4},
          content_settings:{exceptions:{cookies:allow?{[origin+',*']:{setting:1}}:{}}}}}));
        let run=await launch(profile,channel);await configure(run.page);
        check(await values(run.page),expected,channel+' verified before shutdown');
        const probe=await run.context.newPage();await probe.goto(unrelated+'/probe.html');
        await probe.evaluate(()=>localStorage.setItem('unrelated','clear me'));await probe.close();
        await run.context.close();
        run=await launch(profile,channel);
        const actual=await values(run.page);
        if (!allow) {
          check([actual.name,actual.pdf,actual.backup,actual.time],[100,false,false,'09:10'],channel+' SESSION_ONLY reproduces reset');
          check(await run.page.evaluate(()=>ptLocalTools.recovery.startupSettingsState()),'missing',channel+' deleted before startup');
        } else {
          check(actual,expected,channel+' site exception preserves settings after cold launch');
          check(await run.page.evaluate(()=>ptLocalTools.recovery.startupSettingsState()),'found',channel+' prior settings found');
        }
        const cleared=await run.context.newPage();await cleared.goto(unrelated+'/probe.html');
        check(await cleared.evaluate(()=>localStorage.getItem('unrelated')),null,channel+' unrelated site still cleared');await cleared.close();
        await run.page.evaluate(()=>ptLocalTools.open('exports'));
        await run.page.locator('[data-retention-help]').click();
        check(await run.page.locator('[data-panel="recovery"]').isVisible(),true,'PDF tab opens retention help');
        check(await run.page.locator('[data-retention-origin]').inputValue(),origin,'exception is for exact origin');
        check(await run.page.locator('[data-retention-chrome]').inputValue(),'chrome://settings/content/siteData','Chrome address');
        check(await run.page.locator('[data-retention-edge]').inputValue(),'edge://settings/content/cookies','Edge address');
        await run.page.setViewportSize({width:400,height:850});
        check(await run.page.locator('[data-retention-guide]').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'retention guide fits narrow screen');
        await run.page.screenshot({path:path.join(os.tmpdir(),`pt-retention-${channel}.png`)});
        await run.page.locator('[data-close]').click();
        if (allow) {
          release=2;
          await run.page.evaluate(()=>ptApp.checkForUpdate());
          await run.page.waitForFunction(()=>Boolean(ptApp.swRegistration?.waiting));
          await Promise.all([run.page.waitForNavigation(),run.page.evaluate(()=>ptApp.applyUpdate())]);
          await run.page.waitForFunction(()=>ptLocalTools?._initialized);await run.page.evaluate(()=>ptLocalTools.ready);
          check(await run.page.evaluate(()=>ptApp.appVersion),'v92',channel+' real worker update activated');
          check(await values(run.page),expected,channel+' update preserves settings');
          await run.context.close();
          run=await launch(profile,channel,true);
          check(await values(run.page),expected,channel+' offline cold launch preserves settings');
        }
        await run.context.close();
        const prefs=JSON.parse(await fs.readFile(path.join(profile,'Default','Preferences'),'utf8'));
        check(prefs.profile.default_content_setting_values.cookies,4,channel+' global deletion preference unchanged');
        console.log(`${channel}: ${allow?'PT-only exception + worker update + offline restart passed':'SESSION_ONLY reset reproduced after verified save'}`);
      }
    }
    check(errors,[],'no application errors');
    console.log(`${checks} retention checks passed. Native macOS Chrome/Edge; Windows preference format tested separately, no physical Windows reboot.`);
  } finally {
    await Promise.all([...contexts].map(context=>context.close().catch(()=>{})));
    server.close();await fs.rm(profiles,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
