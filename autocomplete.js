// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTAutocomplete {
  invalidateAutocompleteHistory() {
    this.autocompleteHistoryGeneration = (this.autocompleteHistoryGeneration || 0) + 1;
  }

  getAutocompleteSearchSnapshot() {
    const input = typeof document !== 'undefined' ? document.activeElement : null;
    const editing = input?.isConnected !== false && input?.matches?.('.cell-input-element:not(.is-armed)');
    const previous = editing && input.autocompleteSearchSnapshot;
    const rows = this.dataStore?.[this.currentDate];
    const generation = this.autocompleteHistoryGeneration || 0;
    if (previous && previous.local === this.dataStore && previous.remote === this.cloudSearchHistory &&
        previous.date === this.currentDate && previous.rows === rows && previous.generation === generation) return previous;
    const store = this.getSearchDataStore();
    const snapshot = { store, dates: Object.keys(store).sort().reverse(), values: new Map(), sources: new Map(),
      local: this.dataStore, remote: this.cloudSearchHistory, date: this.currentDate, rows, generation };
    if (editing) input.autocompleteSearchSnapshot = snapshot;
    return snapshot;
  }

  getAutocompleteHistoryValues(snapshot, colKey) {
    if (!snapshot.values.has(colKey)) {
      const values = [], seen = new Set();
      for (const date of snapshot.dates) {
        if (date === this.currentDate || !Array.isArray(snapshot.store[date])) continue;
        for (const row of snapshot.store[date]) {
          const value = String(row?.[colKey] ?? '').trim();
          if (value && !seen.has(value)) { seen.add(value); values.push(value); }
        }
      }
      snapshot.values.set(colKey, values);
    }
    return snapshot.values.get(colKey);
  }

  getAutocompleteFormattingSource(snapshot, colKey, value, excludedRow) {
    if (!snapshot.sources.has(colKey)) {
      const sources = new Map();
      for (const date of snapshot.dates) {
        if (date === this.currentDate || !Array.isArray(snapshot.store[date])) continue;
        for (const row of snapshot.store[date]) {
          const text = String(row?.[colKey] ?? '').trim();
          if (!sources.has(text)) sources.set(text, []);
          const candidates = sources.get(text);
          // One excluded row can be skipped without scanning all old records again.
          if (candidates.length < 2) candidates.push({date, row});
        }
      }
      snapshot.sources.set(colKey, sources);
    }
    const text = String(value).trim();
    const historical = snapshot.sources.get(colKey).get(text)?.find(entry => entry.row !== excludedRow);
    const current = (this.dataStore?.[this.currentDate] || snapshot.store[this.currentDate] || [])
      .find(row => row !== excludedRow && String(row?.[colKey] ?? '').trim() === text);
    return current && (!historical || this.currentDate >= historical.date) ? current : historical?.row;
  }

  getAutocompleteSuggestions(colKey, rawQuery, isComposing = false) {
    if (!rawQuery) return [];
    const typedQuery = String(rawQuery).trim();
    const query = typedQuery.toLowerCase();
    if (!query) return [];

    const columnHidden = new Set((COLUMN_PRESETS[`__columnHidden:${colKey}`] || []).map(value => value.trim().toLowerCase()));
    const ruleKey = this.getAutocompleteRuleKey(colKey, rawQuery);
    if (Object.hasOwn(COLUMN_PRESETS, ruleKey)) {
      const hidden = COLUMN_PRESETS[this.getAutocompleteHiddenKey(ruleKey)] || [];
      const values = this.deduplicatePresetCandidates(colKey, this.getPresetCandidates(ruleKey), rawQuery).filter(value => !hidden.includes(this.getPresetCandidateIdentity(value)) && !columnHidden.has(value.trim().toLowerCase()));
      if (["part", "chartNo"].includes(colKey)) {
        const typed = this.assembleHangul(rawQuery).trim();
        return this.deduplicatePresetCandidates(colKey, [typed, ...values], rawQuery);
      }
      return values;
    }
    const presets = this.deduplicatePresetCandidates(colKey, this.getPresetCandidates(colKey), rawQuery);
    // An initial-specific list also supplies candidates as its syllable grows
    // (ㅇ → 아 → 안). An explicitly edited list for the exact query above wins.
    const rulePrefix = `__query:${colKey}:`;
    for (const [key, values] of Object.entries(COLUMN_PRESETS)) {
      if (!key.startsWith(rulePrefix) || !Array.isArray(values)) continue;
      const sourceQuery = key.slice(rulePrefix.length);
      if (!sourceQuery || !this.matchesHangulPrefix(query, sourceQuery, true)) continue;
      const hidden = new Set(COLUMN_PRESETS[this.getAutocompleteHiddenKey(key)] || []);
      for (const value of this.getPresetCandidates(key)) {
        if (String(value).trim() === '') continue; // 상위 규칙의 빈칸은 하위 규칙으로 전파하지 않음
        if (!hidden.has(this.getPresetCandidateIdentity(value)) && !presets.some(item => this.getPresetCandidateIdentity(item) === this.getPresetCandidateIdentity(value))) presets.push(value);
      }
    }
    const presetSet = new Set(presets);

    // 현재 날짜뿐 아니라 저장된 모든 날짜의 같은 열에서 후보를 수집한다.
    // 현재 날짜, 최근 날짜 순으로 수집하되 같은 값은 한 번만 표시한다.
    const snapshot = this.getAutocompleteSearchSnapshot();
    const existingValues = new Set();
    const seenValues = new Set(presetSet);
    const addValue = raw => {
      const value = String(raw ?? '').trim();
      if (!value || seenValues.has(value)) return;
      seenValues.add(value); existingValues.add(value);
    };
    // Current-day rows remain live: new input, paste and deletion take effect now.
    for (const row of this.dataStore?.[this.currentDate] || snapshot.store[this.currentDate] || []) addValue(row?.[colKey]);
    for (const value of this.getAutocompleteHistoryValues(snapshot, colKey)) addValue(value);

    // Only explicit initials are fuzzy; completed syllables must match literally.
    const queryChars = [...query];
    const hasInitials = /[ㄱ-ㅎ]/.test(query);
    const matchesInitialsAt = (value, start) => hasInitials && queryChars.every((char, index) => {
      const candidate = value[start + index];
      return candidate !== undefined && (/^[ㄱ-ㅎ]$/.test(char)
        ? this.getChosung(candidate) === char : candidate === char);
    });

    const matchesComposingPrefix = value => {
      const final = query.at(-1), code = final?.charCodeAt(0) - 0xac00;
      if (!(code >= 0 && code <= 11171 && code % 28 === 0)) return false;
      const stem = query.slice(0, -1);
      if (!value.startsWith(stem)) return false;
      const candidate = value.charCodeAt(stem.length) - 0xac00;
      return candidate >= 0 && candidate <= 11171 && Math.floor(candidate / 28) === Math.floor(code / 28);
    };
    const matched = [];

    // 관리 목록의 문구와 순서를 우선하고 나머지 기존 값은 매칭 품질로 정렬한다.
    const matchItem = (item, isPreset) => {
      const itemLower = item.toLowerCase();
      if (columnHidden.has(itemLower.trim())) return;
      // Explicitly registered candidates remain visible even after complete typing.
      if (item === typedQuery && !isPreset) return;

      // 부위·성함·추가 사항·메모·특이 사항은 앞부분만 매칭한다.
      // 매칭 품질: 1=접두사, 2=초성접두사, 3=부분일치
      // 일치하는 관리 문구는 목록에 저장된 순서 그대로 우선 표시한다.
      let quality = -1;
      if (isPreset && item === "") {
        if (query) return; // 검색어를 입력 중일 때는 빈칸을 추천 목록에 표시하지 않음
        matched.push({ item, score: 0, isPreset });
        return;
      }

      if (["name", "part", "extra", "memo", "specialNote"].includes(colKey)) {
        if (this.matchesHangulPrefix(item, query, isComposing)) quality = itemLower.startsWith(query) ? 1 : 1.5;
      } else if (itemLower.startsWith(query)) {
        quality = 1; // 접두사 일치 (e.g. '한' -> '한랭...')
      } else if (matchesComposingPrefix(itemLower)) {
        quality = 1.5;
      } else if (matchesInitialsAt(itemLower, 0)) {
        quality = 2; // 초성 접두사 (e.g. 'ㅎ' -> '학생...')
      } else if (!hasInitials && itemLower.includes(query)) {
        quality = 3; // 부분 일치
      }

      if (quality >= 0) {
        const score = isPreset ? 0 : quality * 10 + 5;
        matched.push({ item, score, isPreset });
      }
    };

    // 1) 프리셋 항목 매칭
    for (const item of presets) {
      matchItem(item, true);
    }

    // 2) 시트 기존 값 매칭
    for (const item of existingValues) {
      matchItem(item, false);
    }

    matched.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.isPreset ? 0 : a.item.length - b.item.length;
    });

    // Keep unrelated suggestion groups in place, but order numeric variants
    // of the same wording by their numbers before applying the display limit.
    const numericGroups = new Map();
    for (const candidate of matched) {
      if (colKey === "chartNo") continue; // Patient identifiers retain their match ranking.
      const numbers = candidate.item.match(/\d+(?:\.\d+)?/g);
      if (!numbers) continue;
      const key = candidate.item.toLowerCase().replace(/\d+(?:\.\d+)?/g, "\u0000");
      if (!numericGroups.has(key)) numericGroups.set(key, []);
      numericGroups.get(key).push({ candidate, numbers: numbers.map(Number) });
      candidate.numericGroup = key;
    }
    for (const group of numericGroups.values()) {
      group.sort((a, b) => {
        for (let i = 0; i < a.numbers.length; i++) {
          const difference = a.numbers[i] - b.numbers[i];
          if (difference) return difference;
        }
        return 0;
      });
    }
    const groupPositions = new Map();
    const ordered = matched.map(candidate => {
      if (candidate.numericGroup === undefined) return candidate.item;
      const position = groupPositions.get(candidate.numericGroup) || 0;
      groupPositions.set(candidate.numericGroup, position + 1);
      return numericGroups.get(candidate.numericGroup)[position].candidate.item;
    });
    let results = ordered.slice(0, 10);

    // 부위와 차트번호는 현재 입력값을 첫 후보로 유지한다.
    if (colKey === "part" || colKey === "chartNo") {
      const assembled = this.assembleHangul(rawQuery).trim();
      if (assembled) {
        // 이미 목록에 정확히 같은 값이 있으면 제거 후 맨 앞에 추가
        results = results.filter((r) => r !== assembled);
        results.unshift(assembled);
        results = results.slice(0, 10);
      }
    }

    return this.expandHistoricalPresetVariants(snapshot,colKey,results);
  }

  showAutocompleteMenu(rowIdx, colKey, cellElement, input, candidates, { includeTypedValue = true, preferCurrentValue = false, isPresetPicker = false } = {}) {
    candidates = this.deduplicatePresetCandidates(colKey, candidates || [], this.getCellEditorValue(input));
    const previous = this.autocompleteState;
    const query = this.getCellEditorValue(input);
    input.dataset.autocompleteQuery = query;
    const typedValue = this.assembleHangul(query).trim();
    const showTypedValue = includeTypedValue && ["name", "part", "extra", "memo", "specialNote"].includes(colKey) && Boolean(typedValue);
    // Matching ignores case, but choosing a candidate must retain its spelling:
    // the typed "mw" and the registered "MW" are different selectable values.
    if (showTypedValue) candidates = this.deduplicatePresetCandidates(colKey, [typedValue, ...candidates], query);
    const sameQuery = previous?.input === input && previous.rowIdx === rowIdx &&
      previous.colKey === colKey && previous.query === query;
    // Ending IME composition while browsing must not remove pending-initial
    // matches. Refresh the list only when the actual typed query changes.
    if (sameQuery) {
      const pendingMatches = previous.candidates.filter(value =>
        this.matchesHangulPrefix(value, query, true) && !this.matchesHangulPrefix(value, query, false));
      if (pendingMatches.length) {
        const retained = previous.candidates.filter(value => candidates.includes(value) || pendingMatches.includes(value));
        candidates = this.deduplicatePresetCandidates(colKey,[...retained, ...candidates, ...pendingMatches],query);
      }
    }
    // Delayed IME/input events and cloud refreshes must not reset keyboard selection.
    if (sameQuery && candidates?.length === previous.candidates.length &&
        candidates.every((candidate, index) => this.getPresetCandidateIdentity(candidate) === this.getPresetCandidateIdentity(previous.candidates[index])) &&
        document.getElementById("cellAutocompleteMenu")) { this.updateInlineAutocompletePreview(); return; }
    const selectedValue = sameQuery ? previous.candidates[previous.selectedIndex] : null;
    const preservedIndex = sameQuery ? candidates?.findIndex(value => this.getPresetCandidateIdentity(value) === this.getPresetCandidateIdentity(selectedValue)) : -1;
    const ruleKey = this.getAutocompleteRuleKey(colKey, query);
    const registered = this.getPresetCandidates(Object.hasOwn(COLUMN_PRESETS, ruleKey) ? ruleKey : colKey);
    const preferred = registered.find(value => candidates.some(item => this.getPresetCandidateIdentity(item) === this.getPresetCandidateIdentity(value)) &&
      !(COLUMN_PRESETS[this.getAutocompleteHiddenKey(ruleKey)] || []).includes(value) &&
      !(COLUMN_PRESETS[`__columnHidden:${colKey}`] || []).some(hidden => hidden.toLowerCase() === value.toLowerCase()));
    const preferredIndex = preferred === undefined ? -1 : candidates.findIndex(item => this.getPresetCandidateIdentity(item) === this.getPresetCandidateIdentity(preferred));
    let currentValueIndex = preferCurrentValue ? candidates.findIndex(value => String(value) === query.trim()) : -1;
    if (preferCurrentValue && candidates.filter(value => String(value) === query.trim()).length > 1) {
      const row = this.getCurrentRows()[rowIdx];
      const key = row && this.getPresetCandidateFormatKey(colKey,this.makePresetCandidate(query.trim(),this.getRowAutocompleteFormatting(row,colKey)));
      const match = candidates.findIndex(value => String(value) === query.trim() && this.getPresetCandidateFormatKey(colKey,value,query) === key);
      if (match >= 0) currentValueIndex = match;
    }
    const currentWriterIndex = colKey === "writer" ? candidates.indexOf(this.normalizeWriterInput(query).trim()) : -1;
    const selectedIndex = preservedIndex >= 0 ? preservedIndex : currentValueIndex >= 0 ? currentValueIndex : currentWriterIndex >= 0 ? currentWriterIndex : preferredIndex >= 0 ? preferredIndex
      : (showTypedValue && candidates.length > 1 ? 1 : 0);
    this.closeAutocompleteMenu();
    if (!candidates || candidates.length === 0) return;

    const menu = document.createElement("div");
    menu.id = "cellAutocompleteMenu";
    menu.className = "cell-autocomplete-menu" + (colKey === "writer" ? " writer-picker-menu" : "");
    const menuDate = this.currentDate;
    const canUseMenu = () => {
      if (input.isConnected === false || this.currentDate !== menuDate ||
          document.getElementById('cellAutocompleteMenu') !== menu || this.autocompleteState?.input !== input) return false;
      // Typing/forced correction can beat the short suggestion debounce. A
      // mouse click on the old list must never commit or manage an old query.
      if (this.getCellEditorValue(input) !== query) {
        this.refreshSearchSuggestions();
        return false;
      }
      return true;
    };

    candidates.forEach((cand, idx) => {
      const itemEl = document.createElement("div");
      itemEl.className = "autocomplete-item" + (idx === selectedIndex ? " is-selected" : "");
      itemEl.setAttribute("data-index", idx);

      const textSpan = document.createElement("span");
      textSpan.className = "autocomplete-item-text";
      this.renderAutocompleteText(textSpan, colKey, cand, query, this.getCurrentRows()[rowIdx]);
      itemEl.appendChild(textSpan);

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "autocomplete-edit-button";
      editButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5M4 15l5 5"/></svg>';
      const managedColumn = ["name", "part", "prescription", "extra", "memo", "specialNote"].includes(colKey);
      editButton.title = managedColumn ? "현재 입력값의 자동완성 세부 관리" : "모든 날짜의 같은 문구 수정";
      editButton.setAttribute("aria-label", `${cand} ${managedColumn ? "자동완성 관리" : "수정"}`);
      editButton.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); });
      editButton.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        if (!canUseMenu()) return;
        if (managedColumn) this.openAutocompletePresetManager(colKey, cand, input);
        else void this.editAutocompleteValue(colKey, cand, input);
      });
      if (colKey !== "writer") itemEl.appendChild(editButton);

      if (idx === selectedIndex) {
        const hintBadge = document.createElement("span");
        hintBadge.className = "autocomplete-hint-badge";
        hintBadge.textContent = "Enter";
        itemEl.appendChild(hintBadge);
      }

      itemEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
      });

      itemEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!canUseMenu()) return;
        this._justCommittedFromAutocomplete = true;
        this.closeAutocompleteMenu();
        // Finalize on the original editor, before removing a live IME input.
        // This shares Enter's guard against a late native composition commit.
        if (!input.commitAutocompleteValue?.(cand)) {
          input.value = cand;
          const rows = this.getCurrentRows();
          if (rows[rowIdx]) {
            rows[rowIdx][colKey] = String(cand);
            this.applyAutocompleteColor(rows[rowIdx], colKey, cand, query);
            this.applyCellFormatting(cellElement, rows[rowIdx], colKey);
            this.renderColoredText(cellElement, rows[rowIdx], colKey);
          }
          this.saveDataStore();
          if (["name", "chartNo"].includes(colKey)) this.refreshNewPatientRows();
        }
        if (String(cand) === "") this.selectAutocompleteRightCell(rowIdx, colKey);
        else this.selectCell(rowIdx, colKey, cellElement, false);
        if (this.elSheetContainer) {
          this.focusSelectedCellEditor();
        }
      });

      menu.appendChild(itemEl);
    });

    document.body.appendChild(menu);

    this.autocompleteState = {
      rowIdx,
      colKey,
      cellElement,
      input,
      candidates,
      query,
      selectedIndex,
      isPresetPicker: Boolean(isPresetPicker)
    };
    this.updateInlineAutocompletePreview();

    const positionMenu = () => {
      if (!menu.isConnected || !cellElement.isConnected) return;
      const rect = cellElement.getBoundingClientRect();
      const margin = 6, gap = 4;
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
      const right = left + (viewport?.width || window.innerWidth);
      const bottom = top + (viewport?.height || window.innerHeight);
      const maxWidth = Math.max(0, right - left - margin * 2);
      const width = Math.min(colKey === "writer" ? 104 : Math.max(rect.width, 160), maxWidth);
      menu.style.minWidth = `${width}px`;
      menu.style.maxWidth = `${maxWidth}px`;
      menu.style.left = `${Math.max(left + margin, Math.min(rect.left, right - menu.offsetWidth - margin))}px`;
      const below = Math.max(0, bottom - Math.max(top, rect.bottom) - gap - margin);
      const above = Math.max(0, Math.min(bottom, rect.top) - top - gap - margin);
      // Autocomplete lists can use all available viewport space instead of scrolling
      // after 220px.
      const maxHeight = Math.max(below, above);
      menu.style.maxHeight = `${maxHeight}px`;
      const naturalHeight = menu.offsetHeight;
      const useBelow = naturalHeight <= below || below >= above;
      const available = useBelow ? below : above;
      menu.style.maxHeight = `${Math.min(maxHeight, available)}px`;
      const height = menu.offsetHeight;
      const anchorTop = useBelow ? rect.bottom + gap : rect.top - gap - height;
      menu.style.top = `${Math.max(top + margin, Math.min(anchorTop, bottom - height - margin))}px`;
    };
    positionMenu();
    if (selectedIndex > 0) this.moveAutocompleteSelection(0);

    const outsideClickListener = (e) => {
      if (!menu.contains(e.target) && e.target !== input) this.closeAutocompleteMenu();
    };
    const scrollListener = (event) => {
      if (!menu.contains(event.target)) positionMenu();
    };
    document.addEventListener("mousedown", outsideClickListener);
    window.addEventListener("resize", positionMenu);
    window.visualViewport?.addEventListener("resize", positionMenu);
    window.visualViewport?.addEventListener("scroll", positionMenu);
    document.addEventListener("scroll", scrollListener, true);
    this.autocompleteCleanup = () => {
      document.removeEventListener("mousedown", outsideClickListener);
      window.removeEventListener("resize", positionMenu);
      window.visualViewport?.removeEventListener("resize", positionMenu);
      window.visualViewport?.removeEventListener("scroll", positionMenu);
      document.removeEventListener("scroll", scrollListener, true);
    };
  }

  moveAutocompleteSelection(direction) {
    if (!this.autocompleteState) return;
    const { candidates } = this.autocompleteState;
    if (!candidates || candidates.length === 0) return;

    let nextIdx = this.autocompleteState.selectedIndex + direction;
    if (nextIdx < 0) nextIdx = candidates.length - 1;
    if (nextIdx >= candidates.length) nextIdx = 0;

    this.autocompleteState.selectedIndex = nextIdx;
    this.updateInlineAutocompletePreview();

    const menu = document.getElementById("cellAutocompleteMenu");
    if (menu) {
      const items = menu.querySelectorAll(".autocomplete-item");
      items.forEach((it, idx) => {
        const isSel = idx === nextIdx;
        it.classList.toggle("is-selected", isSel);
        let badge = it.querySelector(".autocomplete-hint-badge");
        if (isSel) {
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "autocomplete-hint-badge";
            badge.textContent = "Enter";
            it.appendChild(badge);
          }
          it.scrollIntoView({ block: "nearest" });
        } else if (badge) {
          badge.remove();
        }
      });
    }
  }

  getSelectedAutocompleteItem() {
    if (!this.autocompleteState) return null;
    const { candidates, selectedIndex } = this.autocompleteState;
    return candidates[selectedIndex] ?? candidates[0] ?? undefined;
  }

  isAutocompleteOpen() {
    return Boolean(this.autocompleteState && document.getElementById("cellAutocompleteMenu"));
  }

  closeAutocompleteMenu() {
    const input = this.autocompleteState?.input;
    this.clearInlineAutocompletePreview();
    this.autocompleteCleanup?.();
    this.autocompleteCleanup = null;
    const existing = document.getElementById("cellAutocompleteMenu");
    if (existing) {
      existing.remove();
    }
    this.autocompleteState = null;
    if (input?.nativeLanguagePreview) this.refreshNativeLanguagePreview(input);
  }

}
