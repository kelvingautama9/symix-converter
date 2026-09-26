import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  ExtractedRecord,
  ParseSummary,
  ExcelExportScope,
  WhatsAppReportScope,
  BatchFileItem,
} from './types';
import { parseExcelBuffer, recalculateFIFOStock } from './utils/parserEngine';
import { exportToExcel, shareExcelFileToWhatsApp, getExportFileName } from './utils/excelExporter';
import { generateWhatsAppSummary, copyToClipboard } from './utils/whatsappHelper';
import {
  convertSingleRawFile,
  downloadAllAsZip,
  exportCombinedMasterWorkbook,
} from './utils/batchConverter';
import { haptic } from './utils/haptics';
import { UploadDualContainer } from './components/UploadDualContainer';
import { FileSwitcherBar, ConvertedFileItem } from './components/FileSwitcherBar';
import { StatsOverview } from './components/StatsOverview';
import { DeliveryPieChart } from './components/DeliveryPieChart';
import { ActionToolbar } from './components/ActionToolbar';
import { DataTable } from './components/DataTable';
import { WhatsAppModal } from './components/WhatsAppModal';
import { ParserRulesModal } from './components/ParserRulesModal';
import { AIChatDrawer } from './components/AIChatDrawer';
import {
  FileSpreadsheet,
  CheckCircle2,
  Cpu,
  Share2,
  Info,
  RefreshCw,
  Layers,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function App() {
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

  // Modals state
  const [isWAModalOpen, setIsWAModalOpen] = useState(false);
  const [waModalInitialScope, setWaModalInitialScope] = useState<WhatsAppReportScope>('ALL');
  const [waModalInitialMode, setWaModalInitialMode] = useState<'EXCEL_FILE' | 'TEXT_SUMMARY'>(
    'EXCEL_FILE'
  );
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

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
      setStatusMessage(`File ${file.name} berhasil dikonversi (${converted.data.length} PO).`);
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

  // Download active file Excel
  const handleDownloadExcel = (scope: ExcelExportScope = 'ALL') => {
    if (!data || data.length === 0 || !currentFileName) return;
    haptic.success();
    const filename = getExportFileName(currentFileName, scope);
    exportToExcel(data, filename, scope);
  };

  // Download all converted files as a single ZIP archive
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
      await downloadAllAsZip(items);
      haptic.success();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#25D366', '#FF6B35', '#141414'],
      });
      setStatusMessage(`Berhasil mengunduh zip untuk ${convertedFiles.length} file.`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Error downloading zip:', err);
      haptic.error();
      setErrorMessage(err?.message || 'Gagal mengunduh file .zip.');
    } finally {
      setIsZipping(false);
    }
  };

  // Download master consolidated workbook with all files
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
      exportCombinedMasterWorkbook(items);
      haptic.success();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#10b981', '#FF6B35', '#141414'],
      });
      setStatusMessage('Berhasil membuat Master Excel Gabungan.');
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Error combining master workbook:', err);
      haptic.error();
      setErrorMessage(err?.message || 'Gagal menggabungkan workbook master.');
    } finally {
      setIsMerging(false);
    }
  };

  // Share active file via WhatsApp
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

  // Copy WhatsApp summary text
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
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-xs sm:text-sm md:text-base font-bold tracking-tight text-[#17191D] truncate">
                  BLACKEYE - SYMIX STOCK CONVERTER
                </h1>
                <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/25 text-[#EA5413] text-[9px] sm:text-[10px] font-mono font-semibold rounded-full tracking-wider shrink-0">
                  BROWSER_V2.0
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#5C6068] hidden sm:block truncate">
                Tools Rekapitulasi Stock & Sisa Order Status (OS) Customer
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-4 sm:space-y-5">
        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            id="status-indicator-banner"
            className="p-3.5 px-4 glass-panel rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in shadow-sm border border-emerald-500/20"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <span className="font-semibold text-xs sm:text-sm text-[#1E2024]">
                {statusMessage}
              </span>
            </div>
            {summary && currentFileName && (
              <div className="flex items-center gap-2 text-[11px] text-[#5C6068] font-mono">
                <span className="border border-white/80 bg-white/70 px-2.5 py-0.5 rounded-full font-medium shadow-2xs">
                  FILE: {currentFileName}
                </span>
                <span className="border border-white/80 bg-white/70 px-2.5 py-0.5 rounded-full font-medium shadow-2xs">
                  {data.length} PO
                </span>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* 1. INITIAL STATE: DUAL UPLOAD CONTAINERS (Standard 15-Column) */}
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

            {/* Quick Specifications Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div className="p-4 glass-card rounded-2xl flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#1E2024]">
                    Convert ke Excel Otomatis
                  </h4>
                  <p className="text-xs text-[#5C6068] mt-1 leading-relaxed">
                    Menyusun data mentah dari ERP ke dalam format file excel yang terusun rapi dan akurat secara otomatis
                  </p>
                </div>
              </div>

              <div className="p-4 glass-card rounded-2xl flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#EA5413] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Cpu className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#1E2024]">
                    Deteksi SJ & Fallback
                  </h4>
                  <p className="text-xs text-[#5C6068] mt-1 leading-relaxed">
                    Membaca surat jalan terbaru (P26) dan otomatis fallback ke QTY PO jika belum dikirim.
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
                    Mengalokasikan stok gudang sesuai urutan tanggal PO terlama untuk sisa OS di bawah 51 pcs.
                  </p>
                </div>
              </div>
            </div>
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
              onDownloadActiveExcel={() => handleDownloadExcel('ALL')}
              onDownloadAllZip={convertedFiles.length > 1 ? handleDownloadAllZip : undefined}
              onDownloadMasterCombined={
                convertedFiles.length > 1 ? handleDownloadMasterCombined : undefined
              }
              onAddMoreFiles={handleMultipleFilesSelected}
              onReset={handleReset}
              isZipping={isZipping}
              isMerging={isMerging}
            />

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

            {/* Bottom Quick Notice */}
            <div className="p-4 glass-panel rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-[#5C6068]">
                <Info className="w-4 h-4 text-[#EA5413] shrink-0" />
                <span>
                  {convertedFiles.length > 1
                    ? `Sedang menganalisis 1 dari ${convertedFiles.length} file. Anda dapat berpindah file kapan saja melalui dropdown di atas.`
                    : 'Ingin memproses file lain? Klik "+ Tambah File" untuk menambah file baru atau "Ganti File" untuk mulai dari awal.'}
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
          <span className="font-medium text-[#1E2024]">Developed by <strong className="font-semibold text-[#EA5413]">VINNS</strong></span>
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
    </div>
  );
}
