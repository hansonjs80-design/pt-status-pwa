// Local record persistence and recovery; no cloud requests or application startup.
class PTLocalRecordStore {
  openLocalDatabase(name, storeName) {
    this._localDatabases ||= new Map();
    if (this._localDatabases.has(name)) return this._localDatabases.get(name);
    const ready = new Promise((resolve, reject) => {
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error('기기 저장소 연결 시간이 초과되었습니다. 다시 시도해 주세요.')), 15000);
      let request;
      try { request = indexedDB.open(name, 1); }
      catch (error) { fail(error); return; }
      request.onupgradeneeded = () => {
        if (settled) { request.transaction.abort(); return; }
        request.result.createObjectStore(storeName);
      };
      request.onblocked = () => fail(new Error('다른 창에서 기기 저장소를 사용 중입니다. 다른 창을 닫고 다시 시도해 주세요.'));
      request.onerror = () => fail(request.error || new Error('기기 저장소를 열지 못했습니다.'));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        clearTimeout(timer);
        const release = () => {
          if (this._localDatabases.get(name) === ready) this._localDatabases.delete(name);
        };
        db.onversionchange = () => { release(); db.close(); };
        db.onclose = release;
        resolve(db);
      };
    });
    this._localDatabases.set(name, ready);
    ready.catch(() => {
      if (this._localDatabases.get(name) === ready) this._localDatabases.delete(name);
    });
    return ready;
  }

  async localDatabaseStore(name, storeName, key, value) {
    const ready = this.openLocalDatabase(name, storeName);
    const db = await ready;
    return new Promise((resolve, reject) => {
      let tx, request, settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          if (this._localDatabases.get(name) === ready) this._localDatabases.delete(name);
          try { tx?.abort(); } catch (_) {}
          db.close();
          reject(error);
        } else resolve(request.result);
      };
      const timer = setTimeout(() => finish(new Error('기기 저장소 응답 시간이 초과되었습니다. 다시 시도해 주세요.')), 15000);
      try {
        tx = db.transaction(storeName, value === undefined ? 'readonly' : 'readwrite');
        request = value === undefined ? tx.objectStore(storeName).get(key) : tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => finish();
        tx.onerror = () => finish(tx.error || request.error || new Error('기기 저장소 처리 실패'));
        tx.onabort = () => finish(tx.error || new Error('기기 저장소 처리가 중단되었습니다.'));
      } catch (error) { finish(error); }
    });
  }

  restoreLocalState() {
    if (this._localRestoreTask) return this._localRestoreTask;
    const needsRecords = Boolean((this._recordsOnDisk && !this._recordsRestored) || this._recordRestoreError);
    this._recordsRestorePending = needsRecords;
    this.updateLocalRestoreUI(needsRecords ? 'loading' : '');
    this.manualDateDeletionsReady = this.restoreManualDateDeletions();
    const recordsReady = (async () => {
      if (!needsRecords) return;
      if (this._recordRestoreError) {
        this._recordRestoreError = null;
        this.dataStore = this.loadDataStore();
      }
      await this.restoreDiskRecords();
      this._recordsRestored = true;
      this._recordsRestorePending = false;
      // 처방열에만 "한랭"이 있는 버그 행 일회성 정리 (IndexedDB 경로)
      this.cleanupHanraengBugRows();
      this.updateLocalRestoreUI('');
      this.getCurrentRows();
      this.editHistory.clear();
      this.renderTable();
      this.updateSidebarStats();
    })();
    this.syncBaselinesReady = Promise.allSettled([recordsReady, this.restoreSyncBaselines(), this.manualDateDeletionsReady])
      .then(results => {
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
      });
    const task = this.syncBaselinesReady.then(() => {
      this.updateLocalRestoreUI('');
    }, () => {
      this.updateLocalRestoreUI(this._recordsRestorePending ? 'records-error' : 'sync-error');
      this.showSaveIndicator('기기 저장소 복원 확인 필요 · 다시 시도해 주세요', true);
    }).finally(() => { if (this._localRestoreTask === task) this._localRestoreTask = null; });
    this._localRestoreTask = task;
    return task;
  }

  updateLocalRestoreUI(state) {
    const panel = document.getElementById('localRestoreNotice');
    const app = document.querySelector('.excel-app');
    if (app) app.inert = Boolean(this._recordsRestorePending);
    if (!panel) return;
    panel.hidden = !state;
    const message = panel.querySelector('[data-restore-message]');
    message.textContent = state === 'loading' ? '이 기기에 저장된 기록을 불러오는 중입니다.'
      : state === 'records-error' ? '저장된 기록을 아직 불러오지 못했습니다. 기존 기록을 보존하고 있습니다. 다시 시도해 주세요.'
        : '기록은 열렸지만 동기화 준비를 완료하지 못했습니다. 다시 시도해 주세요.';
    const retry = panel.querySelector('button');
    retry.disabled = state === 'loading';
    retry.onclick = () => void this.restoreLocalState();
  }

  async syncBaselineDisk(value) {
    return this.syncStateDisk('baselines', value);
  }

  async syncStateDisk(key, value) {
    return this.localDatabaseStore('PT_SYNC_STATE', 'state', key, value);
  }

  async restoreSyncBaselines() {
    if (localStorage.getItem('PT_SYNC_BASELINES') !== '"indexedDB"') return;
    this._baselinesOnDisk = true;
    const saved = await this.syncBaselineDisk();
    if (typeof saved !== 'string') throw new Error('동기화 기준 데이터를 복원하지 못했습니다.');
    this.syncBaselines = new Map(Object.entries(JSON.parse(saved)));
  }

  async restoreDiskRecords() {
    if (this._recordRestoreError) throw this._recordRestoreError;
    if (!this._recordsOnDisk) return;
    const saved = await this.syncStateDisk('records');
    const records = typeof saved === 'string' ? JSON.parse(saved) : null;
    if (!this.isValidRecordStore(records)) throw new Error('로컬 기록을 복원하지 못했습니다.');
    this.dataStore = records;
  }

  isValidRecordStore(records) {
    return records && typeof records === 'object' && !Array.isArray(records) &&
      Object.values(records).every(rows => Array.isArray(rows) &&
        rows.every(row => row && typeof row === 'object' && !Array.isArray(row)));
  }

  queueLocalSnapshot(key, snapshot, write) {
    this.localSnapshotQueues ||= new Map();
    let queue = this.localSnapshotQueues.get(key);
    if (!queue) { queue = { active: false, waiting: null }; this.localSnapshotQueues.set(key, queue); }
    const pending = new Promise((resolve, reject) => {
      // Replace only work that has not started. Its callers still wait until
      // the newest snapshot has been written and verified, or receive its error.
      const waiters = queue.waiting?.waiters || [];
      waiters.push({ resolve, reject });
      queue.waiting = { snapshot, write, waiters };
    });
    const drain = async () => {
      if (queue.active) return;
      queue.active = true;
      try {
        while (queue.waiting) {
          const job = queue.waiting;
          queue.waiting = null;
          try {
            await job.write(job.snapshot);
            for (const waiter of job.waiters) waiter.resolve();
          } catch (error) {
            for (const waiter of job.waiters) waiter.reject(error);
          }
        }
      } finally { queue.active = false; }
    };
    void drain();
    pending.catch(() => {});
    return pending;
  }

  persistDataStore(records = this.dataStore) {
    if (this._recordsRestorePending) return Promise.reject(new Error('기록 복원 중에는 저장할 수 없습니다.'));
    if (this._recordRestoreError) return Promise.reject(this._recordRestoreError);
    const snapshot = JSON.stringify(records);
    this._recordPersistenceRevision = (this._recordPersistenceRevision || 0) + 1;
    const isQuota = error => error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014;
    // Large synchronous localStorage writes block typing and pointer events.
    // Use the existing verified IndexedDB path before reaching the quota limit.
    if (!this._recordsOnDisk && !this._recordWrite && snapshot.length <= 256 * 1024) {
      try { localStorage.setItem(STORAGE_KEY, snapshot); return Promise.resolve(); }
      catch (error) { if (!isQuota(error)) return Promise.reject(error); }
    }
    const save = async snapshot => {
      await this.syncStateDisk('records', snapshot);
      if (await this.syncStateDisk('records') !== snapshot) throw new Error('로컬 기록 저장 검증에 실패했습니다.');
      localStorage.setItem(STORAGE_KEY, '"indexedDB"');
      this._recordsOnDisk = true;
    };
    const pending = this.queueLocalSnapshot('records', snapshot, save);
    this._recordWrite = pending;
    pending.catch(() => {});
    return pending;
  }

  persistSyncBaselines(baselines = this.syncBaselines) {
    const snapshot = JSON.stringify(Object.fromEntries(baselines));
    this._baselinePersistenceRevision = (this._baselinePersistenceRevision || 0) + 1;
    const save = async snapshot => {
      if (!this._baselinesOnDisk && snapshot.length <= 256 * 1024) {
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
    const pending = this.queueLocalSnapshot('baselines', snapshot, save);
    this._baselineWrite = pending;
    // Callers still receive the rejection; avoid an unhandled background rejection.
    pending.catch(() => {});
    return pending;
  }

  /**
   * 일회성 마이그레이션: 처방(prescription)열에만 "한랭"이 들어 있고
   * 나머지 모든 필드가 비어 있는 버그 행의 처방 값을 지운 뒤
   * normalizeRowAllocation으로 과잉 빈 행을 제거합니다.
   * @returns {boolean} 데이터가 실제로 변경되었으면 true
   */
  cleanupHanraengBugRows() {
    const CLEANUP_KEY = 'PT_HANRAENG_CLEANUP_V1';
    try { if (localStorage.getItem(CLEANUP_KEY) === '1') return false; } catch (_) {}

    // dataStore가 아직 비어 있으면(IndexedDB 로드 전) 플래그를 세우지 않고 건너뜀
    const dates = Object.keys(this.dataStore);
    if (dates.length === 0) return false;

    const contentKeys = ['no','gender','chartNo','name','part','extra','writer','memo','specialNote','visitTime'];
    let totalCleaned = 0;

    for (const [date, rows] of Object.entries(this.dataStore)) {
      if (!Array.isArray(rows)) continue;
      let cleaned = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        const prescription = String(row.prescription ?? '').trim();
        if (!prescription.includes('한랭')) continue;

        // 다른 모든 내용 필드가 비어 있는지 확인
        const hasOtherContent = contentKeys.some(key => String(row[key] ?? '').trim());
        if (!hasOtherContent) {
          row.prescription = '';
          cleaned++;
        }
      }
      if (cleaned > 0) {
        if (typeof this.normalizeRowAllocation === 'function') {
          this.normalizeRowAllocation(rows, date, true);
        }
        totalCleaned += cleaned;
      }
    }

    // 데이터를 실제로 처리했으면 플래그 설정 (빈 dataStore에서는 설정하지 않음)
    try { localStorage.setItem(CLEANUP_KEY, '1'); } catch (_) {}

    if (totalCleaned > 0) {
      void this.persistDataStore?.().catch(() => {});
    }
    return totalCleaned > 0;
  }
}
