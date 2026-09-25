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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 items-stretch">
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
          className={`relative group cursor-pointer transition-all duration-200 glass-panel rounded-3xl p-6 sm:p-7 flex flex-col justify-between ${
            isDragSingle
              ? 'ring-2 ring-[#FF7B35]/40 bg-white/90 scale-[0.995]'
              : 'hover:bg-white/85 hover:shadow-[0_12px_36px_-8px_rgba(0,0,0,0.06)]'
          }`}
        >
          {/* Subtle frosted glow accent */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-br from-zinc-200/40 to-transparent rounded-bl-full pointer-events-none" />

          {/* Top Tag & Header */}
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="px-2.5 py-0.5 bg-zinc-200/60 text-zinc-700 text-[11px] font-medium rounded-full border border-white/60">
                Single Convert
              </span>
              <span className="text-[11px] font-mono text-zinc-400 font-medium">1 FILE</span>
            </div>

            <div className="w-12 h-12 rounded-2xl glass-card flex items-center justify-center mb-3 group-hover:scale-105 transition-transform text-zinc-700 shadow-sm">
              <FileSpreadsheet className="w-6 h-6 text-zinc-700" />
            </div>

            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-[#1E2024]">
              Konversi 1 File
            </h3>
            <p className="text-xs text-[#5C6068] mt-1 leading-relaxed">
              Upload 1 file mentah untuk langsung dilihat dan dianalisis detail.
            </p>
          </div>

          {/* Action Button & Metadata */}
          <div className="relative z-10 mt-6 pt-4 border-t border-zinc-200/60">
            <button
              type="button"
              id="btn-single-browse"
              onClick={(e) => {
                e.stopPropagation();
                singleInputRef.current?.click();
              }}
              disabled={isLoading}
              className="w-full liquid-glass-clear inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5 text-zinc-600" />
              <span>Pilih 1 File</span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[11px] font-mono text-[#5C6068]">
              <span className="bg-white/60 px-2 py-0.5 rounded-full border border-white/80 font-medium">
                .xlsx / .xls
              </span>
              <span className="bg-white/60 px-2 py-0.5 rounded-full border border-white/80">
                Maks. 50MB
              </span>
              <span className="bg-white/60 px-2 py-0.5 rounded-full border border-white/80">
                Pratinjau Langsung
              </span>
            </div>
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
          className={`relative group cursor-pointer transition-all duration-200 glass-panel-warm rounded-3xl p-6 sm:p-7 flex flex-col justify-between ${
            isDragMulti
              ? 'ring-2 ring-[#EA5413]/50 bg-white/95 scale-[0.995]'
              : 'hover:bg-white/90 hover:shadow-[0_12px_36px_-6px_rgba(234,84,19,0.12)]'
          }`}
        >
          {/* Subtle warm orange glass ambient glow */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-br from-[#FF7B35]/15 to-transparent rounded-bl-full pointer-events-none" />

          {/* Top Tag & Header */}
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="px-2.5 py-0.5 bg-[#EA5413]/10 text-[#EA5413] text-[11px] font-semibold rounded-full border border-[#EA5413]/20">
                Multi Convert
              </span>
              <span className="text-[11px] font-mono text-[#EA5413]/70 font-semibold">
                BANYAK FILE
              </span>
            </div>

            <div className="w-12 h-12 rounded-2xl glass-card flex items-center justify-center mb-3 group-hover:scale-105 transition-transform text-[#EA5413] shadow-sm">
              <Files className="w-6 h-6 text-[#EA5413]" />
            </div>

            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-[#1E2024]">
              Konversi Banyak File
            </h3>
            <p className="text-xs text-[#5C6068] mt-1 leading-relaxed">
              Upload banyak file sekaligus tanpa batas untuk auto-convert.
            </p>
          </div>

          {/* Action Button & Metadata */}
          <div className="relative z-10 mt-6 pt-4 border-t border-zinc-200/60">
            <button
              type="button"
              id="btn-multi-browse"
              onClick={(e) => {
                e.stopPropagation();
                multiInputRef.current?.click();
              }}
              disabled={isLoading}
              className="w-full liquid-glass-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              <Files className="w-3.5 h-3.5 text-white" />
              <span>Pilih Banyak File</span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[11px] font-mono text-[#5C5C68]">
              <span className="bg-white/70 px-2 py-0.5 rounded-full border border-white/90 font-semibold text-[#19719C]">
                Tanpa Batas
              </span>
              <span className="bg-white/70 px-2 py-0.5 rounded-full border border-white/90">
                Unduh Semua (.zip)
              </span>
              <span className="bg-white/70 px-2 py-0.5 rounded-full border border-white/90">
                Master Gabungan
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
