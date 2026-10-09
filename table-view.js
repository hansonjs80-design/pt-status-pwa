// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTTableView {
  // Render main Excel table
  renderTable() {
    this.pendingHistorySearchSelection = this.captureHistorySearchSelection();
    const existingHistoryWrap = typeof document !== "undefined" && typeof document?.getElementById === "function" ? document.getElementById("crossDateScrollWrap") : null;
    if (existingHistoryWrap) {
      this._preservedHistoryScrollTop = existingHistoryWrap.scrollTop;
    }
    this.restoreCurrentTableHeader();
    this.cancelFillDrag();
    if (!this._isPasting) {
      this.clearCrossDateSelection();
    }
    const rows = this.getCurrentRows();
    const selectedRows = this.selectedRowRange && { ...this.selectedRowRange };
    const selectedRange = this.selectedRange && { ...this.selectedRange };
    this.elTableBody.innerHTML = "";

    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const colLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
    const newPatientFlags = this.getNewPatientRowFlags(rows);

    rows.forEach((row, rowIdx) => {
      const tr = document.createElement("tr");
      tr.className = "excel-row";
      tr.dataset.rowIdx = rowIdx;
      tr.classList.toggle("new-patient-row", newPatientFlags[rowIdx]);
      tr.classList.toggle("lunch-break-row", Boolean(row._lunchBefore));

      // Row Number Header (1, 2, 3...)
      const excelRowNum = BASE_ROW_NUMBER + rowIdx;
      const thNum = document.createElement("th");
      thNum.className = "row-num";
      thNum.textContent = excelRowNum;
      thNum.title = `행 ${excelRowNum}: 클릭/드래그하여 행 선택, Shift+클릭으로 범위 선택`;
      thNum.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const range = this.selectedRowRange;
        if (e.shiftKey && range) {
          this.selectRowRange(this.rowRangeStart ?? range.minRow, rowIdx);
        } else {
          this.selectRowRange(rowIdx, rowIdx);
        }
        // 드래그로 범위 선택 시작
        this._rowDragAnchor = rowIdx;
        this._isRowDragging = true;
        this.elSheetContainer.focus({ preventScroll: true });
      });
      thNum.addEventListener("mouseenter", (e) => {
        if (this._isRowDragging && e.buttons === 1 && this._rowDragAnchor !== undefined) {
          this.selectRowRange(this._rowDragAnchor, rowIdx);
        }
      });
      tr.addEventListener("mouseenter", (e) => {
        if (this._isRowDragging && e.buttons === 1 && this._rowDragAnchor !== undefined) {
          this.selectRowRange(this._rowDragAnchor, rowIdx);
        }
      });

      tr.appendChild(thNum);

      // Columns
      colKeys.forEach((key, colIdx) => {
        const td = document.createElement("td");
        td.className = `excel-cell cell-${key}`;
        td.dataset.row = rowIdx;
        td.dataset.col = key;
        td.dataset.colIdx = colIdx;
        td.dataset.colLetter = colLetters[colIdx];
        td.dataset.excelRow = excelRowNum;
        this.applyCellFormatting(td, row, key);

        const val = row[key] || "";

        // Custom render for Gender: text + right dropdown arrow button (Excel Data Validation Style)
        if (key === "gender") {
          td.textContent = "";

          const textSpan = document.createElement("span");
          textSpan.className = "cell-gender-text";
          textSpan.textContent = val;
          td.appendChild(textSpan);

          if (val === "F") td.classList.add("f");
          if (val === "M") td.classList.add("m");

          const dropBtn = document.createElement("button");
          dropBtn.type = "button";
          dropBtn.className = "gender-dropdown-btn";
          dropBtn.innerHTML = "▼";
          dropBtn.title = "성별 선택 (M / F)";
          dropBtn.tabIndex = -1;

          dropBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.selectCell(rowIdx, "gender", td, false);
            this.openGenderDropdown(rowIdx, td, dropBtn);
          });

          td.appendChild(dropBtn);
          td.title = "선택 시 우측 ▼ 버튼 또는 더블클릭으로 M/F 선택 (키보드 M, F, ㅡ, ㄹ 지원)";
        } else {
          this.renderColoredText(td, row, key);
        }

        // Cell Mouse Down handler (Start Drag Selection)
        td.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return; // Only Left Click
          if (e.target.closest(".cell-fill-handle") || e.target.closest(".gender-dropdown-btn")) return;
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.toggleCellSelection(rowIdx, colIdx); return; }
          // If already editing inside input, don't interrupt text cursor
          if (e.target.tagName === "INPUT") return;
          e.preventDefault();

          this.isSelectingRange = true;
          if (e.shiftKey && this.activeCell) {
            this.extendCellSelection(rowIdx, colIdx);
            this.elSheetContainer.classList.add("is-selecting");
            return;
          }
          this.rangeStart = { rowIdx, colIdx, colKey: key };
          this.rangeEnd = { rowIdx, colIdx, colKey: key };

          if (this.elSheetContainer) {
            this.elSheetContainer.classList.add("is-selecting");
          }

          this.selectCell(rowIdx, key, td, false);
          this.updateRangeSelection();
        });

        // Cell Mouse Enter handler (Drag range expansion)
        td.addEventListener("mouseenter", () => {
          if (!this.isSelectingRange) return;
          this.rangeEnd = { rowIdx, colIdx, colKey: key };
          this.updateRangeSelection();
        });

        // Cell Click handler (Clean cell selection)
        td.addEventListener("click", (e) => {
          if (e.ctrlKey || e.metaKey) return;
          if (e.target.closest("input, textarea")) return;
          if (e.shiftKey && this.activeCell) return;
          if (this.selectedRange && (this.selectedRange.minRow !== this.selectedRange.maxRow || this.selectedRange.minCol !== this.selectedRange.maxCol)) return;
          if (e.target.closest(".cell-fill-handle") || e.target.closest(".gender-dropdown-btn")) return;
          this.selectCell(rowIdx, key, td, false);
        });

        // Cell Double Click to inline edit or open gender dropdown
        td.addEventListener("dblclick", () => {
          if (key === "gender") {
            const dropBtn = td.querySelector(".gender-dropdown-btn");
            this.openGenderDropdown(rowIdx, td, dropBtn);
          } else if (key === "writer") {
            this.openWriterPicker(rowIdx, td);
          } else {
            // Preserve the native editor and its active IME composition.
            const editor = td.querySelector("input");
            if (editor && !editor.classList.contains("is-armed")) return;
            this.startInlineEdit(rowIdx, key, td);
          }
        });

        tr.appendChild(td);
      });

      // Delete action column
      const tdDel = document.createElement("td");
      tdDel.className = "excel-cell cell-del-action";
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn-row-del";
      btnDel.textContent = "✕";
      btnDel.title = "이 행 삭제";
      btnDel.addEventListener("click", (e) => {
        e.stopPropagation();
        this.deleteRow(rowIdx);
      });
      tdDel.appendChild(btnDel);
      tr.appendChild(tdDel);
      const spacer = document.createElement("td");
      spacer.className = "cell-spacer";
      tr.appendChild(spacer);

      this.elTableBody.appendChild(tr);
    });

    // If active cell was set, restore highlight if valid
    if (this.activeCell) {
      const targetCell = document.querySelector(`.excel-cell[data-row="${this.activeCell.rowIdx}"][data-col="${this.activeCell.colKey}"]`);
      if (targetCell) {
        this.highlightCell(targetCell);
        this.updateActiveHeaders(this.activeCell.rowIdx, this.activeCell.colKey);
      }
    }
    // Cloud/search refreshes replace DOM nodes; repaint the current selection too.
    if (selectedRows) {
      this.selectRowRange(selectedRows.minRow, selectedRows.maxRow, selectedRange?.maxCol ?? 10);
    } else if (selectedRange && this.rangeStart && this.rangeEnd && !this.selectedCellSet && !this.selectedColumnRange) {
      this.updateRangeSelection();
    }
    this.paintCellSet();
    this.renderClipboardSelection();
    if (this.activeCell && this.activeCell.colKey !== "gender") {
      const { rowIdx, colKey } = this.activeCell;
      const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${colKey}"]`);
      if (cell) this.startInlineEdit(rowIdx, colKey, cell, true);
    }
    if (this.elSearchInput?.value.trim()) this.searchAllDates(this.elSearchInput.value.trim(), undefined, { preserveCurrentSelection: true });
    this.updateFontColorIndicator();
    this.updateBackgroundColorIndicator();
  }

  // Select and focus cell like Excel
  selectCell(rowIdx, colKey, cellElement, startEdit = false) {
    this.patientSearchDraft = null;
    if (this.genderPickerState) this.closeGenderDropdown();
    if (colKey === "visitTime") {
      colKey = "specialNote";
      cellElement = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="specialNote"]`);
      if (!cellElement) return;
    }
    this.closeAutocompleteMenu();
    this.activeCell = { rowIdx, colKey };
    this.historyApplyTarget = { date: this.currentDate, rowIdx, rows: this.getCurrentRows(), row: this.getCurrentRows()[rowIdx], colKey };
    this.elTableBody.querySelectorAll(".history-apply-btn").forEach(button => { button.disabled = false; });
    this.selectedRowIdx = rowIdx;
    this.selectedColKey = null;

    this.clearHeaderSelections();
    this.rangeStart = { rowIdx, colIdx: Number(cellElement.dataset.colIdx), colKey };
    this.rangeEnd = { ...this.rangeStart };
    this.updateActiveHeaders(rowIdx, colKey);

    // Highlight row
    document.querySelectorAll(".excel-row").forEach((r) => r.classList.remove("active-row"));
    const rowEl = cellElement.closest("tr");
    if (rowEl) rowEl.classList.add("active-row");

    this.highlightCell(cellElement);

    // Update Formula Bar
    const colLetter = cellElement.dataset.colLetter;
    const excelRow = cellElement.dataset.excelRow;
    const cellAddress = `${colLetter}${excelRow}`;

    this.elCellAddress.textContent = cellAddress;
    this.elSelectedCellCoords.textContent = `${cellAddress} (${colKey})`;

    const rows = this.getCurrentRows();
    const cellValue = rows[rowIdx] ? (rows[rowIdx][colKey] || "") : "";
    this.elFormulaInput.value = cellValue;

    if (startEdit) {
      this.startInlineEdit(rowIdx, colKey, cellElement);
    } else if (colKey !== "gender") {
      // Focus a native input before the first IME key, without entering edit mode.
      this.startInlineEdit(rowIdx, colKey, cellElement, true);
    } else {
      this.elSheetContainer.focus({ preventScroll: true });
    }
    this.updateHistoryDestinationHighlight();
    if (!this._isPasting) this.ensureCurrentCellVisible(cellElement);
    this.updateFontColorIndicator();
    this.updateBackgroundColorIndicator();
  }

  getTopVisibleCurrentRow() {
    const rows = Array.from(this.elTableBody.querySelectorAll('.excel-row[data-row-idx]:not([style*="display: none"])'));
    const container = this.elSheetContainer;
    if (!container?.getBoundingClientRect) return rows[0];
    const bounds = container.getBoundingClientRect();
    const bottom = bounds.top + (container.clientTop || 0) + container.clientHeight;
    let top = bounds.top + (container.clientTop || 0);
    container.querySelectorAll("#excelTable thead th, .current-history-headers th").forEach(header => {
      const rect = header.getBoundingClientRect();
      if (rect.height && rect.top < bottom) top = Math.max(top, rect.bottom);
    });
    return rows.find(row => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > top + 1 && rect.top < bottom;
    }) || rows[0];
  }

  ensureCurrentCellVisible(cell) {
    const container = this.elSheetContainer;
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (!cell?.getBoundingClientRect || !container?.getBoundingClientRect) return;
    const bounds = container.getBoundingClientRect();
    const bottom = bounds.top + (container.clientTop || 0) + container.clientHeight;
    let top = bounds.top + (container.clientTop || 0);
    // Sticky rows visually cover the viewport although native scrolling counts it as visible.
    container.querySelectorAll("#excelTable thead th, .current-history-headers th").forEach(header => {
      const rect = header.getBoundingClientRect();
      if (rect.height && rect.bottom > top && rect.top < bottom) top = Math.max(top, rect.bottom);
    });
    const rect = cell.getBoundingClientRect();
    if (rect.top < top) container.scrollTop += rect.top - top;
    else if (rect.bottom > bottom) container.scrollTop += rect.bottom - bottom;
  }

  highlightCell(cellElement) {
    document.querySelectorAll(".cell-fill-handle").forEach((handle) => handle.remove());
    document.querySelectorAll(".excel-cell").forEach((c) => c.classList.remove("cell-focused"));
    cellElement.classList.add("cell-focused");
    const { row, col, colIdx } = cellElement.dataset;
    const value = this.getCurrentRows()[Number(row)]?.[col];
    if (value === null || value === undefined || String(value).trim() === "") return;
    const handle = document.createElement("span");
    handle.className = "cell-fill-handle";
    handle.title = "아래로 드래그하여 같은 내용 채우기";
    handle.setAttribute("aria-label", handle.title);
    handle.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const currentValue = this.getCurrentRows()[Number(row)]?.[col];
      if (currentValue === null || currentValue === undefined || String(currentValue).trim() === "") return;
      this.fillDrag = { rowIdx: Number(row), colKey: col, colIdx: Number(colIdx),
        value: col === "writer" ? this.normalizeWriterInput(currentValue) : currentValue,
        endRow: Number(row), date: this.currentDate };
      this.isSelectingRange = false;
      this.isSelectingRows = false;
      this.elSheetContainer.classList.add("is-selecting");
      this.elSheetContainer.classList.add("is-fill-dragging");
    });
    handle.addEventListener("click", (event) => event.stopPropagation());
    cellElement.appendChild(handle);
  }

  updateFillDrag(event) {
    if (!this.fillDrag) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest("tr[data-row-idx]");
    if (!row || !this.elTableBody.contains(row)) return;
    const endRow = Math.max(this.fillDrag.rowIdx, Number(row.dataset.rowIdx));
    // 카운트 뱃지 위치 항상 업데이트 (endRow 변화 여부 무관)
    this._updateFillDragBadge(event.clientX, event.clientY, endRow - this.fillDrag.rowIdx + 1);
    if (this.fillDrag.endRow === endRow) return;
    this.fillDrag.endRow = endRow;
    this.elTableBody.querySelectorAll(".fill-preview").forEach((cell) => cell.classList.remove("fill-preview"));
    for (let r = this.fillDrag.rowIdx + 1; r <= endRow; r++) {
      this.elTableBody.querySelector(`.excel-cell[data-row="${r}"][data-col="${this.fillDrag.colKey}"]`)?.classList.add("fill-preview");
    }
  }

  _updateFillDragBadge(mouseX, mouseY, count) {
    let badge = document.getElementById("fillDragCountBadge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "fillDragCountBadge";
      badge.className = "fill-drag-count-badge";
      document.body.appendChild(badge);
    }
    badge.textContent = `+${count}`;
    badge.style.left = `${mouseX + 14}px`;
    badge.style.top  = `${mouseY - 10}px`;
    badge.style.display = "block";
  }

  _removeFillDragBadge() {
    const badge = document.getElementById("fillDragCountBadge");
    if (badge) badge.remove();
  }

  cancelFillDrag() {
    if (!this.fillDrag) return;
    this.fillDrag = null;
    this.elTableBody.querySelectorAll(".fill-preview").forEach((cell) => cell.classList.remove("fill-preview"));
    this.elSheetContainer.classList.remove("is-selecting");
    this.elSheetContainer.classList.remove("is-fill-dragging");
    this._removeFillDragBadge();
  }

  finishFillDrag(event) {
    this.updateFillDrag(event);
    const drag = this.fillDrag;
    const releasedRow = document.elementFromPoint(event.clientX, event.clientY)?.closest("tr[data-row-idx]");
    this.cancelFillDrag();
    if (!drag || drag.date !== this.currentDate || drag.endRow <= drag.rowIdx ||
        !releasedRow || !this.elTableBody.contains(releasedRow)) return;
    const rows = this.getCurrentRows();
    for (let r = drag.rowIdx + 1; r <= drag.endRow; r++) {
      rows[r][drag.colKey] = drag.value;
    }
    this.saveDataStore();
    this.renderTable();
    const source = this.elTableBody.querySelector(`.excel-cell[data-row="${drag.rowIdx}"][data-col="${drag.colKey}"]`);
    this.selectCell(drag.rowIdx, drag.colKey, source);
    this.rangeStart = { rowIdx: drag.rowIdx, colIdx: drag.colIdx, colKey: drag.colKey };
    this.rangeEnd = { ...this.rangeStart, rowIdx: drag.endRow };
    this.updateRangeSelection();
    this.updateSidebarStats();
    this.showSaveIndicator(`${drag.endRow - drag.rowIdx}개 셀 채우기 완료`);
  }

}
