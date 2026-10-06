// Period summaries and average controls. Dates with treatment records define active days.
class PTSummary {
  getDailySummary(rows = this.getCurrentRows()) {
    const text = value => String(value ?? "").trim();
    const records = rows.filter(row => row && ["name", "chartNo", "part", "prescription", "extra"]
      .some(key => text(row[key])));
    const summary = { total: records.length, male: 0, female: 0, unknown: 0,
      writers: new Map(), writerContentCounts: new Map(),
      extras: new Map(), extraSubcounts: new Map(),
      prescriptions: new Map() };

    // 작성 이니셜: 모든 행에서 카운트 (내용 유무 상관없이)
    for (const row of rows) {
      if (!row) continue;
      const writer = text(row.writer);
      if (!writer) continue;
      summary.writers.set(writer, (summary.writers.get(writer) || 0) + 1);
    }

    for (const row of records) {
      const gender = text(row.gender).toUpperCase();
      if (gender === "M") summary.male++;
      else if (gender === "F") summary.female++;
      else summary.unknown++;

      // A repeated item in one row is one treatment; mixed extras count separately.
      const extras = new Set();
      for (const token of text(row.extra).split(/[,;\n/+]+/).map(value => value.trim()).filter(Boolean)) {
        if (/^(x|-)$/i.test(token)) continue;
        extras.add(token.replace(/\s+/g, " "));
      }
      for (const extra of extras) {
        summary.extras.set(extra, (summary.extras.get(extra) || 0) + 1);
        if (extra.includes("충격파") && text(row.specialNote).includes("신장")) summary.extraSubcounts.set(extra, (summary.extraSubcounts.get(extra) || 0) + 1);
      }
      // 내용 있는 행의 이니셜 카운트
      const writer = text(row.writer);
      if (writer) summary.writerContentCounts.set(writer, (summary.writerContentCounts.get(writer) || 0) + 1);
      const prescription = text(row.prescription).replace(/\s+/g, " ") || "미입력";
      summary.prescriptions.set(prescription, (summary.prescriptions.get(prescription) || 0) + 1);
    }
    return summary;
  }

  formatExtraCount(summary, label, count) {
    const subcount = summary.extraSubcounts?.get(label) || 0;
    return subcount ? `${count}(${subcount})` : String(count);
  }

  renderSummaryList(container, entries, emptyMessage, summary = null) {
    container.replaceChildren();
    if (!entries.size) {
      const empty = document.createElement("li");
      empty.className = "summary-empty";
      empty.textContent = emptyMessage;
      container.appendChild(empty);
      return;
    }
    for (const [label, count] of entries) {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.className = "summary-item-name";
      name.textContent = label;
      const value = document.createElement("span");
      value.className = "summary-item-value";
      const number = document.createElement("b");
      number.textContent = summary ? this.formatExtraCount(summary, label, count) : count;
      const unit = document.createElement("span");
      unit.textContent = "건";
      value.append(number, unit);
      row.append(name, value);
      container.appendChild(row);
    }
  }

  renderWriterSummaryList(container, writers, contentCounts) {
    container.replaceChildren();
    if (!writers.size) {
      const empty = document.createElement("li");
      empty.className = "summary-empty";
      empty.textContent = "작성 이니셜 없음";
      container.appendChild(empty);
      return;
    }
    for (const [label, totalCount] of writers) {
      const contentCount = contentCounts.get(label) || 0;
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.className = "summary-item-name";
      name.textContent = label;
      const value = document.createElement("span");
      value.className = "summary-item-value";
      const number = document.createElement("b");
      number.textContent = contentCount > 0 ? `${totalCount}(${contentCount})` : String(totalCount);
      const unit = document.createElement("span");
      unit.textContent = "건";
      value.append(number, unit);
      row.append(name, value);
      container.appendChild(row);
    }
  }

  setSummaryPeriod(period) {
    if (!["day", "month", "year"].includes(period)) return;
    this.summaryPeriod = period;
    this.updateSidebarStats();
    if (period !== "day") void this.loadSearchHistory();
  }

  getPeriodSummary(period = this.summaryPeriod || "day") {
    if (period === "day") return this.getDailySummary();
    return this.getDailySummary(this.getSummaryDates(period, true).flatMap(entry => entry.rows));
  }

