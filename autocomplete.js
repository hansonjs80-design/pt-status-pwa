// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTAutocomplete {
  getAutocompleteSuggestions(colKey, rawQuery, isComposing = false) {
    if (!rawQuery) return [];
    const query = String(rawQuery).trim().toLowerCase();
    if (!query) return [];

    const columnHidden = new Set((COLUMN_PRESETS[`__columnHidden:${colKey}`] || []).map(value => value.trim().toLowerCase()));
    const ruleKey = this.getAutocompleteRuleKey(colKey, rawQuery);
    if (Object.hasOwn(COLUMN_PRESETS, ruleKey)) {
      const hidden = COLUMN_PRESETS[this.getAutocompleteHiddenKey(ruleKey)] || [];
      const values = COLUMN_PRESETS[ruleKey].filter(value => !hidden.includes(value) && !columnHidden.has(value.trim().toLowerCase()));
      if (["part", "chartNo"].includes(colKey)) {
        const typed = this.assembleHangul(rawQuery).trim();
        return [typed, ...values.filter(value => value !== typed)];
      }
      return values;
    }
    const presets = COLUMN_PRESETS[colKey] ? [...COLUMN_PRESETS[colKey]] : [];
    const presetSet = new Set(presets.map((p) => p.toLowerCase()));

    // 현재 날짜뿐 아니라 저장된 모든 날짜의 같은 열에서 후보를 수집한다.
    // 현재 날짜, 최근 날짜 순으로 수집하되 같은 값은 한 번만 표시한다.
    const searchStore = this.getSearchDataStore();
    const dateKeys = [this.currentDate, ...Object.keys(searchStore)
      .filter(date => date !== this.currentDate).sort().reverse()];
    const existingValues = new Set();
    const seenValues = new Set(presetSet);
    for (const dateKey of dateKeys) {
      const rows = searchStore[dateKey];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const value = String(row?.[colKey] ?? "").trim();
        const normalized = value.toLowerCase();
        if (!value || seenValues.has(normalized)) continue;
        seenValues.add(normalized);
        existingValues.add(value);
      }
    }

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
      if (itemLower === query && !isPreset) return;

      // 부위·성함·추가 사항·메모·특이 사항은 앞부분만 매칭한다.
      // 매칭 품질: 1=접두사, 2=초성접두사, 3=부분일치
      // 일치하는 관리 문구는 목록에 저장된 순서 그대로 우선 표시한다.
      let quality = -1;
      if (isPreset && item === "") { matched.push({ item, score: 0, isPreset }); return; }

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

    return results;
  }

  showAutocompleteMenu(rowIdx, colKey, cellElement, input, candidates, { includeTypedValue = true } = {}) {
    const previous = this.autocompleteState;
    const query = input.value;
    input.dataset.autocompleteQuery = query;
    const typedValue = this.assembleHangul(query).trim();
    const showTypedValue = includeTypedValue && ["name", "part", "extra", "memo", "specialNote"].includes(colKey) && Boolean(typedValue);
    if (showTypedValue) candidates = [typedValue, ...candidates.filter(value => value.toLowerCase() !== typedValue.toLowerCase())];
    const sameQuery = previous?.input === input && previous.rowIdx === rowIdx &&
      previous.colKey === colKey && previous.query === query;
    // Ending IME composition while browsing must not remove pending-initial
    // matches. Refresh the list only when the actual typed query changes.
    if (sameQuery) {
      const pendingMatches = previous.candidates.filter(value =>
        this.matchesHangulPrefix(value, query, true) && !this.matchesHangulPrefix(value, query, false));
      if (pendingMatches.length) {
        const retained = previous.candidates.filter(value => candidates.includes(value) || pendingMatches.includes(value));
        candidates = [...new Set([...retained, ...candidates, ...pendingMatches])];
      }
    }
    // Delayed IME/input events and cloud refreshes must not reset keyboard selection.
    if (sameQuery && candidates?.length === previous.candidates.length &&
        candidates.every((candidate, index) => candidate === previous.candidates[index]) &&
        document.getElementById("cellAutocompleteMenu")) { this.updateInlineAutocompletePreview(); return; }
    const selectedValue = sameQuery ? previous.candidates[previous.selectedIndex] : null;
    const preservedIndex = sameQuery ? candidates?.indexOf(selectedValue) : -1;
    const ruleKey = this.getAutocompleteRuleKey(colKey, query);
    const registered = COLUMN_PRESETS[ruleKey] || COLUMN_PRESETS[colKey] || [];
    const preferred = registered.find(value => candidates.includes(value) &&
      !(COLUMN_PRESETS[this.getAutocompleteHiddenKey(ruleKey)] || []).includes(value) &&
      !(COLUMN_PRESETS[`__columnHidden:${colKey}`] || []).some(hidden => hidden.toLowerCase() === value.toLowerCase()));
    const preferredIndex = preferred === undefined ? -1 : candidates.indexOf(preferred);
    const currentWriterIndex = colKey === "writer" ? candidates.indexOf(this.normalizeWriterInput(query).trim()) : -1;
    const selectedIndex = preservedIndex >= 0 ? preservedIndex : currentWriterIndex >= 0 ? currentWriterIndex : preferredIndex >= 0 ? preferredIndex
      : (showTypedValue && candidates.length > 1 ? 1 : 0);
    this.closeAutocompleteMenu();
    if (!candidates || candidates.length === 0) return;

    const menu = document.createElement("div");
    menu.id = "cellAutocompleteMenu";
    menu.className = "cell-autocomplete-menu" + (colKey === "writer" ? " writer-picker-menu" : "");

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
        input.value = cand;
        this._justCommittedFromAutocomplete = true;
        this.closeAutocompleteMenu();
        const rows = this.getCurrentRows();
        if (rows[rowIdx]) {
          rows[rowIdx][colKey] = cand;
          this.applyAutocompleteColor(rows[rowIdx], colKey, cand, query);
          this.applyCellFormatting(cellElement, rows[rowIdx], colKey);
          this.renderColoredText(cellElement, rows[rowIdx], colKey);
        }
        this.saveDataStore();
        if (["name", "chartNo"].includes(colKey)) this.refreshNewPatientRows();
        if (cand === "") this.selectAutocompleteRightCell(rowIdx, colKey);
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
      selectedIndex
    };
    this.updateInlineAutocompletePreview();

    const positionMenu = () => {
      if (!menu.isConnected || !cellElement.isConnected) return;
      const rect = cellElement.getBoundingClientRect();
      const margin = 6, gap = 4;
      const width = Math.min(colKey === "writer" ? 104 : Math.max(rect.width, 160), window.innerWidth - margin * 2);
      menu.style.minWidth = `${width}px`;
      menu.style.maxWidth = `${window.innerWidth - margin * 2}px`;
      menu.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - menu.offsetWidth - margin))}px`;
      menu.style.maxHeight = "220px";
      const naturalHeight = menu.offsetHeight;
      const below = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
      const above = Math.max(0, rect.top - gap - margin);
      const useBelow = naturalHeight <= below || below >= above;
      const available = useBelow ? below : above;
      menu.style.maxHeight = `${Math.min(220, available)}px`;
      const height = menu.offsetHeight;
      menu.style.top = `${useBelow ? rect.bottom + gap : rect.top - gap - height}px`;
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
    document.addEventListener("scroll", scrollListener, true);
    this.autocompleteCleanup = () => {
      document.removeEventListener("mousedown", outsideClickListener);
      window.removeEventListener("resize", positionMenu);
      document.removeEventListener("scroll", scrollListener, true);
    };
  }

  async editAutocompleteValue(colKey, oldValue, input) {
    if (this.autocompleteRenameBusy) return;
    const formatting = this.getAutocompleteValueFormatting(colKey, oldValue, this.autocompleteManagerContext?.query || this.autocompleteState?.query);
    const edit = await this.openPresetTextColorEditor("이전 기록 문구·글자색 수정", oldValue,
      formatting.color, formatting.richText);
    if (!edit || !edit.value) return;
    const value = edit.value;
    this.autocompleteRenameBusy = true;
    try {
      const count = await this.renameAutocompleteValue(colKey, oldValue, value.trim(), edit.color, edit.richText);
      // Do not let the existing editor restore the old text on blur.
      if (input && input.value.trim() === oldValue.trim()) input.value = value.trim();
      input?.blur();
      this.closeAutocompleteMenu();
      this.renderTable();
      this.renderQuickChips();
      this.updateSidebarStats();
      if (this.autocompleteManagerContext?.colKey === colKey) {
        this.autocompleteManagerContext.items = this.autocompleteManagerContext.items.map(item => item === oldValue ? value.trim() : item);
        this.autocompleteManagerContext.hidden = (this.autocompleteManagerContext.hidden || []).map(item => item === oldValue ? value.trim() : item);
        this.setAutocompleteValueColor(this.autocompleteManagerContext.key, value.trim(), edit.color, edit.richText);
        this.savePresetManagerItems(colKey);
        this.renderPresetManagerList();
      }
      this.showSaveIndicator(`${count}개 셀 문구·글자색 수정 · 변경 전 백업 저장됨`);
    } catch (error) {
      alert("문구·글자색 수정 실패: " + error.message);
    } finally { this.autocompleteRenameBusy = false; }
  }

  async renameAutocompleteValue(colKey, oldValue, newValue, color = undefined, richText = undefined) {
    await this.syncBaselinesReady;
    const allowed = ["name", "chartNo", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    if (!allowed.includes(colKey) || !newValue.trim()) throw new Error("수정할 문구를 입력하세요.");
    const client = this.supabaseClient;
    if (client) {
      if (this.searchHistoryRequest) await this.searchHistoryRequest;
      if (!await this.loadSearchHistory(true) || this.supabaseClient !== client) {
        throw new Error("모든 날짜의 기록을 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요.");
      }
    }
    const oldText = String(oldValue).trim(), replacement = colKey === "writer" ? this.normalizeWriterInput(newValue.trim()) : newValue.trim();
    if (oldText === replacement && color === undefined && richText === undefined) return 0;
    const source = this.getSearchDataStore();
    const changed = {}, baselines = new Map(this.syncBaselines || []);
    let count = 0;
    for (const [date, rows] of Object.entries(source)) {
      if (!Array.isArray(rows)) continue;
      if (!rows.some(row => String(row?.[colKey] ?? "").trim() === oldText)) continue;
      const copy = JSON.parse(JSON.stringify(rows));
      for (const row of copy) {
        if (!row || String(row[colKey] ?? "").trim() !== oldText) continue;
        row[colKey] = replacement;
        if (row._richText) delete row._richText[colKey];
        if (color !== undefined) {
          row._textColors ||= {};
          if (color) row._textColors[colKey] = color; else delete row._textColors[colKey];
          this.markCellFormatting(row, colKey, "color");
        }
        if (richText?.text === replacement && richText.colors?.length === replacement.length) {
          row._richText ||= {};
          row._richText[colKey] = JSON.parse(JSON.stringify(richText));
          this.markCellFormatting(row, colKey, 'color');
        }
        count++;
      }
      changed[date] = copy;
      if (!Object.hasOwn(this.dataStore, date) || !baselines.has(date)) {
        baselines.set(date, JSON.parse(JSON.stringify(this.cloudSearchHistory?.[date] || rows)));
      }
    }
    const presets = JSON.parse(JSON.stringify(COLUMN_PRESETS));
    const presetChanged = (presets[colKey] || []).some(value => String(value).trim() === oldText);
    if (presetChanged) presets[colKey] = [...new Set(presets[colKey].map(value => String(value).trim() === oldText ? replacement : value))];
    if (color !== undefined) presets[this.getAutocompleteColorKey(colKey, replacement)] = [color || ""];
    if (richText !== undefined || color !== undefined) {
      const key = this.getAutocompleteRichKey(colKey, replacement);
      if (richText?.text === replacement && richText.colors?.length === replacement.length) presets[key] = richText.colors.map(color => color || '');
      else delete presets[key];
    }
    if (!count && !presetChanged) return 0;

    // This backup covers records and presets only; no schema/Auth/Storage changes occur.
    const backup = JSON.stringify({ createdAt: new Date().toISOString(), column: colKey,
      oldValue: oldText, newValue: replacement, color, richText, dataStore: this.dataStore,
      cloudSearchHistory: this.cloudSearchHistory || {}, presets: COLUMN_PRESETS,
      syncBaselines: Object.fromEntries(this.syncBaselines || []) });
    const backupKey = `PT_TEXT_EDIT_BACKUP_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await this.persistTextEditBackup(backupKey, backup);

    const nextStore = { ...this.dataStore, ...changed };
    const pending = new Set([...(this.pendingSyncDates || []), ...Object.keys(changed)]);
    // Never publish a retry queue for records that failed to persist (e.g. quota).
    await this.persistSyncBaselines(baselines);
    await this.persistDataStore(nextStore);
    localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...pending]));
    this.dataStore = nextStore;
    this.syncBaselines = baselines;
    this.pendingSyncDates = pending;
    for (const date of Object.keys(changed)) {
      this.cloudSearchHistory ||= {};
      this.cloudSearchHistory[date] = JSON.parse(JSON.stringify(changed[date]));
      this.editHistory?.delete(date);
      this.scheduleSupabaseSync(date, false);
    }
    if (presetChanged || color !== undefined || richText !== undefined) { COLUMN_PRESETS = presets; saveColumnPresets(COLUMN_PRESETS); }
    return count;
  }

  async migrateTextEditBackups(store) {
    const keys = Array.from({ length: localStorage.length || 0 }, (_, idx) => localStorage.key(idx))
      .filter(key => key?.startsWith("PT_TEXT_EDIT_BACKUP_"));
    for (const key of keys) {
      const backup = localStorage.getItem(key);
      JSON.parse(backup);
      await store(key, backup);
      if (await store(key) !== backup) throw new Error("기존 문구 백업 이전 검증에 실패했습니다.");
      // Release the small settings store only after the complete backup is verified.
      localStorage.removeItem(key);
    }
  }

  async persistTextEditBackup(key, backup) {
    const tools = window.ptLocalTools;
    if (tools?.store) {
      const store = tools.store.bind(tools);
      await this.migrateTextEditBackups(store);
      await store(key, backup);
      if (await store(key) !== backup) throw new Error("변경 전 백업 검증에 실패했습니다.");
    } else {
      localStorage.setItem(key, backup);
      if (localStorage.getItem(key) !== backup) throw new Error("변경 전 백업 검증에 실패했습니다.");
    }
    JSON.parse(backup);
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
    this.clearInlineAutocompletePreview();
    this.autocompleteCleanup?.();
    this.autocompleteCleanup = null;
    const existing = document.getElementById("cellAutocompleteMenu");
    if (existing) {
      existing.remove();
    }
    this.autocompleteState = null;
  }

}
