// Settings-only recovery files live in the user-selected export folder, outside
// browser site data. Never include patient records, credentials or folder handles.
class PTDeviceRecovery {
  static META_KEY = 'device-recovery-meta-v1';
  static LOCAL_KEY = 'PT_DEVICE_RECOVERY_META_V1';
  static PREFIX = 'PT현황_기기설정_';
  static COLUMNS = ['no','gender','chartNo','name','part','prescription','extra','writer','memo','specialNote','visitTime','del','spacer'];
  static EXPORTS = ['pdf','backup','time','backupIntervalType','backupTime','backupIntervalHours','backupMaxCount','workHoursOnly','workStartTime','workEndTime'];
  static STORE_KEYS = ['device-column-widths-v1','device-export-settings-v1','folder-selection-v1','device-recovery-meta-v1','device-ui-preferences-v1','folder'];

  constructor(localTools) {
    this.tools = localTools;
    this.app = localTools.app;
    this.message = '기기 설정 보존을 준비하고 있습니다.';
    this.candidates = [];
  }

  static parse(text) {
    if (typeof text !== 'string' || text.length > 100000) throw Error('기기 설정 파일 크기를 확인해 주세요.');
    let file;
    try { file = JSON.parse(text); } catch (_) { throw Error('기기 설정 JSON 파일을 읽을 수 없습니다.'); }
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const stamp = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER - 1000;
    if (file?.format !== 'pt-device-settings' || file.version !== 1 ||
        !/^[a-f0-9-]{36}$/.test(file.deviceId || '') || !Number.isFinite(Date.parse(file.savedAt)) ||
        !object(file.ui?.columnWidths) || !object(file.exports)) throw Error('PT현황 기기 설정 파일이 아닙니다. 환자 기록 백업과 구분해 주세요.');
    const widths = {}, times = {};
    for (const key of new Set([...Object.keys(file.ui.columnWidths),...Object.keys(file.ui.columnWidthUpdatedAt || {})])) {
      if (!this.COLUMNS.includes(key)) throw Error('지원하지 않는 열 설정이 들어 있습니다.');
      const width = file.ui.columnWidths[key];
      if (width !== undefined && (!Number.isFinite(width) || width < 1 || width > 20000)) throw Error('열 너비 값이 올바르지 않습니다.');
      if (width !== undefined) widths[key] = width;
      const time = file.ui.columnWidthUpdatedAt?.[key] ?? 0;
      if (!stamp(time)) throw Error('열 너비 저장 시각이 올바르지 않습니다.');
      times[key] = time;
    }
    const exports = {_fieldUpdatedAt:{}};
    for (const key of this.EXPORTS) {
      const value = file.exports[key];
      const valid = ['pdf','backup','workHoursOnly'].includes(key) ? typeof value === 'boolean'
        : ['time','backupTime','workStartTime','workEndTime'].includes(key) ? typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
        : key === 'backupIntervalType' ? ['daily','hourly'].includes(value)
        : Number.isInteger(value) && value >= 1 && value <= 1000;
      if (!valid) throw Error('백업 또는 PDF 설정 값이 올바르지 않습니다.');
      const time = file.exports._fieldUpdatedAt?.[key] ?? 0;
      if (!stamp(time)) throw Error('설정 저장 시각이 올바르지 않습니다.');
      exports[key] = value;exports._fieldUpdatedAt[key] = time;
    }
    return {format:file.format,version:1,deviceId:file.deviceId,savedAt:file.savedAt,
      ui:{columnWidths:widths,columnWidthUpdatedAt:times,columnWidthsUpdatedAt:Math.max(0,...Object.values(times))},exports};
  }

