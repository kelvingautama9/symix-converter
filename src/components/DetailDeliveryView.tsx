import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ExtractedRecord,
  ParseSummary,
  CoFilterStatus,
  DetailSJExportScope,
} from '../types';
import {
  recalculateFIFOStock,
  flattenDeliveriesForDataEntry,
} from '../utils/parserEngine';
import {
  Search,
  Download,
  Share2,
  Copy,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Truck,
  PackageCheck,
  Clock,
  Layers,
  Table as TableIcon,
  LayoutList,
  Columns3,
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  RotateCcw,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { haptic } from '../utils/haptics';
import confetti from 'canvas-confetti';

interface DetailDeliveryViewProps {
  data: ExtractedRecord[];
  summary: ParseSummary;
  currentFileName: string | null;
  onDownloadDetailExcel: (scope?: DetailSJExportScope) => void;
  onShareDetailExcelWhatsApp: (scope?: DetailSJExportScope) => void;
  onCopyDetailWhatsAppText: (scope?: DetailSJExportScope) => void;
  isCopied: boolean;
  sheets?: string[];
  activeSheet?: string;
  onSelectSheet?: (sheet: string) => void;
  onReset: () => void;
}

type DeliveryFilterMode =
  | 'ALL'
  | 'WITH_SJ'
  | 'MULTI_SJ'
  | 'FALLBACK_NO_SJ'
  | 'MULTI_ITEM_PO'
  | 'HAS_SISA_OS'
  | 'LUNAS_OS';

type DisplayLayoutMode =
  | 'DATA_ENTRY_TABLE'
  | 'UNIQUE_PO_SUMMARY'
  | 'PO_GROUP_CARDS'
  | 'HORIZONTAL_MATRIX';

export const DetailDeliveryView: React.FC<DetailDeliveryViewProps> = ({
  data,
  summary,
  onDownloadDetailExcel,
  onShareDetailExcelWhatsApp,
  onCopyDetailWhatsAppText,
  isCopied,
  sheets,
  activeSheet,
  onSelectSheet,
  onReset,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [coFilter, setCoFilter] = useState<CoFilterStatus>('ALL');
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilterMode>('ALL');
  const [layoutMode, setLayoutMode] = useState<DisplayLayoutMode>('DATA_ENTRY_TABLE');
  const [showSubTotalPerPO, setShowSubTotalPerPO] = useState<boolean>(true);
  const [repeatPOTotalsOnEveryRow, setRepeatPOTotalsOnEveryRow] = useState<boolean>(false);
  const [scrollMode, setScrollMode] = useState<'page' | 'box'>('page');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);

  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const copyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(event.target as Node)
      ) {
        setIsExportMenuOpen(false);
      }
      if (
        copyDropdownRef.current &&
        !copyDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCopyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // Scoped PO data with FIFO stock recalculated
  const scopedPOData = useMemo(() => {
    return recalculateFIFOStock(data, coFilter);
  }, [data, coFilter]);

  // Map of No PO -> count of Artikel/lines sharing that same No PO within the active CO scope
  const poLineCountMap = useMemo(() => {
    const map = new Map<string, number>();
    scopedPOData.forEach((po) => {
      if (coFilter === 'OPEN' && po.coStatus !== 'OPEN') return;
      if (coFilter === 'CLOSED' && po.coStatus !== 'CLOSED') return;
      const cleanNoPO = String(po['No PO'] || '').trim();
      if (cleanNoPO && cleanNoPO !== '-') {
        map.set(cleanNoPO, (map.get(cleanNoPO) || 0) + 1);
      }
    });
    return map;
  }, [scopedPOData, coFilter]);

  // Counts for filter badges
  const filterMetrics = useMemo(() => {
    let openPOs = 0;
    let closedPOs = 0;
    let withSJ = 0;
    let multiSJ = 0;
    let fallbackNoSJ = 0;
    let multiItemPOLines = 0;
    let hasSisaOS = 0;
    let lunasOS = 0;
    let totalSJTransactions = 0;

    const allUniquePOSet = new Set<string>();
    data.forEach((po) => {
      if (po.coStatus === 'OPEN') openPOs++;
      else if (po.coStatus === 'CLOSED') closedPOs++;
      const cleanNo = String(po['No PO'] || '').trim();
      if (cleanNo && cleanNo !== '-') allUniquePOSet.add(cleanNo);
    });

    const scopeTarget = scopedPOData.filter((po) => {
      if (coFilter === 'OPEN' && po.coStatus !== 'OPEN') return false;
      if (coFilter === 'CLOSED' && po.coStatus !== 'CLOSED') return false;
      return true;
    });

    let multiItemUniquePOsCount = 0;
    for (const [, cnt] of poLineCountMap) {
      if (cnt > 1) multiItemUniquePOsCount++;
    }

    scopeTarget.forEach((po) => {
      const realSJs = (po.deliveries || []).filter(
        (d) => !d.isFallbackNoDelivery && d.noSJ !== '-'
      );
      totalSJTransactions += realSJs.length;
      if (realSJs.length > 0) withSJ++;
      if (realSJs.length > 1) multiSJ++;
      if (realSJs.length === 0) fallbackNoSJ++;
      const cleanNo = String(po['No PO'] || '').trim();
      if ((poLineCountMap.get(cleanNo) || 0) > 1) multiItemPOLines++;
      if ((po['Sisa OS (pcs)'] || 0) > 0) hasSisaOS++;
      else lunasOS++;
    });

    return {
      allPOs: data.length,
      allUniquePOs: allUniquePOSet.size > 0 ? allUniquePOSet.size : data.length,
      openPOs,
      closedPOs,
      scopedPOsCount: scopeTarget.length,
      scopedUniquePOsCount: poLineCountMap.size > 0 ? poLineCountMap.size : scopeTarget.length,
      multiItemUniquePOsCount,
      multiItemPOLines,
      withSJ,
      multiSJ,
      fallbackNoSJ,
      hasSisaOS,
      lunasOS,
      totalSJTransactions,
    };
  }, [data, scopedPOData, coFilter, poLineCountMap]);

  // Filter POs based on CO status, delivery filter, and search term (including SJ No & SJ Date!)
  const filteredPOs = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();

    return scopedPOData.filter((po) => {
      if (coFilter === 'OPEN' && po.coStatus !== 'OPEN') return false;
      if (coFilter === 'CLOSED' && po.coStatus !== 'CLOSED') return false;

      const realSJs = (po.deliveries || []).filter(
        (d) => !d.isFallbackNoDelivery && d.noSJ !== '-'
      );

      if (deliveryFilter === 'WITH_SJ' && realSJs.length === 0) return false;
      if (deliveryFilter === 'MULTI_SJ' && realSJs.length <= 1) return false;
      if (deliveryFilter === 'FALLBACK_NO_SJ' && realSJs.length > 0) return false;
      if (deliveryFilter === 'MULTI_ITEM_PO') {
        const cleanNo = String(po['No PO'] || '').trim();
        if ((poLineCountMap.get(cleanNo) || 0) <= 1) return false;
      }
      if (deliveryFilter === 'HAS_SISA_OS' && (po['Sisa OS (pcs)'] || 0) <= 0) return false;
      if (deliveryFilter === 'LUNAS_OS' && (po['Sisa OS (pcs)'] || 0) > 0) return false;

      if (q) {
        const matchPO =
          (po.CO && po.CO.toLowerCase().includes(q)) ||
          (po.Artikel && po.Artikel.toLowerCase().includes(q)) ||
          (po['Item Description'] && po['Item Description'].toLowerCase().includes(q)) ||
          (po['Tanggal Input PO'] && po['Tanggal Input PO'].toLowerCase().includes(q)) ||
          (po['No PO'] && po['No PO'].toLowerCase().includes(q)) ||
          (po.Substance && po.Substance.toLowerCase().includes(q));

        const matchSJ = (po.deliveries || []).some(
          (sj) =>
            (sj.noSJ && sj.noSJ.toLowerCase().includes(q)) ||
            (sj.tanggalKirim && sj.tanggalKirim.toLowerCase().includes(q)) ||
            String(sj.qtyKirimPcs).includes(q)
        );

        if (!matchPO && !matchSJ) return false;
      }

      return true;
    });
  }, [scopedPOData, coFilter, deliveryFilter, searchTerm, poLineCountMap]);

  // Flatten filtered POs into Data Entry rows
  const flattenedRows = useMemo(() => {
    return flattenDeliveriesForDataEntry(filteredPOs, 'ALL');
  }, [filteredPOs]);

  // Consolidated Unique No PO list (for "By No. PO Unik" view — 1 entry per unique No PO)
  const consolidatedUniquePOs = useMemo(() => {
    const map = new Map<
      string,
      {
        noPO: string;
        tanggalInputPO: string;
        items: ExtractedRecord[];
        coList: string[];
        artikelList: string[];
        totalQtyPoPcs: number;
        totalBeratPoKg: number;
        totalTerkirimPcs: number;
        totalTerkirimKg: number;
        totalSisaOSPcs: number;
        totalSisaOSKg: number;
        totalStockPcs: number;
        totalStockKg: number;
        totalSJCount: number;
        sjSummaries: { noSJ: string; tanggalKirim: string; qtyPcs: number; beratKg: number; artikel: string }[];
      }
    >();

    filteredPOs.forEach((po) => {
      const key = String(po['No PO'] || '-').trim();
      if (!map.has(key)) {
        map.set(key, {
          noPO: key,
          tanggalInputPO: po['Tanggal Input PO'] || '-',
          items: [],
          coList: [],
          artikelList: [],
          totalQtyPoPcs: 0,
          totalBeratPoKg: 0,
          totalTerkirimPcs: 0,
          totalTerkirimKg: 0,
          totalSisaOSPcs: 0,
          totalSisaOSKg: 0,
          totalStockPcs: 0,
          totalStockKg: 0,
          totalSJCount: 0,
          sjSummaries: [],
        });
      }
      const entry = map.get(key)!;
      entry.items.push(po);
      if (po.CO && !entry.coList.includes(po.CO)) entry.coList.push(po.CO);
      if (po.Artikel && !entry.artikelList.includes(po.Artikel)) entry.artikelList.push(po.Artikel);
      entry.totalQtyPoPcs += Number(po['QTY PO (pcs)']) || 0;
      entry.totalBeratPoKg += Number(po['Berat PO (KG)']) || 0;
      entry.totalTerkirimPcs += Number(po['Terkirim (PCS)']) || 0;
      entry.totalTerkirimKg += Number(po['Terkirim (KG)']) || 0;
      entry.totalSisaOSPcs += Number(po['Sisa OS (pcs)']) || 0;
      entry.totalSisaOSKg += Number(po['Sisa OS (kg)']) || 0;
      entry.totalStockPcs += Number(po['Stock (pcs)']) || 0;
      entry.totalStockKg += Number(po['Stock (kg)']) || 0;

      const realSJs = (po.deliveries || []).filter((d) => !d.isFallbackNoDelivery && d.noSJ !== '-');
      entry.totalSJCount += realSJs.length;
      realSJs.forEach((sj) => {
        entry.sjSummaries.push({
          noSJ: sj.noSJ,
          tanggalKirim: sj.tanggalKirim,
          qtyPcs: sj.qtyKirimPcs,
          beratKg: sj.beratKirimKg,
          artikel: po.Artikel,
        });
      });
    });

    return Array.from(map.values());
  }, [filteredPOs]);

  // Dynamic Totals for current filtered view
  const filteredTotals = useMemo(() => {
    let totalOrderPcs = 0;
    let totalOrderKg = 0;
    let totalTerkirimPcs = 0;
    let totalTerkirimKg = 0;
    let totalSisaOSPcs = 0;
    let totalSisaOSKg = 0;
    let totalStockPcs = 0;
    let totalStockKg = 0;
    let totalActiveSJs = 0;
    const uniqueNoPOSet = new Set<string>();

    filteredPOs.forEach((po) => {
      const cleanNoPO = String(po['No PO'] || '').trim();
      if (cleanNoPO && cleanNoPO !== '-') uniqueNoPOSet.add(cleanNoPO);
      totalOrderPcs += Number(po['QTY PO (pcs)']) || 0;
      totalOrderKg += Number(po['Berat PO (KG)']) || 0;
      totalTerkirimPcs += Number(po['Terkirim (PCS)']) || 0;
      totalTerkirimKg += Number(po['Terkirim (KG)']) || 0;
      totalSisaOSPcs += Number(po['Sisa OS (pcs)']) || 0;
      totalSisaOSKg += Number(po['Sisa OS (kg)']) || 0;
      totalStockPcs += Number(po['Stock (pcs)']) || 0;
      totalStockKg += Number(po['Stock (kg)']) || 0;
      const realSJs = (po.deliveries || []).filter(
        (d) => !d.isFallbackNoDelivery && d.noSJ !== '-'
      );
      totalActiveSJs += realSJs.length;
    });

    return {
      totalPOs: filteredPOs.length,
      uniquePONumbers: uniqueNoPOSet.size > 0 ? uniqueNoPOSet.size : filteredPOs.length,
      totalRows: flattenedRows.length,
      totalActiveSJs,
      totalOrderPcs,
      totalOrderKg,
      totalTerkirimPcs,
      totalTerkirimKg,
      totalSisaOSPcs,
      totalSisaOSKg,
      totalStockPcs,
      totalStockKg,
    };
  }, [filteredPOs, flattenedRows]);

  // Max SJ count for Horizontal Matrix mode
  const maxHorizontalSJ = useMemo(() => {
    return Math.max(
      1,
      ...filteredPOs.map(
        (po) =>
          (po.deliveries || []).filter((d) => !d.isFallbackNoDelivery && d.noSJ !== '-').length
      )
    );
  }, [filteredPOs]);

  const triggerExport = (scope: DetailSJExportScope = 'ALL') => {
    setIsExportMenuOpen(false);
    haptic.success();
    confetti({
      particleCount: 45,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#19719C', '#10B981', '#EA5413'],
    });
    onDownloadDetailExcel(scope);
  };

  const triggerShareWA = (scope: DetailSJExportScope = 'ALL') => {
    setIsExportMenuOpen(false);
    haptic.medium();
    onShareDetailExcelWhatsApp(scope);
  };

  const triggerCopyText = (scope: DetailSJExportScope = 'ALL') => {
    setIsCopyMenuOpen(false);
    haptic.selection();
    onCopyDetailWhatsAppText(scope);
  };

  const isStickyHeader = scrollMode === 'box' || isFullscreen;
  const thStickyClass = isStickyHeader ? 'sticky top-0 z-20' : 'relative z-10';

  const safeSummary = useMemo(() => {
    const totalQtyOrderPcs = summary?.totalQtyOrderPcs ?? filteredTotals.totalOrderPcs;
    const totalBeratOrderKg = summary?.totalBeratOrderKg ?? filteredTotals.totalOrderKg;
    const totalTerkirimPcs = summary?.totalTerkirimPcs ?? filteredTotals.totalTerkirimPcs;
    const totalTerkirimKg = summary?.totalTerkirimKg ?? filteredTotals.totalTerkirimKg;
    const totalSisaOSPcs = summary?.totalSisaOSPcs ?? filteredTotals.totalSisaOSPcs;
    const totalSisaOSKg = summary?.totalSisaOSKg ?? filteredTotals.totalSisaOSKg;
    const totalPOs = summary?.totalPOs ?? data.length;
    const totalUniquePONumbers =
      summary?.totalUniquePONumbers ?? filterMetrics.allUniquePOs;
    const totalMultiItemPONumbers =
      summary?.totalMultiItemPONumbers ?? filterMetrics.multiItemUniquePOsCount;
    const totalUniqueItems =
      summary?.totalUniqueItems ?? new Set(data.map((d) => d.Artikel)).size;
    const totalCOOpen = summary?.totalCOOpen ?? filterMetrics.openPOs;
    const totalCOClosed = summary?.totalCOClosed ?? filterMetrics.closedPOs;
    const totalDeliveriesCount =
      summary?.totalDeliveriesCount ?? filterMetrics.totalSJTransactions;

    return {
      totalPOs,
      totalUniquePONumbers,
      totalMultiItemPONumbers,
      totalUniqueItems,
      totalCOOpen,
      totalCOClosed,
      totalDeliveriesCount,
      totalQtyOrderPcs,
      totalBeratOrderKg,
      totalTerkirimPcs,
      totalTerkirimKg,
      totalSisaOSPcs,
      totalSisaOSKg,
    };
  }, [summary, filteredTotals, data, filterMetrics]);

  const deliveryPercentage =
    safeSummary.totalQtyOrderPcs > 0
      ? Math.min(
          100,
          Math.round((safeSummary.totalTerkirimPcs / safeSummary.totalQtyOrderPcs) * 100)
        )
      : 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ================================================================= */}
      {/* 1. SUMMARY CARDS FOR DETAIL KIRIMAN (SURAT JALAN)                 */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-3.5">
        {/* Card 1: Total Dokumen No. PO Unik vs Total Baris PO-Item */}
        <div className="glass-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C6068]">
              Total PO Unik &amp; Baris Item
            </span>
            <div className="w-7 h-7 rounded-xl bg-[#19719C]/10 text-[#19719C] flex items-center justify-center">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2 flex-wrap">
              <div
                className="text-xl sm:text-2xl font-extrabold font-mono text-[#1E2024]"
                title="Jumlah Nomor Dokumen PO Unik (By No. PO Only)"
              >
                {safeSummary.totalUniquePONumbers.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-bold text-[#19719C]">PO Unik</span>
              </div>
              <span className="text-zinc-300 font-bold">/</span>
              <div
                className="text-sm sm:text-base font-extrabold font-mono text-[#5C6068]"
                title="Jumlah Baris Order (PO × Artikel/Item)"
              >
                {safeSummary.totalPOs.toLocaleString('id-ID')}{' '}
                <span className="text-[11px] font-semibold">Baris Item</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] font-mono text-[#5C6068]">
              <span>{safeSummary.totalUniqueItems} Artikel</span>
              {safeSummary.totalMultiItemPONumbers > 0 && (
                <>
                  <span>•</span>
                  <span
                    className="text-[#EA5413] font-bold"
                    title="Terdapat Nomor PO yang memesan lebih dari 1 Artikel berbeda"
                  >
                    {safeSummary.totalMultiItemPONumbers} PO Multi-Item
                  </span>
                </>
              )}
              <span>•</span>
              <span className="text-emerald-700 font-semibold">{safeSummary.totalCOOpen} Open</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Surat Jalan (SJ) */}
        <div className="glass-panel-accent rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#19719C]">
              Total Transaksi SJ
            </span>
            <div className="w-7 h-7 rounded-xl bg-[#19719C] text-white flex items-center justify-center shadow-2xs">
              <Truck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#19719C]">
              {safeSummary.totalDeliveriesCount.toLocaleString('id-ID')}{' '}
              <span className="text-xs font-semibold text-[#5C6068]">Surat Jalan</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] font-mono text-[#5C6068]">
              <span className="text-[#19719C] font-semibold">
                {filterMetrics.multiSJ} PO Multi-SJ
              </span>
              <span>•</span>
              <span className="text-amber-700 font-semibold">
                {filterMetrics.fallbackNoSJ} Belum Kirim
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Total QTY PO */}
        <div className="glass-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C6068]">
              Total QTY Order (PO)
            </span>
            <div className="w-7 h-7 rounded-xl bg-zinc-800/10 text-zinc-800 flex items-center justify-center">
              <FileSpreadsheet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#1E2024]">
              {safeSummary.totalQtyOrderPcs.toLocaleString('id-ID')}{' '}
              <span className="text-xs font-semibold text-[#5C6068]">PCS</span>
            </div>
            <div className="text-[11px] font-mono text-[#5C6068] mt-1">
              Berat Order: <strong>{safeSummary.totalBeratOrderKg.toLocaleString('id-ID')} KG</strong>
            </div>
          </div>
        </div>

        {/* Card 4: Total Realisasi Terkirim (Akumulasi SJ) */}
        <div className="glass-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Total Terkirim (SJ)
            </span>
            <div className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-700 flex items-center justify-center">
              <PackageCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-700">
              {safeSummary.totalTerkirimPcs.toLocaleString('id-ID')}{' '}
              <span className="text-xs font-semibold text-emerald-800/70">PCS</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-[#5C6068] mt-1">
              <span>{safeSummary.totalTerkirimKg.toLocaleString('id-ID')} KG</span>
              <span className="px-1.5 py-0.2 bg-emerald-500/15 text-emerald-800 font-bold rounded-full">
                {deliveryPercentage}% Terkirim
              </span>
            </div>
          </div>
        </div>

        {/* Card 5: Total Sisa OS Keseluruhan */}
        <div className="glass-card rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between border-amber-500/30 bg-gradient-to-br from-white/80 to-amber-50/40">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#EA5413]">
              Total Sisa OS Akhir
            </span>
            <div className="w-7 h-7 rounded-xl bg-[#EA5413]/15 text-[#EA5413] flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-[#EA5413]">
              {safeSummary.totalSisaOSPcs.toLocaleString('id-ID')}{' '}
              <span className="text-xs font-semibold text-[#EA5413]/80">PCS</span>
            </div>
            <div className="text-[11px] font-mono text-[#5C6068] mt-1">
              Tonase OS: <strong>{safeSummary.totalSisaOSKg.toLocaleString('id-ID')} KG</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 2. ACTION TOOLBAR KHUSUS DETAIL KIRIMAN SJ                        */}
      {/* ================================================================= */}
      <div
        className={`relative flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 sm:p-3.5 glass-panel rounded-3xl ${
          isExportMenuOpen || isCopyMenuOpen ? 'z-40' : 'z-20'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Split Button Download Excel Detail SJ */}
          <div
            className={`relative inline-flex flex-1 sm:flex-initial ${
              isExportMenuOpen ? 'z-50' : ''
            }`}
            ref={exportDropdownRef}
          >
            <div className="inline-flex items-stretch rounded-full border border-white/45 bg-gradient-to-b from-[#1F83B4]/95 to-[#19719C] backdrop-blur-xl shadow-[0_6px_20px_-3px_rgba(25,113,156,0.32)] text-white overflow-hidden transition-all duration-200 hover:shadow-[0_8px_24px_-2px_rgba(25,113,156,0.42)] hover:-translate-y-0.5">
              <button
                type="button"
                id="btn-download-detail-sj-excel"
                onClick={() => triggerExport('ALL')}
                className="px-4 sm:px-5 py-2.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer hover:bg-white/15 transition-colors"
                title="Download Excel Rekap Detail Kiriman per Surat Jalan (4 Sheet Standar Data Entry Profesional)"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Download Excel Detail SJ</span>
              </button>

              <div className="w-px self-stretch bg-white/25 my-1.5" />

              <button
                type="button"
                id="btn-toggle-detail-sj-export-menu"
                onClick={() => {
                  haptic.selection();
                  setIsExportMenuOpen(!isExportMenuOpen);
                }}
                className="px-2.5 py-2.5 inline-flex items-center justify-center cursor-pointer hover:bg-white/15 transition-colors"
                title="Pilih cakupan unduhan Excel Detail SJ"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isExportMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {isExportMenuOpen && (
              <div className="absolute left-0 top-full mt-2.5 w-84 max-w-[92vw] bg-white/95 backdrop-blur-2xl rounded-2xl z-50 p-2 font-sans animate-fade-in shadow-[0_20px_50px_-10px_rgba(0,0,19,0.16)] border border-white">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#5C5C68] font-mono border-b border-zinc-200/70">
                  Unduh Excel Detail Kiriman SJ (4 Sheet Lengkap)
                </div>

                <div className="py-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => triggerExport('ALL')}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-[#000013] hover:bg-[#19719C]/10 hover:text-[#19719C] rounded-xl flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Download className="w-3.5 h-3.5 text-[#19719C]" />
                      <span>Semua PO & Detail SJ (Full + Fallback)</span>
                    </div>
                    <span className="px-2 py-0.5 bg-zinc-200/70 text-[#000013] text-[10px] font-mono font-bold rounded-full">
                      {filterMetrics.allPOs} PO
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('OPEN_ONLY')}
                    disabled={filterMetrics.openPOs === 0}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-500/10 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Khusus CO Open (Detail SJ & OS)</span>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-800 text-[10px] font-mono font-bold rounded-full">
                      {filterMetrics.openPOs} PO
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('CLOSED_ONLY')}
                    disabled={filterMetrics.closedPOs === 0}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-[#5C5C68] hover:bg-zinc-200/50 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-zinc-400" />
                      <span>Khusus CO Closed (Detail SJ)</span>
                    </div>
                    <span className="px-2 py-0.5 bg-zinc-200/60 text-[#5C5C68] text-[10px] font-mono font-bold rounded-full">
                      {filterMetrics.closedPOs} PO
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('WITH_DELIVERY_ONLY')}
                    disabled={filterMetrics.withSJ === 0}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-[#19719C] hover:bg-[#19719C]/10 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Truck className="w-3.5 h-3.5 text-[#19719C]" />
                      <span>Khusus Sudah Ada Kiriman (SJ Aktif)</span>
                    </div>
                    <span className="px-2 py-0.5 bg-[#19719C]/15 text-[#19719C] text-[10px] font-mono font-bold rounded-full">
                      {filterMetrics.withSJ} PO
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('MULTI_DELIVERY_ONLY')}
                    disabled={filterMetrics.multiSJ === 0}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-600" />
                      <span>Khusus Multi-Kiriman (≥ 2 SJ per PO)</span>
                    </div>
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-mono font-bold rounded-full">
                      {filterMetrics.multiSJ} PO
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('NO_DELIVERY_FALLBACK')}
                    disabled={filterMetrics.fallbackNoSJ === 0}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Khusus Belum Kirim (Fallback OS)</span>
                    </div>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-mono font-bold rounded-full">
                      {filterMetrics.fallbackNoSJ} PO
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('HAS_SISA_OS')}
                    disabled={filterMetrics.hasSisaOS === 0}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-[#EA5413] hover:bg-orange-50 rounded-xl flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#EA5413]" />
                      <span>Khusus Masih Ada Sisa OS (&gt; 0 PCS)</span>
                    </div>
                    <span className="px-2 py-0.5 bg-orange-100 text-[#EA5413] text-[10px] font-mono font-bold rounded-full">
                      {filterMetrics.hasSisaOS} PO
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Direct Share Excel Detail SJ to WhatsApp */}
          <button
            type="button"
            onClick={() => triggerShareWA('ALL')}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider rounded-full border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/18 text-emerald-800 backdrop-blur-xl shadow-2xs hover:-translate-y-0.5 transition-all cursor-pointer"
            title="Kirim file Excel Detail Kiriman SJ (.xlsx) langsung via WhatsApp"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>Kirim Excel Detail SJ ke WA</span>
          </button>

          {/* Copy Detail SJ Text Summary for WhatsApp */}
          <div
            className={`relative inline-flex flex-1 sm:flex-initial ${
              isCopyMenuOpen ? 'z-50' : ''
            }`}
            ref={copyDropdownRef}
          >
            <div
              className={`inline-flex items-stretch rounded-full border ${
                isCopied
                  ? 'border-emerald-500/35 bg-emerald-50/90 text-emerald-800'
                  : 'border-white/90 bg-white/75 hover:bg-white/90 text-[#000013]'
              } backdrop-blur-xl shadow-2xs overflow-hidden transition-all`}
            >
              <button
                type="button"
                onClick={() => triggerCopyText('ALL')}
                className="px-3.5 sm:px-4 py-2.5 text-xs font-semibold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer hover:bg-black/[0.03]"
                title="Salin ringkasan teks rincian Surat Jalan & Sisa OS untuk WhatsApp"
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-emerald-700 font-bold">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#5C5C68] shrink-0" />
                    <span>Salin Teks Detail SJ</span>
                  </>
                )}
              </button>

              <div className="w-px self-stretch bg-zinc-200/80 my-1.5" />

              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setIsCopyMenuOpen(!isCopyMenuOpen);
                }}
                className="px-2.5 py-2.5 inline-flex items-center justify-center cursor-pointer text-[#5C5C68] hover:text-[#000013]"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    isCopyMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {isCopyMenuOpen && (
              <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2.5 w-76 max-w-[90vw] bg-white/95 backdrop-blur-2xl rounded-2xl z-50 p-2 font-sans shadow-xl border border-white">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#5C5C68] font-mono border-b border-zinc-200/60">
                  Pilih Cakupan Salin Teks WA (Detail SJ)
                </div>
                <div className="py-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => triggerCopyText('ALL')}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-[#000013] hover:bg-zinc-100 rounded-xl flex items-center justify-between cursor-pointer"
                  >
                    <span>Semua PO & Rincian SJ</span>
                    <span className="text-[10px] font-mono font-bold text-zinc-600">
                      {filterMetrics.allPOs} PO
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCopyText('OPEN_ONLY')}
                    disabled={filterMetrics.openPOs === 0}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 rounded-xl flex items-center justify-between disabled:opacity-40 cursor-pointer"
                  >
                    <span>Khusus CO Open</span>
                    <span className="text-[10px] font-mono font-bold text-emerald-700">
                      {filterMetrics.openPOs} PO
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCopyText('WITH_DELIVERY_ONLY')}
                    disabled={filterMetrics.withSJ === 0}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-[#19719C] hover:bg-sky-50 rounded-xl flex items-center justify-between disabled:opacity-40 cursor-pointer"
                  >
                    <span>Khusus Sudah Ada Kiriman SJ</span>
                    <span className="text-[10px] font-mono font-bold text-[#19719C]">
                      {filterMetrics.withSJ} PO
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCopyText('HAS_SISA_OS')}
                    disabled={filterMetrics.hasSisaOS === 0}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-[#EA5413] hover:bg-orange-50 rounded-xl flex items-center justify-between disabled:opacity-40 cursor-pointer"
                  >
                    <span>Khusus Masih Ada Sisa OS</span>
                    <span className="text-[10px] font-mono font-bold text-[#EA5413]">
                      {filterMetrics.hasSisaOS} PO
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Sheet Selector & Reset */}
        <div className="flex flex-wrap items-center gap-2">
          {sheets && sheets.length > 1 && onSelectSheet && (
            <div className="flex items-center gap-2 bg-white/75 backdrop-blur-xl border border-white/90 rounded-full px-3.5 py-1.5 text-xs font-mono shadow-2xs">
              <span className="text-[#5C5C68] font-bold uppercase text-[10px]">Sheet:</span>
              <select
                value={activeSheet}
                onChange={(e) => {
                  haptic.selection();
                  onSelectSheet(e.target.value);
                }}
                className="bg-transparent text-[#000013] font-semibold focus:outline-none cursor-pointer text-xs"
              >
                {sheets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              haptic.heavy();
              onReset();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider rounded-full border border-white/80 bg-white/60 hover:bg-white/85 text-[#5C5C68] hover:text-[#000013] transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Ganti File</span>
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 3. MAIN DETAIL KIRIMAN SJ TABLE CONTAINER                         */}
      {/* ================================================================= */}
      <div
        id="detail-sj-table-container"
        className={
          isFullscreen
            ? 'fixed inset-0 z-50 bg-[#F5F6F8]/98 backdrop-blur-2xl flex flex-col p-2.5 sm:p-4 overflow-hidden'
            : 'glass-panel rounded-3xl overflow-hidden relative z-10'
        }
      >
        {/* Fullscreen Top Header */}
        {isFullscreen && (
          <div className="glass-panel-accent p-2.5 sm:p-3 rounded-2xl flex items-center justify-between gap-3 mb-2.5 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#19719C] text-white flex items-center justify-center font-bold text-xs shrink-0">
                <Truck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-bold tracking-tight text-[#1E2024] truncate">
                    Mode Rekap Detail Kiriman (Per Surat Jalan / SJ) — Layar Penuh
                  </h2>
                  <span className="px-2 py-0.5 bg-[#19719C]/15 text-[#19719C] text-[10px] font-mono font-bold rounded-full">
                    {filteredTotals.totalPOs} PO • {filteredTotals.totalActiveSJs} SJ
                  </span>
                </div>
                <p className="text-[11px] text-[#5C6068] truncate hidden sm:block">
                  Rincian setiap pengiriman berdasarkan No. Surat Jalan, Tanggal Kirim, Qty Kirim,
                  Fallback OS, dan Sisa OS Akhir (Tekan ESC untuk keluar)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                haptic.medium();
                setIsFullscreen(false);
              }}
              className="liquid-glass-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs uppercase tracking-wider cursor-pointer shrink-0"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Keluar Layar Penuh</span>
            </button>
          </div>
        )}

        {/* Controls Header */}
        <div className="p-3 sm:p-4 border-b border-zinc-200/60 bg-white/45 flex flex-col gap-3 shrink-0">
          {/* Row 1: Search Bar & Layout View Switcher */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 sm:gap-4">
            {/* Search Input */}
            <div className="relative flex-1 max-w-full lg:max-w-lg">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari No. Surat Jalan (P26...), Tgl Kirim, Artikel, No. PO, atau CO..."
                className="w-full pl-9 pr-8 py-2 bg-white/85 border border-white/95 rounded-full text-xs font-mono text-[#1E2024] placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#19719C]/40 shadow-2xs min-h-[38px]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 rounded-full cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Layout Mode & Table Controls */}
            <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2">
              {/* View Format Selector */}
              <div className="glass-segmented inline-flex flex-wrap items-center p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setLayoutMode('DATA_ENTRY_TABLE');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    layoutMode === 'DATA_ENTRY_TABLE'
                      ? 'bg-[#19719C] text-white shadow-2xs'
                      : 'text-[#5C6068] hover:text-[#1E2024]'
                  }`}
                  title="Tabel Standar Data Entry Profesional (Baris per Surat Jalan + Sub-Total Sisa OS per PO)"
                >
                  <TableIcon className="w-3 h-3" />
                  <span>Tabel Data Entry ({filteredTotals.totalPOs} Item)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setLayoutMode('UNIQUE_PO_SUMMARY');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    layoutMode === 'UNIQUE_PO_SUMMARY'
                      ? 'bg-[#EA5413] text-white shadow-2xs'
                      : 'text-[#5C6068] hover:text-[#1E2024]'
                  }`}
                  title="Rekap Konsolidasi By Nomor PO Unik (Menggabungkan PO yang memiliki beberapa Artikel/Item ke dalam 1 Nomor PO)"
                >
                  <Layers className="w-3 h-3" />
                  <span>By No. PO Unik ({filteredTotals.uniquePONumbers} PO)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setLayoutMode('PO_GROUP_CARDS');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    layoutMode === 'PO_GROUP_CARDS'
                      ? 'bg-[#19719C] text-white shadow-2xs'
                      : 'text-[#5C6068] hover:text-[#1E2024]'
                  }`}
                  title="Tampilan Grup per PO-Item & Rincian Tahapan Surat Jalan"
                >
                  <LayoutList className="w-3 h-3" />
                  <span>Grup per PO</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setLayoutMode('HORIZONTAL_MATRIX');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    layoutMode === 'HORIZONTAL_MATRIX'
                      ? 'bg-[#19719C] text-white shadow-2xs'
                      : 'text-[#5C6068] hover:text-[#1E2024]'
                  }`}
                  title="Tampilan Matriks Horizontal (1 Baris = 1 PO-Item, Kolom SJ #1, SJ #2, SJ #3...)"
                >
                  <Columns3 className="w-3 h-3" />
                  <span>Matriks SJ 1..N</span>
                </button>
              </div>

              {/* Sub-Total Toggle when in DATA_ENTRY_TABLE */}
              {layoutMode === 'DATA_ENTRY_TABLE' && (
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setShowSubTotalPerPO(!showSubTotalPerPO);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                    showSubTotalPerPO
                      ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-800'
                      : 'bg-white/60 border-zinc-300/70 text-[#5C6068]'
                  }`}
                  title="Tampilkan baris ringkasan Sub-Total & Sisa OS Akhir tepat di bawah kiriman terakhir setiap PO"
                >
                  <CheckCircle2
                    className={`w-3 h-3 ${
                      showSubTotalPerPO ? 'text-emerald-600' : 'text-zinc-400'
                    }`}
                  />
                  <span>Sub-Total per PO</span>
                </button>
              )}

              {/* Repeat PO Totals Toggle when in DATA_ENTRY_TABLE */}
              {layoutMode === 'DATA_ENTRY_TABLE' && (
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setRepeatPOTotalsOnEveryRow(!repeatPOTotalsOnEveryRow);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                    repeatPOTotalsOnEveryRow
                      ? 'bg-[#19719C]/12 border-[#19719C]/35 text-[#19719C]'
                      : 'bg-white/60 border-zinc-300/70 text-[#5C6068]'
                  }`}
                  title="Jika aktif, QTY PO & Sisa OS Akhir diulang di setiap baris SJ. Jika nonaktif (Default Data Entry), QTY PO hanya di baris ke-1 PO & Sisa OS Akhir di baris SJ terakhir PO agar SUM kolom tidak ganda."
                >
                  <span>{repeatPOTotalsOnEveryRow ? 'Mode: Flat Penuh' : 'Mode: Akurat SUM'}</span>
                </button>
              )}

              {/* Scroll Mode */}
              <div className="glass-segmented inline-flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setScrollMode('page');
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    scrollMode === 'page'
                      ? 'glass-segmented-active text-emerald-700'
                      : 'text-[#5C6068]'
                  }`}
                >
                  <Unlock className="w-3 h-3" />
                  <span>Bebas</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setScrollMode('box');
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    scrollMode === 'box'
                      ? 'glass-segmented-active text-[#19719C]'
                      : 'text-[#5C6068]'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>Kotak</span>
                </button>
              </div>

              {/* Fullscreen Toggle */}
              <button
                type="button"
                onClick={() => {
                  haptic.medium();
                  setIsFullscreen(!isFullscreen);
                }}
                className="liquid-glass-clear inline-flex items-center gap-1 px-2.5 py-1 text-[11px] uppercase tracking-wider cursor-pointer"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-[#19719C]" />
                    <span>Keluar</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-[#19719C]" />
                    <span>Layar Penuh</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: Filter Toolbar (Status CO & Filter Kiriman SJ) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2.5 border-t border-zinc-200/60 text-xs">
            {/* Status CO */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#5C6068] flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-[#19719C]" />
                <span>Status CO:</span>
              </span>
              <div className="glass-segmented inline-flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setCoFilter('ALL');
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                    coFilter === 'ALL'
                      ? 'glass-segmented-active text-[#19719C]'
                      : 'text-[#5C6068]'
                  }`}
                >
                  Semua ({filterMetrics.allPOs})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setCoFilter('OPEN');
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                    coFilter === 'OPEN'
                      ? 'bg-emerald-500 text-white shadow-2xs'
                      : 'text-[#5C6068]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      coFilter === 'OPEN' ? 'bg-white' : 'bg-emerald-500'
                    }`}
                  />
                  <span>Open ({filterMetrics.openPOs})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setCoFilter('CLOSED');
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                    coFilter === 'CLOSED'
                      ? 'bg-zinc-700 text-white shadow-2xs'
                      : 'text-[#5C6068]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      coFilter === 'CLOSED' ? 'bg-white' : 'bg-zinc-400'
                    }`}
                  />
                  <span>Closed ({filterMetrics.closedPOs})</span>
                </button>
              </div>
            </div>

            <div className="hidden xl:block w-px h-4 bg-zinc-300/60" />

            {/* Filter Rincian Kiriman SJ */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-semibold text-[#5C6068] shrink-0">
                Filter Kiriman SJ:
              </span>
              <div className="glass-segmented inline-flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('ALL');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'ALL'
                      ? 'glass-segmented-active text-[#1E2024]'
                      : 'text-[#5C6068]'
                  }`}
                >
                  Semua PO ({filterMetrics.scopedPOsCount})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('WITH_SJ');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'WITH_SJ'
                      ? 'bg-[#19719C] text-white shadow-2xs'
                      : 'text-[#5C6068] hover:text-[#19719C]'
                  }`}
                >
                  Sudah Ada SJ ({filterMetrics.withSJ})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('MULTI_SJ');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'MULTI_SJ'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-[#5C6068] hover:text-indigo-700'
                  }`}
                  title="PO yang dikirim bertahap dengan 2 atau lebih Surat Jalan"
                >
                  Multi-Kiriman ≥2 SJ ({filterMetrics.multiSJ})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('FALLBACK_NO_SJ');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'FALLBACK_NO_SJ'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-[#5C6068] hover:text-amber-700'
                  }`}
                  title="PO yang belum memiliki Surat Jalan (Belum Kirim)"
                >
                  Belum Kirim ({filterMetrics.fallbackNoSJ})
                </button>

                {filterMetrics.multiItemPOLines > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setDeliveryFilter('MULTI_ITEM_PO');
                    }}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                      deliveryFilter === 'MULTI_ITEM_PO'
                        ? 'bg-purple-700 text-white shadow-2xs'
                        : 'text-[#5C6068] hover:text-purple-700'
                    }`}
                    title="Nomor PO yang digunakan untuk memesan lebih dari 1 Artikel/Item berbeda"
                  >
                    PO Multi-Item ({filterMetrics.multiItemUniquePOsCount} PO / {filterMetrics.multiItemPOLines} Item)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('HAS_SISA_OS');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'HAS_SISA_OS'
                      ? 'bg-[#EA5413] text-white shadow-2xs'
                      : 'text-[#5C6068] hover:text-[#EA5413]'
                  }`}
                >
                  Masih Ada Sisa OS ({filterMetrics.hasSisaOS})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('LUNAS_OS');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'LUNAS_OS'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-[#5C6068] hover:text-emerald-700'
                  }`}
                >
                  Sisa OS Lunas / 0 ({filterMetrics.lunasOS})
                </button>
              </div>
            </div>

            {(coFilter !== 'ALL' || deliveryFilter !== 'ALL' || searchTerm.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setCoFilter('ALL');
                  setDeliveryFilter('ALL');
                  setSearchTerm('');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 bg-zinc-200/60 hover:bg-zinc-200 rounded-full cursor-pointer ml-auto"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filter</span>
              </button>
            )}
          </div>
        </div>

        {/* =============================================================== */}
        {/* VIEW 1: STANDARD DATA ENTRY TABLE (BARIS PER SJ + SUB-TOTAL PO) */}
        {/* =============================================================== */}
        {layoutMode === 'DATA_ENTRY_TABLE' && (
          <div
            className={
              isFullscreen
                ? 'flex-1 min-h-0 overflow-x-auto overflow-y-auto relative bg-white/40'
                : scrollMode === 'page'
                ? 'overflow-x-auto relative'
                : 'overflow-x-auto overflow-y-auto max-h-[72vh] relative'
            }
          >
            <table
              id="erp-detail-sj-table"
              className="w-full text-left text-xs whitespace-nowrap border-collapse"
            >
              <thead
                className={`${
                  isStickyHeader ? 'sticky top-0 z-20 shadow-xs' : 'relative z-10'
                } bg-[#18222C] text-white text-[11px] font-mono font-semibold tracking-wider`}
              >
                <tr>
                  <th className={`${thStickyClass} bg-[#18222C] py-3 px-3 border-r border-white/10`}>
                    PO #
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-3 px-3 border-r border-white/10`}>
                    1. CO (Status)
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-3 px-3 border-r border-white/10`}>
                    2. Artikel
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-3 px-3 border-r border-white/10`}>
                    3. Item Description
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-3 px-3 border-r border-white/10`}>
                    4. Tgl Input PO
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-3 px-3 border-r border-white/10`}>
                    5. No PO (Clean)
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-3 px-3 border-r border-white/10`}>
                    6. Substance
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-3 px-3 text-right border-r border-white/10`}
                  >
                    7. QTY PO (pcs)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-3 px-3 text-right border-r border-white/10`}
                  >
                    8. Berat PO (KG)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-3 px-3 border-r border-white/15 text-sky-100`}
                  >
                    9. Tahap Kiriman
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-3 px-3 border-r border-white/15 text-sky-100`}
                  >
                    10. No. Surat Jalan (SJ)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-3 px-3 border-r border-white/15 text-sky-100`}
                  >
                    11. Tanggal Kirim (SJ)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-3 px-3 text-right border-r border-white/15 text-emerald-200`}
                  >
                    12. QTY Kirim SJ (pcs)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-3 px-3 text-right border-r border-white/15 text-emerald-200`}
                  >
                    13. Berat Kirim SJ (KG)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-3 px-3 text-right border-r border-white/15 text-amber-200`}
                  >
                    14. Sisa OS Berjalan (pcs)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-3 px-3 text-right border-r border-white/15 text-amber-200`}
                  >
                    15. Sisa OS Berjalan (KG)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-3 px-3 text-right border-r border-white/10 text-emerald-300`}
                  >
                    16. Total Terkirim PO (pcs)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-3 px-3 text-right border-r border-white/10 text-amber-300`}
                  >
                    17. Sisa OS Akhir PO (pcs)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-3 px-3 text-right border-r border-white/10 text-amber-300`}
                  >
                    18. Sisa OS Akhir PO (KG)
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-3 px-3 text-right border-r border-white/10`}
                  >
                    19. Stock Gudang (pcs)
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-3 px-3 text-right`}>
                    20. Harga
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-200/70 font-mono text-xs">
                {flattenedRows.length === 0 ? (
                  <tr>
                    <td colSpan={21} className="py-12 text-center text-zinc-500 font-sans">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="w-6 h-6 text-zinc-400" />
                        <p className="font-semibold text-sm text-zinc-700">
                          Tidak ada data kiriman / PO yang sesuai dengan filter saat ini.
                        </p>
                        <p className="text-xs text-zinc-500">
                          Klik tombol &ldquo;Reset Filter&rdquo; untuk menampilkan kembali seluruh
                          data.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  flattenedRows.map((row) => {
                    const showTopPOFields = repeatPOTotalsOnEveryRow || row.isFirstRowOfPO;
                    const showBottomPOFields = repeatPOTotalsOnEveryRow || row.isLastRowOfPO;

                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          className={`transition-colors ${
                            row.isFallbackNoDelivery
                              ? 'bg-amber-50/40 hover:bg-amber-50/80'
                              : row.isFirstRowOfPO
                              ? 'bg-white/85 hover:bg-sky-50/50 border-t-2 border-t-zinc-300/80'
                              : 'bg-white/60 hover:bg-sky-50/40'
                          }`}
                        >
                          {/* PO Index */}
                          <td className="py-2.5 px-3 border-r border-zinc-200/60 font-bold text-zinc-500">
                            {row.isFirstRowOfPO ? `#${row.poIndex}` : ''}
                          </td>

                          {/* 1. CO */}
                          <td className="py-2.5 px-3 border-r border-zinc-200/60">
                            {showTopPOFields ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-[#1E2024]">{row.CO}</span>
                                <span
                                  className={`px-1.5 py-0.2 text-[9px] font-bold rounded-full ${
                                    row.coStatus === 'OPEN'
                                      ? 'bg-emerald-500/15 text-emerald-800 border border-emerald-500/30'
                                      : 'bg-zinc-200 text-zinc-700'
                                  }`}
                                >
                                  {row.coStatus}
                                </span>
                              </div>
                            ) : (
                              <span className="text-zinc-400 text-[11px]">{row.CO}</span>
                            )}
                          </td>

                          {/* 2. Artikel */}
                          <td className="py-2.5 px-3 border-r border-zinc-200/60 font-bold text-[#19719C]">
                            {showTopPOFields ? (
                              row.Artikel
                            ) : (
                              <span className="text-zinc-400 font-normal">{row.Artikel}</span>
                            )}
                          </td>

                          {/* 3. Item Description */}
                          <td className="py-2.5 px-3 border-r border-zinc-200/60 font-sans text-[#1E2024]">
                            {showTopPOFields ? (
                              row['Item Description']
                            ) : (
                              <span className="text-zinc-400">{row['Item Description']}</span>
                            )}
                          </td>

                          {/* 4. Tanggal Input PO */}
                          <td className="py-2.5 px-3 border-r border-zinc-200/60 text-zinc-700">
                            {showTopPOFields ? (
                              row['Tanggal Input PO']
                            ) : (
                              <span className="text-zinc-400">{row['Tanggal Input PO']}</span>
                            )}
                          </td>

                          {/* 5. No PO */}
                          <td className="py-2.5 px-3 border-r border-zinc-200/60 font-bold text-[#1E2024]">
                            {showTopPOFields ? (
                              <div className="flex items-center gap-1.5">
                                <span>{row['No PO']}</span>
                                {(poLineCountMap.get(String(row['No PO'] || '').trim()) || 0) >
                                  1 && (
                                  <span
                                    className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-300/60 text-[9px] font-bold"
                                    title={`Nomor PO ${row['No PO']} ini memiliki ${poLineCountMap.get(String(row['No PO'] || '').trim())} Artikel/Item berbeda di dalam file`}
                                  >
                                    {poLineCountMap.get(String(row['No PO'] || '').trim())} Item
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-zinc-400 font-normal">{row['No PO']}</span>
                            )}
                          </td>

                          {/* 6. Substance */}
                          <td className="py-2.5 px-3 border-r border-zinc-200/60 text-zinc-600">
                            {showTopPOFields ? row.Substance : ''}
                          </td>

                          {/* 7. QTY PO (pcs) */}
                          <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 font-bold text-[#1E2024]">
                            {showTopPOFields
                              ? row['QTY PO (pcs)'].toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 8. Berat PO (KG) */}
                          <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 text-zinc-600">
                            {showTopPOFields
                              ? row['Berat PO (KG)'].toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 9. Urutan / Tahap Kiriman */}
                          <td className="py-2.5 px-3 border-r border-zinc-200/60 bg-sky-50/40">
                            {row.isFallbackNoDelivery ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-800 border border-amber-500/30">
                                Belum Kirim
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#19719C]/12 text-[#19719C] border border-[#19719C]/25">
                                {row.labelKiriman}
                              </span>
                            )}
                          </td>

                          {/* 10. No Surat Jalan (SJ) */}
                          <td className="py-2.5 px-3 border-r border-zinc-200/60 bg-sky-50/40 font-extrabold text-[#1E2024]">
                            {row.isFallbackNoDelivery ? (
                              <span className="text-zinc-400">-</span>
                            ) : (
                              <span className="text-[#19719C]">{row['No Surat Jalan (SJ)']}</span>
                            )}
                          </td>

                          {/* 11. Tanggal Kirim (SJ) */}
                          <td className="py-2.5 px-3 border-r border-zinc-200/60 bg-sky-50/40 text-zinc-800 font-semibold">
                            {row['Tanggal Kirim (SJ)']}
                          </td>

                          {/* 12. QTY Kirim SJ (pcs) */}
                          <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 bg-emerald-50/35 font-extrabold text-emerald-700">
                            {row.isFallbackNoDelivery
                              ? '0'
                              : row['QTY Kirim SJ (pcs)'].toLocaleString('id-ID')}
                          </td>

                          {/* 13. Berat Kirim SJ (KG) */}
                          <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 bg-emerald-50/35 text-emerald-800">
                            {row.isFallbackNoDelivery
                              ? '0'
                              : row['Berat Kirim SJ (KG)'].toLocaleString('id-ID')}
                          </td>

                          {/* 14. Sisa OS Berjalan (pcs) */}
                          <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 bg-amber-50/35 font-bold text-amber-900">
                            {row['Sisa OS Berjalan (pcs)'].toLocaleString('id-ID')}
                          </td>

                          {/* 15. Sisa OS Berjalan (KG) */}
                          <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 bg-amber-50/35 text-amber-800">
                            {row['Sisa OS Berjalan (KG)'].toLocaleString('id-ID')}
                          </td>

                          {/* 16. Total Terkirim PO (pcs) */}
                          <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 font-bold text-emerald-800">
                            {showBottomPOFields
                              ? row['Total Terkirim PO (pcs)'].toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 17. Sisa OS Akhir PO (pcs) */}
                          <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 font-extrabold text-[#EA5413]">
                            {showBottomPOFields
                              ? row['Sisa OS Akhir PO (pcs)'].toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 18. Sisa OS Akhir PO (KG) */}
                          <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 font-semibold text-[#EA5413]/90">
                            {showBottomPOFields
                              ? row['Sisa OS Akhir PO (KG)'].toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 19. Stock Gudang (pcs) */}
                          <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 font-bold text-zinc-700">
                            {showBottomPOFields
                              ? row['Stock (pcs)'].toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 20. Harga */}
                          <td className="py-2.5 px-3 text-right text-zinc-600">
                            {showTopPOFields
                              ? row.Harga > 0
                                ? row.Harga.toLocaleString('id-ID')
                                : '-'
                              : ''}
                          </td>
                        </tr>

                        {/* Optional Inline Sub-Total & Sisa OS Akhir Row after each PO */}
                        {showSubTotalPerPO && row.isLastRowOfPO && (
                          <tr className="bg-[#EEF4F8] border-b-2 border-b-[#19719C]/25 text-[11px] font-mono">
                            <td colSpan={7} className="py-2 px-3 font-bold text-[#19719C]">
                              <div className="flex items-center gap-2">
                                <span>↳ SUB-TOTAL & SISA OS PO:</span>
                                <span className="px-2 py-0.2 bg-white rounded-md border border-[#19719C]/25 text-[#1E2024]">
                                  {row['No PO']}
                                </span>
                                <span className="text-zinc-600">({row.Artikel})</span>
                                <span className="text-zinc-500">•</span>
                                <span>
                                  {row.isFallbackNoDelivery
                                    ? 'Belum Kirim'
                                    : `Total ${row.frekuensiKirim}x Kiriman SJ`}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-extrabold text-[#1E2024] border-r border-zinc-300/60">
                              {row['QTY PO (pcs)'].toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right font-semibold text-zinc-700 border-r border-zinc-300/60">
                              {row['Berat PO (KG)'].toLocaleString('id-ID')}
                            </td>
                            <td
                              colSpan={3}
                              className="py-2 px-3 text-right font-bold text-emerald-800 border-r border-zinc-300/60"
                            >
                              Total Kirim ({row.frekuensiKirim} SJ):
                            </td>
                            <td className="py-2 px-3 text-right font-extrabold text-emerald-700 bg-emerald-500/10 border-r border-zinc-300/60">
                              {row['Total Terkirim PO (pcs)'].toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-800 bg-emerald-500/10 border-r border-zinc-300/60">
                              {row['Total Terkirim PO (KG)'].toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right font-extrabold text-[#EA5413] bg-orange-500/10 border-r border-zinc-300/60">
                              Sisa: {row['Sisa OS Akhir PO (pcs)'].toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-[#EA5413] bg-orange-500/10 border-r border-zinc-300/60">
                              {row['Sisa OS Akhir PO (KG)'].toLocaleString('id-ID')} KG
                            </td>
                            <td className="py-2 px-3 text-right font-extrabold text-emerald-800 border-r border-zinc-300/60">
                              {row['Total Terkirim PO (pcs)'].toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right font-extrabold text-[#EA5413] bg-orange-500/15 border-r border-zinc-300/60">
                              {row['Sisa OS Akhir PO (pcs)'].toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-[#EA5413] bg-orange-500/15 border-r border-zinc-300/60">
                              {row['Sisa OS Akhir PO (KG)'].toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-zinc-800 border-r border-zinc-300/60">
                              {row['Stock (pcs)'].toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right text-zinc-600">
                              {row.Harga > 0 ? row.Harga.toLocaleString('id-ID') : '-'}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>

              {/* Grand Total Footer */}
              {flattenedRows.length > 0 && (
                <tfoot className="bg-[#18222C] text-white font-mono text-xs font-bold">
                  <tr>
                    <td colSpan={7} className="py-3.5 px-4 border-r border-white/15">
                      TOTAL REKAPITULASI KESELURUHAN ({filteredTotals.uniquePONumbers} NO. PO UNIK /{' '}
                      {filteredTotals.totalPOs} BARIS ITEM • {filteredTotals.totalActiveSJs} SURAT
                      JALAN)
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-white">
                      {filteredTotals.totalOrderPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-zinc-300">
                      {filteredTotals.totalOrderKg.toLocaleString('id-ID')}
                    </td>
                    <td colSpan={3} className="py-3.5 px-3 text-right border-r border-white/15 text-sky-200">
                      Akumulasi Kirim SJ:
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-emerald-300">
                      {filteredTotals.totalTerkirimPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-emerald-300">
                      {filteredTotals.totalTerkirimKg.toLocaleString('id-ID')}
                    </td>
                    <td colSpan={2} className="py-3.5 px-3 text-right border-r border-white/15 text-amber-200">
                      Total Akhir:
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-emerald-300">
                      {filteredTotals.totalTerkirimPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-amber-300">
                      {filteredTotals.totalSisaOSPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-amber-300">
                      {filteredTotals.totalSisaOSKg.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-sky-200">
                      {filteredTotals.totalStockPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 text-right">-</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* =============================================================== */}
        {/* VIEW 1B: REKAP BY NO. PO UNIK (1 BARIS = 1 NOMOR PO DOKUMEN)    */}
        {/* =============================================================== */}
        {layoutMode === 'UNIQUE_PO_SUMMARY' && (
          <div
            className={
              isFullscreen
                ? 'flex-1 min-h-0 overflow-auto bg-white/40'
                : scrollMode === 'page'
                ? 'overflow-x-auto'
                : 'overflow-x-auto max-h-[72vh] overflow-y-auto'
            }
          >
            <div className="px-4 py-2.5 bg-indigo-50/90 border-b border-indigo-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-indigo-950 font-medium">
                <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-mono font-bold text-[11px]">
                  DEDUPLIKASI BY NO. PO
                </span>
                <span>
                  Menampilkan <strong>{consolidatedUniquePOs.length} Nomor PO Unik</strong> (digabungkan dari{' '}
                  <strong>{filteredTotals.totalPOs} Baris PO-Item</strong>). Jika 1 Nomor PO memiliki beberapa Artikel, angkanya diakumulasikan dalam 1 baris PO.
                </span>
              </div>
              <span className="text-[11px] font-mono text-indigo-700 font-semibold">
                Tersedia juga di Sheet 2 Excel (&quot;Rekap per No PO Unik&quot;)
              </span>
            </div>

            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-[#18222C] text-white text-[11px] font-mono uppercase tracking-wider">
                  <th className="py-3 px-3 text-center border-r border-white/10 w-12">No. Unik</th>
                  <th className="py-3 px-3 border-r border-white/10 min-w-[165px]">No. PO (Unik)</th>
                  <th className="py-3 px-2.5 text-center border-r border-white/10 min-w-[95px]">Jml Item</th>
                  <th className="py-3 px-3 border-r border-white/10 min-w-[240px]">Daftar Artikel dalam PO</th>
                  <th className="py-3 px-3 border-r border-white/10 min-w-[150px]">Daftar No. CO</th>
                  <th className="py-3 px-3 text-right border-r border-white/10 min-w-[110px]">Total QTY PO (pcs)</th>
                  <th className="py-3 px-3 text-right border-r border-white/10 min-w-[95px]">Berat PO (KG)</th>
                  <th className="py-3 px-2.5 text-center border-r border-white/10 min-w-[85px]">Frek. SJ</th>
                  <th className="py-3 px-3 text-right border-r border-white/10 bg-[#0D4A3E] min-w-[115px]">Total Terkirim (pcs)</th>
                  <th className="py-3 px-3 text-right border-r border-white/10 bg-[#8F340B] min-w-[115px]">Total Sisa OS (pcs)</th>
                  <th className="py-3 px-3 text-right border-r border-white/10 bg-[#8F340B] min-w-[100px]">Sisa OS (KG)</th>
                  <th className="py-3 px-3 min-w-[260px]">Rincian Surat Jalan (SJ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/70 text-xs font-mono">
                {consolidatedUniquePOs.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-zinc-500 font-sans">
                      Tidak ada data Nomor PO yang sesuai dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  consolidatedUniquePOs.map((upo, idx) => {
                    const isMulti = upo.items.length > 1;
                    return (
                      <tr
                        key={`${upo.noPO}_${idx}`}
                        className={`${
                          isMulti
                            ? 'bg-indigo-50/45 hover:bg-indigo-100/50'
                            : idx % 2 === 0
                            ? 'bg-white/90 hover:bg-sky-50/50'
                            : 'bg-[#F6F9FC]/90 hover:bg-sky-50/50'
                        } transition-colors`}
                      >
                        <td className="py-2.5 px-3 text-center font-bold text-[#19719C] border-r border-zinc-200/60">
                          #{idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-[#1E2024] border-r border-zinc-200/60">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{upo.noPO}</span>
                            {isMulti && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 border border-indigo-500/30 text-[9px] font-bold">
                                MULTI-ITEM
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-center border-r border-zinc-200/60">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isMulti
                                ? 'bg-indigo-600 text-white'
                                : 'bg-zinc-200/75 text-zinc-700'
                            }`}
                          >
                            {upo.items.length} Item
                          </span>
                        </td>
                        <td className="py-2.5 px-3 border-r border-zinc-200/60 font-sans text-[11px] text-[#1E2024]">
                          <div className="flex flex-col gap-1">
                            {upo.items.map((it, iIdx) => (
                              <div
                                key={iIdx}
                                className="flex items-center justify-between gap-2 bg-white/80 px-2 py-0.5 rounded border border-zinc-200/70"
                              >
                                <span className="font-mono font-semibold text-[#19719C] truncate">
                                  {it.Artikel}
                                </span>
                                <span className="font-mono text-[10px] text-zinc-600 shrink-0">
                                  PO: {it['QTY Order (pcs)'].toLocaleString('id-ID')} • OS:{' '}
                                  <strong className="text-[#EA5413]">
                                    {it['Sisa OS (pcs)'].toLocaleString('id-ID')}
                                  </strong>
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 border-r border-zinc-200/60 text-zinc-700 text-[11px]">
                          {upo.coList.join(', ') || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#1E2024] border-r border-zinc-200/60">
                          {upo.totalQtyPoPcs.toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-600 border-r border-zinc-200/60">
                          {Math.round(upo.totalBeratPoKg * 100) / 100}
                        </td>
                        <td className="py-2.5 px-2.5 text-center border-r border-zinc-200/60">
                          {upo.totalSJCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 text-[10px] font-bold">
                              {upo.totalSJCount}x SJ
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 border border-amber-500/30 text-[10px] font-bold">
                              Belum Kirim
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700 bg-emerald-500/[0.05] border-r border-zinc-200/60">
                          {upo.totalTerkirimPcs > 0
                            ? upo.totalTerkirimPcs.toLocaleString('id-ID')
                            : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-[#EA5413] bg-orange-500/[0.06] border-r border-zinc-200/60">
                          {upo.totalSisaOSPcs.toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-[#EA5413]/90 border-r border-zinc-200/60">
                          {(Math.round(upo.totalSisaOSKg * 100) / 100).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-zinc-700">
                          {upo.sjSummaries.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {upo.sjSummaries.map((sj, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="px-1.5 py-0.5 bg-zinc-100 rounded border border-zinc-300/70 text-[10px] font-mono"
                                >
                                  {sj.noSJ}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-amber-700 font-semibold">Belum Kirim</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {consolidatedUniquePOs.length > 0 && (
                <tfoot className="bg-[#18222C] text-white font-mono text-xs font-bold">
                  <tr>
                    <td colSpan={5} className="py-3.5 px-4 border-r border-white/15">
                      TOTAL REKAP BY NO. PO UNIK ({consolidatedUniquePOs.length} NO. PO UNIK DARI{' '}
                      {filteredTotals.totalPOs} BARIS ITEM)
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15">
                      {filteredTotals.totalOrderPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-zinc-300">
                      {filteredTotals.totalOrderKg.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-2.5 text-center border-r border-white/15 text-sky-200">
                      {filteredTotals.totalActiveSJs} SJ
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-emerald-300">
                      {filteredTotals.totalTerkirimPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-amber-300">
                      {filteredTotals.totalSisaOSPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 text-right border-r border-white/15 text-amber-300">
                      {filteredTotals.totalSisaOSKg.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3.5 px-3 text-left text-sky-200 text-[11px]">
                      {consolidatedUniquePOs.filter((u) => u.items.length > 1).length} No. PO memiliki &gt;1 Artikel
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* =============================================================== */}
        {/* VIEW 2: PO GROUP CARDS (KARTU RINCIAN BERTINGKAT PER PO)        */}
        {/* =============================================================== */}
        {layoutMode === 'PO_GROUP_CARDS' && (
          <div
            className={
              isFullscreen
                ? 'flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3.5 bg-white/30'
                : scrollMode === 'page'
                ? 'p-3 sm:p-4 space-y-3.5'
                : 'p-3 sm:p-4 space-y-3.5 max-h-[72vh] overflow-y-auto'
            }
          >
            {filteredPOs.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">
                Tidak ada data PO yang sesuai dengan filter saat ini.
              </div>
            ) : (
              filteredPOs.map((po, idx) => {
                const realSJs = (po.deliveries || []).filter(
                  (d) => !d.isFallbackNoDelivery && d.noSJ !== '-'
                );
                const qtyPoPcs = Number(po['QTY PO (pcs)']) || 0;
                const beratPoKg = Number(po['Berat PO (KG)']) || 0;
                const terkirimPcs = Number(po['Terkirim (PCS)']) || 0;
                const terkirimKg = Number(po['Terkirim (KG)']) || 0;
                const sisaPcs = Number(po['Sisa OS (pcs)']) || 0;
                const sisaKg = Number(po['Sisa OS (kg)']) || 0;

                return (
                  <div
                    key={po.id || idx}
                    className="bg-white/85 border border-zinc-200/90 rounded-2xl overflow-hidden shadow-2xs"
                  >
                    {/* Card Header: PO Identity & Overall Formula */}
                    <div className="p-3.5 sm:p-4 bg-gradient-to-r from-[#F4F7FA] to-white border-b border-zinc-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 bg-[#18222C] text-white font-mono text-[11px] font-bold rounded-md">
                            PO #{idx + 1}
                          </span>
                          <span className="font-mono font-extrabold text-sm text-[#19719C]">
                            {po.Artikel}
                          </span>
                          <span className="text-xs font-semibold text-[#1E2024]">
                            — {po['Item Description']}
                          </span>
                          <span className="px-2 py-0.5 bg-zinc-200/70 text-zinc-700 font-mono text-[10px] font-bold rounded-full">
                            {po.Substance}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-[#5C6068]">
                          <span>
                            No. PO: <strong className="text-[#1E2024]">{po['No PO']}</strong>
                          </span>
                          <span>
                            CO: <strong className="text-[#1E2024]">{po.CO}</strong> ({po.coStatus})
                          </span>
                          <span>
                            Tgl Input PO: <strong>{po['Tanggal Input PO']}</strong>
                          </span>
                          <span>
                            Frekuensi Kirim:{' '}
                            <strong className="text-[#19719C]">
                              {realSJs.length > 0 ? `${realSJs.length} Kali Kirim (SJ)` : 'Belum Kirim (0 SJ)'}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Formula Pill: QTY PO - Total Kiriman = Sisa OS Akhir */}
                      <div className="flex flex-wrap items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-zinc-200/80 font-mono text-xs shrink-0">
                        <div>
                          <span className="text-[10px] text-zinc-500 block">QTY PO</span>
                          <strong className="text-[#1E2024]">
                            {qtyPoPcs.toLocaleString('id-ID')} pcs
                          </strong>
                        </div>
                        <span className="text-zinc-400 font-bold">−</span>
                        <div>
                          <span className="text-[10px] text-emerald-700 block">
                            Total Kirim ({realSJs.length} SJ)
                          </span>
                          <strong className="text-emerald-700">
                            {terkirimPcs.toLocaleString('id-ID')} pcs
                          </strong>
                        </div>
                        <span className="text-zinc-400 font-bold">=</span>
                        <div className="px-2.5 py-0.5 rounded-lg bg-orange-500/10 border border-orange-500/25">
                          <span className="text-[10px] text-[#EA5413] block font-bold">
                            Sisa OS Akhir
                          </span>
                          <strong className="text-[#EA5413] text-sm">
                            {sisaPcs.toLocaleString('id-ID')} pcs ({sisaKg.toLocaleString('id-ID')}{' '}
                            kg)
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Card Body: Detailed SJ Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono border-collapse">
                        <thead className="bg-zinc-100/90 text-zinc-600 text-[11px] border-b border-zinc-200/80">
                          <tr>
                            <th className="py-2 px-3">Tahap Kiriman</th>
                            <th className="py-2 px-3">No. Surat Jalan (SJ)</th>
                            <th className="py-2 px-3">Tanggal Kirim (SJ)</th>
                            <th className="py-2 px-3 text-right">QTY Kirim (pcs)</th>
                            <th className="py-2 px-3 text-right">Berat Kirim (KG)</th>
                            <th className="py-2 px-3 text-right">Akumulasi Terkirim (pcs)</th>
                            <th className="py-2 px-3 text-right">Sisa OS Berjalan (pcs)</th>
                            <th className="py-2 px-3 text-right">Sisa OS Berjalan (KG)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200/60">
                          {realSJs.length === 0 ? (
                            <tr className="bg-amber-50/40">
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 bg-amber-500/15 text-amber-800 rounded-full text-[10px] font-bold">
                                  Belum Kirim
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-zinc-400">-</td>
                              <td className="py-2.5 px-3 text-zinc-400">-</td>
                              <td className="py-2.5 px-3 text-right text-zinc-500">0</td>
                              <td className="py-2.5 px-3 text-right text-zinc-500">0</td>
                              <td className="py-2.5 px-3 text-right text-zinc-500">0</td>
                              <td className="py-2.5 px-3 text-right font-extrabold text-[#EA5413]">
                                {sisaPcs.toLocaleString('id-ID')}
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold text-[#EA5413]">
                                {sisaKg.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          ) : (
                            realSJs.map((sj, sjIdx) => (
                              <tr key={`${po.id}_sj_${sjIdx}`} className="hover:bg-sky-50/40">
                                <td className="py-2.5 px-3 font-semibold text-[#19719C]">
                                  Kiriman Ke-{sjIdx + 1} (dari {realSJs.length})
                                </td>
                                <td className="py-2.5 px-3 font-extrabold text-[#1E2024]">
                                  {sj.noSJ}
                                </td>
                                <td className="py-2.5 px-3 text-zinc-700">{sj.tanggalKirim}</td>
                                <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700">
                                  {sj.qtyKirimPcs.toLocaleString('id-ID')}
                                </td>
                                <td className="py-2.5 px-3 text-right text-emerald-800">
                                  {sj.beratKirimKg.toLocaleString('id-ID')}
                                </td>
                                <td className="py-2.5 px-3 text-right font-semibold text-zinc-700">
                                  {sj.akumulasiKirimPcs.toLocaleString('id-ID')}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-amber-900">
                                  {sj.sisaOsBerjalanPcs.toLocaleString('id-ID')}
                                </td>
                                <td className="py-2.5 px-3 text-right text-amber-800">
                                  {sj.sisaOsBerjalanKg.toLocaleString('id-ID')}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot className="bg-zinc-100/95 border-t border-zinc-300/80 font-bold text-xs">
                          <tr>
                            <td colSpan={3} className="py-2 px-3 text-[#1E2024]">
                              REKAP AKHIR PO {po['No PO']} (QTY PO:{' '}
                              {qtyPoPcs.toLocaleString('id-ID')} PCS /{' '}
                              {beratPoKg.toLocaleString('id-ID')} KG)
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-700">
                              {terkirimPcs.toLocaleString('id-ID')} PCS
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-800">
                              {terkirimKg.toLocaleString('id-ID')} KG
                            </td>
                            <td className="py-2 px-3 text-right text-zinc-600">
                              Sisa OS Keseluruhan:
                            </td>
                            <td className="py-2 px-3 text-right font-extrabold text-[#EA5413]">
                              {sisaPcs.toLocaleString('id-ID')} PCS
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-[#EA5413]">
                              {sisaKg.toLocaleString('id-ID')} KG
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* =============================================================== */}
        {/* VIEW 3: HORIZONTAL MATRIX (1 BARIS = 1 PO, KOLOM SJ 1..N)       */}
        {/* =============================================================== */}
        {layoutMode === 'HORIZONTAL_MATRIX' && (
          <div
            className={
              isFullscreen
                ? 'flex-1 min-h-0 overflow-x-auto overflow-y-auto relative bg-white/40'
                : scrollMode === 'page'
                ? 'overflow-x-auto relative'
                : 'overflow-x-auto overflow-y-auto max-h-[72vh] relative'
            }
          >
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse font-mono">
              <thead
                className={`${
                  isStickyHeader ? 'sticky top-0 z-20 shadow-xs' : 'relative z-10'
                } bg-[#18222C] text-white text-[11px] font-semibold`}
              >
                <tr>
                  <th className="py-3 px-3 border-r border-white/10">#</th>
                  <th className="py-3 px-3 border-r border-white/10">CO</th>
                  <th className="py-3 px-3 border-r border-white/10">Artikel</th>
                  <th className="py-3 px-3 border-r border-white/10">Item Description</th>
                  <th className="py-3 px-3 border-r border-white/10">Tgl Input PO</th>
                  <th className="py-3 px-3 border-r border-white/10">No PO</th>
                  <th className="py-3 px-3 text-right border-r border-white/10">QTY PO (pcs)</th>
                  <th className="py-3 px-3 text-center border-r border-white/10">Frekuensi SJ</th>
                  {Array.from({ length: maxHorizontalSJ }).map((_, idx) => (
                    <React.Fragment key={`h_head_${idx}`}>
                      <th className="py-3 px-3 bg-[#134E6F] border-r border-white/15 text-sky-100">
                        SJ #{idx + 1} (No SJ)
                      </th>
                      <th className="py-3 px-3 bg-[#134E6F] border-r border-white/15 text-sky-100">
                        SJ #{idx + 1} (Tgl)
                      </th>
                      <th className="py-3 px-3 bg-[#134E6F] text-right border-r border-white/25 text-emerald-200">
                        SJ #{idx + 1} (Qty)
                      </th>
                    </React.Fragment>
                  ))}
                  <th className="py-3 px-3 text-right border-r border-white/10 text-emerald-300">
                    Total Terkirim (pcs)
                  </th>
                  <th className="py-3 px-3 text-right border-r border-white/10 text-amber-300">
                    Sisa OS Akhir (pcs)
                  </th>
                  <th className="py-3 px-3 text-right">Sisa OS Akhir (KG)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/70">
                {filteredPOs.map((po, idx) => {
                  const realSJs = (po.deliveries || []).filter(
                    (d) => !d.isFallbackNoDelivery && d.noSJ !== '-'
                  );
                  return (
                    <tr key={po.id || idx} className="bg-white/80 hover:bg-sky-50/50">
                      <td className="py-2.5 px-3 border-r border-zinc-200/60 text-zinc-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 border-r border-zinc-200/60 font-bold">
                        {po.CO}
                      </td>
                      <td className="py-2.5 px-3 border-r border-zinc-200/60 font-bold text-[#19719C]">
                        {po.Artikel}
                      </td>
                      <td className="py-2.5 px-3 border-r border-zinc-200/60 font-sans">
                        {po['Item Description']}
                      </td>
                      <td className="py-2.5 px-3 border-r border-zinc-200/60">
                        {po['Tanggal Input PO']}
                      </td>
                      <td className="py-2.5 px-3 border-r border-zinc-200/60 font-bold">
                        {po['No PO']}
                      </td>
                      <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 font-bold">
                        {(po['QTY PO (pcs)'] || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-center border-r border-zinc-200/60">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            realSJs.length === 0
                              ? 'bg-amber-500/15 text-amber-800'
                              : 'bg-[#19719C]/15 text-[#19719C]'
                          }`}
                        >
                          {realSJs.length}x SJ
                        </span>
                      </td>
                      {Array.from({ length: maxHorizontalSJ }).map((_, sIdx) => {
                        const sj = realSJs[sIdx];
                        return (
                          <React.Fragment key={`h_cell_${po.id}_${sIdx}`}>
                            <td className="py-2.5 px-3 border-r border-zinc-200/60 bg-sky-50/30 font-bold text-[#19719C]">
                              {sj ? sj.noSJ : '-'}
                            </td>
                            <td className="py-2.5 px-3 border-r border-zinc-200/60 bg-sky-50/30 text-zinc-600">
                              {sj ? sj.tanggalKirim : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right border-r border-zinc-300/80 bg-emerald-50/30 font-bold text-emerald-700">
                              {sj ? sj.qtyKirimPcs.toLocaleString('id-ID') : '0'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 font-bold text-emerald-700">
                        {(po['Terkirim (PCS)'] || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right border-r border-zinc-200/60 font-extrabold text-[#EA5413]">
                        {(po['Sisa OS (pcs)'] || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[#EA5413]">
                        {(po['Sisa OS (kg)'] || 0).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
