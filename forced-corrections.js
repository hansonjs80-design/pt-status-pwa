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

  setForcedCorrection(scope, source, target, previous = null) {
    source = String(source ?? '').trim().normalize('NFC');
    target = String(target ?? '').trim().normalize('NFC');
    if (!this.isForcedCorrectionScope(scope) ||
        !source || !target || source === target) return false;
    if (previous) delete COLUMN_PRESETS[this.getForcedCorrectionKey(previous.scope, previous.source)];
    // String arrays retain compatibility with existing backup and cloud records.
    COLUMN_PRESETS[this.getForcedCorrectionKey(scope, source)] = [target];
    saveColumnPresets(COLUMN_PRESETS);
    return true;
  }

  deleteForcedCorrection(scope, source) {
    delete COLUMN_PRESETS[this.getForcedCorrectionKey(scope, source)];
    saveColumnPresets(COLUMN_PRESETS);
  }

  findForcedCorrection(value, colKey, caret = value.length) {
    const rules = new Map(this.getForcedCorrectionRules('*').map(rule => [rule.source, rule]));
    for (const rule of this.getForcedCorrectionRules()) {
      if (rule.scope.startsWith('!') && rule.scope.slice(1) !== colKey) rules.set(rule.source, rule);
    }
    for (const rule of this.getForcedCorrectionRules(colKey)) rules.set(rule.source, rule);
    for (const rule of [...rules.values()].sort((a, b) => b.source.length - a.source.length)) {
      const start = caret - rule.source.length;
      if (start < 0 || value.slice(start, caret) !== rule.source) continue;
      if (start && !/[\s([{]/.test(value[start - 1])) continue;
      if (caret < value.length && !/[\s)\]},.!?;:]/.test(value[caret])) continue;
      return {...rule, prefix: value.slice(0, start), suffix: value.slice(caret),
        value: value.slice(0, start) + rule.target + value.slice(caret), caret: start + rule.target.length};
    }
    return null;
  }

  updateForcedCorrection(input, colKey, {commit = false, nativeData = null, deleting = false} = {}) {
    const previous = input._forcedCorrectionProjection;
    const value = previous?.nativeKorean ? input.value : this.getCellEditorBaseValue(input);
    const range = input._nativeCellComposition;
    const caret = input._inputLanguage === 'eng' && typeof range?.data === 'string'
      ? range.prefix.length + this.convertHangulToEng(range.data).length : (input.selectionStart ?? value.length);
    let correction = null;
    // Preserve an already-corrected prefix if the same native syllable grows.
    if (previous && !deleting) {
      const decompose = text => Array.from(text, char => this.getCompletionJamo(char).join('')).join('');
      const raw = decompose(value), prefix = decompose(previous.prefix + previous.source), suffix = decompose(previous.suffix);
      if (raw.startsWith(prefix) && raw.endsWith(suffix) && raw.length >= prefix.length + suffix.length) {
        const remaining = this.assembleHangul(raw.slice(prefix.length, suffix ? -suffix.length : undefined));
        const rest = previous.koreanToEnglish ? this.convertHangulToEng(remaining) : remaining;
        correction = {...previous, value: previous.prefix + previous.target + rest + previous.suffix,
          caret: previous.prefix.length + previous.target.length + rest.length};
      }
    }
    if (!correction && !deleting && (input.selectionStart === input.selectionEnd || commit)) {
      correction = this.findForcedCorrection(value, colKey, caret);
    }
    delete input._forcedCorrectionProjection;
    if (!correction) return false;
    input._forcedCorrectionApplied = true;
    if (!previous) {
      const hangul = /[가-힣ㄱ-ㅎㅏ-ㅣ\u1100-\u11ff]/u;
      correction.koreanToEnglish = hangul.test(correction.source) && !hangul.test(correction.target) && /[a-z]/i.test(correction.target);
      correction.nativeKorean = correction.koreanToEnglish && input._inputLanguage !== 'eng' && input.dataset.nativeComposing === 'true';
    }
    if (correction.koreanToEnglish) {
      input._inputLanguage = this._cellInputLanguage = 'eng';
      this.clearKoreanKeyBuffer(input);
    }
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

  updateForcedCorrectionManager() {
    const panel = document.getElementById('forcedCorrectionPanel');
    if (!panel) return;
    const scope = document.getElementById('forcedCorrectionScope');
    const labels = this.getForcedCorrectionColumns();
    const column = this.activePresetTab;
    scope.replaceChildren();
    const addOption = (parent, value, label) => {
      const option = document.createElement('option'); option.value = value; option.textContent = label; parent.append(option);
    };
    addOption(scope, '*', '모든 열');
    for (const [title, prefix, suffix] of [['지정한 열만 적용', '', '열만'], ['지정한 열을 제외하고 적용', '!', '열 제외']]) {
      const group = document.createElement('optgroup'); group.label = title;
      for (const [key, label] of Object.entries(labels)) addOption(group, prefix + key, `${label} ${suffix}`);
      scope.append(group);
    }
    scope.value = column;
    this.forcedCorrectionEditing = null;
    const source = document.getElementById('forcedCorrectionSource');
    const target = document.getElementById('forcedCorrectionTarget');
    source.value = target.value = '';
    const add = document.getElementById('btnAddForcedCorrection');
    add.textContent = '추가';
    add.onclick = () => {
      if (!this.setForcedCorrection(scope.value, source.value, target.value, this.forcedCorrectionEditing)) {
        this.setPresetManagerFeedback('입력 문구와 변경 문구를 서로 다르게 입력해 주세요.');
        (!source.value.trim() ? source : target).focus();
        return;
      }
      source.value = target.value = '';
      this.forcedCorrectionEditing = null;
      add.textContent = '추가';
      this.renderForcedCorrectionList();
      this.setPresetManagerFeedback('강제 자동수정 설정을 저장했습니다.');
      source.focus();
    };
    for (const input of [source, target]) input.onkeydown = event => {
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229 && !event.repeat) {
        event.preventDefault(); event.stopPropagation(); add.click();
      }
    };
    this.renderForcedCorrectionList();
  }

  renderForcedCorrectionList() {
    const list = document.getElementById('forcedCorrectionList');
    if (!list) return;
    list.replaceChildren();
    const rules = this.getForcedCorrectionRules();
    const labels = this.getForcedCorrectionColumns();
    document.getElementById('forcedCorrectionCount').textContent = rules.length;
    if (!rules.length) { list.textContent = '등록된 강제 자동수정이 없습니다.'; return; }
    for (const rule of rules) {
      const row = document.createElement('div'); row.className = 'forced-correction-row';
      const badge = document.createElement('span'); badge.className = 'forced-correction-scope';
      badge.textContent = rule.scope === '*' ? '모든 열' : rule.scope.startsWith('!')
        ? `${labels[rule.scope.slice(1)]} 열 제외` : `${labels[rule.scope]} 열만`;
      const text = document.createElement('span'); text.className = 'forced-correction-text';
      text.textContent = `${rule.source} → ${rule.target}`;
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'preset-action-btn'; edit.textContent = '수정';
      edit.setAttribute('aria-label', `${rule.source} 강제 자동수정 수정`);
      edit.onclick = () => {
        this.forcedCorrectionEditing = rule;
        document.getElementById('forcedCorrectionScope').value = rule.scope;
        document.getElementById('forcedCorrectionSource').value = rule.source;
        document.getElementById('forcedCorrectionTarget').value = rule.target;
        document.getElementById('btnAddForcedCorrection').textContent = '수정 저장';
        document.getElementById('forcedCorrectionSource').focus();
      };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'preset-action-btn'; remove.textContent = '삭제';
      remove.setAttribute('aria-label', `${rule.source} 강제 자동수정 삭제`);
      remove.onclick = () => {
        this.deleteForcedCorrection(rule.scope, rule.source);
        this.updateForcedCorrectionManager();
        this.setPresetManagerFeedback('강제 자동수정 설정을 삭제했습니다.');
      };
      row.append(badge, text, edit, remove); list.append(row);
    }
  }
}
