const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
function createApp() {
  const storage = new Map();
  const context = vm.createContext({window:{addEventListener(){}},Event:class{constructor(type){this.type=type;}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(require('./helpers/load-app-source.cjs')+'\nglobalThis.App=PTApp;globalThis.setPresets=value=>COLUMN_PRESETS=value;',context);
  context.setPresets({});
  return {app:Object.create(context.App.prototype),storage,context};
}
function editor(value, caret=value.length) {
  return {value,selectionStart:caret,selectionEnd:caret,dataset:{},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}};
}

test('a Korean-to-English projection can trigger a space rule without rewriting native composition',()=>{
  for(const native of [true,false])for(const [source,target,spaced] of [['ㄱㅅ','Rt','Rt. '],['ㅣㅅ','Lt','Lt. ']]) {
    const {app}=createApp();app.usesNativeCellInput=()=>native;
    app.setForcedCorrection('*',source,target);app.setForcedCorrection('*',target.toLowerCase()+' ',spaced);
    const input=editor(source);input._inputLanguage='kor';input.dataset.nativeComposing='true';
    app.updateForcedCorrection(input,'part');assert.equal(app.getCellEditorValue(input),target);
    input.value=source+' ';input.setSelectionRange(input.value.length,input.value.length);
    app.updateForcedCorrection(input,'part');
    assert.equal(input.value,source+' ','do not interrupt the native IME');
    assert.equal(app.getCellEditorValue(input),spaced);
    app.updateForcedCorrection(input,'part',{commit:true,nativeData:source+' '});
    assert.equal(input.value,spaced);assert.equal(input.selectionStart,spaced.length);assert.equal(input._preserveBoundaryWhitespace,true);
    input.value+=source+' ';app.restoreHandledCellKey(input,{type:'input',inputType:'insertText',data:source+' '});assert.equal(input.value,spaced);
  }
});

test('a committed Korean correction permits its next literal space rule while ordinary matching stays case-sensitive',()=>{
  const {app}=createApp();app.usesNativeCellInput=()=>true;
  app.setForcedCorrection('*','ㄱㅅ','Rt');app.setForcedCorrection('*','rt ','Rt. ');
  assert.equal(app.findForcedCorrection('Rt ','part'),null,'do not broaden ordinary case matching');
  const input=editor('ㄱㅅ');input._inputLanguage='native';app.updateForcedCorrection(input,'part');
  input.value+=' ';input.setSelectionRange(3,3);app.updateForcedCorrection(input,'part');assert.equal(input.value,'Rt. ');
  input.value+=' ';input.setSelectionRange(5,5);app.updateForcedCorrection(input,'part');assert.equal(input.value,'Rt.  ','keep an intentional second space');
  const edited=editor('ㄱㅅ');app.updateForcedCorrection(edited,'part');
  edited.value='XRt ';edited.setSelectionRange(4,4);app.updateForcedCorrection(edited,'part');assert.equal(edited.value,'XRt ');
});

test('projected space rules retain prefix, suffix, caret and subsequent native letters exactly once',()=>{
  const {app}=createApp();app.usesNativeCellInput=()=>true;
  app.setForcedCorrection('*','ㄱㅅ','Rt');app.setForcedCorrection('*','Rt ','Rt. ');
  const input=editor('앞 ㄱㅅ 뒤',4);input._inputLanguage='native';input.dataset.nativeComposing='true';
  app.updateForcedCorrection(input,'part');input.value='앞 ㄱㅅ  뒤';input.setSelectionRange(5,5);app.updateForcedCorrection(input,'part');
  assert.equal(app.getCellEditorValue(input),'앞 Rt.  뒤');
  input.value='앞 ㄱㅅ ㅁ 뒤';input.setSelectionRange(6,6);app.updateForcedCorrection(input,'part');
  assert.equal(app.getCellEditorValue(input),'앞 Rt. a 뒤');
  app.updateForcedCorrection(input,'part',{commit:true});assert.equal(input.value,'앞 Rt. a 뒤');assert.equal(input.selectionStart,7);
});

test('whitespace continuation avoids ambiguous case rules and never chains an unchanged projected target',()=>{
  const {app}=createApp();app.usesNativeCellInput=()=>true;
  app.setForcedCorrection('*','ㄱㅅ','Rt');app.setForcedCorrection('*','Rt','다른 문구');
  app.setForcedCorrection('*','rt ','Rt. ');app.setForcedCorrection('*','RT ','RIGHT ');
  const projected=editor('ㄱㅅ');projected._inputLanguage='native';projected.dataset.nativeComposing='true';
  app.updateForcedCorrection(projected,'part');app.updateForcedCorrection(projected,'part');
  assert.equal(app.getCellEditorValue(projected),'Rt','no new typing means no chained replacement');
  projected.value='ㄱㅅ ';projected.setSelectionRange(3,3);app.updateForcedCorrection(projected,'part');
  assert.equal(app.getCellEditorValue(projected),'Rt ','conflicting targets must not be chosen by case fallback');
  app.setForcedCorrection('part','Rt ','Rt. 부위 ');
  app.updateForcedCorrection(projected,'part');assert.equal(app.getCellEditorValue(projected),'Rt. 부위 ','an exact column rule still wins');
});

test('letter rules apply immediately after quantities while retaining numeric prefixes and the caret',()=>{
  const {app}=createApp();app.setForcedCorrection('*','qns','분');app.setForcedCorrection('*','mw','MW');
  for(const [value,expected] of [['3qns','3분'],['15qns','15분'],['2.5qns','2.5분'],['3QNS','3분'],['３qns','３분'],['3mw','3MW']]) {
    const input=editor(value);input._inputLanguage='native';
    assert.equal(app.updateForcedCorrection(input,'memo'),true,value);
    assert.equal(input.value,expected);assert.equal(input.selectionStart,expected.length);
  }
  const middle=editor('3qns / 확인',4);middle._inputLanguage='native';
  assert.equal(app.updateForcedCorrection(middle,'memo'),true);assert.equal(middle.value,'3분 / 확인');assert.equal(middle.selectionStart,2);
  for(const value of ['aqns','3aqns','3qnsa'])assert.equal(app.findForcedCorrection(value,'memo'),null,value);
  assert.equal(app.findForcedCorrection('3qns4','memo',4),null,'keep the existing right boundary');
  app.setForcedCorrection('*','10','열');assert.equal(app.findForcedCorrection('210','memo'),null,'do not replace a suffix of a number');
});

test('numeric-prefix matching retains longer-rule and column precedence, literal spaces and native composition',()=>{
  const {app}=createApp();app.setForcedCorrection('*','qns','분');app.setForcedCorrection('part','qns','분 부위');
  assert.equal(app.findForcedCorrection('3qns','part').value,'3분 부위');
  app.setForcedCorrection('*','3qns','삼 분');assert.equal(app.findForcedCorrection('3qns','memo').value,'삼 분');
  app.deleteForcedCorrection('*','3qns');app.setForcedCorrection('*','rt ','Rt. ');
  assert.equal(app.findForcedCorrection('3rt','memo'),null);assert.equal(app.findForcedCorrection('3rt ','memo').value,'3Rt. ');
  app.setForcedCorrection('*','분','MIN');const input=editor('3분');input._inputLanguage='native';input.dataset.nativeComposing='true';
  assert.equal(app.updateForcedCorrection(input,'memo'),true);assert.equal(input.value,'3분','leave native composition untouched');
  assert.equal(app.getCellEditorValue(input),'3MIN');
  assert.equal(app.updateForcedCorrection(input,'memo',{commit:true}),true);assert.equal(input.value,'3MIN');assert.equal(input.selectionStart,4);
});

test('one mixed-case rule recognizes its inverse and skips an inverse identical to the replacement',()=>{
  const {app}=createApp();app.setForcedCorrection('*','오Dj','오어');
  assert.equal(app.findForcedCorrection('오Dj','part').value,'오어');
  assert.equal(app.findForcedCorrection('오dJ','part').value,'오어');
  assert.equal(app.findForcedCorrection('오DJ','part'),null,'invert case rather than accept every permutation');
  app.setForcedCorrection('*','mw','MW');
  assert.equal(app.findForcedCorrection('mw','part').value,'MW');
  assert.equal(app.findForcedCorrection('MW','part'),null);
  assert.equal(app.getForcedCorrectionVariants({source:'허리',target:'Lumbar'}).length,1);
});

test('existing equivalent case pairs group for editing without rewriting presets and delete together',()=>{
  const {app}=createApp();app.setForcedCorrection('*','dh','오');app.setForcedCorrection('*','DH','오');
  const before=JSON.stringify(app.getForcedCorrectionRules());
  let groups=app.getGroupedForcedCorrectionRules();assert.equal(groups.length,1);
  assert.equal(groups[0].storedSources.length,2);
  assert.equal(JSON.stringify(app.getForcedCorrectionRules()),before);
  app.setForcedCorrection('part','dh','오른쪽',groups[0]);
  groups=app.getGroupedForcedCorrectionRules();assert.equal(groups.length,1);
  assert.equal(app.findForcedCorrection('DH','part').value,'오른쪽');
  assert.equal(app.findForcedCorrection('dh','memo'),null);
  app.deleteForcedCorrection(groups[0].scope,groups[0].source,groups[0].storedSources);
  assert.equal(app.getForcedCorrectionRules().length,0);
});

test('case-pair aliases respect explicit conflicts and column-specific precedence',()=>{
  const {app}=createApp();app.setForcedCorrection('*','dh','오');app.setForcedCorrection('*','DH','별도');
  assert.equal(app.getGroupedForcedCorrectionRules().length,2);
  assert.equal(app.findForcedCorrection('dh','part').value,'오');
  assert.equal(app.findForcedCorrection('DH','part').value,'별도');
  app.setForcedCorrection('part','dh','부위');
  assert.equal(app.findForcedCorrection('DH','part').value,'부위');
  assert.equal(app.findForcedCorrection('DH','memo').value,'별도');
});

test('forced corrections persist as preset strings with global rules and column overrides',()=>{
  const {app,storage}=createApp();
  assert.equal(app.setForcedCorrection('*','l/t','L/T'),true);
  for(const col of ['no','chartNo','name','part','prescription','extra','writer','memo','specialNote','visitTime']) {
    assert.equal(app.findForcedCorrection('l/t',col).value,'L/T',col);
  }
  app.setForcedCorrection('part','l/t','Lt.');
  assert.equal(app.findForcedCorrection('l/t','part').value,'Lt.');
  assert.equal(app.findForcedCorrection('l/t','memo').value,'L/T');
  const saved=JSON.parse(storage.get('PT_APP_CUSTOM_PRESETS_V1'));
  assert.ok(Object.values(saved).every(values=>Array.isArray(values)&&values.every(value=>typeof value==='string')));
  const next=createApp();next.context.setPresets(saved);
  assert.equal(next.app.findForcedCorrection('l/t','part').value,'Lt.');
  next.app.deleteForcedCorrection('part','l/t');
  assert.equal(next.app.findForcedCorrection('l/t','part').value,'L/T');
});

test('correction rules validate inputs, rename scope and do not leak into another column',()=>{
  const {app}=createApp();
  for(const [scope,source,target] of [['*','','L/T'],['part','itb',''],['part','itb','itb'],['invalid','itb','ITB']]) assert.equal(app.setForcedCorrection(scope,source,target),false);
  app.setForcedCorrection('part','itb','ITB');
  assert.equal(app.findForcedCorrection('itb','memo'),null);
  app.setForcedCorrection('*','it-band','IT band',{scope:'part',source:'itb'});
  assert.equal(app.findForcedCorrection('itb','part'),null);
  assert.equal(app.findForcedCorrection('it-band','memo').value,'IT band');
});

test('correction sources retain trailing spaces and wait for the exact space before replacing',()=>{
  const {app,storage}=createApp();
  assert.equal(app.setForcedCorrection('*','rt ','Rt.'),true);
  assert.equal(app.getForcedCorrectionRules()[0].source,'rt ');
  assert.equal(app.findForcedCorrection('rt','part'),null);
  assert.equal(app.findForcedCorrection('rt\t','part'),null,'a tab does not replace the configured space');
  const input=editor('rt ');input._inputLanguage='eng';
  assert.equal(app.updateForcedCorrection(input,'part'),true);
  assert.equal(input.value,'Rt.');assert.equal(input.selectionStart,3);
  const saved=JSON.parse(storage.get('PT_APP_CUSTOM_PRESETS_V1'));
  const reloaded=createApp();reloaded.context.setPresets(saved);
  assert.equal(reloaded.app.findForcedCorrection('rt','part'),null);
  assert.equal(reloaded.app.findForcedCorrection('rt ','part').value,'Rt.');
  assert.ok(Object.keys(saved).some(key=>key.endsWith('rt%20')));
});

test('leading and trailing spaces survive edits and consume only the explicitly entered whitespace',()=>{
  const {app}=createApp();
  assert.equal(app.setForcedCorrection('*','rt ',' Rt. '),true);
  assert.equal(app.findForcedCorrection('rt ','part').value,' Rt. ');
  assert.equal(app.findForcedCorrection('앞 rt 뒤','part',5).value,'앞  Rt. 뒤','the source already contains a word boundary');
  const previous=app.getForcedCorrectionRules()[0];
  assert.equal(app.setForcedCorrection('part',' rt  ','Rt. ',previous),true);
  assert.equal(app.getForcedCorrectionRules().length,1);
  assert.equal(app.findForcedCorrection('rt ','memo'),null);
  assert.equal(app.findForcedCorrection('앞 rt  뒤','part',6).value,'앞Rt. 뒤');
  app.deleteForcedCorrection('part',' rt  ');
  assert.equal(app.getForcedCorrectionRules().length,0);
  assert.equal(app.setForcedCorrection('*',' ','Rt.'),false);
  assert.equal(app.setForcedCorrection('*','rt',' '),false);
});

test('every column supports explicit inclusion and exclusion with specific-column precedence',()=>{
  const {app,storage}=createApp();
  for(const column of Object.keys(app.getForcedCorrectionColumns())) {
    app.setForcedCorrection('!'+column,'skip','EXCEPT');
    assert.equal(app.findForcedCorrection('skip',column),null);
    const other=column==='memo'?'part':'memo';
    assert.equal(app.findForcedCorrection('skip',other).value,'EXCEPT');
    app.deleteForcedCorrection('!'+column,'skip');
  }
  app.setForcedCorrection('*','same','ALL');
  app.setForcedCorrection('!prescription','same','EXCEPT');
  app.setForcedCorrection('part','same','PART');
  assert.equal(app.findForcedCorrection('same','prescription').value,'ALL');
  assert.equal(app.findForcedCorrection('same','memo').value,'EXCEPT');
  assert.equal(app.findForcedCorrection('same','part').value,'PART');
  const next=createApp();next.context.setPresets(JSON.parse(storage.get('PT_APP_CUSTOM_PRESETS_V1')));
  assert.equal(next.app.findForcedCorrection('same','memo').value,'EXCEPT');
  assert.equal(next.app.getForcedCorrectionRules().length,3);
  assert.equal(app.setForcedCorrection('!invalid','x','Y'),false);
});

test('typing reuses compiled rules while local edits, deletion and incoming presets refresh matches immediately',()=>{
  const {app,context}=createApp();
  const presets={};for(let i=0;i<280;i++)presets[app.getForcedCorrectionKey('*','code'+i)]=['TERM'+i];
  context.setPresets(presets);
  const read=app.getForcedCorrectionRules;let reads=0;
  app.getForcedCorrectionRules=function(...args){reads++;return read.apply(this,args);};
  for(let i=0;i<100;i++)assert.equal(app.findForcedCorrection('code279','part').value,'TERM279');
  assert.equal(reads,1);
  app.setForcedCorrection('part','code279','UPDATED');
  assert.equal(app.findForcedCorrection('code279','part').value,'UPDATED');assert.equal(reads,2);
  app.deleteForcedCorrection('part','code279');
  assert.equal(app.findForcedCorrection('code279','part').value,'TERM279');assert.equal(reads,3);
  context.setPresets({[app.getForcedCorrectionKey('*','code279')]:['REMOTE']});
  assert.equal(app.findForcedCorrection('code279','part').value,'REMOTE');assert.equal(reads,4);
});

test('manager scope filters combine with source, target and Korean scope searches without changing rules',()=>{
  const {app}=createApp();
  for(const [scope,source,target] of [['*','rt ','Rt. '],['prescription','chest','Chest HP'],['part','chest','Chest'],['!prescription','hp','온열']]) app.setForcedCorrection(scope,source,target);
  const original=JSON.stringify(app.getForcedCorrectionRules());
  const list=options=>app.getForcedCorrectionListView(options).filtered;
  assert.equal(list({}).length,4);
  assert.equal(list({scope:'*'}).length,1);
  assert.equal(list({scope:'prescription',query:'cHeSt hP'}).length,1);
  assert.equal(list({scope:'part',query:'HP'}).length,0);
  assert.equal(list({scope:'!prescription',query:'온열'.normalize('NFD')})[0].source,'hp');
  assert.equal(list({query:'처방열만'})[0].scope,'prescription');
  assert.equal(list({query:'Rt.'})[0].source,'rt ');
  assert.equal(JSON.stringify(app.getForcedCorrectionRules()),original);
});

test('manager sorts input, replacement, scope and registration in either direction with numeric ordering',()=>{
  const {app}=createApp();
  for(const [scope,source,target] of [['prescription','code10','C'],['part','code2','A'],['*','code1','B']]) app.setForcedCorrection(scope,source,target);
  const sources=options=>Array.from(app.getForcedCorrectionListView(options).filtered,rule=>rule.source);
  assert.deepEqual(sources({sort:'source'}),['code1','code2','code10']);
  assert.deepEqual(sources({sort:'source',direction:'desc'}),['code10','code2','code1']);
  assert.deepEqual(sources({sort:'target'}),['code2','code1','code10']);
  assert.deepEqual(sources({sort:'target',direction:'desc'}),['code10','code1','code2']);
  assert.deepEqual(sources({sort:'registered'}),['code10','code2','code1']);
  assert.deepEqual(sources({sort:'registered',direction:'desc'}),['code1','code2','code10']);
  assert.deepEqual(sources({sort:'scope',direction:'desc'}),sources({sort:'scope'}).reverse());
});

test('manager list reflects saved edits and deletions while correction precedence remains unchanged',()=>{
  const {app}=createApp();app.setForcedCorrection('*','hp','공통');app.setForcedCorrection('prescription','hp','처방');
  const rule=app.getForcedCorrectionListView({scope:'prescription'}).filtered[0];
  app.setForcedCorrection('prescription','hp','새 처방',rule);
  assert.equal(app.getForcedCorrectionListView({scope:'prescription',query:'새 처방'}).filtered[0].target,'새 처방');
  assert.equal(app.findForcedCorrection('hp','prescription').value,'새 처방');
  assert.equal(app.findForcedCorrection('hp','part').value,'공통');
  app.deleteForcedCorrection('prescription','hp');
  assert.equal(app.getForcedCorrectionListView({scope:'prescription'}).filtered.length,0);
  assert.equal(app.findForcedCorrection('hp','prescription').value,'공통');
});

test('matching respects case and token boundaries and preserves surrounding text and caret',()=>{
  const {app}=createApp();app.setForcedCorrection('part','itb','ITB');
  assert.equal(app.findForcedCorrection('bitb','part'),null);
  assert.equal(app.findForcedCorrection('Itb','part'),null);
  const match=app.findForcedCorrection('왼 itb 통증','part',5);
  assert.equal(match.value,'왼 ITB 통증');assert.equal(match.caret,5);
  const input=editor('(itb) 통증',4);app.updateForcedCorrection(input,'part');
  assert.equal(input.value,'(ITB) 통증');assert.equal(input.selectionStart,4);
  app.setForcedCorrection('*','l/t','L/T');
  assert.equal(app.findForcedCorrection('l/t','part').value,'L/T');
});

test('normal typing replaces immediately, protects late duplicate input and does not chain rules',()=>{
  const {app}=createApp();app.setForcedCorrection('*','l/t','L/T');app.setForcedCorrection('*','L/T','견인');
  const input=editor('l/t');input._engKorBuffer='t';
  assert.equal(app.updateForcedCorrection(input,'specialNote'),true);
  assert.equal(input.value,'L/T');assert.equal(input._engKorBuffer,'');
  input.value='L/Tㅅ';
  assert.equal(app.restoreHandledCellKey(input,{type:'input',inputType:'insertCompositionText',data:'ㅅ',isComposing:true}),true);
  assert.equal(input.value,'L/T');
});

test('tilde separates correction tokens without consuming either side or moving the caret past the replacement',()=>{
  const {app}=createApp();app.setForcedCorrection('*','gj','허');
  for(const [value,caret,expected,end] of [
    ['엉~gj',4,'엉~허',3], ['엉~~gj',5,'엉~~허',4],
    ['엉~gj~무릎',4,'엉~허~무릎',3], ['gj~엉',2,'허~엉',1],
  ]) {
    const input=editor(value,caret);input._inputLanguage='eng';
    assert.equal(app.updateForcedCorrection(input,'part'),true,value);
    assert.equal(input.value,expected);assert.equal(input.selectionStart,end);assert.equal(input.selectionEnd,end);
  }
  for(const value of ['엉gj','엉~agj','엉~gjx']) assert.equal(app.findForcedCorrection(value,'part',value==='엉~gjx'?4:value.length),null);
});

test('punctuation separates correction terms while retaining symbols, surrounding text and caret',()=>{
  const {app}=createApp();app.setForcedCorrection('*','mw','MW');
  for(const separator of ['/','+','-','~',',',':',';','.', '／','→']) {
    const input=editor('La'+separator+'mw');input._inputLanguage='native';
    assert.equal(app.updateForcedCorrection(input,'prescription'),true,separator);
    assert.equal(input.value,'La'+separator+'MW');assert.equal(input.selectionStart,5);
    const middle=editor('La'+separator+'mw'+separator+'ICT',5);
    assert.equal(app.updateForcedCorrection(middle,'prescription'),true,separator+' middle');
    assert.equal(middle.value,'La'+separator+'MW'+separator+'ICT');assert.equal(middle.selectionStart,5);
  }
  assert.equal(app.findForcedCorrection('Lamw','prescription'),null);
  assert.equal(app.findForcedCorrection('La/mwx','prescription',5),null);
});

test('explicit slash phrases still outrank shorter rules and retain exact configured spaces',()=>{
  const {app}=createApp();app.setForcedCorrection('*','mw','MW');app.setForcedCorrection('*','La/mw','Laser / MW');
  assert.equal(app.findForcedCorrection('La/mw','prescription').value,'Laser / MW');
  app.setForcedCorrection('*','l/t','L/T');
  assert.equal(app.findForcedCorrection('La/l/t','prescription').value,'La/L/T');
  app.setForcedCorrection('prescription','mw ','MW ');
  assert.equal(app.findForcedCorrection('La/mw ','prescription').value,'La/MW ');
});

test('explicit tilde rules, column overrides and exact spaces retain their matching priority',()=>{
  const {app}=createApp();app.setForcedCorrection('*','gj','허');
  app.setForcedCorrection('part','gj','허리');
  assert.equal(app.findForcedCorrection('엉~gj','part').value,'엉~허리');
  assert.equal(app.findForcedCorrection('엉~gj','memo').value,'엉~허');
  app.setForcedCorrection('part','엉~gj','엉덩이~허리');
  assert.equal(app.findForcedCorrection('엉~gj','part').value,'엉덩이~허리');
  app.setForcedCorrection('*','rt ','Rt. ');
  assert.equal(app.findForcedCorrection('엉~rt','part'),null);
  assert.equal(app.findForcedCorrection('엉~rt ','part').value,'엉~Rt. ');
});

test('tilde correction preserves native composition and Windows input handling',()=>{
  const {app}=createApp();app.setForcedCorrection('*','gj','허');
  app.usesWindowsNativeInput=()=>true;
  const windows=editor('엉~gj');windows._inputLanguage='eng';
  assert.equal(app.updateForcedCorrection(windows,'part'),true);
  assert.equal(windows.value,'엉~허');assert.equal(windows._inputLanguage,'eng','keep Windows native IME ownership');
  app.setForcedCorrection('*','허','Lumbar');
  const native=editor('엉~허');native._inputLanguage='kor';native.dataset.nativeComposing='true';
  native._nativeCellComposition={prefix:'엉~',suffix:'',data:'허'};
  assert.equal(app.updateForcedCorrection(native,'part'),true);
  assert.equal(native.value,'엉~허','do not rewrite active native composition');
  assert.equal(app.getCellEditorValue(native),'엉~Lumbar');
  app.updateForcedCorrection(native,'part',{commit:true,nativeData:'허'});
  assert.equal(native.value,'엉~Lumbar');assert.equal(native.selectionStart,'엉~Lumbar'.length);
});

test('native Korean correction is visible without mutating the live composition and commits once',()=>{
  const {app}=createApp();app.setForcedCorrection('*','ㅣ/ㅅ','L/T');
  const input=editor('ㅣ/ㅅ');input.dataset.nativeComposing='true';input._inputLanguage='kor';
  assert.equal(app.updateForcedCorrection(input,'specialNote'),true);
  assert.equal(input.value,'ㅣ/ㅅ');assert.equal(app.getCellEditorValue(input),'L/T');
  assert.equal(input._inputLanguage,'eng');assert.equal(app._cellInputLanguage,'eng');
  input.value='ㅣ/사';input.setSelectionRange(3,3);
  app.updateForcedCorrection(input,'specialNote');
  assert.equal(app.getCellEditorValue(input),'L/Tk','growing a native syllable continues in English after the correction');
  input._nativeCellComposition={prefix:'ㅣ/',suffix:'',data:'사'};
  app.projectCellComposition(input,{data:'사'},true);
  app.updateForcedCorrection(input,'specialNote',{commit:true,nativeData:'사'});
  assert.equal(input.value,'L/Tk');assert.equal(input._forcedCorrectionProjection,undefined);
});

test('only Korean-to-English corrections automatically switch the remaining cell input to English',()=>{
  const {app}=createApp();
  for(const [source,target,language] of [['ㅣ/ㅅ','L/T','eng'],['허리','Lumbar','eng'],['허리','왼 허리','kor'],['mw','MW','kor'],['일','1','kor']]) {
    app.setForcedCorrection('*',source,target);
    const input=editor(source);input._inputLanguage='kor';
    app.updateForcedCorrection(input,'memo');
    assert.equal(input.value,target);assert.equal(input._inputLanguage,language);
    assert.equal(input._engKorBuffer,'');
  }
});

test('native English projection applies a column correction and survives its final IME event',()=>{
  const {app}=createApp();app.setForcedCorrection('part','itb','ITB');
  const input=editor('i슈');input.dataset.nativeComposing='true';input._inputLanguage='eng';
  input._nativeCellComposition={prefix:'i',suffix:'',data:'슈'};
  app.updateForcedCorrection(input,'part');assert.equal(input.value,'i슈');assert.equal(app.getCellEditorValue(input),'ITB');
  app.projectCellComposition(input,{data:'슈'},true);
  app.updateForcedCorrection(input,'part',{commit:true,nativeData:'슈'});delete input._nativeCellComposition;
  assert.equal(input.value,'ITB');
  input.value='ITB슈';app.restoreHandledCellKey(input,{type:'input',inputType:'insertText',data:'슈'});
  assert.equal(input.value,'ITB');
});

test('English-to-Korean correction switches language and translates the remaining native composition once',()=>{
  const {app}=createApp();app.setForcedCorrection('part','itb','장경인대');
  const input=editor('i슈');input.dataset.nativeComposing='true';input._inputLanguage='eng';
  input._nativeCellComposition={prefix:'i',suffix:'',data:'슈'};
  app.updateForcedCorrection(input,'part');
  assert.equal(input._inputLanguage,'kor');assert.equal(app._cellInputLanguage,'kor');
  assert.equal(input.value,'i슈');assert.equal(app.getCellEditorValue(input),'장경인대');
  input.value='i슘';input.setSelectionRange(2,2);
  app.projectCellComposition(input,{data:'슘'});
  app.updateForcedCorrection(input,'part');
  assert.equal(app.getCellEditorValue(input),'장경인대ㅁ');
  app.projectCellComposition(input,{data:'슘'},true);
  app.updateForcedCorrection(input,'part',{commit:true,nativeData:'슘'});delete input._nativeCellComposition;
  assert.equal(input.value,'장경인대ㅁ');
  input.dataset.nativeComposing='false';
  assert.equal(app.normalizeCompletedHangulInput(input),false);
  assert.equal(app.assembleCellEditorText(input,input.value),'장경인대ㅁ');
  input.value+='슘';app.restoreHandledCellKey(input,{type:'input',inputType:'insertText',data:'슘'});
  assert.equal(input.value,'장경인대ㅁ');
  const ordinary=editor('itb');ordinary._inputLanguage='eng';
  app.updateForcedCorrection(ordinary,'part');
  assert.equal(ordinary.value,'장경인대');assert.equal(ordinary._inputLanguage,'kor');
});

test('Backspace edits the corrected visible text and rejects the old native commit',()=>{
 const {app}=createApp();app.setForcedCorrection('*','ㅣ/ㅅ','L/T');
 const input=editor('ㅣ/ㅅ');input._inputLanguage='kor';input.dataset.nativeComposing='true';input._nativeCellComposition={prefix:'ㅣ/',suffix:'',data:'ㅅ'};input.dispatchEvent=()=>{};
 app.updateForcedCorrection(input,'specialNote');
 const event={key:'Backspace',preventDefault(){},stopPropagation(){}};
 assert.equal(app.handleForcedCorrectionDelete(event,input),true);assert.equal(input.value,'L/');
 input.value='L/ㅅ';app.restoreHandledCellKey(input,{type:'input',inputType:'insertText',data:'ㅅ'});assert.equal(input.value,'L/');
});

test('editing away a leading space merges equivalent existing rules and their stored case pairs',()=>{
  const {app}=createApp();
  for(const source of [' DpDIR',' dPdir','DpDIR','dPdir'])app.setForcedCorrection('*',source,'예약');
  const editing=app.getGroupedForcedCorrectionRules().find(rule=>rule.source===' DpDIR');
  const result=app.saveForcedCorrectionRule('*','DpDIR','예약',editing);
  assert.equal(result.saved,true);assert.equal(result.merged,1);
  assert.equal(app.getForcedCorrectionRules().length,1);
  assert.equal(app.findForcedCorrection('DpDIR','memo').value,'예약');
  assert.equal(app.findForcedCorrection('dPdir','memo').value,'예약');
  assert.equal(app.findForcedCorrection(' DpDIR','memo').value,' 예약','removed leading-space rule no longer consumes the space');
});

test('an inverse-case duplicate with a different target blocks the edit without changing any stored rules',()=>{
  const {app}=createApp();app.setForcedCorrection('*',' DpDIR','예약');app.setForcedCorrection('*','dPdir','다른 결과');
  const before=JSON.stringify(app.getForcedCorrectionRules());
  const editing=app.getGroupedForcedCorrectionRules().find(rule=>rule.source===' DpDIR');
  const result=app.saveForcedCorrectionRule('*','DpDIR','예약',editing);
  assert.equal(result.saved,false);assert.match(result.message,/다른 변경 문구/);
  assert.equal(JSON.stringify(app.getForcedCorrectionRules()),before);
});

test('a rule save failure retains the original rules and compiled matches for retry',()=>{
  const {app,context}=createApp();app.setForcedCorrection('prescription',' DpDIR','예약');
  const editing=app.getGroupedForcedCorrectionRules()[0];app.getApplicableForcedCorrectionRules('prescription');
  const original=context.localStorage.setItem;
  context.localStorage.setItem=()=>{throw Error('quota');};
  assert.throws(()=>app.saveForcedCorrectionRule('prescription','DpDIR','예약',editing),/quota/);
  assert.equal(app.getForcedCorrectionRules()[0].source,' DpDIR');
  assert.equal(app.findForcedCorrection(' DpDIR','prescription').value,'예약');
  context.localStorage.setItem=original;
  assert.equal(app.saveForcedCorrectionRule('prescription','DpDIR','예약',editing).saved,true);
  assert.equal(app.findForcedCorrection('DpDIR','prescription').value,'예약');
});
