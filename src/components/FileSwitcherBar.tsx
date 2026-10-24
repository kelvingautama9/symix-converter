import React, { useRef } from 'react';
import {
  FileSpreadsheet,
  FolderArchive,
  RefreshCw,
  Upload,
  ChevronDown,
} from 'lucide-react';
import { haptic } from '../utils/haptics';
import { useLanguage } from '../i18n/LanguageContext';

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
  onDownloadAllZip,
  onDownloadMasterCombined,
  onAddMoreFiles,
  onReset,
  isZipping = false,
  isMerging = false,
}) => {
  const { t } = useLanguage();
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const activeIndex = files.findIndex((f) => f.id === activeFileId);

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      haptic.medium();
      onAddMoreFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <div className="p-2.5 sm:px-4 sm:py-3 bg-white border border-slate-200 rounded-xl">
      <input
        type="file"
        ref={addFileInputRef}
        onChange={handleAddFiles}
        multiple
        accept=".xlsx,.xls,.csv"
        className="hidden"
        id="add-more-files-input"
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Left: File Selector */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <label
            htmlFor="active-file-dropdown"
            className="text-xs font-semibold text-slate-500 whitespace-nowrap shrink-0"
          >
            {t.fileLabel}
          </label>

          <div className="relative flex-1 max-w-md">
            <select
              id="active-file-dropdown"
              value={activeFileId}
              onChange={(e) => {
                haptic.selection();
                onSelectFile(e.target.value);
              }}
              className="w-full appearance-none bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg px-3 py-1.5 pr-8 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 cursor-pointer truncate transition-colors"
            >
              {files.map((file, idx) => {
                const poItemCount = file.data ? file.data.length : 0;
                const uniquePoCount =
                  file.summary?.totalUniquePONumbers ||
                  (file.data
                    ? new Set(
                        file.data
                          .map((r: any) => String(r['No PO'] || '').trim())
                          .filter((po: string) => po && po !== '-')
                      ).size
                    : 0) ||
                  poItemCount;
                return (
                  <option key={file.id} value={file.id} className="bg-white text-slate-900">
                    {idx + 1}. {file.rawFileName} ({uniquePoCount} {t.unitPoShort} · {poItemCount}{' '}
                    {t.unitItem})
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {files.length > 1 && (
            <span className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0 hidden md:inline">
              {activeIndex + 1}/{files.length}
            </span>
          )}
        </div>

        {/* Right: Quick File Actions */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {files.length > 1 && onDownloadAllZip && (
            <button
              type="button"
              id="btn-download-all-zip"
              onClick={onDownloadAllZip}
              disabled={isZipping}
              className="liquid-glass-clear inline-flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title={t.downloadZipBtn}
            >
              <FolderArchive className="w-3.5 h-3.5 text-slate-600" />
              <span>{isZipping ? t.processingMsg : t.zipAllBtn}</span>
            </button>
          )}

          {files.length > 1 && onDownloadMasterCombined && (
            <button
              type="button"
              id="btn-download-master-combined"
              onClick={onDownloadMasterCombined}
              disabled={isMerging}
              className="liquid-glass-clear inline-flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title={t.mergeMasterBtn}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isMerging ? t.processingMsg : t.mergeMasterShortBtn}</span>
            </button>
          )}

          <button
            type="button"
            id="btn-add-more-files"
            onClick={() => {
              haptic.selection();
              addFileInputRef.current?.click();
            }}
            className="liquid-glass-clear inline-flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap"
            title={t.addFileBtn}
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>{t.addFileBtn}</span>
          </button>

          <button
            type="button"
            id="btn-reset-all-files"
            onClick={() => {
              haptic.heavy();
              onReset();
            }}
            className="liquid-glass-clear inline-flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer text-slate-600 hover:text-slate-900 whitespace-nowrap"
            title={t.resetBtn}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t.changeFileBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
