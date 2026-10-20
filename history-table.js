// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTHistoryTable {
  startHistoryNoteEdit(index, cell, armed = false) {
    const source = this.crossDateResults?.[index];
    if (!source || !cell || this._recordsRestorePending || this._recordRestoreError ||
        !/^\d{4}-\d{2}-\d{2}$/.test(source._sourceDate) ||
        !Number.isInteger(source._sourceRowIdx)) return;
    const existing = cell.querySelector("input");
    if (existing?.historyEdit) {
      if (!armed && !existing.classList.contains("is-armed")) return;
      this.startInlineEdit(index, "specialNote", cell, armed, existing.historyEdit);
      return;
    }
    // Build a draft only for the selected cell. Opening/searching the history
    // table never hydrates dates, reads extra records, or creates editors.
    const edit = this.createHistoryNoteEdit(index);
    this.startInlineEdit(index, "specialNote", cell, armed, edit);
  }

  createHistoryNoteEdit(index) {
    const source = this.crossDateResults[index];
    const edit = {
      row: JSON.parse(JSON.stringify(source)), date: source._sourceDate,
      sourceIndex: source._sourceRowIdx, query: this.elSearchInput.value.trim(),
      save: finished => this.saveHistoryNoteEdit(edit, finished),
      navigate: (rowDelta, colDelta) => {
        const row = Math.max(0, Math.min(this.crossDateResults.length - 1, index + rowDelta));
        const col = Math.max(0, Math.min(9, 9 + colDelta));
        this.isCrossDateRowSelected = false;
        this.selectCrossDateCell(row, col);
        this.elTableBody.querySelector(`[data-cross-idx="${row}"][data-cross-col-idx="${col}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    };
    edit.signature = this.getHistoryNoteSignature(edit.row);
    return edit;
  }

  getHistoryNoteSignature(row) {
    return JSON.stringify([row.specialNote ?? "", ...["_textColors", "_textStyles", "_richText", "_formatRevisions"]
      .map(key => row[key]?.specialNote ?? null)]);
  }

  pinHistoryNoteRows(rows) {
    const query = this.elSearchInput.value.trim().toLowerCase();
    if (this.historyNotePinnedQuery !== query) this.historyNotePinnedSources = new Set();
    this.historyNotePinnedQuery = query;
    this.historyNotePinnedSources ||= new Set();
    for (const row of rows) this.historyNotePinnedSources.add(JSON.stringify([row._sourceDate, row._sourceRowIdx]));
  }

  saveHistoryNoteEdit(edit, finished, { deferPersist = false, force = false } = {}) {
    const signature = this.getHistoryNoteSignature(edit.row);
    if (force || signature !== edit.signature) {
      // Materialize only the edited date, with unsent edits and newer remote
      // fields merged first. Copy only this cell's text/formatting into it.
      const rows = this.getSearchDataStore({ rebasePending: true, date: edit.date })[edit.date];
      const target = rows?.[edit.sourceIndex];
      if (!target || ["name", "chartNo"].some(key => String(target[key] ?? "") !== String(edit.row[key] ?? ""))) {
        this.showSaveIndicator("원본 기록이 변경되어 특이사항을 저장하지 못했습니다. 다시 검색해 주세요.", true);
        return false;
      }
      const copy = JSON.parse(JSON.stringify(rows));
      const row = copy[edit.sourceIndex];
      row.specialNote = edit.row.specialNote ?? "";
      // Returning to the baseline value is still a deliberate new edit.
      this.historyNoteRevisionSequence = (this.historyNoteRevisionSequence || 0) + 1;
      row._historyNoteRevision = `${Date.now()}:${this.historyNoteRevisionSequence}:${Math.random().toString(36).slice(2)}`;
      for (const key of ["_textColors", "_textStyles", "_richText", "_formatRevisions"]) {
        if (edit.row[key]?.specialNote !== undefined) {
          row[key] ||= {};
          row[key].specialNote = JSON.parse(JSON.stringify(edit.row[key].specialNote));
        } else if (row[key]) delete row[key].specialNote;
      }
      if (edit.date !== this.currentDate && Array.isArray(this.cloudSearchHistory?.[edit.date])) {
        this.syncBaselines.set(edit.date, JSON.parse(JSON.stringify(this.cloudSearchHistory[edit.date])));
      }
      this.dataStore[edit.date] = copy;
      if (edit.date === this.currentDate) {
        const cell = this.elTableBody?.querySelector(`[data-row="${edit.sourceIndex}"][data-col="specialNote"]`);
        if (cell && !cell.querySelector("input")) {
          this.applyCellFormatting(cell, row, "specialNote");
          this.renderColoredText(cell, row, "specialNote");
        }
      }
      this.pendingSyncDates.add(edit.date);
      try { localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates])); } catch (_) {}
      edit.signature = signature;
      edit.changed = true;
      this.pinHistoryNoteRows([{ _sourceDate: edit.date, _sourceRowIdx: edit.sourceIndex }]);
      // Keep Apply/copy and collapsed representatives current without rebuilding
      // the search table on every keystroke or interrupting Korean composition.
      for (const result of [...(this.allCrossDateMatchedRows || []), ...(this.crossDateResults || [])]) {
        if (result._sourceDate === edit.date && result._sourceRowIdx === edit.sourceIndex) Object.assign(result, row);
      }
    }
    if (!edit.changed) return false;
    clearTimeout(edit.timer);
    if (deferPersist) return true;
    const persist = () => {
      edit.timer = null;
      return this.persistDataStore().then(() => {
        this.scheduleSupabaseSync(edit.date);
        this.showSaveIndicator("저장 완료됨");
      }).catch(error => {
        console.error("History note save error", error);
        this.showSaveIndicator("특이사항 저장 실패 · 다시 저장해 주세요", true);
      });
    };
    if (finished) {
      void persist();
      setTimeout(() => {
        if (this.elSearchInput.value.trim() === edit.query) this.refreshLoadedSearchResults();
      }, 0);
    } else edit.timer = setTimeout(persist, 350);
  }

  clearHistoryNotes() {
    if (!this.getHistoryNoteRange() || this._recordsRestorePending || this._recordRestoreError) return;
    document.activeElement?.blur?.();
    const targets = this.getHistoryNoteFormattingTargets({ partial: false });
    for (const {row, key} of targets) {
      this.updateEditorTextColors(row, key, "");
      row[key] = "";
    }
    this.textColorSelection = null;
    if (!this.saveHistoryNoteEdits(targets.map(target => target.edit))) return;
    this.elSheetContainer?.focus?.({ preventScroll: true });
    this.showSaveIndicator("내용 지우기 완료");
  }

  getHistoryNoteRange() {
    const range = this.crossDateSelection;
    return range && !this.isCrossDateRowSelected && range.minCol === 9 && range.maxCol === 9 ? { ...range } : null;
  }

  getHistoryNoteFormattingTargets({ partial = true } = {}) {
    const range = this.getHistoryNoteRange();
    if (!range) return [];
    const targets = [];
    for (let index = range.minRow; index <= range.maxRow; index++) {
      if (!this.isSelectedCoordinate(index, 9) || !this.crossDateResults?.[index]) continue;
      const cell = this.elTableBody?.querySelector(`[data-cross-idx="${index}"][data-cross-col="specialNote"]`);
      const input = cell?.querySelector("input");
      const edit = input?.historyEdit || this.createHistoryNoteEdit(index);
      const row = edit.row, text = String(row.specialNote ?? "");
      const saved = this.textColorSelection;
      const live = input && !input.classList.contains("is-armed") && input.selectionStart !== input.selectionEnd
        ? { start: input.selectionStart, end: input.selectionEnd, text: this.getCellEditorValue(input) } : null;
      const selection = partial && range.minRow === range.maxRow ? live || (saved?.history &&
        saved.date === edit.date && saved.sourceIndex === edit.sourceIndex && saved.text === text ? saved : null) : null;
      targets.push({ row, key: "specialNote", index, cell, input, edit, partial: Boolean(selection),
        start: selection ? Math.min(selection.start, selection.end) : 0,
        end: selection ? Math.max(selection.start, selection.end) : text.length });
    }
    return targets;
  }

  getHistoryNoteFormattingStatus(property) {
    const targets = this.getHistoryNoteFormattingTargets();
    if (!targets.length) return { label: "선택 없음", value: null };
    const values = new Set();
    for (const {row, key, cell, start, end, partial} of targets) {
      const rich = this.getEffectiveCellRichText(row, key);
      const fallback = this.getCellFormatting(row, key, property) ??
        (property === "highlight" ? null : cell && typeof getComputedStyle === "function" ? getComputedStyle(cell)[property] : null);
      if ((partial || property === "highlight") && end > start && rich?.text === String(row[key] ?? "")) {
        for (let i = start; i < end; i++) values.add((property === "color" ? rich.colors?.[i] : rich.styles?.[i]?.[property]) ?? fallback);
      } else values.add(fallback);
    }
    const value = values.size === 1 ? [...values][0] : null;
    return { value, label: values.size !== 1 ? "여러 값" : value == null ? "없음" : String(value) };
  }

  saveHistoryNoteEdits(edits) {
    if (!edits.length || this._recordsRestorePending || this._recordRestoreError) return 0;
    // Validate the whole range before changing any date, instead of skipping
    // a stale row and reporting a partially applied fill as complete.
    const snapshots = new Map();
    for (const edit of edits) {
      if (!snapshots.has(edit.date)) snapshots.set(edit.date, this.getSearchDataStore({ rebasePending: true, date: edit.date })[edit.date]);
      const target = snapshots.get(edit.date)?.[edit.sourceIndex];
      if (!target || ["name", "chartNo"].some(key => String(target[key] ?? "") !== String(edit.row[key] ?? ""))) {
        this.showSaveIndicator("원본 기록이 변경되어 선택 범위를 저장하지 않았습니다. 다시 검색해 주세요.", true);
        return 0;
      }
    }
    const dates = new Set();
    for (const edit of edits) if (this.saveHistoryNoteEdit(edit, false, { deferPersist: true, force: true })) dates.add(edit.date);
    if (!dates.size) return 0;
    void this.persistDataStore().then(() => {
      for (const date of dates) this.scheduleSupabaseSync(date);
      this.showSaveIndicator("저장 완료됨");
    }).catch(error => {
      console.error("History note formatting save error", error);
      this.showSaveIndicator("특이사항 저장 실패 · 다시 저장해 주세요", true);
    });
    setTimeout(() => this.refreshLoadedSearchResults(), 0);
    return edits.length;
  }

  applyHistoryNoteFormatting(property, value) {
    const targets = this.getHistoryNoteFormattingTargets({ partial: !["backgroundColor", "textAlign"].includes(property) });
    this.textColorSelection = null;
    for (const target of targets) {
      const { row, key, cell, input, start, end, partial } = target;
      if (partial || ["highlight", "underline"].includes(property)) {
        if (property === "color") { this.setPartialTextColor(row, key, start, end, value); this.markCellFormatting(row, key, "color"); }
        else this.setPartialTextStyle(row, key, start, end, property, value);
      } else if (property === "color") {
        row._textColors ||= {};
        if (value) row._textColors[key] = value; else delete row._textColors[key];
        const rich = row._richText?.[key];
        if (rich?.styles?.some(Boolean)) rich.colors = Array(String(row[key] ?? "").length).fill(null);
        else if (row._richText) delete row._richText[key];
        this.markCellFormatting(row, key, property);
      } else {
        row._textStyles ||= {}; row._textStyles[key] ||= {};
        if (value == null) delete row._textStyles[key][property]; else row._textStyles[key][property] = value;
        const rich = row._richText?.[key];
        if (rich?.styles && ["fontSize", "fontWeight"].includes(property)) rich.styles = rich.styles.map(style => {
          if (!style) return null;
          const next = { ...style }; delete next[property]; return Object.keys(next).length ? next : null;
        });
        this.markCellFormatting(row, key, property);
      }
      if (cell) {
        this.applyCellFormatting(cell, row, key);
        if (input && !input.classList.contains("is-armed")) {
          input.refreshEditorColors?.();
          if (partial) { input.focus({ preventScroll: true }); input.setSelectionRange(start, end); }
        } else {
          input?.blur(); input?.remove();
          this.renderColoredText(cell, row, key);
        }
      }
    }
    return this.saveHistoryNoteEdits(targets.map(target => target.edit)) > 0;
  }

  isHistoryNoteFormattingApplied(property, value) {
    const matches = current => ["color", "highlight"].includes(property)
      ? this.normalizeColumnColor(current) === value : Number(current) === value;
    const targets = this.getHistoryNoteFormattingTargets();
    return targets.length > 0 && targets.every(({row, key, start, end}) => {
      const rich = this.getEffectiveCellRichText(row, key);
      const local = this.isCellFormattingCurrent(row, key, property)
        ? property === "color" ? row._textColors?.[key] : row._textStyles?.[key]?.[property] : null;
      if (start === end) return matches(local);
      return Array.from({length: end - start}, (_, i) => {
        const current = rich?.text === String(row[key] ?? "")
          ? property === "color" ? rich.colors?.[start + i] : rich.styles?.[start + i]?.[property] : null;
        return matches(current ?? local);
      }).every(Boolean);
    });
  }

  finishHistoryNoteFill(drag) {
    const first = Math.min(drag.rowIdx, drag.endRow), last = Math.max(drag.rowIdx, drag.endRow);
    // Do not apply an old drag to a different search result ordering.
    if (drag.sources.length !== this.crossDateResults.length || drag.sources.some((source, index) =>
      source._sourceDate !== this.crossDateResults[index]?._sourceDate ||
      source._sourceRowIdx !== this.crossDateResults[index]?._sourceRowIdx)) return;
    const edits = [];
    for (let index = first; index <= last; index++) {
      if (index === drag.rowIdx) continue;
      const edit = this.createHistoryNoteEdit(index);
      edit.row.specialNote = drag.value;
      this.applyCopiedCellFormatting(edit.row, 'specialNote', drag.formatting);
      edits.push(edit);
    }
    const count = this.saveHistoryNoteEdits(edits);
    if (!count) return;
    this.pinHistoryNoteRows([drag.sources[drag.rowIdx]]);
    this.isCrossDateRowSelected = false;
    this.selectCrossDateCell(drag.rowIdx, 9);
    this.selectCrossDateCell(drag.endRow, 9, true);
    this.isSelectingCrossDate = false;
    this.elSheetContainer?.focus?.({ preventScroll: true });
    this.showSaveIndicator(`${count}개 셀 채우기 완료`);
  }

  async pasteHistoryNotes(suppliedText, suppliedHtml = "") {
    const range = this.getHistoryNoteRange(), viewDate = this.currentDate;
    if (!range || this._recordsRestorePending || this._recordRestoreError) return;
    const sourceRows = [...this.crossDateResults];
    const selection = JSON.stringify(this.crossDateSelection);
    document.activeElement?.blur?.();
    const { text, html } = await this.readClipboardForPaste(suppliedText, suppliedHtml);
    if (this._recordsRestorePending || this._recordRestoreError || this.currentDate !== viewDate || JSON.stringify(this.crossDateSelection) !== selection ||
        sourceRows.length !== this.crossDateResults?.length || sourceRows.some((row, index) =>
          row._sourceDate !== this.crossDateResults[index]?._sourceDate || row._sourceRowIdx !== this.crossDateResults[index]?._sourceRowIdx)) return;
    if (!text) { this.showSaveIndicator("붙여넣을 데이터가 없습니다.", true); return; }
    const grid = this.parseClipboardGrid(text);
    if (grid.some(row => row.length !== 1) || range.minRow + grid.length > sourceRows.length) {
      this.showSaveIndicator("표시된 특이사항 셀 범위에 맞는 한 열의 내용을 붙여넣어 주세요.", true); return;
    }
    const external = this.parseClipboardHtmlColors(html);
    const copied = !external && text === this.clipboardBuffer
      ? this.clipboardSelection || (this.clipboardFormatSnapshot?.text === text ? this.clipboardFormatSnapshot.selection : null) : null;
    const edits = [];
    for (let offset = 0; offset < grid.length; offset++) {
      if (copied?.cells && !copied.cells.includes(`${copied.minRow + offset}:${copied.minCol}`)) continue;
      const edit = this.createHistoryNoteEdit(range.minRow + offset);
      const rows = this.getSearchDataStore({ rebasePending: true, date: edit.date })[edit.date];
      const original = rows?.[edit.sourceIndex];
      if (!original || ['name', 'chartNo'].some(key => String(original[key] ?? '') !== String(edit.row[key] ?? ''))) {
        this.showSaveIndicator("원본 기록이 변경되어 붙여넣지 않았습니다. 다시 검색해 주세요.", true); return;
      }
      const value = grid[offset][0].trim();
      this.updateEditorTextColors(edit.row, 'specialNote', value);
      edit.row.specialNote = value;
      const formatting = copied?.formatting?.[offset]?.[0];
      if (formatting) this.applyCopiedCellFormatting(edit.row, 'specialNote', formatting);
      else if (external?.[offset]?.[0]?.text === value) this.applyPastedCellColors(edit.row, 'specialNote', external[offset][0].formatting);
      edits.push(edit);
    }
    if (!edits.length) return;
    const cut = this.pendingCut;
    let moved = false;
    if (cut && !external && cut.text === text && cut.date === this.currentDate) {
      const rows = this.getCurrentRows();
      this.captureHistory();
      for (const {row, key, value} of cut.cells) if (rows.includes(row) && (row[key] ?? '') === value) {
        const index = rows.indexOf(row);
        if (key === 'specialNote' && edits.some(edit => edit.date === this.currentDate && edit.sourceIndex === index)) continue;
        row[key] = ''; moved = true;
        const cell = this.elTableBody?.querySelector(`[data-row="${index}"][data-col="${key}"]`);
        if (cell) this.renderColoredText(cell, row, key);
      }
    }
    this.pendingCut = null;
    this.saveHistoryNoteEdits(edits);
    if (moved) void this.saveDataStore();
    this.clipboardSelection = null;
    this.renderClipboardSelection();
    this.isCrossDateRowSelected = false;
    this.selectCrossDateCell(range.minRow, 9);
    if (grid.length > 1) this.selectCrossDateCell(range.minRow + grid.length - 1, 9, true);
    // Match the daily table's paste handoff: a border, without a live caret.
    this.elSheetContainer?.focus?.({ preventScroll: true });
    this.showSaveIndicator("붙여넣기 완료됨");
  }

  selectCrossDateRow(idx) {
    if (this.genderPickerState) this.closeGenderDropdown();
    if (!this.crossDateResults || idx < 0 || idx >= this.crossDateResults.length) return;
    this.isCrossDateRowSelected = true;
    // No. 열(col 0)부터 특이사항(col 9)까지만 전체 행 선택
    this.selectCrossDateCell(idx, 0);
    this.selectCrossDateCell(idx, 9, true);
    this.isSelectingCrossDate = false; // 마우스 이동 시 임의 선택 방지

    this.elTableBody.querySelectorAll(".cross-date-row-selected").forEach(r => r.classList.remove("cross-date-row-selected"));
    const tr = this.elTableBody.querySelector(`.cross-date-row[data-cross-idx="${idx}"]`)
      || this.elTableBody.querySelector(`[data-cross-idx="${idx}"]`)?.closest("tr");
    tr?.classList.add("cross-date-row-selected");

    this.elTableBody.querySelectorAll(".cross-date-num.selected, .cross-date-num.header-active").forEach(th => th.classList.remove("selected", "header-active"));
    const th = tr?.querySelector(".cross-date-num");
    th?.classList.add("selected", "header-active");
    th?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  toggleCrossDateExpanded() {
    document.activeElement?.blur?.();
    if (this.fillDrag) this.cancelFillDrag();
    this.isCrossDateExpanded = !this.isCrossDateExpanded;
    this.elSheetContainer?.focus?.({ preventScroll: true });
    const query = this.elSearchInput?.value?.trim();
    if (query) {
      // Rebuild groups from current saved data and restore by source identity.
      // Reusing an old numeric row index after expanding can edit another date.
      this.searchAllDates(query, undefined, { preserveCurrentSelection: true });
    } else this.renderCrossDateSection();
  }

  syncHistoryRowHeaderPosition() {
    // History has its own vertical scroller; offset its sticky first column by
    // the shared sheet's horizontal scroll so dates remain clickable at the left.
    this.elSheetContainer?.style?.setProperty?.("--history-scroll-left", `${this.elSheetContainer.scrollLeft || 0}px`);
    const right = Math.max(0, (this.elSheetContainer?.scrollWidth || 0) -
      (this.elSheetContainer?.clientWidth || 0) - (this.elSheetContainer?.scrollLeft || 0));
    this.elSheetContainer?.style?.setProperty?.("--history-scroll-right", `${right}px`);
  }

  syncCrossDateColWidths() {
    this.syncMainColumnWidths();
    this.syncHistoryRowHeaderPosition();
    const innerTable = document.getElementById("crossDateInnerTable");
    if (!innerTable) return;
    const excelTable = document.getElementById("excelTable");
    if (!excelTable) return;
    const bHeadersRow = document.querySelector(".business-headers-row");
    if (!bHeadersRow) return;

    let colgroup = innerTable.querySelector("colgroup");
    if (!colgroup) {
      colgroup = document.createElement("colgroup");
      innerTable.insertBefore(colgroup, innerTable.firstChild);
    }
    // 메인 테이블 비즈니스 헤더의 모든 14개 열과 1:1로 정확하게 col 및 셀 너비 동기화 (비율 축소 없이 1:1 절대값 적용)
    const headerThs = Array.from(bHeadersRow.children);
    const colWidths = headerThs.map((th) => {
      const isHidden = window.getComputedStyle(th).display === "none";
      if (isHidden) return 0;
      const rect = th.getBoundingClientRect();
      return rect.width;
    });
    const signature = colWidths.join(',');
    // ResizeObserver also runs after focus/scroll layout. Rebuilding every
    // history cell's widths when nothing changed stalls keyboard navigation.
    if (innerTable._columnWidthSignature === signature) return;
    innerTable._columnWidthSignature = signature;
    if (colgroup.replaceChildren) colgroup.replaceChildren();
    else while (colgroup.firstChild) colgroup.removeChild(colgroup.firstChild);

    // 숨긴 열과 colspan으로 생긴 빈 공간을 제외한 실제 열 너비 합을 사용한다.
    const visibleCount = colWidths.filter(w => w > 0).length;
    document.querySelectorAll(".cross-date-master-cell, .cross-date-divider td").forEach(cell => {
      cell.colSpan = visibleCount;
    });
    const width = colWidths.reduce((sum, w) => sum + w, 0);
    innerTable.style.width = `${width}px`;
    innerTable.style.minWidth = `${width}px`;

    // 브라우저 colgroup에는 보이는 열만 추가해야 렌더링 셀과 1:1로 매핑됨 (display:none 열 제외)
    colWidths.forEach((w) => {
      if (w > 0) {
        const col = document.createElement("col");
        col.style.width = `${w}px`;
        colgroup.appendChild(col);
      }
    });

    // innerTable의 각 cross-date-row 내 모든 셀(th 및 td)에 메인 헤더와 동일한 정확한 픽셀 너비 적용
    innerTable.querySelectorAll(".cross-date-row, .cross-date-headers-row").forEach((tr) => {
      Array.from(tr.children).forEach((cell, idx) => {
        const w = colWidths[idx];
        if (w === 0 || w === undefined) {
          cell.style.display = "none";
        } else {
          cell.style.display = "";
          cell.style.width = `${w}px`;
          cell.style.minWidth = `${w}px`;
          cell.style.maxWidth = `${w}px`;
          cell.style.boxSizing = "border-box";
        }
      });
    });
  }

  restoreCurrentTableHeader() {
    const row = document.querySelector(".current-history-headers");
    if (!row) return;
    row.classList.remove("current-history-headers");
    row.querySelectorAll("th").forEach(cell => { cell.style.top = ""; });
    document.getElementById("excelTable")?.querySelector("thead")?.appendChild(row);
  }

  updateCrossDateStickyOffsets() {
    const masterCell = document.querySelector(".cross-date-master-cell");
    const divider = document.getElementById("crossDateDivider");
    if (!masterCell || !divider) return;
    const header = document.getElementById("excelTable")?.querySelector("thead");
    const headerHeight = header?.getBoundingClientRect().height || 49;
    masterCell.style.top = `${headerHeight}px`;
    const dividerTop = headerHeight + masterCell.getBoundingClientRect().height;
    divider.querySelectorAll("td").forEach(cell => {
      cell.style.top = `${dividerTop}px`;
    });
    const currentHeader = document.querySelector(".current-history-headers");
    const currentTop = dividerTop + divider.getBoundingClientRect().height;
    currentHeader?.querySelectorAll("th").forEach(cell => { cell.style.top = `${currentTop}px`; });
  }

  renderCrossDateSection({ preserveCurrentSelection = false, selectLatestHistory = false } = {}) {
    const existingWrap = typeof document !== "undefined" && typeof document?.getElementById === "function" ? document.getElementById("crossDateScrollWrap") : null;
    const preservedHistoryScrollTop = this._preservedHistoryScrollTop ?? existingWrap?.scrollTop;
    this.restoreCurrentTableHeader();
    this.historyLayoutObserver?.disconnect();
    this.historyLayoutObserver = null;
    // 기존 마스터 행 및 구분선 제거
    document.querySelectorAll(".cross-date-master-row, .cross-date-divider").forEach(el => el.remove());

    const groupMap = this.crossDateGroups;
    const allMatchedRows = this.allCrossDateMatchedRows || [];
    if (!groupMap || allMatchedRows.length === 0) {
      this.crossDateResults = [];
      const thRowNumHeader = document.querySelector(".business-headers-row th.row-num-header");
      if (thRowNumHeader) {
        thRowNumHeader.textContent = "#";
        thRowNumHeader.classList.remove("cross-date-toggle-active");
        thRowNumHeader.onclick = null;
      }
      if (!preserveCurrentSelection) this.scrollToHistoryTarget();
      return;
    }

    // 렌더링할 행 목록 결정
    let renderRows = [];
    if (!this.isCrossDateExpanded) {
      // Keep edited dates visible until a new search. Deduplication must not
      // replace the cell under the user after a fill or paste.
      const identify = row => JSON.stringify([row._sourceDate, row._sourceRowIdx]);
      const visible = new Map(Array.from(groupMap.values(), group => [identify(group.representative), group.representative]));
      for (const row of allMatchedRows) if (this.historyNotePinnedSources?.has(identify(row))) visible.set(identify(row), row);
      renderRows = Array.from(visible.values(), row => ({
        ...row, _dupCount: groupMap.get(this.getHistoryDedupeKey(row))?.items.length || 1
      })).sort((a, b) => a._sourceDate.localeCompare(b._sourceDate) || a._sourceRowIdx - b._sourceRowIdx);
    } else {
      // 전체 펼치기 모드: 모든 매칭 행 표시
      renderRows = allMatchedRows.map(row => {
        const grp = groupMap.get(this.getHistoryDedupeKey(row));
        const isSubRow = grp && grp.items.length > 1 && grp.representative !== row;
        return {
          ...row,
          _dupCount: grp ? grp.items.length : 1,
          _isSubRow: isSubRow
        };
      });
    }

    this.crossDateResults = renderRows;

    const firstCurrentRow = this.elTableBody.firstChild;
    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];

    // 1) 마스터 행 생성 (스크롤 래퍼 및 내부 테이블 포함)
    const masterTr = document.createElement("tr");
    masterTr.className = "cross-date-master-row";

    const masterTd = document.createElement("td");
    masterTd.className = "cross-date-master-cell";
    masterTd.colSpan = 14;

    const scrollWrap = document.createElement("div");
    scrollWrap.className = "cross-date-scroll-wrap";
    scrollWrap.id = "crossDateScrollWrap";

    const innerTable = document.createElement("table");
    innerTable.className = "cross-date-inner-table";
    innerTable.id = "crossDateInnerTable";

    const historyHead = document.createElement("thead");
    const historyHeaders = document.createElement("tr");
    historyHeaders.className = "cross-date-headers-row";
    const headerKeys = [null, ...colKeys, "del", "spacer"];
    const headerLabels = ["날짜", "No.", "성별", "챠트번호", "성함", "부위", "처방", "추가 사항", "작성", "메모", "특이 사항", "방문 시간", "적용", ""];
    headerKeys.forEach((key, idx) => {
      const th = document.createElement("th");
      th.textContent = headerLabels[idx];
      if (idx === 0) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "history-date-toggle";
        toggle.textContent = `날짜 ${this.isCrossDateExpanded ? "▲" : "▼"}`;
        toggle.title = this.isCrossDateExpanded ? "대표 행만 보기" : "전체 날짜 기록 보기";
        toggle.setAttribute("aria-expanded", String(this.isCrossDateExpanded));
        toggle.addEventListener("click", e => {
          e.preventDefault(); e.stopPropagation(); this.toggleCrossDateExpanded();
        });
        th.textContent = "";
        th.appendChild(toggle);
      }
      if (headerLabels[idx] === "적용") th.className = "history-apply-header";
      if (key) {
        th.dataset.col = key;
        const resizer = document.createElement("span");
        resizer.className = "col-resizer";
        resizer.title = "드래그하여 열 너비 조절";
        th.appendChild(resizer);
      }
      historyHeaders.appendChild(th);
    });
    historyHead.appendChild(historyHeaders);
    innerTable.appendChild(historyHead);
    const innerTbody = document.createElement("tbody");

    // 행 렌더링
    renderRows.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.className = `excel-row cross-date-row ${row._isSubRow ? "cross-date-subrow" : ""}`;
      tr.dataset.crossDate = row._sourceDate;
      tr.dataset.crossIdx = idx;

      // 행 번호 (날짜 약어 + 중복 건수/화살표)
      const thNum = document.createElement("th");
      thNum.className = "row-num cross-date-num";
      thNum.dataset.crossIdx = idx;

      const headerContent = document.createElement("div");
      headerContent.className = "cross-date-header-content";

      const dateSpan = document.createElement("span");
      dateSpan.className = "cross-date-day";
      if (row._sourceDate === this.currentDate) {
        dateSpan.classList.add('cross-date-day-current-date');
      }
      if (row._sourceDate.slice(0, 4) < this.currentDate.slice(0, 4)) {
        dateSpan.classList.add("cross-date-day-previous-year");
      }
      dateSpan.textContent = row._sourceDate.slice(5).replace("-", "/");
      dateSpan.title = row._sourceDate;
      dateSpan.setAttribute("aria-label", row._sourceDate);
      headerContent.appendChild(dateSpan);

      if (row._dupCount > 1) {
        const toggleArrow = document.createElement("span");
        toggleArrow.className = `cross-date-toggle-arrow ${this.isCrossDateExpanded ? "expanded" : ""}`;
        toggleArrow.textContent = this.isCrossDateExpanded ? "▲" : "▼";
        toggleArrow.title = `${row._dupCount}건 기록 (클릭하여 전체/대표행 토글)`;
        toggleArrow.addEventListener("mousedown", (e) => {
          e.stopPropagation();
        });
        toggleArrow.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleCrossDateExpanded();
        });
        headerContent.appendChild(toggleArrow);
      }

      thNum.appendChild(headerContent);
      thNum.title = `${row._sourceDate} 기록 (클릭하여 행 전체 선택)`;

      thNum.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if (e.target.closest(".cross-date-toggle-arrow")) return;
        e.preventDefault();
        this.selectCrossDateRow(idx);
      });
      tr.appendChild(thNum);

      // 셀 렌더링
      colKeys.forEach((key, colIdx) => {
        const td = document.createElement("td");
        td.className = `excel-cell cell-${key} cross-date-cell`;
        td.dataset.crossIdx = idx;
        td.dataset.crossCol = key;
        td.dataset.crossColIdx = colIdx;
        this.applyCellFormatting(td, row, key);
        const val = row[key] || "";

        if (key === "gender") {
          const textSpan = document.createElement("span");
          textSpan.className = "cell-gender-text";
          textSpan.textContent = val;
          td.appendChild(textSpan);
          if (val === "F") td.classList.add("f");
          if (val === "M") td.classList.add("m");
        } else {
          this.renderColoredText(td, row, key);
        }

        td.addEventListener("mousedown", (e) => {
          if (e.button !== 0 || e.target.closest?.("input, .cell-fill-handle")) return;
          e.preventDefault();
          this.isCrossDateRowSelected = false;
          this.elTableBody.querySelectorAll(".cross-date-num").forEach(th => th.classList.remove("selected", "header-active"));
          this.elTableBody.querySelectorAll(".cross-date-row").forEach(r => r.classList.remove("cross-date-row-selected"));
          if (e.ctrlKey || e.metaKey) { this.toggleCellSelection(idx, colIdx, "history"); return; }
          this.selectCrossDateCell(idx, colIdx, e.shiftKey);
          this.isSelectingCrossDate = true;
        });
        td.addEventListener("mouseenter", (e) => {
          if (this.isSelectingCrossDate && e.buttons === 1) {
            this.selectCrossDateCell(idx, colIdx, true);
          } else {
            this.isSelectingCrossDate = false;
          }
        });

        if (key === "specialNote") {
          td.addEventListener("dblclick", () => this.startHistoryNoteEdit(idx, td));
        }
        tr.appendChild(td);
      });

      // 적용 버튼 셀
      const actionCell = document.createElement("td");
      actionCell.className = "history-apply-cell";
      const applyButton = document.createElement("button");
      applyButton.type = "button";
      applyButton.className = "history-apply-btn";
      applyButton.textContent = "적용";
      applyButton.title = "선택한 셀 적용 · Enter (선택이 없으면 이 행 전체 적용)";
      applyButton.disabled = !this.historyApplyTarget || this.historyApplyTarget.date !== this.currentDate;
      applyButton.addEventListener("mouseenter", () => this.updateHistoryDestinationHighlight(row));
      applyButton.addEventListener("mouseleave", () => this.updateHistoryDestinationHighlight());
      applyButton.addEventListener("mousedown", e => e.preventDefault());
      applyButton.addEventListener("click", () => this.applyHistoryRow(row, { focusAppliedRow: true }));
      actionCell.appendChild(applyButton);
      tr.appendChild(actionCell);

      const spacer = document.createElement("td");
      spacer.className = "cell-spacer history-year-cell";
      const sourceYear = row._sourceDate.slice(0, 4);
      if (sourceYear !== this.currentDate.slice(0, 4)) {
        spacer.textContent = `${sourceYear}년`;
      }
      tr.appendChild(spacer);

      innerTbody.appendChild(tr);
    });

    innerTable.appendChild(innerTbody);
    scrollWrap.appendChild(innerTable);
    masterTd.appendChild(scrollWrap);
    masterTr.appendChild(masterTd);
    this.elTableBody.insertBefore(masterTr, firstCurrentRow);

    // 2) 구분선 (파란색 바)
    const dividerTr = document.createElement("tr");
    dividerTr.className = "cross-date-divider";
    dividerTr.id = "crossDateDivider";
    const dividerTd = document.createElement("td");
    dividerTd.colSpan = 14;
    const modeText = this.isCrossDateExpanded ? "전체 보기" : "대표 행 보기";
    dividerTd.innerHTML = `<span>📋 ${this.includeCurrentDateSearch ? '현재 날짜 포함 검색' : '이전 날짜'} 기록 ${allMatchedRows.length}건 중 ${renderRows.length}건 표시 (${modeText} · 날짜 ▼ 클릭 시 토글) ↑ │ 현재 날짜 (${this.currentDate.replace(/-/g, ".")}) ↓</span>`;
    dividerTr.appendChild(dividerTd);
    this.elTableBody.insertBefore(dividerTr, firstCurrentRow);
    const currentHeader = document.querySelector(".business-headers-row");
    if (currentHeader) {
      currentHeader.classList.add("current-history-headers");
      this.elTableBody.insertBefore(currentHeader, firstCurrentRow);
    }

    // 3) 열 너비 동기화 및 파란 바 고정 위치(sticky top) 설정
    const syncHistoryLayout = () => {
      this.syncCrossDateColWidths();
      // Set the pinned panel geometry before selecting/scrolling the applied row.
      // 글꼴/사용자 행 높이가 달라도 첫 12행을 온전히 표시한다.
      const visibleRows = Array.from(innerTbody.children).slice(0, 12);
      const rowsHeight = visibleRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
      scrollWrap.style.maxHeight = `${historyHead.getBoundingClientRect().height + rowsHeight + 1}px`;
      this.updateCrossDateStickyOffsets();
    };
    syncHistoryLayout();
    requestAnimationFrame(() => {
      if (document.getElementById("crossDateInnerTable") !== innerTable) return;
      syncHistoryLayout();
      if (typeof ResizeObserver !== "undefined") {
        this.historyLayoutObserver = new ResizeObserver(() => {
          if (document.getElementById("crossDateInnerTable") !== innerTable) return;
          this.syncCrossDateColWidths();
          this.updateCrossDateStickyOffsets();
        });
        this.historyLayoutObserver.observe(scrollWrap);
        const header = document.getElementById("excelTable")?.querySelector("thead");
        if (header) {
          this.historyLayoutObserver.observe(header);
          header.querySelectorAll(".business-headers-row th").forEach(cell => this.historyLayoutObserver.observe(cell));
        }
      }
    });

    // 4) 현재 날짜 포함 검색에서는 가장 최근의 이전 날짜 내역을 우선 선택
    const restoreHistoryScroll = () => {
      const wrap = typeof document !== "undefined" && typeof document?.getElementById === "function" ? document.getElementById("crossDateScrollWrap") : null;
      if (wrap === scrollWrap && preservedHistoryScrollTop !== undefined && preservedHistoryScrollTop !== null) {
        wrap.scrollTop = preservedHistoryScrollTop;
      }
    };

    if (renderRows.length > 0 && !preserveCurrentSelection && !this._isPasting &&
        (selectLatestHistory || preservedHistoryScrollTop === undefined || preservedHistoryScrollTop === null)) {
      const lastIdx = renderRows.length - 1;
      const previousIdx = this.includeCurrentDateSearch
        ? renderRows.findLastIndex(row => row._sourceDate < this.currentDate) : -1;
      this.selectCrossDateRow(previousIdx >= 0 ? previousIdx : lastIdx);
      this.isSelectingCrossDate = false;
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          if (document.getElementById("crossDateScrollWrap") === scrollWrap && !this._isPasting) {
            if (previousIdx >= 0) this.elTableBody.querySelector(`.cross-date-row[data-cross-idx="${previousIdx}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            else scrollWrap.scrollTop = scrollWrap.scrollHeight;
          }
        });
      }
    } else if (preservedHistoryScrollTop !== undefined && preservedHistoryScrollTop !== null) {
      restoreHistoryScroll();
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          restoreHistoryScroll();
          setTimeout(restoreHistoryScroll, 30);
        });
      }
    }

    if (this.crossDateSelection) {
      this.renderCrossDateSelectionHighlight();
    }
  }

  renderCrossDateSelectionHighlight() {
    const selection = this.crossDateSelection;
    if (!selection) return;
    this.elTableBody?.querySelectorAll(".cross-date-cell").forEach(cell => {
      const r = Number(cell.dataset.crossIdx), c = Number(cell.dataset.crossColIdx);
      if (r < selection.minRow || r > selection.maxRow || c < selection.minCol || c > selection.maxCol) return;
      cell.classList.add("range-selected");
      if (r === selection.minRow) cell.classList.add("range-border-top");
      if (r === selection.maxRow) cell.classList.add("range-border-bottom");
      if (c === selection.minCol) cell.classList.add("range-border-left");
      if (c === selection.maxCol) cell.classList.add("range-border-right");
    });
    if (this.isCrossDateRowSelected) {
      this.elTableBody?.querySelectorAll(`.cross-date-row[data-cross-idx="${selection.minRow}"]`).forEach(row => {
        row.classList.add("cross-date-row-selected");
      });
    }
  }
}
