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

  getFormattingRange() {
    if (this.crossDateSelection) return null;
    if (this.selectedRange) return { ...this.selectedRange };
    if (!this.activeCell) return null;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const col = keys.indexOf(this.activeCell.colKey);
    return { minRow: this.activeCell.rowIdx, maxRow: this.activeCell.rowIdx, minCol: col, maxCol: col };
  }

  getFormattingStatus(property) {
    if (typeof document !== 'undefined' && ['fontSize', 'fontWeight', 'highlight'].includes(property)) {
      const input = document.activeElement;
      if (this.activeCell && input?.matches?.('.cell-input-element:not(.is-armed)') && input.selectionStart !== input.selectionEnd) {
        const {rowIdx, colKey} = this.activeCell;
        const row = this.getCurrentRows()[rowIdx];
        const rich = this.getEffectiveCellRichText(row, colKey);
        const fallback = this.getCellFormatting(row, colKey, property) ?? getComputedStyle(input)[property];
        const values = new Set(Array.from({length: input.selectionEnd - input.selectionStart}, (_, i) =>
          rich?.styles?.[input.selectionStart + i]?.[property] ?? fallback));
        const value = values.size === 1 ? [...values][0] : null;
        return { value, label: values.size === 1 ? String(value ?? '없음') : '여러 값' };
      }
    }
    const range = this.getFormattingRange();
    if (!range) return { label: "선택 없음", value: null };
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const values = new Set();
    for (let r = range.minRow; r <= range.maxRow; r++) for (let c = range.minCol; c <= range.maxCol; c++) {
      if (!this.isSelectedCoordinate(r, c)) continue;
      const cell = this.elTableBody.querySelector(`[data-row="${r}"][data-col="${keys[c]}"]`);
      if (cell && property === 'highlight') {
        const row = this.getCurrentRows()[r] || {};
        const rich = this.getEffectiveCellRichText(row, keys[c]);
        const text = String(row[keys[c]] ?? '');
        if (!text.length) values.add(null);
        for (let i = 0; i < text.length; i++) values.add(rich?.text === text ? rich.styles?.[i]?.highlight || null : null);
      } else if (cell) values.add(property === "backgroundColor"
        ? this.getCellFormatting(this.getCurrentRows()[r] || {}, keys[c], property) || "#ffffff"
        : getComputedStyle(cell)[property]);
    }
    if (values.size !== 1) return { label: "여러 값", value: null };
    const value = [...values][0];
    const weights = { 400: "보통", 500: "중간", 600: "약간 굵게", 700: "굵게", 800: "매우 굵게" };
    let label = property === "fontWeight" ? (weights[value] || value) : value;
    if (property === "color" || property === "backgroundColor" || property === "highlight") {
      label = this.normalizeColumnColor(value) || value || "없음";
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
    const rich = row._richText?.[key];
    if (!rich) return undefined;
    const stale = ['color', 'fontSize', 'fontWeight'].filter(property => !this.isCellFormattingCurrent(row, key, property));
    if (!stale.length) return rich;
    // Character formatting follows the same per-property column revisions as
    // whole cells. Resetting weight must not revive or erase another property.
    const effective = { ...rich };
    if (stale.includes('color')) effective.colors = (rich.colors || []).map(() => null);
    if (rich.styles) effective.styles = rich.styles.map(style => {
      if (!style) return null;
      const next = { ...style };
      for (const property of stale) delete next[property];
      return Object.keys(next).length ? next : null;
    });
    return effective.colors?.some(Boolean) || effective.styles?.some(Boolean) ? effective : undefined;
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
          // Preserve the fill beneath translucent interaction tints.
          if (element.style.setProperty) element.style.setProperty("background-color", value || "", "");
          else element.style.backgroundColor = value || "";
        }
      } else if (property !== "textAlign") element.style[property] = value == null ? "" : property === "fontSize" ? value + "px" : value;
    }
    if (element.dataset) {
      const fill = this.getCellFormatting(row, key, 'backgroundColor');
      if (fill) { element.dataset.hasFill = 'true'; element.style.setProperty('--cell-fill', fill); }
      else { delete element.dataset.hasFill; element.style.removeProperty?.('--cell-fill'); }
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
      element.style.paddingRight = alignment === 'right' ? '20px' : alignment ? '6px' : '';
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
    if (["fontSize", "fontWeight"].includes(property) && this.applySelectedTextStyle(property, value)) return;
    const range = this.getFormattingRange();
    if (!range || !["fontSize", "fontWeight", "backgroundColor", "textAlign"].includes(property)) return;
    const columns = this.getSelectedFormattingColumns();
    if (this.isEditingCell()) document.activeElement.blur();
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    if (columns) {
      // Every explicit header apply replaces older overrides, even when the
      // chosen value is unchanged. Later cell edits stamp this new revision.
      this.setColumnFormatting(columns, property, value, true);
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
      const rich = row._richText?.[keys[col]];
      if (rich?.styles && ['fontSize', 'fontWeight'].includes(property)) {
        rich.styles = rich.styles.map(style => {
          if (!style) return null;
          const next = {...style}; delete next[property];
          return Object.keys(next).length ? next : null;
        });
      }
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

  positionFormattingPopup(popup, anchor) {
    if (!popup) return;
    const resolvedAnchor = anchor || this.contextTarget?.cellElement ||
      (this.activeCell ? (this.elTableBody || this.elSheetContainer)?.querySelector(`[data-row="${this.activeCell.rowIdx}"][data-col="${this.activeCell.colKey}"]`) : null) ||
      this.elContextMenu ||
      document.body;

    if (!resolvedAnchor?.getBoundingClientRect) return;

    const rect = resolvedAnchor.getBoundingClientRect();
    const isToolbarButton = resolvedAnchor.classList?.contains?.('history-button') ||
      resolvedAnchor.classList?.contains?.('tool-btn') ||
      Boolean(resolvedAnchor.id && resolvedAnchor.id.startsWith('btn'));

    const margin = 8;
    const gap = 4;
    const menuWidth = popup.offsetWidth || 286;
    const menuHeight = popup.offsetHeight || 320;

    let left = rect.left;
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - menuWidth - margin;
    }
    left = Math.max(margin, left);

    let top = 0;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    if (isToolbarButton) {
      top = rect.bottom + gap;
      if (top + menuHeight > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - menuHeight - margin);
      }
    } else {
      if (spaceBelow >= menuHeight + gap || spaceBelow >= spaceAbove) {
        top = rect.bottom + gap;
        if (top + menuHeight > window.innerHeight - margin) {
          top = Math.max(margin, window.innerHeight - menuHeight - margin);
        }
      } else {
        top = rect.top - menuHeight - gap;
        if (top < margin) {
          top = margin;
        }
      }
    }

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;

    if (menuHeight > window.innerHeight - margin * 2) {
      popup.style.maxHeight = `${window.innerHeight - margin * 2}px`;
      popup.style.overflowY = 'auto';
    }
  }

  prepareFormattingMenu(property, anchor) {
    const popup = document.getElementById('fontColorMenu') || document.getElementById('columnTypographyMenu');
    const repeated = Boolean(anchor && popup?._formatAnchor === anchor && popup?._formatProperty === property);
    this.closeFontColorMenu();
    this.typographyCleanup?.(); this.typographyCleanup = null;
    document.getElementById('columnTypographyMenu')?.remove();
    return !repeated;
  }

  openAlignmentMenu(anchor) {
    if (!this.prepareFormattingMenu('textAlign', anchor)) return;
    if (!this.getFormattingRange()) return;
    this.typographyCleanup?.(); document.getElementById('columnTypographyMenu')?.remove();
    const originalFocus = document.activeElement;
    const nativeEditor = originalFocus?.matches?.('.cell-input-element') ? originalFocus : null;
    const popup = document.createElement('div');
    popup.id = 'columnTypographyMenu'; popup.className = 'column-typography-menu alignment-menu';
    popup._formatAnchor = anchor; popup._formatProperty = 'textAlign';
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
    const positionMenu = () => {
      if (!popup.isConnected) return;
      this.positionFormattingPopup(popup, anchor);
    };
    positionMenu();
    const outside = event => { if (!popup.contains(event.target) && !anchor?.contains?.(event.target)) close(); };
    const scrollListener = event => { if (!popup.contains(event.target)) positionMenu(); };
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
    window.addEventListener('resize', positionMenu);
    document.addEventListener('scroll', scrollListener, true);
    this.typographyCleanup = () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', positionMenu);
      document.removeEventListener('scroll', scrollListener, true);
    };
    if (!nativeEditor) (popup.querySelector('.is-current') || popup.querySelector('button')).focus();
  }

  transformEnglishCase(text, caseType) {
    if (typeof text !== 'string' || !text) return text || '';
    switch (caseType) {
      case 'sentence': {
        let isNewSentence = true;
        let res = '';
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (/[a-zA-Z]/.test(ch)) {
            if (isNewSentence) {
              res += ch.toUpperCase();
              isNewSentence = false;
            } else {
              res += ch.toLowerCase();
            }
          } else {
            res += ch;
            if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
              isNewSentence = true;
            }
          }
        }
        return res;
      }
      case 'firstWord': {
        let foundFirst = false;
        let res = '';
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (/[a-zA-Z]/.test(ch)) {
            if (!foundFirst) {
              res += ch.toUpperCase();
              foundFirst = true;
            } else {
              res += ch.toLowerCase();
            }
          } else {
            res += ch;
          }
        }
        return res;
      }
      case 'lowercase':
        return text.replace(/[a-zA-Z]/g, ch => ch.toLowerCase());
      case 'firstWordUppercase':
      case 'lastWordUppercase': {
        // These menu labels mean the first/last English word: Acute pain →
        // ACUTE pain / Acute PAIN. Preserve the case of every other word.
        // Slash/hyphen abbreviations belong to the same space-delimited word:
        // l/t 12kg → L/T 12kg, without uppercasing the following unit.
        const words = [...text.matchAll(/\S+/g)].filter(match => /[a-zA-Z]/.test(match[0]));
        const word = caseType === 'firstWordUppercase' ? words[0] : words.at(-1);
        if (!word) return text;
        return text.slice(0, word.index) + word[0].replace(/[a-z]/g, char => char.toUpperCase()) + text.slice(word.index + word[0].length);
      }
      case 'uppercase':
        return text.replace(/[a-zA-Z]/g, ch => ch.toUpperCase());
      case 'capitalize': {
        let isNewWord = true;
        let res = '';
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (/[a-zA-Z]/.test(ch)) {
            if (isNewWord) {
              res += ch.toUpperCase();
              isNewWord = false;
            } else {
              res += ch.toLowerCase();
            }
          } else {
            res += ch;
            isNewWord = true;
          }
        }
        return res;
      }
      case 'toggle':
        return text.replace(/[a-zA-Z]/g, ch => {
          const upper = ch.toUpperCase();
          return ch === upper ? ch.toLowerCase() : upper;
        });
      default:
        return text;
    }
  }

  applyChangeCase(caseType) {
    const rows = this.getCurrentRows();
    const selected = this.textColorSelection;
    const activeEditor = (typeof document !== 'undefined' && document.activeElement?.matches?.('.cell-input-element:not(.is-armed)'))
      ? document.activeElement : null;

    // Case 1: Partial text selection in inline editor
    if (selected && rows[selected.rowIdx]) {
      const row = rows[selected.rowIdx];
      const colKey = selected.colKey;
      const fullText = String(row[colKey] ?? '');
      const start = Math.max(0, Math.min(selected.start, fullText.length));
      const end = Math.max(start, Math.min(selected.end, fullText.length));
      const targetChunk = fullText.slice(start, end);
      const transformed = this.transformEnglishCase(targetChunk, caseType);
      const nextFullText = fullText.slice(0, start) + transformed + fullText.slice(end);

      this.captureHistory?.();
      row[colKey] = nextFullText;
      if (row._richText?.[colKey] && row._richText[colKey].text === fullText) {
        row._richText[colKey].text = nextFullText;
      }
      this.captureHistory?.();
      this.saveDataStore?.(false);

      if (activeEditor && activeEditor.isConnected) {
        activeEditor.value = nextFullText;
        activeEditor.focus({ preventScroll: true });
        activeEditor.setSelectionRange(start, start + transformed.length);
        activeEditor.refreshEditorColors?.();
      } else {
        this.renderTable?.();
      }
      if (this.elFormulaInput && this.activeCell?.rowIdx === selected.rowIdx && this.activeCell?.colKey === colKey) {
        this.elFormulaInput.value = nextFullText;
      }
      this.textColorSelection = null;
      return true;
    }

    // Case 2: Full cell inline editing
    if (activeEditor && this.activeCell && rows[this.activeCell.rowIdx]) {
      const { rowIdx, colKey } = this.activeCell;
      const row = rows[rowIdx];
      const fullText = String(activeEditor.value ?? row[colKey] ?? '');
      const transformed = this.transformEnglishCase(fullText, caseType);
      const cursorStart = activeEditor.selectionStart ?? transformed.length;
      const cursorEnd = activeEditor.selectionEnd ?? transformed.length;

      this.captureHistory?.();
      row[colKey] = transformed;
      if (row._richText?.[colKey] && row._richText[colKey].text === fullText) {
        row._richText[colKey].text = transformed;
      }
      this.captureHistory?.();
      this.saveDataStore?.(false);

      activeEditor.value = transformed;
      activeEditor.focus({ preventScroll: true });
      activeEditor.setSelectionRange(cursorStart, cursorEnd);
      activeEditor.refreshEditorColors?.();
      if (this.elFormulaInput) {
        this.elFormulaInput.value = transformed;
      }
      return true;
    }

    // Case 3: Cell grid selection (range selection)
    const range = this.getFormattingRange?.();
    const keys = ['no', 'gender', 'chartNo', 'name', 'part', 'prescription', 'extra', 'writer', 'memo', 'specialNote', 'visitTime'];
    let modified = false;

    if (range) {
      this.captureHistory?.();
      for (let r = range.minRow; r <= range.maxRow; r++) {
        const row = rows[r];
        if (!row) continue;
        for (let c = range.minCol; c <= range.maxCol; c++) {
          if (!this.isSelectedCoordinate(r, c)) continue;
          const key = keys[c];
          if (!key || key === 'no' || key === 'visitTime') continue;
          const fullText = String(row[key] ?? '');
          if (!/[a-zA-Z]/.test(fullText)) continue;
          const transformed = this.transformEnglishCase(fullText, caseType);
          if (transformed !== fullText) {
            row[key] = transformed;
            if (row._richText?.[key] && row._richText[key].text === fullText) {
              row._richText[key].text = transformed;
            }
            modified = true;
          }
        }
      }
      if (modified) {
        this.captureHistory?.();
        this.saveDataStore?.(false);
        this.renderTable?.();
        return true;
      }
    }

    // Fallback: activeCell or specialNote
    if (this.activeCell && rows[this.activeCell.rowIdx]) {
      const { rowIdx, colKey } = this.activeCell;
      const row = rows[rowIdx];
      const fullText = String(row[colKey] ?? '');
      if (/[a-zA-Z]/.test(fullText)) {
        this.captureHistory?.();
        const transformed = this.transformEnglishCase(fullText, caseType);
        row[colKey] = transformed;
        if (row._richText?.[colKey] && row._richText[colKey].text === fullText) {
          row._richText[colKey].text = transformed;
        }
        this.captureHistory?.();
        this.saveDataStore?.(false);
        this.renderTable?.();
        return true;
      }
    }

    return false;
  }

  getChangeCaseOptions() {
    return [
      { key: 'sentence', label: '문장의 첫 글자를 대문자로' },
      { key: 'uppercase', label: '대문자로' },
      { key: 'capitalize', label: '각 단어를 대문자로' },
      { key: 'firstWordUppercase', label: '첫 문장을 대문자로' },
      { key: 'lastWordUppercase', label: '마지막 문장을 대문자로' },
      { key: 'firstWord', label: '앞단어만 대문자로' },
      { key: 'lowercase', label: '소문자로' },
      { key: 'toggle', label: '대/소문자 전환' }
    ];
  }

  openChangeCaseMenu(anchor) {
    this.captureTextColorSelection();
    if (!this.prepareFormattingMenu('changeCase', anchor)) return;
    this.typographyCleanup?.();
    document.getElementById('columnTypographyMenu')?.remove();

    const originalFocus = document.activeElement;
    const nativeEditor = originalFocus?.matches?.('.cell-input-element:not(.is-armed)') ? originalFocus : null;

    const popup = document.createElement('div');
    popup.id = 'columnTypographyMenu';
    popup.className = 'column-typography-menu change-case-menu';
    popup._formatAnchor = anchor;
    popup._formatProperty = 'changeCase';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', '대/소문자 바꾸기');

    const options = this.getChangeCaseOptions();

    const close = () => {
      popup.remove();
      this.typographyCleanup?.();
      this.typographyCleanup = null;
    };

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'change-case-option';
      btn.dataset.caseType = opt.key;
      btn.textContent = opt.label;
      btn.onmousedown = event => {
        event.preventDefault();
        event.stopPropagation();
      };
      btn.onclick = () => {
        this.applyChangeCase(opt.key);
        close();
        if (nativeEditor?.isConnected) {
          nativeEditor.focus({ preventScroll: true });
        } else if (anchor) {
          anchor.focus();
        }
      };
      popup.append(btn);
    });

    popup.onmousedown = event => event.preventDefault();
    document.body.append(popup);

    const positionMenu = () => {
      if (!popup.isConnected) return;
      this.positionFormattingPopup(popup, anchor);
    };
    positionMenu();

    const outside = event => {
      if (!popup.contains(event.target) && !anchor?.contains?.(event.target)) close();
    };
    const scrollListener = event => {
      if (!popup.contains(event.target)) positionMenu();
    };

    popup.onkeydown = event => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        (nativeEditor?.isConnected ? nativeEditor : anchor)?.focus?.({ preventScroll: true });
        return;
      }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...popup.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        const nextIndex = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[nextIndex]?.focus();
      }
    };

    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', positionMenu);
    document.addEventListener('scroll', scrollListener, true);
    this.typographyCleanup = () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', positionMenu);
      document.removeEventListener('scroll', scrollListener, true);
    };

    const initial = popup.querySelector('.is-current') || popup.querySelector('button');
    if (!nativeEditor) initial?.focus();
  }

  openColumnTypographyMenu(property, anchor = null) {
    if (!this.prepareFormattingMenu(property, anchor)) return;
    if (!this.getFormattingRange()) return;
    const status = this.getFormattingStatus(property);
    this.typographyCleanup?.(); document.getElementById("columnTypographyMenu")?.remove();
    const popup = document.createElement("div"); popup.id = "columnTypographyMenu"; popup.className = "column-typography-menu";
    popup._formatAnchor = anchor; popup._formatProperty = property;
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
      button.onclick = () => {
        this.applyColumnTypography(property, value); close();
        if (!document.activeElement?.matches?.('.cell-input-element:not(.is-armed)')) this.elSheetContainer.focus();
      };
      popup.append(button);
    }
    popup.onmousedown = event => event.preventDefault(); document.body.append(popup);
    const positionMenu = () => {
      if (!popup.isConnected) return;
      this.positionFormattingPopup(popup, anchor);
    };
    positionMenu();
    const outside = event => { if (!popup.contains(event.target) && !anchor?.contains?.(event.target)) close(); };
    const escape = event => { event.stopPropagation(); if (event.key === "Escape") { close(); this.elSheetContainer.focus(); } };
    const scrollListener = event => { if (!popup.contains(event.target)) positionMenu(); };
    document.addEventListener("mousedown", outside); popup.addEventListener("keydown", escape);
    window.addEventListener("resize", positionMenu);
    document.addEventListener("scroll", scrollListener, true);
    this.typographyCleanup = () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("resize", positionMenu);
      document.removeEventListener("scroll", scrollListener, true);
    };
    const initial = popup.querySelector(".is-current") || popup.querySelector("button");
    if (!document.activeElement?.matches?.('.cell-input-element:not(.is-armed)')) initial.focus();
    initial.scrollIntoView({ block: "nearest" });
  }

  captureTextColorSelection() {
    this.textColorSelection = null;
    let input = document.activeElement;
    if (!input?.matches?.(".cell-input-element:not(.is-armed)") && this.activeCell) {
      input = this.elTableBody?.querySelector(`[data-row="${this.activeCell.rowIdx}"][data-col="${this.activeCell.colKey}"] input:not(.is-armed)`);
    }
    if (!this.activeCell || !input?.matches?.(".cell-input-element:not(.is-armed)") || input.selectionStart === input.selectionEnd) return;
    const start = Math.min(input.selectionStart, input.selectionEnd);
    const end = Math.max(input.selectionStart, input.selectionEnd);
    const rows = this.getCurrentRows();
    if (rows[this.activeCell.rowIdx]) rows[this.activeCell.rowIdx][this.activeCell.colKey] = input.value;
    this.textColorSelection = { ...this.activeCell, text: input.value, start, end };
  }

  handleTextFormattingShortcut(event) {
    if (this.usesNativeCellInput() && this.isHangulToggleKeyEvent(event)) return false;
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.isComposing || event.keyCode === 229) return false;
    const red = event.code === 'Space' || event.key === ' ';
    const bold = event.code === 'KeyB' || event.key?.toLowerCase() === 'b';
    const highlight = event.code === 'KeyE' || event.key?.toLowerCase() === 'e';
    if ((!red && !bold && !highlight) || this.crossDateSelection || !this.getFormattingRange()) return false;
    const target = event.target;
    if (!target?.matches?.('.cell-input-element') && target !== this.elSheetContainer && !this.elSheetContainer?.contains?.(target)) return false;
    if (target?.matches?.('input, textarea, [contenteditable="true"]') && !target.matches('.cell-input-element')) return false;
    event.preventDefault(); event.stopPropagation();
    if (event.repeat) return true;
    this.captureTextColorSelection();
    const property = red ? 'color' : highlight ? 'highlight' : 'fontWeight';
    const value = red ? '#ff0000' : highlight ? '#ffff00' : 600;
    const reset = this.isShortcutFormattingApplied(property, value);
    if (red) this.applyTextColor(reset ? null : value);
    else if (highlight) this.applyTextHighlight(reset ? null : value);
    else this.applyColumnTypography(property, reset ? null : value);
    return true;
  }

  isShortcutFormattingApplied(property, value) {
    const rows = this.getCurrentRows();
    const matches = current => ['color', 'highlight'].includes(property)
      ? this.normalizeColumnColor(current) === value : Number(current) === value;
    const selected = this.textColorSelection;
    const cellMatches = (row, key, start = 0, end = String(row?.[key] ?? '').length) => {
      if (!row) return false;
      // Reset the local override, leaving column defaults and unrelated styles intact.
      const local = this.isCellFormattingCurrent(row, key, property)
        ? property === 'color' ? row._textColors?.[key] : row._textStyles?.[key]?.[property] : null;
      const rich = this.getEffectiveCellRichText(row, key);
      if (start === end) return matches(local);
      for (let i = start; i < end; i++) {
        const current = rich?.text === String(row[key] ?? '')
          ? property === 'color' ? rich.colors?.[i] : rich.styles?.[i]?.[property] : null;
        if (!matches(current ?? local)) return false;
      }
      return true;
    };
    if (selected) return cellMatches(rows[selected.rowIdx], selected.colKey, selected.start, selected.end);
    const range = this.getFormattingRange();
    if (!range) return false;
    const keys = ['no','gender','chartNo','name','part','prescription','extra','writer','memo','specialNote','visitTime'];
    let found = false;
    for (let r = range.minRow; r <= range.maxRow; r++) for (let c = range.minCol; c <= range.maxCol; c++) {
      if (!this.isSelectedCoordinate(r, c)) continue;
      if (property === 'highlight' && !String(rows[r]?.[keys[c]] ?? '').length) continue;
      found = true;
      if (!cellMatches(rows[r], keys[c])) return false;
    }
    return found;
  }

  // Character metadata shares the existing rich-text snapshot, clipboard and sync path.
  setPartialTextStyle(row, key, start, end, property, value) {
    const text = String(row[key] ?? '');
    const previous = this.getEffectiveCellRichText(row, key);
    if (!this.isCellFormattingCurrent(row, key, 'color')) {
      row._textColors ||= {}; row._textColors[key] = this.getCellFormatting(row, key, 'color');
    }
    if (['fontSize', 'fontWeight'].includes(property) && !this.isCellFormattingCurrent(row, key, property)) {
      const base = this.getCellFormatting(row, key, property);
      row._textStyles ||= {}; row._textStyles[key] ||= {};
      if (base == null) delete row._textStyles[key][property];
      else row._textStyles[key][property] = base;
    }
    const rich = previous?.text === text ? JSON.parse(JSON.stringify(previous))
      : { text, colors: Array(text.length).fill(null) };
    rich.styles ||= Array(text.length).fill(null);
    for (let i = Math.max(0, start); i < Math.min(text.length, end); i++) {
      const style = { ...rich.styles[i] };
      if (value == null) delete style[property]; else style[property] = value;
      rich.styles[i] = Object.keys(style).length ? style : null;
    }
    row._richText ||= {}; row._richText[key] = rich;
    this.markCellFormatting(row, key, 'color');
    this.markCellFormatting(row, key, property);
  }

  applySelectedTextStyle(property, value) {
    if (typeof document === 'undefined') return false;
    let input = document.activeElement;
    if (!input?.matches?.('.cell-input-element:not(.is-armed)') && this.activeCell) {
      input = this.elTableBody?.querySelector(`[data-row="${this.activeCell.rowIdx}"][data-col="${this.activeCell.colKey}"] input:not(.is-armed)`);
    }
    const selection = this.textColorSelection;
    const live = this.activeCell && input?.matches?.('.cell-input-element:not(.is-armed)')
      && input.selectionStart !== input.selectionEnd
      ? { ...this.activeCell, text: input.value, start: Math.min(input.selectionStart, input.selectionEnd), end: Math.max(input.selectionStart, input.selectionEnd) } : null;
    const target = live || selection;
    this.textColorSelection = null;
    if (!target || this.crossDateSelection || this.activeCell?.rowIdx !== target.rowIdx || this.activeCell?.colKey !== target.colKey) return false;
    const row = this.getCurrentRows()[target.rowIdx];
    if (!row) return false;
    if (String(row[target.colKey] ?? '') !== target.text) {
      row[target.colKey] = target.text;
    }
    this.captureHistory?.();
    if (property === 'color') {
      this.setPartialTextColor(row, target.colKey, target.start, target.end, value);
      this.markCellFormatting(row, target.colKey, 'color');
    } else this.setPartialTextStyle(row, target.colKey, target.start, target.end, property, value);
    this.captureHistory?.(); this.saveDataStore(false);
    if (input?.matches?.('.cell-input-element:not(.is-armed)') && input.isConnected) {
      this.clearInlineAutocompletePreview?.();
      input.refreshEditorColors?.();
      input.focus({preventScroll: true}); input.setSelectionRange(target.start, target.end);
    } else this.renderTable();
    return true;
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
    row._richText[key] = { ...(previous?.text === text ? previous : {}), text, colors };
  }

  renderColoredText(element, row, key) {
    const text = key === "visitTime" ? this.getVisitTime(row) : String(row[key] ?? "");
    // Imported non-breaking/full-width spaces can look like a missed alignment.
    // Normalize the display origin only; retain the saved value and color offsets.
    const offset = !element.classList?.contains('inline-editor-color-preview') &&
      this.getCellFormatting(row, key, 'textAlign') === 'left'
      ? text.length - text.trimStart().length : 0;
    const rich = this.getEffectiveCellRichText(row, key);
    element.textContent = "";
    if (rich?.text !== text || !Array.isArray(rich.colors)) {
      element.textContent = text.slice(offset);
      if (key === "visitTime") this.appendVisitTimeRefresh(element, row);
      return;
    }
    let start = offset;
    while (start < text.length) {
      const color = rich.colors[start];
      let end = start + 1;
      const style = rich.styles?.[start];
      while (end < text.length && rich.colors[end] === color && JSON.stringify(rich.styles?.[end]) === JSON.stringify(style)) end++;
      const span = document.createElement("span"); span.textContent = text.slice(start, end);
      if (color) span.style.color = color;
      if (style?.fontSize != null) span.style.fontSize = `${style.fontSize}px`;
      if (style?.fontWeight != null) span.style.fontWeight = style.fontWeight;
      if (style?.highlight) span.style.backgroundColor = style.highlight;
      if (style?.underline) this.paintUnderline(span, style.underline, this.getCellFormatting(row, key, 'color'));
      element.append(span); start = end;
    }
    if (key === "visitTime") this.appendVisitTimeRefresh(element, row);
  }

  applyTextColor(color) {
    if (this.crossDateSelection) return;
    if (this.applySelectedTextStyle('color', color)) {
      this.updateFontColorIndicator(color); this.closeFontColorMenu(); return;
    }
    const columns = this.getSelectedFormattingColumns();
    if (columns) {
      this.textColorSelection = null;
      this.setColumnFormatting(columns, "color", color, true);
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
      if (rows[r]._richText?.[keys[c]]) {
        const rich = rows[r]._richText[keys[c]];
        if (rich.styles?.some(Boolean)) rich.colors = Array(String(rows[r][keys[c]] ?? '').length).fill(null);
        else delete rows[r]._richText[keys[c]];
      }
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

  getUnderlineOptions() {
    return [['single', '밑줄'], ['double', '밑줄 이중'], ['solid', '밑줄 가는 점선'],
      ['doubleSolid', '밑줄 굵은 점선'], ['wavy', '물결 선'], ['doubleWavy', '물결 이중선']];
  }

  getUnderlineThickness(value) {
    const fallback = value?.style === 'doubleSolid' ? 2 : 1;
    const thickness = Number(value?.thickness);
    return Number.isFinite(thickness) && thickness > 0 ? Math.max(0.5, Math.min(4, thickness)) : fallback;
  }

  paintUnderline(element, value, textColor = '#000000') {
    if (!value || !this.getUnderlineOptions().some(([style]) => style === value.style)) return;
    const color = value.color || textColor || '#000000';
    element.style.textDecorationLine = 'underline';
    element.style.textDecorationColor = color;
    element.style.textUnderlineOffset = '0.16em';
    element.style.textDecorationSkipInk = 'none';
    const thickness = this.getUnderlineThickness(value);
    element.style.textDecorationThickness = `${thickness}px`;
    element.style.textDecorationStyle = ['solid', 'doubleSolid'].includes(value.style) ? 'dotted'
      : value.style === 'wavy' ? 'wavy' : 'solid';
    if (['double', 'doubleWavy'].includes(value.style)) {
      // Draw both strokes explicitly: native double underlines can collapse
      // into one apparent line at small font sizes. Keep a clear 2px gap.
      const ink = this.normalizeColumnColor(value.color || textColor) || '#000000';
      const wave = value.style === 'doubleWavy';
      const y1 = thickness / 2 + (wave ? 1 : 0), y2 = y1 + thickness + (wave ? 3 : 2);
      const height = Math.ceil(y2 + thickness / 2 + (wave ? 1 : 0));
      const path = wave ? `M-2 ${y1}q2-2 4 0t4 0t4 0M-2 ${y2}q2-2 4 0t4 0t4 0`
        : `M0 ${y1}h8M0 ${y2}h8`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="${height}"><path d="${path}" fill="none" stroke="${ink}" stroke-width="${thickness}"/></svg>`;
      element.style.textDecorationLine = 'none';
      element.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
      element.style.backgroundRepeat = 'repeat-x';
      element.style.backgroundPosition = 'left bottom';
      element.style.backgroundSize = `8px ${height}px`;
      element.style.paddingBottom = `${height - 1}px`;
    }
  }

  getUnderlineTargets() {
    if (this.crossDateSelection) return [];
    const rows = this.getCurrentRows();
    const input = typeof document !== 'undefined' ? document.activeElement : null;
    const live = this.activeCell && input?.matches?.('.cell-input-element:not(.is-armed)') && input.selectionStart !== input.selectionEnd
      ? { ...this.activeCell, text: input.value, start: input.selectionStart, end: input.selectionEnd } : null;
    const selected = live || this.textColorSelection;
    if (selected && this.activeCell?.rowIdx === selected.rowIdx && this.activeCell?.colKey === selected.colKey &&
      String(rows[selected.rowIdx]?.[selected.colKey] ?? '') === selected.text) {
      return [{ row: rows[selected.rowIdx], key: selected.colKey, start: selected.start, end: selected.end }];
    }
    const range = this.getFormattingRange();
    if (!range) return [];
    const keys = ['no','gender','chartNo','name','part','prescription','extra','writer','memo','specialNote','visitTime'];
    const targets = [];
    for (let r = range.minRow; r <= range.maxRow; r++) for (let c = range.minCol; c <= range.maxCol; c++) {
      if (!rows[r] || !this.isSelectedCoordinate(r, c)) continue;
      const key = keys[c], end = String(rows[r][key] ?? '').length;
      if (end) targets.push({ row: rows[r], key, start: 0, end });
    }
    return targets;
  }

  underlineMatches(a, b) {
    return !!a && !!b && a.style === b.style && (a.color || null) === (b.color || null) &&
      this.getUnderlineThickness(a) === this.getUnderlineThickness(b);
  }

  getSelectedUnderline() {
    if (!this.activeCell && !this.selectedRange) return { value: null, hasUnderline: false };
    for (const { row, key, start, end } of this.getUnderlineTargets()) {
      const rich = this.getEffectiveCellRichText(row, key);
      for (let i = start; i < end; i++) {
        if (rich?.styles?.[i]?.underline) return { value: rich.styles[i].underline, hasUnderline: true };
      }
    }
    return { value: null, hasUnderline: false };
  }

  updateUnderlineIndicator() {
    if (typeof document === 'undefined') return;
    const button = document.getElementById?.('btnUnderline');
    if (!button) return;
    const selected = this.getSelectedUnderline();
    const value = this.underlineBrushStyle || selected.value || this.underlineChoice || { style: 'single', color: null };
    const label = this.getUnderlineOptions().find(([style]) => style === value.style)?.[1] || '밑줄';
    button.title = this.underlineBrushStyle ? `${label} 드래그 모드 · 다시 칠하면 해제 · Esc로 종료` : `${label} 적용/해제`;
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(!!this.underlineBrushStyle || selected.hasUnderline));
    const sample = button.querySelector?.('span');
    if (sample) {
      // Reset the previous preview before switching from an SVG double line
      // back to a native dotted/wavy/single underline.
      sample.style.cssText = '';
      const row = this.activeCell && this.getCurrentRows?.()[this.activeCell.rowIdx];
      const color = row ? this.getCellFormatting(row, this.activeCell.colKey, 'color') : '#484d4c';
      this.paintUnderline(sample, value, color);
    }
  }

  setUnderlineBrush(value) {
    const highlightColor = this.textHighlightColor;
    this.setHighlightBrush(value.color || '#333333');
    this.textHighlightColor = highlightColor;
    this.underlineBrushStyle = { ...value };
    this.elSheetContainer?.classList.add('is-underline-brush');
    const ink = value.color || '#333333';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="m3 17 12-12 4 4-12 12-5 1z" fill="white" stroke="#414149" stroke-width="1.5"/><path d="m3 17 4 4-5 1zM2 23h16" fill="${ink}" stroke="${ink}" stroke-width="1.5"/></svg>`;
    this.elSheetContainer?.style.setProperty('--highlight-brush-cursor', `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 22, crosshair`);
    this.updateTextHighlightIndicator(); this.updateUnderlineIndicator();
  }

  toggleUnderline(value = null, allowReset = true) {
    if (this.crossDateSelection) return;
    const mainButton = value === null;
    const selected = this.getSelectedUnderline();
    value ||= selected.value || this.underlineChoice || { style: 'single', color: null };
    this.underlineChoice = { ...value };
    const targets = this.getUnderlineTargets();
    if (!targets.length) {
      const range = this.getFormattingRange();
      if (!range || range.minRow !== range.maxRow || range.minCol !== range.maxCol) return;
      if (this.isEditingCell()) document.activeElement.blur();
      this.textColorSelection = null;
      this.setUnderlineBrush(value);
      return;
    }
    this.setHighlightBrush(null);
    const reset = allowReset && ((mainButton && selected.hasUnderline) || targets.every(({ row, key, start, end }) => {
      const rich = this.getEffectiveCellRichText(row, key);
      return Array.from({ length: end - start }, (_, i) => this.underlineMatches(rich?.styles?.[start + i]?.underline, value)).every(Boolean);
    }));
    if (this.applySelectedTextStyle('underline', reset ? null : value)) { this.updateUnderlineIndicator(); return; }
    if (this.isEditingCell()) document.activeElement.blur();
    this.captureHistory?.();
    for (const { row, key, start, end } of targets) this.setPartialTextStyle(row, key, start, end, 'underline', reset ? null : value);
    this.captureHistory?.(); this.saveDataStore(); this.renderTable(); this.updateUnderlineIndicator();
  }

  openUnderlineMenu(anchor) {
    if (!this.prepareFormattingMenu('underline', anchor)) return;
    const popup = document.createElement('div'); popup.id = 'columnTypographyMenu';
    popup.className = 'column-typography-menu underline-menu';
    popup._formatAnchor = anchor; popup._formatProperty = 'underline';
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', '밑줄 종류 및 색상');
    const heading = document.createElement('strong'); heading.textContent = '밑줄 종류 · 색상 · 굵기'; popup.append(heading);
    const note = document.createElement('small'); note.textContent = '기본: 글자색 · 빈 셀에서 선택하면 드래그 모드'; popup.append(note);
    const close = () => { popup.remove(); this.typographyCleanup?.(); this.typographyCleanup = null; };
    const choice = this.getSelectedUnderline().value || this.underlineChoice || { style: 'single', color: null };
    for (const [style, label] of this.getUnderlineOptions()) {
      const row = document.createElement('div'); row.className = 'underline-option';
      const button = document.createElement('button'); button.type = 'button'; button.dataset.underlineStyle = style;
      button.classList.toggle('is-current', choice.style === style);
      button.setAttribute('aria-pressed', String(choice.style === style));
      const sample = document.createElement('span'); sample.textContent = label;
      const color = choice.style === style ? choice.color : null;
      let thickness = this.getUnderlineThickness(choice.style === style ? choice : { style });
      this.paintUnderline(sample, { style, color, thickness }); button.append(sample);
      button.onclick = () => { this.toggleUnderline({ style, color, thickness }, false); close(); };
      const picker = document.createElement('input'); picker.type = 'color'; picker.value = color || '#000000';
      picker.className = 'underline-color'; picker.setAttribute('aria-label', `${label} 색상 선택`); picker.title = `${label} 색상 선택`;
      picker.onchange = () => { this.toggleUnderline({ style, color: picker.value, thickness }, false); close(); };
      const auto = document.createElement('button'); auto.type = 'button'; auto.className = 'underline-auto'; auto.textContent = '자동';
      auto.title = `${label}: 글자색과 같게`; auto.setAttribute('aria-label', auto.title);
      auto.onclick = () => { this.toggleUnderline({ style, color: null, thickness }, false); close(); };
      const weight = document.createElement('div'); weight.className = 'underline-thickness';
      const output = document.createElement('span'); output.textContent = `${thickness}px`; output.setAttribute('aria-live', 'polite');
      const steps = [];
      for (const [delta, symbol, action] of [[0.5, '▲', '늘리기'], [-0.5, '▼', '줄이기']]) {
        const step = document.createElement('button'); step.type = 'button'; step.textContent = symbol;
        step.setAttribute('aria-label', `${label} 굵기 ${action}`); step.title = `${label} 굵기 0.5px ${action}`;
        step.dataset.underlineThickness = String(delta); step.dataset.underlineKind = style;
        step.onclick = () => {
          thickness = Math.max(0.5, Math.min(4, thickness + delta));
          output.textContent = `${thickness}px`;
          this.paintUnderline(sample, { style, color, thickness });
          this.toggleUnderline({ style, color, thickness }, false);
          steps.forEach(([node, d]) => { node.disabled = d > 0 ? thickness >= 4 : thickness <= 0.5; });
          popup.querySelectorAll('[data-underline-style]').forEach(node => {
            node.classList.toggle('is-current', node.dataset.underlineStyle === style);
            node.setAttribute('aria-pressed', String(node.dataset.underlineStyle === style));
          });
        };
        step.disabled = delta > 0 ? thickness >= 4 : thickness <= 0.5;
        steps.push([step, delta]); weight.append(step);
      }
      weight.append(output);
      row.append(button, picker, weight, auto); popup.append(row);
    }
    popup.onmousedown = event => { if (!event.target.matches('input[type="color"]')) event.preventDefault(); };
    popup.onkeydown = event => { event.stopPropagation(); if (event.key === 'Escape') { close(); anchor.focus(); } };
    document.body.append(popup);
    const positionMenu = () => {
      if (!popup.isConnected) return;
      this.positionFormattingPopup(popup, anchor);
    };
    positionMenu();
    const outside = event => { if (!popup.contains(event.target) && !anchor?.contains?.(event.target)) close(); };
    const scrollListener = event => { if (!popup.contains(event.target)) positionMenu(); };
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', positionMenu);
    document.addEventListener('scroll', scrollListener, true);
    this.typographyCleanup = () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', positionMenu);
      document.removeEventListener('scroll', scrollListener, true);
    };
  }

  setHighlightBrush(color) {
    this.underlineBrushStyle = null;
    this.elSheetContainer?.classList.remove('is-underline-brush');
    this.updateUnderlineIndicator();
    this.cancelHighlightStroke?.();
    this.highlightBrushColor = color ? (this.normalizeColumnColor(color) || color) : null;
    if (color) this.textHighlightColor = this.highlightBrushColor;
    const sheet = this.elSheetContainer;
    sheet?.classList.toggle('is-highlight-brush', !!color);
    if (color) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 32 32"><g stroke="#202127" stroke-width="1.6" stroke-linejoin="round"><path fill="${this.highlightBrushColor}" d="M7 17 20 4q3-3 6 0l3 3q3 3 0 6L16 26z"/><path fill="#414149" d="m7 17 9 9q-1 2-3 1-2-1-3 1l-1 1q-1 1-2 0l-3-3q-1-1 0-2l1-1q2-1 1-3-1-2 1-3z"/><path fill="${this.highlightBrushColor}" d="m4 25 4 4-2 2-4-1q-1 0 0-1z"/></g></svg>`;
      sheet?.style.setProperty('--highlight-brush-cursor', `url("data:image/svg+xml,${encodeURIComponent(svg)}") 1 22, crosshair`);
    } else sheet?.style.removeProperty('--highlight-brush-cursor');
    this.updateTextHighlightIndicator();
  }

  chooseTextHighlight(color) {
    const range = this.getFormattingRange();
    const cell = this.activeCell;
    const empty = cell && range && range.minRow === range.maxRow && range.minCol === range.maxCol &&
      !String(this.getCurrentRows()[cell.rowIdx]?.[cell.colKey] ?? '').length;
    if (color && !this.crossDateSelection && (empty || this.highlightBrushColor)) {
      if (this.isEditingCell()) document.activeElement.blur();
      this.textColorSelection = null;
      this.setHighlightBrush(color);
    } else {
      this.setHighlightBrush(null);
      this.applyTextHighlight(color);
    }
  }

  commitHighlightStroke(stroke, end) {
    const { row, key, text, date, start, color } = stroke;
    if (this.currentDate !== date || this.getCurrentRows()[stroke.rowIndex] !== row || String(row[key] ?? '') !== text) return false;
    const lo = Math.min(start, end), hi = Math.max(start, end);
    if (lo === hi) return false;
    const rich = this.getEffectiveCellRichText(row, key);
    const property = stroke.underline ? 'underline' : 'highlight';
    const value = stroke.underline || color;
    const reset = Array.from({ length: hi - lo }, (_, i) => stroke.underline
      ? this.underlineMatches(rich?.styles?.[lo + i]?.underline, value)
      : this.normalizeColumnColor(rich?.styles?.[lo + i]?.highlight) === this.normalizeColumnColor(color)).every(Boolean);
    this.captureHistory?.();
    this.setPartialTextStyle(row, key, lo, hi, property, reset ? null : value);
    this.captureHistory?.();
    this.saveDataStore();
    this.renderTable();
    return true;
  }

  initHighlightBrush() {
    const sheet = this.elSheetContainer;
    if (!sheet || this.highlightBrushBound) return;
    this.highlightBrushBound = true;
    const suppress = event => {
      if (!this.highlightBrushColor) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    for (const type of ['mousedown', 'click', 'dblclick']) sheet.addEventListener(type, suppress, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.highlightBrushColor) {
        event.preventDefault(); event.stopImmediatePropagation(); this.setHighlightBrush(null);
      }
    }, true);
    sheet.addEventListener('pointerdown', event => {
      if (!this.highlightBrushColor || event.button !== 0) return;
      suppress(event);
      const cell = event.target.closest('td.excel-cell[data-row][data-col]');
      if (!cell || !this.elTableBody.contains(cell)) return;
      const rowIndex = Number(cell.dataset.row), key = cell.dataset.col;
      const row = this.getCurrentRows()[rowIndex], text = String(row?.[key] ?? '');
      if (!text || key === 'visitTime') return;
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      const chars = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('button,input,.cell-fill-handle,.inline-editor-color-preview')) continue;
        for (let i = 0; i < node.length; i++) {
          const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
          const rect = range.getBoundingClientRect();
          chars.push({ left: rect.left, right: rect.right });
        }
      }
      if (!chars.length) return;
      const offset = this.getCellFormatting(row, key, 'textAlign') === 'left' ? text.length - text.trimStart().length : 0;
      const indexAt = x => {
        let index = chars.findIndex(rect => x < (rect.left + rect.right) / 2);
        if (index < 0) index = chars.length;
        index += offset;
        if (index > 0 && /[\uDC00-\uDFFF]/.test(text[index] || '')) index++;
        return Math.min(index, text.length);
      };
      const stroke = { row, rowIndex, key, text, date: this.currentDate, start: indexAt(event.clientX), color: this.highlightBrushColor, underline: this.underlineBrushStyle ? { ...this.underlineBrushStyle } : null };
      let end = stroke.start;
      const selection = document.createElement('div'); selection.className = 'highlight-brush-selection';
      cell.append(selection);
      const move = e => {
        if (e.pointerId !== event.pointerId) return;
        end = indexAt(e.clientX);
        const lo = Math.min(stroke.start, end) - offset, hi = Math.max(stroke.start, end) - offset;
        const rect = cell.getBoundingClientRect();
        selection.style.left = `${Math.max(0, (chars[lo]?.left ?? e.clientX) - rect.left)}px`;
        selection.style.width = `${hi > lo ? Math.max(0, chars[hi - 1].right - chars[lo].left) : 0}px`;
      };
      const cleanup = () => {
        document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', finish, true);
        selection.remove(); this.cancelHighlightStroke = null;
      };
      const finish = e => {
        if (e.pointerId !== event.pointerId) return;
        move(e); cleanup(); this.commitHighlightStroke(stroke, end);
      };
      this.cancelHighlightStroke?.(); this.cancelHighlightStroke = cleanup;
      document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', finish, true);
    }, true);
  }

  updateTextHighlightIndicator() {
    if (typeof document === 'undefined') return;
    const button = document.getElementById?.('btnTextHighlight');
    if (!button) return;
    const color = this.textHighlightColor || '#ffff00';
    button.querySelectorAll?.('.highlight-color-paint').forEach(part => { part.style.fill = color; });
    button.title = this.highlightBrushColor && !this.underlineBrushStyle ? `형광펜 모드: ${color} · 드래그로 적용/해제 · Esc로 종료` : `글자 형광펜: ${color} · 적용/해제 (Ctrl/Cmd+E)`;
    button.setAttribute?.('aria-pressed', String(!!this.highlightBrushColor && !this.underlineBrushStyle));
    button.setAttribute?.('aria-label', button.title);
  }

  applyTextHighlight(color) {
    if (this.crossDateSelection) return;
    if (color) this.textHighlightColor = this.normalizeColumnColor(color) || color;
    this.updateTextHighlightIndicator();
    if (this.applySelectedTextStyle('highlight', color)) return;
    const range = this.getFormattingRange();
    if (!range) return;
    if (this.isEditingCell()) document.activeElement.blur();
    const rows = this.getCurrentRows();
    const keys = ['no','gender','chartNo','name','part','prescription','extra','writer','memo','specialNote','visitTime'];
    this.captureHistory?.();
    for (let r = range.minRow; r <= range.maxRow; r++) for (let c = range.minCol; c <= range.maxCol; c++) {
      if (!this.isSelectedCoordinate(r, c) || !rows[r]) continue;
      const key = keys[c], length = String(rows[r][key] ?? '').length;
      if (length) this.setPartialTextStyle(rows[r], key, 0, length, 'highlight', color);
    }
    this.captureHistory?.();
    this.saveDataStore(); this.renderTable();
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
    if (!this.prepareFormattingMenu(property, anchor)) return;
    const menu = document.createElement("div"); menu.id = "fontColorMenu"; menu.className = "font-color-menu";
    menu._formatAnchor = anchor; menu._formatProperty = property;
    const isBackground = property === "backgroundColor";
    const isHighlight = property === 'highlight';
    const apply = color => {
      if (isHighlight) { this.chooseTextHighlight(color); this.closeFontColorMenu(); }
      else if (isBackground) this.applyBackgroundColor(color); else this.applyTextColor(color);
    };
    menu.setAttribute("role", "dialog"); menu.setAttribute("aria-label", isHighlight ? "글자 형광펜 선택" : isBackground ? "셀 배경색 선택" : "글자색 선택");
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
    const picker = document.createElement("input"); picker.type = "color"; picker.value = this.normalizeColumnColor(status.value) || "#000000"; picker.setAttribute("aria-label", isHighlight ? "맞춤 형광펜 색상" : isBackground ? "맞춤 셀 배경색" : "맞춤 글자색"); picker.oninput = () => apply(picker.value); custom.appendChild(picker); menu.appendChild(custom);
    menu.onmousedown = event => { if (event.target !== picker) event.preventDefault(); };
    document.body.appendChild(menu);
    const positionMenu = () => {
      if (!menu.isConnected) return;
      this.positionFormattingPopup(menu, anchor);
    };
    positionMenu();
    const close = event => { if (!menu.contains(event.target) && !anchor?.contains?.(event.target)) this.closeFontColorMenu(); };
    const escape = event => { if (event.key === "Escape") this.closeFontColorMenu(); };
    const scrollListener = event => {
      if (!menu.contains(event.target)) positionMenu();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", positionMenu);
    document.addEventListener("scroll", scrollListener, true);
    this.fontColorMenuCleanup = () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", positionMenu);
      document.removeEventListener("scroll", scrollListener, true);
    };
  }

  // =============================================================================
  // Clipboard Operations (클립보드 연동: 복사, 잘라내기, 붙여넣기, 지우기)
  // =============================================================================
}
