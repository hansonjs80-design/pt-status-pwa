// Feature methods installed on PTApp before startup; state remains on the app instance.
class PTHistoryTable {
  selectCrossDateRow(idx) {
    if (this.genderPickerState) this.closeGenderDropdown();
    if (!this.crossDateResults || idx < 0 || idx >= this.crossDateResults.length) return;
    this.isCrossDateRowSelected = true;
    // No. 열(col 0)부터 특이사항(col 9)까지만 전체 행 선택
    this.selectCrossDateCell(idx, 0);
    this.selectCrossDateCell(idx, 9, true);
    this.isSelectingCrossDate = false; // 마우스 이동 시 임의 선택 방지

    this.elTableBody.querySelectorAll(".cross-date-row").forEach(r => r.classList.remove("cross-date-row-selected"));
    const tr = this.elTableBody.querySelector(`.cross-date-row[data-cross-idx="${idx}"]`)
      || this.elTableBody.querySelector(`[data-cross-idx="${idx}"]`)?.closest("tr");
    tr?.classList.add("cross-date-row-selected");

    this.elTableBody.querySelectorAll(".cross-date-num").forEach(th => th.classList.remove("selected", "header-active"));
    const th = tr?.querySelector(".cross-date-num");
    th?.classList.add("selected", "header-active");
    th?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  toggleCrossDateExpanded() {
    this.isCrossDateExpanded = !this.isCrossDateExpanded;
    this.renderCrossDateSection();
  }

  syncHistoryRowHeaderPosition() {
    // History has its own vertical scroller; offset its sticky first column by
    // the shared sheet's horizontal scroll so dates remain clickable at the left.
    this.elSheetContainer?.style?.setProperty?.("--history-scroll-left", `${this.elSheetContainer.scrollLeft || 0}px`);
    const right = Math.max(0, (this.elSheetContainer?.scrollWidth || 0) -
      (this.elSheetContainer?.clientWidth || 0) - (this.elSheetContainer?.scrollLeft || 0));
    this.elSheetContainer?.style?.setProperty?.("--history-scroll-right", `${right}px`);
  }

  syncCrossDateColWidths() {
    this.syncMainColumnWidths();
    this.syncHistoryRowHeaderPosition();
    const innerTable = document.getElementById("crossDateInnerTable");
    if (!innerTable) return;
    const excelTable = document.getElementById("excelTable");
    if (!excelTable) return;
    const bHeadersRow = document.querySelector(".business-headers-row");
    if (!bHeadersRow) return;

    let colgroup = innerTable.querySelector("colgroup");
    if (!colgroup) {
      colgroup = document.createElement("colgroup");
      innerTable.insertBefore(colgroup, innerTable.firstChild);
    }
    if (colgroup.replaceChildren) {
      colgroup.replaceChildren();
    } else {
      while (colgroup.firstChild) colgroup.removeChild(colgroup.firstChild);
    }

    // 메인 테이블 비즈니스 헤더의 모든 14개 열과 1:1로 정확하게 col 및 셀 너비 동기화 (비율 축소 없이 1:1 절대값 적용)
    const headerThs = Array.from(bHeadersRow.children);
    const colWidths = headerThs.map((th) => {
      const isHidden = window.getComputedStyle(th).display === "none";
      if (isHidden) return 0;
      const rect = th.getBoundingClientRect();
      return rect.width;
    });

    // 숨긴 열과 colspan으로 생긴 빈 공간을 제외한 실제 열 너비 합을 사용한다.
    const visibleCount = colWidths.filter(w => w > 0).length;
    document.querySelectorAll(".cross-date-master-cell, .cross-date-divider td").forEach(cell => {
      cell.colSpan = visibleCount;
    });
    const width = colWidths.reduce((sum, w) => sum + w, 0);
    innerTable.style.width = `${width}px`;
    innerTable.style.minWidth = `${width}px`;

    // 브라우저 colgroup에는 보이는 열만 추가해야 렌더링 셀과 1:1로 매핑됨 (display:none 열 제외)
    colWidths.forEach((w) => {
      if (w > 0) {
        const col = document.createElement("col");
        col.style.width = `${w}px`;
        colgroup.appendChild(col);
      }
    });

    // innerTable의 각 cross-date-row 내 모든 셀(th 및 td)에 메인 헤더와 동일한 정확한 픽셀 너비 적용
    innerTable.querySelectorAll(".cross-date-row, .cross-date-headers-row").forEach((tr) => {
      Array.from(tr.children).forEach((cell, idx) => {
        const w = colWidths[idx];
        if (w === 0 || w === undefined) {
          cell.style.display = "none";
        } else {
          cell.style.display = "";
          cell.style.width = `${w}px`;
          cell.style.minWidth = `${w}px`;
          cell.style.maxWidth = `${w}px`;
          cell.style.boxSizing = "border-box";
        }
      });
    });
  }

  restoreCurrentTableHeader() {
    const row = document.querySelector(".current-history-headers");
    if (!row) return;
    row.classList.remove("current-history-headers");
    row.querySelectorAll("th").forEach(cell => { cell.style.top = ""; });
    document.getElementById("excelTable")?.querySelector("thead")?.appendChild(row);
  }

  updateCrossDateStickyOffsets() {
    const masterCell = document.querySelector(".cross-date-master-cell");
    const divider = document.getElementById("crossDateDivider");
    if (!masterCell || !divider) return;
    const header = document.getElementById("excelTable")?.querySelector("thead");
    const headerHeight = header?.getBoundingClientRect().height || 49;
    masterCell.style.top = `${headerHeight}px`;
    const dividerTop = headerHeight + masterCell.getBoundingClientRect().height;
    divider.querySelectorAll("td").forEach(cell => {
      cell.style.top = `${dividerTop}px`;
    });
    const currentHeader = document.querySelector(".current-history-headers");
    const currentTop = dividerTop + divider.getBoundingClientRect().height;
    currentHeader?.querySelectorAll("th").forEach(cell => { cell.style.top = `${currentTop}px`; });
  }

  renderCrossDateSection({ preserveCurrentSelection = false, selectLatestHistory = false } = {}) {
    const existingWrap = typeof document !== "undefined" && typeof document?.getElementById === "function" ? document.getElementById("crossDateScrollWrap") : null;
    const preservedHistoryScrollTop = this._preservedHistoryScrollTop ?? existingWrap?.scrollTop;
    this.restoreCurrentTableHeader();
    this.historyLayoutObserver?.disconnect();
    this.historyLayoutObserver = null;
    // 기존 마스터 행 및 구분선 제거
    document.querySelectorAll(".cross-date-master-row, .cross-date-divider").forEach(el => el.remove());

    const groupMap = this.crossDateGroups;
    const allMatchedRows = this.allCrossDateMatchedRows || [];
    if (!groupMap || allMatchedRows.length === 0) {
      this.crossDateResults = [];
      const thRowNumHeader = document.querySelector(".business-headers-row th.row-num-header");
      if (thRowNumHeader) {
        thRowNumHeader.textContent = "#";
        thRowNumHeader.classList.remove("cross-date-toggle-active");
        thRowNumHeader.onclick = null;
      }
      if (!preserveCurrentSelection) this.scrollToHistoryTarget();
      return;
    }

    // 렌더링할 행 목록 결정
    let renderRows = [];
    if (!this.isCrossDateExpanded) {
      // 대표 행 모드: 각 중복 그룹의 대표 1행만 (오래된 날짜가 위, 하단에 최근월일)
      renderRows = Array.from(groupMap.values()).map(g => ({
        ...g.representative,
        _dupCount: g.items.length
      })).sort((a, b) => (a._sourceDate > b._sourceDate ? 1 : a._sourceDate < b._sourceDate ? -1 : 0));
    } else {
      // 전체 펼치기 모드: 모든 매칭 행 표시
      renderRows = allMatchedRows.map(row => {
        const grp = groupMap.get(this.getHistoryDedupeKey(row));
        const isSubRow = grp && grp.items.length > 1 && grp.representative !== row;
        return {
          ...row,
          _dupCount: grp ? grp.items.length : 1,
          _isSubRow: isSubRow
        };
      });
    }

    this.crossDateResults = renderRows;

    const firstCurrentRow = this.elTableBody.firstChild;
    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];

    // 1) 마스터 행 생성 (스크롤 래퍼 및 내부 테이블 포함)
    const masterTr = document.createElement("tr");
    masterTr.className = "cross-date-master-row";

    const masterTd = document.createElement("td");
    masterTd.className = "cross-date-master-cell";
    masterTd.colSpan = 14;

    const scrollWrap = document.createElement("div");
    scrollWrap.className = "cross-date-scroll-wrap";
    scrollWrap.id = "crossDateScrollWrap";

    const innerTable = document.createElement("table");
    innerTable.className = "cross-date-inner-table";
    innerTable.id = "crossDateInnerTable";

    const historyHead = document.createElement("thead");
    const historyHeaders = document.createElement("tr");
    historyHeaders.className = "cross-date-headers-row";
    const headerKeys = [null, ...colKeys, "del", "spacer"];
    const headerLabels = ["날짜", "No.", "성별", "챠트번호", "성함", "부위", "처방", "추가 사항", "작성", "메모", "특이 사항", "방문 시간", "적용", ""];
    headerKeys.forEach((key, idx) => {
      const th = document.createElement("th");
      th.textContent = headerLabels[idx];
      if (idx === 0) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "history-date-toggle";
        toggle.textContent = `날짜 ${this.isCrossDateExpanded ? "▲" : "▼"}`;
        toggle.title = this.isCrossDateExpanded ? "대표 행만 보기" : "전체 날짜 기록 보기";
        toggle.setAttribute("aria-expanded", String(this.isCrossDateExpanded));
        toggle.addEventListener("click", e => {
          e.preventDefault(); e.stopPropagation(); this.toggleCrossDateExpanded();
        });
        th.textContent = "";
        th.appendChild(toggle);
      }
      if (headerLabels[idx] === "적용") th.className = "history-apply-header";
      if (key) {
        th.dataset.col = key;
        const resizer = document.createElement("span");
        resizer.className = "col-resizer";
        resizer.title = "드래그하여 열 너비 조절";
        th.appendChild(resizer);
      }
      historyHeaders.appendChild(th);
    });
    historyHead.appendChild(historyHeaders);
    innerTable.appendChild(historyHead);
    const innerTbody = document.createElement("tbody");

