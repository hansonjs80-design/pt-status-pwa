// Search, previous-date records, and Apply destination presentation.
// Methods run with the PTApp instance as `this`; no separate state is created.
class PTHistorySearch {
  copyHistoryFields(destination, source, keys) {
    const sourceIndex = this.crossDateResults?.indexOf(source) ?? -1;
    for (const key of keys) {
      destination[key] = source[key] ?? "";
      const cell = sourceIndex >= 0 ? this.elTableBody?.querySelector(`[data-cross-idx="${sourceIndex}"][data-cross-col="${key}"]`) : null;
      this.applyCopiedCellFormatting(destination, key, this.captureCellFormatting(source, key, cell));
    }
  }

  updateHistoryDestinationHighlight(source) {
    const previewButton = Boolean(source);
    const indices = new Set();
    if (this.elSearchInput?.value?.trim()) {
      if (!source && !this.crossDateSelection) {
        if (this.activeCell) indices.add(this.activeCell.rowIdx);
        else if (this.selectedRange) {
          for (let row = this.selectedRange.minRow; row <= this.selectedRange.maxRow; row++) indices.add(row);
        }
      }
      if (!indices.size) {
        source ||= this.crossDateResults?.[this.crossDateSelection?.minRow ?? 0];
        const target = this.historyApplyTarget;
        if (source && target?.date === this.currentDate) {
          const index = this.getCurrentRows().indexOf(target.row);
          indices.add(this.getHistoryDestinationIndex(source, index >= 0 ? index : target.rowIdx));
        }
      }
    }
    const body = this.elTableBody;
    if (!body) return;
    // Only touch previously marked elements and the new destination rows.
    // Arrow navigation no longer visits every cell in the daily table.
    body.querySelectorAll(".history-destination-row, .history-destination-cell").forEach(element => {
      element.classList.remove("history-destination-row", "history-destination-cell");
    });
    const colKey = this.historyApplyTarget?.colKey || "no";
    for (const index of indices) {
      const row = body.querySelector(`.excel-row[data-row-idx="${index}"]`);
      if (!row) continue;
      row.classList.add("history-destination-row");
      if (!this.activeCell && !this.selectedRowRange) {
        row.querySelector(`[data-col="${colKey}"]`)?.classList.add("history-destination-cell");
      }
      if (previewButton) this.ensureCurrentCellVisible(row.querySelector(".excel-cell"));
    }
  }

  getLastPatientRowIndex() {
    return this.getCurrentRows().findLastIndex(row =>
      ["name", "chartNo"].some(key => String(row?.[key] ?? "").trim()));
  }

  getHistoryDestinationIndex(source, targetIndex) {
    const rows = this.getCurrentRows();
    const targetRow = rows[targetIndex];
    const sourceName = String(source?.name ?? "").trim();
    const targetName = String(targetRow?.name ?? "").trim();
    const sourceChart = String(source?.chartNo ?? "").trim();
    const targetChart = String(targetRow?.chartNo ?? "").trim();
    // A name-only search must update its selected row, even before a chart is filled.
    const samePatient = (sourceName && sourceName === targetName) ||
      (sourceChart && sourceChart === targetChart && (!sourceName || !targetName));
    if (samePatient) return targetIndex;
    // Prepared initials and treatment notes do not mark a patient record.
    return this.getLastPatientRowIndex() + 1;
  }

