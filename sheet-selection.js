// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTSheetSelection {
  updateActiveHeaders(rowIdx, colKey) {
    document.querySelectorAll(".col-letter, .b-header, .row-num").forEach((el) => {
      el.classList.remove("header-active");
    });

    const activeColLetter = document.querySelector(`.col-letter[data-col="${colKey}"]`);
    const activeBHeader = document.querySelector(`.b-header[data-col="${colKey}"]`);
    if (activeColLetter) activeColLetter.classList.add("header-active");
    if (activeBHeader) activeBHeader.classList.add("header-active");

    const rowTr = document.querySelector(`tr[data-row-idx="${rowIdx}"]`);
    if (rowTr) {
      const activeRowNum = rowTr.querySelector(".row-num");
      if (activeRowNum) activeRowNum.classList.add("header-active");
    }
  }

  toggleCellSelection(row, col, kind = "current") {
    document.activeElement?.blur();
    let cells = new Set(this.selectedCellKind === kind ? this.selectedCellSet : []);
    if (!this.selectedCellSet || this.selectedCellKind !== kind) {
      const range = kind === "history" ? this.crossDateSelection : this.selectedRange;
      if (range) for (let r = range.minRow; r <= range.maxRow; r++) for (let c = range.minCol; c <= range.maxCol; c++) cells.add(`${r}:${c}`);
      else if (kind === "current" && this.activeCell) {
        const keys = ["no","gender","chartNo","name","part","prescription","extra","writer","memo","specialNote","visitTime"];
        cells.add(`${this.activeCell.rowIdx}:${keys.indexOf(this.activeCell.colKey)}`);
      }
    }
    const id = `${row}:${col}`;
    if (cells.has(id)) cells.delete(id); else cells.add(id);
    this.clearHeaderSelections();
    this.activeCell = null; this.selectedRowIdx = null; this.selectedColKey = null;
    this.isSelectingRange = false; this.isSelectingCrossDate = false;
    this.elTableBody.querySelectorAll(".cell-focused, .active-row").forEach(el => el.classList.remove("cell-focused", "active-row"));
    if (cells.size) {
      this.selectedCellSet = cells; this.selectedCellKind = kind;
      const positions = [...cells].map(id => id.split(":").map(Number));
      const range = { minRow: Math.min(...positions.map(p=>p[0])), maxRow: Math.max(...positions.map(p=>p[0])), minCol: Math.min(...positions.map(p=>p[1])), maxCol: Math.max(...positions.map(p=>p[1])) };
      if (kind === "history") this.crossDateSelection = { ...range, startRow: range.minRow, startCol: range.minCol, endRow: row, endCol: col };
      else this.selectedRange = range;
      this.paintCellSet();
    }
    this.elSelectedCellCoords.textContent = `${cells.size}개 셀 선택`;
    this.elSheetContainer.focus({ preventScroll: true });
  }

  isSelectedCoordinate(row, col) {
    return !this.selectedCellSet || this.selectedCellSet.has(`${row}:${col}`);
  }

  paintCellSet() {
    if (!this.selectedCellSet) return;
    const history = this.selectedCellKind === "history";
    this.elTableBody.querySelectorAll(history ? ".cross-date-cell" : ".excel-cell[data-col-idx]").forEach(cell => {
      const row = Number(history ? cell.dataset.crossIdx : cell.dataset.row);
      const col = Number(history ? cell.dataset.crossColIdx : cell.dataset.colIdx);
      cell.classList.toggle("is-discrete-selected", this.selectedCellSet.has(`${row}:${col}`));
    });
  }

  clearHeaderSelections() {
    this.horizontalSelectionMode = null;
    this.selectedCellSet = null; this.selectedCellKind = null;
    this.elTableBody?.querySelectorAll(".is-discrete-selected").forEach(cell => cell.classList.remove("is-discrete-selected"));
    this.elSheetContainer.classList.remove("has-cell-range");
    this.clearCrossDateSelection();
    this.cancelFillDrag();
    document.querySelectorAll(".cell-fill-handle").forEach((handle) => handle.remove());
    document.querySelectorAll(".col-letter, .b-header, .row-num, .corner-header").forEach((el) => {
      el.classList.remove("selected");
    });
    document.querySelectorAll(".excel-cell").forEach((el) => {
      el.classList.remove(
        "col-selected",
        "row-selected",
        "all-selected",
        "range-selected",
        "range-border-top",
        "range-border-bottom",
        "range-border-left",
        "range-border-right"
      );
    });
    this.selectedRange = null;
    this.selectedColumnRange = null;
    this.columnAnchor = null;
    this.selectedRowRange = null;
    this.rowRangeStart = null;
    this.rowRangeEnd = null;
  }

  extendCellSelection(rowIdx, colIdx) {
    if (!this.activeCell) return;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    if (this.isEditingCell()) document.activeElement.blur();
    if (!this.selectedRange || this.selectedRowRange || !this.rangeStart) {
      this.rangeStart = { ...this.activeCell, colIdx: keys.indexOf(this.activeCell.colKey) };
    }
    this.rangeEnd = {
      rowIdx: Math.max(0, Math.min(this.getCurrentRows().length - 1, rowIdx)),
      colIdx: Math.max(0, Math.min(keys.length - 1, colIdx))
    };
    this.rangeEnd.colKey = keys[this.rangeEnd.colIdx];
    this.updateRangeSelection();
    const anchor = this.elTableBody.querySelector(`[data-row="${this.activeCell.rowIdx}"][data-col="${this.activeCell.colKey}"]`);
    if (anchor && this.activeCell.colKey !== "gender") this.startInlineEdit(this.activeCell.rowIdx, this.activeCell.colKey, anchor, true);
    else this.elSheetContainer.focus({ preventScroll: true });
  }

  updateRangeSelection() {
    if (!this.rangeStart || !this.rangeEnd) return;

    const minRow = Math.min(this.rangeStart.rowIdx, this.rangeEnd.rowIdx);
    const maxRow = Math.max(this.rangeStart.rowIdx, this.rangeEnd.rowIdx);
    const minCol = Math.min(this.rangeStart.colIdx, this.rangeEnd.colIdx);
    const maxCol = Math.max(this.rangeStart.colIdx, this.rangeEnd.colIdx);

    this.selectedRange = { minRow, maxRow, minCol, maxCol };
    this.elSheetContainer.classList.toggle("has-cell-range", minRow !== maxRow || minCol !== maxCol);

    // Clear previous range highlight classes
    document.querySelectorAll(".excel-cell").forEach((c) => {
      c.classList.remove(
        "range-selected",
        "range-border-top",
        "range-border-bottom",
        "range-border-left",
        "range-border-right"
      );
    });

    const colLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
    let cellCount = 0;
    let numericSum = 0;
    let numericCount = 0;

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = document.querySelector(`.excel-cell[data-row="${r}"][data-col-idx="${c}"]`);
        if (cell) {
          cellCount++;
          cell.classList.add("range-selected");

          if (r === minRow) cell.classList.add("range-border-top");
          if (r === maxRow) cell.classList.add("range-border-bottom");
          if (c === minCol) cell.classList.add("range-border-left");
          if (c === maxCol) cell.classList.add("range-border-right");

          const textVal = cell.textContent.trim();
          const num = parseFloat(textVal);
          if (!isNaN(num) && isFinite(num) && String(num) === textVal) {
            numericSum += num;
            numericCount++;
          }
        }
      }
    }

    const startLetter = colLetters[this.rangeStart.colIdx] || "A";
    const startRowNum = BASE_ROW_NUMBER + this.rangeStart.rowIdx;

    if (minRow === maxRow && minCol === maxCol) {
      // Single cell selected
      this.elCellAddress.textContent = `${startLetter}${startRowNum}`;
      this.elSelectedCellCoords.textContent = `${startLetter}${startRowNum}`;
    } else {
      // Multi-cell range selected (e.g. C3:E8)
      const rangeText = `${colLetters[minCol]}${BASE_ROW_NUMBER + minRow}:${colLetters[maxCol]}${BASE_ROW_NUMBER + maxRow}`;
      this.elCellAddress.textContent = rangeText;

      let statText = `선택: ${rangeText} (${cellCount}개 셀)`;
      if (numericCount > 0) {
        const avg = (numericSum / numericCount).toFixed(1);
        statText += ` | 개수: ${numericCount} | 합계: ${numericSum} | 평균: ${avg}`;
      }
      this.elSelectedCellCoords.textContent = statText;
    }
    this.updateFontColorIndicator();
    this.updateBackgroundColorIndicator();
  }

  selectEntireColumn(colKey, colLetter, endKey = colKey) {
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const first = keys.indexOf(colKey), last = keys.indexOf(endKey);
    if (first < 0 || last < 0) return;
    document.activeElement?.blur();
    window.getSelection()?.removeAllRanges();
    this.clearHeaderSelections();
    this.activeCell = null;
    this.selectedColKey = colKey;
    this.selectedRowIdx = null;
    this.columnAnchor = colKey;
    this.selectedColumnRange = { minCol: Math.min(first, last), maxCol: Math.max(first, last) };
    this.selectedRange = { ...this.selectedColumnRange, minRow: 0, maxRow: this.getCurrentRows().length - 1 };
    document.querySelectorAll(".cell-focused, .active-row, .header-active").forEach(el => el.classList.remove("cell-focused", "active-row", "header-active"));
    for (let col = this.selectedColumnRange.minCol; col <= this.selectedColumnRange.maxCol; col++) {
      document.querySelectorAll(`.col-letter[data-col="${keys[col]}"], .b-header[data-col="${keys[col]}"]`).forEach(el => el.classList.add("selected"));
      this.elTableBody.querySelectorAll(`.excel-cell[data-col="${keys[col]}"]`).forEach(cell => {
        cell.classList.add("col-selected");
        if (col === this.selectedColumnRange.minCol) cell.classList.add("range-border-left");
        if (col === this.selectedColumnRange.maxCol) cell.classList.add("range-border-right");
        if (Number(cell.dataset.row) === 0) cell.classList.add("range-border-top");
        if (Number(cell.dataset.row) === this.selectedRange.maxRow) cell.classList.add("range-border-bottom");
      });
    }
    const label = `${String.fromCharCode(65 + this.selectedColumnRange.minCol)}:${String.fromCharCode(65 + this.selectedColumnRange.maxCol)}`;
    this.elCellAddress.textContent = label;
    this.elSelectedCellCoords.textContent = `${label}열 선택`;
    this.elFormulaInput.value = "";
    this.elSheetContainer.focus({ preventScroll: true });
    this.updateFontColorIndicator();
    this.updateBackgroundColorIndicator();
  }

  selectEntireRow(rowIdx) {
    this.selectRowRange(rowIdx, rowIdx, 9);
  }

  selectRowRange(startRowIdx, endRowIdx, lastCol = 9) {
    lastCol = Math.min(lastCol, 9);
    if (this.genderPickerState) this.closeGenderDropdown();
    // Clear native browser text highlighting before painting the spreadsheet selection.
    window.getSelection()?.removeAllRanges();
    // Finish the current edit before replacing cell selection with row selection.
    const focusedElement = document.activeElement;
    if (focusedElement === this.elFormulaInput ||
        focusedElement?.matches(".cell-input-element, .cell-gender-select")) {
      focusedElement.blur();
    }
    this.activeCell = null;
    this.isSelectingRange = false;
    this.rangeStart = null;
    this.rangeEnd = null;
    document.querySelectorAll(".cell-focused, .active-row, .header-active").forEach((el) => {
      el.classList.remove("cell-focused", "active-row", "header-active");
    });
    this.clearHeaderSelections();

    const minRow = Math.min(startRowIdx, endRowIdx);
    const maxRow = Math.max(startRowIdx, endRowIdx);

    this.rowRangeStart = startRowIdx;
    this.rowRangeEnd = endRowIdx;
    this.selectedRowRange = { minRow, maxRow };
    this.selectedRowIdx = minRow;
    this.selectedColKey = null;

    // Ctrl/Cmd+A stops at specialNote; direct row-header selection keeps all data columns.
    this.selectedRange = { minRow, maxRow, minCol: 0, maxCol: lastCol };

    for (let r = minRow; r <= maxRow; r++) {
      const rowTr = document.querySelector(`tr[data-row-idx="${r}"]`);
      if (rowTr) {
        const rowNumTh = rowTr.querySelector(".row-num");
        if (rowNumTh) rowNumTh.classList.add("selected");
        const cells = rowTr.querySelectorAll(".excel-cell");
        cells.forEach((cell, colIdx) => {
          if (colIdx > lastCol) return;
          cell.classList.add("row-selected");
          if (r === minRow) cell.classList.add("range-border-top");
          if (r === maxRow) cell.classList.add("range-border-bottom");
          if (colIdx === 0) cell.classList.add("range-border-left");
          if (colIdx === Math.min(lastCol, cells.length - 1)) cell.classList.add("range-border-right");
        });
      }
    }

    const startNum = BASE_ROW_NUMBER + minRow;
    const endNum = BASE_ROW_NUMBER + maxRow;

    if (minRow === maxRow) {
      this.elCellAddress.textContent = `${startNum}:${startNum}`;
      this.elSelectedCellCoords.textContent = `${startNum}행 전체 선택`;
    } else {
      const rowCount = maxRow - minRow + 1;
      this.elCellAddress.textContent = `${startNum}:${endNum}`;
      this.elSelectedCellCoords.textContent = `${startNum}~${endNum}행 선택 (${rowCount}개 행)`;
    }
    this.elFormulaInput.value = "";
    this.updateHistoryDestinationHighlight();
    this.elSheetContainer.focus({ preventScroll: true });
    this.updateFontColorIndicator();
    this.updateBackgroundColorIndicator();
  }

  selectAllCells() {
    document.activeElement?.blur();
    this.selectRowRange(0, this.getCurrentRows().length - 1);
    const cornerHeader = document.getElementById("cornerHeader");
    cornerHeader?.classList.add("selected");
    this.elCellAddress.textContent = "1:전체";
    this.elSelectedCellCoords.textContent = "전체 시트 선택";
    this.elFormulaInput.value = "";
    this.elSheetContainer.focus({ preventScroll: true });
  }

  sortByColumn(colKey, requestedDirection) {
    const direction = requestedDirection || (this.sortState.colKey !== colKey ? "asc" :
      this.sortState.direction === "asc" ? "desc" : this.sortState.direction === "desc" ? "original" : "asc");
    const label = { asc: "오름차순", desc: "내림차순", original: "원래 순서" }[direction];
    if (!confirm(`${label}(으)로 정렬할까요?
되돌리기로 정렬 전 상태를 복구할 수 있습니다.`)) return;
    if (this.isEditingCell()) document.activeElement.blur();
    const rows = this.getCurrentRows();
    this.captureHistory();
    const maxOrder = Math.max(-1, ...rows.map(row => row._originalOrder ?? -1));
    let nextOrder = maxOrder + 1;
    rows.forEach(row => { if (row._originalOrder == null) row._originalOrder = nextOrder++; });
    this.sortState = { colKey, direction };
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const filled = row => keys.some(key => String(row[key] ?? "").trim());
    const ordered = rows.slice().sort((a, b) => {
      if (direction === "original") return a._originalOrder - b._originalOrder;
      if (filled(a) !== filled(b)) return filled(a) ? -1 : 1;
      const valueA = colKey === "visitTime" ? this.getVisitTime(a) : String(a[colKey] ?? "");
      const valueB = colKey === "visitTime" ? this.getVisitTime(b) : String(b[colKey] ?? "");
      const result = valueA.localeCompare(valueB, "ko", { numeric: true });
      return direction === "asc" ? result : -result;
    });
    this.dataStore[this.currentDate] = ordered;
    this.activeCell = null; this.clearHeaderSelections();
    this.saveDataStore(); this.renderTable();
    document.querySelectorAll(".sort-indicator").forEach(el => { el.textContent = ""; });
    const indicator = document.querySelector(`.b-header[data-col="${colKey}"] .sort-indicator`);
    if (indicator) indicator.textContent = direction === "asc" ? " ▲" : direction === "desc" ? " ▼" : " ↺";
  }

}
