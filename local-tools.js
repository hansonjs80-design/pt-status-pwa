/* Device-only scheduled exports. No Supabase writes are performed by this module. */
(() => {
  const SETTINGS_KEY = 'PT_DEVICE_EXPORTS_V1';
  const keys = ['no','gender','chartNo','name','part','prescription','extra','writer','memo','specialNote','visitTime'];
  const labels = ['No.','성별','챠트번호','성함','부위','처방','추가사항','작성','메모','특이 사항','방문시간'];
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const previousDay = date => { const d = new Date(date); d.setDate(d.getDate()-1); return dateKey(d); };
  const title = date => date.replace(/^(\d+)-(\d+)-(\d+)$/, '$1년 $2월 $3일 PT현황');
  const records = rows => rows.filter(row => ['name','chartNo','part','prescription','extra'].some(key => String(row[key] ?? '').trim()));

  // Small standards-based PDF writer. Canvas embeds Korean glyphs without external font/CDN dependencies.
  function jpegPDF(images, width, height) {
    const encoder = new TextEncoder(), chunks = [], offsets = [0]; let length = 0;
    const append = data => { const bytes = typeof data === 'string' ? encoder.encode(data) : data; chunks.push(bytes); length += bytes.length; };
    const object = (id, content) => { offsets[id] = length; append(`${id} 0 obj\n`); content(); append('\nendobj\n'); };
    append('%PDF-1.4\n');
    object(1, () => append('<< /Type /Catalog /Pages 2 0 R >>'));
    object(2, () => append(`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`));
    images.forEach((bytes,i) => {
      const id=3+i*3;
      object(id,()=>append(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`));
      object(id+1,()=>{ append(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`); append(bytes); append('\nendstream'); });
      const stream='q 842 0 0 595 0 0 cm /Im0 Do Q';
      object(id+2,()=>append(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
    });
    const xref=length;
    append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    offsets.slice(1).forEach(offset=>append(`${String(offset).padStart(10,'0')} 00000 n \n`));
    append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks,{type:'application/pdf'});
  }

  async function renderPDF(app, date, sourceRows) {
    await document.fonts.ready;
    const rows=records(sourceRows), summary=app.getDailySummary(rows), images=[];
    const width=1684, height=1190, margin=40, widths=[60,55,105,110,150,280,130,60,125,365,164];
    const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
    const ctx=canvas.getContext('2d');
    const wrap=(text,w)=>{
      const lines=[]; let line='';
      for(const char of String(text ?? '')) {
        if(char==='\n' || ctx.measureText(line+char).width>w) {lines.push(line);line=char==='\n'?'':char;} else line+=char;
      }
      lines.push(line);return lines;
    };
    const drawRow=(values,y,header=false,lunch=false)=>{
      ctx.font=`${header?700:500} 18px Arial, sans-serif`;
      const lines=values.map((v,i)=>wrap(v,widths[i]-12));
      const rowHeight=Math.max(32,...lines.map(l=>l.length*23+10));
      let x=margin;ctx.textAlign='center';ctx.textBaseline='middle';
      values.forEach((_,i)=>{
        ctx.fillStyle=header?'#e6f0e8':'#fff';ctx.fillRect(x,y,widths[i],rowHeight);
        ctx.strokeStyle='#aeb8b1';ctx.lineWidth=1;ctx.strokeRect(x,y,widths[i],rowHeight);
        ctx.fillStyle='#111';lines[i].forEach((line,n)=>ctx.fillText(line,x+widths[i]/2,y+rowHeight/2+(n-(lines[i].length-1)/2)*23));x+=widths[i];
      });
      if(lunch){ctx.strokeStyle='#d93025';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(margin,y);ctx.lineTo(width-margin,y);ctx.stroke();}
      return rowHeight;
    };
    const newPage=()=>{
      ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#111';ctx.textAlign='center';ctx.font='700 30px Arial, sans-serif';ctx.fillText(title(date),width/2,45);
      ctx.font='500 17px Arial, sans-serif';
      const extra=[...summary.extras].map(([name,count])=>`${name} ${app.formatExtraCount(summary,name,count)}건`).join(' · ');
      const summaryLines=wrap(`총 ${summary.total}건 · 남 ${summary.male} · 여 ${summary.female} · 미지정 ${summary.unknown}  |  ${extra || '추가 사항 없음'}`,width-margin*2);
      summaryLines.forEach((line,i)=>ctx.fillText(line,width/2,82+i*23));
      const top=100+summaryLines.length*23;return top+drawRow(labels,top,true);
    };
    const finish=()=>{
      ctx.fillStyle='#666';ctx.textAlign='right';ctx.font='15px Arial';ctx.fillText(`${images.length+1}`,width-margin,height-20);
      const binary=atob(canvas.toDataURL('image/jpeg',0.94).split(',')[1]);images.push(Uint8Array.from(binary,c=>c.charCodeAt(0)));
    };
    let y=newPage();
    for(const row of rows){
      const values=keys.map(key=>key==='visitTime'?app.getVisitTime(row):row[key]??'');
      ctx.font='500 18px Arial, sans-serif';
      // Split exceptionally long cells across continuation rows without losing text.
      const allLines=values.map((v,i)=>wrap(v,widths[i]-12));
      let offset=0; const total=Math.max(...allLines.map(lines=>lines.length));
      while(offset<total){
        if(y+33>height-45){finish();y=newPage();}
        const fit=Math.max(1,Math.floor((height-45-y-10)/23));
        const part=allLines.map(lines=>lines.slice(offset,offset+fit).join('\n'));
        y+=drawRow(part,y,false,Boolean(row._lunchBefore)&&offset===0);offset+=fit;
      }
    }
    finish();return jpegPDF(images,width,height);
  }

  const SETTINGS_DEFAULTS = {
    pdf: false,
    backup: false,
    time: '09:10',
    backupIntervalType: 'daily',
    backupTime: '18:00',
    backupIntervalHours: 2,
    backupMaxCount: 15,
    workHoursOnly: false,
    workStartTime: '09:00',
    workEndTime: '18:00',
    lastBackup: null,
    lastBackupDay: null,
    lastBackupTimestamp: 0
  };

  // 다중 계층 설정 읽기: localStorage → sessionStorage → cookie
  function readSettingsMultiTier() {
    return PTDeviceSettings.mergeExports(PTDeviceSettings.candidates(SETTINGS_KEY).reverse());
  }

  // 다중 계층 설정 쓰기: localStorage + sessionStorage + cookie
  function persistSettingsMultiTier(settings) {
    const json = JSON.stringify(settings);
    try { localStorage.setItem(SETTINGS_KEY, json); } catch (_) {}
    try { sessionStorage.setItem(SETTINGS_KEY, json); } catch (_) {}
    try {
      const encoded = encodeURIComponent(json);
      // 쿠키 크기 제한(~4KB) 내에서만 저장
      if (encoded.length < 3800) {
        document.cookie = `${SETTINGS_KEY}=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax`;
      }
    } catch (_) {}
  }

  class LocalTools {
    constructor(app) {
      this.app = app;
      this.settings = { ...SETTINGS_DEFAULTS, ...readSettingsMultiTier() };
      this._savedSettingsSnapshot = JSON.parse(JSON.stringify(this.settings));
      this._settingsRestorePending = true;
      this.status = '자동 저장 꺼짐';
      const footer = document.createElement('div'); footer.className = 'device-settings-footer';
      this.button = document.createElement('button');
      this.button.type = 'button';
      this.button.id = 'btnDeviceSettings';
      this.button.className = 'btn-action device-settings-btn';
      this.button.title = '이 컴퓨터 설정';
      this.button.setAttribute('aria-label', '이 컴퓨터 설정');
      this.button.innerHTML = `<svg class="toolbar-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9.5 3h5l.5 2.5 2 1.2 2.4-.8 2.5 4.3-1.9 1.7v2.3l1.9 1.7-2.5 4.3-2.4-.8-2 1.2-.5 2.5h-5L9 20.6l-2-1.2-2.4.8-2.5-4.3L4 14.2v-2.3l-1.9-1.7 2.5-4.3 2.4.8 2-1.2L9.5 3Z" transform="translate(0 -1)"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>`;
      this.button.onclick = () => this.open('backup');
      const updateDot = document.createElement('span');
      updateDot.className = 'device-settings-update-dot';
      updateDot.hidden = true;
      updateDot.title = '새 버전 업데이트 준비됨';
      this.button.append(updateDot);
      this.updateDot = updateDot;
      document.querySelector('.toolbar-actions-panel-inner')?.append(this.button);
      this.statusElement = document.createElement('small'); this.statusElement.textContent = '이 컴퓨터의 저장 설정';
      footer.append(this.statusElement);
      document.querySelector('.excel-sidebar')?.append(footer);
      this.initUpdateNotifier();
      this.ready = this.init();
      this.app.deviceSettingsReady = this.ready;
      this.ready.catch(error => this.report(error.message));
    }
    initUpdateNotifier() {
      const applyUpdateAction = async (btn) => {
        if (btn) {
          btn.disabled = true;
          btn.textContent = '적용 중...';
        }
        try {
          if (this.app && typeof this.app.applyUpdate === 'function') {
            await this.app.applyUpdate();
          } else if (typeof window !== 'undefined') {
            window.location.reload();
          }
        } catch (_) {
          if (btn) {
            btn.disabled = false;
            btn.textContent = '지금 업데이트';
          }
        }
      };

      const handleUpdateAvailable = (event) => {
        const newVer = event?.detail?.version || this.app?.latestServerVersion || '';
        // 1. 툴바 설정 버튼에 알림 닷 표시
        if (this.updateDot) this.updateDot.hidden = false;
        if (this.button) {
          this.button.classList.add('has-update');
          this.button.title = `이 컴퓨터 설정 (새 버전 ${newVer || ''} 준비됨)`;
        }

        // 2. 상단 헤더 바(날짜 바 / 환자 수 버튼 옆)에 원클릭 업데이트 배너 버튼 노출
        let headerNotice = document.getElementById('btnHeaderUpdateNotice');
        if (!headerNotice) {
          headerNotice = document.createElement('button');
          headerNotice.type = 'button';
          headerNotice.id = 'btnHeaderUpdateNotice';
          headerNotice.className = 'header-update-notice-btn';
          headerNotice.onclick = () => applyUpdateAction(headerNotice);

          // 날짜 컨트롤 바 영역 또는 테이블 헤더 시계 옆에 삽입
          const dateBar = document.querySelector('.date-controls-bar');
          const countBtn = document.getElementById('btnHeaderSummaryCount');
          if (countBtn && countBtn.parentNode) {
            countBtn.parentNode.insertBefore(headerNotice, countBtn.nextSibling);
          } else if (dateBar) {
            dateBar.append(headerNotice);
          } else {
            document.querySelector('.toolbar-actions-panel-inner')?.prepend(headerNotice);
          }
        }
        headerNotice.hidden = false;
        headerNotice.innerHTML = `🔄 새 버전${newVer ? ' ' + newVer : ''} 업데이트`;
        headerNotice.title = '클릭하여 최신 기능으로 지금 바로 새로고침합니다.';
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('pt-app-update-available', handleUpdateAvailable);
        if (this.app?.isUpdateAvailable) {
          handleUpdateAvailable();
        }
      }
    }
    async db() {
      return this.app.openLocalDatabase('PT_DEVICE_BACKUPS', 'files');
    }
    async store(key, value) {
      return this.app.localDatabaseStore('PT_DEVICE_BACKUPS', 'files', key, value);
    }
    async init() {
      this._settingsDiskStore = this.store.bind(this);
      this._settingsRestoreTask = this._restoreSettingsFromDisk();
      await Promise.all([
        this._settingsRestoreTask,
        this.app.restoreDeviceSettings(this.store.bind(this)),
        this.app.restoreCurrentDateSearchPreference(this.store.bind(this)),
        window.ptSheetClock?.restore(this.store.bind(this)),
      ]);
      await this.restoreExportFolder();
      await this.app.migrateTextEditBackups(this.store.bind(this));
      this._initialized = true;
      this.timer = setInterval(() => void this.tick(), 30000);
      window.addEventListener('focus', () => void this.tick());
      void this.tick();
    }
    async _restoreSettingsFromDisk() {
      this._settingsRestorePending = true;
      // A failed read is not an empty store. Keep it intact for retry.
      const persisted = await this.store('device-export-settings-v1');
      const current = {...this.settings};
      if (!current._fieldUpdatedAt) {
        // Unstamped constructor defaults must not overwrite an older real save.
        for (const key of Object.keys(SETTINGS_DEFAULTS)) if (current[key] === SETTINGS_DEFAULTS[key]) delete current[key];
      }
      const merged = PTDeviceSettings.mergeExports([persisted, readSettingsMultiTier(), current]);
      this.settings = {...SETTINGS_DEFAULTS,...merged};
      this._savedSettingsSnapshot = JSON.parse(JSON.stringify(this.settings));
      persistSettingsMultiTier(this.settings);
      this._settingsRestorePending = false;
      await this._queueSettingsDisk();
    }
    save() {
      const stamps = {...this.settings._fieldUpdatedAt};
      const previous = this._savedSettingsSnapshot || {};
      const timestamp = Math.max(Date.now(), ...Object.values(stamps).map(Number).filter(Number.isFinite), 0) + 1;
      for (const key of Object.keys(this.settings)) {
        if (!key.startsWith('_') && JSON.stringify(this.settings[key]) !== JSON.stringify(previous[key])) stamps[key] = timestamp;
      }
      this.settings._fieldUpdatedAt = stamps;
      this._savedSettingsSnapshot = JSON.parse(JSON.stringify(this.settings));
      persistSettingsMultiTier(this.settings);
      const write = this._settingsRestorePending
        ? Promise.resolve(this._settingsRestoreTask).then(() => this._queueSettingsDisk()) : this._queueSettingsDisk();
      write?.catch(error => this.report('설정 저장 실패 · '+error.message));
      return write;
    }
    _queueSettingsDisk() {
      if (!this._settingsDiskStore || this._settingsRestorePending) return Promise.resolve();
      const snapshot = JSON.parse(JSON.stringify(this.settings));
      const previous = this._settingsDiskWrite || Promise.resolve();
      this._settingsDiskWrite = previous.catch(() => {}).then(async () => {
        await this._settingsDiskStore('device-export-settings-v1', snapshot);
        const saved = await this._settingsDiskStore('device-export-settings-v1');
        if (JSON.stringify(saved) !== JSON.stringify(snapshot)) throw Error('기기 저장소 확인에 실패했습니다.');
      });
      this._settingsDiskWrite.catch(error => this.report('설정 저장 실패 · '+error.message));
      return this._settingsDiskWrite;
    }
    report(text) {
      this.status = text;
      if (this.statusElement) this.statusElement.textContent = text;
      const el = this.dialog?.querySelector('[data-status]');
      if (el) el.textContent = text;
    }
    async chooseFolder() {
      if (!window.showDirectoryPicker) throw Error('이 브라우저는 폴더 자동 저장을 지원하지 않습니다. Chrome 또는 Edge에서 사용하거나 수동 다운로드해 주세요.');
      const parent = await window.showDirectoryPicker({ id: 'pt-exports', startIn: this.folder || 'downloads', mode: 'readwrite' });
      const handle = parent.name === '물리치료현황' ? parent : await parent.getDirectoryHandle('물리치료현황', { create: true });
      const location = parent === handle ? [handle.name] : [parent.name,handle.name];
      // Keep the handle and its displayed location together across relaunches.
      const selection = {handle,location};
      await this.store('folder-selection-v1',selection);
      this.folder = handle;
      this.folderLocation = location;
      await this.updateFolderDisplay();
      this.report('물리치료현황 폴더 연결됨');
    }
    async restoreExportFolder() {
      const selection = await this.store('folder-selection-v1');
      if (selection?.handle?.kind === 'directory') {
        this.folder = selection.handle;
        this.folderLocation = Array.isArray(selection.location) ? selection.location.filter(value => typeof value === 'string') : null;
      } else this.folder = await this.store('folder');
    }
    async updateFolderDisplay() {
      const dialog = this.dialog, folder = this.folder;
      if (!dialog) return;
      const location = folder ? this.folderLocation?.join(' › ') || folder.name : '저장 폴더를 연결해 주세요';
      dialog.querySelectorAll('[data-folder-location]').forEach(el => {el.textContent=location;el.title=location;});
      dialog.querySelectorAll('[data-folder-card]').forEach(el => el.classList.toggle('is-linked',Boolean(folder)));
      let permission = 'prompt';
      try { if (folder) permission = await folder.queryPermission({mode:'readwrite'}); } catch (_) {}
      if (this.dialog !== dialog || this.folder !== folder) return;
      dialog.querySelectorAll('[data-folder-state]').forEach(el => {el.textContent=!folder?'미연결':permission==='granted'?'저장 가능':'권한 확인 필요';});
      dialog.querySelectorAll('[data-folder-note]').forEach(el => {
        el.textContent = !folder ? '백업은 브라우저 보관함에 보관됩니다. 자동 PDF를 저장하려면 폴더를 연결하세요.'
          : permission==='granted' ? '선택한 폴더 이름으로 표시합니다. PDF와 백업 파일을 이 폴더에 함께 저장합니다.'
          : '폴더 변경 / 권한 갱신을 눌러 저장 권한을 허용해 주세요. 저장 설정은 유지됩니다.';
      });
    }
    updatePDFSchedule() {
      if (!this.dialog) return;
      const time = this.settings.time || SETTINGS_DEFAULTS.time;
      const now = new Date();
      const summary = this.dialog.querySelector('[data-pdf-schedule]');
      if (summary) summary.textContent = `매일 ${time}에 전날 현황을 PDF로 저장합니다.`;
      const example = this.dialog.querySelector('[data-pdf-example]');
      if (example) example.textContent = `오늘(${dateKey(now)}) ${time} → 전날(${previousDay(now)}) 현황`;
    }
    async write(name, blob, automatic = false) {
      if (this.folder) {
        let permission = await this.folder.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted' && !automatic) permission = await this.folder.requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') throw Error('저장 폴더 권한이 필요합니다. 설정에서 폴더를 다시 연결해 주세요.');
        const file = await this.folder.getFileHandle(name, { create: true });
        const writer = await file.createWritable();
        try { await writer.write(blob); await writer.close(); } catch (error) { await writer.abort().catch(() => {}); throw error; }
        const saved = await file.getFile();
        if (saved.size !== blob.size) throw Error('저장 파일 크기 검증 실패');
      } else {
        if (automatic) throw Error('자동 저장을 위해 다운로드 폴더를 먼저 연결해 주세요.');
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    }
    async dayRows(date) {
      const app = this.app;
      await app.syncBaselinesReady;
      if (!app.supabaseClient) return app.dataStore[date] || [];
      const { data, error } = await app.runCloudQuery(app.supabaseClient.from('pt_daily_records').select('rows_data').eq('date', date).maybeSingle());
      if (error) throw Error('최신 일지 확인 실패: ' + error.message);
      if (app.pendingSyncDates?.has(date)) throw Error(`${date}의 클라우드 저장이 완료된 후 다시 시도합니다.`);
      return data?.rows_data || app.dataStore[date] || [];
    }
    async pdf(date, automatic = false) {
      const rows = await this.dayRows(date);
      const blob = await renderPDF(this.app, date, rows);
      await this.write(title(date) + '.pdf', blob, automatic);
      return blob;
    }
    async backup(automatic = false) {
      // Never rotate backups with the empty placeholder used while records restore.
      await this.app.syncBaselinesReady;
      const cloud = {};
      let shared = null;
      let staffCalendarCounts = null;
      if (this.app.supabaseClient) {
        try {
          for (let offset = 0; ; offset += 200) {
            const { data, error } = await this.app.runCloudQuery(this.app.supabaseClient.from('pt_daily_records').select('*').order('date', { ascending: true }).range(offset, offset + 199));
            if (error) throw Error('전체 백업 조회 실패: ' + error.message);
            for (const record of data || []) {
              if (/^\d{4}-\d{2}-\d{2}$/.test(record.date)) cloud[record.date] = record.rows_data;
              else if (record.date === '__pt_shared_presets_v1__') shared = record;
              else if (record.date === '__pt_staff_calendar_count_settings_v1__') staffCalendarCounts = record.rows_data?.[0]?.staffCalendarCounts || null;
            }
            if (!data || data.length < 200) break;
          }
        } catch (cloudErr) {
          console.warn('Supabase 백업 조회 중 알림 (로컬 데이터로 백업 진행):', cloudErr);
          if (!automatic && !Object.keys(this.app.dataStore || {}).length) throw cloudErr;
        }
      }
      const merged = { ...cloud };
      for (const [date, rows] of Object.entries(this.app.dataStore || {})) {
        if (!merged[date] || this.app.pendingSyncDates?.has(date) || !this.app.supabaseClient) merged[date] = rows;
      }
      const backup = {
        version: 1,
        createdAt: new Date().toISOString(),
        scope: 'PT app records and presets; excludes database schema, auth and storage',
        dataStore: merged,
        cloudDataStore: cloud,
        localDataStore: this.app.dataStore,
        sharedPresets: shared,
        staffCalendarCounts: staffCalendarCounts || this.app.staffCountSettings || null,
        presets: JSON.parse(localStorage.getItem('PT_APP_CUSTOM_PRESETS_V1') || 'null')
      };
      const text = JSON.stringify(backup);
      if (!JSON.parse(text).dataStore) throw Error('백업 검증 실패');
      const key = 'backup-' + backup.createdAt;
      await this.store(key, text);
      if (await this.store(key) !== text) throw Error('로컬 백업 재확인 실패');

      const file = `PT현황_전체백업_${backup.createdAt.replace(/[:.]/g, '-')}.json`;
      if (this.folder) {
        try {
          await this.write(file, new Blob([text], { type: 'application/json' }), automatic);
        } catch (err) {
          if (!automatic) throw err;
        }
      } else if (!automatic) {
        await this.write(file, new Blob([text], { type: 'application/json' }), false);
      }

      // 최신 백업 저장 완료 후 설정된 보관 개수 초과분(이전 오래된 백업) 자동 삭제
      await this.cleanupOldBackups();

      this.settings.lastBackup = backup.createdAt;
      this.settings.lastBackupDay = dateKey(new Date());
      this.settings.lastBackupTimestamp = Date.now();
      this.save();
      return backup;
    }
    async cleanupOldBackups(targetMaxCount) {
      const maxCount = Math.max(1, Number(targetMaxCount ?? this.settings.backupMaxCount) || 15);

      // 1) IndexedDB 내부 보관 백업 초과분 정리
      try {
        const db = await this.db();
        const keys = await new Promise((res, rej) => {
          const r = db.transaction('files').objectStore('files').getAllKeys();
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const bKeys = keys.filter(k => String(k).startsWith('backup-')).sort();
        if (bKeys.length > maxCount) {
          const toDelete = bKeys.slice(0, bKeys.length - maxCount);
          for (const oldKey of toDelete) {
            const tx = db.transaction('files', 'readwrite');
            tx.objectStore('files').delete(oldKey);
          }
        }
      } catch (idbErr) {
        console.warn('IndexedDB 백업 정리 참고:', idbErr);
      }

      // 2) 연결된 다운로드 폴더 내의 초과 백업 파일 정리
      if (this.folder) {
        try {
          const backupFiles = [];
          if (typeof this.folder.values === 'function') {
            for await (const entry of this.folder.values()) {
              if (entry.kind === 'file' && entry.name.startsWith('PT현황_전체백업_') && entry.name.endsWith('.json')) {
                backupFiles.push(entry.name);
              }
            }
          } else if (typeof this.folder.entries === 'function') {
            for await (const [name, entry] of this.folder.entries()) {
              if (entry?.kind === 'file' && name.startsWith('PT현황_전체백업_') && name.endsWith('.json')) {
                backupFiles.push(name);
              }
            }
          }
          backupFiles.sort();
          if (backupFiles.length > maxCount) {
            const filesToDelete = backupFiles.slice(0, backupFiles.length - maxCount);
            for (const fileName of filesToDelete) {
              if (typeof this.folder.removeEntry === 'function') {
                await this.folder.removeEntry(fileName).catch(() => {});
              }
            }
          }
        } catch (folderErr) {
          console.warn('폴더 백업 파일 정리 참고:', folderErr);
        }
      }
    }
    isWithinWorkHours(clock, startTime = '09:00', endTime = '18:00') {
      if (startTime <= endTime) {
        return clock >= startTime && clock <= endTime;
      }
      return clock >= startTime || clock <= endTime;
    }
    async tick() {
      if (this.running || (!this.settings.pdf && !this.settings.backup)) return;
      this.running = true;
      try {
        const now = new Date(), today = dateKey(now);
        const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const errors = [];

        if (this.settings.pdf && clock >= (this.settings.time || SETTINGS_DEFAULTS.time)) {
          try {
            const target = previousDay(now);
            let date = this.settings.lastPDF
              ? dateKey(new Date(new Date(this.settings.lastPDF + 'T12:00:00').setDate(new Date(this.settings.lastPDF + 'T12:00:00').getDate() + 1)))
              : this.settings.pdfFrom || target;
            for (; date <= target;) {
              await this.pdf(date, true);
              this.settings.lastPDF = date;
              this.save();
              const next = new Date(date + 'T12:00:00');
              next.setDate(next.getDate() + 1);
              date = dateKey(next);
            }
          } catch (error) {
            errors.push(error.message);
          }
        }

        if (this.settings.backup) {
          const isHourly = this.settings.backupIntervalType === 'hourly';
          let inWorkHours = true;
          if (this.settings.workHoursOnly) {
            const start = this.settings.workStartTime || '09:00';
            const end = this.settings.workEndTime || '18:00';
            inWorkHours = this.isWithinWorkHours(clock, start, end);
          }

          let shouldBackup = false;

          // 퇴근 시간 이후부터 다음 출근 시간 전까지는 자동 백업 실행 안 함
          if (inWorkHours) {
            if (isHourly) {
              const intervalHours = Math.max(1, Number(this.settings.backupIntervalHours) || 1);
              const intervalMs = intervalHours * 3600000;
              const lastTime = this.settings.lastBackupTimestamp || (this.settings.lastBackup ? new Date(this.settings.lastBackup).getTime() : 0);
              if (!lastTime || (Date.now() - lastTime >= intervalMs)) {
                shouldBackup = true;
              }
            } else {
              const targetTime = this.settings.backupTime || this.settings.time || '18:00';
              if (clock >= targetTime && this.settings.lastBackupDay !== today) {
                shouldBackup = true;
              }
            }
          }

          if (shouldBackup) {
            try {
              await this.backup(true);
            } catch (error) {
              errors.push(error.message);
            }
          }
        }

        this.report(errors.length ? errors.join(' / ') : `저장 확인 완료 · ${today} ${clock}`);
      } catch (error) {
        this.report(error.message);
      } finally {
        this.running = false;
      }
    }
    async listBackups() {
      const db = await this.db();
      const keys = await new Promise((resolve, reject) => {
        const r = db.transaction('files').objectStore('files').getAllKeys();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const backupKeys = keys.filter(k => String(k).startsWith('backup-')).sort().reverse();
      const list = [];
      for (const key of backupKeys.slice(0, 15)) {
        try {
          const str = await this.store(key);
          const data = JSON.parse(str);
          const count = Object.keys(data.dataStore || {}).length;
          list.push({
            key,
            createdAt: data.createdAt || key.replace('backup-', ''),
            recordCount: count,
            sizeBytes: new Blob([str]).size
          });
        } catch {
          list.push({ key, createdAt: key.replace('backup-', ''), recordCount: '?', sizeBytes: 0 });
        }
      }
      return list;
    }
    async restoreFromKey(key) {
      const str = await this.store(key);
      if (!str) throw new Error('해당 백업 데이터를 찾을 수 없습니다.');
      const backup = JSON.parse(str);
      if (this.app && typeof this.app.restoreDataPayload === 'function') {
        return await this.app.restoreDataPayload(backup);
      }
      throw new Error('앱 복원 인터페이스가 준비되지 않았습니다.');
    }
    async downloadBackupFile(key) {
      const str = await this.store(key);
      if (!str) throw new Error('백업 데이터를 찾을 수 없습니다.');
      const file = `PT현황_전체백업_${key.replace('backup-', '').replace(/[:.]/g, '-')}.json`;
      const link = document.createElement('a');
      const url = URL.createObjectURL(new Blob([str], { type: 'application/json' }));
      link.href = url;
      link.download = file;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    async usage(container) {
      container.textContent = '현재 기록을 계산하고 있습니다…';
      await this.app.loadSearchHistory();
      const days = Object.entries(this.app.getSearchDataStore()).filter(([date, rows]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && records(rows).length);
      const bytes = days.reduce((n, [, rows]) => n + new Blob([JSON.stringify(rows)]).size, 0);
      const perDay = days.length ? bytes / days.length : 0;
      container.innerHTML = `
        <div class="settings-panel-heading"><h3>저장 사용량</h3><p>확인된 기록을 기준으로 계산한 예상치입니다.</p></div>
        <div class="settings-usage-metrics">
          <div class="settings-usage-metric"><span>기록 날짜</span><strong>${days.length}일</strong></div>
          <div class="settings-usage-metric"><span>기록 JSON</span><strong>${(bytes / 1e6).toFixed(2)} MB</strong></div>
          <div class="settings-usage-metric"><span>하루 평균</span><strong>${(perDay / 1000).toFixed(1)} KB</strong></div>
        </div>
        <div class="settings-card">
          <h4>남은 기록일 예상</h4>
          <div class="settings-field-grid">
            <label class="settings-field">DB 한도 (MB) <input data-limit type="number" min="1" value="500"></label>
            <label class="settings-field">현재 DB 사용량 (MB) <input data-used type="number" min="0" placeholder="대시보드 값 입력"></label>
          </div>
          <p data-estimate aria-live="polite"></p>
        </div>
        <div class="settings-card">
          <p>실제 DB 크기·요금제·월간 전송량은 Supabase 대시보드에서 확인해 주세요.</p>
          <div class="settings-help-links"><a href="https://supabase.com/docs/guides/platform/billing-on-supabase" target="_blank" rel="noopener">공식 한도 확인 ↗</a><a href="https://supabase.com/dashboard" target="_blank" rel="noopener">사용량 대시보드 ↗</a></div>
          <details><summary>계산 기준과 한도 안내</summary><p>확인된 기록의 JSON 용량을 기준으로 계산하며, 저장 오버헤드는 하루 용량의 2배로 가정합니다. 인덱스와 다른 테이블, 월간 전송량에 따라 실제 사용 가능 기간은 달라집니다.</p><p>Free DB 500 MB · Pro 기본 디스크 8 GB. 월간 전송량은 Free 5 GB / Pro 250 GB로 별도 제한됩니다.</p></details>
        </div>`;
      const update = () => {
        const limit = Number(container.querySelector('[data-limit]').value);
        const raw = container.querySelector('[data-used]').value;
        const used = Number(raw);
        container.querySelector('[data-estimate]').textContent = raw && perDay && limit > 0
          ? `남은 기간 추정: 약 ${Math.max(0, Math.floor((limit - used) * 1e6 / (perDay * 2)))} 기록일 (하루 JSON 용량의 2배를 저장 오버헤드로 가정). 보장 기간이 아닙니다.`
          : '실제 현재 DB 사용량을 입력하면 남은 기록일을 계산합니다.';
      };
      container.addEventListener('input', update);
      update();
    }
    getNextBackupDescription() {
      if (!this.settings.backup) return '자동 백업 꺼짐';
      const now = new Date();
      const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (this.settings.workHoursOnly) {
        const start = this.settings.workStartTime || '09:00';
        const end = this.settings.workEndTime || '18:00';
        if (!this.isWithinWorkHours(clock, start, end)) {
          return `출근 시간(${start})에 재개 (퇴근 시간 이후 일시중지됨)`;
        }
      }
      if (this.settings.backupIntervalType === 'hourly') {
        const intervalHours = Math.max(1, Number(this.settings.backupIntervalHours) || 1);
        const intervalMs = intervalHours * 3600000;
        const lastTime = this.settings.lastBackupTimestamp || (this.settings.lastBackup ? new Date(this.settings.lastBackup).getTime() : 0);
        if (!lastTime) return '지금 예정';
        const nextTime = lastTime + intervalMs;
        const diffMin = Math.round((nextTime - Date.now()) / 60000);
        if (diffMin <= 0) return '곧 실행 예정';
        return `약 ${diffMin}분 후 (${new Date(nextTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      } else {
        const targetTime = this.settings.backupTime || this.settings.time || '18:00';
        const today = dateKey(new Date());
        if (this.settings.lastBackupDay === today) {
          return `내일 ${targetTime} (오늘 백업 완료됨)`;
        }
        return `오늘 ${targetTime}`;
      }
    }
    async renderHistoryList(container) {
      container.innerHTML = '<div style="padding: 10px; text-align: center; color: #777; font-size: 12px;">백업 목록 불러오는 중...</div>';
      try {
        const list = await this.listBackups();
        if (!list.length) {
          container.innerHTML = '<div style="padding: 12px; text-align: center; color: #888; font-size: 12px;">이 컴퓨터에 보관된 로컬 백업이 아직 없습니다.</div>';
          return;
        }
        container.innerHTML = '';
        list.forEach(item => {
          const div = document.createElement('div');
          div.className = 'backup-history-item';
          const d = new Date(item.createdAt);
          const dateStr = !isNaN(d.getTime())
            ? `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
            : item.createdAt;
          const sizeKb = (item.sizeBytes / 1024).toFixed(1);
          div.innerHTML = `
            <div class="backup-history-meta">
              <span class="backup-history-time">${dateStr}</span>
              <span class="backup-history-info">${item.recordCount}개 날짜 기록 · ${sizeKb} KB</span>
            </div>
            <div class="backup-item-actions">
              <button type="button" class="btn-restore-item" data-action="restore" title="이 시점의 데이터로 복원">불러오기(복원)</button>
              <button type="button" data-action="download" title="JSON 백업 파일 다운로드">다운로드</button>
            </div>
          `;
          div.querySelector('[data-action="restore"]').onclick = async (e) => {
            e.stopPropagation();
            try {
              const success = await this.restoreFromKey(item.key);
              if (success && this.dialog) this.dialog.close();
            } catch (err) {
              alert('복원 실패: ' + err.message);
            }
          };
          div.querySelector('[data-action="download"]').onclick = async (e) => {
            e.stopPropagation();
            try {
              await this.downloadBackupFile(item.key);
            } catch (err) {
              alert('다운로드 실패: ' + err.message);
            }
          };
          container.appendChild(div);
        });
      } catch (err) {
        container.innerHTML = `<div style="padding: 10px; color: #d93025; font-size: 12px;">목록 로드 실패: ${err.message}</div>`;
      }
    }
    open(defaultTab = 'backup') {
      if (!this._initialized && this.ready) {
        this.ready.then(() => this.open(defaultTab)).catch(error => this.report('설정 복원 실패 · '+error.message));
        return;
      }
      this.dialog?.close();
      this.dialog?.remove();
      const dialog = document.createElement('dialog');
      dialog.className = 'device-settings-dialog';
      dialog.setAttribute('aria-labelledby', 'deviceSettingsTitle');
      this.dialog = dialog;
      const currentVersion = this.app?.appVersion || '확인 중';
      dialog.innerHTML = `
        <div class="device-settings-topbar">
        <header>
          <div class="device-settings-title-group">
            <h2 id="deviceSettingsTitle">이 컴퓨터 설정</h2>
            <p>화면과 자동 저장을 이 기기에 맞게 설정하세요.</p>
          </div>
          <button data-close class="device-settings-close-btn" aria-label="닫기">×</button>
        </header>
        <div class="device-settings-release" data-update-banner>
          <div class="device-settings-release-info">
          <span class="device-settings-version-badge" title="현재 실행 중인 앱 버전">현재 버전: ${currentVersion}</span>
          <span data-update-status role="status" aria-live="polite">업데이트 확인 중...</span>
          </div>
          <div class="device-settings-release-actions">
            <button type="button" data-check-update>업데이트 확인</button>
            <button type="button" class="device-settings-update-btn" data-apply-update hidden title="저장 후 새 버전을 적용합니다">업데이트 적용</button>
          </div>
        </div>
        <nav role="tablist" aria-label="설정 메뉴">
          <button type="button" role="tab" id="settings-tab-rows" aria-controls="settings-panel-rows" data-tab="rows">기본 행</button>
          <button type="button" role="tab" id="settings-tab-display" aria-controls="settings-panel-display" data-tab="display">화면</button>
          <button type="button" role="tab" id="settings-tab-backup" aria-controls="settings-panel-backup" data-tab="backup">로컬 백업</button>
          <button type="button" role="tab" id="settings-tab-exports" aria-controls="settings-panel-exports" data-tab="exports">자동 PDF</button>
          <button type="button" role="tab" id="settings-tab-usage" aria-controls="settings-panel-usage" data-tab="usage">사용량</button>
        </nav>
        </div>
        <div class="device-settings-body" data-settings-body>
        <section data-panel="rows" id="settings-panel-rows" role="tabpanel" aria-labelledby="settings-tab-rows" hidden>
          <div class="settings-panel-heading"><h3>테이블 기본 행</h3><p>날짜별 테이블에 준비할 빈 행 수를 정합니다.</p></div>
          <div class="settings-card">
            <div class="settings-field-grid">
              <label class="settings-field">기본 행 수 <input type="number" data-default-row-count min="1" max="2000" step="1" aria-label="기본 행 수"></label>
              <label class="settings-field">적용 범위 <select data-default-row-scope aria-label="기본 행 적용 범위"><option value="all">전체 날짜</option><option value="month">현재 달부터</option></select></label>
            </div>
            <p>‘현재 달부터’는 이번 달과 이후 날짜에 적용합니다.</p>
            <p class="settings-note">기록과 서식은 유지하며, 마지막 기록 아래에 입력할 빈 행 15개를 확보합니다.</p>
            <button type="button" class="settings-primary" data-apply-default-rows>기본 행 적용</button>
          </div>
        </section>
        <section data-panel="display" id="settings-panel-display" role="tabpanel" aria-labelledby="settings-tab-display" hidden>
          <div class="settings-panel-heading"><h3>화면 표시</h3><p>이 컴퓨터에서 사용할 표시 기능을 선택하세요.</p></div>
          <div class="settings-card">
            <label class="settings-toggle"><input type="checkbox" data-clock-enabled> 디지털 시계 표시</label>
            <p>테이블 오른쪽 아래에 시계를 표시합니다. 변경 즉시 저장됩니다.</p>
          </div>
          <div class="settings-link-card"><div><h4>근무표 PT건수</h4><p>근무표에 반영할 PT건수 기준을 설정합니다.</p></div><button type="button" data-staff-count-settings>설정 열기 ↗</button></div>
        </section>
        <section data-panel="backup" id="settings-panel-backup" role="tabpanel" aria-labelledby="settings-tab-backup">
          <div class="settings-panel-heading"><h3>로컬 백업</h3><p>전체 기록을 JSON 파일로 저장하고 복원합니다.</p></div>
          <div class="export-folder-card" data-folder-card>
            <div class="export-folder-heading"><strong>백업 저장 폴더</strong><span data-folder-state>확인 중</span></div>
            <div class="export-folder-location" data-folder-location></div>
            <p data-folder-note></p>
            <button type="button" data-folder>폴더 변경 / 권한 갱신</button>
          </div>
          <div class="backup-config-card">
            <div class="backup-toggle-header">
              <label class="backup-toggle-label">
                <input type="checkbox" data-backup> 자동 로컬 백업
              </label>
            </div>
            <div class="backup-type-group" data-backup-options>
              <div class="backup-type-item" data-type-item="daily">
                <label class="backup-type-radio-label">
                  <input type="radio" name="backupIntervalType" value="daily" checked>
                  <span><strong>매일 정해진 시각</strong></span>
                </label>
                <div class="backup-option-inputs" data-input-row="daily">
                  <label>저장 시각 <input type="time" data-backup-time value="18:00"></label>
                </div>
              </div>
              <div class="backup-type-item" data-type-item="hourly">
                <label class="backup-type-radio-label">
                  <input type="radio" name="backupIntervalType" value="hourly">
                  <span><strong>일정 시간마다</strong></span>
                </label>
                <div class="backup-option-inputs" data-input-row="hourly">
                  <label>저장 간격
                    <select data-backup-interval>
                      <option value="1">1시간 마다</option>
                      <option value="2">2시간 마다</option>
                      <option value="3">3시간 마다</option>
                      <option value="4">4시간 마다</option>
                      <option value="6">6시간 마다</option>
                      <option value="8">8시간 마다</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
            <div class="backup-retention-row">
              <label>
                <span>백업 보관 개수</span>
                <select data-backup-max-count>
                  <option value="5">최근 5개 유지</option>
                  <option value="10">최근 10개 유지</option>
                  <option value="15">최근 15개 유지 (권장)</option>
                  <option value="20">최근 20개 유지</option>
                  <option value="30">최근 30개 유지</option>
                  <option value="50">최근 50개 유지</option>
                </select>
              </label>
              <p class="hint">초과한 오래된 백업은 새 백업 저장 후 자동 삭제됩니다.</p>
            </div>
            <div class="backup-workhours-control">
              <label class="settings-toggle">
                <input type="checkbox" data-workhours-only>
                <span>근무 시간에만 백업</span>
              </label>
              <div class="workhours-inputs" data-workhours-inputs>
                <label>
                  출근 <input type="time" data-work-start-time value="09:00">
                </label>
                <label>
                  퇴근 <input type="time" data-work-end-time value="18:00">
                </label>
              </div>
              <p class="hint">퇴근 후부터 다음 출근 전까지 자동 백업을 일시중지합니다.</p>
            </div>
            <div class="backup-status-badge-box">
              <div class="status-row">
                <span>다음 백업</span>
                <strong data-next-backup>${this.getNextBackupDescription()}</strong>
              </div>
              <div class="status-row">
                <span>최근 백업</span>
                <strong data-last-backup-badge>${this.settings.lastBackup ? new Date(this.settings.lastBackup).toLocaleString() : '아직 없음'}</strong>
              </div>
              <div class="status-row">
                <span>보관 개수</span>
                <strong data-retention-badge>최근 ${this.settings.backupMaxCount || 15}개 유지 (초과분 자동 삭제)</strong>
              </div>
              <div class="status-row">
                <span>근무 시간</span>
                <strong data-workhours-badge>${this.settings.workHoursOnly ? `${this.settings.workStartTime || '09:00'} ~ ${this.settings.workEndTime || '18:00'} (퇴근 후 일시중지)` : '제한 없음 (24시간)'}</strong>
              </div>
            </div>
            <p class="settings-note">자동 백업은 앱이 열려 있고 컴퓨터가 깨어 있을 때 실행됩니다.</p>
            <div class="settings-actions">
              <button type="button" class="settings-primary" data-backup-now>지금 백업</button>
              <label class="file-label" tabindex="0" role="button">
                파일에서 복원 (.json)
                <input type="file" data-file-restore accept=".json" style="display: none;">
              </label>
            </div>
            <div class="backup-history-section">
              <div class="backup-history-title">
                <span>이 컴퓨터의 백업 목록</span>
                <button type="button" data-refresh-history>목록 새로고침</button>
              </div>
              <div class="backup-history-list" data-history-list></div>
            </div>
          </div>
        </section>
        <section data-panel="exports" id="settings-panel-exports" role="tabpanel" aria-labelledby="settings-tab-exports" hidden>
          <div class="settings-panel-heading"><h3>자동 PDF</h3><p>매일 지정한 시각에 전날 현황을 PDF로 저장합니다.</p></div>
          <div class="export-folder-card" data-folder-card>
            <div class="export-folder-heading"><strong>PDF 저장 폴더</strong><span data-folder-state>확인 중</span></div>
            <div class="export-folder-location" data-folder-location></div>
            <p data-folder-note></p>
            <button type="button" data-folder-pdf>폴더 변경 / 권한 갱신</button>
          </div>
          <div class="pdf-schedule-card">
            <label class="pdf-enable-label"><input type="checkbox" data-pdf> 전날 현황 자동 PDF 저장</label>
            <label class="pdf-time-label">매일 저장 시각 <input type="time" data-time value="09:10"></label>
            <div class="pdf-schedule-preview" aria-live="polite">
              <strong data-pdf-schedule></strong>
              <span data-pdf-example></span>
            </div>
            <p>앱이 열려 있고 컴퓨터가 깨어 있어야 실행됩니다. 앱을 다시 열면 저장 시각이 지난 누락 날짜부터 순서대로 저장합니다.</p>
            <p class="export-file-example">파일명: 0000년 00월 00일 PT현황.pdf</p>
          </div>
          <div class="settings-link-card"><div><h4>선택 날짜 PDF</h4><p>지금 테이블에 표시된 날짜의 현황을 저장합니다.</p></div><button type="button" data-pdf-now>지금 PDF 저장</button></div>
        </section>
        <section data-panel="usage" id="settings-panel-usage" role="tabpanel" aria-labelledby="settings-tab-usage" hidden></section>
        </div>
        <footer>
          <div class="device-settings-save-info">
          <span data-save-hint>체크·시간 변경은 자동 저장됩니다.</span>
          <p data-status role="status"></p>
          </div>
          <button type="button" data-save class="settings-primary">설정 저장</button>
        </footer>
      `;

      document.body.append(dialog);
      dialog.showModal();

      // 업데이트 알림 및 새로고침 동작 바인딩
      const updateBanner = dialog.querySelector('[data-update-banner]');
      const updateButton = dialog.querySelector('[data-apply-update]');
      const setUpdateNoticeVisible = (visible, ver) => {
        updateBanner?.classList.toggle('has-update', visible);
        if (updateButton) updateButton.hidden = !visible;
        const targetVer = ver || this.app?.latestServerVersion;
        if (visible && targetVer) {
          if (updateButton) updateButton.textContent = `${targetVer} 업데이트 적용`;
        }
      };

      dialog.querySelectorAll('[data-apply-update]').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          const origText = btn.textContent;
          btn.textContent = '적용 중...';
          try {
            if (this.app && typeof this.app.applyUpdate === 'function') {
              await this.app.applyUpdate();
            } else if (typeof window !== 'undefined') {
              window.location.reload();
            }
          } catch (e) {
            btn.disabled = false;
            btn.textContent = origText;
            const status = dialog.querySelector('[data-update-status]');
            if (status) status.textContent = e.message || '업데이트 적용 실패 · 다시 시도해 주세요.';
          }
        };
      });

      if (this.app?.isUpdateAvailable) {
        setUpdateNoticeVisible(true, this.app.latestServerVersion);
      }

      const checkButton = dialog.querySelector('[data-check-update]');
      const checkStatus = dialog.querySelector('[data-update-status]');
      const updateCheckStatus = () => {
        setUpdateNoticeVisible(Boolean(this.app?.isUpdateAvailable), this.app?.latestServerVersion);
        if (checkStatus) checkStatus.textContent = this.app?.isUpdateAvailable
          ? `새 버전 ${this.app.latestServerVersion || ''} 업데이트가 준비되었습니다.`
          : this.app?.updateCheckError ? '업데이트 확인 실패 · 연결을 확인하고 다시 시도해 주세요.'
          : '최신 버전입니다.';
      };
      const checkUpdate = async () => {
        checkButton.disabled = true;
        checkStatus.textContent = '업데이트 확인 중...';
        try { await this.app?.checkForUpdate?.(); }
        catch (_) { if (checkStatus) checkStatus.textContent = '업데이트 확인 실패 · 다시 시도해 주세요.'; return; }
        finally { checkButton.disabled = false; }
        updateCheckStatus();
      };
      if (checkButton) checkButton.onclick = checkUpdate;
      void checkUpdate();

      const onUpdateFound = (e) => {
        const version = e?.detail?.version || this.app?.latestServerVersion;
        setUpdateNoticeVisible(true, version);
        if (checkStatus) checkStatus.textContent = `새 버전 ${version || ''}을 적용할 수 있습니다.`;
      };
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('pt-app-update-available', onUpdateFound);
        window.addEventListener('pt-app-update-checked', updateCheckStatus);
        dialog.addEventListener('close', () => {
          window.removeEventListener('pt-app-update-available', onUpdateFound);
          window.removeEventListener('pt-app-update-checked', updateCheckStatus);
        }, { once: true });
      }

      dialog.querySelector('[data-staff-count-settings]').onclick = () => this.app.openStaffCountSettings();
      dialog.querySelector('[data-status]').textContent = this.status;

      // 설정값 바인딩
      const clockEnabled = dialog.querySelector('[data-clock-enabled]');
      clockEnabled.checked = window.ptSheetClock?.enabled !== false;
      clockEnabled.onchange = async () => {
        try {
          await window.ptSheetClock?.setEnabled(clockEnabled.checked);
          this.report('이 기기에 시계 설정 저장됨');
        } catch (error) { this.report(`시계 설정 저장 실패: ${error.message}`); }
      };
      const rowCount = dialog.querySelector('[data-default-row-count]');
      rowCount.value = String(window.ptApp?.getDefaultRowCount() || 120);
      const chkBackup = dialog.querySelector('[data-backup]');
      chkBackup.checked = Boolean(this.settings.backup);
      // 백업 체크박스도 토글 시 즉시 저장됨 (아래 change 리스너에서 처리)

      const radIntervals = dialog.querySelectorAll('input[name="backupIntervalType"]');
      const backupType = this.settings.backupIntervalType || 'daily';
      radIntervals.forEach(rad => {
        rad.checked = (rad.value === backupType);
      });

      const inpBackupTime = dialog.querySelector('[data-backup-time]');
      inpBackupTime.value = this.settings.backupTime || this.settings.time || '18:00';

      const selIntervalHours = dialog.querySelector('[data-backup-interval]');
      selIntervalHours.value = String(this.settings.backupIntervalHours || 2);

      const selBackupMaxCount = dialog.querySelector('[data-backup-max-count]');
      if (selBackupMaxCount) {
        selBackupMaxCount.value = String(this.settings.backupMaxCount || 15);
        selBackupMaxCount.addEventListener('change', () => {
          this.settings.backupMaxCount = Math.max(1, Number(selBackupMaxCount.value) || 15);
          this.save();
          const badge = dialog.querySelector('[data-retention-badge]');
          if (badge) badge.textContent = `최근 ${selBackupMaxCount.value}개 유지 (초과분 자동 삭제)`;
        });
      }

      // 라디오 버튼, 백업 시간, 간격 변경 즉시 저장
      radIntervals.forEach(rad => rad.addEventListener('change', () => {
        this.settings.backupIntervalType = dialog.querySelector('input[name="backupIntervalType"]:checked')?.value || 'daily';
        this.save();
      }));
      inpBackupTime.addEventListener('change', () => {
        this.settings.backupTime = inpBackupTime.value;
        this.save();
      });
      selIntervalHours.addEventListener('change', () => {
        this.settings.backupIntervalHours = Number(selIntervalHours.value) || 2;
        this.save();
      });

      // 출·퇴근 시간 바인딩
      const chkWorkHoursOnly = dialog.querySelector('[data-workhours-only]');
      const inpWorkStartTime = dialog.querySelector('[data-work-start-time]');
      const inpWorkEndTime = dialog.querySelector('[data-work-end-time]');
      const workHoursInputsBox = dialog.querySelector('[data-workhours-inputs]');

      if (chkWorkHoursOnly && inpWorkStartTime && inpWorkEndTime) {
        chkWorkHoursOnly.checked = Boolean(this.settings.workHoursOnly);
        inpWorkStartTime.value = this.settings.workStartTime || '09:00';
        inpWorkEndTime.value = this.settings.workEndTime || '18:00';

        const updateWorkHoursUI = () => {
          inpWorkStartTime.disabled = !chkWorkHoursOnly.checked;
          inpWorkEndTime.disabled = !chkWorkHoursOnly.checked;
          if (workHoursInputsBox) {
            workHoursInputsBox.style.opacity = chkWorkHoursOnly.checked ? '1' : '0.5';
            workHoursInputsBox.style.pointerEvents = chkWorkHoursOnly.checked ? 'auto' : 'none';
          }
          const badge = dialog.querySelector('[data-workhours-badge]');
          if (badge) {
            badge.textContent = chkWorkHoursOnly.checked
              ? `${inpWorkStartTime.value} ~ ${inpWorkEndTime.value} (퇴근 후 일시중지)`
              : '제한 없음 (24시간)';
          }
          const badgeNext = dialog.querySelector('[data-next-backup]');
          if (badgeNext && chkBackup.checked) {
            badgeNext.textContent = this.getNextBackupDescription();
          }
        };

        // 출·퇴근 체크박스 즉시 저장
        chkWorkHoursOnly.addEventListener('change', () => {
          this.settings.workHoursOnly = chkWorkHoursOnly.checked;
          this.save();
          updateWorkHoursUI();
        });
        inpWorkStartTime.addEventListener('change', () => {
          this.settings.workStartTime = inpWorkStartTime.value;
          this.save();
          updateWorkHoursUI();
        });
        inpWorkEndTime.addEventListener('change', () => {
          this.settings.workEndTime = inpWorkEndTime.value;
          this.save();
          updateWorkHoursUI();
        });
        updateWorkHoursUI();
      }

      const chkPdf = dialog.querySelector('[data-pdf]');
      chkPdf.checked = Boolean(this.settings.pdf);
      // PDF 체크박스 즉시 저장 (설정 저장 버튼 없이도 상태 보존)
      chkPdf.addEventListener('change', () => {
        this.settings.pdf = chkPdf.checked;
        this.save();
      });

      const inpPdfTime = dialog.querySelector('[data-time]');
      inpPdfTime.value = this.settings.time || '09:10';
      // PDF 시간 변경 시 즉시 저장
      inpPdfTime.addEventListener('change', () => {
        if (!inpPdfTime.value) { inpPdfTime.value = this.settings.time || SETTINGS_DEFAULTS.time; return; }
        this.settings.time = inpPdfTime.value;
        this.save();
        this.updatePDFSchedule();
      });
      this.updatePDFSchedule();
      void this.updateFolderDisplay();

      // 라디오 변경 시 시각적 활성화
      const updateIntervalUI = () => {
        const curType = dialog.querySelector('input[name="backupIntervalType"]:checked')?.value || 'daily';
        dialog.querySelectorAll('.backup-type-item').forEach(item => {
          item.classList.toggle('active', item.dataset.typeItem === curType);
        });
        const badgeNext = dialog.querySelector('[data-next-backup]');
        if (badgeNext) badgeNext.textContent = this.getNextBackupDescription();
      };
      radIntervals.forEach(rad => rad.addEventListener('change', updateIntervalUI));
      updateIntervalUI();

      chkBackup.addEventListener('change', () => {
        this.settings.backup = chkBackup.checked;
        this.save();
        const badgeNext = dialog.querySelector('[data-next-backup]');
        if (badgeNext) badgeNext.textContent = chkBackup.checked ? this.getNextBackupDescription() : '자동 백업 꺼짐';
      });

      // 백업 목록 렌더링
      const historyListEl = dialog.querySelector('[data-history-list]');
      this.renderHistoryList(historyListEl);
      dialog.querySelector('[data-refresh-history]').onclick = () => this.renderHistoryList(historyListEl);

      // 파일에서 복원
      const fileInput = dialog.querySelector('[data-file-restore]');
      fileInput.closest('.file-label').onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
      };
      fileInput.onchange = (e) => {
        if (this.app && typeof this.app.handleRestoreFile === 'function') {
          this.app.handleRestoreFile(e);
        }
      };

      const run = fn => async event => {
        event.target.disabled = true;
        try {
          await fn();
        } catch (error) {
          if (error.name !== 'AbortError') this.report(error.message);
        } finally {
          event.target.disabled = false;
        }
      };

      dialog.querySelector('[data-close]').onclick = () => dialog.close();
      dialog.addEventListener('keydown', e => e.stopPropagation());

      // 탭 전환
      dialog.querySelectorAll('[data-tab]').forEach(button => {
        button.onclick = () => {
          dialog.querySelectorAll('[data-panel]').forEach(panel => {
            panel.hidden = (panel.dataset.panel !== button.dataset.tab);
          });
          dialog.querySelectorAll('[data-tab]').forEach(tab => {
            tab.classList.toggle('active', tab === button);
            tab.setAttribute('aria-selected', String(tab === button));
            tab.tabIndex = tab === button ? 0 : -1;
          });
          dialog.querySelector('[data-settings-body]').scrollTop = 0;
          dialog.querySelector('[data-save]').hidden = ['rows', 'usage'].includes(button.dataset.tab);
          dialog.querySelector('[data-save-hint]').textContent = button.dataset.tab === 'rows'
            ? '기본 행은 적용 버튼으로 저장합니다.' : button.dataset.tab === 'usage'
            ? '이 기기에서 확인한 기록 기준입니다.' : '체크·시간 변경은 자동 저장됩니다.';
          if (button.dataset.tab === 'usage') {
            void this.usage(dialog.querySelector('[data-panel="usage"]')).catch(error => this.report(error.message));
          }
        };
        button.onkeydown = e => {
          const tabs = Array.from(dialog.querySelectorAll('[data-tab]'));
          const index = tabs.indexOf(button);
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1
            : e.key === 'ArrowRight' ? (index + 1) % tabs.length
            : e.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
          if (next < 0) return;
          e.preventDefault(); tabs[next].click(); tabs[next].focus();
        };
      });

      // 기본 탭 활성화
      const initialTabBtn = dialog.querySelector(`[data-tab="${defaultTab}"]`) || dialog.querySelector('[data-tab="backup"]');
      if (initialTabBtn) initialTabBtn.click();

      // 버튼 동작들
      dialog.querySelector('[data-folder]').onclick = run(() => this.chooseFolder());
      dialog.querySelector('[data-folder-pdf]').onclick = run(() => this.chooseFolder());
      dialog.querySelector('[data-pdf-now]').onclick = run(async () => {
        await this.pdf(this.app.currentDate);
        this.report('PDF 저장 완료');
      });
      dialog.querySelector('[data-backup-now]').onclick = run(async () => {
        await this.backup(false);
        this.report('전체 백업 파일 저장 및 안전 보관 완료');
        const badge = dialog.querySelector('[data-last-backup-badge]');
        if (badge) badge.textContent = new Date().toLocaleString();
        await this.renderHistoryList(historyListEl);
      });

      // 설정 저장
      dialog.querySelector('[data-apply-default-rows]').onclick = run(async () => {
        if (!window.ptApp?.applyDefaultRowCount(Number(rowCount.value), dialog.querySelector('[data-default-row-scope]').value)) {
          throw Error('기본 행 수를 1~2000 사이의 정수로 입력해 주세요.');
        }
        this.report('기본 행 설정이 적용되었습니다.');
      });
      dialog.querySelector('[data-save]').onclick = run(async () => {
        if (!dialog.querySelector('[data-panel="display"]').hidden) {
          await window.ptSheetClock?.setEnabled(clockEnabled.checked);
          this.report('이 기기에 시계 설정 저장됨');
          return;
        }
        if (!dialog.querySelector('[data-panel="rows"]').hidden) {
          if (!window.ptApp?.applyDefaultRowCount(Number(rowCount.value), dialog.querySelector('[data-default-row-scope]').value)) throw Error('기본 행 수를 1~2000 사이의 정수로 입력해 주세요.');
          this.report('기본 행 설정이 적용되었습니다.');
          return;
        }
        const pdf = chkPdf.checked;
        const backup = chkBackup.checked;
        const time = inpPdfTime.value;
        const backupTypeVal = dialog.querySelector('input[name="backupIntervalType"]:checked')?.value || 'daily';
        const backupTimeVal = inpBackupTime.value;
        const backupHoursVal = Number(selIntervalHours.value) || 2;
        const backupMaxCountVal = Math.max(1, Number(selBackupMaxCount?.value) || 15);
        const workHoursOnlyVal = Boolean(chkWorkHoursOnly?.checked);
        const workStartTimeVal = inpWorkStartTime?.value || '09:00';
        const workEndTimeVal = inpWorkEndTime?.value || '18:00';

        if (pdf && !/^\d{2}:\d{2}$/.test(time)) throw Error('PDF 저장 시간을 선택해 주세요.');
        if (backup && backupTypeVal === 'daily' && !/^\d{2}:\d{2}$/.test(backupTimeVal)) throw Error('일 단위 백업 시간을 선택해 주세요.');
        if (backup && workHoursOnlyVal) {
          if (!/^\d{2}:\d{2}$/.test(workStartTimeVal)) throw Error('출근 시각을 올바르게 선택해 주세요.');
          if (!/^\d{2}:\d{2}$/.test(workEndTimeVal)) throw Error('퇴근 시각을 올바르게 선택해 주세요.');
        }
        if (pdf && !this.folder) throw Error('자동 PDF 저장을 위해 폴더를 먼저 연결해 주세요.');
        if (pdf && !this.settings.pdf) { this.settings.pdfFrom = previousDay(new Date()); this.settings.lastPDF = null; }

        this.settings = {
          ...this.settings,
          pdf,
          backup,
          time,
          backupIntervalType: backupTypeVal,
          backupTime: backupTimeVal,
          backupIntervalHours: backupHoursVal,
          backupMaxCount: backupMaxCountVal,
          workHoursOnly: workHoursOnlyVal,
          workStartTime: workStartTimeVal,
          workEndTime: workEndTimeVal
        };
        await this.save();
        this.report('이 컴퓨터에 설정 저장됨');

        // 변경된 보관 개수 설정에 맞추어 기존 초과 백업 파일 즉시 정리
        await this.cleanupOldBackups(backupMaxCountVal);

        if (backup) {
          await this.backup(true);
          this.report('로컬 백업 저장·검증 완료');
          const badge = dialog.querySelector('[data-last-backup-badge]');
          if (badge) badge.textContent = new Date().toLocaleString();
        }
        await this.renderHistoryList(historyListEl);
        void this.tick();
      });
    }
  }
  window.PTLocalTools={LocalTools,renderPDF,jpegPDF,dateKey,previousDay};
  window.addEventListener('DOMContentLoaded',()=>{if(window.ptApp)window.ptLocalTools=new LocalTools(window.ptApp);});
})();