  applyHistoryRow(source, { focusAppliedRow = false } = {}) {
    const target = this.historyApplyTarget;
    if (!target || target.date !== this.currentDate) return;
    // Finish a live editor before assigning; a later blur cannot restore old text.
    if (document.activeElement?.matches?.(".cell-input-element") || document.activeElement === this.elFormulaInput) document.activeElement?.blur?.();
    const rows = this.getCurrentRows();
    if (typeof this.captureHistory === "function") this.captureHistory();
    const referenceIndex = rows.indexOf(target.row);
    if (referenceIndex < 0 && target.rows === rows) return;
    const targetRowIdx = referenceIndex >= 0 ? referenceIndex : target.rowIdx;
    if (!Number.isInteger(targetRowIdx) || !rows[targetRowIdx]) return;
    const history = this.getEditHistory();
    history.applySelections ||= new Map();
    history.applySelections.set(history.current, {
      rowRange: this.selectedRowRange && { ...this.selectedRowRange },
      lastCol: this.selectedRange?.maxCol ?? 9,
      cell: this.activeCell && { rowIdx: this.activeCell.rowIdx, colKey: this.activeCell.colKey },
      search: this.captureHistorySearchSelection()
    });
    let rowIdx;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const selection = this.crossDateSelection;
    const wasRowSelected = this.isCrossDateRowSelected;
    const sourceIndex = this.crossDateResults?.indexOf(source);
    const useSelection = selection && sourceIndex >= selection.minRow && sourceIndex <= selection.maxRow;
    const sources = useSelection ? this.crossDateResults.slice(selection.minRow, selection.maxRow + 1) : [source];
    const selectedKeys = (useSelection ? keys.slice(selection.minCol, selection.maxCol + 1) : keys).filter(key => key !== "visitTime" && key !== "no");
    const appliedAt = new Date();
    for (let offset = 0; offset < sources.length; offset++) {
      const fields = useSelection && this.selectedCellSet ? selectedKeys.filter(key => this.isSelectedCoordinate(selection.minRow + offset, keys.indexOf(key))) : selectedKeys;
      if (!fields.length) continue;
      const destinationIdx = this.getHistoryDestinationIndex(sources[offset], targetRowIdx + offset);
      if (rowIdx === undefined) rowIdx = destinationIdx;
      while (!rows[destinationIdx]) rows.push(this.createDefaultEmptyRows(1)[0]);
      this.copyHistoryFields(rows[destinationIdx], sources[offset], fields);
      this.setVisitTimeNow(rows[destinationIdx], appliedAt);
    }
    if (rowIdx === undefined) return;
    this.activeCell = null;
    this.clipboardSelection = null;
    this.clearHeaderSelections();
    const searchQuery = this.elSearchInput.value;
    this.renderTable();
    if (searchQuery) {
      this.searchAllDates(searchQuery, rowIdx, { scrollToAppliedRow: focusAppliedRow });
      if (useSelection && this.crossDateResults?.length) {
        if (wasRowSelected) this.selectCrossDateRow(selection.minRow);
        else {
          this.selectCrossDateCell(selection.startRow, selection.startCol);
          this.selectCrossDateCell(selection.endRow, selection.endCol, true);
          this.isCrossDateRowSelected = false;
          this.elTableBody.querySelectorAll(".cross-date-row-selected").forEach(row => row.classList.remove("cross-date-row-selected"));
        }
      } else if (this.crossDateResults?.length) {
        const appliedSourceIndex = this.crossDateResults.findIndex(row =>
          row._sourceDate === source._sourceDate && row._sourceRowIdx === source._sourceRowIdx);
        if (appliedSourceIndex >= 0) this.selectCrossDateRow(appliedSourceIndex);
      }
    }
    this.lastHistoryAppliedTarget = { date: this.currentDate, row: rows[rowIdx], rowIdx };
    if (focusAppliedRow) this.restoreAppliedHistorySelection(this.lastHistoryAppliedTarget);
    // Include row allocation and final selection in the same Apply transaction.
    this.captureHistory();
    history.applySelections.set(history.current, {
      rowRange: this.selectedRowRange && { ...this.selectedRowRange },
      lastCol: this.selectedRange?.maxCol ?? 9,
      cell: this.activeCell && { rowIdx: this.activeCell.rowIdx, colKey: this.activeCell.colKey },
      search: this.captureHistorySearchSelection()
    });
    for (const snapshot of history.applySelections.keys()) {
      if (snapshot !== history.current && !history.undo.includes(snapshot) && !history.redo.includes(snapshot)) history.applySelections.delete(snapshot);
    }
    this.saveDataStore(false);
    this.showSaveIndicator(`${source._sourceDate} 기록을 ${BASE_ROW_NUMBER + rowIdx}행에 적용 · 방문시간 ${rows[rowIdx].visitTime}`);
  }

  clearRowDropMarker() {
    this.elTableBody.querySelectorAll(".row-drop-before, .row-drop-after").forEach(row => row.classList.remove("row-drop-before", "row-drop-after"));
    this.rowDropIndex = null;
  }

