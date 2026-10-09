/**
 * 물리치료 현황 (PT Daily Log) PWA
 * Excel-Style Web Application
 */

// Initial Sample Data extracted directly from the user's Excel spreadsheet image
const INITIAL_SAMPLE_DATA = {
  "2026-09-29": [
    { no: 3, gender: "F", chartNo: "3387", name: "신재례", part: "양무", prescription: "사지 ( HP / Laser / ICT )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.29" },
    { no: 9, gender: "F", chartNo: "15307", name: "김시호", part: "오무", prescription: "학생 ( HP / Laser )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.29" },
    { no: 6, gender: "M", chartNo: "6780", name: "이춘식", part: "왼 고관절", prescription: "척추 ( HP / 자기장 / ICT )", extra: "", writer: "", memo: "", specialNote: "Lt.femur *핀(MW X)", date: "2026.09.29" },
    { no: 4, gender: "M", chartNo: "16133", name: "최의규", part: "Lt. Heel", prescription: "사지 ( HP / Laser / ICT )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.29" },
    { no: 10, gender: "F", chartNo: "15520", name: "정화자", part: "왼 손목", prescription: "사지 ( HP / Laser / ICT )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.29" },
    { no: 8, gender: "M", chartNo: "12208", name: "천진우", part: "왼 손목", prescription: "학생 ( HP / Laser )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.29" },
    { no: 1, gender: "F", chartNo: "12500", name: "양명자", part: "왼 엉", prescription: "척추 ( HP / 자기장 / ICT )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.29" },
    { no: 10, gender: "M", chartNo: "4079", name: "정서우", part: "Lt. Thigh", prescription: "학생 ( HP / Laser )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.29" },
    { no: 4, gender: "M", chartNo: "8064", name: "이영덕", part: "허리", prescription: "척추 ( HP / 자기장 / ICT )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.29" },
    { no: "", gender: "F", chartNo: "14358", name: "박서하", part: "Rt. heel", prescription: "X", extra: "충격파", writer: "", memo: "충완", specialNote: "", date: "2026.09.29" },
    { no: 9, gender: "M", chartNo: "5285", name: "전기운", part: "허리", prescription: "척추 ( HP / 자기장 / ICT )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.29" },
    { no: "", gender: "M", chartNo: "16155", name: "전재윤", part: "목", prescription: "척추 ( HP / 자기장 / ICT )", extra: "충격파", writer: "", memo: "충완", specialNote: "", date: "2026.09.29" },
    { no: "", gender: "M", chartNo: "16156", name: "김관웅", part: "우 발바닥", prescription: "사지 ( HP / Laser / ICT )", extra: "윈백", writer: "", memo: "충완", specialNote: "", date: "2026.09.29" },
    { no: 1, gender: "", chartNo: "", name: "김열중", part: "발목", prescription: "사지 ( HP / Laser / ICT )", extra: "이온", writer: "", memo: "이온 완", specialNote: "", date: "2026.09.29" }
  ],
  "2026-09-28": [
    { no: 1, gender: "F", chartNo: "105", name: "김경희", part: "오 손목", prescription: "사지 ( HP / Laser / ICT )", extra: "이온", writer: "", memo: "이온 완", specialNote: "", date: "2026.09.28" },
    { no: 4, gender: "F", chartNo: "10948", name: "오성희", part: "허리", prescription: "척추 ( HP / 자기장 / ICT )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.28" },
    { no: "", gender: "M", chartNo: "16056", name: "김민성", part: "허리", prescription: "척추 ( HP / 자기장 / ICT )", extra: "충격파", writer: "", memo: "충완", specialNote: "", date: "2026.09.28" },
    { no: 9, gender: "F", chartNo: "16122", name: "김현신", part: "오 등", prescription: "척추 ( HP / 자기장 / ICT )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.28" },
    { no: 3, gender: "F", chartNo: "15889", name: "이연진", part: "오 발등", prescription: "사지 ( HP / Laser / ICT )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.28" },
    { no: "", gender: "M", chartNo: "16154", name: "김세윤", part: "뗀무", prescription: "항냉 ( ICE / Laser )", extra: "", writer: "", memo: "", specialNote: "", date: "2026.09.28" }
  ]
};

const STORAGE_KEY = "PT_APP_DATA_STORAGE_V1";
const COL_WIDTHS_STORAGE_KEY = "PT_APP_COL_WIDTHS_STORAGE_V1";
const SUPABASE_CONFIG_KEY = "PT_SUPABASE_CONFIG_V1";
const SEARCH_PERIOD_STORAGE_KEY = "PT_SEARCH_PERIOD";
const DEFAULT_SUPABASE_URL = "https://uqivbmkeuupsaghwshcw.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaXZibWtldXVwc2FnaHdzaGN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0ODM3OTUsImV4cCI6MjA4NTA1OTc5NX0.FY86a0vaN_x-KeErBYAVyCpyXKsxloZiy7eysZGSFjk";
const DEFAULT_WRITER = "";
const BASE_ROW_NUMBER = 1; // 행 번호 1부터 시작
const DEFAULT_ROW_COUNT = 120; // 기본 하루 120개 행

