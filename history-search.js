// Search, previous-date records, and Apply destination presentation.
// Methods run with the PTApp instance as `this`; no separate state is created.
class PTHistorySearch {
  initCurrentDateSearchPreference() {
    this.currentDateSearchPreference = this.readDevicePanelState('PT_INCLUDE_CURRENT_DATE_SEARCH_V1', 'true', 'enabled');
    this.setIncludeCurrentDateSearch(this.currentDateSearchPreference.enabled, false);
  }

  persistLocalCurrentDateSearchPreference(snapshot) {
    const key = 'PT_INCLUDE_CURRENT_DATE_SEARCH_V1';
    this.persistDevicePanelCookie(key, snapshot);
    try { localStorage.setItem(`${key}_SNAPSHOT`, JSON.stringify(snapshot)); } catch (_) {}
    try { localStorage.setItem(key, String(snapshot.enabled)); } catch (_) {}
  }

  queueCurrentDateSearchPreference(snapshot) {
    if (!this.currentDateSearchPreferenceStore) return;
    const previous = this.currentDateSearchPreferenceWrite || Promise.resolve();
    this.currentDateSearchPreferenceWrite = previous.then(async () => {
      await this.currentDateSearchPreferenceStore('device-current-date-search-v1', snapshot);
      const saved = await this.currentDateSearchPreferenceStore('device-current-date-search-v1');
      if (saved?.enabled !== snapshot.enabled || saved.updatedAt !== snapshot.updatedAt) throw new Error('검색 설정 저장 검증 실패');
    }).catch(() => this.showSaveIndicator?.('검색 설정 저장 실패 · 기기 저장 공간을 확인해 주세요', true));
  }

  async restoreCurrentDateSearchPreference(store) {
    this.currentDateSearchPreferenceStore = store;
    const saved = await store('device-current-date-search-v1');
    const local = this.currentDateSearchPreference || this.readDevicePanelState('PT_INCLUDE_CURRENT_DATE_SEARCH_V1', 'true', 'enabled');
    if (!this.currentDateSearchPreferenceChanged && typeof saved?.enabled === 'boolean' &&
        Number.isFinite(saved.updatedAt) && saved.updatedAt >= local.updatedAt) {
      this.currentDateSearchPreference = saved;
      this.persistLocalCurrentDateSearchPreference(saved);
      this.setIncludeCurrentDateSearch(saved.enabled, false);
    } else {
      this.currentDateSearchPreference = local;
      this.setIncludeCurrentDateSearch(local.enabled, false);
      this.queueCurrentDateSearchPreference(local);
      await this.currentDateSearchPreferenceWrite;
    }
  }

  setIncludeCurrentDateSearch(enabled, save = true) {
    this.includeCurrentDateSearch = Boolean(enabled);
    const checkbox = document.getElementById('searchIncludeCurrentDate');
    if (checkbox) checkbox.checked = this.includeCurrentDateSearch;
    if (save) {
      const previous = this.currentDateSearchPreference || this.readDevicePanelState('PT_INCLUDE_CURRENT_DATE_SEARCH_V1', 'true', 'enabled');
      const snapshot = { enabled: this.includeCurrentDateSearch, updatedAt: Math.max(Date.now(), previous.updatedAt + 1) };
      this.currentDateSearchPreference = snapshot;
      this.currentDateSearchPreferenceChanged = true;
      this.persistLocalCurrentDateSearchPreference(snapshot);
      this.queueCurrentDateSearchPreference(snapshot);
    }
    if (!enabled && this.currentDateSearchOriginalTarget) {
      if (this.currentDateSearchOriginalTarget.date === this.currentDate) this.historyApplyTarget = this.currentDateSearchOriginalTarget;
      this.currentDateSearchOriginalTarget = null;
    }
    const query = this.elSearchInput?.value?.trim();
    if (query) this.searchAllDates(query, undefined, { preserveCurrentSelection: true });
  }

