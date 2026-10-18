// Column/global correction rules share the existing preset persistence and sync.
class PTForcedCorrections {
  getForcedCorrectionColumns() {
    return {no:'No.', gender:'성별', chartNo:'차트번호', name:'성함', part:'부위', prescription:'처방',
      extra:'추가 사항', writer:'작성', memo:'메모', specialNote:'특이 사항', visitTime:'방문 시간'};
  }

  isForcedCorrectionScope(scope) {
    const columns = this.getForcedCorrectionColumns();
    return scope === '*' || Object.hasOwn(columns, scope) ||
      (typeof scope === 'string' && scope.startsWith('!') && Object.hasOwn(columns, scope.slice(1)));
  }

  getForcedCorrectionKey(scope, source = '') {
    return `__autocorrect:${scope}:${encodeURIComponent(source)}`;
  }

  invertForcedCorrectionCase(source) {
    return source.replace(/[a-zA-Z]/g, letter => letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase());
  }

  getForcedCorrectionVariants(rule) {
    const inverse = this.invertForcedCorrectionCase(rule.source);
    return inverse !== rule.source && inverse !== rule.target ? [rule.source, inverse] : [rule.source];
  }

  getGroupedForcedCorrectionRules() {
    const rules = this.getForcedCorrectionRules();
    const byKey = new Map(rules.map(rule => [this.getForcedCorrectionKey(rule.scope, rule.source), rule]));
    const seen = new Set(), groups = [];
    for (const rule of rules) {
      const key = this.getForcedCorrectionKey(rule.scope, rule.source);
      if (seen.has(key)) continue;
      seen.add(key);
      const inverse = this.invertForcedCorrectionCase(rule.source);
      const otherKey = this.getForcedCorrectionKey(rule.scope, inverse);
      const other = byKey.get(otherKey);
      const storedSources = [rule.source];
      if (inverse !== rule.source && other?.target === rule.target) { seen.add(otherKey); storedSources.push(inverse); }
      // An explicitly different result remains a separate, editable rule.
      const variants = this.getForcedCorrectionVariants(rule).filter(source => source === rule.source || !other || other.target === rule.target);
      groups.push({ ...rule, variants, storedSources });
    }
    return groups;
  }

  getForcedCorrectionRules(scope) {
    const prefix = '__autocorrect:';
    const rules = [];
    for (const [key, values] of Object.entries(COLUMN_PRESETS)) {
      if (!key.startsWith(prefix) || !Array.isArray(values) || typeof values[0] !== 'string') continue;
      try {
        const separator = key.indexOf(':', prefix.length);
        if (separator < 0) continue;
        const savedScope = key.slice(prefix.length, separator);
        if (!this.isForcedCorrectionScope(savedScope) || (scope !== undefined && savedScope !== scope)) continue;
        const source = decodeURIComponent(key.slice(separator + 1));
        const target = values[0];
        if (source && target && source !== target) rules.push({scope:savedScope, source, target});
      } catch (_) { /* Ignore malformed imported keys without changing saved settings. */ }
    }
    return rules;
  }

  setForcedCorrection(scope, source, target, previous = null, mergedRules = []) {
    source = String(source ?? '').normalize('NFC');
    target = String(target ?? '').normalize('NFC');
    if (!this.isForcedCorrectionScope(scope) ||
        !source.trim() || !target.trim() || source === target) return false;
    const presets = { ...COLUMN_PRESETS };
    for (const rule of [previous, ...mergedRules].filter(Boolean)) {
      for (const oldSource of rule.storedSources || [rule.source]) delete presets[this.getForcedCorrectionKey(rule.scope, oldSource)];
    }
    // String arrays retain compatibility with existing backup and cloud records.
    presets[this.getForcedCorrectionKey(scope, source)] = [target];
    // Publish only after storage accepts the edit. The editor reports failures
    // instead of clearing the draft and silently claiming the rule was saved.
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    COLUMN_PRESETS = presets;
    this.forcedCorrectionMatchCache = null;
    try { window.ptApp?.schedulePresetSync(); } catch (_) { /* Local save succeeded; dirty presets retry through live sync. */ }
    return true;
  }

