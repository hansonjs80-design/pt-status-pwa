// Reads the scheduler's holidays only. Never writes to either app's Supabase tables.
class PTHolidayCalendar {
  normalizeCalendarHolidays(rows) {
    if (!Array.isArray(rows)) throw new Error('공휴일 응답 형식이 올바르지 않습니다.');
    const holidays = {};
    for (const row of rows) {
      const date = String(row?.date ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const parsed = new Date(`${date}T00:00:00Z`);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) continue;
      holidays[date] = String(row.name || '공휴일');
    }
    return holidays;
  }

  getCalendarHolidayCache(year) {
    this.calendarHolidayCache ||= new Map();
    if (!this.calendarHolidayCache.has(year)) {
      let holidays = {};
      try {
        const saved = JSON.parse(localStorage.getItem(`PT_HOLIDAYS_${DEFAULT_SUPABASE_URL}_${year}`) || 'null');
        holidays = this.normalizeCalendarHolidays(saved?.rows || []);
      } catch (_) { /* Offline cache is optional. */ }
      this.calendarHolidayCache.set(year, { holidays, loadedAt: 0, error: false });
    }
    return this.calendarHolidayCache.get(year);
  }

  getCalendarHolidayName(date, year = Number(String(date).slice(0, 4))) {
    return this.getCalendarHolidayCache(year).holidays[date] || '';
  }

  async loadCalendarHolidays(year) {
    if (!Number.isInteger(year) || year < 1900 || year > 2100 || typeof fetch !== 'function') return false;
    const cache = this.getCalendarHolidayCache(year);
    if (Date.now() - cache.loadedAt < 300000) return true;
    if (cache.request) return cache.request;
    const request = (async () => {
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
      try {
        const rows = [];
        for (let offset = 0; ; ) {
          // Include adjoining days shown in the six-week calendar grid.
          const params = new URLSearchParams({ select: 'date,name', date: `gte.${year - 1}-12-01`, order: 'date.asc', limit: '200', offset: String(offset) });
          params.append('date', `lt.${year + 1}-02-01`);
          const response = await fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/holidays?${params}`, {
            method: 'GET', headers: { apikey: DEFAULT_SUPABASE_KEY, Authorization: `Bearer ${DEFAULT_SUPABASE_KEY}` },
            signal: controller?.signal,
          });
          if (!response.ok) throw new Error('공휴일 조회 실패');
          const page = await response.json();
          if (!Array.isArray(page)) throw new Error('공휴일 응답 형식 오류');
          rows.push(...page);
          if (!page.length) break;
          offset += page.length;
        }
        cache.holidays = this.normalizeCalendarHolidays(rows);
        cache.loadedAt = Date.now();
        cache.error = false;
        try {
          localStorage.setItem(`PT_HOLIDAYS_${DEFAULT_SUPABASE_URL}_${year}`, JSON.stringify({ rows }));
        } catch (_) { /* Showing holidays does not depend on local storage capacity. */ }
        return true;
      } catch (_) {
        cache.error = true; // Keep the last successful cache instead of erasing it.
        return false;
      } finally {
        if (timer !== null) clearTimeout(timer);
        this.refreshCalendarHolidayAppearance();
      }
    })();
    cache.request = request;
    try { return await request; }
    finally { if (cache.request === request) cache.request = null; }
  }

  refreshCalendarHolidayAppearance() {
    const popup = document.getElementById?.('dateCalendar');
    if (popup) {
      const year = Number(popup.dataset.year);
      for (const button of popup.querySelectorAll('button[data-date]')) {
        const name = this.getCalendarHolidayName(button.dataset.date, year);
        button.classList.toggle('is-holiday', Boolean(name));
        button.title = name;
        const [y, m, d] = button.dataset.date.split('-').map(Number);
        button.setAttribute('aria-label', `${y}년 ${m}월 ${d}일${name ? ` · ${name}` : ''}`);
      }
      const cache = this.getCalendarHolidayCache(year);
      const hint = popup.querySelector('.calendar-holiday-status');
      if (hint) hint.textContent = cache.error ? '공휴일 조회 실패 · 저장된 내역 표시' : '원하는 날짜를 선택하세요';
      popup.querySelector('.calendar-footer button')?.classList.toggle('is-holiday', Boolean(this.getCalendarHolidayName(this.currentDate, year)));
    }
    const name = this.getCalendarHolidayName(this.currentDate);
    for (const element of [this.elDateLabel, this.elBtnPrevDay, this.elBtnNextDay, this.elBtnGoToday]) {
      element?.classList?.toggle('is-holiday', Boolean(name));
    }
    if (this.elDateLabel) this.elDateLabel.title = name || '날짜 선택';
  }
}
