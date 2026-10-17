// Autocomplete typography metadata, candidate rendering, and the preset text editor.
class PTAutocompleteFormatting {
  getAutocompleteColorKey(scope, value) {
    // Keep metadata in string arrays so existing shared-preset sync and
    // backups can carry colors without changing their data format.
    return `__color:${JSON.stringify(scope)}:${JSON.stringify(value)}`;
  }

  getAutocompleteRichKey(scope, value) {
    return this.getAutocompleteColorKey(scope, value).replace('__color:', '__rich:');
  }

  getAutocompleteWeightKey(scope, value) {
    return this.getAutocompleteColorKey(scope, value).replace('__color:', '__weight:');
  }

  getAutocompleteRichWeightKey(scope, value) {
    return this.getAutocompleteColorKey(scope, value).replace('__color:', '__richWeight:');
  }

  getAutocompleteRichStyleKey(scope, value) {
    return this.getAutocompleteColorKey(scope, value).replace('__color:', '__richStyle:');
  }

  writeAutocompleteRichStyles(presets, scope, value, richText) {
    if (richText === undefined) return;
    presets[this.getAutocompleteRichStyleKey(scope, value)] = richText?.text === String(value)
      ? Array.from({length:String(value).length}, (_, i) => JSON.stringify(richText.styles?.[i] || null)) : [];
  }

  writeAutocompleteWeight(presets, scope, value, fontWeight, richText) {
    if (fontWeight === undefined) return;
    presets[this.getAutocompleteWeightKey(scope, value)] = [fontWeight == null ? '' : String(fontWeight)];
    const key = this.getAutocompleteRichWeightKey(scope, value);
    if (richText?.text === value && richText.styles?.some(style => style?.fontWeight != null)) {
      presets[key] = Array.from({ length: value.length }, (_, i) => String(richText.styles[i]?.fontWeight ?? ''));
    } else delete presets[key];
  }

  getAutocompleteValueFormatting(colKey, value, query = null, excludedRow = null) {
    const writerColor = colKey === 'writer' && this.columnFormatting?.writer?.color;
    if (value?._presetFormatting) {
      const format = value._presetFormatting;
      if (!writerColor?.resetRevision) return format;
      const richText = format.richText?.styles?.some(Boolean)
        ? {...format.richText, colors:Array(String(value).length).fill(null)} : null;
      return {...format, color:writerColor.value || null, richText};
    }
    value = String(value);
    const scopes = query ? [this.getAutocompleteRuleKey(colKey, query), colKey] : [colKey];
    let colorEntry, colorRuns, weightEntry, weightRuns, styleRuns;
    for (const scope of scopes) {
      if (colorEntry === undefined && colorRuns === undefined) {
        colorEntry = COLUMN_PRESETS[this.getAutocompleteColorKey(scope, value)];
        colorRuns = COLUMN_PRESETS[this.getAutocompleteRichKey(scope, value)];
      }
      if (weightEntry === undefined && weightRuns === undefined) {
        weightEntry = COLUMN_PRESETS[this.getAutocompleteWeightKey(scope, value)];
        weightRuns = COLUMN_PRESETS[this.getAutocompleteRichWeightKey(scope, value)];
      }
      if (styleRuns === undefined) styleRuns = COLUMN_PRESETS[this.getAutocompleteRichStyleKey(scope, value)];
    }
    let row = null;
    if (!colorEntry || !weightEntry || styleRuns === undefined) {
      // A manager repaint can show many candidates while no cell editor owns a
      // cached snapshot. Share one lookup for that repaint, then discard it.
      const batch = this.autocompleteFormattingBatch;
      const snapshot = batch ? (batch.snapshot ||= this.getAutocompleteSearchSnapshot()) : this.getAutocompleteSearchSnapshot();
      row = this.getAutocompleteFormattingSource(snapshot, colKey, value, excludedRow);
    }
    const rich = row && this.getEffectiveCellRichText(row, colKey);
    const validRich = rich?.text === String(row?.[colKey]) && Array.isArray(rich.colors);
    const offset = row ? Math.max(0, String(row[colKey]).indexOf(value)) : 0;
    const colors = colorRuns?.length === value.length ? colorRuns.map(color => color || null)
      : !colorEntry && validRich ? rich.colors.slice(offset, offset + value.length) : Array(value.length).fill(null);
    const styles = Array.from({ length: value.length }, (_, i) => {
      let style = styleRuns === undefined && validRich ? {...rich.styles?.[offset + i]} : {};
      if (styleRuns?.length === value.length) {
        try { const saved = JSON.parse(styleRuns[i]); if (saved && typeof saved === 'object' && !Array.isArray(saved)) style = saved; } catch (_) {}
      }
      const weight = weightRuns?.length === value.length ? Number(weightRuns[i]) || null
        : styleRuns !== undefined ? Number(style.fontWeight) || null : !weightEntry && validRich ? rich.styles?.[offset + i]?.fontWeight : null;
      if (weight) style.fontWeight = weight; else delete style.fontWeight;
      return Object.keys(style).length ? style : null;
    });
    const uniformColor = validRich && rich.colors.length && rich.colors.every(color => color && color === rich.colors[0]) ? rich.colors[0] : null;
    const color = writerColor?.resetRevision ? writerColor.value || null : colorEntry ? colorEntry[0] || null
      : uniformColor || (row && this.getCellFormatting(row, colKey, 'color')) || null;
    const fontWeight = weightEntry ? Number(weightEntry[0]) || null : (row && this.getCellFormatting(row, colKey, 'fontWeight')) || null;
    const hasStyles = styles.some(Boolean);
    const richText = colors.some(Boolean) || hasStyles ? { text: value, colors, ...(hasStyles ? { styles } : {}) } : null;
    if (writerColor?.resetRevision && richText) richText.colors.fill(null);
    return { color, richText: writerColor?.resetRevision && !hasStyles ? null : richText, fontWeight };
  }

