// Device-only snapshots. Resolve every available copy before publishing a value.
class PTDeviceSettings {
  static candidates(key, cookieKey = key) {
    const values = [];
    for (const storage of [() => localStorage, () => sessionStorage]) {
      try { const value = JSON.parse(storage().getItem(key) || 'null'); if (value && typeof value === 'object' && !Array.isArray(value)) values.push(value); } catch (_) {}
    }
    try {
      for (const raw of String(document.cookie || '').split(';')) {
        const entry = raw.trim(), prefix = cookieKey + '=';
        if (!entry.startsWith(prefix)) continue;
        try { const value = JSON.parse(decodeURIComponent(entry.slice(prefix.length))); if (value && typeof value === 'object' && !Array.isArray(value)) values.push(value); } catch (_) {}
      }
    } catch (_) {}
    return values;
  }

  static panel(key, legacyClosed, property = 'closed') {
    const candidates = this.candidates(key + '_SNAPSHOT', key + '_STATE').filter(value =>
      typeof value[property] === 'boolean' && Number.isFinite(value.updatedAt) && value.updatedAt > 0);
    if (candidates.length) return candidates.reduce((a,b) => b.updatedAt > a.updatedAt ? b : a);
    try { const value = localStorage.getItem(key); if (value !== null) return { [property]: value === legacyClosed, updatedAt: 0 }; } catch (_) {}
    return { [property]: false, updatedAt: 0 };
  }

  static mergeUI(candidates) {
    const widthTimes = {};
    const result = {version:1,columnWidths:{},columnWidthsUpdatedAt:0,columnWidthsUserModified:false,
      summaryClosed:false,summaryClosedUpdatedAt:0,summaryClosedUserModified:false,
      toolbarCollapsed:false,toolbarCollapsedUpdatedAt:0,toolbarCollapsedUserModified:false};
    for (const value of candidates.filter(Boolean)) for (const field of ['columnWidths','summaryClosed','toolbarCollapsed']) {
      const valid = field === 'columnWidths' ? value[field] && typeof value[field] === 'object' && !Array.isArray(value[field]) &&
        Object.keys(value[field]).length && Object.values(value[field]).every(width => Number.isFinite(width) && width > 0)
        : typeof value[field] === 'boolean';
      if (!valid) continue;
      const timestamp = Number(value[field+'UpdatedAt']) || 0;
      const modified = Boolean(value[field+'UserModified']) || timestamp > 1;
      if (field === 'columnWidths') {
        for (const [column,width] of Object.entries(value[field])) if (!(column in widthTimes) || timestamp >= widthTimes[column]) {
          result.columnWidths[column] = width;widthTimes[column] = timestamp;
        }
        result.columnWidthsUpdatedAt = Math.max(result.columnWidthsUpdatedAt,timestamp);
        result.columnWidthsUserModified ||= modified;
        continue;
      }
      if (timestamp < result[field+'UpdatedAt'] || (timestamp === result[field+'UpdatedAt'] && result[field+'UserModified'] && !modified)) continue;
      result[field] = value[field];
      result[field+'UpdatedAt'] = timestamp;
      result[field+'UserModified'] = modified;
    }
    return result;
  }

  static readUI(extra = []) {
    const candidates = this.candidates('PT_DEVICE_UI_PREFS_V1');
    const summary = this.panel('device-summary-closed-v1','1'), toolbar = this.panel('PT_TOOLBAR_ACTIONS_COLLAPSED_V1','true');
    candidates.push({summaryClosed:summary.closed,summaryClosedUpdatedAt:summary.updatedAt},
      {toolbarCollapsed:toolbar.closed,toolbarCollapsedUpdatedAt:toolbar.updatedAt});
    const key = 'PT_APP_COL_WIDTHS_STORAGE_V1';
    for (const widths of this.candidates(key+'_SNAPSHOT',key+'_STATE')) candidates.push({columnWidths:widths.widths,columnWidthsUpdatedAt:widths.updatedAt});
    try { candidates.push({columnWidths:JSON.parse(localStorage.getItem(key)||'null'),columnWidthsUpdatedAt:Number(localStorage.getItem(key+'_UPDATED_AT'))||0}); } catch (_) {}
    return this.mergeUI([...candidates,...extra]);
  }

  static mergeExports(candidates) {
    const result = {}, times = {}, known = new Set();
    for (const value of candidates.filter(Boolean)) {
      if (typeof value !== 'object' || Array.isArray(value)) continue;
      for (const [key, setting] of Object.entries(value)) {
        if (key.startsWith('_')) continue;
        const timestamp = Number(value._fieldUpdatedAt ? value._fieldUpdatedAt[key] : value._updatedAt) || 0;
        // A new partial save must not stamp untouched defaults over recovered fields.
        if (known.has(key) && (timestamp < times[key] || (timestamp === times[key] && value._fieldUpdatedAt && !timestamp))) continue;
        result[key] = setting;times[key] = timestamp;known.add(key);
      }
    }
    if (known.size) result._fieldUpdatedAt = times;
    return result;
  }
}