  async inspectStartup() {
    if (this.startup) return;
    const keys = PTDeviceRecovery.STORE_KEYS;
    const results = await Promise.allSettled(keys.map(key => this.tools.store(key)));
    this.startup = Object.fromEntries(results.map((result,i) => [keys[i],result.status === 'rejected'
      ? {state:'read-error',error:result.reason?.name || 'Error'}
      : {state:result.value == null ? 'missing' : 'present',
        ...(i === 0 ? {columns:Object.keys(result.value?.widths || {}).length} : {}),
        ...(i === 3 ? {deviceId:result.value?.id || null} : {})}]));
  }

  async initialize() {
    if (this.initializing) {
      await this.initializing;
      return this.connectFolder();
    }
    this.initializing = this.initializeIdentity();
    try { await this.initializing; }
    finally { this.initializing = null; }
    await this.connectFolder();
  }

  async initializeIdentity() {
    if (!this.meta) {
      const initialize = async () => {
        let local = null;
        try { local = JSON.parse(localStorage.getItem(PTDeviceRecovery.LOCAL_KEY) || 'null'); } catch (_) {}
        const disk = await this.tools.store(PTDeviceRecovery.META_KEY);
        const valid = value => /^[a-f0-9-]{36}$/.test(value?.id || '');
        const meta = valid(disk) ? disk : valid(local) ? local : {id:crypto.randomUUID(),createdAt:new Date().toISOString()};
        await this.tools.store(PTDeviceRecovery.META_KEY,meta);
        this.meta = meta;
        try { localStorage.setItem(PTDeviceRecovery.LOCAL_KEY,JSON.stringify(this.meta)); } catch (_) {}
      };
      if (navigator.locks?.request) await navigator.locks.request('pt-device-recovery-meta',initialize);
      else await initialize();
    }
  }

  get filename() { return `${PTDeviceRecovery.PREFIX}${this.meta.id}.json`; }

  async connectFolder() {
    const connection = this.connection = (this.connection || 0) + 1;
    this.ready = false;
    this.candidates = [];
    const folder = this.tools.folder;
    const isCurrent = () => this.connection === connection && this.tools.folder === folder;
    if (!folder || this.tools._folderRestorePending) {
      this.ready = true;
      this.message = '폴더를 연결하면 기기 설정 파일도 자동 보관합니다. 파일 다운로드로 따로 보관할 수도 있습니다.';
      this.render();return;
    }
    try {
      const handle = await folder.getFileHandle(this.filename);
      const file = PTDeviceRecovery.parse(await (await handle.getFile()).text());
      if (!isCurrent()) return;
      if (file.deviceId !== this.meta.id) throw Error('이 기기의 설정 복구본 식별자가 다릅니다. 원본을 보존합니다.');
      await this.apply(file,false);
    } catch (error) {
      if (!isCurrent()) return;
      if (error.name !== 'NotFoundError') {
        this.message = '설정 복구본 확인 필요 · '+error.message;
        this.render();throw error; // Do not replace an unread or damaged file.
      }
    }
    const candidates = [];
    if (typeof folder.values === 'function') {
      for await (const entry of folder.values()) {
        if (entry.kind === 'file' && entry.name.startsWith(PTDeviceRecovery.PREFIX) && entry.name.endsWith('.json') && entry.name !== this.filename) {
          candidates.push(entry);
        }
      }
    }
    if (!isCurrent()) return;
    this.candidates = candidates;
    this.ready = true;
    this.message = this.candidates.length ? '이 폴더에서 이전 설정 파일을 찾았습니다. 복원할 파일을 선택해 주세요.' : '연결한 폴더에 이 기기의 설정을 자동 보관합니다.';
    this.changed();this.render();
  }

