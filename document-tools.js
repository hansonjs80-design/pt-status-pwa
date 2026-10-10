// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTDocumentTools {
  // --- Preview & Print Modal ---
  openPreviewModal() {
    const rows = this.getCurrentRows().filter((r) => r.name || r.chartNo || r.part || r.prescription || r.extra);

    const [y, m, d] = this.currentDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const daysKor = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
    const dayLabel = daysKor[dateObj.getDay()] || "";
    const dateTitle = `${y}년 ${m}월 ${d}일`;

    this.elPreviewModalDate.textContent = dateTitle;
    this.elPrintDateFull.textContent = `${dateTitle} (${dayLabel})`;

    const summary = this.getDailySummary(rows);
    this.elPrintTableBody.replaceChildren();
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    for (const row of rows) {
      const tr = document.createElement("tr");
      if (row._lunchBefore) tr.className = "print-lunch-row";
      for (const key of keys) {
        const td = document.createElement("td");
        td.textContent = String(row[key] ?? "");
        tr.appendChild(td);
      }
      this.elPrintTableBody.appendChild(tr);
    }
    if (!rows.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = keys.length; td.textContent = "해당 날짜에 입력된 현황이 없습니다.";
      tr.appendChild(td); this.elPrintTableBody.appendChild(tr);
    }
    this.elPrintTotalCount.textContent = summary.total;
    this.elPrintMaleCount.textContent = summary.male;
    this.elPrintFemaleCount.textContent = summary.female;
    document.getElementById("printExtras").textContent = [...summary.extras].map(([name, count]) => `${name}: ${this.formatExtraCount(summary, name, count)}건`).join(" · ") || "추가 사항 없음";

    const now = new Date();
    this.elPrintGeneratedTime.textContent = now.toLocaleString("ko-KR");

    this.elPreviewModal.style.display = "flex";
  }

  closePreviewModal() {
    this.elPreviewModal.style.display = "none";
  }

  // --- CSV Export ---
  exportCurrentDayCsv() {
    const rows = this.getCurrentRows().filter((r) => r.name || r.chartNo || r.part || r.prescription || r.extra);
    if (rows.length === 0) {
      alert("내보낼 데이터가 없습니다.");
      return;
    }

    const headers = ["No.", "성별", "챠트번호", "성함", "부위", "처방", "추가 사항", "작성", "메모", "특이 사항", "방문 시간"];
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel
    csvContent += headers.map((h) => `"${h}"`).join(",") + "\n";

    rows.forEach((r, idx) => {
      const line = [
        r.no || idx + 1,
        r.gender || "",
        r.chartNo || "",
        r.name || "",
        r.part || "",
        r.prescription || "",
        r.extra || "",
        r.writer || DEFAULT_WRITER,
        r.memo || "",
        r.specialNote || "",
        this.getVisitTime(r)
      ];
      csvContent += line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `물리치료현황_${this.currentDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // --- Backup & Restore Modal ---
  openBackupModal() {
    this.elBackupModal.style.display = "flex";
  }

  closeBackupModal() {
    this.elBackupModal.style.display = "none";
  }

  async downloadFullBackup() {
    if (window.ptLocalTools && typeof window.ptLocalTools.backup === "function") {
      try {
        await window.ptLocalTools.backup(false);
        return;
      } catch (err) {
        console.warn("로컬 백업 진행 중 알림:", err);
      }
    }
    const backupObj = {
      version: 1,
      createdAt: new Date().toISOString(),
      scope: "PT app records and presets",
      dataStore: this.dataStore,
      staffCalendarCounts: this.staffCountSettings || null,
      presets: typeof COLUMN_PRESETS !== "undefined" ? COLUMN_PRESETS : null
    };
    const dataStr = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PT현황_전체백업_${this.getTodayString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async restoreDataPayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("올바르지 않은 백업 데이터 형식입니다.");
    }
    const rawStore = payload.dataStore || payload;
    if (typeof rawStore !== "object" || Array.isArray(rawStore)) {
      throw new Error("백업 데이터에서 일지 기록을 찾을 수 없습니다.");
    }

    const validEntries = Object.entries(rawStore).filter(([date, rows]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(rows) && rows.every(row => row && typeof row === "object" && !Array.isArray(row))
    );

    if (validEntries.length === 0) {
      throw new Error("백업 데이터에 유효한 날짜별 물리치료 기록(YYYY-MM-DD)이 없습니다.");
    }

    const count = validEntries.length;
    const dates = validEntries.map(([d]) => d).sort();
    const range = count === 1 ? dates[0] : `${dates[0]} ~ ${dates[dates.length - 1]}`;

    if (typeof confirm === "function" && !confirm(`총 ${count}개 날짜(${range})의 물리치료 기록을 복원합니다.\n현재 기록은 복원 전 안전 백업으로 보관됩니다. 계속하시겠습니까?`)) {
      return false;
    }

    try {
      if (window.ptLocalTools && typeof window.ptLocalTools.backup === "function") {
        await window.ptLocalTools.backup(true);
      }
    } catch (safeErr) {
      console.warn("복원 전 안전 보관 백업 참고:", safeErr);
    }

    await this.syncBaselinesReady;
    const restored = Object.fromEntries(validEntries);
    this.dataStore = { ...this.dataStore, ...restored };
    this.editHistory.clear();
    this.getCurrentRows();

    // 복원된 각 날짜의 기존 동기화 기준선(syncBaselines)을 리셋하여
    // 클라우드 업로드 시 이전 데이터와의 잘못된 3-way 병합을 방지하고 복원 데이터가 온전히 반영되도록 함
    for (const date of Object.keys(restored)) {
      this.syncBaselines.delete(date);
      this.pendingSyncDates.add(date);
    }
    await this.persistSyncBaselines();
    localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates]));

    this.saveDataStore();

    // 복원된 프리셋 처리 (payload.presets 또는 payload.sharedPresets 지원)
    const rawPresets = payload.presets || payload.sharedPresets?.rows_data?.[0]?.presets;
    if (rawPresets && typeof rawPresets === "object" && Object.values(rawPresets).every(values => Array.isArray(values) && values.every(v => typeof v === "string"))) {
      COLUMN_PRESETS = rawPresets;
      saveColumnPresets(COLUMN_PRESETS);
      this.renderQuickChips();
      this.schedulePresetSync();
    }

    // Supabase 연결 상태인 경우 복원된 모든 날짜를 즉시 클라우드로 동기화 예약 및 다른 기기에 브로드캐스트
    if (this.supabaseClient) {
      for (const date of Object.keys(restored)) {
        this.scheduleSupabaseSync(date);
      }
      this.notifyCloudChange(this.currentDate);
    }

    this.setDate(this.currentDate);
    if (typeof alert === "function") {
      alert(`백업 복원 완료!\n총 ${count}개 날짜의 기록이 성공적으로 복원되었습니다.${this.supabaseClient ? "\n(슈파베이스 클라우드 및 다른 기기 실시간 동기화 진행 중)" : ""}`);
    }
    this.closeBackupModal();
    return true;
  }

  handleRestoreFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target.result);
        await this.restoreDataPayload(payload);
      } catch (err) {
        alert("복원을 진행하지 못했습니다: " + err.message);
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  clearCurrentDayData() {
    if (confirm(`정말로 ${this.currentDate} 날짜의 데이터를 모두 초기화하시겠습니까?`)) {
      this.dataStore[this.currentDate] = this.createDefaultEmptyRows();
      this.saveDataStore();
      this.renderTable();
      this.closeBackupModal();
    }
  }

}
