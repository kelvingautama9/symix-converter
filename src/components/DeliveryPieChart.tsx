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
      color: '#2E7D32', // Emerald green
    },
    {
      name: 'Sisa OS',
      value: sisaKg,
      percentage: sisaPct,
      pcs: sisaPcs,
      color: '#FF6B35', // Industrial orange
    },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#141414] text-white p-2 border-2 border-[#141414] shadow-[2px_2px_0px_#141414] font-mono text-[11px] z-50">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
            <span className="font-bold uppercase tracking-wider">{data.name}</span>
          </div>
          <div className="text-xs font-black text-amber-400">
            {data.value.toLocaleString('id-ID')} kg{' '}
            <span className="text-white text-[10px] font-normal">
              ({data.percentage.toFixed(1)}%)
            </span>
          </div>
          <div className="text-[10px] text-white/70">
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
      className="bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] p-3 sm:p-3.5 transition-all"
    >
      {/* Compact Header Bar */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#141414]/20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 bg-[#141414] text-white flex items-center justify-center shrink-0">
            <PieChartIcon className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2 truncate">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#141414] truncate">
              Rasio Pengiriman (Terkirim vs Sisa OS)
            </h3>
            <span className="text-[10px] font-mono text-[#141414]/60 hidden sm:inline">
              Akumulasi Bobot & Sisa Order
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="font-mono text-[10px] bg-[#F0F0EE] border border-[#141414] px-2 py-0.5">
            <span className="text-[#141414]/70 mr-1">Total Bobot:</span>
            <span className="font-black text-[#141414]">{totalKg.toLocaleString('id-ID')} kg</span>
          </div>

          <button
            type="button"
            id="btn-toggle-ratio-chart"
            onClick={() => {
              haptic.light();
              setIsCollapsed(!isCollapsed);
            }}
            className="p-1 hover:bg-[#F0F0EE] border border-[#141414] text-[#141414] transition-colors cursor-pointer"
            title={isCollapsed ? 'Buka detail rasio' : 'Ciutkan rasio'}
          >
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsed State: Single Clean Line */}
      {isCollapsed ? (
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[#2E7D32] font-bold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-[#2E7D32]" />
              Terkirim: {terkirimKg.toLocaleString('id-ID')} kg ({terkirimPct.toFixed(1)}%)
            </span>
            <span className="text-[#141414]/30">•</span>
            <span className="flex items-center gap-1.5 text-[#FF6B35] font-bold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-[#FF6B35]" />
              Sisa OS: {sisaKg.toLocaleString('id-ID')} kg ({sisaPct.toFixed(1)}%)
            </span>
          </div>

          <div className="w-full sm:w-48 h-2 bg-[#E0E0DE] border border-[#141414] flex overflow-hidden">
            <div className="bg-[#2E7D32] h-full" style={{ width: `${terkirimPct}%` }} />
            <div className="bg-[#FF6B35] h-full" style={{ width: `${sisaPct}%` }} />
          </div>
        </div>
      ) : (
        /* Expanded State: Compact Horizontal 1-Row Layout */
        <div className="pt-2.5 flex flex-col md:flex-row items-center gap-3 sm:gap-4">
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
                    innerRadius={26}
                    outerRadius={40}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="#141414"
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
              <span className="text-xs font-black font-mono text-[#141414] leading-none">
                {terkirimPct.toFixed(0)}%
              </span>
              <span className="text-[8px] font-mono uppercase tracking-tight text-[#141414]/60 font-bold mt-0.5">
                KIRIM
              </span>
            </div>
          </div>

          {/* Right Section: Compact Metric Cards & Progress Bar */}
          <div className="flex-1 w-full flex flex-col justify-center gap-2 min-w-0">
            {/* Side-by-side metric cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Card Terkirim */}
              <div className="p-2 sm:px-2.5 bg-[#F9FBF9] border border-[#2E7D32] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-5 h-5 bg-[#2E7D32] text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold uppercase text-[#2E7D32] truncate">
                        Total Terkirim
                      </span>
                      <span className="px-1 py-0.2 bg-[#2E7D32] text-white font-mono font-bold text-[9px] shrink-0">
                        {terkirimPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#141414]/60 truncate">
                      {terkirimPcs.toLocaleString('id-ID')} pcs
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono shrink-0">
                  <div className="text-xs sm:text-sm font-black text-[#141414]">
                    {terkirimKg.toLocaleString('id-ID')}{' '}
                    <span className="text-[10px] font-normal text-[#141414]/60">kg</span>
                  </div>
                </div>
              </div>

              {/* Card Sisa OS */}
              <div className="p-2 sm:px-2.5 bg-[#FFF9F6] border border-[#FF6B35] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-5 h-5 bg-[#FF6B35] text-white flex items-center justify-center shrink-0">
                    <Clock className="w-3 h-3" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold uppercase text-[#FF6B35] truncate">
                        Sisa OS
                      </span>
                      <span className="px-1 py-0.2 bg-[#FF6B35] text-white font-mono font-bold text-[9px] shrink-0">
                        {sisaPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#141414]/60 truncate">
                      {sisaPcs.toLocaleString('id-ID')} pcs
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono shrink-0">
                  <div className="text-xs sm:text-sm font-black text-[#141414]">
                    {sisaKg.toLocaleString('id-ID')}{' '}
                    <span className="text-[10px] font-normal text-[#141414]/60">kg</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Segmented Dual Bar */}
            <div>
              <div className="w-full h-2 bg-[#E0E0DE] border border-[#141414] flex overflow-hidden">
                <div
                  className="bg-[#2E7D32] h-full transition-all duration-300"
                  style={{ width: `${terkirimPct}%` }}
                  title={`Terkirim: ${terkirimKg.toLocaleString('id-ID')} kg (${terkirimPct.toFixed(1)}%)`}
                />
                <div
                  className="bg-[#FF6B35] h-full transition-all duration-300"
                  style={{ width: `${sisaPct}%` }}
                  title={`Sisa OS: ${sisaKg.toLocaleString('id-ID')} kg (${sisaPct.toFixed(1)}%)`}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
