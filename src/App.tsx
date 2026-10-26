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
  exportSalesOrderToExcel,
  shareSalesOrderExcelFileToWhatsApp,
  getSalesOrderExportFileName,
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
import { SalesOrderView } from './components/SalesOrderView';
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
    setLoadingMessage(t.readingConverting);
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
          ? `${file.name} ${t.fileConvertedSuccess} (${converted.data.length} ${t.unitPoShort} • ${totalSJ} ${t.unitSJ}).`
          : `${file.name} ${t.fileConvertedSuccess} (${converted.data.length} ${t.unitPoShort}).`
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
        err?.message || t.errorReadingSheet
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
      setStatusMessage(`${t.activeFileToast} ${target.rawFileName}`);
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
        setStatusMessage(`${t.sheetChangedToast} ${sheetName}`);
        haptic.success();
      } catch (err: any) {
        haptic.error();
        setErrorMessage(err?.message || t.errorReadingSheet);
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
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans selection:bg-[#0F172A] selection:text-white pb-12 relative overflow-x-hidden">
      {/* Top Header Bar (3-Zone Contract: Brand — Mode Switcher — Actions) */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8 h-13 sm:h-14 flex items-center justify-between gap-2 sm:gap-4">
          {/* Zone 1: Brand Wordmark (Compact on mobile) */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink min-w-0">
            <img
              src="/logo.jpg"
              alt="BlackEYE"
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain rounded-md border border-slate-200 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] sm:text-xs md:text-sm font-bold tracking-tight text-slate-900 leading-tight truncate">
                <span className="sm:hidden">BLACKEYE · SYMIX</span>
                <span className="hidden sm:inline">BLACKEYE - SYMIX STOCK CONVERTER</span>
              </span>
              <span className="text-[9px] sm:text-[10px] md:text-[11px] text-slate-500 font-medium leading-none truncate mt-0.5">
                <span className="sm:hidden">{t.appSubtitleShort}</span>
                <span className="hidden sm:inline">{t.appSubtitle}</span>
              </span>
            </div>
          </div>

          {/* Zone 2: Clean Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 sm:p-1 rounded-lg border border-slate-200/80 shrink-0">
            <button
              type="button"
              id="btn-mode-normal"
              onClick={() => {
                haptic.selection();
                setConversionMode('NORMAL');
              }}
              className={`px-2 sm:px-3 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                conversionMode === 'NORMAL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.modeRekapPO}
            </button>
            <button
              type="button"
              id="btn-mode-detail-sj"
              onClick={() => {
                haptic.selection();
                setConversionMode('DETAIL_SJ');
              }}
              className={`px-2 sm:px-3 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                conversionMode === 'DETAIL_SJ'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{t.modeDetailSJ}</span>
              {convertedFiles.length > 0 && totalDeliveryLogsInActiveFile > 0 && (
                <span
                  className={`font-mono text-[9px] sm:text-[10px] ${
                    conversionMode === 'DETAIL_SJ' ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  ({totalDeliveryLogsInActiveFile})
                </span>
              )}
            </button>
            <button
              type="button"
              id="btn-mode-sales-order"
              onClick={() => {
                haptic.selection();
                setConversionMode('SALES_ORDER');
              }}
              className={`px-2 sm:px-3 py-1 rounded-md text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                conversionMode === 'SALES_ORDER'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{t.modeSalesOrder || 'Rekap Sales'}</span>
            </button>
          </div>

          {/* Zone 3: Guide & Language */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsRulesModalOpen(true)}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap hidden md:inline-flex"
            >
              {t.guideBtn}
            </button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 space-y-4">
        {/* 1. INITIAL STATE: UPLOAD CONTAINERS */}
        {convertedFiles.length === 0 && (
          <UploadDualContainer
            onSingleFileSelected={handleSingleFileSelected}
            onMultipleFilesSelected={handleMultipleFilesSelected}
            isLoading={isLoading}
            loadingMessage={loadingMessage}
            loadingProgress={loadingProgress}
            errorMessage={errorMessage}
          />
        )}

        {/* 2. CONVERTED STATE: WORKSPACE */}
        {convertedFiles.length > 0 && activeFile && summary && (
          <div className="space-y-4">
            <FileSwitcherBar
              files={convertedFiles}
              activeFileId={activeFile.id}
              onSelectFile={handleSelectFile}
              onDownloadActiveExcel={() => {
                if (conversionMode === 'SALES_ORDER') {
                  exportSalesOrderToExcel(
                    data,
                    'ALL',
                    getSalesOrderExportFileName(currentFileName, 'ALL')
                  );
                  setStatusMessage('Berhasil mengekspor format Rekap Sales (.xlsx).');
                } else if (conversionMode === 'DETAIL_SJ') {
                  handleDownloadDetailSJExcel('ALL');
                } else {
                  handleDownloadExcel('ALL');
                }
              }}
              onDownloadAllZip={convertedFiles.length > 1 ? handleDownloadAllZip : undefined}
              onDownloadMasterCombined={
                convertedFiles.length > 1 ? handleDownloadMasterCombined : undefined
              }
              onAddMoreFiles={handleMultipleFilesSelected}
              onReset={handleReset}
              isZipping={isZipping}
              isMerging={isMerging}
            />

            {/* MODE 1: REKAP PO (NORMAL) */}
            {conversionMode === 'NORMAL' && (
              <>
                <StatsOverview summary={summary} />
                <DeliveryPieChart summary={summary} />
                <ActionToolbar
                  onDownloadExcel={handleDownloadExcel}
                  onShareExcelWhatsApp={handleShareExcelWhatsApp}
                  onOpenWhatsApp={handleOpenWhatsApp}
                  onCopyWhatsAppText={handleCopyWhatsAppText}
                  onReset={handleReset}
                  onToggleDoc={() => setIsRulesModalOpen(true)}
                  onOpenAIChat={() => setIsAIChatOpen(true)}
                  onExportSalesOrder={() => {
                    const outName = getSalesOrderExportFileName(currentFileName, 'ALL');
                    exportSalesOrderToExcel(data, 'ALL', outName);
                    setStatusMessage(`Berhasil mengekspor format Sales: ${outName}`);
                  }}
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
                <DataTable data={data} />
              </>
            )}

            {/* MODE 2: DETAIL SURAT JALAN (SJ) */}
            {conversionMode === 'DETAIL_SJ' && (
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
            )}

            {/* MODE 3: REKAP ORDER SALES (13 KOLOM) */}
            {conversionMode === 'SALES_ORDER' && (
              <SalesOrderView
                data={data}
                fileName={currentFileName}
                onShareStatus={(msg) => setStatusMessage(msg)}
              />
            )}
          </div>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 mt-10 pt-4 border-t border-slate-200 flex flex-col xs:flex-row items-center justify-between gap-1.5 text-[11px] sm:text-xs text-slate-500 text-center xs:text-left">
        <div className="flex items-center gap-1.5 flex-wrap justify-center xs:justify-start">
          <span className="font-semibold text-slate-700">BLACKEYE - SYMIX</span>
          <span className="text-slate-300">·</span>
          <span>{t.footerSubtitle}</span>
        </div>
        <span className="text-slate-400">
          {t.developedBy} <strong className="font-semibold text-slate-700">VINNS</strong>
        </span>
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

      {/* Compact Toast Notification */}
      {statusMessage && (
        <div
          id="toast-notification"
          className="fixed top-16 right-4 sm:right-6 z-50 flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg shadow-lg text-xs animate-in fade-in duration-150"
        >
          <span className="font-medium pr-1">{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-0.5 text-slate-400 hover:text-white transition-colors cursor-pointer rounded"
            title={t.closeBtn}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