  getCurrentDateSearchRowIndices(query) {
    if (!this.includeCurrentDateSearch) return [];
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const field = this.isChartNumberQuery(q) ? 'chartNo' : 'name';
    return this.getCurrentRows().flatMap((row, index) => String(row?.[field] ?? '').trim().toLowerCase() === q ? [index] : []);
  }

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
      for (const index of this.getCurrentDateSearchRowIndices(this.elSearchInput.value)) indices.add(index);
      if (!indices.size && !source && !this.crossDateSelection) {
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
      // History owns keyboard focus; the daily destination is a row preview only.
      if (!this.crossDateSelection && !this.activeCell && !this.selectedRowRange) {
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
    if (focusAppliedRow) this.elSearchInput.value = "";
    this.renderTable();
    this.lastHistoryAppliedTarget = { date: this.currentDate, row: rows[rowIdx], rowIdx };
    if (focusAppliedRow) {
      // Apply and Enter finish the search using the same cleanup as Escape.
      this.closeHistorySearch();
    } else if (searchQuery) {
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
    if (this.textColorSelection?.history) this.textColorSelection = null;
    if (this.selectedCellKind === "history") { this.selectedCellSet = null; this.selectedCellKind = null; }
    this.crossDateSelection = null;
    this.isSelectingCrossDate = false;
    this.elTableBody?.querySelectorAll(".cross-date-row-selected").forEach(row => row.classList.remove("cross-date-row-selected"));
    this.elTableBody?.querySelectorAll(".cross-date-num.selected, .cross-date-num.header-active").forEach(header => header.classList.remove("selected", "header-active"));
    if (this.elFormulaInput) this.elFormulaInput.readOnly = false;
    this.elTableBody?.querySelectorAll(".cross-date-cell.range-selected").forEach(cell => {
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
    const cells = this.selectedCellKind === "history" && this.selectedCellSet
      ? [...this.selectedCellSet].map(cell => { const [row, col] = cell.split(":").map(Number); return [identify(row), col]; }) : null;
    return { selection, cells, rowSelected: this.isCrossDateRowSelected,
      borderOnly: typeof document !== 'undefined' && document.activeElement === this.elSheetContainer,
      wasLastRow: selection.endRow === this.crossDateResults?.length - 1,
      start: identify(selection.startRow), end: identify(selection.endRow) };
  }

  restoreHistorySearchSelection(snapshot) {
    if (!snapshot) return;
    if (snapshot.cells) {
      // Expanding changes display indices. Preserve only the exact chosen
      // records; never turn gaps in a Ctrl/Cmd selection into selected cells.
      const cells = snapshot.cells.flatMap(([identity, col]) => {
        const row = this.crossDateResults.findIndex(item => JSON.stringify([item._sourceDate, item._sourceRowIdx]) === identity);
        return row >= 0 ? [[row, col]] : [];
      });
      this.clearHeaderSelections();
      this.isCrossDateRowSelected = false;
      if (cells.length) {
        const rows = cells.map(cell => cell[0]), cols = cells.map(cell => cell[1]);
        const minRow = Math.min(...rows), maxRow = Math.max(...rows), minCol = Math.min(...cols), maxCol = Math.max(...cols);
        this.selectedCellKind = "history";
        this.selectedCellSet = new Set(cells.map(([row, col]) => `${row}:${col}`));
        this.crossDateSelection = { minRow, maxRow, minCol, maxCol, startRow: minRow, startCol: minCol, endRow: maxRow, endCol: maxCol };
        this.paintCellSet();
        this.elSelectedCellCoords.textContent = `${cells.length}개 셀 선택`;
        this.elFormulaInput.readOnly = true;
      }
      this.elSheetContainer?.focus?.({ preventScroll: true });
      this.updateHistoryDestinationHighlight();
      return;
    }
    const find = identity => {
      const identify = row => JSON.stringify([row._sourceDate, row._sourceRowIdx]);
      const exact = this.crossDateResults?.findIndex(row => identify(row) === identity) ?? -1;
      if (exact >= 0 || this.isCrossDateExpanded) return exact;
      // A clear/edit can merge duplicate records into a different representative.
      // Keep the border on that displayed representative after regrouping.
      const source = this.allCrossDateMatchedRows?.find(row => identify(row) === identity);
      return source ? this.crossDateResults.findIndex(row => this.getHistoryDedupeKey(row) === this.getHistoryDedupeKey(source)) : -1;
    };
    const startRow = find(snapshot.start), endRow = find(snapshot.end);
    if (startRow < 0 || endRow < 0) {
      if (snapshot.rowSelected && snapshot.wasLastRow && this.crossDateResults?.length) {
        this.selectCrossDateRow(this.crossDateResults.length - 1);
      }
      return;
    }
    if (snapshot.rowSelected) this.selectCrossDateRow(endRow);
    else {
      this.isCrossDateRowSelected = false;
      this.selectCrossDateCell(startRow, snapshot.selection.startCol);
      if (startRow !== endRow || snapshot.selection.startCol !== snapshot.selection.endCol) {
        this.selectCrossDateCell(endRow, snapshot.selection.endCol, true);
      }
      this.isSelectingCrossDate = false;
      if (snapshot.borderOnly) this.elSheetContainer?.focus?.({ preventScroll: true });
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
    if (!extend && !this.isCrossDateRowSelected && col === 9 && !this.selectedCellSet) {
      this.startHistoryNoteEdit(row, cell, true);
    }
    if (cell && this.getHistoryNoteRange() && selection.minRow === selection.maxRow) this.highlightCell(cell);
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
    clearTimeout(this.historyCurrentScrollTimer);
    this.pendingHistorySearchSelection = null;
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
    this.patientHistorySearchRequestId = (this.patientHistorySearchRequestId || 0) + 1;
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
    const dateKey = this.includeCurrentDateSearch && row._sourceDate === this.currentDate ? `current:${row._sourceRowIdx}` : row._sourceDate.slice(0, 4);
    return JSON.stringify([dateKey, ...compareCols.map(k => String(row[k] || "").trim().toLowerCase())]);
  }

  searchAllDates(query, originRowIdx, { preserveCurrentSelection = false, scrollToAppliedRow = false, focusCurrentTarget = false, searchStore: preparedSearchStore = null } = {}) {
    if (!preserveCurrentSelection || this.historyNotePinnedQuery !== String(query || "").trim().toLowerCase()) {
      this.historyNotePinnedSources = null;
      this.historyNotePinnedQuery = null;
    }
    const historyExpanded = this.isCrossDateExpanded;
    if (this.includeCurrentDateSearch && this.currentDateSearchOriginalTarget?.date === this.currentDate) {
      this.historyApplyTarget = this.currentDateSearchOriginalTarget;
    }
    clearTimeout(this.historyCurrentScrollTimer);
    const historySelection = preserveCurrentSelection
      ? this.captureHistorySearchSelection() || this.pendingHistorySearchSelection : null;
    if (historySelection && typeof document !== 'undefined' && typeof document.getElementById === 'function') {
      this._preservedHistoryScrollTop = document.getElementById('crossDateScrollWrap')?.scrollTop;
    }
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

    // Reuse only this lookup's snapshot; later searches and cloud refreshes
    // still read current records instead of retaining a stale global cache.
    const searchStore = preparedSearchStore || this.getSearchDataStore();
    const isChartQuery = this.isChartNumberQuery(q);
    const cutoffDate = typeof this.getSearchCutoffDate === "function" ? this.getSearchCutoffDate() : null;
    // 성함 후보에 해당하는 검색어는 완전 일치로 찾고, 다른 열의 검색은 기존 방식으로 유지한다.
    const isNameQuery = Object.values(searchStore).some(rows => Array.isArray(rows) &&
      rows.some(row => String(row?.name ?? "").trim().toLowerCase().includes(q)));
    const allDates = Object.keys(searchStore).sort(); // 오름차순: 하단에 최근월일
    allDates.forEach((dateKey) => {
      const includeCurrent = this.includeCurrentDateSearch && dateKey === this.currentDate;
      if (dateKey >= this.currentDate && !includeCurrent) return;
      if (cutoffDate && dateKey < cutoffDate && !includeCurrent) return;
      const dateRows = searchStore[dateKey] || [];
      dateRows.forEach((row, sourceRowIdx) => {
        if (!row.name && !row.chartNo && !row.part && !row.prescription) return;
        const matches = isChartQuery ? String(row.chartNo ?? "").trim().toLowerCase() === q : (isNameQuery || includeCurrent)
          ? String(row.name ?? "").trim().toLowerCase() === q
          : colKeys.map(k => (row[k] || "")).join(" ").toLowerCase().includes(q);
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
    this.isCrossDateExpanded = Boolean(preserveCurrentSelection && historyExpanded);

    const currentIndices = this.getCurrentDateSearchRowIndices(q);
    if (currentIndices.length) {
      this.currentDateSearchOriginalTarget ||= this.historyApplyTarget && { ...this.historyApplyTarget };
      const index = currentIndices.includes(originIdx) ? originIdx : currentIndices[0];
      this.historyApplyTarget = { date: this.currentDate, rowIdx: index, rows: rowsData, row: rowsData[index], colKey: 'name' };
    }

    // 5) 이전 날짜 섹션 렌더링
    if (focusCurrentTarget && originIdx >= 0) this.historyApplyTarget.colKey = "no";
    // Keep keyboard selection in the last history row, and show the daily
    // destination independently through its preview tint and border.
    this.renderCrossDateSection({
      preserveCurrentSelection: keepCurrentSelection || Boolean(historySelection),
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
