const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function tools(){const window={addEventListener(){}};vm.runInNewContext(fs.readFileSync(require.resolve('../local-tools.js'),'utf8'),{window,Blob,TextEncoder,Date,localStorage:{getItem(){return null;}},setTimeout});return window.PTLocalTools;}
test('PDF writer records valid byte offsets and all page objects',async()=>{
 const {jpegPDF}=tools();const blob=jpegPDF([new Uint8Array([255,216,255,217]),new Uint8Array([255,216,255,217])],1684,1190);
 const bytes=Buffer.from(await blob.arrayBuffer()),text=bytes.toString('latin1');assert.ok(text.includes('/Count 2'));
 const xref=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(text.slice(xref,xref+4),'xref');
 const entries=text.slice(xref).split('\n').slice(3,11);entries.forEach((entry,i)=>assert.equal(text.slice(Number(entry.slice(0,10)),Number(entry.slice(0,10))+7),`${i+1} 0 obj`));
});
test('scheduler catches up missed previous days once and never marks failed PDF complete',async()=>{
 const {LocalTools,previousDay}=tools(),l=Object.create(LocalTools.prototype),now=new Date(),target=previousDay(now);
 const before=new Date(target+'T12:00:00');before.setDate(before.getDate()-2);
 l.settings={pdf:true,backup:true,time:'00:00',pdfFrom:before.toISOString().slice(0,10)};l.save=()=>{};l.report=()=>{};const saved=[];l.pdf=async date=>saved.push(date);let backups=0;l.backup=async()=>{backups++;l.settings.lastBackupDay=tools().dateKey(new Date());};
 await l.tick();assert.equal(saved.at(-1),target);assert.equal(saved.length,3);await l.tick();assert.equal(saved.length,3);assert.equal(backups,1);
 l.settings.lastPDF=null;l.settings.pdfFrom=target;l.settings.lastBackupDay=null;l.pdf=async()=>{throw Error('permission denied')};await l.tick();assert.equal(l.settings.lastPDF,null);assert.equal(backups,2);
});
test('automatic writes refuse silent fallback when no folder is linked',async()=>{
 const {LocalTools}=tools(),l=Object.create(LocalTools.prototype);await assert.rejects(l.write('test.pdf',new Blob(['x']),true),/폴더/);
});
test('hourly backup executes when interval elapsed and respects on/off toggle',async()=>{
 const {LocalTools}=tools(),l=Object.create(LocalTools.prototype);
 let backups=0;
 l.backup=async()=>{backups++;l.settings.lastBackupTimestamp=Date.now();};
 l.save=()=>{};l.report=()=>{};

 // 백업 꺼짐 (backup: false)
 l.settings={backup:false,backupIntervalType:'hourly',backupIntervalHours:1,lastBackupTimestamp:0};
 await l.tick();
 assert.equal(backups,0);

 // 백업 켜짐, 간격 경과 (lastBackupTimestamp 없음)
 l.settings.backup=true;
 await l.tick();
 assert.equal(backups,1);

 // 방금 백업했으므로 간격(1시간) 미경과로 실행 안 됨
 await l.tick();
 assert.equal(backups,1);

 // 2시간 전 백업으로 변경 시 다시 실행됨
 l.settings.lastBackupTimestamp=Date.now() - 7200000;
 await l.tick();
 assert.equal(backups,2);
});
test('daily backup respects backupTime setting',async()=>{
 const {LocalTools,dateKey}=tools(),l=Object.create(LocalTools.prototype);
 let backups=0;
 l.backup=async()=>{backups++;l.settings.lastBackupDay=dateKey(new Date());};
 l.save=()=>{};l.report=()=>{};

 // 아직 시간이 안 된 경우 (23:59 설정)
 l.settings={backup:true,backupIntervalType:'daily',backupTime:'23:59',lastBackupDay:null};
 await l.tick();
 // 현재 시각이 23:59가 아니면 0이어야 함
 if (`${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}` < '23:59') {
   assert.equal(backups,0);
 }

 // 시간이 도달한 경우 (00:00 설정)
 l.settings.backupTime='00:00';
 await l.tick();
 assert.equal(backups,1);

 // 오늘 이미 실행했으면 다시 실행되지 않음
 await l.tick();
 assert.equal(backups,1);
});

