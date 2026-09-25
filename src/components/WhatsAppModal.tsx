import React, { useState, useMemo } from 'react';
import { ExtractedRecord, WhatsAppReportScope, ExcelExportScope } from '../types';
import { generateWhatsAppSummary, shareToWhatsApp, copyToClipboard, shareExcelFileToWhatsApp } from '../utils/whatsappHelper';
import { recalculateFIFOStock } from '../utils/parserEngine';
import { exportToExcel, getExportFileName } from '../utils/excelExporter';
import { haptic } from '../utils/haptics';
import {
  X,
  Send,
  Copy,
  Check,
  MessageSquare,
  Zap,
  Layers,
  FileSpreadsheet,
  Download,
  Loader2,
  FileCheck2,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ExtractedRecord[];
  currentFileName?: string | null;
  initialScope?: WhatsAppReportScope;
  initialMode?: 'EXCEL_FILE' | 'TEXT_SUMMARY';
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  onClose,
  data,
  currentFileName,
  initialScope = 'ALL',
  initialMode = 'EXCEL_FILE',
}) => {
  const [activeScope, setActiveScope] = useState<WhatsAppReportScope>(initialScope);
  const [activeMode, setActiveMode] = useState<'EXCEL_FILE' | 'TEXT_SUMMARY'>(initialMode);
  const [isCopied, setIsCopied] = useState(false);
  const [isSharingExcel, setIsSharingExcel] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  // Calculate scoped datasets for item counts & preview
  const allScoped = useMemo(() => recalculateFIFOStock(data, 'ALL'), [data]);
  const openScoped = useMemo(() => recalculateFIFOStock(data, 'OPEN'), [data]);
  const closedScoped = useMemo(() => recalculateFIFOStock(data, 'CLOSED'), [data]);

  const countAll = allScoped.length;
  const countOpen = useMemo(() => openScoped.filter((d) => d.coStatus === 'OPEN').length, [openScoped]);
  const countClosed = useMemo(() => closedScoped.filter((d) => d.coStatus === 'CLOSED').length, [closedScoped]);
  const countStockReadyAll = useMemo(
    () => allScoped.filter((d) => (d['Stock (pcs)'] || 0) > 0).length,
    [allScoped]
  );
  const countStockReadyOpen = useMemo(
    () => openScoped.filter((d) => d.coStatus === 'OPEN' && (d['Stock (pcs)'] || 0) > 0).length,
    [openScoped]
  );
  const countOverProduksi = useMemo(
    () =>
      allScoped.filter(
        (d) => (d['Over Produksi (PCS)'] || 0) > 0 || (d['Over Produksi (KG)'] || 0) > 0
      ).length,
    [allScoped]
  );

  const scopeFileName = useMemo(() => {
    return getExportFileName(currentFileName, activeScope as ExcelExportScope);
  }, [currentFileName, activeScope]);

  const activeCount = useMemo(() => {
    switch (activeScope) {
      case 'OPEN_ONLY':
        return countOpen;
      case 'CLOSED_ONLY':
        return countClosed;
      case 'STOCK_READY_ALL':
        return countStockReadyAll;
      case 'STOCK_READY_OPEN':
        return countStockReadyOpen;
      case 'OVER_PRODUCTION_ONLY':
        return countOverProduksi;
      default:
        return countAll;
    }
  }, [activeScope, countAll, countOpen, countClosed, countStockReadyAll, countStockReadyOpen, countOverProduksi]);

  const summaryText = useMemo(() => generateWhatsAppSummary(data, activeScope), [data, activeScope]);

  if (!isOpen) return null;

  const handleScopeChange = (scope: WhatsAppReportScope) => {
    haptic.selection();
    setActiveScope(scope);
    setShareNotice(null);
  };

  const handleModeChange = (mode: 'EXCEL_FILE' | 'TEXT_SUMMARY') => {
    haptic.selection();
    setActiveMode(mode);
    setShareNotice(null);
  };

  const handleCopy = async () => {
    haptic.selection();
    const success = await copyToClipboard(summaryText);
    if (success) {
      haptic.success();
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleSendText = () => {
    haptic.success();
    confetti({
      particleCount: 40,
      spread: 50,
      origin: { y: 0.7 },
      colors: ['#22c55e', '#16a34a', '#4ade80'],
    });
    shareToWhatsApp(data, activeScope);
  };

  const handleDownloadExcelOnly = () => {
    haptic.success();
    exportToExcel(data, scopeFileName, activeScope as ExcelExportScope);
    setShareNotice(`File "${scopeFileName}" berhasil diunduh ke perangkat Anda.`);
  };

  const handleShareExcelFile = async () => {
    haptic.medium();
    setIsSharingExcel(true);
    setShareNotice(null);
    try {
      // Passes ONLY the .xlsx file without text / caption
      const result = await shareExcelFileToWhatsApp(data, activeScope as ExcelExportScope, scopeFileName);
      if (result.success) {
        haptic.success();
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#128C7E', '#25D366', '#FF6B35', '#141414'],
        });
        setShareNotice(result.message);
      } else if (result.method !== 'cancelled') {
        setShareNotice(result.message);
      }
    } catch (err: any) {
      console.error('Error sharing Excel file:', err);
      setShareNotice(err?.message || 'Gagal membagikan file Excel.');
    } finally {
      setIsSharingExcel(false);
    }
  };

  const handleClose = () => {
    haptic.light();
    setShareNotice(null);
    onClose();
  };

  return (
    <div
      id="whatsapp-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-md animate-fade-in"
      onClick={handleClose}
    >
      <div
        id="whatsapp-modal-dialog"
        className="w-full max-w-2xl glass-panel rounded-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200/60 flex items-center justify-between bg-white/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shadow-xs shrink-0 text-emerald-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold tracking-tight text-[#1E2024]">
                Kirim Laporan ke WhatsApp
              </h3>
              <p className="text-[11px] sm:text-xs text-[#5C6068]">
                Pilih format pengiriman: File Excel .xlsx atau Ringkasan Teks
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="liquid-glass-clear p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Primary Format Mode Switcher Tabs */}
        <div className="p-2 sm:px-4 bg-white/30 border-b border-zinc-200/60">
          <div className="grid grid-cols-2 p-1 bg-zinc-200/50 rounded-2xl text-xs font-semibold">
            <button
              type="button"
              id="wa-modal-mode-excel"
              onClick={() => handleModeChange('EXCEL_FILE')}
              className={`py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeMode === 'EXCEL_FILE'
                  ? 'bg-white text-emerald-800 font-bold shadow-xs'
                  : 'text-[#5C6068] hover:text-[#1E2024]'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="truncate">File Excel (.xlsx)</span>
              <span className="hidden sm:inline text-[10px] uppercase px-1.5 py-0.2 bg-emerald-100/80 text-emerald-800 rounded-full font-mono font-bold">
                Hanya File
              </span>
            </button>

            <button
              type="button"
              id="wa-modal-mode-text"
              onClick={() => handleModeChange('TEXT_SUMMARY')}
              className={`py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeMode === 'TEXT_SUMMARY'
                  ? 'bg-white text-[#1E2024] font-bold shadow-xs'
                  : 'text-[#5C6068] hover:text-[#1E2024]'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-emerald-500" />
              <span className="truncate">Ringkasan Teks</span>
              <span className="hidden sm:inline text-[10px] uppercase px-1.5 py-0.2 bg-zinc-200/80 text-zinc-700 rounded-full font-mono font-bold">
                Pesan Chat
              </span>
            </button>
          </div>
        </div>

        {/* Filter Scope Selection Tabs */}
        <div className="p-3 sm:px-4 bg-white/20 border-b border-zinc-200/60 flex flex-wrap gap-1.5 sm:gap-2">
          {/* Tab 1: All CO */}
          <button
            type="button"
            id="wa-tab-all"
            onClick={() => handleScopeChange('ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'ALL'
                ? 'liquid-glass-dark text-white'
                : 'liquid-glass-clear text-[#1E2024]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Semua CO</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeScope === 'ALL' ? 'bg-white/20 text-white' : 'bg-zinc-200/70 text-zinc-700'}`}>
              {countAll}
            </span>
          </button>

          {/* Tab 2: CO Open Only */}
          <button
            type="button"
            id="wa-tab-open"
            onClick={() => handleScopeChange('OPEN_ONLY')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'OPEN_ONLY'
                ? 'liquid-glass-emerald text-white'
                : 'liquid-glass-clear text-emerald-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 border border-white" />
            <span>CO Open (O)</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${activeScope === 'OPEN_ONLY' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
              {countOpen}
            </span>
          </button>

          {/* Tab 3: Stock Ready (Semua CO) */}
          <button
            type="button"
            id="wa-tab-stock-ready-all"
            onClick={() => handleScopeChange('STOCK_READY_ALL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'STOCK_READY_ALL'
                ? 'liquid-glass-orange text-white'
                : 'liquid-glass-clear text-[#EA5413]'
            }`}
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Stock Ready (Semua)</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${activeScope === 'STOCK_READY_ALL' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-800'}`}>
              {countStockReadyAll}
            </span>
          </button>

          {/* Tab 4: Stock Ready (Khusus CO Open) */}
          <button
            type="button"
            id="wa-tab-stock-ready-open"
            onClick={() => handleScopeChange('STOCK_READY_OPEN')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'STOCK_READY_OPEN'
                ? 'liquid-glass-emerald text-white'
                : 'liquid-glass-clear text-emerald-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5 fill-current text-emerald-400" />
            <span>Stock Ready (CO Open)</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${activeScope === 'STOCK_READY_OPEN' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'}`}>
              {countStockReadyOpen}
            </span>
          </button>

          {/* Tab 5: Over Produksi (Surplus) */}
          <button
            type="button"
            id="wa-tab-over-produksi"
            onClick={() => handleScopeChange('OVER_PRODUCTION_ONLY')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'OVER_PRODUCTION_ONLY'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'liquid-glass-clear text-indigo-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span>Over Produksi</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${activeScope === 'OVER_PRODUCTION_ONLY' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-900 border border-indigo-200'}`}>
              {countOverProduksi}
            </span>
          </button>
        </div>

        {/* Modal Main Body: Excel File Mode vs Text Summary Mode */}
        <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 bg-transparent">
          {activeMode === 'EXCEL_FILE' ? (
            <div className="space-y-4">
              {/* Excel File Document Card */}
              <div className="p-4 sm:p-5 glass-card rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex flex-col items-center justify-center shrink-0 shadow-xs">
                  <FileSpreadsheet className="w-7 h-7 text-emerald-600" />
                  <span className="text-[9px] font-black font-mono text-emerald-900 -mt-0.5">XLSX</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold font-mono text-[#1E2024] truncate">
                      {scopeFileName}
                    </h4>
                    <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-800 border border-emerald-500/30 text-[10px] font-bold rounded-full uppercase">
                      HANYA FILE .XLSX
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2.5 text-xs text-[#5C6068]">
                    <div>
                      <span className="text-[#5C6068]/70 block text-[10px] uppercase">Format</span>
                      <strong className="text-[#1E2024]">Excel Spreadsheet</strong>
                    </div>
                    <div>
                      <span className="text-[#5C6068]/70 block text-[10px] uppercase">Struktur Kolom</span>
                      <strong className="text-[#1E2024]">15 Kolom Standar</strong>
                    </div>
                    <div>
                      <span className="text-[#5C6068]/70 block text-[10px] uppercase">Total Data</span>
                      <strong className="text-emerald-700 font-mono font-bold">{activeCount} PO</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Clarification Notice: Only File, No Text */}
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-950 leading-relaxed">
                  <strong className="font-bold text-[#1E2024] block mb-0.5">
                    Pengiriman Bersih (Tanpa Ketikan Teks)
                  </strong>
                  Fitur ini hanya mengirimkan dokumen fisik <strong>.xlsx</strong> langsung ke WhatsApp.
                  Pesan chat tidak akan diisi oleh teks ringkasan mentah, sehingga tampilan pengiriman di WhatsApp murni berupa lampiran file Excel.
                </div>
              </div>

              {/* Column order info */}
              <div className="p-3 rounded-2xl bg-white/60 border border-white/90 text-[11px] text-[#5C6068] font-mono shadow-2xs">
                <span className="font-bold text-[#1E2024]">Urutan 15 Kolom: </span>
                CO, Artikel, Item Description, Tanggal Input PO, No PO, Substance, QTY PO (pcs), Berat PO (KG), Stock (pcs/kg), Sisa OS (pcs/kg), Terkirim (pcs/kg), Harga.
              </div>
            </div>
          ) : (
            /* Text Summary Mode */
            <div className="relative">
              <pre className="w-full p-4 glass-card rounded-2xl text-[#1E2024] font-mono text-xs leading-relaxed whitespace-pre-wrap select-all max-h-[40vh] overflow-y-auto">
                {summaryText}
              </pre>
            </div>
          )}
        </div>

        {/* Notification Banner for File Sharing Result */}
        {shareNotice && (
          <div className="px-4 py-2.5 bg-emerald-500/10 border-t border-emerald-500/20 text-xs font-mono text-emerald-900 flex items-center justify-between gap-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{shareNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setShareNotice(null)}
              className="p-1 hover:bg-emerald-100 rounded text-emerald-700 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Actions Footer */}
        <div className="p-3.5 sm:p-4 border-t border-zinc-200/60 bg-white/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-[#5C6068] text-center sm:text-left">
            Opsi Terpilih:{' '}
            <span className="font-bold text-[#1E2024]">
              {activeScope === 'STOCK_READY_ALL'
                ? `⚡ Stock Ready (${countStockReadyAll} PO)`
                : activeScope === 'STOCK_READY_OPEN'
                ? `🟢⚡ Stock Ready CO Open (${countStockReadyOpen} PO)`
                : activeScope === 'OPEN_ONLY'
                ? `🟢 Khusus CO Open (${countOpen} PO)`
                : `📋 Semua CO (${countAll} PO)`}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-2.5 w-full sm:w-auto">
            {activeMode === 'EXCEL_FILE' ? (
              <>
                {/* Download Excel file locally */}
                <button
                  type="button"
                  id="btn-download-excel-modal"
                  onClick={handleDownloadExcelOnly}
                  className="flex-1 sm:flex-none liquid-glass-clear inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs uppercase tracking-wider cursor-pointer"
                  title="Download file Excel ke komputer"
                >
                  <Download className="w-4 h-4 text-zinc-600" />
                  <span>Download .xlsx</span>
                </button>

                {/* Send pure Excel file to WhatsApp without any text */}
                <button
                  type="button"
                  id="btn-share-excel-wa-modal"
                  onClick={handleShareExcelFile}
                  disabled={isSharingExcel || activeCount === 0}
                  className="flex-1 sm:flex-none liquid-glass-emerald inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                  title="Kirim hanya file Excel (.xlsx) ke WhatsApp tanpa ketikan teks"
                >
                  {isSharingExcel ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Membagikan...</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-4 h-4 text-white" />
                      <span>Kirim File .xlsx ke WA</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                {/* Copy Text */}
                <button
                  type="button"
                  id="btn-copy-wa-modal"
                  onClick={handleCopy}
                  className="flex-1 sm:flex-none liquid-glass-clear inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs uppercase tracking-wider cursor-pointer"
                  title="Salin ringkasan teks ke clipboard"
                >
                  {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-zinc-600" />}
                  <span>{isCopied ? 'Tersalin!' : 'Salin Teks'}</span>
                </button>

                {/* Send Text Only */}
                <button
                  type="button"
                  id="btn-open-wa-modal"
                  onClick={handleSendText}
                  className="flex-1 sm:flex-none liquid-glass-emerald inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs uppercase tracking-wider cursor-pointer"
                  title="Kirim format teks ringkasan ke WhatsApp"
                >
                  <Send className="w-4 h-4 text-white" />
                  <span>Kirim Teks ke WA</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
