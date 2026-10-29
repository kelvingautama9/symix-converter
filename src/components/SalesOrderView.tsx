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
  const [substanceK200Filter, setSubstanceK200Filter] = useState<
    'ALL' | 'K200_ALL' | 'K200_SW' | 'K200_DW' | 'NON_K200'
  >('ALL');
  const [highlightK200, setHighlightK200] = useState<boolean>(true);
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

  // Filtered rows based on Search, CO Status, Flute, and Substance K200
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

      // Substance K200 Filter
      if (substanceK200Filter === 'K200_ALL' && !r.isK200) return false;
      if (substanceK200Filter === 'K200_SW' && r.k200Type !== 'K200_SW') return false;
      if (substanceK200Filter === 'K200_DW' && r.k200Type !== 'K200_DW') return false;
      if (substanceK200Filter === 'NON_K200' && r.isK200) return false;

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
  }, [allSalesRows, coFilter, fluteFilter, substanceK200Filter, searchTerm]);

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

    // Singlewall (B, C, E) & Doublewall (BC) breakdown
    const swUniquePos = new Set<string>();
    const swUniqueArtikels = new Set<string>();
    const swUniqueSJs = new Set<string>();
    let swQtyPcs = 0;
    let swQtyKg = 0;
    let swQtyDelivery = 0;
    let swKgDelivery = 0;
    let swActualQtyDelivery = 0;
    let swActualKgDelivery = 0;

    const dwUniquePos = new Set<string>();
    const dwUniqueArtikels = new Set<string>();
    const dwUniqueSJs = new Set<string>();
    let dwQtyPcs = 0;
    let dwQtyKg = 0;
    let dwQtyDelivery = 0;
    let dwKgDelivery = 0;
    let dwActualQtyDelivery = 0;
    let dwActualKgDelivery = 0;

    // K200 specific breakdown: K200 SW (Kuning) & K200 DW (Biru)
    const k200SwUniquePos = new Set<string>();
    const k200SwUniqueArtikels = new Set<string>();
    const k200SwUniqueSJs = new Set<string>();
    let k200SwQtyPcs = 0;
    let k200SwQtyKg = 0;
    let k200SwQtyDelivery = 0;
    let k200SwKgDelivery = 0;
    let k200SwActualQtyDelivery = 0;
    let k200SwActualKgDelivery = 0;

    const k200DwUniquePos = new Set<string>();
    const k200DwUniqueArtikels = new Set<string>();
    const k200DwUniqueSJs = new Set<string>();
    let k200DwQtyPcs = 0;
    let k200DwQtyKg = 0;
    let k200DwQtyDelivery = 0;
    let k200DwKgDelivery = 0;
    let k200DwActualQtyDelivery = 0;
    let k200DwActualKgDelivery = 0;

    const nonK200UniquePos = new Set<string>();
    const nonK200UniqueArtikels = new Set<string>();
    const nonK200UniqueSJs = new Set<string>();
    let nonK200QtyPcs = 0;
    let nonK200QtyKg = 0;
    let nonK200QtyDelivery = 0;
    let nonK200KgDelivery = 0;
    let nonK200ActualQtyDelivery = 0;
    let nonK200ActualKgDelivery = 0;

    // Dedicated E Flute tracking
    const eFluteUniquePos = new Set<string>();
    const eFluteUniqueArtikels = new Set<string>();
    const eFluteUniqueSJs = new Set<string>();
    let eFluteQtyPcs = 0;
    let eFluteQtyKg = 0;
    let eFluteQtyDelivery = 0;
    let eFluteKgDelivery = 0;
    let eFluteActualQtyDelivery = 0;
    let eFluteActualKgDelivery = 0;

    filteredRows.forEach((r) => {
      const cleanFlute = String(r.flute || '').trim().toUpperCase();
      const isDW = cleanFlute === 'BC';
      const isE = cleanFlute === 'E';
      const isK = Boolean(r.isK200);

      if (r.noPO && r.noPO !== '-') {
        uniquePos.add(r.noPO);
        if (isDW) dwUniquePos.add(r.noPO);
        else swUniquePos.add(r.noPO);
        if (isE) eFluteUniquePos.add(r.noPO);

        if (isK) {
          if (isDW) k200DwUniquePos.add(r.noPO);
          else k200SwUniquePos.add(r.noPO);
        } else {
          nonK200UniquePos.add(r.noPO);
        }
      }

      if (r.artikel && r.artikel !== '-') {
        uniqueArtikels.add(r.artikel);
        if (isDW) dwUniqueArtikels.add(r.artikel);
        else swUniqueArtikels.add(r.artikel);
        if (isE) eFluteUniqueArtikels.add(r.artikel);

        if (isK) {
          if (isDW) k200DwUniqueArtikels.add(r.artikel);
          else k200SwUniqueArtikels.add(r.artikel);
        } else {
          nonK200UniqueArtikels.add(r.artikel);
        }
      }

      if (r.noSJ && r.noSJ !== '-') {
        uniqueSJs.add(r.noSJ);
        if (isDW) dwUniqueSJs.add(r.noSJ);
        else swUniqueSJs.add(r.noSJ);
        if (isE) eFluteUniqueSJs.add(r.noSJ);

        if (isK) {
          if (isDW) k200DwUniqueSJs.add(r.noSJ);
          else k200SwUniqueSJs.add(r.noSJ);
        } else {
          nonK200UniqueSJs.add(r.noSJ);
        }
      }

      if (typeof r.qtyPcs === 'number') {
        sumQtyPcs += r.qtyPcs;
        if (isDW) dwQtyPcs += r.qtyPcs;
        else swQtyPcs += r.qtyPcs;
        if (isE) eFluteQtyPcs += r.qtyPcs;

        if (isK) {
          if (isDW) k200DwQtyPcs += r.qtyPcs;
          else k200SwQtyPcs += r.qtyPcs;
        } else {
          nonK200QtyPcs += r.qtyPcs;
        }
      }

      if (typeof r.qtyKg === 'number') {
        sumQtyKg += r.qtyKg;
        if (isDW) dwQtyKg += r.qtyKg;
        else swQtyKg += r.qtyKg;
        if (isE) eFluteQtyKg += r.qtyKg;

        if (isK) {
          if (isDW) k200DwQtyKg += r.qtyKg;
          else k200SwQtyKg += r.qtyKg;
        } else {
          nonK200QtyKg += r.qtyKg;
        }
      }

      if (typeof r.qtyDelivery === 'number') {
        sumQtyDelivery += r.qtyDelivery;
        if (isDW) dwQtyDelivery += r.qtyDelivery;
        else swQtyDelivery += r.qtyDelivery;
        if (isE) eFluteQtyDelivery += r.qtyDelivery;

        if (isK) {
          if (isDW) k200DwQtyDelivery += r.qtyDelivery;
          else k200SwQtyDelivery += r.qtyDelivery;
        } else {
          nonK200QtyDelivery += r.qtyDelivery;
        }
      }

      if (typeof r.kgDelivery === 'number') {
        sumKgDelivery += r.kgDelivery;
        if (isDW) dwKgDelivery += r.kgDelivery;
        else swKgDelivery += r.kgDelivery;
        if (isE) eFluteKgDelivery += r.kgDelivery;

        if (isK) {
          if (isDW) k200DwKgDelivery += r.kgDelivery;
          else k200SwKgDelivery += r.kgDelivery;
        } else {
          nonK200KgDelivery += r.kgDelivery;
        }
      }

      if (typeof r.actualQtyDelivery === 'number') {
        sumActualQtyDelivery += r.actualQtyDelivery;
        if (isDW) dwActualQtyDelivery += r.actualQtyDelivery;
        else swActualQtyDelivery += r.actualQtyDelivery;
        if (isE) eFluteActualQtyDelivery += r.actualQtyDelivery;

        if (isK) {
          if (isDW) k200DwActualQtyDelivery += r.actualQtyDelivery;
          else k200SwActualQtyDelivery += r.actualQtyDelivery;
        } else {
          nonK200ActualQtyDelivery += r.actualQtyDelivery;
        }
      }

      if (typeof r.actualKgDelivery === 'number') {
        sumActualKgDelivery += r.actualKgDelivery;
        if (isDW) dwActualKgDelivery += r.actualKgDelivery;
        else swActualKgDelivery += r.actualKgDelivery;
        if (isE) eFluteActualKgDelivery += r.actualKgDelivery;

        if (isK) {
          if (isDW) k200DwActualKgDelivery += r.actualKgDelivery;
          else k200SwActualKgDelivery += r.actualKgDelivery;
        } else {
          nonK200ActualKgDelivery += r.actualKgDelivery;
        }
      }
    });

    const k200TotalQtyPcs = k200SwQtyPcs + k200DwQtyPcs;
    const k200TotalQtyKg = k200SwQtyKg + k200DwQtyKg;
    const k200TotalQtyDelivery = k200SwQtyDelivery + k200DwQtyDelivery;
    const k200TotalKgDelivery = k200SwKgDelivery + k200DwKgDelivery;
    const k200TotalActualQtyDelivery = k200SwActualQtyDelivery + k200DwActualQtyDelivery;
    const k200TotalActualKgDelivery = k200SwActualKgDelivery + k200DwActualKgDelivery;

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
      sw: {
        totalPos: swUniquePos.size,
        totalArtikels: swUniqueArtikels.size,
        totalSJs: swUniqueSJs.size,
        sumQtyPcs: swQtyPcs,
        sumQtyKg: swQtyKg,
        sumQtyDelivery: swQtyDelivery,
        sumKgDelivery: swKgDelivery,
        sumActualQtyDelivery: swActualQtyDelivery,
        sumActualKgDelivery: swActualKgDelivery,
      },
      dw: {
        totalPos: dwUniquePos.size,
        totalArtikels: dwUniqueArtikels.size,
        totalSJs: dwUniqueSJs.size,
        sumQtyPcs: dwQtyPcs,
        sumQtyKg: dwQtyKg,
        sumQtyDelivery: dwQtyDelivery,
        sumKgDelivery: dwKgDelivery,
        sumActualQtyDelivery: dwActualQtyDelivery,
        sumActualKgDelivery: dwActualKgDelivery,
      },
      eFlute: {
        totalPos: eFluteUniquePos.size,
        totalArtikels: eFluteUniqueArtikels.size,
        totalSJs: eFluteUniqueSJs.size,
        sumQtyPcs: eFluteQtyPcs,
        sumQtyKg: eFluteQtyKg,
        sumQtyDelivery: eFluteQtyDelivery,
        sumKgDelivery: eFluteKgDelivery,
        sumActualQtyDelivery: eFluteActualQtyDelivery,
        sumActualKgDelivery: eFluteActualKgDelivery,
        percentQtyPcs: sumQtyPcs > 0 ? (eFluteQtyPcs / sumQtyPcs) * 100 : 0,
        percentQtyKg: sumQtyKg > 0 ? (eFluteQtyKg / sumQtyKg) * 100 : 0,
      },
      k200Sw: {
        totalPos: k200SwUniquePos.size,
        totalArtikels: k200SwUniqueArtikels.size,
        totalSJs: k200SwUniqueSJs.size,
        sumQtyPcs: k200SwQtyPcs,
        sumQtyKg: k200SwQtyKg,
        sumQtyDelivery: k200SwQtyDelivery,
        sumKgDelivery: k200SwKgDelivery,
        sumActualQtyDelivery: k200SwActualQtyDelivery,
        sumActualKgDelivery: k200SwActualKgDelivery,
        percentQtyPcs: sumQtyPcs > 0 ? (k200SwQtyPcs / sumQtyPcs) * 100 : 0,
        percentQtyKg: sumQtyKg > 0 ? (k200SwQtyKg / sumQtyKg) * 100 : 0,
      },
      k200Dw: {
        totalPos: k200DwUniquePos.size,
        totalArtikels: k200DwUniqueArtikels.size,
        totalSJs: k200DwUniqueSJs.size,
        sumQtyPcs: k200DwQtyPcs,
        sumQtyKg: k200DwQtyKg,
        sumQtyDelivery: k200DwQtyDelivery,
        sumKgDelivery: k200DwKgDelivery,
        sumActualQtyDelivery: k200DwActualQtyDelivery,
        sumActualKgDelivery: k200DwActualKgDelivery,
        percentQtyPcs: sumQtyPcs > 0 ? (k200DwQtyPcs / sumQtyPcs) * 100 : 0,
        percentQtyKg: sumQtyKg > 0 ? (k200DwQtyKg / sumQtyKg) * 100 : 0,
      },
      k200Total: {
        totalPos: new Set([...k200SwUniquePos, ...k200DwUniquePos]).size,
        totalArtikels: new Set([...k200SwUniqueArtikels, ...k200DwUniqueArtikels]).size,
        totalSJs: new Set([...k200SwUniqueSJs, ...k200DwUniqueSJs]).size,
        sumQtyPcs: k200TotalQtyPcs,
        sumQtyKg: k200TotalQtyKg,
        sumQtyDelivery: k200TotalQtyDelivery,
        sumKgDelivery: k200TotalKgDelivery,
        sumActualQtyDelivery: k200TotalActualQtyDelivery,
        sumActualKgDelivery: k200TotalActualKgDelivery,
        percentQtyPcs: sumQtyPcs > 0 ? (k200TotalQtyPcs / sumQtyPcs) * 100 : 0,
        percentQtyKg: sumQtyKg > 0 ? (k200TotalQtyKg / sumQtyKg) * 100 : 0,
      },
      nonK200: {
        totalPos: nonK200UniquePos.size,
        totalArtikels: nonK200UniqueArtikels.size,
        totalSJs: nonK200UniqueSJs.size,
        sumQtyPcs: nonK200QtyPcs,
        sumQtyKg: nonK200QtyKg,
        sumQtyDelivery: nonK200QtyDelivery,
        sumKgDelivery: nonK200KgDelivery,
        sumActualQtyDelivery: nonK200ActualQtyDelivery,
        sumActualKgDelivery: nonK200ActualKgDelivery,
        percentQtyPcs: sumQtyPcs > 0 ? (nonK200QtyPcs / sumQtyPcs) * 100 : 0,
        percentQtyKg: sumQtyKg > 0 ? (nonK200QtyKg / sumQtyKg) * 100 : 0,
      },
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
  const getFluteBadge = (flute: string, isFallback: boolean = false) => {
    const clean = flute.trim().toUpperCase();
    const fallbackClass = isFallback ? 'opacity-65 font-medium scale-95' : 'font-bold';
    if (clean === 'BC') {
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-purple-100 text-purple-800 border border-purple-200 ${fallbackClass}`}
          title="Doublewall (5-Ply BC Flute)"
        >
          BC
        </span>
      );
    }
    if (clean === 'C') {
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-amber-100 text-amber-800 border border-amber-200 ${fallbackClass}`}
          title="Singlewall (3-Ply C Flute)"
        >
          C
        </span>
      );
    }
    if (clean === 'B') {
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-blue-100 text-blue-800 border border-blue-200 ${fallbackClass}`}
          title="Singlewall (3-Ply B Flute)"
        >
          B
        </span>
      );
    }
    if (clean === 'E') {
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-200 ${fallbackClass}`}
          title="Singlewall (3-Ply E Flute)"
        >
          E
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 ${fallbackClass}`}>
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
            {/* Highlight K200 Toggle Button */}
            <button
              type="button"
              onClick={() => {
                haptic.selection();
                setHighlightK200(!highlightK200);
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                highlightK200
                  ? 'bg-amber-100 text-amber-950 border-amber-300 ring-2 ring-amber-300/50'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Beri warna latar baris: Kuning untuk K200 Singlewall dan Biru untuk K200 Doublewall sesuai format Sales"
            >
              <span className="flex items-center gap-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-600"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-600 -ml-1"></span>
              </span>
              <span>Highlight K200</span>
              <span
                className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                  highlightK200 ? 'bg-amber-200 text-amber-950 font-bold' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {highlightK200 ? 'ON' : 'OFF'}
              </span>
            </button>

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
                    substanceK200Filter === 'K200_ALL'
                      ? 'K200_ONLY'
                      : substanceK200Filter === 'K200_SW'
                      ? 'K200_SW_ONLY'
                      : substanceK200Filter === 'K200_DW'
                      ? 'K200_DW_ONLY'
                      : coFilter === 'ALL'
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
                <div className="absolute right-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1.5 text-xs text-slate-800 max-h-[85vh] overflow-y-auto">
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
                  <div className="px-3 py-1 font-bold text-amber-700 uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>Cakupan Khusus K200 Sales</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport('K200_ONLY')}
                    className="w-full text-left px-3 py-2 hover:bg-amber-50/70 flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-amber-950">Khusus Semua K200 (SW + DW)</div>
                      <div className="text-[10px] text-slate-500">
                        {totals.k200Total.totalPos} PO • {totals.k200Total.sumQtyPcs.toLocaleString('id-ID')} Pcs
                      </div>
                    </div>
                    <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded font-mono">
                      K200
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('K200_SW_ONLY')}
                    className="w-full text-left px-3 py-2 hover:bg-amber-50/70 flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-amber-950 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        <span>K200 Singlewall (Kuning)</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Flute B, C, E • {totals.k200Sw.sumQtyPcs.toLocaleString('id-ID')} Pcs
                      </div>
                    </div>
                    <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded font-mono">
                      SW
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('K200_DW_ONLY')}
                    className="w-full text-left px-3 py-2 hover:bg-sky-50 flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-sky-950 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                        <span>K200 Doublewall (Biru)</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Flute BC • {totals.k200Dw.sumQtyPcs.toLocaleString('id-ID')} Pcs
                      </div>
                    </div>
                    <span className="text-[10px] bg-sky-200 text-sky-900 font-bold px-1.5 py-0.5 rounded font-mono">
                      DW
                    </span>
                  </button>

                  <div className="border-t border-slate-100 my-1" />
                  <div className="px-3 py-1 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                    Filter Status CO
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

      {/* Rekapitulasi Total PO Berdasarkan Tipe Flute (Singlewall, Doublewall & E Flute) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. Singlewall Card (Flute B, C, E) */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="text-xs font-bold text-slate-900 tracking-tight">
                1. SINGLEWALL (SW)
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                Flute B, C, E (3-Ply)
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {totals.sw.totalPos} PO • {totals.sw.totalArtikels} Item
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2.5">
            <div>
              <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                Total QTY PO
              </span>
              <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                {totals.sw.sumQtyPcs.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] font-normal text-slate-500">PCS</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                {totals.sw.sumQtyKg.toLocaleString('id-ID')} KG
              </div>
            </div>

            <div>
              <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                Rencana Kirim
              </span>
              <div className="font-mono font-bold text-blue-700 text-sm mt-0.5">
                {totals.sw.sumQtyDelivery.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] font-normal text-slate-500">PCS</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                {totals.sw.sumKgDelivery.toLocaleString('id-ID')} KG
              </div>
            </div>

            <div>
              <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                Realisasi (SJ)
              </span>
              <div className="font-mono font-bold text-emerald-700 text-sm mt-0.5">
                {totals.sw.sumActualQtyDelivery.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] font-normal text-slate-500">PCS</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                {totals.sw.sumActualKgDelivery.toLocaleString('id-ID')} KG
              </div>
            </div>
          </div>
        </div>

        {/* 2. Doublewall Card (Flute BC) */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs hover:border-purple-200 transition-colors">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              <span className="text-xs font-bold text-slate-900 tracking-tight">
                2. DOUBLEWALL (DW)
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                Flute BC (5-Ply)
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {totals.dw.totalPos} PO • {totals.dw.totalArtikels} Item
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2.5">
            <div>
              <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                Total QTY PO
              </span>
              <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                {totals.dw.sumQtyPcs.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] font-normal text-slate-500">PCS</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                {totals.dw.sumQtyKg.toLocaleString('id-ID')} KG
              </div>
            </div>

            <div>
              <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                Rencana Kirim
              </span>
              <div className="font-mono font-bold text-purple-700 text-sm mt-0.5">
                {totals.dw.sumQtyDelivery.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] font-normal text-slate-500">PCS</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                {totals.dw.sumKgDelivery.toLocaleString('id-ID')} KG
              </div>
            </div>

            <div>
              <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                Realisasi (SJ)
              </span>
              <div className="font-mono font-bold text-emerald-700 text-sm mt-0.5">
                {totals.dw.sumActualQtyDelivery.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] font-normal text-slate-500">PCS</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                {totals.dw.sumActualKgDelivery.toLocaleString('id-ID')} KG
              </div>
            </div>
          </div>
        </div>

        {/* 3. Khusus E Flute Card */}
        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs hover:border-emerald-200 transition-colors">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-bold text-slate-900 tracking-tight">
                3. KHUSUS E FLUTE
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Flute E (3-Ply)
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {totals.eFlute.totalPos} PO • {totals.eFlute.totalArtikels} Item
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2.5">
            <div>
              <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                Total QTY PO
              </span>
              <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                {totals.eFlute.sumQtyPcs.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] font-normal text-slate-500">PCS</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                {totals.eFlute.sumQtyKg.toLocaleString('id-ID')} KG
              </div>
            </div>

            <div>
              <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                Rencana Kirim
              </span>
              <div className="font-mono font-bold text-emerald-700 text-sm mt-0.5">
                {totals.eFlute.sumQtyDelivery.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] font-normal text-slate-500">PCS</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                {totals.eFlute.sumKgDelivery.toLocaleString('id-ID')} KG
              </div>
            </div>

            <div>
              <span className="text-[10px] font-medium text-slate-400 block uppercase tracking-wider">
                Realisasi (SJ)
              </span>
              <div className="font-mono font-bold text-emerald-700 text-sm mt-0.5">
                {totals.eFlute.sumActualQtyDelivery.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] font-normal text-slate-500">PCS</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                {totals.eFlute.sumActualKgDelivery.toLocaleString('id-ID')} KG
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rekapitulasi Khusus Sales: Order Substance K200 (Singlewall vs Doublewall) */}
      <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-600"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-600 -ml-1"></span>
            </span>
            <span className="text-xs font-bold text-slate-900 tracking-tight uppercase">
              TOTAL ORDER SUBSTANCE K200 (SW & DW)
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            Kuning: <strong className="text-amber-800">Singlewall (B, C, E)</strong> • Biru: <strong className="text-sky-800">Doublewall (BC)</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card 1: K200 Singlewall (SW - Kuning) */}
          <div className="bg-[#fffdf0] rounded-xl p-3 border border-amber-300 shadow-2xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-amber-200">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-600"></span>
                <span className="text-xs font-bold text-amber-950">
                  1. K200 SW (Flute B, C, E)
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-amber-200 text-amber-900 border border-amber-300">
                  KUNING
                </span>
              </div>
              <span className="text-[10px] font-mono font-medium text-amber-900">
                {totals.k200Sw.totalPos} PO • {totals.k200Sw.totalArtikels} Item
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <div>
                <span className="text-[9px] font-bold text-amber-800 block uppercase">Total Qty PO</span>
                <div className="font-mono font-bold text-slate-900 text-xs mt-0.5">
                  {totals.k200Sw.sumQtyPcs.toLocaleString('id-ID')}{' '}
                  <span className="text-[9px] font-normal text-slate-500">PCS</span>
                </div>
                <div className="text-[10px] font-mono text-slate-600">
                  {totals.k200Sw.sumQtyKg.toLocaleString('id-ID')} KG
                </div>
              </div>
              <div>
                <span className="text-[9px] font-bold text-amber-800 block uppercase">Rencana Kirim</span>
                <div className="font-mono font-bold text-blue-700 text-xs mt-0.5">
                  {totals.k200Sw.sumQtyDelivery.toLocaleString('id-ID')}{' '}
                  <span className="text-[9px] font-normal text-slate-500">PCS</span>
                </div>
                <div className="text-[10px] font-mono text-slate-600">
                  {totals.k200Sw.sumKgDelivery.toLocaleString('id-ID')} KG
                </div>
              </div>
              <div>
                <span className="text-[9px] font-bold text-amber-800 block uppercase">Realisasi (SJ)</span>
                <div className="font-mono font-bold text-emerald-700 text-xs mt-0.5">
                  {totals.k200Sw.sumActualQtyDelivery.toLocaleString('id-ID')}{' '}
                  <span className="text-[9px] font-normal text-slate-500">PCS</span>
                </div>
                <div className="text-[10px] font-mono text-slate-600">
                  {totals.k200Sw.sumActualKgDelivery.toLocaleString('id-ID')} KG
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: K200 Doublewall (DW - Biru) */}
          <div className="bg-[#f0f9ff] rounded-xl p-3 border border-sky-300 shadow-2xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-sky-200">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-600"></span>
                <span className="text-xs font-bold text-sky-950">
                  2. K200 DW (Flute BC)
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-sky-200 text-sky-900 border border-sky-300">
                  BIRU
                </span>
              </div>
              <span className="text-[10px] font-mono font-medium text-sky-900">
                {totals.k200Dw.totalPos} PO • {totals.k200Dw.totalArtikels} Item
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <div>
                <span className="text-[9px] font-bold text-sky-800 block uppercase">Total Qty PO</span>
                <div className="font-mono font-bold text-slate-900 text-xs mt-0.5">
                  {totals.k200Dw.sumQtyPcs.toLocaleString('id-ID')}{' '}
                  <span className="text-[9px] font-normal text-slate-500">PCS</span>
                </div>
                <div className="text-[10px] font-mono text-slate-600">
                  {totals.k200Dw.sumQtyKg.toLocaleString('id-ID')} KG
                </div>
              </div>
              <div>
                <span className="text-[9px] font-bold text-sky-800 block uppercase">Rencana Kirim</span>
                <div className="font-mono font-bold text-blue-700 text-xs mt-0.5">
                  {totals.k200Dw.sumQtyDelivery.toLocaleString('id-ID')}{' '}
                  <span className="text-[9px] font-normal text-slate-500">PCS</span>
                </div>
                <div className="text-[10px] font-mono text-slate-600">
                  {totals.k200Dw.sumKgDelivery.toLocaleString('id-ID')} KG
                </div>
              </div>
              <div>
                <span className="text-[9px] font-bold text-sky-800 block uppercase">Realisasi (SJ)</span>
                <div className="font-mono font-bold text-emerald-700 text-xs mt-0.5">
                  {totals.k200Dw.sumActualQtyDelivery.toLocaleString('id-ID')}{' '}
                  <span className="text-[9px] font-normal text-slate-500">PCS</span>
                </div>
                <div className="text-[10px] font-mono text-slate-600">
                  {totals.k200Dw.sumActualKgDelivery.toLocaleString('id-ID')} KG
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Total K200 (SW + DW) */}
          <div className="bg-white rounded-xl p-3 border border-slate-300 shadow-2xs">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">
                  SUBTOTAL ORDER K200 (SW & DW)
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300">
                  {totals.k200Total.percentQtyPcs.toFixed(1)}% Pcs
                </span>
              </div>
              <span className="text-[10px] font-mono font-medium text-slate-600">
                {totals.k200Total.totalPos} PO
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <div>
                <span className="text-[9px] font-bold text-slate-500 block uppercase">Total Qty PO</span>
                <div className="font-mono font-bold text-slate-900 text-xs mt-0.5">
                  {totals.k200Total.sumQtyPcs.toLocaleString('id-ID')}{' '}
                  <span className="text-[9px] font-normal text-slate-500">PCS</span>
                </div>
                <div className="text-[10px] font-mono text-slate-600">
                  {totals.k200Total.sumQtyKg.toLocaleString('id-ID')} KG
                </div>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 block uppercase">Rencana Kirim</span>
                <div className="font-mono font-bold text-blue-700 text-xs mt-0.5">
                  {totals.k200Total.sumQtyDelivery.toLocaleString('id-ID')}{' '}
                  <span className="text-[9px] font-normal text-slate-500">PCS</span>
                </div>
                <div className="text-[10px] font-mono text-slate-600">
                  {totals.k200Total.sumKgDelivery.toLocaleString('id-ID')} KG
                </div>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 block uppercase">Realisasi (SJ)</span>
                <div className="font-mono font-bold text-emerald-700 text-xs mt-0.5">
                  {totals.k200Total.sumActualQtyDelivery.toLocaleString('id-ID')}{' '}
                  <span className="text-[9px] font-normal text-slate-500">PCS</span>
                </div>
                <div className="text-[10px] font-mono text-slate-600">
                  {totals.k200Total.sumActualKgDelivery.toLocaleString('id-ID')} KG
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col gap-2.5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
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
        </div>

        {/* Filters Row: Substance & Flute */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          {/* Substance K200 Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <span className="text-[11px] font-medium text-slate-400 shrink-0 mr-1">Substance:</span>
            <button
              type="button"
              onClick={() => setSubstanceK200Filter('ALL')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                substanceK200Filter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setSubstanceK200Filter('K200_ALL')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors inline-flex items-center gap-1 ${
                substanceK200Filter === 'K200_ALL'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'bg-amber-100/70 text-amber-900 hover:bg-amber-200/70'
              }`}
            >
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 border border-amber-700"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 border border-sky-700 -ml-0.5"></span>
              </span>
              <span>Khusus K200 (SW+DW)</span>
            </button>
            <button
              type="button"
              onClick={() => setSubstanceK200Filter('K200_SW')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors inline-flex items-center gap-1 ${
                substanceK200Filter === 'K200_SW'
                  ? 'bg-amber-300 text-amber-950 ring-1 ring-amber-500'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 border border-amber-600"></span>
              <span>K200 SW (Kuning)</span>
            </button>
            <button
              type="button"
              onClick={() => setSubstanceK200Filter('K200_DW')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors inline-flex items-center gap-1 ${
                substanceK200Filter === 'K200_DW'
                  ? 'bg-sky-400 text-sky-950 ring-1 ring-sky-600'
                  : 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-sky-400 border border-sky-600"></span>
              <span>K200 DW (Biru)</span>
            </button>
            <button
              type="button"
              onClick={() => setSubstanceK200Filter('NON_K200')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                substanceK200Filter === 'NON_K200'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Non-K200
            </button>
          </div>

          {/* Flute Filter Pills */}
          {availableFlutes.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
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
                  const isK200SW = r.k200Type === 'K200_SW';
                  const isK200DW = r.k200Type === 'K200_DW';

                  // Row background styling: matches user Excel highlighting when active or subtle
                  let rowBgClass = isFallbackRow ? 'bg-slate-50/40 hover:bg-slate-100/60' : 'bg-white hover:bg-slate-50/80';
                  if (highlightK200) {
                    if (isK200SW) {
                      rowBgClass = isFallbackRow
                        ? 'bg-[#fffce0] hover:bg-[#fff9a6]'
                        : 'bg-[#fff9a6] hover:bg-[#fff380]';
                    } else if (isK200DW) {
                      rowBgClass = isFallbackRow
                        ? 'bg-[#eaf5ff] hover:bg-[#d6edff]'
                        : 'bg-[#d6edff] hover:bg-[#bde3ff]';
                    }
                  }

                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors ${rowBgClass}`}
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={r.isK200 ? 'font-bold text-slate-950' : ''}>{r.substance}</span>
                          {isK200SW && (
                            <span
                              className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-200 text-amber-950 border border-amber-400 font-mono"
                              title="K200 Singlewall (SW - Kuning)"
                            >
                              K200 SW
                            </span>
                          )}
                          {isK200DW && (
                            <span
                              className="text-[9px] font-bold px-1 py-0.2 rounded bg-sky-200 text-sky-950 border border-sky-400 font-mono"
                              title="K200 Doublewall (DW - Biru)"
                            >
                              K200 DW
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Flute */}
                      <td className="px-2 py-2 border border-slate-200 text-center">
                        {r.flute ? getFluteBadge(r.flute, !r.isFirstScheduleOfPO) : '-'}
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

            {/* Total Footer: Breakdown by Flute & K200 Sub-totals */}
            <tfoot className="sticky bottom-0 z-10 border-t-2 border-slate-300 shadow-md divide-y divide-slate-200">
              {/* Row 1: Singlewall */}
              <tr className="bg-blue-50/70 font-semibold text-slate-800 text-xs">
                <td
                  colSpan={8}
                  className="px-3 py-1.5 border border-slate-300 text-center tracking-tight"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span className="font-bold text-slate-900">
                      TOTAL FLUTE SINGLEWALL (B, C, E)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({totals.sw.totalPos} PO / {totals.sw.totalArtikels} ARTIKEL)
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-slate-900">
                  {totals.sw.sumQtyPcs.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-slate-900">
                  {totals.sw.sumQtyKg.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-blue-900 bg-blue-100/50">
                  {totals.sw.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-blue-900 bg-blue-100/50">
                  {totals.sw.sumKgDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-2 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center font-mono text-slate-600">
                  {totals.sw.totalSJs > 0 ? `${totals.sw.totalSJs} SJ` : '-'}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-800 bg-emerald-50">
                  {totals.sw.sumActualQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-800 bg-emerald-50">
                  {totals.sw.sumActualKgDelivery.toLocaleString('id-ID')}
                </td>
              </tr>

              {/* Row 2: Doublewall */}
              <tr className="bg-purple-50/70 font-semibold text-slate-800 text-xs">
                <td
                  colSpan={8}
                  className="px-3 py-1.5 border border-slate-300 text-center tracking-tight"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    <span className="font-bold text-slate-900">
                      TOTAL FLUTE DOUBLEWALL (BC)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({totals.dw.totalPos} PO / {totals.dw.totalArtikels} ARTIKEL)
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-slate-900">
                  {totals.dw.sumQtyPcs.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-slate-900">
                  {totals.dw.sumQtyKg.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-purple-900 bg-purple-100/50">
                  {totals.dw.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-purple-900 bg-purple-100/50">
                  {totals.dw.sumKgDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-2 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center font-mono text-slate-600">
                  {totals.dw.totalSJs > 0 ? `${totals.dw.totalSJs} SJ` : '-'}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-800 bg-emerald-50">
                  {totals.dw.sumActualQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-800 bg-emerald-50">
                  {totals.dw.sumActualKgDelivery.toLocaleString('id-ID')}
                </td>
              </tr>

              {/* Row: Khusus E Flute */}
              <tr className="bg-emerald-50/70 font-semibold text-slate-800 text-xs">
                <td
                  colSpan={8}
                  className="px-3 py-1.5 border border-slate-300 text-center tracking-tight"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-bold text-slate-900">
                      TOTAL KHUSUS E FLUTE (FLUTE E)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({totals.eFlute.totalPos} PO / {totals.eFlute.totalArtikels} ARTIKEL)
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-slate-900">
                  {totals.eFlute.sumQtyPcs.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-slate-900">
                  {totals.eFlute.sumQtyKg.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-900 bg-emerald-100/50">
                  {totals.eFlute.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-900 bg-emerald-100/50">
                  {totals.eFlute.sumKgDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-2 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center font-mono text-slate-600">
                  {totals.eFlute.totalSJs > 0 ? `${totals.eFlute.totalSJs} SJ` : '-'}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-800 bg-emerald-50">
                  {totals.eFlute.sumActualQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-800 bg-emerald-50">
                  {totals.eFlute.sumActualKgDelivery.toLocaleString('id-ID')}
                </td>
              </tr>

              {/* Row 3: Rekap K200 SW (Kuning) */}
              <tr className="bg-[#fff9a6]/80 font-bold text-amber-950 text-xs">
                <td
                  colSpan={8}
                  className="px-3 py-1.5 border border-slate-300 text-center tracking-tight"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-600"></span>
                    <span className="font-bold text-amber-950">
                      1. K200 SW (Flute B, C, E)
                    </span>
                    <span className="text-[10px] text-amber-900 font-mono">
                      ({totals.k200Sw.totalPos} PO / {totals.k200Sw.totalArtikels} ARTIKEL)
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-amber-950">
                  {totals.k200Sw.sumQtyPcs.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-amber-950">
                  {totals.k200Sw.sumQtyKg.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-amber-950">
                  {totals.k200Sw.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-amber-950">
                  {totals.k200Sw.sumKgDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-2 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center font-mono text-amber-900">
                  {totals.k200Sw.totalSJs > 0 ? `${totals.k200Sw.totalSJs} SJ` : '-'}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-900 bg-emerald-100/50">
                  {totals.k200Sw.sumActualQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-900 bg-emerald-100/50">
                  {totals.k200Sw.sumActualKgDelivery.toLocaleString('id-ID')}
                </td>
              </tr>

              {/* Row 4: Rekap K200 DW (Biru) */}
              <tr className="bg-[#d2eeff]/80 font-bold text-sky-950 text-xs">
                <td
                  colSpan={8}
                  className="px-3 py-1.5 border border-slate-300 text-center tracking-tight"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-600"></span>
                    <span className="font-bold text-sky-950">
                      2. K200 DW (Flute BC)
                    </span>
                    <span className="text-[10px] text-sky-900 font-mono">
                      ({totals.k200Dw.totalPos} PO / {totals.k200Dw.totalArtikels} ARTIKEL)
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-sky-950">
                  {totals.k200Dw.sumQtyPcs.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-sky-950">
                  {totals.k200Dw.sumQtyKg.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-sky-950">
                  {totals.k200Dw.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-sky-950">
                  {totals.k200Dw.sumKgDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-2 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center font-mono text-sky-900">
                  {totals.k200Dw.totalSJs > 0 ? `${totals.k200Dw.totalSJs} SJ` : '-'}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-900 bg-emerald-100/50">
                  {totals.k200Dw.sumActualQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-900 bg-emerald-100/50">
                  {totals.k200Dw.sumActualKgDelivery.toLocaleString('id-ID')}
                </td>
              </tr>

              {/* Row 5: Subtotal K200 (SW + DW) */}
              <tr className="bg-amber-100/60 font-bold text-amber-950 text-xs">
                <td
                  colSpan={8}
                  className="px-3 py-1.5 border border-slate-300 text-center tracking-tight"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-extrabold text-amber-950">
                      SUBTOTAL ORDER K200 (SW & DW)
                    </span>
                    <span className="text-[10px] text-amber-900 font-mono">
                      ({totals.k200Total.percentQtyPcs.toFixed(1)}% Pcs • {totals.k200Total.percentQtyKg.toFixed(1)}% Kg dari Total Order)
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-extrabold text-amber-950">
                  {totals.k200Total.sumQtyPcs.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-extrabold text-amber-950">
                  {totals.k200Total.sumQtyKg.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-amber-950">
                  {totals.k200Total.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-amber-950">
                  {totals.k200Total.sumKgDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-2 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center font-mono text-amber-950 font-bold">
                  {totals.k200Total.totalSJs > 0 ? `${totals.k200Total.totalSJs} SJ` : '-'}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-950 bg-emerald-100/70">
                  {totals.k200Total.sumActualQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-950 bg-emerald-100/70">
                  {totals.k200Total.sumActualKgDelivery.toLocaleString('id-ID')}
                </td>
              </tr>

              {/* Row 6: Non-K200 */}
              <tr className="bg-slate-50 font-medium text-slate-700 text-xs">
                <td
                  colSpan={8}
                  className="px-3 py-1.5 border border-slate-300 text-center tracking-tight"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="font-semibold text-slate-700">
                      3. SUBSTANCE NON-K200 (Substance Lainnya)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({totals.nonK200.totalPos} PO / {totals.nonK200.totalArtikels} ARTIKEL)
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-medium text-slate-800">
                  {totals.nonK200.sumQtyPcs.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-medium text-slate-800">
                  {totals.nonK200.sumQtyKg.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-medium text-slate-800">
                  {totals.nonK200.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-medium text-slate-800">
                  {totals.nonK200.sumKgDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-2 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center text-slate-400">-</td>
                <td className="px-3 py-1.5 border border-slate-300 text-center font-mono text-slate-600">
                  {totals.nonK200.totalSJs > 0 ? `${totals.nonK200.totalSJs} SJ` : '-'}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-medium text-emerald-800 bg-emerald-50">
                  {totals.nonK200.sumActualQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-1.5 border border-slate-300 text-right font-mono font-medium text-emerald-800 bg-emerald-50">
                  {totals.nonK200.sumActualKgDelivery.toLocaleString('id-ID')}
                </td>
              </tr>

              {/* Row 7: Grand Total */}
              <tr className="bg-slate-100 font-bold text-slate-900 text-xs">
                <td
                  colSpan={8}
                  className="px-3 py-2 border border-slate-300 text-center font-bold tracking-wider uppercase text-slate-800"
                >
                  GRAND TOTAL REKAPITULASI SALES ({totals.totalPos} NO PO / {totals.totalArtikels} ARTIKEL)
                </td>
                <td className="px-3 py-2 border border-slate-300 text-right font-mono font-black text-slate-900">
                  {totals.sumQtyPcs.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2 border border-slate-300 text-right font-mono font-black text-slate-900">
                  {totals.sumQtyKg.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2 border border-slate-300 text-center text-slate-400">
                  -
                </td>
                <td className="px-3 py-2 border border-slate-300 text-right font-mono font-black text-slate-900 bg-slate-200/50">
                  {totals.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2 border border-slate-300 text-right font-mono font-black text-slate-900 bg-slate-200/50">
                  {totals.sumKgDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-2 py-2 border border-slate-300 text-center text-slate-400">
                  -
                </td>
                <td className="px-3 py-2 border border-slate-300 text-center text-slate-400">
                  -
                </td>
                <td className="px-3 py-2 border border-slate-300 text-center font-mono font-bold text-slate-700">
                  {totals.totalSJs > 0 ? `${totals.totalSJs} SJ` : '-'}
                </td>
                <td className="px-3 py-2 border border-slate-300 text-right font-mono font-black text-emerald-800 bg-emerald-100/60">
                  {totals.sumActualQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2 border border-slate-300 text-right font-mono font-black text-emerald-800 bg-emerald-100/60">
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
