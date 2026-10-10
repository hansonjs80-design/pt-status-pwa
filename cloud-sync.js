// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTCloudSync {
  async syncBaselineDisk(value) {
    this._baselineDatabase ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('PT_SYNC_STATE', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    let db;
    try { db = await this._baselineDatabase; }
    catch (error) { this._baselineDatabase = null; throw error; }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', value === undefined ? 'readonly' : 'readwrite');
      const request = value === undefined ? tx.objectStore('state').get('baselines') : tx.objectStore('state').put(value, 'baselines');
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error('동기화 기준 저장이 중단되었습니다.'));
    });
  }

  async restoreSyncBaselines() {
    if (localStorage.getItem('PT_SYNC_BASELINES') !== '"indexedDB"') return;
    this._baselinesOnDisk = true;
    const saved = await this.syncBaselineDisk();
    if (typeof saved !== 'string') throw new Error('동기화 기준 데이터를 복원하지 못했습니다.');
    this.syncBaselines = new Map(Object.entries(JSON.parse(saved)));
  }

  persistSyncBaselines(baselines = this.syncBaselines) {
    const snapshot = JSON.stringify(Object.fromEntries(baselines));
    const save = async () => {
      if (!this._baselinesOnDisk) {
        try { localStorage.setItem('PT_SYNC_BASELINES', snapshot); return; }
        catch (error) {
          if (error.name !== 'QuotaExceededError' && error.code !== 22 && error.code !== 1014) throw error;
        }
      }
      await this.syncBaselineDisk(snapshot);
      if (await this.syncBaselineDisk() !== snapshot) throw new Error('동기화 기준 저장 검증에 실패했습니다.');
      // Replace the large cache only after the complete disk snapshot is verified.
      localStorage.setItem('PT_SYNC_BASELINES', '"indexedDB"');
      this._baselinesOnDisk = true;
    };
    const pending = (this._baselineWrite || Promise.resolve()).catch(() => {}).then(save);
    this._baselineWrite = pending;
    // Callers still receive the rejection; avoid an unhandled background rejection.
    pending.catch(() => {});
    return pending;
  }

  // --- Supabase Cloud Sync Methods ---
  initSupabase() {
    try {
      let url = DEFAULT_SUPABASE_URL;
      let key = DEFAULT_SUPABASE_KEY;

      const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.url && parsed.key) {
          url = parsed.url;
          key = parsed.key;
        }
      }

      if (url && key && window.supabase) {
        this.supabaseClient = window.supabase.createClient(url, key);
        this.updateSupabaseUI(true);
        this.startLiveSync();
        // Pull latest cloud data for today
        this.pullFromCloud(this.currentDate, false);
        void this.loadSearchHistory();
        return;
      }
    } catch (e) {
      console.error("Supabase init error:", e);
    }
    this.updateSupabaseUI(false);
  }

  updateSupabaseUI(connected) {
    if (this.elBtnSupabase) {
      this.elBtnSupabase.classList.toggle("connected", connected);
      const label = connected ? "클라우드 연결됨 · 연결 설정" : "클라우드 미연결 · 연결 설정";
      this.elBtnSupabase.title = label;
      this.elBtnSupabase.setAttribute("aria-label", label);
    }
    if (this.elSupabaseModalStatus) {
      this.elSupabaseModalStatus.textContent = connected ? "연결됨 (실시간 동기화 중)" : "미연결";
      this.elSupabaseModalStatus.style.background = connected ? "#e2efda" : "#f1f3f5";
      this.elSupabaseModalStatus.style.color = connected ? "#274e13" : "#666";
    }
    if (this.elBtnDisconnectSupabase) {
      this.elBtnDisconnectSupabase.style.display = connected ? "inline-block" : "none";
    }
    if (this.elSupabaseManualSyncBox) {
      this.elSupabaseManualSyncBox.style.display = connected ? "block" : "none";
    }
  }

  openSupabaseModal() {
    try {
      const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
      if (saved) {
        const { url, key } = JSON.parse(saved);
        if (this.elSbUrlInput) this.elSbUrlInput.value = url || "";
        if (this.elSbKeyInput) this.elSbKeyInput.value = key || "";
      }
    } catch (e) {}
    if (this.elSupabaseModal) this.elSupabaseModal.style.display = "flex";
  }

  closeSupabaseModal() {
    if (this.elSupabaseModal) this.elSupabaseModal.style.display = "none";
  }

  async saveSupabaseConfig() {
    const url = (this.elSbUrlInput.value || "").trim();
    const key = (this.elSbKeyInput.value || "").trim();

    if (!url || !key) {
      alert("Supabase Project URL과 Anon Key를 모두 입력해주세요.");
      return;
    }

    if (!window.supabase) {
      alert("Supabase SDK를 로드할 수 없습니다. 인터넷 연결을 확인해주세요.");
      return;
    }

    try {
      const testClient = window.supabase.createClient(url, key);
      // Test query to check table
      const { error } = await testClient.from("pt_daily_records").select("date").limit(1);
      if (error && (error.code === "PGRST204" || (error.message && error.message.includes("relation") && error.message.includes("does not exist")))) {
        alert("Supabase 연결은 확인되었으나, 'pt_daily_records' 테이블이 없습니다.\n하단의 SQL 스크립트를 Supabase SQL Editor에서 실행해주세요!");
      }

      localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, key }));
      this.supabaseClient = testClient;
      this.startLiveSync();
      void this.loadSearchHistory();
      this.updateSupabaseUI(true);
      alert("Supabase 클라우드 동기화가 성공적으로 활성화되었습니다!\n지금부터 모든 기록이 자동 동기화됩니다.");
      this.closeSupabaseModal();

      // Read the shared day first; only explicitly changed dates are uploaded.
      void this.pullFromCloud(this.currentDate);
    } catch (err) {
      console.error("Supabase connect error:", err);
      alert("연결 중 오류가 발생했습니다: " + (err.message || err));
    }
  }

  disconnectSupabase() {
    if (confirm("Supabase 클라우드 연결을 해제하시겠습니까? (로컬 데이터는 안전하게 유지됩니다)")) {
      localStorage.removeItem(SUPABASE_CONFIG_KEY);
      this.stopLiveSync();
      this.supabaseClient = null;
      this.cloudSearchHistory = {};
      this.searchHistoryClient = null;
      this.updateSupabaseUI(false);
      if (this.elSbUrlInput) this.elSbUrlInput.value = "";
      if (this.elSbKeyInput) this.elSbKeyInput.value = "";
      this.closeSupabaseModal();
      alert("연결이 해제되었습니다.");
    }
  }

  stopLiveSync() {
    clearInterval(this.liveSyncTimer);
    clearInterval(this.columnFormattingLiveTimer);
    clearTimeout(this.presetsSyncTimer);
    clearTimeout(this.columnFormattingSyncTimer);
    if (this.liveChannel && this.liveClient) void this.liveClient.removeChannel(this.liveChannel);
    this.liveChannel = null;
    this.syncTimers?.forEach(timer => clearTimeout(timer));
    this.syncTimers?.clear();
  }

  setupNetworkSyncListeners() {
    if (this._networkSyncListenersBound) return;
    this._networkSyncListenersBound = true;
    window.addEventListener("online", () => {
      if (this.supabaseClient) {
        this.startLiveSync();
        void this.pullFromCloud(this.currentDate);
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.supabaseClient) {
        if (!this.liveChannel) this.startLiveSync();
        else void this.pullFromCloud(this.currentDate);
        void this.syncSharedColumnFormatting();
      }
    });
  }

  startLiveSync() {
    this.stopLiveSync();
    const client = this.supabaseClient;
    if (!client) return;
    this.setupNetworkSyncListeners();
    this.liveClient = client;
    this.liveChannel = client.channel("pt-live-updates-v1")
      .on("broadcast", { event: "changed" }, ({ payload }) => {
        if (payload?.date === PT_STAFF_COUNT_SETTINGS_RECORD) { void this.syncStaffCountSettings(); return; }
        if (payload?.date === SHARED_COLUMN_FORMATTING_RECORD) { void this.syncSharedColumnFormatting(); return; }
        if (payload?.date === SHARED_PRESETS_RECORD) void this.pullSharedPresets();
        else if (payload?.date === this.currentDate) void this.pullFromCloud(this.currentDate);
        this.searchHistoryLoadedAt = 0;
      });
    this.liveChannel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Supabase 실시간 채널 연결 이상 감지, 재시도:", status);
        setTimeout(() => {
          if (this.supabaseClient === client && (!this.liveChannel || status === "CHANNEL_ERROR")) {
            this.startLiveSync();
          }
        }, 3000);
      }
    });
    const refresh = async () => {
      if (this.liveRefreshBusy || this.supabaseClient !== client) return;
      this.liveRefreshBusy = true;
      try {
        // pendingSyncDates를 순차적으로 push하여 완료를 기다림
        const pending = [...this.pendingSyncDates];
        for (const date of pending) {
          if (this.supabaseClient !== client) break;
          if (!this.activePushes.has(date)) await this.pushToCloud(date);
        }
        void this.syncStaffCountSettings();
        if (this.presetsDirty) await this.pushSharedPresets();
        else await this.pullSharedPresets();
        // push가 모두 완료된 후 pull 실행
        if (!this.pendingSyncDates.has(this.currentDate)) {
          await this.pullFromCloud(this.currentDate);
        }
      } finally { this.liveRefreshBusy = false; }
    };
    this.liveSyncTimer = setInterval(refresh, 2000);
    this.columnFormattingLiveTimer = setInterval(() => { void this.syncSharedColumnFormatting(); }, 2000);
    void this.syncSharedColumnFormatting();
    void this.syncStaffCountSettings();
    void refresh();
  }

  notifyCloudChange(date) {
    if (this.liveChannel) void this.liveChannel.send({ type: "broadcast", event: "changed", payload: { date } });
  }

  schedulePresetSync() {
    this.presetsDirty = true;
    localStorage.setItem("PT_PRESETS_PENDING", "1");
    clearTimeout(this.presetsSyncTimer);
    this.presetsSyncTimer = setTimeout(() => this.pushSharedPresets(), 250);
  }

  async pullSharedPresets() {
    const client = this.supabaseClient;
    if (!client || this.presetsDirty || this.presetsPushing) return;
    try {
      const { data, error } = await client.from("pt_daily_records").select("rows_data").eq("date", SHARED_PRESETS_RECORD).maybeSingle();
      if (error) throw error;
      if (client !== this.supabaseClient || this.presetsDirty) return;
      const presets = data?.rows_data?.[0]?.presets;
      if (!data) {
        const result = await client.from("pt_daily_records").insert({ date: SHARED_PRESETS_RECORD,
          rows_data: [{ presets: COLUMN_PRESETS }], total_count: 0, updated_at: new Date().toISOString() });
        if (result.error && result.error.code !== "23505") throw result.error;
        return;
      }
      if (!presets || !Object.values(presets).every(values => Array.isArray(values) && values.every(value => typeof value === "string"))) return;
      if (JSON.stringify(presets) === JSON.stringify(COLUMN_PRESETS)) return;
      COLUMN_PRESETS = presets;
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
      this.renderQuickChips();
      this.refreshSearchSuggestions();
    } catch (error) { this.showSaveIndicator("빠른 입력 도구 동기화 재시도 중", true); }
  }

  async pushSharedPresets() {
    const client = this.supabaseClient;
    if (!client || !this.presetsDirty || this.presetsPushing) return;
    this.presetsPushing = true;
    const snapshot = JSON.stringify(COLUMN_PRESETS);
    try {
      const { error } = await client.from("pt_daily_records").upsert({ date: SHARED_PRESETS_RECORD,
        rows_data: [{ presets: JSON.parse(snapshot) }], total_count: 0, updated_at: new Date().toISOString() });
      if (error) throw error;
      if (JSON.stringify(COLUMN_PRESETS) === snapshot) {
        this.presetsDirty = false; localStorage.removeItem("PT_PRESETS_PENDING");
      }
      this.notifyCloudChange(SHARED_PRESETS_RECORD);
    } catch (error) { this.showSaveIndicator("빠른 입력 도구 동기화 재시도 중", true); }
    finally { this.presetsPushing = false; }
  }

  scheduleSupabaseSync(date = this.currentDate, persistBaseline = true) {
    this.pendingSyncDates.add(date);
    localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates]));
    // Pending dates keep their merge baseline until every bulk edit is synced.
    const baselineDates = [...this.syncBaselines.keys()].filter(date => !this.pendingSyncDates.has(date)).sort();
    while (baselineDates.length > 14) {
      this.syncBaselines.delete(baselineDates.shift());
    }
    if (persistBaseline) {
      void Promise.resolve(this.syncBaselinesReady).then(() => this.persistSyncBaselines())
        .catch(() => this.showSaveIndicator('동기화 기준 저장 재시도 필요', true));
    }
    if (!this.supabaseClient) return;
    clearTimeout(this.syncTimers.get(date));
    this.syncTimers.set(date, setTimeout(() => { this.syncTimers.delete(date); void this.pushToCloud(date); }, 400));
  }

  rebaseEditHistoryAfterSync(date, previousRows) {
    const history = this.editHistory?.get(date);
    if (!history) return;
    const currentRows = this.dataStore[date] || [];
    const remapped = new Map();
    const rebase = snapshot => {
      if (!remapped.has(snapshot)) remapped.set(snapshot,
        JSON.stringify(this.mergeCloudRows(previousRows, JSON.parse(snapshot), currentRows)));
      return remapped.get(snapshot);
    };
    history.undo = history.undo.map(rebase);
    history.redo = history.redo.map(rebase);
    history.current = rebase(history.current);
    if (history.applySelections) history.applySelections = new Map(
      [...history.applySelections].filter(([snapshot]) => remapped.has(snapshot))
        .map(([snapshot, selection]) => [remapped.get(snapshot), selection]));
  }

  mergeCloudRows(base, local, remote) {
    if (!base || base.length === 0) return local;
    const merged = JSON.parse(JSON.stringify(remote || []));
    const maxLen = Math.max(local.length, merged.length, base.length);
    for (let i = 0; i < maxLen; i++) {
      const before = base[i] || {}, after = local[i] || {};
      merged[i] ||= {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
        if (key in after) merged[i][key] = after[key]; else delete merged[i][key];
      }
    }
    if (local.length < base.length) merged.length = local.length;
    return merged;
  }

  async pushToCloud(dateStr, showNotice = false) {
    try { await this.syncBaselinesReady; await this._baselineWrite; }
    catch (_) { this.showSaveIndicator('동기화 기준 저장·복원 확인 필요 · 동기화 보류', true); return; }
    const client = this.supabaseClient;
    if (!client || this.activePushes.has(dateStr)) return;
    const snapshot = JSON.stringify(this.dataStore[dateStr] || []);
    const local = JSON.parse(snapshot), base = this.syncBaselines.get(dateStr) || [];
    this.activePushes.set(dateStr, true);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error: readError } = await client.from("pt_daily_records").select("rows_data, updated_at").eq("date", dateStr).maybeSingle();
        if (readError) throw readError;
        // A date absent from the server has no merge baseline. Recreate it from
        // the full local snapshot, including unchanged records from older dates.
        const rows = data ? this.mergeCloudRows(base, local, data.rows_data || []) : local;
        const record = { date: dateStr, rows_data: rows, total_count: this.getDailySummary(rows).total, updated_at: new Date(Math.max(Date.now(), (Date.parse(data?.updated_at) || 0) + 1)).toISOString() };
        let result;
        if (data) {
          const update = client.from("pt_daily_records").update(record).eq("date", dateStr);
          result = await (data.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", data.updated_at)).select("date");
        } else result = await client.from("pt_daily_records").insert(record).select("date");
        if (result.error?.code === "23505") continue;
        if (result.error) throw result.error;
        if (!result.data?.length) continue;
        if (client !== this.supabaseClient) return;
        const latest = this.dataStore[dateStr] || [];
        const latestText = JSON.stringify(latest);
        const rebased = this.mergeCloudRows(local, latest, rows);
        // Keep existing row objects alive for an editor that may still be typing.
        for (let i = 0; i < rebased.length; i++) {
          if (!latest[i]) latest[i] = rebased[i];
          else { for (const key of Object.keys(latest[i])) delete latest[i][key]; Object.assign(latest[i], rebased[i]); }
        }
        latest.length = rebased.length;
        this.dataStore[dateStr] = latest;
        if (JSON.stringify(latest) !== latestText) this.rebaseEditHistoryAfterSync(dateStr, JSON.parse(latestText));
        this.syncBaselines.set(dateStr, JSON.parse(JSON.stringify(rows)));
        const mergedSnapshot = JSON.stringify(latest);
        await this.persistSyncBaselines();
        if (latestText === snapshot && JSON.stringify(this.dataStore[dateStr] || []) === mergedSnapshot) this.pendingSyncDates.delete(dateStr);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.dataStore));
        if (dateStr === this.currentDate && JSON.stringify(latest) !== latestText && !this.isEditingCell()) {
          this.renderTable(); this.updateSidebarStats();
        }
        if (dateStr === this.currentDate) this.updateHistoryButtons();
        localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates]));
        this.notifyCloudChange(dateStr);
        this.showSaveIndicator("클라우드 동기화 완료");
        return;
      }
      throw new Error("다른 기기의 변경으로 재시도가 필요합니다");
    } catch (error) {
      this.pendingSyncDates.add(dateStr);
      localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates]));
      this.showSaveIndicator("클라우드 동기화 재시도 중", true);
      if (showNotice) alert("클라우드 업로드 실패: " + error.message);
    } finally { this.activePushes.delete(dateStr); }
  }

  async pullFromCloud(dateStr, showNotice = false) {
    try { await this.syncBaselinesReady; await this._baselineWrite; }
    catch (_) { this.showSaveIndicator('동기화 기준 저장·복원 확인 필요 · 동기화 보류', true); return; }
    if (this.pendingSyncDates?.has(dateStr) || this.activePushes?.has(dateStr) ||
        (dateStr === this.currentDate && this.isEditingCell())) return;
    const localAtRequest = JSON.stringify(this.dataStore[dateStr] || []);
    const client = this.supabaseClient;
    if (!client) {
      if (showNotice) alert("Supabase가 연결되어 있지 않습니다.");
      return;
    }

    try {
      const { data, error } = await this.supabaseClient
        .from("pt_daily_records")
        .select("rows_data, updated_at")
        .eq("date", dateStr)
        .maybeSingle();

      if (error) {
        console.warn("Cloud pull warning:", error);
        if (showNotice) alert("클라우드 데이터 가져오기 실패: " + error.message);
        return;
      }

      if (this.supabaseClient !== client || this.pendingSyncDates.has(dateStr) ||
          localAtRequest !== JSON.stringify(this.dataStore[dateStr] || []) ||
          (dateStr === this.currentDate && this.isEditingCell())) return;
      if (!this.syncBaselines.has(dateStr) && this.getDailySummary(this.dataStore[dateStr] || []).total &&
          JSON.stringify(data?.rows_data || []) !== localAtRequest) {
        this.pendingSyncDates.add(dateStr);
        localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates]));
        await this.pushToCloud(dateStr, showNotice);
        return;
      }
      if (data && Array.isArray(data.rows_data)) {
        this.syncBaselines.set(dateStr, JSON.parse(JSON.stringify(data.rows_data)));
        await this.persistSyncBaselines();
        if (this.supabaseClient !== client || this.pendingSyncDates.has(dateStr) ||
            localAtRequest !== JSON.stringify(this.dataStore[dateStr] || []) ||
            (dateStr === this.currentDate && this.isEditingCell())) return;
        const padded = data.rows_data.slice();
        if (dateStr === this.currentDate) this.normalizeRowAllocation(padded, dateStr);
        if (localAtRequest === JSON.stringify(padded)) return;
        const previousRows = JSON.stringify(this.dataStore[dateStr] || []);
        this.dataStore[dateStr] = data.rows_data;
        // Ensure the current default row count
        this.getCurrentRows();
        if (previousRows !== JSON.stringify(this.dataStore[dateStr])) this.rebaseEditHistoryAfterSync(dateStr, JSON.parse(previousRows));
        this.getEditHistory(dateStr);
        this.updateHistoryButtons();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.dataStore));
        if (this.currentDate === dateStr) {
          this.renderTable();
          this.updateSidebarStats();
        }
        this.showSaveIndicator("클라우드 데이터 수신됨");
        if (showNotice) alert(`${dateStr} 클라우드 최신 데이터를 성공적으로 불러왔습니다!`);
      } else {
        this.syncBaselines.set(dateStr, []);
        if (this.getDailySummary(this.dataStore[dateStr] || []).total) {
          this.pendingSyncDates.add(dateStr);
          localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates]));
          await this.pushToCloud(dateStr, showNotice);
          return;
        }
        if (showNotice) alert(`${dateStr} 일자의 클라우드 데이터가 아직 없습니다.`);
      }
    } catch (err) {
      console.error("Cloud pull exception:", err);
      if (showNotice) alert("클라우드 통신 오류: " + err.message);
    }
  }

  // =============================================================================
  // Right-Click Context Menu & Excel Actions (우클릭 컨텍스트 메뉴 및 엑셀 액션)
  // =============================================================================
}
