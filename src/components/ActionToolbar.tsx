import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Share2,
  Copy,
  Check,
  ChevronDown,
  FileSpreadsheet,
} from 'lucide-react';
import { ExcelExportScope, WhatsAppReportScope } from '../types';
import { haptic } from '../utils/haptics';
import confetti from 'canvas-confetti';
import { useLanguage } from '../i18n/LanguageContext';

interface ActionToolbarProps {
  onDownloadExcel: (scope?: ExcelExportScope) => void;
  onShareExcelWhatsApp: (scope?: ExcelExportScope) => void;
  onOpenWhatsApp: (
    scope?: WhatsAppReportScope,
    mode?: 'EXCEL_FILE' | 'TEXT_SUMMARY'
  ) => void;
  onCopyWhatsAppText: (scope?: WhatsAppReportScope) => void;
  onReset: () => void;
  onToggleDoc: () => void;
  onOpenAIChat?: () => void;
  isCopied: boolean;
  sheets?: string[];
  activeSheet?: string;
  onSelectSheet?: (sheet: string) => void;
  totalRecords?: number;
  totalCOOpen?: number;
  totalCOClosed?: number;
  totalStockReadyAll?: number;
  totalStockReadyOpen?: number;
  totalOverStockGudangPOs?: number;
  totalOverKirimanPOs?: number;
  totalOverProduksiPOs?: number;
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({
  onDownloadExcel,
  onShareExcelWhatsApp,
  onOpenWhatsApp,
  onCopyWhatsAppText,
  isCopied,
  sheets,
  activeSheet,
  onSelectSheet,
  totalRecords = 0,
  totalCOOpen = 0,
  totalCOClosed = 0,
  totalStockReadyAll = 0,
  totalOverStockGudangPOs = 0,
  totalOverKirimanPOs = 0,
  totalOverProduksiPOs = 0,
}) => {
  const { t } = useLanguage();
  const effectiveOverStockPOs = totalOverStockGudangPOs || totalOverProduksiPOs;
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);

  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const copyDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(event.target as Node)
      ) {
        setIsExportMenuOpen(false);
      }
      if (
        copyDropdownRef.current &&
        !copyDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCopyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const triggerExport = (scope: ExcelExportScope = 'ALL') => {
    setIsExportMenuOpen(false);
    haptic.success();
    confetti({
      particleCount: 45,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#FF7B35', '#10B981', '#1E2024'],
    });
    onDownloadExcel(scope);
  };

  const triggerShareExcel = (scope: ExcelExportScope = 'ALL') => {
    setIsExportMenuOpen(false);
    haptic.medium();
    onShareExcelWhatsApp(scope);
  };

  const handleWhatsAppClick = () => {
    haptic.medium();
    onOpenWhatsApp('ALL');
  };

  const handleQuickCopy = (scope: WhatsAppReportScope = 'ALL') => {
    setIsCopyMenuOpen(false);
    haptic.selection();
    onCopyWhatsAppText(scope);
  };

  const handleSheetChange = (val: string) => {
    if (onSelectSheet) {
      haptic.selection();
      onSelectSheet(val);
    }
  };

  return (
    <div
      id="action-toolbar"
      className={`relative flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-2.5 sm:px-4 sm:py-3 bg-white border border-slate-200 rounded-xl ${
        isExportMenuOpen || isCopyMenuOpen ? 'z-40' : 'z-20'
      }`}
    >
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
        {/* Split Button Export Excel */}
        <div
          className={`relative inline-flex w-full sm:w-auto ${isExportMenuOpen ? 'z-50' : ''}`}
          ref={exportDropdownRef}
        >
          <div className="inline-flex items-stretch rounded-lg bg-slate-900 text-white overflow-hidden w-full sm:w-auto justify-between">
            <button
              type="button"
              id="btn-download-excel"
              onClick={() => triggerExport('ALL')}
              className="flex-1 sm:flex-initial px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>{t.exportExcelBtn}</span>
            </button>
            <div className="w-px self-stretch bg-white/20 my-1.5" />
            <button
              type="button"
              id="btn-toggle-export-menu"
              onClick={() => {
                haptic.selection();
                setIsExportMenuOpen(!isExportMenuOpen);
              }}
              className="px-2 py-2 inline-flex items-center justify-center cursor-pointer hover:bg-slate-800 transition-colors"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isExportMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {isExportMenuOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-72 max-w-[90vw] bg-white rounded-xl z-50 p-1.5 shadow-lg border border-slate-200">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-100">
                {t.exportScopeHeader}
              </div>
              <div className="py-1 space-y-0.5 text-xs">
                <button
                  type="button"
                  id="btn-export-all"
                  onClick={() => triggerExport('ALL')}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between cursor-pointer"
                >
                  <span>{t.scopeAllData}</span>
                  <span className="font-mono text-[11px] text-slate-500">{totalRecords}</span>
                </button>
                <button
                  type="button"
                  id="btn-export-open-only"
                  onClick={() => triggerExport('OPEN_ONLY')}
                  disabled={totalCOOpen === 0}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                >
                  <span>{t.scopeCoOpen}</span>
                  <span className="font-mono text-[11px] text-emerald-700">{totalCOOpen}</span>
                </button>
                <button
                  type="button"
                  id="btn-export-closed-only"
                  onClick={() => triggerExport('CLOSED_ONLY')}
                  disabled={totalCOClosed === 0}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                >
                  <span>{t.scopeCoClosed}</span>
                  <span className="font-mono text-[11px] text-slate-500">{totalCOClosed}</span>
                </button>
                <button
                  type="button"
                  id="btn-export-stock-ready-all"
                  onClick={() => triggerExport('STOCK_READY_ALL')}
                  disabled={totalStockReadyAll === 0}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                >
                  <span>{t.scopeStockReady}</span>
                  <span className="font-mono text-[11px] text-slate-600">{totalStockReadyAll}</span>
                </button>
                <button
                  type="button"
                  id="btn-export-over-stock-gudang"
                  onClick={() => triggerExport('OVER_STOCK_GUDANG')}
                  disabled={effectiveOverStockPOs === 0}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                >
                  <span>{t.scopeOverStock}</span>
                  <span className="font-mono text-[11px] text-slate-600">
                    {effectiveOverStockPOs}
                  </span>
                </button>
                <button
                  type="button"
                  id="btn-export-over-kiriman"
                  onClick={() => triggerExport('OVER_KIRIMAN')}
                  disabled={totalOverKirimanPOs === 0}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                >
                  <span>{t.scopeOverDelivery}</span>
                  <span className="font-mono text-[11px] text-slate-600">
                    {totalOverKirimanPOs}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Share Excel to WA */}
        <button
          type="button"
          id="btn-toolbar-share-excel-wa"
          onClick={() => triggerShareExcel('ALL')}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer transition-colors whitespace-nowrap w-full sm:w-auto"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{t.sendWaFileBtn}</span>
        </button>

        {/* Generator Laporan WA */}
        <button
          type="button"
          id="btn-share-whatsapp"
          onClick={handleWhatsAppClick}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors whitespace-nowrap w-full sm:w-auto"
        >
          <Share2 className="w-3.5 h-3.5 shrink-0" />
          <span>{t.waReportBtn}</span>
        </button>

        {/* Split Button Copy WA Text */}
        <div
          className={`relative inline-flex w-full sm:w-auto ${isCopyMenuOpen ? 'z-50' : ''}`}
          ref={copyDropdownRef}
        >
          <div className="inline-flex items-stretch rounded-lg border border-slate-200 bg-white text-slate-800 overflow-hidden w-full sm:w-auto justify-between">
            <button
              type="button"
              id="btn-copy-wa-text"
              onClick={() =>
                handleQuickCopy(totalStockReadyAll > 0 ? 'STOCK_READY_ALL' : 'ALL')
              }
              className="flex-1 sm:flex-initial px-3 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700">{t.copiedSuccess}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{t.copyTextBtn}</span>
                </>
              )}
            </button>
            <div className="w-px self-stretch bg-slate-200 my-1.5" />
            <button
              type="button"
              id="btn-toggle-copy-menu"
              onClick={() => {
                haptic.selection();
                setIsCopyMenuOpen(!isCopyMenuOpen);
              }}
              className="px-2 py-2 inline-flex items-center justify-center cursor-pointer text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isCopyMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {isCopyMenuOpen && (
            <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 w-64 max-w-[90vw] bg-white rounded-xl z-50 p-1.5 shadow-lg border border-slate-200 text-xs">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-100">
                {t.copyFormatHeader}
              </div>
              <div className="py-1 space-y-0.5">
                <button
                  type="button"
                  id="dropdown-copy-stock-ready-all"
                  onClick={() => handleQuickCopy('STOCK_READY_ALL')}
                  disabled={totalStockReadyAll === 0}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                >
                  <span>{t.scopeStockReady}</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {totalStockReadyAll}
                  </span>
                </button>
                <button
                  type="button"
                  id="dropdown-copy-sisa-os-open"
                  onClick={() => handleQuickCopy('OPEN_ONLY')}
                  disabled={totalCOOpen === 0}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                >
                  <span>{t.scopeSisaOsOpen}</span>
                  <span className="font-mono text-[11px] text-emerald-700">{totalCOOpen}</span>
                </button>
                <button
                  type="button"
                  id="dropdown-copy-sisa-os-all"
                  onClick={() => handleQuickCopy('ALL')}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between cursor-pointer"
                >
                  <span>{t.scopeAllCo}</span>
                  <span className="font-mono text-[11px] text-slate-500">{totalRecords}</span>
                </button>
                <button
                  type="button"
                  id="dropdown-copy-over-stock-gudang"
                  onClick={() => handleQuickCopy('OVER_STOCK_GUDANG')}
                  disabled={effectiveOverStockPOs === 0}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                >
                  <span>{t.scopeOverStock}</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {effectiveOverStockPOs}
                  </span>
                </button>
                <button
                  type="button"
                  id="dropdown-copy-over-kiriman"
                  onClick={() => handleQuickCopy('OVER_KIRIMAN')}
                  disabled={totalOverKirimanPOs === 0}
                  className="w-full text-left px-2.5 py-1.5 font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                >
                  <span>{t.scopeOverDelivery}</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {totalOverKirimanPOs}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Sheet Selector */}
      {sheets && sheets.length > 1 && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono">
          <span className="text-slate-500 font-medium">{t.sheetLabel}</span>
          <select
            id="sheet-selector"
            value={activeSheet}
            onChange={(e) => handleSheetChange(e.target.value)}
            className="bg-transparent text-slate-900 font-semibold focus:outline-none cursor-pointer text-xs"
          >
            {sheets.map((sheet) => (
              <option key={sheet} value={sheet} className="bg-white text-slate-900">
                {sheet}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
