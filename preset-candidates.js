// Keep legacy string lists readable while storing formatting per candidate variant.
class PTPresetCandidates {
  static candidateIdentity(value, formatting) {
    // These identifiers are persisted in hidden lists and sent to JSONB.
    // A NUL separator is valid in JavaScript but PostgreSQL rejects it.
    return '__candidate:v1:' + JSON.stringify([String(value), formatting]);
  }

  static normalizeStorage(presets) {
    if (!presets || typeof presets !== 'object' || Array.isArray(presets)) return presets;
    let normalized = presets;
    for (const [key, values] of Object.entries(presets)) {
      if (key.startsWith('__hidden:') && Array.isArray(values)) {
        let changed = false;
        const migrated = values.map(value => {
          if (typeof value !== 'string') return value;
          const separator = value.indexOf('\u0000');
          if (separator < 0) return value;
          try {
            const formatting = JSON.parse(value.slice(separator + 1));
            if (!formatting || typeof formatting !== 'object' || Array.isArray(formatting)) return value;
            changed = true;
            return this.candidateIdentity(value.slice(0, separator), formatting);
          } catch (_) { return value; }
        });
        if (changed) {
          if (normalized === presets) normalized = {...presets};
          normalized[key] = [...new Set(migrated)];
        }
      } else if (key.startsWith('__query:') && Array.isArray(values)) {
        // 하부 세부 규칙 목록 정제:
        // 상위 창에서 생성된 빈칸이 하부 항목 상단으로 전파되지 않도록 맨 앞 빈칸들만 제거하고,
        // 내용 뒤에 사용자가 수동으로 추가한 빈칸은 유지(연속 빈칸은 1개로 정리)
        let firstContentIdx = values.findIndex(v => String(v ?? '').trim() !== '');
        let cleaned = [];
        if (firstContentIdx !== -1) {
          const tail = values.slice(firstContentIdx);
          let prevBlank = false;
          for (const item of tail) {
            const isBlank = String(item ?? '').trim() === '';
            if (isBlank) {
              if (!prevBlank) {
                cleaned.push('');
                prevBlank = true;
              }
            } else {
              cleaned.push(item);
              prevBlank = false;
            }
          }
        }
        if (cleaned.length !== values.length || cleaned.some((v, idx) => v !== values[idx])) {
          if (normalized === presets) normalized = {...presets};
          normalized[key] = cleaned;
        }
      }
    }
    return normalized;
  }

  getPresetCandidateFormatsKey(scope) { return `__candidateFormats:${JSON.stringify(scope)}`; }

  makePresetCandidate(value, formatting) {
    const candidate = new String(String(value));
    candidate._presetFormatting = JSON.parse(JSON.stringify(formatting));
    return candidate;
  }

  getPresetCandidateIdentity(candidate) {
    return candidate?._presetFormatting ? PTPresetCandidates.candidateIdentity(candidate, candidate._presetFormatting) : String(candidate);
  }

  getRowAutocompleteFormatting(row, colKey) {
    const raw = String(row?.[colKey] ?? ''), text = raw.trim(), offset = raw.indexOf(text);
    const rich = this.getEffectiveCellRichText(row, colKey);
    const richText = rich?.text === raw ? {text,colors:(rich.colors || Array(raw.length).fill(null)).slice(offset, offset + text.length),
      ...(rich.styles ? {styles:rich.styles.slice(offset,offset + text.length)} : {})} : null;
    return {color:this.getCellFormatting(row,colKey,'color') || null,
      fontWeight:this.getCellFormatting(row,colKey,'fontWeight') || null,richText};
  }

  getPresetCandidateFormatKey(colKey, value, query = null) {
    const text = String(value), format = this.getAutocompleteValueFormatting(colKey, value, query);
    const colors = Array.from({length:text.length}, (_, i) => String(format.richText?.colors?.[i] || format.color || '').toLowerCase());
    const weights = Array.from({length:text.length}, (_, i) => Number(format.richText?.styles?.[i]?.fontWeight ?? format.fontWeight) || null);
    const styles = Array.from({length:text.length}, (_, i) => {
      const style = format.richText?.styles?.[i], line = style?.underline;
      return [String(style?.highlight || '').toLowerCase() || null, Number(style?.fontSize) || null,
        line ? [line.style, String(line.color || '').toLowerCase() || null, this.getUnderlineThickness(line)] : null];
    });
    return JSON.stringify([text, colors, weights, styles, text.length ? null : [format.color,format.fontWeight]]);
  }