  finishRowMove() {
    const move = this.rowMove, destination = this.rowDropIndex;
    this.rowMove = null;
    this.clearRowDropMarker();
    if (!move || move.date !== this.currentDate || destination === null) return;
    const { minRow, maxRow } = move;
    if (destination >= minRow && destination <= maxRow + 1) return;
    const rows = this.getCurrentRows();
    const count = maxRow - minRow + 1;
    const target = destination > maxRow ? destination - count : destination;
    const moving = rows.splice(minRow, count);
    rows.splice(target, 0, ...moving);
    this.clipboardSelection = null;
    this.sortState = { colKey: null, direction: "asc" };
    this.saveDataStore();
    this.renderTable();
    this.selectRowRange(target, target + count - 1);
    this.showSaveIndicator(`${count}개 행 이동 완료`);
  }

  clearCrossDateSelection() {
    if (this.selectedCellKind === "history") { this.selectedCellSet = null; this.selectedCellKind = null; }
    this.crossDateSelection = null;
    this.isSelectingCrossDate = false;
    this.elTableBody?.querySelectorAll(".cross-date-row-selected").forEach(row => row.classList.remove("cross-date-row-selected"));
    if (this.elFormulaInput) this.elFormulaInput.readOnly = false;
    this.elTableBody?.querySelectorAll(".cross-date-cell").forEach(cell => {
      cell.classList.remove("range-selected", "range-border-top", "range-border-bottom", "range-border-left", "range-border-right");
    });
  }

  captureHistorySearchSelection() {
    if (!this.crossDateSelection || this._isPasting) return null;
    const selection = { ...this.crossDateSelection };
    const identify = index => {
      const row = this.crossDateResults?.[index];
      return row && JSON.stringify([row._sourceDate, row._sourceRowIdx]);
    };
    return { selection, rowSelected: this.isCrossDateRowSelected,
      wasLastRow: selection.endRow === this.crossDateResults?.length - 1,
      start: identify(selection.startRow), end: identify(selection.endRow) };
  }

  restoreHistorySearchSelection(snapshot) {
    if (!snapshot) return;
    const find = identity => this.crossDateResults?.findIndex(row =>
      JSON.stringify([row._sourceDate, row._sourceRowIdx]) === identity) ?? -1;
    const startRow = find(snapshot.start), endRow = find(snapshot.end);
    if (startRow < 0 || endRow < 0) {
      if (snapshot.rowSelected && snapshot.wasLastRow && this.crossDateResults?.length) {
        this.selectCrossDateRow(this.crossDateResults.length - 1);
      }
      return;
    }
    if (snapshot.rowSelected) this.selectCrossDateRow(endRow);
    else {
      this.selectCrossDateCell(startRow, snapshot.selection.startCol);
      this.selectCrossDateCell(endRow, snapshot.selection.endCol, true);
      this.isSelectingCrossDate = false;
    }
  }

  selectCrossDateCell(row, col, extend = false) {
    if (this.genderPickerState) this.closeGenderDropdown();
    const previous = this.crossDateSelection;
    const dragging = this.isSelectingCrossDate;
    document.activeElement?.blur();
    this.clearHeaderSelections();
    this.activeCell = null;
    this.selectedRowIdx = null;
    this.selectedColKey = null;
    document.querySelectorAll(".cell-focused, .active-row, .header-active").forEach(el => el.classList.remove("cell-focused", "active-row", "header-active"));
    const startRow = extend && previous ? previous.startRow : row;
    const startCol = extend && previous ? previous.startCol : col;
    const selection = this.crossDateSelection = {
      startRow, startCol, endRow: row, endCol: col,
      minRow: Math.min(startRow, row), maxRow: Math.max(startRow, row),
      minCol: Math.min(startCol, col), maxCol: Math.max(startCol, col)
    };
    this.elTableBody.querySelectorAll(".cross-date-cell").forEach(cell => {
      const r = Number(cell.dataset.crossIdx), c = Number(cell.dataset.crossColIdx);
      if (r < selection.minRow || r > selection.maxRow || c < selection.minCol || c > selection.maxCol) return;
      cell.classList.add("range-selected");
      if (r === selection.minRow) cell.classList.add("range-border-top");
      if (r === selection.maxRow) cell.classList.add("range-border-bottom");
      if (c === selection.minCol) cell.classList.add("range-border-left");
      if (c === selection.maxCol) cell.classList.add("range-border-right");
    });
    const source = this.crossDateResults[row];
    const cell = this.elTableBody.querySelector(`[data-cross-idx="${row}"][data-cross-col-idx="${col}"]`);
    if (source && cell) {
      const address = `${String.fromCharCode(65 + col)}${BASE_ROW_NUMBER + source._sourceRowIdx}`;
      this.elCellAddress.textContent = address;
      this.elSelectedCellCoords.textContent = `${source._sourceDate} · ${address} 선택`;
      this.elFormulaInput.value = source[cell.dataset.crossCol] ?? "";
      this.elFormulaInput.readOnly = true;
    }
    this.elSheetContainer?.focus?.({ preventScroll: true });
    // 확장 선택 중인 드래그를 유지한다. 키보드/초기 선택은 드래그를 시작하지 않는다.
    this.isSelectingCrossDate = Boolean(extend && dragging);
    this.updateHistoryDestinationHighlight();
  }

