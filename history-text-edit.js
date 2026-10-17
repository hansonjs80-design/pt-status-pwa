// Backed-up, conflict-checked edits to prior records and their autocomplete presets.
class PTHistoryTextEdit {
  async editAutocompleteValue(colKey, oldValue, input) {
    if (this.autocompleteRenameBusy) return;
    const throughDate = this.currentDate;
    const managerContext = this.autocompleteManagerContext;
    const formatting = this.getAutocompleteValueFormatting(colKey, oldValue, this.autocompleteManagerContext?.query || this.autocompleteState?.query);
    const edit = await this.openPresetTextColorEditor("이전 기록 문구·서식 수정", oldValue,
      formatting.color, formatting.richText, formatting.fontWeight,
      { description: `${throughDate.replace(/-/g, '.')} 및 이전 날짜의 같은 열에서 “${oldValue}”와 일치하는 셀을 수정합니다.` });
    if (!edit || !edit.value) return;
    const value = edit.value;
    this.autocompleteRenameBusy = true;
    try {
      this.showSaveIndicator('전체 날짜 기록 확인 중…');
      const count = await this.renameAutocompleteValue(colKey, oldValue, value.trim(), edit.color, edit.richText, edit.fontWeight, { throughDate });
      // A zero-match result may return after the user has started a different
      // editor during the history read. Leave that editor and its menu alive.
      if (!this.isEditingCell()) {
        if (input && input.value.trim() === oldValue.trim()) input.value = value.trim();
        input?.blur();
        this.closeAutocompleteMenu();
        this.renderTable();
      }
      this.renderQuickChips();
      this.updateSidebarStats();
      if (this.autocompleteManagerContext === managerContext && managerContext?.colKey === colKey) {
        const replacement = oldValue?._presetFormatting ? this.makePresetCandidate(value.trim(),{color:edit.color,richText:edit.richText,fontWeight:edit.fontWeight}) : value.trim();
        this.autocompleteManagerContext.items = Object.hasOwn(COLUMN_PRESETS,managerContext.key)
          ? [...this.getPresetCandidates(managerContext.key)]
          : this.autocompleteManagerContext.items.map(item => item === oldValue ? replacement : item);
        this.autocompleteManagerContext.hidden = (this.autocompleteManagerContext.hidden || []).map(item => item === this.getPresetCandidateIdentity(oldValue) ? this.getPresetCandidateIdentity(replacement) : item);
        this.setAutocompleteValueColor(this.autocompleteManagerContext.key, replacement, edit.color, edit.richText, edit.fontWeight);
        this.savePresetManagerItems(colKey);
        this.renderPresetManagerList();
      } else if (!this.autocompleteManagerContext && this.activePresetTab === colKey && this.elPresetManagerModal?.style.display === 'flex') {
        this.renderPresetManagerList();
      }
      this.showSaveIndicator(`${throughDate}까지 ${count}개 셀 수정 · 변경 전 백업 저장됨`);
    } catch (error) {
      alert("문구·서식 수정 실패: " + error.message);
    } finally { this.autocompleteRenameBusy = false; }
  }

