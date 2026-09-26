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

  const overStockPcs = summary.totalOverStockGudangPcs || summary.totalOverProduksiPcs || 0;
  let overStockKg = summary.totalOverStockGudangKg || summary.totalOverProduksiKg || 0;
  if (overStockKg === 0 && overStockPcs > 0 && summary.totalQtyOrderPcs > 0 && summary.totalBeratOrderKg > 0) {
    overStockKg = Math.round((overStockPcs / summary.totalQtyOrderPcs) * summary.totalBeratOrderKg);
  }

  const overKirimanPcs = summary.totalOverKirimanPcs || 0;
  let overKirimanKg = summary.totalOverKirimanKg || 0;
  if (overKirimanKg === 0 && overKirimanPcs > 0 && summary.totalQtyOrderPcs > 0 && summary.totalBeratOrderKg > 0) {
    overKirimanKg = Math.round((overKirimanPcs / summary.totalQtyOrderPcs) * summary.totalBeratOrderKg);
  }

  return (
    <div
      id="stats-overview-grid"
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3.5"
    >
      {/* 1. Total PO */}
      <div
        id="stat-card-total-pos"
        className="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[142px] sm:min-h-[150px] transition-all hover:bg-white/85 shadow-2xs"
      >
        <div className="flex items-center justify-between text-[#5C6068] mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 truncate">Total PO</span>
          <div className="w-7 h-7 rounded-lg bg-zinc-100/90 border border-zinc-200/50 flex items-center justify-center text-zinc-600 shrink-0">
            <ShoppingBag className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#1E2024] tracking-tight leading-none">
            {summary.totalPOs.toLocaleString('id-ID')}
          </div>
          <div className="mt-2.5 pt-2 border-t border-zinc-200/50 flex flex-col gap-1">
            <div className="text-[11px] font-mono text-[#5C6068] truncate">
              {summary.totalUniqueItems || summary.totalPOs} unique artikel
            </div>
            <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar">
              <span
                className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 border border-emerald-500/25 rounded-full font-semibold font-mono text-[10px] whitespace-nowrap"
                title="Total CO Open"
              >
                {summary.totalCOOpen || 0} Open
              </span>
              <span
                className="px-2 py-0.5 bg-zinc-200/60 text-zinc-600 border border-zinc-300/40 rounded-full font-semibold font-mono text-[10px] whitespace-nowrap"
                title="Total CO Closed"
              >
                {summary.totalCOClosed || 0} Closed
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Total Order Qty */}
      <div
        id="stat-card-order-qty"
        className="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[142px] sm:min-h-[150px] transition-all hover:bg-white/85 shadow-2xs"
      >
        <div className="flex items-center justify-between text-[#5C6068] mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 truncate">Total Order</span>
          <div className="w-7 h-7 rounded-lg bg-zinc-100/90 border border-zinc-200/50 flex items-center justify-center text-zinc-600 shrink-0">
            <Package className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#1E2024] tracking-tight leading-none flex items-baseline gap-1">
            <span>{summary.totalQtyOrderPcs.toLocaleString('id-ID')}</span>
            <span className="text-xs font-normal text-[#5C6068]">pcs</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-zinc-200/50 flex flex-col gap-1">
            <div className="text-[11px] font-mono text-[#5C6068] truncate">
              {summary.totalBeratOrderKg.toLocaleString('id-ID')} kg bobot
            </div>
            <div className="flex items-center">
              <span className="px-2 py-0.5 bg-zinc-100/80 text-zinc-600 border border-zinc-200/60 rounded-full font-medium font-mono text-[10px] whitespace-nowrap">
                Akumulasi PO
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Sisa OS (pcs) - Warm Frosted Highlight Glass */}
      <div
        id="stat-card-sisa-os"
        className="glass-panel-warm rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[142px] sm:min-h-[150px] transition-all hover:bg-white/95 shadow-2xs"
      >
        <div className="flex items-center justify-between text-[#EA5413] mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider truncate">Sisa OS Kirim</span>
          <div className="w-7 h-7 rounded-lg bg-[#EA5413]/10 border border-[#EA5413]/20 flex items-center justify-center text-[#EA5413] shrink-0">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#EA5413] tracking-tight leading-none flex items-baseline gap-1">
            <span>{summary.totalSisaOSPcs.toLocaleString('id-ID')}</span>
            <span className="text-xs font-normal text-[#EA5413]/70">pcs</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-[#EA5413]/15 flex flex-col gap-1">
            <div className="text-[11px] font-mono text-[#EA5413]/90 font-medium truncate">
              {summary.totalSisaOSKg.toLocaleString('id-ID')} kg sisa
            </div>
            <div className="flex items-center">
              <span className="px-2 py-0.5 bg-amber-500/15 text-[#EA5413] border border-amber-500/25 rounded-full font-bold font-mono text-[10px] whitespace-nowrap">
                {100 - fulfillmentPct}% Belum Kirim
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Total Stock */}
      <div
        id="stat-card-stock"
        className="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[142px] sm:min-h-[150px] transition-all hover:bg-white/85 shadow-2xs"
      >
        <div className="flex items-center justify-between text-[#5C6068] mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 truncate">Stock Gudang</span>
          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200/50 flex items-center justify-center text-indigo-600 shrink-0">
            <Warehouse className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#1E2024] tracking-tight leading-none flex items-baseline gap-1">
            <span>{summary.totalStockPcs.toLocaleString('id-ID')}</span>
            <span className="text-xs font-normal text-[#5C6068]">pcs</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-zinc-200/50 flex flex-col gap-1">
            <div className="text-[11px] font-mono text-[#5C6068] truncate">
              {summary.totalStockKg.toLocaleString('id-ID')} kg inventory
            </div>
            <div className="flex items-center">
              {overStockPcs > 0 ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 text-indigo-700 border border-indigo-500/25 rounded-full text-[10px] font-bold font-mono whitespace-nowrap truncate max-w-full"
                  title={`Kelebihan stok fisik di gudang di atas PO Open: ${overStockPcs.toLocaleString('id-ID')} pcs (${overStockKg.toLocaleString('id-ID')} kg). Butuh penawaran sales ke customer.`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                  <span className="truncate">+{overStockPcs.toLocaleString('id-ID')} pcs ({overStockKg.toLocaleString('id-ID')} kg) Over</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-zinc-100/80 text-zinc-500 border border-zinc-200/60 rounded-full font-medium font-mono text-[10px] whitespace-nowrap">
                  Alokasi Standar
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Progress Pengiriman */}
      <div
        id="stat-card-delivery-progress"
        className="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[142px] sm:min-h-[150px] transition-all hover:bg-white/85 shadow-2xs"
      >
        <div className="flex items-center justify-between text-[#5C6068] mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 truncate">Total Terkirim</span>
          <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200/50 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircle className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-[#1E2024] tracking-tight leading-none flex items-baseline gap-1">
            <span>
              {(
                summary.totalTerkirimPcs ??
                summary.totalQtyOrderPcs - summary.totalSisaOSPcs
              ).toLocaleString('id-ID')}
            </span>
            <span className="text-xs font-normal text-[#5C6068]">pcs</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-zinc-200/50 flex flex-col gap-1">
            <div className="text-[11px] font-mono text-[#5C6068] truncate">
              {(
                summary.totalTerkirimKg ??
                summary.totalBeratOrderKg - summary.totalSisaOSKg
              ).toLocaleString('id-ID')}{' '}
              kg ({fulfillmentPct}%)
            </div>
            <div className="flex items-center">
              {overKirimanPcs > 0 ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-500/15 text-teal-800 border border-teal-500/30 rounded-full text-[10px] font-bold font-mono whitespace-nowrap truncate max-w-full"
                  title={`Kuantitas pengiriman Surat Jalan melebihi PO: ${overKirimanPcs.toLocaleString('id-ID')} pcs (${overKirimanKg.toLocaleString('id-ID')} kg).`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0" />
                  <span className="truncate">+{overKirimanPcs.toLocaleString('id-ID')} pcs ({overKirimanKg.toLocaleString('id-ID')} kg) Over</span>
                </span>
              ) : (
                <div className="w-full bg-zinc-200/70 rounded-full h-1.5 overflow-hidden my-0.5">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500 shadow-2xs"
                    style={{ width: `${Math.min(100, Math.max(0, fulfillmentPct))}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 6. Estimasi Valuasi OS */}
      <div
        id="stat-card-valuation"
        className="glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between min-h-[142px] sm:min-h-[150px] transition-all hover:bg-white/85 shadow-2xs"
      >
        <div className="flex items-center justify-between text-[#5C6068] mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 truncate">Valuasi Sisa</span>
          <div className="w-7 h-7 rounded-lg bg-zinc-100/90 border border-zinc-200/50 flex items-center justify-center text-zinc-600 shrink-0">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <div
            className="text-2xl sm:text-3xl font-black font-mono text-[#1E2024] tracking-tight leading-none truncate"
            title={`Rp ${summary.totalValue.toLocaleString('id-ID')}`}
          >
            {formatIndonesianCurrency(summary.totalValue)}
          </div>
          <div className="mt-2.5 pt-2 border-t border-zinc-200/50 flex flex-col gap-1">
            <div className="text-[11px] font-mono text-[#5C6068] truncate">
              {summary.itemsWithDelivery} item parsial
            </div>
            <div className="flex items-center">
              <span className="px-2 py-0.5 bg-zinc-100/80 text-zinc-600 border border-zinc-200/60 rounded-full font-medium font-mono text-[10px] whitespace-nowrap">
                Estimasi Nominal
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
