import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ParseSummary } from '../types';
import { PieChart as PieChartIcon, CheckCircle2, Clock } from 'lucide-react';

interface DeliveryPieChartProps {
  summary: ParseSummary;
}

export const DeliveryPieChart: React.FC<DeliveryPieChartProps> = ({ summary }) => {
  const terkirimKg = summary.totalTerkirimKg ?? Math.max(0, summary.totalBeratOrderKg - summary.totalSisaOSKg);
  const sisaKg = summary.totalSisaOSKg;
  const totalKg = terkirimKg + sisaKg > 0 ? terkirimKg + sisaKg : summary.totalBeratOrderKg;

  const terkirimPct = totalKg > 0 ? (terkirimKg / totalKg) * 100 : 0;
  const sisaPct = totalKg > 0 ? (sisaKg / totalKg) * 100 : 0;

  const terkirimPcs = summary.totalTerkirimPcs ?? Math.max(0, summary.totalQtyOrderPcs - summary.totalSisaOSPcs);
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
        <div className="bg-[#141414] text-white p-2.5 border-2 border-[#141414] shadow-[3px_3px_0px_#141414] font-mono text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
            <span className="font-bold uppercase tracking-wider">{data.name}</span>
          </div>
          <div className="text-sm font-black text-amber-400">
            {data.value.toLocaleString('id-ID')} kg{' '}
            <span className="text-white text-xs font-normal">({data.percentage.toFixed(1)}%)</span>
          </div>
          <div className="text-[11px] text-white/70 mt-0.5">
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
      className="bg-white border-2 border-[#141414] shadow-[3px_3px_0px_#141414] p-4 sm:p-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b-2 border-[#141414] gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-[#141414] text-white flex items-center justify-center border border-[#141414] shrink-0">
            <PieChartIcon className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#141414]">
              Rasio Pengiriman: Terkirim vs Sisa OS
            </h3>
            <p className="text-[10px] sm:text-[11px] font-mono text-[#141414]/70">
              Perbandingan akumulatif bobot berat (kg) & persentase dari keseluruhan PO
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto font-mono text-[10px] sm:text-[11px] bg-[#F0F0EE] border border-[#141414] px-2.5 py-1">
          <span className="text-[#141414]/70">Total Bobot:</span>
          <span className="font-black text-[#141414]">
            {totalKg.toLocaleString('id-ID')} kg
          </span>
        </div>
      </div>

      {/* Content Layout: Chart + Legend Cards */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        {/* Pie Chart Display */}
        <div className="md:col-span-5 flex flex-col items-center justify-center relative min-h-[220px]">
          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<CustomTooltip />} />
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="#141414"
                  strokeWidth={2}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Center Donut Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#141414]/60 font-bold">
              Progress
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-[#141414]">
              {terkirimPct.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Legend / Metrics Breakdown */}
        <div className="md:col-span-7 flex flex-col justify-center gap-3">
          {/* Card Total Terkirim */}
          <div className="p-3.5 bg-[#F9FBF9] border-2 border-[#2E7D32] shadow-[2px_2px_0px_#2E7D32] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 bg-[#2E7D32] text-white flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black font-mono uppercase text-[#2E7D32]">
                    Total Terkirim
                  </span>
                  <span className="px-1.5 py-0.2 bg-[#2E7D32] text-white font-mono font-bold text-[10px]">
                    {terkirimPct.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#141414]/70 mt-0.5">
                  {terkirimPcs.toLocaleString('id-ID')} pcs
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right font-mono border-t sm:border-t-0 pt-2 sm:pt-0 border-[#2E7D32]/20">
              <div className="text-base sm:text-lg font-black text-[#141414]">
                {terkirimKg.toLocaleString('id-ID')} <span className="text-xs font-normal text-[#141414]/60">kg</span>
              </div>
              <div className="text-[10px] font-bold text-[#2E7D32]">
                {terkirimPct.toFixed(1)}% dari total
              </div>
            </div>
          </div>

          {/* Card Sisa OS */}
          <div className="p-3.5 bg-[#FFF9F6] border-2 border-[#FF6B35] shadow-[2px_2px_0px_#FF6B35] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 bg-[#FF6B35] text-white flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black font-mono uppercase text-[#FF6B35]">
                    Sisa OS
                  </span>
                  <span className="px-1.5 py-0.2 bg-[#FF6B35] text-white font-mono font-bold text-[10px]">
                    {sisaPct.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#141414]/70 mt-0.5">
                  {sisaPcs.toLocaleString('id-ID')} pcs
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right font-mono border-t sm:border-t-0 pt-2 sm:pt-0 border-[#FF6B35]/20">
              <div className="text-base sm:text-lg font-black text-[#141414]">
                {sisaKg.toLocaleString('id-ID')} <span className="text-xs font-normal text-[#141414]/60">kg</span>
              </div>
              <div className="text-[10px] font-bold text-[#FF6B35]">
                {sisaPct.toFixed(1)}% dari total
              </div>
            </div>
          </div>

          {/* Progress Bar Dual Fill */}
          <div className="mt-1">
            <div className="flex justify-between text-[10px] font-mono font-bold text-[#141414]/70 mb-1">
              <span>Total Terkirim: {terkirimKg.toLocaleString('id-ID')} kg ({terkirimPct.toFixed(1)}%)</span>
              <span>Sisa OS: {sisaKg.toLocaleString('id-ID')} kg ({sisaPct.toFixed(1)}%)</span>
            </div>
            <div className="w-full h-3 bg-[#E0E0DE] border-2 border-[#141414] flex overflow-hidden">
              <div
                className="bg-[#2E7D32] h-full transition-all duration-500"
                style={{ width: `${terkirimPct}%` }}
                title={`Total Terkirim: ${terkirimKg.toLocaleString('id-ID')} kg (${terkirimPct.toFixed(1)}%)`}
              />
              <div
                className="bg-[#FF6B35] h-full transition-all duration-500"
                style={{ width: `${sisaPct}%` }}
                title={`Sisa OS: ${sisaKg.toLocaleString('id-ID')} kg (${sisaPct.toFixed(1)}%)`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
