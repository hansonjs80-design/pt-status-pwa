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
    let colorEntry, colorRuns, weightEntry, weightRuns;
    for (const scope of scopes) {
      if (colorEntry === undefined && colorRuns === undefined) {
        colorEntry = COLUMN_PRESETS[this.getAutocompleteColorKey(scope, value)];
        colorRuns = COLUMN_PRESETS[this.getAutocompleteRichKey(scope, value)];
      }
      if (weightEntry === undefined && weightRuns === undefined) {
        weightEntry = COLUMN_PRESETS[this.getAutocompleteWeightKey(scope, value)];
        weightRuns = COLUMN_PRESETS[this.getAutocompleteRichWeightKey(scope, value)];
      }
    }
    let row = null;
    if (!colorEntry || !weightEntry) {
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
      const weight = weightRuns?.length === value.length ? Number(weightRuns[i]) || null
        : !weightEntry && validRich ? rich.styles?.[offset + i]?.fontWeight : null;
      return weight ? { fontWeight: weight } : null;
    });
    const uniformColor = validRich && rich.colors.length && rich.colors.every(color => color && color === rich.colors[0]) ? rich.colors[0] : null;
    const color = writerColor?.resetRevision ? writerColor.value || null : colorEntry ? colorEntry[0] || null
      : uniformColor || (row && this.getCellFormatting(row, colKey, 'color')) || null;
    const fontWeight = weightEntry ? Number(weightEntry[0]) || null : (row && this.getCellFormatting(row, colKey, 'fontWeight')) || null;
    const hasWeights = styles.some(Boolean);
    const richText = colors.some(Boolean) || hasWeights ? { text: value, colors, ...(hasWeights ? { styles } : {}) } : null;
    if (writerColor?.resetRevision && richText) richText.colors.fill(null);
    return { color, richText: writerColor?.resetRevision && !hasWeights ? null : richText, fontWeight };
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
    const row = { [colKey]: value, _richText: { [colKey]: richText } };
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
      overlay.style.display = 'flex'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', title);
      const form = document.createElement('form'); form.className = 'modal-card';
      const heading = document.createElement('h2'); heading.textContent = title;
      const scopeNote = document.createElement('p'); scopeNote.className = 'preset-color-help'; scopeNote.textContent = description; scopeNote.hidden = !description;
      const text = document.createElement('input'); text.type = 'text'; text.value = value; text.setAttribute('aria-label', '문구');
      let baseColor = color || null;
      let composing = false;
      text.addEventListener('compositionstart', () => { composing = true; });
      text.addEventListener('compositionend', () => { composing = false; });
      let previousText = value;
      let weights = Array.from({ length: value.length }, (_, i) => richText?.text === value ? richText.styles?.[i]?.fontWeight ?? null : null);
      let colors = richText?.text === value && richText.colors?.length === value.length ? [...richText.colors] : Array(value.length).fill(null);
      const toolbar = document.createElement('div'); toolbar.className = 'preset-editor-toolbar';
      toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', '문구 서식');
      const colorLabel = document.createElement('label'); colorLabel.className = 'preset-editor-color';
      colorLabel.title = '글자색'; colorLabel.append(document.createTextNode('A'));
      const picker = document.createElement('input'); picker.type = 'color'; picker.value = this.toColorPickerValue(color); picker.setAttribute('aria-label', '글자색');
      colorLabel.append(picker);
      const bold = document.createElement('button'); bold.type = 'button'; bold.className = 'preset-editor-bold';
      bold.textContent = 'B'; bold.title = '굵게 적용/해제'; bold.setAttribute('aria-label', bold.title);
      bold.onmousedown = event => event.preventDefault();
      const weightLabel = document.createElement('label'); weightLabel.className = 'preset-weight-controls';
      const weightPicker = document.createElement('select'); weightPicker.setAttribute('aria-label', '글자 두께');
      for (const [number, caption] of [['', '열 기본 두께'], [400, '보통'], [500, '중간'], [600, '약간 굵게'], [700, '굵게'], [800, '더 굵게'], [900, '가장 굵게']]) {
        const option = document.createElement('option'); option.value = String(number); option.textContent = caption; weightPicker.append(option);
      }
      weightPicker.value = fontWeight == null ? '' : String(fontWeight); weightLabel.append(weightPicker);
      const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '서식 초기화';
      reset.onmousedown = event => event.preventDefault();
      toolbar.append(colorLabel, bold, weightLabel, reset);
      const help = document.createElement('p'); help.className = 'preset-color-help preset-editor-selection';
      const previewLabel = document.createElement('small'); previewLabel.className = 'preset-editor-preview-label'; previewLabel.textContent = '미리보기';
      const preview = document.createElement('div'); preview.className = 'preset-color-preview'; preview.setAttribute('aria-label', '글자색·두께 미리보기');
      const selection = () => [text.selectionStart ?? 0, text.selectionEnd ?? 0];
      const isWhole = (start, end) => start === end || (start === 0 && end === text.value.length);
      const applyWeight = weight => {
        const [start, end] = selection();
        if (isWhole(start, end)) { fontWeight = weight; weights.fill(null); }
        else for (let i = start; i < end; i++) weights[i] = weight;
        weightPicker.value = weight == null ? '' : String(weight);
        updatePreview();
      };
      weightPicker.onchange = () => applyWeight(Number(weightPicker.value) || null);
      bold.onclick = () => {
        const [start, end] = selection();
        const weight = isWhole(start, end) ? fontWeight : weights[start] ?? fontWeight;
        applyWeight(Number(weight) >= 600 ? 400 : 700);
      };
      const updatePreview = () => {
        text.style.color = baseColor || '';
        const [start, end] = selection();
        help.textContent = isWhole(start, end) ? '색·두께를 고르면 문구 전체에 바로 적용됩니다.' : `선택한 ${end - start}글자에 색·두께가 바로 적용됩니다.`;
        bold.setAttribute('aria-pressed', String(Number(weights[start] ?? fontWeight) >= 600));
        preview.style.color = text.style.color;
        text.style.fontWeight = preview.style.fontWeight = fontWeight == null ? '' : String(fontWeight);
        preview.replaceChildren();
        for (let i = 0; i < text.value.length;) {
          let end = i + 1;
          while (end < text.value.length && colors[end] === colors[i] && weights[end] === weights[i]) end++;
          const span = document.createElement('span'); span.textContent = text.value.slice(i, end); span.style.color = colors[i] || ''; span.style.fontWeight = weights[i] == null ? '' : String(weights[i]);
          preview.append(span); i = end;
        }
      };
      const applySelected = (selectedColor, whole = false) => {
        const start = text.selectionStart, end = text.selectionEnd;
        if (whole || (start === 0 && end === text.value.length) || start === end) {
          baseColor = selectedColor; colors.fill(null);
        } else for (let i = start; i < end; i++) colors[i] = selectedColor;
        updatePreview();
      };
      picker.oninput = () => applySelected(picker.value);
      text.onselect = text.onclick = text.onkeyup = () => updatePreview();
      reset.onclick = () => {
        const [start, end] = selection();
        if (isWhole(start, end)) { baseColor = null; fontWeight = null; colors.fill(null); weights.fill(null); weightPicker.value = ''; }
        else for (let i = start; i < end; i++) { colors[i] = null; weights[i] = null; }
        updatePreview();
      };
      text.oninput = () => {
        let start = 0, suffix = 0;
        while (start < previousText.length && start < text.value.length && previousText[start] === text.value[start]) start++;
        while (suffix < previousText.length - start && suffix < text.value.length - start &&
          previousText[previousText.length - suffix - 1] === text.value[text.value.length - suffix - 1]) suffix++;
        colors.splice(start, previousText.length - start - suffix, ...Array(text.value.length - start - suffix).fill(null));
        weights.splice(start, previousText.length - start - suffix, ...Array(text.value.length - start - suffix).fill(null));
        previousText = text.value; updatePreview();
      };
      const actions = document.createElement('div'); actions.className = 'preset-color-editor-actions';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '취소';
      const save = document.createElement('button'); save.type = 'submit'; save.textContent = '저장';
      const close = result => {
        overlay.remove();
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        resolve(result);
      };
      cancel.onclick = () => close(null);
      form.onsubmit = event => {
        event.preventDefault();
        if (composing) return;
        const trimmed = text.value.trim(), offset = text.value.indexOf(trimmed);
        const savedColors = colors.slice(Math.max(0, offset), Math.max(0, offset) + trimmed.length);
        const savedWeights = weights.slice(Math.max(0, offset), Math.max(0, offset) + trimmed.length);
        const styles = savedWeights.map(weight => weight == null ? null : { fontWeight: weight });
        close({ value: trimmed, color: baseColor, fontWeight,
          richText: savedColors.some(Boolean) || savedWeights.some(Boolean) ? { text: trimmed, colors: savedColors, ...(savedWeights.some(Boolean) ? { styles } : {}) } : null });
      };
      overlay.onkeydown = event => {
        event.stopPropagation();
        if (event.isComposing || event.keyCode === 229 || composing) return;
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b') {
          event.preventDefault(); bold.click();
        } else if (event.key === 'Escape') { event.preventDefault(); close(null); }
        else if (event.key === 'Tab') {
          const controls = [...form.querySelectorAll('input, select, button')];
          const target = event.shiftKey && document.activeElement === controls[0] ? controls.at(-1)
            : !event.shiftKey && document.activeElement === controls.at(-1) ? controls[0] : null;
          if (target) { event.preventDefault(); target.focus(); }
        }
      };
      overlay.onclick = event => { if (event.target === overlay) close(null); };
      actions.append(cancel, save); form.append(heading, scopeNote, toolbar, text, help, previewLabel, preview, actions); overlay.append(form); document.body.append(overlay);
      updatePreview();
      text.focus(); text.select();
    });
  }
}
