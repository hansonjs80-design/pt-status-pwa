// Run with Playwright available (NODE_PATH can point to an isolated install).
// Only temporary browser profiles and virtual records; all external requests blocked.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');

const root = path.resolve(__dirname,'..');
const channels = (process.env.PT_TEST_BROWSER_CHANNELS || 'chrome,msedge').split(',');
assert.equal(channels.length,2,'provide two browser channels for separate device profiles');
const exportSettings = [0,1].map(i=>({pdf:true,backup:true,time:`23:${58-i}`,backupTime:`22:${48-i}`,
  backupIntervalType:'hourly',backupIntervalHours:i?4:6,backupMaxCount:i?20:30,
  workHoursOnly:true,workStartTime:'23:50',workEndTime:'23:59'}));
const keys = ['no','gender','chartNo','name','part','prescription','extra','writer','memo','specialNote','visitTime','del','spacer'];
let checks = 0;
const check = (actual,expected,label) => {assert.deepEqual(actual,expected,label);checks++;};
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  const relative = decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html';
  const file = path.resolve(root,relative);
  if (!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
  try {
    const type = {'.js':'application/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)];
    res.setHeader('Content-Type',type || 'application/octet-stream');res.end(await fs.readFile(file));
  } catch {res.writeHead(404);res.end();}
});