  saveForcedCorrectionRule(scope, source, target, previous = null) {
    source = String(source ?? '').normalize('NFC');
    target = String(target ?? '').normalize('NFC');
    if (!this.isForcedCorrectionScope(scope) || !source.trim() || !target.trim() || source === target) {
      return { saved: false, message: '입력 문구와 변경 문구를 서로 다르게 입력해 주세요.' };
    }
    const previousSources = previous?.storedSources || (previous ? [previous.source] : []);
    const matches = this.getGroupedForcedCorrectionRules().filter(rule => rule.scope === scope &&
      !(previous?.scope === scope && rule.storedSources.some(value => previousSources.includes(value))) &&
      rule.variants.includes(source));
    if (matches.some(rule => rule.target !== target)) {
      return { saved: false, message: '같은 적용 열에 다른 변경 문구로 이미 등록된 입력 문구입니다. 기존 규칙을 확인해 주세요.' };
    }
    const saved = this.setForcedCorrection(scope, source, target, previous, matches);
    return { saved, merged: matches.length };
  }

  deleteForcedCorrection(scope, source, sources = [source]) {
    for (const oldSource of sources) delete COLUMN_PRESETS[this.getForcedCorrectionKey(scope, oldSource)];
    this.forcedCorrectionMatchCache = null;
    saveColumnPresets(COLUMN_PRESETS);
  }

  getApplicableForcedCorrectionRules(colKey) {
    if (this.forcedCorrectionMatchCache?.presets !== COLUMN_PRESETS) {
      this.forcedCorrectionMatchCache = {presets: COLUMN_PRESETS, columns: new Map()};
    }
    const cache = this.forcedCorrectionMatchCache.columns;
    if (!cache.has(colKey)) {
      // Decode and order shared rules once per column, not on every input.
      // Local edits invalidate above; cloud restore replaces the presets object.
      const all = this.getForcedCorrectionRules();
      const expand = scoped => {
        const explicit = new Map(scoped.map(rule => [rule.source, rule]));
        const result = new Map(explicit);
        for (const rule of scoped) for (const source of this.getForcedCorrectionVariants(rule)) {
          if (!explicit.has(source)) result.set(source, { ...rule, source });
        }
        return result;
      };
      const rules = expand(all.filter(rule => rule.scope === '*'));
      const excludedScopes = new Set(all.filter(rule => rule.scope.startsWith('!') && rule.scope.slice(1) !== colKey).map(rule => rule.scope));
      for (const scope of excludedScopes) for (const [source, rule] of expand(all.filter(rule => rule.scope === scope))) rules.set(source, rule);
      for (const [source, rule] of expand(all.filter(rule => rule.scope === colKey))) rules.set(source, rule);
      cache.set(colKey, [...rules.values()].sort((a, b) => b.source.length - a.source.length));
    }
    return cache.get(colKey);
  }

  findForcedCorrection(value, colKey, caret = value.length, {foldCase = false} = {}) {
    let matched = null;
    for (const rule of this.getApplicableForcedCorrectionRules(colKey)) {
      if (matched && rule.source.length < matched.source.length) break;
      const start = caret - rule.source.length;
      if (start < 0) continue;
      const entered = value.slice(start, caret);
      if (foldCase ? entered.toLowerCase() !== rule.source.toLowerCase() : entered !== rule.source) continue;
      // Numbers can directly precede a letter rule (3qns → 3분). Keep numeric
      // rules intact (210 must not match 10), and let longer phrases win.
      const afterNumber = start > 0 && /\p{Nd}/u.test(value[start - 1]) && /^[\p{L}\p{M}]/u.test(rule.source);
      if (start && !afterNumber && !/^\s/.test(rule.source) && !/[\s\p{P}\p{S}]/u.test(value[start - 1])) continue;
      if (caret < value.length && !/\s$/.test(rule.source) && !/[\s\p{P}\p{S}]/u.test(value[caret])) continue;
      const result = {...rule, prefix: value.slice(0, start), suffix: value.slice(caret),
        value: value.slice(0, start) + rule.target + value.slice(caret), caret: start + rule.target.length};
      if (!foldCase) return result;
      // Case fallback is only for whitespace typed after a replacement. Never
      // guess when explicit case variants have different replacement targets.
      if (matched && matched.target !== result.target) return null;
      matched = result;
    }
    return matched;
  }

