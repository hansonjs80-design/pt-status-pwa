// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTColumnSettings {
  loadColumnFormatting() {
    try { this.columnFormattingPending = JSON.parse(localStorage.getItem("PT_COLUMN_FORMATTING_PENDING") || "{}"); }
    catch { this.columnFormattingPending = {}; }
    this.columnFormattingPending = this.normalizeSharedColumnFormatting(this.columnFormattingPending) || {};
    let saved;
    try { saved = this.normalizeSharedColumnFormatting(JSON.parse(localStorage.getItem("PT_COLUMN_FORMATTING") || "{}")) || {}; }
    catch { saved = {}; }
    for (const [key, properties] of Object.entries(this.columnFormattingPending)) saved[key] = {...saved[key], ...properties};
    return saved;
  }

  normalizeColumnColor(color) {
    if (color === null) return null;
    if (typeof color !== 'string') return undefined;
    const value = color.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(value)) return value;
    if (/^#[0-9a-f]{3}$/.test(value)) return '#' + value.slice(1).split('').map(char => char + char).join('');
    const match = /^(rgb|hsl)\(\s*([+-]?[\d.]+)(%?)\s*[, ]\s*([+-]?[\d.]+)(%?)\s*[, ]\s*([+-]?[\d.]+)(%?)\s*\)$/.exec(value);
    if (!match) return undefined;
    let channels;
    if (match[1] === 'rgb') channels = [2,4,6].map(i => Number(match[i]) * (match[i+1] ? 2.55 : 1));
    else {
      if (match[3] || match[5] !== '%' || match[7] !== '%') return undefined;
      const hue = ((Number(match[2]) % 360) + 360) % 360;
      const saturation = Number(match[4]) / 100, light = Number(match[6]) / 100;
      if (saturation < 0 || saturation > 1 || light < 0 || light > 1) return undefined;
      const a = saturation * Math.min(light, 1 - light);
      channels = [0,8,4].map(n => {
        const k = (n + hue / 30) % 12;
        return 255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
      });
    }
    if (channels.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return undefined;
    return '#' + channels.map(n => Math.round(n).toString(16).padStart(2,'0')).join('');
  }

  normalizeSharedColumnFormatting(formatting) {
    if (!formatting || typeof formatting !== 'object' || Array.isArray(formatting)) return null;
    const normalized = JSON.parse(JSON.stringify(formatting));
    for (const properties of Object.values(normalized)) {
      for (const property of ['color', 'backgroundColor']) {
        if (!properties?.[property]) continue;
        const color = this.normalizeColumnColor(properties[property].value);
        if (color === undefined) return null;
        properties[property].value = color;
      }
    }
    return this.validateSharedColumnFormatting(normalized) ? normalized : null;
  }

  setColumnFormatting(columns, property, value, resetCells = false) {
    if (property === 'color' || property === 'backgroundColor') {
      value = this.normalizeColumnColor(value);
      if (value === undefined) return;
    }
    this.columnFormatting ||= {};
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const revision = `${Date.now()}-${Math.random()}`;
    for (let col = columns.minCol; col <= columns.maxCol; col++) {
      this.columnFormatting[keys[col]] ||= {};
      const existing = this.columnFormatting[keys[col]][property];
      if (!resetCells && existing && (existing.value === value || (property === "fontWeight" && String(existing.value) === String(value)))) continue;
      const setting = { value, revision };
      if (resetCells || existing?.resetRevision) setting.resetRevision = resetCells ? revision : existing.resetRevision;
      this.columnFormatting[keys[col]][property] = setting;
      this.columnFormattingPending ||= {};
      this.columnFormattingPending[keys[col]] ||= {};
      this.columnFormattingPending[keys[col]][property] = setting;
    }
    localStorage.setItem("PT_COLUMN_FORMATTING_PENDING", JSON.stringify(this.columnFormattingPending || {}));
    localStorage.setItem("PT_COLUMN_FORMATTING", JSON.stringify(this.columnFormatting));
    if (this.supabaseClient) {
      clearTimeout(this.columnFormattingSyncTimer);
      this.columnFormattingSyncTimer = setTimeout(() => { void this.syncSharedColumnFormatting(); }, 250);
    }
  }

  validateSharedColumnFormatting(formatting) {
    if (!formatting || typeof formatting !== "object" || Array.isArray(formatting)) return false;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    return Object.entries(formatting).every(([key, properties]) => keys.includes(key) && properties &&
      Object.entries(properties).every(([property, setting]) => setting && typeof setting.revision === "string" &&
        (setting.resetRevision === undefined || typeof setting.resetRevision === "string") &&
        (property === "fontSize" ? setting.value === null || (Number.isInteger(setting.value * 2) && setting.value >= 8 && setting.value <= 72)
          : property === "fontWeight" ? setting.value === null || [400,500,600,700,800,900].includes(Number(setting.value))
            : property === "textAlign" ? setting.value === null || ["left", "center", "right"].includes(setting.value)
            : ["color", "backgroundColor"].includes(property) && (setting.value === null || /^#[0-9a-f]{6}$/i.test(setting.value)))));
  }

  acceptSharedColumnFormatting(formatting) {
    formatting = this.normalizeSharedColumnFormatting(formatting);
    if (!formatting) return;
    const merged = JSON.parse(JSON.stringify(formatting));
    for (const [key, properties] of Object.entries(this.columnFormattingPending || {})) {
      merged[key] = { ...merged[key], ...properties };
    }
    const changed = JSON.stringify(merged) !== JSON.stringify(this.columnFormatting || {});
    this.columnFormatting = merged;
    localStorage.setItem("PT_COLUMN_FORMATTING", JSON.stringify(merged));
    if (changed) this.columnFormattingRenderPending = true;
    // A live IME editor keeps its DOM and composition; repaint after editing ends.
    if (this.columnFormattingRenderPending && !this.isEditingCell()) {
      this.columnFormattingRenderPending = false;
      this.renderTable();
    }
  }

  async syncSharedColumnFormatting() {
    if (this.columnFormattingSyncTask) {
      await this.columnFormattingSyncTask;
      return !Object.keys(this.columnFormattingPending || {}).length;
    }
    const task = Object.keys(this.columnFormattingPending || {}).length ? this.pushSharedColumnFormatting() : this.pullSharedColumnFormatting();
    this.columnFormattingSyncTask = task;
    try { await task; }
    finally { if (this.columnFormattingSyncTask === task) this.columnFormattingSyncTask = null; }
    return !Object.keys(this.columnFormattingPending || {}).length;
  }

  async pullSharedColumnFormatting() {
    const client = this.supabaseClient;
    if (!client || this.columnFormattingSyncBusy || Object.keys(this.columnFormattingPending || {}).length) return;
    this.columnFormattingSyncBusy = true;
    try {
      const { data, error } = await client.from("pt_daily_records").select("rows_data").eq("date", SHARED_COLUMN_FORMATTING_RECORD).maybeSingle();
      if (error) throw error;
      if (client !== this.supabaseClient || Object.keys(this.columnFormattingPending || {}).length) return;
      if (!data) {
        // Only the first device seeds legacy settings. Every later device uses
        // the established shared values, never its old device-specific cache.
        const result = await client.from("pt_daily_records").insert({ date: SHARED_COLUMN_FORMATTING_RECORD,
          rows_data: [{ columnFormatting: this.columnFormatting || {} }], total_count: 0, updated_at: new Date().toISOString() });
        if (result.error && result.error.code !== "23505") throw result.error;
        this.notifyCloudChange(SHARED_COLUMN_FORMATTING_RECORD);
        return;
      }
      const formatting = this.normalizeSharedColumnFormatting(data.rows_data?.[0]?.columnFormatting);
      if (!formatting) throw new Error('invalid shared settings');
      this.acceptSharedColumnFormatting(formatting);
      this.columnFormattingSyncFailed = false;
    } catch { this.reportColumnFormattingSyncFailure(); }
    finally { this.columnFormattingSyncBusy = false; }
  }

  async pushSharedColumnFormatting() {
    const client = this.supabaseClient;
    if (!client || this.columnFormattingSyncBusy || !Object.keys(this.columnFormattingPending || {}).length) return;
    this.columnFormattingSyncBusy = true;
    const pending = JSON.parse(JSON.stringify(this.columnFormattingPending));
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await client.from("pt_daily_records").select("rows_data, updated_at").eq("date", SHARED_COLUMN_FORMATTING_RECORD).maybeSingle();
        if (error) throw error;
        if (client !== this.supabaseClient) return;
        const remote = data && this.normalizeSharedColumnFormatting(data.rows_data?.[0]?.columnFormatting);
        if (data && !remote) throw new Error("invalid shared settings");
        const merged = JSON.parse(JSON.stringify(data ? remote : this.columnFormatting || {}));
        for (const [key, properties] of Object.entries(pending)) merged[key] = { ...merged[key], ...properties };
        const record = { date: SHARED_COLUMN_FORMATTING_RECORD, rows_data: [{ columnFormatting: merged }], total_count: 0,
          updated_at: new Date(Math.max(Date.now(), (Date.parse(data?.updated_at) || 0) + 1)).toISOString() };
        let result;
        if (data) {
          const update = client.from("pt_daily_records").update(record).eq("date", SHARED_COLUMN_FORMATTING_RECORD);
          result = await (data.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", data.updated_at)).select("date");
        } else result = await client.from("pt_daily_records").insert(record).select("date");
        if (result.error?.code === "23505") continue;
        if (result.error) throw result.error;
        if (!result.data?.length) continue;
        if (client !== this.supabaseClient) return;
        for (const [key, properties] of Object.entries(pending)) for (const [property, setting] of Object.entries(properties)) {
          if (this.columnFormattingPending[key]?.[property]?.revision === setting.revision) delete this.columnFormattingPending[key][property];
          if (!Object.keys(this.columnFormattingPending[key] || {}).length) delete this.columnFormattingPending[key];
        }
        localStorage.setItem("PT_COLUMN_FORMATTING_PENDING", JSON.stringify(this.columnFormattingPending));
        this.acceptSharedColumnFormatting(merged);
        this.notifyCloudChange(SHARED_COLUMN_FORMATTING_RECORD);
        this.columnFormattingSyncFailed = false;
        if (!Object.keys(this.columnFormattingPending).length) this.showSaveIndicator("열 서식 저장 및 동기화 완료");
        return;
      }
      throw new Error("shared settings changed concurrently");
    } catch { this.reportColumnFormattingSyncFailure(); }
    finally { this.columnFormattingSyncBusy = false; }
  }

  reportColumnFormattingSyncFailure() {
    if (!this.columnFormattingSyncFailed) this.showSaveIndicator("열 서식 동기화 대기 · 연결되면 다시 저장합니다", true);
    this.columnFormattingSyncFailed = true;
  }

  getColumnFontSettings() {
    const labels = ["No.", "성별", "차트번호", "성함", "부위", "처방", "추가 사항", "작성", "메모", "특이 사항"];
    return ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"].map((key, index) => ({
      key, label: `${String.fromCharCode(65 + index)}열 · ${labels[index]}`,
      fontSize: this.columnFormatting?.[key]?.fontSize?.value ?? (index === 0 ? 16 : 14),
      fontWeight: String(this.columnFormatting?.[key]?.fontWeight?.value ?? (index < 2 ? 600 : 500)),
      color: this.columnFormatting?.[key]?.color?.value ?? "#000000",
      backgroundColor: this.columnFormatting?.[key]?.backgroundColor?.value ?? null,
      textAlign: this.columnFormatting?.[key]?.textAlign?.value ?? (key === "prescription" ? "left" : "center"),
    }));
  }

  saveColumnFontSettings(settings, baseline = null) {
    const columns = this.getColumnFontSettings();
    if (settings.length !== columns.length || settings.some((setting, index) =>
      setting.key !== columns[index].key || !Number.isInteger(setting.fontSize * 2) ||
      setting.fontSize < 8 || setting.fontSize > 72 ||
      ![400, 500, 600, 700, 800, 900].includes(Number(setting.fontWeight)) ||
      !/^#[0-9a-f]{6}$/i.test(setting.color) ||
      (setting.backgroundColor != null && !/^#[0-9a-f]{6}$/i.test(setting.backgroundColor)) ||
      (setting.textAlign != null && !["left", "center", "right"].includes(setting.textAlign)))) return false;
    // Only changed properties receive a new revision. Saving the same defaults
    // must not invalidate later cell-specific formatting on any date.
    settings.forEach((setting, index) => {
      for (const property of ["fontSize", "fontWeight", "color", "backgroundColor", "textAlign"]) {
        if (["backgroundColor", "textAlign"].includes(property) && setting[property] === undefined) continue;
        if (baseline && setting[property] === baseline[index]?.[property] && this.columnFormatting?.[setting.key]?.[property]) continue;
        const value = property === "fontWeight" ? String(setting[property]) : setting[property];
        this.setColumnFormatting({ minCol: index, maxCol: index }, property, value);
      }
    });
    return true;
  }

  handleColumnFontSettingsEnter(event) {
    if (event.key !== 'Enter' || !event.target?.matches?.('input[type="number"]')) return false;
    event.preventDefault();
    if (!event.isComposing && event.keyCode !== 229 && !event.repeat) {
      event.target.closest('tr')?.querySelector('[data-apply-column]')?.click();
    }
    return true;
  }

  openColumnFontSettings() {
    document.getElementById("columnFontSettingsModal")?.remove();
    const previousFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.id = "columnFontSettingsModal";
    overlay.className = "modal-overlay column-font-settings";
    overlay.innerHTML = `<form class="modal-card" role="dialog" aria-modal="true" aria-labelledby="columnFontSettingsTitle" aria-describedby="columnFontSettingsNote" novalidate>
      <div class="modal-header"><h2 id="columnFontSettingsTitle" class="modal-title">열 서식 설정</h2><button type="button" class="btn-close-modal" data-close aria-label="설정창 닫기">✕</button></div>
      <div class="modal-body">
        <p id="columnFontSettingsNote" class="column-font-note">적용한 열의 기존 셀 서식은 모든 날짜·검색 내역에서 바뀝니다. 적용 후 지정한 개별 셀 서식은 유지됩니다.</p>
        <div class="column-font-guide"><strong>10개 열</strong><span>크기 8~72px · 0.5px 단위 · 입력칸 Enter로 해당 열 적용</span></div>
        <div class="column-font-list"><table><thead><tr><th scope="col">열</th><th scope="col">크기</th><th scope="col">굵기</th><th scope="col">글자색</th><th scope="col">배경색</th><th scope="col">정렬</th><th scope="col">미리보기</th><th scope="col">열별 적용</th></tr></thead><tbody></tbody></table></div>
        <p id="columnFontSettingsError" class="column-font-error" role="alert" hidden></p>
      </div>
      <div class="column-font-footer">
        <p class="column-font-status" role="status" aria-live="polite">입력값을 바꾼 뒤 적용하세요.</p>
        <div class="column-font-actions"><span>적용한 열은 즉시 저장됩니다.</span><button type="button" data-close>닫기</button><button type="submit">전체 열 적용</button></div>
      </div></form>`;
    const tbody = overlay.querySelector("tbody");
    const error = overlay.querySelector('.column-font-error');
    const status = overlay.querySelector('.column-font-status');
    const applyAll = overlay.querySelector('button[type="submit"]');
    const baseline = this.getColumnFontSettings();
    let busy = false;
    const rows = [];
    const readSetting = row => ({
      key: row.dataset.key,
      fontSize: Number(row.querySelector('[data-property="fontSize"]').value),
      fontWeight: row.querySelector('[data-property="fontWeight"]').value,
      color: row.querySelector('[data-property="color"]').value,
      textAlign: row.querySelector('[data-property="textAlign"]').value,
      backgroundColor: row.querySelector('[data-background-default]').checked ? null : row.querySelector('[data-property="backgroundColor"]').value,
    });
    const updateButtons = () => {
      for (const row of rows) {
        row.querySelector('[data-apply-column]').disabled = busy || row.dataset.applied === 'true';
        row.querySelectorAll('input, select').forEach(control => { control.disabled = busy; });
      }
      applyAll.disabled = busy || rows.every(row => row.dataset.applied === 'true');
      applyAll.textContent = busy ? '저장 중…' : '전체 열 적용';
    };
    const showStatus = (message, tone = 'info') => { status.textContent = message; status.dataset.tone = tone; };
    const validate = selectedRows => {
      error.hidden = true;
      for (const row of selectedRows) {
        const size = row.querySelector('[data-property="fontSize"]');
        size.removeAttribute('aria-invalid');
        if (!size.checkValidity()) {
          const label = baseline.find(setting => setting.key === row.dataset.key).label;
          error.textContent = `${label}: 글자 크기를 8~72 사이의 0.5 단위로 입력해 주세요.`;
          error.hidden = false; size.setAttribute('aria-invalid', 'true'); size.focus(); size.select();
          return false;
        }
      }
      return true;
    };
    const apply = async selectedRows => {
      if (busy || !validate(selectedRows)) return;
      const settings = selectedRows.map(readSetting);
      busy = true; updateButtons();
      let applied = false;
      try {
        if (!this.applyColumnFontSettings(settings)) {
          error.textContent = '입력값을 확인해 주세요. 크기·굵기·글자색·배경색·정렬을 올바르게 설정해야 합니다.';
          error.hidden = false;
          return;
        }
        applied = true;
        for (const row of selectedRows) {
          row.dataset.applied = 'true'; row.classList.remove('is-modified');
          row.querySelector('[data-apply-column]').textContent = '적용됨';
        }
        showStatus('이 기기에 저장했습니다. 동기화 상태를 확인 중입니다.');
        const synced = this.supabaseClient ? await this.syncSharedColumnFormatting() : false;
        const scope = selectedRows.length === rows.length ? '전체 열' : baseline.find(setting => setting.key === settings[0].key).label;
        showStatus(synced ? `${scope} 적용 · 모든 기기에 동기화 완료` : `${scope} 적용 · 이 기기에 저장됨. 연결되면 다른 기기에 동기화됩니다.`, synced ? 'success' : 'info');
      } catch {
        if (applied) showStatus('이 기기에 저장되었습니다. 클라우드 연결 후 동기화됩니다.');
        else { error.textContent = '적용하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.'; error.hidden = false; }
      } finally {
        busy = false; updateButtons();
      }
    };
    for (const setting of baseline) {
      const row = document.createElement("tr");
      row.dataset.key = setting.key;
      const [letter, label] = setting.label.split('열 · ');
      row.innerHTML = `<th scope="row"><span class="column-font-letter">${letter}</span>${label}</th><td><input type="number" min="8" max="72" step="0.5" required data-property="fontSize" aria-label="${setting.label} 글자 크기" aria-describedby="columnFontSettingsError"></td>
        <td><select data-property="fontWeight" aria-label="${setting.label} 글자 굵기">${[[400,"보통"],[500,"중간"],[600,"약간 굵게"],[700,"굵게"],[800,"더 굵게"],[900,"가장 굵게"]].map(([value,label]) => `<option value="${value}">${label}</option>`).join("")}</select></td>
        <td><input type="color" data-property="color" aria-label="${setting.label} 글자색"></td>
        <td><div class="column-background-controls"><input type="color" data-property="backgroundColor" aria-label="${setting.label} 셀 배경색"><label><input type="checkbox" data-background-default aria-label="${setting.label} 셀 배경색 없음">없음</label></div></td>
        <td><select data-property="textAlign" aria-label="${setting.label} 셀 정렬"><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></td><td><span class="column-font-preview" aria-hidden="true">가Aa</span></td><td><button type="button" data-apply-column aria-label="${setting.label}만 적용 및 저장">적용</button></td>`;
      for (const property of ["fontSize", "fontWeight", "color", "textAlign"]) row.querySelector(`[data-property="${property}"]`).value = property === 'color' ? this.toColorPickerValue(setting.color) : setting[property];
      row.querySelector('[data-property="backgroundColor"]').value = this.toColorPickerValue(setting.backgroundColor || "#ffffff");
      row.querySelector('[data-background-default]').checked = setting.backgroundColor === null;
      const preview = () => {
        const value = readSetting(row), sample = row.querySelector('.column-font-preview');
        sample.style.fontSize = `${value.fontSize >= 8 && value.fontSize <= 72 ? value.fontSize : setting.fontSize}px`;
        sample.style.fontWeight = value.fontWeight; sample.style.color = value.color;
        sample.style.backgroundColor = value.backgroundColor || "";
        sample.style.textAlign = value.textAlign;
        sample.title = `${value.fontSize}px · ${value.fontWeight} · 글자색 ${value.color} · 배경색 ${value.backgroundColor || "없음"}`;
      };
      const changed = event => {
        if (!event.target.matches('input, select')) return;
        if (event.target.dataset.property === 'backgroundColor') row.querySelector('[data-background-default]').checked = false;
        row.dataset.applied = 'false'; row.classList.add('is-modified');
        row.querySelector('[data-apply-column]').textContent = '적용';
        event.target.removeAttribute('aria-invalid'); error.hidden = true;
        preview(); updateButtons(); showStatus('수정 중 · 적용 버튼을 누르면 저장됩니다.');
      };
      row.addEventListener('input', changed); row.addEventListener('change', changed);
      row.querySelector('[data-apply-column]').addEventListener('click', () => { void apply([row]); });
      preview(); rows.push(row); tbody.appendChild(row);
    }
    const close = () => {
      overlay.remove();
      const target = previousFocus?.isConnected && previousFocus.getClientRects().length ? previousFocus : document.getElementById('btnColumnFontSettings');
      if (target?.getClientRects().length) target.focus({ preventScroll: true });
      else this.elSheetContainer?.focus({ preventScroll: true });
    };
    overlay.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (this.handleColumnFontSettingsEnter(event)) return;
      if (event.key === 'Tab') {
        const controls = [...overlay.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter(control => control.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    overlay.querySelector('form').addEventListener('submit', event => { event.preventDefault(); void apply(rows); });
    document.body.appendChild(overlay); overlay.style.display = 'flex';
    const first = overlay.querySelector('input'); first.focus(); first.select();
  }

  applyColumnFontSettings(settings) {
    const columns = this.getColumnFontSettings();
    if (!settings.length || new Set(settings.map(setting => setting.key)).size !== settings.length ||
        settings.some(setting => !columns.some(column => column.key === setting.key) ||
          !Number.isInteger(setting.fontSize * 2) || setting.fontSize < 8 || setting.fontSize > 72 ||
          ![400,500,600,700,800,900].includes(Number(setting.fontWeight)) || !/^#[0-9a-f]{6}$/i.test(setting.color) ||
          (setting.backgroundColor != null && !/^#[0-9a-f]{6}$/i.test(setting.backgroundColor)) ||
      (setting.textAlign != null && !["left", "center", "right"].includes(setting.textAlign)))) return false;
    for (const setting of settings) {
      const index = columns.findIndex(column => column.key === setting.key);
      for (const property of ['fontSize','fontWeight','color','backgroundColor','textAlign']) {
        if (['backgroundColor', 'textAlign'].includes(property) && setting[property] === undefined) continue;
        this.setColumnFormatting({minCol:index,maxCol:index}, property,
          property === 'fontWeight' ? String(setting[property]) : setting[property], true);
      }
    }
    this.renderTable();
    this.showSaveIndicator(this.supabaseClient ? '열 설정 적용됨 · 동기화 중' : '열 설정 적용 및 기기 저장 완료');
    return true;
  }

}
