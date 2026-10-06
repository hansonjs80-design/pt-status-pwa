// Search, previous-date records, and Apply destination presentation.
// Methods run with the PTApp instance as `this`; no separate state is created.
class PTHistorySearch {
  copyHistoryFields(destination, source, keys) {
    for (const key of keys) {
      destination[key] = source[key] ?? "";
      for (const metadata of ["_textColors", "_textStyles", "_richText", "_formatRevisions"]) {
        if (source[metadata]?.[key] !== undefined) {
          destination[metadata] ||= {};
          destination[metadata][key] = JSON.parse(JSON.stringify(source[metadata][key]));
        } else if (destination[metadata]) delete destination[metadata][key];
      }
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
    if (document.activeElement?.matches(".cell-input-element") || document.activeElement === this.elFormulaInput) document.activeElement.blur();
    const rows = this.getCurrentRows();
    const referenceIndex = rows.indexOf(target.row);
    if (referenceIndex < 0 && target.rows === rows) return;
    const targetRowIdx = referenceIndex >= 0 ? referenceIndex : target.rowIdx;
    if (!Number.isInteger(targetRowIdx) || !rows[targetRowIdx]) return;
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
    this.saveDataStore();
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
      this.elSheetContainer.focus({ preventScroll: true });
    }
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
    this.restoreAppliedHistorySelection(this.lastHistoryAppliedTarget);
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

  openSearchPromptModal(targetRowIdx, initialQuery) {
    this.searchPromptTargetRowIdx = Number.isInteger(targetRowIdx) ? targetRowIdx : this.findFirstEmptyRowIndex();
    if (!this.elSearchPromptModal || !this.elSearchPromptInput) return;
    this.elSearchPromptInput.value = initialQuery ?? (this.elSearchInput?.value?.trim() || "");
    const cellName = String(this.getCurrentRows()[this.searchPromptTargetRowIdx]?.name ?? "").trim();
    this.searchPromptCellName = cellName && cellName === this.elSearchPromptInput.value.trim() ? cellName : null;
    this.elSearchPromptModal.style.display = "flex";
    setTimeout(() => {
      this.elSearchPromptInput.focus();
      this.elSearchPromptInput.select();
      this.updateSearchPromptAutocomplete();
    }, 60);
  }

  closeSearchPromptModal() {
    if (!this.elSearchPromptModal) return;
    this.closeSearchPromptAutocomplete();
    this.elSearchPromptModal.style.display = "none";
    this.elSheetContainer?.focus({ preventScroll: true });
  }

  getSearchPromptAutocompleteItems(query) {
    const value = String(query ?? "").trim();
    if (!value) return [];
    return [{ value, typed: true }, ...this.getSearchPromptSuggestions(value)
      .filter(item => item.value.toLowerCase() !== value.toLowerCase())];
  }

  updateSearchPromptAutocomplete() {
    this.closeSearchPromptAutocomplete();
    const input = this.elSearchPromptInput;
    if (!input?.getBoundingClientRect) return;
    const suggestions = this.getSearchPromptAutocompleteItems(input.value);
    if (!suggestions.length) return;
    const menu = document.createElement("div");
    menu.id = "searchPromptAutocompleteMenu";
    menu.className = "cell-autocomplete-menu search-prompt-autocomplete";
    menu.setAttribute("role", "listbox");
    suggestions.forEach((item, index) => {
      const option = document.createElement("div");
      option.id = `searchPromptOption${index}`;
      option.className = "autocomplete-item";
      option.setAttribute("role", "option");
      const label = document.createElement("span");
      label.className = "autocomplete-item-text";
      label.textContent = item.value;
      const hint = document.createElement("span");
      hint.className = "search-prompt-option-hint";
      hint.textContent = item.typed ? "입력값 · Enter" : item.value === item.name ? item.chartNo : item.name;
      option.append(label, hint);
      option.addEventListener("mousedown", event => {
        event.preventDefault();
        input.value = item.value;
        this.closeSearchPromptAutocomplete();
        input.focus();
      });
      menu.appendChild(option);
    });
    document.body.appendChild(menu);
    this._searchPromptACMenu = menu;
    this._searchPromptACSuggestions = suggestions;
    this._searchPromptACIndex = 0;
    const position = () => {
      const rect = input.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.width = `${rect.width}px`;
      menu.style.maxHeight = `${Math.max(40, Math.min(220, window.innerHeight - rect.bottom - 12))}px`;
    };
    position();
    window.addEventListener("resize", position);
    this._searchPromptACCleanup = () => {
      window.removeEventListener("resize", position);
      input.removeAttribute("aria-activedescendant");
      input.setAttribute("aria-expanded", "false");
    };
    input.setAttribute("aria-expanded", "true");
    this.moveSearchPromptAutocompleteSelection(0);
  }

  moveSearchPromptAutocompleteSelection(delta) {
    if (!this._searchPromptACMenu || !this._searchPromptACSuggestions?.length) return;
    this._searchPromptACIndex = Math.max(0, Math.min(this._searchPromptACSuggestions.length - 1, this._searchPromptACIndex + delta));
    this._searchPromptACExplicit = this._searchPromptACIndex > 0;
    this._searchPromptACMenu.querySelectorAll('[role="option"]').forEach((option, index) => {
      const selected = index === this._searchPromptACIndex;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-selected", String(selected));
      if (selected) {
        this.elSearchPromptInput.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    });
  }

  // 검색어 종류에 맞춰 성함 또는 차트번호 후보만 보여준다.
  getSearchPromptSuggestions(query) {
    if (!query || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    const searchByChart = /^[a-z0-9-]+$/i.test(q) && /\d/.test(q);
    const seen = new Set();
    const results = [];

    // name, chartNo 두 컬럼에서 후보 수집 (최신 날짜 우선)
    const searchStore = this.getSearchDataStore();
    const dateKeys = [this.currentDate, ...Object.keys(searchStore).filter(d => d !== this.currentDate).sort().reverse()];

    for (const dateKey of dateKeys) {
      const rows = searchStore[dateKey];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const name = String(row?.name ?? "").trim();
        const chartNo = String(row?.chartNo ?? "").trim();
        for (const val of searchByChart ? [chartNo] : [name]) {
          if (!val) continue;
          const key = val.toLowerCase();
          if (seen.has(key)) continue;
          if (searchByChart ? key.includes(q) : this.matchesHangulPrefix(val, q, true)) {
            seen.add(key);
            results.push({ value: val, name: name || "", chartNo: chartNo || "" });
            if (results.length >= 10) return results;
          }
        }
      }
    }
    return results;
  }

  closeSearchPromptAutocomplete() {
    this._searchPromptACCleanup?.();
    this._searchPromptACCleanup = null;
    const menu = document.getElementById("searchPromptAutocompleteMenu");
    if (menu) menu.remove();
    this._searchPromptACMenu = null;
    this._searchPromptACSuggestions = null;
    this._searchPromptACIndex = -1;
    this._searchPromptACExplicit = false;
  }

  hasRecordedPatientName(query, targetRowIdx) {
    return this.hasRecordedPatientValue(query, targetRowIdx, "name");
  }

  hasRecordedPatientValue(query, targetRowIdx, field) {
    const normalized = String(query).trim().toLowerCase();
    return Object.entries(this.getSearchDataStore()).some(([date, rows]) =>
      date <= this.currentDate && Array.isArray(rows) && rows.some((row, index) =>
        !(date === this.currentDate && index === targetRowIdx) &&
        String(row?.[field] ?? "").trim().toLowerCase() === normalized));
  }

  async searchPatientHistory(query, targetRowIdx) {
    if (this.supabaseClient) await this.loadSearchHistory();
    const searchByChart = /^[a-z0-9-]+$/i.test(query) && /\d/.test(query);
    if (!searchByChart && !this.hasRecordedPatientName(query, targetRowIdx)) {
      alert("해당 이름을 검색할 수 없습니다.");
      return false;
    }
    this.searchAllDates(query, targetRowIdx);
    return true;
  }

  async submitSearchPrompt() {
    if (!this.elSearchPromptInput || this.searchPromptSubmitting) return;
    if (this._searchPromptACExplicit && this._searchPromptACSuggestions?.[this._searchPromptACIndex]) {
      this.elSearchPromptInput.value = this._searchPromptACSuggestions[this._searchPromptACIndex].value;
    }
    // The first option always searches the current input unchanged.
    const q = this.elSearchPromptInput.value.trim();
    const targetIdx = this.searchPromptTargetRowIdx;
    if (!q) return;
    this.searchPromptSubmitting = true;
    try {
      if (this.supabaseClient) await this.loadSearchHistory();
      // Ignore the active draft row: typing a new name does not establish history.
      const normalized = q.toLowerCase();
      const searchByChart = /^[a-z0-9-]+$/i.test(q) && /\d/.test(q);
      const exists = this.hasRecordedPatientValue(normalized, targetIdx, searchByChart ? "chartNo" : "name");
      if (!exists) {
        alert("해당 이름을 검색할 수 없습니다.");
        this.closeSearchPromptModal();
        return;
      }
      this.closeSearchPromptModal();
      const targetRow = this.getCurrentRows()[targetIdx];
      const field = searchByChart ? "chartNo" : "name";
      const focusCurrentTarget = String(targetRow?.[field] ?? "").trim().toLowerCase() === normalized;
      this.searchAllDates(q, targetIdx, { focusCurrentTarget });
    } finally { this.searchPromptSubmitting = false; }
  }

  selectCrossDateRow(idx) {
    if (this.genderPickerState) this.closeGenderDropdown();
    if (!this.crossDateResults || idx < 0 || idx >= this.crossDateResults.length) return;
    this.isCrossDateRowSelected = true;
    // No. 열(col 0)부터 특이사항(col 9)까지만 전체 행 선택
    this.selectCrossDateCell(idx, 0);
    this.selectCrossDateCell(idx, 9, true);
    this.isSelectingCrossDate = false; // 마우스 이동 시 임의 선택 방지

    this.elTableBody.querySelectorAll(".cross-date-row").forEach(r => r.classList.remove("cross-date-row-selected"));
    const tr = this.elTableBody.querySelector(`.cross-date-row[data-cross-idx="${idx}"]`)
      || this.elTableBody.querySelector(`[data-cross-idx="${idx}"]`)?.closest("tr");
    tr?.classList.add("cross-date-row-selected");

    this.elTableBody.querySelectorAll(".cross-date-num").forEach(th => th.classList.remove("selected", "header-active"));
    const th = tr?.querySelector(".cross-date-num");
    th?.classList.add("selected", "header-active");
    th?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  toggleCrossDateExpanded() {
    this.isCrossDateExpanded = !this.isCrossDateExpanded;
    this.renderCrossDateSection();
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
    if (colgroup.replaceChildren) {
      colgroup.replaceChildren();
    } else {
      while (colgroup.firstChild) colgroup.removeChild(colgroup.firstChild);
    }

    // 메인 테이블 비즈니스 헤더의 모든 14개 열과 1:1로 정확하게 col 및 셀 너비 동기화 (비율 축소 없이 1:1 절대값 적용)
    const headerThs = Array.from(bHeadersRow.children);
    const colWidths = headerThs.map((th) => {
      const isHidden = window.getComputedStyle(th).display === "none";
      if (isHidden) return 0;
      const rect = th.getBoundingClientRect();
      return rect.width;
    });

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

  handlePatientEditorSearchShortcut(event) {
    if (!this.isSearchShortcut(event)) return false;
    const input = event.target;
    const cell = input?.closest?.(".excel-cell");
    const formulaEditor = Boolean(input && input === this.elFormulaInput);
    const colKey = cell?.dataset?.col || this.activeCell?.colKey;
    if (!cell && !formulaEditor) return false;
    if (!["name", "chartNo"].includes(colKey) || input.classList?.contains("is-armed")) return false;
    if (!String(input.value ?? "").trim()) return false;
    event.preventDefault();
    event.stopPropagation();
    this.historyApplyBlockedKey = "f";
    const rowIdx = cell?.dataset?.row !== undefined ? Number(cell.dataset.row) : this.activeCell?.rowIdx;
    const rawValue = input.value;
    input.blur();
    this.closeAutocompleteMenu();
    this.elSheetContainer.focus({ preventScroll: true });
    const query = this.assembleHangul(input.value).trim() || this.assembleHangul(rawValue).trim();
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

  searchAllDates(query, originRowIdx, { preserveCurrentSelection = false, scrollToAppliedRow = false, focusCurrentTarget = false } = {}) {
    clearTimeout(this.historyCurrentScrollTimer);
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

    // Every current-date row remains reachable, including the blank rows through 150.
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
    // 성함 후보에 해당하는 검색어는 완전 일치로 찾고, 다른 열의 검색은 기존 방식으로 유지한다.
    const isNameQuery = Object.values(searchStore).some(rows => Array.isArray(rows) &&
      rows.some(row => String(row?.name ?? "").trim().toLowerCase().includes(q)));
    const allDates = Object.keys(searchStore).sort(); // 오름차순: 하단에 최근월일
    allDates.forEach((dateKey) => {
      if (dateKey >= this.currentDate) return; // 이전 날짜만 대상
      const dateRows = searchStore[dateKey] || [];
      dateRows.forEach((row, sourceRowIdx) => {
        if (!row.name && !row.chartNo && !row.part && !row.prescription) return;
        const rowText = colKeys.map(k => (row[k] || "")).join(" ").toLowerCase();
        const matches = isNameQuery
          ? String(row.name ?? "").trim().toLowerCase() === q
          : rowText.includes(q);
        if (matches) {
          allMatchedRows.push({ ...row, _sourceDate: dateKey, _sourceRowIdx: sourceRowIdx });
        }
      });
    });

    // 4) 중복 그룹화 (No., visitTime 제외, 성별~특이사항 내용 동일 여부)
    // No.가 달라도 나머지 내용이 같으면 합치는 기능 유지, 최신 날짜의 행을 대표 행으로 지정
    const getDedupeKey = (row) => {
      const compareCols = ["gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
      return compareCols.map(k => String(row[k] || "").trim().toLowerCase()).join("||");
    };

    const groupMap = new Map();
    allMatchedRows.forEach((row) => {
      const dKey = getDedupeKey(row);
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
    this.renderCrossDateSection({ preserveCurrentSelection: keepCurrentSelection });
    this.updateHistoryDestinationHighlight();

    // Searches started from a current row keep that row visible; otherwise show latest entries.
    const scrollTargetIdx = originIdx >= 0 ? originIdx
      : lastDataIdx >= 0 ? lastDataIdx : (originIdx >= 0 ? originIdx : 0);
    const scrollRowEl = this.elTableBody.querySelector(`tr.excel-row[data-row-idx="${scrollTargetIdx}"]`);
    if (scrollRowEl && !preserveCurrentSelection) {
      const revealTarget = () => {
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

  renderCrossDateSection({ preserveCurrentSelection = false } = {}) {
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
      // 대표 행 모드: 각 중복 그룹의 대표 1행만 (오래된 날짜가 위, 하단에 최근월일)
      renderRows = Array.from(groupMap.values()).map(g => ({
        ...g.representative,
        _dupCount: g.items.length
      })).sort((a, b) => (a._sourceDate > b._sourceDate ? 1 : a._sourceDate < b._sourceDate ? -1 : 0));
    } else {
      // 전체 펼치기 모드: 모든 매칭 행 표시
      renderRows = allMatchedRows.map(row => {
        const grp = groupMap.get(
          ["gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"]
            .map(k => String(row[k] || "").trim().toLowerCase()).join("||")
        );
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
      dateSpan.textContent = row._sourceDate.slice(5).replace("-", "/");
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
          if (e.button !== 0) return;
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
      spacer.className = "cell-spacer";
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
    dividerTd.innerHTML = `<span>📋 이전 날짜 기록 ${allMatchedRows.length}건 중 ${renderRows.length}건 표시 (${modeText} · 날짜 ▼ 클릭 시 토글) ↑ │ 현재 날짜 (${this.currentDate.replace(/-/g, ".")}) ↓</span>`;
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
      syncHistoryLayout();
      if (typeof ResizeObserver !== "undefined") {
        this.historyLayoutObserver = new ResizeObserver(() => {
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

    // 4) 기본적으로 가장 아래(최신 날짜) 마지막 행을 셀 선택 상태로 설정
    if (renderRows.length > 0 && !preserveCurrentSelection) {
      const lastIdx = renderRows.length - 1;
      this.selectCrossDateRow(lastIdx);
      this.isSelectingCrossDate = false;
      requestAnimationFrame(() => {
        const scrollWrap = document.getElementById("crossDateScrollWrap");
        if (scrollWrap) scrollWrap.scrollTop = scrollWrap.scrollHeight;
      });
    }
  }

}
