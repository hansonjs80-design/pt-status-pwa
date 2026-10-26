const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const context = vm.createContext({ window: { addEventListener() {} }, localStorage: { getItem() { return null; } } });
vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', context);
const app = Object.create(context.App.prototype);

test('summary includes treatment-only rows but excludes unused rows and whitespace', () => {
  const result = app.getDailySummary([
    { name: '가상환자', gender: ' m ', prescription: '사지 ( HP / Laser )' },
    { prescription: '학생 ( HP / Laser )', gender: 'F' },
    { extra: '도수치료, 견인' },
    { chartNo: 123, prescription: 'X', gender: 'F' },
    { gender: 'F', writer: 'S' },
    { name: '  ', chartNo: '', part: '\n' },
    {}, null,
  ]);
  assert.equal(result.total, 4);
  assert.equal(result.male, 1);
  assert.equal(result.female, 2);
  assert.equal(result.unknown, 1);
  assert.equal(result.male + result.female + result.unknown, result.total);
  assert.equal(result.extras.get('도수치료'), 1);
  assert.equal(result.extras.get('견인'), 1);
  assert.equal(result.prescriptions.get('X'), 1);
  assert.equal(result.prescriptions.get('미입력'), 1);
  assert.equal([...result.prescriptions.values()].reduce((a, b) => a + b, 0), result.total);
});

test('mixed additional treatments are separate and repeated items in one row count once', () => {
  const result = app.getDailySummary([
    { extra: '충격파, 도수치료, 테이핑, 충격파' },
    { extra: '이온 / 윈백 + 견인' },
    { extra: '도수; 테이핑' },
  ]);
  assert.equal(result.extras.get('충격파'), 1);
  assert.equal(result.extras.get('도수치료'), 1);
  assert.equal(result.extras.get('도수'), 1);
  assert.equal(result.extras.get('테이핑'), 2);
  for (const label of ['이온', '윈백', '견인']) assert.equal(result.extras.get(label), 1);
});

test('prescriptions reflect entered labels rather than a broad other category', () => {
  const result = app.getDailySummary([
    { prescription: '학생 (HP / Laser)' },
    { prescription: '학생  (HP / Laser)' },
    { prescription: '항냉 (ICE / Laser)' },
  ]);
  assert.equal(result.prescriptions.get('학생 (HP / Laser)'), 2);
  assert.equal(result.prescriptions.get('항냉 (ICE / Laser)'), 1);
  assert.equal(app.getDailySummary([]).total, 0);
});


test('summary omits unused preset treatments and keeps the labels actually entered', () => {
  const result = app.getDailySummary([
    { name: '가상1', extra: '충격파, 도수' },
    { name: '가상2', extra: '이온' },
    { name: '가상3', extra: '충격파' },
  ]);
  assert.deepEqual(Array.from(result.extras, ([label, count]) => [label, count]), [['충격파', 2], ['도수', 1], ['이온', 1]]);
  assert.equal(result.extras.has('윈백'), false);
  assert.equal(result.extras.has('견인'), false);
  assert.equal(result.extras.has('도수치료'), false);
  assert.equal(app.getDailySummary([]).extras.size, 0);
});

test('shockwave count includes kidney-note subcount only on shockwave rows', () => {
  const rows = [
    {extra:'충격파',specialNote:'신장2.5'}, {extra:'충격파',specialNote:'신장4.0'},
    {extra:'충격파, 충격파',specialNote:'신장 3.0'}, {extra:'충격파'}, {extra:'충격파'}, {extra:'충격파'},
    {extra:'도수치료',specialNote:'신장4.0'},
  ];
  const result=app.getDailySummary(rows);
  assert.equal(result.extras.get('충격파'),6);
  assert.equal(app.formatExtraCount(result,'충격파',6),'6(3)');
  assert.equal(app.formatExtraCount(result,'도수치료',1),'1');
});

test('month and year summaries include cloud history without double-counting local dates', () => {
  const instance=Object.create(context.App.prototype);
  instance.currentDate='2026-10-05';
  instance.dataStore={
    '2026-10-05':[{name:'현재',gender:'F',extra:'충격파',specialNote:'신장 2'}],
    '2026-10-01':[{name:'로컬 수정',gender:'M',prescription:'치료'}],
    '2026-09-30':[{name:'지난달',gender:'F'}],
    '2025-10-05':[{name:'작년'}],
  };
  instance.cloudSearchHistory={
    '2026-10-01':[{name:'중복 클라우드'},{name:'덮어쓴 기록'}],
    '2026-10-03':[{name:'클라우드',gender:'M',extra:'충격파'}],
    '2026-01-01':[{name:'연초'}],
    '__pt_shared_presets_v1__':[{name:'통계 제외'}],
  };
  instance.getCurrentRows=()=>instance.dataStore[instance.currentDate];
  const before=JSON.stringify(instance.dataStore);
  assert.equal(instance.getPeriodSummary('day').total,1);
  const month=instance.getPeriodSummary('month');
  assert.equal(month.total,3);
  assert.equal(month.male,2);
  assert.equal(month.female,1);
  assert.equal(month.extras.get('충격파'),2);
  assert.equal(instance.formatExtraCount(month,'충격파',2),'2(1)');
  const year=instance.getPeriodSummary('year');
  assert.equal(year.total,5);
  assert.equal(year.unknown,1);
  instance.currentDate='2027-01-01';
  assert.equal(instance.getPeriodSummary('month').total,0);
  assert.equal(instance.getPeriodSummary('year').total,0);
  assert.equal(JSON.stringify(instance.dataStore),before);
});

