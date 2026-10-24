// Dual Upload Container: Konversi 1 File & Konversi Banyak File (Format Standar 15 Kolom ERP)
import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Files,
  Upload,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { haptic } from '../utils/haptics';
import { useLanguage } from '../i18n/LanguageContext';

interface UploadDualContainerProps {
  onSingleFileSelected: (file: File) => void;
  onMultipleFilesSelected: (files: File[]) => void;
  isLoading: boolean;
  loadingMessage?: string | null;
  loadingProgress?: { current: number; total: number; fileName: string } | null;
  errorMessage?: string | null;
}

export const UploadDualContainer: React.FC<UploadDualContainerProps> = ({
  onSingleFileSelected,
  onMultipleFilesSelected,
  isLoading,
  loadingMessage,
  loadingProgress,
  errorMessage,
}) => {
  const { t } = useLanguage();
  const [isDragSingle, setIsDragSingle] = useState(false);
  const [isDragMulti, setIsDragMulti] = useState(false);

  const singleInputRef = useRef<HTMLInputElement>(null);
  const multiInputRef = useRef<HTMLInputElement>(null);

  const handleSingleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragSingle(false);
    if (isLoading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      haptic.medium();
      onSingleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleMultiDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragMulti(false);
    if (isLoading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      haptic.medium();
      onMultipleFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleSingleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      haptic.medium();
      onSingleFileSelected(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleMultiInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      haptic.medium();
      onMultipleFilesSelected(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={singleInputRef}
        onChange={handleSingleInputChange}
        accept=".xlsx,.xls,.csv"
        className="hidden"
        id="single-file-input"
      />
      <input
        type="file"
        ref={multiInputRef}
        onChange={handleMultiInputChange}
        multiple
        accept=".xlsx,.xls,.csv"
        className="hidden"
        id="multi-file-input"
      />

      {/* Loading Progress State */}
      {isLoading && (
        <div className="p-5 glass-panel rounded-3xl space-y-3 animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 border-2 border-[#EA5413] border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="font-semibold text-xs tracking-tight text-[#1E2024]">
                {loadingMessage || 'Memproses file...'}
              </span>
            </div>
            {loadingProgress && (
              <span className="text-xs font-mono font-medium text-[#5C6068]">
                {loadingProgress.current} / {loadingProgress.total} File
              </span>
            )}
          </div>

          {loadingProgress && (
            <div>
              <div className="w-full h-2.5 bg-zinc-200/60 rounded-full overflow-hidden p-0.5 backdrop-blur-sm">
                <div
                  className="h-full bg-gradient-to-r from-[#FF7B35] to-[#10B981] rounded-full transition-all duration-200 shadow-sm"
                  style={{
                    width: `${Math.round((loadingProgress.current / loadingProgress.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] font-mono text-[#5C6068] mt-1.5 truncate">
                File: {loadingProgress.fileName}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {errorMessage && !isLoading && (
        <div className="p-3.5 px-4 bg-red-500/10 border border-red-500/20 backdrop-blur-md rounded-2xl flex items-center gap-2.5 text-xs text-red-700 font-mono shadow-sm">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* Dual Upload Containers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {/* Container 1: Single Convert */}
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragSingle(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragSingle(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragSingle(false);
          }}
          onDrop={handleSingleDrop}
          onClick={() => {
            if (!isLoading) {
              haptic.light();
              singleInputRef.current?.click();
            }
          }}
          className={`cursor-pointer transition-colors bg-white border rounded-xl p-6 flex flex-col justify-between ${
            isDragSingle
              ? 'border-slate-900 bg-slate-50'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div>
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              {t.singleConvertTitle}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {t.singleConvertDesc}
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-[11px] font-mono text-slate-400">.xlsx · .xls</span>
            <button
              type="button"
              id="btn-single-browse"
              onClick={(e) => {
                e.stopPropagation();
                singleInputRef.current?.click();
              }}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 h-10 sm:h-11 min-w-[148px] sm:min-w-[160px] px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-800 shadow-2xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-4 h-4 text-slate-600 shrink-0" />
              <span>{t.singleConvertBtn}</span>
            </button>
          </div>
        </div>

        {/* Container 2: Multi Convert */}
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setIsDragMulti(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragMulti(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragMulti(false);
          }}
          onDrop={handleMultiDrop}
          onClick={() => {
            if (!isLoading) {
              haptic.light();
              multiInputRef.current?.click();
            }
          }}
          className={`cursor-pointer transition-colors bg-white border rounded-xl p-6 flex flex-col justify-between ${
            isDragMulti
              ? 'border-slate-900 bg-slate-50'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div>
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              {t.multiConvertTitle}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {t.multiConvertDesc}
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-[11px] font-mono text-slate-400">Batch · .xlsx · .xls</span>
            <button
              type="button"
              id="btn-multi-browse"
              onClick={(e) => {
                e.stopPropagation();
                multiInputRef.current?.click();
              }}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 h-10 sm:h-11 min-w-[148px] sm:min-w-[160px] px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-2xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              <Files className="w-4 h-4 text-slate-200 shrink-0" />
              <span>{t.multiConvertBtn}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
