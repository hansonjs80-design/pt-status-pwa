// Only this reserved settings record is written; patient dates and staff memos stay intact.
const PT_STAFF_COUNT_SETTINGS_RECORD = '__pt_staff_calendar_count_settings_v1__';

class PTStaffCalendarSettings {
  getStaffCountToday() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  }

  normalizeStaffCountSettings(value) {
    if (!value || !['today', 'all', 'from'].includes(value.scope)) return null;
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') return null;
    if (value.scope !== 'all') {
      if (typeof value.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.startDate)) return null;
      const date = new Date(value.startDate + 'T00:00:00Z');
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.startDate) return null;
    }
    return { enabled: value.enabled !== false, scope: value.scope, startDate: value.scope === 'all' ? null : value.startDate };
  }

  async syncStaffCountSettings() {
    const client = this.supabaseClient;
    if (!client) return null;
    if (this.staffCountSyncTask?.client === client) return this.staffCountSyncTask.promise;
    const revision = this.staffCountRevision || 0;
    const promise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const read = () => client.from('pt_daily_records').select('rows_data')
          .eq('date', PT_STAFF_COUNT_SETTINGS_RECORD).maybeSingle().abortSignal(controller.signal);
        let { data, error } = await read();
        if (error) throw error;
        if (client !== this.supabaseClient) return null;
        if (!data) {
          const defaults = { enabled: true, scope: 'today', startDate: this.getStaffCountToday() };
          // Insert only. Another device's existing scope is never replaced at startup.
          const created = await client.from('pt_daily_records').insert({ date: PT_STAFF_COUNT_SETTINGS_RECORD,
            rows_data: [{ staffCalendarCounts: defaults }], total_count: 0, updated_at: new Date().toISOString() }).abortSignal(controller.signal);
          if (created.error && created.error.code !== '23505') throw created.error;
          ({ data, error } = await read());
          if (error) throw error;
          if (!created.error) this.notifyCloudChange(PT_STAFF_COUNT_SETTINGS_RECORD);
        }
        const settings = this.normalizeStaffCountSettings(data?.rows_data?.[0]?.staffCalendarCounts);
        if (!settings) throw new Error('invalid staff calendar settings');
        if (client === this.supabaseClient && !this.staffCountSaving && revision === (this.staffCountRevision || 0)) this.staffCountSettings = settings;
        return settings;
      } catch {
        return null; // Retry on the next refresh; never replace an unreadable shared scope.
      } finally { clearTimeout(timer); }
    })();
    this.staffCountSyncTask = { client, promise };
    try { return await promise; }
    finally { if (this.staffCountSyncTask?.promise === promise) this.staffCountSyncTask = null; }
  }

  async saveStaffCountSettings(value) {
    const settings = this.normalizeStaffCountSettings(value);
    const client = this.supabaseClient;
    if (!settings || !client || this.staffCountSaving) return false;
    if (this.staffCountSyncTask?.client === client) await this.staffCountSyncTask.promise;
    if (client !== this.supabaseClient || this.staffCountSaving) return false;
    this.staffCountSaving = true;
    this.staffCountRevision = (this.staffCountRevision || 0) + 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const { error } = await client.from('pt_daily_records').upsert({ date: PT_STAFF_COUNT_SETTINGS_RECORD,
        rows_data: [{ staffCalendarCounts: settings }], total_count: 0, updated_at: new Date().toISOString() }, { onConflict: 'date' }).abortSignal(controller.signal);
      if (error || client !== this.supabaseClient) return false;
      this.staffCountSettings = settings;
      this.notifyCloudChange(PT_STAFF_COUNT_SETTINGS_RECORD);
      return true;
    } catch { return false; }
    finally { clearTimeout(timer); this.staffCountSaving = false; }
  }

  openStaffCountSettings() {
    if (this.staffCountDialog?.open) { this.staffCountDialog.focus(); return; }
    const dialog = document.createElement('dialog');
    this.staffCountDialog = dialog;
    dialog.className = 'device-settings-dialog';
    dialog.setAttribute('aria-labelledby', 'staffCountSettingsTitle');
    dialog.innerHTML = `<header><h2 id="staffCountSettingsTitle">직원 근무표 PT건수 연동</h2><button type="button" data-close aria-label="닫기">×</button></header>
      <section><p>PT현황 총치료 건수를 근무자동화의 날짜별 메모 마지막 칸에 표시합니다. 기존 메모는 보존됩니다.</p>
      <label><input type="checkbox" data-enabled checked> PT건수 연동 사용</label>
      <p>연동을 끄면 기존에 기록한 메모와 건수를 표시합니다. 다시 켜면 아래 적용 범위를 유지합니다.</p>
      <label>적용 범위 <select data-scope aria-label="PT건수 적용 범위"><option value="today">오늘부터</option><option value="all">모든 날짜</option><option value="from">지정일부터</option></select></label>
      <label data-date-label>적용 시작일 <input type="date" data-date aria-label="PT건수 적용 시작일"></label>
      <p data-note>오늘부터는 설정을 저장한 날짜를 시작일로 유지합니다. 두 앱이 같은 클라우드에 연결되어 있어야 합니다.</p>
      </section><footer><p data-status role="status">설정을 확인하는 중입니다.</p><button type="button" data-save>설정 저장</button></footer>`;
    document.body.append(dialog);
    const scope = dialog.querySelector('[data-scope]'), date = dialog.querySelector('[data-date]');
    const enabled = dialog.querySelector('[data-enabled]');
    const save = dialog.querySelector('[data-save]'), status = dialog.querySelector('[data-status]');
    scope.value = 'today'; date.value = this.getStaffCountToday();
    let loading = true;
    const update = () => {
      enabled.disabled = loading;
      dialog.querySelector('[data-date-label]').hidden = scope.value === 'all';
      scope.disabled = loading || !enabled.checked;
      date.disabled = loading || !enabled.checked || scope.value !== 'from';
    };
    let touched = false;
    enabled.onchange = () => { touched = true; update(); };
    scope.onchange = () => { touched = true; if (scope.value === 'today') date.value = this.getStaffCountToday(); update(); };
    date.oninput = () => { touched = true; };
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { dialog.remove(); if (this.staffCountDialog === dialog) this.staffCountDialog = null; });
    save.disabled = true;
    save.onclick = async () => {
      const value = { enabled: enabled.checked, scope: scope.value, startDate: scope.value === 'all' ? null : date.value };
      if (!this.normalizeStaffCountSettings(value)) { status.textContent = '유효한 시작일을 선택해주세요.'; return; }
      save.disabled = true; status.textContent = '저장 중입니다.';
      const saved = await this.saveStaffCountSettings(value);
      status.textContent = saved ? (value.enabled ? '저장 완료 · 직원 근무표에 적용됩니다.' : '연동 꺼짐 · 기존 메모와 건수를 표시합니다.') : '저장하지 못했습니다. 클라우드 연결을 확인한 뒤 다시 시도해주세요.';
      save.disabled = false;
    };
    update(); dialog.showModal();
    void this.syncStaffCountSettings().then(settings => {
      if (!dialog.open) return;
      loading = false;
      if (settings && !touched) { enabled.checked = settings.enabled !== false; scope.value = settings.scope; date.value = settings.startDate || this.getStaffCountToday(); update(); }
      update();
      status.textContent = settings ? '모든 기기에 함께 적용되는 설정입니다.' : '클라우드 설정을 확인하지 못했습니다. 연결을 확인한 뒤 다시 열어주세요.';
      save.disabled = !settings;
    });
  }
}