test('period switching refreshes summary and loads historical data for month and year only', () => {
  const instance=Object.create(context.App.prototype);
  let renders=0,loads=0;
  instance.updateSidebarStats=()=>renders++;
  instance.loadSearchHistory=()=>loads++;
  for(const period of ['day','month','year']) instance.setSummaryPeriod(period);
  assert.equal(instance.summaryPeriod,'year');
  assert.equal(renders,3);
  assert.equal(loads,2);
  instance.setSummaryPeriod('invalid');
  assert.equal(instance.summaryPeriod,'year');
  assert.equal(renders,3);
});

test('weekday and Monday-based week filters intersect and ignore prepared writer-only dates in average divisors', () => {
  const instance = Object.create(context.App.prototype);
  instance.currentDate = '2026-10-06';
  instance.dataStore = {
    '2026-10-01': [{ name: '첫째', extra: '충격파' }], // Thursday, week 1
    '2026-10-05': [{ name: '둘째' }, { name: '셋째', extra: '충격파' }], // Monday, week 2
    '2026-10-12': [{ name: '넷째' }], // Monday, week 3
    '2026-10-19': [{ writer: 'J' }], // Prepared initials are not a treatment day
    '2026-09-30': [{ name: '이전 월' }],
  };
  instance.cloudSearchHistory = { '2026-10-05': [{ name: '중복 서버' }] };
  assert.equal(instance.getPeriodSummary('month').total, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(instance.getSummaryAverageContext('month'))), { days: 3, weeks: 3, months: 1 });
  instance.summaryWeekdays = [1];
  assert.equal(instance.getPeriodSummary('month').total, 3);
  assert.equal(instance.getSummaryAverageContext('month').days, 2);
  instance.summaryWeeks = [2];
  const summary = instance.getPeriodSummary('month');
  assert.equal(summary.total, 2);
  assert.equal(summary.extras.get('충격파'), 1);
  assert.equal(instance.formatSummaryAverage(summary.total, instance.getSummaryAverageContext('month').days), '2.0');
  instance.summaryWeeks = [];
  assert.equal(instance.getPeriodSummary('month').total, 0);
  assert.equal(instance.formatSummaryAverage(0, 0), '—');
});

test('yearly month averages include absent-item zeroes, exclude empty months, and ignore monthly filters', () => {
  const instance = Object.create(context.App.prototype);
  instance.currentDate = '2026-10-06';
  instance.dataStore = {
    '2026-01-05': [{ name: '환자1', extra: '충격파', writer: 'J' }],
    '2026-01-06': [{ name: '환자2', extra: '견인', writer: 'K' }],
    '2026-03-01': [{ name: '환자3', extra: '충격파' }],
    '2026-02-01': [{ writer: 'J' }],
  };
  instance.cloudSearchHistory = {};
  instance.summaryWeeks = [];
  instance.summaryWeekdays = [];
  const dates = instance.getSummaryDates('year', true);
  const summary = instance.getPeriodSummary('year');
  const metrics = instance.getSummaryMetrics(summary);
  const shockwave = metrics.find(metric => metric.key === 'extras:충격파');
  const january = dates.filter(entry => entry.date.startsWith('2026-01'));
  assert.equal(instance.formatSummaryAverage(january.reduce((n, entry) => n + shockwave.value(entry.summary), 0), january.length), '0.5');
  assert.equal(summary.total, 3);
  assert.equal(instance.getSummaryAverageContext('year').months, 2);
  assert.equal(instance.formatSummaryAverage(summary.total, 2), '1.5');
  assert.equal(metrics.find(metric => metric.key === 'writerContentCounts:J').value(instance.getDailySummary([{ writer: 'J' }])), 0);
});

test('summary period controls select another month and year without changing the record date', () => {
  const instance = Object.create(context.App.prototype);
  instance.currentDate = '2026-10-06'; instance.cloudSearchHistory = {};
  instance.dataStore = {
    '2026-09-07': [{name:'이전 월',extra:'견인'}],
    '2026-10-05': [{name:'현재 월'}],
    '2025-01-06': [{name:'이전 연도'}],
    '2025-02-03': [{name:'둘째 월',extra:'견인'}],
  };
  instance.summaryMonth = '2026-09';
  assert.equal(instance.getPeriodSummary('month').extras.get('견인'),1);
  assert.equal(instance.getSummaryDates('month')[0].date,'2026-09-07');
  instance.summaryYear = '2025';
  assert.equal(instance.getPeriodSummary('year').total,2);
  assert.equal(instance.getSummaryAverageContext('year').weeks,2);
  instance.summaryYearMonth = 2;
  assert.equal(instance.getPeriodSummary('year').total,1);
  assert.equal(instance.getPeriodSummary('year').extras.get('견인'),1);
  instance.summaryYearMonth = 0;
  assert.equal(instance.getPeriodSummary('year').total,2);
  assert.equal(instance.currentDate,'2026-10-06');
});

test('table group averages count zero items on active days and exclude writer-only dates', () => {
  const instance = Object.create(context.App.prototype);
  const group = [[{name:'첫째',extra:'견인'}],[{name:'둘째'}],[{writer:'J'}]].map(rows => ({summary:instance.getDailySummary(rows)}));
  const metric = {value:s=>s.extras.get('견인') || 0};
  const result = instance.getSummaryGroupStats(group,metric);
  assert.equal(result.days,2);assert.equal(result.sum,1);assert.equal(result.average,'0.5');
  assert.equal(instance.getSummaryGroupStats([],metric).average,'—');
});

