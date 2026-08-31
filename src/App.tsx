import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { ExtractedRecord, ParseSummary } from './types';
import { parseExcelBuffer } from './utils/parserEngine';
import { exportToExcel } from './utils/excelExporter';
import { shareToWhatsApp, generateWhatsAppSummary, copyToClipboard } from './utils/whatsappHelper';
import { DropZone } from './components/DropZone';
import { StatsOverview } from './components/StatsOverview';
import { ActionToolbar } from './components/ActionToolbar';
import { DataTable } from './components/DataTable';
import { WhatsAppModal } from './components/WhatsAppModal';
import { ParserRulesModal } from './components/ParserRulesModal';
import {
  FileSpreadsheet,
  CheckCircle2,
  Database,
  Cpu,
  Download,
  Share2,
  Info,
  Layers,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function App() {
  const [data, setData] = useState<ExtractedRecord[]>([]);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [rawWorkbook, setRawWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);

  // Modals & UI state
  const [isWAModalOpen, setIsWAModalOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleFileLoaded = (
    buffer: ArrayBuffer,
    fileName: string,
    triggerCelebration: boolean = true
  ) => {
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage('Membaca & memproses hierarki data ERP...');
    setFileBuffer(buffer);
    setCurrentFileName(fileName);

    // Give UI a brief frame to show loading state smoothly
    setTimeout(() => {
      try {
        const { data: parsedData, summary: parsedSummary, workbook } = parseExcelBuffer(
          buffer,
          fileName
        );

        if (!parsedData || parsedData.length === 0) {
          throw new Error(
            'Tidak ada data Purchase Order (SH-/ST- dan DAP/PO) yang valid ditemukan pada sheet ini. Pastikan format file sesuai struktur ERP.'
          );
        }

        setData(parsedData);
        setSummary(parsedSummary);
        setRawWorkbook(workbook);
        setStatusMessage(
          `Success: ${parsedData.length} POs extracted dari ${parsedSummary.totalUniqueItems} artikel produk`
        );

        if (triggerCelebration) {
          confetti({
            particleCount: 70,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#10b981', '#38bdf8', '#fbbf24'],
          });
        }
      } catch (err: any) {
        console.error('Parsing error:', err);
        setErrorMessage(err?.message || 'Terjadi kesalahan saat memproses file Excel.');
        setStatusMessage(null);
      } finally {
        setIsLoading(false);
      }
    }, 120);
  };

  const handleSelectSheet = (sheetName: string) => {
    if (!fileBuffer || !currentFileName) return;
    setIsLoading(true);
    setTimeout(() => {
      try {
        const { data: parsedData, summary: parsedSummary, workbook } = parseExcelBuffer(
          fileBuffer,
          currentFileName,
          sheetName
        );
        setData(parsedData);
        setSummary(parsedSummary);
        setRawWorkbook(workbook);
        setStatusMessage(
          `Success: ${parsedData.length} POs extracted (Sheet: ${sheetName})`
        );
      } catch (err: any) {
        setErrorMessage(err?.message || 'Gagal membaca sheet.');
      } finally {
        setIsLoading(false);
      }
    }, 100);
  };

  const handleDownloadExcel = () => {
    if (!data || data.length === 0) return;
    exportToExcel(data, 'Rekap_Customer_Terbaru.xlsx');
  };

  const handleOpenWhatsApp = () => {
    if (!data || data.length === 0) return;
    setIsWAModalOpen(true);
  };

  const handleCopyWhatsAppText = async () => {
    if (!data || data.length === 0) return;
    const text = generateWhatsAppSummary(data);
    const success = await copyToClipboard(text);
    if (success) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleReset = () => {
    setData([]);
    setSummary(null);
    setRawWorkbook(null);
    setFileBuffer(null);
    setCurrentFileName(null);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-[#F0F0EE] text-[#141414] font-sans selection:bg-[#FF6B35] selection:text-white pb-16">
      {/* Top Bento Header Bar */}
      <header className="border-b-2 border-[#141414] bg-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#141414] text-white border-2 border-[#141414] flex items-center justify-center shadow-[2px_2px_0px_#141414]">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm sm:text-base font-black uppercase tracking-tight text-[#141414]">
                  ERP DATA ENGINE // CLIENT EXCEL CONVERTER
                </h1>
                <span className="px-1.5 py-0.5 bg-[#DEDEDE] border border-[#141414] text-[#141414] text-[10px] font-mono font-bold uppercase tracking-wider">
                  BROWSER_ONLY_V2.0
                </span>
              </div>
              <p className="text-[11px] font-mono text-[#141414]/70 hidden sm:block">
                Master Rekapitulasi Stock & Sisa Order Status (OS) Customer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsRulesModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-[#F0F0EE] text-[#141414] border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 text-[#FF6B35]" />
              <span className="hidden sm:inline">Engine Rules</span>
            </button>

            {data.length > 0 && (
              <button
                type="button"
                id="header-btn-download"
                onClick={handleDownloadExcel}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#141414] hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download Excel</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Bento Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-5">
        {/* Visual Status Indicator Bento Card */}
        {statusMessage && (
          <div
            id="status-indicator-banner"
            className="p-3.5 px-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 bg-[#25D366] border border-[#141414] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-xs sm:text-sm uppercase tracking-tight text-[#141414]">{statusMessage}</span>
            </div>
            {summary && (
              <div className="flex items-center gap-3 text-[11px] text-[#141414]/70 font-mono">
                <span className="border border-[#141414] bg-[#F0F0EE] px-2 py-0.5 font-bold">FILE: {summary.fileName}</span>
                <span className="border border-[#141414] bg-[#F0F0EE] px-2 py-0.5 font-bold">TIME: {summary.parsedAt}</span>
              </div>
            )}
          </div>
        )}

        {/* Drag & Drop Upload Bento Grid */}
        {(!data || data.length === 0) && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Dropzone Column */}
              <div className="lg:col-span-8">
                <DropZone
                  onFileLoaded={handleFileLoaded}
                  isLoading={isLoading}
                  errorMessage={errorMessage}
                  currentFileName={currentFileName}
                />
              </div>

              {/* Bento Info Side Cards */}
              <div className="lg:col-span-4 flex flex-col justify-between gap-4">
                {/* Side Card 1: Parsing Logic */}
                <div className="p-5 bg-[#DEDEDE] border-2 border-[#141414] shadow-[2px_2px_0px_#141414] flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase tracking-wider text-[#141414]">Parsing Logic Active</span>
                      <Cpu className="w-4 h-4 text-[#141414]" />
                    </div>
                    <ul className="text-xs font-mono space-y-1.5 text-[#141414]/90 mt-3">
                      <li className="flex items-center gap-1.5">
                        <span className="font-bold text-[#141414]">✓</span> Detect Parent [SH-/ST-]
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="font-bold text-[#141414]">✓</span> Clean Date Prefixes from PO
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="font-bold text-[#141414]">✓</span> Overwrite Balances via P26
                      </li>
                      <li className="flex items-center gap-1.5">
                        <span className="font-bold text-[#141414]">✓</span> Zero-Delivery Auto-Fallback
                      </li>
                    </ul>
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#141414]/20 text-[10px] font-mono text-[#141414]/70 uppercase">
                    100% Client-side Processing
                  </div>
                </div>

                {/* Side Card 2: Output Schema */}
                <div className="p-5 bg-[#FF6B35] border-2 border-[#141414] text-white shadow-[2px_2px_0px_#141414] flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-white/90">Output Schema</span>
                    <div className="text-3xl font-black font-mono mt-1 mb-1">14 COLs</div>
                    <p className="text-xs font-mono text-white/90 leading-relaxed">
                      Strict ordering: CO, Artikel, Desc, No PO, Substance, QTY PO, Berat PO, Stock (pcs/kg), Sisa OS (pcs/kg), Terkirim (pcs/kg), Harga.
                    </p>
                  </div>
                  <div className="mt-3 text-[10px] font-mono uppercase text-white/80">
                    Standard Master Rekapitulasi
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Helper Explainer Bento Trio */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] flex items-start gap-3">
                <div className="w-8 h-8 bg-[#141414] text-white border border-[#141414] flex items-center justify-center shrink-0 mt-0.5">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-tight text-[#141414]">Standard 14 Columns</h4>
                  <p className="text-xs font-mono text-[#141414]/70 mt-1 leading-relaxed">
                    Auto-organizes messy raw ERP data into structured 14 master columns including CO, Sisa OS, and Terkirim calculation.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] flex items-start gap-3">
                <div className="w-8 h-8 bg-[#FF6B35] text-white border border-[#141414] flex items-center justify-center shrink-0 mt-0.5">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-tight text-[#141414]">P26 Sub-Child & Fallback</h4>
                  <p className="text-xs font-mono text-[#141414]/70 mt-1 leading-relaxed">
                    Accurately overwrites latest surat jalan delivery rows and safely falls back to full QTY PO when unsent.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] flex items-start gap-3">
                <div className="w-8 h-8 bg-[#25D366] text-white border border-[#141414] flex items-center justify-center shrink-0 mt-0.5">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-tight text-[#141414]">Instant WhatsApp Report</h4>
                  <p className="text-xs font-mono text-[#141414]/70 mt-1 leading-relaxed">
                    Generate WhatsApp formatted text with outstanding summary and share directly to customers or logistics teams.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Extracted Dashboard View */}
        {data && data.length > 0 && summary && (
          <div className="space-y-5 animate-fade-in">
            {/* Top Bento Stats Overview */}
            <StatsOverview summary={summary} />

            {/* Action Buttons Bento Toolbar */}
            <ActionToolbar
              onDownloadExcel={handleDownloadExcel}
              onOpenWhatsApp={handleOpenWhatsApp}
              onCopyWhatsAppText={handleCopyWhatsAppText}
              onReset={handleReset}
              onToggleDoc={() => setIsRulesModalOpen(true)}
              isCopied={isCopied}
              sheets={summary.sheetNames}
              activeSheet={summary.activeSheetName}
              onSelectSheet={handleSelectSheet}
              totalRecords={data.length}
            />

            {/* Main Data Table */}
            <DataTable data={data} />

            {/* Bottom Quick Actions Bento Card */}
            <div className="p-5 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-xs font-mono text-[#141414]/80">
                <Info className="w-4 h-4 text-[#FF6B35] shrink-0" />
                <span>
                  Ingin memproses file ERP lain? Klik tombol di samping untuk mengunggah file baru.
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  id="btn-bottom-reset"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#141414] hover:bg-black text-white border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Upload File Baru</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <WhatsAppModal
        isOpen={isWAModalOpen}
        onClose={() => setIsWAModalOpen(false)}
        data={data}
      />

      <ParserRulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
      />
    </div>
  );
}