test('cleanupOldBackups deletes oldest backups when count exceeds backupMaxCount', async () => {
 const {LocalTools} = tools();
 const l = Object.create(LocalTools.prototype);
 l.settings = { backupMaxCount: 3 };

 // Mock IndexedDB
 const idbFiles = new Map([
   ['backup-2026-10-01T10:00:00.000Z', 'data1'],
   ['backup-2026-10-02T10:00:00.000Z', 'data2'],
   ['backup-2026-10-03T10:00:00.000Z', 'data3'],
   ['backup-2026-10-04T10:00:00.000Z', 'data4'],
   ['backup-2026-10-05T10:00:00.000Z', 'data5']
 ]);
 l.db = async () => ({
   transaction: () => ({
     objectStore: () => ({
       getAllKeys: () => ({
         set onsuccess(fn) { fn({ target: { result: [...idbFiles.keys()] } }); },
         get result() { return [...idbFiles.keys()]; }
       }),
       delete: (key) => { idbFiles.delete(key); }
     })
   })
 });

 // Mock Folder
 const folderFiles = new Map([
   ['PT현황_전체백업_2026-10-01T10-00-00.json', true],
   ['PT현황_전체백업_2026-10-02T10-00-00.json', true],
   ['PT현황_전체백업_2026-10-03T10-00-00.json', true],
   ['PT현황_전체백업_2026-10-04T10-00-00.json', true],
   ['PT현황_전체백업_2026-10-05T10-00-00.json', true]
 ]);
 l.folder = {
   values: async function* () {
     for (const name of folderFiles.keys()) {
       yield { kind: 'file', name };
     }
   },
   removeEntry: async (name) => {
     folderFiles.delete(name);
   }
 };

 // 5개 중 최대 보관 개수 3개 설정이므로 가장 오래된 2개 삭제되어야 함
 await l.cleanupOldBackups();

 assert.equal(idbFiles.size, 3);
 assert.equal(idbFiles.has('backup-2026-10-01T10:00:00.000Z'), false);
 assert.equal(idbFiles.has('backup-2026-10-02T10:00:00.000Z'), false);
 assert.equal(idbFiles.has('backup-2026-10-03T10:00:00.000Z'), true);
 assert.equal(idbFiles.has('backup-2026-10-04T10:00:00.000Z'), true);
 assert.equal(idbFiles.has('backup-2026-10-05T10:00:00.000Z'), true);

 assert.equal(folderFiles.size, 3);
 assert.equal(folderFiles.has('PT현황_전체백업_2026-10-01T10-00-00.json'), false);
 assert.equal(folderFiles.has('PT현황_전체백업_2026-10-02T10-00-00.json'), false);
 assert.equal(folderFiles.has('PT현황_전체백업_2026-10-05T10-00-00.json'), true);
});

test('isWithinWorkHours correctly determines work hours', () => {
 const {LocalTools} = tools();
 const l = Object.create(LocalTools.prototype);

 // 주간 근무: 09:00 ~ 18:00
 assert.equal(l.isWithinWorkHours('08:59', '09:00', '18:00'), false);
 assert.equal(l.isWithinWorkHours('09:00', '09:00', '18:00'), true);
 assert.equal(l.isWithinWorkHours('14:30', '09:00', '18:00'), true);
 assert.equal(l.isWithinWorkHours('18:00', '09:00', '18:00'), true);
 assert.equal(l.isWithinWorkHours('18:01', '09:00', '18:00'), false);
 assert.equal(l.isWithinWorkHours('23:00', '09:00', '18:00'), false);
 assert.equal(l.isWithinWorkHours('03:00', '09:00', '18:00'), false);
});

test('backup pauses outside work hours when workHoursOnly is enabled', async () => {
 const {LocalTools} = tools();
 const l = Object.create(LocalTools.prototype);
 let backups = 0;
 l.backup = async () => { backups++; };
 l.save = () => {};
 l.report = () => {};

 // 현재 시각 가져오기
 const now = new Date();
 const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

 // 1) 현재 시각이 비근무 시간인 설정 (현재 시각 1시간 뒤 출근, 2시간 뒤 퇴근)
 const futureHour = (now.getHours() + 1) % 24;
 const futureHour2 = (now.getHours() + 2) % 24;
 const fakeStart = `${String(futureHour).padStart(2, '0')}:00`;
 const fakeEnd = `${String(futureHour2).padStart(2, '0')}:00`;

 l.settings = {
   backup: true,
   backupIntervalType: 'hourly',
   backupIntervalHours: 1,
   lastBackupTimestamp: 0, // 백업 대상
   workHoursOnly: true,
   workStartTime: fakeStart,
   workEndTime: fakeEnd
 };

 await l.tick();
 // 근무 시간 외이므로 백업되지 않아야 함
 assert.equal(backups, 0);

 // 2) 현재 시각이 근무 시간에 포함되도록 설정 (00:00 ~ 23:59)
 l.settings.workStartTime = '00:00';
 l.settings.workEndTime = '23:59';

 await l.tick();
 // 근무 시간 내이므로 백업 실행되어야 함
 assert.equal(backups, 1);
});