test('summary sidebar toggle persists closed state per device in localStorage and restores on launch', () => {
  const storage = new Map();
  const sidebar = { classList: new Set(), style: {} };
  sidebar.classList.toggle = function(cls, force) {
    if (force !== undefined) {
      if (force) this.add(cls); else this.delete(cls);
      return force;
    }
    if (this.has(cls)) { this.delete(cls); return false; }
    this.add(cls); return true;
  };
  sidebar.classList.contains = function(cls) { return this.has(cls); };

  const buttonAttrs = {};
  const button = {
    setAttribute(k, v) { buttonAttrs[k] = String(v); },
    getAttribute(k) { return buttonAttrs[k]; },
  };

  let toggleListener = null;
  const doc = {
    getElementById(id) {
      if (id === 'summarySidebar') return sidebar;
      if (id === 'btnToggleSummary') return button;
      return null;
    },
  };
  button.addEventListener = (evt, fn) => { if (evt === 'click') toggleListener = fn; };

  const testContext = vm.createContext({
    document: doc,
    window: { addEventListener() {} },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, val) => storage.set(key, String(val)),
      removeItem: key => storage.delete(key),
    },
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', testContext);

  const instance = Object.create(testContext.App.prototype);
  assert.equal(instance.isSummaryClosed(), false);

  // Every launch starts closed; the user can open it during this session.
  instance.initSummaryToggle();
  assert.equal(sidebar.classList.contains('summary-closed'), true);
  toggleListener();
  assert.equal(sidebar.classList.contains('summary-closed'), false);

  // 토글 클릭 -> 닫힘으로 전환 및 localStorage 저장
  toggleListener();
  assert.equal(sidebar.classList.contains('summary-closed'), true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(storage.get('device-summary-closed-v1'), '1');
  assert.equal(instance.isSummaryClosed(), true);

  // 다음 접속(앱 재실행) 시뮬레이션: 새 인스턴스 생성
  const relaunched = Object.create(testContext.App.prototype);
  const newSidebar = { classList: new Set(), style: {} };
  newSidebar.classList.toggle = sidebar.classList.toggle;
  newSidebar.classList.contains = sidebar.classList.contains;
  const newButtonAttrs = {};
  const newButton = {
    setAttribute(k, v) { newButtonAttrs[k] = String(v); },
    getAttribute(k) { return newButtonAttrs[k]; },
    addEventListener(evt, fn) { if (evt === 'click') toggleListener = fn; },
  };
  doc.getElementById = id => id === 'summarySidebar' ? newSidebar : (id === 'btnToggleSummary' ? newButton : null);

  relaunched.initSummaryToggle();
  assert.equal(newSidebar.classList.contains('summary-closed'), true);
  assert.equal(newButton.getAttribute('aria-expanded'), 'false');

  // 다시 클릭 -> 열림 상태로 전환 및 localStorage 키 삭제
  toggleListener();
  assert.equal(newSidebar.classList.contains('summary-closed'), false);
  assert.equal(newButton.getAttribute('aria-expanded'), 'true');
  assert.equal(storage.has('device-summary-closed-v1'), false);
  assert.equal(relaunched.isSummaryClosed(), false);
});

function deviceSummaryHarness() {
  const storage = new Map();
  const disk = new Map();
  const session = new Map();
  const sidebar = { classList: { closed: false, toggle(_, value) { this.closed = value; }, contains() { return this.closed; } }, querySelectorAll: () => [], querySelector: () => null };
  const toolbar = { classList: { closed: false, toggle(_, value) { this.closed = value; }, contains() { return this.closed; } }, contains:()=>false, setAttribute(){} };
  const toolbarButton = { setAttribute(){}, addEventListener(){}, focus(){} };
  let failLocal = false;
  const ctx = vm.createContext({
    window: { addEventListener() {} },
    document: {
      getElementById: id => id === 'summarySidebar' ? sidebar : id === 'collapsibleToolbarActions' ? toolbar : id === 'btnToggleToolbarActions' ? toolbarButton : null,
      createElement: tag => ({ tagName: String(tag).toUpperCase(), className: '', style: {}, children: [], append(){}, appendChild(c){ return c; }, replaceChildren(){ this.children = []; }, setAttribute(){}, getAttribute(){}, addEventListener(){}, querySelectorAll: () => [] }),
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => { if (failLocal) throw Error('quota'); storage.set(key, value); },
      removeItem: key => storage.delete(key),
    },
    sessionStorage: {
      getItem: key => session.get(key) || null,
      setItem: (key, value) => session.set(key, value),
      removeItem: key => session.delete(key),
    },
    console,
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', ctx);
  const cookies = new Map();
  Object.defineProperty(ctx.document, 'cookie', {
    get: () => [...cookies].map(([key,value]) => `${key}=${value}`).join('; '),
    set: value => { const pair=value.split(';')[0], at=pair.indexOf('='); cookies.set(pair.slice(0,at),pair.slice(at+1)); },
  });
  const create = () => { const app = Object.create(ctx.App.prototype); app.syncMainColumnWidths = () => {}; return app; };
  const store = async (key, value) => { if (value !== undefined) disk.set(key, structuredClone(value)); return disk.get(key); };
  return { storage, session, disk, sidebar, toolbar, cookies, create, store, failLocal() { failLocal = true; }, ctx };
}

test('summary closed state survives restart with full localStorage and remains device-local', async () => {
  const h = deviceSummaryHarness();
  const first = h.create();
  await first.restoreDeviceSummaryState(h.store);
  h.failLocal();
  first.setSummaryClosed(true);
  await first.summaryStateWrite;
  assert.equal(first.isSummaryClosed(), true);
  const reopened = h.create();
  await reopened.restoreDeviceSummaryState(h.store);
  assert.equal(reopened.isSummaryClosed(), true);
  assert.equal(h.sidebar.classList.closed, true);
  reopened.setSummaryClosed(false);
  await reopened.summaryStateWrite;
  const again = h.create();
  await again.restoreDeviceSummaryState(h.store);
  assert.equal(again.isSummaryClosed(), false);
  const otherDevice = deviceSummaryHarness();
  const otherApp = otherDevice.create();
  await otherApp.restoreDeviceSummaryState(otherDevice.store);
  assert.equal(otherApp.isSummaryClosed(), false);
});

test('summary toggle during startup wins over an older asynchronous disk result', async () => {
  const h = deviceSummaryHarness();
  let release;
  const app = h.create();
  const loading = app.restoreDeviceSummaryState((key, value) => value !== undefined || release ? h.store(key, value) : new Promise(resolve => { release = resolve; }));
  app.setSummaryClosed(true);
  release({ closed: false, updatedAt: Date.now() + 10000 });
  await loading;
  assert.equal(app.isSummaryClosed(), true);
  assert.equal(h.sidebar.classList.closed, true);
  assert.equal(h.disk.get('device-summary-state-v1').closed, true);
});

test('toolbar collapsed state survives restarts with unavailable localStorage and stays device-local', async () => {
  const h=deviceSummaryHarness();
  const first=h.create();
  await first.restoreDeviceToolbarState(h.store);
  h.failLocal();
  first.setToolbarActionsClosed(true);
  await first.toolbarStateWrite;
  const reopened=h.create();
  await reopened.restoreDeviceToolbarState(h.store);
  assert.equal(h.toolbar.classList.closed,true);
  reopened.setToolbarActionsClosed(false);
  await reopened.toolbarStateWrite;
  const again=h.create();
  await again.restoreDeviceToolbarState(h.store);
  assert.equal(h.toolbar.classList.closed,false);
  const other=deviceSummaryHarness();
  await other.create().restoreDeviceToolbarState(other.store);
  assert.equal(other.toolbar.classList.closed,false);
});

test('toolbar migrates existing local setting and startup toggles win over delayed disk restore', async () => {
  const h=deviceSummaryHarness();
  h.storage.set('PT_TOOLBAR_ACTIONS_COLLAPSED_V1','true');
  const app=h.create();
  app.initToolbarActionsToggle();
  assert.equal(h.toolbar.classList.closed,true);
  await app.restoreDeviceToolbarState(h.store);
  assert.equal(h.disk.get('device-toolbar-state-v1').closed,true);
  let release;
  const reopened=h.create();
  const loading=reopened.restoreDeviceToolbarState((key,value)=>value!==undefined||release?h.store(key,value):new Promise(resolve=>{release=resolve;}));
  reopened.setToolbarActionsClosed(false);
  release({closed:true,updatedAt:Date.now()+10000});
  await loading;
  assert.equal(h.toolbar.classList.closed,false);
  assert.equal(h.disk.get('device-toolbar-state-v1').closed,false);
});

test('rapid panel toggles serialize slow disk writes and restore the last state with full localStorage', async () => {
  for (const kind of ['summary', 'toolbar']) {
    const h = deviceSummaryHarness();
    const app = h.create();
    const restore = kind === 'summary' ? 'restoreDeviceSummaryState' : 'restoreDeviceToolbarState';
    const toggle = kind === 'summary' ? 'setSummaryClosed' : 'setToolbarActionsClosed';
    const queue = kind === 'summary' ? 'summaryStateWrite' : 'toolbarStateWrite';
    const key = `device-${kind}-state-v1`;
    await app[restore](h.store);
    h.failLocal();
    let release, writes = 0;
    const slowStore = async (storeKey, value) => {
      if (value !== undefined) {
        writes++;
        if (writes === 1) await new Promise(resolve => { release = resolve; });
      }
      return h.store(storeKey, value);
    };
    app[kind === 'summary' ? 'summaryStateStore' : 'toolbarStateStore'] = slowStore;
    app[toggle](false);
    await Promise.resolve();
    app[toggle](true);
    await Promise.resolve();
    assert.equal(writes, 1, 'newer writes must wait for the older transaction');
    release();
    await app[queue];
    assert.equal(h.disk.get(key).closed, true);
    const reopened = h.create();
    await reopened[restore](h.store);
    assert.equal(h[kind === 'summary' ? 'sidebar' : 'toolbar'].classList.closed, true);
    reopened[toggle](false);
    await reopened[queue];
    await h.create()[restore](h.store);
    assert.equal(h[kind === 'summary' ? 'sidebar' : 'toolbar'].classList.closed, false);
  }
});

test('panel state survives immediate app closure before disk writes finish with full localStorage', async () => {
  const h=deviceSummaryHarness(), first=h.create();
  await first.restoreDeviceSummaryState(h.store);
  await first.restoreDeviceToolbarState(h.store);
  h.failLocal();
  const pendingDisk=()=>new Promise(()=>{});
  first.summaryStateStore=pendingDisk;
  first.toolbarStateStore=pendingDisk;
  first.setSummaryClosed(true);
  first.setToolbarActionsClosed(true);
  // Simulate a fresh app before either asynchronous write can complete.
  const reopened=h.create();
  reopened.initSummaryToggle();reopened.initToolbarActionsToggle();
  assert.equal(h.sidebar.classList.closed,true);
  assert.equal(h.toolbar.classList.closed,true);
  await reopened.restoreDeviceSummaryState(h.store);
  await reopened.restoreDeviceToolbarState(h.store);
  assert.equal(h.sidebar.classList.closed,true,'older disk state must not reopen the summary');
  assert.equal(h.toolbar.classList.closed,true,'older disk state must not reopen the tools');
  reopened.summaryStateStore=pendingDisk;reopened.toolbarStateStore=pendingDisk;
  reopened.setSummaryClosed(false);reopened.setToolbarActionsClosed(false);
  const again=h.create();again.initSummaryToggle();again.initToolbarActionsToggle();
  assert.equal(h.sidebar.classList.closed,true);
  assert.equal(h.toolbar.classList.closed,false);
});

test('current-date search checkbox remembers both states per device including immediate closure with full storage', async () => {
  const h=deviceSummaryHarness(), first=h.create();
  first.initCurrentDateSearchPreference();
  assert.equal(first.includeCurrentDateSearch,false);
  await first.restoreCurrentDateSearchPreference(h.store);
  h.failLocal();first.setIncludeCurrentDateSearch(true);
  await first.currentDateSearchPreferenceWrite;
  const reopened=h.create();reopened.initCurrentDateSearchPreference();
  await reopened.restoreCurrentDateSearchPreference(h.store);
  assert.equal(reopened.includeCurrentDateSearch,true);
  reopened.currentDateSearchPreferenceStore=()=>new Promise(()=>{});
  reopened.setIncludeCurrentDateSearch(false);
  const again=h.create();again.initCurrentDateSearchPreference();
  assert.equal(again.includeCurrentDateSearch,false,'unchecked is saved synchronously before app closure');
  await again.restoreCurrentDateSearchPreference(h.store);
  assert.equal(again.includeCurrentDateSearch,false,'older checked disk snapshot must not override unchecked');
  const anotherDevice=deviceSummaryHarness(), other=anotherDevice.create();
  other.initCurrentDateSearchPreference();await other.restoreCurrentDateSearchPreference(anotherDevice.store);
  assert.equal(other.includeCurrentDateSearch,false);
});

test('changing current-date search during startup wins over delayed stored preference', async () => {
  const h=deviceSummaryHarness(),app=h.create();let release;
  app.initCurrentDateSearchPreference();
  const loading=app.restoreCurrentDateSearchPreference((key,value)=>value!==undefined||release?h.store(key,value):new Promise(resolve=>{release=resolve;}));
  app.setIncludeCurrentDateSearch(true);
  release({enabled:false,updatedAt:Date.now()+10000});
  await loading;await app.currentDateSearchPreferenceWrite;
  assert.equal(app.includeCurrentDateSearch,true);
  assert.equal(h.disk.get('device-current-date-search-v1').enabled,true);
});

test('device-remembered summary and toolbar collapsed state syncs with documentElement and restores across relaunches', async () => {
  const h = deviceSummaryHarness();
  const docElement = { classList: new Set() };
  docElement.classList.toggle = function(cls, val) { if (val) this.add(cls); else this.delete(cls); };
  docElement.classList.contains = function(cls) { return this.has(cls); };
  h.document = { documentElement: docElement };

  const first = h.create();
  first.initSummaryToggle();
  first.initToolbarActionsToggle();
  assert.equal(first.isSummaryClosed(), true);
  assert.equal(h.sidebar.classList.closed, true);
  assert.equal(h.toolbar.classList.closed, false);

  // 사용자가 현황창을 닫고 빠른도구를 접음
  first.setSummaryClosed(true);
  first.setToolbarActionsClosed(true);
  assert.equal(first.isSummaryClosed(), true);
  assert.equal(h.sidebar.classList.closed, true);
  assert.equal(h.toolbar.classList.closed, true);

  // 앱 재실행 시뮬레이션: 새로운 앱 인스턴스
  const relaunched = h.create();
  relaunched.initSummaryToggle();
  relaunched.initToolbarActionsToggle();
  assert.equal(relaunched.isSummaryClosed(), true, '앱 재실행 시 현황창 닫힘 상태 복원');
  assert.equal(h.sidebar.classList.closed, true, '현황창 DOM 클래스 닫힘 유지');
  assert.equal(h.toolbar.classList.closed, true, '빠른도구 DOM 클래스 접힘 유지');

  // 사용자가 현황창과 빠른도구를 다시 엶
  relaunched.setSummaryClosed(false);
  relaunched.setToolbarActionsClosed(false);
  assert.equal(relaunched.isSummaryClosed(), false);
  assert.equal(h.sidebar.classList.closed, false);
  assert.equal(h.toolbar.classList.closed, false);

  // 다시 앱 재실행 시뮬레이션: 열림 상태가 정상 유지되는지 확인
  const again = h.create();
  again.initSummaryToggle();
  again.initToolbarActionsToggle();
  assert.equal(again.isSummaryClosed(), true, 'Every new launch starts with the summary closed');
  assert.equal(h.sidebar.classList.closed, true, 'Startup never reopens the summary');
  assert.equal(h.toolbar.classList.closed, false, '빠른도구 DOM 열림 유지');
});

test('device panel states survive code update reload and retain state via multi-tier fallback (sessionStorage, localStorage, cookie, disk)', async () => {
  const h = deviceSummaryHarness();
  const sessionStore = new Map();
  h.sessionStorage = {
    getItem: key => sessionStore.get(key) || null,
    setItem: (key, val) => sessionStore.set(key, String(val)),
    removeItem: key => sessionStore.delete(key),
  };

  const app1 = h.create();
  app1.initSummaryToggle();
  app1.initToolbarActionsToggle();

  // 사용자가 빠른 도구와 현황창을 모두 접어둠
  app1.setSummaryClosed(true);
  app1.setToolbarActionsClosed(true);
  assert.equal(app1.isSummaryClosed(), true);

  // 코드 업데이트 직전 flushDevicePanelStates 시뮬레이션
  app1.flushDevicePanelStates();

  // 코드 업데이트 상황: 캐시 교체 및 페이지 리로드 시뮬레이션
  // localStorage의 SNAPSHOT이 일시적으로 날아가더라도 sessionStorage나 쿠키, 디스크에 보존됨
  h.storage.delete('device-summary-closed-v1_SNAPSHOT');
  h.storage.delete('PT_TOOLBAR_ACTIONS_COLLAPSED_V1_SNAPSHOT');

  const reloaded = h.create();
  // 동기 인스턴스 초기화
  reloaded.initSummaryToggle();
  reloaded.initToolbarActionsToggle();

  // 쿠키 및 세션스토리지를 통해 닫힘 상태가 유지됨
  assert.equal(reloaded.isSummaryClosed(), true, '코드 업데이트 후 세션/쿠키 폴백으로 현황창 닫힘 유지');
  assert.equal(h.sidebar.classList.closed, true, '현황창 DOM 닫힘 유지');
  assert.equal(h.toolbar.classList.closed, true, '빠른도구 DOM 접힘 유지');

  // 비동기 IndexedDB 복원 실행 시에도 기존 상태 보존 확인
  await reloaded.restoreDeviceSummaryState(h.store);
  await reloaded.restoreDeviceToolbarState(h.store);
  assert.equal(reloaded.isSummaryClosed(), true, 'IndexedDB 복원 후에도 현황창 닫힘 상태 완벽 보존');
  assert.equal(h.sidebar.classList.closed, true, '복원 후 현황창 DOM 클래스 닫힘 유지');
  assert.equal(h.toolbar.classList.closed, true, '복원 후 빠른도구 DOM 클래스 접힘 유지');
});

test('disk state is not overwritten by blank initial state when local storage is cleared across updates', async () => {
  const h = deviceSummaryHarness();
  const app = h.create();
  await app.restoreDeviceSummaryState(h.store);
  await app.restoreDeviceToolbarState(h.store);

  // 사용자가 현황창을 닫고 디스크에 기록됨
  app.setSummaryClosed(true);
  app.setToolbarActionsClosed(true);
  await app.summaryStateWrite;
  await app.toolbarStateWrite;

  // 기기에서 업데이트나 브라우저 재설정 등으로 로컬 스토리지와 쿠키가 모두 비워진 극단적 상황 시뮬레이션
  h.storage.clear();
  h.cookies.clear();

  const restarted = h.create();
  restarted.initSummaryToggle();
  restarted.initToolbarActionsToggle();

  // 로컬 스토리지가 비었어도 restoreDeviceSummaryState가 실행되면 디스크(IndexedDB)의 유효한 설정이 복원되어야 함
  await restarted.restoreDeviceSummaryState(h.store);
  await restarted.restoreDeviceToolbarState(h.store);

  assert.equal(restarted.isSummaryClosed(), true, '디스크의 유효한 닫힘 설정이 복원됨');
  assert.equal(h.sidebar.classList.closed, true, 'DOM 클래스도 닫힘 상태로 동기화됨');
  assert.equal(h.toolbar.classList.closed, true, '빠른도구 DOM 클래스도 접힘 상태로 동기화됨');
});

test('closing panels and closing app immediately (stale disk open state) preserves closed state on relaunch', async () => {
  const h = deviceSummaryHarness();

  // 1. 과거에 디스크에 '열림' 상태(closed: false)가 저장되어 있던 상황
  await h.store("device-summary-state-v1", { closed: false, updatedAt: 1000 });
  await h.store("device-toolbar-state-v1", { closed: false, updatedAt: 1000 });

  // 2. 사용자가 창을 열어서 사용하다가 창들을 닫음
  const app1 = h.create();
  app1.initSummaryToggle();
  app1.initToolbarActionsToggle();

  app1.setSummaryClosed(true);
  app1.setToolbarActionsClosed(true);

  // 3. 사용자가 곧바로 앱을 종료함: sessionStorage 초기화되고 디스크에는 과거 값 남아있음
  // (앱 재시작 시뮬레이션)
  const app2 = h.create();
  app2.initSummaryToggle();
  app2.initToolbarActionsToggle();

  assert.equal(app2.isSummaryClosed(), true, '재실행 시 로컬 스토리지 닫힘 상태 즉시 유지');
  assert.equal(h.sidebar.classList.closed, true);
  assert.equal(h.toolbar.classList.closed, true);

  // 비동기 IndexedDB 복원이 뒤늦게 실행되더라도, 디스크의 과거 열림 상태로 덮어쓰지 않아야 함!
  await app2.restoreDeviceSummaryState(h.store);
  await app2.restoreDeviceToolbarState(h.store);

  assert.equal(app2.isSummaryClosed(), true, '비동기 디스크 복원 후에도 닫힘 상태 완벽 보존');
  assert.equal(h.sidebar.classList.closed, true);
  assert.equal(h.toolbar.classList.closed, true);

  // 디스크 또한 최신 로컬 상태(closed: true)로 자동 동기화(write-back)되었는지 확인
  const diskSummary = await h.store("device-summary-state-v1");
  const diskToolbar = await h.store("device-toolbar-state-v1");
  assert.equal(diskSummary.closed, true, '디스크에 최신 닫힘 상태 동기화 완료');
  assert.equal(diskToolbar.closed, true, '디스크에 최신 도구 접힘 상태 동기화 완료');
});

test('header summary count button displays daily total and toggles summary sidebar', () => {
  const h = deviceSummaryHarness();
  const headerCountEl = { textContent: '0' };
  const headerBtn = {
    title: '',
    attributes: {},
    _hasToggleListener: false,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    listeners: {},
    addEventListener(evt, fn) { this.listeners[evt] = fn; },
    click() { if (this.listeners['click']) this.listeners['click'](); }
  };

  const origGetElementById = h.ctx.document.getElementById;
  h.ctx.document.getElementById = id => {
    if (id === 'headerTotalCount') return headerCountEl;
    if (id === 'btnHeaderSummaryCount') return headerBtn;
    return origGetElementById(id);
  };

  const app = h.create();
  app.elHeaderTotalCount = headerCountEl;
  app.elBtnHeaderSummaryCount = headerBtn;
  app.dataStore = {
    '2026-10-19': [
      { name: '환자A', prescription: '도수' },
      { name: '환자B', prescription: '물리' },
      { name: '', prescription: '' }
    ]
  };
  app.currentDate = '2026-10-19';

  app.initSummaryToggle();
  assert.equal(headerBtn.getAttribute('aria-expanded'), 'false');
  headerBtn.click();
  assert.equal(headerBtn.getAttribute('aria-expanded'), 'true');

  // 통계 업데이트 시 헤더 버튼의 환자 수 갱신 확인
  app.updateSidebarStats();
  assert.equal(headerCountEl.textContent, '2', '유효 환자 2명이 헤더 카운트에 반영됨');

  // 헤더 버튼 클릭 시 요약창 닫힘 토글 확인
  headerBtn.click();
  assert.equal(app.isSummaryClosed(), true, '헤더 버튼 클릭으로 요약창 닫힘');
  assert.equal(headerBtn.getAttribute('aria-expanded'), 'false');
  assert.ok(headerBtn.title.includes('열기'));

  // 다시 클릭 시 요약창 열림 토글 확인
  headerBtn.click();
  assert.equal(app.isSummaryClosed(), false, '헤더 버튼 다시 클릭으로 요약창 열림');
  assert.equal(headerBtn.getAttribute('aria-expanded'), 'true');
  assert.ok(headerBtn.title.includes('접기'));
});

test('monthly summary table shows totals before averages and follows weekday and week filters', () => {
  function createMockElement(tag, text, className) {
    const children = [];
    const el = {
      tagName: tag.toUpperCase(),
      textContent: text || '',
      className: className || '',
      dataset: {},
      attributes: {},
      children,
      append(...args) {
        for (const arg of args) children.push(arg);
      },
      appendChild(child) {
        children.push(child);
        return child;
      },
      replaceChildren(...args) {
        children.length = 0;
        for (const arg of args) children.push(arg);
      },
      setAttribute(k, v) { el.attributes[k] = String(v); },
      getAttribute(k) { return el.attributes[k]; },
      addEventListener() {},
      remove() {},
      querySelectorAll() { return []; },
      querySelector() { return null; },
    };
    return el;
  }

  const statCard = createMockElement('div', '', 'stat-card');
  const sidebar = createMockElement('aside', '', 'excel-sidebar');
  sidebar.id = 'summarySidebar';
  sidebar.classList = { toggle() {}, contains() { return false; }, add() {}, delete() {} };
  sidebar.querySelector = (sel) => (sel === '.stat-card' ? statCard : null);
  sidebar.append(statCard);
  statCard.after = (newEl) => { sidebar.append(newEl); };

  const testDoc = {
    createElement: (tag) => createMockElement(tag),
    getElementById: (id) => {
      if (id === 'summarySidebar') return sidebar;
      if (id === 'summaryAnalytics') return sidebar.children.find(c => c.id === 'summaryAnalytics') || null;
      return null;
    },
    querySelectorAll: () => [],
    querySelector: () => null,
  };

  const testContext = vm.createContext({
    document: testDoc,
    window: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', testContext);
  const instance = Object.create(testContext.App.prototype);
  instance.currentDate = '2026-10-18';
  instance.summaryMonth = '2026-10';
  instance.dataStore = {
    '2026-10-05': [{ name: '환자1' }], // 월요일 (1)
    '2026-10-06': [{ name: '환자2' }], // 화요일 (2)
    '2026-10-11': [{ name: '환자3' }], // 일요일 (0)
    '2026-10-12': [{ name: '가상4' }, { name: '가상5' }], // 다음 주 월요일
  };

  // 1. 모든 요일 선택 시
  const dates = instance.getSummaryDates('month', true);
  const selectedDates = dates;
  const summary = instance.getDailySummary(selectedDates.flatMap(e => e.rows));
  instance.renderSummaryAnalytics('month', dates, selectedDates, summary);

  const panel = sidebar.children.find(c => c.id === 'summaryAnalytics');
  assert.ok(panel);
  const tablesContainer = panel.children.find(c => c.className === 'summary-average-tables');
  assert.ok(tablesContainer);

  // 별도의 '요일별 일평균 · 선택한 주 기준' 테이블 제목은 없어야 함
  const titles = tablesContainer.children.filter(c => c.tagName === 'H5').map(c => c.textContent);
  assert.ok(!titles.includes('요일별 일평균 · 선택한 주 기준'), '별도 요일별 일평균 테이블은 없어야 함');
  assert.ok(titles.some(t => t.includes('주별·요일별 일평균')), '주별·요일별 일평균 테이블 존재');

  // 테이블 내부에 맨 아래 행이 '평균'이어야 함
  const scroll = tablesContainer.children.find(c => c.className === 'summary-table-scroll');
  const table = scroll.children.find(c => c.tagName === 'TABLE');
  const tbody = table.children.find(c => c.tagName === 'TBODY');
  const lastRow = tbody.children[tbody.children.length - 1];
  assert.equal(lastRow.children[0].textContent, '평균', '마지막 행의 제목은 평균');
  assert.equal(lastRow.className, 'summary-row-highlight', '평균 행에 하이라이트 클래스 적용');
  const totalRow = tbody.children.at(-2);
  assert.equal(totalRow.className, 'summary-row-highlight', '합계 행도 강조 표시');
  assert.deepEqual(totalRow.children.map(cell => cell.textContent),
    ['합계', '3', '1', '0', '0', '0', '0', '1', '5', '1.3'],
    '요일별 실제 건수를 합산하고 일평균은 전체 4개 기록일로 계산');
  assert.equal(lastRow.children.at(-2).textContent, '2.5', '기존 주평균 유지');

  // 2. 일요일(0) 제외 시
  instance.summaryWeekdays = [1, 2, 3, 4, 5, 6];
  const datesFiltered = instance.getSummaryDates('month', true);
  instance.renderSummaryAnalytics('month', dates, datesFiltered, summary);

  const panel2 = sidebar.children.find(c => c.id === 'summaryAnalytics');
  const tablesContainer2 = panel2.children.find(c => c.className === 'summary-average-tables');
  const scroll2 = tablesContainer2.children.find(c => c.className === 'summary-table-scroll');
  const table2 = scroll2.children.find(c => c.tagName === 'TABLE');
  const thead2 = table2.children.find(c => c.tagName === 'THEAD');
  const headerRow = thead2.children[0];
  const headers = headerRow.children.map(th => th.textContent);
  assert.ok(!headers.includes('일'), '제외된 일요일 열은 헤더에 포함되지 않아야 함');
  assert.ok(headers.includes('월'), '선택된 월요일 열은 헤더에 포함됨');
  const body2 = table2.children.find(c => c.tagName === 'TBODY');
  assert.deepEqual(body2.children.at(-2).children.map(cell => cell.textContent),
    ['합계', '3', '1', '0', '0', '0', '0', '4', '1.3'], '선택한 요일만 합산');

  instance.summaryWeeks = [3];
  const filtered = instance.getSummaryDates('month', true);
  instance.renderSummaryAnalytics('month', dates, filtered, instance.getDailySummary(filtered.flatMap(entry => entry.rows)));
  const getTotalCells = () => {
    const panel = sidebar.children.find(c => c.id === 'summaryAnalytics');
    const tables = panel.children.find(c => c.className === 'summary-average-tables');
    const scroll = tables.children.find(c => c.className === 'summary-table-scroll');
    const body = scroll.children[0].children.find(c => c.tagName === 'TBODY');
    assert.equal(body.children.at(-1).children[0].textContent, '평균');
    return body.children.at(-2).children.map(cell => cell.textContent);
  };
  assert.deepEqual(getTotalCells(), ['합계', '2', '0', '0', '0', '0', '0', '2', '2.0'], '선택한 주만 합산');
  instance.summaryWeeks = [];
  instance.renderSummaryAnalytics('month', dates, [], instance.getDailySummary([]));
  assert.deepEqual(getTotalCells(), ['합계', '0', '0', '0', '0', '0', '0', '0', '—'], '선택 기록이 없으면 합계 0과 일평균 없음 표시');
});

test('hanraeng bug rows without patient details are excluded from daily and period summary counts', () => {
  // 1. 환자 정보 없이 처방에만 "한랭 ( ICE / Laser )" 또는 "한랭"이 있고 작성자 이니셜이나 행 번호만 있는 유령 행
  const testRows = [
    // 정상 환자 1: 성함 + 처방 한랭
    { name: '김환자', chartNo: '1001', prescription: '한랭 ( ICE / Laser )', gender: 'M', writer: 'J' },
    // 정상 환자 2: 부위 + 처방 한랭
    { part: '요추', prescription: '한랭', writer: 'J' },
    // 정상 환자 3: 일반 치료
    { name: '이환자', prescription: '사지 ( HP / Laser )', gender: 'F', writer: 'J' },
    // 버그 행들: 환자 정보(성함, 차트번호, 부위, 추가사항, 성별, 메모 등)가 전무하고 처방에만 한랭 + 기본 writer
    { no: 4, prescription: '한랭 ( ICE / Laser )', writer: 'J', memo: '' },
    { no: 5, prescription: '한랭', writer: 'J' },
    { prescription: '한랭 ( ICE / Laser )' },
    { no: 7, prescription: '  한랭  ', writer: '' },
    // 완전 빈 행
    { no: 8, writer: 'J' },
  ];

  const daily = app.getDailySummary(testRows);
  // 정상 환자 3명만 집계되어야 함 (버그 행 4개는 완전 배제)
  assert.equal(daily.total, 3, '총 환자 수는 정상 환자 3명이어야 함');
  assert.equal(daily.prescriptions.get('한랭 ( ICE / Laser )'), 1, '한랭 ( ICE / Laser ) 처방은 정상 환자 1건만 카운트');
  assert.equal(daily.prescriptions.get('한랭'), 1, '한랭 처방은 정상 환자 1건만 카운트');
  assert.equal(daily.prescriptions.get('사지 ( HP / Laser )'), 1, '일반 처방 1건 카운트');
  assert.equal(daily.male, 1);
  assert.equal(daily.female, 1);
  assert.equal(daily.unknown, 1); // 요추 부위만 있는 환자 1명
});

