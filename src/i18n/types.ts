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
  // Header
  appTitle: string;
  appSubtitle: string;
  browserBadge: string;
  languageSelect: string;

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

  // File Switcher Bar
  activeDocument: string;
  allFilesConverted: string;
  downloadZipBtn: string;
  mergeMasterBtn: string;
  removeFile: string;

  // Action Toolbar
  exportExcelBtn: string;
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

  // Stats Overview
  totalPoCard: string;
  sisaOSCard: string;
  stockGudangCard: string;
  terkirimCard: string;
  overStockCard: string;
  overKirimanCard: string;
  valuasiOSCard: string;
  unitPo: string;
  unitPcs: string;
  unitKg: string;
  unitTon: string;
  statusSafe: string;
  statusFollowUp: string;
  statusCritical: string;
  readyFulfilled: string;
  readyPartial: string;
  readyNone: string;

  // Data Table
  searchPlaceholder: string;
  filterByStatus: string;
  filterByAging: string;
  filterByPrefix: string;
  clearFilters: string;
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
  rowsPerPage: string;
  showing: string;
  to: string;
  of: string;
  entries: string;
  noMatchingRecords: string;

  // Delivery Pie Chart
  deliveryChartTitle: string;
  fulfillmentRate: string;
  outstandingRate: string;

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
