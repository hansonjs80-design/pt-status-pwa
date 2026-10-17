// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTCloudSync {
  async runCloudQuery(query, timeoutMs = 15000) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    if (controller && typeof query.abortSignal === 'function') query = query.abortSignal(controller.signal);
    let timer;
    try {
      return await Promise.race([
        query,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('클라우드 응답 시간이 초과되었습니다.'));
            controller?.abort();
          }, timeoutMs);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  // --- Supabase Cloud Sync Methods ---
  initSupabase() {
    if (!window.supabase && !this._supabaseLoadBound) {
      this._supabaseLoadBound = true;
      document.getElementById('supabaseSdk')?.addEventListener('load', () => this.initSupabase(), { once: true });
    }
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
      const { error } = await this.runCloudQuery(testClient.from("pt_daily_records").select("date").limit(1));
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
    this.liveSyncSession = null;
    this.liveRefreshBusy = false;
    clearTimeout(this.liveReconnectTimer);
    clearInterval(this.liveSyncTimer);
    clearInterval(this.columnFormattingLiveTimer);
    clearInterval(this.presetsLiveTimer);
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
        void this.syncSharedPresets();
      }
    });
  }

  startLiveSync() {
    this.stopLiveSync();
    const client = this.supabaseClient;
    if (!client) return;
    this.setupNetworkSyncListeners();
    this.liveClient = client;
    const session = this.liveSyncSession = {};
    this.liveChannel = client.channel("pt-live-updates-v1")
      .on("broadcast", { event: "changed" }, ({ payload }) => {
        if (payload?.date === PT_STAFF_COUNT_SETTINGS_RECORD) { void this.syncStaffCountSettings(); return; }
        if (payload?.date === SHARED_COLUMN_FORMATTING_RECORD) { void this.syncSharedColumnFormatting(); return; }
        if (payload?.date === SHARED_PRESETS_RECORD) { void this.syncSharedPresets({force:true}); return; }
        else if (payload?.date === this.currentDate) void this.pullFromCloud(this.currentDate);
        this.searchHistoryLoadedAt = 0;
      });
    this.liveChannel.subscribe((status) => {
      if (this.liveSyncSession !== session) return;
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Supabase 실시간 채널 연결 이상 감지, 재시도:", status);
        clearTimeout(this.liveReconnectTimer);
        this.liveReconnectTimer = setTimeout(() => {
          if (this.supabaseClient === client && this.liveSyncSession === session) this.startLiveSync();
        }, 3000);
      }
    });
    const refresh = async () => {
      if (this.liveRefreshBusy || this.supabaseClient !== client || this.liveSyncSession !== session) return;
      this.liveRefreshBusy = true;
      try {
        // pendingSyncDates를 순차적으로 push하여 완료를 기다림
        const pending = [...this.pendingSyncDates];
        for (const date of pending) {
          if (this.supabaseClient !== client || this.liveSyncSession !== session) return;
          if (!this.activePushes.has(date)) await this.pushToCloud(date);
        }
        if (this.liveSyncSession !== session) return;
        void this.syncStaffCountSettings();
        // push가 모두 완료된 후 pull 실행
        if (this.liveSyncSession === session && !this.pendingSyncDates.has(this.currentDate)) {
          await this.pullFromCloud(this.currentDate);
        }
      } catch (error) {
        if (this.liveSyncSession === session) this.showSaveIndicator('클라우드 동기화 대기 · 연결되면 다시 시도합니다', true);
      } finally { if (this.liveSyncSession === session) this.liveRefreshBusy = false; }
    };
    this.presetsLiveTimer = setInterval(() => { if (this.liveSyncSession === session) void this.syncSharedPresets(); }, 2000);
    void this.syncSharedPresets();
    this.liveSyncTimer = setInterval(refresh, 2000);
    this.columnFormattingLiveTimer = setInterval(() => { void this.syncSharedColumnFormatting(); }, 2000);
    void this.syncSharedColumnFormatting();
    void this.syncStaffCountSettings();
    void refresh();
  }

  notifyCloudChange(date) {
    // Polling is the fallback. A failed optional broadcast must not turn an
    // acknowledged database write into a misleading save/retry error.
    try {
      if (this.liveChannel) void Promise.resolve(this.liveChannel.send({ type: "broadcast", event: "changed", payload: { date } })).catch(() => {});
    } catch (_) {}
  }

  schedulePresetSync() {
    this.presetsDirty = true;
    this.presetEditRevision = (this.presetEditRevision || 0) + 1;
    localStorage.setItem("PT_PRESETS_PENDING", "1");
    clearTimeout(this.presetsSyncTimer);
    this.presetsSyncTimer = setTimeout(() => { void this.pushSharedPresets(); }, 250);
  }

  syncSharedPresets(options) {
    return this.presetsDirty ? this.pushSharedPresets() : this.pullSharedPresets(options);
  }

  reportPresetSyncFailure(error) {
    this.presetsSyncFailed = true;
    this.presetSyncLastError = String(error?.message || error || '클라우드 연결 실패');
    this.showSaveIndicator('빠른 입력 도구 동기화 대기 · 연결되면 재시도', true);
    if (this.elSaveStatus) this.elSaveStatus.title = this.presetSyncLastError;
  }

  completePresetSync() {
    if (this.presetsSyncFailed && (!this.elSaveStatus || this.elSaveStatus.textContent.startsWith('빠른 입력 도구 동기화'))) {
      if (this.elSaveStatus) this.elSaveStatus.title = '';
      this.showSaveIndicator('빠른 입력 도구 동기화 완료');
    }
    this.presetsSyncFailed = false;
    this.presetSyncLastError = null;
  }

  pullSharedPresets({force = false} = {}) {
    const client = this.supabaseClient;
    if (!client || this.presetsDirty || this.presetPushOperation?.client === client) return Promise.resolve();
    if (this.presetPullOperation?.client === client) {
      this.presetPullOperation.force ||= force;
      return this.presetPullOperation.task;
    }
    const operation = {client,force};
    this.presetPullOperation = operation;
    operation.task = (async () => {
      const snapshot = JSON.stringify(COLUMN_PRESETS), revision = this.presetEditRevision || 0;
      const current = () => client === this.supabaseClient && this.presetPullOperation === operation &&
        !this.presetsDirty && (this.presetEditRevision || 0) === revision && JSON.stringify(COLUMN_PRESETS) === snapshot;
      try {
        const cache = this.presetRemoteCache;
        let data;
        // Poll a tiny revision first once the full configuration is known.
        // Missing/legacy revisions always fall back to reading all settings.
        if (!operation.force && cache?.client === client && cache.version != null && cache.snapshot === snapshot && Date.now() - cache.readAt < 30000) {
          const result = await this.runCloudQuery(client.from('pt_daily_records').select('updated_at').eq('date', SHARED_PRESETS_RECORD).maybeSingle());
          if (result.error) throw result.error;
          if (!current()) return;
          if (!operation.force && result.data && Date.parse(result.data.updated_at) === cache.version) { this.completePresetSync(); return; }
        }
        const result = await this.runCloudQuery(client.from('pt_daily_records').select('rows_data, updated_at').eq('date', SHARED_PRESETS_RECORD).maybeSingle());
        if (result.error) throw result.error;
        if (!current()) return;
        data = result.data;
        if (!data) {
          const updated_at = new Date().toISOString();
          const seeded = await this.runCloudQuery(client.from('pt_daily_records').insert({date:SHARED_PRESETS_RECORD,
            rows_data:[{presets:JSON.parse(snapshot)}],total_count:0,updated_at}));
          if (seeded.error && seeded.error.code !== '23505') throw seeded.error;
          if (!current()) return;
          if (!seeded.error) { this.presetRemoteCache = {client,snapshot,version:Date.parse(updated_at),readAt:Date.now()}; this.completePresetSync(); }
          return;
        }
        let presets = data.rows_data?.[0]?.presets;
        if (!presets || typeof presets !== 'object' || Array.isArray(presets) ||
            !Object.values(presets).every(values => Array.isArray(values) && values.every(value => typeof value === 'string'))) {
          throw new Error('공유 빠른 입력 도구의 저장 형식을 확인해 주세요. 이 기기의 설정은 유지됩니다.');
        }
        presets = PTPresetCandidates.normalizeStorage(presets);
        const remote = JSON.stringify(presets);
        if (remote !== snapshot) {
          // Persist before publishing; a quota failure must leave the live list intact.
          COLUMN_PRESETS = persistColumnPresets(presets);
          this.renderQuickChips();
          this.refreshSearchSuggestions();
        }
        this.presetRemoteCache = {client,snapshot:remote,version:Number.isFinite(Date.parse(data.updated_at)) ? Date.parse(data.updated_at) : null,readAt:Date.now()};
        this.completePresetSync();
      } catch (error) { if (current()) this.reportPresetSyncFailure(error); }
      finally { if (this.presetPullOperation === operation) this.presetPullOperation = null; }
    })();
    return operation.task;
  }

  pushSharedPresets() {
    const client = this.supabaseClient;
    if (!client) return Promise.resolve();
    if (this.presetPushOperation?.client === client) return this.presetPushOperation.task;
    // A previous connection may still be writing to the same backend. Finish
    // it before uploading through a new client so an old write cannot win late.
    if (this.presetPushOperation) return this.presetPushOperation.task.then(() => this.pushSharedPresets());
    if (!this.presetsDirty) return Promise.resolve();
    clearTimeout(this.presetsSyncTimer);
    const operation = {client};
    this.presetPushOperation = operation;
    this.presetsPushing = true;
    operation.task = (async () => {
      try {
        // One request at a time; changes made during that request follow
        // immediately as one latest snapshot, without waiting for a poll.
        while (client === this.supabaseClient && this.presetPushOperation === operation && this.presetsDirty) {
          const normalized = PTPresetCandidates.normalizeStorage(COLUMN_PRESETS);
          if (normalized !== COLUMN_PRESETS || localStorage.getItem(PRESETS_STORAGE_KEY) !== JSON.stringify(normalized)) {
            COLUMN_PRESETS = persistColumnPresets(normalized);
          }
          const snapshot = JSON.stringify(COLUMN_PRESETS);
          const updated_at = new Date(Math.max(Date.now(), (this.presetLastWriteAt || 0) + 1)).toISOString();
          this.presetLastWriteAt = Date.parse(updated_at);
          const {error} = await this.runCloudQuery(client.from('pt_daily_records').upsert({date:SHARED_PRESETS_RECORD,
            rows_data:[{presets:JSON.parse(snapshot)}],total_count:0,updated_at}));
          if (error) throw error;
          if (client !== this.supabaseClient || this.presetPushOperation !== operation) return;
          this.presetRemoteCache = {client,snapshot,version:Date.parse(updated_at),readAt:Date.now()};
          if (JSON.stringify(COLUMN_PRESETS) === snapshot) {
            localStorage.removeItem('PT_PRESETS_PENDING');
            this.presetsDirty = false;
          }
          this.notifyCloudChange(SHARED_PRESETS_RECORD);
        }
        if (client === this.supabaseClient && this.presetPushOperation === operation) this.completePresetSync();
      } catch (error) {
        if (client === this.supabaseClient && this.presetPushOperation === operation) this.reportPresetSyncFailure(error);
      } finally {
        if (this.presetPushOperation === operation) { this.presetPushOperation = null; this.presetsPushing = false; }
      }
    })();
    return operation.task;
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

  mergeCloudRows(base, local, remote, { readOnly = false } = {}) {
    if (!base || base.length === 0) return local;
    // Search only reads the result. Copy a row on change instead of cloning
    // every historical cell and its formatting for each query/keystroke.
    const merged = readOnly ? (remote || []).slice() : JSON.parse(JSON.stringify(remote || []));
    const maxLen = Math.max(local.length, merged.length, base.length);
    for (let i = 0; i < maxLen; i++) {
      const before = base[i] || {}, after = local[i] || {};
      merged[i] ||= {};
      let copied = !readOnly;
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (before[key] === after[key] || JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
        if (!copied) { merged[i] = { ...merged[i] }; copied = true; }
        if (key in after) merged[i][key] = after[key]; else delete merged[i][key];
      }
    }
    if (local.length < base.length) merged.length = local.length;
    return merged;
  }

  getPatientIdentitySnapshot(rows) {
    return JSON.stringify((rows || []).map(row => [String(row?.name || '').trim(), String(row?.chartNo || '').trim()])
      .filter(([name, chartNo]) => name || chartNo));
  }

  async restoreManualDateDeletions() {
    this.manualDateDeletions ||= new Map();
    try {
      const saved = JSON.parse(await this.syncStateDisk('manual-date-deletions') || '{}');
      for (const [date, entry] of Object.entries(saved)) {
        if (typeof entry?.patients === 'string' && entry.patients !== '[]' && !this.manualDateDeletions.has(date)) {
          this.manualDateDeletions.set(date, entry);
        }
      }
    } catch (_) { /* Without verified intent, the empty-date protection remains active. */ }
  }

  persistManualDateDeletions() {
    const previous = this._manualDeletionWrite || Promise.resolve();
    this._manualDeletionWrite = previous.catch(() => {}).then(async () => {
      await this.manualDateDeletionsReady;
      const text = JSON.stringify(Object.fromEntries(this.manualDateDeletions || []));
      await this.syncStateDisk('manual-date-deletions', text);
      if (await this.syncStateDisk('manual-date-deletions') !== text) throw new Error('수동 삭제 상태 저장 검증 실패');
    });
    this._manualDeletionWrite.catch(() => this.showSaveIndicator('수동 삭제 저장 확인 필요 · 동기화 보류', true));
  }

  recordManualDateDeletion(previousPatients, date = this.currentDate) {
    if (previousPatients === '[]' || this.getPatientIdentitySnapshot(this.dataStore[date]) !== '[]') return;
    this.manualDateDeletions ||= new Map();
    this.manualDateDeletions.set(date, { patients: previousPatients });
    this.persistManualDateDeletions();
  }

  invalidateManualDateDeletion(date) {
    if (this.manualDateDeletions?.delete(date)) this.persistManualDateDeletions();
  }

  async restoreProtectedCloudDate(date, record) {
    // Preserve the suspect local cache separately before adopting the intact server day.
    const backup = JSON.stringify({date, local: this.dataStore[date] || null,
      baseline: this.syncBaselines.get(date) || null, serverUpdatedAt: record.updated_at});
    const key = `quarantined:${date}:${Date.now()}`;
    await this.syncStateDisk(key, backup);
    if (await this.syncStateDisk(key) !== backup) throw new Error('로컬 기록 보존 검증 실패');
    this.dataStore[date] = JSON.parse(JSON.stringify(record.rows_data));
    this.invalidateAutocompleteHistory();
    this.invalidateManualDateDeletion(date);
    this.syncBaselines.set(date, JSON.parse(JSON.stringify(record.rows_data)));
    await this.persistDataStore();
    await this.persistSyncBaselines();
    this.pendingSyncDates.delete(date);
    localStorage.setItem('PT_PENDING_DATES', JSON.stringify([...this.pendingSyncDates]));
    if (date === this.currentDate) { this.renderTable(); this.updateSidebarStats(); }
    this.showSaveIndicator(`${date} 클라우드 기록 복원 · 기존 로컬 상태 별도 보관`);
  }

  async pushToCloud(dateStr, showNotice = false) {
    try { await this.syncBaselinesReady; await this._baselineWrite; await this._recordWrite; await this._manualDeletionWrite; }
    catch (_) { this.showSaveIndicator('동기화 기준 저장·복원 확인 필요 · 동기화 보류', true); return; }
    const client = this.supabaseClient;
    if (!client || this.activePushes.has(dateStr)) return;
    // A persisted retry queue can outlive a failed bulk-record save. Missing data
    // is not a deletion request and must never become an empty server snapshot.
    const missingLocal = !Object.hasOwn(this.dataStore, dateStr) || !Array.isArray(this.dataStore[dateStr]);
    const snapshot = JSON.stringify(this.dataStore[dateStr] || []);
    const local = JSON.parse(snapshot), base = this.syncBaselines.get(dateStr) || [];
    const manualDeletion = this.manualDateDeletions?.get(dateStr);
    this.activePushes.set(dateStr, true);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error: readError } = await this.runCloudQuery(client.from("pt_daily_records").select("rows_data, updated_at").eq("date", dateStr).maybeSingle());
        if (readError) throw readError;
        if (client !== this.supabaseClient) return;
        if (missingLocal) {
          if (data && Array.isArray(data.rows_data) && data.rows_data.some(row => String(row?.name || '').trim() || String(row?.chartNo || '').trim())) {
            await this.restoreProtectedCloudDate(dateStr, data);
          } else this.showSaveIndicator(`${dateStr} 로컬 기록 없음 · 업로드 보류`, true);
          return;
        }
        // A date absent from the server has no merge baseline. Recreate it from
        // the full local snapshot, including unchanged records from older dates.
        const rows = data ? this.mergeCloudRows(base, local, data.rows_data || []) : local;
        const hasPatients = values => values.some(row => String(row?.name || '').trim() || String(row?.chartNo || '').trim());
        const deliberateDeletion = manualDeletion && !hasPatients(local) &&
          manualDeletion.patients === this.getPatientIdentitySnapshot(data?.rows_data);
        if (data && hasPatients(data.rows_data || []) && !hasPatients(rows) && !deliberateDeletion) {
          // Full-day removal must be deliberate; stale/partial caches cannot erase
          // a populated date. Keep both the retry state and server data intact.
          this.showSaveIndicator(`${dateStr} 전체 기록 삭제 감지 · 클라우드 기록 보존`, true);
          await this.restoreProtectedCloudDate(dateStr, data);
          return;
        }
        const record = { date: dateStr, rows_data: rows, total_count: this.getDailySummary(rows).total, updated_at: new Date(Math.max(Date.now(), (Date.parse(data?.updated_at) || 0) + 1)).toISOString() };
        let result;
        if (data) {
          const update = client.from("pt_daily_records").update(record).eq("date", dateStr);
          result = await this.runCloudQuery((data.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", data.updated_at)).select("date"));
        } else result = await this.runCloudQuery(client.from("pt_daily_records").insert(record).select("date"));
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
        if (dateStr !== this.currentDate) this.invalidateAutocompleteHistory();
        if (JSON.stringify(latest) !== latestText) this.rebaseEditHistoryAfterSync(dateStr, JSON.parse(latestText));
        this.syncBaselines.set(dateStr, JSON.parse(JSON.stringify(rows)));
        const mergedSnapshot = JSON.stringify(latest);
        await this.persistSyncBaselines();
        if (latestText === snapshot && JSON.stringify(this.dataStore[dateStr] || []) === mergedSnapshot) this.pendingSyncDates.delete(dateStr);
        await this.persistDataStore();
        if (manualDeletion && this.manualDateDeletions?.get(dateStr) === manualDeletion) {
          this.invalidateManualDateDeletion(dateStr);
          await this._manualDeletionWrite;
        }
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
    try { await this.syncBaselinesReady; await this._baselineWrite; await this._recordWrite; }
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
      const { data, error } = await this.runCloudQuery(client
        .from("pt_daily_records")
        .select("rows_data, updated_at")
        .eq("date", dateStr)
        .maybeSingle());

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
        // The two-second poll normally receives the same day. Avoid rewriting
        // the entire multi-date baseline store while the user is navigating.
        if (JSON.stringify(this.syncBaselines.get(dateStr)) !== JSON.stringify(data.rows_data)) {
          this.syncBaselines.set(dateStr, JSON.parse(JSON.stringify(data.rows_data)));
          await this.persistSyncBaselines();
        }
        if (this.supabaseClient !== client || this.pendingSyncDates.has(dateStr) ||
            localAtRequest !== JSON.stringify(this.dataStore[dateStr] || []) ||
            (dateStr === this.currentDate && this.isEditingCell())) return;
        const padded = data.rows_data.slice();
        if (dateStr === this.currentDate) this.normalizeRowAllocation(padded, dateStr);
        if (localAtRequest === JSON.stringify(padded)) return;
        const previousRows = JSON.stringify(this.dataStore[dateStr] || []);
        this.dataStore[dateStr] = data.rows_data;
        if (dateStr !== this.currentDate) this.invalidateAutocompleteHistory();
        // Ensure the current default row count
        this.getCurrentRows();
        if (previousRows !== JSON.stringify(this.dataStore[dateStr])) this.rebaseEditHistoryAfterSync(dateStr, JSON.parse(previousRows));
        this.getEditHistory(dateStr);
        this.updateHistoryButtons();
        await this.persistDataStore();
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
