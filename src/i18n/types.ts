export type SupportedLanguage = 'id' | 'en' | 'th' | 'zh' | 'ja';

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'id', name: 'Indonesia', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'th', name: 'Thailand', nativeName: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'zh', name: 'Chinese', nativeName: '中文 (简体)', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
];

export interface TranslationSchema {
  // Header & Footer
  appTitle: string;
  appSubtitle: string;
  appSubtitleShort: string;
  browserBadge: string;
  languageSelect: string;
  modeRekapPO: string;
  modeDetailSJ: string;
  guideBtn: string;
  footerSubtitle: string;
  developedBy: string;

  // Dual Upload Container
  singleConvertTitle: string;
  singleConvertDesc: string;
  singleConvertTag: string;
  singleConvertBtn: string;
  multiConvertTitle: string;
  multiConvertDesc: string;
  multiConvertTag: string;
  multiConvertBtn: string;
  rulesGuideBtn: string;
  askAiBtn: string;
  fileLimits: string;
  instantPreview: string;
  parallelProcessing: string;
  processingMsg: string;
  readingConverting: string;

  // Alerts & Status
  fileConvertedSuccess: string;
  zipDownloadedSuccess: string;
  masterExcelSuccess: string;
  errorReadingSheet: string;
  errorZipDownload: string;
  errorMasterExcel: string;
  activeFileToast: string;
  sheetChangedToast: string;

  // File Switcher Bar
  fileLabel: string;
  activeDocument: string;
  allFilesConverted: string;
  downloadZipBtn: string;
  mergeMasterBtn: string;
  zipAllBtn: string;
  mergeMasterShortBtn: string;
  addFileBtn: string;
  changeFileBtn: string;
  removeFile: string;

  // Action Toolbar
  exportExcelBtn: string;
  exportScopeHeader: string;
  sendWaFileBtn: string;
  waReportBtn: string;
  copyTextBtn: string;
  copyFormatHeader: string;
  shareWhatsAppBtn: string;
  copyReportBtn: string;
  resetBtn: string;
  rulesBtn: string;
  askAiQuickBtn: string;
  allPo: string;
  openPo: string;
  closedPo: string;
  readyKirim: string;
  agingCriticalFilter: string;
  overStockFilter: string;
  overKirimanFilter: string;
  allRecordsScope: string;
  openOnlyScope: string;
  closedOnlyScope: string;
  readyOnlyScope: string;
  overStockScope: string;
  overKirimanScope: string;
  criticalAgingScope: string;
  copiedSuccess: string;
  scopeAllData: string;
  scopeCoOpen: string;
  scopeCoClosed: string;
  scopeStockReady: string;
  scopeOverStock: string;
  scopeOverDelivery: string;
  scopeSisaOsOpen: string;
  scopeAllCo: string;
  sheetLabel: string;

  // Stats Overview & Cards
  totalPoCard: string;
  statTotalPoItem: string;
  statTotalOrder: string;
  statSuratJalan: string;
  sisaOSCard: string;
  statSisaOS: string;
  stockGudangCard: string;
  statStokGudang: string;
  terkirimCard: string;
  statTerkirim: string;
  overStockCard: string;
  overKirimanCard: string;
  valuasiOSCard: string;
  statValuasiOS: string;
  unitPo: string;
  unitPoShort: string;
  unitItem: string;
  unitArt: string;
  unitMulti: string;
  unitSJ: string;
  unitPcs: string;
  unitKg: string;
  unitTon: string;
  unitOS: string;
  statusOpenShort: string;
  statusClosedShort: string;
  poQuota: string;
  overShort: string;
  readyToShipShort: string;
  activeItemsCount: string;
  estimatedLabel: string;
  multiSjLabel: string;
  notYetSentShort: string;
  statusSafe: string;
  statusFollowUp: string;
  statusCritical: string;
  readyFulfilled: string;
  readyPartial: string;
  readyNone: string;

  // Delivery Ratio Bar (Rasio Tonase)
  tonnageRatioLabel: string;
  deliveryChartTitle: string;
  fulfillmentRate: string;
  outstandingRate: string;

  // Data Table Controls & Filters
  poRecapTableTitle: string;
  detailSjTableTitle: string;
  searchPlaceholder: string;
  searchDetailSjPlaceholder: string;
  scrollFree: string;
  scrollBox: string;
  fullscreenBtn: string;
  exitBtn: string;
  columnsBtn: string;
  resetBtnShort: string;
  filterByStatus: string;
  filterByAging: string;
  filterByPrefix: string;
  clearFilters: string;
  filterAll: string;
  filterStatusLabel: string;
  filterPartial: string;
  filterPending: string;
  filterStockReady: string;
  filterOverStock: string;
  filterOverKirim: string;
  filterAgingLabel: string;
  agingSafeShort: string;
  agingFollowUpShort: string;
  agingCriticalShort: string;
  dayUnitShort: string;
  agingSafeWord: string;
  agingFollowUpWord: string;
  agingCriticalWord: string;

