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

test('native Korean correction is visible without mutating the live composition and commits once',()=>{
  const {app}=createApp();app.setForcedCorrection('*','ㅣ/ㅅ','L/T');
  const input=editor('ㅣ/ㅅ');input.dataset.nativeComposing='true';input._inputLanguage='kor';
  assert.equal(app.updateForcedCorrection(input,'specialNote'),true);
  assert.equal(input.value,'ㅣ/ㅅ');assert.equal(app.getCellEditorValue(input),'L/T');
  input.value='ㅣ/사';input.setSelectionRange(3,3);
  app.updateForcedCorrection(input,'specialNote');
  assert.equal(app.getCellEditorValue(input),'L/Tㅏ','growing a native syllable must retain the corrected prefix');
  app.updateForcedCorrection(input,'specialNote',{commit:true,nativeData:'사'});
  assert.equal(input.value,'L/Tㅏ');assert.equal(input._forcedCorrectionProjection,undefined);
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

test('Backspace edits the corrected visible text and rejects the old native commit',()=>{
 const {app}=createApp();app.setForcedCorrection('*','ㅣ/ㅅ','L/T');
 const input=editor('ㅣ/ㅅ');input._inputLanguage='kor';input.dataset.nativeComposing='true';input._nativeCellComposition={prefix:'ㅣ/',suffix:'',data:'ㅅ'};input.dispatchEvent=()=>{};
 app.updateForcedCorrection(input,'specialNote');
 const event={key:'Backspace',preventDefault(){},stopPropagation(){}};
 assert.equal(app.handleForcedCorrectionDelete(event,input),true);assert.equal(input.value,'L/');
 input.value='L/ㅅ';app.restoreHandledCellKey(input,{type:'input',inputType:'insertText',data:'ㅅ'});assert.equal(input.value,'L/');
});
