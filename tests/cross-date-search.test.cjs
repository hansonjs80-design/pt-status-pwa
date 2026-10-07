const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function createDomMock() {
  const elements = new Map();
  function createElement(tag) {
    let _className = '';
    const _classes = new Set();
    const el = {
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      children: [],
      classList: {
        add(...cls) { cls.forEach(c => _classes.add(c)); _className = Array.from(_classes).join(' '); },
        remove(...cls) { cls.forEach(c => _classes.delete(c)); _className = Array.from(_classes).join(' '); },
        contains(c) { return _classes.has(c); },
      },
      hasAttribute(attr) {
        return this.dataset && Object.prototype.hasOwnProperty.call(this.dataset, attr.replace(/^data-/, ''));
      },
      getAttribute(attr) {
        return this.dataset ? this.dataset[attr.replace(/^data-/, '')] : null;
      },
      setAttribute(attr, val) {
        this.dataset = this.dataset || {};
        this.dataset[attr.replace(/^data-/, '')] = val;
      },
      replaceChildren(...nodes) {
        this.children = [];
        nodes.forEach(n => this.appendChild(n));
      },
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      insertBefore(newChild, refChild) {
        const idx = this.children.indexOf(refChild);
        if (idx >= 0) {
          this.children.splice(idx, 0, newChild);
        } else {
          this.children.push(newChild);
        }
        newChild.parentNode = this;
        return newChild;
      },
      remove() {
        if (this.parentNode) {
          const idx = this.parentNode.children.indexOf(this);
          if (idx >= 0) this.parentNode.children.splice(idx, 1);
          this.parentNode = null;
        }
      },
      querySelector(selector) {
        return querySelectorAll(selector)[0] || null;
      },
      querySelectorAll(selector) {
        return querySelectorAll(selector, this);
      },
      addEventListener(evt, handler) {
        this._listeners = this._listeners || {};
        this._listeners[evt] = this._listeners[evt] || [];
        this._listeners[evt].push(handler);
      },
      getBoundingClientRect() {
        return { width: 100, height: 28, top: 0, left: 0 };
      },
      scrollIntoView() {},
      focus() {},
    };
    Object.defineProperty(el, 'className', {
      get() { return _className; },
      set(val) {
        _className = val || '';
        _classes.clear();
        _className.split(/\s+/).filter(Boolean).forEach(c => _classes.add(c));
      },
    });
    return el;
  }

  function querySelectorAll(selector, root = docBody) {
    const matches = [];
    function traverse(node) {
      if (!node) return;
      if (matchesSelector(node, selector)) {
        matches.push(node);
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    }
    traverse(root);
    return matches;
  }

  function matchesSelector(node, selector) {
    if (selector.includes(',')) return selector.split(',').some(part => matchesSelector(node, part.trim()));
    if (selector.includes(':not(')) {
      const parts = selector.split(':not(');
      const base = parts[0].trim();
      const notParts = parts.slice(1).map(p => p.replace(/\)+$/, '').trim());
      if (base && !matchesSelector(node, base)) return false;
      for (const notSel of notParts) {
        if (matchesSelector(node, notSel)) return false;
      }
      return true;
    }
    if (selector.startsWith('#')) {
      return node.id === selector.slice(1);
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1).split('.')[0];
      return node.classList.contains(cls);
    }
    if (selector.toLowerCase() === node.tagName?.toLowerCase()) {
      return true;
    }
    return false;
  }

  const docBody = createElement('body');
  return {
    createElement,
    docBody,
    querySelectorAll,
  };
}

