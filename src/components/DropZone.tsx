import React, { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { haptic } from '../utils/haptics';

interface DropZoneProps {
  onFileLoaded: (buffer: ArrayBuffer, fileName: string) => void;
  isLoading: boolean;
  errorMessage: string | null;
  currentFileName: string | null;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFileLoaded,
  isLoading,
  errorMessage,
  currentFileName,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    haptic.selection();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const processFile = (file: File) => {
    if (!file) return;
    haptic.medium();
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer) {
        onFileLoaded(buffer, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full h-full flex flex-col justify-between">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        accept=".xlsx, .xls, .csv"
        className="hidden"
        id="erp-file-input"
      />

      <div
        id="erp-dropzone-container"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          haptic.light();
          fileInputRef.current?.click();
        }}
        className={`relative group cursor-pointer transition-all duration-150 bg-white border-2 border-[#141414] shadow-[4px_4px_0px_#141414] p-8 md:p-12 flex flex-col justify-center items-center text-center ${
          isDragOver
            ? 'bg-[#E8F5E9] border-[#141414] scale-[0.995]'
            : 'hover:bg-[#FAFAFA]'
        }`}
      >
        {/* Inner subtle border accent */}
        <div className="absolute inset-0 border-2 border-dashed border-[#141414] opacity-15 m-3 pointer-events-none" />

        <div className="text-center z-10 flex flex-col items-center">
          <div className="mb-4 text-[#141414] select-none flex items-center justify-center">
            {isLoading ? (
              <div className="w-12 h-12 border-4 border-[#141414] border-t-transparent rounded-full animate-spin inline-block" />
            ) : (
              <div className="w-16 h-16 bg-[#F0F0EE] border-2 border-[#141414] shadow-[2px_2px_0px_#141414] flex items-center justify-center group-hover:scale-105 transition-transform">
                <UploadCloud className="w-8 h-8 text-[#141414]" />
              </div>
            )}
          </div>

          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#141414] mb-2">
            {isLoading ? 'Processing ERP Excel Data...' : 'Drop ERP Excel File'}
          </h2>

          <p className="text-sm text-[#141414]/60 max-w-md mb-6 font-mono leading-relaxed">
            Drag and drop <span className="font-bold text-[#141414]">.xls</span> or{' '}
            <span className="font-bold text-[#141414]">.xlsx</span> source files here to begin parsing
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              id="btn-browse-file"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#141414] hover:bg-black text-white font-bold text-xs uppercase tracking-wider transition-all border-2 border-[#141414] cursor-pointer shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Browse Files
            </button>
          </div>

          {currentFileName && !isLoading && (
            <div className="mt-5 inline-flex items-center gap-2 px-3 py-1 bg-[#DEDEDE] border border-[#141414] text-[#141414] text-xs font-mono font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-700" />
              <span>ACTIVE_SOURCE: {currentFileName}</span>
            </div>
          )}
        </div>

        {/* Industrial bottom tags */}
        <div className="absolute bottom-3 left-4 flex flex-wrap gap-2 pointer-events-none">
          <span className="text-[10px] border border-[#141414] bg-white px-2 py-0.5 font-bold font-mono text-[#141414]">
            MAX: 50MB
          </span>
          <span className="text-[10px] border border-[#141414] bg-white px-2 py-0.5 font-bold font-mono text-[#141414]">
            FORMAT: XLSX / XLS
          </span>
          <span className="text-[10px] border border-[#141414] bg-white px-2 py-0.5 font-bold font-mono text-[#141414] hidden sm:inline">
            ENGINE: CLIENT_ONLY
          </span>
        </div>
      </div>

      {errorMessage && (
        <div
          id="error-banner"
          className="mt-3 p-4 bg-[#FFEEEE] border-2 border-[#141414] text-[#141414] text-sm flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold uppercase tracking-tight text-red-700 text-xs">Extraction Failed</p>
            <p className="mt-0.5 text-xs font-mono text-[#141414]">{errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
};
