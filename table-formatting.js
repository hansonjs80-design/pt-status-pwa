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

  loadColumnFormatting() {
    try { this.columnFormattingPending = JSON.parse(localStorage.getItem("PT_COLUMN_FORMATTING_PENDING") || "{}"); }
    catch { this.columnFormattingPending = {}; }
    this.columnFormattingPending = this.normalizeSharedColumnFormatting(this.columnFormattingPending) || {};
    let saved;
    try { saved = this.normalizeSharedColumnFormatting(JSON.parse(localStorage.getItem("PT_COLUMN_FORMATTING") || "{}")) || {}; }
    catch { saved = {}; }
    for (const [key, properties] of Object.entries(this.columnFormattingPending)) saved[key] = {...saved[key], ...properties};
    return saved;
  }

  normalizeColumnColor(color) {
    if (color === null) return null;
    if (typeof color !== 'string') return undefined;
    const value = color.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(value)) return value;
    if (/^#[0-9a-f]{3}$/.test(value)) return '#' + value.slice(1).split('').map(char => char + char).join('');
    const match = /^(rgb|hsl)\(\s*([+-]?[\d.]+)(%?)\s*[, ]\s*([+-]?[\d.]+)(%?)\s*[, ]\s*([+-]?[\d.]+)(%?)\s*\)$/.exec(value);
    if (!match) return undefined;
    let channels;
    if (match[1] === 'rgb') channels = [2,4,6].map(i => Number(match[i]) * (match[i+1] ? 2.55 : 1));
    else {
      if (match[3] || match[5] !== '%' || match[7] !== '%') return undefined;
      const hue = ((Number(match[2]) % 360) + 360) % 360;
      const saturation = Number(match[4]) / 100, light = Number(match[6]) / 100;
      if (saturation < 0 || saturation > 1 || light < 0 || light > 1) return undefined;
      const a = saturation * Math.min(light, 1 - light);
      channels = [0,8,4].map(n => {
        const k = (n + hue / 30) % 12;
        return 255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
      });
    }
    if (channels.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return undefined;
    return '#' + channels.map(n => Math.round(n).toString(16).padStart(2,'0')).join('');
  }

  normalizeSharedColumnFormatting(formatting) {
    if (!formatting || typeof formatting !== 'object' || Array.isArray(formatting)) return null;
    const normalized = JSON.parse(JSON.stringify(formatting));
    for (const properties of Object.values(normalized)) {
      for (const property of ['color', 'backgroundColor']) {
        if (!properties?.[property]) continue;
        const color = this.normalizeColumnColor(properties[property].value);
        if (color === undefined) return null;
        properties[property].value = color;
      }
    }
    return this.validateSharedColumnFormatting(normalized) ? normalized : null;
  }

  setColumnFormatting(columns, property, value, resetCells = false) {
    if (property === 'color' || property === 'backgroundColor') {
      value = this.normalizeColumnColor(value);
      if (value === undefined) return;
    }
    this.columnFormatting ||= {};
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const revision = `${Date.now()}-${Math.random()}`;
    for (let col = columns.minCol; col <= columns.maxCol; col++) {
      this.columnFormatting[keys[col]] ||= {};
      const existing = this.columnFormatting[keys[col]][property];
      if (!resetCells && existing && (existing.value === value || (property === "fontWeight" && String(existing.value) === String(value)))) continue;
      const setting = { value, revision };
      if (resetCells || existing?.resetRevision) setting.resetRevision = resetCells ? revision : existing.resetRevision;
      this.columnFormatting[keys[col]][property] = setting;
      this.columnFormattingPending ||= {};
      this.columnFormattingPending[keys[col]] ||= {};
      this.columnFormattingPending[keys[col]][property] = setting;
    }
    localStorage.setItem("PT_COLUMN_FORMATTING_PENDING", JSON.stringify(this.columnFormattingPending || {}));
    localStorage.setItem("PT_COLUMN_FORMATTING", JSON.stringify(this.columnFormatting));
    if (this.supabaseClient) {
      clearTimeout(this.columnFormattingSyncTimer);
      this.columnFormattingSyncTimer = setTimeout(() => { void this.syncSharedColumnFormatting(); }, 250);
    }
  }

  validateSharedColumnFormatting(formatting) {
    if (!formatting || typeof formatting !== "object" || Array.isArray(formatting)) return false;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    return Object.entries(formatting).every(([key, properties]) => keys.includes(key) && properties &&
      Object.entries(properties).every(([property, setting]) => setting && typeof setting.revision === "string" &&
        (setting.resetRevision === undefined || typeof setting.resetRevision === "string") &&
        (property === "fontSize" ? setting.value === null || (Number.isInteger(setting.value * 2) && setting.value >= 8 && setting.value <= 72)
          : property === "fontWeight" ? setting.value === null || [400,500,600,700,800,900].includes(Number(setting.value))
            : ["color", "backgroundColor"].includes(property) && (setting.value === null || /^#[0-9a-f]{6}$/i.test(setting.value)))));
  }

  acceptSharedColumnFormatting(formatting) {
    formatting = this.normalizeSharedColumnFormatting(formatting);
    if (!formatting) return;
    const merged = JSON.parse(JSON.stringify(formatting));
    for (const [key, properties] of Object.entries(this.columnFormattingPending || {})) {
      merged[key] = { ...merged[key], ...properties };
    }
    const changed = JSON.stringify(merged) !== JSON.stringify(this.columnFormatting || {});
    this.columnFormatting = merged;
    localStorage.setItem("PT_COLUMN_FORMATTING", JSON.stringify(merged));
    if (changed) this.columnFormattingRenderPending = true;
    // A live IME editor keeps its DOM and composition; repaint after editing ends.
    if (this.columnFormattingRenderPending && !this.isEditingCell()) {
      this.columnFormattingRenderPending = false;
      this.renderTable();
    }
  }

  async syncSharedColumnFormatting() {
    if (this.columnFormattingSyncTask) {
      await this.columnFormattingSyncTask;
      return !Object.keys(this.columnFormattingPending || {}).length;
    }
    const task = Object.keys(this.columnFormattingPending || {}).length ? this.pushSharedColumnFormatting() : this.pullSharedColumnFormatting();
    this.columnFormattingSyncTask = task;
    try { await task; }
    finally { if (this.columnFormattingSyncTask === task) this.columnFormattingSyncTask = null; }
    return !Object.keys(this.columnFormattingPending || {}).length;
  }

  async pullSharedColumnFormatting() {
    const client = this.supabaseClient;
    if (!client || this.columnFormattingSyncBusy || Object.keys(this.columnFormattingPending || {}).length) return;
    this.columnFormattingSyncBusy = true;
    try {
      const { data, error } = await client.from("pt_daily_records").select("rows_data").eq("date", SHARED_COLUMN_FORMATTING_RECORD).maybeSingle();
      if (error) throw error;
      if (client !== this.supabaseClient || Object.keys(this.columnFormattingPending || {}).length) return;
      if (!data) {
        // Only the first device seeds legacy settings. Every later device uses
        // the established shared values, never its old device-specific cache.
        const result = await client.from("pt_daily_records").insert({ date: SHARED_COLUMN_FORMATTING_RECORD,
          rows_data: [{ columnFormatting: this.columnFormatting || {} }], total_count: 0, updated_at: new Date().toISOString() });
        if (result.error && result.error.code !== "23505") throw result.error;
        this.notifyCloudChange(SHARED_COLUMN_FORMATTING_RECORD);
        return;
      }
      const formatting = this.normalizeSharedColumnFormatting(data.rows_data?.[0]?.columnFormatting);
      if (!formatting) throw new Error('invalid shared settings');
      this.acceptSharedColumnFormatting(formatting);
      this.columnFormattingSyncFailed = false;
    } catch { this.reportColumnFormattingSyncFailure(); }
    finally { this.columnFormattingSyncBusy = false; }
  }

  async pushSharedColumnFormatting() {
    const client = this.supabaseClient;
    if (!client || this.columnFormattingSyncBusy || !Object.keys(this.columnFormattingPending || {}).length) return;
    this.columnFormattingSyncBusy = true;
    const pending = JSON.parse(JSON.stringify(this.columnFormattingPending));
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await client.from("pt_daily_records").select("rows_data, updated_at").eq("date", SHARED_COLUMN_FORMATTING_RECORD).maybeSingle();
        if (error) throw error;
        if (client !== this.supabaseClient) return;
        const remote = data && this.normalizeSharedColumnFormatting(data.rows_data?.[0]?.columnFormatting);
        if (data && !remote) throw new Error("invalid shared settings");
        const merged = JSON.parse(JSON.stringify(data ? remote : this.columnFormatting || {}));
        for (const [key, properties] of Object.entries(pending)) merged[key] = { ...merged[key], ...properties };
        const record = { date: SHARED_COLUMN_FORMATTING_RECORD, rows_data: [{ columnFormatting: merged }], total_count: 0,
          updated_at: new Date(Math.max(Date.now(), (Date.parse(data?.updated_at) || 0) + 1)).toISOString() };
        let result;
        if (data) {
          const update = client.from("pt_daily_records").update(record).eq("date", SHARED_COLUMN_FORMATTING_RECORD);
          result = await (data.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", data.updated_at)).select("date");
        } else result = await client.from("pt_daily_records").insert(record).select("date");
        if (result.error?.code === "23505") continue;
        if (result.error) throw result.error;
        if (!result.data?.length) continue;
        if (client !== this.supabaseClient) return;
        for (const [key, properties] of Object.entries(pending)) for (const [property, setting] of Object.entries(properties)) {
          if (this.columnFormattingPending[key]?.[property]?.revision === setting.revision) delete this.columnFormattingPending[key][property];
          if (!Object.keys(this.columnFormattingPending[key] || {}).length) delete this.columnFormattingPending[key];
        }
        localStorage.setItem("PT_COLUMN_FORMATTING_PENDING", JSON.stringify(this.columnFormattingPending));
        this.acceptSharedColumnFormatting(merged);
        this.notifyCloudChange(SHARED_COLUMN_FORMATTING_RECORD);
        this.columnFormattingSyncFailed = false;
        if (!Object.keys(this.columnFormattingPending).length) this.showSaveIndicator("열 글자 설정 저장 및 동기화 완료");
        return;
      }
      throw new Error("shared settings changed concurrently");
    } catch { this.reportColumnFormattingSyncFailure(); }
    finally { this.columnFormattingSyncBusy = false; }
  }

  reportColumnFormattingSyncFailure() {
    if (!this.columnFormattingSyncFailed) this.showSaveIndicator("열 글자 설정 동기화 대기 · 연결되면 다시 저장합니다", true);
    this.columnFormattingSyncFailed = true;
  }

  getColumnFontSettings() {
    const labels = ["No.", "성별", "차트번호", "성함", "부위", "처방", "추가 사항", "작성", "메모", "특이 사항"];
    return ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"].map((key, index) => ({
      key, label: `${String.fromCharCode(65 + index)}열 · ${labels[index]}`,
      fontSize: this.columnFormatting?.[key]?.fontSize?.value ?? (index === 0 ? 16 : 14),
      fontWeight: String(this.columnFormatting?.[key]?.fontWeight?.value ?? (index < 2 ? 600 : 500)),
      color: this.columnFormatting?.[key]?.color?.value ?? "#000000",
    }));
  }

  saveColumnFontSettings(settings, baseline = null) {
    const columns = this.getColumnFontSettings();
    if (settings.length !== columns.length || settings.some((setting, index) =>
      setting.key !== columns[index].key || !Number.isInteger(setting.fontSize * 2) ||
      setting.fontSize < 8 || setting.fontSize > 72 ||
      ![400, 500, 600, 700, 800, 900].includes(Number(setting.fontWeight)) ||
      !/^#[0-9a-f]{6}$/i.test(setting.color))) return false;
    // Only changed properties receive a new revision. Saving the same defaults
    // must not invalidate later cell-specific formatting on any date.
    settings.forEach((setting, index) => {
      for (const property of ["fontSize", "fontWeight", "color"]) {
        if (baseline && setting[property] === baseline[index]?.[property] && this.columnFormatting?.[setting.key]?.[property]) continue;
        const value = property === "fontWeight" ? String(setting[property]) : setting[property];
        this.setColumnFormatting({ minCol: index, maxCol: index }, property, value);
      }
    });
    return true;
  }

  handleColumnFontSettingsEnter(event) {
    if (event.key !== 'Enter' || !event.target?.matches?.('input[type="number"]')) return false;
    event.preventDefault();
    if (!event.isComposing && event.keyCode !== 229 && !event.repeat) {
      event.target.closest('tr')?.querySelector('[data-apply-column]')?.click();
    }
    return true;
  }

  openColumnFontSettings() {
    document.getElementById("columnFontSettingsModal")?.remove();
    const previousFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.id = "columnFontSettingsModal";
    overlay.className = "modal-overlay column-font-settings";
    overlay.innerHTML = `<form class="modal-card" role="dialog" aria-modal="true" aria-labelledby="columnFontSettingsTitle" aria-describedby="columnFontSettingsNote" novalidate>
      <div class="modal-header"><h2 id="columnFontSettingsTitle" class="modal-title">열 글자 설정</h2><button type="button" class="btn-close-modal" data-close aria-label="설정창 닫기">✕</button></div>
      <div class="modal-body">
        <p id="columnFontSettingsNote" class="column-font-note">적용한 열의 기존 셀 서식은 모든 날짜·검색 내역에서 바뀝니다. 적용 후 지정한 개별 셀 서식은 유지됩니다.</p>
        <div class="column-font-guide"><strong>10개 열</strong><span>크기 8~72px · 0.5px 단위 · 입력칸 Enter로 해당 열 적용</span></div>
        <div class="column-font-list"><table><thead><tr><th scope="col">열</th><th scope="col">크기</th><th scope="col">굵기</th><th scope="col">색</th><th scope="col">미리보기</th><th scope="col">열별 적용</th></tr></thead><tbody></tbody></table></div>
        <p id="columnFontSettingsError" class="column-font-error" role="alert" hidden></p>
      </div>
      <div class="column-font-footer">
        <p class="column-font-status" role="status" aria-live="polite">입력값을 바꾼 뒤 적용하세요.</p>
        <div class="column-font-actions"><span>적용한 열은 즉시 저장됩니다.</span><button type="button" data-close>닫기</button><button type="submit">전체 열 적용</button></div>
      </div></form>`;
    const tbody = overlay.querySelector("tbody");
    const error = overlay.querySelector('.column-font-error');
    const status = overlay.querySelector('.column-font-status');
    const applyAll = overlay.querySelector('button[type="submit"]');
    const baseline = this.getColumnFontSettings();
    let busy = false;
    const rows = [];
    const readSetting = row => ({
      key: row.dataset.key,
      fontSize: Number(row.querySelector('[data-property="fontSize"]').value),
      fontWeight: row.querySelector('[data-property="fontWeight"]').value,
      color: row.querySelector('[data-property="color"]').value,
    });
    const updateButtons = () => {
      for (const row of rows) {
        row.querySelector('[data-apply-column]').disabled = busy || row.dataset.applied === 'true';
        row.querySelectorAll('input, select').forEach(control => { control.disabled = busy; });
      }
      applyAll.disabled = busy || rows.every(row => row.dataset.applied === 'true');
      applyAll.textContent = busy ? '저장 중…' : '전체 열 적용';
    };
    const showStatus = (message, tone = 'info') => { status.textContent = message; status.dataset.tone = tone; };
    const validate = selectedRows => {
      error.hidden = true;
      for (const row of selectedRows) {
        const size = row.querySelector('[data-property="fontSize"]');
        size.removeAttribute('aria-invalid');
        if (!size.checkValidity()) {
          const label = baseline.find(setting => setting.key === row.dataset.key).label;
          error.textContent = `${label}: 글자 크기를 8~72 사이의 0.5 단위로 입력해 주세요.`;
          error.hidden = false; size.setAttribute('aria-invalid', 'true'); size.focus(); size.select();
          return false;
        }
      }
      return true;
    };
    const apply = async selectedRows => {
      if (busy || !validate(selectedRows)) return;
      const settings = selectedRows.map(readSetting);
      busy = true; updateButtons();
      let applied = false;
      try {
        if (!this.applyColumnFontSettings(settings)) {
          error.textContent = '입력값을 확인해 주세요. 크기·굵기·색을 올바르게 설정해야 합니다.';
          error.hidden = false;
          return;
        }
        applied = true;
        for (const row of selectedRows) {
          row.dataset.applied = 'true'; row.classList.remove('is-modified');
          row.querySelector('[data-apply-column]').textContent = '적용됨';
        }
        showStatus('이 기기에 저장했습니다. 동기화 상태를 확인 중입니다.');
        const synced = this.supabaseClient ? await this.syncSharedColumnFormatting() : false;
        const scope = selectedRows.length === rows.length ? '전체 열' : baseline.find(setting => setting.key === settings[0].key).label;
        showStatus(synced ? `${scope} 적용 · 모든 기기에 동기화 완료` : `${scope} 적용 · 이 기기에 저장됨. 연결되면 다른 기기에 동기화됩니다.`, synced ? 'success' : 'info');
      } catch {
        if (applied) showStatus('이 기기에 저장되었습니다. 클라우드 연결 후 동기화됩니다.');
        else { error.textContent = '적용하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.'; error.hidden = false; }
      } finally {
        busy = false; updateButtons();
      }
    };
    for (const setting of baseline) {
      const row = document.createElement("tr");
      row.dataset.key = setting.key;
      const [letter, label] = setting.label.split('열 · ');
      row.innerHTML = `<th scope="row"><span class="column-font-letter">${letter}</span>${label}</th><td><input type="number" min="8" max="72" step="0.5" required data-property="fontSize" aria-label="${setting.label} 글자 크기" aria-describedby="columnFontSettingsError"></td>
        <td><select data-property="fontWeight" aria-label="${setting.label} 글자 굵기">${[[400,"보통"],[500,"중간"],[600,"약간 굵게"],[700,"굵게"],[800,"더 굵게"],[900,"가장 굵게"]].map(([value,label]) => `<option value="${value}">${label}</option>`).join("")}</select></td>
        <td><input type="color" data-property="color" aria-label="${setting.label} 글자색"></td><td><span class="column-font-preview" aria-hidden="true">가Aa</span></td><td><button type="button" data-apply-column aria-label="${setting.label}만 적용 및 저장">적용</button></td>`;
      for (const property of ["fontSize", "fontWeight", "color"]) row.querySelector(`[data-property="${property}"]`).value = property === 'color' ? this.toColorPickerValue(setting.color) : setting[property];
      const preview = () => {
        const value = readSetting(row), sample = row.querySelector('.column-font-preview');
        sample.style.fontSize = `${value.fontSize >= 8 && value.fontSize <= 72 ? value.fontSize : setting.fontSize}px`;
        sample.style.fontWeight = value.fontWeight; sample.style.color = value.color;
        sample.title = `${value.fontSize}px · ${value.fontWeight} · ${value.color}`;
      };
      const changed = event => {
        if (!event.target.matches('input, select')) return;
        row.dataset.applied = 'false'; row.classList.add('is-modified');
        row.querySelector('[data-apply-column]').textContent = '적용';
        event.target.removeAttribute('aria-invalid'); error.hidden = true;
        preview(); updateButtons(); showStatus('수정 중 · 적용 버튼을 누르면 저장됩니다.');
      };
      row.addEventListener('input', changed); row.addEventListener('change', changed);
      row.querySelector('[data-apply-column]').addEventListener('click', () => { void apply([row]); });
      preview(); rows.push(row); tbody.appendChild(row);
    }
    const close = () => {
      overlay.remove();
      const target = previousFocus?.isConnected && previousFocus.getClientRects().length ? previousFocus : document.getElementById('btnColumnFontSettings');
      if (target?.getClientRects().length) target.focus({ preventScroll: true });
      else this.elSheetContainer?.focus({ preventScroll: true });
    };
    overlay.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (this.handleColumnFontSettingsEnter(event)) return;
      if (event.key === 'Tab') {
        const controls = [...overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter(control => control.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    overlay.querySelector('form').addEventListener('submit', event => { event.preventDefault(); void apply(rows); });
    document.body.appendChild(overlay); overlay.style.display = 'flex';
    const first = overlay.querySelector('input'); first.focus(); first.select();
  }

  applyColumnFontSettings(settings) {
    const columns = this.getColumnFontSettings();
    if (!settings.length || new Set(settings.map(setting => setting.key)).size !== settings.length ||
        settings.some(setting => !columns.some(column => column.key === setting.key) ||
          !Number.isInteger(setting.fontSize * 2) || setting.fontSize < 8 || setting.fontSize > 72 ||
          ![400,500,600,700,800,900].includes(Number(setting.fontWeight)) || !/^#[0-9a-f]{6}$/i.test(setting.color))) return false;
    for (const setting of settings) {
      const index = columns.findIndex(column => column.key === setting.key);
      for (const property of ['fontSize','fontWeight','color']) {
        this.setColumnFormatting({minCol:index,maxCol:index}, property,
          property === 'fontWeight' ? String(setting[property]) : setting[property], true);
      }
    }
    this.renderTable();
    this.showSaveIndicator(this.supabaseClient ? '열 설정 적용됨 · 동기화 중' : '열 설정 적용 및 기기 저장 완료');
    return true;
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
    for (const property of ["color", "fontSize", "fontWeight", "backgroundColor"]) {
      const value = this.getCellFormatting(row, key, property);
      if (property === "backgroundColor") {
        if (value != null || element.style.backgroundColor) {
          if (element.style.setProperty) element.style.setProperty("background-color", value || "", value ? "important" : "");
          else element.style.backgroundColor = value || "";
        }
      } else element.style[property] = value == null ? "" : property === "fontSize" ? value + "px" : value;
    }
  }

  captureCellFormatting(row, key, element = null) {
    const computed = element && typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
    const formatting = {};
    for (const property of ["color", "fontSize", "fontWeight", "backgroundColor"]) {
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
    for (const property of ["color", "fontSize", "fontWeight", "backgroundColor"]) {
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
    if (!range || !["fontSize", "fontWeight", "backgroundColor"].includes(property)) return;
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