// =============================================================================
// 엑셀(Excel) 기반 기본 단축키 설정 매핑 테이블
// 필요에 따라 나중에 이 설정 객체의 키 값을 자유롭게 변경할 수 있습니다.
// =============================================================================
const EXCEL_SHORTCUTS = {
  COPY: { key: "c", ctrlOrMeta: true, desc: "복사 (Ctrl+C / Cmd+C)" },
  CUT: { key: "x", ctrlOrMeta: true, desc: "잘라내기 (Ctrl+X / Cmd+X)" },
  PASTE: { key: "v", ctrlOrMeta: true, desc: "붙여넣기 (Ctrl+V / Cmd+V)" },
  CLEAR: { key: "Delete", ctrlOrMeta: false, desc: "내용 지우기 (Delete/Backspace)" },
  SELECT_ALL: { key: "a", ctrlOrMeta: true, desc: "전체 선택 (Ctrl+A)" },
  SAVE: { key: "s", ctrlOrMeta: true, desc: "저장 (Ctrl+S)" },
  PRINT: { key: "p", ctrlOrMeta: true, desc: "인쇄 및 미리보기 (Ctrl+P)" },
  SEARCH: { key: "f", ctrlOrMeta: true, desc: "환자 검색 (Ctrl+F)" },
  EDIT: { key: "F2", ctrlOrMeta: false, desc: "셀 직접 편집 (F2)" },
  INSERT_ROW: { key: "+", ctrlOrMeta: true, desc: "행 삽입 (Ctrl + '+')" },
  DELETE_ROW: { key: "-", ctrlOrMeta: true, desc: "행 삭제 (Ctrl + '-')" }
};

// 기본 프리셋 (초기값, 코드에 내장)
const DEFAULT_PRESETS = {
  prescription: [
    "사지 ( HP / Laser / ICT )",
    "척추 ( HP / 자기장 / ICT )",
    "학생 ( HP / Laser )",
    "항냉 ( ICE / Laser )",
    "X"
  ],
  part: [
    "허리",
    "목",
    "오 손목",
    "왼 손목",
    "양무",
    "오무",
    "뗀무",
    "왼 고관절",
    "오 고관절",
    "오 등",
    "오 발등",
    "우 발바닥",
    "Lt. Heel",
    "Rt. heel",
    "발목",
    "Lt. Thigh"
  ],
  writer: [],
  extra: [
    "충격파",
    "이온",
    "윈백",
    "도수치료",
    "견인"
  ]
};

const PRESETS_STORAGE_KEY = "PT_APP_CUSTOM_PRESETS_V1";
const SHARED_PRESETS_RECORD = "__pt_shared_presets_v1__";
const SHARED_COLUMN_FORMATTING_RECORD = "__pt_shared_column_formatting_v1__";
const SUMMARY_CLOSED_STORAGE_KEY = "device-summary-closed-v1";

// localStorage에서 사용자 커스텀 프리셋 로드 (없으면 기본값 사용)
function loadColumnPresets() {
  try {
    const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_PRESETS));
}

function saveColumnPresets(presets) {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    window.ptApp?.schedulePresetSync();
  } catch (_) {}
}

// 실제 사용되는 프리셋 (앱 시작 시 로드, 수정 시 갱신)
let COLUMN_PRESETS = loadColumnPresets();

class PTApp {
  constructor() {
    window.ptApp = this;
    this.dataStore = this.loadDataStore();
    this.columnFormatting = this.loadColumnFormatting();
    this.editHistory = new Map();
    this.cloudSearchHistory = {};
    this.currentDate = this.getTodayString();
    this.activeCell = null; // { rowIdx, colKey }
    this.selectedRowIdx = null;
    this.selectedColKey = null;
    this.sortState = { colKey: null, direction: "asc" };
    this.supabaseClient = null;
    this.supabaseSyncTimer = null;
    this.pendingSyncDates = new Set();
    this.syncTimers = new Map();
    this.syncBaselines = new Map();
    try { for (const [date, rows] of Object.entries(JSON.parse(localStorage.getItem("PT_SYNC_BASELINES") || "{}"))) this.syncBaselines.set(date, rows); } catch (_) {}
    this.activePushes = new Map();
    this.presetsDirty = localStorage.getItem("PT_PRESETS_PENDING") === "1";
    try { this.pendingSyncDates = new Set(JSON.parse(localStorage.getItem("PT_PENDING_DATES") || "[]")); } catch (_) {}

    // Autocomplete State
    this.autocompleteState = null; // { rowIdx, colKey, cellElement, input, candidates, selectedIndex }
    this._justCommittedFromAutocomplete = false;

    // Range Selection (Click & Drag)
    this.isSelectingRange = false;
    this.rangeStart = null; // { rowIdx, colIdx, colKey }
    this.rangeEnd = null;   // { rowIdx, colIdx, colKey }
    this.selectedRange = null; // { minRow, maxRow, minCol, maxCol }
    this.fillDrag = null;

    // Row Drag Selection (행 헤더 드래그 다중 선택)
    this.isSelectingRows = false;
    this.rowRangeStart = null;
    this.rowRangeEnd = null;
    this.selectedRowRange = null; // { minRow, maxRow }

    // Clipboard & Context Menu
    this.clipboardBuffer = ""; // 내부 클립보드 버퍼 (TSV 형식)
    this.clipboardSelection = null;
    this.contextTarget = null; // { type: 'cell'|'row'|'col'|'corner', rowIdx, colKey, colIdx }

    this.cacheElements();
    this.bindEvents();
    this.initContextMenu();
    this.initColumnResizing();
    this.initSupabase();
    this.initPWA();

    // Start with today's date and auto-focus
    this.getCurrentRows();
    this.editHistory.clear();
    this.setDate(this.currentDate, true);
  }

