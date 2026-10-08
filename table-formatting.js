// Table typography, column defaults, cell overrides, and color menus.
// Methods run with the PTApp instance as `this`; no separate state is created.
class PTTableFormatting {
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
      const setting = this.columnFormatting?.[colKey]?.color;
      const rich = row._richText?.[colKey];
      const validRich = rich?.text === String(row[colKey]) && Array.isArray(rich.colors) &&
        (!setting || row._formatRevisions?.[colKey]?.color === setting.revision);
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
      if (cell) values.add(getComputedStyle(cell)[property]);
    }
    if (values.size !== 1) return { label: "여러 값", value: null };
    const value = [...values][0];
    const weights = { 400: "보통", 500: "중간", 600: "약간 굵게", 700: "굵게", 800: "매우 굵게" };
    let label = property === "fontWeight" ? (weights[value] || value) : value;
    if (property === "color") {
      const channels = value.match(/\d+/g);
      if (channels?.length >= 3) label = "#" + channels.slice(0, 3).map(n => Number(n).toString(16).padStart(2, "0")).join("");
      if (label === "#000000") label = "검정 (#000000)";
    }
    return { value, label };
  }

  loadColumnFormatting() {
    try { return JSON.parse(localStorage.getItem("PT_COLUMN_FORMATTING") || "{}"); }
    catch { return {}; }
  }

  setColumnFormatting(columns, property, value) {
    this.columnFormatting ||= {};
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const revision = `${Date.now()}-${Math.random()}`;
    for (let col = columns.minCol; col <= columns.maxCol; col++) {
      this.columnFormatting[keys[col]] ||= {};
      this.columnFormatting[keys[col]][property] = { value, revision };
    }
    localStorage.setItem("PT_COLUMN_FORMATTING", JSON.stringify(this.columnFormatting));
  }

  markCellFormatting(row, key, property) {
    const setting = this.columnFormatting?.[key]?.[property];
    if (!setting) return;
    row._formatRevisions ||= {};
    row._formatRevisions[key] ||= {};
    row._formatRevisions[key][property] = setting.revision;
  }

  getCellFormatting(row, key, property) {
    const setting = this.columnFormatting?.[key]?.[property];
    const local = property === "color" ? row._textColors?.[key] : row._textStyles?.[key]?.[property];
    return setting && row._formatRevisions?.[key]?.[property] !== setting.revision ? setting.value : local ?? setting?.value;
  }

  applyCellFormatting(element, row, key) {
    for (const property of ["color", "fontSize", "fontWeight"]) {
      const value = this.getCellFormatting(row, key, property);
      element.style[property] = value == null ? "" : property === "fontSize" ? value + "px" : value;
    }
  }

  captureCellFormatting(row, key, element = null) {
    const computed = element && typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
    const formatting = {};
    for (const property of ["color", "fontSize", "fontWeight"]) {
      const value = this.getCellFormatting(row, key, property) ?? computed?.[property];
      if (value != null && value !== "") formatting[property] = property === "fontSize" ? parseFloat(value) : value;
    }
    const setting = this.columnFormatting?.[key]?.color;
    if (row._richText?.[key] && (!setting || row._formatRevisions?.[key]?.color === setting.revision)) {
      formatting.richText = JSON.parse(JSON.stringify(row._richText[key]));
    }
    return formatting;
  }

  applyCopiedCellFormatting(row, key, formatting) {
    for (const metadata of ["_textColors", "_textStyles", "_richText", "_formatRevisions"]) {
      if (row[metadata]) delete row[metadata][key];
    }
    for (const property of ["color", "fontSize", "fontWeight"]) {
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
    if (!range || !["fontSize", "fontWeight"].includes(property)) return;
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
    for (let r = range.minRow; r <= range.maxRow; r++) for (let col = range.minCol; col <= range.maxCol; col++) {
      if (!this.isSelectedCoordinate(r, col)) continue;
      const row = rows[r]; row._textStyles ||= {}; row._textStyles[keys[col]] ||= {};
      this.markCellFormatting(row, keys[col], property);
      if (value === null) delete row._textStyles[keys[col]][property];
      else row._textStyles[keys[col]][property] = value;
    }
    this.saveDataStore(); this.renderTable();
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
    const previous = row._richText?.[key];
    const colors = previous?.text === text ? [...previous.colors] : Array(text.length).fill(null);
    for (let i = Math.max(0, start); i < Math.min(text.length, end); i++) colors[i] = color;
    row._richText ||= {};
    row._richText[key] = { text, colors };
  }

  renderColoredText(element, row, key) {
    const text = key === "visitTime" ? this.getVisitTime(row) : String(row[key] ?? "");
    const setting = this.columnFormatting?.[key]?.color;
    const rich = !setting || row._formatRevisions?.[key]?.color === setting.revision ? row._richText?.[key] : null;
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
        const setting = this.columnFormatting?.[key]?.color;
        if (setting && row._formatRevisions?.[key]?.color !== setting.revision) {
          row._textColors ||= {};
          if (setting.value) row._textColors[key] = setting.value;
          else delete row._textColors[key];
          if (row._richText) delete row._richText[key];
        }
        this.markCellFormatting(row, key, "color");
        this.setPartialTextColor(row, textSelection.colKey, textSelection.start, textSelection.end, color);
        this.saveDataStore(); this.renderTable(); this.closeFontColorMenu(); return;
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
    this.closeFontColorMenu();
  }

  closeFontColorMenu() {
    this.fontColorMenuCleanup?.();
    this.fontColorMenuCleanup = null;
    document.getElementById("fontColorMenu")?.remove();
  }

  openFontColorMenu(anchor) {
    this.closeFontColorMenu();
    const menu = document.createElement("div"); menu.id = "fontColorMenu"; menu.className = "font-color-menu";
    menu.setAttribute("role", "dialog"); menu.setAttribute("aria-label", "글자색 선택");
    const current = document.createElement("div"); current.className = "format-current";
    const status = this.getFormattingStatus("color");
    const swatch = document.createElement("span"); swatch.className = "current-color-chip"; swatch.style.backgroundColor = status.value || "transparent";
    current.append(swatch, document.createTextNode(`현재: ${status.label}`)); menu.append(current);
    const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "↺ 재설정";
    reset.className = "color-reset"; reset.onclick = () => this.applyTextColor(null); menu.appendChild(reset);
    const palette = document.createElement("div"); palette.className = "color-palette";
    const colors = ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#eeeeee", "#f3f3f3", "#ffffff",
      "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4285f4", "#0000ff", "#9900ff", "#ff00ff"];
    const hues = [0, 10, 32, 45, 100, 180, 215, 205, 260, 320];
    for (const light of [88, 76, 64, 48, 34, 20]) for (const hue of hues) colors.push(`hsl(${hue} 55% ${light}%)`);
    colors.forEach(color => { const button = document.createElement("button"); button.type = "button"; button.className = "color-swatch";
      button.style.backgroundColor = color; button.title = color;
      const probe = document.createElement("span"); probe.style.color = color; document.body.append(probe);
      const active = getComputedStyle(probe).color === status.value; probe.remove();
      if (active) { button.classList.add("is-current"); button.textContent = "✓"; button.setAttribute("aria-pressed", "true"); } button.setAttribute("aria-label", color);
      button.onclick = () => this.applyTextColor(color); palette.appendChild(button); });
    menu.appendChild(palette);
    const custom = document.createElement("label"); custom.className = "custom-color"; custom.textContent = "맞춤 색상 ";
    const picker = document.createElement("input"); picker.type = "color"; picker.setAttribute("aria-label", "맞춤 글자색"); picker.oninput = () => this.applyTextColor(picker.value); custom.appendChild(picker); menu.appendChild(custom);
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