    // 행 렌더링
    renderRows.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.className = `excel-row cross-date-row ${row._isSubRow ? "cross-date-subrow" : ""}`;
      tr.dataset.crossDate = row._sourceDate;
      tr.dataset.crossIdx = idx;

      // 행 번호 (날짜 약어 + 중복 건수/화살표)
      const thNum = document.createElement("th");
      thNum.className = "row-num cross-date-num";
      thNum.dataset.crossIdx = idx;

      const headerContent = document.createElement("div");
      headerContent.className = "cross-date-header-content";

      const dateSpan = document.createElement("span");
      dateSpan.className = "cross-date-day";
      if (row._sourceDate.slice(0, 4) < this.currentDate.slice(0, 4)) {
        dateSpan.classList.add("cross-date-day-previous-year");
      }
      dateSpan.textContent = row._sourceDate.slice(5).replace("-", "/");
      dateSpan.title = row._sourceDate;
      dateSpan.setAttribute("aria-label", row._sourceDate);
      headerContent.appendChild(dateSpan);

      if (row._dupCount > 1) {
        const toggleArrow = document.createElement("span");
        toggleArrow.className = `cross-date-toggle-arrow ${this.isCrossDateExpanded ? "expanded" : ""}`;
        toggleArrow.textContent = this.isCrossDateExpanded ? "▲" : "▼";
        toggleArrow.title = `${row._dupCount}건 기록 (클릭하여 전체/대표행 토글)`;
        toggleArrow.addEventListener("mousedown", (e) => {
          e.stopPropagation();
        });
        toggleArrow.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleCrossDateExpanded();
        });
        headerContent.appendChild(toggleArrow);
      }

      thNum.appendChild(headerContent);
      thNum.title = `${row._sourceDate} 기록 (클릭하여 행 전체 선택)`;

      thNum.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if (e.target.closest(".cross-date-toggle-arrow")) return;
        e.preventDefault();
        this.selectCrossDateRow(idx);
      });
      tr.appendChild(thNum);

      // 셀 렌더링
      colKeys.forEach((key, colIdx) => {
        const td = document.createElement("td");
        td.className = `excel-cell cell-${key} cross-date-cell`;
        td.dataset.crossIdx = idx;
        td.dataset.crossCol = key;
        td.dataset.crossColIdx = colIdx;
        this.applyCellFormatting(td, row, key);
        const val = row[key] || "";

        if (key === "gender") {
          const textSpan = document.createElement("span");
          textSpan.className = "cell-gender-text";
          textSpan.textContent = val;
          td.appendChild(textSpan);
          if (val === "F") td.classList.add("f");
          if (val === "M") td.classList.add("m");
        } else {
          this.renderColoredText(td, row, key);
        }

        td.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          this.isCrossDateRowSelected = false;
          this.elTableBody.querySelectorAll(".cross-date-num").forEach(th => th.classList.remove("selected", "header-active"));
          this.elTableBody.querySelectorAll(".cross-date-row").forEach(r => r.classList.remove("cross-date-row-selected"));
          if (e.ctrlKey || e.metaKey) { this.toggleCellSelection(idx, colIdx, "history"); return; }
          this.selectCrossDateCell(idx, colIdx, e.shiftKey);
          this.isSelectingCrossDate = true;
        });
        td.addEventListener("mouseenter", (e) => {
          if (this.isSelectingCrossDate && e.buttons === 1) {
            this.selectCrossDateCell(idx, colIdx, true);
          } else {
            this.isSelectingCrossDate = false;
          }
        });

        tr.appendChild(td);
      });

      // 적용 버튼 셀
      const actionCell = document.createElement("td");
      actionCell.className = "history-apply-cell";
      const applyButton = document.createElement("button");
      applyButton.type = "button";
      applyButton.className = "history-apply-btn";
      applyButton.textContent = "적용";
      applyButton.title = "선택한 셀 적용 · Enter (선택이 없으면 이 행 전체 적용)";
      applyButton.disabled = !this.historyApplyTarget || this.historyApplyTarget.date !== this.currentDate;
      applyButton.addEventListener("mouseenter", () => this.updateHistoryDestinationHighlight(row));
      applyButton.addEventListener("mouseleave", () => this.updateHistoryDestinationHighlight());
      applyButton.addEventListener("mousedown", e => e.preventDefault());
      applyButton.addEventListener("click", () => this.applyHistoryRow(row, { focusAppliedRow: true }));
      actionCell.appendChild(applyButton);
      tr.appendChild(actionCell);

      const spacer = document.createElement("td");
      spacer.className = "cell-spacer history-year-cell";
      const sourceYear = row._sourceDate.slice(0, 4);
      if (sourceYear !== this.currentDate.slice(0, 4)) {
        spacer.textContent = `${sourceYear}년`;
      }
      tr.appendChild(spacer);

      innerTbody.appendChild(tr);
    });

    innerTable.appendChild(innerTbody);
    scrollWrap.appendChild(innerTable);
    masterTd.appendChild(scrollWrap);
    masterTr.appendChild(masterTd);
    this.elTableBody.insertBefore(masterTr, firstCurrentRow);

    // 2) 구분선 (파란색 바)
    const dividerTr = document.createElement("tr");
    dividerTr.className = "cross-date-divider";
    dividerTr.id = "crossDateDivider";
    const dividerTd = document.createElement("td");
    dividerTd.colSpan = 14;
    const modeText = this.isCrossDateExpanded ? "전체 보기" : "대표 행 보기";
    dividerTd.innerHTML = `<span>📋 이전 날짜 기록 ${allMatchedRows.length}건 중 ${renderRows.length}건 표시 (${modeText} · 날짜 ▼ 클릭 시 토글) ↑ │ 현재 날짜 (${this.currentDate.replace(/-/g, ".")}) ↓</span>`;
    dividerTr.appendChild(dividerTd);
    this.elTableBody.insertBefore(dividerTr, firstCurrentRow);
    const currentHeader = document.querySelector(".business-headers-row");
    if (currentHeader) {
      currentHeader.classList.add("current-history-headers");
      this.elTableBody.insertBefore(currentHeader, firstCurrentRow);
    }

    // 3) 열 너비 동기화 및 파란 바 고정 위치(sticky top) 설정
    const syncHistoryLayout = () => {
      this.syncCrossDateColWidths();
      // Set the pinned panel geometry before selecting/scrolling the applied row.
      // 글꼴/사용자 행 높이가 달라도 첫 12행을 온전히 표시한다.
      const visibleRows = Array.from(innerTbody.children).slice(0, 12);
      const rowsHeight = visibleRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
      scrollWrap.style.maxHeight = `${historyHead.getBoundingClientRect().height + rowsHeight + 1}px`;
      this.updateCrossDateStickyOffsets();
    };
    syncHistoryLayout();
    requestAnimationFrame(() => {
      syncHistoryLayout();
      if (typeof ResizeObserver !== "undefined") {
        this.historyLayoutObserver = new ResizeObserver(() => {
          this.syncCrossDateColWidths();
          this.updateCrossDateStickyOffsets();
        });
        this.historyLayoutObserver.observe(scrollWrap);
        const header = document.getElementById("excelTable")?.querySelector("thead");
        if (header) {
          this.historyLayoutObserver.observe(header);
          header.querySelectorAll(".business-headers-row th").forEach(cell => this.historyLayoutObserver.observe(cell));
        }
      }
    });

    // 4) 기본적으로 가장 아래(최신 날짜) 마지막 행을 셀 선택 상태로 설정
    const restoreHistoryScroll = () => {
      const wrap = typeof document !== "undefined" && typeof document?.getElementById === "function" ? document.getElementById("crossDateScrollWrap") : null;
      if (wrap && preservedHistoryScrollTop !== undefined && preservedHistoryScrollTop !== null) {
        wrap.scrollTop = preservedHistoryScrollTop;
      }
    };

    if (renderRows.length > 0 && !preserveCurrentSelection && !this._isPasting &&
        (selectLatestHistory || preservedHistoryScrollTop === undefined || preservedHistoryScrollTop === null)) {
      const lastIdx = renderRows.length - 1;
      this.selectCrossDateRow(lastIdx);
      this.isSelectingCrossDate = false;
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          const scrollWrap = typeof document !== "undefined" && typeof document?.getElementById === "function" ? document.getElementById("crossDateScrollWrap") : null;
          if (scrollWrap && !this._isPasting) scrollWrap.scrollTop = scrollWrap.scrollHeight;
        });
      }
    } else if (preservedHistoryScrollTop !== undefined && preservedHistoryScrollTop !== null) {
      restoreHistoryScroll();
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          restoreHistoryScroll();
          setTimeout(restoreHistoryScroll, 30);
        });
      }
    }

    if (this.crossDateSelection) {
      this.renderCrossDateSelectionHighlight();
    }
  }

  renderCrossDateSelectionHighlight() {
    const selection = this.crossDateSelection;
    if (!selection) return;
    this.elTableBody?.querySelectorAll(".cross-date-cell").forEach(cell => {
      const r = Number(cell.dataset.crossIdx), c = Number(cell.dataset.crossColIdx);
      if (r < selection.minRow || r > selection.maxRow || c < selection.minCol || c > selection.maxCol) return;
      cell.classList.add("range-selected");
      if (r === selection.minRow) cell.classList.add("range-border-top");
      if (r === selection.maxRow) cell.classList.add("range-border-bottom");
      if (c === selection.minCol) cell.classList.add("range-border-left");
      if (c === selection.maxCol) cell.classList.add("range-border-right");
    });
    if (this.isCrossDateRowSelected) {
      this.elTableBody?.querySelectorAll(`.cross-date-row[data-cross-idx="${selection.minRow}"]`).forEach(row => {
        row.classList.add("cross-date-row-selected");
      });
    }
  }
}
