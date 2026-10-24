import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  ExtractedRecord,
  ParseSummary,
  ExcelExportScope,
  WhatsAppReportScope,
  BatchFileItem,
  ConversionMode,
  DetailSJExportScope,
} from './types';
import { parseExcelBuffer, recalculateFIFOStock } from './utils/parserEngine';
import {
  exportToExcel,
  shareExcelFileToWhatsApp,
  getExportFileName,
  exportDetailSJToExcel,
  shareDetailSJExcelFileToWhatsApp,
  getDetailSJExportFileName,
} from './utils/excelExporter';
import {
  generateWhatsAppSummary,
  generateDetailSJWhatsAppSummary,
  copyToClipboard,
} from './utils/whatsappHelper';
import {
  convertSingleRawFile,
  downloadAllAsZip,
  exportCombinedMasterWorkbook,
  downloadAllDetailSJAsZip,
  exportCombinedDetailSJMasterWorkbook,
} from './utils/batchConverter';
import { haptic } from './utils/haptics';
import { UploadDualContainer } from './components/UploadDualContainer';
import { FileSwitcherBar, ConvertedFileItem } from './components/FileSwitcherBar';
import { StatsOverview } from './components/StatsOverview';
import { DeliveryPieChart } from './components/DeliveryPieChart';
import { ActionToolbar } from './components/ActionToolbar';
import { DataTable } from './components/DataTable';
import { DetailDeliveryView } from './components/DetailDeliveryView';
import { WhatsAppModal } from './components/WhatsAppModal';
import { ParserRulesModal } from './components/ParserRulesModal';
import { AIChatDrawer } from './components/AIChatDrawer';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useLanguage } from './i18n/LanguageContext';
import {
  FileSpreadsheet,
  CheckCircle2,
  Cpu,
  Share2,
  Info,
  RefreshCw,
  Layers,
  X,
  Truck,
  BookOpen,
  Bot,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function App() {
  const { t } = useLanguage();
  // Active Conversion Mode ('NORMAL' = Mode 1 Rekap Total per PO, 'DETAIL_SJ' = Mode 2 Rekap Detail Kiriman per Surat Jalan)
  const [conversionMode, setConversionMode] = useState<ConversionMode>('NORMAL');

  // All converted files state
  const [convertedFiles, setConvertedFiles] = useState<ConvertedFileItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Status & processing state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);

  // Auto-dismiss status notification after 3.5 seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Modals state
  const [isWAModalOpen, setIsWAModalOpen] = useState(false);
  const [waModalInitialScope, setWaModalInitialScope] = useState<WhatsAppReportScope>('ALL');
  const [waModalInitialMode, setWaModalInitialMode] = useState<'EXCEL_FILE' | 'TEXT_SUMMARY'>(
    'EXCEL_FILE'
  );
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isDetailSJCopied, setIsDetailSJCopied] = useState(false);

  // Active file derived state
  const activeFile = useMemo(() => {
    if (convertedFiles.length === 0) return null;
    return convertedFiles.find((f) => f.id === activeFileId) || convertedFiles[0];
  }, [convertedFiles, activeFileId]);

  const data: ExtractedRecord[] = useMemo(() => activeFile?.data || [], [activeFile]);
  const summary: ParseSummary | null = useMemo(() => activeFile?.summary || null, [activeFile]);
  const currentFileName: string | null = useMemo(
    () => activeFile?.rawFileName || null,
    [activeFile]
  );

  // Compute total Surat Jalan logs across active file for badge display
  const totalDeliveryLogsInActiveFile = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return data.reduce(
      (acc, r) =>
        acc +
        (r.deliveries
          ? r.deliveries.filter((d) => !d.isFallbackNoDelivery && d.noSJ !== '-').length
          : 0),
      0
    );
  }, [data]);

  // Compute FIFO Stock ready counts for action toolbar
  const totalStockReadyAll = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const scoped = recalculateFIFOStock(data, 'ALL');
    return scoped.filter((d) => (d['Stock (pcs)'] || 0) > 0).length;
  }, [data]);

  const totalStockReadyOpen = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const scoped = recalculateFIFOStock(data, 'OPEN');
    return scoped.filter((d) => d.coStatus === 'OPEN' && (d['Stock (pcs)'] || 0) > 0).length;
  }, [data]);

  const totalOverStockGudangPOs = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return data.filter(
      (d) =>
        (d['Over Stock Gudang (PCS)'] || d['Over Produksi (PCS)'] || 0) > 0 ||
        (d['Over Stock Gudang (KG)'] || d['Over Produksi (KG)'] || 0) > 0
    ).length;
  }, [data]);

  const totalOverKirimanPOs = useMemo(() => {
    if (!data || data.length === 0) return 0;
    return data.filter(
      (d) => (d['Over Kiriman (PCS)'] || 0) > 0 || (d['Over Kiriman (KG)'] || 0) > 0
    ).length;
  }, [data]);

  const totalOverProduksiPOs = totalOverStockGudangPOs;

  // Convert a single File instance to ConvertedFileItem
  const processRawFile = async (file: File): Promise<ConvertedFileItem> => {
    const result = await convertSingleRawFile(file, 'ALL');
    return {
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      rawFileName: file.name,
      fileSize: file.size,
      data: result.data,
      summary: result.summary,
      rawBuffer: result.rawBuffer,
      rawWorkbook: result.workbook,
      excelBlob: result.excelBlob,
      outputFileName: result.outputFileName,
      durationMs: result.durationMs,
    };
  };

  // Handle single convert
  const handleSingleFileSelected = async (file: File) => {
    setIsLoading(true);
    setErrorMessage(null);
    setLoadingMessage('Membaca & mengonversi file...');
    setLoadingProgress(null);
    haptic.medium();

    try {
      const converted = await processRawFile(file);
      setConvertedFiles([converted]);
      setActiveFileId(converted.id);
      const totalSJ = converted.data.reduce(
        (acc, r) =>
          acc +
          (r.deliveries
            ? r.deliveries.filter((d) => !d.isFallbackNoDelivery && d.noSJ !== '-').length
            : 0),
        0
      );
      setStatusMessage(
        conversionMode === 'DETAIL_SJ'
          ? `File ${file.name} berhasil dikonversi (${converted.data.length} PO • ${totalSJ} Surat Jalan).`
          : `File ${file.name} berhasil dikonversi (${converted.data.length} PO).`
      );
      haptic.success();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#10b981', '#38bdf8', '#fbbf24'],
      });
    } catch (err: any) {
      console.error('Single conversion error:', err);
      haptic.error();
      setErrorMessage(
        err?.message || 'Gagal memproses file Excel. Pastikan format sesuai standar ERP.'
      );
      setStatusMessage(null);
    } finally {
      setIsLoading(false);
      setLoadingMessage(null);
    }
  };

  // Handle multi convert (or append more files)
  const handleMultipleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;
    setIsLoading(true);
    setErrorMessage(null);
    setLoadingMessage(`Mengonversi ${files.length} file...`);
    haptic.medium();

    const results: ConvertedFileItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setLoadingProgress({ current: i + 1, total: files.length, fileName: file.name });
      try {
        const converted = await processRawFile(file);
        results.push(converted);
      } catch (err: any) {
        console.error(`Error converting ${file.name}:`, err);
        errors.push(`${file.name}: ${err?.message || 'Gagal'}`);
      }
    }

    setIsLoading(false);
    setLoadingProgress(null);
    setLoadingMessage(null);

    if (results.length > 0) {
      setConvertedFiles((prev) => {
        // Append to existing files if any, otherwise set as initial list
        const updated = [...prev, ...results];
        return updated;
      });
      setActiveFileId(results[0].id);
      haptic.success();
      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#25D366', '#FF6B35', '#141414'],
      });
      setStatusMessage(
        `${results.length} file berhasil dikonversi.` +
          (errors.length > 0 ? ` (${errors.length} file bermasalah)` : '')
      );
    } else {
      haptic.error();
      setErrorMessage(
        `Semua file (${files.length}) gagal dikonversi. Pastikan format file sesuai struktur ERP.`
      );
    }
  };

  // Switch active file from dropdown
  const handleSelectFile = (fileId: string) => {
    setActiveFileId(fileId);
    const target = convertedFiles.find((f) => f.id === fileId);
    if (target) {
      setStatusMessage(`File aktif: ${target.rawFileName}`);
    }
  };

  // Change sheet within the active file
  const handleSelectSheet = (sheetName: string) => {
    if (!activeFile || !activeFile.rawBuffer) return;
    haptic.selection();
    setIsLoading(true);
    setTimeout(() => {
      try {
        const { data: parsedData, summary: parsedSummary, workbook } = parseExcelBuffer(
          activeFile.rawBuffer,
          activeFile.rawFileName,
          sheetName
        );
        setConvertedFiles((prev) =>
          prev.map((f) =>
            f.id === activeFile.id
              ? {
                  ...f,
                  data: parsedData,
                  summary: parsedSummary,
                  rawWorkbook: workbook,
                }
              : f
          )
        );
        setStatusMessage(`Sheet diubah: ${sheetName}`);
        haptic.success();
      } catch (err: any) {
        haptic.error();
        setErrorMessage(err?.message || 'Gagal membaca sheet.');
      } finally {
        setIsLoading(false);
      }
    }, 80);
  };

  // Download active file Excel (Normal Mode)
  const handleDownloadExcel = (scope: ExcelExportScope = 'ALL') => {
    if (!data || data.length === 0 || !currentFileName) return;
    haptic.success();
    const filename = getExportFileName(currentFileName, scope);
    exportToExcel(data, filename, scope);
  };

  // Download active file Excel (Detail SJ Mode)
  const handleDownloadDetailSJExcel = (scope: DetailSJExportScope = 'ALL') => {
    if (!data || data.length === 0 || !currentFileName) return;
    haptic.success();
    const filename = getDetailSJExportFileName(currentFileName, scope);
    exportDetailSJToExcel(data, filename, scope);
    setStatusMessage(`File Excel Detail Kiriman SJ (${filename}) berhasil diunduh.`);
  };

  // Download all converted files as a single ZIP archive (respects active conversionMode)
  const handleDownloadAllZip = async () => {
    if (convertedFiles.length === 0) return;
    setIsZipping(true);
    haptic.medium();
    try {
      const items: BatchFileItem[] = convertedFiles.map((f) => ({
        id: f.id,
        rawFileName: f.rawFileName,
        fileSize: f.fileSize,
        status: 'success',
        data: f.data,
        summary: f.summary,
        excelBlob: f.excelBlob,
        outputFileName: f.outputFileName,
      }));
      if (conversionMode === 'DETAIL_SJ') {
        await downloadAllDetailSJAsZip(items, 'ALL');
      } else {
        await downloadAllAsZip(items);
      }
      haptic.success();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#25D366', '#FF6B35', '#141414'],
      });
      setStatusMessage(
        conversionMode === 'DETAIL_SJ'
          ? `Berhasil mengunduh ZIP Rekap Detail SJ untuk ${convertedFiles.length} file.`
          : `Berhasil mengunduh zip untuk ${convertedFiles.length} file.`
      );
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Error downloading zip:', err);
      haptic.error();
      setErrorMessage(err?.message || 'Gagal mengunduh file .zip.');
    } finally {
      setIsZipping(false);
    }
  };

  // Download master consolidated workbook with all files (respects active conversionMode)
  const handleDownloadMasterCombined = () => {
    if (convertedFiles.length === 0) return;
    setIsMerging(true);
    haptic.medium();
    try {
      const items: BatchFileItem[] = convertedFiles.map((f) => ({
        id: f.id,
        rawFileName: f.rawFileName,
        fileSize: f.fileSize,
        status: 'success',
        data: f.data,
        summary: f.summary,
        excelBlob: f.excelBlob,
        outputFileName: f.outputFileName,
      }));
      if (conversionMode === 'DETAIL_SJ') {
        exportCombinedDetailSJMasterWorkbook(items, 'ALL');
      } else {
        exportCombinedMasterWorkbook(items);
      }
      haptic.success();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#10b981', '#FF6B35', '#141414'],
      });
      setStatusMessage(
        conversionMode === 'DETAIL_SJ'
          ? 'Berhasil membuat Master Excel Gabungan Detail Kiriman SJ.'
          : 'Berhasil membuat Master Excel Gabungan.'
      );
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Error combining master workbook:', err);
      haptic.error();
      setErrorMessage(err?.message || 'Gagal menggabungkan workbook master.');
    } finally {
      setIsMerging(false);
    }
  };

  // Share active file via WhatsApp (Normal Mode)
  const handleShareExcelWhatsApp = async (scope: ExcelExportScope = 'ALL') => {
    if (!data || data.length === 0 || !currentFileName) return;
    haptic.medium();
    try {
      const filename = getExportFileName(currentFileName, scope);
      const result = await shareExcelFileToWhatsApp(data, scope, filename);
      if (result.success) {
        haptic.success();
        confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.8 },
          colors: ['#128C7E', '#25D366', '#FF6B35', '#141414'],
        });
        setStatusMessage(result.message);
        setTimeout(() => setStatusMessage(null), 5000);
      } else if (result.method !== 'cancelled') {
        setStatusMessage(result.message);
      }
    } catch (err: any) {
      console.error('Error sharing Excel via WhatsApp:', err);
      haptic.error();
      setErrorMessage(err?.message || 'Gagal membagikan file via WhatsApp.');
    }
  };

  // Share active file via WhatsApp (Detail SJ Mode)
  const handleShareDetailSJExcelWhatsApp = async (scope: DetailSJExportScope = 'ALL') => {
    if (!data || data.length === 0 || !currentFileName) return;
    haptic.medium();
    try {
      const filename = getDetailSJExportFileName(currentFileName, scope);
      const result = await shareDetailSJExcelFileToWhatsApp(data, scope, filename);
      if (result.success) {
        haptic.success();
        confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.8 },
          colors: ['#128C7E', '#25D366', '#FF6B35', '#141414'],
        });
        setStatusMessage(result.message);
        setTimeout(() => setStatusMessage(null), 5000);
      } else if (result.method !== 'cancelled') {
        setStatusMessage(result.message);
      }
    } catch (err: any) {
      console.error('Error sharing Detail SJ Excel via WhatsApp:', err);
      haptic.error();
      setErrorMessage(err?.message || 'Gagal membagikan file Detail SJ via WhatsApp.');
    }
  };

  // Open WhatsApp report modal
  const handleOpenWhatsApp = (
    scope: WhatsAppReportScope = 'ALL',
    mode: 'EXCEL_FILE' | 'TEXT_SUMMARY' = 'EXCEL_FILE'
  ) => {
    if (!data || data.length === 0) return;
    haptic.medium();
    setWaModalInitialScope(scope);
    setWaModalInitialMode(mode);
    setIsWAModalOpen(true);
  };

  // Copy WhatsApp summary text (Normal Mode)
  const handleCopyWhatsAppText = async (scope: WhatsAppReportScope = 'ALL') => {
    if (!data || data.length === 0) return;
    haptic.light();
    const text = generateWhatsAppSummary(data, scope, currentFileName);
    const success = await copyToClipboard(text);
    if (success) {
      haptic.success();
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Copy WhatsApp summary text (Detail SJ Mode)
  const handleCopyDetailSJWhatsAppText = async (scope: DetailSJExportScope = 'ALL') => {
    if (!data || data.length === 0) return;
    haptic.light();
    const text = generateDetailSJWhatsAppSummary(data, scope, currentFileName);
    const success = await copyToClipboard(text);
    if (success) {
      haptic.success();
      setIsDetailSJCopied(true);
      setStatusMessage('Teks laporan Detail Kiriman SJ berhasil disalin ke clipboard.');
      setTimeout(() => setIsDetailSJCopied(false), 2000);
    }
  };

  // Reset all files and return to upload view
  const handleReset = () => {
    haptic.heavy();
    setConvertedFiles([]);
    setActiveFileId(null);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-[#E8EBF0] text-[#17191D] font-sans selection:bg-[#EA5413] selection:text-white pb-16 relative overflow-x-hidden">
      {/* Subtle warm ambient lighting */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent -z-10" />

      {/* Top Header Bar */}
      <header className="border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl sticky top-0 z-40 shadow-xs">
        <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white border border-zinc-200/80 flex items-center justify-center shrink-0 shadow-xs overflow-hidden p-0.5">
              <img
                src="/logo.jpg"
                alt="BlackEYE Logo"
                className="w-full h-full object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm md:text-base font-bold tracking-tight text-[#17191D] truncate">
                {t.appTitle}
              </h1>
              <p className="text-[10px] sm:text-[11px] text-[#5C6068] hidden sm:block truncate">
                {t.appSubtitle}
              </p>
            </div>
          </div>

          {/* Right Header Navigation & Language Switcher */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-4 sm:space-y-5">
        {/* ============================================================== */}
        {/* 0. DUAL CONVERSION MODE SWITCHER BAR (NORMAL vs DETAIL SJ)     */}
        {/* ============================================================== */}
        <div className="p-3 sm:p-4 glass-panel rounded-3xl border border-white/80 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-xs transition-colors ${
                  conversionMode === 'DETAIL_SJ'
                    ? 'bg-[#EA5413] text-white'
                    : 'bg-[#17191D] text-white'
                }`}
              >
                {conversionMode === 'DETAIL_SJ' ? (
                  <Truck className="w-4 h-4" />
                ) : (
                  <Layers className="w-4 h-4" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#17191D]">
                    Pilih Mode Perekapan Konversi ERP
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      conversionMode === 'DETAIL_SJ'
                        ? 'bg-orange-100 text-[#EA5413] border border-orange-300/70'
                        : 'bg-zinc-200/80 text-zinc-800 border border-zinc-300'
                    }`}
                  >
                    {conversionMode === 'DETAIL_SJ'
                      ? 'Mode 2 Aktif: Detail per Surat Jalan (SJ)'
                      : 'Mode 1 Aktif: Konversi Normal (Total per PO)'}
                  </span>
                </div>
                <p className="text-[11px] text-[#5C6068] mt-0.5">
                  {conversionMode === 'DETAIL_SJ'
                    ? 'Menampilkan rincian setiap pengiriman berdasarkan No Surat Jalan (SJ), Tanggal Kirim, QTY Kirim, Sisa OS Berjalan, serta Fallback otomatis PO belum kirim.'
                    : 'Menampilkan rekapitulasi konversi normal 15 kolom per Nomor PO beserta alokasi stok gudang FIFO (< 51 pcs threshold).'}
                </p>
              </div>
            </div>

            {/* Mode Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                id="btn-mode-normal"
                onClick={() => {
                  haptic.selection();
                  setConversionMode('NORMAL');
                  setStatusMessage('Beralih ke Mode 1: Konversi Normal (Rekap Total per PO)');
                }}
                className={`px-4 py-2.5 rounded-2xl text-left transition-all cursor-pointer flex items-center gap-3 border ${
                  conversionMode === 'NORMAL'
                    ? 'bg-[#17191D] text-white border-[#17191D] shadow-sm'
                    : 'bg-white/80 hover:bg-white text-[#17191D] border-zinc-200/90'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 font-mono text-xs font-bold ${
                    conversionMode === 'NORMAL'
                      ? 'bg-white/15 text-emerald-400'
                      : 'bg-zinc-100 text-zinc-700'
                  }`}
                >
                  1
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold leading-tight truncate">
                    Mode 1: Konversi Normal
                  </div>
                  <div
                    className={`text-[10px] truncate mt-0.5 ${
                      conversionMode === 'NORMAL' ? 'text-zinc-300' : 'text-[#5C6068]'
                    }`}
                  >
                    Rekap Total Kiriman &amp; Sisa OS per PO
                  </div>
                </div>
              </button>

              <button
                type="button"
                id="btn-mode-detail-sj"
                onClick={() => {
                  haptic.selection();
                  setConversionMode('DETAIL_SJ');
                  setStatusMessage(
                    'Beralih ke Mode 2: Rekap Detail Kiriman (Per No Surat Jalan / SJ)'
                  );
                }}
                className={`px-4 py-2.5 rounded-2xl text-left transition-all cursor-pointer flex items-center gap-3 border ${
                  conversionMode === 'DETAIL_SJ'
                    ? 'bg-[#EA5413] text-white border-[#EA5413] shadow-sm'
                    : 'bg-white/80 hover:bg-white text-[#17191D] border-zinc-200/90'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 font-mono text-xs font-bold ${
                    conversionMode === 'DETAIL_SJ'
                      ? 'bg-white/20 text-white'
                      : 'bg-orange-50 text-[#EA5413] border border-orange-200/60'
                  }`}
                >
                  2
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                    <span>Mode 2: Detail Kiriman (SJ)</span>
                    {convertedFiles.length > 0 && totalDeliveryLogsInActiveFile > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                          conversionMode === 'DETAIL_SJ'
                            ? 'bg-white/25 text-white'
                            : 'bg-orange-100 text-[#EA5413]'
                        }`}
                      >
                        {totalDeliveryLogsInActiveFile} SJ
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-[10px] truncate mt-0.5 ${
                      conversionMode === 'DETAIL_SJ' ? 'text-orange-100' : 'text-[#5C6068]'
                    }`}
                  >
                    No SJ • Tgl Kirim • QTY Kirim • Fallback OS
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* 1. INITIAL STATE: DUAL UPLOAD CONTAINERS                       */}
        {/* ============================================================== */}
        {convertedFiles.length === 0 && (
          <div className="space-y-4">
            <UploadDualContainer
              onSingleFileSelected={handleSingleFileSelected}
              onMultipleFilesSelected={handleMultipleFilesSelected}
              isLoading={isLoading}
              loadingMessage={loadingMessage}
              loadingProgress={loadingProgress}
              errorMessage={errorMessage}
            />

            {/* Quick Specifications Cards (Dynamic according to selected mode) */}
            {conversionMode === 'NORMAL' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="p-4 glass-card rounded-2xl flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1E2024]">
                      Mode 1: Convert Normal 15 Kolom
                    </h4>
                    <p className="text-xs text-[#5C6068] mt-1 leading-relaxed">
                      Menyusun data mentah dari ERP ke dalam format file Excel 15 kolom standar per Nomor PO secara otomatis.
                    </p>
                  </div>
                </div>

                <div className="p-4 glass-card rounded-2xl flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#EA5413] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Cpu className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1E2024]">
                      Total Terkirim &amp; Fallback OS
                    </h4>
                    <p className="text-xs text-[#5C6068] mt-1 leading-relaxed">
                      Merekap jumlah total terkirim per PO dan otomatis fallback ke QTY PO pada Sisa OS jika belum ada pengiriman.
                    </p>
                  </div>
                </div>

                <div className="p-4 glass-card rounded-2xl flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Share2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1E2024]">
                      Alokasi Stok FIFO
                    </h4>
                    <p className="text-xs text-[#5C6068] mt-1 leading-relaxed">
                      Mengalokasikan stok gudang sesuai urutan tanggal PO terlama untuk sisa OS di atas batas toleransi 51 pcs.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="p-4 glass-card rounded-2xl flex items-start gap-3 border border-orange-300/60">
                  <div className="w-9 h-9 rounded-xl bg-[#EA5413] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Truck className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1E2024]">
                      Mode 2: Rekap Detail Setiap Surat Jalan (SJ)
                    </h4>
                    <p className="text-xs text-[#5C6068] mt-1 leading-relaxed">
                      Mengekstrak setiap kiriman (SJ #1, SJ #2, SJ #3, dst.) lengkap dengan No SJ (P26...), Tanggal Kirim, QTY Kirim, dan Berat KG.
                    </p>
                  </div>
                </div>

                <div className="p-4 glass-card rounded-2xl flex items-start gap-3 border border-orange-300/60">
                  <div className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Cpu className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1E2024]">
                      Sisa OS Berjalan &amp; Fallback Detail
                    </h4>
                    <p className="text-xs text-[#5C6068] mt-1 leading-relaxed">
                      Menghitung pengurangan Sisa OS berjalan di setiap tahapan SJ hingga Sisa OS Akhir, serta fallback otomatis untuk PO yang belum dikirim.
                    </p>
                  </div>
                </div>

                <div className="p-4 glass-card rounded-2xl flex items-start gap-3 border border-orange-300/60">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <FileSpreadsheet className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1E2024]">
                      Output Excel 4-Sheet Standar Data Entry
                    </h4>
                    <p className="text-xs text-[#5C6068] mt-1 leading-relaxed">
                      Menghasilkan buku kerja Excel profesional berisi sheet Detail Kiriman SJ, Grup PO &amp; Sub-Total OS, Database Flat SJ, dan Matriks Horizontal SJ.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* 2. CONVERTED STATE: FILE DROPDOWN SELECTOR & FULL ANALYSIS     */}
        {/* ============================================================== */}
        {convertedFiles.length > 0 && activeFile && summary && (
          <div className="space-y-4 sm:space-y-5 animate-fade-in">
            {/* File Switcher Dropdown & Action Bar */}
            <FileSwitcherBar
              files={convertedFiles}
              activeFileId={activeFile.id}
              onSelectFile={handleSelectFile}
              onDownloadActiveExcel={() =>
                conversionMode === 'DETAIL_SJ'
                  ? handleDownloadDetailSJExcel('ALL')
                  : handleDownloadExcel('ALL')
              }
              onDownloadAllZip={convertedFiles.length > 1 ? handleDownloadAllZip : undefined}
              onDownloadMasterCombined={
                convertedFiles.length > 1 ? handleDownloadMasterCombined : undefined
              }
              onAddMoreFiles={handleMultipleFilesSelected}
              onReset={handleReset}
              isZipping={isZipping}
              isMerging={isMerging}
            />

            {/* ============================================================ */}
            {/* MODE 1: KONVERSI NORMAL (REKAP TOTAL PER PO)                 */}
            {/* ============================================================ */}
            {conversionMode === 'NORMAL' && (
              <>
                {/* Statistics Cards for Active File */}
                <StatsOverview summary={summary} />

                {/* Delivery Ratio Pie Chart */}
                <DeliveryPieChart summary={summary} />

                {/* Toolbar for Scope Export, WhatsApp, Sheets */}
                <ActionToolbar
                  onDownloadExcel={handleDownloadExcel}
                  onShareExcelWhatsApp={handleShareExcelWhatsApp}
                  onOpenWhatsApp={handleOpenWhatsApp}
                  onCopyWhatsAppText={handleCopyWhatsAppText}
                  onReset={handleReset}
                  onToggleDoc={() => setIsRulesModalOpen(true)}
                  onOpenAIChat={() => setIsAIChatOpen(true)}
                  isCopied={isCopied}
                  sheets={summary.sheetNames}
                  activeSheet={summary.activeSheetName}
                  onSelectSheet={handleSelectSheet}
                  totalRecords={data.length}
                  totalCOOpen={summary.totalCOOpen}
                  totalCOClosed={summary.totalCOClosed}
                  totalStockReadyAll={totalStockReadyAll}
                  totalStockReadyOpen={totalStockReadyOpen}
                  totalOverStockGudangPOs={totalOverStockGudangPOs}
                  totalOverKirimanPOs={totalOverKirimanPOs}
                  totalOverProduksiPOs={totalOverProduksiPOs}
                />

                {/* Main Interactive Table with Row Customization */}
                <DataTable data={data} />
              </>
            )}

            {/* ============================================================ */}
            {/* MODE 2: REKAP DETAIL KIRIMAN PER SURAT JALAN (SJ)            */}
            {/* ============================================================ */}
            {conversionMode === 'DETAIL_SJ' && (
              <>
                {/* Optional Sheet Selector & Quick Utilities Bar for Detail SJ Mode */}
                <div className="p-3 sm:p-4 glass-panel rounded-2xl flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#17191D]">
                      Sheet Aktif ({summary.activeSheetName}):
                    </span>
                    {summary.sheetNames.length > 1 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {summary.sheetNames.map((sheet) => (
                          <button
                            key={sheet}
                            type="button"
                            onClick={() => handleSelectSheet(sheet)}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                              sheet === summary.activeSheetName
                                ? 'bg-[#EA5413] text-white shadow-xs'
                                : 'bg-white/80 text-zinc-700 hover:bg-white border border-zinc-200'
                            }`}
                          >
                            {sheet}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-white/80 border border-zinc-200/80 text-xs font-mono text-zinc-700">
                        {summary.activeSheetName}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRulesModalOpen(true)}
                      className="liquid-glass-clear inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-950 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#EA5413]" />
                      <span>Aturan Parser &amp; SJ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAIChatOpen(true)}
                      className="liquid-glass-clear inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-950 cursor-pointer"
                    >
                      <Bot className="w-3.5 h-3.5 text-emerald-600" />
                      <span>AI Data Assistant</span>
                    </button>
                  </div>
                </div>

                {/* Detailed Delivery Per Surat Jalan Workspace */}
                <DetailDeliveryView
                  data={data}
                  summary={summary}
                  currentFileName={currentFileName}
                  onDownloadDetailExcel={handleDownloadDetailSJExcel}
                  onShareDetailExcelWhatsApp={handleShareDetailSJExcelWhatsApp}
                  onCopyDetailWhatsAppText={handleCopyDetailSJWhatsAppText}
                  isCopied={isDetailSJCopied}
                  sheets={summary.sheetNames}
                  activeSheet={summary.activeSheetName}
                  onSelectSheet={handleSelectSheet}
                  onReset={handleReset}
                />
              </>
            )}

            {/* Bottom Quick Notice */}
            <div className="p-4 glass-panel rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-[#5C6068]">
                <Info className="w-4 h-4 text-[#EA5413] shrink-0" />
                <span>
                  {convertedFiles.length > 1
                    ? `Sedang menganalisis 1 dari ${convertedFiles.length} file pada ${
                        conversionMode === 'DETAIL_SJ'
                          ? 'Mode 2 (Rekap Detail Kiriman per SJ)'
                          : 'Mode 1 (Konversi Normal)'
                      }. Anda dapat berpindah file atau mode kapan saja.`
                    : 'Anda dapat berpindah antara Mode 1 (Konversi Normal) dan Mode 2 (Detail Kiriman per SJ) secara instan tanpa perlu upload ulang file.'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  id="btn-bottom-change-file"
                  onClick={handleReset}
                  className="liquid-glass-clear inline-flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-wider cursor-pointer text-zinc-700 hover:text-zinc-950"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Ganti File</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-6 border-t border-zinc-200/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5C6068]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-white/80 border border-white/90 overflow-hidden p-0.5 shadow-2xs">
            <img
              src="/logo.jpg"
              alt="BlackEYE"
              className="w-full h-full object-contain rounded"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="font-bold text-[#1E2024]">BLACKEYE</span>
          <span>• ERP DATA ENGINE BROWSER_V2.0</span>
          <span className="text-zinc-300">•</span>
          <span className="font-medium text-[#1E2024]">
            Developed by <strong className="font-semibold text-[#EA5413]">VINNS</strong>
          </span>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <WhatsAppModal
        isOpen={isWAModalOpen}
        onClose={() => setIsWAModalOpen(false)}
        data={data}
        currentFileName={currentFileName}
        initialScope={waModalInitialScope}
        initialMode={waModalInitialMode}
      />

      <ParserRulesModal isOpen={isRulesModalOpen} onClose={() => setIsRulesModalOpen(false)} />

      <AIChatDrawer
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
        onOpen={() => setIsAIChatOpen(true)}
        data={data.length > 0 ? data : null}
        summary={summary}
        currentFileName={currentFileName}
      />

      {/* Floating Small Toast Notification (Kecil, Melayang, Tanpa Memakan Layout Halaman) */}
      {statusMessage && (
        <div
          id="toast-notification"
          className="fixed top-18 sm:top-20 right-4 sm:right-6 z-50 flex items-center gap-2.5 px-3.5 py-2 bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_10px_30px_-5px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] border border-emerald-500/30 text-xs text-[#1E2024] animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <span className="font-semibold text-xs text-[#1E2024] pr-1">{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-1 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer rounded-full hover:bg-zinc-100 ml-1 shrink-0"
            title="Tutup"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

