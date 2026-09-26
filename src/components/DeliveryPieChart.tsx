import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ParseSummary } from '../types';
import { PieChart as PieChartIcon, CheckCircle2, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { haptic } from '../utils/haptics';

interface DeliveryPieChartProps {
  summary: ParseSummary;
}

export const DeliveryPieChart: React.FC<DeliveryPieChartProps> = ({ summary }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const terkirimKg =
    summary.totalTerkirimKg ?? Math.max(0, summary.totalBeratOrderKg - summary.totalSisaOSKg);
  const sisaKg = summary.totalSisaOSKg;
  const totalKg = terkirimKg + sisaKg > 0 ? terkirimKg + sisaKg : summary.totalBeratOrderKg;

  const terkirimPct = totalKg > 0 ? (terkirimKg / totalKg) * 100 : 0;
  const sisaPct = totalKg > 0 ? (sisaKg / totalKg) * 100 : 0;

  const terkirimPcs =
    summary.totalTerkirimPcs ?? Math.max(0, summary.totalQtyOrderPcs - summary.totalSisaOSPcs);
  const sisaPcs = summary.totalSisaOSPcs;

  const chartData = [
    {
      name: 'Total Terkirim',
      value: terkirimKg,
      percentage: terkirimPct,
      pcs: terkirimPcs,
      color: '#10B981', // Emerald
    },
    {
      name: 'Sisa OS',
      value: sisaKg,
      percentage: sisaPct,
      pcs: sisaPcs,
      color: '#EA5413', // Warm Orange
    },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-dropdown p-2.5 rounded-2xl font-mono text-xs z-50">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
            <span className="font-semibold uppercase tracking-wider text-[#1E2024]">
              {data.name}
            </span>
          </div>
          <div className="text-sm font-bold text-[#EA5413]">
            {data.value.toLocaleString('id-ID')} kg{' '}
            <span className="text-[#5C6068] text-xs font-normal">
              ({data.percentage.toFixed(1)}%)
            </span>
          </div>
          <div className="text-[11px] text-[#5C6068]">
            {data.pcs.toLocaleString('id-ID')} pcs
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      id="delivery-ratio-pie-chart"
      className="glass-panel rounded-3xl p-3.5 sm:p-4 transition-all"
    >
      {/* Compact Header Bar */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-200/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg glass-card flex items-center justify-center shrink-0 shadow-sm text-emerald-600">
            <PieChartIcon className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline gap-2 truncate">
            <h3 className="text-xs sm:text-sm font-bold tracking-tight text-[#1E2024] truncate">
              Rasio Pengiriman (Terkirim vs Sisa OS)
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="font-mono text-xs bg-white/70 border border-white/90 rounded-full px-3 py-1 shadow-sm">
            <span className="text-[#5C6068] mr-1.5">Total:</span>
            <span className="font-bold text-[#1E2024]">{totalKg.toLocaleString('id-ID')} kg</span>
          </div>

          <button
            type="button"
            id="btn-toggle-ratio-chart"
            onClick={() => {
              haptic.light();
              setIsCollapsed(!isCollapsed);
            }}
            className="liquid-glass-clear p-1.5 rounded-full text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
            title={isCollapsed ? 'Buka detail rasio' : 'Ciutkan rasio'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsed State */}
      {isCollapsed ? (
        <div className="pt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />
              Terkirim: {terkirimKg.toLocaleString('id-ID')} kg ({terkirimPct.toFixed(1)}%)
            </span>
            <span className="text-zinc-300">•</span>
            <span className="flex items-center gap-1.5 text-[#EA5413] font-semibold text-xs">
              <span className="w-2 h-2 rounded-full bg-[#EA5413] shadow-sm" />
              Sisa OS: {sisaKg.toLocaleString('id-ID')} kg ({sisaPct.toFixed(1)}%)
            </span>
          </div>

          <div className="w-full sm:w-48 h-2 bg-zinc-200/70 rounded-full flex overflow-hidden p-0.5">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${terkirimPct}%` }} />
            <div className="bg-[#EA5413] h-full rounded-full" style={{ width: `${sisaPct}%` }} />
          </div>
        </div>
      ) : (
        /* Expanded State: Compact Horizontal 1-Row Layout */
        <div className="pt-3 flex flex-col md:flex-row items-center gap-3 sm:gap-5">
          {/* Miniature Donut Ring (84x84px) */}
          <div className="relative w-[84px] h-[84px] shrink-0 flex items-center justify-center">
            <div className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomTooltip />} />
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={27}
                    outerRadius={40}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth={1.5}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs font-bold font-mono text-[#1E2024] leading-none">
                {terkirimPct.toFixed(0)}%
              </span>
              <span className="text-[8px] font-semibold tracking-wider text-[#5C6068] uppercase mt-0.5">
                KIRIM
              </span>
            </div>
          </div>

          {/* Right Section: Compact Metric Cards & Progress Bar */}
          <div className="flex-1 w-full flex flex-col justify-center gap-2.5 min-w-0">
            {/* Side-by-side metric cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Card Terkirim */}
              <div className="p-2.5 sm:px-3 bg-emerald-500/5 border border-emerald-500/25 rounded-2xl flex items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider truncate">
                        Total Terkirim
                      </span>
                      <span className="px-1.5 py-0.2 bg-emerald-500/15 text-emerald-700 font-mono font-semibold text-[10px] rounded-full">
                        {terkirimPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#5C6068] truncate">
                      {terkirimPcs.toLocaleString('id-ID')} pcs
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono shrink-0">
                  <div className="text-xs sm:text-sm font-bold text-[#1E2024]">
                    {terkirimKg.toLocaleString('id-ID')}{' '}
                    <span className="text-[10px] font-normal text-[#5C6068]">kg</span>
                  </div>
                </div>
              </div>

              {/* Card Sisa OS */}
              <div className="p-2.5 sm:px-3 bg-[#EA5413]/5 border border-[#EA5413]/25 rounded-2xl flex items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[#EA5413]/15 text-[#EA5413] flex items-center justify-center shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[#EA5413] uppercase tracking-wider truncate">
                        Sisa OS
                      </span>
                      <span className="px-1.5 py-0.2 bg-[#EA5413]/15 text-[#EA5413] font-mono font-semibold text-[10px] rounded-full">
                        {sisaPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#5C6068] truncate">
                      {sisaPcs.toLocaleString('id-ID')} pcs
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono shrink-0">
                  <div className="text-xs sm:text-sm font-bold text-[#1E2024]">
                    {sisaKg.toLocaleString('id-ID')}{' '}
                    <span className="text-[10px] font-normal text-[#5C6068]">kg</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Segmented Dual Bar */}
            <div className="w-full h-2 bg-zinc-200/70 rounded-full flex overflow-hidden p-0.5 backdrop-blur-sm">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${terkirimPct}%` }}
                title={`Terkirim: ${terkirimKg.toLocaleString('id-ID')} kg (${terkirimPct.toFixed(1)}%)`}
              />
              <div
                className="bg-[#EA5413] h-full rounded-full transition-all duration-300 shadow-sm"
                style={{ width: `${sisaPct}%` }}
                title={`Sisa OS: ${sisaKg.toLocaleString('id-ID')} kg (${sisaPct.toFixed(1)}%)`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
