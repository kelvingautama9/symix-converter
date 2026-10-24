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
import { useLanguage } from '../i18n/LanguageContext';

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
  const { t } = useLanguage();
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
    <div className="space-y-3 sm:space-y-4">
      {/* ================================================================= */}
      {/* 1. SUMMARY CARDS FOR DETAIL KIRIMAN (SURAT JALAN)                 */}
      {/* ================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {/* Card 1: Total PO & Item */}
        <div className="glass-card rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[108px]">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate">
            {t.statTotalPoItem}
          </span>
          <div className="mt-1.5 sm:mt-2">
            <div className="flex items-baseline gap-1 text-slate-900 flex-wrap">
              <span
                className="text-lg sm:text-xl lg:text-2xl font-bold font-mono tracking-tight leading-none"
                title={t.statTotalPoItem}
              >
                {safeSummary.totalUniquePONumbers.toLocaleString('id-ID')}
              </span>
              <span className="text-[11px] font-semibold font-mono text-[#19719C]">{t.unitPoShort}</span>
              <span className="text-slate-300 mx-0.5 text-xs">/</span>
              <span
                className="text-xs sm:text-sm font-semibold font-mono text-slate-600 truncate"
                title={t.unitItem}
              >
                {safeSummary.totalPOs.toLocaleString('id-ID')} {t.unitItem}
              </span>
            </div>
            <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500">
              <span className="truncate">
                {safeSummary.totalUniqueItems} {t.unitArt}
                {safeSummary.totalMultiItemPONumbers > 0
                  ? ` · ${safeSummary.totalMultiItemPONumbers} ${t.unitMulti}`
                  : ''}
              </span>
              <span className="text-emerald-700 font-semibold shrink-0">
                {safeSummary.totalCOOpen} {t.statusOpenShort}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Surat Jalan */}
        <div className="glass-panel-accent rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[108px]">
          <span className="text-[10px] sm:text-[11px] font-semibold text-[#19719C] truncate">
            {t.statSuratJalan}
          </span>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold font-mono text-[#19719C] tracking-tight leading-none flex items-baseline gap-1">
              <span>{safeSummary.totalDeliveriesCount.toLocaleString('id-ID')}</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-500">{t.unitSJ}</span>
            </div>
            <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-sky-200/60 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-slate-600">
              <span className="truncate">{filterMetrics.multiSJ} {t.multiSjLabel}</span>
              <span className="text-amber-700 font-semibold shrink-0">
                {filterMetrics.fallbackNoSJ} {t.notYetSentShort}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Total Order */}
        <div className="glass-card rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[108px]">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate">
            {t.statTotalOrder}
          </span>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold font-mono text-slate-900 tracking-tight leading-none flex items-baseline gap-1">
              <span>{safeSummary.totalQtyOrderPcs.toLocaleString('id-ID')}</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-500">{t.unitPcs}</span>
            </div>
            <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500">
              <span className="truncate">{safeSummary.totalBeratOrderKg.toLocaleString('id-ID')} {t.unitKg}</span>
              <span className="text-slate-400 shrink-0">{t.poQuota}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Terkirim */}
        <div className="glass-card rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[108px]">
          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate">
            {t.statTerkirim}
          </span>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold font-mono text-emerald-700 tracking-tight leading-none flex items-baseline gap-1">
              <span>{safeSummary.totalTerkirimPcs.toLocaleString('id-ID')}</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-500">{t.unitPcs}</span>
            </div>
            <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-slate-500">
              <span className="truncate">{safeSummary.totalTerkirimKg.toLocaleString('id-ID')} {t.unitKg}</span>
              <span className="text-emerald-700 font-semibold shrink-0">{deliveryPercentage}%</span>
            </div>
          </div>
        </div>

        {/* Card 5: Sisa OS */}
        <div className="glass-panel-warm rounded-xl p-2.5 sm:p-3.5 flex flex-col justify-between min-h-[96px] sm:min-h-[108px]">
          <span className="text-[10px] sm:text-[11px] font-semibold text-[#EA5413] truncate">
            {t.statSisaOS}
          </span>
          <div className="mt-1.5 sm:mt-2">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold font-mono text-[#EA5413] tracking-tight leading-none flex items-baseline gap-1">
              <span>{safeSummary.totalSisaOSPcs.toLocaleString('id-ID')}</span>
              <span className="text-[10px] sm:text-xs font-normal text-[#EA5413]/75">{t.unitPcs}</span>
            </div>
            <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-orange-200/60 flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-mono text-[#EA5413]">
              <span className="font-medium truncate">{safeSummary.totalSisaOSKg.toLocaleString('id-ID')} {t.unitKg}</span>
              <span className="font-semibold shrink-0">{100 - deliveryPercentage}% OS</span>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 2. ACTION TOOLBAR KHUSUS DETAIL KIRIMAN SJ                        */}
      {/* ================================================================= */}
      <div
        className={`relative flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 p-2.5 sm:p-3 glass-panel rounded-xl ${
          isExportMenuOpen || isCopyMenuOpen ? 'z-40' : 'z-20'
        }`}
      >
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Split Button Export Excel Detail SJ */}
          <div
            className={`relative col-span-2 sm:col-span-1 inline-flex w-full sm:w-auto ${
              isExportMenuOpen ? 'z-50' : ''
            }`}
            ref={exportDropdownRef}
          >
            <div className="w-full inline-flex items-stretch rounded-lg bg-[#19719C] hover:bg-[#155E82] text-white overflow-hidden transition-colors">
              <button
                type="button"
                id="btn-download-detail-sj-excel"
                onClick={() => triggerExport('ALL')}
                className="flex-1 sm:flex-initial px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-black/10 transition-colors"
                title={t.exportExcelBtn}
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>{t.exportExcelBtn}</span>
              </button>

              <div className="w-px self-stretch bg-white/20 my-1.5" />

              <button
                type="button"
                id="btn-toggle-detail-sj-export-menu"
                onClick={() => {
                  haptic.selection();
                  setIsExportMenuOpen(!isExportMenuOpen);
                }}
                className="px-2 py-1.5 sm:py-2 inline-flex items-center justify-center cursor-pointer hover:bg-black/10 transition-colors shrink-0"
                title={t.exportScopeHeader}
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isExportMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {isExportMenuOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-80 max-w-[92vw] bg-white rounded-xl z-50 p-1.5 font-sans shadow-lg border border-slate-200">
                <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-100">
                  {t.exportExcelBtn}
                </div>

                <div className="py-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => triggerExport('ALL')}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>{t.scopeAllData}</span>
                    <span className="text-[11px] font-mono font-semibold text-slate-500">
                      {filterMetrics.allPOs}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('OPEN_ONLY')}
                    disabled={filterMetrics.openPOs === 0}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <span>{t.scopeCoOpen}</span>
                    <span className="text-[11px] font-mono font-semibold text-emerald-700">
                      {filterMetrics.openPOs}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('CLOSED_ONLY')}
                    disabled={filterMetrics.closedPOs === 0}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <span>{t.scopeCoClosed}</span>
                    <span className="text-[11px] font-mono font-semibold text-slate-500">
                      {filterMetrics.closedPOs}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('WITH_DELIVERY_ONLY')}
                    disabled={filterMetrics.withSJ === 0}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <span>{t.filterHasSJ}</span>
                    <span className="text-[11px] font-mono font-semibold text-[#19719C]">
                      {filterMetrics.withSJ}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('MULTI_DELIVERY_ONLY')}
                    disabled={filterMetrics.multiSJ === 0}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <span>{t.filterMultiSJ}</span>
                    <span className="text-[11px] font-mono font-semibold text-indigo-700">
                      {filterMetrics.multiSJ}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('NO_DELIVERY_FALLBACK')}
                    disabled={filterMetrics.fallbackNoSJ === 0}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <span>{t.filterNoSJYet}</span>
                    <span className="text-[11px] font-mono font-semibold text-amber-700">
                      {filterMetrics.fallbackNoSJ}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerExport('HAS_SISA_OS')}
                    disabled={filterMetrics.hasSisaOS === 0}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <span>{t.filterHasOS}</span>
                    <span className="text-[11px] font-mono font-semibold text-[#EA5413]">
                      {filterMetrics.hasSisaOS}
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
            className="col-span-1 inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
            title={t.sendWaFileBtn}
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{t.sendWaFileBtn}</span>
          </button>

          {/* Copy Detail SJ Text Summary for WhatsApp */}
          <div
            className={`relative col-span-1 inline-flex w-full sm:w-auto ${
              isCopyMenuOpen ? 'z-50' : ''
            }`}
            ref={copyDropdownRef}
          >
            <div
              className={`w-full inline-flex items-stretch rounded-lg border ${
                isCopied
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              } overflow-hidden transition-colors`}
            >
              <button
                type="button"
                onClick={() => triggerCopyText('ALL')}
                className="flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-100/60"
                title={t.copyFormatHeader}
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-emerald-700 font-semibold">{t.copiedSuccess}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{t.copyTextBtn}</span>
                  </>
                )}
              </button>

              <div className="w-px self-stretch bg-slate-200 my-1.5" />

              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setIsCopyMenuOpen(!isCopyMenuOpen);
                }}
                className="px-2 py-1.5 sm:py-2 inline-flex items-center justify-center cursor-pointer text-slate-500 hover:text-slate-900 shrink-0"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    isCopyMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {isCopyMenuOpen && (
              <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 w-64 max-w-[90vw] bg-white rounded-xl z-50 p-1.5 font-sans shadow-lg border border-slate-200">
                <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 border-b border-slate-100">
                  {t.copyFormatHeader}
                </div>
                <div className="py-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => triggerCopyText('ALL')}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between cursor-pointer"
                  >
                    <span>{t.scopeAllData}</span>
                    <span className="text-[11px] font-mono font-semibold text-slate-500">
                      {filterMetrics.allPOs}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCopyText('OPEN_ONLY')}
                    disabled={filterMetrics.openPOs === 0}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                  >
                    <span>{t.scopeCoOpen}</span>
                    <span className="text-[11px] font-mono font-semibold text-emerald-700">
                      {filterMetrics.openPOs}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCopyText('WITH_DELIVERY_ONLY')}
                    disabled={filterMetrics.withSJ === 0}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                  >
                    <span>{t.filterHasSJ}</span>
                    <span className="text-[11px] font-mono font-semibold text-[#19719C]">
                      {filterMetrics.withSJ}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCopyText('HAS_SISA_OS')}
                    disabled={filterMetrics.hasSisaOS === 0}
                    className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-between disabled:opacity-40 cursor-pointer"
                  >
                    <span>{t.filterHasOS}</span>
                    <span className="text-[11px] font-mono font-semibold text-[#EA5413]">
                      {filterMetrics.hasSisaOS}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Sheet Selector */}
        {sheets && sheets.length > 1 && onSelectSheet && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono">
              <span className="text-slate-500 font-semibold text-[11px]">{t.sheetLabel}:</span>
              <select
                value={activeSheet}
                onChange={(e) => {
                  haptic.selection();
                  onSelectSheet(e.target.value);
                }}
                className="bg-transparent text-slate-900 font-semibold focus:outline-none cursor-pointer text-xs"
              >
                {sheets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* 3. MAIN DETAIL KIRIMAN SJ TABLE CONTAINER                         */}
      {/* ================================================================= */}
      <div
        id="detail-sj-table-container"
        className={
          isFullscreen
            ? 'fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col p-3 sm:p-4 overflow-hidden'
            : 'glass-panel rounded-xl overflow-hidden relative z-10'
        }
      >
        {/* Fullscreen Top Header */}
        {isFullscreen && (
          <div className="bg-white border border-slate-200 p-2.5 sm:p-3 rounded-xl flex items-center justify-between gap-3 mb-2.5 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                {t.modeDetailSJ}
              </h2>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-mono font-semibold rounded-md">
                {filteredTotals.totalPOs} {t.unitItem} · {filteredTotals.totalActiveSJs} {t.unitSJ}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                haptic.medium();
                setIsFullscreen(false);
              }}
              className="liquid-glass-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer shrink-0"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>{t.exitBtn}</span>
            </button>
          </div>
        )}

        {/* Controls Header */}
        <div className="p-3 sm:p-3.5 border-b border-slate-200 bg-white flex flex-col gap-2.5 shrink-0">
          {/* Row 1: Search Bar & Layout View Switcher */}
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5">
            {/* Left Zone: Search Input & Main View Selector (Tabel SJ / Per No PO / Grup PO / Matriks SJ) */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 flex-1 min-w-0">
              {/* Search Input */}
              <div className="relative w-full sm:w-64 md:w-72 xl:w-80 shrink-0">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#19719C] min-h-[34px] transition-colors"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* View Format Selector - Anchored stably on the left, zero position jumping */}
              <div className="glass-segmented inline-flex items-center shrink-0 max-w-full overflow-x-auto no-scrollbar py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setLayoutMode('DATA_ENTRY_TABLE');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    layoutMode === 'DATA_ENTRY_TABLE'
                      ? 'bg-[#19719C] text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={t.viewTableSJ}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span>{t.viewTableSJ} ({filteredTotals.totalPOs})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setLayoutMode('UNIQUE_PO_SUMMARY');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    layoutMode === 'UNIQUE_PO_SUMMARY'
                      ? 'bg-[#EA5413] text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={t.viewPerNoPO}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{t.viewPerNoPO} ({filteredTotals.uniquePONumbers})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setLayoutMode('PO_GROUP_CARDS');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    layoutMode === 'PO_GROUP_CARDS'
                      ? 'bg-[#19719C] text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={t.viewGroupPO}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span>{t.viewGroupPO}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setLayoutMode('HORIZONTAL_MATRIX');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    layoutMode === 'HORIZONTAL_MATRIX'
                      ? 'bg-[#19719C] text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title={t.viewMatrixSJ}
                >
                  <Columns3 className="w-3.5 h-3.5" />
                  <span>{t.viewMatrixSJ}</span>
                </button>
              </div>
            </div>

            {/* Right Zone: Table Controls & Actions (Sub-total, Akurat SUM, Scroll Mode, Fullscreen) */}
            <div className="flex flex-wrap items-center justify-start xl:justify-end gap-1.5 sm:gap-2 shrink-0">
              {/* Sub-Total Toggle when in DATA_ENTRY_TABLE */}
              {layoutMode === 'DATA_ENTRY_TABLE' && (
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setShowSubTotalPerPO(!showSubTotalPerPO);
                  }}
                  className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    showSubTotalPerPO
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title={t.subTotalToggle}
                >
                  <CheckCircle2
                    className={`w-3.5 h-3.5 ${
                      showSubTotalPerPO ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  />
                  <span>{t.subTotalToggle}</span>
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
                  className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    repeatPOTotalsOnEveryRow
                      ? 'bg-sky-50 border-sky-300 text-[#19719C] font-semibold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title={repeatPOTotalsOnEveryRow ? t.flatFullToggle : t.accurateSumToggle}
                >
                  <span>{repeatPOTotalsOnEveryRow ? t.flatFullToggle : t.accurateSumToggle}</span>
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
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    scrollMode === 'page'
                      ? 'glass-segmented-active text-slate-900 font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Unlock className="w-3 h-3" />
                  <span>{t.scrollFree}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setScrollMode('box');
                  }}
                  className={`flex items-center gap-1 px-2 py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    scrollMode === 'box'
                      ? 'glass-segmented-active text-slate-900 font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>{t.scrollBox}</span>
                </button>
              </div>

              {/* Fullscreen Toggle */}
              <button
                type="button"
                onClick={() => {
                  haptic.medium();
                  setIsFullscreen(!isFullscreen);
                }}
                className="liquid-glass-clear inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs cursor-pointer whitespace-nowrap"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>{t.exitBtn}</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>{t.fullscreenBtn}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Row 2: Filter Toolbar (Status CO & Filter Kiriman SJ) */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs overflow-x-auto no-scrollbar py-0.5">
            {/* Status CO */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">
                CO:
              </span>
              <div className="glass-segmented inline-flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setCoFilter('ALL');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    coFilter === 'ALL'
                      ? 'glass-segmented-active text-slate-900 font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.filterAll} ({filterMetrics.allPOs})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setCoFilter('OPEN');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    coFilter === 'OPEN'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  {t.statusOpenShort} ({filterMetrics.openPOs})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setCoFilter('CLOSED');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    coFilter === 'CLOSED'
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.statusClosedShort} ({filterMetrics.closedPOs})
                </button>
              </div>
            </div>

            <div className="w-px h-3.5 bg-slate-200 shrink-0" />

            {/* Filter Rincian Kiriman SJ */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">
                {t.filterLabel}:
              </span>
              <div className="glass-segmented inline-flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('ALL');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'ALL'
                      ? 'glass-segmented-active text-slate-900 font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.filterAll} ({filterMetrics.scopedPOsCount})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('WITH_SJ');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'WITH_SJ'
                      ? 'bg-[#19719C] text-white font-semibold'
                      : 'text-slate-600 hover:text-[#19719C]'
                  }`}
                >
                  {t.filterHasSJ} ({filterMetrics.withSJ})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('MULTI_SJ');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'MULTI_SJ'
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-indigo-700'
                  }`}
                  title={t.filterMultiSJ}
                >
                  {t.filterMultiSJ} ({filterMetrics.multiSJ})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('FALLBACK_NO_SJ');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'FALLBACK_NO_SJ'
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-amber-700'
                  }`}
                  title={t.filterNoSJYet}
                >
                  {t.filterNoSJYet} ({filterMetrics.fallbackNoSJ})
                </button>

                {filterMetrics.multiItemPOLines > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setDeliveryFilter('MULTI_ITEM_PO');
                    }}
                    className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      deliveryFilter === 'MULTI_ITEM_PO'
                        ? 'bg-purple-700 text-white font-semibold'
                        : 'text-slate-600 hover:text-purple-700'
                    }`}
                    title={t.filterMultiItem}
                  >
                    {t.filterMultiItem} ({filterMetrics.multiItemUniquePOsCount} {t.unitPoShort})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('HAS_SISA_OS');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'HAS_SISA_OS'
                      ? 'bg-[#EA5413] text-white font-semibold'
                      : 'text-slate-600 hover:text-[#EA5413]'
                  }`}
                >
                  {t.filterHasOS} ({filterMetrics.hasSisaOS})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setDeliveryFilter('LUNAS_OS');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    deliveryFilter === 'LUNAS_OS'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  {t.filterLunas} ({filterMetrics.lunasOS})
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
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] sm:text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer shrink-0 ml-auto whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t.resetBtnShort}</span>
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
                ? 'flex-1 min-h-0 overflow-x-auto overflow-y-auto relative bg-white'
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
                  <th className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 border-r border-white/10`}>
                    #
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 border-r border-white/10`}>
                    {t.thNoCO}
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 border-r border-white/10`}>
                    {t.thArtikel}
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 border-r border-white/10`}>
                    {t.thDeskripsi}
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 border-r border-white/10`}>
                    {t.thTglPO}
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 border-r border-white/10`}>
                    {t.thNoPO}
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 border-r border-white/10`}>
                    {t.thSubstance}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right border-r border-white/10`}
                  >
                    {t.thQtyPO}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right border-r border-white/10`}
                  >
                    {t.thBeratPO}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-2.5 px-3 border-r border-white/15 text-sky-100`}
                  >
                    {t.thStage}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-2.5 px-3 border-r border-white/15 text-sky-100`}
                  >
                    {t.thNoSJ}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-2.5 px-3 border-r border-white/15 text-sky-100`}
                  >
                    {t.thTglSJ}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-2.5 px-3 text-center border-r border-white/15 text-sky-100`}
                    title={t.thLeadTime}
                  >
                    {t.thLeadTime}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-2.5 px-3 text-right border-r border-white/15 text-emerald-200`}
                  >
                    {t.thQtySJ}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-2.5 px-3 text-right border-r border-white/15 text-emerald-200`}
                  >
                    {t.thBeratSJ}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-2.5 px-3 text-right border-r border-white/15 text-amber-200`}
                  >
                    {t.thOsRunning}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#134E6F] py-2.5 px-3 text-right border-r border-white/15 text-amber-200`}
                  >
                    {t.thOsRunningKg}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right border-r border-white/10 text-emerald-300`}
                  >
                    {t.thTotalSent}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right border-r border-white/10 text-amber-300`}
                  >
                    {t.thSisaOS}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right border-r border-white/10 text-amber-300`}
                  >
                    {t.thSisaOSKg}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right border-r border-white/10 text-sky-200`}
                    title={t.thSentPct}
                  >
                    {t.thSentPct}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 border-r border-white/10 text-sky-200`}
                  >
                    {t.thDeliveryStatus}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 border-r border-white/10 text-slate-300`}
                  >
                    {t.thAging}
                  </th>
                  <th
                    className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right border-r border-white/10`}
                  >
                    {t.thStock}
                  </th>
                  <th className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right`}>
                    {t.thHarga}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 font-mono text-xs">
                {flattenedRows.length === 0 ? (
                  <tr>
                    <td colSpan={25} className="py-12 text-center text-slate-500 font-sans">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <AlertCircle className="w-5 h-5 text-slate-400" />
                        <p className="font-semibold text-sm text-slate-700">
                          {t.noMatchingRecords}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t.clickResetHint}
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
                              ? 'bg-amber-50/30 hover:bg-amber-50/60'
                              : row.isFirstRowOfPO
                              ? 'bg-white hover:bg-slate-50 border-t border-t-slate-300'
                              : 'bg-slate-50/40 hover:bg-slate-50'
                          }`}
                        >
                          {/* PO Index */}
                          <td className="py-2 px-3 border-r border-slate-200/70 font-semibold text-slate-400">
                            {row.isFirstRowOfPO ? row.poIndex : ''}
                          </td>

                          {/* 1. CO */}
                          <td className="py-2 px-3 border-r border-slate-200/70">
                            {showTopPOFields ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900">{row.CO}</span>
                                <span
                                  className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                                    row.coStatus === 'OPEN'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {row.coStatus}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px]">{row.CO}</span>
                            )}
                          </td>

                          {/* 2. Artikel */}
                          <td className="py-2 px-3 border-r border-slate-200/70 font-semibold text-[#19719C]">
                            {showTopPOFields ? (
                              row.Artikel
                            ) : (
                              <span className="text-slate-400 font-normal">{row.Artikel}</span>
                            )}
                          </td>

                          {/* 3. Item Description */}
                          <td className="py-2 px-3 border-r border-slate-200/70 font-sans text-slate-800">
                            {showTopPOFields ? (
                              row['Item Description']
                            ) : (
                              <span className="text-slate-400">{row['Item Description']}</span>
                            )}
                          </td>

                          {/* 4. Tanggal Input PO */}
                          <td className="py-2 px-3 border-r border-slate-200/70 text-slate-600">
                            {showTopPOFields ? (
                              row['Tanggal Input PO']
                            ) : (
                              <span className="text-slate-400">{row['Tanggal Input PO']}</span>
                            )}
                          </td>

                          {/* 5. No PO */}
                          <td className="py-2 px-3 border-r border-slate-200/70 font-semibold text-slate-900">
                            {showTopPOFields ? (
                              <div className="flex items-center gap-1.5">
                                <span>{row['No PO']}</span>
                                {(poLineCountMap.get(String(row['No PO'] || '').trim()) || 0) >
                                  1 && (
                                  <span
                                    className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold"
                                    title={`Nomor PO ${row['No PO']} memiliki ${poLineCountMap.get(String(row['No PO'] || '').trim())} Artikel`}
                                  >
                                    {poLineCountMap.get(String(row['No PO'] || '').trim())} Item
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 font-normal">{row['No PO']}</span>
                            )}
                          </td>

                          {/* 6. Substance */}
                          <td className="py-2 px-3 border-r border-slate-200/70 text-slate-600">
                            {showTopPOFields ? row.Substance : ''}
                          </td>

                          {/* 7. QTY PO (pcs) */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 font-bold text-slate-900">
                            {showTopPOFields
                              ? (Number(row['QTY PO (pcs)']) || 0).toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 8. Berat PO (KG) */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 text-slate-600">
                            {showTopPOFields
                              ? (Number(row['Berat PO (KG)']) || 0).toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 9. Urutan / Tahap Kiriman */}
                          <td className="py-2 px-3 border-r border-slate-200/70 bg-sky-50/30">
                            {row.isFallbackNoDelivery ? (
                              <span className="text-amber-700 font-semibold text-[11px]">
                                {t.notSentYetBadge}
                              </span>
                            ) : (
                              <span className="text-[#19719C] font-semibold text-[11px]">
                                {row.labelKiriman}
                              </span>
                            )}
                          </td>

                          {/* 10. No Surat Jalan (SJ) */}
                          <td className="py-2 px-3 border-r border-slate-200/70 bg-sky-50/30 font-bold text-slate-900">
                            {row.isFallbackNoDelivery ? (
                              <span className="text-slate-400">-</span>
                            ) : (
                              <span className="text-[#19719C]">{row['No Surat Jalan (SJ)']}</span>
                            )}
                          </td>

                          {/* 11. Tanggal Kirim (SJ) */}
                          <td className="py-2 px-3 border-r border-slate-200/70 bg-sky-50/30 text-slate-700">
                            {row['Tanggal Kirim (SJ)']}
                          </td>

                          {/* 11B. Lead Time SJ (Hari) */}
                          <td className="py-2 px-3 text-center border-r border-slate-200/70 bg-sky-50/30 text-slate-600 text-[11px]">
                            {row['Lead Time SJ (Hari)'] !== null
                              ? `${row['Lead Time SJ (Hari)']}h`
                              : '-'}
                          </td>

                          {/* 12. QTY Kirim SJ (pcs) */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 bg-emerald-50/25 font-bold text-emerald-700">
                            {row.isFallbackNoDelivery
                              ? '0'
                              : (Number(row['QTY Kirim SJ (pcs)']) || 0).toLocaleString('id-ID')}
                          </td>

                          {/* 13. Berat Kirim SJ (KG) */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 bg-emerald-50/25 text-emerald-800">
                            {row.isFallbackNoDelivery
                              ? '0'
                              : (Number(row['Berat Kirim SJ (KG)']) || 0).toLocaleString('id-ID')}
                          </td>

                          {/* 14. Sisa OS Berjalan (pcs) */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 bg-amber-50/25 font-bold text-amber-900">
                            {(Number(row['Sisa OS Berjalan (pcs)']) || 0).toLocaleString('id-ID')}
                          </td>

                          {/* 15. Sisa OS Berjalan (KG) */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 bg-amber-50/25 text-amber-800">
                            {(Number(row['Sisa OS Berjalan (KG)']) || 0).toLocaleString('id-ID')}
                          </td>

                          {/* 16. Total Terkirim PO (pcs) */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 font-bold text-emerald-800">
                            {showBottomPOFields
                              ? (Number(row['Total Terkirim PO (pcs)']) || 0).toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 17. Sisa OS Akhir PO (pcs) */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 font-bold text-[#EA5413]">
                            {showBottomPOFields
                              ? (Number(row['Sisa OS Akhir PO (pcs)']) || 0).toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 18. Sisa OS Akhir PO (KG) */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 font-semibold text-[#EA5413]/90">
                            {showBottomPOFields
                              ? (Number(row['Sisa OS Akhir PO (KG)']) || 0).toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 18B. % Pemenuhan PO */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 font-semibold text-[#19719C]">
                            {showBottomPOFields
                              ? `${((Number(row['% Pemenuhan PO']) || 0) * 100).toFixed(1)}%`
                              : ''}
                          </td>

                          {/* 18C. Status Pengiriman */}
                          <td className="py-2 px-3 border-r border-slate-200/70 text-[10px]">
                            {showBottomPOFields ? (
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded font-semibold ${
                                  row['Status Pengiriman'] === 'COMPLETED / LUNAS'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : row['Status Pengiriman'] === 'PARTIAL / CICIL'
                                    ? 'bg-sky-50 text-[#19719C] border border-sky-200'
                                    : row['Status Pengiriman'] === 'OVER DELIVERY'
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {row['Status Pengiriman']}
                              </span>
                            ) : (
                              ''
                            )}
                          </td>

                          {/* 18D. Umur PO / Aging */}
                          <td className="py-2 px-3 border-r border-slate-200/70 text-[10px] text-slate-600">
                            {showBottomPOFields ? (
                              <div className="flex items-center gap-1">
                                {row['Umur PO / Aging (Hari)'] !== null && (
                                  <span className="font-semibold text-slate-800">
                                    {row['Umur PO / Aging (Hari)']}h
                                  </span>
                                )}
                                <span
                                  className={
                                    row['Kategori Aging OS'].includes('KRITIS')
                                      ? 'text-rose-700 font-semibold'
                                      : row['Kategori Aging OS'].includes('FOLLOW UP')
                                      ? 'text-amber-700 font-semibold'
                                      : row['Kategori Aging OS'].includes('LUNAS')
                                      ? 'text-emerald-700'
                                      : 'text-slate-500'
                                  }
                                >
                                  ({row['Kategori Aging OS']})
                                </span>
                              </div>
                            ) : (
                              ''
                            )}
                          </td>

                          {/* 19. Stock Gudang (pcs) */}
                          <td className="py-2 px-3 text-right border-r border-slate-200/70 font-semibold text-slate-700">
                            {showBottomPOFields
                              ? (Number(row['Stock (pcs)']) || 0).toLocaleString('id-ID')
                              : ''}
                          </td>

                          {/* 20. Harga */}
                          <td className="py-2 px-3 text-right text-slate-600">
                            {showTopPOFields
                              ? Number(row.Harga) > 0
                                ? Number(row.Harga).toLocaleString('id-ID')
                                : '-'
                              : ''}
                          </td>
                        </tr>

                        {/* Optional Inline Sub-Total & Sisa OS Akhir Row after each PO */}
                        {showSubTotalPerPO && row.isLastRowOfPO && (
                          <tr className="bg-slate-100/90 border-b border-b-slate-300 text-[11px] font-mono">
                            <td colSpan={7} className="py-1.5 px-3 font-semibold text-slate-700">
                              <div className="flex items-center gap-2">
                                <span>{t.subTotalPoLabel} {row['No PO']}</span>
                                <span className="text-slate-500">({row.Artikel})</span>
                                <span className="text-slate-400">·</span>
                                <span className="text-[#19719C]">
                                  {row.isFallbackNoDelivery
                                    ? t.notSentYetBadge
                                    : `${row.frekuensiKirim}x ${t.unitSJ}`}
                                </span>
                              </div>
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-slate-900 border-r border-slate-300/60">
                              {(Number(row['QTY PO (pcs)']) || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-3 text-right text-slate-600 border-r border-slate-300/60">
                              {(Number(row['Berat PO (KG)']) || 0).toLocaleString('id-ID')}
                            </td>
                            <td
                              colSpan={3}
                              className="py-1.5 px-3 text-right font-semibold text-emerald-800 border-r border-slate-300/60"
                            >
                              {t.totalSentLabel} ({row.frekuensiKirim} {t.unitSJ}):
                            </td>
                            <td className="py-1.5 px-3 text-center text-slate-600 border-r border-slate-300/60">
                              {row['Rata-rata Lead Time PO (Hari)'] !== null
                                ? `${row['Rata-rata Lead Time PO (Hari)']}h`
                                : '-'}
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-emerald-700 border-r border-slate-300/60">
                              {(Number(row['Total Terkirim PO (pcs)']) || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-3 text-right text-emerald-800 border-r border-slate-300/60">
                              {(Number(row['Total Terkirim PO (KG)']) || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-[#EA5413] border-r border-slate-300/60">
                              {(Number(row['Sisa OS Akhir PO (pcs)']) || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-3 text-right text-[#EA5413] border-r border-slate-300/60">
                              {(Number(row['Sisa OS Akhir PO (KG)']) || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-emerald-800 border-r border-slate-300/60">
                              {(Number(row['Total Terkirim PO (pcs)']) || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-[#EA5413] border-r border-slate-300/60">
                              {(Number(row['Sisa OS Akhir PO (pcs)']) || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-3 text-right text-[#EA5413] border-r border-slate-300/60">
                              {(Number(row['Sisa OS Akhir PO (KG)']) || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold text-[#19719C] border-r border-slate-300/60">
                              {`${((Number(row['% Pemenuhan PO']) || 0) * 100).toFixed(1)}%`}
                            </td>
                            <td className="py-1.5 px-3 text-[10px] font-semibold text-slate-700 border-r border-slate-300/60">
                              {row['Status Pengiriman']}
                            </td>
                            <td className="py-1.5 px-3 text-[10px] text-slate-600 border-r border-slate-300/60">
                              {row['Umur PO / Aging (Hari)'] !== null
                                ? `${row['Umur PO / Aging (Hari)']}h (${row['Kategori Aging OS']})`
                                : row['Kategori Aging OS']}
                            </td>
                            <td className="py-1.5 px-3 text-right font-semibold text-slate-800 border-r border-slate-300/60">
                              {(Number(row['Stock (pcs)']) || 0).toLocaleString('id-ID')}
                            </td>
                            <td className="py-1.5 px-3 text-right text-slate-600">
                              {Number(row.Harga) > 0 ? Number(row.Harga).toLocaleString('id-ID') : '-'}
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
                    <td colSpan={7} className="py-3 px-3 border-r border-white/15">
                      TOTAL ({filteredTotals.uniquePONumbers} {t.unitPoShort} · {filteredTotals.totalPOs} {t.unitItem} ·{' '}
                      {filteredTotals.totalActiveSJs} {t.unitSJ})
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-white">
                      {filteredTotals.totalOrderPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-slate-300">
                      {filteredTotals.totalOrderKg.toLocaleString('id-ID')}
                    </td>
                    <td colSpan={4} className="py-3 px-3 text-right border-r border-white/15 text-sky-200">
                      {t.totalSentLabel}:
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-emerald-300">
                      {filteredTotals.totalTerkirimPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-emerald-300">
                      {filteredTotals.totalTerkirimKg.toLocaleString('id-ID')}
                    </td>
                    <td colSpan={2} className="py-3 px-3 text-right border-r border-white/15 text-amber-200">
                      {t.finalTotalLabel}:
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-emerald-300">
                      {filteredTotals.totalTerkirimPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-amber-300">
                      {filteredTotals.totalSisaOSPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-amber-300">
                      {filteredTotals.totalSisaOSKg.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-sky-200">
                      {filteredTotals.totalOrderPcs > 0
                        ? `${((filteredTotals.totalTerkirimPcs / filteredTotals.totalOrderPcs) * 100).toFixed(1)}%`
                        : '0%'}
                    </td>
                    <td colSpan={2} className="py-3 px-3 border-r border-white/15 text-slate-300 text-[11px]">
                      {filteredTotals.totalSisaOSPcs <= 0 ? 'COMPLETED / LUNAS' : 'PARTIAL / CICIL'}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-sky-200">
                      {filteredTotals.totalStockPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right">-</td>
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
                ? 'flex-1 min-h-0 overflow-auto bg-white'
                : scrollMode === 'page'
                ? 'overflow-x-auto'
                : 'overflow-x-auto max-h-[72vh] overflow-y-auto'
            }
          >
            <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-700 font-medium">
                {t.consolidatedBannerText1} <strong>{consolidatedUniquePOs.length} {t.thNoPO}</strong> {t.consolidatedBannerText2}{' '}
                <strong>{filteredTotals.totalPOs} {t.unitItem}</strong>.
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {t.availableInSheet2}
              </span>
            </div>

            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-[#18222C] text-white text-[11px] font-mono tracking-wider">
                  <th className="py-2.5 px-3 text-center border-r border-white/10 w-12">#</th>
                  <th className="py-2.5 px-3 border-r border-white/10 min-w-[160px]">{t.thNoPO}</th>
                  <th className="py-2.5 px-2.5 text-center border-r border-white/10 min-w-[85px]">{t.unitItem}</th>
                  <th className="py-2.5 px-3 border-r border-white/10 min-w-[230px]">{t.thArtikel}</th>
                  <th className="py-2.5 px-3 border-r border-white/10 min-w-[140px]">{t.thNoCO}</th>
                  <th className="py-2.5 px-3 text-right border-r border-white/10 min-w-[105px]">{t.thQtyPO}</th>
                  <th className="py-2.5 px-3 text-right border-r border-white/10 min-w-[95px]">{t.thBeratPO}</th>
                  <th className="py-2.5 px-2.5 text-center border-r border-white/10 min-w-[80px]">{t.unitSJ}</th>
                  <th className="py-2.5 px-3 text-right border-r border-white/10 bg-[#0D4A3E] min-w-[110px]">{t.statTerkirim}</th>
                  <th className="py-2.5 px-3 text-right border-r border-white/10 bg-[#8F340B] min-w-[110px]">{t.thSisaOS}</th>
                  <th className="py-2.5 px-3 text-right border-r border-white/10 bg-[#8F340B] min-w-[95px]">{t.thSisaOSKg}</th>
                  <th className="py-2.5 px-3 min-w-[240px]">{t.thSjDetails}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs font-mono">
                {consolidatedUniquePOs.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-500 font-sans">
                      {t.noMatchingRecords}
                    </td>
                  </tr>
                ) : (
                  consolidatedUniquePOs.map((upo, idx) => {
                    const itemCount = upo.items?.length || 1;
                    const isMulti = itemCount > 1;
                    return (
                      <tr
                        key={`${upo.noPO}_${idx}`}
                        className={`${
                          isMulti
                            ? 'bg-indigo-50/30 hover:bg-indigo-50/60'
                            : 'bg-white hover:bg-slate-50'
                        } transition-colors`}
                      >
                        <td className="py-2 px-3 text-center font-semibold text-slate-400 border-r border-slate-200/70">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200/70">
                          {upo.noPO}
                        </td>
                        <td className="py-2 px-2.5 text-center border-r border-slate-200/70">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              isMulti
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {itemCount} Item
                          </span>
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200/70 font-sans text-[11px] text-slate-900">
                          <div className="flex flex-col gap-1">
                            {(upo.items || []).map((it, iIdx) => (
                              <div
                                key={iIdx}
                                className="flex items-center justify-between gap-2 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/70"
                              >
                                <span className="font-mono font-semibold text-[#19719C] truncate">
                                  {it.Artikel}
                                </span>
                                <span className="font-mono text-[10px] text-slate-600 shrink-0">
                                  PO: {(Number(it['QTY PO (pcs)']) || 0).toLocaleString('id-ID')} · OS:{' '}
                                  <strong className="text-[#EA5413]">
                                    {(Number(it['Sisa OS (pcs)']) || 0).toLocaleString('id-ID')}
                                  </strong>
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200/70 text-slate-700 text-[11px]">
                          {(upo.coList || []).join(', ') || '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900 border-r border-slate-200/70">
                          {(Number(upo.totalQtyPoPcs) || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600 border-r border-slate-200/70">
                          {(Math.round((Number(upo.totalBeratPoKg) || 0) * 100) / 100).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2 px-2.5 text-center border-r border-slate-200/70">
                          {(upo.totalSJCount || 0) > 0 ? (
                            <span className="text-emerald-700 font-semibold text-[11px]">
                              {upo.totalSJCount}x {t.unitSJ}
                            </span>
                          ) : (
                            <span className="text-amber-700 font-semibold text-[11px]">
                              {t.notSentYetBadge}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700 bg-emerald-50/20 border-r border-slate-200/70">
                          {(Number(upo.totalTerkirimPcs) || 0) > 0
                            ? (Number(upo.totalTerkirimPcs) || 0).toLocaleString('id-ID')
                            : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-[#EA5413] bg-orange-50/20 border-r border-slate-200/70">
                          {(Number(upo.totalSisaOSPcs) || 0).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-[#EA5413]/90 border-r border-slate-200/70">
                          {(Math.round((Number(upo.totalSisaOSKg) || 0) * 100) / 100).toLocaleString('id-ID')}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-700">
                          {(upo.sjSummaries || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {upo.sjSummaries.map((sj, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 text-[10px] font-mono"
                                >
                                  {sj.noSJ} ({sj.tanggalKirim}: {(Number(sj.qtyPcs) || 0).toLocaleString('id-ID')})
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-amber-700 font-semibold">{t.notSentYetBadge}</span>
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
                    <td colSpan={5} className="py-3 px-3 border-r border-white/15">
                      TOTAL ({consolidatedUniquePOs.length} {t.unitPoShort} · {filteredTotals.totalPOs} {t.unitItem})
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15">
                      {filteredTotals.totalOrderPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-slate-300">
                      {filteredTotals.totalOrderKg.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-2.5 text-center border-r border-white/15 text-sky-200">
                      {filteredTotals.totalActiveSJs} {t.unitSJ}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-emerald-300">
                      {filteredTotals.totalTerkirimPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-amber-300">
                      {filteredTotals.totalSisaOSPcs.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-right border-r border-white/15 text-amber-300">
                      {filteredTotals.totalSisaOSKg.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-3 text-left text-sky-200 text-[11px]">
                      {consolidatedUniquePOs.filter((u) => (u.items?.length || 0) > 1).length} {t.filterMultiItem} {t.unitPoShort}
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
                ? 'flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 bg-white'
                : scrollMode === 'page'
                ? 'p-3 sm:p-4 space-y-3'
                : 'p-3 sm:p-4 space-y-3 max-h-[72vh] overflow-y-auto'
            }
          >
            {filteredPOs.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                {t.noMatchingRecords}
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
                    className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-xs hover:border-slate-300 transition-colors"
                  >
                    {/* Card Header: Distinct Executive Group Identity & Summary Capsule */}
                    <div className="p-2.5 sm:p-3 bg-[#18222C] text-white border-b border-slate-700/60 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="px-1.5 py-0.5 bg-[#19719C] text-white font-mono text-[10px] sm:text-[11px] font-bold rounded">
                            #{idx + 1}
                          </span>
                          <span className="font-mono font-bold text-xs sm:text-sm text-sky-200 tracking-tight">
                            {po.Artikel}
                          </span>
                          <span className="text-[11px] sm:text-xs text-slate-200 font-medium">
                            {po['Item Description']}
                          </span>
                          {po.Substance && (
                            <span className="px-1.5 py-0.5 bg-white/10 text-slate-300 font-mono text-[10px] font-medium rounded border border-white/10">
                              {po.Substance}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-400">
                          <span>
                            {t.unitPoShort}: <strong className="text-white font-bold">{po['No PO']}</strong>
                          </span>
                          <span>
                            CO: <strong className="text-slate-200">{po.CO}</strong>{' '}
                            <span
                              className={
                                po.coStatus === 'OPEN'
                                  ? 'text-emerald-400 font-semibold'
                                  : 'text-slate-400'
                              }
                            >
                              ({po.coStatus})
                            </span>
                          </span>
                          <span>
                            {t.thTglPO}: <strong className="text-slate-300 font-normal">{po['Tanggal Input PO']}</strong>
                          </span>
                          {realSJs.length > 0 ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-sans">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                              {realSJs.length}x {t.unitSJ}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-sans">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                              {t.notSentYetBadge}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Summary Capsule: QTY PO - Total Kirim = Sisa OS */}
                      <div className="flex flex-wrap items-center gap-2 bg-slate-800/80 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-slate-700/70 font-mono text-xs shrink-0">
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-sans">
                            {t.thQtyPO}
                          </span>
                          <strong className="text-white font-bold">
                            {qtyPoPcs.toLocaleString('id-ID')}
                          </strong>
                        </div>
                        <span className="text-slate-500 font-light">−</span>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-emerald-400/80 block font-sans">
                            {t.statTerkirim} ({realSJs.length} {t.unitSJ})
                          </span>
                          <strong className="text-emerald-300 font-bold">
                            {terkirimPcs.toLocaleString('id-ID')}
                          </strong>
                        </div>
                        <span className="text-slate-500 font-light">=</span>
                        {sisaPcs === 0 ? (
                          <div className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50">
                            <span className="text-[9px] uppercase tracking-wider text-emerald-400 block font-semibold font-sans">
                              {t.lunasOsBadge}
                            </span>
                            <strong className="text-emerald-300 font-bold">0 {t.unitPcs}</strong>
                          </div>
                        ) : (
                          <div className="px-2 py-0.5 rounded bg-orange-950/60 border border-orange-700/50">
                            <span className="text-[9px] uppercase tracking-wider text-orange-400 block font-semibold font-sans">
                              {t.thSisaOS}
                            </span>
                            <strong className="text-orange-300 font-bold">
                              {sisaPcs.toLocaleString('id-ID')} {t.unitPcs}
                            </strong>
                            <span className="text-[10px] text-orange-200/80 ml-1 font-normal">
                              ({sisaKg.toLocaleString('id-ID')} {t.unitKg})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Body: Softened, Low-Contrast SJ Table */}
                    <div className="overflow-x-auto bg-slate-50/20">
                      <table className="w-full text-left text-xs font-mono border-collapse">
                        <thead className="bg-slate-100/70 text-slate-500 text-[10px] uppercase font-semibold tracking-wider border-b border-slate-200/60">
                          <tr>
                            <th className="py-2 px-3">{t.thStage}</th>
                            <th className="py-2 px-3">{t.thNoSJ}</th>
                            <th className="py-2 px-3">{t.thTglSJ}</th>
                            <th className="py-2 px-3 text-right">{t.thQtySJ} ({t.unitPcs})</th>
                            <th className="py-2 px-3 text-right">{t.thBeratSJ} ({t.unitKg})</th>
                            <th className="py-2 px-3 text-right">{t.thAccumulatedPcs}</th>
                            <th className="py-2 px-3 text-right">{t.thSisaOS} ({t.unitPcs})</th>
                            <th className="py-2 px-3 text-right">{t.thSisaOSKg}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {realSJs.length === 0 ? (
                            <tr className="bg-amber-50/20 hover:bg-amber-50/40 text-xs">
                              <td className="py-2 px-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100/60 text-amber-800 border border-amber-200/50">
                                  {t.notSentYetBadge}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-400">-</td>
                              <td className="py-2 px-3 text-slate-400">-</td>
                              <td className="py-2 px-3 text-right text-slate-400 font-mono">0</td>
                              <td className="py-2 px-3 text-right text-slate-400 font-mono">0</td>
                              <td className="py-2 px-3 text-right text-slate-400 font-mono">0</td>
                              <td className="py-2 px-3 text-right font-semibold text-slate-800 text-[11px]">
                                {sisaPcs.toLocaleString('id-ID')}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-500 text-[11px]">
                                {sisaKg.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          ) : (
                            realSJs.map((sj, sjIdx) => (
                              <tr key={`${po.id}_sj_${sjIdx}`} className="hover:bg-slate-50/60 transition-colors text-xs">
                                <td className="py-2 px-3">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-[#19719C] border border-sky-100">
                                    {t.unitSJ} #{sjIdx + 1}
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-semibold text-slate-800 text-[11px]">
                                  {sj.noSJ}
                                </td>
                                <td className="py-2 px-3 text-slate-500 text-[11px]">{sj.tanggalKirim}</td>
                                <td className="py-2 px-3 text-right font-semibold text-emerald-700/90 text-[11px]">
                                  {(Number(sj.qtyKirimPcs) || 0).toLocaleString('id-ID')}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-600 text-[11px]">
                                  {(Number(sj.beratKirimKg) || 0).toLocaleString('id-ID')}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-500 text-[11px]">
                                  {(Number(sj.akumulasiKirimPcs) || 0).toLocaleString('id-ID')}
                                </td>
                                <td
                                  className={`py-2 px-3 text-right font-semibold text-[11px] ${
                                    Number(sj.sisaOsBerjalanPcs) > 0
                                      ? 'text-amber-800'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  {(Number(sj.sisaOsBerjalanPcs) || 0).toLocaleString('id-ID')}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-500 text-[11px]">
                                  {(Number(sj.sisaOsBerjalanKg) || 0).toLocaleString('id-ID')}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot className="bg-slate-100/50 border-t border-slate-200/60 text-xs text-slate-600">
                          <tr>
                            <td colSpan={3} className="py-2 px-3 font-medium text-slate-700">
                              TOTAL {t.unitPoShort} {po['No PO']} ({qtyPoPcs.toLocaleString('id-ID')} {t.unitPcs} /{' '}
                              {beratPoKg.toLocaleString('id-ID')} {t.unitKg})
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-800">
                              {terkirimPcs.toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600 font-medium">
                              {terkirimKg.toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-400 text-[10px] uppercase font-semibold">
                              {t.thSisaOS}:
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-bold ${
                                sisaPcs > 0 ? 'text-[#EA5413]' : 'text-emerald-700'
                              }`}
                            >
                              {sisaPcs.toLocaleString('id-ID')}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-semibold ${
                                sisaPcs > 0 ? 'text-[#EA5413]/90' : 'text-emerald-700'
                              }`}
                            >
                              {sisaKg.toLocaleString('id-ID')}
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
                ? 'flex-1 min-h-0 overflow-x-auto overflow-y-auto relative bg-white'
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
                  <th className="py-2.5 px-3 border-r border-white/10">#</th>
                  <th className="py-2.5 px-3 border-r border-white/10">{t.thNoCO}</th>
                  <th className="py-2.5 px-3 border-r border-white/10">{t.thArtikel}</th>
                  <th className="py-2.5 px-3 border-r border-white/10">{t.thDeskripsi}</th>
                  <th className="py-2.5 px-3 border-r border-white/10">{t.thTglPO}</th>
                  <th className="py-2.5 px-3 border-r border-white/10">{t.thNoPO}</th>
                  <th className="py-2.5 px-3 text-right border-r border-white/10">{t.thQtyPO}</th>
                  <th className="py-2.5 px-3 text-center border-r border-white/10">{t.unitSJ}</th>
                  {Array.from({ length: maxHorizontalSJ }).map((_, idx) => (
                    <React.Fragment key={`h_head_${idx}`}>
                      <th className="py-2.5 px-3 bg-[#134E6F] border-r border-white/15 text-sky-100">
                        {t.unitSJ} #{idx + 1}
                      </th>
                      <th className="py-2.5 px-3 bg-[#134E6F] border-r border-white/15 text-sky-100">
                        {t.thTglSJ} #{idx + 1}
                      </th>
                      <th className="py-2.5 px-3 bg-[#134E6F] text-right border-r border-white/25 text-emerald-200">
                        Qty #{idx + 1}
                      </th>
                    </React.Fragment>
                  ))}
                  <th className="py-2.5 px-3 text-right border-r border-white/10 text-emerald-300">
                    {t.thTotalSent}
                  </th>
                  <th className="py-2.5 px-3 text-right border-r border-white/10 text-amber-300">
                    {t.thSisaOS}
                  </th>
                  <th className="py-2.5 px-3 text-right">{t.thSisaOSKg}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPOs.map((po, idx) => {
                  const realSJs = (po.deliveries || []).filter(
                    (d) => !d.isFallbackNoDelivery && d.noSJ !== '-'
                  );
                  return (
                    <tr key={po.id || idx} className="bg-white hover:bg-slate-50">
                      <td className="py-2 px-3 border-r border-slate-200/70 text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200/70 font-semibold text-slate-900">
                        {po.CO}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200/70 font-semibold text-[#19719C]">
                        {po.Artikel}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200/70 font-sans text-slate-800">
                        {po['Item Description']}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200/70 text-slate-600">
                        {po['Tanggal Input PO']}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200/70 font-semibold text-slate-900">
                        {po['No PO']}
                      </td>
                      <td className="py-2 px-3 text-right border-r border-slate-200/70 font-bold text-slate-900">
                        {(Number(po['QTY PO (pcs)']) || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 text-center border-r border-slate-200/70">
                        <span
                          className={`text-[11px] font-semibold ${
                            realSJs.length === 0
                              ? 'text-amber-700'
                              : 'text-[#19719C]'
                          }`}
                        >
                          {realSJs.length}x
                        </span>
                      </td>
                      {Array.from({ length: maxHorizontalSJ }).map((_, sIdx) => {
                        const sj = realSJs[sIdx];
                        return (
                          <React.Fragment key={`h_cell_${po.id}_${sIdx}`}>
                            <td className="py-2 px-3 border-r border-slate-200/70 bg-sky-50/25 font-semibold text-[#19719C]">
                              {sj ? sj.noSJ : '-'}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200/70 bg-sky-50/25 text-slate-600">
                              {sj ? sj.tanggalKirim : '-'}
                            </td>
                            <td className="py-2 px-3 text-right border-r border-slate-300/70 bg-emerald-50/25 font-bold text-emerald-700">
                              {sj ? (Number(sj.qtyKirimPcs) || 0).toLocaleString('id-ID') : '0'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      <td className="py-2 px-3 text-right border-r border-slate-200/70 font-bold text-emerald-700">
                        {(Number(po['Terkirim (PCS)']) || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 text-right border-r border-slate-200/70 font-bold text-[#EA5413]">
                        {(Number(po['Sisa OS (pcs)']) || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-[#EA5413]">
                        {(Number(po['Sisa OS (kg)']) || 0).toLocaleString('id-ID')}
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
