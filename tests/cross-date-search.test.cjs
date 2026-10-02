const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
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
    BASE_ROW_NUMBER: 1,
    DEFAULT_WRITER: '테스트',
  });

  vm.runInContext(
    readFileSync(resolve(__dirname, '../app.js'), 'utf8') +
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
  // 마지막 내용 행은 12번. 위로 10행(3~12), 아래로 빈행 3행(13~15). 총 3~15번 행만 보이고 나머지는 none이어야 함.
  const row0 = app.elTableBody.children.find(c => c.dataset?.rowIdx === 0);
  const row3 = app.elTableBody.children.find(c => c.dataset?.rowIdx === 3);
  const row12 = app.elTableBody.children.find(c => c.dataset?.rowIdx === 12);
  const row15 = app.elTableBody.children.find(c => c.dataset?.rowIdx === 15);
  const row16 = app.elTableBody.children.find(c => c.dataset?.rowIdx === 16);

  // originIdx가 0이므로 범위 확장에 의해 row0 포함됨
  assert.equal(row3.style.display, '');
  assert.equal(row12.style.display, '');
  assert.equal(row15.style.display, '');
  assert.equal(row16.style.display, 'none');

  // 2. 이전 날짜 중복 제거 검증:
  // 총 3건 중 2건은 내용 동일(10/01과 09/30). 1건은 다른 내용(09/29).
  // 기본 모드(대표 행 모드)에서는 유니크한 2개 행만 나와야 함!
  assert.equal(app.isCrossDateExpanded, false);
  assert.equal(app.crossDateResults.length, 2);
  // 가장 최신 날짜(2026-10-01)의 행이 대표 행이어야 함
  assert.equal(app.crossDateResults[0]._sourceDate, '2026-10-01');
  assert.equal(app.crossDateResults[0]._dupCount, 2);

  // 3. # 헤더 클릭 시 전체 보기 토글 검증:
  app.toggleCrossDateExpanded();
  assert.equal(app.isCrossDateExpanded, true);
  // 전체 펼침 모드에서는 3건 모두 표시되어야 함!
  assert.equal(app.crossDateResults.length, 3);

  // 다시 한 번 토글하면 대표 행 모드로 복귀 (2건)
  app.toggleCrossDateExpanded();
  assert.equal(app.isCrossDateExpanded, false);
  assert.equal(app.crossDateResults.length, 2);
});
