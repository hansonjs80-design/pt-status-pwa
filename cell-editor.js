// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTCellEditor {
  isKoreanPreferredColumn(colKey) {
    return !["writer", "gender"].includes(colKey);
  }

  usesWindowsNativeInput() {
    if (typeof navigator === "undefined") return false;
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    return /^Win/i.test(platform) || /Windows NT/i.test(navigator.userAgent || "");
  }

  usesNativeCellInput() {
    if (this.usesWindowsNativeInput()) return true;
    if (typeof navigator === "undefined") return false;
    const platform = navigator.userAgentData?.platform || navigator.platform || "";
    return /Mac/i.test(platform);
  }

  getCellInputLanguage(colKey) {
    if (this.usesNativeCellInput()) return colKey === "name" ? "kor" : "native";
    return this._cellInputLanguage || "kor";
  }

  rememberCellWindowInput(input = document.activeElement) {
    if (!this.usesNativeCellInput()) return;
    const selected = this.activeCell;
    const previous = this.cellWindowInput;
    this.cellWindowInput = null;
    if (!selected || selected.colKey === "gender" || this.crossDateSelection || this.selectedColumnRange || this.selectedRowRange) return;
    if (this.selectedRange && (this.selectedRange.minRow !== this.selectedRange.maxRow ||
        this.selectedRange.minCol !== this.selectedRange.maxCol)) return;
    const cell = this.elTableBody?.querySelector(`[data-row="${selected.rowIdx}"][data-col="${selected.colKey}"]`);
    const editor = cell?.querySelector("input");
    if (input && input !== document.body && input !== this.elSheetContainer && input !== editor) return;
    // Element blur may remove the editor before the window blur event arrives.
    if (input !== editor && previous?.date === this.currentDate &&
        previous.rowIdx === selected.rowIdx && previous.colKey === selected.colKey) {
      this.cellWindowInput = previous;
      return;
    }
    this.cellWindowInput = { ...selected, date: this.currentDate,
      armed: !editor || editor.classList.contains("is-armed"),
      text: editor?.value, start: editor?.selectionStart, end: editor?.selectionEnd };
  }

  restoreCellWindowInput() {
    if (document.visibilityState === "hidden" || document.hasFocus?.() === false) return;
    const saved = this.cellWindowInput;
    this.cellWindowInput = null;
    if (!saved || this._recordsRestorePending || saved.date !== this.currentDate ||
        this.activeCell?.rowIdx !== saved.rowIdx || this.activeCell?.colKey !== saved.colKey ||
        this.crossDateSelection || this.selectedColumnRange || this.selectedRowRange) return;
    if (this.selectedRange && (this.selectedRange.minRow !== this.selectedRange.maxRow ||
        this.selectedRange.minCol !== this.selectedRange.maxCol)) return;
    if ([...document.querySelectorAll('.modal-overlay, dialog[open], #excelContextMenu, #fontColorMenu, #columnTypographyMenu')]
        .some(element => element.getClientRects().length)) return;
    const cell = this.elTableBody?.querySelector(`[data-row="${saved.rowIdx}"][data-col="${saved.colKey}"]`);
    if (!cell?.isConnected || !cell.getClientRects().length) return;
    const editor = cell.querySelector("input");
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused !== this.elSheetContainer && focused !== editor) return;
    // Reuse an existing native composition/caret without recreating its input.
    if (editor) { if (focused !== editor) editor.focus({ preventScroll: true }); return; }
    this.startInlineEdit(saved.rowIdx, saved.colKey, cell, saved.armed);
    const restored = cell.querySelector("input");
    if (restored && !saved.armed && restored.value === saved.text && Number.isInteger(saved.start)) {
      restored.setSelectionRange(saved.start, saved.end);
    }
  }

  initCellWindowFocus() {
    if (this.cellWindowFocusBound) return;
    this.cellWindowFocusBound = true;
    window.addEventListener("blur", () => this.rememberCellWindowInput());
    const resume = () => {
      this.restoreCellWindowInput();
      // Some browsers update document focus just after the window event.
      setTimeout(() => this.restoreCellWindowInput(), 0);
    };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.rememberCellWindowInput();
      else resume();
    });
  }

  isHangulToggleKeyEvent(e) {
    if (!e) return false;
    // Windows Korean/English key (the Hanja/Lang2 key is a separate action).
    if (["HangulMode", "Hangul", "ModeChange", "KanaMode"].includes(e.key)) return true;
    if (e.code === "Lang1" || e.code === "KeyLang1") return true;
    if (e.keyCode === 21 || e.which === 21) return true;
    if (e.key === "Process" && (e.code === "AltRight" || e.code === "HangulMode")) return true;
    if (e.key === "Alt" && (e.code === "AltRight" || e.location === 2)) return true;
    if (e.key === "AltGraph" || e.code === "AltRight") return true;

    // 2) macOS 한영 전환키 (기본 CapsLock, Ctrl+Space, Cmd+Space, Shift+Space, OSRight/MetaRight)
    if (e.key === "CapsLock" || e.code === "CapsLock" || e.keyCode === 20) return true;
    if ((e.ctrlKey || e.metaKey) && (e.code === "Space" || e.key === " ")) return true;
    if (e.shiftKey && (e.code === "Space" || e.key === " ")) return true;
    if (e.code === "OSRight" || e.code === "MetaRight") return true;

    return false;
  }

  clearKoreanKeyBuffer(input) {
    input._engKorBuffer = "";
    input._engKorPrefix = "";
    input._engKorSuffix = "";
  }

  rememberCellKeyValue(input, nativeData = null) {
    input._cellKeyValue = { value: input.value, start: input.selectionStart, end: input.selectionEnd, nativeData };
  }

  beginCellComposition(input) {
    if (input._nativeCellComposition) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input._nativeCellComposition = { prefix: input.value.slice(0, start), suffix: input.value.slice(end) };
  }

  projectCellComposition(input, event, commit = false) {
    const range = input._nativeCellComposition;
    const correction = input._forcedCorrectionProjection;
    const sourceEnglish = correction?.nativeEnglish || (!this.usesNativeCellInput() && input._inputLanguage === 'eng' && !correction?.nativeKorean);
    if (!range || !sourceEnglish || typeof event.data !== "string") return input.value;
    // Composition data replaces the whole current composition, not the text
    // from the preceding input event. Project it once from the original range.
    const text = this.convertHangulToEng(event.data);
    range.data = event.data;
    // A language-changing correction owns its visible prefix. Keep its source
    // composition mapping until the correction itself commits.
    if (commit && (correction?.nativeKorean || correction?.nativeEnglish)) return input.value;
    const value = range.prefix + text + range.suffix;
    if (commit) {
      input.value = value;
      input.setSelectionRange(range.prefix.length + text.length, range.prefix.length + text.length);
      this.rememberCellKeyValue(input, event.data);
    }
    return value;
  }

  getCellEditorBaseValue(input) {
    const range = input._nativeCellComposition;
    return range && ((!this.usesNativeCellInput() && input._inputLanguage === "eng") || input._forcedCorrectionProjection?.nativeEnglish) && typeof range.data === "string"
      ? range.prefix + this.convertHangulToEng(range.data) + range.suffix : input.value;
  }

  getCellEditorValue(input) {
    return input._forcedCorrectionProjection?.value ?? this.getCellEditorBaseValue(input);
  }

  normalizeCellEditorValue(input, value, colKey) {
    const text = String(value ?? '');
    const normalized = colKey === 'writer' ? this.normalizeWriterInput(text)
      : colKey === 'prescription' ? this.normalizePrescriptionInput(text) : text.trim();
    if (!input._preserveBoundaryWhitespace || !text.trim()) return normalized;
    return text.match(/^\s*/)[0] + normalized + text.match(/\s*$/)[0];
  }

  refreshNativeLanguagePreview(input) {
    input.nativeLanguagePreview?.remove();
    input.nativeLanguagePreview = null;
    const range = input._nativeCellComposition;
    const correction = input._forcedCorrectionProjection;
    const show = input.dataset.nativeComposing === "true" && (correction ||
      (!this.usesNativeCellInput() && input._inputLanguage === "eng" && typeof range?.data === "string"));
    input.classList.toggle("has-native-language-preview", show);
    if (!show) return;
    // Do not rewrite input.value during native composition: that ends the OS
    // composition and causes its later commit to be inserted a second time.
    const preview = document.createElement("span");
    preview.className = "native-language-preview";
    preview.setAttribute("aria-hidden", "true");
    const font = getComputedStyle(input);
    preview.style.font = font.font;
    preview.style.letterSpacing = font.letterSpacing;
    const value = this.getCellEditorValue(input);
    preview.style.left = `${this.getEditorTextLeft(input, font, value)}px`;
    const offset = correction?.caret ?? (range.prefix.length + this.convertHangulToEng(range.data).length);
    const before = value.slice(0, offset), after = value.slice(offset);
    preview.append(document.createTextNode(before));
    const caret = document.createElement("span");
    caret.className = "native-language-caret";
    preview.append(caret);
    const state = this.autocompleteState;
    if (state?.input === input && state.query === value && !after &&
        input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
      const suffix = this.getInlineCompletionSuffix(value, this.getSelectedAutocompleteItem());
      if (suffix) {
        const completion = document.createElement("span");
        completion.className = "inline-completion-suffix";
        completion.textContent = suffix;
        preview.append(completion);
      }
    }
    preview.append(document.createTextNode(after));
    input.parentElement.append(preview);
    input.nativeLanguagePreview = preview;
  }

  restoreHandledCellKey(input, event) {
    const saved = input._cellKeyValue;
    if (input._koreanNameOnly && saved?.nativeData == null &&
        (event.type === "compositionstart" || event.inputType === "insertCompositionText")) {
      // A new native Korean composition may arrive without a usable keydown.
      // It replaces the software draft instead of replaying its last key.
      delete input._cellKeyValue;
      this.clearKoreanKeyBuffer(input);
      return false;
    }
    if (this.usesNativeCellInput() && !input._koreanNameOnly && saved && saved.nativeData == null) {
      // Ordinary native input is owned by the IME. A previous replacement's
      // generic guard must not swallow input after an OS-only language change.
      delete input._cellKeyValue;
      return false;
    }
    if (saved?.nativeData !== null && saved?.nativeData !== undefined &&
        (event.type === "compositionstart" || (typeof event.data === "string" && event.data !== saved.nativeData))) {
      // The previous composition can end after the next physical keydown.
      // Its final-input guard belongs only to that committed text, never to
      // a new composition or different text from the next letter.
      delete input._cellKeyValue;
      return false;
    }
    if (!saved || !(event.isComposing || /[Cc]omposition/.test(event.type || "") ||
        /Composition/.test(event.inputType || "") || event.inputType === "insertText")) return false;
    // Some IMEs insert again after a handled Latin key. Restore the one
    // value owned by the physical key; never append successive composition data.
    if (event.cancelable) event.preventDefault();
    if (input.value !== saved.value) {
      input.value = saved.value;
      input.setSelectionRange(saved.start, saved.end);
    }
    input.dataset.composing = "false";
    input.dataset.nativeComposing = "false";
    return true;
  }

  toggleCellInputLanguage(event, input = null) {
    // Let Windows and macOS own the IME. Cancelling language keys or
    // converting Latin keydowns desynchronizes the OS input-source indicator.
    if (this.usesNativeCellInput()) return false;
    // Windows IMEs can identify a key only on keyup (keydown is Process/229).
    // Pair recognized keydown/keyup even if their key/code names differ.
    const down = this._cellLanguageToggleDown;
    if (event.type === "keyup" && down && (this.isHangulToggleKeyEvent(event) ||
        (event.code && event.code === down.code) || (event.key && event.key === down.key))) {
      this._cellLanguageToggleDown = null;
      event.preventDefault();
      event.stopPropagation?.();
      return true;
    }
    if (!this.isHangulToggleKeyEvent(event)) return false;
    // Consume here, including modifier shortcuts, before the event can bubble
    // to the sheet and toggle a second time. Holding a key is still one switch.
    event.preventDefault();
    event.stopPropagation?.();
    if (event.repeat) return true;
    if (event.type !== "keyup") this._cellLanguageToggleDown = { code: event.code, key: event.key };
    const language = input?._inputLanguage || this._cellInputLanguage || "kor";
    this._cellInputLanguage = language === "eng" ? "kor" : "eng";
    if (input) {
      const range = input._nativeCellComposition;
      const value = this.getCellEditorValue(input);
      if (input.value !== value) {
        input.value = value;
        const caret = input._forcedCorrectionProjection?.caret ?? (range.prefix.length + this.convertHangulToEng(range.data).length);
        input.setSelectionRange(caret, caret);
      }
      input._inputLanguage = this._cellInputLanguage;
      this.clearKoreanKeyBuffer(input);
      this.rememberCellKeyValue(input);
      delete input._nativeCellComposition;
      delete input._forcedCorrectionProjection;
      this.refreshNativeLanguagePreview(input);
      input.dataset.composing = "false";
      input.dataset.nativeComposing = "false";
      input.onInputLanguageToggle?.();
    }
    return true;
  }

  handleCellLanguageToggle(event) {
    if (this.usesNativeCellInput()) return false;
    // Release a handled key even if focus moved away from its original cell.
    if (event.type === "keyup" && this._cellLanguageToggleDown &&
        (this.isHangulToggleKeyEvent(event) || (event.code && event.code === this._cellLanguageToggleDown.code) ||
          (event.key && event.key === this._cellLanguageToggleDown.key))) {
      return this.toggleCellInputLanguage(event);
    }
    if (event.defaultPrevented || !this.activeCell || !this.isKoreanPreferredColumn(this.activeCell.colKey) ||
        !this.isHangulToggleKeyEvent(event)) return false;
    const target = event.target;
    const inSheet = !target || target === this.elSheetContainer || target.closest?.("#sheetContainer");
    if (!inSheet) return false;
    const input = target?.matches?.(".cell-input-element") ? target : this.elTableBody?.querySelector(
      `[data-row="${this.activeCell.rowIdx}"][data-col="${this.activeCell.colKey}"] input`);
    return this.toggleCellInputLanguage(event, input);
  }

  getCellLetterKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return "";
    // Physical codes survive Windows Process/229 and macOS Korean layouts.
    // Caps Lock changes the input language; Shift alone selects double jamo.
    if (/^Key[A-Z]$/.test(event.code || "")) {
      const letter = event.code.slice(3);
      return event.shiftKey ? letter : letter.toLowerCase();
    }
    return /^[a-zA-Z]$/.test(event.key || "") ? event.key : "";
  }

  getChartNameRedirect(value, previousChart = '') {
    const text = this.assembleHangul(String(value ?? '')).trim();
    if (!/\p{L}/u.test(text)) return null;
    const compound = {};
    if (this.applyCompoundPatientInput(compound, 'chartNo', text)) return compound;
    const leadingNumber = text.match(/^(\d+)\s*/);
    return {
      chartNo: leadingNumber?.[1] || (/^\d+$/.test(String(previousChart)) ? String(previousChart) : ''),
      name: text.replace(/^\d+\s*\/?\s*/, '').trim(),
    };
  }

  activateNativeEditor(input) {
    if (!input.classList.contains("is-armed")) return;
    for (const child of [...input.parentElement.childNodes]) {
      if (child !== input && !child.classList?.contains("visit-time-refresh")) child.remove();
    }
    input.classList.remove("is-armed");
    input.refreshEditorColors?.();
    const colKey = input.closest(".excel-cell")?.dataset.col;
    if (!input.lang && this.isKoreanPreferredColumn(colKey)) this.initMemoInput(input);
  }

  startInlineEdit(rowIdx, colKey, cellElement, armed = false, historyEdit = null) {
    // Background selection restoration must not take focus from an open editor dialog.
    if (armed && (this.elSearchPromptModal?.style.display === 'flex' ||
        (typeof document !== 'undefined' && document.activeElement?.closest?.('#forcedCorrectionModal')))) return;
    if (!armed && !historyEdit) void this.loadSearchHistory();
    if (colKey === "gender") {
      const dropBtn = cellElement.querySelector(".gender-dropdown-btn");
      this.openGenderDropdown(rowIdx, cellElement, dropBtn);
      return;
    }

    const existingEditor = cellElement.querySelector("input");
    if (existingEditor) {
      if (!armed) {
        // Enter/double-click activates this selection; it must not undo a
        // language toggle already made while its border was selected.
        existingEditor._inputLanguage = this.getCellInputLanguage(colKey);
        existingEditor._engKorBuffer = "";
        existingEditor._engKorPrefix = "";
        existingEditor._engKorSuffix = "";
        delete existingEditor._cellKeyValue;
      } else {
        existingEditor._inputLanguage = this.getCellInputLanguage(colKey);
      }
      if (!armed && existingEditor.dataset.nativeComposing !== "true") {
        delete existingEditor.dataset.navigationInputGuard;
        this.activateNativeEditor(existingEditor);
        existingEditor.focus({ preventScroll: true });
        existingEditor.setSelectionRange(existingEditor.value.length, existingEditor.value.length);
      }
      return;
    }
    if (cellElement.querySelector("select")) return;

    const rows = historyEdit ? { [rowIdx]: historyEdit.row } : this.getCurrentRows();
    const save = () => historyEdit ? historyEdit.save(true) : this.saveDataStore();
    const debounceSave = () => historyEdit ? historyEdit.save(false) : this.debounceSaveDataStore();
    const adjacent = direction => historyEdit ? historyEdit.navigate(0, direction)
      : direction < 0 ? this.selectAutocompleteLeftCell(rowIdx, colKey) : this.selectAutocompleteRightCell(rowIdx, colKey);
    const navigateColumn = direction => historyEdit ? historyEdit.navigate(0, direction) : this.navigateCol(rowIdx, colKey, direction);
    const initialVal = rows[rowIdx] ? (rows[rowIdx][colKey] || "") : "";

    // An armed input stays transparent over the selected cell until native typing starts.
    if (!armed) cellElement.textContent = "";
    const input = document.createElement("input");
    input.historyEdit = historyEdit;
    input.type = "text";
    input.className = "cell-input-element" + (armed ? " is-armed" : "");
    input.value = initialVal;
    // Retain already-saved literal spaces when a corrected cell is reopened.
    input._preserveBoundaryWhitespace = /^\s|\s$/.test(String(initialVal));
    // Names compose Korean letters; other columns follow the native OS input.
    // Software input elsewhere retains the language chosen in this selection.
    input._koreanNameOnly = colKey === "name" && this.usesNativeCellInput();
    input._inputLanguage = this.getCellInputLanguage(colKey);
    this._cellInputLanguage = input._inputLanguage;
    if (this.guardNextCellInput) {
      input.dataset.navigationInputGuard = "true";
      this.guardNextCellInput = false;
    }
    if (colKey === "writer") {
      input.autocapitalize = "characters";
      input.spellcheck = false;
    }
    // Set the Korean input hint before focus establishes the native IME context.
    if (this.isKoreanPreferredColumn(colKey)) this.initMemoInput(input);

    cellElement.appendChild(input);
    input.refreshEditorColors = () => this.refreshEditorTextColors(input, cellElement, rows[rowIdx], colKey);
    if (colKey === "visitTime") this.appendVisitTimeRefresh(cellElement, rows[rowIdx]);
    input.focus({ preventScroll: true });
    for (const event of ["click", "keyup", "select", "scroll"]) input.addEventListener(event, e => {
      if (event === "keyup" && this.isKoreanPreferredColumn(colKey)) {
        if (this.isHangulToggleKeyEvent(e)) {
          input._lastHangulToggleAt = Date.now();
          this._lastHangulToggleAt = Date.now();
        }
        if (this.toggleCellInputLanguage(e, input)) return;
      }
      input.refreshEditorColors();
      this.updateInlineAutocompletePreview();
      this.refreshNativeLanguagePreview(input);
    });
    input.refreshEditorColors();
    // 커서를 텍스트 끝에 배치 (전체 선택하지 않음)
    const len = input.value.length;
    input.setSelectionRange(armed ? 0 : len, len);

    // Input events
    // ★ 한글 IME 보호 원칙:
    // 1. input 이벤트에서 절대로 input.value를 변경하지 않음
    // 2. 조합 중에는 입력창 위치와 실제 글자 표시를 유지함
    // 3. 남은 자모 보정은 네이티브 조합 종료 후에만 예약하고 재조합 시 취소함
    let _acDebounceTimer = null;
    let _hangulRepairTimer = null;
    let isCommitted = false;
    let composing = false;
    input.onInputLanguageToggle = () => { composing = false; };
    const queueAutocomplete = (delay) => {
      if (["gender", "writer", "no"].includes(colKey)) return;
      clearTimeout(_acDebounceTimer);
      _acDebounceTimer = setTimeout(() => {
        if (isCommitted || !input.isConnected || document.activeElement !== input) return;
        // English projected from a native IME is the visible query, just like
        // ordinary English typing. Never search with the hidden Korean draft.
        const query = this.getCellEditorValue(input);
        const koreanComposing = input._inputLanguage !== "eng" && !input._forcedCorrectionProjection && input.dataset.composing === "true";
        const suggestions = this.getAutocompleteSuggestions(colKey, query, koreanComposing);
        if (suggestions.length || (["name", "part", "extra", "memo", "specialNote"].includes(colKey) && query.trim())) {
          this.showAutocompleteMenu(rowIdx, colKey, cellElement, input, suggestions);
        } else {
          this.closeAutocompleteMenu();
        }
      }, delay);
    };
    const refreshPendingAutocomplete = () => {
      const state = this.autocompleteState;
      if (!state || state.input !== input || state.query === this.getCellEditorValue(input) ||
          ["gender", "writer", "no"].includes(colKey)) return;
      // Navigation can beat the delayed refresh. Never confirm a candidate
      // left over from an earlier query after fast typing or a language toggle.
      clearTimeout(_acDebounceTimer);
      this.refreshSearchSuggestions();
    };
    const redirectChartName = () => {
      if (isCommitted || colKey !== 'chartNo' || composing || input.dataset.nativeComposing === 'true') return false;
      const redirect = this.getChartNameRedirect(input.value, initialVal);
      if (!redirect) return false;
      const nameCell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="name"]`);
      if (!nameCell) return false;
      isCommitted = true;
      clearTimeout(_hangulRepairTimer);
      clearTimeout(_acDebounceTimer);
      this.closeAutocompleteMenu();
      this.endNativeCellEditing(input);
      Object.assign(rows[rowIdx], redirect);
      if (rows[rowIdx]._richText) {
        delete rows[rowIdx]._richText.chartNo;
        delete rows[rowIdx]._richText.name;
      }
      this.applyCellFormatting(cellElement, rows[rowIdx], colKey);
      this.renderColoredText(cellElement, rows[rowIdx], colKey);
      save();
      this.refreshNewPatientRows();
      // The OS may deliver the source IME's final input after focus has moved.
      // Arm the destination guard before creating/focusing its editor; a new
      // physical typing key releases it so intentional repeated letters work.
      this.guardNextCellInput = true;
      this.selectCell(rowIdx, 'name', nameCell, true);
      const nameInput = nameCell.querySelector('input');
      if (nameInput) {
        const suggestions = this.getAutocompleteSuggestions('name', nameInput.value);
        if (suggestions.length) this.showAutocompleteMenu(rowIdx, 'name', nameCell, nameInput, suggestions);
      }
      return true;
    };
    const repairCompletedInput = () => {
      clearTimeout(_hangulRepairTimer);
      _hangulRepairTimer = setTimeout(() => {
        if (isCommitted || composing || input.dataset.nativeComposing === "true" || !input.isConnected || document.activeElement !== input || colKey === "writer") return;
        if (this.normalizeCompletedHangulInput(input)) input.dispatchEvent(new Event("input", { bubbles: true }));
      }, 0);
    };
    input.addEventListener("compositionstart", (e) => {
      if (this.restoreHandledCellKey(input, e)) return;
      this.beginCellComposition(input);
      input._engKorBuffer = "";
      input._engKorPrefix = "";
      if (isCommitted || this.blockInheritedNavigationInput(input, e, initialVal)) return;
      this.rememberPatientSearchDraft(rowIdx, colKey, input);
      clearTimeout(_hangulRepairTimer);
      input.dataset.nativeComposing = "true";
      this.activateNativeEditor(input);
      composing = true;
      input.dataset.composing = "true";
      clearTimeout(_acDebounceTimer);
      this.closeAutocompleteMenu();
    });

    input.addEventListener("beforeinput", (e) => {
      if (isCommitted) { e.preventDefault(); return; }
      if (this.blockInheritedNavigationInput(input, e, initialVal)) return;
      if (this.restoreHandledCellKey(input, e)) return;
      if (e.inputType && e.inputType !== "insertText" && !/Composition/.test(e.inputType)) {
        delete input._cellKeyValue;
        this.clearKoreanKeyBuffer(input);
      }
      this.rememberPatientSearchDraft(rowIdx, colKey, input);
      if (e.isComposing || e.inputType === "insertCompositionText") {
        this.beginCellComposition(input);
        composing = true; input.dataset.composing = "true"; input.dataset.nativeComposing = "true";
        clearTimeout(_hangulRepairTimer);
      }
      // Native insertion starts editing before input/composition events arrive.
      if (!["deleteContentBackward", "deleteContentForward"].includes(e.inputType)) this.activateNativeEditor(input);
      if (colKey === "writer" && input.dataset.writerKeyValue !== undefined &&
          (e.isComposing || /Composition/.test(e.inputType || "") || e.inputType === "insertText")) {
        e.preventDefault();
      }
    });
    input.addEventListener("input", (e) => {
      if (input.dataset) delete input.dataset.presetPickerMode;
      if (this.autocompleteState) this.autocompleteState.isPresetPicker = false;
      if (isCommitted || this.blockInheritedNavigationInput(input, e, initialVal)) return; // Reject input inherited from the previous cell.
      const handledKey = this.restoreHandledCellKey(input, e);
      if (handledKey) composing = false;
      else if (e.isComposing || /Composition/.test(e.inputType || "")) this.projectCellComposition(input, e);
      this.rememberPatientSearchDraft(rowIdx, colKey, input);
      if (e.isComposing && !handledKey) { composing = true; input.dataset.nativeComposing = "true"; input.dataset.composing = "true"; }
      this.activateNativeEditor(input);
      this.clearInlineAutocompletePreview();
      if (!handledKey) this.updateForcedCorrection(input, colKey, {deleting: e.inputType?.startsWith('delete')});
      const val = this.getCellEditorValue(input);
      this.updateEditorTextColors(rows[rowIdx], colKey, val);

      // writer 열은 영문 대문자 변환만 (한글 입력과 무관)
      if (colKey === "writer") {
        const normalized = this.normalizeWriterEditorInput(input, e);
        if (normalized !== input.value) input.value = normalized;
        rows[rowIdx][colKey] = normalized;
      } else {
        rows[rowIdx][colKey] = val;
      }
      this.elFormulaInput.value = colKey === "writer" ? input.value : val;
      input.refreshEditorColors();
      this.refreshNativeLanguagePreview(input);
      debounceSave();
      if (!composing && input.dataset.nativeComposing !== "true") repairCompletedInput();
      // Refresh from the visible query while preserving the native IME input.
      queueAutocomplete(composing || input.dataset.nativeComposing === "true" ? 40 : 25);
    });

    input.addEventListener("compositionend", (e) => {
      if (isCommitted || this.blockInheritedNavigationInput(input, e, initialVal)) return;
      const handledKey = this.restoreHandledCellKey(input, e);
      if (!handledKey) this.projectCellComposition(input, e, true);
      if (!handledKey) this.updateForcedCorrection(input, colKey, {commit: true, nativeData: e.data});
      delete input._nativeCellComposition;
      delete input._forcedCorrectionProjection;
      composing = false;
      input.dataset.composing = "false";
      input.dataset.nativeComposing = "false";
      this.refreshNativeLanguagePreview(input);
      if (colKey !== "writer") this.normalizeCompletedHangulInput(input);
      repairCompletedInput();
      if (this._justCommittedFromAutocomplete) return;
      const val = input.value;
      if (colKey === "writer") {
        const normalized = this.normalizeWriterEditorInput(input, e);
        if (normalized !== input.value) input.value = normalized;
        rows[rowIdx][colKey] = normalized;
      } else {
        rows[rowIdx][colKey] = val;
      }
      this.elFormulaInput.value = input.value;
      debounceSave();

      // A final IME event must use the same query and preserve menu selection.
      queueAutocomplete(0);
    });

    const commitAndBlur = (forcedVal) => {
      if (isCommitted) return;
      isCommitted = true;
      // A corrected editor may still receive its original IME commit after
      // Enter/Tab moves focus. Arm the destination before blurring this input,
      // including when compositionend has already cleared the live projection.
      if (input._forcedCorrectionApplied || input.dataset.nativeComposing === 'true') this.guardNextCellInput = true;
      clearTimeout(_hangulRepairTimer);
      clearTimeout(_acDebounceTimer);
      const liveValue = this.getCellEditorValue(input);
      // Candidates omit boundary spaces for matching. Confirming the same
      // visible wording must retain the literal spaces from the correction.
      const keepLiteral = input._preserveBoundaryWhitespace && forcedVal !== undefined && String(forcedVal).trim() === liveValue.trim();
      let finalVal = forcedVal !== undefined && !keepLiteral ? String(forcedVal) : this.assembleCellEditorText(input, liveValue);
      input.nativeLanguagePreview?.remove();
      finalVal = this.normalizeCellEditorValue(input, finalVal, colKey);
      this.endNativeCellEditing(input);
      this.updateEditorTextColors(rows[rowIdx], colKey, finalVal);
      rows[rowIdx][colKey] = finalVal;
      if (forcedVal !== undefined) this.applyAutocompleteColor(rows[rowIdx], colKey, forcedVal?._presetFormatting ? forcedVal : finalVal, input.dataset.autocompleteQuery);
      const compound = this.applyCompoundPatientInput(rows[rowIdx], colKey, finalVal);
      if (compound) {
        for (const key of ["chartNo", "name"]) {
          const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${key}"]`);
          if (cell && cell !== cellElement) this.renderColoredText(cell, rows[rowIdx], key);
        }
      }
      // ★ 셀에 이미 새 input이 있으면(더블클릭으로 재편집 진입 등) 셀 내용 덮어쓰기 방지
      const existingInput = cellElement.querySelector("input");
      if (!existingInput || existingInput === input) {
        this.applyCellFormatting(cellElement, rows[rowIdx], colKey);
        this.renderColoredText(cellElement, rows[rowIdx], colKey);
      }
      if (colKey === "gender") {
        cellElement.classList.remove("f", "m");
        if (finalVal === "F") cellElement.classList.add("f");
        if (finalVal === "M") cellElement.classList.add("m");
      }
      save();
      if (["name", "chartNo"].includes(colKey)) this.refreshNewPatientRows();
      setTimeout(() => {
        this._justCommittedFromAutocomplete = false;
      }, 60);
    };

    // Search shortcuts can confirm the highlighted candidate through the same
    // commit path as Enter, before native IME blur commits the partial draft.
    input.commitAutocompleteValue = value => {
      if (isCommitted) return false;
      commitAndBlur(value);
      return true;
    };

    input.addEventListener("blur", () => {
      if (document.hasFocus?.() === false) this.rememberCellWindowInput(input);
      input._engKorBuffer = "";
      input._engKorPrefix = "";
      input._engKorSuffix = "";
      clearTimeout(_hangulRepairTimer);
      clearTimeout(_acDebounceTimer);
      if (input.classList.contains("is-armed")) { input.remove(); return; }
      this.closeAutocompleteMenu();
      commitAndBlur();
    });

    input.addEventListener("contextmenu", event => {
      // 자동완성 팝업이 열려있다면 닫아주어 우클릭 차단 방지
      this.closeAutocompleteMenu();
      event.preventDefault();
      event.stopPropagation();
      // 현재 에디터 최신 텍스트를 모델 데이터에 반영
      const liveVal = this.getCellEditorValue(input);
      if (rows[rowIdx]) rows[rowIdx][colKey] = liveVal;
      // 컨텍스트 메뉴 명시적 호출
      this.handleTableContextMenu(event);
    });

    input.addEventListener("keydown", (e) => {
      if (isCommitted) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (this.handleForcedCorrectionDelete(e, input)) { composing = false; return; }

      const nativeCellInput = this.isKoreanPreferredColumn(colKey) && this.usesNativeCellInput() && !input._koreanNameOnly;
      if (nativeCellInput) {
        // OS input-source changes may produce no keyboard event at all. Trust
        // beforeinput/composition instead of a separate application language.
        this.clearKoreanKeyBuffer(input);
        if (this.isHangulToggleKeyEvent(e)) {
          input._lastHangulToggleAt = Date.now();
          this._lastHangulToggleAt = Date.now();
          return;
        }
        this.releaseNavigationInputGuard(input, e);
        const nativeKey = e.isComposing || e.keyCode === 229;
        if (!["Shift", "Control", "Alt", "Meta"].includes(e.key) &&
            !(nativeKey && input._cellKeyValue?.nativeData != null)) delete input._cellKeyValue;
      }
      if (this.isKoreanPreferredColumn(colKey) && !nativeCellInput) {
        if (this.toggleCellInputLanguage(e, input)) {
          composing = false;
          return;
        }
        this.releaseNavigationInputGuard(input, e);
        const letter = this.getCellLetterKey(e);
        const prefix = input._engKorPrefix || "";
        const suffix = input._engKorSuffix || "";
        const converted = this.convertEngToHangul(input._engKorBuffer || "");
        // Moving the caret, selecting, pasting or deleting invalidates the old
        // composition range. A later Backspace must never resurrect its text.
        if (input._engKorBuffer && (input.value !== prefix + converted + suffix ||
            input.selectionStart !== prefix.length + converted.length ||
            input.selectionEnd !== input.selectionStart)) this.clearKoreanKeyBuffer(input);
        const plainKey = !e.ctrlKey && !e.metaKey && !e.altKey;
        if (plainKey && (e.key === "Backspace" || e.code === "Backspace") && input._engKorBuffer) {
          e.preventDefault(); e.stopPropagation?.();
          input._engKorBuffer = input._engKorBuffer.slice(0, -1);
          const value = this.convertEngToHangul(input._engKorBuffer);
          input.value = input._engKorPrefix + value + input._engKorSuffix;
          const caret = input._engKorPrefix.length + value.length;
          input.setSelectionRange(caret, caret);
          if (!input._engKorBuffer) this.clearKoreanKeyBuffer(input);
          this.rememberCellKeyValue(input);
          input.dispatchEvent(typeof Event === "function" ? new Event("input", { bubbles: true }) : { type: "input", bubbles: true });
          return;
        }
        if (plainKey && e.key === "Escape" && input._engKorBuffer && !input._koreanNameOnly) {
          e.preventDefault(); e.stopPropagation?.();
          const caret = input._engKorPrefix.length + input._engKorBuffer.length;
          input.value = input._engKorPrefix + input._engKorBuffer + input._engKorSuffix;
          input.setSelectionRange(caret, caret);
          this.clearKoreanKeyBuffer(input);
          input._inputLanguage = this._cellInputLanguage = "eng";
          this.rememberCellKeyValue(input);
          input.dispatchEvent(typeof Event === "function" ? new Event("input", { bubbles: true }) : { type: "input", bubbles: true });
          return;
        }
        const nativeKey = e.isComposing || e.keyCode === 229 || input.dataset.nativeComposing === "true" ||
          (letter && !/^[a-zA-Z]$/.test(e.key || ""));
        if (letter && !nativeKey && e.cancelable !== false) {
          // Convert ordinary Latin keys only. Process/229 belongs to the native
          // IME and must never also insert a character from this keydown.
          e.preventDefault(); e.stopPropagation?.();
          this.activateNativeEditor(input);
          if (input._inputLanguage === "eng" && !input._koreanNameOnly) {
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? start;
            input.value = input.value.slice(0, start) + letter + input.value.slice(end);
            input.setSelectionRange(start + 1, start + 1);
            this.clearKoreanKeyBuffer(input);
          } else {
            if (!input._engKorBuffer) {
              input._engKorPrefix = input.value.slice(0, input.selectionStart ?? input.value.length);
              input._engKorSuffix = input.value.slice(input.selectionEnd ?? input.value.length);
            }
            input._engKorBuffer = (input._engKorBuffer || "") + letter;
            const value = this.convertEngToHangul(input._engKorBuffer);
            input.value = input._engKorPrefix + value + input._engKorSuffix;
            const caret = input._engKorPrefix.length + value.length;
            input.setSelectionRange(caret, caret);
          }
          composing = false;
          input.dataset.composing = "false";
          input.dataset.nativeComposing = "false";
          this.rememberCellKeyValue(input);
          input.dispatchEvent(typeof Event === "function" ? new Event("input", { bubbles: true }) : { type: "input", bubbles: true });
          return;
        }
        if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
          this.clearKoreanKeyBuffer(input);
          if (!(nativeKey && input._cellKeyValue?.nativeData != null)) delete input._cellKeyValue;
        }
      }
      // Wait for explicit Enter; typing/composition must stay in the chart editor.
      // Handle physical Enter before the generic IME guard so one press can
      // confirm the composed name and move to its proper cell.
      if (colKey === 'chartNo' && !input.classList.contains('is-armed') &&
          !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey &&
          (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13) &&
          this.getChartNameRedirect(input.value, initialVal)) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        composing = false;
        input.dataset.composing = 'false';
        input.dataset.nativeComposing = 'false';
        if (redirectChartName()) return;
      }
      if (["chartNo", "name", "part", "memo", "specialNote"].includes(colKey) && !input.classList.contains("is-armed") &&
          !this.isAutocompleteOpen() && (e.key === "ArrowLeft" || e.code === "ArrowLeft") &&
          (input.selectionStart !== 0 || input.selectionEnd !== 0)) {
        e.stopPropagation(); // Keep native caret movement until the collapsed caret reaches the start.
        return;
      }
      if (this.consumePresetLeftRepeat(e)) return;
      if (["Enter", "NumpadEnter", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code || e.key) ||
          this.isSearchShortcut(e)) refreshPendingAutocomplete();
      this.releaseNavigationInputGuard(input, e);
      if (input.classList.contains("is-armed")) {
        if (historyEdit && ["Backspace", "Delete"].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault(); e.stopPropagation();
          this.activateNativeEditor(input);
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        if (historyEdit && (e.key === "Enter" || e.key === "F2") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          e.preventDefault(); e.stopPropagation();
          this.activateNativeEditor(input);
          input.setSelectionRange(input.value.length, input.value.length);
          return;
        }
        if (this.handleSelectedTextCellEnter(e)) return;
        if (this.handleEmptyCellEnter(e, input)) return;
        if (colKey === "prescription" && this.handlePrescriptionPickerShortcut(e, rowIdx, cellElement)) return;
        if (colKey === "extra" && this.handlePresetPickerShortcut(e, rowIdx, colKey, cellElement)) return;
        if (colKey === "writer" && this.handleWriterPickerShortcut(e, rowIdx, cellElement)) return;
      }
      if (colKey === "memo" && input.value === "" && !this.isAutocompleteOpen() && this.handleEmptyCellEnter(e, input)) return;
      // Every editable column commits and moves left through this single path.
      if (this.isPresetLeftExit(e, colKey) || this.isManualCellLeftExit(e, input)) {
        e.preventDefault(); e.stopPropagation();
        e.stopImmediatePropagation();
        this.presetLeftKeyHeld = true;
        composing = false; input.dataset.composing = "false";
        input.dataset.nativeComposing = "false";
        const chosen = this.isAutocompleteOpen() ? this.getSelectedAutocompleteItem() : undefined;
        this._justCommittedFromAutocomplete = true;
        this.closeAutocompleteMenu();
        commitAndBlur(chosen);
        // Select the adjacent cell without arming another editor for this key.
        adjacent(-1);
        this.focusSelectedCellEditor();
        return;
      }
      // Physical initial entry can leave the OS IME reporting Process/229.
      // Writer Enter confirms the normalized initial before the generic IME guard.
      if (colKey === "writer" && this.isWriterEnterExit(e, input)) {
        e.preventDefault(); e.stopPropagation();
        composing = false;
        input.dataset.composing = "false";
        input.dataset.nativeComposing = "false";
        const chosen = this.isAutocompleteOpen() ? this.getSelectedAutocompleteItem() : undefined;
        this.closeAutocompleteMenu();
        commitAndBlur(chosen);
        adjacent(1);
        this.focusSelectedCellEditor();
        return;
      }
      // Writer keys may still be reported as composing after physical-key entry.
      if (colKey === "writer" && this.isWriterRightExit(e, input)) {
        e.preventDefault(); e.stopPropagation();
        composing = false; input.dataset.composing = "false";
        const chosen = this.isAutocompleteOpen() ? this.getSelectedAutocompleteItem() : undefined;
        this.closeAutocompleteMenu();
        commitAndBlur(chosen);
        navigateColumn(1);
        this.focusSelectedCellEditor();
        return;
      }
      if (colKey === "writer" && !input.classList.contains("is-armed") && e.key === "ArrowRight" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.stopPropagation(); // Keep native caret movement while it is inside the text.
        return;
      }
      // Use the physical letter key before the IME can display Korean text.
      if (colKey === "writer" && this.handleWriterLetterKey(e, input)) {
        composing = false;
        return;
      }
      if (colKey === "writer" && !e.isComposing && e.keyCode !== 229) delete input.dataset.writerKeyValue;
      // Search must run on the first press, even before IME composition ends.
      if (this.isSearchShortcut(e)) { this.handleGlobalKeyDown(e); return; }
      if (this.handleForcedCorrectionShortcut(e)) return;
      if (this.handleCellRowSelectShortcut(e)) return;
      const escapePressed = e.key === "Escape" || e.code === "Escape" || e.keyCode === 27;
      const directCommit = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey &&
        (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter" || e.key === "ArrowRight");
      if (!input.classList.contains("is-armed") && (directCommit || escapePressed)) {
        e.preventDefault(); e.stopPropagation();
        composing = false; input.dataset.composing = "false";
        this._justCommittedFromAutocomplete = true;
        this.closeAutocompleteMenu();
        // Escape confirms the typed value and moves right, like direct commit.
        commitAndBlur();
        this.guardNextCellInput = true;
        adjacent(1);
        this.focusSelectedCellEditor();
        return;
      }
      // English projection uses the app's candidates even while the OS reports
      // composition. Other composing keys continue through the native IME.
      if (input._forcedCorrectionProjection && !this.isAutocompleteOpen() &&
          !e.ctrlKey && !e.metaKey && !e.altKey && ['Enter', 'NumpadEnter'].includes(e.code || e.key)) {
        e.preventDefault(); e.stopPropagation();
        commitAndBlur();
        adjacent(1);
        this.focusSelectedCellEditor();
        return;
      }
      const englishCandidateKey = (input._inputLanguage === "eng" || input._forcedCorrectionProjection) && this.isAutocompleteOpen() &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        ["Enter", "NumpadEnter", "Tab", "ArrowUp", "ArrowDown"].includes(e.code || e.key);
      if ((composing || e.isComposing || e.keyCode === 229) && !englishCandidateKey) {
        e.stopPropagation();
        return;
      }
      if (historyEdit && (e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) {
        // Native undo stays inside the history editor; never undo today's table.
        e.stopPropagation(); return;
      }
      if (historyEdit && e.key === "F2") { e.stopPropagation(); return; }
      if (this.handleHistoryShortcut(e)) return;
      if (this.handleRowDeleteShortcut(e)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowDown") {
        e.preventDefault(); e.stopPropagation(); input.blur(); this.jumpToLastRecord(); return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === "ArrowUp") {
        e.preventDefault(); e.stopPropagation(); input.blur(); this.jumpToFirstRecord(); return;
      }
      if (input.classList.contains("is-armed")) {
        if (e.key === "F2") {
          e.preventDefault(); e.stopPropagation();
          this.activateNativeEditor(input);
          input.setSelectionRange(input.value.length, input.value.length);
          return;
        }
        const shortcut = e.ctrlKey || e.metaKey || ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Backspace", "Enter", "Tab", "Escape"].includes(e.key);
        const writerKey = colKey === "writer" && /^Key[A-Z]$/.test(e.code) && !e.altKey;
        if (shortcut || writerKey) {
          e.preventDefault(); e.stopPropagation();
          if (writerKey && !e.ctrlKey && !e.metaKey) {
            input.value = e.code.slice(3);
            input.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            this.elSheetContainer.dispatchEvent(new KeyboardEvent("keydown", {
              key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
              shiftKey: e.shiftKey, altKey: e.altKey, bubbles: true, cancelable: true
            }));
          }
          return;
        }
      }
      if (e.shiftKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.stopPropagation(); // While editing, Shift+arrows select native input text.
        return;
      }
      // 1) 자동완성 목록이 열려 있을 때: Enter/Tab 시 최상단(또는 선택된) 항목 즉시 입력
      if (this.isAutocompleteOpen()) {
        if (e.key === "ArrowDown" || e.code === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          this.moveAutocompleteSelection(1);
          return;
        }
        if (e.key === "ArrowUp" || e.code === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          this.moveAutocompleteSelection(-1);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.closeAutocompleteMenu();
          return;
        }
        if (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter" || e.keyCode === 13) {
          e.preventDefault();
          e.stopPropagation();
          const chosenVal = this.getSelectedAutocompleteItem();
          this._justCommittedFromAutocomplete = true;
          this.closeAutocompleteMenu();
          commitAndBlur(chosenVal);
          adjacent(1);
          if (this.elSheetContainer) {
            this.focusSelectedCellEditor();
          }
          return;
        }
        if (e.key === "Tab" || e.code === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          const chosenVal = this.getSelectedAutocompleteItem();
          this._justCommittedFromAutocomplete = true;
          this.closeAutocompleteMenu();
          commitAndBlur(chosenVal);
          if (e.shiftKey) {
            navigateColumn(-1);
          } else {
            navigateColumn(1);
          }
          return;
        }
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const atEdge = input.selectionStart === input.selectionEnd &&
          (e.key === "ArrowLeft" ? input.selectionStart === 0 : input.selectionEnd === input.value.length);
        if (!atEdge || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) { e.stopPropagation(); return; }
      }
      // 2) 방향키 처리: 편집 커밋 후 해당 방향으로 셀 이동
      //    자동완성이 열려있을 때는 위/아래는 이미 위에서 처리됨 (목록 이동)
      //    자동완성이 열려있을 때 좌/우 방향키 또는 자동완성이 닫혀있을 때 모든 방향키
      //    조합 중에는 위의 가드에서 IME에 키 처리를 맡긴다
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "ArrowLeft") { this.presetLeftKeyHeld = true; this.guardNextCellInput = true; }

        // 자동완성이 열려있으면 선택된 항목을 적용
        if (this.isAutocompleteOpen() && e.key !== "ArrowLeft") {
          const chosenVal = this.getSelectedAutocompleteItem();
          this._justCommittedFromAutocomplete = true;
          this.closeAutocompleteMenu();
          commitAndBlur(chosenVal);
        } else {
          commitAndBlur();
        }

        if (historyEdit) {
          historyEdit.navigate(e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0,
            e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0);
          return;
        }
        // 방향에 따라 셀 이동
        const colOrder = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
        const colIdx = colOrder.indexOf(colKey);
        let targetRow = rowIdx;
        let targetColIdx = colIdx;

        if (e.key === "ArrowUp") targetRow = Math.max(0, rowIdx - 1);
        if (e.key === "ArrowDown") targetRow = rowIdx + 1;
        if (e.key === "ArrowLeft") targetColIdx = Math.max(0, colIdx - 1);
        if (e.key === "ArrowRight") targetColIdx = Math.min(colOrder.length - 1, colIdx + 1);

        const targetColKey = colOrder[targetColIdx];
        // ArrowDown이 마지막 행을 넘어갈 경우 행 추가
        const rows = this.getCurrentRows();
        if (targetRow >= rows.length) {
          this.addNewRow(false);
        }
        const targetCell = document.querySelector(`.excel-cell[data-row="${targetRow}"][data-col="${targetColKey}"]`);
        if (targetCell) {
          this.selectCell(targetRow, targetColKey, targetCell, false);
        }
        return;
      }

      // 3) 일반 키 입력 처리
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") {
        e.preventDefault();
        commitAndBlur();
        e.stopPropagation();
        adjacent(1);
        this.focusSelectedCellEditor();
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitAndBlur();
        if (e.shiftKey) {
          navigateColumn(-1);
        } else {
          navigateColumn(1);
        }
      }
    });
  }

}