  updateForcedCorrection(input, colKey, {commit = false, nativeData = null, deleting = false} = {}) {
    const previous = input._forcedCorrectionProjection;
    const continuation = input._forcedCorrectionContinuation;
    delete input._forcedCorrectionContinuation;
    const value = previous?.nativeKorean ? input.value : this.getCellEditorBaseValue(input);
    const range = input._nativeCellComposition;
    const caret = !this.usesNativeCellInput() && input._inputLanguage === 'eng' && typeof range?.data === 'string'
      ? range.prefix.length + this.convertHangulToEng(range.data).length : (input.selectionStart ?? value.length);
    let correction = null;
    // Preserve an already-corrected prefix if the same native syllable grows.
    if (previous && !deleting) {
      const decompose = text => Array.from(text, char => this.getCompletionJamo(char).join('')).join('');
      const raw = decompose(value), prefix = decompose(previous.prefix + previous.source), suffix = decompose(previous.suffix);
      if (raw.startsWith(prefix) && raw.endsWith(suffix) && raw.length >= prefix.length + suffix.length) {
        const remaining = this.assembleHangul(raw.slice(prefix.length, suffix ? -suffix.length : undefined));
        const rest = previous.koreanToEnglish ? this.convertHangulToEng(remaining)
          : previous.englishToKorean ? this.convertEngToHangul(remaining) : remaining;
        correction = {...previous, value: previous.prefix + previous.target + rest + previous.suffix,
          caret: previous.prefix.length + previous.target.length + rest.length};
        if (/\s$/u.test(rest)) {
          const next = this.findForcedCorrection(correction.value, colKey, correction.caret) ||
            this.findForcedCorrection(correction.value, colKey, correction.caret, {foldCase:true});
          if (next) {
            // Consume the new trigger into the native-to-visible mapping. A
            // final/replayed IME event must not apply that trigger again.
            const rawCaret = value.length - previous.suffix.length;
            correction = {...correction, prefix:'', source:value.slice(0, rawCaret), suffix:value.slice(rawCaret),
              target:next.value.slice(0, next.caret), value:next.value, caret:next.caret};
          }
        }
      }
    }
    if (!correction && !deleting && (input.selectionStart === input.selectionEnd || commit)) {
      correction = this.findForcedCorrection(value, colKey, caret);
      if (!correction && continuation && caret > continuation.caret &&
          value.slice(0, continuation.caret) === continuation.value.slice(0, continuation.caret) &&
          value.slice(caret) === continuation.value.slice(continuation.caret) &&
          /^\s+$/u.test(value.slice(continuation.caret, caret))) {
        correction = this.findForcedCorrection(value, colKey, caret, {foldCase:true});
      }
    }
    delete input._forcedCorrectionProjection;
    if (!correction) return false;
    input._forcedCorrectionApplied = true;
    input._forcedCorrectionContinuation = {value:correction.value, caret:correction.caret};
    if (/^\s|\s$/.test(correction.target)) input._preserveBoundaryWhitespace = true;
    if (!previous) {
      const hangul = /[가-힣ㄱ-ㅎㅏ-ㅣ\u1100-\u11ff]/u;
      correction.koreanToEnglish = hangul.test(correction.source) && !hangul.test(correction.target) && /[a-z]/i.test(correction.target);
      correction.englishToKorean = !hangul.test(correction.source) && /[a-z]/i.test(correction.source) && hangul.test(correction.target);
      const changingLanguage = correction.koreanToEnglish || correction.englishToKorean;
      const nativeKorean = this.usesNativeCellInput() ? hangul.test(correction.source) : input._inputLanguage !== 'eng';
      correction.nativeKorean = changingLanguage && nativeKorean && input.dataset.nativeComposing === 'true';
      correction.nativeEnglish = changingLanguage && !nativeKorean && input.dataset.nativeComposing === 'true';
    }
    if (correction.koreanToEnglish || correction.englishToKorean) {
      if (!this.usesNativeCellInput()) input._inputLanguage = this._cellInputLanguage = correction.koreanToEnglish ? 'eng' : 'kor';
      this.clearKoreanKeyBuffer(input);
    }
    if (correction.englishToKorean) input._forcedCorrectionPrefix = correction.prefix + correction.target;
    if (!commit && input.dataset.nativeComposing === 'true') {
      // Project the corrected text; leave the live OS composition untouched.
      input._forcedCorrectionProjection = correction;
    } else {
      input.value = correction.value;
      input.setSelectionRange(correction.caret, correction.caret);
      this.clearKoreanKeyBuffer(input);
      this.rememberCellKeyValue(input, nativeData);
    }
    return true;
  }

