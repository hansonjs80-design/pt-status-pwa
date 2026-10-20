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

    // Prevent losing focus from the active cell editor when clicking context menu items
    this.elContextMenu.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });

    // Context menu item click dispatcher
    this.elContextMenu.addEventListener("click", (e) => {
      const menuItem = e.target.closest(".menu-item");
      if (!menuItem) return;

      const actionItem = e.target.closest("[data-action]") || menuItem;
      const action = actionItem.dataset.action;
      this.executeContextAction(action, actionItem);
      this.hideContextMenu();
    });

    this.initQuickTextEditModal();
  }

  initQuickTextEditModal() {
    const modal = document.getElementById("quickTextEditModal");
    if (!modal) return;

    const btnClose = document.getElementById("btnQuickTextClose");
    const btnCancel = document.getElementById("btnQuickTextCancel");
    const btnApply = document.getElementById("btnQuickTextApply");
    const input = document.getElementById("quickTextInput");

    const closeHandler = () => this.closeQuickTextEditDialog();
    btnClose?.addEventListener("click", closeHandler);
    btnCancel?.addEventListener("click", closeHandler);
    btnApply?.addEventListener("click", () => this.applyQuickTextEdit());

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.applyQuickTextEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.closeQuickTextEditDialog();
      }
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.closeQuickTextEditDialog();
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
    this.elContextMenu?.querySelectorAll(".history-context-hidden").forEach(item => item.classList.remove("history-context-hidden"));
    if (e.target?.closest?.(".cross-date-row")) {
      const cell = e.target.closest('.cross-date-cell');
      e.preventDefault?.();
      if (!cell) return;
      const index = Number(cell.dataset.crossIdx);
      const editor = cell.querySelector('input:not(.is-armed)');
      if (editor?.historyEdit) {
        const value = this.getCellEditorValue(editor);
        const start = Math.min(editor.selectionStart ?? 0, editor.selectionEnd ?? 0);
        const end = Math.max(editor.selectionStart ?? 0, editor.selectionEnd ?? 0);
        const selectedText = value.slice(start, end);
        this.textEditorState = { input: editor, historyEdit: editor.historyEdit,
          rowIdx: index, colKey: "specialNote", colIdx: 9, start, end, selectedText,
          fullText: value, cellElement: cell };
        this.contextTarget = { type: "history", isTextEdit: true, cellElement: cell };
        this.updateContextMenuItemsForTextMode(true, selectedText, start);
        this.elContextMenu.querySelectorAll('.menu-item, .menu-divider').forEach(item => {
          item.classList.toggle("history-context-hidden", item.classList.contains("row-only-item") ||
            item.classList.contains("col-only-item") || item.dataset.action === "find" ||
            (item.dataset.action === "cut" && !selectedText));
        });
        this.showContextMenu(e.clientX, e.clientY, cell);
        return;
      }
      this.textEditorState = null;
      const column = Number(cell.dataset.crossColIdx);
      const range = this.crossDateSelection;
      if (!range || index < range.minRow || index > range.maxRow || column < range.minCol || column > range.maxCol ||
          !this.isSelectedCoordinate(index, column)) {
        this.isCrossDateRowSelected = false;
        this.selectCrossDateCell(index, column);
      }
      document.activeElement?.blur?.();
      this.updateContextMenuItemsForTextMode(false);
      this.contextTarget = { type: "history", cellElement: cell };
      const allowed = this.getHistoryNoteRange()
        ? ["copy", "paste", "clear-contents", "font-color", "background-color", "font-size", "font-weight", "underline", "underline-menu", "text-highlight", "change-case"]
        : ["copy"];
      this.elContextMenu.querySelectorAll('.menu-item, .menu-divider').forEach(item => {
        item.classList.toggle("history-context-hidden", !allowed.includes(item.dataset.action));
      });
      this.showContextMenu(e.clientX, e.clientY, cell);
      return;
    }
    const thRow = e.target?.closest?.("th.row-num");
    const thCol = e.target?.closest?.("th.col-letter, th.b-header");
    const thCorner = e.target?.closest?.("#cornerHeader");
    const tdCell = e.target?.closest?.(".excel-cell");

    this.elContextMenu.querySelector('[data-action="find"]').classList.toggle("hidden",
      !tdCell || !["chartNo", "name"].includes(tdCell.dataset.col));
    const rowOnlyItems = this.elContextMenu.querySelectorAll(".row-only-item");
    const colOnlyItems = this.elContextMenu.querySelectorAll(".col-only-item");

    if (thRow) {
      // 1) Right Click on Row Number Header (행 헤더 우클릭)
      e.preventDefault?.();
      this.updateContextMenuItemsForTextMode(false);
      const tr = thRow.closest("tr");
      const rowIdx = parseInt(tr.dataset.rowIdx, 10);

      const inRowRange = this.selectedRowRange &&
        rowIdx >= this.selectedRowRange.minRow &&
        rowIdx <= this.selectedRowRange.maxRow;

      if (!inRowRange) {
        this.selectRowRange(rowIdx, rowIdx);
      }

      this.contextTarget = { type: "row", rowIdx, rowRange: this.selectedRowRange, cellElement: null };

      rowOnlyItems.forEach((el) => el.classList.remove("hidden"));
      colOnlyItems.forEach((el) => el.classList.add("hidden"));
      this.showContextMenu(e.clientX, e.clientY, null);
    } else if (thCol) {
      // 2) Right Click on Column Header (열 헤더 우클릭)
      const colKey = thCol.dataset.col;
      const colLetter = thCol.dataset.colLetter || "";
      if (!colKey || ["del", "spacer"].includes(colKey)) return;

      e.preventDefault?.();
      this.updateContextMenuItemsForTextMode(false);
      this.contextTarget = { type: "col", colKey, colLetter, cellElement: null };
      const index = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"].indexOf(colKey);
      if (!this.selectedColumnRange || index < this.selectedColumnRange.minCol || index > this.selectedColumnRange.maxCol) this.selectEntireColumn(colKey, colLetter);

      rowOnlyItems.forEach((el) => el.classList.add("hidden"));
      colOnlyItems.forEach((el) => el.classList.remove("hidden"));
      this.showContextMenu(e.clientX, e.clientY, null);
    } else if (thCorner) {
      // 3) Right Click on Corner Header (시트 전체 선택)
      e.preventDefault?.();
      this.updateContextMenuItemsForTextMode(false);
      this.contextTarget = { type: "corner", cellElement: null };
      this.selectAllCells();

      rowOnlyItems.forEach((el) => el.classList.add("hidden"));
      colOnlyItems.forEach((el) => el.classList.add("hidden"));
      this.showContextMenu(e.clientX, e.clientY, null);
    } else if (tdCell) {
      // 4) Right Click on General Cell (일반 셀 우클릭)
      e.preventDefault?.();
      const rowIdx = parseInt(tdCell.dataset.row, 10);
      const colKey = tdCell.dataset.col;
      const colIdx = parseInt(tdCell.dataset.colIdx, 10);

      // Check if this cell is actively being edited
      const activeInput = tdCell.querySelector("input:not(.is-armed)");
      const isEditingThisCell = Boolean(activeInput) && (
        (this.activeCell?.rowIdx === rowIdx && this.activeCell?.colKey === colKey) ||
        document.activeElement === activeInput
      );

      if (isEditingThisCell && activeInput) {
        // 셀 안에 커서가 활성화되어 있는 상태 (인라인 텍스트 편집 모드)
        const start = activeInput.selectionStart ?? 0;
        const end = activeInput.selectionEnd ?? 0;
        const val = activeInput.value ?? "";
        const selectedText = start !== end ? val.slice(Math.min(start, end), Math.max(start, end)) : "";

        // 모델 데이터 동기화
        const rows = this.getCurrentRows();
        if (rows[rowIdx]) rows[rowIdx][colKey] = val;

        // 좌측 정렬 보장
        activeInput.style.textAlign = "left";
        if (!["no", "gender", "writer"].includes(colKey)) {
          tdCell.style.textAlign = "left";
        }

        this.textEditorState = {
          input: activeInput,
          rowIdx,
          colKey,
          colIdx,
          start: Math.min(start, end),
          end: Math.max(start, end),
          selectedText,
          fullText: val,
          cellElement: tdCell
        };

        if (selectedText) {
          this.textColorSelection = {
            rowIdx,
            colKey,
            start: Math.min(start, end),
            end: Math.max(start, end),
            text: val
          };
        }

        this.contextTarget = { type: "cell", rowIdx, colKey, colIdx, isTextEdit: true, cellElement: tdCell };

        // 텍스트 편집 특화 컨텍스트 메뉴로 UI 전환
        this.updateContextMenuItemsForTextMode(true, selectedText, start);
      } else {
        // 일반 셀 그리드 선택 모드
        this.textEditorState = null;
        this.contextTarget = { type: "cell", rowIdx, colKey, colIdx, isTextEdit: false, cellElement: tdCell };

        const inRange = this.selectedRange &&
          rowIdx >= this.selectedRange.minRow && rowIdx <= this.selectedRange.maxRow &&
          colIdx >= this.selectedRange.minCol && colIdx <= this.selectedRange.maxCol;

        const hasTextSelection = this.textColorSelection?.rowIdx === rowIdx &&
          this.textColorSelection?.colKey === colKey;

        if ((!inRange && !hasTextSelection) || this.selectedColumnRange) {
          this.selectCell(rowIdx, colKey, tdCell, false);
        }

        this.updateContextMenuItemsForTextMode(false);
      }

      this.showContextMenu(e.clientX, e.clientY, tdCell);
    }
  }

  updateContextMenuItemsForTextMode(isTextMode, selectedText = "", cursorIndex = 0) {
    if (!this.elContextMenu) return;

    const header = this.elContextMenu.querySelector("#menuTextSelectionHeader");
    const preview = this.elContextMenu.querySelector("#menuSelectionPreview");
    const length = this.elContextMenu.querySelector("#menuSelectionLength");
    const btnEdit = this.elContextMenu.querySelector('[data-action="edit-selected-text"]');
    const btnDelete = this.elContextMenu.querySelector('[data-action="delete-selected-text"]');
    const btnSelectAll = this.elContextMenu.querySelector('[data-action="select-all-text"]');
    const divider = this.elContextMenu.querySelector("#menuTextDivider");
    const itemCut = this.elContextMenu.querySelector('[data-action="cut"]');
    const itemCopy = this.elContextMenu.querySelector('[data-action="copy"]');
    const itemClear = this.elContextMenu.querySelector('[data-action="clear-contents"]');
    const rowOnlyItems = this.elContextMenu.querySelectorAll(".row-only-item");
    const colOnlyItems = this.elContextMenu.querySelectorAll(".col-only-item");

    if (isTextMode) {
      // 텍스트 편집 모드
      if (header) {
        header.classList.remove("hidden");
        if (selectedText) {
          preview.textContent = `"${selectedText.length > 14 ? selectedText.slice(0, 14) + '...' : selectedText}"`;
          length.textContent = `${selectedText.length}자`;
        } else {
          preview.textContent = "(커서 위치)";
          length.textContent = `${cursorIndex}번째`;
        }
      }

      btnEdit?.classList.toggle("hidden", !selectedText);
      btnDelete?.classList.toggle("hidden", !selectedText);
      btnSelectAll?.classList.remove("hidden");
      divider?.classList.remove("hidden");

      if (itemCut) itemCut.querySelector(".menu-label").textContent = selectedText ? "선택 글자 잘라내기" : "잘라내기";
      if (itemCopy) itemCopy.querySelector(".menu-label").textContent = selectedText ? "선택 글자 복사" : "복사";

      itemClear?.classList.add("hidden");
      rowOnlyItems.forEach((el) => el.classList.add("hidden"));
      colOnlyItems.forEach((el) => el.classList.add("hidden"));
    } else {
      // 일반 셀/헤더 모드
      header?.classList.add("hidden");
      btnEdit?.classList.add("hidden");
      btnDelete?.classList.add("hidden");
      btnSelectAll?.classList.add("hidden");
      divider?.classList.add("hidden");

      if (itemCut) itemCut.querySelector(".menu-label").textContent = "잘라내기";
      if (itemCopy) itemCopy.querySelector(".menu-label").textContent = "복사";

      itemClear?.classList.remove("hidden");
      rowOnlyItems.forEach((el) => el.classList.toggle("hidden", !["delete-row", "lunch-line"].includes(el.dataset.action)));
      colOnlyItems.forEach((el) => el.classList.add("hidden"));
    }
  }

  showContextMenu(clientX, clientY, targetCell = null) {
    if (!this.elContextMenu) return;
    this._contextMenuOpenedAt = Date.now();
    const menu = this.elContextMenu;
    menu.style.display = "block";
    menu.style.visibility = "hidden";

    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || menuRect.width || 230;
    const menuHeight = menu.offsetHeight || menuRect.height || 280;
    const SAFE_MARGIN = 14;

    const cellEl = targetCell || this.contextTarget?.cellElement ||
      (this.contextTarget?.type === "cell" ? this.elTableBody?.querySelector(`[data-row="${this.contextTarget.rowIdx}"][data-col="${this.contextTarget.colKey}"]`) : null);
    const cellRect = cellEl ? cellEl.getBoundingClientRect() : null;

    let posX = clientX;
    let posY = clientY;

    if (cellRect) {
      // 셀을 가리지 않도록 위치 선정
      // 1. 가로 위치: 마우스 클릭 X좌표를 기준으로 하되 화면 우측 끝 검사
      posX = Math.min(clientX, window.innerWidth - menuWidth - SAFE_MARGIN);
      posX = Math.max(SAFE_MARGIN, posX);

      // 2. 세로 위치: 셀 내용을 가리지 않도록 셀 아래 또는 위로 똑똑하게 배치
      const spaceBelow = window.innerHeight - cellRect.bottom;
      const spaceAbove = cellRect.top;

      if (spaceBelow >= menuHeight + SAFE_MARGIN || spaceBelow >= spaceAbove) {
        // 셀 바로 아래 배치 (셀 안의 글자가 그대로 보임)
        posY = cellRect.bottom + 4;
        if (posY + menuHeight > window.innerHeight - SAFE_MARGIN) {
          posY = window.innerHeight - menuHeight - SAFE_MARGIN;
        }
      } else {
        // 셀 바로 위 배치 (셀 안의 글자가 그대로 보임)
        posY = cellRect.top - menuHeight - 4;
        if (posY < SAFE_MARGIN) {
          posY = SAFE_MARGIN;
        }
      }
    } else {
      // 셀이 없는 일반 헤더/여백 우클릭: 화면 끝 검사
      if (posX + menuWidth > window.innerWidth - SAFE_MARGIN) {
        posX = window.innerWidth - menuWidth - SAFE_MARGIN;
      }
      if (posY + menuHeight > window.innerHeight - SAFE_MARGIN) {
        posY = window.innerHeight - menuHeight - SAFE_MARGIN;
      }
      posX = Math.max(SAFE_MARGIN, posX);
      posY = Math.max(SAFE_MARGIN, posY);
    }

    menu.style.left = `${Math.round(posX)}px`;
    menu.style.top = `${Math.round(posY)}px`;
    menu.style.visibility = "visible";
  }

  hideContextMenu() {
    if (this.elContextMenu) {
      this.elContextMenu.style.display = "none";
    }
  }

  executeContextAction(action, menuItem = null) {
    // 1. Text editing mode actions
    if (this.contextTarget?.isTextEdit && this.textEditorState) {
      switch (action) {
        case "edit-selected-text":
          this.openQuickTextEditDialog();
          return;
        case "delete-selected-text":
          this.deleteSelectedText();
          return;
        case "select-all-text":
          this.selectAllText();
          return;
        case "cut":
          this.cutTextSelection();
          return;
        case "copy":
          this.copyTextSelection();
          return;
        case "paste":
          this.pasteIntoTextEditor();
          return;
      }
    }

    // 2. Formatting & cell/row actions
    const targetRow = this.contextTarget?.rowIdx ?? this.selectedRowIdx ?? (this.activeCell ? this.activeCell.rowIdx : 0);
    const targetCol = this.contextTarget?.colKey ?? this.selectedColKey ?? (this.activeCell ? this.activeCell.colKey : null);
    const targetCell = this.contextTarget?.cellElement ||
      (targetRow != null && targetCol ? (this.elTableBody || this.elSheetContainer)?.querySelector(`[data-row="${targetRow}"][data-col="${targetCol}"]`) : null) ||
      (this.activeCell ? (this.elTableBody || this.elSheetContainer)?.querySelector(`[data-row="${this.activeCell.rowIdx}"][data-col="${this.activeCell.colKey}"]`) : null);

    switch (action) {
      case "find": {
        if (this.contextTarget?.type !== "cell" || !["chartNo", "name"].includes(targetCol)) break;
        document.activeElement?.blur();
        const cell = targetCell || this.elSheetContainer.querySelector(`[data-row="${targetRow}"][data-col="${targetCol}"]`);
        if (cell) {
           this.selectCell(targetRow, targetCol, cell, false);
           this.findActiveCell();
        }
        break;
      }
      case "font-size":
      case "font-weight":
        this.openColumnTypographyMenu(action === "font-size" ? "fontSize" : "fontWeight", targetCell || menuItem);
        break;
      case "change-case":
        this.openChangeCaseMenu(targetCell || menuItem || document.getElementById("btnChangeCase") || this.elContextMenu);
        break;
      case "font-color":
        this.openFontColorMenu(targetCell || menuItem || document.getElementById("btnFontColor"));
        break;
      case "background-color":
        this.openFontColorMenu(targetCell || menuItem || document.getElementById("btnBackgroundColor"), "backgroundColor");
        break;
      case "underline":
        this.toggleUnderline();
        break;
      case "underline-menu":
        this.openUnderlineMenu(targetCell || menuItem || document.getElementById("btnUnderlineMenu"));
        break;
      case "text-highlight":
        this.openFontColorMenu(targetCell || menuItem || document.getElementById("btnTextHighlight"), "highlight");
        break;
      case "lunch-line":
        this.toggleLunchLine(targetRow);
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

  // =========================================================================
  // Text Editing Actions & Quick Edit Modal Helpers
  // =========================================================================
  openQuickTextEditDialog() {
    const state = this.textEditorState;
    if (!state) return;

    const modal = document.getElementById("quickTextEditModal");
    const card = modal?.querySelector(".quick-text-card");
    const targetEl = document.getElementById("quickTextTarget");
    const inputEl = document.getElementById("quickTextInput");
    if (!modal || !card || !targetEl || !inputEl) return;

    targetEl.textContent = state.selectedText || state.fullText || "";
    inputEl.value = state.selectedText || "";
    modal.style.display = "block";

    // 대상 셀 찾기
    const cell = state.input?.closest(".excel-cell") ||
      state.cellElement ||
      this.contextTarget?.cellElement ||
      this.elTableBody?.querySelector(`[data-row="${state.rowIdx}"][data-col="${state.colKey}"]`);
    const cellRect = cell ? cell.getBoundingClientRect() : null;

    // 카드 크기 측정 및 뷰포트 클램프
    const cardWidth = Math.min(360, window.innerWidth - 32);
    card.style.width = `${cardWidth}px`;
    const cardHeight = card.offsetHeight || 190;
    const SAFE_MARGIN = 16;

    let top = 0;
    let left = 0;

    if (cellRect) {
      // 1. 가로 위치: 셀 좌측에 맞추되 화면 우측 끝에 가려지지 않도록 안전 클램프
      left = cellRect.left;
      if (left + cardWidth > window.innerWidth - SAFE_MARGIN) {
        left = window.innerWidth - cardWidth - SAFE_MARGIN;
      }
      left = Math.max(SAFE_MARGIN, left);

      // 2. 세로 위치: 해당 셀을 전혀 가리지 않도록 셀의 바로 아래 또는 바로 위로 배치!
      const spaceBelow = window.innerHeight - cellRect.bottom;
      const spaceAbove = cellRect.top;

      if (spaceBelow >= cardHeight + SAFE_MARGIN || spaceBelow >= spaceAbove) {
        // 셀 바로 아래 배치 (셀 안의 글자가 그대로 보임!)
        top = cellRect.bottom + 8;
        if (top + cardHeight > window.innerHeight - 12) {
          top = window.innerHeight - cardHeight - 12;
        }
      } else {
        // 셀 바로 위 배치 (셀 안의 글자가 그대로 보임!)
        top = cellRect.top - cardHeight - 8;
        if (top < 12) {
          top = 12;
        }
      }
    } else {
      // 폴백: 화면 중앙 안전 여백 배치
      left = Math.max(SAFE_MARGIN, (window.innerWidth - cardWidth) / 2);
      top = Math.max(12, (window.innerHeight - cardHeight) / 2);
    }

    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;

    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 40);
  }

  closeQuickTextEditDialog() {
    const modal = document.getElementById("quickTextEditModal");
    if (modal) modal.style.display = "none";

    const editor = this.textEditorState?.input;
    if (editor && editor.isConnected) {
      editor.focus({ preventScroll: true });
    }
  }

  applyQuickTextEdit() {
    const state = this.textEditorState;
    const inputEl = document.getElementById("quickTextInput");
    if (!state || !inputEl) return;

    const replacement = inputEl.value;
    const editor = state.input;
    // The quick-edit dialog blurs/commits the original input. Retain its source
    // date draft so applying the dialog still edits the historical record.
    if (state.historyEdit && !editor?.isConnected) {
      const edit = state.historyEdit;
      const value = String(edit.row.specialNote ?? "");
      const next = value.slice(0, state.start) + replacement + value.slice(state.end);
      this.updateEditorTextColors(edit.row, "specialNote", next);
      edit.row.specialNote = next;
      edit.save(true);
      this.closeQuickTextEditDialog();
      return;
    }
    if (editor && editor.isConnected) {
      if (!editor.historyEdit) this.captureHistory?.();
      const val = editor.value || "";
      const start = Math.min(state.start, val.length);
      const end = Math.min(state.end, val.length);
      const nextVal = val.slice(0, start) + replacement + val.slice(end);

      editor.value = nextVal;
      if (!editor.historyEdit) {
        const rows = this.getCurrentRows();
        if (rows[state.rowIdx]) rows[state.rowIdx][state.colKey] = nextVal;
      }

      // 좌측 정렬 유지 보장
      editor.style.textAlign = "left";
      const cell = editor.closest(".excel-cell");
      if (cell && !["no", "gender", "writer"].includes(state.colKey)) {
        cell.style.textAlign = "left";
        cell.dataset.cellAlignment = "left";
      }

      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(start, start + replacement.length);
      this.showSaveIndicator("선택 글자가 수정되었습니다.");
    }
    this.closeQuickTextEditDialog();
  }

  deleteSelectedText() {
    const state = this.textEditorState;
    const editor = state?.input;
    if (editor && editor.isConnected) {
      if (!editor.historyEdit) this.captureHistory?.();
      const val = editor.value || "";
      const start = Math.min(state.start, val.length);
      const end = Math.min(state.end, val.length);
      const nextVal = val.slice(0, start) + val.slice(end);

      editor.value = nextVal;
      if (!editor.historyEdit) {
        const rows = this.getCurrentRows();
        if (rows[state.rowIdx]) rows[state.rowIdx][state.colKey] = nextVal;
      }

      // 좌측 정렬 유지 보장
      editor.style.textAlign = "left";
      const cell = editor.closest(".excel-cell");
      if (cell && !["no", "gender", "writer"].includes(state.colKey)) {
        cell.style.textAlign = "left";
        cell.dataset.cellAlignment = "left";
      }

      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(start, start);
      this.showSaveIndicator("선택 글자가 삭제되었습니다.");
    }
  }

  selectAllText() {
    const state = this.textEditorState;
    const editor = state?.input;
    if (editor && editor.isConnected) {
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(0, editor.value.length);
      this.captureTextColorSelection();
    }
  }

  cutTextSelection() {
    const state = this.textEditorState;
    const textToCut = state?.selectedText;
    if (!textToCut) {
      if (state?.historyEdit) return;
      this.cutSelection();
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCut).catch(() => {});
    }
    this.clipboardBuffer = textToCut;
    this.deleteSelectedText();
    this.showSaveIndicator("선택 글자가 잘라내기 되었습니다.");
  }

  copyTextSelection() {
    const state = this.textEditorState;
    const textToCopy = state?.selectedText;
    if (!textToCopy) {
      this.copySelection();
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy).catch(() => {});
    }
    this.clipboardBuffer = textToCopy;
    this.showSaveIndicator("선택 글자가 복사되었습니다.");
    if (state.input?.isConnected) {
      state.input.focus({ preventScroll: true });
      state.input.setSelectionRange(state.start, state.end);
    }
  }

  async pasteIntoTextEditor() {
    const state = this.textEditorState;
    const editor = state?.input;
    if (!editor || !editor.isConnected) {
      this.pasteSelection();
      return;
    }
    let text = "";
    if (navigator.clipboard?.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (e) {
        text = this.clipboardBuffer || "";
      }
    } else {
      text = this.clipboardBuffer || "";
    }
    if (state !== this.textEditorState || !editor.isConnected) return;
    if (!text) {
      this.showSaveIndicator("붙여넣을 텍스트가 없습니다.", true);
      return;
    }

    if (!editor.historyEdit) this.captureHistory?.();
    const val = editor.value || "";
    const start = state.start ?? editor.selectionStart ?? val.length;
    const end = state.end ?? editor.selectionEnd ?? val.length;
    const nextVal = val.slice(0, start) + text + val.slice(end);

    editor.value = nextVal;
    if (!editor.historyEdit) {
      const rows = this.getCurrentRows();
      if (rows[state.rowIdx]) rows[state.rowIdx][state.colKey] = nextVal;
    }

    // 좌측 정렬 유지 보장
    editor.style.textAlign = "left";
    const cell = editor.closest(".excel-cell");
    if (cell && !["no", "gender", "writer"].includes(state.colKey)) {
      cell.style.textAlign = "left";
      cell.dataset.cellAlignment = "left";
    }

    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.focus({ preventScroll: true });
    const nextCaret = start + text.length;
    editor.setSelectionRange(nextCaret, nextCaret);
    this.showSaveIndicator("붙여넣기 완료");
  }
}
