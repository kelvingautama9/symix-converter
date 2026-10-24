import React from 'react';
import { ParseSummary } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

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
  const { t } = useLanguage();
  const fulfillmentPct =
    summary.totalQtyOrderPcs > 0
      ? Math.round(
          ((summary.totalQtyOrderPcs - summary.totalSisaOSPcs) / summary.totalQtyOrderPcs) * 100
        )
      : 0;

  const overStockPcs = summary.totalOverStockGudangPcs || summary.totalOverProduksiPcs || 0;
  let overStockKg = summary.totalOverStockGudangKg || summary.totalOverProduksiKg || 0;
  if (
    overStockKg === 0 &&
    overStockPcs > 0 &&
    summary.totalQtyOrderPcs > 0 &&
    summary.totalBeratOrderKg > 0
  ) {
    overStockKg = Math.round(
      (overStockPcs / summary.totalQtyOrderPcs) * summary.totalBeratOrderKg
    );
  }

  const overKirimanPcs = summary.totalOverKirimanPcs || 0;

  return (
    <div
      id="stats-overview-grid"
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3"
    >
      {/* 1. Total PO & Item */}
      <div
        id="stat-card-total-pos"
        className="glass-panel rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[112px]"
      >
        <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate">
          {t.statTotalPoItem}
        </div>
        <div className="mt-1.5 sm:mt-2">
          <div className="flex items-baseline gap-1 text-slate-900 flex-wrap">
            <span
              className="text-lg sm:text-xl xl:text-2xl font-bold font-mono tracking-tight leading-none"
              title={t.statTotalPoItem}
            >
              {(summary.totalUniquePONumbers || summary.totalPOs).toLocaleString('id-ID')}
            </span>
            <span className="text-[11px] font-semibold font-mono text-[#19719C]">
              {t.unitPoShort}
            </span>
            <span className="text-slate-300 mx-0.5 text-xs">/</span>
            <span
              className="text-xs sm:text-sm font-semibold font-mono text-slate-600 truncate"
              title={t.unitItem}
            >
              {summary.totalPOs.toLocaleString('id-ID')} {t.unitItem}
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500">
            <span className="truncate">
              {summary.totalUniqueItems || summary.totalPOs} {t.unitArt}
              {(summary.totalMultiItemPONumbers || 0) > 0
                ? ` · ${summary.totalMultiItemPONumbers} ${t.unitMulti}`
                : ''}
            </span>
            <span className="text-emerald-700 font-semibold shrink-0">
              {summary.totalCOOpen || 0} {t.statusOpenShort}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Total Order */}
      <div
        id="stat-card-order-qty"
        className="glass-panel rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[112px]"
      >
        <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate">
          {t.statTotalOrder}
        </div>
        <div className="mt-1.5 sm:mt-2">
          <div className="text-lg sm:text-xl xl:text-2xl font-bold font-mono text-slate-900 tracking-tight leading-none flex items-baseline gap-1">
            <span>{summary.totalQtyOrderPcs.toLocaleString('id-ID')}</span>
            <span className="text-[10px] sm:text-xs font-normal text-slate-500">{t.unitPcs}</span>
          </div>
          <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500">
            <span className="truncate">
              {summary.totalBeratOrderKg.toLocaleString('id-ID')} {t.unitKg}
            </span>
            <span className="text-slate-400 shrink-0">{t.poQuota}</span>
          </div>
        </div>
      </div>

      {/* 3. Sisa OS */}
      <div
        id="stat-card-sisa-os"
        className="glass-panel-warm rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[112px]"
      >
        <div className="text-[10px] sm:text-[11px] font-semibold text-[#EA5413] truncate">
          {t.statSisaOS}
        </div>
        <div className="mt-1.5 sm:mt-2">
          <div className="text-lg sm:text-xl xl:text-2xl font-bold font-mono text-[#EA5413] tracking-tight leading-none flex items-baseline gap-1">
            <span>{summary.totalSisaOSPcs.toLocaleString('id-ID')}</span>
            <span className="text-[10px] sm:text-xs font-normal text-[#EA5413]/75">
              {t.unitPcs}
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-orange-200/60 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-[#EA5413]">
            <span className="font-medium truncate">
              {summary.totalSisaOSKg.toLocaleString('id-ID')} {t.unitKg}
            </span>
            <span className="font-semibold shrink-0">
              {100 - fulfillmentPct}% {t.unitOS}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Stok Gudang */}
      <div
        id="stat-card-stock"
        className="glass-panel rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[112px]"
      >
        <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate">
          {t.statStokGudang}
        </div>
        <div className="mt-1.5 sm:mt-2">
          <div className="text-lg sm:text-xl xl:text-2xl font-bold font-mono text-slate-900 tracking-tight leading-none flex items-baseline gap-1">
            <span>{summary.totalStockPcs.toLocaleString('id-ID')}</span>
            <span className="text-[10px] sm:text-xs font-normal text-slate-500">{t.unitPcs}</span>
          </div>
          <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500">
            <span className="truncate">
              {summary.totalStockKg.toLocaleString('id-ID')} {t.unitKg}
            </span>
            {overStockPcs > 0 ? (
              <span
                className="text-indigo-700 font-semibold truncate shrink-0"
                title={`${t.overStockCard}: ${overStockPcs.toLocaleString('id-ID')} ${t.unitPcs} (${overStockKg.toLocaleString('id-ID')} ${t.unitKg})`}
              >
                +{overStockPcs.toLocaleString('id-ID')} {t.overShort}
              </span>
            ) : (
              <span className="text-slate-400 shrink-0">{t.readyToShipShort}</span>
            )}
          </div>
        </div>
      </div>

      {/* 5. Terkirim */}
      <div
        id="stat-card-delivery-progress"
        className="glass-panel rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[112px]"
      >
        <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate">
          {t.statTerkirim}
        </div>
        <div className="mt-1.5 sm:mt-2">
          <div className="text-lg sm:text-xl xl:text-2xl font-bold font-mono text-emerald-700 tracking-tight leading-none flex items-baseline gap-1">
            <span>
              {(
                summary.totalTerkirimPcs ??
                summary.totalQtyOrderPcs - summary.totalSisaOSPcs
              ).toLocaleString('id-ID')}
            </span>
            <span className="text-[10px] sm:text-xs font-normal text-slate-500">{t.unitPcs}</span>
          </div>
          <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500">
            <span className="truncate">
              {(
                summary.totalTerkirimKg ??
                summary.totalBeratOrderKg - summary.totalSisaOSKg
              ).toLocaleString('id-ID')}{' '}
              {t.unitKg}
            </span>
            {overKirimanPcs > 0 ? (
              <span className="text-teal-700 font-semibold shrink-0">
                +{overKirimanPcs.toLocaleString('id-ID')}
              </span>
            ) : (
              <span className="text-emerald-700 font-semibold shrink-0">{fulfillmentPct}%</span>
            )}
          </div>
        </div>
      </div>

      {/* 6. Valuasi OS */}
      <div
        id="stat-card-valuation"
        className="glass-panel rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[112px]"
      >
        <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate">
          {t.statValuasiOS}
        </div>
        <div className="mt-1.5 sm:mt-2">
          <div
            className="text-lg sm:text-xl xl:text-2xl font-bold font-mono text-slate-900 tracking-tight leading-none truncate"
            title={`Rp ${summary.totalValue.toLocaleString('id-ID')}`}
          >
            {formatIndonesianCurrency(summary.totalValue)}
          </div>
          <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500">
            <span className="truncate">
              {summary.itemsWithDelivery} {t.activeItemsCount}
            </span>
            <span className="text-slate-400 shrink-0">{t.estimatedLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