  handleForcedCorrectionDelete(event, input) {
    const correction = input._forcedCorrectionProjection;
    const key = event.code || event.key;
    if (!correction || event.ctrlKey || event.metaKey || event.altKey || !['Backspace', 'Delete'].includes(key)) return false;
    event.preventDefault(); event.stopPropagation?.();
    const {value, caret} = correction;
    const start = key === 'Backspace' ? caret - (Array.from(value.slice(0, caret)).at(-1)?.length || 0) : caret;
    const end = key === 'Delete' ? caret + (Array.from(value.slice(caret))[0]?.length || 0) : caret;
    const nativeData = input._nativeCellComposition?.data ?? null;
    input.value = value.slice(0, start) + value.slice(end);
    input.setSelectionRange(start, start);
    delete input._forcedCorrectionProjection;
    delete input._nativeCellComposition;
    input.dataset.nativeComposing = input.dataset.composing = 'false';
    this.clearKoreanKeyBuffer(input);
    this.rememberCellKeyValue(input, nativeData);
    input.dispatchEvent(new Event('input', {bubbles:true}));
    return true;
  }

  openForcedCorrectionManager() {
    const modal = document.getElementById('forcedCorrectionModal');
    if (!modal) return;
    if (typeof document !== 'undefined' && document.activeElement && !modal.contains(document.activeElement)) {
      this._forcedCorrectionPreviousFocus = document.activeElement;
    }
    clearTimeout(this.presetManagerFocusTimer);
    modal.style.display = 'flex';
    this.updateForcedCorrectionManager();
    if (this.elPresetManagerModal) this.elPresetManagerModal.inert = true;
    document.getElementById('forcedCorrectionSearch').focus();
  }

  closeForcedCorrectionManager(restoreFocus = true) {
    const modal = typeof document === 'undefined' ? null : document.getElementById?.('forcedCorrectionModal');
    if (!modal || modal.style.display !== 'flex') return;
    modal.style.display = 'none';
    if (this.elPresetManagerModal) this.elPresetManagerModal.inert = false;
    if (restoreFocus) {
      const prev = this._forcedCorrectionPreviousFocus;
      this._forcedCorrectionPreviousFocus = null;
      if (prev && typeof document !== 'undefined' && document.contains?.(prev) && typeof prev.focus === 'function' && !modal.contains(prev)) {
        prev.focus({ preventScroll: true });
      } else if (this.activeCell && typeof document !== 'undefined') {
        const { rowIdx, colKey } = this.activeCell;
        const cell = document.querySelector?.(`.excel-cell[data-row="${rowIdx}"][data-col="${colKey}"]`);
        if (cell) cell.focus({ preventScroll: true });
        else this.elSheetContainer?.focus?.({ preventScroll: true });
      } else {
        document.getElementById('btnOpenForcedCorrectionManager')?.focus({ preventScroll: true });
      }
    }
  }

  setForcedCorrectionFeedback(message, { error = false } = {}) {
    const feedback = document.getElementById('forcedCorrectionFeedback');
    if (feedback) feedback.textContent = message;
    const inline = document.getElementById('forcedCorrectionEditorFeedback');
    if (inline) { inline.textContent = message; inline.hidden = false; inline.dataset.error = String(error); }
    this.setPresetManagerFeedback(message);
  }

