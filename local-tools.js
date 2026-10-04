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
      this.app=app;
      try {this.settings=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');} catch {this.settings={};}
      this.settings={pdf:false,backup:false,time:'09:10',...this.settings};
      this.status='자동 저장 꺼짐';
      const footer=document.createElement('div');footer.className='device-settings-footer';
      this.button=document.createElement('button');this.button.type='button';this.button.textContent='⚙ 설정';this.button.onclick=()=>this.open();
      this.statusElement=document.createElement('small');this.statusElement.textContent='이 컴퓨터의 저장 설정';footer.append(this.statusElement,this.button);document.querySelector('.excel-sidebar').append(footer);
      this.init().catch(error=>this.report(error.message));
    }
    async db() {
      if(this.database)return this.database;
      this.database=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('PT_DEVICE_BACKUPS',1);
        request.onupgradeneeded=()=>{request.result.createObjectStore('files');};
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      });return this.database;
    }
    async store(key,value) {
      const db=await this.db();return new Promise((resolve,reject)=>{
        const tx=db.transaction('files',value===undefined?'readonly':'readwrite');
        const request=value===undefined?tx.objectStore('files').get(key):tx.objectStore('files').put(value,key);
        tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('로컬 백업 저장이 중단되었습니다.'));
      });
    }
    async init(){
      this.folder=await this.store('folder');
      await this.app.restoreDeviceColumnWidths(this.store.bind(this));
      await this.app.migrateTextEditBackups(this.store.bind(this));
      this.timer=setInterval(()=>void this.tick(),30000);
      window.addEventListener('focus',()=>void this.tick());
      void this.tick();
    }
    save(){localStorage.setItem(SETTINGS_KEY,JSON.stringify(this.settings));}
    report(text){this.status=text;this.statusElement.textContent=text;const el=this.dialog?.querySelector('[data-status]');if(el)el.textContent=text;}
    async chooseFolder(){
      if(!window.showDirectoryPicker)throw Error('이 브라우저는 폴더 자동 저장을 지원하지 않습니다. Chrome 또는 Edge에서 사용하거나 수동 다운로드해 주세요.');
      const parent=await window.showDirectoryPicker({id:'pt-exports',startIn:'downloads',mode:'readwrite'});
      this.folder=parent.name==='물리치료현황'?parent:await parent.getDirectoryHandle('물리치료현황',{create:true});
      await this.store('folder',this.folder);this.report('물리치료현황 폴더 연결됨');
    }
    async write(name,blob,automatic=false){
      if(this.folder){
        let permission=await this.folder.queryPermission({mode:'readwrite'});
        if(permission!=='granted'&&!automatic)permission=await this.folder.requestPermission({mode:'readwrite'});
        if(permission!=='granted')throw Error('저장 폴더 권한이 필요합니다. 설정에서 폴더를 다시 연결해 주세요.');
        const file=await this.folder.getFileHandle(name,{create:true});const writer=await file.createWritable();
        try {await writer.write(blob);await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}
        const saved=await file.getFile();if(saved.size!==blob.size)throw Error('저장 파일 크기 검증 실패');
      }else{
        if(automatic)throw Error('자동 PDF 저장을 위해 다운로드 폴더를 먼저 연결해 주세요.');
        const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
      }
    }
    async dayRows(date){
      const app=this.app;
      if(!app.supabaseClient)return app.dataStore[date]||[];
      const {data,error}=await app.supabaseClient.from('pt_daily_records').select('rows_data').eq('date',date).maybeSingle();
      if(error)throw Error('최신 일지 확인 실패: '+error.message);
      if(app.pendingSyncDates?.has(date))throw Error(`${date}의 클라우드 저장이 완료된 후 다시 시도합니다.`);
      return data?.rows_data || app.dataStore[date] || [];
    }
    async pdf(date,automatic=false){
      const rows=await this.dayRows(date);const blob=await renderPDF(this.app,date,rows);
      await this.write(title(date)+'.pdf',blob,automatic);return blob;
    }
    async backup(automatic=false){
      const cloud={};let shared=null;
      if(this.app.supabaseClient){
        for(let offset=0;;offset+=200){
          const {data,error}=await this.app.supabaseClient.from('pt_daily_records').select('*').order('date',{ascending:true}).range(offset,offset+199);
          if(error)throw Error('전체 백업 조회 실패: '+error.message);
          for(const record of data||[]){if(/^\d{4}-\d{2}-\d{2}$/.test(record.date))cloud[record.date]=record.rows_data;else if(record.date==='__pt_shared_presets_v1__')shared=record;}
          if(!data||data.length<200)break;
        }
      }
      const merged={...cloud};
      for(const [date,rows]of Object.entries(this.app.dataStore))if(!merged[date]||this.app.pendingSyncDates?.has(date)||!this.app.supabaseClient)merged[date]=rows;
      const backup={version:1,createdAt:new Date().toISOString(),scope:'PT app records and presets; excludes database schema, auth and storage',dataStore:merged,cloudDataStore:cloud,localDataStore:this.app.dataStore,sharedPresets:shared,presets:JSON.parse(localStorage.getItem('PT_APP_CUSTOM_PRESETS_V1')||'null')};
      const text=JSON.stringify(backup);if(!JSON.parse(text).dataStore)throw Error('백업 검증 실패');
      const key='backup-'+backup.createdAt;await this.store(key,text);
      if(await this.store(key)!==text)throw Error('로컬 백업 재확인 실패');
      const file=`PT현황_전체백업_${backup.createdAt.replace(/[:.]/g,'-')}.json`;
      if(this.folder||!automatic)await this.write(file,new Blob([text],{type:'application/json'}),automatic);
      this.settings.lastBackup=backup.createdAt;this.settings.lastBackupDay=dateKey(new Date());this.save();return backup;
    }
    async tick(){
      if(this.running||(!this.settings.pdf&&!this.settings.backup))return;
      this.running=true;
      try {
        const now=new Date(),today=dateKey(now),clock=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        if(clock<this.settings.time)return;
        const errors=[];
        if(this.settings.pdf)try{
          const target=previousDay(now);
          let date=this.settings.lastPDF?dateKey(new Date(new Date(this.settings.lastPDF+'T12:00:00').setDate(new Date(this.settings.lastPDF+'T12:00:00').getDate()+1))):this.settings.pdfFrom||target;
          // Catch up missed days when the app is reopened, checkpoint only successful files.
          for(;date<=target;){
            await this.pdf(date,true);this.settings.lastPDF=date;this.save();
            const next=new Date(date+'T12:00:00');next.setDate(next.getDate()+1);date=dateKey(next);
          }
        }
        catch(error){errors.push(error.message);}
        if(this.settings.backup&&this.settings.lastBackupDay!==today)try{await this.backup(true);}catch(error){errors.push(error.message);}
        this.report(errors.length?errors.join(' / '):`저장 확인 완료 · ${today} ${clock}`);
      }catch(error){this.report(error.message);}finally{this.running=false;}
    }
    async usage(container){
      container.textContent='현재 기록을 계산하고 있습니다…';
      await this.app.loadSearchHistory();
      const days=Object.entries(this.app.getSearchDataStore()).filter(([date,rows])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&records(rows).length);
      const bytes=days.reduce((n,[,rows])=>n+new Blob([JSON.stringify(rows)]).size,0),perDay=days.length?bytes/days.length:0;
      container.replaceChildren();
      const p=document.createElement('p');p.textContent=`확인된 ${days.length}일 · 기록 JSON ${(bytes/1e6).toFixed(2)} MB · 기록일 하루 평균 ${(perDay/1000).toFixed(1)} KB`;container.append(p);
      const note=document.createElement('p');note.textContent='예상치는 확인된 기록만 기준으로 합니다. 실제 DB 크기·요금제·인덱스·다른 테이블·월간 전송량은 Supabase 대시보드에서 확인해야 합니다.';container.append(note);
      container.insertAdjacentHTML('beforeend','<label>DB 한도(MB) <input data-limit type="number" min="1" value="500"></label><label>대시보드 현재 DB 사용량(MB) <input data-used type="number" min="0" placeholder="직접 입력"></label><p data-estimate></p><p>Free DB 500 MB · Pro 기본 디스크 8 GB. 월간 전송량은 Free 5 GB / Pro 250 GB로 별도 제한됩니다. 여러 컴퓨터의 반복 조회량에 따라 전송량이 먼저 도달할 수 있습니다.</p><a href="https://supabase.com/docs/guides/platform/billing-on-supabase" target="_blank" rel="noopener">공식 한도 확인</a> · <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">Supabase 사용량 확인</a>');
      const update=()=>{const limit=Number(container.querySelector('[data-limit]').value),raw=container.querySelector('[data-used]').value,used=Number(raw);container.querySelector('[data-estimate]').textContent=raw&&perDay&&limit>0?`남은 기간 추정: 약 ${Math.max(0,Math.floor((limit-used)*1e6/(perDay*2)))} 기록일 (하루 JSON 용량의 2배를 저장 오버헤드로 가정). 보장 기간이 아닙니다.`:'실제 현재 DB 사용량을 입력하면 남은 기록일을 계산합니다.';};container.addEventListener('input',update);update();
    }
    async restoreLatest(){
      const db=await this.db();const keys=await new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const key=keys.filter(k=>String(k).startsWith('backup-')).sort().pop();if(!key)throw Error('이 컴퓨터에 저장된 백업이 없습니다.');
      const backup=JSON.parse(await this.store(key));
      // Download a restore-compatible daily-record file; existing restore UI handles confirmation.
      await this.write(`PT현황_복원용_${key}.json`,new Blob([JSON.stringify(backup.dataStore)],{type:'application/json'}));
      this.report('복원용 JSON 저장 완료. 백업/복구 화면에서 파일을 선택할 수 있습니다.');
    }
    open(){
      this.dialog?.remove();
      const dialog=document.createElement('dialog');this.dialog=dialog;dialog.className='device-settings-dialog';
      dialog.innerHTML=`<header><h2>이 컴퓨터 설정</h2><button data-close aria-label="닫기">×</button></header><nav><button data-tab="exports">자동 PDF</button><button data-tab="backup">백업</button><button data-tab="usage">사용량</button></nav><section data-panel="exports"><label><input type="checkbox" data-pdf> 이전날 현황 자동 PDF 저장</label><label>저장 시간 <input type="time" data-time value="09:10"></label><p>기본: 다음날 오전 9시 10분에 이전날의 최신 기록 저장. 앱이 열려 있고 컴퓨터가 깨어 있어야 실행됩니다. 앱을 다시 열면 누락된 날짜를 순서대로 저장합니다.</p><p>다운로드 폴더를 선택하면 그 안에 물리치료현황 폴더를 생성합니다. 파일명: 0000년 00월 00일 PT현황.pdf</p><button data-folder>📁 다운로드 폴더 연결 / 권한 갱신</button><button data-pdf-now>현재 선택 날짜 PDF 저장</button></section><section data-panel="backup" hidden><label><input type="checkbox" data-backup> 이 컴퓨터에 매일 로컬 백업</label><p>위 저장 시간에 전체 날짜 기록과 빠른 입력 설정을 별도 로컬 백업으로 보관합니다. 폴더가 연결되어 있으면 JSON 파일도 함께 저장합니다. 브라우저 데이터 삭제에 대비하려면 폴더를 연결해 주세요.</p><p>앱 데이터 백업이며 Supabase 스키마·권한·인증·Storage 파일은 포함하지 않습니다.</p><button data-backup-now>지금 백업 파일 저장</button><button data-latest>최근 로컬 백업 내려받기</button><button data-restore>백업 파일 복구 화면</button><p data-backup-date></p></section><section data-panel="usage" hidden></section><footer><p data-status role="status"></p><button data-save>설정 저장</button></footer>`;
      document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-status]').textContent=this.status;
      dialog.querySelector('[data-pdf]').checked=this.settings.pdf;dialog.querySelector('[data-backup]').checked=this.settings.backup;dialog.querySelector('[data-time]').value=this.settings.time;
      dialog.querySelector('[data-backup-date]').textContent=this.settings.lastBackup?`최근 백업: ${new Date(this.settings.lastBackup).toLocaleString()}`:'아직 백업이 없습니다.';
      const run=fn=>async event=>{event.target.disabled=true;try{await fn();}catch(error){if(error.name!=='AbortError')this.report(error.message);}finally{event.target.disabled=false;}};
      dialog.querySelector('[data-close]').onclick=()=>dialog.close();
      dialog.addEventListener('keydown',e=>e.stopPropagation());
      dialog.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{dialog.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==button.dataset.tab);dialog.querySelectorAll('[data-tab]').forEach(tab=>tab.classList.toggle('active',tab===button));if(button.dataset.tab==='usage')void this.usage(dialog.querySelector('[data-panel="usage"]')).catch(error=>this.report(error.message));});
      dialog.querySelector('[data-folder]').onclick=run(()=>this.chooseFolder());
      dialog.querySelector('[data-pdf-now]').onclick=run(async()=>{await this.pdf(this.app.currentDate);this.report('PDF 저장 완료');});
      dialog.querySelector('[data-backup-now]').onclick=run(async()=>{await this.backup();this.report('전체 백업 저장·검증 완료');});
      dialog.querySelector('[data-latest]').onclick=run(()=>this.restoreLatest());
      dialog.querySelector('[data-restore]').onclick=()=>{dialog.close();this.app.openBackupModal();};
      dialog.querySelector('[data-save]').onclick=run(async()=>{
        const pdf=dialog.querySelector('[data-pdf]').checked,backup=dialog.querySelector('[data-backup]').checked,time=dialog.querySelector('[data-time]').value;
        if(!/^\d{2}:\d{2}$/.test(time))throw Error('저장 시간을 선택해 주세요.');
        if(pdf&&!this.folder)throw Error('자동 PDF 저장을 위해 폴더를 먼저 연결해 주세요.');
        if(pdf&&!this.settings.pdf){this.settings.pdfFrom=previousDay(new Date());this.settings.lastPDF=null;}
        this.settings={...this.settings,pdf,backup,time};this.save();this.report('이 컴퓨터에 설정 저장됨');
        if(backup){await this.backup(true);this.report('로컬 백업 저장·검증 완료');}void this.tick();
      });
    }
  }
  window.PTLocalTools={LocalTools,renderPDF,jpegPDF,dateKey,previousDay};
  window.addEventListener('DOMContentLoaded',()=>{if(window.ptApp)window.ptLocalTools=new LocalTools(window.ptApp);});
})();
