import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Share2,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  Sparkles,
  Bot,
  Zap,
  FileSpreadsheet,
} from 'lucide-react';
import { ExcelExportScope, WhatsAppReportScope } from '../types';
import { haptic } from '../utils/haptics';
import confetti from 'canvas-confetti';

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
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({
  onDownloadExcel,
  onShareExcelWhatsApp,
  onOpenWhatsApp,
  onCopyWhatsAppText,
  onReset,
  onOpenAIChat,
  isCopied,
  sheets,
  activeSheet,
  onSelectSheet,
  totalRecords = 0,
  totalCOOpen = 0,
  totalCOClosed = 0,
  totalStockReadyAll = 0,
  totalStockReadyOpen = 0,
}) => {
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

  const handleResetClick = () => {
    haptic.heavy();
    onReset();
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
      className={`relative flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-3.5 glass-panel rounded-3xl transition-all ${
        isExportMenuOpen || isCopyMenuOpen ? 'z-40' : 'z-20'
      }`}
    >
      {/* Left: Action Buttons (Liquid Glass Styled) */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        {/* Split Button Excel Export with Scope Options */}
        <div
          className={`relative inline-flex flex-1 sm:flex-initial ${
            isExportMenuOpen ? 'z-50' : ''
          }`}
          ref={exportDropdownRef}
        >
          {/* Seamless Unified Glass Pill (No colliding seams) */}
          <div className="inline-flex items-stretch rounded-full border border-white/45 bg-gradient-to-b from-[#1F83B4]/90 to-[#19719C]/95 backdrop-blur-xl shadow-[0_6px_20px_-3px_rgba(25,113,156,0.30)] text-white overflow-hidden transition-all duration-200 hover:shadow-[0_8px_24px_-2px_rgba(25,113,156,0.40)] hover:-translate-y-0.5 active:translate-y-0">
            <button
              type="button"
              id="btn-download-excel"
              onClick={() => triggerExport('ALL')}
              className="px-4 sm:px-5 py-2.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer hover:bg-white/15 active:bg-white/20 transition-colors"
              title="Download seluruh data ke Excel (15 Kolom)"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Unduh Excel</span>
            </button>

            <div className="w-px self-stretch bg-white/25 my-1.5" />

            <button
              type="button"
              id="btn-toggle-export-menu"
              onClick={() => {
                haptic.selection();
                setIsExportMenuOpen(!isExportMenuOpen);
              }}
              className="px-2.5 py-2.5 inline-flex items-center justify-center cursor-pointer hover:bg-white/15 active:bg-white/20 transition-colors"
              title="Pilih opsi export Excel"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isExportMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {/* Dropdown Menu Excel */}
          {isExportMenuOpen && (
            <div className="absolute left-0 top-full mt-2.5 w-80 max-w-[90vw] bg-white/90 backdrop-blur-2xl rounded-2xl z-50 p-2 font-sans animate-fade-in shadow-[0_20px_50px_-10px_rgba(0,0,19,0.12)] border border-white/90">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#5C5C68] font-mono border-b border-zinc-200/60">
                Pilih Cakupan Unduhan Excel (15 Kolom)
              </div>

              <div className="py-1 space-y-0.5">
                <button
                  type="button"
                  id="btn-export-all"
                  onClick={() => triggerExport('ALL')}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-[#000013] hover:bg-[#19719C]/10 hover:text-[#19719C] rounded-xl flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-[#19719C]" />
                    <span>Semua Data (Full)</span>
                  </div>
                  <span className="px-2 py-0.5 bg-zinc-200/60 text-[#000013] text-[10px] font-mono font-bold rounded-full">
                    {totalRecords} PO
                  </span>
                </button>

                <button
                  type="button"
                  id="btn-export-open-only"
                  onClick={() => triggerExport('OPEN_ONLY')}
                  disabled={totalCOOpen === 0}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-500/10 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Khusus CO Open Saja</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-800 text-[10px] font-mono font-bold rounded-full">
                    {totalCOOpen} PO
                  </span>
                </button>

                <button
                  type="button"
                  id="btn-export-closed-only"
                  onClick={() => triggerExport('CLOSED_ONLY')}
                  disabled={totalCOClosed === 0}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-[#5C5C68] hover:bg-zinc-200/50 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-zinc-400" />
                    <span>Khusus CO Closed Saja</span>
                  </div>
                  <span className="px-2 py-0.5 bg-zinc-200/60 text-[#5C5C68] text-[10px] font-mono font-bold rounded-full">
                    {totalCOClosed} PO
                  </span>
                </button>

                {/* Stock Ready Options */}
                <button
                  type="button"
                  id="btn-export-stock-ready-all"
                  onClick={() => triggerExport('STOCK_READY_ALL')}
                  disabled={totalStockReadyAll === 0}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-[#19719C] hover:bg-[#19719C]/10 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Stock Ready (Semua CO)</span>
                  </div>
                  <span className="px-2 py-0.5 bg-[#83B3CA]/20 text-[#19719C] text-[10px] font-mono font-bold rounded-full">
                    {totalStockReadyAll} PO
                  </span>
                </button>
              </div>

              {/* Direct Excel Share to WhatsApp Section */}
              <div className="border-t border-zinc-200/60 pt-1.5 mt-1">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800 font-mono flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                  <span>Kirim File Langsung ke WA</span>
                </div>

                <button
                  type="button"
                  id="btn-share-excel-all-dropdown"
                  onClick={() => triggerShareExcel('ALL')}
                  className="w-full text-left px-3 py-1.5 text-xs font-semibold text-[#000013] hover:bg-emerald-500/10 rounded-xl flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Share2 className="w-3 h-3 text-emerald-600" />
                    <span>Kirim File Excel (Semua CO)</span>
                  </div>
                  <span className="px-2 py-0.2 bg-zinc-100 text-zinc-700 text-[10px] font-mono font-bold rounded-full">
                    {totalRecords} PO
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Action: Direct Share Excel File to WhatsApp (Frosted Emerald Glass) */}
        <button
          type="button"
          id="btn-toolbar-share-excel-wa"
          onClick={() => triggerShareExcel('ALL')}
          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider rounded-full border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/18 text-emerald-800 backdrop-blur-xl shadow-[0_3px_12px_-2px_rgba(16,185,129,0.10)] hover:shadow-[0_5px_16px_-2px_rgba(16,185,129,0.18)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer transition-all duration-200"
          title="Kirim file Excel (.xlsx) langsung via WhatsApp"
        >
          <div className="w-4 h-4 rounded-full bg-emerald-600/15 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-3 h-3 text-emerald-700" />
          </div>
          <span className="truncate">Kirim File ke WA</span>
        </button>

        {/* Primary WhatsApp Share: Opens full modal generator (Luminous Emerald Liquid Glass) */}
        <button
          type="button"
          id="btn-share-whatsapp"
          onClick={handleWhatsAppClick}
          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider rounded-full border border-white/35 bg-gradient-to-b from-emerald-600/90 to-emerald-700/95 text-white backdrop-blur-xl shadow-[0_6px_20px_-3px_rgba(5,150,105,0.28)] hover:shadow-[0_8px_24px_-2px_rgba(5,150,105,0.38)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer transition-all duration-200"
          title="Buka generator template laporan WhatsApp lengkap"
        >
          <Share2 className="w-4 h-4 text-white shrink-0" />
          <span className="truncate">Laporan WhatsApp</span>
        </button>

        {/* Split Button Copy WA Text with Quick Scope Options (Frosted Pearl Liquid Glass) */}
        <div
          className={`relative inline-flex flex-1 sm:flex-initial ${
            isCopyMenuOpen ? 'z-50' : ''
          }`}
          ref={copyDropdownRef}
        >
          {/* Seamless Unified Glass Pill (No colliding seams) */}
          <div
            className={`inline-flex items-stretch rounded-full border ${
              isCopied
                ? 'border-emerald-500/35 bg-emerald-50/80 text-emerald-800 shadow-[0_3px_12px_-2px_rgba(16,185,129,0.15)]'
                : 'border-white/90 bg-white/70 hover:bg-white/85 text-[#000013] shadow-[0_3px_12px_-2px_rgba(0,0,19,0.04)]'
            } backdrop-blur-xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0`}
          >
            <button
              type="button"
              id="btn-copy-wa-text"
              onClick={() =>
                handleQuickCopy(totalStockReadyAll > 0 ? 'STOCK_READY_ALL' : 'ALL')
              }
              className="px-3.5 sm:px-4 py-2.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer hover:bg-black/[0.03] active:bg-black/[0.06] transition-colors"
              title="Salin teks template WhatsApp clean ke clipboard"
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 font-bold">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#5C5C68] shrink-0" />
                  <span>Salin WA</span>
                </>
              )}
            </button>

            <div
              className={`w-px self-stretch my-1.5 ${
                isCopied ? 'bg-emerald-500/25' : 'bg-zinc-200/80'
              }`}
            />

            <button
              type="button"
              id="btn-toggle-copy-menu"
              onClick={() => {
                haptic.selection();
                setIsCopyMenuOpen(!isCopyMenuOpen);
              }}
              className="px-2.5 py-2.5 inline-flex items-center justify-center cursor-pointer text-[#5C5C68] hover:text-[#000013] hover:bg-black/[0.03] active:bg-black/[0.06] transition-colors"
              title="Pilih opsi format Copy WhatsApp"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isCopyMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {/* Dropdown Menu Copy WA */}
          {isCopyMenuOpen && (
            <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2.5 w-80 max-w-[90vw] bg-white/90 backdrop-blur-2xl rounded-2xl z-50 p-2 font-sans animate-fade-in shadow-[0_20px_50px_-10px_rgba(0,0,19,0.12)] border border-white/90">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#5C5C68] font-mono border-b border-zinc-200/60">
                Pilih Format Salin Teks WA
              </div>

              <div className="py-1 space-y-0.5">
                <button
                  type="button"
                  id="dropdown-copy-stock-ready-all"
                  onClick={() => handleQuickCopy('STOCK_READY_ALL')}
                  disabled={totalStockReadyAll === 0}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-[#19719C] hover:bg-[#19719C]/10 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <div>
                      <span className="block">Stock Ready (Semua)</span>
                      <span className="text-[10px] font-mono text-[#5C5C68]">
                        Format ringkas stok siap kirim
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-[#83B3CA]/20 text-[#19719C] text-[10px] font-mono font-bold rounded-full shrink-0">
                    {totalStockReadyAll}
                  </span>
                </button>

                <button
                  type="button"
                  id="dropdown-copy-sisa-os-open"
                  onClick={() => handleQuickCopy('OPEN_ONLY')}
                  disabled={totalCOOpen === 0}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-500/10 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Sisa OS (Khusus CO Open)</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-800 text-[10px] font-mono font-bold rounded-full shrink-0">
                    {totalCOOpen}
                  </span>
                </button>

                <button
                  type="button"
                  id="dropdown-copy-sisa-os-all"
                  onClick={() => handleQuickCopy('ALL')}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-[#000013] hover:bg-zinc-200/50 rounded-xl flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Copy className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Semua CO (Lengkap)</span>
                  </div>
                  <span className="px-2 py-0.5 bg-zinc-200/60 text-[#000013] text-[10px] font-mono font-bold rounded-full shrink-0">
                    {totalRecords}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Auxiliary Controls (Glassmorphism Styled) */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        {/* Multi-sheet selector if file contains multiple sheets */}
        {sheets && sheets.length > 1 && (
          <div className="flex items-center gap-2 bg-white/70 backdrop-blur-xl border border-white/80 rounded-full px-3.5 py-1.5 text-xs font-mono shadow-2xs">
            <span className="text-[#5C5C68] font-bold uppercase text-[10px]">Sheet:</span>
            <select
              id="sheet-selector"
              value={activeSheet}
              onChange={(e) => handleSheetChange(e.target.value)}
              className="bg-transparent text-[#000013] font-semibold focus:outline-none cursor-pointer text-xs"
            >
              {sheets.map((sheet) => (
                <option key={sheet} value={sheet} className="bg-white text-[#000013]">
                  {sheet}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* AI Chatbot Assistant Button */}
        {onOpenAIChat && (
          <button
            type="button"
            id="btn-toolbar-ai-chat"
            onClick={() => {
              haptic.medium();
              onOpenAIChat();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider rounded-full border border-white/20 bg-zinc-900/85 hover:bg-zinc-900 text-white backdrop-blur-xl shadow-[0_4px_14px_-2px_rgba(0,0,19,0.20)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer"
            title="Tanya AI Chatbot tentang data ini"
          >
            <Bot className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">AI Chat</span>
            <Sparkles className="w-3 h-3 text-amber-400" />
          </button>
        )}

        {/* Reset / Change File */}
        <button
          type="button"
          id="btn-reset-file"
          onClick={handleResetClick}
          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider rounded-full border border-white/80 bg-white/60 hover:bg-white/85 text-[#5C5C68] hover:text-[#000013] backdrop-blur-xl shadow-[0_3px_12px_-2px_rgba(0,0,19,0.03)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer"
          title="Upload file ERP lain"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Ganti File</span>
          <span className="sm:hidden">Reset</span>
        </button>
      </div>
    </div>
  );
};
