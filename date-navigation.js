// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTDateNavigation {
  closeDateCalendar(restoreFocus = false) {
    this.calendarCleanup?.();
    document.getElementById("dateCalendar")?.remove();
    this.elDateLabel.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.elDateLabel.focus();
  }

  openCalendar() {
    if (document.getElementById("dateCalendar")) { this.closeDateCalendar(); return; }
    if (this.isEditingCell()) document.activeElement.blur();
    const selected = this.currentDate;
    let [year, month] = selected.split("-").map(Number);
    const popup = document.createElement("div");
    popup.id = "dateCalendar"; popup.className = "date-calendar";
    popup.setAttribute("role", "dialog"); popup.setAttribute("aria-label", "날짜 선택");
    const choose = value => { this.closeDateCalendar(); this.setDate(value, true); };
    const render = () => {
      popup.replaceChildren();
      const header = document.createElement("div"); header.className = "calendar-heading";
      const nav = (label, delta) => {
        const button = document.createElement("button"); button.type = "button"; button.setAttribute("aria-label", label);
        const points = delta < 0 ? "16 5 8 12 16 19" : "8 5 16 12 8 19";
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
        button.onclick = () => { const next = new Date(year, month - 1 + delta, 1); year = next.getFullYear(); month = next.getMonth() + 1; render(); popup.querySelector(`[aria-label="${label}"]`).focus(); };
        return button;
      };
      header.append(nav("이전 달", -1));
      const yearSelect = document.createElement("select"); yearSelect.className = "calendar-year-select"; yearSelect.setAttribute("aria-label", "연도");
      for (let y = Math.max(2100, year); y >= Math.min(1900, year); y--) {
        yearSelect.add(new Option(`${y}년`, y, false, y === year));
      }
      yearSelect.onchange = () => { year = Number(yearSelect.value); render(); };
      const monthSelect = document.createElement("select"); monthSelect.setAttribute("aria-label", "월");
      for (let m = 1; m <= 12; m++) { const option = new Option(`${m}월`, m, false, m === month); monthSelect.add(option); }
      monthSelect.onchange = () => { month = Number(monthSelect.value); render(); };
      header.append(yearSelect, monthSelect, nav("다음 달", 1)); popup.append(header);
      const grid = document.createElement("div"); grid.className = "calendar-grid";
      ["일", "월", "화", "수", "목", "금", "토"].forEach(label => { const day = document.createElement("span"); day.className = "calendar-weekday"; day.textContent = label; grid.append(day); });
      const offset = new Date(year, month - 1, 1).getDay();
      const today = this.getTodayString();
      for (let index = 0; index < 42; index++) {
        const date = new Date(year, month - 1, index - offset + 1);
        const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const button = document.createElement("button"); button.textContent = date.getDate(); button.dataset.date = value;
        button.setAttribute("aria-label", `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`);
        if (date.getMonth() + 1 !== month) button.classList.add("outside-month");
        if (value === today) { button.classList.add("is-today"); button.setAttribute("aria-current", "date"); }
        if (value === selected) { button.classList.add("is-selected"); button.setAttribute("aria-pressed", "true"); }
        button.onclick = () => choose(value); grid.append(button);
      }
      popup.append(grid);
      const footer = document.createElement("div"); footer.className = "calendar-footer";
      const hint = document.createElement("span"); hint.textContent = "원하는 날짜를 선택하세요";
      const todayButton = document.createElement("button"); todayButton.textContent = "오늘"; todayButton.onclick = () => choose(today);
      const selectedDay = new Date(`${selected}T00:00:00`).getDay();
      todayButton.classList.toggle("is-saturday", selectedDay === 6);
      todayButton.classList.toggle("is-sunday", selectedDay === 0);
      footer.append(hint, todayButton); popup.append(footer);
    };
    render(); document.body.append(popup); this.elDateLabel.setAttribute("aria-expanded", "true");
    const rect = this.elDateLabel.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 10, innerHeight - popup.offsetHeight - 8))}px`;
    const outside = event => { if (!popup.contains(event.target) && !this.elDateLabel.contains(event.target)) this.closeDateCalendar(); };
    const keyboard = event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); this.closeDateCalendar(true); return; }
      const day = event.target.closest("[data-date]");
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (day && delta) { event.preventDefault(); const buttons = [...popup.querySelectorAll("[data-date]")]; buttons[Math.max(0, Math.min(41, buttons.indexOf(day) + delta))].focus(); }
    };
    document.addEventListener("mousedown", outside); popup.addEventListener("keydown", keyboard);
    this.calendarCleanup = () => document.removeEventListener("mousedown", outside);
    popup.querySelector(".is-selected")?.focus();
  }

  setDate(dateStr) {
    const focusRequest = this._dateFocusRequest = {};
    const dateChanged = this.currentDate !== dateStr;
    if (this.isEditingCell() || document.activeElement?.matches(".cell-input-element")) document.activeElement.blur();
    clearTimeout(this._saveTimer);
    clearTimeout(this._dateFocusTimer);
    this.clipboardSelection = null;
    this.historyApplyTarget = null;
    if (dateChanged) {
      this.patientSearchDraft = null;
      this.sortState = { colKey: null, direction: "original" };
      this.clearHeaderSelections();
      this.activeCell = null;
      this.selectedRowIdx = null;
      this.selectedColKey = null;
      this.rangeStart = null;
      this.rangeEnd = null;
      this.elSheetContainer.scrollTop = 0;
    }
    this.pendingCut = null;
    this.lastHistoryAppliedTarget = null;
    this.historyOriginSelection = undefined;
    this.currentDate = dateStr;
    this.elDatePicker.value = dateStr;

    // Format display: e.g., 2026.09.29 (화)
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const daysKor = ["일", "월", "화", "수", "목", "금", "토"];
    const dayLabel = daysKor[dateObj.getDay()] || "";
    const dateFormatted = `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;

    this.elDateLabel.textContent = `${dateFormatted} (${dayLabel})`;
    for (const element of [this.elDateLabel, this.elBtnPrevDay, this.elBtnNextDay, this.elBtnGoToday]) {
      element?.classList?.toggle("is-saturday", dateObj.getDay() === 6);
      element?.classList?.toggle("is-sunday", dateObj.getDay() === 0);
    }
    this.elSidebarDateTag.textContent = dateFormatted;
    this.elSheetTabTitle.textContent = dateFormatted;

    this.getCurrentRows();
    this.getEditHistory();
    this.renderTable();
    if (dateChanged) this.elSheetContainer.scrollTop = 0;
    this.updateHistoryButtons();
    this.updateSidebarStats();

    this.focusDateEntryCell();
    const entrySelection = this.activeCell;
    const entryEditor = this.elTableBody.querySelector('.cell-input-element.is-armed');

    // Reposition after newly received records only while the navigation
    // selection is untouched. A later date change or user edit owns focus.
    if (this.supabaseClient) {
      Promise.resolve(this.pullFromCloud(dateStr, false)).then(() => {
        if (this._dateFocusRequest === focusRequest && this.currentDate === dateStr &&
            this.activeCell === entrySelection && !this.crossDateSelection && !this.isEditingCell() &&
            (!entryEditor || entryEditor.classList.contains('is-armed'))) this.focusDateEntryCell();
      });
    }
  }

  shiftDay(deltaDays) {
    const [y, m, d] = this.currentDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + deltaDays);
    const nextY = dateObj.getFullYear();
    const nextM = String(dateObj.getMonth() + 1).padStart(2, "0");
    const nextD = String(dateObj.getDate()).padStart(2, "0");
    this.setDate(`${nextY}-${nextM}-${nextD}`);
  }

}