  getAutocompleteValueColor(colKey, value, query = null, excludedRow = null) {
    return this.getAutocompleteValueFormatting(colKey, value, query, excludedRow).color;
  }

  setAutocompleteValueColor(scope, value, color, richText = null, fontWeight = undefined) {
    if (value?._presetFormatting) {
      const previousKey = this.getPresetCandidateIdentity(value);
      if (fontWeight === undefined && !richText && value._presetFormatting.richText?.styles) {
        richText = {text:String(value),colors:Array(String(value).length).fill(null),styles:value._presetFormatting.richText.styles};
      }
      value._presetFormatting = { color: color || null, richText, fontWeight: fontWeight === undefined ? value._presetFormatting.fontWeight : fontWeight };
      const context = this.autocompleteManagerContext;
      if (context?.key === scope) context.hidden = (context.hidden || []).map(key => key === previousKey ? this.getPresetCandidateIdentity(value) : key);
      return;
    }
    COLUMN_PRESETS[this.getAutocompleteColorKey(scope, value)] = [color || ''];
    const key = this.getAutocompleteRichKey(scope, value);
    if (richText?.text === value && richText.colors?.length === value.length) COLUMN_PRESETS[key] = richText.colors.map(color => color || '');
    else delete COLUMN_PRESETS[key];
    this.writeAutocompleteWeight(COLUMN_PRESETS, scope, value, fontWeight, richText);
    if (richText || fontWeight !== undefined) this.writeAutocompleteRichStyles(COLUMN_PRESETS, scope, value, richText);
    saveColumnPresets(COLUMN_PRESETS);
  }

  applyAutocompleteWeight(row, colKey, fontWeight) {
    if (fontWeight === undefined) return;
    row._textStyles ||= {}; row._textStyles[colKey] ||= {};
    if (fontWeight == null) delete row._textStyles[colKey].fontWeight;
    else row._textStyles[colKey].fontWeight = Number(fontWeight);
    this.markCellFormatting(row, colKey, 'fontWeight');
  }

  applyAutocompleteColor(row, colKey, value, query) {
    const { color, richText, fontWeight } = this.getAutocompleteValueFormatting(colKey, value, query, row);
    row._textColors ||= {};
    if (color) row._textColors[colKey] = color; else delete row._textColors[colKey];
    if (row._richText) delete row._richText[colKey];
    if (richText) { row._richText ||= {}; row._richText[colKey] = JSON.parse(JSON.stringify(richText)); }
    this.markCellFormatting(row, colKey, 'color');
    this.applyAutocompleteWeight(row, colKey, fontWeight);
  }

