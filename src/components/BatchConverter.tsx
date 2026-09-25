import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Upload,
  Files,
  FileSpreadsheet,
  Download,
  Archive,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  Layers,
  ChevronRight,
  Filter,
  Search,
  Check,
  Eye,
  FileText,
  Boxes,
  PackageCheck,
  ArrowRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BatchFileItem, ExcelExportScope, ExtractedRecord } from '../types';
import {
  convertSingleRawFile,
  downloadAllAsZip,
  exportCombinedMasterWorkbook,
  downloadBlob,
  computeBatchStats,
} from '../utils/batchConverter';
import { haptic } from '../utils/haptics';
import { calculatePoAging } from '../utils/agingUtils';

interface BatchConverterProps {
  onInspectFileInSingleMode?: (data: ExtractedRecord[], fileName: string, buffer?: ArrayBuffer) => void;
  onOpenAIChat?: () => void;
}

export function BatchConverter({
  onInspectFileInSingleMode,
  onOpenAIChat,
}: BatchConverterProps) {
  const [items, setItems] = useState<BatchFileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [selectedScope, setSelectedScope] = useState<ExcelExportScope>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'ERROR' | 'PENDING'>('ALL');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);

  // Quick preview modal state for a single item
  const [previewItem, setPreviewItem] = useState<BatchFileItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Aggregate stats across all items
  const stats = useMemo(() => computeBatchStats(items), [items]);

  // Overall progress percentage
  const progressPercent = useMemo(() => {
    if (items.length === 0) return 0;
    const finished = items.filter((i) => i.status === 'success' || i.status === 'error').length;
    return Math.round((finished / items.length) * 100);
  }, [items]);

  // Filtered items based on search and status
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        searchQuery.trim() === '' ||
        item.rawFileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.outputFileName && item.outputFileName.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchStatus = true;
      if (statusFilter === 'SUCCESS') matchStatus = item.status === 'success';
      else if (statusFilter === 'ERROR') matchStatus = item.status === 'error';
      else if (statusFilter === 'PENDING') matchStatus = item.status === 'pending' || item.status === 'processing';

      return matchSearch && matchStatus;
    });
  }, [items, searchQuery, statusFilter]);

  // Add files to the batch list
  const addFilesToBatch = (fileList: FileList | File[]) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const newItems: BatchFileItem[] = [];

    const filesArray = Array.from(fileList);
    for (const file of filesArray) {
      const lower = file.name.toLowerCase();
      const isValid = validExtensions.some((ext) => lower.endsWith(ext));
      if (!isValid) continue;

      const id = `${file.name}_${file.size}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      newItems.push({
        id,
        file,
        rawFileName: file.name,
        rawFileSize: file.size,
        status: 'pending',
      });
    }

    if (newItems.length === 0) {
      setActionMessage('Tidak ada file Excel (.xlsx, .xls) atau CSV valid yang dipilih.');
      return;
    }

    haptic.selection();
    setItems((prev) => [...prev, ...newItems]);
    setActionMessage(`${newItems.length} file baru ditambahkan ke antrean konversi.`);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToBatch(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToBatch(e.dataTransfer.files);
    }
  };

  // Convert all pending or requested items
  const startConversion = async (itemsToConvert?: BatchFileItem[]) => {
    const targetItems = itemsToConvert || items.filter((i) => i.status === 'pending' || i.status === 'error');
    if (targetItems.length === 0) {
      setActionMessage('Semua file dalam antrean sudah selesai dikonversi.');
      return;
    }

    setIsProcessing(true);
    haptic.medium();

    // Process sequentially or small concurrency to keep browser responsive
    for (const item of targetItems) {
      // Set current item status to processing
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'processing', errorMessage: undefined } : i))
      );

      try {
        const result = await convertSingleRawFile(item.file, selectedScope);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: 'success',
                  data: result.data,
                  summary: result.summary,
                  excelBlob: result.excelBlob,
                  outputFileName: result.outputFileName,
                  durationMs: result.durationMs,
                  rawBuffer: result.rawBuffer,
                }
              : i
          )
        );
      } catch (err: any) {
        console.error(`Error converting ${item.rawFileName}:`, err);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: 'error',
                  errorMessage: err?.message || 'Gagal memproses file.',
                }
              : i
          )
        );
      }
    }

    setIsProcessing(false);
    haptic.success();
    confetti({
      particleCount: 80,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#22c55e', '#3b82f6', '#f59e0b'],
    });
    setActionMessage('Konversi batch selesai! Anda dapat mengunduh seluruh file secara instan.');
  };

  // Single file conversion retry
  const handleRetrySingle = async (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    await startConversion([item]);
  };

  // Single file direct download
  const handleDownloadSingle = (item: BatchFileItem) => {
    if (!item.excelBlob || !item.outputFileName) return;
    haptic.success();
    downloadBlob(item.excelBlob, item.outputFileName);
  };

  // Download all as ZIP
  const handleDownloadZip = async () => {
    const successful = items.filter((i) => i.status === 'success' && i.excelBlob);
    if (successful.length === 0) {
      setActionMessage('Belum ada file yang berhasil dikonversi untuk diunduh.');
      return;
    }

    setIsZipping(true);
    haptic.medium();
    try {
      const res = await downloadAllAsZip(items, 'BLACKEYE_BATCH_EXCEL');
      if (res.success) {
        haptic.success();
        confetti({
          particleCount: 70,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#22c55e', '#FF6B35', '#2563eb'],
        });
        setActionMessage(`File ZIP "${res.zipFileName}" (${res.count} file Excel) berhasil diunduh!`);
      }
    } catch (err: any) {
      setActionMessage(err?.message || 'Gagal membuat file ZIP.');
      haptic.error();
    } finally {
      setIsZipping(false);
    }
  };

  // Merge all into 1 Master Combined Excel file
  const handleDownloadMasterCombined = () => {
    const successful = items.filter((i) => i.status === 'success' && i.data);
    if (successful.length === 0) {
      setActionMessage('Belum ada file yang berhasil dikonversi untuk digabungkan.');
      return;
    }

    setIsMerging(true);
    haptic.medium();
    try {
      const filename = exportCombinedMasterWorkbook(items, selectedScope);
      haptic.success();
      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#FF6B35', '#2563eb'],
      });
      setActionMessage(`Master Excel gabungan "${filename}" (${successful.length} file) berhasil diunduh!`);
    } catch (err: any) {
      setActionMessage(err?.message || 'Gagal menggabungkan file ke Master Excel.');
      haptic.error();
    } finally {
      setIsMerging(false);
    }
  };

  // Remove single item
  const handleRemoveItem = (itemId: string) => {
    haptic.selection();
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    if (previewItem?.id === itemId) setPreviewItem(null);
  };

  // Clear all items
  const handleClearAll = () => {
    if (items.length === 0) return;
    haptic.heavy();
    setItems([]);
    setPreviewItem(null);
    setActionMessage(null);
  };

  // Automatically start conversion when user drops files if not already processing
  useEffect(() => {
    const pendingCount = items.filter((i) => i.status === 'pending').length;
    if (pendingCount > 0 && !isProcessing) {
      startConversion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Banner Action Message */}
      {actionMessage && (
        <div className="p-3 px-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] flex items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-[#141414]">
            <CheckCircle2 className="w-4 h-4 text-[#25D366] shrink-0" />
            <span className="font-bold">{actionMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-[11px] font-bold uppercase underline cursor-pointer hover:text-[#FF6B35]"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Top Bento Control Hub */}
      <div className="p-5 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 bg-[#FF6B35] text-white text-[10px] font-mono font-bold uppercase tracking-wider">
                UNLIMITED BATCH CONVERTER
              </span>
              <span className="px-2 py-0.5 bg-[#141414] text-white text-[10px] font-mono font-bold uppercase tracking-wider">
                AUTO-CONVERT KE EXCEL
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-[#141414] mt-1">
              Konversi Sekaligus Banyak File Mentah ERP ke Excel
            </h2>
            <p className="text-xs font-mono text-[#141414]/70 mt-0.5">
              Upload puluhan hingga ratusan file mentah SYMIX sekaligus. Sistem langsung mengonversi menjadi file Excel siap pakai dalam 1 klik.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              multiple
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => {
                haptic.selection();
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F0F0EE] text-[#141414] border-2 border-[#141414] text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#FF6B35]" />
              <span>+ Tambah File</span>
            </button>

            {items.some((i) => i.status === 'pending' || i.status === 'error') && (
              <button
                type="button"
                onClick={() => startConversion()}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FF6B35] hover:bg-[#e05624] text-white border-2 border-[#141414] text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>{isProcessing ? 'Mengonversi...' : 'Konversi Semua'}</span>
              </button>
            )}

            {stats.completedFiles > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  disabled={isZipping}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#25D366] hover:bg-[#20ba5a] text-white border-2 border-[#141414] text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50"
                  title="Unduh seluruh file Excel hasil konversi dalam 1 arsip ZIP"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Download Semua (.ZIP)</span>
                  <span className="ml-0.5 px-1.5 py-0.2 bg-black/20 text-[10px] font-mono rounded">
                    {stats.completedFiles} File
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadMasterCombined}
                  disabled={isMerging}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#141414] hover:bg-black text-white border-2 border-[#141414] text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50"
                  title="Gabungkan seluruh data file menjadi 1 file Excel Master dengan tab per customer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Gabung ke 1 Master Excel</span>
                </button>
              </>
            )}

            {items.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1 px-2.5 py-2 bg-white hover:bg-red-50 text-red-600 border-2 border-[#141414] text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                title="Kosongkan seluruh antrean"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Hapus Semua</span>
              </button>
            )}
          </div>
        </div>

        {/* Scope Selector & Settings Bar */}
        <div className="mt-4 pt-3 border-t-2 border-[#141414]/15 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#141414] uppercase text-[11px] flex items-center gap-1">
              <Filter className="w-3 h-3 text-[#FF6B35]" />
              Filter Scope Hasil Export:
            </span>
            <div className="flex flex-wrap gap-1">
              {[
                { id: 'ALL', label: 'Semua CO (Default)' },
                { id: 'OPEN_ONLY', label: 'Khusus CO Open' },
                { id: 'CLOSED_ONLY', label: 'Khusus CO Closed' },
                { id: 'STOCK_READY_ALL', label: 'Stock Ready (Semua CO)' },
                { id: 'STOCK_READY_OPEN', label: 'Stock Ready (CO Open)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setSelectedScope(opt.id as ExcelExportScope);
                    // If items already exist, offer re-export
                  }}
                  className={`px-2 py-1 border border-[#141414] text-[11px] font-bold uppercase transition-all cursor-pointer ${
                    selectedScope === opt.id
                      ? 'bg-[#141414] text-white shadow-[1px_1px_0px_#141414]'
                      : 'bg-white hover:bg-[#F0F0EE] text-[#141414]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-[#141414]/70">
            {stats.completedFiles} dari {stats.totalFiles} file selesai ({progressPercent}%)
          </div>
        </div>

        {/* Animated Progress Bar */}
        {items.length > 0 && (
          <div className="mt-3">
            <div className="w-full h-3 bg-[#E5E5E5] border border-[#141414] overflow-hidden p-0.5">
              <div
                className="h-full bg-[#25D366] transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Aggregate Stats Cards */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
            <span className="text-[10px] font-mono uppercase text-[#141414]/60 font-bold block">Total File</span>
            <div className="text-xl font-black font-mono mt-0.5 text-[#141414]">{stats.totalFiles}</div>
            <span className="text-[10px] font-mono text-[#25D366] font-bold">
              {stats.completedFiles} Sukses {stats.failedFiles > 0 ? `• ${stats.failedFiles} Gagal` : ''}
            </span>
          </div>

          <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
            <span className="text-[10px] font-mono uppercase text-[#141414]/60 font-bold block">Total PO Extracted</span>
            <div className="text-xl font-black font-mono mt-0.5 text-[#141414]">{stats.totalPOs.toLocaleString('id-ID')}</div>
            <span className="text-[10px] font-mono text-[#141414]/60">{stats.totalUniqueArticles} Artikel</span>
          </div>

          <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
            <span className="text-[10px] font-mono uppercase text-[#141414]/60 font-bold block">Total QTY Order</span>
            <div className="text-xl font-black font-mono mt-0.5 text-[#141414]">{stats.totalQtyPcs.toLocaleString('id-ID')}</div>
            <span className="text-[10px] font-mono text-[#141414]/60">PCS</span>
          </div>

          <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
            <span className="text-[10px] font-mono uppercase text-[#141414]/60 font-bold block">Total Sisa OS</span>
            <div className="text-xl font-black font-mono mt-0.5 text-amber-600">{stats.totalSisaOSPcs.toLocaleString('id-ID')}</div>
            <span className="text-[10px] font-mono text-amber-700">PCS Terutang</span>
          </div>

          <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
            <span className="text-[10px] font-mono uppercase text-[#141414]/60 font-bold block">Total Terkirim</span>
            <div className="text-xl font-black font-mono mt-0.5 text-[#25D366]">{stats.totalTerkirimPcs.toLocaleString('id-ID')}</div>
            <span className="text-[10px] font-mono text-[#25D366]">PCS Delivery</span>
          </div>

          <div className="p-3 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
            <span className="text-[10px] font-mono uppercase text-[#141414]/60 font-bold block">Stock Ready (FIFO)</span>
            <div className="text-xl font-black font-mono mt-0.5 text-[#2563EB]">{stats.totalStockPcs.toLocaleString('id-ID')}</div>
            <span className="text-[10px] font-mono text-[#2563EB]">PCS Siap Kirim</span>
          </div>
        </div>
      )}

      {/* Drag & Drop Multi-File Zone */}
      {items.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-10 sm:p-14 border-2 border-dashed transition-all cursor-pointer text-center bg-white shadow-[2px_2px_0px_#141414] ${
            isDragOver
              ? 'border-[#FF6B35] bg-[#FFF5F0]'
              : 'border-[#141414] hover:bg-[#F9F9F8]'
          }`}
        >
          <div className="w-16 h-16 bg-[#141414] text-white border-2 border-[#141414] flex items-center justify-center mx-auto mb-4 shadow-[2px_2px_0px_#141414]">
            <Files className="w-8 h-8 text-[#FF6B35]" />
          </div>
          <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-[#141414]">
            Tarik & Lepas Banyak File Mentah Sekaligus ke Sini
          </h3>
          <p className="text-xs font-mono text-[#141414]/70 mt-1 max-w-lg mx-auto">
            Bebas tanpa batas jumlah file. Pilih puluhan file ERP (.xlsx, .xls, .csv). Seluruh file akan langsung diproses dan siap diunduh dalam format Excel 15 kolom terstandarisasi.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-[#141414] hover:bg-black text-white text-xs font-bold uppercase tracking-wider shadow-[2px_2px_0px_#141414]">
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Pilih Banyak File dari Komputer</span>
          </div>
        </div>
      ) : (
        /* File List Table & Management */
        <div className="p-5 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] space-y-4">
          {/* List Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#141414]/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama file dalam antrean..."
                className="w-full pl-9 pr-3 py-1.5 border-2 border-[#141414] bg-white text-xs font-mono text-[#141414] placeholder:text-[#141414]/40 focus:outline-none focus:ring-1 focus:ring-[#FF6B35]"
              />
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              {(['ALL', 'SUCCESS', 'PENDING', 'ERROR'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setStatusFilter(st);
                  }}
                  className={`px-2.5 py-1 border border-[#141414] text-[10px] font-mono font-bold uppercase cursor-pointer ${
                    statusFilter === st
                      ? 'bg-[#141414] text-white'
                      : 'bg-[#F0F0EE] hover:bg-white text-[#141414]'
                  }`}
                >
                  {st === 'ALL' && `Semua (${items.length})`}
                  {st === 'SUCCESS' && `Sukses (${stats.completedFiles})`}
                  {st === 'PENDING' && `Proses/Antre (${items.filter((i) => i.status === 'pending' || i.status === 'processing').length})`}
                  {st === 'ERROR' && `Gagal (${stats.failedFiles})`}
                </button>
              ))}
            </div>
          </div>

          {/* Table List of Converted Files */}
          <div className="border-2 border-[#141414] overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="bg-[#141414] text-white text-[11px] font-bold uppercase tracking-wider">
                  <th className="p-2.5 px-3 border-r border-[#333]">No</th>
                  <th className="p-2.5 px-3 border-r border-[#333]">File Asal (Mentah)</th>
                  <th className="p-2.5 px-3 border-r border-[#333]">File Hasil (.xlsx)</th>
                  <th className="p-2.5 px-3 border-r border-[#333]">Status</th>
                  <th className="p-2.5 px-3 border-r border-[#333] text-right">PO</th>
                  <th className="p-2.5 px-3 border-r border-[#333] text-right">QTY Order</th>
                  <th className="p-2.5 px-3 border-r border-[#333] text-right">Sisa OS</th>
                  <th className="p-2.5 px-3 border-r border-[#333] text-right">Stock Ready</th>
                  <th className="p-2.5 px-3 text-center">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141414]/20">
                {filteredItems.map((item, idx) => {
                  const fileSizeStr =
                    item.rawFileSize > 1024 * 1024
                      ? `${(item.rawFileSize / (1024 * 1024)).toFixed(2)} MB`
                      : `${(item.rawFileSize / 1024).toFixed(1)} KB`;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-[#F9F9F8] transition-colors"
                    >
                      <td className="p-2.5 px-3 border-r border-[#141414]/20 font-bold text-[#141414]/70">
                        {idx + 1}
                      </td>
                      <td className="p-2.5 px-3 border-r border-[#141414]/20 font-bold text-[#141414] max-w-[220px] truncate">
                        <div className="flex items-center gap-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-[#141414]/60 shrink-0" />
                          <span title={item.rawFileName} className="truncate">
                            {item.rawFileName}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#141414]/50 block">
                          {fileSizeStr} {item.durationMs ? `• ${item.durationMs}ms` : ''}
                        </span>
                      </td>
                      <td className="p-2.5 px-3 border-r border-[#141414]/20 font-bold text-emerald-800 max-w-[220px] truncate">
                        {item.outputFileName ? (
                          <span title={item.outputFileName} className="truncate">
                            {item.outputFileName}
                          </span>
                        ) : (
                          <span className="text-[#141414]/40">-</span>
                        )}
                      </td>
                      <td className="p-2.5 px-3 border-r border-[#141414]/20 whitespace-nowrap">
                        {item.status === 'success' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#25D366]/15 border border-[#25D366] text-[#16853f] font-bold text-[10px] uppercase">
                            <Check className="w-3 h-3 text-[#25D366]" />
                            Sukses
                          </span>
                        )}
                        {item.status === 'processing' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-400 text-amber-700 font-bold text-[10px] uppercase animate-pulse">
                            <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                            Memproses...
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 border border-gray-400 text-gray-700 font-bold text-[10px] uppercase">
                            <Clock className="w-3 h-3" />
                            Antre
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span
                            title={item.errorMessage}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 border border-red-500 text-red-700 font-bold text-[10px] uppercase cursor-help"
                          >
                            <AlertCircle className="w-3 h-3" />
                            Gagal
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 px-3 border-r border-[#141414]/20 text-right font-bold">
                        {item.summary ? item.summary.totalPOs.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="p-2.5 px-3 border-r border-[#141414]/20 text-right">
                        {item.summary ? item.summary.totalQtyOrderPcs.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="p-2.5 px-3 border-r border-[#141414]/20 text-right text-amber-700 font-bold">
                        {item.summary ? item.summary.totalSisaOSPcs.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="p-2.5 px-3 border-r border-[#141414]/20 text-right text-blue-700 font-bold">
                        {item.summary ? item.summary.totalStockPcs.toLocaleString('id-ID') : '-'}
                      </td>
                      <td className="p-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {item.status === 'success' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleDownloadSingle(item)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-[#141414] hover:bg-black text-white text-[11px] font-bold uppercase transition-all shadow-[1px_1px_0px_#141414] cursor-pointer"
                                title="Download Excel yang sudah terconvert"
                              >
                                <Download className="w-3 h-3 text-emerald-400" />
                                <span>Unduh</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  haptic.selection();
                                  setPreviewItem(item);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-[#F0F0EE] text-[#141414] border border-[#141414] text-[11px] font-bold uppercase shadow-[1px_1px_0px_#141414] cursor-pointer"
                                title="Pratinjau cepat tabel file ini"
                              >
                                <Eye className="w-3 h-3 text-[#FF6B35]" />
                                <span>Preview</span>
                              </button>

                              {onInspectFileInSingleMode && item.data && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    haptic.medium();
                                    onInspectFileInSingleMode(
                                      item.data!,
                                      item.rawFileName,
                                      item.rawBuffer
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-[#F0F0EE] hover:bg-[#E5E5E3] text-[#141414] border border-[#141414] text-[10px] font-bold uppercase shadow-[1px_1px_0px_#141414] cursor-pointer"
                                  title="Buka file ini di Halaman Analisis Tunggal lengkap"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span className="hidden md:inline">Analisis</span>
                                </button>
                              )}
                            </>
                          )}

                          {item.status === 'error' && (
                            <button
                              type="button"
                              onClick={() => handleRetrySingle(item.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold uppercase cursor-pointer"
                              title="Coba konversi ulang file ini"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Ulang</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors cursor-pointer"
                            title="Hapus dari antrean"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-[#141414]/50">
                      Tidak ada file yang sesuai kriteria filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Quick Preview for a Single Batch Item */}
      {previewItem && previewItem.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border-2 border-[#141414] shadow-[6px_6px_0px_#141414] w-full max-w-5xl max-h-[90vh] flex flex-col animate-scale-in">
            {/* Header */}
            <div className="p-4 border-b-2 border-[#141414] flex items-center justify-between gap-3 bg-[#F0F0EE]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-[#FF6B35] text-white font-mono text-[10px] font-bold uppercase">
                    PREVIEW HASIL KONVERSI
                  </span>
                  <span className="font-mono text-xs text-[#141414]/70">
                    {previewItem.data.length} PO Records
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-black uppercase text-[#141414] mt-0.5 truncate max-w-xl">
                  {previewItem.rawFileName} → {previewItem.outputFileName}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSingle(previewItem)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-black text-white text-xs font-bold uppercase shadow-[2px_2px_0px_#141414] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download .xlsx</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="px-2.5 py-1.5 bg-white hover:bg-[#E5E5E3] text-[#141414] border border-[#141414] text-xs font-bold uppercase cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>

            {/* Table Preview */}
            <div className="flex-1 overflow-auto p-4">
              <div className="border border-[#141414] overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-[#141414] text-white text-[11px] font-bold uppercase">
                      <th className="p-2 border-r border-[#333]">CO</th>
                      <th className="p-2 border-r border-[#333]">Artikel</th>
                      <th className="p-2 border-r border-[#333]">Item Description</th>
                      <th className="p-2 border-r border-[#333]">Tgl Input PO</th>
                      <th className="p-2 border-r border-[#333]">No PO</th>
                      <th className="p-2 border-r border-[#333]">Substance</th>
                      <th className="p-2 border-r border-[#333] text-right">QTY PO</th>
                      <th className="p-2 border-r border-[#333] text-right">Berat PO</th>
                      <th className="p-2 border-r border-[#333] text-right">Stock (pcs)</th>
                      <th className="p-2 border-r border-[#333] text-right">Sisa OS</th>
                      <th className="p-2 border-r border-[#333] text-right">Terkirim</th>
                      <th className="p-2 border-r border-[#333] text-right bg-indigo-950 text-indigo-200">Over Stock</th>
                      <th className="p-2 border-r border-[#333] text-right bg-teal-950 text-teal-200">Over Kirim</th>
                      <th className="p-2 text-right">Harga</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141414]/20">
                    {previewItem.data.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#F9F9F8]">
                        <td className="p-2 border-r border-[#141414]/20 font-bold whitespace-nowrap">
                          {row.CO}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 font-bold whitespace-nowrap">
                          {row.Artikel}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 max-w-[200px] truncate" title={row['Item Description']}>
                          {row['Item Description']}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5 items-start">
                            <span>{row['Tanggal Input PO']}</span>
                            {(() => {
                              const aging = calculatePoAging(row['Tanggal Input PO']);
                              if (aging.category === 'UNKNOWN') return null;
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-medium border font-mono ${aging.badgeClass}`}
                                  title={`Umur PO: ${aging.days} hari (${aging.label})`}
                                >
                                  <span className={`w-1 h-1 rounded-full ${aging.dotClass}`} />
                                  <span>{aging.shortLabel}</span>
                                </span>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 whitespace-nowrap">
                          {row['No PO']}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 whitespace-nowrap">
                          {row.Substance}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 text-right font-bold">
                          {row['QTY PO (pcs)']}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 text-right">
                          {row['Berat PO (KG)']}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 text-right text-blue-700 font-bold">
                          {row['Stock (pcs)']}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 text-right text-amber-700 font-bold">
                          <div>
                            {row['Sisa OS (pcs)']}
                          </div>
                          {((row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)'] || 0) > 0) && (
                            <span
                              className="inline-flex items-center gap-1 px-1 py-0.2 rounded-full text-[8px] font-bold font-mono bg-indigo-500/10 text-indigo-700 border border-indigo-500/25"
                              title={`Over Stock: +${(row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)'] || 0).toLocaleString('id-ID')} pcs`}
                            >
                              +{(row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)'] || 0).toLocaleString('id-ID')} Over Stock
                            </span>
                          )}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 text-right text-green-700 font-bold">
                          <div>{row['Terkirim (PCS)']}</div>
                          {((row['Over Kiriman (PCS)'] || 0) > 0) && (
                            <span
                              className="inline-flex items-center gap-1 px-1 py-0.2 rounded-full text-[8px] font-bold font-mono bg-teal-500/15 text-teal-800 border border-teal-500/30"
                              title={`Over Kirim: +${(row['Over Kiriman (PCS)'] || 0).toLocaleString('id-ID')} pcs`}
                            >
                              +{(row['Over Kiriman (PCS)'] || 0).toLocaleString('id-ID')} Over SJ
                            </span>
                          )}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 text-right text-indigo-700 font-bold bg-indigo-50/50">
                          {((row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)'] || 0) > 0) ? (
                            `+${(row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)'] || 0).toLocaleString('id-ID')}`
                          ) : (
                            <span className="text-zinc-400 font-normal">0</span>
                          )}
                        </td>
                        <td className="p-2 border-r border-[#141414]/20 text-right text-teal-700 font-bold bg-teal-50/50">
                          {((row['Over Kiriman (PCS)'] || 0) > 0) ? (
                            `+${(row['Over Kiriman (PCS)'] || 0).toLocaleString('id-ID')}`
                          ) : (
                            <span className="text-zinc-400 font-normal">0</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {row.Harga ? row.Harga.toLocaleString('id-ID') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewItem.data.length > 50 && (
                <p className="text-[11px] font-mono text-[#141414]/60 text-center mt-3">
                  Menampilkan 50 baris pertama dari total {previewItem.data.length} baris PO. Unduh file Excel untuk melihat data lengkap.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
