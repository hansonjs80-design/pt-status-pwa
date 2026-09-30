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
    this.syncBaselines = new Map(Object.entries(JSON.parse(JSON.stringify(this.dataStore))));
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
    if (!this.editHistory.has(date)) {
      this.editHistory.set(date, { undo: [], redo: [], current: JSON.stringify(this.dataStore[date] || []) });
    }
    return this.editHistory.get(date);
  }

  captureHistory() {
    const history = this.getEditHistory();
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
    this.elSearchInput.value = "";
    this.elBtnClearSearch.style.display = "none";
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
    this.saveDataStore(false);
    this.showSaveIndicator(redo ? "다시 실행됨" : "되돌림 완료");
  }

  handleHistoryShortcut(e) {
    if (e.isComposing || e.keyCode === 229 || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
    const key = e.key.toLowerCase();
    if (key !== "z" && key !== "y") return false;
    const target = e.target;
    if (target?.matches("input, textarea, [contenteditable='true']") &&
        !target.matches(".cell-input-element") && target !== this.elFormulaInput) return false;
    e.preventDefault();
    e.stopPropagation();
    this.restoreEditHistory(key === "y" || e.shiftKey);
    return true;
  }

  debounceSaveDataStore(delay = 350) {
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
    this.elStatTotalCount = document.getElementById("statTotalCount");
    this.elStatMaleCount = document.getElementById("statMaleCount");
    this.elStatFemaleCount = document.getElementById("statFemaleCount");
    this.elStatUnknownCount = document.getElementById("statUnknownCount");
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
    this.elSupabaseStatusLabel = document.getElementById("supabaseStatusLabel");
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
  }

  bindEvents() {
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
        if (e.button !== 0 || e.target.closest(".col-resizer") || th.dataset.col === "del") return;
        e.preventDefault();
        const start = e.shiftKey && this.columnAnchor ? this.columnAnchor : th.dataset.col;
        this.columnDragAnchor = start;
        this.selectEntireColumn(start, "", th.dataset.col);
      });
      th.addEventListener("mouseenter", () => {
        if (this.columnDragAnchor && th.dataset.col !== "del") this.selectEntireColumn(this.columnDragAnchor, "", th.dataset.col);
      });
    });
    document.addEventListener("mouseup", () => { this.columnDragAnchor = null; });

    // Business Headers Click (Sort Column)
    document.querySelectorAll(".business-headers-row th.b-header").forEach((th) => {
      th.addEventListener("click", () => {
        const colKey = th.dataset.col;
        if (colKey && colKey !== "del") this.sortByColumn(colKey);
      });
    });

    // Corner Header Click (Select All Sheet)
    const cornerHeader = document.getElementById("cornerHeader");
    if (cornerHeader) {
      cornerHeader.addEventListener("click", () => this.selectAllCells());
    }

    this.elDateLabel.addEventListener("click", () => this.openCalendar());

    // Date Navigation
    this.elDatePicker.addEventListener("change", (e) => {
      if (e.target.value) this.setDate(e.target.value);
    });

    this.elBtnPrevDay.addEventListener("click", () => this.shiftDay(-1));
    this.elBtnNextDay.addEventListener("click", () => this.shiftDay(1));
    this.elBtnGoToday.addEventListener("click", () => this.setDate(this.getTodayString(), true));

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
    this.elTabPresetPrescription = document.getElementById("tabPresetPrescription");
    this.elTabPresetExtra = document.getElementById("tabPresetExtra");
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
    }
    if (this.elTabPresetPrescription) {
      this.elTabPresetPrescription.addEventListener("click", () => this.switchPresetTab("prescription"));
    }
    if (this.elTabPresetExtra) {
      this.elTabPresetExtra.addEventListener("click", () => this.switchPresetTab("extra"));
    }
    if (this.elBtnManagerAddPreset) {
      this.elBtnManagerAddPreset.addEventListener("click", () => this.addPresetFromManager());
    }
    if (this.elManagerNewPresetInput) {
      this.elManagerNewPresetInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.addPresetFromManager();
      });
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
    this.elBtnClearSearch.addEventListener("click", () => {
      this.elSearchInput.value = "";
      this.handleSearch();
    });

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

    // Keyboard Shortcuts
    document.addEventListener("keydown", (e) => this.handleGlobalKeyDown(e));

    document.addEventListener("paste", event => {
      const target = event.target;
      if (this.crossDateSelection) { event.preventDefault(); return; }
      if (!this.activeCell && !this.selectedRange && this.selectedRowIdx === null) return;
      if (target.matches?.("input, textarea") && !target.matches(".cell-input-element")) return;
      const text = event.clipboardData?.getData("text/plain");
      if (text == null) return;
      if (target.matches?.(".cell-input-element:not(.is-armed)") && !/[\t\r\n]/.test(text)) return;
      event.preventDefault();
      if (target.matches?.(".cell-input-element")) target.blur();
      void this.pasteSelection(text);
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
    document.addEventListener("mousemove", (event) => this.updateFillDrag(event));
    window.addEventListener("blur", () => this.cancelFillDrag());
    document.addEventListener("mouseup", (event) => {
      this.isSelectingCrossDate = false;
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
  }

  // Get or initialize rows for a given date (guarantee minimum DEFAULT_ROW_COUNT = 150 rows)
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
      const nav = (text, label, delta) => {
        const button = document.createElement("button"); button.textContent = text; button.setAttribute("aria-label", label);
        button.onclick = () => { const next = new Date(year, month - 1 + delta, 1); year = next.getFullYear(); month = next.getMonth() + 1; render(); popup.querySelector(`[aria-label="${label}"]`).focus(); };
        return button;
      };
      header.append(nav("‹", "이전 달", -1));
      const yearInput = document.createElement("input"); yearInput.type = "number"; yearInput.min = "1900"; yearInput.max = "2100"; yearInput.value = year; yearInput.setAttribute("aria-label", "연도");
      yearInput.onchange = () => { year = Math.max(1900, Math.min(2100, Number(yearInput.value) || year)); render(); };
      const monthSelect = document.createElement("select"); monthSelect.setAttribute("aria-label", "월");
      for (let m = 1; m <= 12; m++) { const option = new Option(`${m}월`, m, false, m === month); monthSelect.add(option); }
      monthSelect.onchange = () => { month = Number(monthSelect.value); render(); };
      header.append(yearInput, monthSelect, nav("›", "다음 달", 1)); popup.append(header);
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

  applyColumnTypography(property, value) {
    if (!this.selectedColumnRange || !["fontSize", "fontWeight"].includes(property)) return;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const range = { ...this.selectedColumnRange };
    for (const row of this.getCurrentRows()) for (let col = range.minCol; col <= range.maxCol; col++) {
      row._textStyles ||= {}; row._textStyles[keys[col]] ||= {};
      if (value === null) delete row._textStyles[keys[col]][property];
      else row._textStyles[keys[col]][property] = value;
    }
    this.saveDataStore(); this.renderTable();
    this.selectEntireColumn(keys[range.minCol], "", keys[range.maxCol]);
  }

  openColumnTypographyMenu(property) {
    if (!this.selectedColumnRange) return;
    this.typographyCleanup?.(); document.getElementById("columnTypographyMenu")?.remove();
    const popup = document.createElement("div"); popup.id = "columnTypographyMenu"; popup.className = "column-typography-menu";
    popup.setAttribute("role", "dialog"); popup.setAttribute("aria-label", property === "fontSize" ? "글자 크기" : "글자 굵기");
    const title = document.createElement("strong"); title.textContent = property === "fontSize" ? "글자 크기" : "글자 굵기"; popup.append(title);
    const options = property === "fontSize" ? [[null, "기본 크기"], ...[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32].map(n => [n, `${n}px`])]
      : [[null, "기본 굵기"], [400, "보통"], [500, "중간"], [600, "약간 굵게"], [700, "굵게"], [800, "매우 굵게"]];
    const close = () => { popup.remove(); this.typographyCleanup?.(); this.typographyCleanup = null; };
    for (const [value, label] of options) {
      const button = document.createElement("button"); button.textContent = label;
      if (property === "fontWeight" && value) button.style.fontWeight = value;
      button.onclick = () => { this.applyColumnTypography(property, value); close(); this.elSheetContainer.focus(); };
      popup.append(button);
    }
    popup.onmousedown = event => event.preventDefault(); document.body.append(popup);
    const rect = this.elContextMenu.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - popup.offsetWidth - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - popup.offsetHeight - 8))}px`;
    const outside = event => { if (!popup.contains(event.target)) close(); };
    const escape = event => { event.stopPropagation(); if (event.key === "Escape") { close(); this.elSheetContainer.focus(); } };
    document.addEventListener("mousedown", outside); popup.addEventListener("keydown", escape);
    this.typographyCleanup = () => document.removeEventListener("mousedown", outside);
    popup.querySelector("button").focus();
  }

  setDate(dateStr, autoFocusFirstEmpty = false) {
    if (this.isEditingCell() || document.activeElement?.matches(".cell-input-element")) document.activeElement.blur();
    clearTimeout(this._saveTimer);
    this.clipboardSelection = null;
    this.historyApplyTarget = null;
    this.currentDate = dateStr;
    this.elDatePicker.value = dateStr;

    // Format display: e.g., 2026.09.29 (화)
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const daysKor = ["일", "월", "화", "수", "목", "금", "토"];
    const dayLabel = daysKor[dateObj.getDay()] || "";
    const dateFormatted = `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;

    this.elDateLabel.textContent = `${dateFormatted} (${dayLabel})`;
    this.elSidebarDateTag.textContent = dateFormatted;
    this.elSheetTabTitle.textContent = dateFormatted;

    this.getCurrentRows();
    this.getEditHistory();
    this.renderTable();
    this.updateHistoryButtons();
    this.updateSidebarStats();

    // Pull from Supabase cloud if connected
    if (this.supabaseClient) {
      this.pullFromCloud(dateStr, false);
    }

    if (autoFocusFirstEmpty) {
      setTimeout(() => this.focusFirstEmptyCell(), 80);
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
    this.cancelFillDrag();
    this.clearCrossDateSelection();
    const rows = this.getCurrentRows();
    this.elTableBody.innerHTML = "";

    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const colLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

    rows.forEach((row, rowIdx) => {
      const tr = document.createElement("tr");
      tr.className = "excel-row";
      tr.dataset.rowIdx = rowIdx;
      tr.classList.toggle("lunch-break-row", Boolean(row._lunchBefore));

      // Row Number Header (1, 2, 3...)
      const excelRowNum = BASE_ROW_NUMBER + rowIdx;
      const thNum = document.createElement("th");
      thNum.className = "row-num";
      thNum.textContent = excelRowNum;
      thNum.title = `행 ${excelRowNum}: 드래그하여 이동, Shift+클릭으로 여러 행 선택`;
      thNum.draggable = true;
      thNum.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        const range = this.selectedRowRange;
        if (e.shiftKey && range) this.selectRowRange(this.rowRangeStart ?? range.minRow, rowIdx);
        else if (!range || rowIdx < range.minRow || rowIdx > range.maxRow) this.selectRowRange(rowIdx, rowIdx);
        this.elSheetContainer.focus({ preventScroll: true });
      });
      thNum.addEventListener("dragstart", (e) => {
        if (this.elSearchInput.value.trim()) { e.preventDefault(); return; }
        this.rowMove = { ...this.selectedRowRange, date: this.currentDate };
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "행 이동");
      });
      tr.addEventListener("dragover", (e) => {
        if (!this.rowMove) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        this.clearRowDropMarker();
        const after = e.clientY >= tr.getBoundingClientRect().top + tr.getBoundingClientRect().height / 2;
        this.rowDropIndex = rowIdx + (after ? 1 : 0);
        tr.classList.add(after ? "row-drop-after" : "row-drop-before");
      });
      tr.addEventListener("drop", (e) => {
        if (!this.rowMove) return;
        e.preventDefault();
        this.finishRowMove();
      });
      thNum.addEventListener("dragend", () => {
        this.rowMove = null;
        this.clearRowDropMarker();
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
        if (row._textColors?.[key]) td.style.color = row._textColors[key];
        if (row._textStyles?.[key]?.fontSize) td.style.fontSize = row._textStyles[key].fontSize + "px";
        if (row._textStyles?.[key]?.fontWeight) td.style.fontWeight = row._textStyles[key].fontWeight;

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
    this.renderClipboardSelection();
    if (this.activeCell && this.activeCell.colKey !== "gender") {
      const { rowIdx, colKey } = this.activeCell;
      const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${colKey}"]`);
      if (cell) this.startInlineEdit(rowIdx, colKey, cell, true);
    }
  }

  // Select and focus cell like Excel
  selectCell(rowIdx, colKey, cellElement, startEdit = false) {
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
    });
    handle.addEventListener("click", (event) => event.stopPropagation());
    cellElement.appendChild(handle);
  }

  updateFillDrag(event) {
    if (!this.fillDrag) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest("tr[data-row-idx]");
    if (!row || !this.elTableBody.contains(row)) return;
    const endRow = Math.max(this.fillDrag.rowIdx, Number(row.dataset.rowIdx));
    if (this.fillDrag.endRow === endRow) return;
    this.fillDrag.endRow = endRow;
    this.elTableBody.querySelectorAll(".fill-preview").forEach((cell) => cell.classList.remove("fill-preview"));
    for (let r = this.fillDrag.rowIdx + 1; r <= endRow; r++) {
      this.elTableBody.querySelector(`.excel-cell[data-row="${r}"][data-col="${this.fillDrag.colKey}"]`)?.classList.add("fill-preview");
    }
  }

  cancelFillDrag() {
    if (!this.fillDrag) return;
    this.fillDrag = null;
    this.elTableBody.querySelectorAll(".fill-preview").forEach((cell) => cell.classList.remove("fill-preview"));
    this.elSheetContainer.classList.remove("is-selecting");
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

    items.forEach((item) => {
      const itemEl = document.createElement("div");
      itemEl.className = `gender-picker-item ${item.cls}`;
      itemEl.textContent = item.text;
      itemEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setGenderValue(rowIdx, item.val, cellElement);
        this.closeGenderDropdown();
        this.selectCell(rowIdx, "gender", cellElement, false);
      });
      menu.appendChild(itemEl);
    });

    document.body.appendChild(menu);

    // 메뉴 위치 계산 (트리거 버튼 또는 셀 바로 아래)
    const targetRect = (triggerElement || cellElement).getBoundingClientRect();
    const menuWidth = 85;
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
    setTimeout(() => {
      document.addEventListener("click", outsideClickListener);
    }, 10);
  }

  closeGenderDropdown() {
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

  getSearchDataStore() {
    // Cloud history is read-only search data; local edits always take precedence.
    return { ...this.cloudSearchHistory, ...this.dataStore };
  }

  async loadSearchHistory() {
    const client = this.supabaseClient;
    if (!client) return false;
    if (this.searchHistoryClient !== client) {
      this.searchHistoryClient = client;
      this.cloudSearchHistory = {};
      this.searchHistoryLoadedAt = 0;
      this.searchHistoryRequest = null;
    }
    if (this.searchHistoryRequest) return this.searchHistoryRequest;
    if (Date.now() - (this.searchHistoryLoadedAt || 0) < 300000) return false;
    const request = (async () => {
      const history = {};
      const pageSize = 200;
      try {
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await client.from("pt_daily_records")
            .select("date, rows_data").order("date", { ascending: false }).range(offset, offset + pageSize - 1);
          if (error) throw error;
          if (this.supabaseClient !== client) return false;
          for (const entry of data || []) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Array.isArray(entry.rows_data)) history[entry.date] = entry.rows_data;
          }
          if (!data || data.length < pageSize) break;
        }
        this.cloudSearchHistory = history;
        this.searchHistoryLoadedAt = Date.now();
        this.refreshSearchSuggestions();
        if (this.elSearchInput?.value.trim()) this.searchAllDates(this.elSearchInput.value.trim());
        return true;
      } catch (error) {
        console.warn("이전 날짜 검색 기록을 불러오지 못했습니다:", error.message || error);
        return false;
      }
    })();
    this.searchHistoryRequest = request;
    try { return await request; }
    finally { if (this.searchHistoryRequest === request) this.searchHistoryRequest = null; }
  }

  refreshSearchSuggestions() {
    const input = document.activeElement;
    if (!input?.matches(".cell-input-element:not(.is-armed)")) return;
    const cell = input.closest(".excel-cell");
    const colKey = cell?.dataset.col;
    if (!colKey || ["gender", "writer", "no"].includes(colKey)) return;
    const suggestions = this.getAutocompleteSuggestions(colKey, input.value);
    if (suggestions.length) this.showAutocompleteMenu(Number(cell.dataset.row), colKey, cell, input, suggestions);
    else this.closeAutocompleteMenu();
  }

  getAutocompleteSuggestions(colKey, rawQuery) {
    if (!rawQuery) return [];
    const query = String(rawQuery).trim().toLowerCase();
    if (!query) return [];

    const presets = COLUMN_PRESETS[colKey] ? [...COLUMN_PRESETS[colKey]] : [];
    const presetSet = new Set(presets.map((p) => p.toLowerCase()));

    // 현재 날짜뿐 아니라 저장된 모든 날짜의 같은 열에서 후보를 수집한다.
    // 현재 날짜, 최근 날짜 순으로 수집하되 같은 값은 한 번만 표시한다.
    const searchStore = this.getSearchDataStore();
    const dateKeys = [this.currentDate, ...Object.keys(searchStore)
      .filter(date => date !== this.currentDate).sort().reverse()];
    const existingValues = new Set();
    const seenValues = new Set(presetSet);
    for (const dateKey of dateKeys) {
      const rows = searchStore[dateKey];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const value = String(row?.[colKey] ?? "").trim();
        const normalized = value.toLowerCase();
        if (!value || seenValues.has(normalized)) continue;
        seenValues.add(normalized);
        existingValues.add(value);
      }
    }

    // Only explicit initials are fuzzy; completed syllables must match literally.
    const queryChars = [...query];
    const hasInitials = /[ㄱ-ㅎ]/.test(query);
    const matchesInitialsAt = (value, start) => hasInitials && queryChars.every((char, index) => {
      const candidate = value[start + index];
      return candidate !== undefined && (/^[ㄱ-ㅎ]$/.test(char)
        ? this.getChosung(candidate) === char : candidate === char);
    });

    const matched = [];

    // 통합 매칭 함수: 매칭 품질 우선, 동일 품질 내 프리셋 우선
    const matchItem = (item, isPreset) => {
      const itemLower = item.toLowerCase();
      if (itemLower === query) return; // 정확히 일치하면 추천 불필요

      // 매칭 품질: 1=접두사, 2=초성접두사, 3=부분일치, 4=초성부분
      // 출처 보너스: 프리셋이면 +0, 기존값이면 +0.5 (동일 품질 내 프리셋 우선)
      let quality = -1;

      if (itemLower.startsWith(query)) {
        quality = 1; // 접두사 일치 (e.g. '한' -> '한랭...')
      } else if (matchesInitialsAt(itemLower, 0)) {
        quality = 2; // 초성 접두사 (e.g. 'ㅎ' -> '학생...')
      } else if (itemLower.includes(query)) {
        quality = 3; // 부분 일치
      } else if (hasInitials && [...itemLower].some((_, index) => matchesInitialsAt(itemLower, index))) {
        quality = 4; // 초성 부분 일치
      }

      if (quality >= 0) {
        const score = quality * 10 + (isPreset ? 0 : 5);
        matched.push({ item, score });
      }
    };

    // 1) 프리셋 항목 매칭
    for (const item of presets) {
      matchItem(item, true);
    }

    // 2) 시트 기존 값 매칭
    for (const item of existingValues) {
      matchItem(item, false);
    }

    matched.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.item.length - b.item.length;
    });

    let results = matched.map((m) => m.item).slice(0, 10);

    // 부위와 차트번호는 현재 입력값을 첫 후보로 유지한다.
    if (colKey === "part" || colKey === "chartNo") {
      const assembled = this.assembleHangul(rawQuery).trim();
      if (assembled) {
        // 이미 목록에 정확히 같은 값이 있으면 제거 후 맨 앞에 추가
        results = results.filter((r) => r !== assembled);
        results.unshift(assembled);
        results = results.slice(0, 10);
      }
    }

    return results;
  }

  showAutocompleteMenu(rowIdx, colKey, cellElement, input, candidates) {
    this.closeAutocompleteMenu();
    if (!candidates || candidates.length === 0) return;

    const menu = document.createElement("div");
    menu.id = "cellAutocompleteMenu";
    menu.className = "cell-autocomplete-menu";

    candidates.forEach((cand, idx) => {
      const itemEl = document.createElement("div");
      itemEl.className = "autocomplete-item" + (idx === 0 ? " is-selected" : "");
      itemEl.setAttribute("data-index", idx);

      const textSpan = document.createElement("span");
      textSpan.className = "autocomplete-item-text";
      textSpan.textContent = cand;
      itemEl.appendChild(textSpan);

      if (idx === 0) {
        const hintBadge = document.createElement("span");
        hintBadge.className = "autocomplete-hint-badge";
        hintBadge.textContent = "↵ Enter";
        itemEl.appendChild(hintBadge);
      }

      itemEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
      });

      itemEl.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = cand;
        this._justCommittedFromAutocomplete = true;
        this.closeAutocompleteMenu();
        const rows = this.getCurrentRows();
        if (rows[rowIdx]) rows[rowIdx][colKey] = cand;
        cellElement.textContent = cand;
        this.saveDataStore();
        this.selectCell(rowIdx, colKey, cellElement, false);
        if (this.elSheetContainer) {
          this.elSheetContainer.focus({ preventScroll: true });
        }
      });

      menu.appendChild(itemEl);
    });

    document.body.appendChild(menu);

    this.autocompleteState = {
      rowIdx,
      colKey,
      cellElement,
      input,
      candidates,
      selectedIndex: 0
    };

    const positionMenu = () => {
      if (!menu.isConnected || !cellElement.isConnected) return;
      const rect = cellElement.getBoundingClientRect();
      const margin = 6, gap = 4;
      const width = Math.min(Math.max(rect.width, 160), window.innerWidth - margin * 2);
      menu.style.minWidth = `${width}px`;
      menu.style.maxWidth = `${window.innerWidth - margin * 2}px`;
      menu.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - menu.offsetWidth - margin))}px`;
      menu.style.maxHeight = "220px";
      const naturalHeight = menu.offsetHeight;
      const below = Math.max(0, window.innerHeight - rect.bottom - gap - margin);
      const above = Math.max(0, rect.top - gap - margin);
      const useBelow = naturalHeight <= below || below >= above;
      const available = useBelow ? below : above;
      menu.style.maxHeight = `${Math.min(220, available)}px`;
      const height = menu.offsetHeight;
      menu.style.top = `${useBelow ? rect.bottom + gap : rect.top - gap - height}px`;
    };
    positionMenu();

    const outsideClickListener = (e) => {
      if (!menu.contains(e.target) && e.target !== input) this.closeAutocompleteMenu();
    };
    const scrollListener = (event) => {
      if (!menu.contains(event.target)) positionMenu();
    };
    document.addEventListener("mousedown", outsideClickListener);
    window.addEventListener("resize", positionMenu);
    document.addEventListener("scroll", scrollListener, true);
    this.autocompleteCleanup = () => {
      document.removeEventListener("mousedown", outsideClickListener);
      window.removeEventListener("resize", positionMenu);
      document.removeEventListener("scroll", scrollListener, true);
    };
  }

  moveAutocompleteSelection(direction) {
    if (!this.autocompleteState) return;
    const { candidates } = this.autocompleteState;
    if (!candidates || candidates.length === 0) return;

    let nextIdx = this.autocompleteState.selectedIndex + direction;
    if (nextIdx < 0) nextIdx = candidates.length - 1;
    if (nextIdx >= candidates.length) nextIdx = 0;

    this.autocompleteState.selectedIndex = nextIdx;

    const menu = document.getElementById("cellAutocompleteMenu");
    if (menu) {
      const items = menu.querySelectorAll(".autocomplete-item");
      items.forEach((it, idx) => {
        const isSel = idx === nextIdx;
        it.classList.toggle("is-selected", isSel);
        let badge = it.querySelector(".autocomplete-hint-badge");
        if (isSel) {
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "autocomplete-hint-badge";
            badge.textContent = "↵ Enter";
            it.appendChild(badge);
          }
          it.scrollIntoView({ block: "nearest" });
        } else if (badge) {
          badge.remove();
        }
      });
    }
  }

  getSelectedAutocompleteItem() {
    if (!this.autocompleteState) return null;
    const { candidates, selectedIndex } = this.autocompleteState;
    return candidates[selectedIndex] || candidates[0] || null;
  }

  isAutocompleteOpen() {
    return Boolean(this.autocompleteState && document.getElementById("cellAutocompleteMenu"));
  }

  closeAutocompleteMenu() {
    this.autocompleteCleanup?.();
    this.autocompleteCleanup = null;
    const existing = document.getElementById("cellAutocompleteMenu");
    if (existing) {
      existing.remove();
    }
    this.autocompleteState = null;
  }

  activateNativeEditor(input) {
    if (!input.classList.contains("is-armed")) return;
    for (const child of [...input.parentElement.childNodes]) {
      if (child !== input) child.remove();
    }
    input.classList.remove("is-armed");
  }

  startInlineEdit(rowIdx, colKey, cellElement, armed = false) {
    void this.loadSearchHistory();
    if (colKey === "gender") {
      const dropBtn = cellElement.querySelector(".gender-dropdown-btn");
      this.openGenderDropdown(rowIdx, cellElement, dropBtn);
      return;
    }

    const existingEditor = cellElement.querySelector("input");
    if (existingEditor) {
      if (!armed) {
        this.activateNativeEditor(existingEditor);
        existingEditor.focus({ preventScroll: true });
        existingEditor.setSelectionRange(existingEditor.value.length, existingEditor.value.length);
      }
      return;
    }
    if (cellElement.querySelector("select")) return;

    const rows = this.getCurrentRows();
    const initialVal = rows[rowIdx] ? (rows[rowIdx][colKey] || "") : "";

    // An armed input stays transparent over the selected cell until native typing starts.
    if (!armed) cellElement.textContent = "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "cell-input-element" + (armed ? " is-armed" : "");
    input.value = initialVal;
    if (colKey === "writer") {
      input.autocapitalize = "characters";
      input.spellcheck = false;
    }

    cellElement.appendChild(input);
    input.focus({ preventScroll: true });
    // 커서를 텍스트 끝에 배치 (전체 선택하지 않음)
    const len = input.value.length;
    input.setSelectionRange(armed ? 0 : len, len);

    // Input events
    // ★ 한글 IME 보호 원칙:
    // 1. input 이벤트에서 절대로 input.value를 변경하지 않음
    // 2. isComposing 중에는 자동완성 등 DOM 조작도 하지 않음 (IME 방해)
    // 3. assembleHangul은 blur(편집 종료) 시점에서만 최종 보정으로 실행
    let _acDebounceTimer = null;
    let composing = false;
    input.addEventListener("compositionstart", () => {
      this.activateNativeEditor(input);
      composing = true;
      input.dataset.composing = "true";
      clearTimeout(_acDebounceTimer);
      this.closeAutocompleteMenu();
    });

    input.addEventListener("input", (e) => {
      this.activateNativeEditor(input);
      const val = input.value;

      // writer 열은 영문 대문자 변환만 (한글 입력과 무관)
      if (colKey === "writer" && !composing && !e.isComposing) {
        const normalized = this.normalizeWriterInput(val);
        if (normalized !== val) input.value = normalized;
        rows[rowIdx][colKey] = normalized;
      } else {
        rows[rowIdx][colKey] = val;
      }
      this.elFormulaInput.value = input.value;
      this.debounceSaveDataStore();

      // Keep the native input and focus intact during composition.
      // Only the separate suggestion popup is refreshed, including Windows IME input.
      if (colKey !== "gender" && colKey !== "writer" && colKey !== "no") {
        clearTimeout(_acDebounceTimer);
        _acDebounceTimer = setTimeout(() => {
          if (!input.isConnected || document.activeElement !== input) return;
          const suggestions = this.getAutocompleteSuggestions(colKey, input.value);
          if (suggestions.length > 0) {
            this.showAutocompleteMenu(rowIdx, colKey, cellElement, input, suggestions);
          } else {
            this.closeAutocompleteMenu();
          }
        }, 50);
      }
    });

    input.addEventListener("compositionend", () => {
      composing = false;
      input.dataset.composing = "false";
      if (this._justCommittedFromAutocomplete) return;
      // ★ input.value를 절대 변경하지 않음! 다음 글자 조합을 방해함
      // assembleHangul은 blur 시점에서만 최종 보정
      const val = input.value;
      if (colKey === "writer") {
        const normalized = this.normalizeWriterInput(val);
        if (normalized !== val) input.value = normalized;
        rows[rowIdx][colKey] = normalized;
      } else {
        rows[rowIdx][colKey] = val;
      }
      this.elFormulaInput.value = input.value;
      this.debounceSaveDataStore();

      // 한글 조합이 완전히 끝난 시점에서 자동완성 목록 갱신 (약간 지연)
      if (colKey !== "gender" && colKey !== "writer" && colKey !== "no") {
        clearTimeout(_acDebounceTimer);
        _acDebounceTimer = setTimeout(() => {
          if (!input.isConnected || document.activeElement !== input) return;
          const suggestions = this.getAutocompleteSuggestions(colKey, input.value);
          if (suggestions.length > 0) {
            this.showAutocompleteMenu(rowIdx, colKey, cellElement, input, suggestions);
          } else {
            this.closeAutocompleteMenu();
          }
        }, 80);
      }
    });

    let isCommitted = false;
    const commitAndBlur = (forcedVal) => {
      if (isCommitted) return;
      isCommitted = true;
      clearTimeout(_acDebounceTimer);
      let finalVal = forcedVal !== undefined ? forcedVal : this.assembleHangul(input.value);
      finalVal = colKey === "writer" ? this.normalizeWriterInput(finalVal) : finalVal.trim();
      rows[rowIdx][colKey] = finalVal;
      // ★ 셀에 이미 새 input이 있으면(더블클릭으로 재편집 진입 등) 셀 내용 덮어쓰기 방지
      const existingInput = cellElement.querySelector("input");
      if (!existingInput || existingInput === input) {
        this.renderColoredText(cellElement, rows[rowIdx], colKey);
      }
      if (colKey === "gender") {
        cellElement.classList.remove("f", "m");
        if (finalVal === "F") cellElement.classList.add("f");
        if (finalVal === "M") cellElement.classList.add("m");
      }
      this.saveDataStore();
      setTimeout(() => {
        this._justCommittedFromAutocomplete = false;
      }, 60);
    };

    input.addEventListener("blur", () => {
      clearTimeout(_acDebounceTimer);
      if (input.classList.contains("is-armed")) { input.remove(); return; }
      this.closeAutocompleteMenu();
      commitAndBlur();
    });

    input.addEventListener("keydown", (e) => {
      // Let the native IME handle candidate selection and composition confirmation.
      if (composing || e.isComposing || e.keyCode === 229) {
        e.stopPropagation();
        return;
      }
      if (this.handleHistoryShortcut(e)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowDown") {
        e.preventDefault(); e.stopPropagation(); input.blur(); this.jumpToLastRecord(); return;
      }
      if (input.classList.contains("is-armed")) {
        if (e.key === "F2") {
          e.preventDefault(); e.stopPropagation();
          this.activateNativeEditor(input);
          input.setSelectionRange(input.value.length, input.value.length);
          return;
        }
        const shortcut = e.ctrlKey || e.metaKey || ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Backspace", "Enter", "Tab", "Escape"].includes(e.key);
        const writerKey = colKey === "writer" && /^Key[A-Z]$/.test(e.code) && !e.altKey;
        if (shortcut || writerKey) {
          e.preventDefault(); e.stopPropagation();
          if (writerKey && !e.ctrlKey && !e.metaKey) {
            input.value = e.code.slice(3);
            input.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            this.elSheetContainer.dispatchEvent(new KeyboardEvent("keydown", {
              key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
              shiftKey: e.shiftKey, altKey: e.altKey, bubbles: true, cancelable: true
            }));
          }
          return;
        }
      }
      if (e.shiftKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.stopPropagation(); // While editing, Shift+arrows select native input text.
        return;
      }
      // 1) 자동완성 목록이 열려 있을 때: Enter/Tab 시 최상단(또는 선택된) 항목 즉시 입력
      if (this.isAutocompleteOpen()) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          this.moveAutocompleteSelection(1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          this.moveAutocompleteSelection(-1);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.closeAutocompleteMenu();
          return;
        }
        if (e.key === "Enter" || e.code === "Enter" || e.keyCode === 13) {
          e.preventDefault();
          e.stopPropagation();
          const chosenVal = this.getSelectedAutocompleteItem();
          this._justCommittedFromAutocomplete = true;
          this.closeAutocompleteMenu();
          if (chosenVal) {
            input.value = chosenVal;
          }
          commitAndBlur(chosenVal);
          // 다음 행으로 가지 않고 해당 셀 선택 테두리 유지 (커서는 비활성화된 셀 선택 상태)
          this.selectCell(rowIdx, colKey, cellElement, false);
          if (this.elSheetContainer) {
            this.elSheetContainer.focus({ preventScroll: true });
          }
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          const chosenVal = this.getSelectedAutocompleteItem();
          this._justCommittedFromAutocomplete = true;
          this.closeAutocompleteMenu();
          if (chosenVal) {
            input.value = chosenVal;
          }
          commitAndBlur(chosenVal);
          if (e.shiftKey) {
            this.navigateCol(rowIdx, colKey, -1);
          } else {
            this.navigateCol(rowIdx, colKey, 1);
          }
          return;
        }
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const atEdge = input.selectionStart === input.selectionEnd &&
          (e.key === "ArrowLeft" ? input.selectionStart === 0 : input.selectionEnd === input.value.length);
        if (!atEdge || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) { e.stopPropagation(); return; }
      }
      // 2) 방향키 처리: 편집 커밋 후 해당 방향으로 셀 이동
      //    자동완성이 열려있을 때는 위/아래는 이미 위에서 처리됨 (목록 이동)
      //    자동완성이 열려있을 때 좌/우 방향키 또는 자동완성이 닫혀있을 때 모든 방향키
      //    조합 중에는 위의 가드에서 IME에 키 처리를 맡긴다
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();

        // 자동완성이 열려있으면 선택된 항목을 적용
        if (this.isAutocompleteOpen() && e.key !== "ArrowLeft") {
          const chosenVal = this.getSelectedAutocompleteItem();
          this._justCommittedFromAutocomplete = true;
          this.closeAutocompleteMenu();
          if (chosenVal) {
            input.value = chosenVal;
          }
          commitAndBlur(chosenVal);
        } else {
          commitAndBlur();
        }

        // 방향에 따라 셀 이동
        const colOrder = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
        const colIdx = colOrder.indexOf(colKey);
        let targetRow = rowIdx;
        let targetColIdx = colIdx;

        if (e.key === "ArrowUp") targetRow = Math.max(0, rowIdx - 1);
        if (e.key === "ArrowDown") targetRow = rowIdx + 1;
        if (e.key === "ArrowLeft") targetColIdx = Math.max(0, colIdx - 1);
        if (e.key === "ArrowRight") targetColIdx = Math.min(colOrder.length - 1, colIdx + 1);

        const targetColKey = colOrder[targetColIdx];
        // ArrowDown이 마지막 행을 넘어갈 경우 행 추가
        const rows = this.getCurrentRows();
        if (targetRow >= rows.length) {
          this.addNewRow(false);
        }
        const targetCell = document.querySelector(`.excel-cell[data-row="${targetRow}"][data-col="${targetColKey}"]`);
        if (targetCell) {
          this.selectCell(targetRow, targetColKey, targetCell, false);
        }
        return;
      }

      // 3) 일반 키 입력 처리
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") {
        e.preventDefault();
        commitAndBlur();
        // Move to next row in same column
        this.navigateCell(rowIdx + 1, colKey);
      } else if (e.key === "Tab") {
        e.preventDefault();
        commitAndBlur();
        if (e.shiftKey) {
          this.navigateCol(rowIdx, colKey, -1);
        } else {
          this.navigateCol(rowIdx, colKey, 1);
        }
      }
    });
  }

  ensureDatalists() {
    // Chrome IME 한글 자모 분리 버그 방지를 위해 datalist 요소 완전 제거
    ["partPresets", "prescPresets", "extraPresets"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  // Update active highlighted headers matching currently focused cell
  updateActiveHeaders(rowIdx, colKey) {
    document.querySelectorAll(".col-letter, .b-header, .row-num").forEach((el) => {
      el.classList.remove("header-active");
    });

    const activeColLetter = document.querySelector(`.col-letter[data-col="${colKey}"]`);
    const activeBHeader = document.querySelector(`.b-header[data-col="${colKey}"]`);
    if (activeColLetter) activeColLetter.classList.add("header-active");
    if (activeBHeader) activeBHeader.classList.add("header-active");

    const rowTr = document.querySelector(`tr[data-row-idx="${rowIdx}"]`);
    if (rowTr) {
      const activeRowNum = rowTr.querySelector(".row-num");
      if (activeRowNum) activeRowNum.classList.add("header-active");
    }
  }

  clearHeaderSelections() {
    this.elSheetContainer.classList.remove("has-cell-range");
    this.clearCrossDateSelection();
    this.cancelFillDrag();
    document.querySelectorAll(".cell-fill-handle").forEach((handle) => handle.remove());
    document.querySelectorAll(".col-letter, .b-header, .row-num, .corner-header").forEach((el) => {
      el.classList.remove("selected");
    });
    document.querySelectorAll(".excel-cell").forEach((el) => {
      el.classList.remove(
        "col-selected",
        "row-selected",
        "all-selected",
        "range-selected",
        "range-border-top",
        "range-border-bottom",
        "range-border-left",
        "range-border-right"
      );
    });
    this.selectedRange = null;
    this.selectedColumnRange = null;
    this.columnAnchor = null;
    this.selectedRowRange = null;
    this.rowRangeStart = null;
    this.rowRangeEnd = null;
  }

  extendCellSelection(rowIdx, colIdx) {
    if (!this.activeCell) return;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    if (this.isEditingCell()) document.activeElement.blur();
    if (!this.selectedRange || this.selectedRowRange || !this.rangeStart) {
      this.rangeStart = { ...this.activeCell, colIdx: keys.indexOf(this.activeCell.colKey) };
    }
    this.rangeEnd = {
      rowIdx: Math.max(0, Math.min(this.getCurrentRows().length - 1, rowIdx)),
      colIdx: Math.max(0, Math.min(keys.length - 1, colIdx))
    };
    this.rangeEnd.colKey = keys[this.rangeEnd.colIdx];
    this.updateRangeSelection();
    const anchor = this.elTableBody.querySelector(`[data-row="${this.activeCell.rowIdx}"][data-col="${this.activeCell.colKey}"]`);
    if (anchor && this.activeCell.colKey !== "gender") this.startInlineEdit(this.activeCell.rowIdx, this.activeCell.colKey, anchor, true);
    else this.elSheetContainer.focus({ preventScroll: true });
  }

  updateRangeSelection() {
    if (!this.rangeStart || !this.rangeEnd) return;

    const minRow = Math.min(this.rangeStart.rowIdx, this.rangeEnd.rowIdx);
    const maxRow = Math.max(this.rangeStart.rowIdx, this.rangeEnd.rowIdx);
    const minCol = Math.min(this.rangeStart.colIdx, this.rangeEnd.colIdx);
    const maxCol = Math.max(this.rangeStart.colIdx, this.rangeEnd.colIdx);

    this.selectedRange = { minRow, maxRow, minCol, maxCol };
    this.elSheetContainer.classList.toggle("has-cell-range", minRow !== maxRow || minCol !== maxCol);

    // Clear previous range highlight classes
    document.querySelectorAll(".excel-cell").forEach((c) => {
      c.classList.remove(
        "range-selected",
        "range-border-top",
        "range-border-bottom",
        "range-border-left",
        "range-border-right"
      );
    });

    const colLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    let cellCount = 0;
    let numericSum = 0;
    let numericCount = 0;

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = document.querySelector(`.excel-cell[data-row="${r}"][data-col-idx="${c}"]`);
        if (cell) {
          cellCount++;
          cell.classList.add("range-selected");

          if (r === minRow) cell.classList.add("range-border-top");
          if (r === maxRow) cell.classList.add("range-border-bottom");
          if (c === minCol) cell.classList.add("range-border-left");
          if (c === maxCol) cell.classList.add("range-border-right");

          const textVal = cell.textContent.trim();
          const num = parseFloat(textVal);
          if (!isNaN(num) && isFinite(num) && String(num) === textVal) {
            numericSum += num;
            numericCount++;
          }
        }
      }
    }

    const startLetter = colLetters[this.rangeStart.colIdx] || "A";
    const startRowNum = BASE_ROW_NUMBER + this.rangeStart.rowIdx;

    if (minRow === maxRow && minCol === maxCol) {
      // Single cell selected
      this.elCellAddress.textContent = `${startLetter}${startRowNum}`;
      this.elSelectedCellCoords.textContent = `${startLetter}${startRowNum}`;
    } else {
      // Multi-cell range selected (e.g. C3:E8)
      const rangeText = `${colLetters[minCol]}${BASE_ROW_NUMBER + minRow}:${colLetters[maxCol]}${BASE_ROW_NUMBER + maxRow}`;
      this.elCellAddress.textContent = rangeText;

      let statText = `선택: ${rangeText} (${cellCount}개 셀)`;
      if (numericCount > 0) {
        const avg = (numericSum / numericCount).toFixed(1);
        statText += ` | 개수: ${numericCount} | 합계: ${numericSum} | 평균: ${avg}`;
      }
      this.elSelectedCellCoords.textContent = statText;
    }
  }

  selectEntireColumn(colKey, colLetter, endKey = colKey) {
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const first = keys.indexOf(colKey), last = keys.indexOf(endKey);
    if (first < 0 || last < 0) return;
    document.activeElement?.blur();
    window.getSelection()?.removeAllRanges();
    this.clearHeaderSelections();
    this.activeCell = null;
    this.selectedColKey = colKey;
    this.selectedRowIdx = null;
    this.columnAnchor = colKey;
    this.selectedColumnRange = { minCol: Math.min(first, last), maxCol: Math.max(first, last) };
    this.selectedRange = { ...this.selectedColumnRange, minRow: 0, maxRow: this.getCurrentRows().length - 1 };
    document.querySelectorAll(".cell-focused, .active-row, .header-active").forEach(el => el.classList.remove("cell-focused", "active-row", "header-active"));
    for (let col = this.selectedColumnRange.minCol; col <= this.selectedColumnRange.maxCol; col++) {
      document.querySelectorAll(`.col-letter[data-col="${keys[col]}"], .b-header[data-col="${keys[col]}"]`).forEach(el => el.classList.add("selected"));
      this.elTableBody.querySelectorAll(`.excel-cell[data-col="${keys[col]}"]`).forEach(cell => {
        cell.classList.add("col-selected");
        if (col === this.selectedColumnRange.minCol) cell.classList.add("range-border-left");
        if (col === this.selectedColumnRange.maxCol) cell.classList.add("range-border-right");
        if (Number(cell.dataset.row) === 0) cell.classList.add("range-border-top");
        if (Number(cell.dataset.row) === this.selectedRange.maxRow) cell.classList.add("range-border-bottom");
      });
    }
    const label = `${String.fromCharCode(65 + this.selectedColumnRange.minCol)}:${String.fromCharCode(65 + this.selectedColumnRange.maxCol)}`;
    this.elCellAddress.textContent = label;
    this.elSelectedCellCoords.textContent = `${label}열 선택`;
    this.elFormulaInput.value = "";
    this.elSheetContainer.focus({ preventScroll: true });
  }

  selectEntireRow(rowIdx) {
    this.selectRowRange(rowIdx, rowIdx);
  }

  selectRowRange(startRowIdx, endRowIdx) {
    // Clear native browser text highlighting before painting the spreadsheet selection.
    window.getSelection()?.removeAllRanges();
    // Finish the current edit before replacing cell selection with row selection.
    const focusedElement = document.activeElement;
    if (focusedElement === this.elFormulaInput ||
        focusedElement?.matches(".cell-input-element, .cell-gender-select")) {
      focusedElement.blur();
    }
    this.activeCell = null;
    this.isSelectingRange = false;
    this.rangeStart = null;
    this.rangeEnd = null;
    document.querySelectorAll(".cell-focused, .active-row, .header-active").forEach((el) => {
      el.classList.remove("cell-focused", "active-row", "header-active");
    });
    this.clearHeaderSelections();

    const minRow = Math.min(startRowIdx, endRowIdx);
    const maxRow = Math.max(startRowIdx, endRowIdx);

    this.rowRangeStart = startRowIdx;
    this.rowRangeEnd = endRowIdx;
    this.selectedRowRange = { minRow, maxRow };
    this.selectedRowIdx = minRow;
    this.selectedColKey = null;

    // Apply entire row range (columns 0 to 9) so copy/cut/clear automatically covers all columns
    this.selectedRange = { minRow, maxRow, minCol: 0, maxCol: 9 };

    for (let r = minRow; r <= maxRow; r++) {
      const rowTr = document.querySelector(`tr[data-row-idx="${r}"]`);
      if (rowTr) {
        const rowNumTh = rowTr.querySelector(".row-num");
        if (rowNumTh) rowNumTh.classList.add("selected");
        const cells = rowTr.querySelectorAll(".excel-cell");
        cells.forEach((cell, colIdx) => {
          cell.classList.add("row-selected");
          if (r === minRow) cell.classList.add("range-border-top");
          if (r === maxRow) cell.classList.add("range-border-bottom");
          if (colIdx === 0) cell.classList.add("range-border-left");
          if (colIdx === cells.length - 1) cell.classList.add("range-border-right");
        });
      }
    }

    const startNum = BASE_ROW_NUMBER + minRow;
    const endNum = BASE_ROW_NUMBER + maxRow;

    if (minRow === maxRow) {
      this.elCellAddress.textContent = `${startNum}:${startNum}`;
      this.elSelectedCellCoords.textContent = `${startNum}행 전체 선택`;
    } else {
      const rowCount = maxRow - minRow + 1;
      this.elCellAddress.textContent = `${startNum}:${endNum}`;
      this.elSelectedCellCoords.textContent = `${startNum}~${endNum}행 선택 (${rowCount}개 행)`;
    }
    this.elFormulaInput.value = "";
    this.elSheetContainer.focus({ preventScroll: true });
  }

  selectAllCells() {
    this.clearHeaderSelections();
    const cornerHeader = document.getElementById("cornerHeader");
    if (cornerHeader) cornerHeader.classList.add("selected");

    document.querySelectorAll(".excel-cell").forEach((cell) => {
      cell.classList.add("all-selected");
    });

    this.elCellAddress.textContent = "1:전체";
    this.elSelectedCellCoords.textContent = "전체 시트 선택";
    this.elFormulaInput.value = "";
  }

  sortByColumn(colKey) {
    const rows = this.getCurrentRows();
    if (this.sortState.colKey === colKey) {
      this.sortState.direction = this.sortState.direction === "asc" ? "desc" : "asc";
    } else {
      this.sortState.colKey = colKey;
      this.sortState.direction = "asc";
    }

    const dir = this.sortState.direction;

    // Update sort indicators in header
    document.querySelectorAll(".b-header .sort-indicator").forEach((ind) => {
      ind.textContent = "";
    });
    const currentTh = document.querySelector(`.b-header[data-col="${colKey}"] .sort-indicator`);
    if (currentTh) {
      currentTh.textContent = dir === "asc" ? " ▲" : " ▼";
    }

    // Separate rows with data and blank rows so blank rows always stay at bottom
    const dataRows = rows.filter((r) => r.name || r.chartNo || r.part || r.no);
    const emptyRows = rows.filter((r) => !r.name && !r.chartNo && !r.part && !r.no);

    dataRows.sort((a, b) => {
      let valA = (a[colKey] || "").toString().trim();
      let valB = (b[colKey] || "").toString().trim();

      // Check if numeric
      const numA = parseFloat(valA);
      const numB = parseFloat(valB);
      if (!isNaN(numA) && !isNaN(numB) && String(numA) === valA && String(numB) === valB) {
        return dir === "asc" ? numA - numB : numB - numA;
      }

      return dir === "asc" ? valA.localeCompare(valB, "ko") : valB.localeCompare(valA, "ko");
    });

    this.dataStore[this.currentDate] = [...dataRows, ...emptyRows];
    this.saveDataStore();
    this.renderTable();
  }

  initColumnResizing() {
    let activeTh = null;
    let activeColKey = null;
    let startX = 0;
    let startWidth = 0;

    // 기기별로 저장된 열 너비 초기 로딩 시 복원 적용
    this.applySavedColumnWidths();

    const startResize = (resizerEl, clientX) => {
      activeTh = resizerEl.closest("th");
      activeColKey = activeTh?.dataset?.col || null;
      startX = clientX;
      startWidth = activeTh.offsetWidth;
      resizerEl.classList.add("resizing");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };

    const doResize = (clientX) => {
      if (!activeTh) return;
      const diff = clientX - startX;
      const newWidth = Math.max(35, startWidth + diff);
      activeTh.style.width = `${newWidth}px`;
      activeTh.style.minWidth = `${newWidth}px`;
    };

    const endResize = () => {
      if (activeTh) {
        const resizer = activeTh.querySelector(".col-resizer");
        if (resizer) resizer.classList.remove("resizing");

        // 기기별 localStorage에 열 너비 영구 저장
        if (activeColKey) {
          const finalWidth = parseInt(activeTh.style.width, 10) || activeTh.offsetWidth;
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
      if (e.target.classList.contains("col-resizer") && e.touches.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        startResize(e.target, e.touches[0].pageX);
      }
    }, { passive: false });

    document.addEventListener("touchmove", (e) => {
      if (activeTh && e.touches.length === 1) {
        e.preventDefault();
        doResize(e.touches[0].pageX);
      }
    }, { passive: false });

    document.addEventListener("touchend", () => {
      endResize();
    });

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
    try {
      const saved = this.getSavedColumnWidths();
      saved[colKey] = width;
      localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(saved));
    } catch (err) {
      console.error("Failed to save column width:", err);
    }
  }

  getSavedColumnWidths() {
    try {
      const data = localStorage.getItem(COL_WIDTHS_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (_) {
      return {};
    }
  }

  applySavedColumnWidths() {
    const saved = this.getSavedColumnWidths();
    if (!saved || typeof saved !== "object") return;

    Object.entries(saved).forEach(([colKey, width]) => {
      if (!width || typeof width !== "number") return;
      const th = document.querySelector(`th.col-letter[data-col="${colKey}"]`);
      if (th) {
        th.style.width = `${width}px`;
        th.style.minWidth = `${width}px`;
      }
    });
  }

  resetColumnWidth(colKey) {
    try {
      const saved = this.getSavedColumnWidths();
      delete saved[colKey];
      localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(saved));
      const th = document.querySelector(`th.col-letter[data-col="${colKey}"]`);
      if (th) {
        th.style.width = "";
        th.style.minWidth = "";
      }
      this.showSaveIndicator("기본 열 너비로 초기화됨");
    } catch (err) {
      console.error("Failed to reset column width:", err);
    }
  }

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

  addNewRow(andFocus = true) {
    const rows = this.getCurrentRows();
    const formattedDate = this.currentDate.replace(/-/g, ".");
    const newRow = {
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
    };
    rows.push(newRow);
    this.saveDataStore();
    this.renderTable();

    if (andFocus) {
      const newIdx = rows.length - 1;
      const targetCell = document.querySelector(`.excel-cell[data-row="${newIdx}"][data-col="chartNo"]`);
      if (targetCell) {
        targetCell.scrollIntoView({ behavior: "smooth", block: "center" });
        this.selectCell(newIdx, "chartNo", targetCell);
      }
    }
  }

  deleteRow(rowIdx) {
    const rows = this.getCurrentRows();
    if (rows.length <= 1) {
      // Just clear
      rows[0] = {
        no: "", gender: "", chartNo: "", name: "", part: "",
        prescription: "", extra: "", writer: DEFAULT_WRITER,
        memo: "", specialNote: "", date: this.currentDate.replace(/-/g, ".")
      };
    } else {
      rows.splice(rowIdx, 1);
    }
    this.saveDataStore();
    this.renderTable();
  }

  deleteSelectedRow() {
    if (this.selectedRowIdx === null) {
      alert("삭제할 행이나 셀을 먼저 선택해주세요.");
      return;
    }
    this.deleteRow(this.selectedRowIdx);
    this.selectedRowIdx = null;
    this.activeCell = null;
  }

  removeEmptyRows() {
    const rows = this.getCurrentRows();
    const filtered = rows.filter((r) => r.name || r.chartNo || r.part || r.prescription || r.extra);
    const formattedDate = this.currentDate.replace(/-/g, ".");
    while (filtered.length < DEFAULT_ROW_COUNT) {
      filtered.push({
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
    this.dataStore[this.currentDate] = filtered;
    this.saveDataStore();
    this.renderTable();
    alert("데이터가 정리되었으며 기본 150행이 유지됩니다.");
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

  getDailySummary(rows = this.getCurrentRows()) {
    const text = value => String(value ?? "").trim();
    const records = rows.filter(row => row && ["name", "chartNo", "part", "prescription", "extra"]
      .some(key => text(row[key])));
    const summary = { total: records.length, male: 0, female: 0, unknown: 0,
      extras: new Map(),
      prescriptions: new Map() };
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
      for (const extra of extras) summary.extras.set(extra, (summary.extras.get(extra) || 0) + 1);
      const prescription = text(row.prescription).replace(/\s+/g, " ") || "미입력";
      summary.prescriptions.set(prescription, (summary.prescriptions.get(prescription) || 0) + 1);
    }
    return summary;
  }

  renderSummaryList(container, entries, emptyMessage) {
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
      number.textContent = count;
      const unit = document.createElement("span");
      unit.textContent = "건";
      value.append(number, unit);
      row.append(name, value);
      container.appendChild(row);
    }
  }

  updateSidebarStats() {
    const summary = this.getDailySummary();
    this.elStatTotalCount.textContent = summary.total;
    this.elStatMaleCount.textContent = summary.male;
    this.elStatFemaleCount.textContent = summary.female;
    this.elStatUnknownCount.textContent = summary.unknown;
    this.renderSummaryList(this.elStatExtraList, summary.extras, "추가 사항 없음");
    this.renderSummaryList(this.elStatPrescriptionList, summary.prescriptions, "입력된 처방 없음");
  }

  copyHistoryFields(destination, source, keys) {
    for (const key of keys) {
      destination[key] = source[key] ?? "";
      for (const metadata of ["_textColors", "_textStyles", "_richText"]) {
        if (source[metadata]?.[key] !== undefined) {
          destination[metadata] ||= {};
          destination[metadata][key] = JSON.parse(JSON.stringify(source[metadata][key]));
        } else if (destination[metadata]) delete destination[metadata][key];
      }
    }
  }

  applyHistoryRow(source) {
    const target = this.historyApplyTarget;
    if (!target || target.date !== this.currentDate) return;
    // Finish a live editor before assigning; a later blur cannot restore old text.
    if (document.activeElement?.matches(".cell-input-element") || document.activeElement === this.elFormulaInput) document.activeElement.blur();
    const rows = this.getCurrentRows();
    const referenceIndex = rows.indexOf(target.row);
    if (referenceIndex < 0 && target.rows === rows) return;
    const rowIdx = referenceIndex >= 0 ? referenceIndex : target.rowIdx;
    if (!Number.isInteger(rowIdx) || !rows[rowIdx]) return;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const selection = this.crossDateSelection;
    const sourceIndex = this.crossDateResults?.indexOf(source);
    const useSelection = selection && sourceIndex >= selection.minRow && sourceIndex <= selection.maxRow;
    const sources = useSelection ? this.crossDateResults.slice(selection.minRow, selection.maxRow + 1) : [source];
    const selectedKeys = useSelection ? keys.slice(selection.minCol, selection.maxCol + 1) : keys;
    for (let offset = 0; offset < sources.length; offset++) {
      while (!rows[rowIdx + offset]) rows.push(this.createDefaultEmptyRows(1)[0]);
      this.copyHistoryFields(rows[rowIdx + offset], sources[offset], selectedKeys);
    }
    this.activeCell = null;
    this.clipboardSelection = null;
    this.clearHeaderSelections();
    this.elSearchInput.value = "";
    this.elBtnClearSearch.style.display = "none";
    this.renderTable();
    const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${target.colKey}"]`);
    this.selectCell(rowIdx, target.colKey, cell);
    this.saveDataStore();
    this.showSaveIndicator(`${source._sourceDate} 기록을 ${BASE_ROW_NUMBER + rowIdx}행에 적용했습니다`);
  }

  clearRowDropMarker() {
    this.elTableBody.querySelectorAll(".row-drop-before, .row-drop-after").forEach(row => row.classList.remove("row-drop-before", "row-drop-after"));
    this.rowDropIndex = null;
  }

  finishRowMove() {
    const move = this.rowMove, destination = this.rowDropIndex;
    this.rowMove = null;
    this.clearRowDropMarker();
    if (!move || move.date !== this.currentDate || destination === null) return;
    const { minRow, maxRow } = move;
    if (destination >= minRow && destination <= maxRow + 1) return;
    const rows = this.getCurrentRows();
    const count = maxRow - minRow + 1;
    const target = destination > maxRow ? destination - count : destination;
    const moving = rows.splice(minRow, count);
    rows.splice(target, 0, ...moving);
    this.clipboardSelection = null;
    this.sortState = { colKey: null, direction: "asc" };
    this.saveDataStore();
    this.renderTable();
    this.selectRowRange(target, target + count - 1);
    this.showSaveIndicator(`${count}개 행 이동 완료`);
  }

  clearCrossDateSelection() {
    this.crossDateSelection = null;
    this.isSelectingCrossDate = false;
    if (this.elFormulaInput) this.elFormulaInput.readOnly = false;
    this.elTableBody?.querySelectorAll(".cross-date-cell").forEach(cell => {
      cell.classList.remove("range-selected", "range-border-top", "range-border-bottom", "range-border-left", "range-border-right");
    });
  }

  selectCrossDateCell(row, col, extend = false) {
    const previous = this.crossDateSelection;
    document.activeElement?.blur();
    this.clearHeaderSelections();
    this.activeCell = null;
    this.selectedRowIdx = null;
    this.selectedColKey = null;
    document.querySelectorAll(".cell-focused, .active-row, .header-active").forEach(el => el.classList.remove("cell-focused", "active-row", "header-active"));
    const startRow = extend && previous ? previous.startRow : row;
    const startCol = extend && previous ? previous.startCol : col;
    const selection = this.crossDateSelection = {
      startRow, startCol, endRow: row, endCol: col,
      minRow: Math.min(startRow, row), maxRow: Math.max(startRow, row),
      minCol: Math.min(startCol, col), maxCol: Math.max(startCol, col)
    };
    this.elTableBody.querySelectorAll(".cross-date-cell").forEach(cell => {
      const r = Number(cell.dataset.crossIdx), c = Number(cell.dataset.crossColIdx);
      if (r < selection.minRow || r > selection.maxRow || c < selection.minCol || c > selection.maxCol) return;
      cell.classList.add("range-selected");
      if (r === selection.minRow) cell.classList.add("range-border-top");
      if (r === selection.maxRow) cell.classList.add("range-border-bottom");
      if (c === selection.minCol) cell.classList.add("range-border-left");
      if (c === selection.maxCol) cell.classList.add("range-border-right");
    });
    const source = this.crossDateResults[row];
    const cell = this.elTableBody.querySelector(`[data-cross-idx="${row}"][data-cross-col-idx="${col}"]`);
    const address = `${String.fromCharCode(65 + col)}${BASE_ROW_NUMBER + source._sourceRowIdx}`;
    this.elCellAddress.textContent = address;
    this.elSelectedCellCoords.textContent = `${source._sourceDate} · ${address} 선택`;
    this.elFormulaInput.value = source[cell.dataset.crossCol] ?? "";
    this.elFormulaInput.readOnly = true;
    this.elSheetContainer.focus({ preventScroll: true });
    // Extending selection clears temporary state above; keep mouse dragging active.
    this.isSelectingCrossDate = extend;
  }

  handleSearch() {
    const q = this.elSearchInput.value.trim().toLowerCase();
    this.elBtnClearSearch.style.display = q ? "block" : "none";

    if (q) { this.searchAllDates(this.elSearchInput.value.trim()); return; }
    // 교차 날짜 임시 행 제거
    this.clearCrossDateRows();

    const rows = document.querySelectorAll(".excel-row");
    rows.forEach((rowEl) => {
      if (!q) {
        rowEl.style.display = "";
        rowEl.classList.remove("search-origin-row");
        return;
      }
      const text = rowEl.textContent.toLowerCase();
      rowEl.style.display = text.includes(q) ? "" : "none";
    });
  }

  // 교차 날짜 임시 행 제거
  clearCrossDateRows() {
    this.clearCrossDateSelection();
    this.crossDateResults = [];
    if (this.clipboardSelection?.kind === "history") this.clipboardSelection = null;
    document.querySelectorAll(".cross-date-row, .cross-date-divider").forEach(el => el.remove());
  }

  // ★ 전체 날짜 검색: Ctrl+F 시 현재 날짜 + 이전 날짜의 매칭 기록을 모두 표시
  searchAllDates(query, originRowIdx) {
    if (Number.isInteger(originRowIdx) && originRowIdx >= 0) {
      this.historyApplyTarget = {
        date: this.currentDate, rowIdx: originRowIdx,
        rows: this.getCurrentRows(), row: this.getCurrentRows()[originRowIdx], colKey: this.activeCell?.colKey || "chartNo"
      };
    }
    void this.loadSearchHistory();
    if (!query) {
      this.handleSearch();
      return;
    }

    const q = query.toLowerCase();
    this.elSearchInput.value = query;
    this.elBtnClearSearch.style.display = "block";

    // 1) 교차 날짜 임시 행 제거
    this.clearCrossDateRows();

    // 2) 현재 날짜 행 필터링 (기존 검색과 동일)
    const currentRows = document.querySelectorAll(".excel-row");
    currentRows.forEach((rowEl) => {
      const text = rowEl.textContent.toLowerCase();
      rowEl.style.display = text.includes(q) ? "" : "none";
    });

    // 3) 이전 날짜에서 매칭 기록 수집
    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const crossDateResults = [];

    const searchStore = this.getSearchDataStore();
    const allDates = Object.keys(searchStore).sort().reverse(); // 최신순
    allDates.forEach((dateKey) => {
      if (dateKey === this.currentDate) return; // 현재 날짜 제외
      const dateRows = searchStore[dateKey] || [];
      dateRows.forEach((row, sourceRowIdx) => {
        // 유의미한 데이터가 있는 행만
        if (!row.name && !row.chartNo && !row.part && !row.prescription) return;
        // 검색어 매칭
        const rowText = colKeys.map(k => (row[k] || "")).join(" ").toLowerCase();
        if (rowText.includes(q)) {
          crossDateResults.push({ ...row, _sourceDate: dateKey, _sourceRowIdx: sourceRowIdx });
        }
      });
    });

    this.crossDateResults = crossDateResults;
    if (crossDateResults.length === 0) return;

    // 현재 테이블의 첫 번째 행 (삽입 기준점)
    const firstCurrentRow = this.elTableBody.firstChild;

    // 4) 이전 날짜 결과 행을 테이블 상단에 삽입 (최신순, 날짜별 그룹)
    let lastDate = null;
    crossDateResults.forEach((row, idx) => {
      // 날짜 구분 헤더
      if (row._sourceDate !== lastDate) {
        lastDate = row._sourceDate;
        const dateLabelTr = document.createElement("tr");
        dateLabelTr.className = "cross-date-divider cross-date-label";
        const dateLabelTd = document.createElement("td");
        dateLabelTd.colSpan = 12;
        const formattedDate = row._sourceDate.replace(/-/g, ".");
        const dateObj = new Date(row._sourceDate);
        const daysKor = ["일", "월", "화", "수", "목", "금", "토"];
        const dayLabel = daysKor[dateObj.getDay()] || "";
        dateLabelTd.textContent = `${formattedDate} (${dayLabel})`;
        dateLabelTr.appendChild(dateLabelTd);
        this.elTableBody.insertBefore(dateLabelTr, firstCurrentRow);
      }

      const tr = document.createElement("tr");
      tr.className = "excel-row cross-date-row";
      tr.dataset.crossDate = row._sourceDate;

      // 행 번호 (날짜 약어로 표시)
      const thNum = document.createElement("th");
      thNum.className = "row-num cross-date-num";
      thNum.textContent = row._sourceDate.slice(5).replace("-", "/");
      thNum.title = `${row._sourceDate} 기록`;
      thNum.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        this.selectCrossDateCell(idx, 0);
        this.selectCrossDateCell(idx, 9, true);
      });
      tr.appendChild(thNum);

      // 셀 렌더링
      colKeys.forEach((key, colIdx) => {
        const td = document.createElement("td");
        td.className = `excel-cell cell-${key} cross-date-cell`;
        td.dataset.crossIdx = idx;
        td.dataset.crossCol = key;
        td.dataset.crossColIdx = colIdx;
        if (row._textColors?.[key]) td.style.color = row._textColors[key];
        if (row._textStyles?.[key]?.fontSize) td.style.fontSize = row._textStyles[key].fontSize + "px";
        if (row._textStyles?.[key]?.fontWeight) td.style.fontWeight = row._textStyles[key].fontWeight;
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
          this.selectCrossDateCell(idx, colIdx, e.shiftKey);
          this.isSelectingCrossDate = true;
        });
        td.addEventListener("mouseenter", () => {
          if (this.isSelectingCrossDate) this.selectCrossDateCell(idx, colIdx, true);
        });

        tr.appendChild(td);
      });

      const actionCell = document.createElement("td");
      const applyButton = document.createElement("button");
      applyButton.type = "button";
      applyButton.className = "history-apply-btn";
      applyButton.textContent = "적용";
      applyButton.title = "선택한 셀 적용 · Enter (선택이 없으면 이 행 전체 적용)";
      applyButton.disabled = !this.historyApplyTarget || this.historyApplyTarget.date !== this.currentDate;
      applyButton.addEventListener("mousedown", e => e.preventDefault());
      applyButton.addEventListener("click", () => this.applyHistoryRow(row));
      actionCell.appendChild(applyButton);
      tr.appendChild(actionCell);
      this.elTableBody.insertBefore(tr, firstCurrentRow);
    });

    // 5) 이전 기록과 현재 날짜 사이 구분선
    const dividerTr = document.createElement("tr");
    dividerTr.className = "cross-date-divider";
    const dividerTd = document.createElement("td");
    dividerTd.colSpan = 12;
    dividerTd.innerHTML = `<span>📋 이전 날짜 기록 ${crossDateResults.length}건 ↑ │ 현재 날짜 (${this.currentDate.replace(/-/g, ".")}) ↓</span>`;
    dividerTr.appendChild(dividerTd);
    this.elTableBody.insertBefore(dividerTr, firstCurrentRow);
  }

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

    let maleCount = 0;
    let femaleCount = 0;
    let shockwave = 0;
    let ion = 0;
    let winback = 0;

    this.elPrintTableBody.innerHTML = "";

    if (rows.length === 0) {
      const emptyTr = document.createElement("tr");
      emptyTr.innerHTML = `<td colspan="10" style="text-align:center; padding: 20px; color: #888;">해당 날짜에 등록된 물리치료 환자 데이터가 없습니다.</td>`;
      this.elPrintTableBody.appendChild(emptyTr);
    } else {
      rows.forEach((r, idx) => {
        const g = (r.gender || "").toUpperCase();
        if (g === "M") maleCount++;
        if (g === "F") femaleCount++;
        if ((r.extra || "").includes("충격파")) shockwave++;
        if ((r.extra || "").includes("이온")) ion++;
        if ((r.extra || "").includes("윈백")) winback++;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="text-align:center;">${r.no || idx + 1}</td>
          <td style="text-align:center; font-weight:bold;">${r.gender || ""}</td>
          <td style="text-align:right; font-family:monospace;">${r.chartNo || ""}</td>
          <td style="text-align:center; font-weight:bold;">${r.name || ""}</td>
          <td>${r.part || ""}</td>
          <td>${r.prescription || ""}</td>
          <td style="text-align:center; font-weight:bold;">${r.extra || ""}</td>
          <td style="text-align:center;">${r.writer || DEFAULT_WRITER}</td>
          <td style="text-align:center;">${r.memo || ""}</td>
          <td style="color:#000000;">${r.specialNote || ""}</td>
        `;
        this.elPrintTableBody.appendChild(tr);
      });
    }

    this.elPrintTotalCount.textContent = rows.length;
    this.elPrintMaleCount.textContent = maleCount;
    this.elPrintFemaleCount.textContent = femaleCount;
    this.elPrintShockwave.textContent = shockwave;
    this.elPrintIon.textContent = ion;
    this.elPrintWinback.textContent = winback;

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

    const headers = ["No.", "G", "차트No.", "성함", "부위", "처방", "추가 사항", "작성", "메모", "특이 사항"];
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
        r.specialNote || ""
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

  downloadFullBackup() {
    const dataStr = JSON.stringify(this.dataStore, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PT현황_전체백업_${this.getTodayString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  handleRestoreFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (typeof parsed === "object" && parsed !== null) {
          this.dataStore = parsed;
          this.editHistory.clear();
          this.getCurrentRows();
          this.saveDataStore();
          this.setDate(this.currentDate);
          alert("백업 파일이 성공적으로 복원되었습니다.");
          this.closeBackupModal();
        } else {
          alert("올바르지 않은 백업 파일 형식입니다.");
        }
      } catch (err) {
        alert("JSON 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsText(file);
  }

  clearCurrentDayData() {
    if (confirm(`정말로 ${this.currentDate} 날짜의 데이터를 모두 초기화하시겠습니까?`)) {
      this.dataStore[this.currentDate] = this.createDefaultEmptyRows(DEFAULT_ROW_COUNT);
      this.saveDataStore();
      this.renderTable();
      this.closeBackupModal();
    }
  }

  // --- Supabase Cloud Sync Methods ---
  initSupabase() {
    try {
      let url = DEFAULT_SUPABASE_URL;
      let key = DEFAULT_SUPABASE_KEY;

      const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.url && parsed.key) {
          url = parsed.url;
          key = parsed.key;
        }
      }

      if (url && key && window.supabase) {
        this.supabaseClient = window.supabase.createClient(url, key);
        this.updateSupabaseUI(true);
        this.startLiveSync();
        // Pull latest cloud data for today
        this.pullFromCloud(this.currentDate, false);
        void this.loadSearchHistory();
        return;
      }
    } catch (e) {
      console.error("Supabase init error:", e);
    }
    this.updateSupabaseUI(false);
  }

  updateSupabaseUI(connected) {
    if (this.elSupabaseStatusLabel) {
      this.elSupabaseStatusLabel.textContent = connected ? "☁️ 클라우드 연결됨" : "슈파베이스 연동";
    }
    if (this.elBtnSupabase) {
      this.elBtnSupabase.classList.toggle("connected", connected);
    }
    if (this.elSupabaseModalStatus) {
      this.elSupabaseModalStatus.textContent = connected ? "연결됨 (실시간 동기화 중)" : "미연결";
      this.elSupabaseModalStatus.style.background = connected ? "#e2efda" : "#f1f3f5";
      this.elSupabaseModalStatus.style.color = connected ? "#274e13" : "#666";
    }
    if (this.elBtnDisconnectSupabase) {
      this.elBtnDisconnectSupabase.style.display = connected ? "inline-block" : "none";
    }
    if (this.elSupabaseManualSyncBox) {
      this.elSupabaseManualSyncBox.style.display = connected ? "block" : "none";
    }
  }

  openSupabaseModal() {
    try {
      const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
      if (saved) {
        const { url, key } = JSON.parse(saved);
        if (this.elSbUrlInput) this.elSbUrlInput.value = url || "";
        if (this.elSbKeyInput) this.elSbKeyInput.value = key || "";
      }
    } catch (e) {}
    if (this.elSupabaseModal) this.elSupabaseModal.style.display = "flex";
  }

  closeSupabaseModal() {
    if (this.elSupabaseModal) this.elSupabaseModal.style.display = "none";
  }

  async saveSupabaseConfig() {
    const url = (this.elSbUrlInput.value || "").trim();
    const key = (this.elSbKeyInput.value || "").trim();

    if (!url || !key) {
      alert("Supabase Project URL과 Anon Key를 모두 입력해주세요.");
      return;
    }

    if (!window.supabase) {
      alert("Supabase SDK를 로드할 수 없습니다. 인터넷 연결을 확인해주세요.");
      return;
    }

    try {
      const testClient = window.supabase.createClient(url, key);
      // Test query to check table
      const { error } = await testClient.from("pt_daily_records").select("date").limit(1);
      if (error && (error.code === "PGRST204" || (error.message && error.message.includes("relation") && error.message.includes("does not exist")))) {
        alert("Supabase 연결은 확인되었으나, 'pt_daily_records' 테이블이 없습니다.\n하단의 SQL 스크립트를 Supabase SQL Editor에서 실행해주세요!");
      }

      localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, key }));
      this.supabaseClient = testClient;
      this.startLiveSync();
      void this.loadSearchHistory();
      this.updateSupabaseUI(true);
      alert("Supabase 클라우드 동기화가 성공적으로 활성화되었습니다!\n지금부터 모든 기록이 자동 동기화됩니다.");
      this.closeSupabaseModal();

      // Read the shared day first; only explicitly changed dates are uploaded.
      void this.pullFromCloud(this.currentDate);
    } catch (err) {
      console.error("Supabase connect error:", err);
      alert("연결 중 오류가 발생했습니다: " + (err.message || err));
    }
  }

  disconnectSupabase() {
    if (confirm("Supabase 클라우드 연결을 해제하시겠습니까? (로컬 데이터는 안전하게 유지됩니다)")) {
      localStorage.removeItem(SUPABASE_CONFIG_KEY);
      this.stopLiveSync();
      this.supabaseClient = null;
      this.cloudSearchHistory = {};
      this.searchHistoryClient = null;
      this.updateSupabaseUI(false);
      if (this.elSbUrlInput) this.elSbUrlInput.value = "";
      if (this.elSbKeyInput) this.elSbKeyInput.value = "";
      this.closeSupabaseModal();
      alert("연결이 해제되었습니다.");
    }
  }

  stopLiveSync() {
    clearInterval(this.liveSyncTimer);
    clearTimeout(this.presetsSyncTimer);
    if (this.liveChannel && this.liveClient) void this.liveClient.removeChannel(this.liveChannel);
    this.liveChannel = null;
    this.syncTimers?.forEach(timer => clearTimeout(timer));
    this.syncTimers?.clear();
  }

  startLiveSync() {
    this.stopLiveSync();
    const client = this.supabaseClient;
    if (!client) return;
    this.liveClient = client;
    this.liveChannel = client.channel("pt-live-updates-v1")
      .on("broadcast", { event: "changed" }, ({ payload }) => {
        if (payload?.date === SHARED_PRESETS_RECORD) void this.pullSharedPresets();
        else if (payload?.date === this.currentDate) void this.pullFromCloud(this.currentDate);
        this.searchHistoryLoadedAt = 0;
      }).subscribe();
    const refresh = async () => {
      if (this.liveRefreshBusy || this.supabaseClient !== client) return;
      this.liveRefreshBusy = true;
      try {
        for (const date of this.pendingSyncDates) if (!this.activePushes.has(date)) void this.pushToCloud(date);
        if (this.presetsDirty) await this.pushSharedPresets();
        else await this.pullSharedPresets();
        await this.pullFromCloud(this.currentDate);
      } finally { this.liveRefreshBusy = false; }
    };
    this.liveSyncTimer = setInterval(refresh, 2000);
    void refresh();
  }

  notifyCloudChange(date) {
    if (this.liveChannel) void this.liveChannel.send({ type: "broadcast", event: "changed", payload: { date } });
  }

  schedulePresetSync() {
    this.presetsDirty = true;
    localStorage.setItem("PT_PRESETS_PENDING", "1");
    clearTimeout(this.presetsSyncTimer);
    this.presetsSyncTimer = setTimeout(() => this.pushSharedPresets(), 250);
  }

  async pullSharedPresets() {
    const client = this.supabaseClient;
    if (!client || this.presetsDirty || this.presetsPushing) return;
    try {
      const { data, error } = await client.from("pt_daily_records").select("rows_data").eq("date", SHARED_PRESETS_RECORD).maybeSingle();
      if (error) throw error;
      if (client !== this.supabaseClient || this.presetsDirty) return;
      const presets = data?.rows_data?.[0]?.presets;
      if (!data) {
        const result = await client.from("pt_daily_records").insert({ date: SHARED_PRESETS_RECORD,
          rows_data: [{ presets: COLUMN_PRESETS }], total_count: 0, updated_at: new Date().toISOString() });
        if (result.error && result.error.code !== "23505") throw result.error;
        return;
      }
      if (!presets || !Object.values(presets).every(values => Array.isArray(values) && values.every(value => typeof value === "string"))) return;
      if (JSON.stringify(presets) === JSON.stringify(COLUMN_PRESETS)) return;
      COLUMN_PRESETS = presets;
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
      this.renderQuickChips();
      this.refreshSearchSuggestions();
    } catch (error) { this.showSaveIndicator("빠른 입력 도구 동기화 재시도 중", true); }
  }

  async pushSharedPresets() {
    const client = this.supabaseClient;
    if (!client || !this.presetsDirty || this.presetsPushing) return;
    this.presetsPushing = true;
    const snapshot = JSON.stringify(COLUMN_PRESETS);
    try {
      const { error } = await client.from("pt_daily_records").upsert({ date: SHARED_PRESETS_RECORD,
        rows_data: [{ presets: JSON.parse(snapshot) }], total_count: 0, updated_at: new Date().toISOString() });
      if (error) throw error;
      if (JSON.stringify(COLUMN_PRESETS) === snapshot) {
        this.presetsDirty = false; localStorage.removeItem("PT_PRESETS_PENDING");
      }
      this.notifyCloudChange(SHARED_PRESETS_RECORD);
    } catch (error) { this.showSaveIndicator("빠른 입력 도구 동기화 재시도 중", true); }
    finally { this.presetsPushing = false; }
  }

  scheduleSupabaseSync() {
    const date = this.currentDate;
    this.pendingSyncDates.add(date);
    localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates]));
    localStorage.setItem("PT_SYNC_BASELINES", JSON.stringify(Object.fromEntries(this.syncBaselines)));
    if (!this.supabaseClient) return;
    clearTimeout(this.syncTimers.get(date));
    this.syncTimers.set(date, setTimeout(() => { this.syncTimers.delete(date); void this.pushToCloud(date); }, 400));
  }

  mergeCloudRows(base, local, remote) {
    if (!base) return local;
    const merged = JSON.parse(JSON.stringify(remote || []));
    for (let i = 0; i < local.length; i++) {
      const before = base[i] || {}, after = local[i] || {};
      merged[i] ||= {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
        if (key in after) merged[i][key] = after[key]; else delete merged[i][key];
      }
    }
    if (local.length < base.length) merged.length = local.length;
    return merged;
  }

  async pushToCloud(dateStr, showNotice = false) {
    const client = this.supabaseClient;
    if (!client || this.activePushes.has(dateStr)) return;
    const snapshot = JSON.stringify(this.dataStore[dateStr] || []);
    const local = JSON.parse(snapshot), base = this.syncBaselines.get(dateStr) || [];
    this.activePushes.set(dateStr, true);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error: readError } = await client.from("pt_daily_records").select("rows_data, updated_at").eq("date", dateStr).maybeSingle();
        if (readError) throw readError;
        const rows = this.mergeCloudRows(base, local, data?.rows_data || []);
        const record = { date: dateStr, rows_data: rows, total_count: this.getDailySummary(rows).total, updated_at: new Date(Math.max(Date.now(), (Date.parse(data?.updated_at) || 0) + 1)).toISOString() };
        const result = data
          ? await client.from("pt_daily_records").update(record).eq("date", dateStr).eq("updated_at", data.updated_at).select("date")
          : await client.from("pt_daily_records").insert(record).select("date");
        if (result.error?.code === "23505") continue;
        if (result.error) throw result.error;
        if (!result.data?.length) continue;
        if (client !== this.supabaseClient) return;
        const latest = this.dataStore[dateStr] || [];
        const latestText = JSON.stringify(latest);
        const rebased = this.mergeCloudRows(local, latest, rows);
        // Keep existing row objects alive for an editor that may still be typing.
        for (let i = 0; i < rebased.length; i++) {
          if (!latest[i]) latest[i] = rebased[i];
          else { for (const key of Object.keys(latest[i])) delete latest[i][key]; Object.assign(latest[i], rebased[i]); }
        }
        latest.length = rebased.length;
        this.dataStore[dateStr] = latest;
        this.syncBaselines.set(dateStr, JSON.parse(JSON.stringify(rows)));
        localStorage.setItem("PT_SYNC_BASELINES", JSON.stringify(Object.fromEntries(this.syncBaselines)));
        if (latestText === snapshot) this.pendingSyncDates.delete(dateStr);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.dataStore));
        if (dateStr === this.currentDate && JSON.stringify(latest) !== latestText && !this.isEditingCell()) {
          this.editHistory.delete(dateStr); this.getEditHistory(dateStr);
          this.renderTable(); this.updateSidebarStats();
        }
        localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates]));
        this.notifyCloudChange(dateStr);
        this.showSaveIndicator("클라우드 동기화 완료");
        return;
      }
      throw new Error("다른 기기의 변경으로 재시도가 필요합니다");
    } catch (error) {
      this.pendingSyncDates.add(dateStr);
      localStorage.setItem("PT_PENDING_DATES", JSON.stringify([...this.pendingSyncDates]));
      this.showSaveIndicator("클라우드 동기화 재시도 중", true);
      if (showNotice) alert("클라우드 업로드 실패: " + error.message);
    } finally { this.activePushes.delete(dateStr); }
  }

  async pullFromCloud(dateStr, showNotice = false) {
    if (this.pendingSyncDates?.has(dateStr) || this.activePushes?.has(dateStr) ||
        (dateStr === this.currentDate && this.isEditingCell())) return;
    const localAtRequest = JSON.stringify(this.dataStore[dateStr] || []);
    const client = this.supabaseClient;
    if (!client) {
      if (showNotice) alert("Supabase가 연결되어 있지 않습니다.");
      return;
    }

    try {
      const { data, error } = await this.supabaseClient
        .from("pt_daily_records")
        .select("rows_data, updated_at")
        .eq("date", dateStr)
        .maybeSingle();

      if (error) {
        console.warn("Cloud pull warning:", error);
        if (showNotice) alert("클라우드 데이터 가져오기 실패: " + error.message);
        return;
      }

      if (this.supabaseClient !== client || this.pendingSyncDates.has(dateStr) ||
          localAtRequest !== JSON.stringify(this.dataStore[dateStr] || []) ||
          (dateStr === this.currentDate && this.isEditingCell())) return;
      if (data && Array.isArray(data.rows_data)) {
        this.syncBaselines.set(dateStr, JSON.parse(JSON.stringify(data.rows_data)));
        localStorage.setItem("PT_SYNC_BASELINES", JSON.stringify(Object.fromEntries(this.syncBaselines)));
        const padded = data.rows_data.slice();
        while (dateStr === this.currentDate && padded.length < DEFAULT_ROW_COUNT) padded.push({ ...this.createDefaultEmptyRows(1)[0], date: dateStr.replace(/-/g, ".") });
        if (localAtRequest === JSON.stringify(padded)) return;
        const previousRows = JSON.stringify(this.dataStore[dateStr] || []);
        this.dataStore[dateStr] = data.rows_data;
        // Ensure minimum 150 rows
        this.getCurrentRows();
        if (previousRows !== JSON.stringify(this.dataStore[dateStr])) this.editHistory.delete(dateStr);
        this.getEditHistory(dateStr);
        this.updateHistoryButtons();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.dataStore));
        if (this.currentDate === dateStr) {
          this.renderTable();
          this.updateSidebarStats();
        }
        this.showSaveIndicator("클라우드 데이터 수신됨");
        if (showNotice) alert(`${dateStr} 클라우드 최신 데이터를 성공적으로 불러왔습니다!`);
      } else {
        this.syncBaselines.set(dateStr, []);
        if (showNotice) alert(`${dateStr} 일자의 클라우드 데이터가 아직 없습니다.`);
      }
    } catch (err) {
      console.error("Cloud pull exception:", err);
      if (showNotice) alert("클라우드 통신 오류: " + err.message);
    }
  }

  // =============================================================================
  // Right-Click Context Menu & Excel Actions (우클릭 컨텍스트 메뉴 및 엑셀 액션)
  // =============================================================================
  initContextMenu() {
    if (!this.elSheetContainer || !this.elContextMenu) return;

    // Open context menu on right click in sheet container
    this.elSheetContainer.addEventListener("contextmenu", (e) => {
      this.handleTableContextMenu(e);
    });

    // Context menu item click dispatcher
    this.elContextMenu.addEventListener("click", (e) => {
      const menuItem = e.target.closest(".menu-item");
      if (!menuItem) return;

      const action = menuItem.dataset.action;
      this.executeContextAction(action);
      this.hideContextMenu();
    });
  }

  handleTableContextMenu(e) {
    this.captureTextColorSelection();
    if (e.target.closest(".cross-date-row")) { e.preventDefault(); return; }
    const thRow = e.target.closest("th.row-num");
    const thCol = e.target.closest("th.col-letter, th.b-header");
    const thCorner = e.target.closest("#cornerHeader");
    const tdCell = e.target.closest(".excel-cell");

    const rowOnlyItems = this.elContextMenu.querySelectorAll(".row-only-item");
    const colOnlyItems = this.elContextMenu.querySelectorAll(".col-only-item");

    if (thRow) {
      // 1) Right Click on Row Number Header (행 헤더 우클릭)
      e.preventDefault();
      const tr = thRow.closest("tr");
      const rowIdx = parseInt(tr.dataset.rowIdx, 10);

      // Keep multi-selection if right-clicked inside the current selected row range
      const inRowRange = this.selectedRowRange &&
        rowIdx >= this.selectedRowRange.minRow &&
        rowIdx <= this.selectedRowRange.maxRow;

      if (!inRowRange) {
        this.selectRowRange(rowIdx, rowIdx);
      }

      this.contextTarget = { type: "row", rowIdx, rowRange: this.selectedRowRange };

      // Show Row items (위에 행 1개 삽입, 아래에 행 1개 삽입, 행 데이터 삭제, 행 삭제)
      rowOnlyItems.forEach((el) => el.classList.remove("hidden"));
      colOnlyItems.forEach((el) => el.classList.add("hidden"));
      this.showContextMenu(e.clientX, e.clientY);
    } else if (thCol) {
      // 2) Right Click on Column Header (열 헤더 우클릭)
      const colKey = thCol.dataset.col;
      const colLetter = thCol.dataset.colLetter || "";
      if (!colKey || colKey === "del") return;

      e.preventDefault();
      this.contextTarget = { type: "col", colKey, colLetter };
      const index = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"].indexOf(colKey);
      if (!this.selectedColumnRange || index < this.selectedColumnRange.minCol || index > this.selectedColumnRange.maxCol) this.selectEntireColumn(colKey, colLetter);

      // Show Column items
      rowOnlyItems.forEach((el) => el.classList.add("hidden"));
      colOnlyItems.forEach((el) => el.classList.remove("hidden"));
      this.showContextMenu(e.clientX, e.clientY);
    } else if (thCorner) {
      // 3) Right Click on Corner Header (시트 전체 선택)
      e.preventDefault();
      this.contextTarget = { type: "corner" };
      this.selectAllCells();

      rowOnlyItems.forEach((el) => el.classList.add("hidden"));
      colOnlyItems.forEach((el) => el.classList.add("hidden"));
      this.showContextMenu(e.clientX, e.clientY);
    } else if (tdCell) {
      // 4) Right Click on General Cell (일반 셀 우클릭)
      e.preventDefault();
      const rowIdx = parseInt(tdCell.dataset.row, 10);
      const colKey = tdCell.dataset.col;
      const colIdx = parseInt(tdCell.dataset.colIdx, 10);

      this.contextTarget = { type: "cell", rowIdx, colKey, colIdx };

      // Keep multi-selection if right-clicked inside the current selected range
      const inRange = this.selectedRange &&
        rowIdx >= this.selectedRange.minRow && rowIdx <= this.selectedRange.maxRow &&
        colIdx >= this.selectedRange.minCol && colIdx <= this.selectedRange.maxCol;

      if (!inRange) {
        this.selectCell(rowIdx, colKey, tdCell, false);
      }

      // Hide row/col exclusive items
      rowOnlyItems.forEach((el) => el.classList.add("hidden"));
      colOnlyItems.forEach((el) => el.classList.add("hidden"));
      this.showContextMenu(e.clientX, e.clientY);
    }
  }

  showContextMenu(clientX, clientY) {
    if (!this.elContextMenu) return;
    const menu = this.elContextMenu;
    menu.style.display = "block";
    menu.style.visibility = "hidden";

    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width || 210;
    const menuHeight = menuRect.height || 260;

    let posX = clientX;
    let posY = clientY;

    if (posX + menuWidth > window.innerWidth) {
      posX = window.innerWidth - menuWidth - 8;
    }
    if (posY + menuHeight > window.innerHeight) {
      posY = window.innerHeight - menuHeight - 8;
    }

    menu.style.left = `${Math.max(8, posX)}px`;
    menu.style.top = `${Math.max(8, posY)}px`;
    menu.style.visibility = "visible";
  }

  hideContextMenu() {
    if (this.elContextMenu) {
      this.elContextMenu.style.display = "none";
    }
  }

  executeContextAction(action) {
    const targetRow = this.contextTarget?.rowIdx ?? this.selectedRowIdx ?? (this.activeCell ? this.activeCell.rowIdx : 0);
    const targetCol = this.contextTarget?.colKey ?? this.selectedColKey;

    switch (action) {
      case "font-size":
      case "font-weight":
        this.openColumnTypographyMenu(action === "font-size" ? "fontSize" : "fontWeight");
        break;
      case "font-color":
        this.openFontColorMenu(document.getElementById("btnFontColor"));
        break;
      case "lunch-line":
        this.getCurrentRows()[targetRow]._lunchBefore = !this.getCurrentRows()[targetRow]._lunchBefore;
        this.saveDataStore();
        this.renderTable();
        this.selectRowRange(targetRow, targetRow);
        break;
      case "cut":
        this.cutSelection();
        break;
      case "copy":
        this.copySelection();
        break;
      case "paste":
        this.pasteSelection();
        break;
      case "clear-contents":
        this.clearSelection();
        break;
      case "insert-row-above":
        this.insertRowAbove(targetRow);
        break;
      case "insert-row-below":
        this.insertRowBelow(targetRow);
        break;
      case "clear-row-data":
        this.clearRowData(targetRow);
        break;
      case "delete-row":
        this.deleteRowAt(targetRow);
        break;
      case "clear-col-data":
        if (targetCol) this.clearColData(targetCol);
        break;
      case "sort-col-asc":
        if (targetCol) {
          this.sortState.colKey = targetCol;
          this.sortState.direction = "desc"; // sortByColumn will toggle to asc
          this.sortByColumn(targetCol);
        }
        break;
      case "sort-col-desc":
        if (targetCol) {
          this.sortState.colKey = targetCol;
          this.sortState.direction = "asc"; // sortByColumn will toggle to desc
          this.sortByColumn(targetCol);
        }
        break;
      default:
        console.warn("Unknown context action:", action);
    }
  }

  jumpToLastRecord() {
    const origin = this.historyApplyTarget;
    if (this.crossDateSelection && origin?.date === this.currentDate) {
      const rows = this.getCurrentRows();
      const found = rows.indexOf(origin.row);
      const rowIdx = found >= 0 ? found : origin.rowIdx;
      this.elSearchInput.value = "";
      this.handleSearch();
      const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${origin.colKey}"]`);
      if (cell) { this.selectCell(rowIdx, origin.colKey, cell); cell.scrollIntoView({ block: "nearest", inline: "nearest" }); }
      return;
    }
    if (!this.activeCell) return;
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const rows = this.getCurrentRows();
    let rowIdx = rows.length - 1;
    while (rowIdx > 0 && !keys.some(key => String(rows[rowIdx][key] ?? "").trim())) rowIdx--;
    const colKey = this.activeCell.colKey;
    const cell = this.elTableBody.querySelector(`[data-row="${rowIdx}"][data-col="${colKey}"]`);
    if (cell) { this.selectCell(rowIdx, colKey, cell); cell.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }

  parseClipboardGrid(text) {
    const grid = [[]]; let value = "", quoted = false;
    text = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"' && (quoted || value === "")) {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (char === "\t" || char === "\n")) {
        grid[grid.length - 1].push(value); value = "";
        if (char === "\n") grid.push([]);
      } else value += char;
    }
    grid[grid.length - 1].push(value);
    if (text.endsWith("\n") && grid.at(-1).length === 1 && grid.at(-1)[0] === "") grid.pop();
    return grid;
  }

  captureTextColorSelection() {
    this.textColorSelection = null;
    const input = document.activeElement;
    if (!this.activeCell || !input?.matches(".cell-input-element:not(.is-armed)") || input.selectionStart === input.selectionEnd) return;
    this.textColorSelection = { ...this.activeCell, text: input.value, start: input.selectionStart, end: input.selectionEnd };
  }

  setPartialTextColor(row, key, start, end, color) {
    const text = String(row[key] ?? "");
    const previous = row._richText?.[key];
    const colors = previous?.text === text ? [...previous.colors] : Array(text.length).fill(null);
    for (let i = Math.max(0, start); i < Math.min(text.length, end); i++) colors[i] = color;
    row._richText ||= {};
    row._richText[key] = { text, colors };
  }

  renderColoredText(element, row, key) {
    const text = String(row[key] ?? "");
    const rich = row._richText?.[key];
    element.textContent = "";
    if (rich?.text !== text || !Array.isArray(rich.colors)) { element.textContent = text; return; }
    let start = 0;
    while (start < text.length) {
      const color = rich.colors[start];
      let end = start + 1;
      while (end < text.length && rich.colors[end] === color) end++;
      const span = document.createElement("span"); span.textContent = text.slice(start, end);
      if (color) span.style.color = color;
      element.append(span); start = end;
    }
  }

  applyTextColor(color) {
    if (this.crossDateSelection) return;
    const textSelection = this.textColorSelection;
    this.textColorSelection = null;
    if (textSelection && this.activeCell?.rowIdx === textSelection.rowIdx && this.activeCell?.colKey === textSelection.colKey) {
      if (this.isEditingCell()) document.activeElement.blur();
      const row = this.getCurrentRows()[textSelection.rowIdx];
      if (String(row[textSelection.colKey] ?? "") === textSelection.text) {
        this.setPartialTextColor(row, textSelection.colKey, textSelection.start, textSelection.end, color);
        this.saveDataStore(); this.renderTable(); this.closeFontColorMenu(); return;
      }
    }
    if (this.isEditingCell()) document.activeElement.blur();
    const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const rows = this.getCurrentRows();
    const range = this.selectedRange || (this.selectedRowRange ? { ...this.selectedRowRange, minCol: 0, maxCol: keys.length - 1 } : null) || (this.selectedColKey ? { minRow: 0, maxRow: rows.length - 1, minCol: keys.indexOf(this.selectedColKey), maxCol: keys.indexOf(this.selectedColKey) }
      : this.activeCell ? { minRow: this.activeCell.rowIdx, maxRow: this.activeCell.rowIdx, minCol: keys.indexOf(this.activeCell.colKey), maxCol: keys.indexOf(this.activeCell.colKey) } : null);
    if (!range) return;
    for (let r = range.minRow; r <= range.maxRow; r++) for (let c = range.minCol; c <= range.maxCol; c++) {
      if (rows[r]._richText) delete rows[r]._richText[keys[c]];
      rows[r]._textColors ||= {};
      if (color) rows[r]._textColors[keys[c]] = color; else delete rows[r]._textColors[keys[c]];
    }
    this.saveDataStore(); this.renderTable();
    this.closeFontColorMenu();
  }

  closeFontColorMenu() {
    this.fontColorMenuCleanup?.();
    this.fontColorMenuCleanup = null;
    document.getElementById("fontColorMenu")?.remove();
  }

  openFontColorMenu(anchor) {
    this.closeFontColorMenu();
    const menu = document.createElement("div"); menu.id = "fontColorMenu"; menu.className = "font-color-menu";
    menu.setAttribute("role", "dialog"); menu.setAttribute("aria-label", "글자색 선택");
    const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "↺ 재설정";
    reset.className = "color-reset"; reset.onclick = () => this.applyTextColor(null); menu.appendChild(reset);
    const palette = document.createElement("div"); palette.className = "color-palette";
    const colors = ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#eeeeee", "#f3f3f3", "#ffffff",
      "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4285f4", "#0000ff", "#9900ff", "#ff00ff"];
    const hues = [0, 10, 32, 45, 100, 180, 215, 205, 260, 320];
    for (const light of [88, 76, 64, 48, 34, 20]) for (const hue of hues) colors.push(`hsl(${hue} 55% ${light}%)`);
    colors.forEach(color => { const button = document.createElement("button"); button.type = "button"; button.className = "color-swatch";
      button.style.backgroundColor = color; button.title = color; button.setAttribute("aria-label", color);
      button.onclick = () => this.applyTextColor(color); palette.appendChild(button); });
    menu.appendChild(palette);
    const custom = document.createElement("label"); custom.className = "custom-color"; custom.textContent = "맞춤 색상 ";
    const picker = document.createElement("input"); picker.type = "color"; picker.setAttribute("aria-label", "맞춤 글자색"); picker.oninput = () => this.applyTextColor(picker.value); custom.appendChild(picker); menu.appendChild(custom);
    menu.onmousedown = event => { if (event.target !== picker) event.preventDefault(); };
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect(); menu.style.left = `${Math.max(6, Math.min(rect.left, innerWidth - menu.offsetWidth - 6))}px`;
    menu.style.top = `${Math.max(6, Math.min(rect.bottom + 6, innerHeight - menu.offsetHeight - 6))}px`;
    const close = event => { if (!menu.contains(event.target) && !anchor.contains(event.target)) this.closeFontColorMenu(); };
    const escape = event => { if (event.key === "Escape") this.closeFontColorMenu(); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    this.fontColorMenuCleanup = () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }

  // =============================================================================
  // Clipboard Operations (클립보드 연동: 복사, 잘라내기, 붙여넣기, 지우기)
  // =============================================================================
  renderClipboardSelection() {
    const classes = ["clipboard-source", "clipboard-top", "clipboard-bottom", "clipboard-left", "clipboard-right"];
    this.elTableBody.querySelectorAll(".clipboard-source").forEach((cell) => cell.classList.remove(...classes));
    const selection = this.clipboardSelection;
    if (!selection || selection.date !== this.currentDate) return;
    const { minRow, maxRow, minCol, maxCol } = selection;
    const history = selection.kind === "history";
    this.elTableBody.querySelectorAll(history ? ".cross-date-cell" : ".excel-cell[data-col-idx]").forEach((cell) => {
      const row = Number(history ? cell.dataset.crossIdx : cell.dataset.row);
      const col = Number(history ? cell.dataset.crossColIdx : cell.dataset.colIdx);
      if (row < minRow || row > maxRow || col < minCol || col > maxCol) return;
      cell.classList.add("clipboard-source");
      if (row === minRow) cell.classList.add("clipboard-top");
      if (row === maxRow) cell.classList.add("clipboard-bottom");
      if (col === minCol) cell.classList.add("clipboard-left");
      if (col === maxCol) cell.classList.add("clipboard-right");
    });
  }

  copySelection() {
    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const rows = this.getCurrentRows();
    let tsvData = "";
    let copyRange = null;

    if (this.crossDateSelection) {
      copyRange = { ...this.crossDateSelection, kind: "history" };
      const { minRow, maxRow, minCol, maxCol } = copyRange;
      tsvData = this.crossDateResults.slice(minRow, maxRow + 1)
        .map(row => colKeys.slice(minCol, maxCol + 1).map(key => row[key] ?? "").join("\t")).join("\n");
    } else if (this.selectedRange) {
      // Range copy (TSV grid format)
      const { minRow, maxRow, minCol, maxCol } = this.selectedRange;
      copyRange = { ...this.selectedRange };
      const lines = [];
      for (let r = minRow; r <= maxRow; r++) {
        const rowVals = [];
        for (let c = minCol; c <= maxCol; c++) {
          const k = colKeys[c];
          rowVals.push(rows[r] ? (rows[r][k] ?? "") : "");
        }
        lines.push(rowVals.join("\t"));
      }
      tsvData = lines.join("\n");
    } else if (this.selectedColKey !== null) {
      // Entire column copy
      tsvData = rows.map((r) => r[this.selectedColKey] ?? "").join("\n");
      const col = colKeys.indexOf(this.selectedColKey);
      copyRange = { minRow: 0, maxRow: rows.length - 1, minCol: col, maxCol: col };
    } else if (this.activeCell) {
      // Single cell copy (빈 셀도 포함)
      tsvData = rows[this.activeCell.rowIdx] ? (rows[this.activeCell.rowIdx][this.activeCell.colKey] ?? "") : "";
      const col = colKeys.indexOf(this.activeCell.colKey);
      copyRange = { minRow: this.activeCell.rowIdx, maxRow: this.activeCell.rowIdx, minCol: col, maxCol: col };
    } else if (this.selectedRowIdx !== null) {
      tsvData = rows[this.selectedRowIdx] ? colKeys.map((k) => rows[this.selectedRowIdx][k] ?? "").join("\t") : "";
      copyRange = { minRow: this.selectedRowIdx, maxRow: this.selectedRowIdx, minCol: 0, maxCol: colKeys.length - 1 };
    }

    if (copyRange) {
      this.clipboardBuffer = tsvData;
      this.clipboardSelection = { ...copyRange, date: this.currentDate };
      this.renderClipboardSelection();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tsvData).catch((err) => {
          console.warn("Clipboard write failed, internal buffer used:", err);
        });
      }
      this.showSaveIndicator("클립보드에 복사됨");
    }
  }

  cutSelection() {
    if (this.crossDateSelection) return;
    this.copySelection();
    this.clearSelection();
    this.showSaveIndicator("잘라내기 완료됨");
  }

  async pasteSelection(suppliedText) {
    let text = suppliedText ?? "";
    if (suppliedText === undefined && navigator.clipboard && navigator.clipboard.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (err) {
        text = this.clipboardBuffer;
      }
    } else if (suppliedText === undefined) {
      text = this.clipboardBuffer;
    }
    if (!text && suppliedText === undefined && this.clipboardBuffer) text = this.clipboardBuffer;
    if (!text) {
      this.showSaveIndicator("붙여넣을 데이터가 없습니다.", true);
      return;
    }

    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const rows = this.getCurrentRows();

    const grid = this.parseClipboardGrid(text);

    // Determine start coordinate
    let startRow = 0;
    let startCol = 0;

    if (this.selectedRange) {
      startRow = this.selectedRange.minRow;
      startCol = this.selectedRange.minCol;
    } else if (this.activeCell) {
      startRow = this.activeCell.rowIdx;
      startCol = colKeys.indexOf(this.activeCell.colKey);
      if (startCol < 0) startCol = 0;
    } else if (this.selectedRowIdx !== null) {
      startRow = this.selectedRowIdx;
      startCol = 0;
    } else if (this.selectedColKey !== null) {
      startRow = 0;
      startCol = colKeys.indexOf(this.selectedColKey);
      if (startCol < 0) startCol = 0;
    }

    // Apply grid data to rows
    grid.forEach((rowVals, rOffset) => {
      const r = startRow + rOffset;
      while (r >= rows.length) {
        this.addNewRow(false);
      }
      rowVals.forEach((val, cOffset) => {
        const c = startCol + cOffset;
        if (c < colKeys.length) {
          const k = colKeys[c];
          if (k) {
            const trimmed = val.trim();
            rows[r][k] = k === "gender" ? this.normalizeGenderInput(trimmed)
              : k === "writer" ? this.normalizeWriterInput(trimmed) : trimmed;
          }
        }
      });
    });

    this.saveDataStore();
    this.renderTable();
    this.showSaveIndicator("붙여넣기 완료됨");
    this.clipboardSelection = null;
    this.renderClipboardSelection();
  }

  clearSelection() {
    const colKeys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
    const rows = this.getCurrentRows();

    if (this.selectedRange) {
      const { minRow, maxRow, minCol, maxCol } = this.selectedRange;
      for (let r = minRow; r <= maxRow; r++) {
        if (rows[r]) {
          for (let c = minCol; c <= maxCol; c++) {
            const k = colKeys[c];
            if (k) {
              rows[r][k] = "";
            }
          }
        }
      }
    } else if (this.selectedColKey !== null) {
      this.clearColData(this.selectedColKey);
      return;
    } else if (this.activeCell && rows[this.activeCell.rowIdx]) {
      const { rowIdx, colKey } = this.activeCell;
      rows[rowIdx][colKey] = "";
    } else if (this.selectedRowIdx !== null) {
      this.clearRowData(this.selectedRowIdx);
      return;
    }

    this.saveDataStore();
    this.renderTable();
    this.showSaveIndicator("내용 지우기 완료");
  }

  // =============================================================================
  // Row Manipulations (행 삽입, 행 데이터 삭제, 행 삭제)
  // =============================================================================
  insertRowAbove(targetRowIdx) {
    const rows = this.getCurrentRows();
    const formattedDate = this.currentDate.replace(/-/g, ".");
    const newRow = {
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
    };

    const insertIdx = Math.max(0, Math.min(targetRowIdx, rows.length));
    rows.splice(insertIdx, 0, newRow);

    this.saveDataStore();
    this.renderTable();
    this.navigateCell(insertIdx, "chartNo");
    this.showSaveIndicator(`${insertIdx + BASE_ROW_NUMBER}행 위에 1개 행이 삽입되었습니다.`);
  }

  insertRowBelow(targetRowIdx) {
    const rows = this.getCurrentRows();
    const formattedDate = this.currentDate.replace(/-/g, ".");
    const newRow = {
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
    };

    const insertIdx = Math.max(0, Math.min(targetRowIdx + 1, rows.length));
    rows.splice(insertIdx, 0, newRow);

    this.saveDataStore();
    this.renderTable();
    this.navigateCell(insertIdx, "chartNo");
    this.showSaveIndicator(`${insertIdx + BASE_ROW_NUMBER}행 아래에 1개 행이 삽입되었습니다.`);
  }

  clearRowData(targetRowIdx) {
    const rows = this.getCurrentRows();
    let minRow = targetRowIdx;
    let maxRow = targetRowIdx;

    if (this.selectedRowRange &&
        targetRowIdx >= this.selectedRowRange.minRow &&
        targetRowIdx <= this.selectedRowRange.maxRow) {
      minRow = this.selectedRowRange.minRow;
      maxRow = this.selectedRowRange.maxRow;
    }

    for (let r = minRow; r <= maxRow; r++) {
      if (rows[r]) {
        const rowObj = rows[r];
        rowObj.no = "";
        rowObj.gender = "";
        rowObj.chartNo = "";
        rowObj.name = "";
        rowObj.part = "";
        rowObj.prescription = "";
        rowObj.extra = "";
        rowObj.memo = "";
        rowObj.specialNote = "";
      }
    }

    this.saveDataStore();
    this.renderTable();
    const count = maxRow - minRow + 1;
    const msg = count > 1
      ? `${minRow + BASE_ROW_NUMBER}~${maxRow + BASE_ROW_NUMBER}행 (${count}개 행) 데이터가 삭제되었습니다.`
      : `${minRow + BASE_ROW_NUMBER}행 데이터가 삭제되었습니다.`;
    this.showSaveIndicator(msg);
  }

  deleteRowAt(targetRowIdx) {
    const rows = this.getCurrentRows();
    let minRow = targetRowIdx;
    let deleteCount = 1;

    if (this.selectedRowRange &&
        targetRowIdx >= this.selectedRowRange.minRow &&
        targetRowIdx <= this.selectedRowRange.maxRow) {
      minRow = this.selectedRowRange.minRow;
      deleteCount = this.selectedRowRange.maxRow - this.selectedRowRange.minRow + 1;
    }

    if (minRow >= 0 && minRow < rows.length) {
      rows.splice(minRow, deleteCount);
      // Guarantee minimum 150 rows maintained
      const formattedDate = this.currentDate.replace(/-/g, ".");
      while (rows.length < DEFAULT_ROW_COUNT) {
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
      this.activeCell = null;
      this.clearHeaderSelections();
      this.selectedRowIdx = null;
      this.selectedRowRange = null;
      this.clipboardSelection = null;
      this.saveDataStore();
      this.renderTable();
      const msg = deleteCount > 1
        ? `${minRow + BASE_ROW_NUMBER}~${minRow + deleteCount - 1 + BASE_ROW_NUMBER}행 (${deleteCount}개 행)이 삭제되었습니다.`
        : `${minRow + BASE_ROW_NUMBER}행이 삭제되었습니다.`;
      this.showSaveIndicator(msg);
    }
  }

  clearColData(colKey) {
    if (!colKey) return;
    const rows = this.getCurrentRows();
    rows.forEach((r) => {
      r[colKey] = "";
    });
    this.saveDataStore();
    this.renderTable();
    this.showSaveIndicator(`${colKey} 열 데이터 비우기 완료`);
  }

  // =============================================================================
  // Excel Keyboard Shortcuts Handler (엑셀 기반 키보드 단축키 처리)
  // =============================================================================
  handleGlobalKeyDown(e) {
    if (this.handleHistoryShortcut(e)) return;
    if (this.fillDrag) {
      e.preventDefault();
      if (e.key === "Escape") this.cancelFillDrag();
      return;
    }
    // If currently typing in an input/textarea inside a cell or modal
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      const isCtrl = e.ctrlKey || e.metaKey;
      // ★ 셀 편집 중에도 Ctrl/Cmd+F로 검색 가능: 현재 셀 내용으로 전체 날짜 검색
      if (isCtrl && e.key.toLowerCase() === EXCEL_SHORTCUTS.SEARCH.key) {
        e.preventDefault();
        e.stopPropagation();
        const cellInput = e.target.closest(".excel-cell") ? e.target : null;
        const searchVal = cellInput ? cellInput.value.trim() : "";
        if (this.elSearchInput && searchVal) {
          document.querySelectorAll(".search-origin-row").forEach(r => r.classList.remove("search-origin-row"));
          const originRow = e.target.closest(".excel-row");
          if (originRow) originRow.classList.add("search-origin-row");
          const originRowIdx = originRow ? Number(originRow.dataset.rowIdx) : -1;
          e.target.blur();
          this.elSheetContainer.focus({ preventScroll: true });
          this.searchAllDates(searchVal, originRowIdx);
        }
        return;
      }
      if (e.key === "Escape") {
        e.target.blur();
        this.hideContextMenu();
      }
      return;
    }

    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    const keyLower = e.key.toLowerCase();

    if (isCtrlOrMeta && e.key === "ArrowDown") {
      e.preventDefault(); this.jumpToLastRecord(); return;
    }
    if (this.crossDateSelection && e.key !== "Escape") {
      const selection = this.crossDateSelection;
      if (e.key === "Enter") this.applyHistoryRow(this.crossDateResults[selection.minRow]);
      else if (isCtrlOrMeta && keyLower === "c") this.copySelection();
      else if (isCtrlOrMeta && keyLower === "f") {
        const keys = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
        const value = String(this.crossDateResults[selection.endRow][keys[selection.endCol]] ?? "").trim();
        if (value) this.searchAllDates(value);
        else this.elSearchInput.focus();
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        const row = Math.max(0, Math.min(this.crossDateResults.length - 1, selection.endRow + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0)));
        const col = Math.max(0, Math.min(9, selection.endCol + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0)));
        this.selectCrossDateCell(row, col, e.shiftKey);
        this.elTableBody.querySelector(`[data-cross-idx="${row}"][data-cross-col-idx="${col}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      if (e.key !== "Tab") e.preventDefault();
      return;
    }

    // 1) Copy (Ctrl+C / Cmd+C)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.COPY.key) {
      e.preventDefault();
      this.copySelection();
      return;
    }

    // 2) Cut (Ctrl+X / Cmd+X)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.CUT.key) {
      e.preventDefault();
      this.cutSelection();
      return;
    }

    // 3) Paste (Ctrl+V / Cmd+V)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.PASTE.key) return; // Native paste supplies clipboardData.

    // 4) Select All (Ctrl+A / Cmd+A)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.SELECT_ALL.key) {
      e.preventDefault();
      this.selectAllCells();
      return;
    }

    // 5) Quick Save (Ctrl+S / Cmd+S)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.SAVE.key) {
      e.preventDefault();
      this.saveDataStore();
      return;
    }

    // 6) Print / Preview Modal (Ctrl+P / Cmd+P)
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.PRINT.key) {
      e.preventDefault();
      this.openPreviewModal();
      return;
    }

    // 7) Search / Filter (Ctrl+F / Cmd+F)
    //    셀이 선택된 상태에서 Ctrl+F → 해당 셀 내용으로 테이블 필터링
    //    셀이 선택되지 않았으면 검색창 포커스
    if (isCtrlOrMeta && keyLower === EXCEL_SHORTCUTS.SEARCH.key) {
      e.preventDefault();
      if (this.activeCell && this.elSearchInput) {
        const { rowIdx, colKey } = this.activeCell;
        const rows = this.getCurrentRows();
        const cellValue = rows[rowIdx] ? (rows[rowIdx][colKey] || "") : "";
        const trimmed = String(cellValue).trim();
        if (trimmed) {
          document.querySelectorAll(".search-origin-row").forEach(r => r.classList.remove("search-origin-row"));
          const originRow = document.querySelector(`tr[data-row-idx="${rowIdx}"]`);
          if (originRow) originRow.classList.add("search-origin-row");
          this.searchAllDates(trimmed, rowIdx);
        } else {
          this.elSearchInput.focus();
          this.elSearchInput.select();
        }
      } else if (this.elSearchInput) {
        this.elSearchInput.focus();
        this.elSearchInput.select();
      }
      return;
    }

    // 8) Insert Row (Ctrl + '+' or Ctrl + '=' or Ctrl + Shift + '=')
    if (isCtrlOrMeta && (e.key === "+" || e.key === "=" || e.code === "Equal" || e.code === "NumpadAdd")) {
      e.preventDefault();
      const r = this.selectedRowIdx ?? (this.activeCell ? this.activeCell.rowIdx : 0);
      this.insertRowAbove(r);
      return;
    }

    // 9) Delete Row (Ctrl + '-' or Ctrl + '_' or NumpadSubtract)
    if (isCtrlOrMeta && (e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract")) {
      e.preventDefault();
      if (this.selectedRowRange) this.deleteRowAt(this.selectedRowRange.minRow);
      return;
    }

    // 10) Clear Contents (Delete / Backspace)
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.clearSelection();
      return;
    }

    // 11) Alt + Left / Right -> Date switch
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      this.shiftDay(-1);
      return;
    } else if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      this.shiftDay(1);
      return;
    }

    // 12) F2 -> Edit active cell
    if (e.key === "F2" && this.activeCell) {
      const { rowIdx, colKey } = this.activeCell;
      const cellEl = document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="${colKey}"]`);
      if (cellEl && !cellEl.querySelector("input") && !cellEl.querySelector("select")) {
        e.preventDefault();
        this.startInlineEdit(rowIdx, colKey, cellEl);
        return;
      }
    }

    // G열 성별 키보드 직접 입력 ('ㄹ' -> 'F', 'ㅡ' -> 'M', 'f'/'F' -> 'F', 'm'/'M' -> 'M')
    if (this.activeCell && this.activeCell.colKey === "gender" && !isCtrlOrMeta && !e.altKey) {
      const { rowIdx } = this.activeCell;
      const cellEl = document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="gender"]`);
      if (cellEl) {
        if (e.key === "ㄹ" || keyLower === "f") {
          e.preventDefault();
          this.closeGenderDropdown();
          this.setGenderValue(rowIdx, "F", cellEl);
          return;
        }
        if (e.key === "ㅡ" || keyLower === "m") {
          e.preventDefault();
          this.closeGenderDropdown();
          this.setGenderValue(rowIdx, "M", cellEl);
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace" || e.key === " ") {
          e.preventDefault();
          this.closeGenderDropdown();
          this.setGenderValue(rowIdx, "", cellEl);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const dropBtn = cellEl.querySelector(".gender-dropdown-btn");
          this.openGenderDropdown(rowIdx, cellEl, dropBtn);
          return;
        }
      }
    }

    // 13) Enter / Shift+Enter -> Move Down / Up
    if (e.key === "Enter" && this.activeCell) {
      e.preventDefault();
      const nextRow = this.activeCell.rowIdx + (e.shiftKey ? -1 : 1);
      this.navigateCell(Math.max(0, nextRow), this.activeCell.colKey);
      return;
    }

    // 14) Tab / Shift+Tab -> Move Next / Prev Column
    if (e.key === "Tab" && this.activeCell) {
      e.preventDefault();
      this.navigateCol(this.activeCell.rowIdx, this.activeCell.colKey, e.shiftKey ? -1 : 1);
      return;
    }

    // Row-header selection keeps its original anchor while Shift+arrows moves the endpoint.
    if (this.selectedRowRange && e.shiftKey && !isCtrlOrMeta && !e.altKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const anchor = this.rowRangeStart ?? this.selectedRowRange.minRow;
      const end = this.rowRangeEnd ?? this.selectedRowRange.maxRow;
      const targetRow = Math.max(0, Math.min(this.getCurrentRows().length - 1,
        end + (e.key === "ArrowDown" ? 1 : -1)));
      this.selectRowRange(anchor, targetRow);
      this.elTableBody.querySelector(`tr[data-row-idx="${targetRow}"] .row-num`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }

    // 15) Arrow Keys Navigation (위/아래/좌/우 셀 이동)
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && this.activeCell) {
      e.preventDefault();
      const colOrder = ["no", "gender", "chartNo", "name", "part", "prescription", "extra", "writer", "memo", "specialNote"];
      const from = e.shiftKey && this.selectedRange && this.rangeEnd && !this.selectedRowRange
        ? this.rangeEnd : { rowIdx: this.activeCell.rowIdx, colIdx: colOrder.indexOf(this.activeCell.colKey) };
      let targetRow = from.rowIdx;
      let targetColIdx = from.colIdx;
      if (e.key === "ArrowUp") targetRow--;
      if (e.key === "ArrowDown") targetRow++;
      if (e.key === "ArrowLeft") targetColIdx--;
      if (e.key === "ArrowRight") targetColIdx++;
      targetRow = Math.max(0, Math.min(this.getCurrentRows().length - 1, targetRow));
      targetColIdx = Math.max(0, Math.min(colOrder.length - 1, targetColIdx));
      const targetColKey = colOrder[targetColIdx];
      const targetCell = this.elTableBody.querySelector(`[data-row="${targetRow}"][data-col="${targetColKey}"]`);
      if (targetCell) {
        if (e.shiftKey) this.extendCellSelection(targetRow, targetColIdx);
        else this.selectCell(targetRow, targetColKey, targetCell, false);
        targetCell.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      return;
    }

    // 16) Direct character typing to begin editing (for text cells)
    if (this.activeCell?.colKey === "writer" && !isCtrlOrMeta && !e.altKey && /^Key[A-Z]$/.test(e.code)) {
      const cellEl = document.querySelector(`.excel-cell[data-row="${this.activeCell.rowIdx}"][data-col="writer"]`);
      if (cellEl && !cellEl.querySelector("input")) {
        e.preventDefault();
        this.startInlineEdit(this.activeCell.rowIdx, "writer", cellEl);
        const input = cellEl.querySelector("input");
        input.value = e.code.slice(3);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
    }
    if (this.activeCell && !isCtrlOrMeta && !e.altKey && (e.key.length === 1 || e.key === "Process" || e.keyCode === 229)) {
      const { rowIdx, colKey } = this.activeCell;
      if (colKey !== "gender") {
        const cellEl = document.querySelector(`.excel-cell[data-row="${rowIdx}"][data-col="${colKey}"]`);
        if (cellEl && !cellEl.querySelector("input")) {
          this.startInlineEdit(rowIdx, colKey, cellEl);
        }
      }
    }

    // 17) Escape -> Hide context menu & clear selection highlights & DESELECT cell & 검색 필터 해제
    if (e.key === "Escape") {
      e.preventDefault();
      this.closeAutocompleteMenu();
      this.closeGenderDropdown();
      this.hideContextMenu();
      this.clipboardSelection = null;
      this.renderClipboardSelection();
      this.clearHeaderSelections();

      // ★ Ctrl+F 검색 필터가 활성화되어 있으면 해제하여 원래 화면으로 복원
      if (this.elSearchInput && this.elSearchInput.value.trim()) {
        this.elSearchInput.value = "";
        this.handleSearch();
      }
      // 교차 날짜 임시 행 및 원점 행 하이라이트 제거
      this.clearCrossDateRows();
      document.querySelectorAll(".search-origin-row").forEach(r => r.classList.remove("search-origin-row"));
      document.querySelectorAll(".cross-date-row-selected").forEach(r => r.classList.remove("cross-date-row-selected"));

      // 편집 중인 input이 있으면 blur하여 편집 종료
      const activeInput = document.querySelector(".cell-input-element");
      if (activeInput) {
        activeInput.blur();
      }

      // 셀 포커스 하이라이트 제거
      document.querySelectorAll(".cell-focused").forEach((c) => c.classList.remove("cell-focused"));

      // 활성 행 하이라이트 제거
      document.querySelectorAll(".excel-row.active-row").forEach((r) => r.classList.remove("active-row"));

      // 범위 선택 상태 해제
      document.querySelectorAll(".range-selected, .range-border-top, .range-border-bottom, .range-border-left, .range-border-right").forEach((c) => {
        c.classList.remove("range-selected", "range-border-top", "range-border-bottom", "range-border-left", "range-border-right");
      });

      // 수식 입력줄 초기화
      if (this.elFormulaInput) {
        this.elFormulaInput.value = "";
      }
      if (this.elCellAddress) {
        this.elCellAddress.textContent = "";
      }

      // 내부 상태 완전 초기화
      this.activeCell = null;
      this.selectedRowIdx = null;
      this.selectedColKey = null;
      this.selectedRange = null;
      this.selectedRowRange = null;
      this.rangeStart = null;
      this.rangeEnd = null;
    }
  }

  // ===== 프리셋 관리 (빠른 입력 도구 수정 기능) =====

  // ===== 프리셋 관리 (빠른 입력 도구 추가/삭제/수정/관리 기능) =====

  renderQuickChips() {
    const container = this.elQuickChipsContainer;
    if (!container) return;
    container.innerHTML = "";

    const types = ["prescription", "extra"];
    types.forEach((type, typeIdx) => {
      const items = COLUMN_PRESETS[type] || [];
      if (typeIdx > 0 && items.length > 0) {
        const sep = document.createElement("span");
        sep.className = "chip-sep";
        sep.textContent = "|";
        container.appendChild(sep);
      }

      items.forEach((val, idx) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = type === "extra" ? "chip highlight" : "chip";
        chip.dataset.type = type;
        chip.dataset.val = val;
        chip.dataset.idx = idx;
        // 짧은 표시 이름 생성
        chip.textContent = val.length > 20 ? val.replace(/\s*\(\s*/g, "(").replace(/\s*\/\s*/g, "/").replace(/\s*\)\s*/g, ")") : val;
        chip.title = `${val}\n(클릭: 입력 | 우클릭: 수정/삭제)`;

        // 클릭: 빠른 입력 적용
        chip.addEventListener("click", () => {
          this.applyQuickChip(type, val);
        });

        // 우클릭: 수정/삭제 메뉴
        chip.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._contextPreset = { type, index: idx, value: val };
          this.showPresetContextMenu(e.pageX, e.pageY);
        });

        // 모바일 터치 대응: 롱프레스 (500ms 이상 길게 누르면 메뉴 호출)
        let longPressTimer = null;
        chip.addEventListener("touchstart", (e) => {
          longPressTimer = setTimeout(() => {
            const touch = e.touches[0];
            this._contextPreset = { type, index: idx, value: val };
            this.showPresetContextMenu(touch.pageX, touch.pageY);
          }, 500);
        }, { passive: true });

        chip.addEventListener("touchend", () => {
          if (longPressTimer) clearTimeout(longPressTimer);
        });
        chip.addEventListener("touchmove", () => {
          if (longPressTimer) clearTimeout(longPressTimer);
        });
        chip.addEventListener("touchcancel", () => {
          if (longPressTimer) clearTimeout(longPressTimer);
        });

        container.appendChild(chip);
      });
    });
    const controls = document.getElementById("historyControls");
    controls.replaceChildren();
    for (const [id, path, label, redo] of [
      ["btnUndo", "M9 5 4 10l5 5 M4 10h10a5 5 0 0 1 0 10h-4", "되돌리기 (Ctrl/Cmd+Z)", false],
      ["btnRedo", "m15 5 5 5-5 5 M20 10H10a5 5 0 0 0 0 10h4", "다시 실행 (Ctrl/Cmd+Shift+Z)", true]
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = id;
      button.className = "history-button";
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("aria-hidden", "true");
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      arrow.setAttribute("d", path);
      icon.appendChild(arrow);
      button.appendChild(icon);
      button.title = label;
      button.setAttribute("aria-label", label);
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", () => this.restoreEditHistory(redo));
      controls.appendChild(button);
    }
    this.updateHistoryButtons();
  }

  showPresetContextMenu(x, y) {
    this.hidePresetContextMenu();
    const menu = this.elPresetContextMenu;
    if (!menu) return;
    menu.style.display = "block";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // 화면 밖으로 나가지 않도록 조정
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = `${Math.max(10, x - rect.width)}px`;
      if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(10, y - rect.height)}px`;
    });
  }

  hidePresetContextMenu() {
    if (this.elPresetContextMenu) {
      this.elPresetContextMenu.style.display = "none";
    }
  }

  handlePresetContextAction(action) {
    const target = this._contextPreset;
    if (!target && action !== "reset-presets" && action !== "manage-presets") return;

    switch (action) {
      case "edit-preset":
        this.openPresetModal("edit", target);
        break;
      case "delete-preset":
        if (confirm(`"${target.value}" 프리셋을 삭제하시겠습니까?`)) {
          const arr = COLUMN_PRESETS[target.type];
          if (arr) {
            arr.splice(target.index, 1);
            saveColumnPresets(COLUMN_PRESETS);
            this.renderQuickChips();
            this.showSaveIndicator("프리셋 삭제됨");
          }
        }
        break;
      case "manage-presets":
        this.openPresetManager(target ? target.type : "prescription");
        break;
      case "reset-presets":
        if (confirm("빠른 입력 도구를 기본값으로 복원하시겠습니까?")) {
          COLUMN_PRESETS = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
          saveColumnPresets(COLUMN_PRESETS);
          this.renderQuickChips();
          this.showSaveIndicator("기본값으로 복원됨");
        }
        break;
    }
    this._contextPreset = null;
  }

  // --- 통합 빠른 도구 관리 모달 (추가 / 삭제 / 수정 / 순서변경) ---
  openPresetManager(tab = "prescription") {
    if (!this.elPresetManagerModal) return;
    this.activePresetTab = tab;
    this.updatePresetManagerTabs();
    this.renderPresetManagerList();
    this.elPresetManagerModal.style.display = "flex";
    if (this.elManagerNewPresetInput) {
      this.elManagerNewPresetInput.value = "";
      setTimeout(() => this.elManagerNewPresetInput.focus(), 100);
    }
  }

  closePresetManager() {
    if (this.elPresetManagerModal) {
      this.elPresetManagerModal.style.display = "none";
    }
  }

  switchPresetTab(tab) {
    this.activePresetTab = tab;
    this.updatePresetManagerTabs();
    this.renderPresetManagerList();
    if (this.elManagerNewPresetInput) {
      this.elManagerNewPresetInput.focus();
    }
  }

  updatePresetManagerTabs() {
    if (this.elTabPresetPrescription) {
      this.elTabPresetPrescription.classList.toggle("active", this.activePresetTab === "prescription");
    }
    if (this.elTabPresetExtra) {
      this.elTabPresetExtra.classList.toggle("active", this.activePresetTab === "extra");
    }
    if (this.elManagerNewPresetInput) {
      this.elManagerNewPresetInput.placeholder = this.activePresetTab === "prescription"
        ? "새 처방 프리셋 입력 (예: 사지 ( HP / Laser / ICT ))"
        : "새 추가사항 프리셋 입력 (예: 학생 (HP/Laser))";
    }
  }

  renderPresetManagerList() {
    const container = this.elPresetListContainer;
    if (!container) return;
    container.innerHTML = "";

    const tab = this.activePresetTab;
    const items = COLUMN_PRESETS[tab] || [];

    if (items.length === 0) {
      container.innerHTML = `<div style="padding:28px 16px; text-align:center; color:#94a3b8; font-size:13px;">등록된 프리셋이 없습니다.<br>위 입력창에서 새 프리셋을 추가해보세요.</div>`;
      return;
    }

    items.forEach((val, idx) => {
      const itemEl = document.createElement("div");
      itemEl.className = "preset-list-item";

      const numEl = document.createElement("span");
      numEl.className = "preset-item-num";
      numEl.textContent = `${idx + 1}.`;

      const textEl = document.createElement("span");
      textEl.className = "preset-item-text";
      textEl.textContent = val;
      textEl.title = `${val} (더블클릭하여 바로 수정)`;
      textEl.style.cursor = "pointer";
      textEl.addEventListener("dblclick", () => this.editPresetAt(tab, idx));

      const actionsEl = document.createElement("div");
      actionsEl.className = "preset-item-actions";

      // 위로 이동 버튼
      if (idx > 0) {
        const btnUp = document.createElement("button");
        btnUp.type = "button";
        btnUp.className = "preset-action-btn";
        btnUp.textContent = "▲";
        btnUp.title = "위로 이동";
        btnUp.addEventListener("click", () => this.movePresetAt(tab, idx, -1));
        actionsEl.appendChild(btnUp);
      }

      // 아래로 이동 버튼
      if (idx < items.length - 1) {
        const btnDown = document.createElement("button");
        btnDown.type = "button";
        btnDown.className = "preset-action-btn";
        btnDown.textContent = "▼";
        btnDown.title = "아래로 이동";
        btnDown.addEventListener("click", () => this.movePresetAt(tab, idx, 1));
        actionsEl.appendChild(btnDown);
      }

      // 수정 버튼
      const btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.className = "preset-action-btn";
      btnEdit.textContent = "✏️ 수정";
      btnEdit.title = "프리셋 내용 수정";
      btnEdit.addEventListener("click", () => this.editPresetAt(tab, idx));
      actionsEl.appendChild(btnEdit);

      // 삭제 버튼
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "preset-action-btn btn-del";
      btnDel.textContent = "🗑️ 삭제";
      btnDel.title = "프리셋 삭제";
      btnDel.addEventListener("click", () => this.deletePresetAt(tab, idx));
      actionsEl.appendChild(btnDel);

      itemEl.appendChild(numEl);
      itemEl.appendChild(textEl);
      itemEl.appendChild(actionsEl);
      container.appendChild(itemEl);
    });
  }

  addPresetFromManager() {
    if (!this.elManagerNewPresetInput) return;
    const val = this.elManagerNewPresetInput.value.trim();
    if (!val) {
      alert("프리셋 내용을 입력해주세요.");
      this.elManagerNewPresetInput.focus();
      return;
    }

    const tab = this.activePresetTab;
    if (!COLUMN_PRESETS[tab]) COLUMN_PRESETS[tab] = [];
    COLUMN_PRESETS[tab].push(val);

    saveColumnPresets(COLUMN_PRESETS);
    this.renderPresetManagerList();
    this.renderQuickChips();
    this.showSaveIndicator("프리셋 추가됨");

    this.elManagerNewPresetInput.value = "";
    this.elManagerNewPresetInput.focus();
  }

  editPresetAt(tab, index) {
    const curVal = COLUMN_PRESETS[tab]?.[index];
    if (curVal === undefined) return;

    const newVal = prompt("프리셋 내용을 수정하세요:", curVal);
    if (newVal === null) return; // 취소
    const trimmed = newVal.trim();
    if (!trimmed) {
      alert("내용을 비워둘 수 없습니다.");
      return;
    }

    COLUMN_PRESETS[tab][index] = trimmed;
    saveColumnPresets(COLUMN_PRESETS);
    this.renderPresetManagerList();
    this.renderQuickChips();
    this.showSaveIndicator("프리셋 수정됨");
  }

  deletePresetAt(tab, index) {
    const curVal = COLUMN_PRESETS[tab]?.[index];
    if (curVal === undefined) return;

    if (confirm(`"${curVal}" 항목을 삭제하시겠습니까?`)) {
      COLUMN_PRESETS[tab].splice(index, 1);
      saveColumnPresets(COLUMN_PRESETS);
      this.renderPresetManagerList();
      this.renderQuickChips();
      this.showSaveIndicator("프리셋 삭제됨");
    }
  }

  movePresetAt(tab, index, dir) {
    const arr = COLUMN_PRESETS[tab];
    if (!arr) return;
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= arr.length) return;

    const temp = arr[index];
    arr[index] = arr[targetIdx];
    arr[targetIdx] = temp;

    saveColumnPresets(COLUMN_PRESETS);
    this.renderPresetManagerList();
    this.renderQuickChips();
  }

  resetPresetsFromManager() {
    if (confirm("빠른 입력 도구를 초기 기본값으로 복원하시겠습니까?\n모든 커스텀 항목이 기본값 세트로 복원됩니다.")) {
      COLUMN_PRESETS = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
      saveColumnPresets(COLUMN_PRESETS);
      this.renderPresetManagerList();
      this.renderQuickChips();
      this.showSaveIndicator("기본값으로 복원됨");
    }
  }

  // --- 단일 모달 (기존 호환) ---
  openPresetModal(mode, target) {
    this.elPresetModal.style.display = "flex";
    if (mode === "edit" && target) {
      this.elPresetModalTitle.textContent = "프리셋 수정";
      this.elPresetTypeSelect.value = target.type;
      this.elPresetTypeSelect.disabled = true;
      this.elPresetLabelInput.value = target.value;
      this.elPresetValueInput.value = target.value;
      this._editingPreset = { type: target.type, index: target.index };
    } else {
      this.elPresetModalTitle.textContent = "프리셋 추가";
      this.elPresetTypeSelect.disabled = false;
      this.elPresetLabelInput.value = "";
      this.elPresetValueInput.value = "";
      this._editingPreset = null;
    }
    setTimeout(() => this.elPresetLabelInput.focus(), 100);
  }

  closePresetModal() {
    this.elPresetModal.style.display = "none";
    this._editingPreset = null;
  }

  savePresetFromModal() {
    const type = this.elPresetTypeSelect.value;
    const label = this.elPresetLabelInput.value.trim();
    const value = this.elPresetValueInput.value.trim() || label;

    if (!label) {
      alert("표시 이름을 입력해주세요.");
      return;
    }

    if (!COLUMN_PRESETS[type]) COLUMN_PRESETS[type] = [];

    if (this._editingPreset) {
      // 수정
      COLUMN_PRESETS[this._editingPreset.type][this._editingPreset.index] = value;
      this.showSaveIndicator("프리셋 수정됨");
    } else {
      // 추가
      COLUMN_PRESETS[type].push(value);
      this.showSaveIndicator("프리셋 추가됨");
    }

    saveColumnPresets(COLUMN_PRESETS);
    this.renderQuickChips();
    if (this.elPresetManagerModal && this.elPresetManagerModal.style.display !== "none") {
      this.renderPresetManagerList();
    }
    this.closePresetModal();
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

// Instantiate on DOMContentLoaded
window.addEventListener("DOMContentLoaded", () => {
  window.ptApp = new PTApp();
});
