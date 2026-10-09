// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTContextMenu {
  initContextMenu() {
    if (!this.elSheetContainer || !this.elContextMenu) return;

    // Open context menu on right click in sheet container
    this.elSheetContainer.addEventListener("contextmenu", (e) => {
      this.cancelCellLongPress?.();
      this.handleTableContextMenu(e);
    });
    this.initCellLongPressMenu();

    // Context menu item click dispatcher
    this.elContextMenu.addEventListener("click", (e) => {
      const menuItem = e.target.closest(".menu-item");
      if (!menuItem) return;

      const action = menuItem.dataset.action;
      this.executeContextAction(action);
      this.hideContextMenu();
    });
  }

  initCellLongPressMenu() {
    const sheet = this.elSheetContainer;
    let timer = null, press = null, suppressClickUntil = 0;
    const cancel = () => { clearTimeout(timer); timer = null; press = null; };
    this.cancelCellLongPress = cancel;
    sheet.addEventListener("touchstart", event => {
      cancel();
      if (event.touches.length !== 1) return;
      const cell = event.target.closest(".excel-cell");
      if (!cell || cell.closest(".cross-date-row") || event.target.closest(".cell-fill-handle, .col-resizer")) return;
      // Keep native text selection available inside an active editor.
      if (event.target.closest("input:not(.is-armed), textarea")) return;
      const touch = event.touches[0];
      press = { cell, x: touch.clientX, y: touch.clientY, opened: false };
      timer = setTimeout(() => {
        if (!press || !cell.isConnected) return;
        this.handleTableContextMenu({ target: cell, clientX: press.x, clientY: press.y, preventDefault() {} });
        press.opened = true;
        suppressClickUntil = Date.now() + 1000;
      }, 550);
    }, { passive: true });
    sheet.addEventListener("touchmove", event => {
      if (!press) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 10) cancel();
    }, { passive: true });
    sheet.addEventListener("touchend", event => {
      if (press?.opened) {
        event.preventDefault();
        suppressClickUntil = Date.now() + 800;
      }
      cancel();
    }, { passive: false });
    sheet.addEventListener("touchcancel", cancel, { passive: true });
    sheet.addEventListener("scroll", cancel, { passive: true, capture: true });
    sheet.addEventListener("click", event => {
      if (Date.now() >= suppressClickUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = 0;
    }, true);
  }

  handleTableContextMenu(e) {
    this.captureTextColorSelection();
    if (e.target.closest(".cross-date-row")) { e.preventDefault(); return; }
    const thRow = e.target.closest("th.row-num");
    const thCol = e.target.closest("th.col-letter, th.b-header");
    const thCorner = e.target.closest("#cornerHeader");
    const tdCell = e.target.closest(".excel-cell");

    this.elContextMenu.querySelector('[data-action="find"]').classList.toggle("hidden",
      !tdCell || !["chartNo", "name"].includes(tdCell.dataset.col));
    const rowOnlyItems = this.elContextMenu.querySelectorAll(".row-only-item");
    const colOnlyItems = this.elContextMenu.querySelectorAll(".col-only-item");

    if (thRow) {
      // 1) Right Click on Row Number Header (행 헤더 우클릭)
      e.preventDefault();
      const tr = thRow.closest("tr");
      const rowIdx = parseInt(tr.dataset.rowIdx, 10);

      // Keep multi-selection if right-clicked inside the current selected row range
      const inRowRange = this.selectedRowRange &&
        rowIdx >= this.selectedRowRange.minRow &&
        rowIdx <= this.selectedRowRange.maxRow;

      if (!inRowRange) {
        this.selectRowRange(rowIdx, rowIdx);
      }

      this.contextTarget = { type: "row", rowIdx, rowRange: this.selectedRowRange };

      // Show Row items (위에 행 1개 삽입, 아래에 행 1개 삽입, 행 데이터 삭제, 행 삭제)
      rowOnlyItems.forEach((el) => el.classList.remove("hidden"));
      colOnlyItems.forEach((el) => el.classList.add("hidden"));
      this.showContextMenu(e.clientX, e.clientY);
    } else if (thCol) {
      // 2) Right Click on Column Header (열 헤더 우클릭)
      const colKey = thCol.dataset.col;
      const colLetter = thCol.dataset.colLetter || "";
      if (!colKey || ["del", "spacer"].includes(colKey)) return;

      e.preventDefault();
      this.contextTarget = { type: "col", colKey, colLetter };
      const index = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"].indexOf(colKey);
      if (!this.selectedColumnRange || index < this.selectedColumnRange.minCol || index > this.selectedColumnRange.maxCol) this.selectEntireColumn(colKey, colLetter);

      // Show Column items
      rowOnlyItems.forEach((el) => el.classList.add("hidden"));
      colOnlyItems.forEach((el) => el.classList.remove("hidden"));
      this.showContextMenu(e.clientX, e.clientY);
    } else if (thCorner) {
      // 3) Right Click on Corner Header (시트 전체 선택)
      e.preventDefault();
      this.contextTarget = { type: "corner" };
      this.selectAllCells();

      rowOnlyItems.forEach((el) => el.classList.add("hidden"));
      colOnlyItems.forEach((el) => el.classList.add("hidden"));
      this.showContextMenu(e.clientX, e.clientY);
    } else if (tdCell) {
      // 4) Right Click on General Cell (일반 셀 우클릭)
      e.preventDefault();
      const rowIdx = parseInt(tdCell.dataset.row, 10);
      const colKey = tdCell.dataset.col;
      const colIdx = parseInt(tdCell.dataset.colIdx, 10);

      this.contextTarget = { type: "cell", rowIdx, colKey, colIdx };

      // Keep multi-selection if right-clicked inside the current selected range
      const inRange = this.selectedRange &&
        rowIdx >= this.selectedRange.minRow && rowIdx <= this.selectedRange.maxRow &&
        colIdx >= this.selectedRange.minCol && colIdx <= this.selectedRange.maxCol;

      if (!inRange || this.selectedColumnRange) {
        this.selectCell(rowIdx, colKey, tdCell, false);
      }

      // Hide row/col exclusive items
      rowOnlyItems.forEach((el) => el.classList.toggle("hidden", !["delete-row", "lunch-line"].includes(el.dataset.action)));
      colOnlyItems.forEach((el) => el.classList.add("hidden"));
      this.showContextMenu(e.clientX, e.clientY);
    }
  }

  showContextMenu(clientX, clientY) {
    if (!this.elContextMenu) return;
    const menu = this.elContextMenu;
    menu.style.display = "block";
    menu.style.visibility = "hidden";

    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width || 210;
    const menuHeight = menuRect.height || 260;

    let posX = clientX;
    let posY = clientY;

    if (posX + menuWidth > window.innerWidth) {
      posX = window.innerWidth - menuWidth - 8;
    }
    if (posY + menuHeight > window.innerHeight) {
      posY = window.innerHeight - menuHeight - 8;
    }

    menu.style.left = `${Math.max(8, posX)}px`;
    menu.style.top = `${Math.max(8, posY)}px`;
    menu.style.visibility = "visible";
  }

  hideContextMenu() {
    if (this.elContextMenu) {
      this.elContextMenu.style.display = "none";
    }
  }

  executeContextAction(action) {
    const targetRow = this.contextTarget?.rowIdx ?? this.selectedRowIdx ?? (this.activeCell ? this.activeCell.rowIdx : 0);
    const targetCol = this.contextTarget?.colKey ?? this.selectedColKey;

    switch (action) {
      case "find": {
        if (this.contextTarget?.type !== "cell" || !["chartNo", "name"].includes(targetCol)) break;
        document.activeElement?.blur();
        const cell = this.elSheetContainer.querySelector(`[data-row="${targetRow}"][data-col="${targetCol}"]`);
        if (cell) {
          this.selectCell(targetRow, targetCol, cell, false);
          this.findActiveCell();
        }
        break;
      }
      case "font-size":
      case "font-weight":
        this.openColumnTypographyMenu(action === "font-size" ? "fontSize" : "fontWeight");
        break;
      case "font-color":
        this.openFontColorMenu(document.getElementById("btnFontColor"));
        break;
      case "background-color":
        this.openFontColorMenu(document.getElementById("btnBackgroundColor"), "backgroundColor");
        break;
      case "lunch-line":
        this.getCurrentRows()[targetRow]._lunchBefore = !this.getCurrentRows()[targetRow]._lunchBefore;
        this.saveDataStore();
        this.renderTable();
        this.selectRowRange(targetRow, targetRow);
        break;
      case "cut":
        this.cutSelection();
        break;
      case "copy":
        this.copySelection();
        break;
      case "paste":
        this.pasteSelection();
        break;
      case "clear-contents":
        this.clearSelection();
        break;
      case "insert-row-above":
        this.insertRowAbove(targetRow);
        break;
      case "insert-row-below":
        this.insertRowBelow(targetRow);
        break;
      case "clear-row-data":
        this.clearRowData(targetRow);
        break;
      case "delete-row":
        this.deleteRowAt(targetRow);
        break;
      case "clear-col-data":
        if (targetCol) this.clearColData(targetCol);
        break;
      case "sort-col-asc":
        if (targetCol) {
          this.sortByColumn(targetCol, "asc");
        }
        break;
      case "sort-col-desc":
        if (targetCol) {
          this.sortByColumn(targetCol, "desc");
        }
        break;
      default:
        console.warn("Unknown context action:", action);
    }
  }

}
