import React from 'react';
import { ParseSummary } from '../types';
import { Package, ShoppingBag, Layers, Warehouse, TrendingUp, CheckCircle, Clock } from 'lucide-react';

interface StatsOverviewProps {
  summary: ParseSummary;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ summary }) => {
  const fulfillmentPct = summary.totalQtyOrderPcs > 0
    ? Math.round(((summary.totalQtyOrderPcs - summary.totalSisaOSPcs) / summary.totalQtyOrderPcs) * 100)
    : 0;

  return (
    <div id="stats-overview-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
      {/* 1. Total PO */}
      <div id="stat-card-total-pos" className="bg-white border-2 border-[#141414] p-3 sm:p-4 flex flex-col justify-between shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-[#141414] mb-1.5 sm:mb-2">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">Total PO</span>
          <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#141414] shrink-0" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-[#141414] tracking-tight">
            {summary.totalPOs.toLocaleString('id-ID')}
          </div>
          <div className="flex flex-wrap items-center gap-1 mt-1 font-mono text-[9px] sm:text-[10px]">
            <span className="px-1 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-500 font-bold" title="Total CO yang masih Open (O)">
              {summary.totalCOOpen || 0} Open
            </span>
            <span className="px-1 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-400 font-bold" title="Total CO yang sudah Closed (C)">
              {summary.totalCOClosed || 0} Closed
            </span>
          </div>
        </div>
      </div>

      {/* 2. Total Order Qty */}
      <div id="stat-card-order-qty" className="bg-white border-2 border-[#141414] p-3 sm:p-4 flex flex-col justify-between shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-[#141414] mb-1.5 sm:mb-2">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">Total Order</span>
          <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#141414] shrink-0" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-[#141414] tracking-tight">
            {summary.totalQtyOrderPcs.toLocaleString('id-ID')} <span className="text-[10px] sm:text-xs font-normal text-[#141414]/60">pcs</span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-[#141414]/70 mt-1 font-mono truncate">
            {summary.totalBeratOrderKg.toLocaleString('id-ID')} kg bobot
          </p>
        </div>
      </div>

      {/* 3. Sisa OS (pcs) - Highlighted Bento card */}
      <div id="stat-card-sisa-os" className="bg-[#FF6B35] border-2 border-[#141414] p-3 sm:p-4 flex flex-col justify-between text-white shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-white mb-1.5 sm:mb-2">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">Sisa OS Kirim</span>
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-white tracking-tight">
            {summary.totalSisaOSPcs.toLocaleString('id-ID')} <span className="text-[10px] sm:text-xs font-normal text-white/80">pcs</span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-white/90 mt-1 font-mono font-medium truncate">
            {summary.totalSisaOSKg.toLocaleString('id-ID')} kg outstanding
          </p>
        </div>
      </div>

      {/* 4. Total Stock */}
      <div id="stat-card-stock" className="bg-white border-2 border-[#141414] p-3 sm:p-4 flex flex-col justify-between shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-[#141414] mb-1.5 sm:mb-2">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">Stock Gudang</span>
          <Warehouse className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#141414] shrink-0" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-[#141414] tracking-tight">
            {summary.totalStockPcs.toLocaleString('id-ID')} <span className="text-[10px] sm:text-xs font-normal text-[#141414]/60">pcs</span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-[#141414]/70 mt-1 font-mono truncate">
            {summary.totalStockKg.toLocaleString('id-ID')} kg inventory
          </p>
        </div>
      </div>

      {/* 5. Progress Pengiriman */}
      <div id="stat-card-delivery-progress" className="bg-[#DEDEDE] border-2 border-[#141414] p-3 sm:p-4 flex flex-col justify-between shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-[#141414] mb-1.5 sm:mb-2">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">Total Terkirim</span>
          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#141414] shrink-0" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-[#141414] tracking-tight">
            {(summary.totalTerkirimPcs ?? (summary.totalQtyOrderPcs - summary.totalSisaOSPcs)).toLocaleString('id-ID')} <span className="text-[10px] sm:text-xs font-normal text-[#141414]/60">pcs</span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-[#141414]/70 mt-1 font-mono truncate">
            {(summary.totalTerkirimKg ?? (summary.totalBeratOrderKg - summary.totalSisaOSKg)).toLocaleString('id-ID')} kg ({fulfillmentPct}%)
          </p>
          <div className="w-full bg-white border border-[#141414] h-1.5 sm:h-2 mt-1.5 overflow-hidden">
            <div
              className="bg-[#2E7D32] h-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, fulfillmentPct))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 6. Estimasi Valuasi OS */}
      <div id="stat-card-valuation" className="bg-white border-2 border-[#141414] p-3 sm:p-4 flex flex-col justify-between shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-[#141414] mb-1.5 sm:mb-2">
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider truncate">Valuasi Sisa</span>
          <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#141414] shrink-0" />
        </div>
        <div>
          <div className="text-lg sm:text-2xl font-black font-mono text-[#141414] tracking-tight truncate" title={`Rp ${summary.totalValue.toLocaleString('id-ID')}`}>
            {summary.totalValue > 0
              ? `Rp ${(summary.totalValue / 1_000_000).toFixed(1)}M`
              : 'Rp 0'}
          </div>
          <p className="text-[10px] sm:text-[11px] text-[#141414]/70 mt-1 font-mono truncate">
            {summary.itemsWithDelivery} item parsial
          </p>
        </div>
      </div>
    </div>
  );
};