  async renameAutocompleteValue(colKey, oldValue, newValue, color = undefined, richText = undefined, fontWeight = undefined, { throughDate = this.currentDate } = {}) {
    await this.syncBaselinesReady;
    const allowed = ["name", "chartNo", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    if (!allowed.includes(colKey) || !newValue.trim()) throw new Error("수정할 문구를 입력하세요.");
    const client = this.supabaseClient;
    if (client) {
      if (this.searchHistoryRequest) await this.searchHistoryRequest;
      if (!await this.loadSearchHistory(true, { allDates: true }) || this.supabaseClient !== client) {
        const reason = this.supabaseClient !== client ? '클라우드 연결이 변경되었습니다.'
          : this.searchHistoryLoadError?.message || '클라우드에 연결할 수 없습니다.';
        throw new Error(`전체 날짜 기록 확인 실패: ${reason}\n기록은 변경하지 않았습니다. 잠시 후 ‘이전 기록 수정’을 다시 눌러 주세요.`);
      }
    }
    const oldText = String(oldValue).trim(), replacement = colKey === "writer" ? this.normalizeWriterInput(newValue.trim()) : newValue.trim();
    const sourceFormatKey = oldValue?._presetFormatting ? this.getPresetCandidateFormatKey(colKey,oldValue) : null;
    // Keep the existing bulk-edit contract: all exact text matches through the
    // selected date change. Candidate variants remain independently configured.
    const matchesRow = row => String(row?.[colKey] ?? '').trim() === oldText;
    if (oldText === replacement && color === undefined && richText === undefined && fontWeight === undefined) return 0;
    // Rebase even pending/current dates once. Read-only merging shares unchanged
    // rows; only dates containing a match need a deep copy below.
    const source = this.getSearchDataStore({ rebasePending: true });
    const changed = {}, baselines = new Map(this.syncBaselines || []);
    let count = 0;
    for (const [date, rows] of Object.entries(source)) {
      if (date > throughDate || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!Array.isArray(rows)) continue;
      if (!rows.some(matchesRow)) continue;
      const copy = JSON.parse(JSON.stringify(rows));
      for (const row of copy) {
        if (!row || !matchesRow(row)) continue;
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
        this.applyAutocompleteWeight(row, colKey, fontWeight);
        count++;
      }
      changed[date] = copy;
      if (Array.isArray(this.cloudSearchHistory?.[date]) || !baselines.has(date)) {
        // The new intent is relative to the fresh server data, not an older
        // baseline whose value may happen to equal the requested replacement.
        baselines.set(date, JSON.parse(JSON.stringify(this.cloudSearchHistory?.[date] || rows)));
      }
    }
    const presets = JSON.parse(JSON.stringify(COLUMN_PRESETS));
    let presetChanged = false;
    const scopes = new Set([colKey]);
    for (const [key, values] of Object.entries(presets)) {
      if (!Array.isArray(values) || !(key === colKey || key.startsWith(`__query:${colKey}:`) ||
          key.startsWith(`__hidden:${colKey}:`) || key === `__columnHidden:${colKey}`)) continue;
      const candidateList = key === colKey || key.startsWith(`__query:${colKey}:`);
      if (!candidateList) {
        const oldKey = sourceFormatKey ? this.getPresetCandidateIdentity(oldValue) : oldText;
        const nextKey = sourceFormatKey ? this.getPresetCandidateIdentity(this.makePresetCandidate(replacement,{color,richText,fontWeight})) : replacement;
        if (values.includes(oldKey)) { presets[key] = [...new Set(values.map(value => value === oldKey ? nextKey : value))]; presetChanged = true; }
        continue;
      }
      const entries = this.getPresetCandidates(key), formatKey = this.getPresetCandidateFormatsKey(key);
      const formats = [...(presets[formatKey] || Array(values.length).fill(''))];
      let changedList = false;
      for (let i = 0; i < values.length; i++) {
        if (String(values[i]).trim() !== oldText || (sourceFormatKey && this.getPresetCandidateFormatKey(colKey,entries[i],key.startsWith('__query:') ? key.slice(`__query:${colKey}:`.length) : null) !== sourceFormatKey)) continue;
        values[i] = replacement; changedList = true;
        if (entries[i]?._presetFormatting || sourceFormatKey) {
          const before = this.getAutocompleteValueFormatting(colKey,entries[i]);
          formats[i] = JSON.stringify({value:replacement,formatting:{color:color === undefined ? before.color : color,
            richText:richText === undefined ? (oldText === replacement ? before.richText : null) : richText,
            fontWeight:fontWeight === undefined ? before.fontWeight : fontWeight}});
        }
      }
      if (!changedList) continue;
      if (formats.some(Boolean)) presets[formatKey] = formats;
      else presets[key] = [...new Set(values)];
      presetChanged = true;
      if (key.startsWith('__query:')) scopes.add(key);
    }
    if (!sourceFormatKey) {
      if (color !== undefined) presets[this.getAutocompleteColorKey(colKey, replacement)] = [color || ""];
      if (richText !== undefined || color !== undefined) {
        const key = this.getAutocompleteRichKey(colKey, replacement);
        if (richText?.text === replacement && richText.colors?.length === replacement.length) presets[key] = richText.colors.map(color => color || '');
        else delete presets[key];
      }
      this.writeAutocompleteWeight(presets, colKey, replacement, fontWeight, richText);
      this.writeAutocompleteRichStyles(presets, colKey, replacement, richText);
      for (const scope of scopes) {
        if (scope === colKey) continue;
        if (color !== undefined) presets[this.getAutocompleteColorKey(scope, replacement)] = [color || ''];
        if (richText !== undefined || color !== undefined) {
          const key = this.getAutocompleteRichKey(scope, replacement);
          if (richText?.text === replacement && richText.colors?.length === replacement.length) presets[key] = richText.colors.map(color => color || '');
          else delete presets[key];
        }
        this.writeAutocompleteWeight(presets, scope, replacement, fontWeight, richText);
        this.writeAutocompleteRichStyles(presets, scope, replacement, richText);
      }
    }
    if (!count && !presetChanged) return 0;

    // This backup covers records and presets only; no schema/Auth/Storage changes occur.
    const originalRecords = JSON.stringify(this.dataStore);
    const originalPresets = JSON.stringify(COLUMN_PRESETS);
    const originalBaselines = JSON.stringify(Object.fromEntries(this.syncBaselines || []));
    let recordRevision, baselineRevision;
    const assertUnchanged = () => {
      if (this.supabaseClient !== client ||
          (recordRevision !== undefined && this._recordPersistenceRevision !== recordRevision) ||
          (baselineRevision !== undefined && this._baselinePersistenceRevision !== baselineRevision) ||
          JSON.stringify(this.dataStore) !== originalRecords ||
          JSON.stringify(COLUMN_PRESETS) !== originalPresets ||
          JSON.stringify(Object.fromEntries(this.syncBaselines || [])) !== originalBaselines ||
          (typeof document !== 'undefined' && this.isEditingCell())) {
        throw new Error('작업 중 기록이나 설정이 변경되어 일괄 수정을 중단했습니다. 최신 입력은 유지됩니다. 입력을 마친 뒤 다시 시도해 주세요.');
      }
    };
    const backup = JSON.stringify({ createdAt: new Date().toISOString(), column: colKey,
      oldValue: oldText, newValue: replacement, throughDate, color, richText, fontWeight, dataStore: this.dataStore,
      cloudSearchHistory: this.cloudSearchHistory || {}, presets: COLUMN_PRESETS,
      syncBaselines: Object.fromEntries(this.syncBaselines || []) });
    const backupKey = `PT_TEXT_EDIT_BACKUP_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await this.persistTextEditBackup(backupKey, backup);
    assertUnchanged();

    const nextStore = { ...this.dataStore, ...changed };
    // Never publish a retry queue for records that failed to persist (e.g. quota).
    let pending;
    try {
      const baselineWrite = this.persistSyncBaselines(baselines);
      baselineRevision = this._baselinePersistenceRevision;
      await baselineWrite;
      assertUnchanged();
      const recordWrite = this.persistDataStore(nextStore);
      recordRevision = this._recordPersistenceRevision;
      await recordWrite;
      assertUnchanged();
      pending = new Set([...(this.pendingSyncDates || []), ...Object.keys(changed)]);
      localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...pending]));
    } catch (error) {
      // A slow disk write can finish after another cell/save has changed the
      // live data. Restore the latest live snapshots on disk before returning;
      // never publish the stale plan or a retry queue for an aborted edit.
      try {
        await this.persistSyncBaselines();
        await this.persistDataStore();
      } catch (restoreError) {
        error.message += `\n최신 기록 저장을 다시 확인해 주세요: ${restoreError.message}`;
      }
      throw error;
    }
    this.dataStore = nextStore;
    this.invalidateAutocompleteHistory();
    this.syncBaselines = baselines;
    this.pendingSyncDates = pending;
    for (const date of Object.keys(changed)) {
      this.cloudSearchHistory ||= {};
      this.cloudSearchHistory[date] = JSON.parse(JSON.stringify(changed[date]));
      this.editHistory?.delete(date);
      this.scheduleSupabaseSync(date, false);
    }
    if (presetChanged || color !== undefined || richText !== undefined || fontWeight !== undefined) { COLUMN_PRESETS = presets; saveColumnPresets(COLUMN_PRESETS); }
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
}
