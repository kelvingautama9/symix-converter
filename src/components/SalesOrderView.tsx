import React, { useState, useMemo } from 'react';
import {
  ExtractedRecord,
  SalesOrderRow,
  SalesOrderExportScope,
  CoStatus,
} from '../types';
import { flattenSalesOrderRows } from '../utils/parserEngine';
import {
  exportSalesOrderToExcel,
  shareSalesOrderExcelFileToWhatsApp,
  getSalesOrderExportFileName,
} from '../utils/excelExporter';
import { haptic } from '../utils/haptics';
import confetti from 'canvas-confetti';
import {
  Download,
  Share2,
  Search,
  Filter,
  Layers,
  Calendar,
  Package,
  Weight,
  Truck,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Building2,
  ChevronDown,
} from 'lucide-react';

interface SalesOrderViewProps {
  data: ExtractedRecord[];
  fileName?: string | null;
  onShareStatus?: (msg: string) => void;
}

export const SalesOrderView: React.FC<SalesOrderViewProps> = ({
  data,
  fileName,
  onShareStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [coFilter, setCoFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [fluteFilter, setFluteFilter] = useState<string>('ALL');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Customer Name extracted from data
  const customerName = useMemo(() => {
    if (!data || data.length === 0) return 'PURBAYASA';
    const found = data.find((d) => d.customerName && d.customerName.trim());
    return found?.customerName ? found.customerName.toUpperCase() : 'PURBAYASA';
  }, [data]);

  // Flattened Sales Rows from parser engine
  const allSalesRows = useMemo(() => {
    return flattenSalesOrderRows(data, 'ALL');
  }, [data]);

  // Available Flute types present in this dataset
  const availableFlutes = useMemo(() => {
    const set = new Set<string>();
    allSalesRows.forEach((r) => {
      if (r.flute && r.flute !== '-') {
        set.add(r.flute.toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [allSalesRows]);

  // Filtered rows based on Search, CO Status, and Flute
  const filteredRows = useMemo(() => {
    return allSalesRows.filter((r) => {
      // CO filter
      if (coFilter === 'OPEN' && r.coStatus !== 'OPEN') return false;
      if (coFilter === 'CLOSED' && r.coStatus !== 'CLOSED') return false;

      // Flute filter
      if (fluteFilter !== 'ALL') {
        const rowFlute = (r.flute || '').toUpperCase();
        if (rowFlute !== fluteFilter.toUpperCase()) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const match =
          r.noPO.toLowerCase().includes(query) ||
          r.artikel.toLowerCase().includes(query) ||
          r.itemName.toLowerCase().includes(query) ||
          r.substance.toLowerCase().includes(query) ||
          r.flute.toLowerCase().includes(query) ||
          r.coNumber.toLowerCase().includes(query) ||
          r.deliveryDate.toLowerCase().includes(query);
        if (!match) return false;
      }

      return true;
    });
  }, [allSalesRows, coFilter, fluteFilter, searchTerm]);

  // Totals computed from the filtered set
  const totals = useMemo(() => {
    let sumQtyPcs = 0;
    let sumQtyKg = 0;
    let sumQtyDelivery = 0;
    const uniquePos = new Set<string>();
    const uniqueArtikels = new Set<string>();

    filteredRows.forEach((r) => {
      if (r.noPO && r.noPO !== '-') uniquePos.add(r.noPO);
      if (r.artikel && r.artikel !== '-') uniqueArtikels.add(r.artikel);
      if (typeof r.qtyPcs === 'number') sumQtyPcs += r.qtyPcs;
      if (typeof r.qtyKg === 'number') sumQtyKg += r.qtyKg;
      if (typeof r.qtyDelivery === 'number') sumQtyDelivery += r.qtyDelivery;
    });

    return {
      totalPos: uniquePos.size,
      totalArtikels: uniqueArtikels.size,
      totalRows: filteredRows.length,
      sumQtyPcs,
      sumQtyKg,
      sumQtyDelivery,
    };
  }, [filteredRows]);

  // Handle Export Excel
  const handleExport = (scope: SalesOrderExportScope = 'ALL') => {
    setIsExportMenuOpen(false);
    haptic.success();
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#0284c7', '#10b981', '#1e293b'],
    });

    const outName = getSalesOrderExportFileName(fileName, scope);
    exportSalesOrderToExcel(data, scope, outName);
    if (onShareStatus) {
      onShareStatus(`Berhasil mengekspor format Sales: ${outName}`);
    }
  };

  // Handle WhatsApp Share
  const handleShareWA = async (scope: SalesOrderExportScope = 'ALL') => {
    setIsExportMenuOpen(false);
    haptic.medium();
    const outName = getSalesOrderExportFileName(fileName, scope);
    const res = await shareSalesOrderExcelFileToWhatsApp(data, scope, outName);
    if (onShareStatus) {
      onShareStatus(res.message);
    }
  };

  // Badge helper for Flute
  const getFluteBadge = (flute: string) => {
    const clean = flute.trim().toUpperCase();
    if (clean === 'BC') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
          BC
        </span>
      );
    }
    if (clean === 'C') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
          C
        </span>
      );
    }
    if (clean === 'B') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
          B
        </span>
      );
    }
    if (clean === 'E') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          E
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
        {clean || '-'}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-4 sm:p-6 shadow-md border border-slate-700">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 text-slate-200 text-xs font-medium mb-2 backdrop-blur-xs">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>FORMAT STANDAR SALES ORDER</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              RECAP ORDER {customerName}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Format 13-kolom khusus sales: Pemisahan otomatis Substance & Flute (C, B, E, BC), dimensi P & L, Qty/Berat PO, serta rencana jadwal pengiriman ter-fallback.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Download Button */}
            <div className="relative inline-flex shadow-sm rounded-lg">
              <button
                type="button"
                onClick={() => handleExport(coFilter === 'ALL' ? 'ALL' : coFilter === 'OPEN' ? 'OPEN_ONLY' : 'CLOSED_ONLY')}
                className="px-3.5 py-2 text-xs font-semibold rounded-l-lg bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export Excel Sales (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="px-2 py-2 rounded-r-lg bg-emerald-700 hover:bg-emerald-600 text-white border-l border-emerald-800 cursor-pointer transition-colors"
                title="Pilihan Export"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1.5 text-xs text-slate-800">
                  <div className="px-3 py-1 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                    Opsi Download
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport('ALL')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <span>Semua Baris (Open + Closed)</span>
                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">ALL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('OPEN_ONLY')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <span>Khusus CO Open Saja</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono">OPEN</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('CLOSED_ONLY')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <span>Khusus CO Closed Saja</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">CLOSED</span>
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    type="button"
                    onClick={() => handleShareWA(coFilter === 'ALL' ? 'ALL' : coFilter === 'OPEN' ? 'OPEN_ONLY' : 'CLOSED_ONLY')}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-emerald-700 flex items-center gap-1.5 font-medium"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Kirim File via WhatsApp</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleShareWA(coFilter === 'ALL' ? 'ALL' : coFilter === 'OPEN' ? 'OPEN_ONLY' : 'CLOSED_ONLY')}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Share WA</span>
            </button>
          </div>
        </div>

        {/* 5 Key Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-5 pt-4 border-t border-white/10">
          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
              <span>Total No. PO Unik</span>
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {totals.totalPos} <span className="text-xs font-normal text-slate-400">PO</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
              {totals.totalRows} baris jadwal
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Total Artikel</span>
            </div>
            <div className="text-xl font-bold text-white mt-1">
              {totals.totalArtikels} <span className="text-xs font-normal text-slate-400">Item</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Dimensi P & L terpisah
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
              <Package className="w-3.5 h-3.5 text-emerald-400" />
              <span>Total QTY PO</span>
            </div>
            <div className="text-xl font-bold text-emerald-300 mt-1 font-mono">
              {totals.sumQtyPcs.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">PCS</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Kolom I (Qty PO)
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10">
            <div className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
              <Weight className="w-3.5 h-3.5 text-amber-400" />
              <span>Total Berat PO</span>
            </div>
            <div className="text-xl font-bold text-amber-300 mt-1 font-mono">
              {totals.sumQtyKg.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">KG</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Kolom J (Berat PO)
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              <span>Total Rencana Kirim</span>
            </div>
            <div className="text-xl font-bold text-purple-300 mt-1 font-mono">
              {totals.sumQtyDelivery.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-400">PCS</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Kolom L (Qty Delivery)
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari No PO, Artikel, Item Name, Substance, Flute, Tanggal..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 placeholder-slate-400 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
            >
              ×
            </button>
          )}
        </div>

        {/* CO Filter Tabs */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setCoFilter('ALL')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              coFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua CO
          </button>
          <button
            type="button"
            onClick={() => setCoFilter('OPEN')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              coFilter === 'OPEN'
                ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            CO Open (O)
          </button>
          <button
            type="button"
            onClick={() => setCoFilter('CLOSED')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              coFilter === 'CLOSED'
                ? 'bg-slate-700 text-white shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            CO Closed (C)
          </button>
        </div>

        {/* Flute Filter Pills */}
        {availableFlutes.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 text-xs">
            <span className="text-[11px] font-medium text-slate-400 shrink-0 mr-1">Flute:</span>
            <button
              type="button"
              onClick={() => setFluteFilter('ALL')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                fluteFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua
            </button>
            {availableFlutes.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFluteFilter(f)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${
                  fluteFilter === f
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main 13-Column Table matching Image 2 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-xs text-left border-collapse border border-slate-300">
            {/* 2-Tier Header strictly aligned with Image 2 */}
            <thead className="bg-slate-100 text-slate-800 font-bold sticky top-0 z-20 select-none shadow-xs">
              {/* Row 1 of Header */}
              <tr>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[150px]"
                >
                  NO PO
                </th>
                <th
                  rowSpan={2}
                  className="px-2 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[120px] text-slate-400"
                >
                  Date Receive PO
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[140px]"
                >
                  Substance
                </th>
                <th
                  rowSpan={2}
                  className="px-2 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[80px]"
                >
                  Flute
                </th>
                <th
                  colSpan={2}
                  className="px-2 py-1.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100"
                >
                  Size
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[150px]"
                >
                  Artikel
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-left font-bold tracking-tight bg-slate-100 min-w-[200px]"
                >
                  Item Name
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  Qty (Pcs)
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[90px]"
                >
                  Qty (Kg)
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-indigo-50 text-indigo-900 min-w-[120px]"
                >
                  Delivery Date
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-indigo-50 text-indigo-900 min-w-[100px]"
                >
                  Qty Delivery
                </th>
                <th
                  rowSpan={2}
                  className="px-2 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[100px] text-slate-400"
                >
                  Remarks
                </th>
              </tr>

              {/* Row 2 of Header (Sub-columns P and L for Size) */}
              <tr>
                <th className="px-2 py-1 border border-slate-300 text-center font-bold bg-slate-100 min-w-[60px]">
                  P
                </th>
                <th className="px-2 py-1 border border-slate-300 text-center font-bold bg-slate-100 min-w-[60px]">
                  L
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-slate-400">
                    Tidak ada data yang sesuai dengan pencarian atau filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const isFallbackRow = !r.isFirstScheduleOfPO;
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isFallbackRow
                          ? 'bg-slate-50/40'
                          : 'bg-white'
                      }`}
                    >
                      {/* 1. NO PO */}
                      <td className="px-3 py-2 border border-slate-200 font-medium text-slate-900">
                        {r.noPO ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{r.noPO}</span>
                            {r.totalSchedulesCount > 1 && (
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1 py-0.2 rounded font-mono">
                                1/{r.totalSchedulesCount}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-400 pl-3">
                            <span className="text-slate-300 font-mono text-[10px]">└</span>
                            <span className="text-[10px] italic font-mono text-slate-400">
                              (jadwal ke-{r.scheduleSequence})
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 2. Date Receive PO (kosong/diabaikan) */}
                      <td className="px-2 py-2 border border-slate-200 text-center text-slate-300">
                        -
                      </td>

                      {/* 3. Substance */}
                      <td className="px-3 py-2 border border-slate-200 font-mono text-slate-800">
                        {r.substance}
                      </td>

                      {/* 4. Flute */}
                      <td className="px-2 py-2 border border-slate-200 text-center">
                        {r.flute ? getFluteBadge(r.flute) : '-'}
                      </td>

                      {/* 5. Size P */}
                      <td className="px-2 py-2 border border-slate-200 text-center font-mono text-slate-700">
                        {r.sizeP !== '' ? r.sizeP : ''}
                      </td>

                      {/* 6. Size L */}
                      <td className="px-2 py-2 border border-slate-200 text-center font-mono text-slate-700">
                        {r.sizeL !== '' ? r.sizeL : ''}
                      </td>

                      {/* 7. Artikel */}
                      <td className="px-3 py-2 border border-slate-200 font-mono font-medium text-slate-900">
                        {r.artikel}
                      </td>

                      {/* 8. Item Name */}
                      <td className="px-3 py-2 border border-slate-200 text-slate-700">
                        {r.itemName}
                      </td>

                      {/* 9. Qty (Pcs) - Kolom I */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-semibold text-slate-900">
                        {typeof r.qtyPcs === 'number' ? r.qtyPcs.toLocaleString('id-ID') : ''}
                      </td>

                      {/* 10. Qty (Kg) - Kolom J */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono text-slate-700">
                        {typeof r.qtyKg === 'number' ? r.qtyKg.toLocaleString('id-ID') : ''}
                      </td>

                      {/* 11. Delivery Date (Rencana Jadwal Kirim) */}
                      <td className="px-3 py-2 border border-slate-200 text-center font-mono font-bold text-indigo-700 bg-indigo-50/30">
                        {r.deliveryDate}
                      </td>

                      {/* 12. Qty Delivery (Rencana Qty Kirim) */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-bold text-indigo-900 bg-indigo-50/30">
                        {typeof r.qtyDelivery === 'number'
                          ? r.qtyDelivery.toLocaleString('id-ID')
                          : r.qtyDelivery}
                      </td>

                      {/* 13. Remarks (kosong/diabaikan) */}
                      <td className="px-2 py-2 border border-slate-200 text-center text-slate-300">
                        -
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Footer Row */}
            <tfoot className="bg-slate-100 font-bold text-slate-900 sticky bottom-0 z-10 border-t-2 border-slate-300 shadow-md">
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-wider uppercase text-slate-800"
                >
                  TOTAL REKAPITULASI SALES ({totals.totalPos} NO PO / {totals.totalArtikels} ARTIKEL)
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-slate-900">
                  {totals.sumQtyPcs.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-slate-900">
                  {totals.sumQtyKg.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-center text-slate-400">
                  -
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-indigo-900 bg-indigo-100/50">
                  {totals.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-2 py-2.5 border border-slate-300 text-center text-slate-400">
                  -
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