  restoreAppliedHistorySelection(target) {
    if (target?.date !== this.currentDate) return;
    const rows = this.getCurrentRows();
    const index = rows.indexOf(target.row);
    const rowIdx = index >= 0 ? index : target.rowIdx;
    const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="no"]`);
    if (cell) {
      this.selectCell(rowIdx, "no", cell, false);
      this.isCrossDateRowSelected = false;
      this.revealHistoryDestination(cell, rowIdx);
      this.focusSelectedCellEditor();
    }
  }

  captureHistoryOriginSelection() {
    if (this.elSearchInput?.value?.trim()) return;
    const selection = this.activeCell;
    this.historyOriginSelection = selection ? {
      date: this.currentDate, rowIdx: selection.rowIdx, colKey: selection.colKey,
      row: this.getCurrentRows()[selection.rowIdx]
    } : null;
  }

  restoreHistoryOriginSelection() {
    const origin = this.historyOriginSelection;
    const rows = this.getCurrentRows();
    const index = origin?.date === this.currentDate ? rows.indexOf(origin.row) : -1;
    const rowIdx = index >= 0 ? index : Math.max(0, this.getLastPatientRowIndex());
    const colKey = index >= 0 ? origin.colKey : "name";
    const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${colKey}"]`);
    if (cell) {
      this.selectCell(rowIdx, colKey, cell, false);
      this.ensureCurrentCellVisible(cell);
      this.focusSelectedCellEditor();
    }
    this.historyOriginSelection = undefined;
  }

  revealHistoryDestination(cell, rowIdx = Number(cell?.dataset?.row)) {
    this.ensureCurrentCellVisible(cell);
    if (!Number.isInteger(rowIdx) || !cell?.getBoundingClientRect) return;
    // Keep twelve preceding rows visible around the destination at any table position.
    const contextCell = this.elTableBody.querySelector(`[data-row="${Math.max(0, rowIdx - 12)}"][data-col="no"]`);
    const container = this.elSheetContainer;
    if (!contextCell?.getBoundingClientRect || !container?.getBoundingClientRect) return;
    const bounds = container.getBoundingClientRect();
    const bottom = bounds.top + (container.clientTop || 0) + container.clientHeight;
    let top = bounds.top + (container.clientTop || 0);
    container.querySelectorAll("#excelTable thead th, .current-history-headers th").forEach(header => {
      const rect = header.getBoundingClientRect();
      if (rect.height && rect.bottom > top && rect.top < bottom) top = Math.max(top, rect.bottom);
    });
    const contextTop = contextCell.getBoundingClientRect().top;
    const contextHeight = cell.getBoundingClientRect().bottom - contextTop;
    // Supply enough trailing space to align the context even at the scroll limit.
    container.style?.setProperty?.("--history-tail-space", `${Math.max(0, bottom - top - contextHeight)}px`);
    container.scrollTop += contextCell.getBoundingClientRect().top - top;
    // Small viewports may fit fewer than thirteen rows, but the destination must stay visible.
    this.ensureCurrentCellVisible(cell);
  }

  closeHistorySearch() {
    this.closeAutocompleteMenu();
    this.closeGenderDropdown();
    this.hideContextMenu();
    this.clipboardSelection = null;
    this.pendingCut = null;
    this.renderClipboardSelection();
    this.clearHeaderSelections();
    this.elSearchInput.value = '';
    // Use the same exit path as Escape to restore the origin or applied row.
    this.handleSearch();
    this.elSheetContainer.focus({ preventScroll: true });
  }

  handleSearch() {
    const q = this.elSearchInput.value.trim().toLowerCase();
    this.elBtnClearSearch.style.display = q ? "block" : "none";

    if (q) { this.searchAllDates(this.elSearchInput.value.trim()); return; }
    // 교차 날짜 임시 행 제거
    this.clearCrossDateRows();

    const rows = document.querySelectorAll(".excel-row");
    rows.forEach((rowEl) => {
      if (!q) {
        rowEl.style.display = "";
        rowEl.classList.remove("search-origin-row", "history-destination-row");
        return;
      }
      const text = rowEl.textContent.toLowerCase();
      rowEl.style.display = text.includes(q) || Number(rowEl.dataset.rowIdx) === this.historyApplyTarget?.rowIdx ? "" : "none";
    });
    // Restore visibility after all daily rows are unhidden and history rows removed.
    const target = this.lastHistoryAppliedTarget || this.historyApplyTarget;
    if (target?.date === this.currentDate) {
      const index = this.getCurrentRows().indexOf(target.row);
      const rowIdx = index >= 0 ? index : target.rowIdx;
      this.elTableBody.querySelector(`tr[data-row-idx="${rowIdx}"]`)
        ?.scrollIntoView({ block: "center", inline: "nearest" });
    }
    if (this.lastHistoryAppliedTarget) this.restoreAppliedHistorySelection(this.lastHistoryAppliedTarget);
    else this.restoreHistoryOriginSelection();
    this.historyOriginSelection = undefined;
    this.lastHistoryAppliedTarget = null;
  }

  // 교차 날짜 임시 행 제거
  clearCrossDateRows() {
    this.restoreCurrentTableHeader();
    this.historyLayoutObserver?.disconnect();
    this.historyLayoutObserver = null;
    this.elSheetContainer?.classList.remove("history-search-active");
    this.elSheetContainer?.style?.removeProperty?.("--history-tail-space");
    this.clearCrossDateSelection();
    this.isCrossDateRowSelected = false;
    this.crossDateResults = [];
    this.crossDateGroups = null;
    this.allCrossDateMatchedRows = null;
    this.isCrossDateExpanded = false;
    if (this.clipboardSelection?.kind === "history") this.clipboardSelection = null;
    document.querySelectorAll(".cross-date-master-row, .cross-date-row, .cross-date-divider").forEach(el => el.remove());

    // # 헤더 토글 상태 원복
    const thRowNumHeader = document.querySelector(".business-headers-row th.row-num-header");
    if (thRowNumHeader) {
      thRowNumHeader.classList.remove("cross-date-toggle-active");
      thRowNumHeader.style.cursor = "";
      thRowNumHeader.textContent = "#";
      thRowNumHeader.title = "";
      thRowNumHeader.onclick = null;
    }
    // 현재 날짜 행 표시 원복
    this.elTableBody?.querySelectorAll(".excel-row:not(.cross-date-row):not(.cross-date-master-row)").forEach(rowEl => {
      rowEl.style.display = "";
      rowEl.classList.remove("search-origin-row", "history-destination-row");
    });
    this.syncMainColumnWidths();
  }

  // ★ 전체 날짜 검색: Ctrl+F 시 현재 날짜 + 이전 날짜의 매칭 기록을 모두 표시
  scrollToHistoryTarget() {
    const index = this.historyApplyTarget?.rowIdx;
    const row = Number.isInteger(index) ? this.elTableBody.querySelector(`tr[data-row-idx="${index}"]`) : this.elTableBody.querySelector('.excel-row:not(.cross-date-row):not([style*="display: none"])');
    if (row) { row.style.display = ""; row.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }

  findFirstEmptyRowIndex() {
    const rows = this.getCurrentRows();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.name && !r.chartNo && !r.part && !r.prescription && !r.extra && !r.writer && !r.memo && !r.specialNote) {
        return i;
      }
    }
    return rows.length;
  }

  rememberPatientSearchDraft(rowIdx, colKey, input) {
    if (!["name", "chartNo"].includes(colKey)) return;
    this.patientSearchDraft = { date: this.currentDate, rowIdx, colKey, input };
  }

  isChartNumberQuery(query) {
    const value = String(query ?? "").trim();
    return /^[a-z0-9-]+$/i.test(value) && /\d/.test(value);
  }

  handlePatientEditorSearchShortcut(event) {
    if (!this.isSearchShortcut(event)) return false;
    if (this.directHistorySearchKeyHeld) {
      event.preventDefault(); event.stopPropagation();
      return true;
    }
    let input = event.target;
    // During native composition the physical shortcut can target the sheet
    // instead of the input. Read the live draft before falling back to selection.
    if (!["INPUT", "TEXTAREA"].includes(input?.tagName)) {
      const focused = document.activeElement;
      if (focused?.tagName === "INPUT" && focused.closest?.(".excel-cell")) input = focused;
      else if (this.activeCell && (event.isComposing || event.keyCode === 229 || event.key === "Process")) {
        const { rowIdx, colKey } = this.activeCell;
        const editor = this.elTableBody?.querySelector(`[data-row="${rowIdx}"][data-col="${colKey}"] input:not(.is-armed)`);
        if (editor?.tagName === "INPUT") input = editor;
      }
    }
    const cell = input?.closest?.(".excel-cell");
    const formulaEditor = Boolean(input && input === this.elFormulaInput);
    // Windows IME may blur/remove the editor when Control is pressed, before F
    // reaches the document. Retain the typed draft through that handoff.
    const draft = this.patientSearchDraft;
    const useDraft = (typeof input?.value !== "string" || input.classList?.contains("is-armed")) && !formulaEditor &&
      (!["INPUT", "TEXTAREA"].includes(event.target?.tagName) || Boolean(event.target?.closest?.(".excel-cell"))) &&
      draft?.date === this.currentDate && draft.rowIdx === this.activeCell?.rowIdx &&
      draft.colKey === this.activeCell?.colKey;
    if (useDraft) input = draft.input;
    const colKey = useDraft ? draft.colKey : cell?.dataset?.col || this.activeCell?.colKey;
    if (!cell && !formulaEditor && !useDraft) return false;
    if (!["name", "chartNo"].includes(colKey)) return false;
    // An untouched armed input represents a selection border, not a text caret.
    if (input.classList?.contains("is-armed") && !useDraft) return false;
    if (!String(input.value ?? "").trim()) return false;
    event.preventDefault();
    event.stopPropagation();
    this.captureHistoryOriginSelection();
    this.historyApplyBlockedKey = "f";
    this.directHistorySearchKeyHeld = true;
    const rowIdx = useDraft ? draft.rowIdx : cell?.dataset?.row !== undefined ? Number(cell.dataset.row) : this.activeCell?.rowIdx;
    // Capture the highlighted name before blur removes the autocomplete menu.
    // A menu from another cell must never supply this editor's search query.
    const autocomplete = this.autocompleteState;
    const selectedName = colKey === "name" && autocomplete?.colKey === "name" &&
      autocomplete.rowIdx === rowIdx && autocomplete.input === input &&
      autocomplete.selectedIndex >= 0 && this.isAutocompleteOpen()
      ? autocomplete.candidates[autocomplete.selectedIndex] : undefined;
    const rawValue = input.value;
    const chosenName = typeof selectedName === "string" ? selectedName.trim() : "";
    const committedCandidate = chosenName && input.commitAutocompleteValue?.(chosenName);
    if (!committedCandidate) {
      input.blur();
      // Windows may have already committed and removed the original editor
      // during the Control-key handoff. Complete that row's captured draft too.
      if (chosenName) {
        const row = this.getCurrentRows()[rowIdx];
        if (row) {
          row.name = chosenName;
          this.applyAutocompleteColor(row, "name", chosenName, autocomplete.query);
          const currentCell = this.elTableBody?.querySelector(`[data-row="${rowIdx}"][data-col="name"]`);
          if (currentCell) {
            this.applyCellFormatting(currentCell, row, "name");
            this.renderColoredText(currentCell, row, "name");
          }
          this.saveDataStore();
          this.refreshNewPatientRows();
        }
      }
    }
    this.closeAutocompleteMenu();
    this.elSheetContainer.focus({ preventScroll: true });
    const query = chosenName || this.assembleHangul(input.value).trim() || this.assembleHangul(rawValue).trim();
    this.patientSearchDraft = null;
    this.closeSearchPromptModal();
    void this.searchPatientHistory(query, rowIdx);
    return true;
  }

  findActiveCell() {
    const { rowIdx, colKey } = this.activeCell || {};
    const targetIdx = Number.isInteger(rowIdx) ? rowIdx
      : this.selectedRange?.minRow ?? this.selectedRowIdx ?? this.findFirstEmptyRowIndex();
    const query = ["name", "chartNo"].includes(colKey)
      ? String(this.getCurrentRows()[targetIdx]?.[colKey] ?? "").trim() : "";
    this.openSearchPromptModal(targetIdx, query);
  }

  getHistoryDedupeKey(row) {
    const compareCols = ["gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    // Keep older years visible even when the patient and treatment are identical.
    return JSON.stringify([row._sourceDate.slice(0, 4), ...compareCols.map(k => String(row[k] || "").trim().toLowerCase())]);
  }

  searchAllDates(query, originRowIdx, { preserveCurrentSelection = false, scrollToAppliedRow = false, focusCurrentTarget = false } = {}) {
    clearTimeout(this.historyCurrentScrollTimer);
    const historySelection = preserveCurrentSelection
      ? this.captureHistorySearchSelection() || this.pendingHistorySearchSelection : null;
    this.pendingHistorySearchSelection = null;
    if (!this.elSearchInput?.value?.trim() && this.historyOriginSelection === undefined) this.captureHistoryOriginSelection();
    // Refreshing search results must not steal focus from a current-date edit.
    const keepCurrentSelection = preserveCurrentSelection && !this.crossDateSelection &&
      Boolean(this.activeCell || this.selectedRange || this.selectedRowRange);
    if (Number.isInteger(originRowIdx) && originRowIdx >= 0) {
      this.historyApplyTarget = {
        date: this.currentDate, rowIdx: originRowIdx,
        rows: this.getCurrentRows(), row: this.getCurrentRows()[originRowIdx], colKey: this.activeCell?.colKey || "chartNo"
      };
    }
    void this.loadSearchHistory();
    if (!query) {
      this.handleSearch();
      return;
    }

    const q = String(query).trim().toLowerCase();
    this.elSearchInput.value = query;
    this.elBtnClearSearch.style.display = "block";

    // 1) 교차 날짜 임시 행 제거
    this.clearCrossDateRows();
    this.elSheetContainer.classList.add("history-search-active");
    this.syncMainColumnWidths();

    // Every current-date row remains reachable, including the default blank rows.
    const currentRows = this.elTableBody.querySelectorAll(".excel-row:not(.cross-date-row):not(.cross-date-master-row)");
    const rowsData = this.getCurrentRows();
    let lastDataIdx = -1;
    rowsData.forEach((row, idx) => {
      if (row.name || row.chartNo || row.part || row.prescription || row.extra || row.writer || row.memo || row.specialNote) {
        lastDataIdx = Math.max(lastDataIdx, idx);
      }
    });
    const originIdx = keepCurrentSelection ? (this.activeCell?.rowIdx ?? this.selectedRange?.minRow ?? this.selectedRowRange?.minRow)
      : Number.isInteger(originRowIdx) ? originRowIdx : (this.historyApplyTarget?.rowIdx ?? -1);

    currentRows.forEach((rowEl) => {
      rowEl.style.display = "";
    });

    // 3) 이전 날짜에서 매칭 기록 수집 (오래된 날짜가 위, 최신 날짜가 아래로 오도록 오름차순: 하단에 최근월일 표시)
    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const allMatchedRows = [];

    const searchStore = this.getSearchDataStore();
    const isChartQuery = this.isChartNumberQuery(q);
    const cutoffDate = typeof this.getSearchCutoffDate === "function" ? this.getSearchCutoffDate() : null;
    // 성함 후보에 해당하는 검색어는 완전 일치로 찾고, 다른 열의 검색은 기존 방식으로 유지한다.
    const isNameQuery = Object.values(searchStore).some(rows => Array.isArray(rows) &&
      rows.some(row => String(row?.name ?? "").trim().toLowerCase().includes(q)));
    const allDates = Object.keys(searchStore).sort(); // 오름차순: 하단에 최근월일
    allDates.forEach((dateKey) => {
      if (dateKey >= this.currentDate) return; // 이전 날짜만 대상
      if (cutoffDate && dateKey < cutoffDate) return; // 검색 기간 이전 날짜 제외
      const dateRows = searchStore[dateKey] || [];
      dateRows.forEach((row, sourceRowIdx) => {
        if (!row.name && !row.chartNo && !row.part && !row.prescription) return;
        const rowText = colKeys.map(k => (row[k] || "")).join(" ").toLowerCase();
        const matches = isChartQuery ? String(row.chartNo ?? "").trim().toLowerCase() === q : isNameQuery
          ? String(row.name ?? "").trim().toLowerCase() === q
          : rowText.includes(q);
        if (matches) {
          allMatchedRows.push({ ...row, _sourceDate: dateKey, _sourceRowIdx: sourceRowIdx });
        }
      });
    });

    // 4) 중복 그룹화 (No., visitTime 제외, 성별~특이사항 내용 동일 여부)
    // 같은 연도 안에서만 합치고, 연도별 최신 날짜의 행을 대표 행으로 지정

    const groupMap = new Map();
    allMatchedRows.forEach((row) => {
      const dKey = this.getHistoryDedupeKey(row);
      if (!groupMap.has(dKey)) {
        groupMap.set(dKey, {
          representative: row,
          items: [row],
          key: dKey
        });
      } else {
        const grp = groupMap.get(dKey);
        grp.items.push(row);
        if (row._sourceDate >= grp.representative._sourceDate) {
          grp.representative = row;
        }
      }
    });

    this.crossDateGroups = groupMap;
    this.allCrossDateMatchedRows = allMatchedRows;
    this.isCrossDateExpanded = false; // 기본값: 대표 행만 표시

    // 5) 이전 날짜 섹션 렌더링
    if (focusCurrentTarget && originIdx >= 0) this.historyApplyTarget.colKey = "no";
    // Keep keyboard selection in the last history row, and show the daily
    // destination independently through its preview tint and border.
    this.renderCrossDateSection({
      preserveCurrentSelection: keepCurrentSelection,
      selectLatestHistory: !preserveCurrentSelection && !this._isPasting
    });
    if (historySelection) this.restoreHistorySearchSelection(historySelection);
    this.updateHistoryDestinationHighlight();

    // Searches started from a current row keep that row visible; otherwise show latest entries.
    const scrollTargetIdx = originIdx >= 0 ? originIdx
      : lastDataIdx >= 0 ? lastDataIdx : (originIdx >= 0 ? originIdx : 0);
    const scrollRowEl = this.elTableBody.querySelector(`tr.excel-row[data-row-idx="${scrollTargetIdx}"]`);
    if (scrollRowEl && !preserveCurrentSelection && !this._isPasting) {
      const revealTarget = () => {
        if (this._isPasting) return;
        // Do not move back after the user has already navigated to another cell.
        if (focusCurrentTarget && this.activeCell && this.activeCell.rowIdx !== originIdx) return;
        if (scrollToAppliedRow || originIdx >= 0) {
          this.revealHistoryDestination(this.elTableBody.querySelector('.history-destination-row .excel-cell') || scrollRowEl.querySelector('[data-col="no"]'));
        } else {
          this.revealHistoryDestination(scrollRowEl.querySelector('[data-col="no"]'), scrollTargetIdx);
        }
      };
      if (focusCurrentTarget) revealTarget();
      this.historyCurrentScrollTimer = setTimeout(revealTarget, 50);
    }
  }


}