  getSummaryDates(period, filtered = false) {
    const prefix = this.currentDate.slice(0, period === "year" ? 4 : 7);
    return Object.entries(this.getSearchDataStore())
      .filter(([date, rows]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date.startsWith(prefix) && Array.isArray(rows))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rows]) => {
        const d = new Date(`${date}T00:00:00Z`);
        const first = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
        return { date, rows, summary: this.getDailySummary(rows), weekday: d.getUTCDay(),
          week: Math.floor((d.getUTCDate() - 1 + (first.getUTCDay() + 6) % 7) / 7) + 1 };
      })
      .filter(entry => !filtered || this.matchesSummaryFilters(entry, period));
  }

  matchesSummaryFilters(entry, period) {
    return period !== "month" ||
      ((!this.summaryWeekdays || this.summaryWeekdays.includes(entry.weekday)) &&
        (!this.summaryWeeks || this.summaryWeeks.includes(entry.week)));
  }

  getSummaryAverageContext(period, entries = this.getSummaryDates(period, true)) {
    const dates = entries.filter(entry => entry.summary.total > 0);
    return { days: dates.length, weeks: new Set(dates.map(entry => entry.week)).size,
      months: new Set(dates.map(entry => entry.date.slice(0, 7))).size };
  }

  formatSummaryAverage(count, divisor) {
    return divisor ? (count / divisor).toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—";
  }

  appendSummaryAverages(container, counts) {
    const period = this.summaryPeriod || "day";
    if (period === "day") return;
    const context = this.summaryAverageContext;
    const header = document.createElement("div");
    header.className = "summary-average-columns";
    header.textContent = `합계 · 일평균 · ${period === "month" ? "주평균" : "월평균"}`;
    container.before(header);
    for (const row of container.children) {
      const label = row.querySelector(".summary-item-name")?.textContent;
      if (!label) continue;
      const average = document.createElement("small");
      average.className = "summary-list-average";
      const count = counts.get(label) || 0;
      average.textContent = `${this.formatSummaryAverage(count, context.days)} / ${this.formatSummaryAverage(count, period === "month" ? context.weeks : context.months)}`;
      row.append(average);
    }
  }

  getSummaryMetrics(summary) {
    const metrics = [{ key: "total", label: "총 치료 기록", value: s => s.total }];
    for (const [key, label] of [["male", "남성"], ["female", "여성"], ["unknown", "성별 미지정"]]) {
      metrics.push({ key, label, value: s => s[key] });
    }
    for (const [field, title] of [["writerContentCounts", "작성"], ["extras", "추가 사항"], ["prescriptions", "처방"]]) {
      for (const label of summary[field].keys()) metrics.push({ key: `${field}:${label}`, label: `${title} · ${label}`, value: s => s[field].get(label) || 0 });
    }
    return metrics;
  }

  renderSummaryAnalytics(period, dates, selectedDates, summary) {
    const sidebar = document.getElementById("summarySidebar");
    if (!sidebar) return;
    sidebar.classList.toggle("summary-expanded", period !== "day");
    sidebar.querySelectorAll(".summary-average-columns").forEach(el => el.remove());
    let panel = document.getElementById("summaryAnalytics");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "summaryAnalytics";
      panel.className = "summary-section summary-analytics";
      sidebar.querySelector(".stat-card").after(panel);
    }
    panel.replaceChildren();
    panel.hidden = period === "day";
    if (period === "day") return;
    const context = this.summaryAverageContext = this.getSummaryAverageContext(period, selectedDates);
    const create = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
    panel.append(create("h4", period === "month" ? "요일·주별 평균" : "월별 평균"));
    if (period === "month") {
      const filters = create("div", undefined, "summary-filters");
      const makeFilter = (label, values, property) => {
        const group = create("fieldset"); group.append(create("legend", label));
        for (const [value, title] of values) {
          const item = create("label"); const checkbox = create("input"); checkbox.type = "checkbox";
          checkbox.checked = !this[property] || this[property].includes(value);
          checkbox.addEventListener("change", () => {
            const active = new Set(this[property] || values.map(([v]) => v));
            checkbox.checked ? active.add(value) : active.delete(value);
            this[property] = [...active]; this.updateSidebarStats();
          });
          item.append(checkbox, create("span", title)); group.append(item);
        }
        filters.append(group);
      };
      makeFilter("선택 요일", [1,2,3,4,5,6,0].map(day => [day, "일월화수목금토"[day]]), "summaryWeekdays");
      const first = new Date(`${this.currentDate.slice(0,7)}-01T00:00:00Z`);
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+1, 0));
      const weekCount = Math.ceil((last.getUTCDate() + (first.getUTCDay()+6)%7)/7);
      makeFilter("선택 주 (월~일)", Array.from({length:weekCount}, (_,i) => [i+1, `${i+1}주`]), "summaryWeeks");
      const reset = create("button", "전체 선택", "summary-reset"); reset.type = "button";
      reset.addEventListener("click", () => { this.summaryWeeks = this.summaryWeekdays = null; this.updateSidebarStats(); });
      filters.append(reset); panel.append(filters);
    }
    const total = summary.total;
    const averages = create("div", undefined, "summary-average-cards");
    averages.append(create("div", `일평균 ${this.formatSummaryAverage(total, context.days)}건`),
      create("div", `${period === "month" ? "주" : "월"}평균 ${this.formatSummaryAverage(total, period === "month" ? context.weeks : context.months)}건`));
    panel.append(averages);
    panel.append(create("p", `치료 기록이 있는 ${context.days}일${period === "month" ? ` · ${context.weeks}주` : ` · ${context.months}개월`} 기준. 빈 날짜는 평균에서 제외합니다. 작성 평균은 내용이 있는 행 기준입니다.`, "summary-average-note"));
    const metrics = this.getSummaryMetrics(this.getDailySummary(dates.flatMap(entry => entry.rows)));
    const selectorLabel = create("label", "비교 항목", "summary-metric-label");
    const select = create("select"); select.setAttribute("aria-label", "평균 비교 항목");
    for (const metric of metrics) { const option = create("option", metric.label); option.value = metric.key; select.append(option); }
    select.value = metrics.some(metric => metric.key === this.summaryMetric) ? this.summaryMetric : "total";
    const tables = create("div", undefined, "summary-average-tables");
    const renderTables = () => {
      tables.replaceChildren(); const metric = metrics.find(metric => metric.key === select.value);
      const render = (title, groups, headers) => {
        tables.append(create("h5", title)); const table = create("table");
        const head = create("thead"); const headings = create("tr"); for (const text of headers) headings.append(create("th", text)); head.append(headings); table.append(head);
        const body = create("tbody");
        for (const [label, group] of groups) {
          const active = group.filter(entry => entry.summary.total > 0);
          const sum = active.reduce((n, entry) => n + metric.value(entry.summary), 0);
          const row = create("tr"); row.append(create("th", label), create("td", `${active.length}일`), create("td", sum.toLocaleString("ko-KR")), create("td", this.formatSummaryAverage(sum, active.length)));
          body.append(row);
        }
        table.append(body); tables.append(table);
      };
      if (period === "month") {
        render("요일별 일평균 · 선택한 주 기준", [1,2,3,4,5,6,0].map(day => ["일월화수목금토"[day]+"요일", selectedDates.filter(entry => entry.weekday === day)]), ["요일", "기록일", "합계", "일평균"]);
        render("주별 평균 · 선택한 요일 기준", [...new Set(dates.map(entry => entry.week))].map(week => [`${week}주`, selectedDates.filter(entry => entry.week === week)]), ["주", "기록일", "주 합계", "일평균"]);
      } else {
        render("월별 일평균", Array.from({length:12}, (_,i) => [`${i+1}월`, dates.filter(entry => Number(entry.date.slice(5,7)) === i+1)]), ["월", "기록일", "월 합계", "일평균"]);
      }
    };
    select.addEventListener("change", () => { this.summaryMetric = select.value; renderTables(); });
    selectorLabel.append(select); panel.append(selectorLabel, tables); renderTables();
  }

  updateSidebarStats() {
    const period = this.summaryPeriod || "day";
    const dates = period === "day" ? [] : this.getSummaryDates(period);
    const selectedDates = dates.filter(entry => this.matchesSummaryFilters(entry, period));
    const summary = period === "day" ? this.getDailySummary() : this.getDailySummary(selectedDates.flatMap(entry => entry.rows));
    this.renderSummaryAnalytics(period, dates, selectedDates, summary);
    const labels = { day: "일일", month: "월간", year: "연간" };
    if (this.elSidebarSummaryTitle) this.elSidebarSummaryTitle.textContent = `📊 ${labels[period]} 현황 요약`;
    if (this.elStatPeriodLabel) this.elStatPeriodLabel.textContent = { day: "선택 날짜 전체", month: "선택 요일·주 합계", year: "선택 연도 전체" }[period];
    this.elSidebarDateTag.textContent = period === "year" ? `${this.currentDate.slice(0, 4)}년`
      : this.currentDate.slice(0, period === "month" ? 7 : 10).replace(/-/g, ".");
    this.elSummaryPeriodTabs?.forEach(button => {
      const selected = button.dataset.summaryPeriod === period;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    this.elStatTotalCount.textContent = summary.total;
    this.elStatMaleCount.textContent = summary.male;
    this.elStatFemaleCount.textContent = summary.female;
    this.elStatUnknownCount.textContent = summary.unknown;
    this.renderWriterSummaryList(this.elStatWriterList, summary.writers, summary.writerContentCounts);
    this.renderSummaryList(this.elStatExtraList, summary.extras, "추가 사항 없음", summary);
    this.renderSummaryList(this.elStatPrescriptionList, summary.prescriptions, "입력된 처방 없음");
    if (period !== "day") {
      this.appendSummaryAverages(this.elStatWriterList, summary.writerContentCounts);
      this.appendSummaryAverages(this.elStatExtraList, summary.extras);
      this.appendSummaryAverages(this.elStatPrescriptionList, summary.prescriptions);
    }
  }

}
