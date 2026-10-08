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

  // 초기 로딩: 기본 열림 상태
  instance.initSummaryToggle();
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
  const sidebar = { classList: { closed: false, toggle(_, value) { this.closed = value; }, contains() { return this.closed; } } };
  let failLocal = false;
  const ctx = vm.createContext({
    window: { addEventListener() {} },
    document: { getElementById: id => id === 'summarySidebar' ? sidebar : null },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => { if (failLocal) throw Error('quota'); storage.set(key, value); },
      removeItem: key => storage.delete(key),
    },
    console,
  });
  vm.runInContext(require('./helpers/load-app-source.cjs') + '\nglobalThis.App = PTApp;', ctx);
  const create = () => { const app = Object.create(ctx.App.prototype); app.syncMainColumnWidths = () => {}; return app; };
  const store = async (key, value) => { if (value !== undefined) disk.set(key, structuredClone(value)); return disk.get(key); };
  return { storage, disk, sidebar, create, store, failLocal() { failLocal = true; } };
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
  const loading = app.restoreDeviceSummaryState((key, value) => value !== undefined ? h.store(key, value) : new Promise(resolve => { release = resolve; }));
  app.setSummaryClosed(true);
  release({ closed: false, updatedAt: Date.now() + 10000 });
  await loading;
  assert.equal(app.isSummaryClosed(), true);
  assert.equal(h.sidebar.classList.closed, true);
  assert.equal(h.disk.get('device-summary-state-v1').closed, true);
});