  // Data Table Headers
  colNo: string;
  colCO: string;
  colStatus: string;
  colArtikel: string;
  colDeskripsi: string;
  colPO: string;
  colTglPO: string;
  colQtyPO: string;
  colBeratPO: string;
  colStockPcs: string;
  colStockKg: string;
  colSisaOSPcs: string;
  colSisaOSKg: string;
  colTerkirim: string;
  colOverStockPcs: string;
  colOverKirimanPcs: string;
  colAging: string;
  thNoCO: string;
  thArtikel: string;
  thDeskripsi: string;
  thTglPO: string;
  thNoPO: string;
  thSubstance: string;
  thQtyPO: string;
  thBeratPO: string;
  thStockPcs: string;
  thStockKg: string;
  thSisaOS: string;
  thSisaOSKg: string;
  thTerkirim: string;
  thTerkirimKg: string;
  thOverStock: string;
  thOverStockKg: string;
  thOverKirim: string;
  thOverKirimKg: string;
  thHarga: string;

  // Pagination & Column Modal
  rowsPerPage: string;
  rowsLabel: string;
  allUnlimited: string;
  toTopBtn: string;
  showing: string;
  to: string;
  of: string;
  entries: string;
  noMatchingRecords: string;
  customColTitle: string;
  customColSubtitle: string;
  presetLabel: string;
  presetAll: string;
  presetEssential: string;
  presetLogistics: string;
  presetFinancial: string;
  visibleCountLabel: string;
  hiddenLabel: string;
  searchColPlaceholder: string;
  noColMatch: string;
  customColFooterNote: string;
  doneBtn: string;

  // Detail SJ Specific
  viewTableSJ: string;
  viewPerNoPO: string;
  viewGroupPO: string;
  viewMatrixSJ: string;
  subTotalToggle: string;
  flatFullToggle: string;
  accurateSumToggle: string;
  filterLabel: string;
  filterHasSJ: string;
  filterMultiSJ: string;
  filterNoSJYet: string;
  filterMultiItem: string;
  filterHasOS: string;
  filterLunas: string;
  thStage: string;
  thNoSJ: string;
  thTglSJ: string;
  thLeadTime: string;
  thQtySJ: string;
  thBeratSJ: string;
  thOsRunning: string;
  thOsRunningKg: string;
  thTotalSent: string;
  thSentPct: string;
  thDeliveryStatus: string;
  thAging: string;
  thStock: string;
  thSjDetails: string;
  thAccumulatedPcs: string;
  notSentYetBadge: string;
  lunasOsBadge: string;
  totalSentLabel: string;
  finalTotalLabel: string;
  subTotalPoLabel: string;
  consolidatedBannerText1: string;
  consolidatedBannerText2: string;
  availableInSheet2: string;
  clickResetHint: string;

  // WhatsApp Modal
  waModalTitle: string;
  waModalSubtitle: string;
  waFormatFile: string;
  waFormatFileDesc: string;
  waFormatText: string;
  waFormatTextDesc: string;
  waScopeAll: string;
  waScopeOpen: string;
  waScopeClosed: string;
  waScopeReady: string;
  waScopeOverStock: string;
  waSendButton: string;
  waCancelButton: string;
  waOnlyXlsxBadge: string;
  waCleanSendTitle: string;
  waCleanSendDesc: string;
  waSelectedOption: string;
  waDownloadXlsxBtn: string;
  waSendXlsxBtn: string;
  waSendTextBtn: string;
  waSharingMsg: string;

  // Parser Rules Modal
  rulesModalTitle: string;
  rulesModalSubtitle: string;
  closeBtn: string;

  // AI Chat Drawer
  aiTitle: string;
  aiSubtitle: string;
  aiInputPlaceholder: string;
  aiSendTooltip: string;
  aiClearChat: string;
  aiApiKeyBtn: string;
  aiWelcomeText: string;
  aiSuggestedPrompt1: string;
  aiSuggestedPrompt2: string;
  aiSuggestedPrompt3: string;
  aiSuggestedPrompt4: string;
  aiModelActive: string;
  aiTypingStatus: string;
  aiCloseTooltip: string;
}
