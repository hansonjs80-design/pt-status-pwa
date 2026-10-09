// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTSheetActions {
  addNewRow(andFocus = true) {
    const rows = this.getCurrentRows();
    const formattedDate = this.currentDate.replace(/-/g, ".");
    const newRow = {
      no: "",
      gender: "",
      chartNo: "",
      name: "",
      part: "",
      prescription: "",
      extra: "",
      writer: DEFAULT_WRITER,
      memo: "",
      specialNote: "",
      date: formattedDate
    };
    rows.push(newRow);
    this.saveDataStore();
    this.renderTable();

    if (andFocus) {
      const newIdx = rows.length - 1;
      const targetCell = document.querySelector(`.excel-cell[data-row="${newIdx}"][data-col="chartNo"]`);
      if (targetCell) {
        targetCell.scrollIntoView({ behavior: "smooth", block: "center" });
        this.selectCell(newIdx, "chartNo", targetCell);
      }
    }
  }

  deleteRow(rowIdx) {
    const rows = this.getCurrentRows();
    if (rows.length <= 1) {
      // Just clear
      rows[0] = {
        no: "", gender: "", chartNo: "", name: "", part: "",
        prescription: "", extra: "", writer: DEFAULT_WRITER,
        memo: "", specialNote: "", date: this.currentDate.replace(/-/g, ".")
      };
    } else {
      rows.splice(rowIdx, 1);
    }
    this.saveDataStore();
    this.renderTable();
  }

  deleteSelectedRow() {
    if (this.selectedRowIdx === null) {
      alert("삭제할 행이나 셀을 먼저 선택해주세요.");
      return;
    }
    this.deleteRow(this.selectedRowIdx);
    this.selectedRowIdx = null;
    this.activeCell = null;
  }

  removeEmptyRows() {
    const rows = this.getCurrentRows();
    const filtered = rows.filter((r) => r.name || r.chartNo || r.part || r.prescription || r.extra);
    const formattedDate = this.currentDate.replace(/-/g, ".");
    while (filtered.length < DEFAULT_ROW_COUNT) {
      filtered.push({
        no: "",
        gender: "",
        chartNo: "",
        name: "",
        part: "",
        prescription: "",
        extra: "",
        writer: DEFAULT_WRITER,
        memo: "",
        specialNote: "",
        date: formattedDate
      });
    }
    this.dataStore[this.currentDate] = filtered;
    this.saveDataStore();
    this.renderTable();
    alert("데이터가 정리되었으며 기본 150행이 유지됩니다.");
  }

  parseClipboardGrid(text) {
    const grid = [[]]; let value = "", quoted = false;
    text = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"' && (quoted || value === "")) {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (char === "\t" || char === "\n")) {
        grid[grid.length - 1].push(value); value = "";
        if (char === "\n") grid.push([]);
      } else value += char;
    }
    grid[grid.length - 1].push(value);
    if (text.endsWith("\n") && grid.at(-1).length === 1 && grid.at(-1)[0] === "") grid.pop();
    return grid;
  }

  renderClipboardSelection() {
    const classes = ["clipboard-source", "clipboard-top", "clipboard-bottom", "clipboard-left", "clipboard-right"];
    this.elTableBody.querySelectorAll(".clipboard-source").forEach((cell) => cell.classList.remove(...classes));
    const selection = this.clipboardSelection;
    if (!selection || selection.date !== this.currentDate) return;
    const { minRow, maxRow, minCol, maxCol } = selection;
    const history = selection.kind === "history";
    this.elTableBody.querySelectorAll(history ? ".cross-date-cell" : ".excel-cell[data-col-idx]").forEach((cell) => {
      const row = Number(history ? cell.dataset.crossIdx : cell.dataset.row);
      const col = Number(history ? cell.dataset.crossColIdx : cell.dataset.colIdx);
      if (row < minRow || row > maxRow || col < minCol || col > maxCol) return;
      if (selection.cells && !selection.cells.includes(`${row}:${col}`)) return;
      cell.classList.add("clipboard-source");
      if (selection.cells) cell.classList.add("clipboard-top", "clipboard-bottom", "clipboard-left", "clipboard-right");
      if (row === minRow) cell.classList.add("clipboard-top");
      if (row === maxRow) cell.classList.add("clipboard-bottom");
      if (col === minCol) cell.classList.add("clipboard-left");
      if (col === maxCol) cell.classList.add("clipboard-right");
    });
  }

  copySelection() {
    this.pendingCut = null;
    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const rows = this.getCurrentRows();
    let tsvData = "";
    let copyRange = null;

    if (this.crossDateSelection) {
      copyRange = { ...this.crossDateSelection, kind: "history" };
      const { minRow, maxRow, minCol, maxCol } = copyRange;
      tsvData = this.crossDateResults.slice(minRow, maxRow + 1)
        .map((row, r) => colKeys.slice(minCol, maxCol + 1).map((key, c) => this.isSelectedCoordinate(minRow+r, minCol+c) ? row[key] ?? "" : "").join("\t")).join("\n");
    } else if (this.selectedRange) {
      // Range copy (TSV grid format)
      const { minRow, maxRow, minCol, maxCol } = this.selectedRange;
      copyRange = { ...this.selectedRange };
      const lines = [];
      for (let r = minRow; r <= maxRow; r++) {
        const rowVals = [];
        for (let c = minCol; c <= maxCol; c++) {
          const k = colKeys[c];
          rowVals.push(this.isSelectedCoordinate(r, c) && rows[r] ? (rows[r][k] ?? "") : "");
        }
        lines.push(rowVals.join("\t"));
      }
      tsvData = lines.join("\n");
    } else if (this.selectedColKey !== null) {
      // Entire column copy
      tsvData = rows.map((r) => r[this.selectedColKey] ?? "").join("\n");
      const col = colKeys.indexOf(this.selectedColKey);
      copyRange = { minRow: 0, maxRow: rows.length - 1, minCol: col, maxCol: col };
    } else if (this.activeCell) {
      // Single cell copy (빈 셀도 포함)
      tsvData = rows[this.activeCell.rowIdx] ? (rows[this.activeCell.rowIdx][this.activeCell.colKey] ?? "") : "";
      const col = colKeys.indexOf(this.activeCell.colKey);
      copyRange = { minRow: this.activeCell.rowIdx, maxRow: this.activeCell.rowIdx, minCol: col, maxCol: col };
    } else if (this.selectedRowIdx !== null) {
      tsvData = rows[this.selectedRowIdx] ? colKeys.map((k) => rows[this.selectedRowIdx][k] ?? "").join("\t") : "";
      copyRange = { minRow: this.selectedRowIdx, maxRow: this.selectedRowIdx, minCol: 0, maxCol: colKeys.length - 1 };
    }

    if (copyRange) {
      const sourceRows = copyRange.kind === "history" ? this.crossDateResults : rows;
      const formatting = [];
      for (let r = copyRange.minRow; r <= copyRange.maxRow; r++) {
        const line = [];
        for (let c = copyRange.minCol; c <= copyRange.maxCol; c++) {
          const key = colKeys[c];
          const selector = copyRange.kind === "history" ? `[data-cross-idx="${r}"][data-cross-col="${key}"]` : `[data-row="${r}"][data-col="${key}"]`;
          line.push(this.isSelectedCoordinate(r, c) ? this.captureCellFormatting(sourceRows[r] || {}, key, this.elTableBody?.querySelector(selector)) : null);
        }
        formatting.push(line);
      }
      this.clipboardBuffer = tsvData;
      this.clipboardSelection = { ...copyRange, formatting, rowSelection: this.crossDateSelection ? Boolean(this.isCrossDateRowSelected) : Boolean(this.selectedRowRange), date: this.currentDate, cells: this.selectedCellSet ? [...this.selectedCellSet] : null };
      this.renderClipboardSelection();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tsvData).catch((err) => {
          console.warn("Clipboard write failed, internal buffer used:", err);
        });
      }
      this.showSaveIndicator("클립보드에 복사됨");
    }
  }

  cutSelection() {
    if (this.crossDateSelection) return;
    this.copySelection();
    if (!this.clipboardSelection) return;
    const { minRow, maxRow, minCol, maxCol } = this.clipboardSelection;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const rows = this.getCurrentRows();
    this.pendingCut = { date: this.currentDate, text: this.clipboardBuffer, cells: [] };
    for (let r = minRow; r <= maxRow; r++) for (let c = minCol; c <= maxCol; c++) {
      if (!this.isSelectedCoordinate(r, c)) continue;
      this.pendingCut.cells.push({ row: rows[r], key: keys[c], value: rows[r]?.[keys[c]] ?? "" });
    }
    this.showSaveIndicator("잘라내기 선택됨 · 붙여넣으면 이동합니다");
  }

  async pasteSelection(suppliedText, suppliedHtml = "") {
    if (document.activeElement?.matches?.(".cell-input-element") || document.activeElement === this.elFormulaInput) {
      document.activeElement?.blur?.();
    }
    if (typeof this.captureHistory === "function") this.captureHistory();
    let text = suppliedText ?? "";
    let html = suppliedHtml;
    if (suppliedText === undefined && navigator.clipboard?.read) {
      try {
        for (const item of await navigator.clipboard.read()) {
          if (!text && item.types.includes("text/plain")) text = await (await item.getType("text/plain")).text();
          if (!html && item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
        }
      } catch { /* Text-only clipboard access remains a fallback. */ }
    }
    if (!text && suppliedText === undefined && navigator.clipboard && navigator.clipboard.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (err) {
        text = this.clipboardBuffer;
      }
    } else if (!text && suppliedText === undefined) {
      text = this.clipboardBuffer;
    }
    if (!text && suppliedText === undefined && this.clipboardBuffer) text = this.clipboardBuffer;
    if (!text) {
      this.showSaveIndicator("붙여넣을 데이터가 없습니다.", true);
      return;
    }

    const sheetContainer = this.elSheetContainer;
    const prevScrollTop = sheetContainer?.scrollTop ?? 0;
    const prevScrollLeft = sheetContainer?.scrollLeft ?? 0;
    const prevHistoryWrap = typeof document !== "undefined" && typeof document?.getElementById === "function" ? document.getElementById("crossDateScrollWrap") : null;
    const prevHistoryScrollTop = prevHistoryWrap?.scrollTop ?? this._preservedHistoryScrollTop ?? null;
    if (prevHistoryScrollTop !== null) {
      this._preservedHistoryScrollTop = prevHistoryScrollTop;
    }
    const savedCrossDateSelection = this.crossDateSelection ? { ...this.crossDateSelection } : null;
    const wasCrossDateRowSelected = Boolean(this.isCrossDateRowSelected);
    const isHistoryActive = Boolean(this.elSearchInput?.value?.trim());

    this._isPasting = true;
    try {
      const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
      const rows = this.getCurrentRows();

      const grid = this.parseClipboardGrid(text);
      const htmlColors = this.parseClipboardHtmlColors(html);
      const sourceSelection = !htmlColors && text === this.clipboardBuffer ? this.clipboardSelection : null;
      const historySourceSelection = savedCrossDateSelection || (sourceSelection?.kind === "history" ? sourceSelection : null);

      // Determine start coordinate
      let startRow = 0;
      let startCol = 0;

      if (this.selectedRange) {
        startRow = this.selectedRange.minRow;
        startCol = this.selectedRange.minCol;
      } else if (this.activeCell) {
        startRow = this.activeCell.rowIdx;
        startCol = colKeys.indexOf(this.activeCell.colKey);
        if (startCol < 0) startCol = 0;
      } else if (this.selectedRowIdx !== null) {
        startRow = this.selectedRowIdx;
        startCol = 0;
      } else if (this.selectedColKey !== null) {
        startRow = 0;
        startCol = colKeys.indexOf(this.selectedColKey);
        if (startCol < 0) startCol = 0;
      }

      // Clear the original only once a matching paste is ready, before writing (overlap-safe).
      const cut = this.pendingCut;
      if (cut && !htmlColors && cut.text === text && cut.date === this.currentDate) {
        for (const { row, key, value } of cut.cells) if (rows.includes(row) && (row[key] ?? "") === value) row[key] = "";
      }
      this.pendingCut = null;

      // One paste transaction uses the same current time for all pasted names.
      const pastedAt = new Date();
      // Allocate the destination once. addNewRow saves and rebuilds the table;
      // calling it for each pasted row caused repeated renders and undo entries.
      const missingRows = startRow + grid.length - rows.length;
      if (missingRows > 0) rows.push(...this.createDefaultEmptyRows(missingRows));
      // Apply grid data to rows
      grid.forEach((rowVals, rOffset) => {
        const r = startRow + rOffset;
        let includesName = false;
        rowVals.forEach((val, cOffset) => {
          if (sourceSelection?.cells && !sourceSelection.cells.includes(`${sourceSelection.minRow+rOffset}:${sourceSelection.minCol+cOffset}`)) return;
          const c = startCol + cOffset;
          if (c < colKeys.length) {
            const k = colKeys[c];
            if (k) {
              const trimmed = val.trim();
              if (k === "name" && trimmed) includesName = true;
              rows[r][k] = k === "gender" ? this.normalizeGenderInput(trimmed)
                : k === "writer" ? this.normalizeWriterInput(trimmed) : trimmed;
              const external = htmlColors?.[rOffset]?.[cOffset];
              if (external?.text === trimmed) this.applyPastedCellColors(rows[r], k, external.formatting);
              else {
                const formatting = sourceSelection?.formatting?.[rOffset]?.[cOffset];
                if (formatting) this.applyCopiedCellFormatting(rows[r], k, formatting);
              }
            }
          }
        });
        rowVals.forEach((value, offset) => {
          if (!sourceSelection?.cells || sourceSelection.cells.includes(`${sourceSelection.minRow+rOffset}:${sourceSelection.minCol+offset}`)) {
            if (this.applyCompoundPatientInput(rows[r], colKeys[startCol + offset], value)) includesName = true;
          }
        });
        // Apply after every pasted field so an old copied visitTime cannot win.
        if (includesName && String(rows[r].name ?? "").trim()) this.setVisitTimeNow(rows[r], pastedAt);
      });

      // Pasting a history range is also an application to the current date.
      // Remember its actual destination so closing search restores No. there.
      if (sourceSelection?.kind === "history" || this.elSearchInput?.value?.trim()) {
        this.lastHistoryAppliedTarget = { date: this.currentDate, row: rows[startRow], rowIdx: startRow };
      }
      // Include trailing entry rows before saving the undo snapshot. Adding
      // them during render would otherwise consume the first Undo action.
      this.getCurrentRows();
      this.saveDataStore();
      this.renderTable();
      this.showSaveIndicator("붙여넣기 완료됨");
      this.clipboardSelection = null;
      this.renderClipboardSelection();
      if (sourceSelection?.rowSelection && startCol === 0) {
        this.selectRowRange(startRow, startRow + grid.length - 1, Math.min(sourceSelection.maxCol, colKeys.length - 1));
        this.elSheetContainer.focus({ preventScroll: true });
      } else {
        const cell = this.elTableBody?.querySelector(`[data-row="${startRow}"][data-col="${colKeys[startCol]}"]`);
        if (cell) {
          this.selectCell(startRow, colKeys[startCol], cell, false);
          this.rangeStart = { rowIdx: startRow, colIdx: startCol, colKey: colKeys[startCol] };
          const endCol = Math.min(colKeys.length - 1, startCol + Math.max(...grid.map(row => row.length)) - 1);
          this.rangeEnd = { rowIdx: startRow + grid.length - 1, colIdx: endCol, colKey: colKeys[endCol] };
          this.updateRangeSelection();
          this.elSheetContainer.focus({ preventScroll: true });
        }
      }

      if (typeof clearTimeout === "function") clearTimeout(this.historyCurrentScrollTimer);
      if (isHistoryActive) {
        if (historySourceSelection && this.crossDateResults?.length) {
          this.crossDateSelection = historySourceSelection;
          this.isCrossDateRowSelected = wasCrossDateRowSelected;
          if (typeof this.renderCrossDateSelectionHighlight === "function") {
            this.renderCrossDateSelectionHighlight();
          }
          // Keep the copied source's visual highlight, but the pasted daily
          // range now owns keyboard navigation, copying and editing.
          this.crossDateSelection = null;
          this.isCrossDateRowSelected = false;
        }
        const restoreScrollPositions = () => {
          if (sheetContainer) {
            sheetContainer.scrollTop = prevScrollTop;
            sheetContainer.scrollLeft = prevScrollLeft;
          }
          if (prevHistoryScrollTop !== null) {
            const newWrap = typeof document !== "undefined" && typeof document?.getElementById === "function" ? document.getElementById("crossDateScrollWrap") : null;
            if (newWrap) newWrap.scrollTop = prevHistoryScrollTop;
          }
        };
        restoreScrollPositions();
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => {
            restoreScrollPositions();
            setTimeout(restoreScrollPositions, 30);
          });
        }
      } else {
        const pastedCell = this.elTableBody?.querySelector(`[data-row="${startRow}"][data-col="${colKeys[startCol]}"]`);
        pastedCell?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    } finally {
      this._isPasting = false;
    }
  }

  clearSelection() {
    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const rows = this.getCurrentRows();

    if (this.selectedRange) {
      const { minRow, maxRow, minCol, maxCol } = this.selectedRange;
      for (let r = minRow; r <= maxRow; r++) {
        if (rows[r]) {
          for (let c = minCol; c <= maxCol; c++) {
            if (!this.isSelectedCoordinate(r, c)) continue;
            const k = colKeys[c];
            if (k) {
              rows[r][k] = "";
            }
          }
        }
      }
    } else if (this.selectedColKey !== null) {
      this.clearColData(this.selectedColKey);
      return;
    } else if (this.activeCell && rows[this.activeCell.rowIdx]) {
      const { rowIdx, colKey } = this.activeCell;
      rows[rowIdx][colKey] = "";
    } else if (this.selectedRowIdx !== null) {
      this.clearRowData(this.selectedRowIdx);
      return;
    }

    this.saveDataStore();
    this.renderTable();
    this.showSaveIndicator("내용 지우기 완료");
  }

  // =============================================================================
  // Row Manipulations (행 삽입, 행 데이터 삭제, 행 삭제)
  // =============================================================================
  insertRowAbove(targetRowIdx) {
    const rows = this.getCurrentRows();
    const formattedDate = this.currentDate.replace(/-/g, ".");
    const newRow = {
      no: "",
      gender: "",
      chartNo: "",
      name: "",
      part: "",
      prescription: "",
      extra: "",
      writer: DEFAULT_WRITER,
      memo: "",
      specialNote: "",
      date: formattedDate
    };

    const insertIdx = Math.max(0, Math.min(targetRowIdx, rows.length));
    rows.splice(insertIdx, 0, newRow);

    this.saveDataStore();
    this.renderTable();
    this.navigateCell(insertIdx, "chartNo");
    this.showSaveIndicator(`${insertIdx + BASE_ROW_NUMBER}행 위에 1개 행이 삽입되었습니다.`);
  }

  insertRowBelow(targetRowIdx) {
    const rows = this.getCurrentRows();
    const formattedDate = this.currentDate.replace(/-/g, ".");
    const newRow = {
      no: "",
      gender: "",
      chartNo: "",
      name: "",
      part: "",
      prescription: "",
      extra: "",
      writer: DEFAULT_WRITER,
      memo: "",
      specialNote: "",
      date: formattedDate
    };

    const insertIdx = Math.max(0, Math.min(targetRowIdx + 1, rows.length));
    rows.splice(insertIdx, 0, newRow);

    this.saveDataStore();
    this.renderTable();
    this.navigateCell(insertIdx, "chartNo");
    this.showSaveIndicator(`${insertIdx + BASE_ROW_NUMBER}행 아래에 1개 행이 삽입되었습니다.`);
  }

  clearRowData(targetRowIdx) {
    const rows = this.getCurrentRows();
    let minRow = targetRowIdx;
    let maxRow = targetRowIdx;

    if (this.selectedRowRange &&
        targetRowIdx >= this.selectedRowRange.minRow &&
        targetRowIdx <= this.selectedRowRange.maxRow) {
      minRow = this.selectedRowRange.minRow;
      maxRow = this.selectedRowRange.maxRow;
    }

    for (let r = minRow; r <= maxRow; r++) {
      if (rows[r]) {
        const rowObj = rows[r];
        rowObj.no = "";
        rowObj.gender = "";
        rowObj.chartNo = "";
        rowObj.name = "";
        rowObj.part = "";
        rowObj.prescription = "";
        rowObj.extra = "";
        rowObj.memo = "";
        rowObj.specialNote = "";
        rowObj.visitTime = "";
        delete rowObj._visitedAt;
      }
    }

    this.saveDataStore();
    this.renderTable();
    const count = maxRow - minRow + 1;
    const msg = count > 1
      ? `${minRow + BASE_ROW_NUMBER}~${maxRow + BASE_ROW_NUMBER}행 (${count}개 행) 데이터가 삭제되었습니다.`
      : `${minRow + BASE_ROW_NUMBER}행 데이터가 삭제되었습니다.`;
    this.showSaveIndicator(msg);
  }

  handleRowDeleteShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || this.crossDateSelection ||
        ![event.key, event.code].some(key => ["-", "_", "Minus", "NumpadSubtract"].includes(key))) return false;
    const rowIdx = this.selectedRowRange?.minRow ?? this.activeCell?.rowIdx ?? this.selectedRowIdx;
    if (!Number.isInteger(rowIdx)) return false;
    const range = this.selectedRange;
    const singleCell = this.activeCell && !this.selectedRowRange && !this.selectedColumnRange &&
      this.selectedColKey == null && (!this.selectedCellSet || this.selectedCellSet.size === 1) &&
      (!range || (range.minRow === range.maxRow && range.minCol === range.maxCol));
    const nextColKey = singleCell ? this.activeCell.colKey : "no";
    event.preventDefault();
    event.stopPropagation();
    // Commit an active editor before removing its row so a later blur cannot overwrite the next row.
    if (document.activeElement?.matches(".cell-input-element")) document.activeElement.blur();
    this.deleteRowAt(rowIdx, nextColKey);
    this.elSheetContainer.focus({ preventScroll: true });
    return true;
  }

  deleteRowAt(targetRowIdx, nextColKey = "no") {
    const rows = this.getCurrentRows();
    let minRow = targetRowIdx;
    let deleteCount = 1;

    if (this.selectedRowRange &&
        targetRowIdx >= this.selectedRowRange.minRow &&
        targetRowIdx <= this.selectedRowRange.maxRow) {
      minRow = this.selectedRowRange.minRow;
      deleteCount = this.selectedRowRange.maxRow - this.selectedRowRange.minRow + 1;
    }

    if (minRow >= 0 && minRow < rows.length) {
      rows.splice(minRow, deleteCount);
      // Guarantee minimum 150 rows maintained
      const formattedDate = this.currentDate.replace(/-/g, ".");
      while (rows.length < DEFAULT_ROW_COUNT) {
        rows.push({
          no: "",
          gender: "",
          chartNo: "",
          name: "",
          part: "",
          prescription: "",
          extra: "",
          writer: DEFAULT_WRITER,
          memo: "",
          specialNote: "",
          date: formattedDate
        });
      }
      this.activeCell = null;
      this.clearHeaderSelections();
      this.selectedRowIdx = null;
      this.selectedRowRange = null;
      this.clipboardSelection = null;
      this.saveDataStore();
      this.renderTable();
      const nextRowIdx = Math.min(minRow, rows.length - 1);
      const nextCell = this.elTableBody.querySelector(`[data-row="${nextRowIdx}"][data-col="${nextColKey}"]`);
      if (nextCell) this.selectCell(nextRowIdx, nextColKey, nextCell);
      const msg = deleteCount > 1
        ? `${minRow + BASE_ROW_NUMBER}~${minRow + deleteCount - 1 + BASE_ROW_NUMBER}행 (${deleteCount}개 행)이 삭제되었습니다.`
        : `${minRow + BASE_ROW_NUMBER}행이 삭제되었습니다.`;
      this.showSaveIndicator(msg);
    }
  }

  clearColData(colKey) {
    if (!colKey) return;
    const rows = this.getCurrentRows();
    rows.forEach((r) => {
      r[colKey] = "";
    });
    this.saveDataStore();
    this.renderTable();
    this.showSaveIndicator(`${colKey} 열 데이터 비우기 완료`);
  }

  // =============================================================================
  // Excel Keyboard Shortcuts Handler (엑셀 기반 키보드 단축키 처리)
  // =============================================================================
}
