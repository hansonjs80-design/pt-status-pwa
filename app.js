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
const DEFAULT_ROW_COUNT = 150; // 기본 하루 150개 행

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
    const searchQuery = this.elSearchInput.value.trim();
    const searchTarget = this.historyApplyTarget && { ...this.historyApplyTarget };
    const selected = this.activeCell ? { ...this.activeCell } : null;
    this.clearHeaderSelections();
    this.closeAutocompleteMenu();
    this.closeGenderDropdown();
    this.dataStore[this.currentDate] = JSON.parse(history.current);
    this.activeCell = null;
    this.selectedRowIdx = null;
    this.selectedColKey = null;
    this.clipboardSelection = null;
    this.historyApplyTarget = null;
    this.pendingCut = null;
    this.sortState = { colKey: null, direction: "original" };
    document.querySelectorAll?.(".sort-indicator").forEach(el => { el.textContent = ""; });
    this.elSearchInput.value = searchQuery;
    this.elBtnClearSearch.style.display = searchQuery ? "block" : "none";
    this.renderTable();
    if (selected) {
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
    }
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

  bindEvents() {
    this.initToolbarActionsToggle();
    this.elSummaryPeriodTabs.forEach(button => {
      button.addEventListener("click", () => this.setSummaryPeriod(button.dataset.summaryPeriod));
    });
    // Supabase Cloud Sync Modal
    if (this.elBtnSupabase) {
      this.elBtnSupabase.addEventListener("click", () => this.openSupabaseModal());
    }
    if (this.elBtnCloseSupabase) {
      this.elBtnCloseSupabase.addEventListener("click", () => this.closeSupabaseModal());
    }
    if (this.elBtnSaveSupabase) {
      this.elBtnSaveSupabase.addEventListener("click", () => this.saveSupabaseConfig());
    }
    if (this.elBtnDisconnectSupabase) {
      this.elBtnDisconnectSupabase.addEventListener("click", () => this.disconnectSupabase());
    }
    if (this.elBtnPushToCloud) {
      this.elBtnPushToCloud.addEventListener("click", () => this.pushToCloud(this.currentDate, true));
    }
    if (this.elBtnPullFromCloud) {
      this.elBtnPullFromCloud.addEventListener("click", () => this.pullFromCloud(this.currentDate, true));
    }

    // Drag or Shift-click column letters to select a contiguous set of columns.
    document.querySelectorAll(".col-headers-row th.col-letter").forEach(th => {
      th.addEventListener("mousedown", e => {
        if (e.button !== 0 || e.target.closest(".col-resizer") || ["del", "spacer"].includes(th.dataset.col)) return;
        e.preventDefault();
        const start = e.shiftKey && this.columnAnchor ? this.columnAnchor : th.dataset.col;
        this.columnDragAnchor = start;
        this.selectEntireColumn(start, "", th.dataset.col);
      });
      th.addEventListener("mouseenter", () => {
        if (this.columnDragAnchor && !["del", "spacer"].includes(th.dataset.col)) this.selectEntireColumn(this.columnDragAnchor, "", th.dataset.col);
      });
    });
    document.addEventListener("mouseup", () => { this.columnDragAnchor = null; });

    // Corner Header Click (Select All Sheet)
    const cornerHeader = document.getElementById("cornerHeader");
    if (cornerHeader) {
      cornerHeader.addEventListener("click", event => {
        if (event.target.closest('#btnCloseHistorySearch')) {
          event.preventDefault(); event.stopPropagation();
          this.closeHistorySearch();
        } else this.selectAllCells();
      });
      document.getElementById('btnCloseHistorySearch')?.addEventListener('mousedown', event => event.preventDefault());
    }

    this.elDateLabel.addEventListener("click", () => this.openCalendar());

    // Date Navigation
    this.elDatePicker.addEventListener("change", (e) => {
      if (e.target.value) this.setDate(e.target.value);
    });

    this.elBtnPrevDay.addEventListener("click", () => this.shiftDay(-1));
    this.elBtnNextDay.addEventListener("click", () => this.shiftDay(1));
    this.elBtnGoToday.addEventListener("click", () => this.setDate(this.getTodayString(), true));

    const updateFontSize = () => {
      const status = this.getFormattingStatus("fontSize");
      document.getElementById("btnFontSize").textContent = parseFloat(status.value) || (status.label === "여러 값" ? "—" : "14");
      this.updateFontColorIndicator();
      this.updateBackgroundColorIndicator();
      this.updateAlignmentIndicator();
    };
    for (const [id, delta] of [["btnFontSmaller", -0.5], ["btnFontLarger", 0.5]]) {
      const button = document.getElementById(id);
      button.addEventListener("mousedown", e => e.preventDefault());
      button.addEventListener("click", () => {
        const value = parseFloat(this.getFormattingStatus("fontSize").value) || 14;
        this.applyColumnTypography("fontSize", Math.max(8, Math.min(72, value + delta)));
        updateFontSize();
      });
    }
    this.elSheetContainer.addEventListener("mouseup", updateFontSize);
    this.elSheetContainer.addEventListener("keyup", updateFontSize);

    // Rows management
    if (this.elBtnAddRow) {
      this.elBtnAddRow.addEventListener("click", () => this.addNewRow(true));
    }
    if (this.elBtnBottomAddRow) {
      this.elBtnBottomAddRow.addEventListener("click", () => this.addNewRow(true));
    }
    if (this.elBtnDeleteSelected) {
      this.elBtnDeleteSelected.addEventListener("click", () => this.deleteSelectedRow());
    }

    document.getElementById("btnFontColor").addEventListener("mousedown", event => { this.captureTextColorSelection(); event.preventDefault(); });
    document.getElementById("btnFontColor").addEventListener("click", event => this.openFontColorMenu(event.currentTarget));
    const backgroundButton = document.getElementById("btnBackgroundColor");
    backgroundButton.addEventListener("mousedown", event => event.preventDefault());
    backgroundButton.addEventListener("click", event => this.openFontColorMenu(event.currentTarget, "backgroundColor"));
    const alignmentButton = document.getElementById("btnTextAlign");
    alignmentButton.addEventListener("mousedown", event => event.preventDefault());
    alignmentButton.addEventListener("click", event => this.openAlignmentMenu(event.currentTarget));
    const patientSearchButton = document.getElementById("btnPatientSearch");
    patientSearchButton.addEventListener("mousedown", event => event.preventDefault());
    patientSearchButton.addEventListener("click", () => this.openSearchPromptModal(this.activeCell?.rowIdx ?? this.selectedRowIdx));

    for (const [id, property] of [["btnFontSize", "fontSize"], ["btnFontWeight", "fontWeight"]]) {
      const button = document.getElementById(id);
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", event => this.openColumnTypographyMenu(property, event.currentTarget));
    }

    // Formula Input Sync
    this.elFormulaInput.addEventListener("input", (e) => {
      if (!this.activeCell) return;
      const { rowIdx, colKey } = this.activeCell;
      const rows = this.getCurrentRows();
      if (rows[rowIdx]) {
        if (colKey === "writer" && e.isComposing) return;
        let val = e.target.value;
        if (colKey === "gender") {
          val = this.normalizeGenderInput(val);
          e.target.value = val;
          this.setGenderValue(rowIdx, val);
          return;
        }
        if (colKey === "writer" && !e.isComposing) {
          val = this.normalizeWriterInput(val);
          e.target.value = val;
        }
        rows[rowIdx][colKey] = val;
        const cellEl = document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="${colKey}"]`);
        if (cellEl) {
          const inputEl = cellEl.querySelector("input");
          if (inputEl) inputEl.value = val;
          else cellEl.textContent = val;
        }
        this.debounceSaveDataStore();
      }
    });
    this.elFormulaInput.addEventListener("compositionend", () => {
      let val = this.elFormulaInput.value;
      if (this.activeCell?.colKey === "writer") {
        val = this.normalizeWriterInput(val);
      }
      this.elFormulaInput.value = val;
      if (this.activeCell) {
        const { rowIdx, colKey } = this.activeCell;
        const rows = this.getCurrentRows();
        if (rows[rowIdx]) {
          rows[rowIdx][colKey] = val;
          const cellEl = document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="${colKey}"]`);
          if (cellEl) {
            const inputEl = cellEl.querySelector("input");
            if (inputEl) inputEl.value = val;
            else cellEl.textContent = val;
          }
        }
      }
      this.debounceSaveDataStore();
    });
    this.elFormulaInput.addEventListener("blur", () => {
      this.saveDataStore();
    });

    // Quick Chips (동적 렌더링 및 프리셋 관리)
    this.elQuickChipsContainer = document.getElementById("quickChipsContainer");
    this.elBtnAddPreset = document.getElementById("btnAddPreset");
    this.elBtnManagePresets = document.getElementById("btnManagePresets");
    this.elSearchPeriodSelect = document.getElementById("searchPeriodSelect");
    if (this.elSearchPeriodSelect) {
      this.elSearchPeriodSelect.value = this.getSearchPeriod();
      this.elSearchPeriodSelect.addEventListener("change", (e) => {
        this.setSearchPeriod(e.target.value);
      });
    }
    this.elPresetModal = document.getElementById("presetModal");
    this.elPresetModalTitle = document.getElementById("presetModalTitle");
    this.elPresetTypeSelect = document.getElementById("presetTypeSelect");
    this.elPresetLabelInput = document.getElementById("presetLabelInput");
    this.elPresetValueInput = document.getElementById("presetValueInput");
    this.elBtnPresetSave = document.getElementById("btnPresetSave");
    this.elBtnPresetCancel = document.getElementById("btnPresetCancel");
    this.elBtnClosePresetModal = document.getElementById("btnClosePresetModal");
    this.elPresetContextMenu = document.getElementById("presetContextMenu");
    this._editingPreset = null; // { type, index } 수정 모드일 때

    // 프리셋 전체 관리 모달 요소
    this.elPresetManagerModal = document.getElementById("presetManagerModal");
    this.elClosePresetManagerModal = document.getElementById("btnClosePresetManagerModal");
    this.elBtnManagerDone = document.getElementById("btnManagerDone");
    this.elTabPresetName = document.getElementById("tabPresetName");
    this.elTabPresetPart = document.getElementById("tabPresetPart");
    this.elTabPresetPrescription = document.getElementById("tabPresetPrescription");
    this.elTabPresetExtra = document.getElementById("tabPresetExtra");
    this.elTabPresetWriter = document.getElementById("tabPresetWriter");
    this.elTabPresetMemo = document.getElementById("tabPresetMemo");
    this.elTabPresetSpecialNote = document.getElementById("tabPresetSpecialNote");
    this.elManagerNewPresetInput = document.getElementById("managerNewPresetInput");
    this.elBtnManagerAddPreset = document.getElementById("btnManagerAddPreset");
    this.elPresetListContainer = document.getElementById("presetListContainer");
    this.elBtnManagerResetPresets = document.getElementById("btnManagerResetPresets");
    this.activePresetTab = "prescription";

    this.renderQuickChips();

    // 단일 추가/수정 모달 이벤트
    if (this.elBtnAddPreset) {
      this.elBtnAddPreset.addEventListener("click", () => this.openPresetModal("add"));
    }
    if (this.elBtnPresetSave) {
      this.elBtnPresetSave.addEventListener("click", () => this.savePresetFromModal());
    }
    if (this.elBtnPresetCancel) {
      this.elBtnPresetCancel.addEventListener("click", () => this.closePresetModal());
    }
    if (this.elBtnClosePresetModal) {
      this.elBtnClosePresetModal.addEventListener("click", () => this.closePresetModal());
    }
    if (this.elPresetModal) {
      this.elPresetModal.addEventListener("click", (e) => {
        if (e.target === this.elPresetModal) this.closePresetModal();
      });
    }

    // 전체 관리 모달 이벤트
    if (this.elBtnManagePresets) {
      this.elBtnManagePresets.addEventListener("click", () => this.openPresetManager());
    }
    if (this.elClosePresetManagerModal) {
      this.elClosePresetManagerModal.addEventListener("click", () => this.closePresetManager());
    }
    if (this.elBtnManagerDone) {
      this.elBtnManagerDone.addEventListener("click", () => this.closePresetManager());
    }
    if (this.elPresetManagerModal) {
      this.elPresetManagerModal.addEventListener("click", (e) => {
        if (e.target === this.elPresetManagerModal) this.closePresetManager();
      });
      this.elPresetManagerModal.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;
        const controls = Array.from(this.elPresetManagerModal.querySelectorAll('button:not(:disabled), input:not(:disabled), summary'))
          .filter(element => element.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      });
    }
    if (this.elTabPresetPrescription) {
      this.elTabPresetPrescription.addEventListener("click", () => this.switchPresetTab("prescription"));
    }
    if (this.elTabPresetExtra) {
      this.elTabPresetExtra.addEventListener("click", () => this.switchPresetTab("extra"));
    }
    for (const [tab, element] of [["name", this.elTabPresetName], ["part", this.elTabPresetPart], ["writer", this.elTabPresetWriter], ["memo", this.elTabPresetMemo], ["specialNote", this.elTabPresetSpecialNote]]) {
      element?.addEventListener("click", () => this.switchPresetTab(tab));
    }
    if (this.elBtnManagerAddPreset) {
      this.elBtnManagerAddPreset.addEventListener("click", () => this.addPresetFromManager());
    }
    if (this.elManagerNewPresetInput) {
      this.elManagerNewPresetInput.addEventListener("keydown", (e) => this.handlePresetManagerAddKeyDown(e));
    }
    if (this.elBtnManagerResetPresets) {
      this.elBtnManagerResetPresets.addEventListener("click", () => this.resetPresetsFromManager());
    }

    // 프리셋 우클릭 메뉴 액션
    this.elPresetContextMenu.querySelectorAll(".menu-item").forEach((item) => {
      item.addEventListener("click", () => {
        const action = item.dataset.action;
        this.handlePresetContextAction(action);
        this.hidePresetContextMenu();
      });
    });

    // 외부 클릭 시 프리셋 컨텍스트 메뉴 닫기
    document.addEventListener("click", () => this.hidePresetContextMenu());

    // Search
    this.elSearchInput.addEventListener("input", () => this.handleSearch());
    this.elSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const q = this.elSearchInput.value.trim();
        if (q && typeof this.hasAnySearchMatches === "function" && !this.hasAnySearchMatches(q)) {
          this.showSearchNotFoundModal("일치하는 환자 내역이 없습니다.");
        }
      }
    });
    this.elBtnClearSearch.addEventListener("click", () => {
      this.elSearchInput.value = "";
      this.handleSearch();
    });

    // Search Not Found Modal
    if (this.elBtnCloseSearchNotFound) {
      this.elBtnCloseSearchNotFound.addEventListener("click", () => this.closeSearchNotFoundModal());
    }
    if (this.elSearchNotFoundModal) {
      this.elSearchNotFoundModal.addEventListener("click", (e) => {
        if (e.target === this.elSearchNotFoundModal) this.closeSearchNotFoundModal();
      });
    }

    // Search Prompt Modal
    if (this.elBtnCloseSearchPrompt) {
      this.elBtnCloseSearchPrompt.addEventListener("click", () => this.closeSearchPromptModal());
    }
    if (this.elBtnSearchPromptCancel) {
      this.elBtnSearchPromptCancel.addEventListener("click", () => this.closeSearchPromptModal());
    }
    if (this.elBtnSearchPromptSubmit) {
      this.elBtnSearchPromptSubmit.addEventListener("click", () => this.submitSearchPrompt());
    }
    if (this.elSearchPromptInput) {
      this.elSearchPromptInput.addEventListener("input", () => this.updateSearchPromptAutocomplete());
      this.elSearchPromptInput.addEventListener("keydown", (e) => {
        if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) e.stopPropagation();
        if (e.isComposing || e.keyCode === 229) return;
        if (["ArrowDown", "ArrowUp"].includes(e.key) && this._searchPromptACMenu) {
          e.preventDefault();
          this.moveSearchPromptAutocompleteSelection(e.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (!e.repeat) {
            this.historyApplyBlockedKey = "enter";
            this.historySearchEnterAt = Date.now();
            this.submitSearchPrompt();
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.closeSearchPromptModal();
        }
      });
    }
    if (this.elSearchPromptModal) {
      this.initSearchPromptDrag();
      this.elSearchPromptModal.addEventListener("click", (e) => {
        if (e.target === this.elSearchPromptModal) this.closeSearchPromptModal();
      });
    }

    // Preview & Print Modal
    this.elBtnPreview.addEventListener("click", () => this.openPreviewModal());
    this.elBtnClosePreview.addEventListener("click", () => this.closePreviewModal());
    this.elBtnPrintConfirm.addEventListener("click", () => window.print());

    // Export CSV
    this.elBtnExportCsv.addEventListener("click", () => this.exportCurrentDayCsv());

    // Backup & Restore
    this.elBtnCloseBackup.addEventListener("click", () => this.closeBackupModal());
    this.elBtnDownloadBackup.addEventListener("click", () => this.downloadFullBackup());
    this.elFileRestore.addEventListener("change", (e) => this.handleRestoreFile(e));
    this.elBtnClearAllData.addEventListener("click", () => this.clearCurrentDayData());

    // Summary Sidebar Toggle
    this.initSummaryToggle();

    // Keyboard Shortcuts
    // Intercept search before native editor/IME bubbling can lose its target.
    document.addEventListener("keydown", e => {
      if (!e.defaultPrevented) this.handlePatientEditorSearchShortcut(e);
    }, true);
    document.addEventListener("keydown", (e) => this.handleGlobalKeyDown(e));
    document.addEventListener("keyup", (e) => {
      this.releaseHistorySearchKey(e);
      if (e.key === "ArrowLeft" || e.code === "ArrowLeft") this.presetLeftKeyHeld = false;
    });
    this.elSheetContainer.addEventListener("scroll", () => this.syncHistoryRowHeaderPosition(), { passive: true });
    window.addEventListener("blur", () => { this.historyApplyBlockedKey = null; this.presetLeftKeyHeld = false; this.directHistorySearchKeyHeld = false; });

    document.addEventListener("paste", event => {
      const target = event.target;
      if (this.crossDateSelection) { event.preventDefault(); return; }
      if (!this.activeCell && !this.selectedRange && this.selectedRowIdx === null) return;
      if (target.matches?.("input, textarea") && !target.matches(".cell-input-element")) return;
      const text = event.clipboardData?.getData("text/plain");
      const html = event.clipboardData?.getData("text/html") || "";
      if (text == null) return;
      if (target.matches?.(".cell-input-element:not(.is-armed)") && !/[\t\r\n]/.test(text) && !/<table\b/i.test(html)) {
        const cell = target.closest(".excel-cell");
        const colKey = cell?.dataset.col;
        if (["name", "chartNo"].includes(colKey)) {
          // Native paste must keep its caret/text insertion behavior. Refresh only
          // after the resulting input event, not before the pasted text is inserted.
          const refreshVisit = () => {
            const rowIdx = Number(cell.dataset.row);
            const row = this.getCurrentRows()[rowIdx];
            if (!row) return;
            const includesName = colKey === "name" || this.applyCompoundPatientInput(row, colKey, target.value);
            if (!includesName || !String(row?.name ?? "").trim()) return;
            this.setVisitTimeNow(row);
            const timeCell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="visitTime"]`);
            if (timeCell) this.renderColoredText(timeCell, row, "visitTime");
            this.saveDataStore();
          };
          target.addEventListener("input", refreshVisit, { once: true });
          setTimeout(() => target.removeEventListener("input", refreshVisit), 0);
        }
        return;
      }
      event.preventDefault();
      if (target.matches?.(".cell-input-element")) target.blur();
      void this.pasteSelection(text, html);
    });

    // PWA에서 Cmd+C/X 시 keydown이 처리 못하는 경우 copy/cut 이벤트로 fallback
    document.addEventListener("copy", (e) => {
      // input/textarea 내부에서의 복사는 무시 (텍스트 편집 중)
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      if (this.crossDateSelection || this.activeCell || this.selectedRange || this.selectedColKey !== null || this.selectedRowIdx !== null) {
        e.preventDefault();
        this.copySelection();
      }
    });

    document.addEventListener("cut", (e) => {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      if (this.activeCell || this.selectedRange || this.selectedColKey !== null || this.selectedRowIdx !== null) {
        e.preventDefault();
        this.cutSelection();
      }
    });

    // Close modal & context menu on escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeGenderDropdown();
        this.hideContextMenu();
        this.closePreviewModal();
        this.closeBackupModal();
        this.closeSupabaseModal();
        this.closePresetModal();
        this.closePresetManager();
        this.hidePresetContextMenu();
      }
    });

    // Close context menu on outside click
    document.addEventListener("click", (e) => {
      if (this.elContextMenu && !this.elContextMenu.contains(e.target)) {
        this.hideContextMenu();
      }
    });

    // Global mouseup to finish drag selection (cells or rows)
    document.addEventListener("mousemove", (event) => {
      this.updateFillDrag(event);
      if (this._isRowDragging && event.buttons === 1 && this._rowDragAnchor !== undefined) {
        const tr = event.target.closest("tr.excel-row");
        if (tr && tr.dataset.rowIdx !== undefined) {
          const rIdx = Number(tr.dataset.rowIdx);
          if (Number.isInteger(rIdx)) {
            this.selectRowRange(this._rowDragAnchor, rIdx);
          }
        }
      }
    });
    window.addEventListener("blur", () => this.cancelFillDrag());
    document.addEventListener("mouseup", (event) => {
      this.isSelectingCrossDate = false;
      this._isRowDragging = false;
      this._rowDragAnchor = undefined;
      if (this.fillDrag) this.finishFillDrag(event);
      let changed = false;
      if (this.isSelectingRange) {
        this.isSelectingRange = false;
        changed = true;
      }
      if (this.isSelectingRows) {
        this.isSelectingRows = false;
        changed = true;
      }
      if (changed && this.elSheetContainer) {
        this.elSheetContainer.classList.remove("is-selecting");
      }
    });

    window.addEventListener("resize", () => {
      if (document.getElementById("crossDateInnerTable")) {
        this.syncCrossDateColWidths();
      }
    });
  }

  // Keep at least 150 rows and fifteen empty rows below the last entered record.
  getCurrentRows() {
    if (!this.dataStore[this.currentDate]) {
      this.dataStore[this.currentDate] = this.createDefaultEmptyRows(DEFAULT_ROW_COUNT);
    } else {
      const rows = this.dataStore[this.currentDate];
      if (rows.length < DEFAULT_ROW_COUNT) {
        const formattedDate = this.currentDate.replace(/-/g, ".");
        const diff = DEFAULT_ROW_COUNT - rows.length;
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
    const contentKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const lastEnteredIdx = currentRows.findLastIndex(row => contentKeys.some(key => String(row[key] ?? "").trim()));
    const requiredCount = Math.max(DEFAULT_ROW_COUNT, lastEnteredIdx + 16);
    if (currentRows.length < requiredCount) currentRows.push(...this.createDefaultEmptyRows(requiredCount - currentRows.length));
    this.visitNameState ||= new WeakMap();
    this.visitTimeState ||= new WeakMap();
    for (const row of this.dataStore[this.currentDate]) {
      if (!this.visitNameState.has(row)) this.visitNameState.set(row, Boolean(String(row.name || "").trim()));
      if (!this.visitTimeState.has(row)) this.visitTimeState.set(row, String(row.visitTime ?? ""));
    }
    return this.dataStore[this.currentDate];
  }

  createDefaultEmptyRows(count = DEFAULT_ROW_COUNT) {
    const formattedDate = this.currentDate.replace(/-/g, ".");
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

  // Render main Excel table
  renderTable() {
    this.pendingHistorySearchSelection = this.captureHistorySearchSelection();
    const existingHistoryWrap = typeof document !== "undefined" && typeof document?.getElementById === "function" ? document.getElementById("crossDateScrollWrap") : null;
    if (existingHistoryWrap) {
      this._preservedHistoryScrollTop = existingHistoryWrap.scrollTop;
    }
    this.restoreCurrentTableHeader();
    this.cancelFillDrag();
    if (!this._isPasting) {
      this.clearCrossDateSelection();
    }
    const rows = this.getCurrentRows();
    const selectedRows = this.selectedRowRange && { ...this.selectedRowRange };
    const selectedRange = this.selectedRange && { ...this.selectedRange };
    this.elTableBody.innerHTML = "";

    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote", "visitTime"];
    const colLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
    const newPatientFlags = this.getNewPatientRowFlags(rows);

    rows.forEach((row, rowIdx) => {
      const tr = document.createElement("tr");
      tr.className = "excel-row";
      tr.dataset.rowIdx = rowIdx;
      tr.classList.toggle("new-patient-row", newPatientFlags[rowIdx]);
      tr.classList.toggle("lunch-break-row", Boolean(row._lunchBefore));

      // Row Number Header (1, 2, 3...)
      const excelRowNum = BASE_ROW_NUMBER + rowIdx;
      const thNum = document.createElement("th");
      thNum.className = "row-num";
      thNum.textContent = excelRowNum;
      thNum.title = `행 ${excelRowNum}: 클릭/드래그하여 행 선택, Shift+클릭으로 범위 선택`;
      thNum.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const range = this.selectedRowRange;
        if (e.shiftKey && range) {
          this.selectRowRange(this.rowRangeStart ?? range.minRow, rowIdx);
        } else {
          this.selectRowRange(rowIdx, rowIdx);
        }
        // 드래그로 범위 선택 시작
        this._rowDragAnchor = rowIdx;
        this._isRowDragging = true;
        this.elSheetContainer.focus({ preventScroll: true });
      });
      thNum.addEventListener("mouseenter", (e) => {
        if (this._isRowDragging && e.buttons === 1 && this._rowDragAnchor !== undefined) {
          this.selectRowRange(this._rowDragAnchor, rowIdx);
        }
      });
      tr.addEventListener("mouseenter", (e) => {
        if (this._isRowDragging && e.buttons === 1 && this._rowDragAnchor !== undefined) {
          this.selectRowRange(this._rowDragAnchor, rowIdx);
        }
      });

      tr.appendChild(thNum);

      // Columns
      colKeys.forEach((key, colIdx) => {
        const td = document.createElement("td");
        td.className = `excel-cell cell-${key}`;
        td.dataset.row = rowIdx;
        td.dataset.col = key;
        td.dataset.colIdx = colIdx;
        td.dataset.colLetter = colLetters[colIdx];
        td.dataset.excelRow = excelRowNum;
        this.applyCellFormatting(td, row, key);

        const val = row[key] || "";

        // Custom render for Gender: text + right dropdown arrow button (Excel Data Validation Style)
        if (key === "gender") {
          td.textContent = "";

          const textSpan = document.createElement("span");
          textSpan.className = "cell-gender-text";
          textSpan.textContent = val;
          td.appendChild(textSpan);

          if (val === "F") td.classList.add("f");
          if (val === "M") td.classList.add("m");

          const dropBtn = document.createElement("button");
          dropBtn.type = "button";
          dropBtn.className = "gender-dropdown-btn";
          dropBtn.innerHTML = "▼";
          dropBtn.title = "성별 선택 (M / F)";
          dropBtn.tabIndex = -1;

          dropBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.selectCell(rowIdx, "gender", td, false);
            this.openGenderDropdown(rowIdx, td, dropBtn);
          });

          td.appendChild(dropBtn);
          td.title = "선택 시 우측 ▼ 버튼 또는 더블클릭으로 M/F 선택 (키보드 M, F, ㅡ, ㄹ 지원)";
        } else {
          this.renderColoredText(td, row, key);
        }

        // Cell Mouse Down handler (Start Drag Selection)
        td.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return; // Only Left Click
          if (e.target.closest(".cell-fill-handle") || e.target.closest(".gender-dropdown-btn")) return;
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.toggleCellSelection(rowIdx, colIdx); return; }
          // If already editing inside input, don't interrupt text cursor
          if (e.target.tagName === "INPUT") return;
          e.preventDefault();

          this.isSelectingRange = true;
          if (e.shiftKey && this.activeCell) {
            this.extendCellSelection(rowIdx, colIdx);
            this.elSheetContainer.classList.add("is-selecting");
            return;
          }
          this.rangeStart = { rowIdx, colIdx, colKey: key };
          this.rangeEnd = { rowIdx, colIdx, colKey: key };

          if (this.elSheetContainer) {
            this.elSheetContainer.classList.add("is-selecting");
          }

          this.selectCell(rowIdx, key, td, false);
          this.updateRangeSelection();
        });

        // Cell Mouse Enter handler (Drag range expansion)
        td.addEventListener("mouseenter", () => {
          if (!this.isSelectingRange) return;
          this.rangeEnd = { rowIdx, colIdx, colKey: key };
          this.updateRangeSelection();
        });

        // Cell Click handler (Clean cell selection)
        td.addEventListener("click", (e) => {
          if (e.ctrlKey || e.metaKey) return;
          if (e.target.closest("input, textarea")) return;
          if (e.shiftKey && this.activeCell) return;
          if (this.selectedRange && (this.selectedRange.minRow !== this.selectedRange.maxRow || this.selectedRange.minCol !== this.selectedRange.maxCol)) return;
          if (e.target.closest(".cell-fill-handle") || e.target.closest(".gender-dropdown-btn")) return;
          this.selectCell(rowIdx, key, td, false);
        });

        // Cell Double Click to inline edit or open gender dropdown
        td.addEventListener("dblclick", () => {
          if (key === "gender") {
            const dropBtn = td.querySelector(".gender-dropdown-btn");
            this.openGenderDropdown(rowIdx, td, dropBtn);
          } else if (key === "writer") {
            this.openWriterPicker(rowIdx, td);
          } else {
            // Preserve the native editor and its active IME composition.
            const editor = td.querySelector("input");
            if (editor && !editor.classList.contains("is-armed")) return;
            this.startInlineEdit(rowIdx, key, td);
          }
        });

        tr.appendChild(td);
      });

      // Delete action column
      const tdDel = document.createElement("td");
      tdDel.className = "excel-cell cell-del-action";
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn-row-del";
      btnDel.textContent = "✕";
      btnDel.title = "이 행 삭제";
      btnDel.addEventListener("click", (e) => {
        e.stopPropagation();
        this.deleteRow(rowIdx);
      });
      tdDel.appendChild(btnDel);
      tr.appendChild(tdDel);
      const spacer = document.createElement("td");
      spacer.className = "cell-spacer";
      tr.appendChild(spacer);

      this.elTableBody.appendChild(tr);
    });

    // If active cell was set, restore highlight if valid
    if (this.activeCell) {
      const targetCell = document.querySelector(`.excel-cell[data-row="${this.activeCell.rowIdx}"][data-col="${this.activeCell.colKey}"]`);
      if (targetCell) {
        this.highlightCell(targetCell);
        this.updateActiveHeaders(this.activeCell.rowIdx, this.activeCell.colKey);
      }
    }
    // Cloud/search refreshes replace DOM nodes; repaint the current selection too.
    if (selectedRows) {
      this.selectRowRange(selectedRows.minRow, selectedRows.maxRow, selectedRange?.maxCol ?? 10);
    } else if (selectedRange && this.rangeStart && this.rangeEnd && !this.selectedCellSet && !this.selectedColumnRange) {
      this.updateRangeSelection();
    }
    this.paintCellSet();
    this.renderClipboardSelection();
    if (this.activeCell && this.activeCell.colKey !== "gender") {
      const { rowIdx, colKey } = this.activeCell;
      const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${colKey}"]`);
      if (cell) this.startInlineEdit(rowIdx, colKey, cell, true);
    }
    if (this.elSearchInput?.value.trim()) this.searchAllDates(this.elSearchInput.value.trim(), undefined, { preserveCurrentSelection: true });
    this.updateFontColorIndicator();
    this.updateBackgroundColorIndicator();
  }

  // Select and focus cell like Excel
  selectCell(rowIdx, colKey, cellElement, startEdit = false) {
    this.patientSearchDraft = null;
    if (this.genderPickerState) this.closeGenderDropdown();
    if (colKey === "visitTime") {
      colKey = "specialNote";
      cellElement = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="specialNote"]`);
      if (!cellElement) return;
    }
    this.closeAutocompleteMenu();
    this.activeCell = { rowIdx, colKey };
    this.historyApplyTarget = { date: this.currentDate, rowIdx, rows: this.getCurrentRows(), row: this.getCurrentRows()[rowIdx], colKey };
    this.elTableBody.querySelectorAll(".history-apply-btn").forEach(button => { button.disabled = false; });
    this.selectedRowIdx = rowIdx;
    this.selectedColKey = null;

    this.clearHeaderSelections();
    this.rangeStart = { rowIdx, colIdx: Number(cellElement.dataset.colIdx), colKey };
    this.rangeEnd = { ...this.rangeStart };
    this.updateActiveHeaders(rowIdx, colKey);

    // Highlight row
    document.querySelectorAll(".excel-row").forEach((r) => r.classList.remove("active-row"));
    const rowEl = cellElement.closest("tr");
    if (rowEl) rowEl.classList.add("active-row");

    this.highlightCell(cellElement);

    // Update Formula Bar
    const colLetter = cellElement.dataset.colLetter;
    const excelRow = cellElement.dataset.excelRow;
    const cellAddress = `${colLetter}${excelRow}`;

    this.elCellAddress.textContent = cellAddress;
    this.elSelectedCellCoords.textContent = `${cellAddress} (${colKey})`;

    const rows = this.getCurrentRows();
    const cellValue = rows[rowIdx] ? (rows[rowIdx][colKey] || "") : "";
    this.elFormulaInput.value = cellValue;

    if (startEdit) {
      this.startInlineEdit(rowIdx, colKey, cellElement);
    } else if (colKey !== "gender") {
      // Focus a native input before the first IME key, without entering edit mode.
      this.startInlineEdit(rowIdx, colKey, cellElement, true);
    } else {
      this.elSheetContainer.focus({ preventScroll: true });
    }
    this.updateHistoryDestinationHighlight();
    if (!this._isPasting) this.ensureCurrentCellVisible(cellElement);
    this.updateFontColorIndicator();
    this.updateBackgroundColorIndicator();
  }

  getTopVisibleCurrentRow() {
    const rows = Array.from(this.elTableBody.querySelectorAll('.excel-row[data-row-idx]:not([style*="display: none"])'));
    const container = this.elSheetContainer;
    if (!container?.getBoundingClientRect) return rows[0];
    const bounds = container.getBoundingClientRect();
    const bottom = bounds.top + (container.clientTop || 0) + container.clientHeight;
    let top = bounds.top + (container.clientTop || 0);
    container.querySelectorAll("#excelTable thead th, .current-history-headers th").forEach(header => {
      const rect = header.getBoundingClientRect();
      if (rect.height && rect.top < bottom) top = Math.max(top, rect.bottom);
    });
    return rows.find(row => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > top + 1 && rect.top < bottom;
    }) || rows[0];
  }

  ensureCurrentCellVisible(cell) {
    const container = this.elSheetContainer;
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (!cell?.getBoundingClientRect || !container?.getBoundingClientRect) return;
    const bounds = container.getBoundingClientRect();
    const bottom = bounds.top + (container.clientTop || 0) + container.clientHeight;
    let top = bounds.top + (container.clientTop || 0);
    // Sticky rows visually cover the viewport although native scrolling counts it as visible.
    container.querySelectorAll("#excelTable thead th, .current-history-headers th").forEach(header => {
      const rect = header.getBoundingClientRect();
      if (rect.height && rect.bottom > top && rect.top < bottom) top = Math.max(top, rect.bottom);
    });
    const rect = cell.getBoundingClientRect();
    if (rect.top < top) container.scrollTop += rect.top - top;
    else if (rect.bottom > bottom) container.scrollTop += rect.bottom - bottom;
  }

  highlightCell(cellElement) {
    document.querySelectorAll(".cell-fill-handle").forEach((handle) => handle.remove());
    document.querySelectorAll(".excel-cell").forEach((c) => c.classList.remove("cell-focused"));
    cellElement.classList.add("cell-focused");
    const { row, col, colIdx } = cellElement.dataset;
    const value = this.getCurrentRows()[Number(row)]?.[col];
    if (value === null || value === undefined || String(value).trim() === "") return;
    const handle = document.createElement("span");
    handle.className = "cell-fill-handle";
    handle.title = "아래로 드래그하여 같은 내용 채우기";
    handle.setAttribute("aria-label", handle.title);
    handle.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const currentValue = this.getCurrentRows()[Number(row)]?.[col];
      if (currentValue === null || currentValue === undefined || String(currentValue).trim() === "") return;
      this.fillDrag = { rowIdx: Number(row), colKey: col, colIdx: Number(colIdx),
        value: col === "writer" ? this.normalizeWriterInput(currentValue) : currentValue,
        endRow: Number(row), date: this.currentDate };
      this.isSelectingRange = false;
      this.isSelectingRows = false;
      this.elSheetContainer.classList.add("is-selecting");
      this.elSheetContainer.classList.add("is-fill-dragging");
    });
    handle.addEventListener("click", (event) => event.stopPropagation());
    cellElement.appendChild(handle);
  }

  updateFillDrag(event) {
    if (!this.fillDrag) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest("tr[data-row-idx]");
    if (!row || !this.elTableBody.contains(row)) return;
    const endRow = Math.max(this.fillDrag.rowIdx, Number(row.dataset.rowIdx));
    // 카운트 뱃지 위치 항상 업데이트 (endRow 변화 여부 무관)
    this._updateFillDragBadge(event.clientX, event.clientY, endRow - this.fillDrag.rowIdx + 1);
    if (this.fillDrag.endRow === endRow) return;
    this.fillDrag.endRow = endRow;
    this.elTableBody.querySelectorAll(".fill-preview").forEach((cell) => cell.classList.remove("fill-preview"));
    for (let r = this.fillDrag.rowIdx + 1; r <= endRow; r++) {
      this.elTableBody.querySelector(`.excel-cell[data-row="${r}"][data-col="${this.fillDrag.colKey}"]`)?.classList.add("fill-preview");
    }
  }

  _updateFillDragBadge(mouseX, mouseY, count) {
    let badge = document.getElementById("fillDragCountBadge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "fillDragCountBadge";
      badge.className = "fill-drag-count-badge";
      document.body.appendChild(badge);
    }
    badge.textContent = `+${count}`;
    badge.style.left = `${mouseX + 14}px`;
    badge.style.top  = `${mouseY - 10}px`;
    badge.style.display = "block";
  }

  _removeFillDragBadge() {
    const badge = document.getElementById("fillDragCountBadge");
    if (badge) badge.remove();
  }

  cancelFillDrag() {
    if (!this.fillDrag) return;
    this.fillDrag = null;
    this.elTableBody.querySelectorAll(".fill-preview").forEach((cell) => cell.classList.remove("fill-preview"));
    this.elSheetContainer.classList.remove("is-selecting");
    this.elSheetContainer.classList.remove("is-fill-dragging");
    this._removeFillDragBadge();
  }

  finishFillDrag(event) {
    this.updateFillDrag(event);
    const drag = this.fillDrag;
    const releasedRow = document.elementFromPoint(event.clientX, event.clientY)?.closest("tr[data-row-idx]");
    this.cancelFillDrag();
    if (!drag || drag.date !== this.currentDate || drag.endRow <= drag.rowIdx ||
        !releasedRow || !this.elTableBody.contains(releasedRow)) return;
    const rows = this.getCurrentRows();
    for (let r = drag.rowIdx + 1; r <= drag.endRow; r++) {
      rows[r][drag.colKey] = drag.value;
    }
    this.saveDataStore();
    this.renderTable();
    const source = this.elTableBody.querySelector(`.excel-cell[data-row="${drag.rowIdx}"][data-col="${drag.colKey}"]`);
    this.selectCell(drag.rowIdx, drag.colKey, source);
    this.rangeStart = { rowIdx: drag.rowIdx, colIdx: drag.colIdx, colKey: drag.colKey };
    this.rangeEnd = { ...this.rangeStart, rowIdx: drag.endRow };
    this.updateRangeSelection();
    this.updateSidebarStats();
    this.showSaveIndicator(`${drag.endRow - drag.rowIdx}개 셀 채우기 완료`);
  }

  getWriterPresetValues() {
    return [...new Set((COLUMN_PRESETS.writer || [])
      .map(value => this.normalizeWriterInput(value).trim()))];
  }

  isPresetLeftExit(event, colKey) {
    return ["chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"].includes(colKey) &&
      (event.key === "ArrowLeft" || event.code === "ArrowLeft") &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && this.isAutocompleteOpen();
  }

  isWriterRightExit(event, input) {
    const right = event.key === "ArrowRight" || event.code === "ArrowRight";
    return right && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      (this.isAutocompleteOpen() || (input.selectionStart === input.value.length && input.selectionEnd === input.value.length));
  }

  isManualCellLeftExit(event, input) {
    return (event.key === "ArrowLeft" || event.code === "ArrowLeft") &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      !input.classList.contains("is-armed");
  }

  isWriterEnterExit(event, input) {
    const enter = event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter";
    return enter && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
      !input.classList.contains("is-armed");
  }

  handleWriterPickerShortcut(event, rowIdx, cellElement) {
    if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || this.isAutocompleteOpen()) return false;
    event.preventDefault(); event.stopPropagation();
    this.openWriterPicker(rowIdx, cellElement);
    return true;
  }

  openWriterPicker(rowIdx, cellElement) {
    const values = this.getWriterPresetValues();
    if (!values.length) {
      this.openPresetManager("writer");
      return;
    }
    this.startInlineEdit(rowIdx, "writer", cellElement);
    const input = cellElement.querySelector("input");
    if (input) this.showAutocompleteMenu(rowIdx, "writer", cellElement, input, values);
  }

  getPrescriptionPresetValues() {
    return this.getPresetPickerValues("prescription");
  }

  getPresetPickerValues(colKey) {
    return [...new Set((COLUMN_PRESETS[colKey] || [])
      .map(value => String(value ?? "").trim()))];
  }

  handlePrescriptionPickerShortcut(event, rowIdx, cellElement) {
    return this.handlePresetPickerShortcut(event, rowIdx, "prescription", cellElement);
  }

  handlePresetPickerShortcut(event, rowIdx, colKey, cellElement) {
    if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || this.isAutocompleteOpen()) return false;
    event.preventDefault(); event.stopPropagation();
    this.openPresetPicker(rowIdx, colKey, cellElement);
    return true;
  }

  openPrescriptionPicker(rowIdx, cellElement) {
    this.openPresetPicker(rowIdx, "prescription", cellElement);
  }

  openPresetPicker(rowIdx, colKey, cellElement) {
    const values = this.getPresetPickerValues(colKey);
    if (!values.length) {
      this.openPresetManager(colKey);
      return;
    }
    this.startInlineEdit(rowIdx, colKey, cellElement);
    const input = cellElement.querySelector("input");
    if (input) this.showAutocompleteMenu(rowIdx, colKey, cellElement, input, values, { includeTypedValue: false });
  }

  normalizePrescriptionInput(value) {
    const text = String(value ?? "").trim();
    return text === "x" || text === "ㅌ" ? "X" : text;
  }

  handleWriterLetterKey(event, input) {
    if (event.ctrlKey || event.metaKey || event.altKey || !/^Key[A-Z]$/.test(event.code || "")) return false;
    event.preventDefault(); event.stopPropagation();
    this.closeAutocompleteMenu();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    this.activateNativeEditor(input);
    input.value = input.value.slice(0, start) + event.code.slice(3) + input.value.slice(end);
    input.dataset.composing = "false";
    input.dataset.writerKeyValue = input.value;
    input.setSelectionRange(start + 1, start + 1);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  normalizeWriterEditorInput(input, event = {}) {
    // Some IMEs emit native insertion after the handled physical key.
    // Keep the value already entered by that key instead of adding it twice.
    const handled = input.dataset.writerKeyValue;
    const nativeLetter = event.isComposing || /Composition/.test(event.inputType || "") ||
      event.inputType === "insertText" || event.type === "compositionend";
    if (handled !== undefined && nativeLetter) input.value = handled;
    else if (event.inputType) delete input.dataset.writerKeyValue;
    return this.normalizeWriterInput(input.value);
  }

  // Convert Korean keyboard input to uppercase English writer initials.
  normalizeWriterInput(value) {
    const keys = {
      'ㄱ':'R', 'ㄲ':'R', 'ㄴ':'S', 'ㄷ':'E', 'ㄸ':'E', 'ㄹ':'F', 'ㅁ':'A',
      'ㅂ':'Q', 'ㅃ':'Q', 'ㅅ':'T', 'ㅆ':'T', 'ㅇ':'D', 'ㅈ':'W', 'ㅉ':'W',
      'ㅊ':'C', 'ㅋ':'Z', 'ㅌ':'X', 'ㅍ':'V', 'ㅎ':'G',
      'ㅏ':'K', 'ㅐ':'O', 'ㅑ':'I', 'ㅒ':'O', 'ㅓ':'J', 'ㅔ':'P', 'ㅕ':'U',
      'ㅖ':'P', 'ㅗ':'H', 'ㅘ':'HK', 'ㅙ':'HO', 'ㅚ':'HL', 'ㅛ':'Y',
      'ㅜ':'N', 'ㅝ':'NJ', 'ㅞ':'NP', 'ㅟ':'NL', 'ㅠ':'B', 'ㅡ':'M', 'ㅢ':'ML', 'ㅣ':'L',
      'ㄳ':'RT', 'ㄵ':'SW', 'ㄶ':'SG', 'ㄺ':'FR', 'ㄻ':'FA', 'ㄼ':'FQ',
      'ㄽ':'FT', 'ㄾ':'FX', 'ㄿ':'FV', 'ㅀ':'FG', 'ㅄ':'QT',
    };
    const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
    const vowels = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
    const finals = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
    return Array.from(String(value ?? '').normalize('NFC'), (char) => {
      if (/^[a-z]$/i.test(char)) return char.toUpperCase();
      if (keys[char]) return keys[char];
      const syllable = char.charCodeAt(0) - 0xAC00;
      if (syllable < 0 || syllable > 11171) return '';
      return keys[initials[Math.floor(syllable / 588)]] +
        keys[vowels[Math.floor(syllable % 588 / 28)]] + (keys[finals[syllable % 28]] || '');
    }).join('');
  }

  // G열 성별 정규화 헬퍼 (무조건 영어 대문자 M 또는 F, 'ㄹ' -> 'F', 'ㅡ' -> 'M')
  normalizeGenderInput(val) {
    if (!val) return "";
    const s = String(val).trim();
    if (s === "ㄹ" || s === "f" || s === "F") return "F";
    if (s === "ㅡ" || s === "m" || s === "M") return "M";
    return "";
  }

  // 한글 자모 결합 (분리된 초/중/종성 자모를 완전한 음절로 자동 결합, e.g. ㅎㅏㄱ -> 학, ㅎㅏㄱㅅㅐㅇ -> 학생)
  assembleHangul(str) {
    if (!str || typeof str !== "string") return str;

    const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    const JUNGSUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
    const JONGSUNG = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

    str = str.normalize("NFC");
    const hasIsolatedJamo = /[\u3131-\u318E]/.test(str);
    if (!hasIsolatedJamo) return str;

    function decomposeChar(ch) {
      const code = ch.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        const offset = code - 0xAC00;
        const choIdx = Math.floor(offset / (21 * 28));
        const jungIdx = Math.floor((offset % (21 * 28)) / 28);
        const jongIdx = offset % 28;
        return [CHOSUNG[choIdx], JUNGSUNG[jungIdx], JONGSUNG[jongIdx]];
      }
      return [ch];
    }

    let stream = [];
    for (const ch of str) {
      const decomp = decomposeChar(ch);
      for (const j of decomp) {
        if (j) stream.push(j);
      }
    }

    const DOUBLE_JUNG = {
      'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ',
      'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ',
      'ㅡㅣ': 'ㅢ'
    };

    const DOUBLE_JONG = {
      'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ',
      'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ',
      'ㅂㅅ': 'ㅄ'
    };

    const SPLIT_DOUBLE_JONG = {
      'ㄳ': ['ㄱ', 'ㅅ'], 'ㄵ': ['ㄴ', 'ㅈ'], 'ㄶ': ['ㄴ', 'ㅎ'],
      'ㄺ': ['ㄹ', 'ㄱ'], 'ㄻ': ['ㄹ', 'ㅁ'], 'ㄼ': ['ㄹ', 'ㅂ'], 'ㄽ': ['ㄹ', 'ㅅ'],
      'ㄾ': ['ㄹ', 'ㅌ'], 'ㄿ': ['ㄹ', 'ㅍ'], 'ㅀ': ['ㄹ', 'ㅎ'],
      'ㅄ': ['ㅂ', 'ㅅ']
    };

    function isCho(c) { return CHOSUNG.includes(c); }
    function isJung(c) { return JUNGSUNG.includes(c); }
    function isJong(c) { return JONGSUNG.includes(c) && c !== ''; }

    function makeSyllable(c1, c2, c3 = '') {
      const c1Idx = CHOSUNG.indexOf(c1);
      const c2Idx = JUNGSUNG.indexOf(c2);
      const c3Idx = JONGSUNG.indexOf(c3);
      if (c1Idx === -1 || c2Idx === -1 || c3Idx === -1) return c1 + c2 + c3;
      return String.fromCharCode(0xAC00 + (c1Idx * 21 + c2Idx) * 28 + c3Idx);
    }

    let result = '';
    let cho = '', jung = '', jong = '';

    function flush() {
      if (cho && jung) {
        result += makeSyllable(cho, jung, jong);
      } else {
        result += cho + jung + jong;
      }
      cho = '';
      jung = '';
      jong = '';
    }

    for (let i = 0; i < stream.length; i++) {
      const c = stream[i];
      if (isJung(c)) {
        if (jong) {
          if (SPLIT_DOUBLE_JONG[jong]) {
            const [j1, j2] = SPLIT_DOUBLE_JONG[jong];
            jong = j1;
            flush();
            cho = j2;
            jung = c;
          } else {
            const prevJong = jong;
            jong = '';
            flush();
            cho = prevJong;
            jung = c;
          }
        } else if (jung) {
          const combined = DOUBLE_JUNG[jung + c];
          if (combined) {
            jung = combined;
          } else {
            flush();
            result += c;
          }
        } else if (cho) {
          jung = c;
        } else {
          flush();
          result += c;
        }
      } else if (isCho(c)) {
        if (!cho) {
          cho = c;
        } else if (!jung) {
          flush();
          cho = c;
        } else if (!jong) {
          if (isJong(c)) {
            const next = stream[i + 1];
            if (next && isJung(next)) {
              flush();
              cho = c;
            } else {
              jong = c;
            }
          } else {
            flush();
            cho = c;
          }
        } else {
          const combinedJong = DOUBLE_JONG[jong + c];
          const next = stream[i + 1];
          if (combinedJong && (!next || !isJung(next))) {
            jong = combinedJong;
          } else {
            flush();
            cho = c;
          }
        }
      } else {
        flush();
        result += c;
      }
    }
    flush();
    return result;
  }

  setGenderValue(rowIdx, rawVal, cellEl = null) {
    const rows = this.getCurrentRows();
    if (!rows[rowIdx]) return;
    const finalVal = this.normalizeGenderInput(rawVal);
    rows[rowIdx].gender = finalVal;

    const el = cellEl || document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="gender"]`);
    if (el) {
      let textSpan = el.querySelector(".cell-gender-text");
      if (!textSpan) {
        // Dropdown button 확인 및 보존
        const dropBtn = el.querySelector(".gender-dropdown-btn");
        el.innerHTML = "";
        textSpan = document.createElement("span");
        textSpan.className = "cell-gender-text";
        el.appendChild(textSpan);
        if (dropBtn) el.appendChild(dropBtn);
      }
      textSpan.textContent = finalVal;
      el.classList.remove("f", "m");
      if (finalVal === "F") el.classList.add("f");
      if (finalVal === "M") el.classList.add("m");
    }

    if (this.activeCell && this.activeCell.rowIdx === rowIdx && this.activeCell.colKey === "gender") {
      this.elFormulaInput.value = finalVal;
      if (el) this.highlightCell(el);
    }

    this.saveDataStore();
  }

  // 엑셀 스타일 우측 드롭다운 팝업 메뉴 (셀 안에 셀이 들어가지 않고 우측에만 표시)
  openGenderDropdown(rowIdx, cellElement, triggerElement = null) {
    this.closeGenderDropdown();

    const menu = document.createElement("div");
    menu.className = "gender-picker-menu";
    menu.id = "genderPickerMenu";

    const items = [
      { val: "M", text: "M (남)", cls: "item-m" },
      { val: "F", text: "F (여)", cls: "item-f" },
      { val: "", text: "- (선택 안함)", cls: "item-none" }
    ];

    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "성별 선택");
    this.genderPickerState = { rowIdx, cellElement, items,
      selectedIndex: Math.max(0, items.findIndex(item => item.val === (this.getCurrentRows()[rowIdx]?.gender || ""))) };
    items.forEach((item, index) => {
      const itemEl = document.createElement("div");
      itemEl.className = `gender-picker-item ${item.cls}`;
      const label = document.createElement("span");
      label.textContent = item.text;
      itemEl.appendChild(label);
      const hint = document.createElement("span");
      hint.className = "autocomplete-hint-badge gender-picker-hint";
      hint.textContent = "Enter";
      itemEl.appendChild(hint);
      itemEl.setAttribute("role", "option");
      itemEl.classList.toggle("is-selected", index === this.genderPickerState.selectedIndex);
      itemEl.setAttribute("aria-selected", String(index === this.genderPickerState.selectedIndex));
      itemEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setGenderValue(rowIdx, item.val, cellElement);
        this.closeGenderDropdown();
        this.selectCell(rowIdx, "gender", cellElement, false);
      });
      menu.appendChild(itemEl);
    });

    document.body.appendChild(menu);
    this.genderPickerKeyListener = event => this.handleGenderPickerKeyDown(event);
    document.addEventListener("keydown", this.genderPickerKeyListener, true);

    // 메뉴 위치 계산 (트리거 버튼 또는 셀 바로 아래)
    const targetRect = (triggerElement || cellElement).getBoundingClientRect();
    const menuWidth = 136;
    let left = targetRect.left;
    let top = targetRect.bottom + 1;

    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 6;
    }
    if (top + 105 > window.innerHeight) {
      top = targetRect.top - 105;
    }

    menu.style.left = `${Math.max(6, left)}px`;
    menu.style.top = `${Math.max(6, top)}px`;

    // 외부 클릭 시 닫기
    const outsideClickListener = (e) => {
      if (!menu.contains(e.target) && e.target !== triggerElement) {
        this.closeGenderDropdown();
        document.removeEventListener("click", outsideClickListener);
      }
    };
    this.genderPickerOutsideListener = outsideClickListener;
    this.genderPickerOutsideTimer = setTimeout(() => {
      if (this.genderPickerState) document.addEventListener("click", outsideClickListener);
    }, 10);
  }

  handleGenderPickerKeyDown(event) {
    const state = this.genderPickerState;
    const key = event.key === "Process" ? event.code : event.key;
    if (!state || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape"].includes(key)) return;
    if (key === "ArrowLeft" && (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (key === "ArrowLeft") this.presetLeftKeyHeld = true;
    if (key === "ArrowUp" || key === "ArrowDown") {
      const direction = key === "ArrowDown" ? 1 : -1;
      state.selectedIndex = (state.selectedIndex + direction + state.items.length) % state.items.length;
      document.getElementById("genderPickerMenu")?.querySelectorAll(".gender-picker-item").forEach((item, index) => {
        item.classList.toggle("is-selected", index === state.selectedIndex);
        item.setAttribute("aria-selected", String(index === state.selectedIndex));
      });
      return;
    }
    if (key === "Enter" || key === "ArrowRight" || key === "ArrowLeft") this.setGenderValue(state.rowIdx, state.items[state.selectedIndex].val, state.cellElement);
    this.closeGenderDropdown();
    if (key === "ArrowLeft") this.selectAutocompleteLeftCell(state.rowIdx, "gender");
    else if (key === "Enter") this.selectAutocompleteRightCell(state.rowIdx, "gender");
    else if (key === "ArrowRight") this.navigateCol(state.rowIdx, "gender", 1);
    else this.selectCell(state.rowIdx, "gender", state.cellElement, false);
    this.focusSelectedCellEditor();
  }

  closeGenderDropdown() {
    clearTimeout(this.genderPickerOutsideTimer);
    if (this.genderPickerKeyListener) document.removeEventListener("keydown", this.genderPickerKeyListener, true);
    if (this.genderPickerOutsideListener) document.removeEventListener("click", this.genderPickerOutsideListener);
    this.genderPickerState = null;
    this.genderPickerKeyListener = null;
    this.genderPickerOutsideListener = null;
    const existing = document.getElementById("genderPickerMenu");
    if (existing) {
      existing.remove();
    }
  }

  // =============================================================================
  // Cell Autocomplete Engine (셀 타이핑 시 연관 목록 표시 & Enter 시 최상단 자동 입력)
  // =============================================================================
  getChosung(str) {
    if (!str || typeof str !== "string") return "";
    const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    let res = "";
    for (const ch of str) {
      const code = ch.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        const choIdx = Math.floor((code - 0xAC00) / (21 * 28));
        res += CHOSUNG[choIdx];
      } else {
        res += ch;
      }
    }
    return res;
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

  matchesHangulPrefix(value, rawQuery, isComposing = false) {
    const name = String(value ?? "").replace(/\s+/g, "").toLowerCase();
    const query = String(rawQuery ?? "").replace(/\s+/g, "").toLowerCase();
    if (!query) return false;
    if (name.startsWith(query)) return true;
    if (/[ㄱ-ㅎ]/.test(query)) {
      return [...query].every((char, index) => name[index] !== undefined &&
        (/^[ㄱ-ㅎ]$/.test(char) ? this.getChosung(name[index]) === char : name[index] === char));
    }
    const code = query.charCodeAt(query.length - 1) - 0xac00;
    if (code < 0 || code > 11171) return false;
    const stem = query.slice(0, -1);
    if (code % 28 === 0) {
      const candidate = name.charCodeAt(stem.length) - 0xac00;
      return name.startsWith(stem) && candidate >= 0 && candidate <= 11171 &&
        Math.floor(candidate / 28) === Math.floor(code / 28);
    }
    if (!isComposing) return false;
    // A pending next initial can be attached as a final consonant: 이 + ㅊ → 잋.
    const finals = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    const splitFinals = {'ㄳ':['ㄱ','ㅅ'],'ㄵ':['ㄴ','ㅈ'],'ㄶ':['ㄴ','ㅎ'],
      'ㄺ':['ㄹ','ㄱ'],'ㄻ':['ㄹ','ㅁ'],'ㄼ':['ㄹ','ㅂ'],'ㄽ':['ㄹ','ㅅ'],
      'ㄾ':['ㄹ','ㅌ'],'ㄿ':['ㄹ','ㅍ'],'ㅀ':['ㄹ','ㅎ'],'ㅄ':['ㅂ','ㅅ']};
    const [retained, initial] = splitFinals[finals[code % 28]] || ['', finals[code % 28]];
    const prefix = stem + String.fromCharCode(0xac00 + code - code % 28 + finals.indexOf(retained));
    return name.startsWith(prefix) && name.length > prefix.length && this.getChosung(name[prefix.length]) === initial;
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
      const rows = this.getCurrentRows();
      const rowIdx = Math.max(0, rows.findLastIndex(row => keys.slice(0, -1).some(key => String(row[key] ?? "").trim())));
      const lastCol = this.selectedRange?.maxCol ?? 10;
      const header = this.elTableBody.querySelector(`tr[data-row-idx="${rowIdx}"] .row-num`);
      if (header) header.closest("tr").style.display = "";
      this.selectRowRange(rowIdx, rowIdx, lastCol);
      header?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    const copiedRange = this.clipboardSelection?.date === this.currentDate ? this.clipboardSelection : null;
    const range = copiedRange || this.crossDateSelection || this.selectedRange;
    const colKey = range ? keys[range.minCol] : this.activeCell?.colKey || "no";
    if (!colKey) return;
    if (!range && !this.activeCell && this.selectedRowIdx == null) return;
    const rows = this.getCurrentRows();
    // 이전 내역에서 내려올 때는 삭제/이동 전의 적용 위치 대신 현재 데이터 전체를 확인한다.
    let rowIdx = this.crossDateSelection
      ? this.getLastPatientRowIndex()
      : range ? rows.findLastIndex(row => String(row[colKey] ?? "").trim()) : -1;
    // A wholly empty first column (for example No. in a copied row) still lands on the last record.
    if (rowIdx < 0 && !this.crossDateSelection) rowIdx = rows.findLastIndex(row => keys.slice(0, -1).some(key => String(row[key] ?? "").trim()));
    rowIdx = Math.max(0, rowIdx);
    const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${colKey}"]`);
    if (cell) {
      cell.closest("tr").style.display = "";
      this.selectCell(rowIdx, colKey, cell);
      cell.scrollIntoView({ block: "nearest", inline: "nearest" });
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
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
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
  PTAutocomplete, PTCellEditor, PTSheetSelection, PTSheetActions, PTSheetKeyboard, PTColumnSettings]) {
  for (const name of Object.getOwnPropertyNames(feature.prototype)) {
    if (name === "constructor") continue;
    Object.defineProperty(PTApp.prototype, name, Object.getOwnPropertyDescriptor(feature.prototype, name));
  }
}

// Instantiate on DOMContentLoaded
window.addEventListener("DOMContentLoaded", () => {
  window.ptApp = new PTApp();
});
