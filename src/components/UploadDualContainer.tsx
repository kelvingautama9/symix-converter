import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Files,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
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
        <div className="p-5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_#141414] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-[#141414] border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="font-bold text-xs uppercase tracking-tight text-[#141414]">
                {loadingMessage || 'Memproses file...'}
              </span>
            </div>
            {loadingProgress && (
              <span className="text-xs font-mono font-bold text-[#141414]/70">
                {loadingProgress.current} / {loadingProgress.total} File
              </span>
            )}
          </div>

          {loadingProgress && (
            <div>
              <div className="w-full h-3 bg-[#E5E5E5] border border-[#141414] overflow-hidden p-0.5">
                <div
                  className="h-full bg-[#25D366] transition-all duration-200"
                  style={{
                    width: `${Math.round((loadingProgress.current / loadingProgress.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] font-mono text-[#141414]/60 mt-1 truncate">
                File: {loadingProgress.fileName}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {errorMessage && !isLoading && (
        <div className="p-3.5 px-4 bg-red-50 border-2 border-red-600 shadow-[2px_2px_0px_#dc2626] flex items-center gap-2.5 text-xs text-red-900 font-mono">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="font-bold">{errorMessage}</span>
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
          className={`relative group cursor-pointer transition-all duration-150 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_#141414] p-6 sm:p-8 flex flex-col justify-between ${
            isDragSingle ? 'bg-[#F0F7F4] border-[#141414] scale-[0.995]' : 'hover:bg-[#FAFAFA]'
          }`}
        >
          {/* Subtle dashed inner frame */}
          <div className="absolute inset-0 border-2 border-dashed border-[#141414] opacity-15 m-3 pointer-events-none" />

          {/* Top Tag & Header */}
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="px-2 py-0.5 bg-[#141414] text-white text-[10px] font-mono font-bold uppercase tracking-wider">
                Single Convert
              </span>
              <span className="text-[10px] font-mono text-[#141414]/60 font-bold">1 FILE</span>
            </div>

            <div className="w-12 h-12 bg-[#F0F0EE] border-2 border-[#141414] shadow-[2px_2px_0px_#141414] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <FileSpreadsheet className="w-6 h-6 text-[#141414]" />
            </div>

            <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-[#141414]">
              Konversi 1 File
            </h3>
            <p className="text-xs font-mono text-[#141414]/70 mt-1 leading-relaxed">
              Upload 1 file mentah untuk langsung dilihat dan dianalisis detail.
            </p>
          </div>

          {/* Action Button & Metadata */}
          <div className="relative z-10 mt-6 pt-4 border-t border-[#141414]/15">
            <button
              type="button"
              id="btn-single-browse"
              onClick={(e) => {
                e.stopPropagation();
                singleInputRef.current?.click();
              }}
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#141414] hover:bg-black text-white font-bold text-xs uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Pilih 1 File</span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[10px] font-mono text-[#141414]/60">
              <span className="border border-[#141414]/30 px-1.5 py-0.5 bg-white font-bold">
                .xlsx / .xls
              </span>
              <span className="border border-[#141414]/30 px-1.5 py-0.5 bg-white">Maks. 50MB</span>
              <span className="border border-[#141414]/30 px-1.5 py-0.5 bg-white">Pratinjau Langsung</span>
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
          className={`relative group cursor-pointer transition-all duration-150 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_#141414] p-6 sm:p-8 flex flex-col justify-between ${
            isDragMulti ? 'bg-[#FFF8F4] border-[#141414] scale-[0.995]' : 'hover:bg-[#FAFAFA]'
          }`}
        >
          {/* Subtle dashed inner frame */}
          <div className="absolute inset-0 border-2 border-dashed border-[#141414] opacity-15 m-3 pointer-events-none" />

          {/* Top Tag & Header */}
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="px-2 py-0.5 bg-[#FF6B35] text-white text-[10px] font-mono font-bold uppercase tracking-wider">
                Multi Convert
              </span>
              <span className="text-[10px] font-mono text-[#141414]/60 font-bold">BANYAK FILE</span>
            </div>

            <div className="w-12 h-12 bg-[#F0F0EE] border-2 border-[#141414] shadow-[2px_2px_0px_#141414] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Files className="w-6 h-6 text-[#FF6B35]" />
            </div>

            <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-[#141414]">
              Konversi Banyak File
            </h3>
            <p className="text-xs font-mono text-[#141414]/70 mt-1 leading-relaxed">
              Upload banyak file sekaligus tanpa batas untuk auto-convert.
            </p>
          </div>

          {/* Action Button & Metadata */}
          <div className="relative z-10 mt-6 pt-4 border-t border-[#141414]/15">
            <button
              type="button"
              id="btn-multi-browse"
              onClick={(e) => {
                e.stopPropagation();
                multiInputRef.current?.click();
              }}
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#FF6B35] hover:bg-[#e85a24] text-white font-bold text-xs uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50"
            >
              <Files className="w-3.5 h-3.5" />
              <span>Pilih Banyak File</span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5 mt-3 text-[10px] font-mono text-[#141414]/60">
              <span className="border border-[#141414]/30 px-1.5 py-0.5 bg-white font-bold text-[#FF6B35]">
                Tanpa Batas File
              </span>
              <span className="border border-[#141414]/30 px-1.5 py-0.5 bg-white">Unduh Semua (.zip)</span>
              <span className="border border-[#141414]/30 px-1.5 py-0.5 bg-white">Master Excel Gabungan</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