  async snapshot() {
    const [widths,ui,exports] = await Promise.all(['device-column-widths-v1','device-ui-preferences-v1','device-export-settings-v1'].map(key => this.tools.store(key)));
    const prefs = PTDeviceSettings.mergeUI([ui,PTDeviceSettings.widthPreferences(widths),this.app.readDevicePreferences()]);
    const settings = PTDeviceSettings.mergeExports([exports,this.tools.settings]);
    const selected = Object.fromEntries(PTDeviceRecovery.EXPORTS.map(key => [key,settings[key]]));
    selected._fieldUpdatedAt = Object.fromEntries(PTDeviceRecovery.EXPORTS.map(key => [key,settings._fieldUpdatedAt?.[key] || 0]));
    return PTDeviceRecovery.parse(JSON.stringify({format:'pt-device-settings',version:1,deviceId:this.meta.id,
      savedAt:new Date().toISOString(),ui:prefs,exports:selected}));
  }

  changed(key) {
    if (key && !['device-column-widths-v1','device-ui-preferences-v1','device-export-settings-v1'].includes(key)) return;
    if (!this.ready || this.restoring) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); },300);
  }

  async flush() {
    clearTimeout(this.timer);
    if (this.writing) return this.writing;
    if (!this.ready || !this.dirty || !this.tools.folder) return;
    const save = async () => {
      while (this.dirty && this.ready) {
        this.dirty = false;
        const folder = this.tools.folder;
        const connection = this.connection;
        const snapshot = await this.snapshot();
        // A newly emptied browser must not write defaults over a recovery copy.
        if (!Object.keys(snapshot.ui.columnWidths).length && !Object.values(snapshot.ui.columnWidthUpdatedAt).some(Boolean) &&
            !Object.values(snapshot.exports._fieldUpdatedAt).some(Boolean)) continue;
        if (!folder || this.tools.folder !== folder || this.connection !== connection) { this.dirty = true;continue; }
        if (await folder.queryPermission({mode:'readwrite'}) !== 'granted') throw Error('설정 파일 보관을 위해 폴더 권한을 갱신해 주세요.');
        let previous;
        try {
          const handle = await folder.getFileHandle(this.filename);
          previous = PTDeviceRecovery.parse(await (await handle.getFile()).text());
          if (previous.deviceId !== this.meta.id) throw Error('설정 파일 식별자가 달라 원본을 보존합니다.');
        } catch (error) { if (error.name !== 'NotFoundError') throw error; }
        if (!this.ready || this.tools.folder !== folder || this.connection !== connection) { this.dirty = true;continue; }
        snapshot.ui = PTDeviceSettings.mergeUI([previous?.ui,snapshot.ui]);
        snapshot.exports = PTDeviceSettings.mergeExports([previous?.exports,snapshot.exports]);
        const text = JSON.stringify(PTDeviceRecovery.parse(JSON.stringify(snapshot)),null,2);
        const file = await folder.getFileHandle(this.filename,{create:true});
        const writer = await file.createWritable();
        try { await writer.write(text);await writer.close(); }
        catch (error) { await writer.abort().catch(() => {});throw error; }
        if (await (await file.getFile()).text() !== text) throw Error('설정 복구본 저장 확인에 실패했습니다.');
        this.lastFileSavedAt = snapshot.savedAt;
        this.message = '기기 설정 파일 저장·확인 완료 · '+new Date(snapshot.savedAt).toLocaleString();
      }
    };
    this.writing = (async () => {
      try {
        const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
        if (locks?.request) await locks.request('pt-device-recovery-'+this.meta.id,save);
        else await save();
      } catch (error) { this.dirty = true;this.message = '설정 파일 보관 대기 · '+error.message;throw error; }
      finally { this.writing = null;this.render(); }
    })();
    return this.writing;
  }

  async apply(file, explicit) {
    file = PTDeviceRecovery.parse(JSON.stringify(file));
    const current = await this.snapshot();
    if (explicit) {
      const stamp = Math.max(Date.now(),...Object.values(current.ui.columnWidthUpdatedAt),...Object.values(current.exports._fieldUpdatedAt),
        ...Object.values(file.ui.columnWidthUpdatedAt),...Object.values(file.exports._fieldUpdatedAt)) + 1;
      const columns = new Set([...Object.keys(current.ui.columnWidthUpdatedAt),...Object.keys(file.ui.columnWidthUpdatedAt),...Object.keys(file.ui.columnWidths)]);
      file.ui.columnWidthUpdatedAt = Object.fromEntries([...columns].map(key => [key,stamp]));
      file.ui.columnWidthsUpdatedAt = stamp;
      file.exports._fieldUpdatedAt = Object.fromEntries(PTDeviceRecovery.EXPORTS.map(key => [key,stamp]));
    }
    this.restoring = true;
    try {
      await this.tools.store('device-ui-preferences-v1',file.ui);
      await this.tools.store('device-column-widths-v1',PTDeviceSettings.widthSnapshot(file.ui));
      await this.tools.store('device-export-settings-v1',file.exports);
      await this.app.restoreDeviceSettings(this.tools.store.bind(this.tools));
      await this.tools._restoreSettingsFromDisk();
      this.tools.syncSettingsControls();
      this.message = '열 너비·백업·PDF 설정을 복원했습니다. 저장 폴더 연결은 이 브라우저에서 별도로 유지됩니다.';
      this.tools.report(this.message);
    } finally { this.restoring = false;this.render(); }
    if (explicit) this.changed();
  }

  async diagnostics() {
    const [disk,persisted,permission] = await Promise.all([
      Promise.allSettled(PTDeviceRecovery.STORE_KEYS.map(key => this.tools.store(key))),
      navigator.storage?.persisted?.().catch(() => false),
      this.tools.folder?.queryPermission({mode:'readwrite'}).catch(() => 'read-error') || 'not-connected'
    ]);
    return {appVersion:this.app.appVersion,address:location.origin+location.pathname,browser:navigator.userAgent,
      deviceId:this.meta?.id || null,startup:this.startup,persistentStorageGranted:Boolean(persisted),
      browserRetentionPolicy:'unknown',startupSettings:this.startupSettingsState(),
      currentStores:Object.fromEntries(disk.map((result,i) => [PTDeviceRecovery.STORE_KEYS[i],result.status === 'rejected' ? 'read-error' : result.value == null ? 'missing' : 'present'])),
      folderConnected:Boolean(this.tools.folder),folderPermission:permission,settingsFileLastSaved:this.lastFileSavedAt || null,
      note:'사이트 데이터 자동 삭제 정책은 웹앱에서 조회할 수 없습니다. 시작 시 missing은 첫 실행, 데이터 삭제, 다른 주소/프로필 중 하나일 수 있습니다.'};
  }

  startupSettingsState() {
    const states = ['device-column-widths-v1','device-export-settings-v1','device-ui-preferences-v1']
      .map(key => this.startup?.[key]?.state);
    if (states.includes('read-error') || states.includes(undefined)) return 'unavailable';
    return states.includes('present') ? 'found' : 'missing';
  }

  bind(panel) {
    this.panel = panel;
    panel.innerHTML = `
      <div class="settings-panel-heading"><h3>기기 설정 보존</h3><p>열 너비·로컬 백업·자동 PDF 설정을 파일에도 보관합니다. 환자 기록은 포함하지 않습니다.</p></div>
      <div class="settings-card" data-retention-guide tabindex="-1">
        <h4>앱을 닫아도 설정 유지하기</h4>
        <p data-startup-settings role="status"></p>
        <p>브라우저의 ‘종료 시 사이트 데이터 삭제’가 켜져 있으면 저장을 마쳐도 다음 실행 때 열 너비·백업·PDF 설정과 폴더 연결이 지워집니다. 설치한 앱도 같은 영향을 받습니다.</p>
        <p><strong>Chrome:</strong> 아래 설정 주소를 주소창에 붙여넣고 ‘기기에 데이터를 저장하도록 허용’ 목록에 이 사이트를 추가하세요. <strong>Edge:</strong> 쿠키 설정의 허용 목록에 추가하고 종료 시 삭제 목록도 확인하세요.</p>
        <div class="settings-retention-addresses">
          <label>Chrome <input data-retention-chrome readonly aria-label="Chrome 사이트 데이터 설정 주소" value="chrome://settings/content/siteData"></label>
          <label>Edge <input data-retention-edge readonly aria-label="Edge 사이트 데이터 설정 주소" value="edge://settings/content/cookies"></label>
          <label>등록할 사이트 <input data-retention-origin readonly aria-label="설정을 보관할 사이트 주소"></label>
          <button type="button" data-retention-copy>사이트 주소 복사</button>
        </div>
        <p>Edge의 ‘브라우저를 닫을 때마다 지울 항목’에서도 ‘쿠키 및 기타 사이트 데이터’ → ‘지우지 않음’에 같은 주소를 등록하세요. 설정 주소: <code>edge://settings/privacy/clearBrowsingData/clearOnClose</code></p>
        <p>사용하는 각 브라우저·프로필에서 한 번씩 등록한 뒤, 설정을 지정하고 브라우저를 완전히 종료·재실행해 확인하세요. 이미 삭제된 값은 아래 설정 파일로 복원하거나 다시 지정해야 합니다.</p>
        <p>이 앱은 브라우저의 삭제 설정을 직접 읽거나 변경할 수 없습니다. 종료 시 삭제를 사용하는 경우에는 보관 예외도 등록해야 합니다.</p>
      </div>
      <div class="settings-card">
        <p data-recovery-status role="status"></p>
        <button type="button" data-recovery-folder>저장 폴더 연결 / 권한 갱신</button>
        <button type="button" data-recovery-save>설정 파일 지금 보관</button>
        <div data-recovery-candidates hidden><p>기존 설정 파일</p><select data-recovery-choice aria-label="복원할 기기 설정 파일"></select><button type="button" data-recovery-restore>선택한 설정 복원</button></div>
        <p>브라우저 데이터가 모두 지워졌다면 기존 폴더를 다시 연결하고 설정 파일을 선택해 복원하세요. 다른 기기의 파일은 자동으로 적용하지 않습니다.</p>
      </div>
      <div class="settings-card">
        <button type="button" data-recovery-download>설정 파일 다운로드</button>
        <button type="button" data-recovery-upload>설정 파일로 복원</button><input data-recovery-file type="file" accept="application/json,.json" hidden>
        <p>폴더 접근 권한은 파일에 담을 수 없어 브라우저에서 다시 허용해야 합니다.</p>
      </div>
      <details class="settings-card"><summary>재부팅 후 설정이 사라지는 경우</summary>
        <p>Edge: 설정 → 개인 정보, 검색 및 서비스 → 브라우저를 닫을 때마다 지울 항목에서 ‘쿠키 및 기타 사이트 데이터’의 자동 삭제를 확인하세요.</p>
        <p>Chrome: 설정 → 개인 정보 보호 및 보안 → 사이트 설정 → 추가 콘텐츠 설정 → 기기 내 사이트 데이터에서 ‘사이트에서 기기에 데이터를 저장하도록 허용’을 확인하세요.</p>
        <p>회사 관리 정책이나 PC 복원 프로그램이 브라우저 데이터를 삭제하면 앱이 이를 막을 수 없습니다. 설치에 사용한 브라우저 프로필과 주소도 동일하게 사용해야 합니다.</p>
        <button type="button" data-recovery-diagnose>저장 상태 확인</button><button type="button" data-recovery-copy>진단 정보 복사</button>
        <textarea data-recovery-diagnostics aria-label="기기 설정 진단 정보" readonly rows="8"></textarea>
      </details>`;
    const run = action => async event => {
      event.target.disabled = true;
      try { await action(); } catch (error) { this.message = error.message;this.tools.report(error.message); }
      finally { event.target.disabled = false;this.render(); }
    };
    const origin = panel.querySelector('[data-retention-origin]');
    origin.value = location.origin;
    panel.querySelector('[data-retention-copy]').onclick = run(async () => {
      try { await navigator.clipboard.writeText(origin.value);this.message = '사이트 주소를 복사했습니다. 브라우저의 보관 예외에 추가하세요.'; }
      catch (_) { origin.focus();origin.select();this.message = '사이트 주소를 선택했습니다. 복사해서 브라우저의 보관 예외에 추가하세요.'; }
    });
    panel.querySelector('[data-recovery-folder]').onclick = run(() => this.tools.chooseFolder());
    panel.querySelector('[data-recovery-save]').onclick = run(async () => {
      if (!this.tools.folder) throw Error('설정 파일을 보관할 폴더를 먼저 연결해 주세요.');
      if (!this.ready) await this.connectFolder();
      this.dirty = true;await this.flush();
    });
    panel.querySelector('[data-recovery-restore]').onclick = run(async () => {
      const entry = this.candidates[Number(panel.querySelector('[data-recovery-choice]').value)];
      if (!entry) throw Error('복원할 파일을 선택해 주세요.');
      const file = PTDeviceRecovery.parse(await (await entry.getFile()).text());
      await this.apply(file,true);
    });
    panel.querySelector('[data-recovery-download]').onclick = run(async () => {
      const snapshot = await this.snapshot();
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
      const link = document.createElement('a');link.href = url;link.download = this.filename;link.click();
      setTimeout(() => URL.revokeObjectURL(url),10000);
      this.message = '기기 설정 파일을 다운로드했습니다.';
    });
    const input = panel.querySelector('[data-recovery-file]');
    panel.querySelector('[data-recovery-upload]').onclick = () => input.click();
    input.onchange = run(async () => {
      const file = input.files?.[0];if (!file) return;
      try { if (file.size > 100000) throw Error('기기 설정 파일 크기를 확인해 주세요.');await this.apply(PTDeviceRecovery.parse(await file.text()),true); }
      finally { input.value = ''; }
    });
    const diagnose = async () => {
      const text = JSON.stringify(await this.diagnostics(),null,2);
      panel.querySelector('[data-recovery-diagnostics]').value = text;return text;
    };
    panel.querySelector('[data-recovery-diagnose]').onclick = run(diagnose);
    panel.querySelector('[data-recovery-copy]').onclick = run(async () => {
      const text = await diagnose();
      try { await navigator.clipboard.writeText(text);this.message = '환자 기록 없이 진단 정보를 복사했습니다.'; }
      catch (_) { const area = panel.querySelector('textarea');area.focus();area.select();this.message = '진단 정보를 선택했습니다. 복사해서 전달해 주세요.'; }
    });
    this.render();
  }

  render() {
    if (!this.panel?.isConnected) return;
    this.panel.querySelector('[data-recovery-status]').textContent = this.message;
    const state = this.startupSettingsState();
    this.panel.querySelector('[data-startup-settings]').textContent = state === 'found'
      ? '이번 실행에서 이전에 보관한 기기 설정을 찾았습니다.'
      : state === 'missing' ? '이번 실행에서는 이전 기기 설정을 찾지 못했습니다. 첫 사용, 사이트 데이터 삭제, 다른 프로필 사용 중 어느 경우인지는 앱에서 구분할 수 없습니다.'
      : '이전 기기 설정의 저장 상태를 아직 확인하지 못했습니다.';
    this.panel.querySelector('[data-recovery-candidates]').hidden = !this.candidates.length;
    const select = this.panel.querySelector('[data-recovery-choice]');
    const selected = select.value;
    select.replaceChildren(...this.candidates.map((entry,i) => {
      const option = document.createElement('option');option.value = String(i);option.textContent = entry.name;return option;
    }));
    if (selected) select.value = selected;
  }
}
