import React, { useRef } from 'react';
import {
  FileSpreadsheet,
  Download,
  FolderArchive,
  RefreshCw,
  Upload,
  ChevronDown,
  Layers,
  Sparkles,
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
    <div className="p-3 sm:p-4 glass-panel rounded-3xl">
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
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0" />
            <label
              htmlFor="active-file-dropdown"
              className="text-xs font-semibold text-[#1E2024] tracking-wide whitespace-nowrap"
            >
              Pilih File:
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
              className="w-full appearance-none bg-white/80 hover:bg-white/95 border border-white/90 rounded-full px-4 py-2 pr-9 text-xs font-semibold text-[#1E2024] focus:outline-none focus:ring-2 focus:ring-[#FF7B35]/40 cursor-pointer shadow-sm truncate transition-all"
            >
              {files.map((file, idx) => {
                const poCount = file.data ? file.data.length : 0;
                return (
                  <option key={file.id} value={file.id} className="bg-white text-[#1E2024]">
                    {idx + 1}. {file.rawFileName} ({poCount} PO)
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {files.length > 1 && (
            <span className="text-[11px] font-mono text-[#5C6068] shrink-0 hidden sm:inline">
              {activeIndex + 1} dari {files.length} File
            </span>
          )}
        </div>

        {/* Right: Liquid Glass Quick Action Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Download Active File (Orange Liquid Glass Button) */}
          <button
            type="button"
            id="btn-download-active-file"
            onClick={() => {
              haptic.success();
              onDownloadActiveExcel();
            }}
            className="liquid-glass-orange inline-flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-wider cursor-pointer"
            title="Download file Excel yang sedang dipilih"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Excel</span>
          </button>

          {/* Download All as ZIP (if multiple files) */}
          {files.length > 1 && onDownloadAllZip && (
            <button
              type="button"
              id="btn-download-all-zip"
              onClick={onDownloadAllZip}
              disabled={isZipping}
              className="liquid-glass-clear inline-flex items-center gap-1.5 px-3.5 py-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
              title="Unduh seluruh file hasil konversi dalam 1 arsip .zip"
            >
              <FolderArchive className="w-3.5 h-3.5 text-[#19719C]" />
              <span>{isZipping ? 'Mengompres...' : 'Unduh Zip'}</span>
            </button>
          )}

          {/* Consolidate into Master Combined Workbook */}
          {files.length > 1 && onDownloadMasterCombined && (
            <button
              type="button"
              id="btn-download-master-combined"
              onClick={onDownloadMasterCombined}
              disabled={isMerging}
              className="liquid-glass-clear inline-flex items-center gap-1.5 px-3.5 py-2 text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
              title="Gabungkan semua file menjadi 1 file Excel master"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isMerging ? 'Menggabung...' : 'Gabung Master'}</span>
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
            className="liquid-glass-clear inline-flex items-center gap-1.5 px-3.5 py-2 text-xs uppercase tracking-wider cursor-pointer"
            title="Tambah file lain ke daftar ini"
          >
            <Upload className="w-3.5 h-3.5 text-[#19719C]" />
            <span>+ Tambah</span>
          </button>

          {/* Reset / Upload New */}
          <button
            type="button"
            id="btn-reset-all-files"
            onClick={() => {
              haptic.heavy();
              onReset();
            }}
            className="liquid-glass-clear inline-flex items-center gap-1 px-3 py-2 text-xs uppercase tracking-wider cursor-pointer text-zinc-500 hover:text-zinc-800"
            title="Ganti file / kembali ke halaman upload"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ganti</span>
          </button>
        </div>
      </div>
    </div>
  );
};
