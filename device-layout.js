// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTDeviceLayout {
  readDeviceSummaryState() {
    try {
      const snapshot = JSON.parse(localStorage.getItem(`${SUMMARY_CLOSED_STORAGE_KEY}_SNAPSHOT`) || "null");
      if (typeof snapshot?.closed === "boolean" && Number.isFinite(snapshot.updatedAt)) return snapshot;
      return { closed: localStorage.getItem(SUMMARY_CLOSED_STORAGE_KEY) === "1", updatedAt: 0 };
    } catch (_) {
      return { closed: false, updatedAt: 0 };
    }
  }

  isSummaryClosed() {
    return this.deviceSummaryState?.closed ?? this.readDeviceSummaryState().closed;
  }

  persistLocalSummaryState(snapshot) {
    try { localStorage.setItem(`${SUMMARY_CLOSED_STORAGE_KEY}_SNAPSHOT`, JSON.stringify(snapshot)); } catch (_) {}
    try {
      if (snapshot.closed) localStorage.setItem(SUMMARY_CLOSED_STORAGE_KEY, "1");
      else localStorage.removeItem(SUMMARY_CLOSED_STORAGE_KEY);
    } catch (_) {}
  }

  queueDeviceSummaryState(snapshot) {
    if (!this.summaryStateStore) return;
    const previous = this.summaryStateWrite || Promise.resolve();
    const write = this.summaryStateStore("device-summary-state-v1", snapshot);
    this.summaryStateWrite = Promise.all([previous, write]).catch(error => {
      console.error("Failed to persist device summary state:", error);
      this.showSaveIndicator?.("현황창 설정 저장 실패 · 기기 저장 공간을 확인해 주세요", true);
    });
  }

  async restoreDeviceSummaryState(store) {
    this.summaryStateStore = store;
    const persisted = await store("device-summary-state-v1");
    const local = this.deviceSummaryState || this.readDeviceSummaryState();
    // Never undo a toggle made while the disk state is still loading.
    if (!this.summaryStateChanged && typeof persisted?.closed === "boolean" &&
        Number.isFinite(persisted.updatedAt) && persisted.updatedAt >= local.updatedAt) {
      this.deviceSummaryState = persisted;
      this.persistLocalSummaryState(persisted);
      this.setSummaryClosed(persisted.closed, false);
    } else {
      this.deviceSummaryState = local;
      this.queueDeviceSummaryState(local);
      await this.summaryStateWrite;
    }
  }

  setSummaryClosed(closed, save = true) {
    const sidebar = document.getElementById("summarySidebar");
    const button = document.getElementById("btnToggleSummary");
    if (sidebar) {
      if (closed && sidebar.contains?.(document.activeElement)) button?.focus({ preventScroll: true });
      sidebar.classList.toggle("summary-closed", closed);
      sidebar.inert = closed;
      sidebar.setAttribute?.("aria-hidden", String(closed));
    }
    if (button) {
      button.setAttribute("aria-expanded", String(!closed));
      button.title = closed ? "현황 열기" : "현황 닫기";
      button.setAttribute("aria-label", closed ? "현황 열기" : "현황 닫기");
    }
    if (save) {
      const previous = this.deviceSummaryState || this.readDeviceSummaryState();
      const snapshot = { closed, updatedAt: Math.max(Date.now(), previous.updatedAt + 1) };
      this.summaryStateChanged = true;
      this.deviceSummaryState = snapshot;
      this.persistLocalSummaryState(snapshot);
      this.queueDeviceSummaryState(snapshot);
    }
    if (typeof this.syncMainColumnWidths === "function") this.syncMainColumnWidths();
  }

  setToolbarActionsClosed(closed, save = true) {
    const panel = document.getElementById("collapsibleToolbarActions");
    const button = document.getElementById("btnToggleToolbarActions");
    if (!panel || !button) return;
    if (closed && panel.contains(document.activeElement)) button.focus({ preventScroll: true });
    panel.classList.toggle("is-collapsed", closed);
    panel.inert = closed;
    panel.setAttribute("aria-hidden", String(closed));
    button.setAttribute("aria-expanded", String(!closed));
    button.title = closed ? "빠른 도구 및 설정 펼치기" : "빠른 도구 및 설정 접기";
    button.setAttribute("aria-label", button.title);
    if (save) {
      try { localStorage.setItem("PT_TOOLBAR_ACTIONS_COLLAPSED_V1", String(closed)); }
      catch (error) { console.error("Failed to persist device toolbar state:", error); }
    }
  }

  initToolbarActionsToggle() {
    let closed = false;
    try { closed = localStorage.getItem("PT_TOOLBAR_ACTIONS_COLLAPSED_V1") === "true"; }
    catch { /* Keep the toolbar open when device storage is unavailable. */ }
    this.setToolbarActionsClosed(closed, false);
    document.getElementById("btnToggleToolbarActions")?.addEventListener("click", () => {
      const panel = document.getElementById("collapsibleToolbarActions");
      this.setToolbarActionsClosed(!panel?.classList.contains("is-collapsed"));
    });
  }

  initSummaryToggle() {
    if (this.isSummaryClosed()) {
      this.setSummaryClosed(true, false);
    }
    document.getElementById("btnToggleSummary")?.addEventListener("click", () => {
      const sidebar = document.getElementById("summarySidebar");
      const nextClosed = sidebar ? !sidebar.classList.contains("summary-closed") : true;
      this.setSummaryClosed(nextClosed, true);
    });
  }

  initColumnResizing() {
    let activeTh = null;
    let activeColKey = null;
    let startX = 0;
    let startWidth = 0;
    let fixedRight = 0;

    // 기기별로 저장된 열 너비 초기 로딩 시 복원 적용
    document.querySelectorAll(".col-headers-row th.col-letter").forEach(th => {
      th.dataset.defaultWidth ||= String(parseFloat(th.style.width));
    });
    this.applySavedColumnWidths();

    const startResize = (resizerEl, clientX) => {
      // Freeze every displayed column before resizing: table-layout otherwise
      // redistributes spare width when the viewport or history columns change.
      const saved = this.getSavedColumnWidths();
      const measured = Array.from(document.querySelectorAll(".col-headers-row th.col-letter"), th => ({
        th, width: Number.isFinite(saved[th.dataset.col]) && saved[th.dataset.col] > 0
          ? saved[th.dataset.col]
          : this.hasFixedColumnWidths || window.getComputedStyle(th).display === "none"
            ? parseFloat(th.style.width) : th.getBoundingClientRect().width
      }));
      measured.forEach(({ th, width }) => {
        if (Number.isFinite(width) && width > 0) {
          th.style.width = `${width}px`;
          th.style.minWidth = `${width}px`;
          saved[th.dataset.col] = width;
        }
      });
      this.persistColumnWidths(saved);
      this.hasFixedColumnWidths = true;
      this.syncMainColumnWidths();
      const sourceTh = resizerEl.closest("th");
      activeTh = sourceTh.closest(".cross-date-inner-table")
        ? document.querySelector(`.col-headers-row th[data-col="${sourceTh.dataset.col}"]`)
        : sourceTh;
      activeColKey = activeTh?.dataset?.col || null;
      startX = clientX;
      startWidth = saved[activeColKey] || parseFloat(activeTh.style.width) || activeTh.getBoundingClientRect().width;
      fixedRight = activeTh.getBoundingClientRect().right;
      resizerEl.classList.add("resizing");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };

    const doResize = (clientX) => {
      if (!activeTh) return;
      const diff = clientX - startX;
      const newWidth = Math.max(activeColKey === "spacer" ? 10 : 35, startWidth + (activeColKey === "spacer" ? -diff : diff));
      activeTh.style.width = `${newWidth}px`;
      activeTh.style.minWidth = `${newWidth}px`;
      this.saveColumnWidth(activeColKey, newWidth);
      this.syncCrossDateColWidths();
      if (activeColKey === "spacer") {
        // The trailing column grows leftward; compensate horizontal overflow to keep its right edge in place.
        this.elSheetContainer.scrollLeft += activeTh.getBoundingClientRect().right - fixedRight;
      }
    };

    const endResize = () => {
      if (activeTh) {
        const resizer = activeTh.querySelector(".col-resizer");
        if (resizer) resizer.classList.remove("resizing");

        // 기기별 localStorage에 열 너비 영구 저장
        if (activeColKey) {
          const finalWidth = parseFloat(activeTh.style.width) || activeTh.offsetWidth;
          this.saveColumnWidth(activeColKey, finalWidth);
        }

        activeTh = null;
        activeColKey = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    // 마우스 이벤트 리스너
    document.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("col-resizer")) {
        e.preventDefault();
        e.stopPropagation();
        startResize(e.target, e.pageX);
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (activeTh) {
        doResize(e.pageX);
      }
    });

    document.addEventListener("mouseup", () => {
      endResize();
    });

    // 태블릿/모바일 터치 이벤트 리스너
    document.addEventListener("touchstart", (e) => {
      if (e.touches.length > 1) {
        endResize();
        return;
      }
      if (e.target.classList.contains("col-resizer") && e.touches.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        startResize(e.target, e.touches[0].pageX);
      }
    }, { passive: false });

    document.addEventListener("touchmove", (e) => {
      if (e.touches.length > 1) {
        endResize();
        return;
      }
      if (activeTh && e.touches.length === 1) {
        e.preventDefault();
        doResize(e.touches[0].pageX);
      }
    }, { passive: false });

    document.addEventListener("touchend", () => {
      endResize();
    });
    document.addEventListener("touchcancel", endResize);

    // 리사이저 더블클릭 시 해당 열 기본 너비로 복원 기능
    document.addEventListener("dblclick", (e) => {
      if (e.target.classList.contains("col-resizer")) {
        e.preventDefault();
        e.stopPropagation();
        const th = e.target.closest("th");
        const colKey = th?.dataset?.col;
        if (colKey) {
          this.resetColumnWidth(colKey);
        }
      }
    });
  }

  saveColumnWidth(colKey, width) {
    const saved = this.getSavedColumnWidths();
    saved[colKey] = width;
    this.persistColumnWidths(saved);
  }

  getSavedColumnWidths() {
    if (this.deviceColumnWidths) return { ...this.deviceColumnWidths };
    return this.readDeviceColumnWidths().widths;
  }

  readDeviceColumnWidths() {
    let snapshot = null;
    try { snapshot = JSON.parse(localStorage.getItem(`${COL_WIDTHS_STORAGE_KEY}_SNAPSHOT`) || 'null'); } catch (_) {}
    let legacy = {widths:{},updatedAt:0};
    try {
      const data = localStorage.getItem(COL_WIDTHS_STORAGE_KEY);
      const saved = data ? JSON.parse(data) : {};
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) legacy = {
        widths:saved, updatedAt:Number(localStorage.getItem(`${COL_WIDTHS_STORAGE_KEY}_UPDATED_AT`)) || 0
      };
    } catch (_) {}
    return snapshot?.widths && typeof snapshot.widths === 'object' && !Array.isArray(snapshot.widths) && Number.isFinite(snapshot.updatedAt) &&
      snapshot.updatedAt >= legacy.updatedAt ? snapshot : legacy;
  }

  persistLocalColumnWidths(snapshot) {
    let atomicSaved = false, legacySaved = false;
    try {
      // Keep widths and their version together so an interrupted save cannot
      // pair old widths with a new timestamp on the next launch.
      localStorage.setItem(`${COL_WIDTHS_STORAGE_KEY}_SNAPSHOT`, JSON.stringify(snapshot));
      atomicSaved = true;
    } catch (_) {}
    try {
      localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(snapshot.widths));
      localStorage.setItem(`${COL_WIDTHS_STORAGE_KEY}_UPDATED_AT`, String(snapshot.updatedAt));
      legacySaved = true;
    } catch (_) {}
    this.columnWidthsLocalSaveFailed = !atomicSaved && !legacySaved;
  }

  persistColumnWidths(widths) {
    this.deviceColumnWidths = { ...widths };
    this.columnWidthsChanged = true;
    const snapshot = { widths: { ...widths }, updatedAt: Math.max(Date.now(),
      (this.columnWidthsUpdatedAt || this.readDeviceColumnWidths().updatedAt || 0) + 1) };
    this.columnWidthsUpdatedAt = snapshot.updatedAt;
    this.persistLocalColumnWidths(snapshot);
    this.queueDeviceColumnWidths(snapshot);
  }

  queueDeviceColumnWidths(snapshot) {
    if (!this.columnWidthsStore) return;
    const previous = this.columnWidthsWrite || Promise.resolve();
    // Start each write now instead of leaving the final drag position behind a
    // long promise queue when the user closes the app. IndexedDB orders writes.
    const write = (async () => {
      await this.columnWidthsStore("device-column-widths-v1", snapshot);
      const restored = await this.columnWidthsStore("device-column-widths-v1");
      if (!restored || restored.updatedAt < snapshot.updatedAt ||
          (restored.updatedAt === snapshot.updatedAt && JSON.stringify(restored.widths) !== JSON.stringify(snapshot.widths))) {
        throw new Error("열 너비 저장 검증에 실패했습니다.");
      }
    })();
    this.columnWidthsWrite = Promise.all([previous, write]).catch(error => {
      console.error("Failed to persist device column widths:", error);
      this.showSaveIndicator?.("열 너비 저장 실패 · 기기 저장 공간을 확인해 주세요", true);
    });
  }

  async restoreDeviceColumnWidths(store) {
    this.columnWidthsStore = store;
    const persisted = await store("device-column-widths-v1");
    const localUpdatedAt = this.readDeviceColumnWidths().updatedAt;
    const saved = this.getSavedColumnWidths();
    // A resize during startup must win over the asynchronous disk read.
    if (!this.columnWidthsChanged && persisted?.widths && persisted.updatedAt >= localUpdatedAt) {
      this.deviceColumnWidths = { ...persisted.widths };
      this.columnWidthsUpdatedAt = persisted.updatedAt;
      this.persistLocalColumnWidths(persisted);
      this.applySavedColumnWidths();
      this.syncCrossDateColWidths();
    } else if (Object.keys(saved).length) {
      this.deviceColumnWidths = { ...saved };
      this.queueDeviceColumnWidths({ widths: saved, updatedAt: this.columnWidthsUpdatedAt || localUpdatedAt || Date.now() });
      await this.columnWidthsWrite;
    }
  }

  applySavedColumnWidths() {
    const saved = this.getSavedColumnWidths();
    if (!saved || typeof saved !== "object") return;

    // Pin all tracks from the first render, even before a device has any saved
    // widths. Hiding visitTime in history must never redistribute that space.
    this.hasFixedColumnWidths = true;
    document.querySelectorAll(".col-headers-row th.col-letter").forEach(th => {
      const width = saved[th.dataset.col];
      if (Number.isFinite(width) && width > 0) {
        th.style.width = `${width}px`;
        th.style.minWidth = `${width}px`;
      }
    });
    this.syncMainColumnWidths();
  }

  syncMainColumnWidths() {
    if (!this.hasFixedColumnWidths) return;
    const table = document.getElementById("excelTable");
    if (!table) return;
    const headers = Array.from(document.querySelectorAll(".col-headers-row th"));
    const bHeaders = Array.from(document.querySelectorAll(".business-headers-row th"));
    const saved = this.getSavedColumnWidths();
    // A colgroup controls the actual table tracks, including the trailing blank
    // column. Header widths alone can be redistributed by the table algorithm.
    let group = table.querySelector("colgroup.device-column-widths");
    if (!group) {
      group = document.createElement("colgroup");
      group.className = "device-column-widths";
      table.insertBefore(group, table.firstChild);
    }
    const cols = [];
    let width = 0;
    for (let i = 0; i < headers.length; i++) {
      const th = headers[i];
      const key = th.dataset.col;
      const columnWidth = key
        ? (Number.isFinite(saved[key]) && saved[key] > 0 ? saved[key] : parseFloat(th.style.width))
        : 48;
      if (!Number.isFinite(columnWidth) || columnWidth <= 0) continue;
      th.style.width = `${columnWidth}px`;
      th.style.minWidth = `${columnWidth}px`;
      th.style.maxWidth = `${columnWidth}px`;
      if (bHeaders[i]) {
        bHeaders[i].style.width = `${columnWidth}px`;
        bHeaders[i].style.minWidth = `${columnWidth}px`;
        bHeaders[i].style.maxWidth = `${columnWidth}px`;
      }
      if (window.getComputedStyle(th).display === "none") {
        if (bHeaders[i]) bHeaders[i].style.display = "none";
        continue;
      }
      const col = document.createElement("col");
      col.dataset.col = key || "rowHeader";
      col.style.width = `${columnWidth}px`;
      cols.push(col);
      width += columnWidth;
    }
    group.replaceChildren(...cols);
    table.style.width = `${width}px`;
    table.style.minWidth = `${width}px`;
    table.style.maxWidth = `${width}px`;
  }

  resetColumnWidth(colKey) {
    try {
      const saved = this.getSavedColumnWidths();
      delete saved[colKey];
      this.persistColumnWidths(saved);
      const th = document.querySelector(`th.col-letter[data-col="${colKey}"]`);
      if (th) {
        th.style.width = th.dataset.defaultWidth ? `${th.dataset.defaultWidth}px` : "";
        th.style.minWidth = "";
      }
      this.syncCrossDateColWidths();
      this.showSaveIndicator("기본 열 너비로 초기화됨");
    } catch (err) {
      console.error("Failed to reset column width:", err);
    }
  }

}
