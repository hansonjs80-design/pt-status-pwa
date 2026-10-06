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
