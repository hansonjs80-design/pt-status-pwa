// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTDeviceLayout {
  initDevicePlatformAppearance() {
    const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
    document.documentElement.classList.toggle('platform-windows', /win/i.test(platform));
  }

  readRowCountSettings() {
    try {
      const setting = JSON.parse(localStorage.getItem('PT_DEFAULT_ROWS_V1') || 'null');
      const valid = n => Number.isInteger(n) && n >= 1 && n <= 2000;
      if (valid(setting?.baseCount) && Array.isArray(setting.changes) &&
          (setting.allocations === undefined || (Array.isArray(setting.allocations) && setting.allocations.every(valid))) &&
          setting.changes.every(c => valid(c.count) && /^\d{4}-(0[1-9]|1[0-2])$/.test(c.fromMonth))) return setting;
    } catch (_) { /* Use the default when stored settings are unavailable. */ }
    return {baseCount: DEFAULT_ROW_COUNT, changes: [], allocations: [120,150]};
  }

  getDefaultRowCount(date = this.currentDate) {
    const setting = this.rowCountSettings ||= this.readRowCountSettings();
    return [...setting.changes].sort((a,b) => a.fromMonth.localeCompare(b.fromMonth))
      .filter(c => c.fromMonth <= String(date).slice(0,7)).at(-1)?.count ?? setting.baseCount;
  }

  normalizeRowAllocation(rows, date, compact = false) {
    const count = this.getDefaultRowCount(date);
    const contentKeys = ['no','gender','chartNo','name','part','prescription','extra','writer','memo','specialNote','visitTime'];
    const nonPrescriptionKeys = ['no','gender','chartNo','name','part','extra','writer','memo','specialNote','visitTime'];
    // 영구 방어: 처방열에만 '한랭'이 있고 다른 필드가 모두 비어있는 버그 행 자동 정리
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const prescription = String(row.prescription ?? '').trim();
      if (prescription.includes('한랭') && !nonPrescriptionKeys.some(k => String(row[k] ?? '').trim())) {
        row.prescription = '';
      }
    }
    const lastContent = rows.findLastIndex(row => contentKeys.some(key => String(row[key] ?? '').trim()));
    const lastProtected = rows.findLastIndex(row => Object.entries(row).some(([key,value]) =>
      key !== 'date' && value != null && value !== '' &&
      (typeof value !== 'object' || Object.keys(value).length > 0)));
    const minimum = Math.max(count, lastContent + 16, lastProtected + 1);
    const allocations = this.rowCountSettings?.allocations || [120,150];
    if ((compact || allocations.includes(rows.length)) && rows.length > minimum) rows.splice(minimum);
    if (rows.length < minimum) rows.push(...this.createDefaultEmptyRows(minimum - rows.length, date));
    return rows;
  }

  applyDefaultRowCount(count, scope) {
    if (!Number.isInteger(count) || count < 1 || count > 2000 || !['all','month'].includes(scope)) return false;
    const old = this.rowCountSettings || this.readRowCountSettings();
    const month = this.getTodayString().slice(0,7);
    const setting = {
      baseCount: scope === 'all' ? count : old.baseCount,
      changes: scope === 'all' ? [] : [...old.changes.filter(c => c.fromMonth < month), {fromMonth: month, count}],
      allocations: [...new Set([120,150,...(old.allocations || []),old.baseCount,...old.changes.map(c=>c.count),count])]
    };
    localStorage.setItem('PT_DEFAULT_ROWS_V1', JSON.stringify(setting));
    this.rowCountSettings = setting;
    if (this.isEditingCell()) document.activeElement.blur();
    for (const [date,rows] of Object.entries(this.dataStore)) {
      if (!Array.isArray(rows) || (scope === 'month' && date.slice(0,7) < month)) continue;
      const before = rows.length;
      this.normalizeRowAllocation(rows,date,true);
      if (rows.length !== before) this.editHistory?.delete(date);
    }
    void this.persistDataStore().catch(() => this.showSaveIndicator('기본 행 설정 저장 실패', true));
    this.clearHeaderSelections();
    this.activeCell = null;
    this.renderTable();
    this.showSaveIndicator('기본 행 설정 저장됨');
    return true;
  }

  readDevicePanelState(key, legacyClosed, property = 'closed') {
    // 1. localStorage SNAPSHOT 최우선 확인 (가장 정확한 사용자 로컬 조작 기록)
    try {
      const saved = JSON.parse(localStorage.getItem(`${key}_SNAPSHOT`) || 'null');
      if (saved && typeof saved[property] === 'boolean' && Number.isFinite(saved.updatedAt) && saved.updatedAt > 0) {
        return saved;
      }
    } catch (_) {}

    // 2. sessionStorage SNAPSHOT 확인 (새로고침 / 코드 업데이트 시 세션 보호)
    try {
      const sessionSaved = JSON.parse(sessionStorage.getItem(`${key}_SNAPSHOT`) || 'null');
      if (sessionSaved && typeof sessionSaved[property] === 'boolean' && Number.isFinite(sessionSaved.updatedAt) && sessionSaved.updatedAt > 0) {
        try { localStorage.setItem(`${key}_SNAPSHOT`, JSON.stringify(sessionSaved)); } catch (_) {}
        return sessionSaved;
      }
    } catch (_) {}

    // 3. Cookie STATE 확인 (로컬 스토리지가 비었을 때의 fallback)
    try {
      const cookieKey = `${key}_STATE=`;
      const matches = String(document.cookie || '').split(';')
        .map(value => value.trim())
        .filter(value => value.startsWith(cookieKey));
      let bestCookie = null;
      for (const raw of matches) {
        try {
          const saved = JSON.parse(decodeURIComponent(raw.slice(cookieKey.length)));
          if (saved && typeof saved[property] === 'boolean' && Number.isFinite(saved.updatedAt) && saved.updatedAt > 0) {
            if (!bestCookie || saved.updatedAt > bestCookie.updatedAt) bestCookie = saved;
          }
        } catch (_) {}
      }
      if (bestCookie) {
        try { localStorage.setItem(`${key}_SNAPSHOT`, JSON.stringify(bestCookie)); } catch (_) {}
        return bestCookie;
      }
    } catch (_) {}

    // 4. 레거시 단일 키 호환 fallback
    try {
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        const closed = legacy === legacyClosed;
        return { [property]: closed, updatedAt: 0 };
      }
    } catch (_) {}

    return { [property]: false, updatedAt: 0 };
  }

  persistDevicePanelCookie(key, snapshot) {
    try {
      const encoded = encodeURIComponent(JSON.stringify(snapshot));
      // 항상 루트(/) 단일 경로로 저장하여 서브패스 쿠키 충돌 방지
      document.cookie = `${key}_STATE=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax`;
      if (typeof window !== "undefined" && window.location?.pathname && window.location.pathname !== "/") {
        document.cookie = `${key}_STATE=; Path=${window.location.pathname}; Max-Age=0; SameSite=Lax`;
      }
    } catch (_) {}
  }

  readDeviceSummaryState() {
    const key = typeof SUMMARY_CLOSED_STORAGE_KEY !== "undefined" ? SUMMARY_CLOSED_STORAGE_KEY : "device-summary-closed-v1";
    return this.readDevicePanelState(key, '1');
  }

  isSummaryClosed() {
    return this.deviceSummaryState?.closed ?? this.readDeviceSummaryState().closed;
  }

  persistLocalSummaryState(snapshot) {
    const key = typeof SUMMARY_CLOSED_STORAGE_KEY !== "undefined" ? SUMMARY_CLOSED_STORAGE_KEY : "device-summary-closed-v1";
    this.persistDevicePanelCookie(key, snapshot);
    try { localStorage.setItem(`${key}_SNAPSHOT`, JSON.stringify(snapshot)); } catch (_) {}
    try { sessionStorage.setItem(`${key}_SNAPSHOT`, JSON.stringify(snapshot)); } catch (_) {}
    try {
      if (snapshot.closed) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch (_) {}
  }

  queueDeviceSummaryState(snapshot) {
    if (!this.summaryStateStore) return;
    const previous = this.summaryStateWrite || Promise.resolve();
    this.summaryStateWrite = previous.then(async () => {
      await this.summaryStateStore("device-summary-state-v1", snapshot);
      const saved = await this.summaryStateStore("device-summary-state-v1");
      if (!saved || saved.updatedAt !== snapshot.updatedAt || saved.closed !== snapshot.closed) throw new Error("현황창 설정 저장 검증 실패");
    }).catch(error => {
      console.error("Failed to persist device summary state:", error);
      this.showSaveIndicator?.("현황창 설정 저장 실패 · 기기 저장 공간을 확인해 주세요", true);
    });
  }

  async restoreDeviceSummaryState(store) {
    this.summaryStateStore = store;
    let persisted = null;
    try { persisted = await store("device-summary-state-v1"); } catch (_) {}
    const local = this.deviceSummaryState || this.readDeviceSummaryState();

    const isLocalValid = local && typeof local.closed === "boolean" && Number.isFinite(local.updatedAt);
    const isPersistedValid = persisted && typeof persisted.closed === "boolean" && Number.isFinite(persisted.updatedAt);

    const shouldUsePersisted = !this.summaryStateChanged && isPersistedValid &&
      (persisted.updatedAt > (local?.updatedAt || 0) || (!isLocalValid && persisted.updatedAt >= 0));

    if (shouldUsePersisted) {
      this.deviceSummaryState = persisted;
      this.persistLocalSummaryState(persisted);
      this.setSummaryClosed(persisted.closed, false);
    } else {
      this.deviceSummaryState = local;
      this.setSummaryClosed(local.closed, false);
      this.queueDeviceSummaryState(local);
      await this.summaryStateWrite;
    }
  }

  setSummaryClosed(closed, save = true) {
    const sidebar = document.getElementById("summarySidebar");
    const shell = sidebar?.closest?.(".summary-panel-shell") || (typeof document !== "undefined" && document.querySelector?.(".summary-panel-shell"));
    const button = document.getElementById("btnToggleSummary");
    if (typeof document !== "undefined" && document.documentElement?.classList) {
      document.documentElement.classList.toggle("device-summary-closed", closed);
    }
    if (sidebar) {
      if (closed && sidebar.contains?.(document.activeElement)) button?.focus({ preventScroll: true });
      sidebar.classList.toggle("summary-closed", closed);
      sidebar.inert = closed;
      sidebar.setAttribute?.("aria-hidden", String(closed));
    }
    if (shell && shell.classList) {
      shell.classList.toggle("summary-closed", closed);
    }
    if (button) {
      button.setAttribute("aria-expanded", String(!closed));
      button.title = closed ? "현황 열기" : "현황 닫기";
      button.setAttribute("aria-label", closed ? "현황 열기" : "현황 닫기");
    }
    const headerBtn = document.getElementById("btnHeaderSummaryCount");
    if (headerBtn) {
      headerBtn.setAttribute("aria-expanded", String(!closed));
      headerBtn.title = closed ? "선택 날짜 총 환자 수 (클릭하여 현황 요약창 열기)" : "선택 날짜 총 환자 수 (클릭하여 현황 요약창 접기)";
    }
    if (save) {
      const previous = this.deviceSummaryState || this.readDeviceSummaryState();
      const snapshot = { closed, updatedAt: Math.max(Date.now(), (previous?.updatedAt || 0) + 1) };
      this.summaryStateChanged = true;
      this.deviceSummaryState = snapshot;
      this.persistLocalSummaryState(snapshot);
      this.queueDeviceSummaryState(snapshot);
    }
    if (typeof this.syncMainColumnWidths === "function") this.syncMainColumnWidths();
  }

  setToolbarActionsClosed(closed, save = true) {
    const panel = document.getElementById("collapsibleToolbarActions");
    const button = document.getElementById("btnToggleToolbarActions");
    if (typeof document !== "undefined" && document.documentElement?.classList) {
      document.documentElement.classList.toggle("device-toolbar-collapsed", closed);
    }
    if (panel) {
      if (closed && panel.contains?.(document.activeElement)) button?.focus({ preventScroll: true });
      panel.classList.toggle("is-collapsed", closed);
      panel.inert = closed;
      panel.setAttribute?.("aria-hidden", String(closed));
    }
    if (button) {
      button.setAttribute("aria-expanded", String(!closed));
      button.title = closed ? "빠른 도구 및 설정 펼치기" : "빠른 도구 및 설정 접기";
      button.setAttribute("aria-label", button.title);
    }
    if (save) {
      const previous = this.deviceToolbarState || this.readDeviceToolbarState();
      this.deviceToolbarState = { closed, updatedAt: Math.max(Date.now(), (previous?.updatedAt || 0) + 1) };
      this.toolbarStateChanged = true;
      this.persistLocalToolbarState(this.deviceToolbarState);
      this.queueDeviceToolbarState(this.deviceToolbarState);
    }
  }

  readDeviceToolbarState() {
    return this.readDevicePanelState('PT_TOOLBAR_ACTIONS_COLLAPSED_V1', 'true');
  }

  persistLocalToolbarState(snapshot) {
    this.persistDevicePanelCookie('PT_TOOLBAR_ACTIONS_COLLAPSED_V1', snapshot);
    try { localStorage.setItem("PT_TOOLBAR_ACTIONS_COLLAPSED_V1_SNAPSHOT", JSON.stringify(snapshot)); } catch (_) {}
    try { sessionStorage.setItem("PT_TOOLBAR_ACTIONS_COLLAPSED_V1_SNAPSHOT", JSON.stringify(snapshot)); } catch (_) {}
    try { localStorage.setItem("PT_TOOLBAR_ACTIONS_COLLAPSED_V1", String(snapshot.closed)); } catch (_) {}
  }

  queueDeviceToolbarState(snapshot) {
    if (!this.toolbarStateStore) return;
    const previous = this.toolbarStateWrite || Promise.resolve();
    this.toolbarStateWrite = previous.then(async () => {
      await this.toolbarStateStore("device-toolbar-state-v1", snapshot);
      const saved = await this.toolbarStateStore("device-toolbar-state-v1");
      if (!saved || saved.updatedAt !== snapshot.updatedAt || saved.closed !== snapshot.closed) throw new Error("도구 설정 저장 검증 실패");
    }).catch(error => {
      console.error("Failed to persist device toolbar state:", error);
      this.showSaveIndicator?.("도구 설정 저장 실패 · 기기 저장 공간을 확인해 주세요", true);
    });
  }

  async restoreDeviceToolbarState(store) {
    this.toolbarStateStore = store;
    let persisted = null;
    try { persisted = await store("device-toolbar-state-v1"); } catch (_) {}
    const local = this.deviceToolbarState || this.readDeviceToolbarState();

    const isLocalValid = local && typeof local.closed === "boolean" && Number.isFinite(local.updatedAt);
    const isPersistedValid = persisted && typeof persisted.closed === "boolean" && Number.isFinite(persisted.updatedAt);

    const shouldUsePersisted = !this.toolbarStateChanged && isPersistedValid &&
      (persisted.updatedAt > (local?.updatedAt || 0) || (!isLocalValid && persisted.updatedAt >= 0));

    if (shouldUsePersisted) {
      this.deviceToolbarState = persisted;
      this.persistLocalToolbarState(persisted);
      this.setToolbarActionsClosed(persisted.closed, false);
    } else {
      this.deviceToolbarState = local;
      this.setToolbarActionsClosed(local.closed, false);
      this.queueDeviceToolbarState(local);
      await this.toolbarStateWrite;
    }
  }

  flushDevicePanelStates() {
    try {
      const summary = this.deviceSummaryState || this.readDeviceSummaryState();
      this.persistLocalSummaryState(summary);
      if (this.summaryStateStore) this.queueDeviceSummaryState(summary);
    } catch (_) {}
    try {
      const toolbar = this.deviceToolbarState || this.readDeviceToolbarState();
      this.persistLocalToolbarState(toolbar);
      if (this.toolbarStateStore) this.queueDeviceToolbarState(toolbar);
    } catch (_) {}
    try {
      const widths = this.deviceColumnWidths || this.readDeviceColumnWidths().widths;
      if (widths && typeof widths === "object" && Object.keys(widths).length) {
        const snapshot = { widths: { ...widths }, updatedAt: this.columnWidthsUpdatedAt || Date.now() };
        this.persistLocalColumnWidths(snapshot);
        if (this.columnWidthsStore) this.queueDeviceColumnWidths(snapshot);
      }
    } catch (_) {}
  }

  initToolbarActionsToggle() {
    this.deviceToolbarState = this.readDeviceToolbarState();
    this.setToolbarActionsClosed(this.deviceToolbarState.closed, false);
    // 읽은 상태를 즉시 모든 저장소에 확인 저장하여 앱 재시작 시 유실 방지
    this.persistLocalToolbarState(this.deviceToolbarState);
    const btn = document.getElementById("btnToggleToolbarActions");
    if (btn && !btn._hasToggleListener) {
      btn._hasToggleListener = true;
      btn.addEventListener("click", () => {
        const panel = document.getElementById("collapsibleToolbarActions");
        const isClosed = (typeof document !== "undefined" && document.documentElement?.classList?.contains("device-toolbar-collapsed")) ||
          Boolean(panel?.classList.contains("is-collapsed"));
        this.setToolbarActionsClosed(!isClosed);
      });
    }
  }

  initSummaryToggle() {
    this.deviceSummaryState = this.readDeviceSummaryState();
    this.setSummaryClosed(this.deviceSummaryState.closed, false);
    // 읽은 상태를 즉시 모든 저장소에 확인 저장하여 앱 재시작 시 유실 방지
    this.persistLocalSummaryState(this.deviceSummaryState);
    const btn = document.getElementById("btnToggleSummary");
    if (btn && !btn._hasToggleListener) {
      btn._hasToggleListener = true;
      btn.addEventListener("click", () => {
        const sidebar = document.getElementById("summarySidebar");
        const isClosed = (typeof document !== "undefined" && document.documentElement?.classList?.contains("device-summary-closed")) ||
          Boolean(sidebar?.classList.contains("summary-closed"));
        this.setSummaryClosed(!isClosed, true);
      });
    }
    const headerBtn = document.getElementById("btnHeaderSummaryCount");
    if (headerBtn && !headerBtn._hasToggleListener) {
      headerBtn._hasToggleListener = true;
      headerBtn.addEventListener("click", () => {
        const sidebar = document.getElementById("summarySidebar");
        const isClosed = (typeof document !== "undefined" && document.documentElement?.classList?.contains("device-summary-closed")) ||
          Boolean(sidebar?.classList.contains("summary-closed"));
        this.setSummaryClosed(!isClosed, true);
      });
    }
  }

  initColumnResizing() {
    let activeTh = null;
    let activeColKey = null;
    let activeResizer = null;
    let startX = 0;
    let startWidth = 0;
    let fixedRight = 0;

    // 기기별로 저장된 열 너비 초기 로딩 시 복원 적용
    document.querySelectorAll(".col-headers-row th.col-letter").forEach(th => {
      th.dataset.defaultWidth ||= String(parseFloat(th.style.width));
    });
    this.applySavedColumnWidths();

    const startResize = (resizerEl, clientX) => {
      // Freeze every displayed column before resizing: table-layout otherwise
      // redistributes spare width when the viewport or history columns change.
      const saved = this.getSavedColumnWidths();
      const measured = Array.from(document.querySelectorAll(".col-headers-row th.col-letter"), th => ({
        th, width: Number.isFinite(saved[th.dataset.col]) && saved[th.dataset.col] > 0
          ? saved[th.dataset.col]
          : this.hasFixedColumnWidths || window.getComputedStyle(th).display === "none"
            ? parseFloat(th.style.width) : th.getBoundingClientRect().width
      }));
      measured.forEach(({ th, width }) => {
        if (Number.isFinite(width) && width > 0) {
          th.style.width = `${width}px`;
          th.style.minWidth = `${width}px`;
          saved[th.dataset.col] = width;
        }
      });
      this.persistColumnWidths(saved);
      this.hasFixedColumnWidths = true;
      this.syncMainColumnWidths();
      const sourceTh = resizerEl.closest("th");
      activeTh = sourceTh.closest(".cross-date-inner-table")
        ? document.querySelector(`.col-headers-row th[data-col="${sourceTh.dataset.col}"]`)
        : sourceTh;
      activeColKey = activeTh?.dataset?.col || null;
      if (!activeTh) return;
      activeResizer = resizerEl;
      startX = clientX;
      startWidth = saved[activeColKey] || parseFloat(activeTh.style.width) || activeTh.getBoundingClientRect().width;
      fixedRight = activeTh.getBoundingClientRect().right;
      resizerEl.classList.add("resizing");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };

    const doResize = (clientX) => {
      if (!activeTh) return;
      const diff = clientX - startX;
      const newWidth = Math.max(activeColKey === "spacer" ? 10 : 35, startWidth + diff);
      activeTh.style.width = `${newWidth}px`;
      activeTh.style.minWidth = `${newWidth}px`;
      activeTh.style.maxWidth = `${newWidth}px`;
      this.saveColumnWidth(activeColKey, newWidth);
      // Update colgroup and table total width so every column (including del)
      // visually resizes during drag instead of being locked by stale col tracks.
      this.syncMainColumnWidths();
      this.syncCrossDateColWidths();
    };

    const endResize = () => {
      if (activeTh) {
        const key = activeColKey;
        const finalWidth = parseFloat(activeTh.style.width) || activeTh.offsetWidth;
        activeResizer?.classList.remove?.("resizing");
        activeResizer = null;
        activeTh = null;
        activeColKey = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Release pointer state before persistence, even when storage fails.
        if (key) this.saveColumnWidth(key, finalWidth);
      }
    };
    this.endColumnResize = endResize;

    // 마우스 이벤트 리스너
    document.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("col-resizer")) {
        e.preventDefault();
        e.stopPropagation();
        startResize(e.target, e.pageX);
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (activeTh) {
        if (e.buttons === 0) { endResize(); return; }
        doResize(e.pageX);
      }
    });

    document.addEventListener("mouseup", () => {
      endResize();
    });

    // 태블릿/모바일 터치 이벤트 리스너
    document.addEventListener("touchstart", (e) => {
      if (e.touches.length > 1) {
        endResize();
        return;
      }
      if (e.target.classList.contains("col-resizer") && e.touches.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        startResize(e.target, e.touches[0].pageX);
      }
    }, { passive: false });

    document.addEventListener("touchmove", (e) => {
      if (e.touches.length > 1) {
        endResize();
        return;
      }
      if (activeTh && e.touches.length === 1) {
        e.preventDefault();
        doResize(e.touches[0].pageX);
      }
    }, { passive: false });

    document.addEventListener("touchend", () => {
      endResize();
    });
    document.addEventListener("touchcancel", endResize);

    // 리사이저 더블클릭 시 해당 열 기본 너비로 복원 기능
    document.addEventListener("dblclick", (e) => {
      if (e.target.classList.contains("col-resizer")) {
        e.preventDefault();
        e.stopPropagation();
        const th = e.target.closest("th");
        const colKey = th?.dataset?.col;
        if (colKey) {
          this.resetColumnWidth(colKey);
        }
      }
    });
  }

  saveColumnWidth(colKey, width) {
    const saved = this.getSavedColumnWidths();
    saved[colKey] = width;
    this.persistColumnWidths(saved);
  }

  getSavedColumnWidths() {
    if (this.deviceColumnWidths) return { ...this.deviceColumnWidths };
    return this.readDeviceColumnWidths().widths;
  }

  readDeviceColumnWidths() {
    const key = typeof COL_WIDTHS_STORAGE_KEY !== "undefined" ? COL_WIDTHS_STORAGE_KEY : "PT_APP_COL_WIDTHS_STORAGE_V1";
    let snapshot = null;
    try { snapshot = JSON.parse(localStorage.getItem(`${key}_SNAPSHOT`) || 'null'); } catch (_) {}
    let session = null;
    try { session = JSON.parse(sessionStorage.getItem(`${key}_SNAPSHOT`) || 'null'); } catch (_) {}
    let cookieCandidate = null;
    try {
      const cookieKey = `${key}_STATE=`;
      const matches = String(document.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(cookieKey));
      for (const raw of matches) {
        try {
          const saved = JSON.parse(decodeURIComponent(raw.slice(cookieKey.length)));
          if (saved?.widths && typeof saved.widths === 'object' && !Array.isArray(saved.widths) && Number.isFinite(saved.updatedAt) && saved.updatedAt > 0) {
            if (!cookieCandidate || saved.updatedAt > cookieCandidate.updatedAt) cookieCandidate = saved;
          }
        } catch (_) {}
      }
    } catch (_) {}
    let legacy = { widths: {}, updatedAt: 0 };
    try {
      const data = localStorage.getItem(key);
      const saved = data ? JSON.parse(data) : {};
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        legacy = { widths: saved, updatedAt: Number(localStorage.getItem(`${key}_UPDATED_AT`)) || 0 };
      }
    } catch (_) {}

    const candidates = [snapshot, session, cookieCandidate, legacy].filter(c =>
      c?.widths && typeof c.widths === 'object' && !Array.isArray(c.widths) && Number.isFinite(c.updatedAt)
    );

    const withKeys = candidates.filter(c => Object.keys(c.widths).length > 0);
    let best = null;
    if (withKeys.length > 0) {
      best = withKeys.reduce((acc, cur) => cur.updatedAt >= acc.updatedAt ? cur : acc);
    } else if (candidates.length > 0) {
      best = candidates.reduce((acc, cur) => cur.updatedAt >= acc.updatedAt ? cur : acc);
    }

    if (best && Object.keys(best.widths).length > 0) {
      try { localStorage.setItem(`${key}_SNAPSHOT`, JSON.stringify(best)); } catch (_) {}
      try { sessionStorage.setItem(`${key}_SNAPSHOT`, JSON.stringify(best)); } catch (_) {}
      return best;
    }

    return best || legacy;
  }

  persistLocalColumnWidths(snapshot) {
    const key = typeof COL_WIDTHS_STORAGE_KEY !== "undefined" ? COL_WIDTHS_STORAGE_KEY : "PT_APP_COL_WIDTHS_STORAGE_V1";
    this.persistDevicePanelCookie(key, snapshot);
    let atomicSaved = false, legacySaved = false;
    try {
      sessionStorage.setItem(`${key}_SNAPSHOT`, JSON.stringify(snapshot));
    } catch (_) {}
    try {
      // Keep widths and their version together so an interrupted save cannot
      // pair old widths with a new timestamp on the next launch.
      localStorage.setItem(`${key}_SNAPSHOT`, JSON.stringify(snapshot));
      atomicSaved = true;
    } catch (_) {}
    try {
      localStorage.setItem(key, JSON.stringify(snapshot.widths));
      localStorage.setItem(`${key}_UPDATED_AT`, String(snapshot.updatedAt));
      legacySaved = true;
    } catch (_) {}
    this.columnWidthsLocalSaveFailed = !atomicSaved && !legacySaved;
  }

  persistColumnWidths(widths) {
    this.deviceColumnWidths = { ...widths };
    this.columnWidthsChanged = true;
    const snapshot = { widths: { ...widths }, updatedAt: Math.max(Date.now(),
      (this.columnWidthsUpdatedAt || this.readDeviceColumnWidths().updatedAt || 0) + 1) };
    this.columnWidthsUpdatedAt = snapshot.updatedAt;
    this.persistLocalColumnWidths(snapshot);
    this.queueDeviceColumnWidths(snapshot);
  }

  queueDeviceColumnWidths(snapshot) {
    if (!this.columnWidthsStore) return;
    const previous = this.columnWidthsWrite || Promise.resolve();
    // Start each write now instead of leaving the final drag position behind a
    // long promise queue when the user closes the app. IndexedDB orders writes.
    const write = (async () => {
      await this.columnWidthsStore("device-column-widths-v1", snapshot);
      const restored = await this.columnWidthsStore("device-column-widths-v1");
      if (!restored || restored.updatedAt < snapshot.updatedAt ||
          (restored.updatedAt === snapshot.updatedAt && JSON.stringify(restored.widths) !== JSON.stringify(snapshot.widths))) {
        throw new Error("열 너비 저장 검증에 실패했습니다.");
      }
    })();
    this.columnWidthsWrite = Promise.all([previous, write]).catch(error => {
      console.error("Failed to persist device column widths:", error);
      this.showSaveIndicator?.("열 너비 저장 실패 · 기기 저장 공간을 확인해 주세요", true);
    });
  }

  async restoreDeviceColumnWidths(store) {
    this.columnWidthsStore = store;
    let persisted = null;
    try { persisted = await store("device-column-widths-v1"); } catch (_) {}
    const local = this.readDeviceColumnWidths();
    const localUpdatedAt = local.updatedAt || 0;
    const saved = this.getSavedColumnWidths();
    const localKeyCount = Object.keys(saved || {}).length;
    const persistedKeyCount = Object.keys(persisted?.widths || {}).length;

    const shouldUsePersisted = !this.columnWidthsChanged &&
      persisted?.widths && typeof persisted.widths === 'object' && Number.isFinite(persisted.updatedAt) &&
      (persistedKeyCount > 0 || localKeyCount === 0) &&
      (persisted.updatedAt >= localUpdatedAt || (localUpdatedAt === 0 && persisted.updatedAt > 0));

    if (shouldUsePersisted) {
      this.deviceColumnWidths = { ...persisted.widths };
      this.columnWidthsUpdatedAt = persisted.updatedAt;
      this.persistLocalColumnWidths(persisted);
      this.applySavedColumnWidths();
      this.syncCrossDateColWidths();
    } else if (localKeyCount > 0) {
      this.deviceColumnWidths = { ...saved };
      this.applySavedColumnWidths();
      this.queueDeviceColumnWidths({ widths: saved, updatedAt: this.columnWidthsUpdatedAt || localUpdatedAt || Date.now() });
      await this.columnWidthsWrite;
    }
  }

  applySavedColumnWidths() {
    const saved = this.getSavedColumnWidths();
    if (!saved || typeof saved !== "object") return;

    // Pin all tracks from the first render, even before a device has any saved
    // widths. Hiding visitTime in history must never redistribute that space.
    this.hasFixedColumnWidths = true;
    let anyMeasured = false;
    document.querySelectorAll(".col-headers-row th.col-letter").forEach(th => {
      const col = th.dataset.col;
      const width = saved[col];
      if (Number.isFinite(width) && width > 0) {
        th.style.width = `${width}px`;
        th.style.minWidth = `${width}px`;
        th.style.maxWidth = `${width}px`;
      } else {
        // 저장된 너비가 없으면 현재 HTML 기본 너비를 측정하여 보존
        const measured = parseFloat(th.style.width) || th.getBoundingClientRect().width;
        if (Number.isFinite(measured) && measured > 0 && col) {
          saved[col] = measured;
          anyMeasured = true;
        }
      }
    });
    // 읽은 너비를 인메모리 캐시에 반영하여 flush 시 참조 가능
    this.deviceColumnWidths = { ...saved };
    if (!this.columnWidthsUpdatedAt) {
      this.columnWidthsUpdatedAt = this.readDeviceColumnWidths().updatedAt || 0;
    }
    // 측정한 너비를 즉시 localStorage/sessionStorage/Cookie에 저장하여
    // 앱 종료 후 다시 열어도 열 너비가 복원되도록 보장
    if (anyMeasured || Object.keys(saved).length > 0) {
      const snapshot = { widths: { ...saved }, updatedAt: this.columnWidthsUpdatedAt || Date.now() };
      this.persistLocalColumnWidths(snapshot);
    }
    this.syncMainColumnWidths();
  }

  syncMainColumnWidths() {
    if (!this.hasFixedColumnWidths) return;
    const table = document.getElementById("excelTable");
    if (!table) return;
    const headers = Array.from(document.querySelectorAll(".col-headers-row th"));
    const bHeaders = Array.from(document.querySelectorAll(".business-headers-row th"));
    const saved = this.getSavedColumnWidths();
    // A colgroup controls the actual table tracks, including the trailing blank
    // column. Header widths alone can be redistributed by the table algorithm.
    let group = table.querySelector("colgroup.device-column-widths");
    if (!group) {
      group = document.createElement("colgroup");
      group.className = "device-column-widths";
      table.insertBefore(group, table.firstChild);
    }
    const cols = [];
    // Read visibility before changing widths to avoid one forced layout per column.
    const visible = headers.map(th => window.getComputedStyle(th).display !== "none");
    let width = 0;
    for (let i = 0; i < headers.length; i++) {
      const th = headers[i];
      const key = th.dataset.col;
      const columnWidth = key
        ? (Number.isFinite(saved[key]) && saved[key] > 0 ? saved[key] : parseFloat(th.style.width))
        : 48;
      if (!Number.isFinite(columnWidth) || columnWidth <= 0) continue;
      th.style.width = `${columnWidth}px`;
      th.style.minWidth = `${columnWidth}px`;
      th.style.maxWidth = `${columnWidth}px`;
      if (bHeaders[i]) {
        bHeaders[i].style.width = `${columnWidth}px`;
        bHeaders[i].style.minWidth = `${columnWidth}px`;
        bHeaders[i].style.maxWidth = `${columnWidth}px`;
      }
      if (!visible[i]) {
        if (bHeaders[i]) bHeaders[i].style.display = "none";
        continue;
      }
      const col = document.createElement("col");
      col.dataset.col = key || "rowHeader";
      col.style.width = `${columnWidth}px`;
      cols.push(col);
      width += columnWidth;
    }
    const signature = cols.map(col => `${col.dataset.col}:${col.style.width}`).join('|');
    if (group._columnWidthSignature !== signature) {
      group.replaceChildren(...cols);
      group._columnWidthSignature = signature;
    }
    table.style.width = `${width}px`;
    table.style.minWidth = `${width}px`;
    table.style.maxWidth = `${width}px`;
  }

  resetColumnWidth(colKey) {
    try {
      const saved = this.getSavedColumnWidths();
      delete saved[colKey];
      this.persistColumnWidths(saved);
      const th = document.querySelector(`th.col-letter[data-col="${colKey}"]`);
      if (th) {
        th.style.width = th.dataset.defaultWidth ? `${th.dataset.defaultWidth}px` : "";
        th.style.minWidth = "";
      }
      this.syncCrossDateColWidths();
      this.showSaveIndicator("기본 열 너비로 초기화됨");
    } catch (err) {
      console.error("Failed to reset column width:", err);
    }
  }

}