  updateForcedCorrectionManager() {
    const panel = document.getElementById('forcedCorrectionPanel');
    if (!panel) return;
    if (this.forcedCorrectionManagerInitialized) { this.renderForcedCorrectionList(); return; }
    this.forcedCorrectionManagerInitialized = true;
    const scope = document.getElementById('forcedCorrectionScope');
    const filter = document.getElementById('forcedCorrectionScopeFilter');
    const labels = this.getForcedCorrectionColumns();
    scope.replaceChildren();
    const addOption = (parent, value, label) => {
      const option = document.createElement('option'); option.value = value; option.textContent = label; parent.append(option);
    };
    for (const select of [scope, filter]) {
      if (select === filter) addOption(select, 'all', '전체 규칙');
      addOption(select, '*', '모든 열');
      for (const [title, prefix, suffix] of [['지정한 열만 적용', '', '열만'], ['지정한 열을 제외하고 적용', '!', '열 제외']]) {
        const group = document.createElement('optgroup'); group.label = title;
        for (const [key, label] of Object.entries(labels)) addOption(group, prefix + key, `${label} ${suffix}`);
        select.append(group);
      }
    }
    filter.value = 'all';
    scope.value = '*';
    this.forcedCorrectionEditing = null;
    const source = document.getElementById('forcedCorrectionSource');
    const target = document.getElementById('forcedCorrectionTarget');
    const updateVariants = () => {
      this.updateForcedCorrectionCasePreview();
      const feedback = document.getElementById('forcedCorrectionEditorFeedback');
      if (feedback) feedback.hidden = true;
    };
    source.oninput = target.oninput = updateVariants;
    source.value = target.value = '';
    const add = document.getElementById('btnAddForcedCorrection');
    add.textContent = '추가';
    add.onclick = () => {
      const editing = this.forcedCorrectionEditing;
      const normalizedSource = source.value.normalize('NFC');
      let result;
      try { result = this.saveForcedCorrectionRule(scope.value, source.value, target.value, editing); }
      catch (error) {
        this.setForcedCorrectionFeedback(`저장하지 못했습니다. 입력 내용은 유지됩니다. ${error.message}`, { error: true });
        return;
      }
      if (!result.saved) {
        this.setForcedCorrectionFeedback(result.message, { error: true });
        (!source.value.trim() ? source : target).focus();
        return;
      }
      this.resetForcedCorrectionEditor();
      const shown = this.renderForcedCorrectionList();
      const outsideFilter = !shown.some(rule => rule.scope === scope.value && rule.source === normalizedSource);
      this.setForcedCorrectionFeedback(`${editing ? '규칙을 수정했습니다.' : '규칙을 추가했습니다.'} ${result.merged ? '같은 변경 문구의 중복 규칙을 합쳤습니다. ' : ''}${outsideFilter ? '현재 검색·필터 조건에서는 보이지 않습니다.' : '선택한 적용 열을 유지합니다.'}`);
      source.focus();
    };
    document.getElementById('btnCancelForcedCorrectionEdit').onclick = () => {
      this.resetForcedCorrectionEditor();
      this.renderForcedCorrectionList();
      this.setForcedCorrectionFeedback('수정을 취소했습니다.');
      source.focus();
    };
    for (const input of [source, target]) input.onkeydown = event => {
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229 && !event.repeat) {
        event.preventDefault(); event.stopPropagation(); add.click();
      }
    };
    const search = document.getElementById('forcedCorrectionSearch');
    const clearSearch = () => {
      search.value = '';
      document.getElementById('forcedCorrectionList').scrollTop = 0;
      this.renderForcedCorrectionList();
      search.focus();
    };
    search.oninput = () => {
      document.getElementById('forcedCorrectionList').scrollTop = 0;
      this.renderForcedCorrectionList();
    };
    search.onkeydown = event => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape' && search.value) {
        event.preventDefault(); event.stopPropagation(); clearSearch();
      } else if (event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation();
      }
    };
    document.getElementById('btnClearForcedCorrectionSearch').onclick = clearSearch;
    const sort = document.getElementById('forcedCorrectionSort');
    const direction = document.getElementById('btnForcedCorrectionSortDirection');
    const refresh = () => {
      document.getElementById('forcedCorrectionList').scrollTop = 0;
      this.renderForcedCorrectionList();
    };
    filter.onchange = () => {
      // Help consecutive additions follow the chosen column without replacing a draft.
      if (filter.value !== 'all' && !this.forcedCorrectionEditing && !source.value && !target.value) scope.value = filter.value;
      refresh();
    };
    sort.onchange = refresh;
    direction.onclick = () => {
      direction.dataset.direction = direction.dataset.direction === 'desc' ? 'asc' : 'desc';
      refresh();
    };
    document.getElementById('btnResetForcedCorrectionFilters').onclick = () => {
      search.value = ''; filter.value = 'all'; sort.value = 'source'; direction.dataset.direction = 'asc';
      refresh(); search.focus();
    };

    document.getElementById('btnOpenForcedCorrectionManager').onclick = () => this.openForcedCorrectionManager();
    for (const id of ['btnCloseForcedCorrectionManager', 'btnDoneForcedCorrectionManager']) {
      document.getElementById(id).onclick = () => this.closeForcedCorrectionManager();
    }
    const modal = document.getElementById('forcedCorrectionModal');
    modal.onclick = event => { if (event.target === modal) this.closeForcedCorrectionManager(); };
    modal.onkeydown = event => {
      if (this.isForcedCorrectionShortcut?.(event)) {
        event.stopPropagation();
        event.preventDefault();
        this.closeForcedCorrectionManager();
        return;
      }
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!event.isComposing && event.keyCode !== 229) {
          event.preventDefault(); this.closeForcedCorrectionManager();
        }
      } else if (event.key === 'Tab') {
        const controls = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
          .filter(element => element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.getElementById('forcedCorrectionFeedback').textContent = '변경사항은 바로 저장됩니다.';
    this.renderForcedCorrectionList();
  }

  resetForcedCorrectionEditor() {
    this.forcedCorrectionEditing = null;
    document.getElementById('forcedCorrectionSource').value = '';
    document.getElementById('forcedCorrectionTarget').value = '';
    document.getElementById('btnAddForcedCorrection').textContent = '추가';
    document.getElementById('forcedCorrectionEditorTitle').textContent = '규칙 추가';
    document.getElementById('btnCancelForcedCorrectionEdit').hidden = true;
    document.getElementById('forcedCorrectionEditor').classList.remove('is-editing');
    this.updateForcedCorrectionCasePreview();
  }

  updateForcedCorrectionCasePreview() {
    const source = document.getElementById('forcedCorrectionSource').value;
    const target = document.getElementById('forcedCorrectionTarget').value;
    const inverse = this.invertForcedCorrectionCase(source);
    document.getElementById('forcedCorrectionCasePair').hidden = inverse === source;
    document.getElementById('forcedCorrectionInverseSource').value = inverse;
    document.getElementById('forcedCorrectionCaseNote').textContent = inverse === target
      ? '변경 문구와 같으므로 별도 규칙을 만들지 않습니다.' : '대소문자 반전 · 두 입력 문구에 같은 변경 문구를 적용합니다.';
  }

  getForcedCorrectionScopeLabel(scope, labels = this.getForcedCorrectionColumns()) {
    return scope === '*' ? '모든 열' : scope.startsWith('!')
      ? `${labels[scope.slice(1)]} 열 제외` : `${labels[scope]} 열만`;
  }

  getForcedCorrectionListView({ query = '', scope = 'all', sort = 'source', direction = 'asc' } = {}) {
    const rules = this.getGroupedForcedCorrectionRules();
    const labels = this.getForcedCorrectionColumns();
    const normalize = value => String(value).normalize('NFC').toLowerCase().replace(/\s+/g, '');
    const search = normalize(query);
    const filtered = rules.map((rule, index) => ({ rule, index, label: this.getForcedCorrectionScopeLabel(rule.scope, labels) }))
      .filter(item => (scope === 'all' || item.rule.scope === scope) && (!search ||
        [...item.rule.variants, item.rule.target, item.label].some(value => normalize(value).includes(search))));
    const compare = (this.forcedCorrectionListCollator ||= new Intl.Collator('ko', { numeric: true, sensitivity: 'base' })).compare;
    const order = direction === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
      if (sort === 'registered') return order * (a.index - b.index);
      const key = sort === 'target' ? 'target' : 'source';
      const primary = sort === 'scope' ? compare(a.label, b.label) : compare(a.rule[key], b.rule[key]);
      return order * (primary || compare(a.rule.source, b.rule.source) || compare(a.label, b.label)) || a.index - b.index;
    });
    return { rules, filtered: filtered.map(item => item.rule) };
  }

  renderForcedCorrectionList() {
    const list = document.getElementById('forcedCorrectionList');
    if (!list) return;
    const scrollTop = list.scrollTop;
    const search = document.getElementById('forcedCorrectionSearch').value;
    const scope = document.getElementById('forcedCorrectionScopeFilter').value;
    const sort = document.getElementById('forcedCorrectionSort').value;
    const directionButton = document.getElementById('btnForcedCorrectionSortDirection');
    const direction = directionButton.dataset.direction;
    const { rules, filtered } = this.getForcedCorrectionListView({ query: search, scope, sort, direction });
    const labels = this.getForcedCorrectionColumns();
    document.getElementById('forcedCorrectionCount').textContent = rules.length;
    document.getElementById('forcedCorrectionModalCount').textContent = rules.length;
    document.getElementById('forcedCorrectionSearchCount').textContent = `표시 ${filtered.length}개`;
    document.getElementById('btnClearForcedCorrectionSearch').disabled = !search;
    document.getElementById('btnResetForcedCorrectionFilters').disabled = !search && scope === 'all' && sort === 'source' && direction !== 'desc';
    directionButton.textContent = direction === 'desc' ? '↓ 내림차순' : '↑ 오름차순';
    directionButton.setAttribute('aria-label', direction === 'desc' ? '현재 내림차순, 오름차순으로 변경' : '현재 오름차순, 내림차순으로 변경');
    const fragment = document.createDocumentFragment();
    const heading = document.createElement('div'); heading.className = 'forced-correction-list-header'; heading.setAttribute('aria-hidden', 'true');
    for (const label of ['적용 열', '입력 문구', '변경 문구', '관리']) {
      const cell = document.createElement('span'); cell.textContent = label; heading.append(cell);
    }
    fragment.append(heading);
    if (!filtered.length) {
      const empty = document.createElement('div'); empty.className = 'forced-correction-empty';
      empty.textContent = rules.length ? '일치하는 규칙이 없습니다. 검색어나 적용 열 필터를 변경해 주세요.' : '등록된 규칙이 없습니다. 위에서 첫 규칙을 추가해 주세요.';
      fragment.append(empty);
    }
    for (const rule of filtered) {
      const row = document.createElement('div'); row.className = 'forced-correction-row';
      const editing = this.forcedCorrectionEditing;
      row.classList.toggle('is-editing', editing?.scope === rule.scope && editing?.source === rule.source);
      const badge = document.createElement('span'); badge.className = 'forced-correction-scope';
      badge.textContent = this.getForcedCorrectionScopeLabel(rule.scope, labels);
      row.append(badge);
      for (const [key, label] of [['source', '입력'], ['target', '변경']]) {
        const text = document.createElement('span'); text.className = `forced-correction-text forced-correction-${key}`;
        text.dataset.label = label;
        for (const value of key === 'source' ? rule.variants : [rule.target]) {
          const line = document.createElement('span'); line.textContent = value.replace(/ /g, '␠'); text.append(line);
        }
        row.append(text);
      }
      const actions = document.createElement('div'); actions.className = 'forced-correction-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'preset-action-btn'; edit.textContent = '수정';
      edit.setAttribute('aria-label', `${rule.source} 강제 자동수정 수정`);
      edit.onclick = () => {
        this.forcedCorrectionEditing = rule;
        document.getElementById('forcedCorrectionScope').value = rule.scope;
        document.getElementById('forcedCorrectionSource').value = rule.source;
        document.getElementById('forcedCorrectionTarget').value = rule.target;
        this.updateForcedCorrectionCasePreview();
        document.getElementById('btnAddForcedCorrection').textContent = '수정 저장';
        document.getElementById('forcedCorrectionEditorTitle').textContent = '규칙 수정';
        document.getElementById('btnCancelForcedCorrectionEdit').hidden = false;
        document.getElementById('forcedCorrectionEditor').classList.add('is-editing');
        list.querySelectorAll('.is-editing').forEach(element => element.classList.remove('is-editing'));
        row.classList.add('is-editing');
        document.getElementById('forcedCorrectionSource').focus();
        this.setForcedCorrectionFeedback('선택한 규칙을 수정하고 있습니다. 수정 저장을 눌러 반영하세요.');
      };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'preset-action-btn forced-correction-delete'; remove.textContent = '삭제';
      remove.setAttribute('aria-label', `${rule.source} 강제 자동수정 삭제`);
      remove.onclick = () => {
        const index = [...list.querySelectorAll('.forced-correction-row')].indexOf(row);
        this.deleteForcedCorrection(rule.scope, rule.source, rule.storedSources);
        if (this.forcedCorrectionEditing?.scope === rule.scope && this.forcedCorrectionEditing?.source === rule.source) this.resetForcedCorrectionEditor();
        this.renderForcedCorrectionList();
        this.setForcedCorrectionFeedback('규칙을 삭제했습니다. 검색과 적용 열 필터는 유지합니다.');
        const remaining = list.querySelectorAll('.forced-correction-row');
        (remaining[Math.min(index, remaining.length - 1)]?.querySelector('button') || document.getElementById('forcedCorrectionSearch')).focus({ preventScroll: true });
      };
      actions.append(edit, remove); row.append(actions); fragment.append(row);
    }
    list.replaceChildren(fragment);
    list.scrollTop = scrollTop;
    return filtered;
  }
}