(async () => {
  const profiles = await fs.mkdtemp(path.join(os.tmpdir(),'pt-width-check-'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const openContexts = new Set(), errors = [];
  async function launch(machine,seed=false,faults={}) {
    const profile = path.join(profiles,String(machine));
    console.log(`Launching ${channels[machine]}${faults.read ? ' with storage faults' : ''}`);
    const context = await chromium.launchPersistentContext(profile,{
      channel:channels[machine],headless:true,args:['--enable-automation','--hide-crash-restore-bubble'],
      viewport:{width:1600,height:1000},serviceWorkers:'block',timeout:30000
    });
    context.setDefaultTimeout(10000);
    openContexts.add(context);context.on('close',()=>openContexts.delete(context));
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    if (seed) await context.addInitScript(()=>{
      // Once per profile, before application startup; never use sample/patient data.
      if (!localStorage.getItem('PT_VIRTUAL_WIDTH_TEST')) {
        localStorage.setItem('PT_APP_DATA_STORAGE_V1','{}');localStorage.setItem('PT_VIRTUAL_WIDTH_TEST','1');
      }
    });
    await context.addInitScript(faults=>{
      if (faults.windows) Object.defineProperty(navigator,'platform',{get:()=> 'Win32'});
      if (faults.fast) {
        const write=Storage.prototype.setItem;
        Storage.prototype.setItem=function(key,value){
          if(/PT_DEVICE_|PT_APP_COL_WIDTHS|device-summary|PT_TOOLBAR/.test(key))throw new DOMException('simulated quota','QuotaExceededError');
          return write.call(this,key,value);
        };
        Object.defineProperty(document,'cookie',{get:()=>'',set:()=>{}});
      }
      if (faults.strict) {
        const transaction=IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction=function(...args){
          if(args[2])throw new TypeError('simulated older durability API');
          return transaction.apply(this,args);
        };
      }
      window.addEventListener('DOMContentLoaded',()=>{
        PTApp.prototype.initSupabase=()=>{};
        if(faults.read) {
          const store=PTApp.prototype.localDatabaseStore;
          window.failedDeviceReads=0;
          PTApp.prototype.localDatabaseStore=function(name,objectStore,key,value,...args){
            if(key==='device-export-settings-v1' && value===undefined && window.failedDeviceReads<2){
              window.failedDeviceReads++;return Promise.reject(Error('simulated startup failure'));
            }
            return store.call(this,name,objectStore,key,value,...args);
          };
        }
      },{once:true});
    },faults);
    const page = context.pages()[0] || await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/index.html');
    await page.waitForFunction(()=>window.ptLocalTools?._initialized);
    await page.evaluate(()=>ptLocalTools.ready);
    await page.clock.setFixedTime(new Date('2026-10-23T03:00:00Z'));
    if(faults.read) check(await page.evaluate(()=>failedDeviceReads),2,'startup retries automatically');
    return {context,page,profile};
  }
  async function saved(page) {
    await page.evaluate(()=>Promise.all([ptApp.columnWidthsWrite,ptApp.devicePreferencesWrite,ptLocalTools._settingsDiskWrite]));
  }
  async function configureExports(page,settings) {
    await page.evaluate(()=>ptLocalTools.open('backup'));
    const dialog=page.locator('.device-settings-dialog');
    await dialog.locator('[data-backup-time]').fill(settings.backupTime);
    await dialog.locator(`[name="backupIntervalType"][value="${settings.backupIntervalType}"]`).check();
    await dialog.locator('[data-backup-interval]').selectOption(String(settings.backupIntervalHours));
    await dialog.locator('[data-backup-max-count]').selectOption(String(settings.backupMaxCount));
    await dialog.locator('[data-workhours-only]').check();
    await dialog.locator('[data-work-start-time]').fill(settings.workStartTime);
    await dialog.locator('[data-work-end-time]').fill(settings.workEndTime);
    await dialog.locator('[data-backup]').check();
    await dialog.locator('[data-tab="exports"]').click();
    await dialog.locator('[data-time]').fill(settings.time);
    await dialog.locator('[data-pdf]').check();
    await saved(page);
    await dialog.locator('[data-close]').click();
    // Real structured-clone folder handle, isolated inside this test profile.
    await page.evaluate(async()=>{
      const root=await navigator.storage.getDirectory();
      const handle=await root.getDirectoryHandle('virtual-exports',{create:true});
      await ptLocalTools.store('folder-selection-v1',{handle,location:['virtual-exports']});
      await ptLocalTools.restoreExportFolder();
    });
  }
  async function verifyExports(page,expected,label) {
    check(await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,ptLocalTools.settings[k]])),Object.keys(expected)),expected,label+' export settings');
    await page.evaluate(()=>ptLocalTools.open('backup'));
    const dialog=page.locator('.device-settings-dialog');
    check(await dialog.locator('[data-backup]').isChecked(),expected.backup,label+' backup checkbox');
    check(await dialog.locator('[data-backup-time]').inputValue(),expected.backupTime,label+' backup time');
    check(await dialog.locator('[data-backup-interval]').inputValue(),String(expected.backupIntervalHours),label+' interval');
    check(await dialog.locator('[data-backup-max-count]').inputValue(),String(expected.backupMaxCount),label+' retention');
    check(await dialog.locator('[data-work-start-time]').inputValue(),expected.workStartTime,label+' work start');
    check(await dialog.locator('[data-work-end-time]').inputValue(),expected.workEndTime,label+' work end');
    check(await dialog.locator('[data-workhours-only]').isChecked(),expected.workHoursOnly,label+' work hours');
    check(await dialog.locator('[data-work-start-time]').isDisabled(),!expected.workHoursOnly,label+' work hours input enabled');
    check(await dialog.locator(`[name="backupIntervalType"][value="${expected.backupIntervalType}"]`).isChecked(),true,label+' interval type');
    await dialog.locator('[data-tab="exports"]').click();
    check(await dialog.locator('[data-pdf]').isChecked(),expected.pdf,label+' pdf checkbox');
    check(await dialog.locator('[data-time]').inputValue(),expected.time,label+' pdf time');
    check(await dialog.locator('[data-panel="exports"] [data-folder-location]').textContent(),'virtual-exports',label+' restored folder');
    await dialog.locator('[data-close]').click();
  }
  async function drag(page,key,width,release=true) {
    const handle = page.locator(`.col-headers-row th[data-col="${key}"] .col-resizer`);
    if (!await handle.isVisible()) {
      await page.evaluate(({key,width})=>ptApp.saveColumnWidth(key,width),{key,width});
      check(await page.evaluate(key=>ptApp.getSavedColumnWidths()[key],key),width,`hidden track ${key}`);
      return;
    }
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    const startWidth = await page.evaluate(key=>ptApp.getSavedColumnWidths()[key],key);
    const x = box.x+box.width/2, y = box.y+box.height/2;
    await page.mouse.move(x,y);await page.mouse.down();
    await page.mouse.move(x+width-startWidth,y,{steps:5});
    if (release) await page.mouse.up();
    check(await page.evaluate(key=>ptApp.getSavedColumnWidths()[key],key),width,`drag ${key}`);
  }
  async function verify(page,expected,label) {
    check(await page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,
      parseFloat(document.querySelector(`.col-headers-row th[data-col="${key}"]`).style.width)])),keys),expected,label+' headers');
    const tracks=await page.evaluate(keys=>keys.map(key=>{
      const header=document.querySelector(`.col-headers-row th[data-col="${key}"]`);
      const col=document.querySelector(`colgroup.device-column-widths col[data-col="${key}"]`);
      return {key,visible:getComputedStyle(header).display!=='none',width:header.getBoundingClientRect().width,col:col?parseFloat(col.style.width):null};
    }),keys);
    for(const track of tracks.filter(track=>track.visible)) {
      check(track.col,expected[track.key],label+' colgroup '+track.key);
      assert.ok(Math.abs(track.width-expected[track.key])<1,label+' displayed '+track.key);checks++;
    }
  }
  async function kill(run) {
    const cdp = await run.context.browser().newBrowserCDPSession();
    const {arguments:args} = await cdp.send('Browser.getBrowserCommandLine');
    assert.ok(args.includes('--user-data-dir='+run.profile),'kill only the isolated test browser');
    const {processInfo} = await cdp.send('SystemInfo.getProcessInfo');
    const pid = processInfo.find(info=>info.type==='browser').id;
    const closed = once(run.context,'close');process.kill(pid,'SIGKILL');
    // Abrupt machine shutdown also stops the browser's storage/GPU helpers.
    // Killing only the parent can leave those helpers holding profile locks.
    for (const child of processInfo.filter(info=>info.type!=='browser')) {
      try {process.kill(child.id,'SIGKILL');} catch(error) {if(error.code!=='ESRCH')throw error;}
    }
    await closed;
    // Start a fresh app window after a crash, without restoring a previous
    // automation tab before route isolation is installed. Keep all site storage.
    await fs.rm(path.join(run.profile,'Default','Sessions'),{recursive:true,force:true});
  }
  try {
    const expected = [0,1].map(machine=>Object.fromEntries(keys.map((key,i)=>[key,60+i*9+machine*17])));
    // Separate device profiles use the same origin and never share local widths.
    for (let machine=0;machine<2;machine++) {
      console.log(`Checking device ${machine}: resize all columns`);
      const run = await launch(machine,true);
      await run.page.evaluate(async()=>{
        for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
        for (const key of await caches.keys()) await caches.delete(key);
      });
      for (const key of keys) await drag(run.page,key,expected[machine][key]);
      await configureExports(run.page,exportSettings[machine]);
      await saved(run.page);await verify(run.page,expected[machine],`device ${machine} before exit`);
      await verifyExports(run.page,exportSettings[machine],channels[machine]+' before exit');
      await run.context.close();
    }
    for (let machine=0;machine<2;machine++) {
      const run = await launch(machine);await verify(run.page,expected[machine],`device ${machine} cold launch`);
      await verifyExports(run.page,exportSettings[machine],channels[machine]+' cold launch');
      await run.context.close();
    }
    // No pointerup, pagehide, beforeunload or graceful browser shutdown.
    console.log('Checking forced exit and disk-only recovery');
    let run = await launch(0);await drag(run.page,'part',307,false);await saved(run.page);
    expected[0].part=307;await kill(run);
    run=await launch(0);await verify(run.page,expected[0],'process killed during drag');
    // Remove all fast copies and the service-worker cache, preserving actual disk settings.
    await run.page.evaluate(async()=>{
      for(const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
      for(const key of await caches.keys()) await caches.delete(key);
      localStorage.clear();sessionStorage.clear();
    });
    await run.context.clearCookies();await kill(run);
    run=await launch(0,true);await verify(run.page,expected[0],'IndexedDB-only recovery');
    await verifyExports(run.page,exportSettings[0],'IndexedDB-only recovery');
    // Two windows: the older one must not replay its edits on initialization retry.
    await drag(run.page,'part',240);await saved(run.page);
    const second=await run.context.newPage();second.on('pageerror',e=>errors.push(e.message));
    await second.goto(origin+'/index.html');await second.waitForFunction(()=>window.ptLocalTools?._initialized);
    await second.clock.setFixedTime(new Date('2026-10-23T03:00:00Z'));
    await drag(second,'part',349);await saved(second);expected[0].part=349;
    await run.page.evaluate(()=>ptApp.restoreDeviceSettings(ptLocalTools.store.bind(ptLocalTools)));
    await verify(run.page,expected[0],'older window retry');
    await run.page.evaluate(()=>ptLocalTools.open('exports'));
    await second.evaluate(()=>{ptLocalTools.settings.time='20:45';ptLocalTools.settings.workHoursOnly=false;return ptLocalTools.save();});
    exportSettings[0].time='20:45';
    exportSettings[0].workHoursOnly=false;
    await run.page.locator('.device-settings-dialog [data-save]').click();
    await saved(run.page);
    await verifyExports(run.page,exportSettings[0],'older settings dialog save');
    await run.context.close();
    run=await launch(0);await verify(run.page,expected[0],'final cold launch');await run.context.close();
    const other=await launch(1);await verify(other.page,expected[1],'second device remains independent');await other.context.close();
    for(let machine=0;machine<2;machine++) {
      console.log(`Checking ${channels[machine]}: startup errors, blocked fast storage, older disk API and write recovery`);
      const run=await launch(machine,false,{read:true,fast:true,strict:true,windows:true});
      await verifyExports(run.page,exportSettings[machine],channels[machine]+' startup retry');
      await run.page.evaluate(()=>{
        const store=ptApp.localDatabaseStore.bind(ptApp);let failures=2;
        ptApp.localDatabaseStore=async(...args)=>{
          if(args[3]!==undefined && args[2].startsWith('device-') && failures-->0)throw Error('simulated write failure');
          return store(...args);
        };
      });
      await drag(run.page,'part',401+machine);expected[machine].part=401+machine;
      await run.page.evaluate(()=>{ptLocalTools.settings.time='21:35';return ptLocalTools.save().catch(()=>{});});
      exportSettings[machine].time='21:35';
      await run.page.waitForFunction(()=>ptApp._devicePendingWrites?.size===0);
      await run.page.evaluate(async()=>{
        localStorage.clear();sessionStorage.clear();
      });
      await run.context.clearCookies();await kill(run);
      const cold=await launch(machine,true);
      await verify(cold.page,expected[machine],channels[machine]+' forced exit');
      await verifyExports(cold.page,exportSettings[machine],channels[machine]+' forced exit');
      await cold.context.close();
    }
    check(errors,[],'no application errors');
    console.log(`Device settings: ${checks} browser checks passed in ${channels.join(' and ')}; real controls/drags, cold launches, forced exit, IndexedDB-only recovery, automatic retries and window conflict. Windows platform and storage faults are simulated.`);
  } finally {
    for(const context of openContexts) await context.close();
    await new Promise(resolve=>server.close(resolve));
    await fs.rm(profiles,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