function createCrossDateTestApp() {
  const dom = createDomMock();
  const localStore = new Map();
  const context = vm.createContext({
    window: {
      addEventListener() {},
      getComputedStyle() { return { display: 'block' }; },
      requestAnimationFrame(cb) { cb(); },
    },
    document: {
      createElement: dom.createElement,
      getElementById: (id) => dom.querySelectorAll('#' + id)[0] || null,
      querySelector: (sel) => dom.querySelectorAll(sel)[0] || null,
      querySelectorAll: (sel) => dom.querySelectorAll(sel),
      activeElement: null,
    },
    localStorage: {
      getItem(k) { return localStore.has(k) ? localStore.get(k) : null; },
      setItem(k, v) { localStore.set(k, String(v)); },
      removeItem(k) { localStore.delete(k); },
    },
    requestAnimationFrame(cb) { cb(); },
    setTimeout(cb) { cb(); },
    clearTimeout() {},
    BASE_ROW_NUMBER: 1,
    DEFAULT_WRITER: '테스트',
  });

  vm.runInContext(
    require('./helpers/load-app-source.cjs') +
    '\nglobalThis.App = PTApp;',
    context
  );

  const app = Object.create(context.App.prototype);
  app.currentDate = '2026-10-04';

  app.elSheetContainer = dom.createElement('div');
  app.elTableBody = dom.createElement('tbody');
  app.elSearchInput = { value: '' };
  app.elBtnClearSearch = { style: {} };
  app.elCellAddress = { textContent: '' };
  app.elSelectedCellCoords = { textContent: '' };
  app.elFormulaInput = { value: '', readOnly: false };

  const bHeadersRow = dom.createElement('tr');
  bHeadersRow.className = 'business-headers-row';
  const thRowHeader = dom.createElement('th');
  thRowHeader.className = 'row-num-header';
  thRowHeader.textContent = '#';
  bHeadersRow.appendChild(thRowHeader);
  dom.docBody.appendChild(bHeadersRow);
  dom.docBody.appendChild(app.elTableBody);

  app.dataStore = {
    '2026-10-04': Array.from({ length: 25 }, (_, i) => ({ no: i + 1 })),
  };

  app.getCurrentRows = () => app.dataStore[app.currentDate] || [];
  app.getSearchDataStore = () => app.dataStore;
  app.loadSearchHistory = async () => {};
  app.renderTable = () => {
    const existingHistoryWrap = dom.querySelectorAll('#crossDateScrollWrap')[0];
    if (existingHistoryWrap) {
      app._preservedHistoryScrollTop = existingHistoryWrap.scrollTop;
    }
    app.restoreCurrentTableHeader?.();
    app.cancelFillDrag?.();
    if (!app._isPasting) {
      app.clearCrossDateSelection?.();
    }
    app.elTableBody.children = [];
    const rows = app.getCurrentRows();
    rows.forEach((r, idx) => {
      const rowEl = dom.createElement('tr');
      rowEl.className = 'excel-row';
      rowEl.dataset.rowIdx = idx;
      app.elTableBody.appendChild(rowEl);
    });
    if (app.elSearchInput?.value?.trim()) {
      app.searchAllDates(app.elSearchInput.value.trim(), undefined, { preserveCurrentSelection: true });
    }
  };
  app.renderClipboardSelection = () => {};
  app.saveDataStore = () => {};
  app.showSaveIndicator = () => {};
  app.selectCell = (rowIdx, colKey) => {
    app.activeCell = { rowIdx, colKey };
  };

  dom.getElementById = (id) => dom.querySelectorAll('#' + id)[0] || null;
  app.renderTable();

  return { app, dom, context };
}

