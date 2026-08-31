import React from 'react';
import { Download, Share2, Copy, RefreshCw, FileCode, Check, BookOpen } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ActionToolbarProps {
  onDownloadExcel: () => void;
  onOpenWhatsApp: () => void;
  onCopyWhatsAppText: () => void;
  onReset: () => void;
  onToggleDoc: () => void;
  isCopied: boolean;
  sheets: string[];
  activeSheet: string;
  onSelectSheet: (sheet: string) => void;
  totalRecords: number;
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({
  onDownloadExcel,
  onOpenWhatsApp,
  onCopyWhatsAppText,
  onReset,
  onToggleDoc,
  isCopied,
  sheets,
  activeSheet,
  onSelectSheet,
  totalRecords,
}) => {
  const handleExcelClick = () => {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#141414', '#FF6B35', '#25D366', '#DEDEDE'],
    });
    onDownloadExcel();
  };

  const handleWhatsAppClick = () => {
    onOpenWhatsApp();
  };

  return (
    <div id="action-toolbar" className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
      {/* Left: Action Buttons */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Primary Download Excel */}
        <button
          type="button"
          id="btn-download-excel"
          onClick={handleExcelClick}
          className="inline-flex items-center gap-2.5 px-6 py-2.5 bg-[#141414] hover:bg-black text-white font-bold text-xs uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Download Excel (11 Columns)</span>
        </button>

        {/* Primary WhatsApp Share */}
        <button
          type="button"
          id="btn-share-whatsapp"
          onClick={handleWhatsAppClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs uppercase tracking-wider transition-all border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
        >
          <Share2 className="w-4 h-4 text-white" />
          <span>Share Report to WhatsApp</span>
        </button>

        {/* Copy Text Shortcut */}
        <button
          type="button"
          id="btn-copy-wa-text"
          onClick={onCopyWhatsAppText}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#DEDEDE] hover:bg-[#cecece] text-[#141414] border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          title="Salin teks template WhatsApp ke clipboard"
        >
          {isCopied ? (
            <>
              <Check className="w-4 h-4 text-green-700" />
              <span className="text-green-800">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-[#141414]" />
              <span>Copy WA Text</span>
            </>
          )}
        </button>
      </div>

      {/* Right: Auxiliary Controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Multi-sheet selector if file contains multiple sheets */}
        {sheets && sheets.length > 1 && (
          <div className="flex items-center gap-2 bg-[#F0F0EE] border-2 border-[#141414] px-3 py-1.5 text-xs font-mono">
            <span className="text-[#141414]/70 font-bold uppercase">Sheet:</span>
            <select
              id="sheet-selector"
              value={activeSheet}
              onChange={(e) => onSelectSheet(e.target.value)}
              className="bg-transparent text-[#141414] font-bold focus:outline-none cursor-pointer"
            >
              {sheets.map((sheet) => (
                <option key={sheet} value={sheet} className="bg-white text-[#141414]">
                  {sheet}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* View Parser Engine Logic Rules */}
        <button
          type="button"
          id="btn-view-rules"
          onClick={onToggleDoc}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-[#F0F0EE] text-[#141414] border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5"
        >
          <BookOpen className="w-3.5 h-3.5 text-[#FF6B35]" />
          <span>Parser Rules</span>
        </button>

        {/* Reset / Upload New */}
        <button
          type="button"
          id="btn-reset-file"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#DEDEDE] hover:bg-[#c9c9c9] text-[#141414] border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5"
          title="Upload file ERP lain"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Change File</span>
        </button>
      </div>
    </div>
  );
};
