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
    const patientContentKeys = ['gender','chartNo','name','part','extra','memo','specialNote'];
    // 영구 방어: 처방열에만 '한랭'이 있고 실제 환자 필드가 모두 비어있는 버그 행 자동 정리 (writer/no 등 기본값 제외)
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const prescription = String(row?.prescription ?? '').trim();
      if (prescription.includes('한랭') && !patientContentKeys.some(k => String(row[k] ?? '').trim())) {
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
    return PTDeviceSettings.panel(key, legacyClosed, property);
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

  // 기기 전용 통합 UI 디스플레이 설정 읽기 (localStorage -> sessionStorage -> Cookie -> 레거시 자동 마이그레이션)
  readDevicePreferences() {
    return PTDeviceSettings.readUI();
  }

  // 기기 전용 통합 UI 디스플레이 설정 영구 보존 (4중 계층: localStorage + sessionStorage + Cookie + IndexedDB + 레거시 미러링)
  persistDevicePreferences(prefs) {
    if (!prefs || typeof prefs !== 'object') return;
    prefs = PTDeviceSettings.mergeUI([this.readDevicePreferences(),prefs]);
    const key = "PT_DEVICE_UI_PREFS_V1";
    try { localStorage.setItem(key, JSON.stringify(prefs)); } catch (_) {}
    try { sessionStorage.setItem(key, JSON.stringify(prefs)); } catch (_) {}
    try {
      const encoded = encodeURIComponent(JSON.stringify(prefs));
      document.cookie = `${key}=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch (_) {}

    // 레거시 키에도 동시 저장하여 기존 테스트 및 하위 호환성 유지
    if (prefs.columnWidths && Object.keys(prefs.columnWidths).length > 0) {
      const colSnapshot = PTDeviceSettings.widthSnapshot(prefs);
      this.persistLocalColumnWidths(colSnapshot);
    }
    const sumSnapshot = { closed: Boolean(prefs.summaryClosed), updatedAt: prefs.summaryClosedUpdatedAt || 1 };
    this.persistLocalSummaryState(sumSnapshot);
    const toolSnapshot = { closed: Boolean(prefs.toolbarCollapsed), updatedAt: prefs.toolbarCollapsedUpdatedAt || 1 };
    this.persistLocalToolbarState(toolSnapshot);

    // IndexedDB 비동기 영구 저장
    if (this.devicePreferencesStore) {
      this.queueDevicePreferences(prefs);
    }
  }

  queueDevicePreferences(prefs) {
    if (!this.devicePreferencesStore) return;
    const snapshot = JSON.parse(JSON.stringify(prefs));
    const previous = this.devicePreferencesWrite || Promise.resolve();
    this.devicePreferencesWrite = previous.catch(() => {}).then(async () => {
      await this.devicePreferencesStore("device-ui-preferences-v1", snapshot);
      const saved = await this.devicePreferencesStore("device-ui-preferences-v1");
      if (!PTDeviceSettings.containsStored("device-ui-preferences-v1",saved,snapshot)) throw new Error("화면 설정 저장 검증 실패");
    });
    this.devicePreferencesWrite.catch(() => this.showSaveIndicator?.("화면 설정 저장 실패 · 다시 저장해 주세요", true));
  }

  async restoreDeviceSettings(store) {
    this._deviceSettingsRestorePending = true;
    const keys = ['device-ui-preferences-v1','device-column-widths-v1','device-summary-state-v1','device-toolbar-state-v1'];
    // Read every original disk snapshot before enabling any write path.
    const [unified,widths,summary,toolbar] = await Promise.all(keys.map(key => store(key)));
    this._deviceSettingsSnapshotsRead = true;
    const disk = [unified, PTDeviceSettings.widthPreferences(widths),
      {summaryClosed:summary?.closed,summaryClosedUpdatedAt:summary?.updatedAt},
      {toolbarCollapsed:toolbar?.closed,toolbarCollapsedUpdatedAt:toolbar?.updatedAt}];
    const local = this.readDevicePreferences();
    const beforeEdit = this.columnWidthsBeforeSessionEdit;
    const localCandidate = beforeEdit ? {...local,columnWidths:beforeEdit.widths,columnWidthsUpdatedAt:beforeEdit.updatedAt,columnWidthUpdatedAt:beforeEdit.fieldUpdatedAt} : local;
    const merged = PTDeviceSettings.mergeUI([...disk,localCandidate]);
    // A resize before disk recovery must replace only the dragged track, not
    // publish the other measured HTML defaults over saved device widths.
    if (this.sessionColumnWidthEdits) {
      for (const [key,width] of this.sessionColumnWidthEdits) {
        if (width === null) delete merged.columnWidths[key];
        else merged.columnWidths[key] = width;
      }
      merged.columnWidthsUpdatedAt = Math.max(Date.now(),local.columnWidthsUpdatedAt,merged.columnWidthsUpdatedAt+1);
      for (const key of this.sessionColumnWidthEdits.keys()) merged.columnWidthUpdatedAt[key] = merged.columnWidthsUpdatedAt;
      merged.columnWidthsUserModified = true;
    }
    for (const [changed,field] of [['summaryStateChanged','summaryClosed'],['toolbarStateChanged','toolbarCollapsed']]) {
      if (this[changed]) for (const suffix of ['', 'UpdatedAt','UserModified']) merged[field+suffix] = local[field+suffix];
    }
    if (!this.summaryStateChanged) {
      merged.summaryClosed = true;
      merged.summaryClosedUpdatedAt = Math.max(Date.now(),(merged.summaryClosedUpdatedAt || 0)+1);
    }
    this.columnWidthUpdatedAt = {...merged.columnWidthUpdatedAt};
    this.deviceColumnWidths = {...merged.columnWidths};this.columnWidthsUpdatedAt = merged.columnWidthsUpdatedAt || 1;
    this.deviceSummaryState = {closed:merged.summaryClosed,updatedAt:merged.summaryClosedUpdatedAt || 1};
    this.deviceToolbarState = {closed:merged.toolbarCollapsed,updatedAt:merged.toolbarCollapsedUpdatedAt || 1};
    this.persistDevicePreferences(merged);
    this.setSummaryClosed(merged.summaryClosed,false);this.setToolbarActionsClosed(merged.toolbarCollapsed,false);
    this.applySavedColumnWidths();this.syncCrossDateColWidths();
    this.devicePreferencesStore = this.columnWidthsStore = this.summaryStateStore = this.toolbarStateStore = store;
    this._deviceSettingsRestorePending = false;this._deviceSettingsRestored = true;
    this.persistDevicePreferences(this.readDevicePreferences());
    this.queueDeviceColumnWidths({widths:{...this.deviceColumnWidths},updatedAt:this.columnWidthsUpdatedAt,fieldUpdatedAt:{...this.columnWidthUpdatedAt}});
    this.queueDeviceSummaryState(this.deviceSummaryState);this.queueDeviceToolbarState(this.deviceToolbarState);
    await Promise.all([this.devicePreferencesWrite,this.columnWidthsWrite,this.summaryStateWrite,this.toolbarStateWrite]);
  }

  async restoreDevicePreferences(store) {
    this.devicePreferencesStore = store;
    let persisted = null;
    try { persisted = await store("device-ui-preferences-v1"); } catch (_) {}

    const local = this.readDevicePreferences();
    if (!persisted || typeof persisted !== 'object') {
      if (local && (local.columnWidthsUserModified || local.summaryClosedUserModified || local.toolbarCollapsedUserModified)) {
        this.queueDevicePreferences(local);
      }
      this._deviceSettingsRestored = true;
      return;
    }

    let changed = false;
    // 1. 열 너비 복원: 세션 중 사용자가 이미 열 너비를 조정했으면 디스크 값으로 절대 덮어쓰지 않음
    if (!this.columnWidthsChanged && persisted.columnWidthsUserModified && (!local.columnWidthsUserModified || (persisted.columnWidthsUpdatedAt || 0) >= (local.columnWidthsUpdatedAt || 0))) {
      if (persisted.columnWidths && Object.keys(persisted.columnWidths).length > 0) {
        local.columnWidths = { ...persisted.columnWidths };
        local.columnWidthsUpdatedAt = persisted.columnWidthsUpdatedAt;
        local.columnWidthsUserModified = true;
        this.deviceColumnWidths = { ...persisted.columnWidths };
        this.columnWidthsUpdatedAt = persisted.columnWidthsUpdatedAt;
        this.applySavedColumnWidths();
        changed = true;
      }
    } else if (this.columnWidthsChanged && this.deviceColumnWidths) {
      // 세션 중 변경된 값을 디스크에 반영
      const snapshot = { widths: { ...this.deviceColumnWidths }, updatedAt: this.columnWidthsUpdatedAt || Date.now() };
      this.queueDeviceColumnWidths(snapshot);
    }

    // 2. 현황창 복원: 세션 중 사용자가 이미 변경했으면 디스크 값으로 절대 덮어쓰지 않음
    if (!this.summaryStartsClosed && !this.summaryStateChanged && persisted.summaryClosedUserModified && (!local.summaryClosedUserModified || (persisted.summaryClosedUpdatedAt || 0) >= (local.summaryClosedUpdatedAt || 0))) {
      local.summaryClosed = Boolean(persisted.summaryClosed);
      local.summaryClosedUpdatedAt = persisted.summaryClosedUpdatedAt;
      local.summaryClosedUserModified = true;
      this.deviceSummaryState = { closed: local.summaryClosed, updatedAt: local.summaryClosedUpdatedAt };
      this.setSummaryClosed(local.summaryClosed, false);
      changed = true;
    } else if (this.summaryStateChanged && this.deviceSummaryState) {
      this.queueDeviceSummaryState(this.deviceSummaryState);
    }

    // 3. 툴바 복원: 세션 중 사용자가 이미 변경했으면 디스크 값으로 절대 덮어쓰지 않음
    if (!this.toolbarStateChanged && persisted.toolbarCollapsedUserModified && (!local.toolbarCollapsedUserModified || (persisted.toolbarCollapsedUpdatedAt || 0) >= (local.toolbarCollapsedUpdatedAt || 0))) {
      local.toolbarCollapsed = Boolean(persisted.toolbarCollapsed);
      local.toolbarCollapsedUpdatedAt = persisted.toolbarCollapsedUpdatedAt;
      local.toolbarCollapsedUserModified = true;
      this.deviceToolbarState = { closed: local.toolbarCollapsed, updatedAt: local.toolbarCollapsedUpdatedAt };
      this.setToolbarActionsClosed(local.toolbarCollapsed, false);
      changed = true;
    } else if (this.toolbarStateChanged && this.deviceToolbarState) {
      this.queueDeviceToolbarState(this.deviceToolbarState);
    }

    if (changed) {
      this.persistDevicePreferences(local);
    }
    this._deviceSettingsRestored = true;
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
      if (!PTDeviceSettings.containsStored("device-summary-state-v1",saved,snapshot)) throw new Error("현황창 설정 저장 검증 실패");
    }).catch(error => {
      console.error("Failed to persist device summary state:", error);
      this.showSaveIndicator?.("현황창 설정 저장 실패 · 기기 저장 공간을 확인해 주세요", true);
    });
  }

  async restoreDeviceSummaryState(store) {
    this.summaryStateStore = store;
    let persisted = null;
    try { persisted = await store("device-summary-state-v1"); } catch (_) {}
    if (this.summaryStartsClosed && !this.summaryStateChanged) {
      this.deviceSummaryState = {closed:true,updatedAt:Math.max(Date.now(),(persisted?.updatedAt || 0)+1)};
      this.persistLocalSummaryState(this.deviceSummaryState);
      this.setSummaryClosed(true,false);
      this.queueDeviceSummaryState(this.deviceSummaryState);
      await this.summaryStateWrite;
      return;
    }
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

      try {
        const prefs = this.readDevicePreferences();
        prefs.summaryClosed = closed;
        prefs.summaryClosedUpdatedAt = snapshot.updatedAt;
        prefs.summaryClosedUserModified = true;
        this.persistDevicePreferences(prefs);
      } catch (_) {}
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

      try {
        const prefs = this.readDevicePreferences();
        prefs.toolbarCollapsed = closed;
        prefs.toolbarCollapsedUpdatedAt = this.deviceToolbarState.updatedAt;
        prefs.toolbarCollapsedUserModified = true;
        this.persistDevicePreferences(prefs);
      } catch (_) {}
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
      if (!PTDeviceSettings.containsStored("device-toolbar-state-v1",saved,snapshot)) throw new Error("도구 설정 저장 검증 실패");
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
    if (this._deviceSettingsRestorePending) return;
    try {
      const prefs = this.readDevicePreferences();
      let prefsChanged = false;

      const summary = this.deviceSummaryState || this.readDeviceSummaryState();
      this.persistLocalSummaryState(summary);
      if (this.summaryStateStore) this.queueDeviceSummaryState(summary);
      if (this.summaryStateChanged && this.deviceSummaryState) {
        prefs.summaryClosed = this.deviceSummaryState.closed;
        prefs.summaryClosedUpdatedAt = this.deviceSummaryState.updatedAt || Date.now();
        prefs.summaryClosedUserModified = true;
        prefsChanged = true;
      }

      const toolbar = this.deviceToolbarState || this.readDeviceToolbarState();
      this.persistLocalToolbarState(toolbar);
      if (this.toolbarStateStore) this.queueDeviceToolbarState(toolbar);
      if (this.toolbarStateChanged && this.deviceToolbarState) {
        prefs.toolbarCollapsed = this.deviceToolbarState.closed;
        prefs.toolbarCollapsedUpdatedAt = this.deviceToolbarState.updatedAt || Date.now();
        prefs.toolbarCollapsedUserModified = true;
        prefsChanged = true;
      }

      const widths = this.deviceColumnWidths || this.readDeviceColumnWidths().widths;
      if (widths && typeof widths === "object" && Object.keys(widths).length) {
        const snapshot = { widths: { ...widths }, updatedAt: this.columnWidthsUpdatedAt || 1,fieldUpdatedAt:{...this.columnWidthUpdatedAt} };
        this.persistLocalColumnWidths(snapshot);
        if (this.columnWidthsStore) this.queueDeviceColumnWidths(snapshot);
        if (this.columnWidthsChanged) {
          prefs.columnWidths = { ...widths };
          prefs.columnWidthUpdatedAt = {...this.columnWidthUpdatedAt};
          prefs.columnWidthsUpdatedAt = snapshot.updatedAt;
          prefs.columnWidthsUserModified = true;
          prefsChanged = true;
        }
      }

      if (prefsChanged) {
        this.persistDevicePreferences(prefs);
      }
    } catch (_) {}
  }

  initToolbarActionsToggle() {
    this.deviceToolbarState = this.readDeviceToolbarState();
    // updatedAt가 0이면 인라인 스크립트(index.html)에서 무시될 수 있으므로 유효한 값 보장
    // 부트스트랩 타임스탬프(1)를 사용하여 나중에 IndexedDB의 실제 사용자 설정이 이길 수 있도록 함
    if (!this.deviceToolbarState.updatedAt) this.deviceToolbarState.updatedAt = 1;
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
    // Always start closed. Opening it during this launch remains a user action.
    this.summaryStartsClosed = true;
    this.deviceSummaryState = { closed: true, updatedAt: 1 };
    // updatedAt가 0이면 인라인 스크립트(index.html)에서 무시될 수 있으므로 유효한 값 보장
    // 부트스트랩 타임스탬프(1)를 사용하여 나중에 IndexedDB의 실제 사용자 설정이 이길 수 있도록 함
    if (!this.deviceSummaryState.updatedAt) this.deviceSummaryState.updatedAt = 1;
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
    let activePointerId = -1;
    let startX = 0;
    let startWidth = 0;

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
      // 드래그 시작 시에는 동기 저장 없이 메모리만 고정 (렉 방지)
      this.deviceColumnWidths = { ...saved };
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
      // 드래그 중에는 DOM + 메모리만 60fps 반영, 스토리지 쓰기 없음 (렉 방지)
      this.recordSessionColumnWidth(activeColKey,newWidth);
      if (this.deviceColumnWidths) this.deviceColumnWidths[activeColKey] = newWidth;
      this.columnWidthsChanged = true;
      this.syncMainColumnWidths();
      this.syncCrossDateColWidths();
    };

    const endResize = () => {
      if (activeTh) {
        const key = activeColKey;
        const finalWidth = parseFloat(activeTh.style.width) || activeTh.offsetWidth;
        // 포인터 캡처 해제
        if (activeResizer && activePointerId >= 0) {
          try { activeResizer.releasePointerCapture(activePointerId); } catch (_) {}
        }
        activeResizer?.classList.remove?.("resizing");
        activeResizer = null;
        activeTh = null;
        activeColKey = null;
        activePointerId = -1;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // 드래그 종료 시점에 최종 너비를 모든 저장소에 즉시 확정 저장
        if (key) this.saveColumnWidth(key, finalWidth);
      }
    };
    this.endColumnResize = endResize;

    // 포인터 이벤트 (mouse + touch + pen 통합, setPointerCapture로 Mac/Windows 안정화)
    document.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("col-resizer")) {
        e.preventDefault();
        e.stopPropagation();
        activePointerId = e.pointerId;
        // setPointerCapture: 마우스가 리사이저 밖으로 빠르게 벗어나도 pointermove/pointerup 수신 보장
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
        startResize(e.target, e.clientX);
      }
    });

    document.addEventListener("pointermove", (e) => {
      if (activeTh) {
        e.preventDefault();
        doResize(e.clientX);
      }
    });

    document.addEventListener("pointerup", (e) => {
      if (activeTh) {
        endResize();
      }
    });

    document.addEventListener("pointercancel", () => {
      endResize();
    });

    // 터치 멀티터치 보호 (2손가락으로 전환 시 리사이즈 취소)
    document.addEventListener("touchstart", (e) => {
      if (e.touches.length > 1 && activeTh) {
        endResize();
      }
    }, { passive: true });

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

  recordSessionColumnWidth(colKey, width) {
    this.columnWidthsBeforeSessionEdit ||= {widths:this.getSavedColumnWidths(),updatedAt:this.columnWidthsUpdatedAt || 0,fieldUpdatedAt:{...this.columnWidthUpdatedAt}};
    this.sessionColumnWidthEdits ||= new Map();
    this.sessionColumnWidthEdits.set(colKey,width);
  }

  saveColumnWidth(colKey, width) {
    this.recordSessionColumnWidth(colKey,width);
    if (!this.deviceColumnWidths) this.deviceColumnWidths = {};
    this.deviceColumnWidths[colKey] = width;
    // 모든 저장소에 즉시 확정 저장 (endResize에서 호출)
    this.persistColumnWidths({ ...this.deviceColumnWidths },[colKey]);
    this.applySavedColumnWidths();
  }

  getSavedColumnWidths() {
    if (this.deviceColumnWidths) return { ...this.deviceColumnWidths };
    return this.readDeviceColumnWidths().widths;
  }

  readDeviceColumnWidths() {
    return PTDeviceSettings.widthSnapshot(this.readDevicePreferences());
  }

  persistLocalColumnWidths(snapshot) {
    snapshot = PTDeviceSettings.widthSnapshot(PTDeviceSettings.mergeUI([
      this.readDevicePreferences(),PTDeviceSettings.widthPreferences(snapshot)
    ]));
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

  persistColumnWidths(widths, changedColumns = Object.keys(widths)) {
    void this.requestDeviceStoragePersistence?.();
    const latest = this.readDevicePreferences();
    const timestamp = Math.max(Date.now(),latest.columnWidthsUpdatedAt+1,(this.columnWidthsUpdatedAt || 0)+1);
    const times = {...this.columnWidthUpdatedAt};
    // Only touched tracks acquire a new version. Other windows may have changed
    // the remaining tracks since this table was rendered.
    for (const key of changedColumns) times[key] = timestamp;
    const merged = PTDeviceSettings.mergeUI([latest,{
      columnWidths:widths,columnWidthUpdatedAt:times,columnWidthsUpdatedAt:timestamp,columnWidthsUserModified:true
    }]);
    this.deviceColumnWidths = {...merged.columnWidths};
    this.columnWidthUpdatedAt = {...merged.columnWidthUpdatedAt};
    this.columnWidthsChanged = true;
    this.columnWidthsUpdatedAt = merged.columnWidthsUpdatedAt;
    const snapshot = PTDeviceSettings.widthSnapshot(merged);
    this.persistLocalColumnWidths(snapshot);
    this.queueDeviceColumnWidths(snapshot);
    this.persistDevicePreferences(merged);
  }

  queueDeviceColumnWidths(snapshot) {
    if (!this.columnWidthsStore) return;
    const previous = this.columnWidthsWrite || Promise.resolve();
    // Start each write now instead of leaving the final drag position behind a
    // long promise queue when the user closes the app. IndexedDB orders writes.
    const write = (async () => {
      await this.columnWidthsStore("device-column-widths-v1", snapshot);
      const restored = await this.columnWidthsStore("device-column-widths-v1");
      if (!PTDeviceSettings.containsStored("device-column-widths-v1",restored,snapshot)) {
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

    // IndexedDB(persisted)가 빈 widths인데 로컬에 유효한 widths가 있으면 로컬 우선
    const shouldUsePersisted = !this.columnWidthsChanged &&
      persisted?.widths && typeof persisted.widths === 'object' && Number.isFinite(persisted.updatedAt) &&
      (persistedKeyCount > 0) &&
      (persisted.updatedAt >= localUpdatedAt || (localUpdatedAt === 0 && persisted.updatedAt > 0));

    if (shouldUsePersisted) {
      this.deviceColumnWidths = { ...persisted.widths };
      this.columnWidthUpdatedAt = PTDeviceSettings.mergeUI([PTDeviceSettings.widthPreferences(persisted)]).columnWidthUpdatedAt;
      this.columnWidthsUpdatedAt = persisted.updatedAt;
      this.persistLocalColumnWidths(persisted);
      this.applySavedColumnWidths();
      this.syncCrossDateColWidths();
    } else if (localKeyCount > 0) {
      this.deviceColumnWidths = { ...saved };
      const ts = this.columnWidthsUpdatedAt || localUpdatedAt || Date.now();
      this.columnWidthsUpdatedAt = ts;
      this.applySavedColumnWidths();
      this.queueDeviceColumnWidths({ widths: saved, updatedAt: ts,fieldUpdatedAt:{...this.columnWidthUpdatedAt} });
      await this.columnWidthsWrite;
    }
  }

  applySavedColumnWidths() {
    let prefs = null;
    try { prefs = this.readDevicePreferences(); } catch (_) {}
    // restoreDeviceColumnWidths 등에서 이미 deviceColumnWidths를 설정한 경우
    // (예: IndexedDB에서 복원) localStorage보다 인메모리 값을 우선 사용
    const inMemoryValid = this.deviceColumnWidths && Object.keys(this.deviceColumnWidths).length > 0;
    const saved = inMemoryValid
      ? { ...this.deviceColumnWidths }
      : (prefs?.columnWidths && Object.keys(prefs.columnWidths).length > 0)
        ? { ...prefs.columnWidths }
        : this.getSavedColumnWidths();
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
    this.columnWidthUpdatedAt ||= {...prefs?.columnWidthUpdatedAt};
    for (const key of Object.keys(saved)) this.columnWidthUpdatedAt[key] ??= 1;
    if (!this.columnWidthsUpdatedAt) {
      this.columnWidthsUpdatedAt = prefs?.columnWidthsUpdatedAt || this.readDeviceColumnWidths().updatedAt || 1;
    }
    if (!this.columnWidthsUpdatedAt) this.columnWidthsUpdatedAt = 1;
    // Before disk recovery these measurements are display placeholders only.
    // Stamping them with a saved partial snapshot's time would erase other
    // columns that still exist on disk.
    if ((this._deviceSettingsSnapshotsRead || this.columnWidthsChanged) && (anyMeasured || Object.keys(saved).length > 0)) {
      const snapshot = { widths: { ...saved }, updatedAt: this.columnWidthsUpdatedAt,fieldUpdatedAt:{...this.columnWidthUpdatedAt} };
      this.persistLocalColumnWidths(snapshot);
      if (prefs) {
        prefs.columnWidths = { ...saved };
        prefs.columnWidthUpdatedAt = {...this.columnWidthUpdatedAt};
        prefs.columnWidthsUpdatedAt = this.columnWidthsUpdatedAt;
        this.persistDevicePreferences(prefs);
      }
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
      this.recordSessionColumnWidth(colKey,null);
      const saved = this.getSavedColumnWidths();
      delete saved[colKey];
      this.persistColumnWidths(saved,[colKey]);
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
