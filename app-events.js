// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTAppEvents {
  bindEvents() {
    this.initToolbarActionsToggle();
    this.elSummaryPeriodTabs.forEach(button => {
      button.addEventListener("click", () => this.setSummaryPeriod(button.dataset.summaryPeriod));
    });
    // Supabase Cloud Sync Modal
    if (this.elBtnSupabase) {
      this.elBtnSupabase.addEventListener("click", () => this.openSupabaseModal());
    }
    if (this.elBtnCloseSupabase) {
      this.elBtnCloseSupabase.addEventListener("click", () => this.closeSupabaseModal());
    }
    if (this.elBtnSaveSupabase) {
      this.elBtnSaveSupabase.addEventListener("click", () => this.saveSupabaseConfig());
    }
    if (this.elBtnDisconnectSupabase) {
      this.elBtnDisconnectSupabase.addEventListener("click", () => this.disconnectSupabase());
    }
    if (this.elBtnPushToCloud) {
      this.elBtnPushToCloud.addEventListener("click", () => this.pushToCloud(this.currentDate, true));
    }
    if (this.elBtnPullFromCloud) {
      this.elBtnPullFromCloud.addEventListener("click", () => this.pullFromCloud(this.currentDate, true));
    }

    // Drag or Shift-click column letters to select a contiguous set of columns.
    document.querySelectorAll(".col-headers-row th.col-letter").forEach(th => {
      th.addEventListener("mousedown", e => {
        if (e.button !== 0 || e.target.closest(".col-resizer") || ["del", "spacer"].includes(th.dataset.col)) return;
        e.preventDefault();
        const start = e.shiftKey && this.columnAnchor ? this.columnAnchor : th.dataset.col;
        this.columnDragAnchor = start;
        this.selectEntireColumn(start, "", th.dataset.col);
      });
      th.addEventListener("mouseenter", () => {
        if (this.columnDragAnchor && !["del", "spacer"].includes(th.dataset.col)) this.selectEntireColumn(this.columnDragAnchor, "", th.dataset.col);
      });
    });
    document.addEventListener("mouseup", () => { this.columnDragAnchor = null; });

    // Corner Header Click (Select All Sheet)
    const cornerHeader = document.getElementById("cornerHeader");
    if (cornerHeader) {
      cornerHeader.addEventListener("click", event => {
        if (event.target.closest('#btnCloseHistorySearch')) {
          event.preventDefault(); event.stopPropagation();
          this.closeHistorySearch();
        } else this.selectAllCells();
      });
      document.getElementById('btnCloseHistorySearch')?.addEventListener('mousedown', event => event.preventDefault());
    }

    this.elDateLabel.addEventListener("click", () => this.openCalendar());

    // Date Navigation
    this.elDatePicker.addEventListener("change", (e) => {
      if (e.target.value) this.setDate(e.target.value);
    });

    this.elBtnPrevDay.addEventListener("click", () => this.shiftDay(-1));
    this.elBtnNextDay.addEventListener("click", () => this.shiftDay(1));
    this.elBtnGoToday.addEventListener("click", () => this.setDate(this.getTodayString(), true));

    const updateFontSize = () => {
      const status = this.getFormattingStatus("fontSize");
      document.getElementById("btnFontSize").textContent = parseFloat(status.value) || (status.label === "여러 값" ? "—" : "14");
      this.updateFontColorIndicator();
      this.updateBackgroundColorIndicator();
      this.updateAlignmentIndicator();
    };
    for (const [id, delta] of [["btnFontSmaller", -0.5], ["btnFontLarger", 0.5]]) {
      const button = document.getElementById(id);
      button.addEventListener("mousedown", e => e.preventDefault());
      button.addEventListener("click", () => {
        const value = parseFloat(this.getFormattingStatus("fontSize").value) || 14;
        this.applyColumnTypography("fontSize", Math.max(8, Math.min(72, value + delta)));
        updateFontSize();
      });
    }
    this.elSheetContainer.addEventListener("mouseup", updateFontSize);
    this.elSheetContainer.addEventListener("keyup", updateFontSize);

    // Rows management
    if (this.elBtnAddRow) {
      this.elBtnAddRow.addEventListener("click", () => this.addNewRow(true));
    }
    if (this.elBtnBottomAddRow) {
      this.elBtnBottomAddRow.addEventListener("click", () => this.addNewRow(true));
    }
    if (this.elBtnDeleteSelected) {
      this.elBtnDeleteSelected.addEventListener("click", () => this.deleteSelectedRow());
    }

    document.getElementById("btnFontColor").addEventListener("mousedown", event => { this.captureTextColorSelection(); event.preventDefault(); });
    document.getElementById("btnFontColor").addEventListener("click", event => this.openFontColorMenu(event.currentTarget));
    const backgroundButton = document.getElementById("btnBackgroundColor");
    backgroundButton.addEventListener("mousedown", event => event.preventDefault());
    backgroundButton.addEventListener("click", event => this.openFontColorMenu(event.currentTarget, "backgroundColor"));
    const alignmentButton = document.getElementById("btnTextAlign");
    alignmentButton.addEventListener("mousedown", event => event.preventDefault());
    alignmentButton.addEventListener("click", event => this.openAlignmentMenu(event.currentTarget));
    const patientSearchButton = document.getElementById("btnPatientSearch");
    patientSearchButton.addEventListener("mousedown", event => event.preventDefault());
    patientSearchButton.addEventListener("click", () => this.openSearchPromptModal(this.activeCell?.rowIdx ?? this.selectedRowIdx));

    for (const [id, property] of [["btnFontSize", "fontSize"], ["btnFontWeight", "fontWeight"]]) {
      const button = document.getElementById(id);
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", event => this.openColumnTypographyMenu(property, event.currentTarget));
    }

    // Formula Input Sync
    this.elFormulaInput.addEventListener("input", (e) => {
      if (!this.activeCell) return;
      const { rowIdx, colKey } = this.activeCell;
      const rows = this.getCurrentRows();
      if (rows[rowIdx]) {
        if (colKey === "writer" && e.isComposing) return;
        let val = e.target.value;
        if (colKey === "gender") {
          val = this.normalizeGenderInput(val);
          e.target.value = val;
          this.setGenderValue(rowIdx, val);
          return;
        }
        if (colKey === "writer" && !e.isComposing) {
          val = this.normalizeWriterInput(val);
          e.target.value = val;
        }
        rows[rowIdx][colKey] = val;
        const cellEl = document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="${colKey}"]`);
        if (cellEl) {
          const inputEl = cellEl.querySelector("input");
          if (inputEl) inputEl.value = val;
          else cellEl.textContent = val;
        }
        this.debounceSaveDataStore();
      }
    });
    this.elFormulaInput.addEventListener("compositionend", () => {
      let val = this.elFormulaInput.value;
      if (this.activeCell?.colKey === "writer") {
        val = this.normalizeWriterInput(val);
      }
      this.elFormulaInput.value = val;
      if (this.activeCell) {
        const { rowIdx, colKey } = this.activeCell;
        const rows = this.getCurrentRows();
        if (rows[rowIdx]) {
          rows[rowIdx][colKey] = val;
          const cellEl = document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="${colKey}"]`);
          if (cellEl) {
            const inputEl = cellEl.querySelector("input");
            if (inputEl) inputEl.value = val;
            else cellEl.textContent = val;
          }
        }
      }
      this.debounceSaveDataStore();
    });
    this.elFormulaInput.addEventListener("blur", () => {
      this.saveDataStore();
    });

    // Quick Chips (동적 렌더링 및 프리셋 관리)
    this.elQuickChipsContainer = document.getElementById("quickChipsContainer");
    this.elBtnAddPreset = document.getElementById("btnAddPreset");
    this.elBtnManagePresets = document.getElementById("btnManagePresets");
    this.elSearchPeriodSelect = document.getElementById("searchPeriodSelect");
    if (this.elSearchPeriodSelect) {
      this.elSearchPeriodSelect.value = this.getSearchPeriod();
      this.elSearchPeriodSelect.addEventListener("change", (e) => {
        this.setSearchPeriod(e.target.value);
      });
    }
    this.elPresetModal = document.getElementById("presetModal");
    this.elPresetModalTitle = document.getElementById("presetModalTitle");
    this.elPresetTypeSelect = document.getElementById("presetTypeSelect");
    this.elPresetLabelInput = document.getElementById("presetLabelInput");
    this.elPresetValueInput = document.getElementById("presetValueInput");
    this.elBtnPresetSave = document.getElementById("btnPresetSave");
    this.elBtnPresetCancel = document.getElementById("btnPresetCancel");
    this.elBtnClosePresetModal = document.getElementById("btnClosePresetModal");
    this.elPresetContextMenu = document.getElementById("presetContextMenu");
    this._editingPreset = null; // { type, index } 수정 모드일 때

    // 프리셋 전체 관리 모달 요소
    this.elPresetManagerModal = document.getElementById("presetManagerModal");
    this.elClosePresetManagerModal = document.getElementById("btnClosePresetManagerModal");
    this.elBtnManagerDone = document.getElementById("btnManagerDone");
    this.elTabPresetName = document.getElementById("tabPresetName");
    this.elTabPresetPart = document.getElementById("tabPresetPart");
    this.elTabPresetPrescription = document.getElementById("tabPresetPrescription");
    this.elTabPresetExtra = document.getElementById("tabPresetExtra");
    this.elTabPresetWriter = document.getElementById("tabPresetWriter");
    this.elTabPresetMemo = document.getElementById("tabPresetMemo");
    this.elTabPresetSpecialNote = document.getElementById("tabPresetSpecialNote");
    this.elManagerNewPresetInput = document.getElementById("managerNewPresetInput");
    this.elBtnManagerAddPreset = document.getElementById("btnManagerAddPreset");
    this.elPresetListContainer = document.getElementById("presetListContainer");
    this.elBtnManagerResetPresets = document.getElementById("btnManagerResetPresets");
    this.activePresetTab = "prescription";

    this.renderQuickChips();

    // 단일 추가/수정 모달 이벤트
    if (this.elBtnAddPreset) {
      this.elBtnAddPreset.addEventListener("click", () => this.openPresetModal("add"));
    }
    if (this.elBtnPresetSave) {
      this.elBtnPresetSave.addEventListener("click", () => this.savePresetFromModal());
    }
    if (this.elBtnPresetCancel) {
      this.elBtnPresetCancel.addEventListener("click", () => this.closePresetModal());
    }
    if (this.elBtnClosePresetModal) {
      this.elBtnClosePresetModal.addEventListener("click", () => this.closePresetModal());
    }
    if (this.elPresetModal) {
      this.elPresetModal.addEventListener("click", (e) => {
        if (e.target === this.elPresetModal) this.closePresetModal();
      });
    }

    // 전체 관리 모달 이벤트
    if (this.elBtnManagePresets) {
      this.elBtnManagePresets.addEventListener("click", () => this.openPresetManager());
    }
    if (this.elClosePresetManagerModal) {
      this.elClosePresetManagerModal.addEventListener("click", () => this.closePresetManager());
    }
    if (this.elBtnManagerDone) {
      this.elBtnManagerDone.addEventListener("click", () => this.closePresetManager());
    }
    if (this.elPresetManagerModal) {
      this.elPresetManagerModal.addEventListener("click", (e) => {
        if (e.target === this.elPresetManagerModal) this.closePresetManager();
      });
      this.elPresetManagerModal.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;
        const controls = Array.from(this.elPresetManagerModal.querySelectorAll('button:not(:disabled), input:not(:disabled), summary'))
          .filter(element => element.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      });
    }
    if (this.elTabPresetPrescription) {
      this.elTabPresetPrescription.addEventListener("click", () => this.switchPresetTab("prescription"));
    }
    if (this.elTabPresetExtra) {
      this.elTabPresetExtra.addEventListener("click", () => this.switchPresetTab("extra"));
    }
    for (const [tab, element] of [["name", this.elTabPresetName], ["part", this.elTabPresetPart], ["writer", this.elTabPresetWriter], ["memo", this.elTabPresetMemo], ["specialNote", this.elTabPresetSpecialNote]]) {
      element?.addEventListener("click", () => this.switchPresetTab(tab));
    }
    if (this.elBtnManagerAddPreset) {
      this.elBtnManagerAddPreset.addEventListener("click", () => this.addPresetFromManager());
    }
    if (this.elManagerNewPresetInput) {
      this.elManagerNewPresetInput.addEventListener("keydown", (e) => this.handlePresetManagerAddKeyDown(e));
    }
    if (this.elBtnManagerResetPresets) {
      this.elBtnManagerResetPresets.addEventListener("click", () => this.resetPresetsFromManager());
    }

    // 프리셋 우클릭 메뉴 액션
    this.elPresetContextMenu.querySelectorAll(".menu-item").forEach((item) => {
      item.addEventListener("click", () => {
        const action = item.dataset.action;
        this.handlePresetContextAction(action);
        this.hidePresetContextMenu();
      });
    });

    // 외부 클릭 시 프리셋 컨텍스트 메뉴 닫기
    document.addEventListener("click", () => this.hidePresetContextMenu());

    // Search
    this.elSearchInput.addEventListener("input", () => this.handleSearch());
    this.elSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const q = this.elSearchInput.value.trim();
        if (q && typeof this.hasAnySearchMatches === "function" && !this.hasAnySearchMatches(q)) {
          this.showSearchNotFoundModal("일치하는 환자 내역이 없습니다.");
        }
      }
    });
    this.elBtnClearSearch.addEventListener("click", () => {
      this.elSearchInput.value = "";
      this.handleSearch();
    });

    // Search Not Found Modal
    if (this.elBtnCloseSearchNotFound) {
      this.elBtnCloseSearchNotFound.addEventListener("click", () => this.closeSearchNotFoundModal());
    }
    if (this.elSearchNotFoundModal) {
      this.elSearchNotFoundModal.addEventListener("click", (e) => {
        if (e.target === this.elSearchNotFoundModal) this.closeSearchNotFoundModal();
      });
    }

    // Search Prompt Modal
    if (this.elBtnCloseSearchPrompt) {
      this.elBtnCloseSearchPrompt.addEventListener("click", () => this.closeSearchPromptModal());
    }
    if (this.elBtnSearchPromptCancel) {
      this.elBtnSearchPromptCancel.addEventListener("click", () => this.closeSearchPromptModal());
    }
    if (this.elBtnSearchPromptSubmit) {
      this.elBtnSearchPromptSubmit.addEventListener("click", () => this.submitSearchPrompt());
    }
    if (this.elSearchPromptInput) {
      this.elSearchPromptInput.addEventListener("input", () => this.updateSearchPromptAutocomplete());
      this.elSearchPromptInput.addEventListener("keydown", (e) => {
        if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) e.stopPropagation();
        if (e.isComposing || e.keyCode === 229) return;
        if (["ArrowDown", "ArrowUp"].includes(e.key) && this._searchPromptACMenu) {
          e.preventDefault();
          this.moveSearchPromptAutocompleteSelection(e.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (!e.repeat) {
            this.historyApplyBlockedKey = "enter";
            this.historySearchEnterAt = Date.now();
            this.submitSearchPrompt();
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.closeSearchPromptModal();
        }
      });
    }
    if (this.elSearchPromptModal) {
      this.initSearchPromptDrag();
      this.elSearchPromptModal.addEventListener("click", (e) => {
        if (e.target === this.elSearchPromptModal) this.closeSearchPromptModal();
      });
    }

    // Preview & Print Modal
    this.elBtnPreview.addEventListener("click", () => this.openPreviewModal());
    this.elBtnClosePreview.addEventListener("click", () => this.closePreviewModal());
    this.elBtnPrintConfirm.addEventListener("click", () => window.print());

    // Export CSV
    this.elBtnExportCsv.addEventListener("click", () => this.exportCurrentDayCsv());

    // Backup & Restore
    this.elBtnCloseBackup.addEventListener("click", () => this.closeBackupModal());
    this.elBtnDownloadBackup.addEventListener("click", () => this.downloadFullBackup());
    this.elFileRestore.addEventListener("change", (e) => this.handleRestoreFile(e));
    this.elBtnClearAllData.addEventListener("click", () => this.clearCurrentDayData());

    // Summary Sidebar Toggle
    this.initSummaryToggle();

    // Keyboard Shortcuts
    // Intercept search before native editor/IME bubbling can lose its target.
    document.addEventListener("keydown", e => {
      if (!e.defaultPrevented) this.handlePatientEditorSearchShortcut(e);
    }, true);
    document.addEventListener("keydown", (e) => this.handleGlobalKeyDown(e));
    document.addEventListener("keyup", (e) => {
      this.releaseHistorySearchKey(e);
      if (e.key === "ArrowLeft" || e.code === "ArrowLeft") this.presetLeftKeyHeld = false;
    });
    this.elSheetContainer.addEventListener("scroll", () => this.syncHistoryRowHeaderPosition(), { passive: true });
    window.addEventListener("blur", () => { this.historyApplyBlockedKey = null; this.presetLeftKeyHeld = false; this.directHistorySearchKeyHeld = false; });

    document.addEventListener("paste", event => {
      const target = event.target;
      if (this.crossDateSelection) { event.preventDefault(); return; }
      if (!this.activeCell && !this.selectedRange && this.selectedRowIdx === null) return;
      if (target.matches?.("input, textarea") && !target.matches(".cell-input-element")) return;
      const text = event.clipboardData?.getData("text/plain");
      const html = event.clipboardData?.getData("text/html") || "";
      if (text == null) return;
      if (target.matches?.(".cell-input-element:not(.is-armed)") && !/[\t\r\n]/.test(text) && !/<table\b/i.test(html)) {
        const cell = target.closest(".excel-cell");
        const colKey = cell?.dataset.col;
        if (["name", "chartNo"].includes(colKey)) {
          // Native paste must keep its caret/text insertion behavior. Refresh only
          // after the resulting input event, not before the pasted text is inserted.
          const refreshVisit = () => {
            const rowIdx = Number(cell.dataset.row);
            const row = this.getCurrentRows()[rowIdx];
            if (!row) return;
            const includesName = colKey === "name" || this.applyCompoundPatientInput(row, colKey, target.value);
            if (!includesName || !String(row?.name ?? "").trim()) return;
            this.setVisitTimeNow(row);
            const timeCell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="visitTime"]`);
            if (timeCell) this.renderColoredText(timeCell, row, "visitTime");
            this.saveDataStore();
          };
          target.addEventListener("input", refreshVisit, { once: true });
          setTimeout(() => target.removeEventListener("input", refreshVisit), 0);
        }
        return;
      }
      event.preventDefault();
      if (target.matches?.(".cell-input-element")) target.blur();
      void this.pasteSelection(text, html);
    });

    // PWA에서 Cmd+C/X 시 keydown이 처리 못하는 경우 copy/cut 이벤트로 fallback
    document.addEventListener("copy", (e) => {
      // input/textarea 내부에서의 복사는 무시 (텍스트 편집 중)
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      if (this.crossDateSelection || this.activeCell || this.selectedRange || this.selectedColKey !== null || this.selectedRowIdx !== null) {
        e.preventDefault();
        this.copySelection();
      }
    });

    document.addEventListener("cut", (e) => {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      if (this.activeCell || this.selectedRange || this.selectedColKey !== null || this.selectedRowIdx !== null) {
        e.preventDefault();
        this.cutSelection();
      }
    });

    // Close modal & context menu on escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeGenderDropdown();
        this.hideContextMenu();
        this.closePreviewModal();
        this.closeBackupModal();
        this.closeSupabaseModal();
        this.closePresetModal();
        this.closePresetManager();
        this.hidePresetContextMenu();
      }
    });

    // Close context menu on outside click
    document.addEventListener("click", (e) => {
      if (this.elContextMenu && !this.elContextMenu.contains(e.target)) {
        this.hideContextMenu();
      }
    });

    // Global mouseup to finish drag selection (cells or rows)
    document.addEventListener("mousemove", (event) => {
      this.updateFillDrag(event);
      if (this._isRowDragging && event.buttons === 1 && this._rowDragAnchor !== undefined) {
        const tr = event.target.closest("tr.excel-row");
        if (tr && tr.dataset.rowIdx !== undefined) {
          const rIdx = Number(tr.dataset.rowIdx);
          if (Number.isInteger(rIdx)) {
            this.selectRowRange(this._rowDragAnchor, rIdx);
          }
        }
      }
    });
    window.addEventListener("blur", () => this.cancelFillDrag());
    document.addEventListener("mouseup", (event) => {
      this.isSelectingCrossDate = false;
      this._isRowDragging = false;
      this._rowDragAnchor = undefined;
      if (this.fillDrag) this.finishFillDrag(event);
      let changed = false;
      if (this.isSelectingRange) {
        this.isSelectingRange = false;
        changed = true;
      }
      if (this.isSelectingRows) {
        this.isSelectingRows = false;
        changed = true;
      }
      if (changed && this.elSheetContainer) {
        this.elSheetContainer.classList.remove("is-selecting");
      }
    });

    window.addEventListener("resize", () => {
      if (document.getElementById("crossDateInnerTable")) {
        this.syncCrossDateColWidths();
      }
    });
  }

  // Keep the default row count and fifteen empty rows below the last entered record.
}
