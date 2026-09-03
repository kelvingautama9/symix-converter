import React, { useState, useMemo } from 'react';
import { ExtractedRecord, WhatsAppReportScope } from '../types';
import { generateWhatsAppSummary, shareToWhatsApp, copyToClipboard } from '../utils/whatsappHelper';
import { recalculateFIFOStock } from '../utils/parserEngine';
import { haptic } from '../utils/haptics';
import { X, Send, Copy, Check, MessageSquare, Zap, Layers } from 'lucide-react';
import confetti from 'canvas-confetti';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ExtractedRecord[];
  initialScope?: WhatsAppReportScope;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  isOpen,
  onClose,
  data,
  initialScope = 'ALL',
}) => {
  const [activeScope, setActiveScope] = useState<WhatsAppReportScope>(initialScope);
  const [isCopied, setIsCopied] = useState(false);

  // Calculate scoped datasets for item counts & preview
  const allScoped = useMemo(() => recalculateFIFOStock(data, 'ALL'), [data]);
  const openScoped = useMemo(() => recalculateFIFOStock(data, 'OPEN'), [data]);
  const closedScoped = useMemo(() => recalculateFIFOStock(data, 'CLOSED'), [data]);

  const countAll = allScoped.length;
  const countOpen = useMemo(() => openScoped.filter((d) => d.coStatus === 'OPEN').length, [openScoped]);
  const countClosed = useMemo(() => closedScoped.filter((d) => d.coStatus === 'CLOSED').length, [closedScoped]);
  const countStockReadyAll = useMemo(
    () => allScoped.filter((d) => (d['Stock (pcs)'] || 0) > 0).length,
    [allScoped]
  );
  const countStockReadyOpen = useMemo(
    () => openScoped.filter((d) => d.coStatus === 'OPEN' && (d['Stock (pcs)'] || 0) > 0).length,
    [openScoped]
  );

  const summaryText = useMemo(() => generateWhatsAppSummary(data, activeScope), [data, activeScope]);

  if (!isOpen) return null;

  const handleScopeChange = (scope: WhatsAppReportScope) => {
    haptic.selection();
    setActiveScope(scope);
  };

  const handleCopy = async () => {
    haptic.selection();
    const success = await copyToClipboard(summaryText);
    if (success) {
      haptic.success();
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleSend = () => {
    haptic.success();
    confetti({
      particleCount: 40,
      spread: 50,
      origin: { y: 0.7 },
      colors: ['#22c55e', '#16a34a', '#4ade80'],
    });
    shareToWhatsApp(data, activeScope);
  };

  const handleClose = () => {
    haptic.light();
    onClose();
  };

  return (
    <div
      id="whatsapp-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={handleClose}
    >
      <div
        id="whatsapp-modal-dialog"
        className="w-full max-w-2xl bg-white border-2 border-[#141414] shadow-[6px_6px_0px_#141414] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b-2 border-[#141414] flex items-center justify-between bg-[#F0F0EE]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#25D366] border-2 border-[#141414] flex items-center justify-center shadow-[2px_2px_0px_#141414] shrink-0">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-[#141414]">
                WhatsApp Report Generator
              </h3>
              <p className="text-[11px] sm:text-xs font-mono text-[#141414]/70">
                Pilih format & filter untuk dibagikan ke customer
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 border-2 border-[#141414] bg-white hover:bg-[#DEDEDE] text-[#141414] transition-colors shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Scope Selection Tabs */}
        <div className="p-3 bg-white border-b-2 border-[#141414] flex flex-wrap gap-1.5 sm:gap-2">
          {/* Tab 1: All CO */}
          <button
            type="button"
            id="wa-tab-all"
            onClick={() => handleScopeChange('ALL')}
            className={`px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider border-2 border-[#141414] transition-all cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'ALL'
                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_#141414]'
                : 'bg-white hover:bg-[#F0F0EE] text-[#141414]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Semua CO</span>
            <span className={`px-1 py-0.2 text-[10px] ${activeScope === 'ALL' ? 'bg-white/20 text-white' : 'bg-[#DEDEDE] text-[#141414]'}`}>
              {countAll}
            </span>
          </button>

          {/* Tab 2: CO Open Only */}
          <button
            type="button"
            id="wa-tab-open"
            onClick={() => handleScopeChange('OPEN_ONLY')}
            className={`px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider border-2 border-[#141414] transition-all cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'OPEN_ONLY'
                ? 'bg-[#2E7D32] text-white shadow-[2px_2px_0px_#141414]'
                : 'bg-white hover:bg-emerald-50 text-[#2E7D32]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#2E7D32] border border-white" />
            <span>CO Open (O)</span>
            <span className={`px-1 py-0.2 text-[10px] ${activeScope === 'OPEN_ONLY' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
              {countOpen}
            </span>
          </button>

          {/* Tab 3: Stock Ready (Semua CO) */}
          <button
            type="button"
            id="wa-tab-stock-ready-all"
            onClick={() => handleScopeChange('STOCK_READY_ALL')}
            className={`px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider border-2 border-[#141414] transition-all cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'STOCK_READY_ALL'
                ? 'bg-[#FF6B35] text-white shadow-[2px_2px_0px_#141414]'
                : 'bg-white hover:bg-orange-50 text-[#FF6B35]'
            }`}
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Stock Ready (Semua)</span>
            <span className={`px-1 py-0.2 text-[10px] font-bold ${activeScope === 'STOCK_READY_ALL' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-800'}`}>
              {countStockReadyAll}
            </span>
          </button>

          {/* Tab 4: Stock Ready (Khusus CO Open) */}
          <button
            type="button"
            id="wa-tab-stock-ready-open"
            onClick={() => handleScopeChange('STOCK_READY_OPEN')}
            className={`px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider border-2 border-[#141414] transition-all cursor-pointer flex items-center gap-1.5 ${
              activeScope === 'STOCK_READY_OPEN'
                ? 'bg-emerald-700 text-white shadow-[2px_2px_0px_#141414]'
                : 'bg-white hover:bg-emerald-50 text-emerald-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5 fill-current text-emerald-400" />
            <span>Stock Ready (CO Open)</span>
            <span className={`px-1 py-0.2 text-[10px] font-bold ${activeScope === 'STOCK_READY_OPEN' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-900 border border-emerald-400'}`}>
              {countStockReadyOpen}
            </span>
          </button>
        </div>

        {/* Text Body Preview */}
        <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 bg-[#F0F0EE]">
          <div className="relative">
            <pre className="w-full p-4 bg-white border-2 border-[#141414] text-[#141414] font-mono text-xs leading-relaxed whitespace-pre-wrap select-all shadow-[2px_2px_0px_#141414] max-h-[40vh] overflow-y-auto">
              {summaryText}
            </pre>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-3.5 sm:p-5 border-t-2 border-[#141414] bg-white flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
          <div className="text-xs text-[#141414]/80 text-center sm:text-left">
            Opsi Terpilih:{' '}
            <span className="font-bold text-[#141414]">
              {activeScope === 'STOCK_READY_ALL'
                ? `⚡ Stock Ready (${countStockReadyAll} PO)`
                : activeScope === 'STOCK_READY_OPEN'
                ? `🟢⚡ Stock Ready CO Open (${countStockReadyOpen} PO)`
                : activeScope === 'OPEN_ONLY'
                ? `🟢 Khusus CO Open (${countOpen} PO)`
                : `📋 Semua CO (${countAll} PO)`}
            </span>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              id="btn-copy-wa-modal"
              onClick={handleCopy}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#DEDEDE] hover:bg-[#cecece] text-[#141414] border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[40px]"
            >
              {isCopied ? <Check className="w-4 h-4 text-green-700" /> : <Copy className="w-4 h-4 text-[#141414]" />}
              <span>{isCopied ? 'Copied!' : 'Copy Text'}</span>
            </button>
            <button
              type="button"
              id="btn-open-wa-modal"
              onClick={handleSend}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-white border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[40px]"
            >
              <Send className="w-4 h-4" />
              <span>Open WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