  expandHistoricalPresetVariants(snapshot, colKey, items) {
    snapshot.formatVariants ||= new Map();
    const revision = JSON.stringify(this.columnFormatting?.[colKey] || {});
    let cached = snapshot.formatVariants.get(colKey);
    if (!cached || cached.revision !== revision) {
      cached = {revision,groups:new Map()}; snapshot.formatVariants.set(colKey,cached);
    }
    // Only resolve typography for the (at most ten) matched values. Building
    // rich text for every past patient on the first key blocks rapid typing.
    const missing = new Set(items.map(String).filter(text => text && !cached.groups.has(text)));
    if (missing.size) {
      const groups = cached.groups;
      for (const text of missing) groups.set(text,{raw:new Set(),formats:new Map()});
      for (const date of snapshot.dates) {
        if (date === this.currentDate) continue;
        for (const row of Array.isArray(snapshot.store[date]) ? snapshot.store[date] : []) {
          const text = String(row?.[colKey] ?? '').trim();
          if (!missing.has(text)) continue;
          const group = groups.get(text);
          if (group.formats.size >= 10) continue;
          const raw = JSON.stringify([row._textColors?.[colKey],row._textStyles?.[colKey],row._richText?.[colKey],row._formatRevisions?.[colKey]]);
          if (group.raw.has(raw)) continue;
          group.raw.add(raw);
          const item = this.makePresetCandidate(text,this.getRowAutocompleteFormatting(row,colKey));
          group.formats.set(this.getPresetCandidateFormatKey(colKey,item),item);
        }
      }
    }
    const expanded = [];
    const current = new Map();
    const wanted = new Set(items.map(String));
    for (const row of this.dataStore?.[this.currentDate] || []) {
      const text = String(row?.[colKey] ?? '').trim();
      if (!wanted.has(text)) continue;
      const item = this.makePresetCandidate(text,this.getRowAutocompleteFormatting(row,colKey));
      if (!current.has(text)) current.set(text,new Map(cached.groups.get(text)?.formats));
      current.get(text).set(this.getPresetCandidateFormatKey(colKey,item),item);
    }
    for (const item of items) {
      expanded.push(item);
      if (String(item).trim() === '') continue; // 빈칸은 과거 서식 변형으로 복제·확장하지 않음
      const formats = current.get(String(item)) || cached.groups.get(String(item))?.formats;
      if (formats?.size > 1) expanded.push(...formats.values());
    }
    return this.deduplicatePresetCandidates(colKey,expanded).slice(0,10);
  }

  deduplicatePresetCandidates(colKey, items, query = null) {
    const groups = new Map(), unique = [];
    const previous = this.autocompleteFormattingBatch;
    this.autocompleteFormattingBatch ||= {};
    try {
      for (const item of items) {
        const text = String(item), group = groups.get(text);
        if (!group) { groups.set(text, [item]); unique.push(item); continue; }
        const key = this.getPresetCandidateFormatKey(colKey, item, query);
        if (!group.some(other => this.getPresetCandidateFormatKey(colKey, other, query) === key)) { group.push(item); unique.push(item); }
      }
    } finally { this.autocompleteFormattingBatch = previous; }
    return unique;
  }

  getPresetCandidates(scope) {
    const words = COLUMN_PRESETS[scope] || [];
    const formats = COLUMN_PRESETS[this.getPresetCandidateFormatsKey(scope)];
    if (!formats?.some(Boolean)) return words;
    if (this.presetCandidateCachePresets !== COLUMN_PRESETS) { this.presetCandidateCache = new Map(); this.presetCandidateCachePresets = COLUMN_PRESETS; }
    const cached = this.presetCandidateCache.get(scope);
    if (cached?.words === words && cached.formats === formats && cached.presets === COLUMN_PRESETS) return cached.items;
    const items = words.map((word, i) => {
      try {
        const saved = JSON.parse(formats[i] || 'null');
        if (saved?.value === word && saved.formatting && !Array.isArray(saved.formatting) && typeof saved.formatting === 'object' &&
            (saved.formatting.color == null || typeof saved.formatting.color === 'string') &&
            (saved.formatting.fontWeight == null || Number.isFinite(Number(saved.formatting.fontWeight)))) return this.makePresetCandidate(word, saved.formatting);
      } catch (_) { /* Imported or outdated metadata must not hide a phrase. */ }
      return word;
    });
    this.presetCandidateCache.set(scope, {words,formats,presets:COLUMN_PRESETS,items});
    return items;
  }

  storePresetCandidates(scope, items) {
    COLUMN_PRESETS[scope] = items.map(String);
    const key = this.getPresetCandidateFormatsKey(scope);
    const formats = items.map(item => item?._presetFormatting ? JSON.stringify({value:String(item),formatting:item._presetFormatting}) : '');
    if (formats.some(Boolean)) COLUMN_PRESETS[key] = formats; else delete COLUMN_PRESETS[key];
    // Keep the editable array alive across toolbar actions and reordering.
    if (this.presetCandidateCachePresets !== COLUMN_PRESETS) { this.presetCandidateCache = new Map(); this.presetCandidateCachePresets = COLUMN_PRESETS; }
    this.presetCandidateCache.set(scope, {words:COLUMN_PRESETS[scope],formats:COLUMN_PRESETS[key],presets:COLUMN_PRESETS,items});
  }
}
