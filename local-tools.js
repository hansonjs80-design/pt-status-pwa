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
      if(lunch){ctx.strokeStyle='#d93025';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(margin,y);ctx.lineTo(width-margin,y);ctx.stroke();ctx.setLineDash([]);}
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

  class LocalTools {
    constructor(app) {
      this.app = app;
      try { this.settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { this.settings = {}; }
      this.settings = {
        pdf: false,
        backup: false,
        time: '09:10',
        backupIntervalType: 'daily',
        backupTime: '18:00',
        backupIntervalHours: 2,
        lastBackup: null,
        lastBackupDay: null,
        lastBackupTimestamp: 0,
        ...this.settings
      };
      this.status = '자동 저장 꺼짐';
      const footer = document.createElement('div'); footer.className = 'device-settings-footer';
      this.button = document.createElement('button'); this.button.type = 'button'; this.button.textContent = '⚙ 설정'; this.button.onclick = () => this.open('backup');
      this.statusElement = document.createElement('small'); this.statusElement.textContent = '이 컴퓨터의 저장 설정';
      footer.append(this.statusElement, this.button);
      document.querySelector('.excel-sidebar')?.append(footer);
      this.init().catch(error => this.report(error.message));
    }
    async db() {
      if (this.database) return this.database;
      this.database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('PT_DEVICE_BACKUPS', 1);
        request.onupgradeneeded = () => { request.result.createObjectStore('files'); };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return this.database;
    }
    async store(key, value) {
      const db = await this.db();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('files', value === undefined ? 'readonly' : 'readwrite');
        const request = value === undefined ? tx.objectStore('files').get(key) : tx.objectStore('files').put(value, key);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || Error('로컬 백업 저장이 중단되었습니다.'));
      });
    }
    async init() {
      this.folder = await this.store('folder');
      await this.app.restoreDeviceColumnWidths(this.store.bind(this));
      await this.app.migrateTextEditBackups(this.store.bind(this));
      this.timer = setInterval(() => void this.tick(), 30000);
      window.addEventListener('focus', () => void this.tick());
      void this.tick();
    }
    save() {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    }
    report(text) {
      this.status = text;
      if (this.statusElement) this.statusElement.textContent = text;
      const el = this.dialog?.querySelector('[data-status]');
      if (el) el.textContent = text;
    }
    async chooseFolder() {
      if (!window.showDirectoryPicker) throw Error('이 브라우저는 폴더 자동 저장을 지원하지 않습니다. Chrome 또는 Edge에서 사용하거나 수동 다운로드해 주세요.');
      const parent = await window.showDirectoryPicker({ id: 'pt-exports', startIn: 'downloads', mode: 'readwrite' });
      this.folder = parent.name === '물리치료현황' ? parent : await parent.getDirectoryHandle('물리치료현황', { create: true });
      await this.store('folder', this.folder);
      this.report('물리치료현황 폴더 연결됨');
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
      if (!app.supabaseClient) return app.dataStore[date] || [];
      const { data, error } = await app.supabaseClient.from('pt_daily_records').select('rows_data').eq('date', date).maybeSingle();
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
      const cloud = {};
      let shared = null;
      if (this.app.supabaseClient) {
        try {
          for (let offset = 0; ; offset += 200) {
            const { data, error } = await this.app.supabaseClient.from('pt_daily_records').select('*').order('date', { ascending: true }).range(offset, offset + 199);
            if (error) throw Error('전체 백업 조회 실패: ' + error.message);
            for (const record of data || []) {
              if (/^\d{4}-\d{2}-\d{2}$/.test(record.date)) cloud[record.date] = record.rows_data;
              else if (record.date === '__pt_shared_presets_v1__') shared = record;
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
        presets: JSON.parse(localStorage.getItem('PT_APP_CUSTOM_PRESETS_V1') || 'null')
      };
      const text = JSON.stringify(backup);
      if (!JSON.parse(text).dataStore) throw Error('백업 검증 실패');
      const key = 'backup-' + backup.createdAt;
      await this.store(key, text);
      if (await this.store(key) !== text) throw Error('로컬 백업 재확인 실패');

      // 최근 30개 초과 백업 정리
      try {
        const db = await this.db();
        const keys = await new Promise((res, rej) => {
          const r = db.transaction('files').objectStore('files').getAllKeys();
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const bKeys = keys.filter(k => String(k).startsWith('backup-')).sort();
        if (bKeys.length > 30) {
          for (const oldKey of bKeys.slice(0, bKeys.length - 30)) {
            const tx = db.transaction('files', 'readwrite');
            tx.objectStore('files').delete(oldKey);
          }
        }
      } catch {}

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

      this.settings.lastBackup = backup.createdAt;
      this.settings.lastBackupDay = dateKey(new Date());
      this.settings.lastBackupTimestamp = Date.now();
      this.save();
      return backup;
    }
    async tick() {
      if (this.running || (!this.settings.pdf && !this.settings.backup)) return;
      this.running = true;
      try {
        const now = new Date(), today = dateKey(now);
        const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const errors = [];

        if (this.settings.pdf && clock >= this.settings.time) {
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
          let shouldBackup = false;

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
      container.replaceChildren();
      const p = document.createElement('p');
      p.textContent = `확인된 ${days.length}일 · 기록 JSON ${(bytes / 1e6).toFixed(2)} MB · 기록일 하루 평균 ${(perDay / 1000).toFixed(1)} KB`;
      container.append(p);
      const note = document.createElement('p');
      note.textContent = '예상치는 확인된 기록만 기준으로 합니다. 실제 DB 크기·요금제·인덱스·다른 테이블·월간 전송량은 Supabase 대시보드에서 확인해야 합니다.';
      container.append(note);
      container.insertAdjacentHTML('beforeend', '<label>DB 한도(MB) <input data-limit type="number" min="1" value="500"></label><label>대시보드 현재 DB 사용량(MB) <input data-used type="number" min="0" placeholder="직접 입력"></label><p data-estimate></p><p>Free DB 500 MB · Pro 기본 디스크 8 GB. 월간 전송량은 Free 5 GB / Pro 250 GB로 별도 제한됩니다. 여러 컴퓨터의 반복 조회량에 따라 전송량이 먼저 도달할 수 있습니다.</p><a href="https://supabase.com/docs/guides/platform/billing-on-supabase" target="_blank" rel="noopener">공식 한도 확인</a> · <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">Supabase 사용량 확인</a>');
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
      this.dialog?.remove();
      const dialog = document.createElement('dialog');
      this.dialog = dialog;
      dialog.className = 'device-settings-dialog';
      dialog.innerHTML = `
        <header>
          <h2>이 컴퓨터 설정</h2>
          <button data-close aria-label="닫기">×</button>
        </header>
        <nav>
          <button data-tab="backup">💾 로컬 백업</button>
          <button data-tab="exports">자동 PDF</button>
          <button data-tab="usage">사용량</button>
        </nav>
        <section data-panel="backup">
          <div class="backup-config-card">
            <div class="backup-toggle-header">
              <label class="backup-toggle-label">
                <input type="checkbox" data-backup> 이 컴퓨터에 자동 로컬 백업 활성화
              </label>
            </div>
            <div class="backup-type-group" data-backup-options>
              <div class="backup-type-item" data-type-item="daily">
                <label class="backup-type-radio-label">
                  <input type="radio" name="backupIntervalType" value="daily" checked>
                  <span>📅 <strong>일 단위 백업</strong> (매일 특정 시간에 백업)</span>
                </label>
                <div class="backup-option-inputs" data-input-row="daily">
                  <label>백업 시각: <input type="time" data-backup-time value="18:00"></label>
                  <span class="hint">매일 선택한 시간에 전체 데이터를 안전하게 백업합니다.</span>
                </div>
              </div>
              <div class="backup-type-item" data-type-item="hourly">
                <label class="backup-type-radio-label">
                  <input type="radio" name="backupIntervalType" value="hourly">
                  <span>⏱️ <strong>시간 단위 백업</strong> (일정 시간마다 주기적 백업)</span>
                </label>
                <div class="backup-option-inputs" data-input-row="hourly">
                  <label>백업 간격:
                    <select data-backup-interval>
                      <option value="1">1시간 마다</option>
                      <option value="2">2시간 마다</option>
                      <option value="3">3시간 마다</option>
                      <option value="4">4시간 마다</option>
                      <option value="6">6시간 마다</option>
                      <option value="8">8시간 마다</option>
                    </select>
                  </label>
                  <span class="hint">앱 사용 중 설정한 시간 간격마다 지속적으로 백업합니다.</span>
                </div>
              </div>
            </div>
            <div class="backup-status-badge-box">
              <div class="status-row">
                <span>📁 저장 위치:</span>
                <strong data-folder-status>${this.folder ? '물리치료현황 폴더 연결됨' : '브라우저 로컬 보관함 (폴더 미연결)'}</strong>
              </div>
              <div class="status-row">
                <span>⏰ 다음 백업 예정:</span>
                <strong data-next-backup>${this.getNextBackupDescription()}</strong>
              </div>
              <div class="status-row">
                <span>💾 최근 백업 일시:</span>
                <strong data-last-backup-badge>${this.settings.lastBackup ? new Date(this.settings.lastBackup).toLocaleString() : '아직 없음'}</strong>
              </div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px;">
              <button type="button" data-folder>📁 다운로드 폴더 연결 / 변경</button>
              <button type="button" data-backup-now style="background: #107c41; color: white; border: none;">💾 지금 즉시 백업 저장</button>
              <label class="file-label" style="display: inline-flex; align-items: center; cursor: pointer; border: 1px solid #cbdad0; border-radius: 8px; padding: 8px 12px; background: #f4f9f5; color: #235c39; font: 600 13px Arial, sans-serif;">
                📂 백업 파일에서 복원 (.json)
                <input type="file" data-file-restore accept=".json" style="display: none;">
              </label>
            </div>
            <div class="backup-history-section">
              <div class="backup-history-title">
                <span>📋 이 컴퓨터에 보관된 백업 목록</span>
                <button type="button" data-refresh-history style="padding: 2px 8px; font-size: 11px;">새로고침</button>
              </div>
              <div class="backup-history-list" data-history-list></div>
            </div>
          </div>
        </section>
        <section data-panel="exports" hidden>
          <label><input type="checkbox" data-pdf> 이전날 현황 자동 PDF 저장</label>
          <label>PDF 저장 시간 <input type="time" data-time value="09:10"></label>
          <p>기본: 다음날 오전 9시 10분에 이전날의 최신 기록 저장. 앱이 열려 있고 컴퓨터가 깨어 있어야 실행됩니다. 앱을 다시 열면 누락된 날짜를 순서대로 저장합니다.</p>
          <p>다운로드 폴더를 선택하면 그 안에 물리치료현황 폴더를 생성합니다. 파일명: 0000년 00월 00일 PT현황.pdf</p>
          <button data-folder-pdf>📁 다운로드 폴더 연결 / 권한 갱신</button>
          <button data-pdf-now>현재 선택 날짜 PDF 저장</button>
        </section>
        <section data-panel="usage" hidden></section>
        <footer>
          <p data-status role="status"></p>
          <button data-save style="background: #107c41; color: white; border: none; font-weight: 700;">설정 저장</button>
        </footer>
      `;

      document.body.append(dialog);
      dialog.showModal();
      dialog.querySelector('[data-status]').textContent = this.status;

      // 설정값 바인딩
      const chkBackup = dialog.querySelector('[data-backup]');
      chkBackup.checked = Boolean(this.settings.backup);

      const radIntervals = dialog.querySelectorAll('input[name="backupIntervalType"]');
      const backupType = this.settings.backupIntervalType || 'daily';
      radIntervals.forEach(rad => {
        rad.checked = (rad.value === backupType);
      });

      const inpBackupTime = dialog.querySelector('[data-backup-time]');
      inpBackupTime.value = this.settings.backupTime || this.settings.time || '18:00';

      const selIntervalHours = dialog.querySelector('[data-backup-interval]');
      selIntervalHours.value = String(this.settings.backupIntervalHours || 2);

      const chkPdf = dialog.querySelector('[data-pdf]');
      chkPdf.checked = Boolean(this.settings.pdf);

      const inpPdfTime = dialog.querySelector('[data-time]');
      inpPdfTime.value = this.settings.time || '09:10';

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
        const badgeNext = dialog.querySelector('[data-next-backup]');
        if (badgeNext) badgeNext.textContent = chkBackup.checked ? this.getNextBackupDescription() : '자동 백업 꺼짐';
      });

      // 백업 목록 렌더링
      const historyListEl = dialog.querySelector('[data-history-list]');
      this.renderHistoryList(historyListEl);
      dialog.querySelector('[data-refresh-history]').onclick = () => this.renderHistoryList(historyListEl);

      // 파일에서 복원
      const fileInput = dialog.querySelector('[data-file-restore]');
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
          });
          if (button.dataset.tab === 'usage') {
            void this.usage(dialog.querySelector('[data-panel="usage"]')).catch(error => this.report(error.message));
          }
        };
      });

      // 기본 탭 활성화
      const initialTabBtn = dialog.querySelector(`[data-tab="${defaultTab}"]`) || dialog.querySelector('[data-tab="backup"]');
      if (initialTabBtn) initialTabBtn.click();

      // 버튼 동작들
      dialog.querySelector('[data-folder]').onclick = run(async () => {
        await this.chooseFolder();
        const folderStatus = dialog.querySelector('[data-folder-status]');
        if (folderStatus) folderStatus.textContent = this.folder ? '물리치료현황 폴더 연결됨' : '브라우저 로컬 보관함';
      });
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
      dialog.querySelector('[data-save]').onclick = run(async () => {
        const pdf = chkPdf.checked;
        const backup = chkBackup.checked;
        const time = inpPdfTime.value;
        const backupTypeVal = dialog.querySelector('input[name="backupIntervalType"]:checked')?.value || 'daily';
        const backupTimeVal = inpBackupTime.value;
        const backupHoursVal = Number(selIntervalHours.value) || 2;

        if (pdf && !/^\d{2}:\d{2}$/.test(time)) throw Error('PDF 저장 시간을 선택해 주세요.');
        if (backup && backupTypeVal === 'daily' && !/^\d{2}:\d{2}$/.test(backupTimeVal)) throw Error('일 단위 백업 시간을 선택해 주세요.');
        if (pdf && !this.folder) throw Error('자동 PDF 저장을 위해 폴더를 먼저 연결해 주세요.');
        if (pdf && !this.settings.pdf) { this.settings.pdfFrom = previousDay(new Date()); this.settings.lastPDF = null; }

        this.settings = {
          ...this.settings,
          pdf,
          backup,
          time,
          backupIntervalType: backupTypeVal,
          backupTime: backupTimeVal,
          backupIntervalHours: backupHoursVal
        };
        this.save();
        this.report('이 컴퓨터에 설정 저장됨');

        if (backup) {
          await this.backup(true);
          this.report('로컬 백업 저장·검증 완료');
          const badge = dialog.querySelector('[data-last-backup-badge]');
          if (badge) badge.textContent = new Date().toLocaleString();
          await this.renderHistoryList(historyListEl);
        }
        void this.tick();
      });
    }
  }
  window.PTLocalTools={LocalTools,renderPDF,jpegPDF,dateKey,previousDay};
  window.addEventListener('DOMContentLoaded',()=>{if(window.ptApp)window.ptLocalTools=new LocalTools(window.ptApp);});
})();
