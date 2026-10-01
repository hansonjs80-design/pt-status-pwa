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
