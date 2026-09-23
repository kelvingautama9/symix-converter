import React, { useRef } from 'react';
import {
  FileSpreadsheet,
  Download,
  Archive,
  Upload,
  RefreshCw,
  ChevronDown,
  Layers,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { haptic } from '../utils/haptics';

export interface ConvertedFileItem {
  id: string;
  rawFileName: string;
  fileSize: number;
  data: any[];
  summary: any;
  rawBuffer: ArrayBuffer;
  rawWorkbook: any;
  excelBlob?: Blob;
  outputFileName?: string;
  durationMs?: number;
}

interface FileSwitcherBarProps {
  files: ConvertedFileItem[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onDownloadActiveExcel: () => void;
  onDownloadAllZip?: () => void;
  onDownloadMasterCombined?: () => void;
  onAddMoreFiles: (files: File[]) => void;
  onReset: () => void;
  isZipping?: boolean;
  isMerging?: boolean;
}

export const FileSwitcherBar: React.FC<FileSwitcherBarProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onDownloadActiveExcel,
  onDownloadAllZip,
  onDownloadMasterCombined,
  onAddMoreFiles,
  onReset,
  isZipping = false,
  isMerging = false,
}) => {
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const activeIndex = files.findIndex((f) => f.id === activeFileId);
  const activeFile = files[activeIndex] || files[0];

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      haptic.medium();
      onAddMoreFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <div className="p-3 sm:p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_#141414]">
      {/* Hidden file input for adding more files */}
      <input
        type="file"
        ref={addFileInputRef}
        onChange={handleAddFiles}
        multiple
        accept=".xlsx,.xls,.csv"
        className="hidden"
        id="add-more-files-input"
      />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left: Dropdown File Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#25D366] shrink-0" />
            <label
              htmlFor="active-file-dropdown"
              className="text-xs font-mono font-bold text-[#141414] uppercase tracking-wide whitespace-nowrap"
            >
              Pilih File Analisis:
            </label>
          </div>

          <div className="relative flex-1 max-w-xl">
            <select
              id="active-file-dropdown"
              value={activeFileId}
              onChange={(e) => {
                haptic.selection();
                onSelectFile(e.target.value);
              }}
              className="w-full appearance-none bg-[#F0F0EE] hover:bg-[#E5E5E3] border-2 border-[#141414] px-3 py-2 pr-9 text-xs font-mono font-bold text-[#141414] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] cursor-pointer shadow-[1px_1px_0px_#141414] truncate"
            >
              {files.map((file, idx) => {
                const poCount = file.data ? file.data.length : 0;
                return (
                  <option key={file.id} value={file.id} className="bg-white text-[#141414]">
                    {idx + 1}. {file.rawFileName} ({poCount} PO)
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-4 h-4 text-[#141414] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {files.length > 1 && (
            <span className="text-[11px] font-mono text-[#141414]/70 shrink-0 hidden sm:inline">
              File {activeIndex + 1} dari {files.length}
            </span>
          )}
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Download Active File */}
          <button
            type="button"
            id="btn-download-active-file"
            onClick={() => {
              haptic.success();
              onDownloadActiveExcel();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#141414] hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[38px]"
            title="Download file Excel yang sedang dipilih"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Unduh Excel</span>
          </button>

          {/* Download All as ZIP (if multiple files) */}
          {files.length > 1 && onDownloadAllZip && (
            <button
              type="button"
              id="btn-download-all-zip"
              onClick={() => {
                haptic.medium();
                onDownloadAllZip();
              }}
              disabled={isZipping}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-bold uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50 min-h-[38px]"
              title="Unduh seluruh file terconvert dalam 1 file .zip"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Unduh Semua (.zip)</span>
              <span className="px-1.5 py-0.2 bg-black/20 text-[10px] font-mono rounded">
                {files.length}
              </span>
            </button>
          )}

          {/* Download Master Gabungan (if multiple files) */}
          {files.length > 1 && onDownloadMasterCombined && (
            <button
              type="button"
              id="btn-download-master-combined"
              onClick={() => {
                haptic.medium();
                onDownloadMasterCombined();
              }}
              disabled={isMerging}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F0F0EE] text-[#141414] text-xs font-bold uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50 min-h-[38px] hidden md:inline-flex"
              title="Gabungkan semua file menjadi 1 file Excel master"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Gabung Master</span>
            </button>
          )}

          {/* Add more files */}
          <button
            type="button"
            id="btn-add-more-files"
            onClick={() => {
              haptic.selection();
              addFileInputRef.current?.click();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F0F0EE] text-[#141414] text-xs font-bold uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[38px]"
            title="Tambah file lain ke daftar ini"
          >
            <Upload className="w-3.5 h-3.5 text-[#FF6B35]" />
            <span>+ Tambah File</span>
          </button>

          {/* Reset / Upload New */}
          <button
            type="button"
            id="btn-reset-all-files"
            onClick={() => {
              haptic.heavy();
              onReset();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-2 bg-[#DEDEDE] hover:bg-[#c9c9c9] text-[#141414] text-xs font-bold uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[38px]"
            title="Ganti file / kembali ke halaman upload"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ganti File</span>
          </button>
        </div>
      </div>
    </div>
  );
};
