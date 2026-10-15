// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTCellEditor {
  isKoreanPreferredColumn(colKey) {
    return !["writer", "gender"].includes(colKey);
  }

  isHangulToggleKeyEvent(e) {
    if (!e) return false;
    // Windows Korean/English key (the Hanja/Lang2 key is a separate action).
    if (e.key === "HangulMode" || e.key === "ModeChange" || e.key === "KanaMode") return true;
    if (e.code === "Lang1" || e.code === "KeyLang1") return true;
    if (e.keyCode === 21) return true;
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
    if (!range || input._inputLanguage !== "eng" || typeof event.data !== "string") return input.value;
    // Composition data replaces the whole current composition, not the text
    // from the preceding input event. Project it once from the original range.
    const text = this.convertHangulToEng(event.data);
    range.data = event.data;
    const value = range.prefix + text + range.suffix;
    if (commit) {
      input.value = value;
      input.setSelectionRange(range.prefix.length + text.length, range.prefix.length + text.length);
      this.rememberCellKeyValue(input, event.data);
    }
    return value;
  }

  getCellEditorValue(input) {
    const range = input._nativeCellComposition;
    return range && input._inputLanguage === "eng" && typeof range.data === "string"
      ? range.prefix + this.convertHangulToEng(range.data) + range.suffix : input.value;
  }

  refreshNativeLanguagePreview(input) {
    input.nativeLanguagePreview?.remove();
    input.nativeLanguagePreview = null;
    const range = input._nativeCellComposition;
    const show = input._inputLanguage === "eng" && input.dataset.nativeComposing === "true" && typeof range?.data === "string";
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
    preview.style.left = `${this.getEditorTextLeft(input, font)}px`;
    const before = range.prefix + this.convertHangulToEng(range.data);
    preview.append(document.createTextNode(before));
    const caret = document.createElement("span");
    caret.className = "native-language-caret";
    preview.append(caret);
    const state = this.autocompleteState;
    const value = this.getCellEditorValue(input);
    if (state?.input === input && state.query === value && !range.suffix &&
        input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
      const suffix = this.getInlineCompletionSuffix(value, this.getSelectedAutocompleteItem());
      if (suffix) {
        const completion = document.createElement("span");
        completion.className = "inline-completion-suffix";
        completion.textContent = suffix;
        preview.append(completion);
      }
    }
    preview.append(document.createTextNode(range.suffix));
    input.parentElement.append(preview);
    input.nativeLanguagePreview = preview;
  }

  restoreHandledCellKey(input, event) {
    const saved = input._cellKeyValue;
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
    if (!this.isHangulToggleKeyEvent(event)) return false;
    // Consume here, including modifier shortcuts, before the event can bubble
    // to the sheet and toggle a second time. Holding a key is still one switch.
    event.preventDefault();
    event.stopPropagation?.();
    if (event.repeat) return true;
    const language = input?._inputLanguage || this._cellInputLanguage || "kor";
    this._cellInputLanguage = language === "eng" ? "kor" : "eng";
    if (input) {
      const range = input._nativeCellComposition;
      const value = this.getCellEditorValue(input);
      if (input.value !== value) {
        input.value = value;
        const caret = range.prefix.length + this.convertHangulToEng(range.data).length;
        input.setSelectionRange(caret, caret);
      }
      input._inputLanguage = this._cellInputLanguage;
      this.clearKoreanKeyBuffer(input);
      this.rememberCellKeyValue(input);
      delete input._nativeCellComposition;
      this.refreshNativeLanguagePreview(input);
      input.dataset.composing = "false";
      input.dataset.nativeComposing = "false";
      input.onInputLanguageToggle?.();
    }
    return true;
  }

  handleCellLanguageToggle(event) {
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
    if (this.isKoreanPreferredColumn(colKey)) this.initMemoInput(input);
  }

  startInlineEdit(rowIdx, colKey, cellElement, armed = false) {
    // Background selection restoration must not take focus from patient search.
    if (armed && this.elSearchPromptModal?.style.display === 'flex') return;
    if (!armed) void this.loadSearchHistory();
    if (colKey === "gender") {
      const dropBtn = cellElement.querySelector(".gender-dropdown-btn");
      this.openGenderDropdown(rowIdx, cellElement, dropBtn);
      return;
    }

    const existingEditor = cellElement.querySelector("input");
    if (existingEditor) {
      if (!armed) {
        existingEditor._inputLanguage = "kor";
        this._cellInputLanguage = "kor";
        existingEditor._engKorBuffer = "";
        existingEditor._engKorPrefix = "";
        existingEditor._engKorSuffix = "";
        delete existingEditor._cellKeyValue;
      } else {
        existingEditor._inputLanguage = this._cellInputLanguage || "kor";
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

    const rows = this.getCurrentRows();
    const initialVal = rows[rowIdx] ? (rows[rowIdx][colKey] || "") : "";

    // An armed input stays transparent over the selected cell until native typing starts.
    if (!armed) cellElement.textContent = "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "cell-input-element" + (armed ? " is-armed" : "");
    input.value = initialVal;
    input._inputLanguage = armed ? (this._cellInputLanguage || "kor") : "kor";
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
    for (const event of ["click", "keyup", "select", "scroll"]) input.addEventListener(event, () => {
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
        const koreanComposing = input._inputLanguage !== "eng" && input.dataset.composing === "true";
        const suggestions = this.getAutocompleteSuggestions(colKey, query, koreanComposing);
        if (suggestions.length || (["name", "part", "extra", "memo", "specialNote"].includes(colKey) && query.trim())) {
          this.showAutocompleteMenu(rowIdx, colKey, cellElement, input, suggestions);
        } else {
          this.closeAutocompleteMenu();
        }
      }, delay);
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
      this.saveDataStore();
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
      if (isCommitted || this.blockInheritedNavigationInput(input, e, initialVal)) return; // Reject input inherited from the previous cell.
      const handledKey = this.restoreHandledCellKey(input, e);
      if (handledKey) composing = false;
      else if (e.isComposing || /Composition/.test(e.inputType || "")) this.projectCellComposition(input, e);
      this.rememberPatientSearchDraft(rowIdx, colKey, input);
      if (e.isComposing && !handledKey) { composing = true; input.dataset.nativeComposing = "true"; input.dataset.composing = "true"; }
      this.activateNativeEditor(input);
      this.clearInlineAutocompletePreview();
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
      this.debounceSaveDataStore();
      if (!composing && input.dataset.nativeComposing !== "true") repairCompletedInput();
      // Refresh from the visible query while preserving the native IME input.
      queueAutocomplete(composing || input.dataset.nativeComposing === "true" ? 40 : 25);
    });

    input.addEventListener("compositionend", (e) => {
      if (isCommitted || this.blockInheritedNavigationInput(input, e, initialVal)) return;
      const handledKey = this.restoreHandledCellKey(input, e);
      if (!handledKey) this.projectCellComposition(input, e, true);
      delete input._nativeCellComposition;
      composing = false;
      input.dataset.composing = "false";
      input.dataset.nativeComposing = "false";
      this.refreshNativeLanguagePreview(input);
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
      this.debounceSaveDataStore();

      // A final IME event must use the same query and preserve menu selection.
      queueAutocomplete(0);
    });

    const commitAndBlur = (forcedVal) => {
      if (isCommitted) return;
      isCommitted = true;
      clearTimeout(_hangulRepairTimer);
      clearTimeout(_acDebounceTimer);
      let finalVal = forcedVal !== undefined ? forcedVal : this.assembleHangul(this.getCellEditorValue(input));
      input.nativeLanguagePreview?.remove();
      finalVal = colKey === "writer" ? this.normalizeWriterInput(finalVal)
        : colKey === "prescription" ? this.normalizePrescriptionInput(finalVal) : finalVal.trim();
      this.endNativeCellEditing(input);
      this.updateEditorTextColors(rows[rowIdx], colKey, finalVal);
      rows[rowIdx][colKey] = finalVal;
      if (forcedVal !== undefined) this.applyAutocompleteColor(rows[rowIdx], colKey, finalVal, input.dataset.autocompleteQuery);
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
      this.saveDataStore();
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
      if (!this.isAutocompleteOpen()) return;
      event.preventDefault(); event.stopPropagation();
      const chosen = this.getSelectedAutocompleteItem();
      this._justCommittedFromAutocomplete = true;
      composing = false; input.dataset.composing = "false";
      this.closeAutocompleteMenu();
      commitAndBlur(chosen);
      this.selectCell(rowIdx, colKey, cellElement, false);
      this.focusSelectedCellEditor();
    });

    input.addEventListener("keydown", (e) => {
      if (isCommitted) { e.preventDefault(); e.stopImmediatePropagation(); return; }

      if (this.isKoreanPreferredColumn(colKey)) {
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
        if (plainKey && e.key === "Escape" && input._engKorBuffer) {
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
          if (input._inputLanguage === "eng") {
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
          delete input._cellKeyValue;
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
      this.releaseNavigationInputGuard(input, e);
      if (input.classList.contains("is-armed")) {
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
        this.selectAutocompleteLeftCell(rowIdx, colKey);
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
        this.selectAutocompleteRightCell(rowIdx, colKey);
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
        this.navigateCol(rowIdx, colKey, 1);
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
        this.selectAutocompleteRightCell(rowIdx, colKey);
        this.focusSelectedCellEditor();
        return;
      }
      // English projection uses the app's candidates even while the OS reports
      // composition. Other composing keys continue through the native IME.
      const englishCandidateKey = input._inputLanguage === "eng" && this.isAutocompleteOpen() &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        ["Enter", "NumpadEnter", "Tab", "ArrowUp", "ArrowDown"].includes(e.code || e.key);
      if ((composing || e.isComposing || e.keyCode === 229) && !englishCandidateKey) {
        e.stopPropagation();
        return;
      }
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
          if (chosenVal) {
            input.value = chosenVal;
          }
          commitAndBlur(chosenVal);
          this.selectAutocompleteRightCell(rowIdx, colKey);
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
          if (chosenVal) {
            input.value = chosenVal;
          }
          commitAndBlur(chosenVal);
          if (e.shiftKey) {
            this.navigateCol(rowIdx, colKey, -1);
          } else {
            this.navigateCol(rowIdx, colKey, 1);
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
          if (chosenVal) {
            input.value = chosenVal;
          }
          commitAndBlur(chosenVal);
        } else {
          commitAndBlur();
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
        this.selectAutocompleteRightCell(rowIdx, colKey);
        this.focusSelectedCellEditor();
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitAndBlur();
        if (e.shiftKey) {
          this.navigateCol(rowIdx, colKey, -1);
        } else {
          this.navigateCol(rowIdx, colKey, 1);
        }
      }
    });
  }

}
