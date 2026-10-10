// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTPatientSearchDialog {
  handleSearchPromptKeyDown(e) {
    const enter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter" || e.keyCode === 13;
    if (enter || ["ArrowDown", "ArrowUp", "Escape"].includes(e.key)) e.stopPropagation();
    if (enter) {
      if (e.repeat || this.searchPromptEnterPending) return;
      this.historyApplyBlockedKey = "enter";
      this.historySearchEnterAt = Date.now();
      if (e.isComposing || e.keyCode === 229) {
        // Let the native Enter confirm Korean text before reading the final value.
        const requestId = this.searchPromptRequestId || 0;
        this.searchPromptEnterPending = true;
        this.searchPromptEnterTimer = setTimeout(() => {
          this.searchPromptEnterPending = false;
          if ((this.searchPromptRequestId || 0) !== requestId) return;
          this.elSearchPromptInput.blur?.();
          void this.submitSearchPrompt();
        }, 0);
      } else {
        e.preventDefault();
        void this.submitSearchPrompt();
      }
      return;
    }
    if (e.isComposing || e.keyCode === 229) return;
    if (["ArrowDown", "ArrowUp"].includes(e.key) && this._searchPromptACMenu) {
      e.preventDefault();
      this.moveSearchPromptAutocompleteSelection(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.closeSearchPromptModal();
    }
  }

  cancelSearchPromptSubmission() {
    clearTimeout(this.searchPromptEnterTimer);
    this.searchPromptEnterPending = false;
    this.searchPromptSubmission?.cancel();
    this.searchPromptSubmission = null;
    this.searchPromptSubmitting = false;
    this.elSearchPromptInput?.removeAttribute?.("aria-busy");
    const button = this.elBtnSearchPromptSubmit;
    if (button) {
      button.disabled = false;
      if (this.searchPromptSubmitLabel !== undefined) button.innerHTML = this.searchPromptSubmitLabel;
    }
  }

  openSearchPromptModal(targetRowIdx, initialQuery) {
    // Windows IME can replay F without marking it as a repeat after the editor
    // has gone. The same physical shortcut must not reopen the prompt.
    if (this.directHistorySearchKeyHeld) return;
    this.searchPromptRequestId = (this.searchPromptRequestId || 0) + 1;
    this.cancelSearchPromptSubmission();
    clearTimeout(this.searchPromptFocusTimer);
    this.captureHistoryOriginSelection();
    this.searchPromptTargetRowIdx = Number.isInteger(targetRowIdx) ? targetRowIdx : this.findFirstEmptyRowIndex();
    if (!this.elSearchPromptModal || !this.elSearchPromptInput) return;
    this.elSearchPromptInput.value = initialQuery ?? (this.elSearchInput?.value?.trim() || "");
    const cellName = String(this.getCurrentRows()[this.searchPromptTargetRowIdx]?.name ?? "").trim();
    this.searchPromptCellName = cellName && cellName === this.elSearchPromptInput.value.trim() ? cellName : null;
    this.elSearchPromptModal.style.display = "flex";
    this.restoreSearchPromptPosition();
    this.searchPromptFocusTimer = setTimeout(() => {
      if (this.elSearchPromptModal.style.display !== "flex") return;
      this.elSearchPromptInput.focus();
      this.elSearchPromptInput.select();
      this.updateSearchPromptAutocomplete();
    }, 60);
  }

  closeSearchPromptModal() {
    this.searchPromptRequestId = (this.searchPromptRequestId || 0) + 1;
    this.cancelSearchPromptSubmission();
    clearTimeout(this.searchPromptFocusTimer);
    if (!this.elSearchPromptModal) return;
    this.closeSearchPromptAutocomplete();
    this.elSearchPromptModal.style.display = "none";
    this.elSheetContainer?.focus({ preventScroll: true });
  }

  positionSearchPrompt(left, top) {
    const card = this.elSearchPromptModal?.querySelector(".search-prompt-card");
    if (!card || !Number.isFinite(left) || !Number.isFinite(top)) return;
    const rect = card.getBoundingClientRect();
    const position = {
      left: Math.max(8, Math.min(left, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - rect.height - 8)),
    };
    card.style.position = "fixed";
    card.style.left = `${position.left}px`;
    card.style.top = `${position.top}px`;
    this._searchPromptACPosition?.();
    return position;
  }

  restoreSearchPromptPosition() {
    const card = this.elSearchPromptModal?.querySelector(".search-prompt-card");
    if (!card) return;
    if (this.searchPromptPosition === undefined) {
      this.searchPromptPosition = null;
      try {
        const saved = JSON.parse(localStorage.getItem("PT_SEARCH_PROMPT_POSITION") || "null");
        if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) this.searchPromptPosition = saved;
      } catch (_) {}
    }
    if (this.searchPromptPosition) {
      this.positionSearchPrompt(this.searchPromptPosition.left, this.searchPromptPosition.top);
    } else {
      card.style.position = ""; card.style.left = ""; card.style.top = "";
    }
  }

  initSearchPromptDrag() {
    const card = this.elSearchPromptModal.querySelector(".search-prompt-card");
    const header = card?.querySelector(".modal-header");
    if (!header) return;
    let drag = null;
    header.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest("button")) return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
      header.setPointerCapture(event.pointerId);
      header.classList.add("is-dragging");
    });
    header.addEventListener("pointermove", event => {
      if (drag?.id !== event.pointerId) return;
      drag.position = this.positionSearchPrompt(event.clientX - drag.x, event.clientY - drag.y);
    });
    const finish = () => {
      if (drag?.position) {
        this.searchPromptPosition = drag.position;
        try { localStorage.setItem("PT_SEARCH_PROMPT_POSITION", JSON.stringify(drag.position)); } catch (_) {}
      }
      drag = null;
      header.classList.remove("is-dragging");
    };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) header.addEventListener(event, finish);
    window.addEventListener("resize", () => {
      if (this.elSearchPromptModal.style.display === "none" || card.style.position !== "fixed") return;
      const rect = card.getBoundingClientRect(); this.positionSearchPrompt(rect.left, rect.top);
    });
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
      if (!item.typed) {
        const patientInfo = document.createElement("span");
        patientInfo.className = "search-prompt-patient-info";
        if (item.value !== item.name) patientInfo.classList.add("search-prompt-patient-name");
        patientInfo.textContent = item.value === item.name ? item.chartNo : item.name;
        label.appendChild(patientInfo);
      }
      const hint = document.createElement("span");
      hint.className = "search-prompt-option-hint";
      hint.textContent = "Enter";
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
    this._searchPromptACPosition = position;
    window.addEventListener("resize", position);
    this._searchPromptACCleanup = () => {
      this._searchPromptACPosition = null;
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
    const cutoffDate = typeof this.getSearchCutoffDate === "function" ? this.getSearchCutoffDate() : null;
    const dateKeys = [this.currentDate, ...Object.keys(searchStore).filter(d => d !== this.currentDate && (!cutoffDate || d >= cutoffDate)).sort().reverse()];

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
    const cutoffDate = typeof this.getSearchCutoffDate === "function" ? this.getSearchCutoffDate() : null;
    return Object.entries(this.getSearchDataStore()).some(([date, rows]) =>
      date <= this.currentDate && (!cutoffDate || date >= cutoffDate) && Array.isArray(rows) && rows.some((row, index) =>
        !(date === this.currentDate && index === targetRowIdx) &&
        String(row?.[field] ?? "").trim().toLowerCase() === normalized));
  }

  hasAnySearchMatches(query) {
    if (!query || !query.trim()) return false;
    const q = query.trim().toLowerCase();
    const searchStore = this.getSearchDataStore();
    const isChartQuery = this.isChartNumberQuery(q);
    const cutoffDate = typeof this.getSearchCutoffDate === "function" ? this.getSearchCutoffDate() : null;
    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const isNameQuery = Object.values(searchStore).some(rows => Array.isArray(rows) &&
      rows.some(row => String(row?.name ?? "").trim().toLowerCase().includes(q)));

    for (const [date, rows] of Object.entries(searchStore)) {
      if (cutoffDate && date < cutoffDate) continue;
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row || (!row.name && !row.chartNo && !row.part && !row.prescription)) continue;
        const matches = isChartQuery ? String(row.chartNo ?? "").trim().toLowerCase() === q : isNameQuery
          ? String(row.name ?? "").trim().toLowerCase() === q
          : colKeys.some(k => String(row[k] || "").toLowerCase().includes(q));
        if (matches) return true;
      }
    }
    return false;
  }

  showSearchNotFoundModal(message = "일치하는 환자 내역이 없습니다.", { query, targetRowIdx } = {}) {
    const row = this.getCurrentRows()[targetRowIdx];
    const fromNameCell = this.activeCell?.colKey === "name" && this.activeCell.rowIdx === targetRowIdx &&
      Boolean(String(query ?? "").trim()) &&
      String(row?.name ?? "").trim().toLowerCase() === String(query).trim().toLowerCase();
    this.searchNotFoundReturnTarget = {
      date: this.currentDate, row: fromNameCell ? row : null, rowIdx: targetRowIdx
    };
    const modal = document.getElementById?.("searchNotFoundModal");
    const msgEl = document.getElementById?.("searchNotFoundMessage");
    const btnClose = document.getElementById?.("btnCloseSearchNotFound");

    if (msgEl) msgEl.textContent = message;

    if (modal) {
      modal.style.display = "flex";
      btnClose?.focus();

      const handleKey = (e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cleanup();
          this.closeSearchNotFoundModal();
        }
      };

      const cleanup = () => {
        document.removeEventListener?.("keydown", handleKey, true);
        this._searchNotFoundCleanup = null;
      };

      this._searchNotFoundCleanup = cleanup;
      document.addEventListener?.("keydown", handleKey, true);
    } else if (typeof alert === "function") {
      alert(message);
    }
  }

  closeSearchNotFoundModal() {
    this._searchNotFoundCleanup?.();
    this._searchNotFoundCleanup = null;
    const modal = document.getElementById?.("searchNotFoundModal");
    if (modal) modal.style.display = "none";
    const target = this.searchNotFoundReturnTarget;
    this.searchNotFoundReturnTarget = null;
    if (target?.date !== this.currentDate) return;
    const rows = this.getCurrentRows();
    const originIdx = target.row ? rows.indexOf(target.row) : -1;
    // General searches resume immediately after the last named row, including gaps.
    const rowIdx = originIdx >= 0 ? originIdx : rows.findLastIndex(row => String(row?.name ?? "").trim()) + 1;
    if (rowIdx >= rows.length) this.addNewRow(false);
    const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="name"]`);
    if (cell) {
      this.selectCell(rowIdx, "name", cell, originIdx < 0);
      this.ensureCurrentCellVisible(cell);
      this.focusSelectedCellEditor();
    }
    this.historyOriginSelection = undefined;
  }

  async searchPatientHistory(query, targetRowIdx) {
    this.closeSearchPromptModal();
    if (this.supabaseClient) await this.loadSearchHistory();
    // A repeated IME shortcut can open a prompt while cloud history is loading.
    if (this.elSearchPromptModal?.style.display === "flex") this.closeSearchPromptModal();
    const searchByChart = this.isChartNumberQuery(query);
    const exists = searchByChart ? this.hasRecordedPatientValue(query, targetRowIdx, "chartNo") : this.hasRecordedPatientName(query, targetRowIdx);
    if (!exists) {
      if (this.supabaseClient && this.searchHistoryLoadError) {
        this.showSaveIndicator("검색 기록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 검색해 주세요.", true);
        return false;
      }
      this.showSearchNotFoundModal("일치하는 환자 내역이 없습니다.", { query, targetRowIdx });
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
    const requestId = this.searchPromptRequestId || 0;
    const submission = {};
    const cancelled = new Promise(resolve => { submission.cancel = resolve; });
    this.searchPromptSubmission = submission;
    const button = this.elBtnSearchPromptSubmit;
    if (button && this.searchPromptSubmitLabel === undefined) this.searchPromptSubmitLabel = button.innerHTML;
    if (button) { button.disabled = true; button.textContent = "검색 중"; }
    this.elSearchPromptInput.setAttribute?.("aria-busy", "true");
    try {
      if (this.supabaseClient) await Promise.race([this.loadSearchHistory(), cancelled]);
      // Closing or reopening the dialog must invalidate its old async result.
      if (this.searchPromptSubmission !== submission || (this.searchPromptRequestId || 0) !== requestId) return;
      // Ignore the active draft row: typing a new name does not establish history.
      const normalized = q.toLowerCase();
      const searchByChart = this.isChartNumberQuery(q);
      // loadSearchHistory already refreshes expired or incomplete history.
      // A miss must not force a second full download of the same date range.
      const exists = this.hasRecordedPatientValue(normalized, targetIdx, searchByChart ? "chartNo" : "name");
      if (!exists) {
        if (this.supabaseClient && this.searchHistoryLoadError) {
          this.showSaveIndicator("검색 기록을 불러오지 못했습니다. 연결을 확인한 뒤 다시 검색해 주세요.", true);
          return;
        }
        this.closeSearchPromptModal();
        this.showSearchNotFoundModal("일치하는 환자 내역이 없습니다.", { query: q, targetRowIdx: targetIdx });
        return;
      }
      this.closeSearchPromptModal();
      const targetRow = this.getCurrentRows()[targetIdx];
      const field = searchByChart ? "chartNo" : "name";
      const focusCurrentTarget = String(targetRow?.[field] ?? "").trim().toLowerCase() === normalized;
      this.searchAllDates(q, targetIdx, { focusCurrentTarget });
    } catch (error) {
      if (!this.searchPromptSubmission || this.searchPromptSubmission === submission) this.showSaveIndicator("검색을 완료하지 못했습니다. 다시 검색해 주세요.", true);
    } finally {
      if (this.searchPromptSubmission === submission) {
        this.cancelSearchPromptSubmission();
        if (this.elSearchPromptModal?.style.display === "flex") this.elSearchPromptInput.focus?.({ preventScroll: true });
      }
    }
  }

}
