// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTCellEditor {
  activateNativeEditor(input) {
    if (!input.classList.contains("is-armed")) return;
    for (const child of [...input.parentElement.childNodes]) {
      if (child !== input && !child.classList?.contains("visit-time-refresh")) child.remove();
    }
    input.classList.remove("is-armed");
    input.refreshEditorColors?.();
    if (["name", "memo"].includes(input.closest(".excel-cell")?.dataset.col)) this.initMemoInput(input);
  }

  startInlineEdit(rowIdx, colKey, cellElement, armed = false) {
    void this.loadSearchHistory();
    if (colKey === "gender") {
      const dropBtn = cellElement.querySelector(".gender-dropdown-btn");
      this.openGenderDropdown(rowIdx, cellElement, dropBtn);
      return;
    }

    const existingEditor = cellElement.querySelector("input");
    if (existingEditor) {
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
    if (this.guardNextCellInput) {
      input.dataset.navigationInputGuard = "true";
      this.guardNextCellInput = false;
    }
    if (colKey === "writer") {
      input.autocapitalize = "characters";
      input.spellcheck = false;
    }
    // Set the Korean input hint before focus establishes the native IME context.
    if (["name", "memo"].includes(colKey)) this.initMemoInput(input);

    cellElement.appendChild(input);
    input.refreshEditorColors = () => this.refreshEditorTextColors(input, cellElement, rows[rowIdx], colKey);
    if (colKey === "visitTime") this.appendVisitTimeRefresh(cellElement, rows[rowIdx]);
    input.focus({ preventScroll: true });
    for (const event of ["click", "keyup", "select", "scroll"]) input.addEventListener(event, () => {
      input.refreshEditorColors();
      this.updateInlineAutocompletePreview();
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
    const repairCompletedInput = () => {
      clearTimeout(_hangulRepairTimer);
      _hangulRepairTimer = setTimeout(() => {
        if (isCommitted || composing || input.dataset.nativeComposing === "true" || !input.isConnected || document.activeElement !== input || colKey === "writer") return;
        if (this.normalizeCompletedHangulInput(input)) input.dispatchEvent(new Event("input", { bubbles: true }));
      }, 0);
    };
    input.addEventListener("compositionstart", (e) => {
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
      this.rememberPatientSearchDraft(rowIdx, colKey, input);
      if (e.isComposing || e.inputType === "insertCompositionText") {
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
      this.rememberPatientSearchDraft(rowIdx, colKey, input);
      if (e.isComposing) { composing = true; input.dataset.nativeComposing = "true"; input.dataset.composing = "true"; }
      this.activateNativeEditor(input);
      this.clearInlineAutocompletePreview();
      const val = input.value;
      this.updateEditorTextColors(rows[rowIdx], colKey, val);

      // writer 열은 영문 대문자 변환만 (한글 입력과 무관)
      if (colKey === "writer") {
        const normalized = this.normalizeWriterEditorInput(input, e);
        if (normalized !== input.value) input.value = normalized;
        rows[rowIdx][colKey] = normalized;
      } else {
        rows[rowIdx][colKey] = val;
      }
      this.elFormulaInput.value = input.value;
      input.refreshEditorColors();
      this.debounceSaveDataStore();
      if (!composing && input.dataset.nativeComposing !== "true") repairCompletedInput();

      // Keep the native input and focus intact during composition.
      // Refresh the separate popup on the next task, coalescing IME/input events
      // without adding a fixed wait before the inline completion can appear.
      if (colKey !== "gender" && colKey !== "writer" && colKey !== "no") {
        clearTimeout(_acDebounceTimer);
        _acDebounceTimer = setTimeout(() => {
          if (!input.isConnected || document.activeElement !== input) return;
          const suggestions = this.getAutocompleteSuggestions(colKey, input.value, input.dataset.composing === "true");
          if (suggestions.length > 0 || (["name", "part", "extra", "memo", "specialNote"].includes(colKey) && input.value.trim())) {
            this.showAutocompleteMenu(rowIdx, colKey, cellElement, input, suggestions);
          } else {
            this.closeAutocompleteMenu();
          }
        }, 0);
      }
    });

    input.addEventListener("compositionend", (e) => {
      if (isCommitted || this.blockInheritedNavigationInput(input, e, initialVal)) return;
      composing = false;
      input.dataset.composing = "false";
      input.dataset.nativeComposing = "false";
      repairCompletedInput();
      if (this._justCommittedFromAutocomplete) return;
      // ★ input.value를 절대 변경하지 않음! 다음 글자 조합을 방해함
      // assembleHangul은 blur 시점에서만 최종 보정
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

      // Let final input events settle before refreshing, without a fixed IME delay.
      if (colKey !== "gender" && colKey !== "writer" && colKey !== "no") {
        clearTimeout(_acDebounceTimer);
        _acDebounceTimer = setTimeout(() => {
          if (!input.isConnected || document.activeElement !== input) return;
          const suggestions = this.getAutocompleteSuggestions(colKey, input.value, input.dataset.composing === "true");
          if (suggestions.length > 0 || (["name", "part", "extra", "memo", "specialNote"].includes(colKey) && input.value.trim())) {
            this.showAutocompleteMenu(rowIdx, colKey, cellElement, input, suggestions);
          } else {
            this.closeAutocompleteMenu();
          }
        }, 0);
      }
    });

    const commitAndBlur = (forcedVal) => {
      if (isCommitted) return;
      isCommitted = true;
      clearTimeout(_hangulRepairTimer);
      clearTimeout(_acDebounceTimer);
      let finalVal = forcedVal !== undefined ? forcedVal : this.assembleHangul(input.value);
      finalVal = colKey === "writer" ? this.normalizeWriterInput(finalVal)
        : colKey === "prescription" ? this.normalizePrescriptionInput(finalVal) : finalVal.trim();
      this.endNativeCellEditing(input);
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
      if (colKey === "writer" && e.key === "ArrowRight" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
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
      // Let the native IME handle candidate selection and composition confirmation.
      if (composing || e.isComposing || e.keyCode === 229) {
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
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          this.moveAutocompleteSelection(1);
          return;
        }
        if (e.key === "ArrowUp") {
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
        if (e.key === "Enter" || e.code === "Enter" || e.keyCode === 13) {
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
        if (e.key === "Tab") {
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
