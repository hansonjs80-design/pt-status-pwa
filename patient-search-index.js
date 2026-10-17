// Patient candidate indexing is separate from search-dialog focus and submission.
class PTPatientSearchIndex {
  getSearchPromptHistoryIndex() {
    const cutoffDate = this.getSearchCutoffDate?.() || null;
    const generation = this.autocompleteHistoryGeneration || 0;
    const active = this.elSearchPromptModal?.style.display === 'flex';
    const previous = active && this.searchPromptHistoryIndex;
    if (previous && previous.local === this.dataStore && previous.remote === this.cloudSearchHistory &&
        previous.date === this.currentDate && previous.rows === this.dataStore?.[this.currentDate] &&
        previous.cutoffDate === cutoffDate && previous.generation === generation) return previous;
    const store = this.getSearchDataStore();
    const names = new Map(), charts = new Map();
    const dates = Object.keys(store).filter(date => date !== this.currentDate && (!cutoffDate || date >= cutoffDate)).sort().reverse();
    for (const date of dates) for (const row of Array.isArray(store[date]) ? store[date] : []) {
      const name = String(row?.name ?? '').trim(), chartNo = String(row?.chartNo ?? '').trim();
      if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), { value: name, name, chartNo });
      if (chartNo && !charts.has(chartNo.toLowerCase())) charts.set(chartNo.toLowerCase(), { value: chartNo, name, chartNo });
    }
    const index = { local: this.dataStore, remote: this.cloudSearchHistory, date: this.currentDate, rows: this.dataStore?.[this.currentDate],
      cutoffDate, generation, currentRows: store[this.currentDate], names: [...names.values()], charts: [...charts.values()] };
    if (active) this.searchPromptHistoryIndex = index;
    return index;
  }

  getSearchPromptSuggestions(query) {
    const q = String(query ?? '').trim().toLowerCase();
    if (!q) return [];
    const chart = /^[a-z0-9-]+$/i.test(q) && /\d/.test(q);
    const index = this.getSearchPromptHistoryIndex();
    const seen = new Set(), results = [];
    const add = item => {
      const key = item.value.toLowerCase();
      if (!key || seen.has(key)) return;
      if (chart ? key.includes(q) : this.matchesHangulPrefix(item.value, q, true)) {
        seen.add(key); results.push(item);
      }
    };
    // Today's edits stay live; only immutable prior-date candidates are indexed.
    for (const row of index.currentRows || []) {
      const name = String(row?.name ?? '').trim(), chartNo = String(row?.chartNo ?? '').trim();
      add({ value: chart ? chartNo : name, name, chartNo });
      if (results.length >= 10) return results;
    }
    for (const item of chart ? index.charts : index.names) {
      add(item);
      if (results.length >= 10) break;
    }
    return results;
  }
}
