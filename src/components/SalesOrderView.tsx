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
  ArrowUpDown,
  ArrowDownAZ,
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
  const [sortByPoAsc, setSortByPoAsc] = useState<boolean>(true);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Customer Name extracted from data
  const customerName = useMemo(() => {
    if (!data || data.length === 0) return 'PURBAYASA';
    const found = data.find((d) => d.customerName && d.customerName.trim());
    return found?.customerName ? found.customerName.toUpperCase() : 'PURBAYASA';
  }, [data]);

  // Flattened Sales Rows from parser engine (with natural alphanumeric sorting support)
  const allSalesRows = useMemo(() => {
    return flattenSalesOrderRows(data, 'ALL', sortByPoAsc);
  }, [data, sortByPoAsc]);

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
          r.deliveryDate.toLowerCase().includes(query) ||
          (r.noSJ && r.noSJ.toLowerCase().includes(query)) ||
          (r.actualDeliveryDate && r.actualDeliveryDate.toLowerCase().includes(query));
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
    let sumKgDelivery = 0;
    let sumActualQtyDelivery = 0;
    let sumActualKgDelivery = 0;
    const uniquePos = new Set<string>();
    const uniqueArtikels = new Set<string>();
    const uniqueSJs = new Set<string>();

    filteredRows.forEach((r) => {
      if (r.noPO && r.noPO !== '-') uniquePos.add(r.noPO);
      if (r.artikel && r.artikel !== '-') uniqueArtikels.add(r.artikel);
      if (r.noSJ && r.noSJ !== '-') uniqueSJs.add(r.noSJ);
      if (typeof r.qtyPcs === 'number') sumQtyPcs += r.qtyPcs;
      if (typeof r.qtyKg === 'number') sumQtyKg += r.qtyKg;
      if (typeof r.qtyDelivery === 'number') sumQtyDelivery += r.qtyDelivery;
      if (typeof r.kgDelivery === 'number') sumKgDelivery += r.kgDelivery;
      if (typeof r.actualQtyDelivery === 'number') sumActualQtyDelivery += r.actualQtyDelivery;
      if (typeof r.actualKgDelivery === 'number') sumActualKgDelivery += r.actualKgDelivery;
    });

    return {
      totalPos: uniquePos.size,
      totalArtikels: uniqueArtikels.size,
      totalSJs: uniqueSJs.size,
      totalRows: filteredRows.length,
      sumQtyPcs,
      sumQtyKg,
      sumQtyDelivery,
      sumKgDelivery,
      sumActualQtyDelivery,
      sumActualKgDelivery,
    };
  }, [filteredRows]);

  // Handle Export Excel
  const handleExport = (scope: SalesOrderExportScope = 'ALL', explicitSort?: boolean) => {
    setIsExportMenuOpen(false);
    haptic.success();
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#0284c7', '#10b981', '#1e293b'],
    });

    const shouldSort = explicitSort !== undefined ? explicitSort : sortByPoAsc;
    const outName = getSalesOrderExportFileName(fileName, scope, shouldSort);
    exportSalesOrderToExcel(data, scope, outName, shouldSort);
    if (onShareStatus) {
      onShareStatus(
        `Berhasil mengekspor format Sales (${shouldSort ? 'Urut No. PO A-Z & Angka' : 'Urutan Asli'}): ${outName}`
      );
    }
  };

  // Handle WhatsApp Share
  const handleShareWA = async (scope: SalesOrderExportScope = 'ALL', explicitSort?: boolean) => {
    setIsExportMenuOpen(false);
    haptic.medium();
    const shouldSort = explicitSort !== undefined ? explicitSort : sortByPoAsc;
    const outName = getSalesOrderExportFileName(fileName, scope, shouldSort);
    const res = await shareSalesOrderExcelFileToWhatsApp(data, scope, outName, shouldSort);
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
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                RECAP ORDER {customerName}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span className="font-medium text-slate-700">{filteredRows.length} baris data</span>
                <span>•</span>
                <span>{totals.totalPos} No. PO</span>
                <span>•</span>
                <span>{totals.totalArtikels} Artikel</span>
                <span>•</span>
                <span>{totals.totalSJs} No. SJ</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Sort Order Toggle Button */}
            <button
              type="button"
              onClick={() => {
                haptic.selection();
                setSortByPoAsc(!sortByPoAsc);
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                sortByPoAsc
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Urutkan baris berdasarkan Nomor PO secara ascending (abjad & angka)"
            >
              <ArrowDownAZ className={`w-3.5 h-3.5 ${sortByPoAsc ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span>Urut No. PO (A-Z)</span>
              <span
                className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                  sortByPoAsc ? 'bg-slate-800 text-emerald-300 font-bold' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {sortByPoAsc ? 'AKTIF' : 'OFF'}
              </span>
            </button>

            {/* Split Download Button */}
            <div className="relative inline-flex shadow-xs rounded-lg">
              <button
                type="button"
                onClick={() =>
                  handleExport(
                    coFilter === 'ALL'
                      ? 'ALL'
                      : coFilter === 'OPEN'
                      ? 'OPEN_ONLY'
                      : 'CLOSED_ONLY'
                  )
                }
                className="px-3.5 py-2 text-xs font-semibold rounded-l-lg bg-slate-900 hover:bg-slate-800 text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Export Excel Sales (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="px-2 py-2 rounded-r-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border-l border-slate-700 cursor-pointer transition-colors"
                title="Pilihan Export"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1.5 text-xs text-slate-800">
                  <div className="px-3 py-1 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                    Mode Urutan Ekspor
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSortByPoAsc(true);
                      handleExport(
                        coFilter === 'ALL'
                          ? 'ALL'
                          : coFilter === 'OPEN'
                          ? 'OPEN_ONLY'
                          : 'CLOSED_ONLY',
                        true
                      );
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                      sortByPoAsc ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <ArrowDownAZ className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Urut No. PO (A-Z & Angka)</span>
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono font-bold">
                      A-Z
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortByPoAsc(false);
                      handleExport(
                        coFilter === 'ALL'
                          ? 'ALL'
                          : coFilter === 'OPEN'
                          ? 'OPEN_ONLY'
                          : 'CLOSED_ONLY',
                        false
                      );
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                      !sortByPoAsc ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    <span>Sesuai Dokumen Asli</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                      ASLI
                    </span>
                  </button>

                  <div className="border-t border-slate-100 my-1" />
                  <div className="px-3 py-1 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                    Filter Cakupan
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport('ALL')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                  >
                    <span>Semua Baris (Open + Closed)</span>
                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono">ALL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('OPEN_ONLY')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                  >
                    <span>Khusus CO Open Saja</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono">OPEN</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('CLOSED_ONLY')}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                  >
                    <span>Khusus CO Closed Saja</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">CLOSED</span>
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    type="button"
                    onClick={() =>
                      handleShareWA(
                        coFilter === 'ALL'
                          ? 'ALL'
                          : coFilter === 'OPEN'
                          ? 'OPEN_ONLY'
                          : 'CLOSED_ONLY'
                      )
                    }
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-emerald-700 flex items-center gap-1.5 font-medium cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Kirim File via WhatsApp</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                handleShareWA(
                  coFilter === 'ALL'
                    ? 'ALL'
                    : coFilter === 'OPEN'
                    ? 'OPEN_ONLY'
                    : 'CLOSED_ONLY'
                )
              }
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Share WA</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 Key Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200 shadow-2xs">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate block">
            Total No. PO
          </span>
          <div className="mt-1">
            <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 tracking-tight leading-none flex items-baseline gap-1">
              <span>{totals.totalPos}</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-400">PO</span>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] sm:text-[11px] font-mono text-slate-500">
              {totals.totalRows} baris jadwal
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200 shadow-2xs">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate block">
            Total Artikel
          </span>
          <div className="mt-1">
            <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 tracking-tight leading-none flex items-baseline gap-1">
              <span>{totals.totalArtikels}</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-400">Item</span>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] sm:text-[11px] font-mono text-slate-500 truncate">
              Dimensi P & L
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200 shadow-2xs">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate block">
            Total QTY PO
          </span>
          <div className="mt-1">
            <div className="text-lg sm:text-xl font-bold font-mono text-emerald-700 tracking-tight leading-none flex items-baseline gap-1">
              <span>{totals.sumQtyPcs.toLocaleString('id-ID')}</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-400">PCS</span>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] sm:text-[11px] font-mono text-slate-600">
              {totals.sumQtyKg.toLocaleString('id-ID')} KG
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200 shadow-2xs">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate block">
            Rencana Kirim (Jadwal)
          </span>
          <div className="mt-1">
            <div className="text-lg sm:text-xl font-bold font-mono text-blue-700 tracking-tight leading-none flex items-baseline gap-1">
              <span>{totals.sumQtyDelivery.toLocaleString('id-ID')}</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-400">PCS</span>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] sm:text-[11px] font-mono text-slate-600">
              {totals.sumKgDelivery.toLocaleString('id-ID')} KG
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 sm:p-3.5 border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate block">
            Realisasi Kirim (SJ)
          </span>
          <div className="mt-1">
            <div className="text-lg sm:text-xl font-bold font-mono text-slate-900 tracking-tight leading-none flex items-baseline gap-1">
              <span>{totals.sumActualQtyDelivery.toLocaleString('id-ID')}</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-400">PCS</span>
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] sm:text-[11px] font-mono text-slate-600 flex justify-between">
              <span>{totals.sumActualKgDelivery.toLocaleString('id-ID')} KG</span>
              <span className="text-slate-400 font-sans">{totals.totalSJs} SJ</span>
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
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:bg-white text-slate-800 placeholder-slate-400 transition-all"
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
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main 18-Column Table matching Sales Order Schema */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-xs text-left border-collapse border border-slate-300">
            {/* 2-Tier Header strictly aligned */}
            <thead className="bg-slate-100 text-slate-800 font-bold sticky top-0 z-20 select-none shadow-xs">
              {/* Row 1 of Header */}
              <tr>
                <th
                  rowSpan={2}
                  onClick={() => {
                    haptic.selection();
                    setSortByPoAsc(!sortByPoAsc);
                  }}
                  title="Klik untuk mengubah urutan Nomor PO (A-Z Abjad & Angka)"
                  className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors min-w-[160px] select-none group"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>NO PO</span>
                    {sortByPoAsc ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                        <ArrowDownAZ className="w-3 h-3 text-emerald-700" />
                        A-Z ↑
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 text-slate-600">
                        <ArrowUpDown className="w-2.5 h-2.5 text-slate-500" />
                        Asli
                      </span>
                    )}
                  </div>
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
                  className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[120px]"
                >
                  Delivery Date
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  Qty Delivery
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  Kg Delivery
                </th>
                <th
                  rowSpan={2}
                  className="px-2 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[100px] text-slate-400"
                >
                  Remarks
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[130px]"
                >
                  Actual Delivery Date
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[120px]"
                >
                  No SJ
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  Qty Delivery
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  Kg Delivery
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
                  <td colSpan={18} className="px-4 py-12 text-center text-slate-400">
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
                              (baris ke-{r.scheduleSequence})
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
                      <td className="px-3 py-2 border border-slate-200 text-center font-mono font-medium text-slate-800">
                        {r.deliveryDate || ''}
                      </td>

                      {/* 12. Qty Delivery (Rencana Qty Kirim) */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-medium text-slate-800">
                        {typeof r.qtyDelivery === 'number'
                          ? r.qtyDelivery.toLocaleString('id-ID')
                          : r.qtyDelivery || ''}
                      </td>

                      {/* 13. Kg Delivery (Rencana Berat Kirim) */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-medium text-slate-800">
                        {typeof r.kgDelivery === 'number'
                          ? r.kgDelivery.toLocaleString('id-ID')
                          : r.kgDelivery || ''}
                      </td>

                      {/* 14. Remarks (kosong/diabaikan) */}
                      <td className="px-2 py-2 border border-slate-200 text-center text-slate-300">
                        -
                      </td>

                      {/* 15. Actual Delivery Date */}
                      <td className="px-3 py-2 border border-slate-200 text-center font-mono text-slate-800">
                        {r.actualDeliveryDate || ''}
                      </td>

                      {/* 16. No SJ (terfallback kebawahnya) */}
                      <td className="px-3 py-2 border border-slate-200 text-center font-mono">
                        {r.noSJ && r.noSJ !== '-' ? (
                          <span className="font-semibold text-slate-900">{r.noSJ}</span>
                        ) : r.noSJ === '-' ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          ''
                        )}
                      </td>

                      {/* 17. Qty Delivery (Actual / Realisasi Kirim PCS) */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-medium text-slate-900">
                        {typeof r.actualQtyDelivery === 'number'
                          ? r.actualQtyDelivery.toLocaleString('id-ID')
                          : r.actualQtyDelivery || ''}
                      </td>

                      {/* 18. Kg Delivery (Actual / Realisasi Kirim KG) */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-medium text-slate-900">
                        {typeof r.actualKgDelivery === 'number'
                          ? r.actualKgDelivery.toLocaleString('id-ID')
                          : r.actualKgDelivery || ''}
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
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-slate-900 bg-slate-200/50">
                  {totals.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-slate-900 bg-slate-200/50">
                  {totals.sumKgDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-2 py-2.5 border border-slate-300 text-center text-slate-400">
                  -
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-center text-slate-400">
                  -
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-center font-mono font-bold text-slate-700">
                  {totals.totalSJs > 0 ? `${totals.totalSJs} SJ` : '-'}
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-emerald-800 bg-emerald-50">
                  {totals.sumActualQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-emerald-800 bg-emerald-50">
                  {totals.sumActualKgDelivery.toLocaleString('id-ID')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
