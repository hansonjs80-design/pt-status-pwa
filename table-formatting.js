// Table typography, column defaults, cell overrides, and color menus.
// Methods run with the PTApp instance as `this`; no separate state is created.
class PTTableFormatting {
  parseClipboardHtmlColors(html) {
    if (!html || typeof document?.createElement !== "function") return null;
    // Template contents stay inert: never insert clipboard HTML, styles or
    // external resources into the live application document.
    const template = document.createElement("template");
    template.innerHTML = html;
    const table = template.content.querySelector("table");
    if (!table) return null;
    const declaration = document.createElement("span").style;
    const normalizeColor = value => {
      declaration.color = "";
      declaration.color = value || "";
      return ["inherit", "initial", "unset", "currentcolor"].includes(declaration.color.toLowerCase()) ? null : declaration.color || null;
    };
    const rules = [];
    for (const style of template.content.querySelectorAll("style")) {
      const css = style.textContent.replace(/\/\*[\s\S]*?\*\//g, "");
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        declaration.cssText = match[2];
        const important = declaration.getPropertyPriority("color") === "important";
        const color = normalizeColor(declaration.color);
        if (!color) continue;
        // Excel exports colors in .xlNN class rules as well as inline styles.
        for (const selector of match[1].split(",")) {
          const specificity = (selector.match(/#[\w-]+/g)?.length || 0) * 100 +
            (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g)?.length || 0) * 10 +
            (selector.match(/(?:^|[\s>+~])\w+/g)?.length || 0);
          rules.push({ selector: selector.trim(), color, specificity, important });
        }
      }
    }
    const colorCache = new WeakMap();
    const colorFor = element => {
      if (colorCache.has(element)) return colorCache.get(element);
      let color = normalizeColor(element.getAttribute("color")), rank = -1;
      for (const rule of rules) {
        const priority = (rule.important ? 100000 : 0) + rule.specificity;
        try {
          if (priority >= rank && element.matches(rule.selector)) { color = rule.color; rank = priority; }
        } catch { /* Ignore unsupported Office selectors. */ }
      }
      const inline = normalizeColor(element.style?.color);
      if (inline && (element.style.getPropertyPriority("color") === "important" || rank < 100000)) color = inline;
      color ||= element.parentElement ? colorFor(element.parentElement) : "#000000";
      colorCache.set(element, color);
      return color;
    };
    const grid = [];
    Array.from(table.rows).forEach((row, rowIndex) => {
      grid[rowIndex] ||= [];
      let column = 0;
      for (const cell of row.cells) {
        while (grid[rowIndex][column] !== undefined) column++;
        const baseColor = colorFor(cell);
        let text = ""; const colors = [];
        const append = (value, color) => { text += value; for (let i = 0; i < value.length; i++) colors.push(color === baseColor ? null : color); };
        const read = (node, color) => {
          if (node.nodeType === 3) append(node.nodeValue.replace(/\r/g, ""), color);
          else if (node.nodeType === 1 && !["SCRIPT", "STYLE", "IMG", "IFRAME", "OBJECT"].includes(node.tagName)) {
            if (node.tagName === "BR") append("\n", color);
            else for (const child of node.childNodes) read(child, colorFor(node));
          }
        };
        for (const child of cell.childNodes) read(child, baseColor);
        const trimmed = text.trim(), offset = text.length - text.trimStart().length;
        const formatting = { color: baseColor };
        const trimmedColors = colors.slice(offset, offset + trimmed.length);
        if (trimmedColors.some(Boolean)) formatting.richText = { text: trimmed, colors: trimmedColors };
        grid[rowIndex][column] = { text: trimmed, formatting };
        // Keep formatting coordinates aligned with TSV for merged Excel cells.
        const rowSpan = Math.max(1, Math.min(10000, cell.rowSpan || 1));
        const colSpan = Math.max(1, Math.min(1000, cell.colSpan || 1));
        for (let r = 0; r < rowSpan; r++) for (let c = 0; c < colSpan; c++) {
          grid[rowIndex + r] ||= [];
          if (r || c) grid[rowIndex + r][column + c] = { text: "", formatting: { color: baseColor } };
        }
        column += colSpan;
      }
    });
    return grid;
  }

  applyPastedCellColors(row, key, formatting) {
    row._textColors ||= {};
    row._textColors[key] = formatting.color;
    if (row._richText) delete row._richText[key];
    if (formatting.richText) {
      row._richText ||= {};
      row._richText[key] = JSON.parse(JSON.stringify(formatting.richText));
    }
    this.markCellFormatting(row, key, "color");
  }

  getAutocompleteColorKey(scope, value) {
    // Keep metadata in string arrays so existing shared-preset sync and
    // backups can carry colors without changing their data format.
    return `__color:${JSON.stringify(scope)}:${JSON.stringify(value)}`;
  }

  getAutocompleteRichKey(scope, value) {
    return this.getAutocompleteColorKey(scope, value).replace('__color:', '__rich:');
  }

  getAutocompleteValueFormatting(colKey, value, query = null, excludedRow = null) {
    const scopes = query ? [this.getAutocompleteRuleKey(colKey, query), colKey] : [colKey];
    for (const scope of scopes) {
      const entry = COLUMN_PRESETS[this.getAutocompleteColorKey(scope, value)];
      const colors = COLUMN_PRESETS[this.getAutocompleteRichKey(scope, value)];
      if (entry || colors) return { color: entry?.[0] || null,
        richText: colors?.length === value.length ? { text: value, colors: colors.map(color => color || null) } : null };
    }
    const store = this.getSearchDataStore();
    for (const date of Object.keys(store).sort().reverse()) {
      const row = store[date]?.find(row => row !== excludedRow && String(row?.[colKey] ?? '').trim() === String(value).trim());
      if (!row) continue;
      const rich = this.getEffectiveCellRichText(row, colKey);
      const validRich = rich?.text === String(row[colKey]) && Array.isArray(rich.colors);
      const uniformColor = validRich && rich.colors.length && rich.colors.every(color => color && color === rich.colors[0]) ? rich.colors[0] : null;
      // The latest matching record determines the candidate color, including
      // a record that inherits the column default instead of an older color.
      const offset = Math.max(0, String(row[colKey]).indexOf(value));
      return { color: uniformColor || this.getCellFormatting(row, colKey, 'color') || null,
        richText: validRich ? { text: value, colors: rich.colors.slice(offset, offset + value.length) } : null };
    }
    return { color: null, richText: null };
  }

  getAutocompleteValueColor(colKey, value, query = null, excludedRow = null) {
    return this.getAutocompleteValueFormatting(colKey, value, query, excludedRow).color;
  }

  setAutocompleteValueColor(scope, value, color, richText = null) {
    COLUMN_PRESETS[this.getAutocompleteColorKey(scope, value)] = [color || ''];
    const key = this.getAutocompleteRichKey(scope, value);
    if (richText?.text === value && richText.colors?.length === value.length) COLUMN_PRESETS[key] = richText.colors.map(color => color || '');
    else delete COLUMN_PRESETS[key];
    saveColumnPresets(COLUMN_PRESETS);
  }

  applyAutocompleteColor(row, colKey, value, query) {
    const { color, richText } = this.getAutocompleteValueFormatting(colKey, value, query, row);
    row._textColors ||= {};
    if (color) row._textColors[colKey] = color; else delete row._textColors[colKey];
    if (row._richText) delete row._richText[colKey];
    if (richText) { row._richText ||= {}; row._richText[colKey] = richText; }
    this.markCellFormatting(row, colKey, 'color');
  }

  renderAutocompleteText(element, colKey, value, query, excludedRow = null) {
    const { color, richText } = this.getAutocompleteValueFormatting(colKey, value, query, excludedRow);
    element.style.color = color || '';
    if (!value) { element.textContent = '빈칸'; return; }
    const row = { [colKey]: value, _richText: { [colKey]: richText } };
    this.markCellFormatting(row, colKey, 'color');
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

  openPresetTextColorEditor(title, value, color, richText = null) {
    return new Promise(resolve => {
      const previousFocus = document.activeElement;
      const overlay = document.createElement('div'); overlay.className = 'modal-overlay preset-color-editor';
      overlay.style.display = 'flex'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', title);
      const form = document.createElement('form'); form.className = 'modal-card';
      const heading = document.createElement('h2'); heading.textContent = title;
      const text = document.createElement('input'); text.type = 'text'; text.value = value; text.setAttribute('aria-label', '문구');
      let baseColor = color || null;
      let previousText = value;
      let colors = richText?.text === value && richText.colors?.length === value.length ? [...richText.colors] : Array(value.length).fill(null);
      const label = document.createElement('label');
      const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = Boolean(color);
      label.append(enabled, document.createTextNode(' 전체 기본 글자색 지정'));
      const picker = document.createElement('input'); picker.type = 'color'; picker.value = this.toColorPickerValue(color); picker.setAttribute('aria-label', '글자색');
      const help = document.createElement('p'); help.className = 'preset-color-help';
      help.textContent = '문구에서 원하는 글자를 선택하고 색을 고르세요. 글자마다 다른 색을 지정할 수 있습니다.';
      const preview = document.createElement('div'); preview.className = 'preset-color-preview'; preview.setAttribute('aria-label', '글자색 미리보기');
      const updatePreview = () => {
        text.style.color = enabled.checked ? baseColor || '' : '';
        preview.style.color = text.style.color;
        preview.replaceChildren();
        for (let i = 0; i < text.value.length;) {
          let end = i + 1;
          while (end < text.value.length && colors[end] === colors[i]) end++;
          const span = document.createElement('span'); span.textContent = text.value.slice(i, end); span.style.color = colors[i] || '';
          preview.append(span); i = end;
        }
      };
      const applySelected = (selectedColor, whole = false) => {
        const start = text.selectionStart, end = text.selectionEnd;
        if (whole || (start === 0 && end === text.value.length) || start === end) {
          baseColor = selectedColor; enabled.checked = Boolean(selectedColor); colors.fill(null);
        } else for (let i = start; i < end; i++) colors[i] = selectedColor;
        updatePreview();
      };
      picker.oninput = () => applySelected(picker.value);
      enabled.onchange = () => { if (enabled.checked) baseColor = picker.value; updatePreview(); };
      text.oninput = () => {
        let start = 0, suffix = 0;
        while (start < previousText.length && start < text.value.length && previousText[start] === text.value[start]) start++;
        while (suffix < previousText.length - start && suffix < text.value.length - start &&
          previousText[previousText.length - suffix - 1] === text.value[text.value.length - suffix - 1]) suffix++;
        colors.splice(start, previousText.length - start - suffix, ...Array(text.value.length - start - suffix).fill(null));
        previousText = text.value; updatePreview();
      };
      const colorActions = document.createElement('div'); colorActions.className = 'preset-character-color-actions';
      for (const [caption, action] of [['선택 글자에 적용', () => {
        if (text.selectionStart !== text.selectionEnd) applySelected(picker.value);
      }], ['전체 글자에 적용', () => applySelected(picker.value, true)], ['선택 글자 기본색', () => {
        if (text.selectionStart !== text.selectionEnd) applySelected(null);
      }]]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = caption;
        button.onmousedown = event => event.preventDefault(); button.onclick = action; colorActions.append(button);
      }
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
        const trimmed = text.value.trim(), offset = text.value.indexOf(trimmed);
        const savedColors = colors.slice(Math.max(0, offset), Math.max(0, offset) + trimmed.length);
        close({ value: trimmed, color: enabled.checked ? baseColor : null,
          richText: savedColors.some(Boolean) ? { text: trimmed, colors: savedColors } : null });
      };
      overlay.onkeydown = event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(null); } };
      overlay.onclick = event => { if (event.target === overlay) close(null); };
      actions.append(cancel, save); form.append(heading, text, help, label, picker, colorActions, preview, actions); overlay.append(form); document.body.append(overlay);
      updatePreview();
      text.focus(); text.select();
    });
  }

  getFormattingRange() {
    if (this.crossDateSelection) return null;
    if (this.selectedRange) return { ...this.selectedRange };
    if (!this.activeCell) return null;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const col = keys.indexOf(this.activeCell.colKey);
    return { minRow: this.activeCell.rowIdx, maxRow: this.activeCell.rowIdx, minCol: col, maxCol: col };
  }

  getFormattingStatus(property) {
    const range = this.getFormattingRange();
    if (!range) return { label: "선택 없음", value: null };
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const values = new Set();
    for (let r = range.minRow; r <= range.maxRow; r++) for (let c = range.minCol; c <= range.maxCol; c++) {
      if (!this.isSelectedCoordinate(r, c)) continue;
      const cell = this.elTableBody.querySelector(`[data-row="${r}"][data-col="${keys[c]}"]`);
      if (cell) values.add(property === "backgroundColor"
        ? this.getCellFormatting(this.getCurrentRows()[r] || {}, keys[c], property) || "#ffffff"
        : getComputedStyle(cell)[property]);
    }
    if (values.size !== 1) return { label: "여러 값", value: null };
    const value = [...values][0];
    const weights = { 400: "보통", 500: "중간", 600: "약간 굵게", 700: "굵게", 800: "매우 굵게" };
    let label = property === "fontWeight" ? (weights[value] || value) : value;
    if (property === "color" || property === "backgroundColor") {
      label = this.normalizeColumnColor(value) || value;
      if (label === "#000000") label = "검정 (#000000)";
    }
    return { value, label };
  }

  updateFontColorIndicator(appliedColor) {
    if (typeof document === "undefined") return;
    const button = document.getElementById?.("btnFontColor");
    const icon = button?.querySelector?.(".format-icon");
    if (!icon) return;
    const status = appliedColor ? { value: appliedColor, label: appliedColor } : this.getFormattingStatus("color");
    icon.style.borderBottomColor = status.value || "#000000";
    icon.style.borderBottomStyle = status.label === "여러 값" ? "dashed" : "solid";
    const label = `글자색: ${status.label}`;
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  isCellFormattingCurrent(row, key, property) {
    // An explicit Apply resets existing overrides on every date/device without
    // rewriting patient records. Later cell edits stamp this reset revision.
    const reset = this.columnFormatting?.[key]?.[property]?.resetRevision;
    return !reset || row._formatRevisions?.[key]?.[property] === reset;
  }

  getEffectiveCellRichText(row, key) {
    return this.isCellFormattingCurrent(row, key, 'color') ? row._richText?.[key] : undefined;
  }

  markCellFormatting(row, key, property) {
    const setting = this.columnFormatting?.[key]?.[property];
    if (!setting) return;
    row._formatRevisions ||= {};
    row._formatRevisions[key] ||= {};
    row._formatRevisions[key][property] = setting.resetRevision || setting.revision;
  }

  getCellFormatting(row, key, property) {
    const setting = this.columnFormatting?.[key]?.[property];
    const local = property === "color" ? row._textColors?.[key] : row._textStyles?.[key]?.[property];
    return (this.isCellFormattingCurrent(row, key, property) ? local : undefined) ?? setting?.value;
  }

  applyCellFormatting(element, row, key) {
    for (const property of ["color", "fontSize", "fontWeight", "backgroundColor", "textAlign"]) {
      const value = this.getCellFormatting(row, key, property);
      if (property === "backgroundColor") {
        if (value != null || element.style.backgroundColor) {
          if (element.style.setProperty) element.style.setProperty("background-color", value || "", value ? "important" : "");
          else element.style.backgroundColor = value || "";
        }
      } else if (property !== "textAlign") element.style[property] = value == null ? "" : property === "fontSize" ? value + "px" : value;
    }
    this.applyCellAlignmentStyle(element, row, key);
  }

  applyCellAlignmentStyle(element, row, key) {
    const alignment = this.getCellFormatting(row, key, 'textAlign');
    if (element.dataset) {
      if (alignment) element.dataset.cellAlignment = alignment;
      else delete element.dataset.cellAlignment;
    }
    if (alignment || element.style.textAlign) {
      element.style.textAlign = alignment || '';
      element.style.paddingLeft = alignment === 'left' ? '20px' : alignment ? '6px' : '';
      element.style.paddingRight = alignment ? '6px' : '';
    }
  }

  captureCellFormatting(row, key, element = null) {
    const computed = element && typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
    const formatting = {};
    for (const property of ["color", "fontSize", "fontWeight", "backgroundColor", "textAlign"]) {
      const value = this.getCellFormatting(row, key, property) ?? (property === "backgroundColor" ? undefined : computed?.[property]);
      if (value != null && value !== "") formatting[property] = property === "fontSize" ? parseFloat(value) : value;
    }
    const rich = this.getEffectiveCellRichText(row, key);
    if (rich?.text === String(row[key] ?? "") && Array.isArray(rich.colors)) {
      formatting.richText = JSON.parse(JSON.stringify(rich));
    }
    return formatting;
  }

  applyCopiedCellFormatting(row, key, formatting) {
    for (const metadata of ["_textColors", "_textStyles", "_richText", "_formatRevisions"]) {
      if (row[metadata]) delete row[metadata][key];
    }
    for (const property of ["color", "fontSize", "fontWeight", "backgroundColor", "textAlign"]) {
      if (formatting[property] !== undefined) {
        if (property === "color") { row._textColors ||= {}; row._textColors[key] = formatting[property]; }
        else { row._textStyles ||= {}; row._textStyles[key] ||= {}; row._textStyles[key][property] = formatting[property]; }
      }
      this.markCellFormatting(row, key, property);
    }
    if (formatting.richText) {
      row._richText ||= {};
      row._richText[key] = JSON.parse(JSON.stringify(formatting.richText));
    }
  }

  getSelectedFormattingColumns() {
    // Only header selection changes defaults. A cell selection remains local
    // even if an older column-selection marker survived an event handoff.
    return !this.activeCell && !this.selectedRowRange && !this.selectedCellSet && this.selectedColumnRange
      ? { ...this.selectedColumnRange } : null;
  }

  applyColumnTypography(property, value) {
    const range = this.getFormattingRange();
    if (!range || !["fontSize", "fontWeight", "backgroundColor", "textAlign"].includes(property)) return;
    const columns = this.getSelectedFormattingColumns();
    if (this.isEditingCell()) document.activeElement.blur();
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    if (columns) {
      this.setColumnFormatting(columns, property, value);
      this.renderTable();
      this.selectEntireColumn(keys[columns.minCol], "", keys[columns.maxCol]);
      return;
    }
    const rows = this.getCurrentRows();
    // Record both sides of formatting even when an editor still owns focus.
    this.captureHistory?.();
    for (let r = range.minRow; r <= range.maxRow; r++) for (let col = range.minCol; col <= range.maxCol; col++) {
      if (!this.isSelectedCoordinate(r, col)) continue;
      const row = rows[r]; row._textStyles ||= {}; row._textStyles[keys[col]] ||= {};
      this.markCellFormatting(row, keys[col], property);
      if (value === null) delete row._textStyles[keys[col]][property];
      else row._textStyles[keys[col]][property] = value;
    }
    this.captureHistory?.();
    this.saveDataStore(); this.renderTable();
  }

  getAlignmentIconPath(alignment) {
    return alignment === 'left' ? 'M3 5h18M3 10h12M3 15h18M3 20h12'
      : alignment === 'right' ? 'M3 5h18M9 10h12M3 15h18M9 20h12'
        : 'M3 5h18M6 10h12M3 15h18M6 20h12';
  }

  updateAlignmentIndicator() {
    const button = document.getElementById('btnTextAlign');
    if (!button) return;
    const status = this.getFormattingStatus('textAlign');
    button.querySelector('path').setAttribute('d', this.getAlignmentIconPath(status.value));
    button.title = `셀 정렬: ${{left:'왼쪽',center:'가운데',right:'오른쪽'}[status.value] || status.label}`;
    button.setAttribute('aria-label', button.title);
  }

  applyAlignment(alignment) {
    if (!['left', 'center', 'right'].includes(alignment)) return;
    const range = this.getFormattingRange();
    if (!range) return;
    const columns = this.getSelectedFormattingColumns();
    if (columns) {
      this.applyColumnTypography('textAlign', alignment);
    } else {
      // Keep the original native input alive, including its selection and IME.
      const keys = ['no','gender','chartNo','name','part','prescription','extra','writer','memo','specialNote','visitTime'];
      const rows = this.getCurrentRows();
      this.captureHistory();
      for (let r = range.minRow; r <= range.maxRow; r++) for (let c = range.minCol; c <= range.maxCol; c++) {
        if (!this.isSelectedCoordinate(r, c)) continue;
        const key = keys[c], row = rows[r];
        row._textStyles ||= {}; row._textStyles[key] ||= {};
        row._textStyles[key].textAlign = alignment;
        this.markCellFormatting(row, key, 'textAlign');
        const cell = this.elTableBody.querySelector(`[data-row="${r}"][data-col="${key}"]`);
        if (cell) {
          this.applyCellFormatting(cell, row, key);
          cell.querySelector('input')?.refreshEditorColors?.();
        }
      }
      this.captureHistory();
      this.saveDataStore(false);
      this.updateInlineAutocompletePreview();
    }
    this.updateAlignmentIndicator();
  }

  openAlignmentMenu(anchor) {
    if (!this.getFormattingRange()) return;
    this.typographyCleanup?.(); document.getElementById('columnTypographyMenu')?.remove();
    const originalFocus = document.activeElement;
    const nativeEditor = originalFocus?.matches?.('.cell-input-element') ? originalFocus : null;
    const popup = document.createElement('div');
    popup.id = 'columnTypographyMenu'; popup.className = 'column-typography-menu alignment-menu';
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', '셀 정렬');
    const current = this.getFormattingStatus('textAlign').value;
    const close = () => { popup.remove(); this.typographyCleanup?.(); this.typographyCleanup = null; };
    for (const [value, label] of [['left','왼쪽 정렬'],['center','가운데 정렬'],['right','오른쪽 정렬']]) {
      const button = document.createElement('button'); button.type = 'button';
      button.dataset.alignment = value;
      button.title = label; button.setAttribute('aria-label', label);
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${this.getAlignmentIconPath(value)}"/></svg>`;
      button.classList.toggle('is-current', current === value); button.setAttribute('aria-pressed', String(current === value));
      button.onclick = () => {
        this.applyAlignment(value); close();
        if (nativeEditor?.isConnected) nativeEditor.focus({preventScroll:true});
        else this.elSheetContainer.focus({preventScroll:true});
      };
      popup.append(button);
    }
    popup.onmousedown = event => event.preventDefault(); document.body.append(popup);
    const rect = anchor.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - popup.offsetHeight - 8))}px`;
    const outside = event => { if (!popup.contains(event.target) && !anchor.contains(event.target)) close(); };
    popup.onkeydown = event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); (nativeEditor?.isConnected ? nativeEditor : anchor).focus({preventScroll:true}); }
      if (['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const options = [...popup.querySelectorAll('button')];
        const index = options.indexOf(document.activeElement);
        options[(index + (['ArrowDown','ArrowRight'].includes(event.key) ? 1 : -1) + options.length) % options.length].focus();
      }
    };
    document.addEventListener('mousedown', outside);
    this.typographyCleanup = () => document.removeEventListener('mousedown', outside);
    if (!nativeEditor) (popup.querySelector('.is-current') || popup.querySelector('button')).focus();
  }

  openColumnTypographyMenu(property, anchor = null) {
    if (!this.getFormattingRange()) return;
    const status = this.getFormattingStatus(property);
    this.typographyCleanup?.(); document.getElementById("columnTypographyMenu")?.remove();
    const popup = document.createElement("div"); popup.id = "columnTypographyMenu"; popup.className = "column-typography-menu";
    popup.setAttribute("role", "dialog"); popup.setAttribute("aria-label", property === "fontSize" ? "글자 크기" : "글자 굵기");
    const title = document.createElement("strong"); title.textContent = property === "fontSize" ? "글자 크기" : "글자 굵기"; popup.append(title);
    const current = document.createElement("div"); current.className = "format-current"; current.textContent = `현재: ${status.label}`; popup.append(current);
    const options = property === "fontSize" ? [[null, "기본 크기"], ...Array.from({ length: 129 }, (_, i) => 8 + i * 0.5).map(n => [n, `${n}px`])]
      : [[null, "기본 굵기"], [400, "보통"], [500, "중간"], [600, "약간 굵게"], [700, "굵게"], [800, "매우 굵게"]];
    const close = () => { popup.remove(); this.typographyCleanup?.(); this.typographyCleanup = null; };
    for (const [value, label] of options) {
      const button = document.createElement("button"); button.textContent = label;
      const active = value !== null && String(value) === String(parseFloat(status.value));
      button.classList.toggle("is-current", active); button.setAttribute("aria-pressed", String(active));
      if (active) button.textContent = "✓ " + label;
      if (property === "fontWeight" && value) button.style.fontWeight = value;
      button.onclick = () => { this.applyColumnTypography(property, value); close(); this.elSheetContainer.focus(); };
      popup.append(button);
    }
    popup.onmousedown = event => event.preventDefault(); document.body.append(popup);
    const rect = (anchor || this.elContextMenu).getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(anchor ? rect.bottom + 6 : rect.top, innerHeight - popup.offsetHeight - 8))}px`;
    const outside = event => { if (!popup.contains(event.target)) close(); };
    const escape = event => { event.stopPropagation(); if (event.key === "Escape") { close(); this.elSheetContainer.focus(); } };
    document.addEventListener("mousedown", outside); popup.addEventListener("keydown", escape);
    this.typographyCleanup = () => document.removeEventListener("mousedown", outside);
    const initial = popup.querySelector(".is-current") || popup.querySelector("button");
    initial.focus();
    initial.scrollIntoView({ block: "nearest" });
  }

  captureTextColorSelection() {
    this.textColorSelection = null;
    const input = document.activeElement;
    if (!this.activeCell || !input?.matches(".cell-input-element:not(.is-armed)") || input.selectionStart === input.selectionEnd) return;
    this.textColorSelection = { ...this.activeCell, text: input.value, start: input.selectionStart, end: input.selectionEnd };
  }

  setPartialTextColor(row, key, start, end, color) {
    const text = String(row[key] ?? "");
    if (!this.isCellFormattingCurrent(row, key, 'color')) {
      row._textColors ||= {};
      row._textColors[key] = this.getCellFormatting(row, key, 'color');
    }
    const previous = this.getEffectiveCellRichText(row, key);
    const colors = previous?.text === text ? [...previous.colors] : Array(text.length).fill(null);
    for (let i = Math.max(0, start); i < Math.min(text.length, end); i++) colors[i] = color;
    row._richText ||= {};
    row._richText[key] = { text, colors };
  }

  renderColoredText(element, row, key) {
    const text = key === "visitTime" ? this.getVisitTime(row) : String(row[key] ?? "");
    const rich = this.getEffectiveCellRichText(row, key);
    element.textContent = "";
    if (rich?.text !== text || !Array.isArray(rich.colors)) {
      element.textContent = text;
      if (key === "visitTime") this.appendVisitTimeRefresh(element, row);
      return;
    }
    let start = 0;
    while (start < text.length) {
      const color = rich.colors[start];
      let end = start + 1;
      while (end < text.length && rich.colors[end] === color) end++;
      const span = document.createElement("span"); span.textContent = text.slice(start, end);
      if (color) span.style.color = color;
      element.append(span); start = end;
    }
    if (key === "visitTime") this.appendVisitTimeRefresh(element, row);
  }

  applyTextColor(color) {
    if (this.crossDateSelection) return;
    const columns = this.getSelectedFormattingColumns();
    if (columns) {
      this.textColorSelection = null;
      this.setColumnFormatting(columns, "color", color);
      this.renderTable();
      const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
      this.selectEntireColumn(keys[columns.minCol], "", keys[columns.maxCol]);
      this.updateFontColorIndicator(color);
      this.closeFontColorMenu();
      return;
    }
    const textSelection = this.textColorSelection;
    this.textColorSelection = null;
    if (textSelection && this.activeCell?.rowIdx === textSelection.rowIdx && this.activeCell?.colKey === textSelection.colKey) {
      if (this.isEditingCell()) document.activeElement.blur();
      const row = this.getCurrentRows()[textSelection.rowIdx];
      if (String(row[textSelection.colKey] ?? "") === textSelection.text) {
        const key = textSelection.colKey;
        this.setPartialTextColor(row, textSelection.colKey, textSelection.start, textSelection.end, color);
        this.markCellFormatting(row, key, "color");
        this.saveDataStore(); this.renderTable(); this.updateFontColorIndicator(color); this.closeFontColorMenu(); return;
      }
    }
    if (this.isEditingCell()) document.activeElement.blur();
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const rows = this.getCurrentRows();
    const range = this.selectedRange || (this.selectedRowRange ? { ...this.selectedRowRange, minCol: 0, maxCol: keys.length - 1 } : null) || (this.selectedColKey ? { minRow: 0, maxRow: rows.length - 1, minCol: keys.indexOf(this.selectedColKey), maxCol: keys.indexOf(this.selectedColKey) }
      : this.activeCell ? { minRow: this.activeCell.rowIdx, maxRow: this.activeCell.rowIdx, minCol: keys.indexOf(this.activeCell.colKey), maxCol: keys.indexOf(this.activeCell.colKey) } : null);
    if (!range) return;
    for (let r = range.minRow; r <= range.maxRow; r++) for (let c = range.minCol; c <= range.maxCol; c++) {
      if (!this.isSelectedCoordinate(r, c)) continue;
      this.markCellFormatting(rows[r], keys[c], "color");
      if (rows[r]._richText) delete rows[r]._richText[keys[c]];
      rows[r]._textColors ||= {};
      if (color) rows[r]._textColors[keys[c]] = color; else delete rows[r]._textColors[keys[c]];
    }
    this.saveDataStore(); this.renderTable();
    this.updateFontColorIndicator(color);
    this.closeFontColorMenu();
  }

  closeFontColorMenu() {
    this.fontColorMenuCleanup?.();
    this.fontColorMenuCleanup = null;
    document.getElementById("fontColorMenu")?.remove();
  }

  applyBackgroundColor(color) {
    this.applyColumnTypography("backgroundColor", color);
    this.updateBackgroundColorIndicator();
    this.closeFontColorMenu();
  }

  updateBackgroundColorIndicator() {
    if (typeof document === "undefined") return;
    const button = document.getElementById?.("btnBackgroundColor");
    const bar = button?.querySelector?.(".fill-color-bar");
    if (!bar) return;
    const status = this.getFormattingStatus("backgroundColor");
    bar.style.backgroundColor = status.value || "#999999";
    button.querySelectorAll?.(".fill-color-paint").forEach(part => { part.style.fill = status.value || "#999999"; });
    button.title = `셀 배경색: ${status.label}`;
    button.setAttribute("aria-label", button.title);
  }

  openFontColorMenu(anchor, property = "color") {
    this.closeFontColorMenu();
    const menu = document.createElement("div"); menu.id = "fontColorMenu"; menu.className = "font-color-menu";
    const isBackground = property === "backgroundColor";
    const apply = color => isBackground ? this.applyBackgroundColor(color) : this.applyTextColor(color);
    menu.setAttribute("role", "dialog"); menu.setAttribute("aria-label", isBackground ? "셀 배경색 선택" : "글자색 선택");
    const current = document.createElement("div"); current.className = "format-current";
    const status = this.getFormattingStatus(property);
    const swatch = document.createElement("span"); swatch.className = "current-color-chip"; swatch.style.backgroundColor = status.value || "transparent";
    current.append(swatch, document.createTextNode(`현재: ${status.label}`)); menu.append(current);
    const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "↺ 재설정";
    reset.className = "color-reset"; reset.onclick = () => apply(null); menu.appendChild(reset);
    const palette = document.createElement("div"); palette.className = "color-palette";
    const colors = ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#eeeeee", "#f3f3f3", "#ffffff",
      "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4285f4", "#0000ff", "#9900ff", "#ff00ff"];
    const hues = [0, 10, 32, 45, 100, 180, 215, 205, 260, 320];
    for (const light of [88, 76, 64, 48, 34, 20]) for (const hue of hues) colors.push(`hsl(${hue} 55% ${light}%)`);
    colors.forEach(color => { const button = document.createElement("button"); button.type = "button"; button.className = "color-swatch";
      button.style.backgroundColor = color; button.title = color;
      const probe = document.createElement("span"); probe.style.color = color; document.body.append(probe);
      const active = getComputedStyle(probe).color === status.value || (isBackground && this.normalizeColumnColor(color) === this.normalizeColumnColor(status.value)); probe.remove();
      if (active) { button.classList.add("is-current"); button.textContent = "✓"; button.setAttribute("aria-pressed", "true"); } button.setAttribute("aria-label", color);
      button.onclick = () => apply(color); palette.appendChild(button); });
    menu.appendChild(palette);
    const custom = document.createElement("label"); custom.className = "custom-color"; custom.textContent = "맞춤 색상 ";
    const picker = document.createElement("input"); picker.type = "color"; picker.value = this.normalizeColumnColor(status.value) || "#000000"; picker.setAttribute("aria-label", isBackground ? "맞춤 셀 배경색" : "맞춤 글자색"); picker.oninput = () => apply(picker.value); custom.appendChild(picker); menu.appendChild(custom);
    menu.onmousedown = event => { if (event.target !== picker) event.preventDefault(); };
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect(); menu.style.left = `${Math.max(6, Math.min(rect.left, innerWidth - menu.offsetWidth - 6))}px`;
    menu.style.top = `${Math.max(6, Math.min(rect.bottom + 6, innerHeight - menu.offsetHeight - 6))}px`;
    const close = event => { if (!menu.contains(event.target) && !anchor.contains(event.target)) this.closeFontColorMenu(); };
    const escape = event => { if (event.key === "Escape") this.closeFontColorMenu(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    this.fontColorMenuCleanup = () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }

  // =============================================================================
  // Clipboard Operations (클립보드 연동: 복사, 잘라내기, 붙여넣기, 지우기)
  // =============================================================================
}
