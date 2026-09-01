import React, { useState, useRef, useEffect } from 'react';
import { Download, Share2, Copy, RefreshCw, FileCode, Check, BookOpen, ChevronDown, Layers } from 'lucide-react';
import confetti from 'canvas-confetti';
import { haptic } from '../utils/haptics';
import { ExcelExportScope } from '../types';

interface ActionToolbarProps {
  onDownloadExcel: (scope?: ExcelExportScope) => void;
  onOpenWhatsApp: () => void;
  onCopyWhatsAppText: () => void;
  onReset: () => void;
  onToggleDoc: () => void;
  isCopied: boolean;
  sheets: string[];
  activeSheet: string;
  onSelectSheet: (sheet: string) => void;
  totalRecords: number;
  totalCOOpen?: number;
  totalCOClosed?: number;
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({
  onDownloadExcel,
  onOpenWhatsApp,
  onCopyWhatsAppText,
  onReset,
  onToggleDoc,
  isCopied,
  sheets,
  activeSheet,
  onSelectSheet,
  totalRecords,
  totalCOOpen = 0,
  totalCOClosed = 0,
}) => {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const triggerExport = (scope: ExcelExportScope = 'ALL') => {
    setIsExportMenuOpen(false);
    haptic.success();
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#141414', '#FF6B35', '#25D366', '#DEDEDE'],
    });
    onDownloadExcel(scope);
  };

  const handleWhatsAppClick = () => {
    haptic.medium();
    onOpenWhatsApp();
  };

  const handleCopyClick = () => {
    haptic.selection();
    onCopyWhatsAppText();
  };

  const handleToggleDocClick = () => {
    haptic.medium();
    onToggleDoc();
  };

  const handleResetClick = () => {
    haptic.heavy();
    onReset();
  };

  const handleSheetChange = (val: string) => {
    haptic.selection();
    onSelectSheet(val);
  };

  return (
    <div id="action-toolbar" className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-4 p-3.5 sm:p-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
      {/* Left: Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        {/* Split Button Excel Export with Scope Options */}
        <div className="relative inline-flex flex-1 sm:flex-initial" ref={exportDropdownRef}>
          <button
            type="button"
            id="btn-download-excel"
            onClick={() => triggerExport('ALL')}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-[#141414] hover:bg-black text-white font-bold text-xs uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[40px]"
            title="Download seluruh data ke Excel (14 Kolom)"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Download Excel</span>
          </button>

          <button
            type="button"
            id="btn-toggle-export-menu"
            onClick={() => {
              haptic.selection();
              setIsExportMenuOpen(!isExportMenuOpen);
            }}
            className="inline-flex items-center justify-center px-2.5 py-2.5 bg-[#2A2A2A] hover:bg-[#141414] text-white font-bold text-xs border-y-2 border-r-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[40px]"
            title="Pilih opsi export Excel (All / Open Only / Closed Only)"
          >
            <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${isExportMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isExportMenuOpen && (
            <div className="absolute left-0 top-full mt-2 w-72 max-w-[90vw] bg-white border-2 border-[#141414] shadow-[4px_4px_0px_#141414] z-50 py-1.5 font-sans animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-3 py-1.5 border-b border-[#141414]/15 text-[10px] font-black uppercase tracking-wider text-[#141414]/60 font-mono">
                Pilih Opsi Export Excel
              </div>

              {/* 1. All */}
              <button
                type="button"
                id="btn-export-all"
                onClick={() => triggerExport('ALL')}
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-[#141414] hover:bg-[#F0F0EE] flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-[#141414]" />
                  <span>Export Seluruh CO</span>
                </div>
                <span className="px-1.5 py-0.5 bg-[#DEDEDE] text-[#141414] text-[10px] font-mono font-bold">
                  {totalRecords} PO
                </span>
              </button>

              {/* 2. Open Only */}
              <button
                type="button"
                id="btn-export-open"
                onClick={() => triggerExport('OPEN_ONLY')}
                disabled={totalCOOpen === 0}
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-[#2E7D32] hover:bg-emerald-50 flex items-center justify-between transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#2E7D32]" />
                  <span>Export Khusus CO Open (O)</span>
                </div>
                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-500 text-[10px] font-mono font-bold">
                  {totalCOOpen} PO
                </span>
              </button>

              {/* 3. Closed Only */}
              <button
                type="button"
                id="btn-export-closed"
                onClick={() => triggerExport('CLOSED_ONLY')}
                disabled={totalCOClosed === 0}
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-[#555] hover:bg-zinc-100 flex items-center justify-between transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#555]" />
                  <span>Export Khusus CO Closed (C)</span>
                </div>
                <span className="px-1.5 py-0.5 bg-zinc-200 text-zinc-800 border border-zinc-400 text-[10px] font-mono font-bold">
                  {totalCOClosed} PO
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Primary WhatsApp Share */}
        <button
          type="button"
          id="btn-share-whatsapp"
          onClick={handleWhatsAppClick}
          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[40px]"
        >
          <Share2 className="w-4 h-4 text-white shrink-0" />
          <span className="truncate">Share to WhatsApp</span>
        </button>

        {/* Copy Text Shortcut */}
        <button
          type="button"
          id="btn-copy-wa-text"
          onClick={handleCopyClick}
          className="inline-flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 bg-[#DEDEDE] hover:bg-[#cecece] text-[#141414] border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[40px]"
          title="Salin teks template WhatsApp ke clipboard"
        >
          {isCopied ? (
            <>
              <Check className="w-4 h-4 text-green-700 shrink-0" />
              <span className="text-green-800">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-[#141414] shrink-0" />
              <span className="hidden sm:inline">Copy WA Text</span>
              <span className="sm:hidden">Copy WA</span>
            </>
          )}
        </button>
      </div>

      {/* Right: Auxiliary Controls */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        {/* Multi-sheet selector if file contains multiple sheets */}
        {sheets && sheets.length > 1 && (
          <div className="flex items-center gap-2 bg-[#F0F0EE] border-2 border-[#141414] px-2.5 sm:px-3 py-1.5 text-xs font-mono min-h-[40px]">
            <span className="text-[#141414]/70 font-bold uppercase text-[10px] sm:text-xs">Sheet:</span>
            <select
              id="sheet-selector"
              value={activeSheet}
              onChange={(e) => handleSheetChange(e.target.value)}
              className="bg-transparent text-[#141414] font-bold focus:outline-none cursor-pointer text-xs"
            >
              {sheets.map((sheet) => (
                <option key={sheet} value={sheet} className="bg-white text-[#141414]">
                  {sheet}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* View Parser Engine Logic Rules */}
        <button
          type="button"
          id="btn-view-rules"
          onClick={handleToggleDocClick}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F0F0EE] text-[#141414] border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 min-h-[40px]"
        >
          <BookOpen className="w-3.5 h-3.5 text-[#FF6B35] shrink-0" />
          <span>Rules</span>
        </button>

        {/* Reset / Upload New */}
        <button
          type="button"
          id="btn-reset-file"
          onClick={handleResetClick}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#DEDEDE] hover:bg-[#c9c9c9] text-[#141414] border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 min-h-[40px]"
          title="Upload file ERP lain"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Change File</span>
          <span className="sm:hidden">Reset</span>
        </button>
      </div>
    </div>
  );
};