  renderAutocompleteText(element, colKey, value, query, excludedRow = null) {
    const { color, richText, fontWeight } = this.getAutocompleteValueFormatting(colKey, value, query, excludedRow);
    value = String(value);
    element.style.color = color || '';
    element.style.fontWeight = fontWeight == null ? '' : String(fontWeight);
    if (!value) { element.textContent = '빈칸'; return; }
    const row = { [colKey]: value, _textColors: { [colKey]: color }, _textStyles: { [colKey]: {fontWeight} }, _richText: { [colKey]: richText } };
    this.markCellFormatting(row, colKey, 'color');
    this.markCellFormatting(row, colKey, 'fontWeight');
    this.renderColoredText(element, row, colKey);
  }

  toColorPickerValue(color) {
    if (/^#[0-9a-f]{6}$/i.test(color || '')) return color;
    if (/^#[0-9a-f]{3}$/i.test(color || '')) return '#' + color.slice(1).split('').map(char => char + char).join('');
    let rgb = String(color || '');
    if (color && typeof getComputedStyle === 'function') {
      const probe = document.createElement('span'); probe.style.color = color;
      document.body.append(probe); rgb = getComputedStyle(probe).color; probe.remove();
    }
    const channels = /^rgba?\(/.test(rgb) ? rgb.match(/\d+/g) : null;
    return channels?.length >= 3 ? '#' + channels.slice(0, 3).map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('') : '#000000';
  }

  openPresetTextColorEditor(title, value, color, richText = null, fontWeight = null, { description = '' } = {}) {
    value = String(value);
    return new Promise(resolve => {
      const previousFocus = document.activeElement;
      const overlay = document.createElement('div'); overlay.className = 'modal-overlay preset-color-editor';
      overlay.style.display = 'flex'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', title);
      const form = document.createElement('form'); form.className = 'modal-card';
      const heading = document.createElement('h2'); heading.textContent = title;
      const scopeNote = document.createElement('p'); scopeNote.className = 'preset-color-help'; scopeNote.textContent = description; scopeNote.hidden = !description;
      const text = document.createElement('input'); text.type = 'text'; text.value = value; text.setAttribute('aria-label', '문구');
      let baseColor = color || null, composing = false, previousText = value;
      const validRich = richText?.text === value;
      let colors = Array.from({length:value.length}, (_, i) => validRich ? richText.colors?.[i] || null : null);
      let styles = Array.from({length:value.length}, (_, i) => validRich && richText.styles?.[i] ? JSON.parse(JSON.stringify(richText.styles[i])) : null);
      let underlineChoice = styles.find(style => style?.underline)?.underline || {style:'single',color:null};
      let highlightColor = styles.find(style => style?.highlight)?.highlight || '#ffff00';
      const toolbar = document.createElement('div'); toolbar.className = 'preset-editor-toolbar';
      toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', '문구 서식');
      const iconButton = (sourceId, className, label, fallback) => {
        const button = document.createElement('button'); button.type = 'button';
        button.className = `history-button ${className}`;
        button.innerHTML = document.getElementById(sourceId)?.innerHTML || fallback;
        button.title = label; button.setAttribute('aria-label', label);
        button.onmousedown = event => event.preventDefault();
        return button;
      };
      const colorButton = iconButton('btnFontColor','font-color-button preset-editor-color','글자색','<span class="format-icon"><span class="font-color-letter">A</span></span>');
      const bold = iconButton('btnFontWeight','font-weight-button preset-editor-bold','굵게 적용/해제','<span class="format-icon">B</span>');
      const underline = iconButton('btnUnderline','preset-editor-underline','밑줄 적용/해제','<span>가</span>');
      const underlineMenu = iconButton('btnUnderlineMenu','preset-editor-arrow','밑줄 종류 및 색상','<span>▾</span>');
      const highlight = iconButton('btnTextHighlight','preset-editor-highlight','형광펜 적용/해제','<span>🖍</span>');
      const highlightMenu = iconButton('btnUnderlineMenu','preset-editor-arrow','형광펜 색상','<span>▾</span>');
      const changeCase = iconButton('btnChangeCase','change-case-button preset-editor-case','대/소문자 바꾸기','<span>Aa ▾</span>');
      const split = (...buttons) => {const group=document.createElement('div');group.className='preset-editor-split';group.append(...buttons);return group;};
      const weightLabel = document.createElement('label'); weightLabel.className = 'preset-weight-controls';
      const weightPicker = document.createElement('select'); weightPicker.setAttribute('aria-label', '글자 두께');
      for (const [number, caption] of [['','열 기본 두께'],[400,'보통'],[500,'중간'],[600,'약간 굵게'],[700,'굵게'],[800,'더 굵게'],[900,'가장 굵게']]) {
        const option=document.createElement('option');option.value=String(number);option.textContent=caption;weightPicker.append(option);
      }
      weightPicker.value=fontWeight == null ? '' : String(fontWeight);weightLabel.append(weightPicker);
      const reset = document.createElement('button'); reset.type='button';reset.className='preset-editor-reset';reset.textContent='서식 초기화';reset.onmousedown=event=>event.preventDefault();
      toolbar.append(colorButton,bold,weightLabel,split(underline,underlineMenu),split(highlight,highlightMenu),changeCase,reset);
      const panel=document.createElement('div');panel.className='preset-editor-panel';panel.hidden=true;
      const help=document.createElement('p');help.className='preset-color-help preset-editor-selection';
      const previewLabel=document.createElement('small');previewLabel.className='preset-editor-preview-label';previewLabel.textContent='미리보기';
      const preview=document.createElement('div');preview.className='preset-color-preview';preview.setAttribute('aria-label','문구 서식 미리보기');
      const selection=()=>[text.selectionStart ?? 0,text.selectionEnd ?? 0];
      const range=()=>{const [start,end]=selection();return start===end?[0,text.value.length]:[start,end];};
      const isWhole=(start,end)=>start===0&&end===text.value.length;
      const closePanel=()=>{panel.hidden=true;panel.replaceChildren();for(const button of [colorButton,underlineMenu,highlightMenu,changeCase])button.setAttribute('aria-expanded','false');};
      const openPanel=(button,kind)=>{
        if(composing)return false;
        const closing=!panel.hidden&&panel.dataset.kind===kind;closePanel();if(closing)return false;
        panel.dataset.kind=kind;panel.hidden=false;button.setAttribute('aria-expanded','true');return true;
      };
      for(const button of [colorButton,underlineMenu,highlightMenu,changeCase]) {button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');}
      const applyStyle=(property,chosen)=>{
        if(composing)return;
        const [start,end]=range();
        for(let i=start;i<end;i++) {const style={...styles[i]};if(chosen==null)delete style[property];else style[property]=chosen;styles[i]=Object.keys(style).length?style:null;}
        updatePreview();
      };
      const applyWeight=weight=>{
        if(composing)return;
        const [start,end]=range();
        if(isWhole(start,end)) {fontWeight=weight;for(let i=0;i<styles.length;i++){const style={...styles[i]};delete style.fontWeight;styles[i]=Object.keys(style).length?style:null;}}
        else applyStyle('fontWeight',weight);
        weightPicker.value=weight==null?'':String(weight);updatePreview();
      };
      const applyColor=chosen=>{
        if(composing)return;
        const [start,end]=range();
        if(isWhole(start,end)){baseColor=chosen;colors.fill(null);}else for(let i=start;i<end;i++)colors[i]=chosen;
        updatePreview();
      };
      const toggleStyle=(property,chosen)=>{
        const [start,end]=range();
        const matches=Array.from({length:end-start},(_,i)=>property==='underline'?this.underlineMatches(styles[start+i]?.underline,chosen):styles[start+i]?.[property]===chosen).every(Boolean);
        applyStyle(property,matches?null:chosen);
      };
      weightPicker.onchange=()=>applyWeight(Number(weightPicker.value)||null);
      bold.onclick=()=>{const [start]=range();applyWeight(Number(styles[start]?.fontWeight??fontWeight)>=600?400:700);};
      underline.onclick=()=>toggleStyle('underline',underlineChoice);
      highlight.onclick=()=>toggleStyle('highlight',highlightColor);
      const updatePreview=()=>{
        const [start,end]=range();
        help.textContent=isWhole(start,end)?'서식을 고르면 문구 전체에 바로 적용됩니다.':`선택한 ${end-start}글자에 서식이 바로 적용됩니다.`;
        text.style.color=baseColor||'';text.style.fontWeight=fontWeight==null?'':String(fontWeight);
        bold.setAttribute('aria-pressed',String(Number(styles[start]?.fontWeight??fontWeight)>=600));
        underline.setAttribute('aria-pressed',String(!!styles[start]?.underline));highlight.setAttribute('aria-pressed',String(!!styles[start]?.highlight));
        colorButton.querySelector('.format-icon').style.borderBottomColor=colors[start]||baseColor||'#000000';
        highlight.querySelectorAll('.highlight-color-paint').forEach(node=>node.style.fill=highlightColor);
        const row={value:text.value,_textColors:{value:baseColor},_textStyles:{value:{fontWeight}},_richText:{value:{text:text.value,colors,styles}}};
        preview.style.color=baseColor||'';preview.style.fontWeight=fontWeight==null?'':String(fontWeight);
        this.renderColoredText(preview,row,'value');
      };
      const palette=(property,button)=>{
        if(!openPanel(button,property))return;
        const grid=document.createElement('div');grid.className='color-palette';
        const apply=chosen=>{if(property==='color')applyColor(chosen);else {highlightColor=chosen||highlightColor;applyStyle('highlight',chosen);}closePanel();};
        const resetColor=document.createElement('button');resetColor.type='button';resetColor.className='color-reset';resetColor.textContent=property==='color'?'기본 글자색':'형광펜 지우기';resetColor.onclick=()=>apply(null);panel.append(resetColor);
        for(const ink of ['#000000','#434343','#666666','#999999','#cccccc','#ffffff','#980000','#ff0000','#ff9900','#ffff00','#00ff00','#00ffff','#4285f4','#0000ff','#9900ff','#ff00ff']){
          const swatch=document.createElement('button');swatch.type='button';swatch.className='color-swatch';swatch.style.backgroundColor=ink;swatch.title=ink;swatch.setAttribute('aria-label',ink);swatch.dataset.color=ink;swatch.onclick=()=>apply(ink);grid.append(swatch);
        }
        const custom=document.createElement('label');custom.className='custom-color';custom.textContent='맞춤 색상 ';
        const picker=document.createElement('input');picker.type='color';picker.value=this.toColorPickerValue(property==='color'?colors[range()[0]]||baseColor:highlightColor);picker.setAttribute('aria-label',property==='color'?'글자색':'형광펜 색상');picker.oninput=()=>{if(property==='color')applyColor(picker.value);else {highlightColor=picker.value;applyStyle('highlight',picker.value);}};
        custom.append(picker);panel.append(grid,custom);
      };
      colorButton.onclick=()=>palette('color',colorButton);highlightMenu.onclick=()=>palette('highlight',highlightMenu);
      underlineMenu.onclick=()=>{
        if(!openPanel(underlineMenu,'underline'))return;
        const grid=document.createElement('div');grid.className='preset-underline-options';
        for(const [style,label] of this.getUnderlineOptions()){
          const button=document.createElement('button');button.type='button';button.dataset.underlineStyle=style;const sample=document.createElement('span');sample.textContent=label;this.paintUnderline(sample,{style});button.append(sample);
          button.onclick=()=>{underlineChoice={...underlineChoice,style};applyStyle('underline',underlineChoice);closePanel();};grid.append(button);
        }
        const controls=document.createElement('div');controls.className='preset-underline-settings';
        const ink=document.createElement('input');ink.type='color';ink.value=this.toColorPickerValue(underlineChoice.color);ink.setAttribute('aria-label','밑줄 색상');ink.oninput=()=>{underlineChoice={...underlineChoice,color:ink.value};applyStyle('underline',underlineChoice);};
        const auto=document.createElement('button');auto.type='button';auto.textContent='글자색 사용';auto.onclick=()=>{underlineChoice={...underlineChoice,color:null};applyStyle('underline',underlineChoice);};
        const thickness=document.createElement('select');thickness.setAttribute('aria-label','밑줄 두께');
        for(const size of [0.5,1,1.5,2,2.5,3,3.5,4]){const option=document.createElement('option');option.value=String(size);option.textContent=`${size}px`;thickness.append(option);}
        thickness.value=String(this.getUnderlineThickness(underlineChoice));thickness.onchange=()=>{underlineChoice={...underlineChoice,thickness:Number(thickness.value)};applyStyle('underline',underlineChoice);};
        controls.append(ink,auto,thickness);panel.append(grid,controls);
      };
      changeCase.onclick=()=>{
        if(!openPanel(changeCase,'case'))return;
        for(const option of this.getChangeCaseOptions()){
          const button=document.createElement('button');button.type='button';button.className='change-case-option';button.dataset.caseType=option.key;button.textContent=option.label;
          button.onclick=()=>{if(composing)return;const [start,end]=range();text.value=text.value.slice(0,start)+this.transformEnglishCase(text.value.slice(start,end),option.key)+text.value.slice(end);previousText=text.value;text.focus();text.setSelectionRange(start,end);updatePreview();closePanel();};panel.append(button);
        }
      };
      panel.onmousedown=event=>{if(!event.target.matches('input,select,option'))event.preventDefault();};
      text.onselect=text.onclick=text.onkeyup=()=>updatePreview();text.onfocus=closePanel;
      reset.onclick=()=>{if(composing)return;const [start,end]=range();if(isWhole(start,end)){baseColor=null;fontWeight=null;weightPicker.value='';}for(let i=start;i<end;i++){colors[i]=null;styles[i]=null;}closePanel();updatePreview();};
      text.oninput=()=>{
        let start=0,suffix=0;
        while(start<previousText.length&&start<text.value.length&&previousText[start]===text.value[start])start++;
        while(suffix<previousText.length-start&&suffix<text.value.length-start&&previousText[previousText.length-suffix-1]===text.value[text.value.length-suffix-1])suffix++;
        colors.splice(start,previousText.length-start-suffix,...Array(text.value.length-start-suffix).fill(null));
        styles.splice(start,previousText.length-start-suffix,...Array(text.value.length-start-suffix).fill(null));
        previousText=text.value;updatePreview();
      };
      text.addEventListener('compositionstart',()=>{composing=true;closePanel();});text.addEventListener('compositionend',()=>{composing=false;});
      const actions=document.createElement('div');actions.className='preset-color-editor-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';const save=document.createElement('button');save.type='submit';save.textContent='저장';
      const close=result=>{overlay.remove();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});resolve(result);};cancel.onclick=()=>close(null);
      form.onsubmit=event=>{
        event.preventDefault();if(composing)return;
        const trimmed=text.value.trim(),offset=Math.max(0,text.value.indexOf(trimmed));const savedColors=colors.slice(offset,offset+trimmed.length),savedStyles=styles.slice(offset,offset+trimmed.length);
        close({value:trimmed,color:baseColor,fontWeight,richText:savedColors.some(Boolean)||savedStyles.some(Boolean)?{text:trimmed,colors:savedColors,...(savedStyles.some(Boolean)?{styles:savedStyles}:{})}:null});
      };
      overlay.onkeydown=event=>{
        event.stopPropagation();if(event.isComposing||event.keyCode===229||composing)return;
        const shortcut=(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey?event.key.toLowerCase():'';
        if(['b','u','e'].includes(shortcut)){event.preventDefault();({b:bold,u:underline,e:highlight})[shortcut].click();}
        else if(event.key==='Escape'){event.preventDefault();if(!panel.hidden){closePanel();text.focus();}else close(null);}
        else if(event.key==='Tab'){
          const controls=[...form.querySelectorAll('input,select,button')].filter(node=>!node.closest('[hidden]')&&!node.disabled);
          const target=event.shiftKey&&document.activeElement===controls[0]?controls.at(-1):!event.shiftKey&&document.activeElement===controls.at(-1)?controls[0]:null;
          if(target){event.preventDefault();target.focus();}
        }
      };
      overlay.onclick=event=>{if(event.target===overlay)close(null);};
      actions.append(cancel,save);form.append(heading,scopeNote,toolbar,panel,text,help,previewLabel,preview,actions);overlay.append(form);document.body.append(overlay);updatePreview();text.focus();text.select();
    });
  }
}
