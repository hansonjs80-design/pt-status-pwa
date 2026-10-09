// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTSheetKeyboard {
  getHorizontalContentEdge(row, startCol, direction, keys) {
    const filled = col => Boolean(String(row?.[keys[col]] ?? "").trim());
    let col = startCol;
    // Within a filled run, stop at its edge. From an edge/blank, find the next run.
    if (filled(col) && col + direction >= 0 && col + direction < keys.length && filled(col + direction)) {
      while (col + direction >= 0 && col + direction < keys.length && filled(col + direction)) col += direction;
    } else {
      do { col += direction; } while (col > 0 && col < keys.length - 1 && !filled(col));
    }
    return Math.max(0, Math.min(keys.length - 1, col));
  }

  jumpToHorizontalContentEdge(direction) {
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    if (this.crossDateSelection) {
      const { endRow, endCol } = this.crossDateSelection;
      const col = this.isCrossDateRowSelected
        ? (direction < 0 ? 0 : 9)
        : this.getHorizontalContentEdge(this.crossDateResults[endRow], endCol, direction, keys.slice(0, 10));
      this.isCrossDateRowSelected = false;
      this.selectCrossDateCell(endRow, col, false);
      this.elTableBody.querySelector(`[data-cross-idx="${endRow}"][data-cross-col-idx="${col}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    }
    // Row-header/Ctrl+A selection has no activeCell. Collapse it to the
    // requested data edge, excluding visit time and action columns.
    if (this.selectedRowRange) {
      const rowIdx = this.rowRangeEnd ?? this.selectedRowRange.minRow;
      this.navigateCell(rowIdx, direction < 0 ? "no" : "specialNote");
      return true;
    }
    if (!this.activeCell) return false;
    const { rowIdx, colKey } = this.activeCell;
    const col = this.getHorizontalContentEdge(this.getCurrentRows()[rowIdx], keys.indexOf(colKey), direction, keys);
    this.navigateCell(rowIdx, keys[col]);
    return true;
  }

  rememberHorizontalSelection() {
    const history = Boolean(this.crossDateSelection);
    const range = history ? this.crossDateSelection : this.selectedRange;
    this.horizontalSelectionMode = range ? { history, signature: JSON.stringify(range) } : null;
  }

  adjustHorizontalSelection(e) {
    const mode = this.horizontalSelectionMode;
    if (!mode || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey ||
        !["ArrowLeft", "ArrowRight"].includes(e.key)) return false;
    const history = Boolean(this.crossDateSelection);
    const range = history ? this.crossDateSelection : this.selectedRange;
    if (mode.history !== history || mode.signature !== JSON.stringify(range)) {
      this.horizontalSelectionMode = null; return false;
    }
    const anchor = history ? range.startCol : this.rangeStart.colIdx;
    const endpoint = history ? range.endCol : this.rangeEnd.colIdx;
    const col = Math.max(anchor, Math.min(9, endpoint + (e.key === "ArrowRight" ? 1 : -1)));
    if (history) this.selectCrossDateCell(range.endRow, col, true);
    else this.extendCellSelection(this.rangeEnd.rowIdx, col);
    this.rememberHorizontalSelection();
    e.preventDefault(); e.stopPropagation();
    return true;
  }

  collapseSelectedRowToEdge(e) {
    const plainArrow = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
    const returnLeft = (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key === "ArrowLeft";
    if (!["ArrowLeft", "ArrowRight"].includes(e.key) || (!plainArrow && !returnLeft)) return false;
    const history = Boolean(this.crossDateSelection);
    const range = history ? this.crossDateSelection : this.selectedRange;
    if (!range || range.minRow !== range.maxRow || range.minCol === range.maxCol) return false;
    const rowIdx = range.minRow;
    const colIdx = e.key === "ArrowRight" ? range.maxCol : range.minCol;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const cell = this.elTableBody.querySelector(history
      ? `[data-cross-idx="${rowIdx}"][data-cross-col-idx="${colIdx}"]`
      : `[data-row="${rowIdx}"][data-col="${keys[colIdx]}"]`);
    if (!cell) return false;
    e.preventDefault();
    e.stopPropagation();
    if (history) {
      this.isCrossDateRowSelected = false;
      this.elTableBody.querySelectorAll(".cross-date-row-selected").forEach(row => row.classList.remove("cross-date-row-selected"));
      this.elTableBody.querySelectorAll(".cross-date-num").forEach(header => header.classList.remove("selected", "header-active"));
      this.selectCrossDateCell(rowIdx, colIdx);
    } else {
      this.selectCell(rowIdx, keys[colIdx], cell, false);
    }
    cell.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }

  releaseHistorySearchKey(e) {
    if (["f", "control", "meta"].includes(e.key.toLowerCase()) || e.code === "KeyF") this.directHistorySearchKeyHeld = false;
    if (e.key.toLowerCase() === this.historyApplyBlockedKey ||
        (this.historyApplyBlockedKey === "f" && e.code === "KeyF")) this.historyApplyBlockedKey = null;
  }

  handleHistoryApplyShortcut(e) {
    const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter" || e.keyCode === 13;
    if (e.defaultPrevented || (this.historyApplyBlockedKey === "enter" &&
        Date.now() - (this.historySearchEnterAt || 0) < 250)) return false;
    if (!this.crossDateSelection || !isEnter || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    const target = e.target;
    if (target?.closest?.("#searchPromptModal, .modal-overlay")) return false;
    // A read-only history formula field still belongs to the history selection.
    if (target?.matches?.("input, textarea, [contenteditable='true']") && target !== this.elFormulaInput) return false;
    if (target?.closest?.("button") && !target.closest(".history-apply-btn")) return false;
    const rowIndex = this.crossDateSelection.minRow;
    const source = this.crossDateResults?.[rowIndex];
    if (!source) return false;
    e.preventDefault();
    e.stopPropagation();
    this.historyApplyBlockedKey = null;
    const button = this.elTableBody.querySelector(`.cross-date-row[data-cross-idx="${rowIndex}"] .history-apply-btn`);
    // Use the actual Apply button action so click and keyboard cannot diverge.
    if (button?.click) button.click();
    else this.applyHistoryRow(source);
    return true;
  }

  handleGlobalKeyDown(e) {
    if (e.defaultPrevented) return;
    if (this.consumePresetLeftRepeat(e)) return;
    if (this.handlePatientEditorSearchShortcut(e)) return;
    if (e.key === "Escape" && this.activeCell) {
      const editingCell = e.target?.closest?.(".excel-cell");
      const leavingSearch = Boolean(this.elSearchInput?.value?.trim());
      const inSheet = e.target === this.elSheetContainer || Boolean(e.target?.closest?.("#sheetContainer"));
      if (editingCell || (inSheet && !leavingSearch && !this.crossDateSelection)) {
        e.preventDefault(); e.stopPropagation();
        const { rowIdx, colKey } = this.activeCell;
        const cell = editingCell || this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${colKey}"]`);
        if (editingCell) e.target.blur();
        this.closeAutocompleteMenu();
        this.closeGenderDropdown();
        this.hideContextMenu();
        this.clipboardSelection = null;
        this.pendingCut = null;
        this.renderClipboardSelection();
        if (cell) this.selectCell(rowIdx, colKey, cell, false);
        this.elSheetContainer.focus({ preventScroll: true });
        return;
      }
    }
    if (this.handleHistoryApplyShortcut(e)) return;
    if (this.handleCellRowSelectShortcut(e)) return;
    // 검색을 여는 키를 놓기 전의 이벤트는 이전 내역 적용에 사용하지 않는다.
    if (this.isSearchShortcut(e)) this.historyApplyBlockedKey = "f";
    if (this.handleHistoryShortcut(e)) return;
    if (this.fillDrag) {
      e.preventDefault();
      if (e.key === "Escape") this.cancelFillDrag();
      return;
    }
    // If currently typing in an input/textarea inside a cell or modal
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      // ★ 셀 편집 중에도 Ctrl/Cmd+F로 검색 가능: 현재 셀 내용으로 전체 날짜 검색
      if (this.isSearchShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        const cellInput = e.target.closest(".excel-cell") ? e.target : null;
        if (cellInput?.classList?.contains("is-armed")) {
          this.findActiveCell();
          return;
        }
        const cell = cellInput?.closest(".excel-cell");
        const colKey = cell?.dataset?.col || this.activeCell?.colKey;
        if (cellInput && !["name", "chartNo"].includes(colKey)) {
          const rowIdx = this.activeCell?.rowIdx ?? Number(cell?.dataset?.row);
          cellInput.blur();
          this.openSearchPromptModal(rowIdx, "");
          return;
        }
        const searchVal = cellInput ? cellInput.value.trim() : "";
        if (this.elSearchInput && searchVal) {
          document.querySelectorAll(".search-origin-row").forEach(r => r.classList.remove("search-origin-row"));
          const originRow = e.target.closest(".excel-row");
          if (originRow) originRow.classList.add("search-origin-row");
          const originRowIdx = originRow ? Number(originRow.dataset.rowIdx) : -1;
          e.target.blur();
          this.elSheetContainer.focus({ preventScroll: true });
          const query = this.assembleHangul(cellInput.value).trim() || searchVal;
          if (["name", "chartNo"].includes(this.activeCell?.colKey)) void this.searchPatientHistory(query, originRowIdx);
          else this.searchAllDates(query, originRowIdx);
        } else if (cellInput) {
          this.openSearchPromptModal(this.activeCell?.rowIdx, "");
        }
        return;
      }
      if (e.key === "Escape") {
        e.target.blur();
        this.hideContextMenu();
        if (this.elSearchInput.value) { this.elSearchInput.value = ""; this.handleSearch(); }
      }
      return;
    }

    if (this.adjustHorizontalSelection(e)) return;
    if (this.collapseSelectedRowToEdge(e)) return;

    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    const keyLower = e.key.toLowerCase();

    if (isCtrlOrMeta && e.key === "ArrowDown") {
      e.preventDefault(); this.jumpToLastRecord(); return;
    }
    if (isCtrlOrMeta && !e.shiftKey && !e.altKey && e.key === "ArrowUp") {
      e.preventDefault(); this.jumpToFirstRecord(); return;
    }
    if (isCtrlOrMeta && !e.shiftKey && !e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
      if (this.jumpToHorizontalContentEdge(e.key === "ArrowRight" ? 1 : -1)) { e.preventDefault(); return; }
    }
    if (this.crossDateSelection && e.key !== "Escape") {
      const selection = this.crossDateSelection;
      const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];

      if (e.key === "Enter") {
        // Eligible Enter events already run the shared Apply button action above.
        if (e.target.closest?.("button, #searchPromptModal")) return;
      }
      else if (isCtrlOrMeta && keyLower === "c") this.copySelection();
      else if (isCtrlOrMeta && keyLower === "f") {
        const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
        const value = String(this.crossDateResults[selection.endRow][keys[selection.endCol]] ?? "").trim();
        if (["chartNo", "name"].includes(keys[selection.endCol])) this.openSearchPromptModal(this.historyApplyTarget?.rowIdx, value);
        else this.openSearchPromptModal(this.historyApplyTarget?.rowIdx, "");
      }
      // Ctrl (또는 Cmd) + Shift + ArrowRight: 선택한 셀부터 우측에 내용이 연속으로 있는 셀까지 전체 선택
      else if (isCtrlOrMeta && e.shiftKey && e.key === "ArrowRight") {
        const sourceRow = this.crossDateResults[selection.startRow];
        let targetCol = selection.startCol;
        for (let c = selection.startCol + 1; c < colKeys.length; c++) {
          const k = colKeys[c];
          if (String(sourceRow[k] ?? "").trim()) {
            targetCol = c;
          } else {
            break;
          }
        }
        this.selectCrossDateCell(selection.startRow, Math.min(9, targetCol), true);
        this.rememberHorizontalSelection();
      }
      // 행 전체 선택 상태일 때 위/아래 방향키 누르면 전체 행 선택 유지한 채 위아래로 이동
      else if (this.isCrossDateRowSelected && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const crossRows = Array.from(this.elTableBody.querySelectorAll(".cross-date-row:not([style*='display: none'])"));
        const currentTr = this.elTableBody.querySelector(`[data-cross-idx="${selection.minRow}"]`)?.closest("tr");
        const currentDomIdx = crossRows.indexOf(currentTr);
        if (currentDomIdx >= 0) {
          const nextDomIdx = e.key === "ArrowDown" ? currentDomIdx + 1 : currentDomIdx - 1;
          if (nextDomIdx >= 0 && nextDomIdx < crossRows.length) {
            const nextTr = crossRows[nextDomIdx];
            const nextIdx = Number(nextTr.dataset.crossIdx ?? nextTr.querySelector("[data-cross-idx]")?.dataset.crossIdx);
            this.selectCrossDateRow(nextIdx);
          } else if (e.key === "ArrowDown" && nextDomIdx >= crossRows.length) {
            // ★ 이전 날짜 마지막 행에서 ArrowDown -> 파란 가로바를 넘어 현재 날짜 첫 표시 행으로 행 전체 선택 이동!
            const visibleCurrentRows = Array.from(this.elTableBody.querySelectorAll(".excel-row:not(.cross-date-row):not(.cross-date-master-row):not([style*='display: none'])"));
            if (visibleCurrentRows.length > 0) {
              const topRow = this.getTopVisibleCurrentRow() || visibleCurrentRows[0];
            const targetRowIdx = Number(topRow.dataset.rowIdx);
              this.clearCrossDateSelection();
              this.isCrossDateRowSelected = false;
              this.selectRowRange(targetRowIdx, targetRowIdx);
              this.ensureCurrentCellVisible(topRow.querySelector(".excel-cell"));
            }
          }
        }
      }
      // 일반 셀 선택 상태에서 방향키 이동
      else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        this.isCrossDateRowSelected = false;
        this.elTableBody.querySelectorAll(".cross-date-num").forEach(th => th.classList.remove("selected", "header-active"));
        this.elTableBody.querySelectorAll(".cross-date-row").forEach(r => r.classList.remove("cross-date-row-selected"));

        if (e.key === "ArrowDown" && selection.endRow >= this.crossDateResults.length - 1) {
          // ★ 이전 날짜 마지막 행의 셀에서 ArrowDown -> 파란 가로바를 넘어 현재 날짜 첫 표시 행의 동일 열로 이동!
          const visibleCurrentRows = Array.from(this.elTableBody.querySelectorAll(".excel-row:not(.cross-date-row):not(.cross-date-master-row):not([style*='display: none'])"));
          if (visibleCurrentRows.length > 0) {
            const topRow = this.getTopVisibleCurrentRow() || visibleCurrentRows[0];
            const targetRowIdx = Number(topRow.dataset.rowIdx);
            const colOrder = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
            const targetColKey = colOrder[selection.endCol] || "chartNo";
            this.clearCrossDateSelection();
            const targetCell = this.elTableBody.querySelector(`[data-row="${targetRowIdx}"][data-col="${targetColKey}"]`);
            if (targetCell) {
              this.selectCell(targetRowIdx, targetColKey, targetCell, false);
              this.ensureCurrentCellVisible(targetCell);
            }
            e.preventDefault();
            return;
          }
        }

        const row = Math.max(0, Math.min(this.crossDateResults.length - 1, selection.endRow + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0)));
        const col = Math.max(0, Math.min(10, selection.endCol + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0)));
        this.selectCrossDateCell(row, col, e.shiftKey);
        this.elTableBody.querySelector(`[data-cross-idx="${row}"][data-cross-col-idx="${col}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      if (e.key !== "Tab") e.preventDefault();
      return;
    }

    // 1) Copy (Ctrl+C / Cmd+C)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.COPY.key) {
      e.preventDefault();
      this.copySelection();
      return;
    }

    // 2) Cut (Ctrl+X / Cmd+X)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.CUT.key) {
      e.preventDefault();
      this.cutSelection();
      return;
    }

    // 3) Paste (Ctrl+V / Cmd+V)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.PASTE.key) return; // Native paste supplies clipboardData.

    // 4) Select All (Ctrl+A / Cmd+A)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.SELECT_ALL.key) {
      e.preventDefault();
      this.selectAllCells();
      return;
    }

    // 5) Quick Save (Ctrl+S / Cmd+S)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.SAVE.key) {
      e.preventDefault();
      this.saveDataStore();
      return;
    }

    // 6) Print / Preview Modal (Ctrl+P / Cmd+P)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.PRINT.key) {
      e.preventDefault();
      this.openPreviewModal();
      return;
    }

    // 7) Search / Filter (Ctrl+F / Cmd+F)
    //    편집 커서가 없는 셀 선택은 검색어 팝업을 연다.
    if (this.isSearchShortcut(e)) {
      e.preventDefault();
      this.findActiveCell();
      return;
    }

    // 8) Insert Row (Ctrl + '+' or Ctrl + '=' or Ctrl + Shift + '=')
    if (isCtrlOrMeta && (e.key === "+" || e.key === "=" || e.code === "Equal" || e.code === "NumpadAdd")) {
      e.preventDefault();
      const r = this.selectedRowIdx ?? (this.activeCell ? this.activeCell.rowIdx : 0);
      this.insertRowAbove(r);
      return;
    }

    // 9) Delete Row (Ctrl + '-' or Ctrl + '_' or NumpadSubtract)
    if (this.handleRowDeleteShortcut(e)) return;

    // 10) Clear Contents (Delete / Backspace)
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.clearSelection();
      return;
    }

    // 11) Alt + Left / Right -> Date switch
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      this.shiftDay(-1);
      return;
    } else if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      this.shiftDay(1);
      return;
    }

    // 12) F2 -> Edit active cell
    if (e.key === "F2" && this.activeCell) {
      const { rowIdx, colKey } = this.activeCell;
      const cellEl = document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="${colKey}"]`);
      if (cellEl && !cellEl.querySelector("input") && !cellEl.querySelector("select")) {
        e.preventDefault();
        this.startInlineEdit(rowIdx, colKey, cellEl);
        return;
      }
    }

    if (this.handleSelectedTextCellEnter(e)) return;
    if (this.handleEmptyCellEnter(e)) return;

    // G열 성별 키보드 직접 입력 ('ㄹ' -> 'F', 'ㅡ' -> 'M', 'f'/'F' -> 'F', 'm'/'M' -> 'M')
    if (this.activeCell && this.activeCell.colKey === "gender" && !isCtrlOrMeta && !e.altKey) {
      const { rowIdx } = this.activeCell;
      const cellEl = document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="gender"]`);
      if (cellEl) {
        if (e.key === "ㄹ" || keyLower === "f") {
          e.preventDefault();
          this.closeGenderDropdown();
          this.setGenderValue(rowIdx, "F", cellEl);
          return;
        }
        if (e.key === "ㅡ" || keyLower === "m") {
          e.preventDefault();
          this.closeGenderDropdown();
          this.setGenderValue(rowIdx, "M", cellEl);
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace" || e.key === " ") {
          e.preventDefault();
          this.closeGenderDropdown();
          this.setGenderValue(rowIdx, "", cellEl);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const dropBtn = cellEl.querySelector(".gender-dropdown-btn");
          this.openGenderDropdown(rowIdx, cellEl, dropBtn);
          return;
        }
      }
    }

    if (this.activeCell?.colKey === "prescription") {
      const { rowIdx } = this.activeCell;
      const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="prescription"]`);
      if (cell && this.handlePrescriptionPickerShortcut(e, rowIdx, cell)) return;
    }

    if (this.activeCell?.colKey === "extra") {
      const { rowIdx, colKey } = this.activeCell;
      const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${colKey}"]`);
      if (cell && this.handlePresetPickerShortcut(e, rowIdx, colKey, cell)) return;
    }

    if (this.activeCell?.colKey === "writer") {
      const { rowIdx } = this.activeCell;
      const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="writer"]`);
      if (cell && this.handleWriterPickerShortcut(e, rowIdx, cell)) return;
    }

    // 13) Enter / Shift+Enter -> Move Down / Up
    if (e.key === "Enter" && this.activeCell) {
      e.preventDefault();
      const nextRow = this.activeCell.rowIdx + (e.shiftKey ? -1 : 1);
      this.navigateCell(Math.max(0, nextRow), this.activeCell.colKey);
      return;
    }

    // 14) Tab / Shift+Tab -> Move Next / Prev Column
    if (e.key === "Tab" && this.activeCell) {
      e.preventDefault();
      this.navigateCol(this.activeCell.rowIdx, this.activeCell.colKey, e.shiftKey ? -1 : 1);
      return;
    }

    // Ctrl (또는 Cmd) + Shift + ArrowRight: 선택한 셀부터 우측에 내용이 연속으로 있는 셀까지 전체 선택
    if (isCtrlOrMeta && e.shiftKey && e.key === "ArrowRight" && this.activeCell) {
      e.preventDefault();
      const colOrder = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
      const startRow = this.selectedRange ? this.selectedRange.minRow : this.activeCell.rowIdx;
      const startCol = this.selectedRange ? this.selectedRange.minCol : colOrder.indexOf(this.activeCell.colKey);
      const rowData = this.getCurrentRows()[startRow];
      let targetCol = startCol;
      for (let c = startCol + 1; c < colOrder.length; c++) {
        const k = colOrder[c];
        if (String(rowData?.[k] ?? "").trim()) {
          targetCol = c;
        } else {
          break;
        }
      }
      this.extendCellSelection(startRow, targetCol);
      this.rememberHorizontalSelection();
      return;
    }

    // Row-header selection: Shift+Arrow moves endpoint, ArrowUp/ArrowDown moves entire row selection
    if (this.selectedRowRange && !isCtrlOrMeta && !e.altKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const rowCount = this.getCurrentRows().length;
      if (e.shiftKey) {
        const anchor = this.rowRangeStart ?? this.selectedRowRange.minRow;
        const end = this.rowRangeEnd ?? this.selectedRowRange.maxRow;
        const targetRow = Math.max(0, Math.min(rowCount - 1, end + (e.key === "ArrowDown" ? 1 : -1)));
        this.selectRowRange(anchor, targetRow);
        this.ensureCurrentCellVisible(this.elTableBody.querySelector(`tr[data-row-idx="${targetRow}"] .row-num`));
      } else {
        const currentRow = this.selectedRowRange.minRow;
        // 교차 검색이 활성화되어 있고 이전 날짜 기록이 있을 때
        if (e.key === "ArrowUp" && this.crossDateResults && this.crossDateResults.length > 0) {
          const visibleCurrentRows = Array.from(this.elTableBody.querySelectorAll(".excel-row:not(.cross-date-row):not(.cross-date-master-row):not([style*='display: none'])"));
          const firstVisibleRowIdx = visibleCurrentRows.length > 0 ? Number(visibleCurrentRows[0].dataset.rowIdx) : 0;
          if (currentRow <= firstVisibleRowIdx) {
            // ★ 현재 날짜 첫 표시 행에서 ArrowUp -> 파란 가로바를 넘어 이전 날짜 마지막 행 전체 선택!
            // clearSelection()은 데이터를 지우므로 사용하지 않고 시각적 선택만 해제
            this.clearHeaderSelections();
            const lastCrossIdx = this.crossDateResults.length - 1;
            this.selectCrossDateRow(lastCrossIdx);
            const scrollWrap = document.getElementById("crossDateScrollWrap");
            if (scrollWrap) scrollWrap.scrollTop = scrollWrap.scrollHeight;
            return;
          }
        }
        const targetRow = Math.max(0, Math.min(rowCount - 1, currentRow + (e.key === "ArrowDown" ? 1 : -1)));
        this.selectRowRange(targetRow, targetRow);
        this.ensureCurrentCellVisible(this.elTableBody.querySelector(`tr[data-row-idx="${targetRow}"] .row-num`));
      }
      return;
    }

    // 15) Arrow Keys Navigation (위/아래/좌/우 셀 이동)
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && this.activeCell) {
      e.preventDefault();
      const colOrder = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
      const from = e.shiftKey && this.selectedRange && this.rangeEnd && !this.selectedRowRange
        ? this.rangeEnd : { rowIdx: this.activeCell.rowIdx, colIdx: colOrder.indexOf(this.activeCell.colKey) };

      // ★ 이전 날짜 기록이 있고, 현재 날짜 첫 표시 행에서 ArrowUp을 누른 경우 -> 파란 가로바를 넘어 이전 날짜 마지막 행의 셀로 이동!
      if (e.key === "ArrowUp" && !e.shiftKey && this.crossDateResults && this.crossDateResults.length > 0) {
        const visibleCurrentRows = Array.from(this.elTableBody.querySelectorAll(".excel-row:not(.cross-date-row):not(.cross-date-master-row):not([style*='display: none'])"));
        const firstVisibleRowIdx = visibleCurrentRows.length > 0 ? Number(visibleCurrentRows[0].dataset.rowIdx) : 0;
        if (from.rowIdx <= firstVisibleRowIdx) {
          // clearSelection()은 데이터를 지우므로 사용하지 않고 시각적 선택만 해제
          this.clearHeaderSelections();
          document.querySelectorAll(".cell-focused, .active-row").forEach(el => el.classList.remove("cell-focused", "active-row"));
          this.activeCell = null;
          const lastRow = this.crossDateResults.length - 1;
          const targetColIdx = Math.max(1, Math.min(10, from.colIdx)); // No. 열은 숨김이므로 성별(1) 이상
          this.selectCrossDateCell(lastRow, targetColIdx, false);
          const scrollWrap = document.getElementById("crossDateScrollWrap");
          if (scrollWrap) scrollWrap.scrollTop = scrollWrap.scrollHeight;
          return;
        }
      }
      let targetRow = from.rowIdx;
      let targetColIdx = from.colIdx;
      if (e.key === "ArrowUp") targetRow--;
      if (e.key === "ArrowDown") targetRow++;
      if (e.key === "ArrowLeft") targetColIdx--;
      if (e.key === "ArrowRight") targetColIdx++;
      targetRow = Math.max(0, Math.min(this.getCurrentRows().length - 1, targetRow));
      targetColIdx = Math.max(0, Math.min(colOrder.length - 1, targetColIdx));
      const targetColKey = colOrder[targetColIdx];
      const targetCell = this.elTableBody.querySelector(`[data-row="${targetRow}"][data-col="${targetColKey}"]`);
      if (targetCell) {
        if (e.shiftKey) this.extendCellSelection(targetRow, targetColIdx);
        else {
          this.selectCell(targetRow, targetColKey, targetCell, false);
        }
        this.ensureCurrentCellVisible(targetCell);
      }
      return;
    }

    // 16) Direct character typing to begin editing (for text cells)
    if (this.activeCell?.colKey === "writer" && !isCtrlOrMeta && !e.altKey && /^Key[A-Z]$/.test(e.code)) {
      const cellEl = document.querySelector(`.excel-cell[data-row="${this.activeCell.rowIdx}"][data-col="writer"]`);
      if (cellEl && !cellEl.querySelector("input")) {
        e.preventDefault();
        this.startInlineEdit(this.activeCell.rowIdx, "writer", cellEl);
        const input = cellEl.querySelector("input");
        input.value = e.code.slice(3);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
    }
    if (this.activeCell && !isCtrlOrMeta && !e.altKey && (e.key.length === 1 || e.key === "Process" || e.keyCode === 229)) {
      const { rowIdx, colKey } = this.activeCell;
      if (colKey !== "gender") {
        const cellEl = document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="${colKey}"]`);
        if (cellEl && !cellEl.querySelector("input")) {
          this.startInlineEdit(rowIdx, colKey, cellEl);
        }
      }
    }

    // 17) Escape -> 검색 종료 및 적용한 행의 No. 셀로 복귀
    if (e.key === "Escape") {
      const appliedTarget = this.lastHistoryAppliedTarget;
      e.preventDefault();
      this.closeAutocompleteMenu();
      this.closeGenderDropdown();
      this.hideContextMenu();
      this.clipboardSelection = null;
      this.pendingCut = null;
      this.renderClipboardSelection();

      if (this.elSearchInput?.value?.trim()) {
        this.clearHeaderSelections();
        this.elSearchInput.value = "";
        this.handleSearch();
        this.historyOriginSelection = undefined;
        return;
      }

      // ★ 행 헤더 선택 상태에서 ESC → 해당 행의 No. 셀로 커서 이동
      if (this.selectedRowRange && !this.crossDateSelection) {
        const targetRow = this.selectedRowRange.minRow;
        this.clearHeaderSelections();
        document.querySelectorAll(".cell-focused").forEach(c => c.classList.remove("cell-focused"));
        document.querySelectorAll(".excel-row.active-row").forEach(r => r.classList.remove("active-row"));
        document.querySelectorAll(".range-selected, .range-border-top, .range-border-bottom, .range-border-left, .range-border-right").forEach(c => {
          c.classList.remove("range-selected", "range-border-top", "range-border-bottom", "range-border-left", "range-border-right");
        });
        this.selectedRowIdx = null;
        this.selectedColKey = null;
        this.selectedRange = null;
        this.selectedRowRange = null;
        this.rangeStart = null;
        this.rangeEnd = null;
        const cell = this.elTableBody.querySelector(`[data-row="${targetRow}"][data-col="no"]`);
        if (cell) {
          this.selectCell(targetRow, "no", cell, false);
          cell.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        this.elSheetContainer.focus({ preventScroll: true });
        return;
      }

      this.clearHeaderSelections();

      // ★ Ctrl+F 검색 필터가 활성화되어 있으면 해제하여 원래 화면으로 복원
      if (this.elSearchInput && this.elSearchInput.value.trim()) {
        this.elSearchInput.value = "";
        this.handleSearch();
      }
      // 교차 날짜 임시 행 및 원점 행 하이라이트 제거
      this.clearCrossDateRows();
      document.querySelectorAll(".search-origin-row").forEach(r => r.classList.remove("search-origin-row"));
      document.querySelectorAll(".cross-date-row-selected").forEach(r => r.classList.remove("cross-date-row-selected"));

      // 편집 중인 input이 있으면 blur하여 편집 종료
      const activeInput = document.querySelector(".cell-input-element");
      if (activeInput) {
        activeInput.blur();
      }

      // 셀 포커스 하이라이트 제거
      document.querySelectorAll(".cell-focused").forEach((c) => c.classList.remove("cell-focused"));

      // 활성 행 하이라이트 제거
      document.querySelectorAll(".excel-row.active-row").forEach((r) => r.classList.remove("active-row"));

      // 범위 선택 상태 해제
      document.querySelectorAll(".range-selected, .range-border-top, .range-border-bottom, .range-border-left, .range-border-right").forEach((c) => {
        c.classList.remove("range-selected", "range-border-top", "range-border-bottom", "range-border-left", "range-border-right");
      });

      // 수식 입력줄 초기화
      if (this.elFormulaInput) {
        this.elFormulaInput.value = "";
      }
      if (this.elCellAddress) {
        this.elCellAddress.textContent = "";
      }

      // 내부 상태 완전 초기화
      this.activeCell = null;
      this.selectedRowIdx = null;
      this.selectedColKey = null;
      this.selectedRange = null;
      this.selectedRowRange = null;
      this.rangeStart = null;
      this.rangeEnd = null;
      this.restoreAppliedHistorySelection(appliedTarget);
    }
  }

}
