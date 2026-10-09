// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTCellPickers {
  getWriterPresetValues() {
    return [...new Set((COLUMN_PRESETS.writer || [])
      .map(value => this.normalizeWriterInput(value).trim()))];
  }

  isPresetLeftExit(event, colKey) {
    return ["chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"].includes(colKey) &&
      (event.key === "ArrowLeft" || event.code === "ArrowLeft") &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && this.isAutocompleteOpen();
  }

  isWriterRightExit(event, input) {
    const right = event.key === "ArrowRight" || event.code === "ArrowRight";
    return right && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      (this.isAutocompleteOpen() || (input.selectionStart === input.value.length && input.selectionEnd === input.value.length));
  }

  isManualCellLeftExit(event, input) {
    return (event.key === "ArrowLeft" || event.code === "ArrowLeft") &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      !input.classList.contains("is-armed");
  }

  isWriterEnterExit(event, input) {
    const enter = event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter";
    return enter && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      !input.classList.contains("is-armed");
  }

  handleWriterPickerShortcut(event, rowIdx, cellElement) {
    if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || this.isAutocompleteOpen()) return false;
    event.preventDefault(); event.stopPropagation();
    this.openWriterPicker(rowIdx, cellElement);
    return true;
  }

  openWriterPicker(rowIdx, cellElement) {
    const values = this.getWriterPresetValues();
    if (!values.length) {
      this.openPresetManager("writer");
      return;
    }
    this.startInlineEdit(rowIdx, "writer", cellElement);
    const input = cellElement.querySelector("input");
    if (input) this.showAutocompleteMenu(rowIdx, "writer", cellElement, input, values);
  }

  getPrescriptionPresetValues() {
    return this.getPresetPickerValues("prescription");
  }

  getPresetPickerValues(colKey) {
    return [...new Set((COLUMN_PRESETS[colKey] || [])
      .map(value => String(value ?? "").trim()))];
  }

  handlePrescriptionPickerShortcut(event, rowIdx, cellElement) {
    return this.handlePresetPickerShortcut(event, rowIdx, "prescription", cellElement);
  }

  handlePresetPickerShortcut(event, rowIdx, colKey, cellElement) {
    if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || this.isAutocompleteOpen()) return false;
    event.preventDefault(); event.stopPropagation();
    this.openPresetPicker(rowIdx, colKey, cellElement);
    return true;
  }

  openPrescriptionPicker(rowIdx, cellElement) {
    this.openPresetPicker(rowIdx, "prescription", cellElement);
  }

  openPresetPicker(rowIdx, colKey, cellElement) {
    const values = this.getPresetPickerValues(colKey);
    if (!values.length) {
      this.openPresetManager(colKey);
      return;
    }
    this.startInlineEdit(rowIdx, colKey, cellElement);
    const input = cellElement.querySelector("input");
    if (input) this.showAutocompleteMenu(rowIdx, colKey, cellElement, input, values, { includeTypedValue: false });
  }

  normalizePrescriptionInput(value) {
    const text = String(value ?? "").trim();
    return text === "x" || text === "ㅌ" ? "X" : text;
  }

  handleWriterLetterKey(event, input) {
    if (event.ctrlKey || event.metaKey || event.altKey || !/^Key[A-Z]$/.test(event.code || "")) return false;
    event.preventDefault(); event.stopPropagation();
    this.closeAutocompleteMenu();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    this.activateNativeEditor(input);
    input.value = input.value.slice(0, start) + event.code.slice(3) + input.value.slice(end);
    input.dataset.composing = "false";
    input.dataset.writerKeyValue = input.value;
    input.setSelectionRange(start + 1, start + 1);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  normalizeWriterEditorInput(input, event = {}) {
    // Some IMEs emit native insertion after the handled physical key.
    // Keep the value already entered by that key instead of adding it twice.
    const handled = input.dataset.writerKeyValue;
    const nativeLetter = event.isComposing || /Composition/.test(event.inputType || "") ||
      event.inputType === "insertText" || event.type === "compositionend";
    if (handled !== undefined && nativeLetter) input.value = handled;
    else if (event.inputType) delete input.dataset.writerKeyValue;
    return this.normalizeWriterInput(input.value);
  }

  // Convert Korean keyboard input to uppercase English writer initials.
  normalizeWriterInput(value) {
    const keys = {
      'ㄱ':'R', 'ㄲ':'R', 'ㄴ':'S', 'ㄷ':'E', 'ㄸ':'E', 'ㄹ':'F', 'ㅁ':'A',
      'ㅂ':'Q', 'ㅃ':'Q', 'ㅅ':'T', 'ㅆ':'T', 'ㅇ':'D', 'ㅈ':'W', 'ㅉ':'W',
      'ㅊ':'C', 'ㅋ':'Z', 'ㅌ':'X', 'ㅍ':'V', 'ㅎ':'G',
      'ㅏ':'K', 'ㅐ':'O', 'ㅑ':'I', 'ㅒ':'O', 'ㅓ':'J', 'ㅔ':'P', 'ㅕ':'U',
      'ㅖ':'P', 'ㅗ':'H', 'ㅘ':'HK', 'ㅙ':'HO', 'ㅚ':'HL', 'ㅛ':'Y',
      'ㅜ':'N', 'ㅝ':'NJ', 'ㅞ':'NP', 'ㅟ':'NL', 'ㅠ':'B', 'ㅡ':'M', 'ㅢ':'ML', 'ㅣ':'L',
      'ㄳ':'RT', 'ㄵ':'SW', 'ㄶ':'SG', 'ㄺ':'FR', 'ㄻ':'FA', 'ㄼ':'FQ',
      'ㄽ':'FT', 'ㄾ':'FX', 'ㄿ':'FV', 'ㅀ':'FG', 'ㅄ':'QT',
    };
    const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
    const vowels = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
    const finals = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
    return Array.from(String(value ?? '').normalize('NFC'), (char) => {
      if (/^[a-z]$/i.test(char)) return char.toUpperCase();
      if (keys[char]) return keys[char];
      const syllable = char.charCodeAt(0) - 0xAC00;
      if (syllable < 0 || syllable > 11171) return '';
      return keys[initials[Math.floor(syllable / 588)]] +
        keys[vowels[Math.floor(syllable % 588 / 28)]] + (keys[finals[syllable % 28]] || '');
    }).join('');
  }

  // G열 성별 정규화 헬퍼 (무조건 영어 대문자 M 또는 F, 'ㄹ' -> 'F', 'ㅡ' -> 'M')
  normalizeGenderInput(val) {
    if (!val) return "";
    const s = String(val).trim();
    if (s === "ㄹ" || s === "f" || s === "F") return "F";
    if (s === "ㅡ" || s === "m" || s === "M") return "M";
    return "";
  }

  // 한글 자모 결합 (분리된 초/중/종성 자모를 완전한 음절로 자동 결합, e.g. ㅎㅏㄱ -> 학, ㅎㅏㄱㅅㅐㅇ -> 학생)
  setGenderValue(rowIdx, rawVal, cellEl = null) {
    const rows = this.getCurrentRows();
    if (!rows[rowIdx]) return;
    const finalVal = this.normalizeGenderInput(rawVal);
    rows[rowIdx].gender = finalVal;

    const el = cellEl || document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="gender"]`);
    if (el) {
      let textSpan = el.querySelector(".cell-gender-text");
      if (!textSpan) {
        // Dropdown button 확인 및 보존
        const dropBtn = el.querySelector(".gender-dropdown-btn");
        el.innerHTML = "";
        textSpan = document.createElement("span");
        textSpan.className = "cell-gender-text";
        el.appendChild(textSpan);
        if (dropBtn) el.appendChild(dropBtn);
      }
      textSpan.textContent = finalVal;
      el.classList.remove("f", "m");
      if (finalVal === "F") el.classList.add("f");
      if (finalVal === "M") el.classList.add("m");
    }

    if (this.activeCell && this.activeCell.rowIdx === rowIdx && this.activeCell.colKey === "gender") {
      this.elFormulaInput.value = finalVal;
      if (el) this.highlightCell(el);
    }

    this.saveDataStore();
  }

  // 엑셀 스타일 우측 드롭다운 팝업 메뉴 (셀 안에 셀이 들어가지 않고 우측에만 표시)
  openGenderDropdown(rowIdx, cellElement, triggerElement = null) {
    this.closeGenderDropdown();

    const menu = document.createElement("div");
    menu.className = "gender-picker-menu";
    menu.id = "genderPickerMenu";

    const items = [
      { val: "M", text: "M (남)", cls: "item-m" },
      { val: "F", text: "F (여)", cls: "item-f" },
      { val: "", text: "- (선택 안함)", cls: "item-none" }
    ];

    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "성별 선택");
    this.genderPickerState = { rowIdx, cellElement, items,
      selectedIndex: Math.max(0, items.findIndex(item => item.val === (this.getCurrentRows()[rowIdx]?.gender || ""))) };
    items.forEach((item, index) => {
      const itemEl = document.createElement("div");
      itemEl.className = `gender-picker-item ${item.cls}`;
      const label = document.createElement("span");
      label.textContent = item.text;
      itemEl.appendChild(label);
      const hint = document.createElement("span");
      hint.className = "autocomplete-hint-badge gender-picker-hint";
      hint.textContent = "Enter";
      itemEl.appendChild(hint);
      itemEl.setAttribute("role", "option");
      itemEl.classList.toggle("is-selected", index === this.genderPickerState.selectedIndex);
      itemEl.setAttribute("aria-selected", String(index === this.genderPickerState.selectedIndex));
      itemEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setGenderValue(rowIdx, item.val, cellElement);
        this.closeGenderDropdown();
        this.selectCell(rowIdx, "gender", cellElement, false);
      });
      menu.appendChild(itemEl);
    });

    document.body.appendChild(menu);
    this.genderPickerKeyListener = event => this.handleGenderPickerKeyDown(event);
    document.addEventListener("keydown", this.genderPickerKeyListener, true);

    // 메뉴 위치 계산 (트리거 버튼 또는 셀 바로 아래)
    const targetRect = (triggerElement || cellElement).getBoundingClientRect();
    const menuWidth = 136;
    let left = targetRect.left;
    let top = targetRect.bottom + 1;

    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 6;
    }
    if (top + 105 > window.innerHeight) {
      top = targetRect.top - 105;
    }

    menu.style.left = `${Math.max(6, left)}px`;
    menu.style.top = `${Math.max(6, top)}px`;

    // 외부 클릭 시 닫기
    const outsideClickListener = (e) => {
      if (!menu.contains(e.target) && e.target !== triggerElement) {
        this.closeGenderDropdown();
        document.removeEventListener("click", outsideClickListener);
      }
    };
    this.genderPickerOutsideListener = outsideClickListener;
    this.genderPickerOutsideTimer = setTimeout(() => {
      if (this.genderPickerState) document.addEventListener("click", outsideClickListener);
    }, 10);
  }

  handleGenderPickerKeyDown(event) {
    const state = this.genderPickerState;
    const key = event.key === "Process" ? event.code : event.key;
    if (!state || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape"].includes(key)) return;
    if (key === "ArrowLeft" && (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (key === "ArrowLeft") this.presetLeftKeyHeld = true;
    if (key === "ArrowUp" || key === "ArrowDown") {
      const direction = key === "ArrowDown" ? 1 : -1;
      state.selectedIndex = (state.selectedIndex + direction + state.items.length) % state.items.length;
      document.getElementById("genderPickerMenu")?.querySelectorAll(".gender-picker-item").forEach((item, index) => {
        item.classList.toggle("is-selected", index === state.selectedIndex);
        item.setAttribute("aria-selected", String(index === state.selectedIndex));
      });
      return;
    }
    if (key === "Enter" || key === "ArrowRight" || key === "ArrowLeft") this.setGenderValue(state.rowIdx, state.items[state.selectedIndex].val, state.cellElement);
    this.closeGenderDropdown();
    if (key === "ArrowLeft") this.selectAutocompleteLeftCell(state.rowIdx, "gender");
    else if (key === "Enter") this.selectAutocompleteRightCell(state.rowIdx, "gender");
    else if (key === "ArrowRight") this.navigateCol(state.rowIdx, "gender", 1);
    else this.selectCell(state.rowIdx, "gender", state.cellElement, false);
    this.focusSelectedCellEditor();
  }

  closeGenderDropdown() {
    clearTimeout(this.genderPickerOutsideTimer);
    if (this.genderPickerKeyListener) document.removeEventListener("keydown", this.genderPickerKeyListener, true);
    if (this.genderPickerOutsideListener) document.removeEventListener("click", this.genderPickerOutsideListener);
    this.genderPickerState = null;
    this.genderPickerKeyListener = null;
    this.genderPickerOutsideListener = null;
    const existing = document.getElementById("genderPickerMenu");
    if (existing) {
      existing.remove();
    }
  }

  // =============================================================================
  // Cell Autocomplete Engine (셀 타이핑 시 연관 목록 표시 & Enter 시 최상단 자동 입력)
  // =============================================================================
}
