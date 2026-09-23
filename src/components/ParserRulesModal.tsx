import React from 'react';
import { X, Cpu, Layers, GitFork, ArrowDown, Database, CheckCircle2 } from 'lucide-react';
import { haptic } from '../utils/haptics';

interface ParserRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ParserRulesModal: React.FC<ParserRulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleClose = () => {
    haptic.light();
    onClose();
  };

  return (
    <div
      id="rules-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in"
      onClick={handleClose}
    >
      <div
        id="rules-modal-dialog"
        className="w-full max-w-3xl glass-panel rounded-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200/60 flex items-center justify-between bg-white/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/80 border border-white/90 flex items-center justify-center shadow-xs overflow-hidden p-0.5">
              <img
                src="/logo.jpg"
                alt="BlackEYE Logo"
                className="w-full h-full object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-[#1E2024]">
                ERP Parser Engine Architecture
              </h3>
              <p className="text-xs text-[#5C6068]">
                Parent-Child-SubChild Multi-Tier Extraction & FIFO Inventory Allocation
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="liquid-glass-clear p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-sm bg-transparent">
          {/* Stage 1: Parent Detection */}
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex items-center gap-2 font-bold text-xs text-[#1E2024] mb-2">
              <span className="w-5 h-5 rounded-full bg-[#1E2024] text-white flex items-center justify-center font-mono text-[11px]">
                1
              </span>
              <span>Stage 1: Parent Detection (Article Item Record)</span>
            </div>
            <p className="text-xs text-[#5C6068] leading-relaxed mb-2 font-mono">
              Identified when cell A (<code className="bg-white/80 px-1 py-0.5 border border-zinc-200/80 rounded text-[#1E2024]">row[0]</code>) begins with ERP prefix identifiers: <code className="bg-white/80 px-1 py-0.5 border border-zinc-200/80 rounded font-semibold text-[#1E2024]">"SH-"</code>, <code className="bg-white/80 px-1 py-0.5 border border-zinc-200/80 rounded font-semibold text-[#1E2024]">"ST-"</code>, <code className="bg-white/80 px-1 py-0.5 border border-zinc-200/80 rounded font-semibold text-[#1E2024]">"BX-"</code>, or <code className="bg-white/80 px-1 py-0.5 border border-zinc-200/80 rounded font-semibold text-[#1E2024]">"DC-"</code>.
            </p>
            <ul className="text-xs text-[#1E2024]/90 space-y-1 list-disc pl-5">
              <li>Stores <code className="font-semibold text-[#1E2024]">row[0]</code> as <strong>Artikel</strong>, <code className="font-semibold text-[#1E2024]">row[1]</code> as <strong>Item Description</strong>, and <code className="font-semibold text-[#1E2024]">row[3]</code> as <strong>Substance</strong>.</li>
              <li><strong>Warehouse Stock Shift Check:</strong> Scans <code className="font-semibold text-[#1E2024]">row[4] & row[5]</code> for initial numeric stock values, falling back to <code className="font-semibold text-[#1E2024]">row[6] & row[7]</code> if columns shift.</li>
            </ul>
          </div>

          {/* Stage 2: Child Detection */}
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex items-center gap-2 font-bold text-xs text-[#1E2024] mb-2">
              <span className="w-5 h-5 rounded-full bg-[#1E2024] text-white flex items-center justify-center font-mono text-[11px]">
                2
              </span>
              <span>Stage 2: Child Detection (Customer Order & Purchase Order)</span>
            </div>
            <p className="text-xs text-[#5C6068] leading-relaxed mb-2 font-mono">
              Triggered when <code className="bg-white/80 px-1 py-0.5 border border-zinc-200/80 rounded text-[#1E2024]">row[1]</code> contains order keywords: <code className="font-semibold text-[#1E2024]">"DAP"</code> or <code className="font-semibold text-[#1E2024]">"PO"</code>.
            </p>
            <ul className="text-xs text-[#1E2024]/90 space-y-1 list-disc pl-5">
              <li><strong>Customer Order (CO) Extraction:</strong> Captures CO reference code (e.g. <code className="font-semibold text-[#1E2024]">18H8559 1 O</code>) from <code className="font-semibold text-[#1E2024]">row[0]</code> as Column A.</li>
              <li><strong>PO Input Date & Clean PO:</strong> Extracts historical entry date (e.g. <code className="font-semibold text-[#1E2024]">26/08/2026</code>) and strips it cleanly from PO number (e.g. <code className="font-semibold text-[#1E2024]">PO/MB/2026/08/0236</code>) from <code className="font-semibold text-[#1E2024]">row[1]</code>.</li>
              <li><strong>Unit Price Extraction:</strong> Splits <code className="font-semibold text-[#1E2024]">row[2]</code> by whitespace to isolate floating point unit price values.</li>
              <li>Extracts <code className="font-semibold text-[#1E2024]">QTY PO (pcs)</code> from <code className="font-semibold text-[#1E2024]">row[6]</code> and <code className="font-semibold text-[#1E2024]">Berat PO (KG)</code> from <code className="font-semibold text-[#1E2024]">row[7]</code>.</li>
            </ul>
          </div>

          {/* Stage 3: Sub-Child Detection */}
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex items-center gap-2 font-bold text-xs text-[#EA5413] mb-2">
              <span className="w-5 h-5 rounded-full bg-[#EA5413] text-white flex items-center justify-center font-mono text-[11px]">
                3
              </span>
              <span>Stage 3: Sub-Child Detection (Delivery Log P26)</span>
            </div>
            <p className="text-xs text-[#5C6068] leading-relaxed mb-2 font-mono">
              Triggered when <code className="font-semibold text-[#1E2024]">row[0] & row[1]</code> are empty and <code className="bg-white/80 px-1 py-0.5 border border-zinc-200/80 rounded font-semibold text-[#1E2024]">row[9] / row[10]</code> contains delivery log identifier <code className="font-semibold text-[#1E2024]">"P26"</code>.
            </p>
            <ul className="text-xs text-[#1E2024]/90 space-y-1 list-disc pl-5">
              <li><strong>OVERWRITE Logic:</strong> Always captures the latest bottom-row balance from <code className="font-semibold text-[#1E2024]">row[14]</code> (pieces) and <code className="font-semibold text-[#1E2024]">row[15]</code> (kilograms).</li>
              <li>Flags record internal state as <code className="font-semibold text-emerald-700">_has_delivery = true</code>.</li>
            </ul>
          </div>

          {/* Stage 4: Fallback */}
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex items-center gap-2 font-bold text-xs text-[#1E2024] mb-2">
              <span className="w-5 h-5 rounded-full bg-[#1E2024] text-white flex items-center justify-center font-mono text-[11px]">
                4
              </span>
              <span>Stage 4: Fallback & Delivered (Terkirim) Calculation</span>
            </div>
            <ul className="text-xs text-[#1E2024]/90 space-y-1 list-disc pl-5">
              <li>When encountering "TOTAL" or the next Parent article, flushes the active PO into the finalized dataset.</li>
              <li><strong>Zero-Delivery Fallback:</strong> If no delivery logs exist (<code className="font-semibold text-[#1E2024]">_has_delivery == false</code>), automatically defaults <code className="font-semibold text-[#1E2024]">Sisa OS = QTY PO</code> and <code className="font-semibold text-[#1E2024]">Sisa OS Kg = Berat PO</code>.</li>
              <li><strong>Delivered (Terkirim) Calculation:</strong> <code className="font-semibold text-[#1E2024]">Terkirim (PCS) = QTY PO (pcs) - Sisa OS (pcs)</code> and <code className="font-semibold text-[#1E2024]">Terkirim (KG) = Berat PO (KG) - Sisa OS (kg)</code>.</li>
            </ul>
          </div>

          {/* Stage 5: FIFO Sequential Stock Allocation */}
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex items-center gap-2 font-bold text-xs text-emerald-700 mb-2">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-mono text-[11px]">
                5
              </span>
              <span>Stage 5: FIFO Sequential Stock Allocation (&lt; 51 pcs Threshold)</span>
            </div>
            <p className="text-xs text-[#5C6068] leading-relaxed mb-2 font-mono">
              Prevents inventory duplication across multiple PO lines under the same article and enforces the minimum production tolerance threshold.
            </p>
            <ul className="text-xs text-[#1E2024]/90 space-y-1 list-disc pl-5">
              <li><strong>Under 51 pcs Threshold:</strong> If a PO has remaining OS &lt; 51 pcs (e.g. 40 pcs), this PO line is <strong>excluded</strong> from FIFO stock allocation (<code className="font-semibold text-[#1E2024]">Stock = 0</code>) even if its CO status is still Open.</li>
              <li><strong>Top-Down Allocation (FIFO):</strong> Available warehouse inventory is assigned to fulfill the <code className="font-semibold text-[#1E2024]">Sisa OS</code> of the topmost eligible PO (Sisa OS &ge; 51 pcs): <code className="font-semibold text-[#1E2024]">Stock Ready = min(Remaining Stock, Sisa OS)</code>.</li>
              <li><strong>Dynamic Scope Reallocation:</strong> When filtered or exported under <code className="font-semibold text-[#1E2024]">CO Open Only</code>, Closed CO lines are bypassed so that 100% of warehouse stock is directed to active Open PO lines.</li>
              <li><strong>Remaining Balance Forwarding:</strong> Leftover warehouse inventory flows sequentially downward to subsequent active PO lines.</li>
              <li><strong>15 Standard Columns:</strong> CO, Artikel, Item Description, Tanggal Input PO, No PO, Substance, QTY PO, Berat PO, Stock (pcs/kg), Sisa OS (pcs/kg), Terkirim (PCS/KG), Harga.</li>
            </ul>
          </div>

          {/* Stage 6: CO Status Detection */}
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex items-center gap-2 font-bold text-xs text-blue-700 mb-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-mono text-[11px]">
                6
              </span>
              <span>Stage 6: CO Status Detection (C = Closed, O = Open) & Export Scopes</span>
            </div>
            <p className="text-xs text-[#5C6068] leading-relaxed mb-2 font-mono">
              Detects status suffixes on Customer Order (CO) codes in Column A.
            </p>
            <ul className="text-xs text-[#1E2024]/90 space-y-1 list-disc pl-5">
              <li><strong className="text-emerald-700">Status O (Open):</strong> Indicates Customer Order is active / in-progress (e.g. <code className="font-semibold text-[#1E2024]">18H8550 1 O</code>).</li>
              <li><strong className="text-zinc-600">Status C (Closed):</strong> Indicates Customer Order has been fulfilled / closed (e.g. <code className="font-semibold text-[#1E2024]">18H6941 5 C</code>).</li>
              <li><strong>Interactive Filters & Export Options:</strong> Provides preview tabs and Excel export scopes for All CO, Open CO Only, Closed CO Only, and Stock Ready POs.</li>
              <li><strong>Direct Excel Share to WhatsApp:</strong> Supports direct dispatch of generated Excel (.xlsx) workbooks via WhatsApp with selected export filters.</li>
            </ul>
          </div>

          {/* Stage 7: SYMIX ERP Header & Pagination Auto-Skip */}
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex items-center gap-2 font-bold text-xs text-purple-700 mb-2">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center font-mono text-[11px]">
                7
              </span>
              <span>Stage 7: SYMIX ERP Header & Pagination Auto-Skip (Anti-Splice Engine)</span>
            </div>
            <p className="text-xs text-[#5C6068] leading-relaxed mb-2 font-mono">
              Automatically filters out repeating ERP print headers (such as <code className="font-semibold text-[#1E2024]">SYMIX 4.0R3.0</code>, <code className="font-semibold text-[#1E2024]">CO40-R</code>, <code className="font-semibold text-[#1E2024]">C/O No. L S</code>, divider lines <code className="font-semibold text-[#1E2024]">---------</code>) appearing across printed page breaks.
            </p>
            <ul className="text-xs text-[#1E2024]/90 space-y-1 list-disc pl-5">
              <li><strong>Auto-Ignore Headers:</strong> Page break lines are seamlessly skipped without interrupting or truncating active PO records.</li>
              <li><strong>Cross-Page Delivery Stitching:</strong> When delivery log sequences (<code className="font-semibold text-[#1E2024]">P26xxx</code>) span across page headers, logs on subsequent pages remain correctly attached to their parent PO.</li>
              <li><strong>Anomaly Prevention:</strong> Prevents non-data header text such as <code className="font-semibold text-[#1E2024]">C/O No. L S</code> from being mistakenly parsed as a new order.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200/60 bg-white/40 flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="liquid-glass-primary px-5 py-2 text-xs uppercase tracking-wider cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