test('cross-date search deduplicates identical previous records and toggles with # header', () => {
  const dom = createDomMock();
  const context = vm.createContext({
    window: {
      addEventListener() {},
      getComputedStyle() { return { display: 'block' }; },
      requestAnimationFrame(cb) { cb(); },
    },
    document: {
      createElement: dom.createElement,
      getElementById: (id) => dom.querySelectorAll('#' + id)[0] || null,
      querySelector: (sel) => dom.querySelectorAll(sel)[0] || null,
      querySelectorAll: (sel) => dom.querySelectorAll(sel),
      activeElement: null,
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    requestAnimationFrame(cb) { cb(); },
    setTimeout(cb) { cb(); },
    clearTimeout() {},
    BASE_ROW_NUMBER: 1,
    DEFAULT_WRITER: '테스트',
  });

  vm.runInContext(
    require('./helpers/load-app-source.cjs') +
    '\nglobalThis.App = PTApp;',
    context
  );

  const app = Object.create(context.App.prototype);
  app.currentDate = '2026-10-02';

  // 가상 DOM 요소 바인딩
  app.elSheetContainer = dom.createElement('div');
  app.elTableBody = dom.createElement('tbody');
  app.elSearchInput = { value: '' };
  app.elBtnClearSearch = { style: {} };
  app.elCellAddress = { textContent: '' };
  app.elSelectedCellCoords = { textContent: '' };
  app.elFormulaInput = { value: '', readOnly: false };

  // 헤더 생성
  const bHeadersRow = dom.createElement('tr');
  bHeadersRow.className = 'business-headers-row';
  const thRowHeader = dom.createElement('th');
  thRowHeader.className = 'row-num-header';
  thRowHeader.textContent = '#';
  bHeadersRow.appendChild(thRowHeader);
  dom.docBody.appendChild(bHeadersRow);
  dom.docBody.appendChild(app.elTableBody);

  // 현재 날짜 행 (20행 구성, 12행까지 내용 있음)
  const currentRowsData = Array.from({ length: 25 }, (_, i) => {
    if (i <= 12) {
      return { no: i + 1, name: `환자${i}`, chartNo: `C${i}`, part: '요추', prescription: 'HP' };
    }
    return { no: i + 1 };
  });

  app.dataStore = {
    '2026-10-02': currentRowsData,
    // 이전 날짜 1 (2026-10-01): 홍길동 동일 처방 1건
    '2026-10-01': [
      { no: 1, gender: 'M', chartNo: '1001', name: '홍길동', part: '경추', prescription: 'HP / Laser', extra: '견인', memo: '주의' },
    ],
    // 이전 날짜 2 (2026-09-30): 홍길동 동일 처방 1건 (No만 다름)
    '2026-09-30': [
      { no: 5, gender: 'M', chartNo: '1001', name: '홍길동', part: '경추', prescription: 'HP / Laser', extra: '견인', memo: '주의' },
    ],
    // 이전 날짜 3 (2026-09-29): 홍길동 다른 처방 1건 (부위 다름)
    '2026-09-29': [
      { no: 3, gender: 'M', chartNo: '1001', name: '홍길동', part: '요추', prescription: 'ICT', extra: '', memo: '' },
    ],
  };

  app.getCurrentRows = () => app.dataStore[app.currentDate];
  app.getSearchDataStore = () => app.dataStore;
  app.loadSearchHistory = async () => {};

  // 현재 날짜 테이블 렌더링 시뮬레이션
  currentRowsData.forEach((r, idx) => {
    const rowEl = dom.createElement('tr');
    rowEl.className = 'excel-row';
    rowEl.dataset.rowIdx = idx;
    app.elTableBody.appendChild(rowEl);
  });

  // '홍길동' 검색 실행
  app.searchAllDates('홍길동', 0);

  // 1. 현재 날짜 행 범위 검증:
  // 검색 중에도 내용 뒤의 빈행을 숨기지 않아 스크롤로 접근 가능.
  const row0 = app.elTableBody.children.find(c => c.dataset?.rowIdx === 0);
  const row3 = app.elTableBody.children.find(c => c.dataset?.rowIdx === 3);
  const row12 = app.elTableBody.children.find(c => c.dataset?.rowIdx === 12);
  const row15 = app.elTableBody.children.find(c => c.dataset?.rowIdx === 15);
  const row16 = app.elTableBody.children.find(c => c.dataset?.rowIdx === 16);

  // originIdx가 0이므로 범위 확장에 의해 row0 포함됨
  assert.equal(row3.style.display, '');
  assert.equal(row12.style.display, '');
  assert.equal(row15.style.display, '');
  assert.equal(row16.style.display, '');

  // 2. 이전 날짜 중복 제거 검증:
  // 총 3건 중 2건은 내용 동일(10/01과 09/30). 1건은 다른 내용(09/29).
  // 기본 모드(대표 행 모드)에서는 유니크한 2개 행만 나와야 함!
  assert.equal(app.isCrossDateExpanded, false);
  assert.equal(app.crossDateResults.length, 2);
  // 오래된 날짜가 위, 하단에 가장 최신 날짜(2026-10-01)의 행이 위치하며 중복 2건의 대표 행이어야 함
  assert.equal(app.crossDateResults[0]._sourceDate, '2026-09-29');
  assert.equal(app.crossDateResults[1]._sourceDate, '2026-10-01');
  assert.equal(app.crossDateResults[1]._dupCount, 2);

  // ★ 창이 열리면 마우스 드래그 상태가 절대 켜져있지 않아야 함 (마우스 움직임 시 임의 선택 방지)
  assert.equal(app.isSelectingCrossDate, false);

  // ★ 창이 열리면 가장 아래 마지막 행(index 1, 최근 날짜)이 선택되어 있어야 함
  assert.equal(app.isCrossDateRowSelected, true);
  assert.equal(app.crossDateSelection.startRow, 1);
  assert.equal(app.crossDateSelection.endRow, 1);
  // 선택 테두리는 No.(col 0)부터 특이사항(col 9)까지만 설정
  assert.equal(app.crossDateSelection.startCol, 0);
  assert.equal(app.crossDateSelection.endCol, 9);

  // 3. # 헤더 클릭 시 전체 보기 토글 검증:
  app.toggleCrossDateExpanded();
  assert.equal(app.isCrossDateExpanded, true);
  // 전체 펼침 모드에서는 3건 모두 표시되어야 함!
  assert.equal(app.crossDateResults.length, 3);
  assert.equal(app.isSelectingCrossDate, false);

  // 다시 한 번 토글하면 대표 행 모드로 복귀 (2건)
  app.toggleCrossDateExpanded();
  assert.equal(app.isCrossDateExpanded, false);
  assert.equal(app.crossDateResults.length, 2);
  assert.equal(app.isSelectingCrossDate, false);

  // Drag must remain active across every entered cell, including columns right of name.
  app.selectCrossDateCell(0, 2);
  app.isSelectingCrossDate = true;
  for (let col = 3; col <= 9; col++) {
    app.selectCrossDateCell(0, col, true);
    assert.equal(app.isSelectingCrossDate, true);
    assert.equal(app.crossDateSelection.maxCol, col);
  }
  app.clearCrossDateSelection();
  assert.equal(app.isSelectingCrossDate, false);

  // A confirmed two-character name must not include longer names or another patient's memo.
  app.dataStore['2026-09-28'] = [
    { name: '김선', chartNo: 'N001', part: '목' },
    { name: '김선자', chartNo: 'N002', part: '허리' },
    { name: '김선호', chartNo: 'N003', part: '발목' },
    { name: '다른환자', chartNo: 'N004', memo: '김선' },
  ];
  app.searchAllDates('김선', 0);
  assert.equal(app.crossDateResults.length, 1);
  assert.equal(app.crossDateResults[0].name, '김선');
  app.toggleCrossDateExpanded();
  assert.equal(app.crossDateResults.length, 1);
  app.searchAllDates('김선자', 0);
  assert.equal(app.crossDateResults.length, 1);
  assert.equal(app.crossDateResults[0].name, '김선자');
  app.searchAllDates('김', 0);
  assert.equal(app.crossDateResults.length, 0);
  // Other fields can still be searched when the query is not a patient name.
  app.searchAllDates('발목', 0);
  assert.equal(app.crossDateResults.length, 1);
  assert.equal(app.crossDateResults[0].name, '김선호');

  // Editing/repainting the daily table and refreshing history cannot select its last row.
  const editingCell = { rowIdx: 20, colKey: 'memo' };
  app.clearCrossDateSelection();
  app.activeCell = editingCell;
  app.selectedRange = { minRow: 20, maxRow: 20, minCol: 8, maxCol: 8 };
  app.searchAllDates('김선', undefined, { preserveCurrentSelection: true });
  assert.equal(app.activeCell, editingCell);
  assert.equal(app.crossDateSelection, null);
  assert.equal(app.crossDateResults[0].name, '김선');
  assert.equal(app.selectedRange.minRow, 20);
  assert.equal(app.elTableBody.children.find(c => c.dataset?.rowIdx === 20).style.display, '');
  // A delayed history fetch must also preserve pasted row selection with no active cell.
  app.activeCell = null;
  app.selectedRowRange = { minRow: 20, maxRow: 21 };
  const pastedRange = { minRow: 20, maxRow: 21, minCol: 0, maxCol: 9 };
  app.selectedRange = pastedRange;
  app.searchAllDates('김선', undefined, { preserveCurrentSelection: true });
  assert.equal(app.crossDateSelection, null);
  assert.equal(app.selectedRange, pastedRange);
  assert.equal(app.selectedRowRange.minRow, 20);
  // An explicit new search still selects the latest history row as before.
  app.searchAllDates('김선', 20);
  assert.equal(app.crossDateSelection.startCol, 0);
  assert.equal(app.crossDateSelection.endCol, 9);
  // A search launched from the bottom must keep the first daily row reachable.
  assert.equal(app.elTableBody.children.find(c => c.dataset?.rowIdx === 0).style.display, '');
});

test('search period setting defaults to 6months, persists in localStorage, and filters by cutoff date', () => {
  const { app, context } = createCrossDateTestApp();
  assert.equal(app.getSearchPeriod(), '6months');

  // Test localStorage persistence
  app.setSearchPeriod('3months');
  assert.equal(app.getSearchPeriod(), '3months');
  assert.equal(context.localStorage.getItem('PT_SEARCH_PERIOD'), '3months');

  app.setSearchPeriod('1year_plus');
  assert.equal(app.getSearchPeriod(), '1year_plus');
  assert.equal(context.localStorage.getItem('PT_SEARCH_PERIOD'), '1year_plus');
  assert.equal(app.getSearchCutoffDate('1year_plus'), null);

  // Setup data across multiple past periods
  // currentDate: 2026-10-04
  app.dataStore['2026-09-01'] = [{ name: '최근환자', part: '목' }]; // ~1 month ago
  app.dataStore['2026-05-01'] = [{ name: '오개월전환자', part: '허리' }]; // ~5 months ago
  app.dataStore['2025-09-01'] = [{ name: '일년전환자', part: '어깨' }]; // ~13 months ago (1년 전)

  // 1) 3months: should find '최근환자', but NOT '오개월전환자' or '일년전환자'
  app.setSearchPeriod('3months');
  app.searchAllDates('최근환자', 0);
  assert.equal(app.crossDateResults.length, 1);
  assert.equal(app.crossDateResults[0].name, '최근환자');

  app.searchAllDates('오개월전환자', 0);
  assert.equal(app.crossDateResults.length, 0);

  app.searchAllDates('일년전환자', 0);
  assert.equal(app.crossDateResults.length, 0);

  // 2) 6months: should find '최근환자' and '오개월전환자', but NOT '일년전환자'
  app.setSearchPeriod('6months');
  app.searchAllDates('오개월전환자', 0);
  assert.equal(app.crossDateResults.length, 1);
  assert.equal(app.crossDateResults[0].name, '오개월전환자');

  app.searchAllDates('일년전환자', 0);
  assert.equal(app.crossDateResults.length, 0);

  // 3) 1year_plus: should find all, including '일년전환자'!
  app.setSearchPeriod('1year_plus');
  app.searchAllDates('일년전환자', 0);
  assert.equal(app.crossDateResults.length, 1);
  assert.equal(app.crossDateResults[0].name, '일년전환자');
});

test('multi-year search keeps identical yearly records and colors older month/day labels', () => {
  const { app, dom } = createCrossDateTestApp();
  const patient = { name: '연도환자', chartNo: 'YEAR-1', part: '무릎', prescription: 'HP' };
  for (const date of ['2024-09-01', '2025-08-31', '2025-09-01', '2026-08-31', '2026-09-01']) {
    app.dataStore[date] = [{ ...patient }];
  }
  const original = JSON.stringify(app.dataStore);
  app.setSearchPeriod('1year_plus');
  app.searchAllDates('연도환자', 0);

  assert.deepEqual(Array.from(app.crossDateResults, row => [row._sourceDate, row._dupCount]), [
    ['2024-09-01', 1], ['2025-09-01', 2], ['2026-09-01', 2],
  ]);
  const labels = dom.querySelectorAll('.cross-date-day');
  assert.deepEqual(labels.map(label => label.textContent), ['09/01', '09/01', '09/01']);
  assert.deepEqual(labels.map(label => label.classList.contains('cross-date-day-previous-year')), [true, true, false]);
  assert.deepEqual(labels.map(label => label.title), ['2024-09-01', '2025-09-01', '2026-09-01']);
  assert.equal(labels[0].getAttribute('aria-label'), '2024-09-01');

  app.toggleCrossDateExpanded();
  assert.deepEqual(Array.from(app.crossDateResults, row => [row._sourceDate, row._dupCount, Boolean(row._isSubRow)]), [
    ['2024-09-01', 1, false], ['2025-08-31', 2, true], ['2025-09-01', 2, false],
    ['2026-08-31', 2, true], ['2026-09-01', 2, false],
  ]);
  assert.equal(dom.querySelectorAll('.cross-date-day-previous-year').length, 3);
  app.toggleCrossDateExpanded();
  assert.equal(app.crossDateResults.length, 3);
  assert.equal(JSON.stringify(app.dataStore), original);
});

test('pasting into current table while history is visible preserves scroll positions', async () => {
  const { app, dom } = createCrossDateTestApp();
  app.dataStore['2026-09-01'] = [{ name: '이전환자', part: '무릎' }];
  app.searchAllDates('이전환자', 0);
  assert.equal(app.crossDateResults.length, 1);

  // Simulate scroll positions
  app.elSheetContainer.scrollTop = 320;
  app.elSheetContainer.scrollLeft = 50;

  const wrap = dom.getElementById('crossDateScrollWrap');
  if (wrap) wrap.scrollTop = 150;

  // Set active cell in current rows and perform paste
  app.activeCell = { rowIdx: 5, colKey: 'name' };
  app.selectedRange = null;

  await app.pasteSelection('이전환자\t무릎');

  // Verify scroll positions are preserved
  assert.equal(app.elSheetContainer.scrollTop, 320);
  assert.equal(app.elSheetContainer.scrollLeft, 50);
  const newWrap = dom.getElementById('crossDateScrollWrap');
  if (newWrap) {
    assert.equal(newWrap.scrollTop, 150);
  }
});

test('pasting preserves previous history cell selection and submitSearchPrompt auto-finds 1year_plus history', async () => {
  const { app, dom } = createCrossDateTestApp();
  app.dataStore['2025-05-01'] = [{ name: '고대환자', chartNo: 'OLD-999', part: '어깨' }];
  
  // 1) 기본 6개월 상태
  assert.equal(app.getSearchPeriod(), '6months');
  
  // 2) 이전 날짜 기록 선택 상태 시뮬레이션
  app.searchAllDates('고대환자', 0);
  // 6months이므로 아직 결과 없음
  assert.equal(app.crossDateResults.length, 0);

  // 1year_plus로 전환 후 검색
  app.setSearchPeriod('1year_plus');
  app.searchAllDates('고대환자', 0);
  assert.equal(app.crossDateResults.length, 1);

  // 셀 선택
  app.crossDateSelection = { startRow: 0, startCol: 3, endRow: 0, endCol: 4, minRow: 0, maxRow: 0, minCol: 3, maxCol: 4 };
  app.isCrossDateRowSelected = false;

  const wrap = dom.getElementById('crossDateScrollWrap');
  if (wrap) wrap.scrollTop = 220;

  // 복사 버퍼 설정
  app.clipboardBuffer = '고대환자\t어깨';
  app.clipboardSelection = { ...app.crossDateSelection, kind: 'history' };

  // 현재 날짜 2행에 붙여넣기
  app.activeCell = { rowIdx: 2, colKey: 'name' };
  await app.pasteSelection('고대환자\t어깨');

  // 붙여넣기 후에도 이전 날짜 선택과 스크롤이 유지되는지 검증
  assert.ok(app.crossDateSelection);
  assert.equal(app.crossDateSelection.minCol, 3);
  assert.equal(app.crossDateSelection.maxCol, 4);

  const updatedWrap = dom.getElementById('crossDateScrollWrap');
  if (updatedWrap) {
    assert.equal(updatedWrap.scrollTop, 220);
  }
});

