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
    <div id="stats-overview-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. Total PO */}
      <div id="stat-card-total-pos" className="bg-white border-2 border-[#141414] p-4 flex flex-col justify-between shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-[#141414] mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider">Total PO</span>
          <ShoppingBag className="w-4 h-4 text-[#141414]" />
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#141414] tracking-tight">
            {summary.totalPOs.toLocaleString('id-ID')}
          </div>
          <p className="text-[11px] text-[#141414]/70 mt-1 font-mono">
            <span className="font-bold text-[#141414]">{summary.totalUniqueItems}</span> Item SKU
          </p>
        </div>
      </div>

      {/* 2. Total Order Qty */}
      <div id="stat-card-order-qty" className="bg-white border-2 border-[#141414] p-4 flex flex-col justify-between shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-[#141414] mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider">Total Order</span>
          <Package className="w-4 h-4 text-[#141414]" />
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#141414] tracking-tight">
            {summary.totalQtyOrderPcs.toLocaleString('id-ID')} <span className="text-xs font-normal text-[#141414]/60">pcs</span>
          </div>
          <p className="text-[11px] text-[#141414]/70 mt-1 font-mono">
            {summary.totalBeratOrderKg.toLocaleString('id-ID')} kg bobot
          </p>
        </div>
      </div>

      {/* 3. Sisa OS (pcs) - Highlighted Bento card */}
      <div id="stat-card-sisa-os" className="bg-[#FF6B35] border-2 border-[#141414] p-4 flex flex-col justify-between text-white shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-white mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider">Sisa OS Kirim</span>
          <Clock className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight">
            {summary.totalSisaOSPcs.toLocaleString('id-ID')} <span className="text-xs font-normal text-white/80">pcs</span>
          </div>
          <p className="text-[11px] text-white/90 mt-1 font-mono font-medium">
            {summary.totalSisaOSKg.toLocaleString('id-ID')} kg outstanding
          </p>
        </div>
      </div>

      {/* 4. Total Stock */}
      <div id="stat-card-stock" className="bg-white border-2 border-[#141414] p-4 flex flex-col justify-between shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-[#141414] mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider">Stock Gudang</span>
          <Warehouse className="w-4 h-4 text-[#141414]" />
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#141414] tracking-tight">
            {summary.totalStockPcs.toLocaleString('id-ID')} <span className="text-xs font-normal text-[#141414]/60">pcs</span>
          </div>
          <p className="text-[11px] text-[#141414]/70 mt-1 font-mono">
            {summary.totalStockKg.toLocaleString('id-ID')} kg inventory
          </p>
        </div>
      </div>

      {/* 5. Progress Pengiriman */}
      <div id="stat-card-delivery-progress" className="bg-[#DEDEDE] border-2 border-[#141414] p-4 flex flex-col justify-between shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-[#141414] mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider">Fulfillment</span>
          <CheckCircle className="w-4 h-4 text-[#141414]" />
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#141414] tracking-tight">
            {fulfillmentPct}%
          </div>
          <div className="w-full bg-white border border-[#141414] h-2.5 mt-2 overflow-hidden">
            <div
              className="bg-[#141414] h-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, fulfillmentPct))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 6. Estimasi Valuasi OS */}
      <div id="stat-card-valuation" className="bg-white border-2 border-[#141414] p-4 flex flex-col justify-between shadow-[2px_2px_0px_#141414]">
        <div className="flex items-center justify-between text-[#141414] mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider">Valuasi Sisa</span>
          <TrendingUp className="w-4 h-4 text-[#141414]" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-black font-mono text-[#141414] tracking-tight truncate" title={`Rp ${summary.totalValue.toLocaleString('id-ID')}`}>
            {summary.totalValue > 0
              ? `Rp ${(summary.totalValue / 1_000_000).toFixed(1)}M`
              : 'Rp 0'}
          </div>
          <p className="text-[11px] text-[#141414]/70 mt-1 font-mono truncate">
            {summary.itemsWithDelivery} item parsial
          </p>
        </div>
      </div>
    </div>
  );
};
