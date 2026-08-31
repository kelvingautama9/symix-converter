import React from 'react';
import { X, Cpu, Layers, GitFork, ArrowDown, Database, CheckCircle2 } from 'lucide-react';

interface ParserRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ParserRulesModal: React.FC<ParserRulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      id="rules-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        id="rules-modal-dialog"
        className="w-full max-w-3xl bg-white border-2 border-[#141414] shadow-[6px_6px_0px_#141414] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b-2 border-[#141414] flex items-center justify-between bg-[#F0F0EE]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FF6B35] border-2 border-[#141414] flex items-center justify-center shadow-[2px_2px_0px_#141414]">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-[#141414]">ERP Parser Engine Architecture</h3>
              <p className="text-xs font-mono text-[#141414]/70">Parent-Child-SubChild Excel Extraction Pipeline</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 border-2 border-[#141414] bg-white hover:bg-[#DEDEDE] text-[#141414] transition-colors shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-sm text-[#141414] bg-[#F0F0EE]">
          {/* Rule 1: Parent Detection */}
          <div className="p-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
            <div className="flex items-center gap-2 text-[#141414] font-black uppercase tracking-tight text-xs mb-2">
              <span className="w-5 h-5 bg-[#141414] text-white flex items-center justify-center font-mono text-xs">
                1
              </span>
              <span>Stage 1: Parent Detection (Article Item)</span>
            </div>
            <p className="text-xs font-mono text-[#141414]/70 leading-relaxed mb-2">
              Triggered when <code className="bg-[#DEDEDE] px-1 py-0.5 border border-[#141414] text-[#141414]">row[0]</code> starts with <code className="bg-[#DEDEDE] px-1 py-0.5 border border-[#141414] font-bold text-[#141414]">"SH-"</code> or <code className="bg-[#DEDEDE] px-1 py-0.5 border border-[#141414] font-bold text-[#141414]">"ST-"</code>.
            </p>
            <ul className="text-xs font-mono text-[#141414]/90 space-y-1 list-disc pl-5">
              <li>Stores <code className="font-bold">row[0]</code> as <strong>Artikel</strong>, <code className="font-bold">row[1]</code> as <strong>Description</strong>, and <code className="font-bold">row[3]</code> as <strong>Substance</strong>.</li>
              <li><strong>Stock Shift Check:</strong> Evaluates <code className="font-bold">row[4] & row[5]</code> for numeric stock values, falling back to <code className="font-bold">row[6] & row[7]</code>.</li>
            </ul>
          </div>

          {/* Rule 2: Child Detection */}
          <div className="p-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
            <div className="flex items-center gap-2 text-[#141414] font-black uppercase tracking-tight text-xs mb-2">
              <span className="w-5 h-5 bg-[#141414] text-white flex items-center justify-center font-mono text-xs">
                2
              </span>
              <span>Stage 2: Child Detection (CO & Purchase Order)</span>
            </div>
            <p className="text-xs font-mono text-[#141414]/70 leading-relaxed mb-2">
              Triggered when <code className="bg-[#DEDEDE] px-1 py-0.5 border border-[#141414] text-[#141414]">row[1]</code> contains <code className="font-bold">"DAP"</code> or <code className="font-bold">"PO"</code>.
            </p>
            <ul className="text-xs font-mono text-[#141414]/90 space-y-1 list-disc pl-5">
              <li><strong>CO Extraction:</strong> Captures Customer Order code (e.g. <code className="font-bold">18H8559 1 O</code>) from <code className="font-bold">row[0]</code> as Column A.</li>
              <li><strong>Clean PO String:</strong> Strips leading date prefixes (e.g. DD/MM/YY) from the PO number in <code className="font-bold">row[1]</code>.</li>
              <li><strong>Price Extraction:</strong> Splits <code className="font-bold">row[2]</code> by whitespace to find floating point price units.</li>
              <li>Extracts <code className="font-bold">QTY PO (pcs)</code> from <code className="font-bold">row[6]</code> and <code className="font-bold">Berat PO (KG)</code> from <code className="font-bold">row[7]</code>.</li>
            </ul>
          </div>

          {/* Rule 3: Sub-Child Detection */}
          <div className="p-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
            <div className="flex items-center gap-2 text-[#141414] font-black uppercase tracking-tight text-xs mb-2">
              <span className="w-5 h-5 bg-[#FF6B35] text-white flex items-center justify-center font-mono text-xs">
                3
              </span>
              <span>Stage 3: Sub-Child Detection (Delivery Log P26)</span>
            </div>
            <p className="text-xs font-mono text-[#141414]/70 leading-relaxed mb-2">
              Triggered when <code className="font-bold">row[0] & row[1]</code> are empty and <code className="bg-[#DEDEDE] px-1 py-0.5 border border-[#141414] font-bold">row[9] / row[10]</code> contains <code className="font-bold">"P26"</code>.
            </p>
            <ul className="text-xs font-mono text-[#141414]/90 space-y-1 list-disc pl-5">
              <li><strong>OVERWRITE Logic:</strong> Always takes the latest bottom-row balance from <code className="font-bold">row[14]</code> (pcs) and <code className="font-bold">row[15]</code> (kg).</li>
              <li>Flags record as <code className="font-bold text-green-700">_has_delivery = true</code>.</li>
            </ul>
          </div>

          {/* Rule 4: Fallback & Output */}
          <div className="p-4 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414]">
            <div className="flex items-center gap-2 text-[#141414] font-black uppercase tracking-tight text-xs mb-2">
              <span className="w-5 h-5 bg-[#141414] text-white flex items-center justify-center font-mono text-xs">
                4
              </span>
              <span>Stage 4: Fallback & Master 14-Column Output</span>
            </div>
            <ul className="text-xs font-mono text-[#141414]/90 space-y-1 list-disc pl-5">
              <li>When encountering "TOTAL" or next Parent, flushes the active PO to final array.</li>
              <li><strong>Critical Fallback:</strong> If no delivery logs exist (<code className="font-bold">_has_delivery == false</code>), sets <code className="font-bold">Sisa OS = QTY PO</code> and <code className="font-bold">Sisa OS Kg = Berat PO</code>.</li>
              <li><strong>Terkirim Calculation:</strong> <code className="font-bold">Terkirim (PCS) = QTY PO (pcs) - Sisa OS (pcs)</code> dan <code className="font-bold">Terkirim (KG) = Berat PO (KG) - Sisa OS (kg)</code>.</li>
              <li><strong>Columns:</strong> CO, Artikel, Description, No PO, Substance, QTY PO, Berat PO, Stock (pcs/kg), Sisa OS (pcs/kg), Terkirim (PCS/KG), Harga.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-[#141414] bg-white flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#141414] hover:bg-black text-white text-xs font-bold uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
