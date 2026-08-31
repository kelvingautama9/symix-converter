import React, { useState } from 'react';
import { ExtractedRecord } from '../types';
import { generateWhatsAppSummary, shareToWhatsApp, copyToClipboard } from '../utils/whatsappHelper';
import { X, Send, Copy, Check, MessageSquare } from 'lucide-react';
import confetti from 'canvas-confetti';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ExtractedRecord[];
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({ isOpen, onClose, data }) => {
  const [maxItems, setMaxItems] = useState(10);
  const [isCopied, setIsCopied] = useState(false);

  if (!isOpen) return null;

  const summaryText = generateWhatsAppSummary(data, maxItems);

  const handleCopy = async () => {
    const success = await copyToClipboard(summaryText);
    if (success) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleSend = () => {
    confetti({
      particleCount: 40,
      spread: 50,
      origin: { y: 0.7 },
      colors: ['#22c55e', '#16a34a', '#4ade80'],
    });
    shareToWhatsApp(data, maxItems);
  };

  return (
    <div
      id="whatsapp-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        id="whatsapp-modal-dialog"
        className="w-full max-w-2xl bg-white border-2 border-[#141414] shadow-[6px_6px_0px_#141414] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b-2 border-[#141414] flex items-center justify-between bg-[#F0F0EE]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#25D366] border-2 border-[#141414] flex items-center justify-center shadow-[2px_2px_0px_#141414]">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-[#141414]">WhatsApp Report Format</h3>
              <p className="text-xs font-mono text-[#141414]/70">Customer OS Summary Template</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 border-2 border-[#141414] bg-white hover:bg-[#DEDEDE] text-[#141414] transition-colors shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="px-5 py-3 bg-white border-b-2 border-[#141414] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <span className="text-[#141414] font-bold uppercase text-[11px]">Item Limit:</span>
          <div className="flex items-center gap-2">
            {[5, 10, 20, 50, 100].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setMaxItems(num)}
                className={`px-2.5 py-1 border-2 border-[#141414] font-bold transition-all shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer ${
                  maxItems === num
                    ? 'bg-[#141414] text-white'
                    : 'bg-[#F0F0EE] text-[#141414] hover:bg-[#DEDEDE]'
                }`}
              >
                {num} Items
              </button>
            ))}
          </div>
        </div>

        {/* Text Body */}
        <div className="p-5 overflow-y-auto flex-1 bg-[#F0F0EE]">
          <div className="relative">
            <pre className="w-full p-4 bg-white border-2 border-[#141414] text-[#141414] font-mono text-xs leading-relaxed whitespace-pre-wrap select-all shadow-[2px_2px_0px_#141414]">
              {summaryText}
            </pre>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 sm:p-5 border-t-2 border-[#141414] bg-white flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
          <div className="text-xs text-[#141414]/70">
            Summary for <span className="text-[#141414] font-bold">{data.length}</span> Purchase Orders
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              id="btn-copy-wa-modal"
              onClick={handleCopy}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#DEDEDE] hover:bg-[#cecece] text-[#141414] border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
            >
              {isCopied ? <Check className="w-4 h-4 text-green-700" /> : <Copy className="w-4 h-4 text-[#141414]" />}
              <span>{isCopied ? 'Copied!' : 'Copy Text'}</span>
            </button>
            <button
              type="button"
              id="btn-open-wa-modal"
              onClick={handleSend}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-white border-2 border-[#141414] text-xs font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
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
