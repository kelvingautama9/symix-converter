import React from 'react';
import { ParseSummary } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface DeliveryPieChartProps {
  summary: ParseSummary;
}

export const DeliveryPieChart: React.FC<DeliveryPieChartProps> = ({ summary }) => {
  const { t } = useLanguage();
  const terkirimKg =
    summary.totalTerkirimKg ?? Math.max(0, summary.totalBeratOrderKg - summary.totalSisaOSKg);
  const sisaKg = summary.totalSisaOSKg;
  const totalKg = terkirimKg + sisaKg > 0 ? terkirimKg + sisaKg : summary.totalBeratOrderKg;

  const terkirimPct = totalKg > 0 ? (terkirimKg / totalKg) * 100 : 0;
  const sisaPct = totalKg > 0 ? (sisaKg / totalKg) * 100 : 0;

  const terkirimPcs =
    summary.totalTerkirimPcs ?? Math.max(0, summary.totalQtyOrderPcs - summary.totalSisaOSPcs);
  const sisaPcs = summary.totalSisaOSPcs;

  return (
    <div
      id="delivery-ratio-pie-chart"
      className="px-1 py-0.5 flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[11px] sm:text-xs font-mono">
        <span className="font-sans font-semibold text-slate-700 text-xs shrink-0">
          {t.tonnageRatioLabel}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-emerald-700 font-semibold whitespace-nowrap">
            {t.statTerkirim} {terkirimKg.toLocaleString('id-ID')} {t.unitKg} ({terkirimPct.toFixed(1)}%)
            <span className="text-slate-400 font-normal hidden xs:inline">
              {' '}
              · {terkirimPcs.toLocaleString('id-ID')} {t.unitPcs}
            </span>
          </span>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span className="text-[#EA5413] font-semibold whitespace-nowrap">
            {t.statSisaOS} {sisaKg.toLocaleString('id-ID')} {t.unitKg} ({sisaPct.toFixed(1)}%)
            <span className="text-slate-400 font-normal hidden xs:inline">
              {' '}
              · {sisaPcs.toLocaleString('id-ID')} {t.unitPcs}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 w-full md:w-64 lg:w-72 shrink-0">
        <div className="flex-1 h-2 bg-slate-200/80 rounded-full flex overflow-hidden">
          <div
            className="bg-emerald-600 h-full transition-all duration-200"
            style={{ width: `${terkirimPct}%` }}
          />
          <div
            className="bg-[#EA5413] h-full transition-all duration-200"
            style={{ width: `${sisaPct}%` }}
          />
        </div>
        <span className="text-[10px] sm:text-[11px] font-mono text-slate-500 tabular-nums shrink-0">
          {totalKg.toLocaleString('id-ID')} {t.unitKg}
        </span>
      </div>
    </div>
  );
};
