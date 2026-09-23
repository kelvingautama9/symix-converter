import React from 'react';
import { ParseSummary } from '../types';
import { Package, ShoppingBag, Warehouse, TrendingUp, CheckCircle, Clock } from 'lucide-react';

interface StatsOverviewProps {
  summary: ParseSummary;
}

const formatIndonesianCurrency = (value: number): string => {
  if (!value || isNaN(value) || value <= 0) return 'Rp 0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) {
    const formatted = (value / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '');
    return `Rp ${formatted}T`;
  }
  if (abs >= 1_000_000_000) {
    const formatted = (value / 1_000_000_000).toFixed(1).replace(/\.0$/, '');
    return `Rp ${formatted}M`;
  }
  if (abs >= 1_000_000) {
    const formatted = (value / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `Rp ${formatted}JT`;
  }
  if (abs >= 1_000) {
    const formatted = (value / 1_000).toFixed(1).replace(/\.0$/, '');
    return `Rp ${formatted}RB`;
  }
  return `Rp ${value.toLocaleString('id-ID')}`;
};

export const StatsOverview: React.FC<StatsOverviewProps> = ({ summary }) => {
  const fulfillmentPct =
    summary.totalQtyOrderPcs > 0
      ? Math.round(
          ((summary.totalQtyOrderPcs - summary.totalSisaOSPcs) / summary.totalQtyOrderPcs) * 100
        )
      : 0;

  return (
    <div
      id="stats-overview-grid"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5"
    >
      {/* 1. Total PO */}
      <div
        id="stat-card-total-pos"
        className="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between transition-all hover:bg-white/85"
      >
        <div className="flex items-center justify-between text-[#5C6068] mb-1.5 sm:mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider truncate">Total PO</span>
          <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 shrink-0" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold font-mono text-[#1E2024] tracking-tight">
            {summary.totalPOs.toLocaleString('id-ID')}
          </div>
          <div className="flex flex-wrap items-center gap-1 mt-1.5 font-mono text-[10px]">
            <span
              className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 rounded-full font-medium"
              title="Total CO Open"
            >
              {summary.totalCOOpen || 0} Open
            </span>
            <span
              className="px-2 py-0.5 bg-zinc-200/60 text-zinc-600 border border-zinc-300/40 rounded-full font-medium"
              title="Total CO Closed"
            >
              {summary.totalCOClosed || 0} Closed
            </span>
          </div>
        </div>
      </div>

      {/* 2. Total Order Qty */}
      <div
        id="stat-card-order-qty"
        className="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between transition-all hover:bg-white/85"
      >
        <div className="flex items-center justify-between text-[#5C6068] mb-1.5 sm:mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider truncate">Total Order</span>
          <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 shrink-0" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold font-mono text-[#1E2024] tracking-tight">
            {summary.totalQtyOrderPcs.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-[#5C6068]">pcs</span>
          </div>
          <p className="text-[11px] text-[#5C6068] mt-1 font-mono truncate">
            {summary.totalBeratOrderKg.toLocaleString('id-ID')} kg bobot
          </p>
        </div>
      </div>

      {/* 3. Sisa OS (pcs) - Warm Frosted Highlight Glass */}
      <div
        id="stat-card-sisa-os"
        className="glass-panel-warm rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between transition-all hover:bg-white/95"
      >
        <div className="flex items-center justify-between text-[#EA5413] mb-1.5 sm:mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider truncate">Sisa OS Kirim</span>
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#EA5413] shrink-0" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-[#EA5413] tracking-tight">
            {summary.totalSisaOSPcs.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-[#EA5413]/70">pcs</span>
          </div>
          <p className="text-[11px] text-[#EA5413]/80 mt-1 font-mono font-medium truncate">
            {summary.totalSisaOSKg.toLocaleString('id-ID')} kg sisa
          </p>
        </div>
      </div>

      {/* 4. Total Stock */}
      <div
        id="stat-card-stock"
        className="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between transition-all hover:bg-white/85"
      >
        <div className="flex items-center justify-between text-[#5C6068] mb-1.5 sm:mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider truncate">Stock Gudang</span>
          <Warehouse className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 shrink-0" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold font-mono text-[#1E2024] tracking-tight">
            {summary.totalStockPcs.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-[#5C6068]">pcs</span>
          </div>
          <p className="text-[11px] text-[#5C6068] mt-1 font-mono truncate">
            {summary.totalStockKg.toLocaleString('id-ID')} kg inventory
          </p>
        </div>
      </div>

      {/* 5. Progress Pengiriman */}
      <div
        id="stat-card-delivery-progress"
        className="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between transition-all hover:bg-white/85"
      >
        <div className="flex items-center justify-between text-[#5C6068] mb-1.5 sm:mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider truncate">Total Terkirim</span>
          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
        </div>
        <div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-bold font-mono text-[#1E2024] tracking-tight">
            {(
              summary.totalTerkirimPcs ??
              summary.totalQtyOrderPcs - summary.totalSisaOSPcs
            ).toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-[#5C6068]">pcs</span>
          </div>
          <p className="text-[11px] text-[#5C6068] mt-1 font-mono truncate">
            {(
              summary.totalTerkirimKg ??
              summary.totalBeratOrderKg - summary.totalSisaOSKg
            ).toLocaleString('id-ID')}{' '}
            kg ({fulfillmentPct}%)
          </p>
          <div className="w-full bg-zinc-200/70 rounded-full h-1.5 sm:h-2 mt-2 overflow-hidden p-0.5 backdrop-blur-sm">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${Math.min(100, Math.max(0, fulfillmentPct))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 6. Estimasi Valuasi OS */}
      <div
        id="stat-card-valuation"
        className="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between transition-all hover:bg-white/85"
      >
        <div className="flex items-center justify-between text-[#5C6068] mb-1.5 sm:mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider truncate">Valuasi Sisa</span>
          <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 shrink-0" />
        </div>
        <div>
          <div
            className="text-lg sm:text-2xl font-bold font-mono text-[#1E2024] tracking-tight truncate"
            title={`Rp ${summary.totalValue.toLocaleString('id-ID')}`}
          >
            {formatIndonesianCurrency(summary.totalValue)}
          </div>
          <p className="text-[11px] text-[#5C6068] mt-1 font-mono truncate">
            {summary.itemsWithDelivery} item parsial
          </p>
        </div>
      </div>
    </div>
  );
};