  // Helper: Get local Date string YYYY-MM-DD
  getTodayString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Load from LocalStorage or initialize with sample
  loadDataStore() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to parse localStorage data", e);
    }
    // Save sample data on first run
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SAMPLE_DATA));
    return JSON.parse(JSON.stringify(INITIAL_SAMPLE_DATA));
  }

  saveDataStore(recordHistory = true) {
    this.visitNameState ||= new WeakMap();
    this.visitTimeState ||= new WeakMap();
    for (const row of this.dataStore[this.currentDate] || []) {
      if (recordHistory && this.visitTimeState.has(row) && this.visitTimeState.get(row) !== String(row.visitTime ?? "")) row._visitTimeEdited = true;
      const hasName = Boolean(String(row.name || "").trim());
      if (recordHistory && !hasName && this.visitNameState.get(row) === true) {
        row.visitTime = "";
        delete row._visitedAt;
        delete row._visitTimeEdited;
        if (row._richText) delete row._richText.visitTime;
        const cell = this.elTableBody?.querySelector(`[data-row="${this.dataStore[this.currentDate].indexOf(row)}"][data-col="visitTime"]`);
        if (cell) this.renderColoredText(cell, row, "visitTime");
      }
      if (recordHistory && hasName && this.visitNameState.get(row) === false && !row.visitTime && !row._visitedAt && !row._visitTimeEdited) {
        const now = new Date(); row._visitedAt = now.toISOString();
        row.visitTime = `${String(now.getHours()).padStart(2, "0")}시 ${String(now.getMinutes()).padStart(2, "0")}분 ${String(now.getSeconds()).padStart(2, "0")}초`;
        const cell = this.elTableBody?.querySelector(`[data-row="${(this.dataStore[this.currentDate] || []).indexOf(row)}"][data-col="visitTime"]`);
        if (cell) this.renderColoredText(cell, row, "visitTime");
      }
      this.visitNameState.set(row, hasName);
      this.visitTimeState.set(row, String(row.visitTime ?? ""));
    }
    if (recordHistory && !this.isEditingCell()) this.captureHistory();
    this.updateHistoryButtons();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.dataStore));
      this.showSaveIndicator("저장 완료됨");
      this.updateSidebarStats();
      this.scheduleSupabaseSync();
    } catch (e) {
      console.error("Save error", e);
      this.showSaveIndicator("저장 실패", true);
    }
  }

  isEditingCell() {
    const focused = document.activeElement;
    return focused === this.elFormulaInput ||
      Boolean(focused?.matches(".cell-input-element:not(.is-armed)"));
  }

  getEditHistory(date = this.currentDate) {
    this.editHistory ||= new Map();
    if (!this.editHistory.has(date)) {
      this.editHistory.set(date, { undo: [], redo: [], current: JSON.stringify(this.dataStore?.[date] || []) });
    }
    return this.editHistory.get(date);
  }

  captureHistory() {
    if (!this.dataStore || !this.currentDate) return;
    this.editHistory ||= new Map();
    const history = this.getEditHistory();
    if (!history) return;
    const next = JSON.stringify(this.dataStore[this.currentDate] || []);
    if (next === history.current) return;
    history.undo.push(history.current);
    if (history.undo.length > 50) history.undo.shift();
    history.current = next;
    history.redo = [];
  }

  updateHistoryButtons() {
    if (!this.editHistory || !this.currentDate) return;
    const history = this.getEditHistory();
    const pending = JSON.stringify(this.dataStore[this.currentDate] || []) !== history.current;
    const undo = document.getElementById("btnUndo");
    const redo = document.getElementById("btnRedo");
    if (undo) undo.disabled = !pending && history.undo.length === 0;
    if (redo) redo.disabled = pending || history.redo.length === 0;
  }

  restoreEditHistory(redo = false) {
    // Commit the current edit before restoring; a late blur must not overwrite undo.
    if (document.activeElement?.matches(".cell-input-element") || document.activeElement === this.elFormulaInput) {
      document.activeElement.blur();
    }
    clearTimeout(this._saveTimer);
    this.captureHistory();
    const history = this.getEditHistory();
    const from = redo ? history.redo : history.undo;
    if (!from.length) { this.updateHistoryButtons(); return; }
    const to = redo ? history.undo : history.redo;
    to.push(history.current);
    history.current = from.pop();
    const appliedSelection = history.applySelections?.get(history.current);
    const searchQuery = this.elSearchInput.value.trim();
    const searchTarget = this.historyApplyTarget && { ...this.historyApplyTarget };
    const selected = appliedSelection ? appliedSelection.cell : this.activeCell ? { ...this.activeCell } : null;
    this.clearHeaderSelections();
    this.closeAutocompleteMenu();
    this.closeGenderDropdown();
    this.dataStore[this.currentDate] = JSON.parse(history.current);
    this.activeCell = null;
    this.selectedRowIdx = null;
    this.selectedColKey = null;
    this.clipboardSelection = null;
    this.historyApplyTarget = null;
    this.lastHistoryAppliedTarget = null;
    this.pendingCut = null;
    this.sortState = { colKey: null, direction: "original" };
    document.querySelectorAll?.(".sort-indicator").forEach(el => { el.textContent = ""; });
    this.elSearchInput.value = searchQuery;
    this.elBtnClearSearch.style.display = searchQuery ? "block" : "none";
    this.renderTable();
    if (appliedSelection?.rowRange) {
      const { minRow, maxRow } = appliedSelection.rowRange;
      this.selectRowRange(minRow, maxRow, appliedSelection.lastCol);
    } else if (selected) {
      const rowIdx = Math.min(selected.rowIdx, this.getCurrentRows().length - 1);
      const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${selected.colKey}"]`);
      if (cell) this.selectCell(rowIdx, selected.colKey, cell);
    } else {
      this.elFormulaInput.value = "";
      this.elCellAddress.textContent = "";
      this.elSelectedCellCoords.textContent = "";
      this.elSheetContainer.focus({ preventScroll: true });
    }
    if (searchQuery) {
      const target = Math.min(searchTarget?.rowIdx ?? selected?.rowIdx ?? 0, this.getCurrentRows().length - 1);
      this.searchAllDates(searchQuery, Math.max(0, target), { preserveCurrentSelection: true });
      if (appliedSelection?.search) this.restoreHistorySearchSelection(appliedSelection.search);
    }
    if (appliedSelection?.rowRange) this.ensureCurrentCellVisible(this.elTableBody.querySelector(`tr[data-row-idx="${appliedSelection.rowRange.minRow}"] .row-num`));
    this.saveDataStore(false);
    this.showSaveIndicator(redo ? "다시 실행됨" : "되돌림 완료");
  }

  isSearchShortcut(e) {
    // Korean IME can report keyCode 229 or a Hangul key while the physical key is F.
    return (e.ctrlKey || e.metaKey) && !e.altKey &&
      (e.key.toLowerCase() === "f" || e.code === "KeyF");
  }

  handleCellRowSelectShortcut(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey ||
        (e.key.toLowerCase() !== "a" && e.code !== "KeyA")) return false;
    const cell = e.target?.closest?.(".excel-cell");
    // Search/modal/formula inputs retain their normal text selection behavior.
    if (!cell && e.target?.matches?.("input, textarea, [contenteditable='true']")) return false;
    const historyRow = cell ? cell.dataset.crossIdx : this.crossDateSelection?.endRow;
    const currentRow = cell?.dataset.row ?? this.activeCell?.rowIdx ?? this.rangeEnd?.rowIdx ?? this.selectedRowRange?.minRow;
    if (historyRow == null && currentRow == null) return false;
    e.preventDefault();
    e.stopPropagation();
    if (historyRow != null) this.selectCrossDateRow(Number(historyRow));
    else this.selectEntireRow(Number(currentRow));
    return true;
  }

  handleHistoryShortcut(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
    const isZ = e.key?.toLowerCase() === "z" || e.code === "KeyZ";
    const isY = e.key?.toLowerCase() === "y" || e.code === "KeyY";
    if (!isZ && !isY) return false;
    const target = e.target;
    if (target?.matches("input, textarea, [contenteditable='true']") &&
        !target.matches(".cell-input-element") && target !== this.elFormulaInput) return false;
    e.preventDefault();
    e.stopPropagation();
    this.restoreEditHistory(isY || e.shiftKey);
    return true;
  }

  debounceSaveDataStore(delay = 350) {
    // Protect edits immediately; a pending cloud response must not replace this date.
    this.pendingSyncDates.add(this.currentDate);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.dataStore));
      localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates]));
    } catch (_) { this.showSaveIndicator("로컬 저장 공간을 확인해 주세요", true); }
    this.updateHistoryButtons();
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.saveDataStore();
    }, delay);
  }

  showSaveIndicator(text, isError = false) {
    if (!this.elSaveStatus) return;
    this.elSaveStatus.textContent = text;
    this.elSaveStatus.className = "save-status" + (isError ? " unsaved" : "");
    if (!isError) {
      setTimeout(() => {
        if (this.elSaveStatus) this.elSaveStatus.textContent = "저장 완료됨";
      }, 1500);
    }
  }

  cacheElements() {
    this.elDatePicker = document.getElementById("datePicker");
    this.elDateLabel = document.getElementById("dateDisplayLabel");
    this.elBtnPrevDay = document.getElementById("btnPrevDay");
    this.elBtnNextDay = document.getElementById("btnNextDay");
    this.elBtnGoToday = document.getElementById("btnGoToday");
    this.elBtnPreview = document.getElementById("btnPreview");
    this.elBtnExportCsv = document.getElementById("btnExportCsv");

    this.elTableBody = document.getElementById("tableBody");
    this.elSheetContainer = document.getElementById("sheetContainer");
    this.elCellAddress = document.getElementById("cellAddressDisplay");
    this.elFormulaInput = document.getElementById("formulaInput");
    this.elSelectedCellCoords = document.getElementById("selectedCellCoords");

    this.elBtnAddRow = document.getElementById("btnAddRow");
    this.elBtnDeleteSelected = document.getElementById("btnDeleteSelected");
    this.elBtnBottomAddRow = document.getElementById("btnBottomAddRow");
    this.elTabBackup = document.getElementById("tabBackup");

    this.elSearchInput = document.getElementById("searchInput");
    this.elBtnClearSearch = document.getElementById("btnClearSearch");

    // Sidebar
    this.elSidebarDateTag = document.getElementById("sidebarDateTag");
    this.elSidebarSummaryTitle = document.getElementById("sidebarSummaryTitle");
    this.elStatPeriodLabel = document.getElementById("statPeriodLabel");
    this.elSummaryPeriodTabs = document.querySelectorAll("[data-summary-period]");
    this.elStatTotalCount = document.getElementById("statTotalCount");
    this.elStatMaleCount = document.getElementById("statMaleCount");
    this.elStatFemaleCount = document.getElementById("statFemaleCount");
    this.elStatUnknownCount = document.getElementById("statUnknownCount");
    this.elStatWriterList = document.getElementById("statWriterList");
    this.elStatExtraList = document.getElementById("statExtraList");
    this.elStatPrescriptionList = document.getElementById("statPrescriptionList");

    // Tabs
    this.elCurrentSheetTab = document.getElementById("currentSheetTab");
    this.elSheetTabTitle = document.getElementById("sheetTabTitle");
    this.elBtnQuickNewDay = document.getElementById("btnQuickNewDay");
    this.elSaveStatus = document.getElementById("saveStatus");

    // Preview Modal
    this.elPreviewModal = document.getElementById("previewModal");
    this.elPreviewModalDate = document.getElementById("previewModalDate");
    this.elPrintDateFull = document.getElementById("printDateFull");
    this.elPrintTotalCount = document.getElementById("printTotalCount");
    this.elPrintMaleCount = document.getElementById("printMaleCount");
    this.elPrintFemaleCount = document.getElementById("printFemaleCount");
    this.elPrintShockwave = document.getElementById("printShockwave");
    this.elPrintIon = document.getElementById("printIon");
    this.elPrintWinback = document.getElementById("printWinback");
    this.elPrintTableBody = document.getElementById("printTableBody");
    this.elPrintGeneratedTime = document.getElementById("printGeneratedTime");
    this.elBtnPrintConfirm = document.getElementById("btnPrintConfirm");
    this.elBtnClosePreview = document.getElementById("btnClosePreview");

    // Backup Modal
    this.elBackupModal = document.getElementById("backupModal");
    this.elBtnCloseBackup = document.getElementById("btnCloseBackup");
    this.elBtnDownloadBackup = document.getElementById("btnDownloadBackup");
    this.elFileRestore = document.getElementById("fileRestore");
    this.elBtnClearAllData = document.getElementById("btnClearAllData");

    // Supabase Modal & Cloud Elements
    this.elBtnSupabase = document.getElementById("btnSupabase");
    this.elSupabaseModal = document.getElementById("supabaseModal");
    this.elSupabaseModalStatus = document.getElementById("supabaseModalStatus");
    this.elBtnCloseSupabase = document.getElementById("btnCloseSupabase");
    this.elSbUrlInput = document.getElementById("sbUrlInput");
    this.elSbKeyInput = document.getElementById("sbKeyInput");
    this.elBtnSaveSupabase = document.getElementById("btnSaveSupabase");
    this.elBtnDisconnectSupabase = document.getElementById("btnDisconnectSupabase");
    this.elSupabaseManualSyncBox = document.getElementById("supabaseManualSyncBox");
    this.elBtnPushToCloud = document.getElementById("btnPushToCloud");
    this.elBtnPullFromCloud = document.getElementById("btnPullFromCloud");

    // Right-Click Context Menu
    this.elContextMenu = document.getElementById("excelContextMenu");

    // Search Prompt Modal
    this.elSearchPromptModal = document.getElementById("searchPromptModal");
    this.elSearchPromptInput = document.getElementById("searchPromptInput");
    this.elBtnCloseSearchPrompt = document.getElementById("btnCloseSearchPrompt");
    this.elBtnSearchPromptCancel = document.getElementById("btnSearchPromptCancel");
    this.elBtnSearchPromptSubmit = document.getElementById("btnSearchPromptSubmit");

    // Search Not Found Modal
    this.elSearchNotFoundModal = document.getElementById("searchNotFoundModal");
    this.elSearchNotFoundMessage = document.getElementById("searchNotFoundMessage");
    this.elBtnCloseSearchNotFound = document.getElementById("btnCloseSearchNotFound");
  }

  getCurrentRows() {
    if (!this.dataStore[this.currentDate]) {
      this.dataStore[this.currentDate] = this.createDefaultEmptyRows();
    } else {
      const rows = this.dataStore[this.currentDate];
      if (rows.length < this.getDefaultRowCount()) {
        const formattedDate = this.currentDate.replace(/-/g, ".");
        const diff = this.getDefaultRowCount() - rows.length;
        for (let i = 0; i < diff; i++) {
          rows.push({
            no: "",
            gender: "",
            chartNo: "",
            name: "",
            part: "",
            prescription: "",
            extra: "",
            writer: DEFAULT_WRITER,
            memo: "",
            specialNote: "",
            date: formattedDate
          });
        }
      }
    }
    const currentRows = this.dataStore[this.currentDate];
    this.normalizeRowAllocation(currentRows, this.currentDate);
    this.visitNameState ||= new WeakMap();
    this.visitTimeState ||= new WeakMap();
    for (const row of this.dataStore[this.currentDate]) {
      if (!this.visitNameState.has(row)) this.visitNameState.set(row, Boolean(String(row.name || "").trim()));
      if (!this.visitTimeState.has(row)) this.visitTimeState.set(row, String(row.visitTime ?? ""));
    }
    return this.dataStore[this.currentDate];
  }

  createDefaultEmptyRows(count = this.getDefaultRowCount(), date = this.currentDate) {
    const formattedDate = date.replace(/-/g, ".");
    const rows = [];
    for (let i = 1; i <= count; i++) {
      rows.push({
        no: "",
        gender: "",
        chartNo: "",
        name: "",
        part: "",
        prescription: "",
        extra: "",
        writer: DEFAULT_WRITER,
        memo: "",
        specialNote: "",
        date: formattedDate
      });
    }
    return rows;
  }

  getSearchPeriod() {
    try {
      const saved = localStorage.getItem(SEARCH_PERIOD_STORAGE_KEY);
      if (saved && ["1year_plus", "6months", "3months"].includes(saved)) return saved;
    } catch (e) {}
    return "6months";
  }

  setSearchPeriod(period) {
    if (!["1year_plus", "6months", "3months"].includes(period)) period = "6months";
    try {
      localStorage.setItem(SEARCH_PERIOD_STORAGE_KEY, period);
    } catch (e) {}
    if (this.elSearchPeriodSelect && this.elSearchPeriodSelect.value !== period) {
      this.elSearchPeriodSelect.value = period;
    }
    if (this.supabaseClient) {
      void this.loadSearchHistory(true);
    }
    if (this.elSearchInput?.value?.trim()) {
      this.searchAllDates(this.elSearchInput.value.trim(), undefined, { preserveCurrentSelection: true });
    }
  }

  getSearchCutoffDate(period = this.getSearchPeriod()) {
    if (period === "1year_plus" || period === "all") return null;
    const d = new Date();
    const monthsToSubtract = period === "3months" ? 3 : 6;
    const targetMonth = d.getMonth() - monthsToSubtract;
    d.setMonth(targetMonth);
    if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
      d.setDate(0);
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  getSearchDataStore() {
    const history = { ...this.cloudSearchHistory };
    for (const [date, local] of Object.entries(this.dataStore || {})) {
      const remote = history[date];
      if (!Array.isArray(remote) || date === this.currentDate ||
          this.pendingSyncDates?.has(date) || this.activePushes?.has(date)) {
        history[date] = local;
        continue;
      }
      const base = this.syncBaselines?.get(date);
      if (base?.length) {
        // Search the latest server snapshot with any local edits layered on top.
        history[date] = this.mergeCloudRows(base, local, remote);
      } else if (local.some(row => ["name", "chartNo", "part", "prescription", "extra", "memo", "specialNote"]
        .some(key => String(row?.[key] ?? "").trim()))) {
        // Unsynced records without a baseline still belong to this device.
        history[date] = local;
      }
      // Merely opening an empty date must not hide server patient records.
    }
    return history;
  }

  async loadSearchHistory(force = false) {
    const client = this.supabaseClient;
    if (!client) return false;
    if (this.searchHistoryClient !== client) {
      this.searchHistoryClient = client;
      this.cloudSearchHistory = {};
      this.searchHistoryLoadedAt = 0;
      this.searchHistoryRequest = null;
      this.searchHistoryLoadedPeriod = null;
    }
    const currentPeriod = this.getSearchPeriod();
    const periodWeight = { "3months": 1, "6months": 2, "1year_plus": 3 };
    const neededForce = force || (periodWeight[currentPeriod] || 2) > (periodWeight[this.searchHistoryLoadedPeriod] || 0);
    // A valid cached range can answer immediately during a background refresh.
    // Initial loads, expanded ranges and explicit refreshes still await data.
    if (!neededForce && Date.now() - (this.searchHistoryLoadedAt || 0) < 300000) return false;

    if (this.searchHistoryRequest) {
      if (neededForce && (periodWeight[currentPeriod] || 2) > (periodWeight[this.searchHistoryRequestPeriod] || 0)) {
        try { await this.searchHistoryRequest; } catch (e) {}
        return this.loadSearchHistory(true);
      }
      return this.searchHistoryRequest;
    }
    const requestPeriod = currentPeriod;
    this.searchHistoryRequestPeriod = requestPeriod;
    const request = (async () => {
      this.cloudSearchHistory ||= {};
      const history = {};
      const pageSize = 200;
      const cutoffDate = (this.summaryPeriod === "year" || requestPeriod === "1year_plus") ? null : this.getSearchCutoffDate(requestPeriod);
      try {
        for (let offset = 0; ;) {
          let query = client.from("pt_daily_records")
            .select("date, rows_data")
            .order("date", { ascending: false });
          if (cutoffDate && typeof query.gte === "function") {
            query = query.gte("date", cutoffDate);
          }
          const { data, error } = await query.range(offset, offset + pageSize - 1);
          if (error) throw error;
          if (this.supabaseClient !== client) return false;
          for (const entry of data || []) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Array.isArray(entry.rows_data)) {
              history[entry.date] = entry.rows_data;
              this.cloudSearchHistory[entry.date] = entry.rows_data;
            }
          }
          // The server may cap responses below our requested page size.
          if (!data?.length) break;
          offset += data.length;
        }
        this.cloudSearchHistory = { ...this.cloudSearchHistory, ...history };
        this.searchHistoryLoadedAt = Date.now();
        this.searchHistoryLoadedPeriod = requestPeriod;
        if (this.elStatTotalCount) this.updateSidebarStats();
        this.refreshSearchSuggestions();
        if (this.elSearchInput?.value?.trim()) this.searchAllDates(this.elSearchInput.value.trim(), undefined, { preserveCurrentSelection: true });
        return true;
      } catch (error) {
        console.warn("이전 날짜 검색 기록을 불러오지 못했습니다:", error.message || error);
        return false;
      }
    })();
    this.searchHistoryRequest = request;
    try { return await request; }
    finally {
      if (this.searchHistoryRequest === request) {
        this.searchHistoryRequest = null;
        this.searchHistoryRequestPeriod = null;
      }
    }
  }

  refreshSearchSuggestions() {
    const input = document.activeElement;
    if (!input?.matches(".cell-input-element:not(.is-armed)")) return;
    const cell = input.closest(".excel-cell");
    const colKey = cell?.dataset.col;
    if (!colKey || ["gender", "writer", "no"].includes(colKey)) return;
    const suggestions = this.getAutocompleteSuggestions(colKey, input.value, input.dataset.composing === "true");
    if (suggestions.length || (["name", "part", "extra", "memo", "specialNote"].includes(colKey) && input.value.trim())) this.showAutocompleteMenu(Number(cell.dataset.row), colKey, cell, input, suggestions);
    else this.closeAutocompleteMenu();
  }

  ensureDatalists() {
    // Chrome IME 한글 자모 분리 버그 방지를 위해 datalist 요소 완전 제거
    ["partPresets", "prescPresets", "extraPresets"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  // Update active highlighted headers matching currently focused cell
  navigateCell(targetRowIdx, colKey) {
    const rows = this.getCurrentRows();
    if (targetRowIdx >= rows.length) {
      // Auto add new row if hitting enter at bottom!
      this.addNewRow(false);
    }
    const nextCell = document.querySelector(`.excel-cell[data-row="${targetRowIdx}"][data-col="${colKey}"]`);
    if (nextCell) {
      this.selectCell(targetRowIdx, colKey, nextCell);
    }
  }

  navigateCol(rowIdx, currentColKey, direction) {
    const colOrder = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const curIdx = colOrder.indexOf(currentColKey);
    let nextIdx = curIdx + direction;
    let nextRowIdx = rowIdx;

    if (nextIdx >= colOrder.length) {
      nextIdx = 0;
      nextRowIdx += 1;
    } else if (nextIdx < 0) {
      nextIdx = colOrder.length - 1;
      nextRowIdx = Math.max(0, nextRowIdx - 1);
    }

    const rows = this.getCurrentRows();
    if (nextRowIdx >= rows.length) {
      this.addNewRow(false);
    }

    const nextColKey = colOrder[nextIdx];
    const nextCell = document.querySelector(`.excel-cell[data-row="${nextRowIdx}"][data-col="${nextColKey}"]`);
    if (nextCell) {
      this.selectCell(nextRowIdx, nextColKey, nextCell);
    }
  }

  focusFirstEmptyCell() {
    const rows = this.getCurrentRows();
    let targetRow = 0;
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].name && !rows[i].chartNo) {
        targetRow = i;
        break;
      }
    }
    // Prefer focusing on chartNo or name
    const cell = document.querySelector(`.excel-cell[data-row="${targetRow}"][data-col="chartNo"]`) ||
                 document.querySelector(`.excel-cell[data-row="${targetRow}"][data-col="name"]`);
    if (cell) {
      cell.scrollIntoView({ behavior: "smooth", block: "center" });
      this.selectCell(targetRow, "chartNo", cell);
    }
  }

  focusDateEntryCell() {
    const rows = this.getCurrentRows();
    const keys = ['no', 'gender', 'chartNo', 'name', 'part', 'prescription', 'extra', 'writer', 'memo', 'specialNote'];
    const lastRow = rows.findLastIndex(row => keys.some(key => String(row?.[key] ?? '').trim()));
    const targetRow = lastRow + 1;
    const colKey = lastRow < 0 ? 'no' : 'name';
    const cell = this.elTableBody.querySelector(`.excel-cell[data-row="${targetRow}"][data-col="${colKey}"]`);
    if (!cell) return;
    cell.closest('tr').style.display = '';
    this.selectCell(targetRow, colKey, cell, false);

    const container = this.elSheetContainer;
    if (lastRow < 0 || !container?.getBoundingClientRect) { container.scrollTop = 0; return; }
    const lastCell = this.elTableBody.querySelector(`.excel-cell[data-row="${lastRow}"][data-col="name"]`);
    const scrollCell = lastCell?.getBoundingClientRect().height ? lastCell : cell;
    const bounds = container.getBoundingClientRect();
    const bottom = bounds.top + (container.clientTop || 0) + container.clientHeight;
    let top = bounds.top + (container.clientTop || 0);
    container.querySelectorAll('#excelTable thead th, .current-history-headers th').forEach(header => {
      const rect = header.getBoundingClientRect();
      if (rect.height && rect.top < bottom && rect.bottom > top) top = Math.max(top, rect.bottom);
    });
    const rect = scrollCell.getBoundingClientRect();
    container.scrollTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight,
      container.scrollTop + (rect.top + rect.bottom) / 2 - (top + bottom) / 2));
  }

  applyQuickChip(type, val) {
    const rows = this.getCurrentRows();
    let targetRow = this.selectedRowIdx !== null ? this.selectedRowIdx : 0;
    if (!rows[targetRow]) {
      this.addNewRow(false);
      targetRow = rows.length - 1;
    }

    if (type === "prescription") {
      rows[targetRow].prescription = val;
    } else if (type === "extra") {
      // Append or set extra
      const cur = rows[targetRow].extra || "";
      rows[targetRow].extra = cur ? `${cur}, ${val}` : val;
    }

    this.saveDataStore();
    this.renderTable();

    // Select the modified cell
    const colKey = type === "prescription" ? "prescription" : "extra";
    const cellEl = document.querySelector(`.excel-cell[data-row="${targetRow}"][data-col="${colKey}"]`);
    if (cellEl) this.selectCell(targetRow, colKey, cellEl);
  }

  jumpToLastRecord() {
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    if (this.selectedRowRange && !this.crossDateSelection) {
      const rowIdx = Math.max(0, this.getLastPatientRowIndex());
      const lastCol = this.selectedRange?.maxCol ?? 10;
      const header = this.elTableBody.querySelector(`tr[data-row-idx="${rowIdx}"] .row-num`);
      if (header) header.closest("tr").style.display = "";
      this.selectRowRange(rowIdx, rowIdx, lastCol);
      this.ensureCurrentCellVisible(header, { center: true, viewportRatio: 0.65 });
      return;
    }
    const fromHistory = Boolean(this.crossDateSelection);
    const range = this.crossDateSelection || this.selectedRange;
    const colKey = this.crossDateSelection ? keys[range.minCol]
      : this.activeCell?.colKey || (range ? keys[range.minCol] : 'no');
    if (!colKey) return;
    if (!range && !this.activeCell && this.selectedRowIdx == null) return;
    // Patient identity determines the destination for every selection mode.
    // Prepared writer initials, notes and allocated blank rows are not records.
    const rowIdx = Math.max(0, this.getLastPatientRowIndex());
    const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${colKey}"]`);
    if (cell) {
      cell.closest("tr").style.display = "";
      this.selectCell(rowIdx, colKey, cell);
      this.ensureCurrentCellVisible(cell, { center: true, viewportRatio: fromHistory ? 0.5 : 0.65 });
    }
  }

  jumpToFirstRecord() {
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const rowSelected = Boolean(this.selectedRowRange || (this.crossDateSelection && this.isCrossDateRowSelected));
    const colIdx = this.crossDateSelection?.endCol ?? keys.indexOf(this.activeCell?.colKey || "no");
    if (!this.crossDateSelection && this.crossDateResults?.length) {
      const latestIdx = this.crossDateResults.reduce((latest, row, idx, rows) =>
        String(row._sourceDate || "") >= String(rows[latest]._sourceDate || "") ? idx : latest, 0);
      this.selectCrossDateRow(latestIdx);
      this.elTableBody.querySelector(`.cross-date-row[data-cross-idx="${latestIdx}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    if (this.crossDateSelection) {
      if (rowSelected) this.selectCrossDateRow(0);
      else this.selectCrossDateCell(0, colIdx);
      this.elTableBody.querySelector('.cross-date-row[data-cross-idx="0"]')
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    const cell = this.elTableBody.querySelector(`[data-row="0"][data-col="${keys[Math.max(0, colIdx)]}"]`);
    if (cell) cell.closest("tr").style.display = "";
    if (rowSelected) this.selectRowRange(0, 0, this.selectedRange?.maxCol ?? 10);
    else if (cell) this.selectCell(0, keys[Math.max(0, colIdx)], cell);
    this.ensureCurrentCellVisible(cell);
  }

  applyCompoundPatientInput(row, key, value) {
    if (!["chartNo", "name"].includes(key)) return false;
    const match = String(value ?? "").trim().match(/^(\d+)\s*\/\s*(.+)$/u);
    if (!match) return false;
    const name = match[2].replace(/\s*\(\d+\)\s*$/, "").replace(/([가-힣])(?:\s*(?:\d+|[MF]|\*))+\s*$/i, "$1").trim();
    if (!name || !/^[\p{L} .'-]+$/u.test(name)) return false;
    row.chartNo = match[1]; row.name = name;
    for (const field of ["chartNo", "name"]) {
      if (row._richText) delete row._richText[field];
    }
    return true;
  }

  setVisitTimeNow(row, now = new Date()) {
    row._visitedAt = now.toISOString();
    row.visitTime = `${String(now.getHours()).padStart(2, "0")}시 ${String(now.getMinutes()).padStart(2, "0")}분 ${String(now.getSeconds()).padStart(2, "0")}초`;
    row._visitTimeEdited = true;
    if (row._richText) delete row._richText.visitTime;
    this.visitNameState ||= new WeakMap();
    this.visitNameState.set(row, Boolean(String(row.name || "").trim()));
  }

  appendVisitTimeRefresh(cell, row) {
    if (!cell.hasAttribute("data-row") || cell.querySelector(".visit-time-refresh")) return;
    const button = document.createElement("button");
    button.type = "button"; button.className = "visit-time-refresh";
    button.textContent = "↻";
    button.title = "방문시간을 현재 시간으로 갱신";
    button.setAttribute("aria-label", "방문시간을 현재 시간으로 갱신");
    button.addEventListener("mousedown", event => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener("dblclick", event => event.stopPropagation());
    button.addEventListener("click", event => {
      event.stopPropagation();
      document.activeElement?.blur();
      const rowIdx = this.getCurrentRows().indexOf(row);
      if (rowIdx < 0) return;
      this.setVisitTimeNow(row);
      this.renderColoredText(cell, row, "visitTime");
      this.saveDataStore();
      this.selectCell(rowIdx, "visitTime", cell, false);
    });
    cell.appendChild(button);
  }

  getVisitTime(row) {
    const value = String(row.visitTime ?? "");
    if (!row._visitTimeEdited && /^\d{2}시 \d{2}분$/.test(value) && row._visitedAt) {
      const timestamp = new Date(row._visitedAt);
      if (!Number.isNaN(timestamp.getTime())) return `${value} ${String(timestamp.getSeconds()).padStart(2, "0")}초`;
    }
    return value;
  }

  isNewPatientRow(row, rowIdx) {
    const name = String(row?.name ?? "").trim().toLowerCase();
    const chart = String(row?.chartNo ?? "").trim().toLowerCase();
    if (!name && !chart) return false;
    const store = this.getSearchDataStore();
    return !Object.entries(store).some(([date, rows]) => date <= this.currentDate && Array.isArray(rows) &&
      rows.some((candidate, index) => (date < this.currentDate || index < rowIdx) &&
        ((chart && String(candidate?.chartNo ?? "").trim().toLowerCase() === chart) ||
         (name && String(candidate?.name ?? "").trim().toLowerCase() === name))));
  }

  refreshNewPatientRows() {
    const rows = this.getCurrentRows();
    const flags = this.getNewPatientRowFlags(rows);
    this.elTableBody.querySelectorAll(".excel-row[data-row-idx]").forEach(tr => {
      const index = Number(tr.dataset.rowIdx);
      tr.classList.toggle("new-patient-row", flags[index]);
    });
  }

  getNewPatientRowFlags(rows) {
    const names = new Set(), charts = new Set();
    const identity = row => [String(row?.name ?? "").trim().toLowerCase(), String(row?.chartNo ?? "").trim().toLowerCase()];
    const remember = ([name, chart]) => { if (name) names.add(name); if (chart) charts.add(chart); };
    // Scan prior dates once per repaint, instead of once for every visible row.
    for (const [date, records] of Object.entries(this.getSearchDataStore())) {
      if (date >= this.currentDate || !Array.isArray(records)) continue;
      for (const row of records) remember(identity(row));
    }
    return rows.map(row => {
      const [name, chart] = identity(row);
      const isNew = Boolean(name || chart) && !(name && names.has(name)) && !(chart && charts.has(chart));
      remember([name, chart]);
      return isNew;
    });
  }

  initPWA() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js")
          .then((reg) => console.log("PT Status PWA Service Worker Registered", reg.scope))
          .catch((err) => console.log("SW Registration Failed", err));
      });
    }
  }
}

// Install feature methods before the app starts. Preserve class method descriptors.
for (const feature of [PTHistorySearch, PTTableFormatting, PTSummary, PTCellInputTools,
  PTDeviceLayout, PTDocumentTools, PTCloudSync, PTContextMenu, PTPresetManager,
  PTAutocomplete, PTCellEditor, PTSheetSelection, PTSheetActions, PTSheetKeyboard, PTColumnSettings,
  PTAppEvents, PTDateNavigation, PTTableView, PTCellPickers, PTPatientSearchDialog, PTHistoryTable]) {
  for (const name of Object.getOwnPropertyNames(feature.prototype)) {
    if (name === "constructor") continue;
    Object.defineProperty(PTApp.prototype, name, Object.getOwnPropertyDescriptor(feature.prototype, name));
  }
}

// Instantiate on DOMContentLoaded
window.addEventListener("DOMContentLoaded", () => {
  window.ptApp = new PTApp();
});
