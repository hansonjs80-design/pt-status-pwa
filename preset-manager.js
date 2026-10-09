// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTPresetManager {
  getAutocompleteRuleKey(colKey, query) {
    return `__query:${colKey}:${this.assembleHangul(String(query).trim()).toLowerCase()}`;
  }

  getAutocompleteHiddenKey(ruleKey) {
    return ruleKey.replace(/^__query:/, "__hidden:");
  }

  togglePresetCandidateVisibility(tab, index) {
    const context = this.autocompleteManagerContext;
    if (!context || context.colKey !== tab) return;
    const value = context.items[index];
    if (value === undefined) return;
    context.hidden ||= [];
    context.hidden = context.hidden.includes(value) ? context.hidden.filter(item => item !== value) : [...context.hidden, value];
    this.savePresetManagerItems(tab);
    this.renderPresetManagerList();
  }

  getPresetManagerKey(tab) {
    return this.autocompleteManagerContext?.colKey === tab ? this.autocompleteManagerContext.key : tab;
  }

  getPresetManagerItems(tab) {
    const context = this.autocompleteManagerContext;
    return context?.colKey === tab ? context.items : (COLUMN_PRESETS[tab] ||= []);
  }

  savePresetManagerItems(tab) {
    COLUMN_PRESETS[this.getPresetManagerKey(tab)] = [...this.getPresetManagerItems(tab)];
    const context = this.autocompleteManagerContext;
    if (context?.colKey === tab) {
      context.hidden = (context.hidden || []).filter(value => context.items.includes(value));
      COLUMN_PRESETS[this.getAutocompleteHiddenKey(context.key)] = [...context.hidden];
    }
    saveColumnPresets(COLUMN_PRESETS);
  }

  openAutocompletePresetManager(colKey, value, input) {
    const query = input?.value || this.autocompleteState?.query || value;
    const shown = this.autocompleteState?.colKey === colKey && this.autocompleteState?.query === query
      ? this.autocompleteState.candidates : this.getAutocompleteSuggestions(colKey, query, true);
    const key = this.getAutocompleteRuleKey(colKey, query);
    const items = Object.hasOwn(COLUMN_PRESETS, key) ? [...COLUMN_PRESETS[key]]
      : [...new Set(shown.filter(item => colKey === "name" || item === value ||
        (COLUMN_PRESETS[colKey] || []).includes(item) || (item !== query && item !== this.assembleHangul(query))))];
    input?.blur?.();
    this.closeAutocompleteMenu();
    this.openPresetManager(colKey, { colKey, query, key, items, hidden: [...(COLUMN_PRESETS[this.getAutocompleteHiddenKey(key)] || [])] });
  }

  // ===== 프리셋 관리 (빠른 입력 도구 수정 기능) =====

  // ===== 프리셋 관리 (빠른 입력 도구 추가/삭제/수정/관리 기능) =====

  renderQuickChips() {
    const controls = document.getElementById("historyControls");
    controls.replaceChildren();
    for (const [id, path, label, redo] of [
      ["btnUndo", "M9 5 4 10l5 5 M4 10h10a5 5 0 0 1 0 10h-4", "되돌리기 (Ctrl/Cmd+Z)", false],
      ["btnRedo", "m15 5 5 5-5 5 M20 10H10a5 5 0 0 0 0 10h4", "다시 실행 (Ctrl/Cmd+Shift+Z)", true]
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = id;
      button.className = "history-button";
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      arrow.setAttribute("d", path);
      icon.appendChild(arrow);
      button.appendChild(icon);
      button.title = label;
      button.setAttribute("aria-label", label);
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => this.restoreEditHistory(redo));
      controls.appendChild(button);
    }
    this.updateHistoryButtons();
  }

  showPresetContextMenu(x, y) {
    this.hidePresetContextMenu();
    const menu = this.elPresetContextMenu;
    if (!menu) return;
    menu.style.display = "block";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // 화면 밖으로 나가지 않도록 조정
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = `${Math.max(10, x - rect.width)}px`;
      if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(10, y - rect.height)}px`;
    });
  }

  hidePresetContextMenu() {
    if (this.elPresetContextMenu) {
      this.elPresetContextMenu.style.display = "none";
    }
  }

  handlePresetContextAction(action) {
    const target = this._contextPreset;
    if (!target && action !== "reset-presets" && action !== "manage-presets") return;

    switch (action) {
      case "edit-preset":
        this.openPresetModal("edit", target);
        break;
      case "delete-preset":
        if (confirm(`"${target.value}" 프리셋을 삭제하시겠습니까?`)) {
          const arr = COLUMN_PRESETS[target.type];
          if (arr) {
            arr.splice(target.index, 1);
            saveColumnPresets(COLUMN_PRESETS);
            this.renderQuickChips();
            this.showSaveIndicator("프리셋 삭제됨");
          }
        }
        break;
      case "manage-presets":
        this.openPresetManager(target ? target.type : "prescription");
        break;
      case "reset-presets":
        if (confirm("빠른 입력 도구를 기본값으로 복원하시겠습니까?")) {
          COLUMN_PRESETS = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
          saveColumnPresets(COLUMN_PRESETS);
          this.renderQuickChips();
          this.showSaveIndicator("기본값으로 복원됨");
        }
        break;
    }
    this._contextPreset = null;
  }

  // --- 통합 빠른 도구 관리 모달 (추가 / 삭제 / 수정 / 순서변경) ---
  openPresetManager(tab = "prescription", context = null) {
    if (!this.elPresetManagerModal) return;
    if (this.elPresetManagerModal.style.display !== "flex") this.presetManagerReturnFocus = document.activeElement;
    clearTimeout(this.presetManagerFocusTimer);
    this.autocompleteManagerContext = context;
    this.activePresetTab = tab;
    this.updatePresetManagerTabs();
    this.renderPresetManagerList();
    this.elPresetManagerModal.style.display = "flex";
    this.setPresetManagerFeedback("변경사항은 바로 저장됩니다.");
    if (this.elManagerNewPresetInput) {
      this.elManagerNewPresetInput.value = "";
      this.presetManagerFocusTimer = setTimeout(() => {
        if (this.elPresetManagerModal.style.display === "flex") this.elManagerNewPresetInput.focus();
      }, 100);
    }
  }

  closePresetManager() {
    clearTimeout(this.presetManagerFocusTimer);
    this.clearPresetDrag();
    if (this.elPresetManagerModal?.style.display === "flex") {
      this.elPresetManagerModal.style.display = "none";
      const focus = this.presetManagerReturnFocus?.isConnected ? this.presetManagerReturnFocus : this.elBtnManagePresets;
      focus?.focus({ preventScroll: true });
      this.presetManagerReturnFocus = null;
    }
  }

  switchPresetTab(tab) {
    this.clearPresetDrag();
    this.autocompleteManagerContext = null;
    this.activePresetTab = tab;
    this.updatePresetManagerTabs();
    this.renderPresetManagerList();
    this.setPresetManagerFeedback("변경사항은 바로 저장됩니다.");
    if (this.elManagerNewPresetInput) {
      this.elManagerNewPresetInput.focus();
    }
  }

  updatePresetManagerTabs() {
    const context = this.autocompleteManagerContext;
    const labels = { name: "성함", part: "부위", prescription: "처방", extra: "추가 사항", writer: "작성", memo: "메모", specialNote: "특이 사항" };
    const title = this.elPresetManagerModal?.querySelector(".modal-title");
    if (title) title.textContent = context ? `${labels[this.activePresetTab]} 입력값별 자동완성` : "빠른 입력 도구 관리";
    this.elPresetManagerModal?.classList.toggle("preset-detail-mode", Boolean(context));
    const detailPanel = document.getElementById("presetDetailPanel");
    if (detailPanel) detailPanel.hidden = Boolean(context);
    const detailControls = document.getElementById("presetDetailControls");
    if (detailControls) {
      detailControls.style.display = "flex";
      const queryInput = document.getElementById("presetDetailQuery");
      queryInput.value = context?.query || "";
      queryInput.placeholder = `${labels[this.activePresetTab]} 입력값 (예: 옹)`;
      const saved = document.getElementById("presetDetailQueries");
      saved.replaceChildren();
      const prefix = `__query:${this.activePresetTab}:`;
      Object.keys(COLUMN_PRESETS).filter(key => key.startsWith(prefix)).forEach(key => {
        const option = document.createElement("option");
        option.value = key.slice(prefix.length);
        saved.appendChild(option);
      });
      document.getElementById("btnPresetDetail").onclick = () => {
        const query = queryInput.value.trim();
        if (!query) { queryInput.focus(); return; }
        this.openAutocompletePresetManager(this.activePresetTab, null, { value: query });
      };
      queryInput.onkeydown = event => {
        if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229 && !event.repeat) {
          event.preventDefault(); event.stopPropagation(); document.getElementById("btnPresetDetail").click();
        }
      };
    }
    const hiddenPanel = document.getElementById("columnHiddenPanel");
    if (hiddenPanel) {
      hiddenPanel.style.display = context ? "none" : "block";
      const hiddenInput = document.getElementById("managerHiddenPresetInput");
      hiddenInput.placeholder = `${labels[this.activePresetTab]} 숨김 문구 입력`;
      hiddenInput.value = "";
      document.getElementById("btnManagerAddHiddenPreset").onclick = () => this.addColumnHiddenPreset();
      hiddenInput.onkeydown = event => {
        if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
          event.preventDefault(); event.stopPropagation(); this.addColumnHiddenPreset();
        }
      };
      this.renderColumnHiddenPresets();
    }
    const back = document.getElementById("btnPresetGeneral");
    if (back) {
      back.style.display = context ? "inline-block" : "none";
      back.onclick = () => this.openPresetManager(this.activePresetTab);
    }
    const description = this.elPresetManagerModal?.querySelector(".modal-body > p");
    if (description) {
      description.dataset.defaultText ||= description.textContent;
      description.textContent = context
        ? `“${context.query}” 입력 시 표시할 후보입니다. ‘이전 기록 수정’은 모든 날짜의 같은 열에 적용됩니다.`
        : description.dataset.defaultText;
    }
    const tabs = this.elPresetManagerModal?.querySelector(".preset-tabs");
    if (tabs) tabs.style.display = context ? "none" : "flex";
    if (this.elBtnManagerResetPresets) this.elBtnManagerResetPresets.textContent = context ? "기본 후보 복원" : "전체 기본값 복원";
    for (const [tab, element] of [["name", this.elTabPresetName], ["part", this.elTabPresetPart], ["prescription", this.elTabPresetPrescription], ["extra", this.elTabPresetExtra],
      ["writer", this.elTabPresetWriter], ["memo", this.elTabPresetMemo], ["specialNote", this.elTabPresetSpecialNote]]) {
      element?.classList.toggle("active", this.activePresetTab === tab);
      element?.setAttribute("aria-pressed", String(this.activePresetTab === tab));
    }
    if (this.elManagerNewPresetInput) {
      const labels = { name: "성함", part: "부위", prescription: "처방", extra: "추가 사항", writer: "작성 이니셜", memo: "메모", specialNote: "특이 사항" };
      this.elManagerNewPresetInput.placeholder = `새 ${labels[this.activePresetTab]} 문구 입력`;
    }
  }

  addColumnHiddenPreset() {
    const input = document.getElementById("managerHiddenPresetInput");
    const value = input?.value.trim();
    if (!value) { input?.focus(); return; }
    const key = `__columnHidden:${this.activePresetTab}`;
    const items = COLUMN_PRESETS[key] ||= [];
    if (!items.some(item => item.toLowerCase() === value.toLowerCase())) items.push(value);
    saveColumnPresets(COLUMN_PRESETS);
    input.value = "";
    this.renderColumnHiddenPresets();
    input.focus();
  }

  renderColumnHiddenPresets() {
    const container = document.getElementById("columnHiddenPresetList");
    if (!container) return;
    container.replaceChildren();
    const key = `__columnHidden:${this.activePresetTab}`;
    const items = COLUMN_PRESETS[key] || [];
    const count = document.getElementById("columnHiddenCount");
    if (count) count.textContent = items.length;
    if (!items.length) {
      container.textContent = "숨김 문구가 없습니다.";
      return;
    }
    items.forEach((value, index) => {
      const row = document.createElement("div"); row.className = "preset-list-item";
      const text = document.createElement("span"); text.className = "preset-item-text";
      text.textContent = value; text.title = value;
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "preset-action-btn"; edit.textContent = "수정";
      edit.onclick = () => {
        const next = prompt("숨김 문구를 수정하세요:", value);
        if (!next?.trim()) return;
        items[index] = next.trim(); saveColumnPresets(COLUMN_PRESETS); this.renderColumnHiddenPresets();
      };
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "preset-action-btn"; remove.textContent = "숨김 해제";
      remove.onclick = () => { items.splice(index, 1); saveColumnPresets(COLUMN_PRESETS); this.renderColumnHiddenPresets(); };
      row.append(text, edit, remove); container.appendChild(row);
    });
  }

  clearPresetDrag() {
    this.presetDragState = null;
    this.elPresetListContainer?.querySelectorAll(".preset-dragging, .preset-drop-before, .preset-drop-after")
      .forEach(row => row.classList.remove("preset-dragging", "preset-drop-before", "preset-drop-after"));
  }

  reorderPresetAt(tab, from, insertion) {
    const items = this.getPresetManagerItems(tab);
    if (!Number.isInteger(from) || !Number.isInteger(insertion) || from < 0 || from >= items.length || insertion < 0 || insertion > items.length) return;
    const destination = insertion > from ? insertion - 1 : insertion;
    if (destination === from) return;
    const [value] = items.splice(from, 1);
    items.splice(destination, 0, value);
    this.savePresetManagerItems(tab);
    this.renderPresetManagerList();
    this.renderQuickChips();
  }

  bindPresetDragRow(row, tab, index) {
    const handle = document.createElement("span");
    handle.className = "preset-drag-handle"; handle.draggable = true;
    handle.textContent = "⠿"; handle.title = "드래그하여 순서 이동";
    handle.setAttribute("aria-label", "드래그하여 순서 이동");
    row.appendChild(handle);
    handle.addEventListener("dragstart", event => {
      this.presetDragState = { tab, index, context: this.autocompleteManagerContext };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
      event.dataTransfer.setDragImage(row, 20, row.offsetHeight / 2);
      row.classList.add("preset-dragging");
    });
    handle.addEventListener("dragend", () => this.clearPresetDrag());
    row.addEventListener("dragover", event => {
      const state = this.presetDragState;
      if (!state || state.tab !== tab || state.context !== this.autocompleteManagerContext) return;
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
      this.elPresetListContainer.querySelectorAll(".preset-drop-before, .preset-drop-after")
        .forEach(item => item.classList.remove("preset-drop-before", "preset-drop-after"));
      const rect = row.getBoundingClientRect();
      row.classList.add(event.clientY < rect.top + rect.height / 2 ? "preset-drop-before" : "preset-drop-after");
      const listRect = this.elPresetListContainer.getBoundingClientRect();
      if (event.clientY < listRect.top + 32) this.elPresetListContainer.scrollTop -= 24;
      else if (event.clientY > listRect.bottom - 32) this.elPresetListContainer.scrollTop += 24;
    });
    row.addEventListener("drop", event => {
      const state = this.presetDragState;
      if (!state || state.tab !== tab || state.context !== this.autocompleteManagerContext) return;
      event.preventDefault(); event.stopPropagation();
      const rect = row.getBoundingClientRect();
      const insertion = index + (event.clientY >= rect.top + rect.height / 2 ? 1 : 0);
      this.clearPresetDrag();
      this.reorderPresetAt(tab, state.index, insertion);
    });
  }

  createPresetManagerAction(action, label, handler) {
    const paths = {
      up: '<path d="m6 14 6-6 6 6"/>',
      down: '<path d="m6 10 6 6 6-6"/>',
      reset: '<path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/>',
      edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5"/>',
      delete: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>'
    };
    const button = document.createElement("button");
    button.type = "button";
    button.className = `preset-action-btn preset-icon-btn${action === "delete" ? " btn-del" : ""}`;
    button.dataset.presetAction = action;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[action]}</svg>`;
    button.onclick = handler;
    return button;
  }

  renderPresetManagerList() {
    const container = this.elPresetListContainer;
    if (!container) return;
    const scrollTop = container.scrollTop;
    const focusedRow = document.activeElement?.closest?.('#presetListContainer [data-preset-index]');
    const focusedAction = focusedRow ? document.activeElement.dataset.presetAction : null;
    const focusedIndex = Number(focusedRow?.dataset.presetIndex);
    container.innerHTML = "";

    const tab = this.activePresetTab;
    const items = this.getPresetManagerItems(tab);
    const count = document.getElementById("presetManagerCount");
    if (count) count.textContent = items.length;

    if (items.length === 0) {
      container.innerHTML = '<div class="preset-list-empty">등록된 문구가 없습니다.<br>위 입력칸에서 첫 문구를 추가해보세요.</div>';
      if (focusedAction) this.elManagerNewPresetInput?.focus();
      return;
    }

    items.forEach((val, idx) => {
      const itemEl = document.createElement("div");
      itemEl.className = "preset-list-item";
      itemEl.dataset.presetIndex = idx;
      const hidden = this.autocompleteManagerContext?.hidden?.includes(val) || false;
      itemEl.classList.toggle("preset-candidate-hidden", hidden);
      this.bindPresetDragRow(itemEl, tab, idx);

      const numEl = document.createElement("span");
      numEl.className = "preset-item-num";
      numEl.textContent = `${idx + 1}.`;

      const textEl = document.createElement("span");
      textEl.className = "preset-item-text";
      const label = val === "" ? "빈칸" : val;
      this.renderAutocompleteText(textEl, tab, val, this.autocompleteManagerContext?.query);
      if (hidden) textEl.append(document.createTextNode(' · 숨김'));
      const itemColor = this.getAutocompleteValueColor(tab, val, this.autocompleteManagerContext?.query);
      textEl.title = `${label} (더블클릭하여 수정)`;
      textEl.style.cursor = "pointer";
      textEl.addEventListener("dblclick", () => this.editPresetAt(tab, idx));

      const actionsEl = document.createElement("div");
      actionsEl.className = "preset-item-actions";
      const colorPicker = document.createElement("input"); colorPicker.type = "color";
      colorPicker.className = "preset-item-color"; colorPicker.value = this.toColorPickerValue(itemColor);
      colorPicker.dataset.presetAction = "color";
      colorPicker.title = "글자색 지정"; colorPicker.setAttribute("aria-label", `${label} 글자색`);
      colorPicker.onchange = () => {
        this.setAutocompleteValueColor(this.getPresetManagerKey(tab), val, colorPicker.value);
        this.renderPresetManagerList();
      };
      actionsEl.appendChild(colorPicker);
      const resetColor = this.createPresetManagerAction("reset", `${label} 기본색으로 되돌리기`, () => {
        this.setAutocompleteValueColor(this.getPresetManagerKey(tab), val, null); this.renderPresetManagerList();
      });
      actionsEl.appendChild(resetColor);

      const btnUp = this.createPresetManagerAction("up", `${label} 위로 이동`, () => this.movePresetAt(tab, idx, -1));
      btnUp.disabled = idx === 0;
      const btnDown = this.createPresetManagerAction("down", `${label} 아래로 이동`, () => this.movePresetAt(tab, idx, 1));
      btnDown.disabled = idx === items.length - 1;
      actionsEl.append(btnUp, btnDown);
      const btnEdit = this.createPresetManagerAction("edit", `${label} 문구·글자색 수정`, () => this.editPresetAt(tab, idx));
      actionsEl.appendChild(btnEdit);
      if (this.autocompleteManagerContext) {
        const visibility = document.createElement("button");
        visibility.type = "button"; visibility.className = "preset-action-btn";
        visibility.textContent = hidden ? "표시" : "숨김";
        visibility.setAttribute("aria-label", `${val} ${hidden ? "다시 표시" : "자동완성에서 숨김"}`);
        visibility.onclick = () => this.togglePresetCandidateVisibility(tab, idx);
        actionsEl.appendChild(visibility);
        const historyEdit = document.createElement("button");
        historyEdit.type = "button"; historyEdit.className = "preset-action-btn";
        historyEdit.textContent = "이전 기록 수정";
        historyEdit.title = "모든 날짜의 같은 열에서 이 문구 수정";
        historyEdit.onclick = () => this.editAutocompleteValue(tab, val, null);
        actionsEl.appendChild(historyEdit);
      }

      // 삭제 버튼
      const btnDel = this.createPresetManagerAction("delete", `${label} 삭제`, () => this.deletePresetAt(tab, idx));
      actionsEl.appendChild(btnDel);

      itemEl.appendChild(numEl);
      itemEl.appendChild(textEl);
      itemEl.appendChild(actionsEl);
      container.appendChild(itemEl);
    });
    container.scrollTop = scrollTop;
    if (focusedAction) {
      const row = container.querySelector(`[data-preset-index="${Math.min(focusedIndex, items.length - 1)}"]`);
      const control = row?.querySelector(`[data-preset-action="${focusedAction}"]`);
      (control?.disabled ? row.querySelector('[data-preset-action="edit"]') : control)?.focus({ preventScroll: true });
    }
  }

  setPresetManagerFeedback(message) {
    const feedback = typeof document !== "undefined" && document.getElementById("presetManagerFeedback");
    if (feedback) feedback.textContent = message;
  }

  handlePresetManagerAddKeyDown(event) {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229 || event.repeat) return;
    event.preventDefault(); event.stopPropagation(); this.addPresetFromManager();
  }

  addPresetFromManager() {
    if (!this.elManagerNewPresetInput) return;
    const rawValue = this.elManagerNewPresetInput.value.trim();
    const val = this.activePresetTab === "writer" ? this.normalizeWriterInput(rawValue) : rawValue;
    const tab = this.activePresetTab;
    const items = this.getPresetManagerItems(tab);
    if (items.includes(val)) {
      this.setPresetManagerFeedback("이미 등록된 문구입니다. 목록에서 수정할 수 있습니다.");
      this.elManagerNewPresetInput.focus(); return;
    }
    items.push(val);
    if (typeof document !== "undefined" && document.getElementById("managerNewPresetColorEnabled")?.checked) {
      this.setAutocompleteValueColor(this.getPresetManagerKey(tab), val, document.getElementById("managerNewPresetColor").value);
    }
    this.savePresetManagerItems(tab);
    this.renderPresetManagerList();
    this.renderQuickChips();
    this.showSaveIndicator("프리셋 추가됨");
    this.setPresetManagerFeedback(val ? "문구를 추가했습니다." : "빈칸 항목을 추가했습니다.");

    this.elManagerNewPresetInput.value = "";
    this.elManagerNewPresetInput.focus();
  }

  async editPresetAt(tab, index) {
    const curVal = this.getPresetManagerItems(tab)[index];
    if (curVal === undefined) return;

    const formatting = this.getAutocompleteValueFormatting(tab, curVal, this.autocompleteManagerContext?.query);
    const edit = await this.openPresetTextColorEditor("자동완성 문구·글자색 수정", curVal, formatting.color, formatting.richText);
    if (!edit) return;
    const trimmed = tab === "writer" ? this.normalizeWriterInput(edit.value) : edit.value;
    const context = this.autocompleteManagerContext;
    if (context?.colKey === tab) context.hidden = (context.hidden || []).map(value => value === curVal ? trimmed : value);
    this.getPresetManagerItems(tab)[index] = trimmed;
    const scope = this.getPresetManagerKey(tab);
    if (trimmed !== curVal && !this.getPresetManagerItems(tab).includes(curVal)) {
      delete COLUMN_PRESETS[this.getAutocompleteColorKey(scope, curVal)];
      delete COLUMN_PRESETS[this.getAutocompleteRichKey(scope, curVal)];
    }
    this.setAutocompleteValueColor(scope, trimmed, edit.color, edit.richText);
    this.savePresetManagerItems(tab);
    this.renderPresetManagerList();
    this.renderQuickChips();
    this.showSaveIndicator("프리셋 수정됨");
  }

  deletePresetAt(tab, index) {
    const curVal = this.getPresetManagerItems(tab)[index];
    if (curVal === undefined) return;

    if (confirm(`"${curVal}" 항목을 삭제하시겠습니까?`)) {
      const items = this.getPresetManagerItems(tab);
      items.splice(index, 1);
      if (!items.includes(curVal)) {
        delete COLUMN_PRESETS[this.getAutocompleteColorKey(this.getPresetManagerKey(tab), curVal)];
        delete COLUMN_PRESETS[this.getAutocompleteRichKey(this.getPresetManagerKey(tab), curVal)];
      }
      this.savePresetManagerItems(tab);
      this.renderPresetManagerList();
      this.renderQuickChips();
      this.showSaveIndicator("프리셋 삭제됨");
    }
  }

  movePresetAt(tab, index, dir) {
    const arr = this.getPresetManagerItems(tab);
    if (!arr) return;
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= arr.length) return;

    const temp = arr[index];
    arr[index] = arr[targetIdx];
    arr[targetIdx] = temp;

    this.savePresetManagerItems(tab);
    this.renderPresetManagerList();
    this.renderQuickChips();
    const row = this.elPresetListContainer?.querySelector(`[data-preset-index="${targetIdx}"]`);
    const button = row?.querySelector(`[data-preset-action="${dir < 0 ? "up" : "down"}"]`);
    (button?.disabled ? row.querySelector('[data-preset-action="edit"]') : button)?.focus({ preventScroll: true });
    this.setPresetManagerFeedback("문구 순서를 변경했습니다.");
  }

  resetPresetsFromManager() {
    const context = this.autocompleteManagerContext;
    if (context) {
      if (!confirm("이 입력값의 자동완성 목록을 기본 후보로 복원하시겠습니까?")) return;
      delete COLUMN_PRESETS[context.key];
      delete COLUMN_PRESETS[this.getAutocompleteHiddenKey(context.key)];
      for (const key of Object.keys(COLUMN_PRESETS)) if (['__color:', '__rich:'].some(prefix => key.startsWith(`${prefix}${JSON.stringify(context.key)}:`))) delete COLUMN_PRESETS[key];
      context.hidden = [];
      const typed = this.assembleHangul(context.query);
      context.items = this.getAutocompleteSuggestions(context.colKey, context.query, true).filter(value => value !== context.query && value !== typed);
      saveColumnPresets(COLUMN_PRESETS);
      this.renderPresetManagerList();
      return;
    }
    if (confirm("빠른 입력 도구를 초기 기본값으로 복원하시겠습니까?\n모든 커스텀 항목이 기본값 세트로 복원됩니다.")) {
      const detailRules = Object.fromEntries(Object.entries(COLUMN_PRESETS).filter(([key]) =>
        key.startsWith("__query:") || key.startsWith("__hidden:") || key.startsWith('__color:"__query:') || key.startsWith('__rich:"__query:')));
      COLUMN_PRESETS = { ...JSON.parse(JSON.stringify(DEFAULT_PRESETS)), ...detailRules };
      saveColumnPresets(COLUMN_PRESETS);
      this.renderPresetManagerList();
      this.renderQuickChips();
      this.renderColumnHiddenPresets();
      this.showSaveIndicator("기본값으로 복원됨");
    }
  }

  // --- 단일 모달 (기존 호환) ---
  openPresetModal(mode, target) {
    this.elPresetModal.style.display = "flex";
    if (mode === "edit" && target) {
      this.elPresetModalTitle.textContent = "프리셋 수정";
      this.elPresetTypeSelect.value = target.type;
      this.elPresetTypeSelect.disabled = true;
      this.elPresetLabelInput.value = target.value;
      this.elPresetValueInput.value = target.value;
      this._editingPreset = { type: target.type, index: target.index };
    } else {
      this.elPresetModalTitle.textContent = "프리셋 추가";
      this.elPresetTypeSelect.disabled = false;
      this.elPresetLabelInput.value = "";
      this.elPresetValueInput.value = "";
      this._editingPreset = null;
    }
    setTimeout(() => this.elPresetLabelInput.focus(), 100);
  }

  closePresetModal() {
    this.elPresetModal.style.display = "none";
    this._editingPreset = null;
  }

  savePresetFromModal() {
    const type = this.elPresetTypeSelect.value;
    const label = this.elPresetLabelInput.value.trim();
    const value = this.elPresetValueInput.value.trim() || label;

    if (!label) {
      alert("표시 이름을 입력해주세요.");
      return;
    }

    if (!COLUMN_PRESETS[type]) COLUMN_PRESETS[type] = [];

    if (this._editingPreset) {
      // 수정
      COLUMN_PRESETS[this._editingPreset.type][this._editingPreset.index] = value;
      this.showSaveIndicator("프리셋 수정됨");
    } else {
      // 추가
      COLUMN_PRESETS[type].push(value);
      this.showSaveIndicator("프리셋 추가됨");
    }

    saveColumnPresets(COLUMN_PRESETS);
    this.renderQuickChips();
    if (this.elPresetManagerModal && this.elPresetManagerModal.style.display !== "none") {
      this.renderPresetManagerList();
    }
    this.closePresetModal();
  }

}
