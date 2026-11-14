import React, { useState, useMemo } from 'react';
import {
  ExtractedRecord,
  SalesOrderRow,
  SalesOrderExportScope,
  SalesDeliveryMode,
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
  Layers,
  FileSpreadsheet,
  Building2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowDownAZ,
  Users,
  SlidersHorizontal,
} from 'lucide-react';
import { CustomerDataModal } from './CustomerDataModal';
import {
  getCustomerMappings,
  extractCustomerCodeFromArtikel,
} from '../utils/customerManager';

interface SalesOrderViewProps {
  data: ExtractedRecord[];
  fileName?: string | null;
  onShareStatus?: (msg: string) => void;
  deliveryMode?: SalesDeliveryMode;
  onDeliveryModeChange?: (mode: SalesDeliveryMode) => void;
  onDownloadMasterCombined?: () => void;
  totalFilesCount?: number;
}

export const SalesOrderView: React.FC<SalesOrderViewProps> = ({
  data,
  fileName,
  onShareStatus,
  deliveryMode: propDeliveryMode,
  onDeliveryModeChange,
  onDownloadMasterCombined,
  totalFilesCount = 1,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [coFilter, setCoFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [fluteFilter, setFluteFilter] = useState<string>('ALL');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [substanceK200Filter, setSubstanceK200Filter] = useState<
    'ALL' | 'K200_ALL' | 'K200_SW' | 'K200_DW' | 'NON_K200'
  >('ALL');
  const [highlightK200, setHighlightK200] = useState<boolean>(true);
  const [sortByPoAsc, setSortByPoAsc] = useState<boolean>(true);
  const [internalDeliveryMode, setInternalDeliveryMode] = useState<SalesDeliveryMode>('FALLBACK_DETAIL_SJ');
  const deliveryMode = propDeliveryMode !== undefined ? propDeliveryMode : internalDeliveryMode;
  const setDeliveryMode = (mode: SalesDeliveryMode) => {
    setInternalDeliveryMode(mode);
    onDeliveryModeChange?.(mode);
  };
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isDisplayMenuOpen, setIsDisplayMenuOpen] = useState(false);
  const [showSummarySection, setShowSummarySection] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('blackeye_sales_summary_visible');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [summaryTab, setSummaryTab] = useState<'ALL' | 'FLUTE' | 'K200'>(() => {
    try {
      const saved = localStorage.getItem('blackeye_sales_summary_tab');
      if (saved === 'FLUTE' || saved === 'K200' || saved === 'ALL') return saved;
    } catch {
      // ignore
    }
    return 'ALL';
  });
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerDataVersion, setCustomerDataVersion] = useState(0);

  const exportMenuRef = React.useRef<HTMLDivElement>(null);
  const displayMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    try {
      localStorage.setItem('blackeye_sales_summary_visible', String(showSummarySection));
    } catch {
      // ignore
    }
  }, [showSummarySection]);

  React.useEffect(() => {
    try {
      localStorage.setItem('blackeye_sales_summary_tab', summaryTab);
    } catch {
      // ignore
    }
  }, [summaryTab]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
      if (displayMenuRef.current && !displayMenuRef.current.contains(e.target as Node)) {
        setIsDisplayMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen to customer data updates from modal / localStorage
  React.useEffect(() => {
    const handleUpdate = () => {
      setCustomerDataVersion((v) => v + 1);
    };
    window.addEventListener('customer-data-updated', handleUpdate);
    return () => window.removeEventListener('customer-data-updated', handleUpdate);
  }, []);

  // Customer Name extracted from data
  const customerName = useMemo(() => {
    if (!data || data.length === 0) return 'PURBAYASA';
    const found = data.find((d) => d.customerName && d.customerName.trim());
    return found?.customerName ? found.customerName.toUpperCase() : 'PURBAYASA';
  }, [data]);

  // Flattened Sales Rows from parser engine (with natural alphanumeric sorting, delivery mode, and customer version support)
  const allSalesRows = useMemo(() => {
    // Note: customerDataVersion is used in deps to re-flatten with newest customer names
    return flattenSalesOrderRows(data, 'ALL', sortByPoAsc, deliveryMode);
  }, [data, sortByPoAsc, deliveryMode, customerDataVersion]);

  // List of unique Customers found in current dataset
  const availableCustomers = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    allSalesRows.forEach((r) => {
      const name = r.customerName || 'CUSTOMER';
      const code = r.customerCode || '-';
      if (!map.has(name)) {
        map.set(name, { code, name, count: 0 });
      }
      map.get(name)!.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSalesRows, customerDataVersion]);

  // Detected customer codes from articles that are not yet in Data Customer
  const unregisteredCustomerCodes = useMemo(() => {
    const mappings = getCustomerMappings();
    const knownCodes = new Set(mappings.map((m) => m.code.toUpperCase()));
    const unknown = new Set<string>();
    allSalesRows.forEach((r) => {
      if (r.customerCode && r.customerCode !== '-' && !knownCodes.has(r.customerCode.toUpperCase())) {
        unknown.add(r.customerCode.toUpperCase());
      }
    });
    return Array.from(unknown);
  }, [allSalesRows, customerDataVersion]);

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

  // Filtered rows based on Search, Customer, CO Status, Flute, and Substance K200
  const filteredRows = useMemo(() => {
    return allSalesRows.filter((r) => {
      // Customer filter
      if (customerFilter !== 'ALL') {
        const rowCustName = (r.customerName || '').toUpperCase();
        const rowCustCode = (r.customerCode || '').toUpperCase();
        if (rowCustName !== customerFilter.toUpperCase() && rowCustCode !== customerFilter.toUpperCase()) {
          return false;
        }
      }

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
          (r.customerName && r.customerName.toLowerCase().includes(query)) ||
          (r.customerCode && r.customerCode.toLowerCase().includes(query)) ||
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
  }, [allSalesRows, customerFilter, coFilter, fluteFilter, substanceK200Filter, searchTerm]);

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
  const handleExport = (
    scope: SalesOrderExportScope = 'ALL',
    explicitSort?: boolean,
    explicitDeliveryMode?: SalesDeliveryMode
  ) => {
    setIsExportMenuOpen(false);
    haptic.success();
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#0284c7', '#10b981', '#1e293b'],
    });

    const shouldSort = explicitSort !== undefined ? explicitSort : sortByPoAsc;
    const modeToUse = explicitDeliveryMode !== undefined ? explicitDeliveryMode : deliveryMode;
    const outName = getSalesOrderExportFileName(fileName, scope, shouldSort, modeToUse);
    exportSalesOrderToExcel(data, scope, outName, shouldSort, modeToUse);
    if (onShareStatus) {
      onShareStatus(`Export selesai: ${outName}`);
    }
  };

  // Handle WhatsApp Share
  const handleShareWA = async (
    scope: SalesOrderExportScope = 'ALL',
    explicitSort?: boolean,
    explicitDeliveryMode?: SalesDeliveryMode
  ) => {
    setIsExportMenuOpen(false);
    haptic.medium();
    const shouldSort = explicitSort !== undefined ? explicitSort : sortByPoAsc;
    const modeToUse = explicitDeliveryMode !== undefined ? explicitDeliveryMode : deliveryMode;
    const outName = getSalesOrderExportFileName(fileName, scope, shouldSort, modeToUse);
    const res = await shareSalesOrderExcelFileToWhatsApp(data, scope, outName, shouldSort, modeToUse);
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
    <div className="space-y-3">
      {/* Compact Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Compact Title & Inline Metadata */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-slate-500 shrink-0" />
              <h2 className="text-sm sm:text-[15px] font-semibold text-slate-900 truncate">
                Recap Order — {customerName}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono tabular-nums whitespace-nowrap overflow-x-auto mt-0.5">
              <span>{filteredRows.length} baris</span>
              <span className="text-slate-300">·</span>
              <span>{totals.totalPos} PO</span>
              <span className="text-slate-300">·</span>
              <span>{totals.totalArtikels} Artikel</span>
              <span className="text-slate-300">·</span>
              <span>{totals.totalSJs} SJ</span>
            </div>
          </div>

          {/* Right: Clean Minimalist Controls */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* Mode Switch */}
            <div className="bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 inline-flex items-center">
              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setDeliveryMode('FALLBACK_DETAIL_SJ');
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  deliveryMode === 'FALLBACK_DETAIL_SJ'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Rincian baris per Surat Jalan (No SJ & Tanggal Aktual Kirim)"
              >
                Detail per SJ
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setDeliveryMode('TOTAL_ACCUMULATION');
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  deliveryMode === 'TOTAL_ACCUMULATION'
                    ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Total keseluruhan per PO (tanpa rincian SJ)"
              >
                Total Keseluruhan
              </button>
            </div>

            {/* Data Customer */}
            <button
              type="button"
              onClick={() => {
                haptic.selection();
                setIsCustomerModalOpen(true);
              }}
              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              title="Kelola kode & nama customer"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Data Customer</span>
              {unregisteredCustomerCodes.length > 0 && (
                <span className="text-[10px] font-mono font-semibold text-amber-700">
                  (+{unregisteredCustomerCodes.length})
                </span>
              )}
            </button>

            {/* Tampilan & Opsi Slider Dropdown */}
            <div className="relative" ref={displayMenuRef}>
              <button
                type="button"
                onClick={() => setIsDisplayMenuOpen(!isDisplayMenuOpen)}
                className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  isDisplayMenuOpen
                    ? 'bg-slate-100 border-slate-300 text-slate-900'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title="Pengaturan tampilan tabel & ringkasan"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                <span>Tampilan</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isDisplayMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDisplayMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-slate-200 z-50 p-2 space-y-1">
                  <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Opsi Tampilan & Urutan
                  </div>

                  {/* Slider Toggle: Urut No. PO */}
                  <button
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setSortByPoAsc(!sortByPoAsc);
                    }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <span className="text-[11px] font-medium text-slate-700">Urut No. PO (A–Z)</span>
                    <span
                      className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                        sortByPoAsc ? 'bg-slate-900 justify-end' : 'bg-slate-200 justify-start'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
                    </span>
                  </button>

                  {/* Slider Toggle: Highlight K200 */}
                  <button
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setHighlightK200(!highlightK200);
                    }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <span className="text-[11px] font-medium text-slate-700">Highlight Warna K200</span>
                    <span
                      className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                        highlightK200 ? 'bg-amber-500 justify-end' : 'bg-slate-200 justify-start'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
                    </span>
                  </button>

                  {/* Slider Toggle: Ringkasan Flute & K200 */}
                  <button
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setShowSummarySection(!showSummarySection);
                    }}
                    className="w-full px-2 py-1.5 rounded-lg hover:bg-slate-50 flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <span className="text-[11px] font-medium text-slate-700">Ringkasan Flute & K200</span>
                    <span
                      className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                        showSummarySection ? 'bg-slate-900 justify-end' : 'bg-slate-200 justify-start'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full bg-white shadow-xs" />
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Share WA */}
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
              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              title="Kirim Excel Sales via WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Share WA</span>
            </button>

            {/* Compact Export Split Button */}
            <div className="relative inline-flex rounded-lg" ref={exportMenuRef}>
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
                className="px-2.5 py-1.5 text-[11px] font-semibold rounded-l-lg bg-slate-900 hover:bg-slate-800 text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="px-1.5 py-1.5 rounded-r-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border-l border-slate-700 cursor-pointer transition-colors"
                title="Pilihan Export"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-68 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1.5 text-[11px] text-slate-800 max-h-[85vh] overflow-y-auto">
                  <div className="px-3 py-1 font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    Mode Penjumlahan
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryMode('FALLBACK_DETAIL_SJ');
                      handleExport(
                        coFilter === 'ALL' ? 'ALL' : coFilter === 'OPEN' ? 'OPEN_ONLY' : 'CLOSED_ONLY',
                        undefined,
                        'FALLBACK_DETAIL_SJ'
                      );
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                      deliveryMode === 'FALLBACK_DETAIL_SJ' ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    <span>Detail per SJ (Fallback)</span>
                    {deliveryMode === 'FALLBACK_DETAIL_SJ' && (
                      <span className="text-[10px] font-mono text-blue-700 font-semibold">Aktif</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryMode('TOTAL_ACCUMULATION');
                      handleExport(
                        coFilter === 'ALL' ? 'ALL' : coFilter === 'OPEN' ? 'OPEN_ONLY' : 'CLOSED_ONLY',
                        undefined,
                        'TOTAL_ACCUMULATION'
                      );
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                      deliveryMode === 'TOTAL_ACCUMULATION' ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    <span>Total Keseluruhan PO</span>
                    {deliveryMode === 'TOTAL_ACCUMULATION' && (
                      <span className="text-[10px] font-mono text-emerald-700 font-semibold">Aktif</span>
                    )}
                  </button>

                  <div className="border-t border-slate-100 my-1" />
                  <div className="px-3 py-1 font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    Urutan No. PO
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSortByPoAsc(true);
                      handleExport(
                        coFilter === 'ALL' ? 'ALL' : coFilter === 'OPEN' ? 'OPEN_ONLY' : 'CLOSED_ONLY',
                        true
                      );
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                      sortByPoAsc ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <ArrowDownAZ className="w-3.5 h-3.5 text-slate-500" />
                      <span>Urut No. PO (A–Z)</span>
                    </span>
                    {sortByPoAsc && <span className="text-[10px] font-mono text-emerald-700">A–Z</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortByPoAsc(false);
                      handleExport(
                        coFilter === 'ALL' ? 'ALL' : coFilter === 'OPEN' ? 'OPEN_ONLY' : 'CLOSED_ONLY',
                        false
                      );
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between cursor-pointer ${
                      !sortByPoAsc ? 'bg-slate-50 font-semibold text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    <span>Sesuai Dokumen Asli</span>
                    {!sortByPoAsc && <span className="text-[10px] font-mono text-slate-500">Asli</span>}
                  </button>

                  <div className="border-t border-slate-100 my-1" />
                  <div className="px-3 py-1 font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                    Cakupan K200 & Status CO
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport('K200_ONLY')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between cursor-pointer text-slate-700"
                  >
                    <span>Semua K200 (SW + DW)</span>
                    <span className="text-[10px] font-mono text-slate-400">{totals.k200Total.totalPos} PO</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('K200_SW_ONLY')}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50/50 flex items-center justify-between cursor-pointer text-amber-900"
                  >
                    <span>K200 Singlewall (Kuning)</span>
                    <span className="text-[10px] font-mono text-amber-700">{totals.k200Sw.sumQtyPcs.toLocaleString('id-ID')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('K200_DW_ONLY')}
                    className="w-full text-left px-3 py-1.5 hover:bg-sky-50/50 flex items-center justify-between cursor-pointer text-sky-900"
                  >
                    <span>K200 Doublewall (Biru)</span>
                    <span className="text-[10px] font-mono text-sky-700">{totals.k200Dw.sumQtyPcs.toLocaleString('id-ID')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('ALL')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between cursor-pointer text-slate-700"
                  >
                    <span>Semua Baris (Open + Closed)</span>
                    <span className="text-[10px] font-mono text-slate-400">ALL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('OPEN_ONLY')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between cursor-pointer text-slate-700"
                  >
                    <span>CO Open Saja</span>
                    <span className="text-[10px] font-mono text-emerald-700">OPEN</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('CLOSED_ONLY')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between cursor-pointer text-slate-700"
                  >
                    <span>CO Closed Saja</span>
                    <span className="text-[10px] font-mono text-slate-500">CLOSED</span>
                  </button>

                  {onDownloadMasterCombined && totalFilesCount > 1 && (
                    <>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        type="button"
                        onClick={() => {
                          setIsExportMenuOpen(false);
                          onDownloadMasterCombined();
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-emerald-800 flex items-center justify-between cursor-pointer font-medium"
                      >
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Gabung Master ({totalFilesCount} File)</span>
                        </span>
                        <span className="text-[10px] font-mono text-emerald-700">MASTER</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Unified Minimalist Key Metric Strip */}
      <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        <div className="px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Total No. PO</div>
          <div className="mt-0.5 flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-base sm:text-lg font-semibold text-slate-900">{totals.totalPos}</span>
            <span className="text-[10px] text-slate-400">PO</span>
          </div>
          <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5">
            {totals.totalRows} baris jadwal
          </div>
        </div>

        <div className="px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Total Artikel</div>
          <div className="mt-0.5 flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-base sm:text-lg font-semibold text-slate-900">{totals.totalArtikels}</span>
            <span className="text-[10px] text-slate-400">Item</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
            Dimensi P & L
          </div>
        </div>

        <div className="px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Total Qty PO</div>
          <div className="mt-0.5 flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-base sm:text-lg font-semibold text-emerald-700">
              {totals.sumQtyPcs.toLocaleString('id-ID')}
            </span>
            <span className="text-[10px] text-slate-400">pcs</span>
          </div>
          <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5">
            {totals.sumQtyKg.toLocaleString('id-ID')} kg
          </div>
        </div>

        <div className="px-3.5 py-2.5">
          <div className="text-[11px] font-medium text-slate-500">Rencana Kirim</div>
          <div className="mt-0.5 flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-base sm:text-lg font-semibold text-blue-700">
              {totals.sumQtyDelivery.toLocaleString('id-ID')}
            </span>
            <span className="text-[10px] text-slate-400">pcs</span>
          </div>
          <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5">
            {totals.sumKgDelivery.toLocaleString('id-ID')} kg
          </div>
        </div>

        <div className="px-3.5 py-2.5 col-span-2 sm:col-span-1">
          <div className="text-[11px] font-medium text-slate-500">Realisasi (SJ)</div>
          <div className="mt-0.5 flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-base sm:text-lg font-semibold text-slate-900">
              {totals.sumActualQtyDelivery.toLocaleString('id-ID')}
            </span>
            <span className="text-[10px] text-slate-400">pcs</span>
          </div>
          <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5 flex items-center justify-between">
            <span>{totals.sumActualKgDelivery.toLocaleString('id-ID')} kg</span>
            <span>{totals.totalSJs} SJ</span>
          </div>
        </div>
      </div>

      {/* Minimalist Collapsible Ringkasan Flute (SW/DW/E) & Substance K200 */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-3.5 py-2 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-800">
              Ringkasan Flute & Substance K200
            </span>
            {showSummarySection ? (
              <div className="inline-flex items-center bg-slate-200/70 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSummaryTab('ALL')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    summaryTab === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryTab('FLUTE')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    summaryTab === 'FLUTE'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tipe Flute
                </button>
                <button
                  type="button"
                  onClick={() => setSummaryTab('K200')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    summaryTab === 'K200'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Substance K200
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500">
                <span>SW {totals.sw.sumQtyPcs.toLocaleString('id-ID')}</span>
                <span className="text-slate-300">·</span>
                <span>DW {totals.dw.sumQtyPcs.toLocaleString('id-ID')}</span>
                <span className="text-slate-300">·</span>
                <span>E {totals.eFlute.sumQtyPcs.toLocaleString('id-ID')}</span>
                <span className="text-slate-300">·</span>
                <span>K200 {totals.k200Total.sumQtyPcs.toLocaleString('id-ID')} pcs</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              haptic.selection();
              setShowSummarySection(!showSummarySection);
            }}
            className="text-[11px] font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <span>{showSummarySection ? 'Sembunyikan' : 'Tampilkan'}</span>
            {showSummarySection ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {showSummarySection && (
          <div
            className={`border-t border-slate-100 grid grid-cols-1 ${
              summaryTab === 'ALL' ? 'xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-slate-100' : ''
            }`}
          >
            {/* Panel 1: Tipe Flute (SW, DW, E) */}
            {(summaryTab === 'ALL' || summaryTab === 'FLUTE') && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-medium text-slate-400">
                      <th className="py-2 pl-3.5 pr-2 font-medium">Tipe Flute</th>
                      <th className="py-2 px-2 text-right font-medium whitespace-nowrap">PO / Item</th>
                      <th className="py-2 px-2 text-right font-medium whitespace-nowrap">Qty PO (pcs)</th>
                      <th className="py-2 px-2 text-right font-medium whitespace-nowrap">Rencana</th>
                      <th className="py-2 pl-2 pr-3.5 text-right font-medium whitespace-nowrap">Realisasi SJ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2 pl-3.5 pr-2">
                        <div className="font-medium text-slate-900">Singlewall (SW)</div>
                        <div className="text-[10px] text-slate-400">Flute B, C, E · 3-Ply</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                        {totals.sw.totalPos} · {totals.sw.totalArtikels}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-semibold text-slate-900">{totals.sw.sumQtyPcs.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-400">{totals.sw.sumQtyKg.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-semibold text-blue-700">{totals.sw.sumQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-400">{totals.sw.sumKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 pl-2 pr-3.5 text-right font-mono tabular-nums">
                        <div className="font-semibold text-emerald-700">{totals.sw.sumActualQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-400">{totals.sw.sumActualKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2 pl-3.5 pr-2">
                        <div className="font-medium text-slate-900">Doublewall (DW)</div>
                        <div className="text-[10px] text-slate-400">Flute BC · 5-Ply</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                        {totals.dw.totalPos} · {totals.dw.totalArtikels}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-semibold text-slate-900">{totals.dw.sumQtyPcs.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-400">{totals.dw.sumQtyKg.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-semibold text-blue-700">{totals.dw.sumQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-400">{totals.dw.sumKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 pl-2 pr-3.5 text-right font-mono tabular-nums">
                        <div className="font-semibold text-emerald-700">{totals.dw.sumActualQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-400">{totals.dw.sumActualKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                    </tr>

                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2 pl-3.5 pr-2">
                        <div className="font-medium text-slate-900">Khusus E-Flute</div>
                        <div className="text-[10px] text-slate-400">Flute E · 3-Ply</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap">
                        {totals.eFlute.totalPos} · {totals.eFlute.totalArtikels}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-semibold text-slate-900">{totals.eFlute.sumQtyPcs.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-400">{totals.eFlute.sumQtyKg.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-semibold text-blue-700">{totals.eFlute.sumQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-400">{totals.eFlute.sumKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 pl-2 pr-3.5 text-right font-mono tabular-nums">
                        <div className="font-semibold text-emerald-700">{totals.eFlute.sumActualQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-400">{totals.eFlute.sumActualKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Panel 2: Order Substance K200 */}
            {(summaryTab === 'ALL' || summaryTab === 'K200') && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-medium text-slate-400">
                      <th className="py-2 pl-3.5 pr-2 font-medium">Substance K200</th>
                      <th className="py-2 px-2 text-right font-medium whitespace-nowrap">PO / Item</th>
                      <th className="py-2 px-2 text-right font-medium whitespace-nowrap">Qty PO (pcs)</th>
                      <th className="py-2 px-2 text-right font-medium whitespace-nowrap">Rencana</th>
                      <th className="py-2 pl-2 pr-3.5 text-right font-medium whitespace-nowrap">Realisasi SJ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    <tr className="bg-amber-50/45 hover:bg-amber-50/80 transition-colors">
                      <td className="py-2 pl-3.5 pr-2">
                        <div className="font-medium text-amber-950">K200 Singlewall</div>
                        <div className="text-[10px] text-amber-700/80">Flute B, C, E · Kuning</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-[11px] text-amber-800/80 whitespace-nowrap">
                        {totals.k200Sw.totalPos} · {totals.k200Sw.totalArtikels}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-semibold text-slate-900">{totals.k200Sw.sumQtyPcs.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-500">{totals.k200Sw.sumQtyKg.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-semibold text-blue-700">{totals.k200Sw.sumQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-500">{totals.k200Sw.sumKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 pl-2 pr-3.5 text-right font-mono tabular-nums">
                        <div className="font-semibold text-emerald-700">{totals.k200Sw.sumActualQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-500">{totals.k200Sw.sumActualKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                    </tr>

                    <tr className="bg-sky-50/45 hover:bg-sky-50/80 transition-colors">
                      <td className="py-2 pl-3.5 pr-2">
                        <div className="font-medium text-sky-950">K200 Doublewall</div>
                        <div className="text-[10px] text-sky-700/80">Flute BC · Biru</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-[11px] text-sky-800/80 whitespace-nowrap">
                        {totals.k200Dw.totalPos} · {totals.k200Dw.totalArtikels}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-semibold text-slate-900">{totals.k200Dw.sumQtyPcs.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-500">{totals.k200Dw.sumQtyKg.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-semibold text-blue-700">{totals.k200Dw.sumQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-500">{totals.k200Dw.sumKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 pl-2 pr-3.5 text-right font-mono tabular-nums">
                        <div className="font-semibold text-emerald-700">{totals.k200Dw.sumActualQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-500">{totals.k200Dw.sumActualKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                    </tr>

                    <tr className="bg-slate-50/60 hover:bg-slate-50 transition-colors">
                      <td className="py-2 pl-3.5 pr-2">
                        <div className="font-semibold text-slate-900">Subtotal K200 (SW & DW)</div>
                        <div className="text-[10px] text-slate-500 font-mono tabular-nums">
                          {totals.k200Total.percentQtyPcs.toFixed(1)}% dari total pcs
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-[11px] text-slate-600 whitespace-nowrap">
                        {totals.k200Total.totalPos} PO
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-bold text-slate-900">{totals.k200Total.sumQtyPcs.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-500">{totals.k200Total.sumQtyKg.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">
                        <div className="font-bold text-blue-700">{totals.k200Total.sumQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-500">{totals.k200Total.sumKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                      <td className="py-2 pl-2 pr-3.5 text-right font-mono tabular-nums">
                        <div className="font-bold text-emerald-700">{totals.k200Total.sumActualQtyDelivery.toLocaleString('id-ID')}</div>
                        <div className="text-[10px] text-slate-500">{totals.k200Total.sumActualKgDelivery.toLocaleString('id-ID')} kg</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compact Search & Filter Bar */}
      <div className="bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 flex flex-col gap-2">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari No PO, Artikel, Item, Substance, Flute..."
              className="w-full pl-8 pr-7 py-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900/15 focus:bg-white text-slate-800 placeholder-slate-400 transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-semibold cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setCoFilter('ALL')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
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
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                coFilter === 'OPEN'
                  ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              CO Open
            </button>
            <button
              type="button"
              onClick={() => setCoFilter('CLOSED')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                coFilter === 'CLOSED'
                  ? 'bg-slate-700 text-white shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              CO Closed
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-100 text-[11px]">
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <span className="text-slate-400 shrink-0 mr-1">Substance:</span>
            <button
              type="button"
              onClick={() => setSubstanceK200Filter('ALL')}
              className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
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
              className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                substanceK200Filter === 'K200_ALL'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
              }`}
            >
              K200 (SW+DW)
            </button>
            <button
              type="button"
              onClick={() => setSubstanceK200Filter('K200_SW')}
              className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                substanceK200Filter === 'K200_SW'
                  ? 'bg-amber-300 text-amber-950 font-semibold'
                  : 'bg-amber-50/70 text-amber-800 hover:bg-amber-100'
              }`}
            >
              K200 SW
            </button>
            <button
              type="button"
              onClick={() => setSubstanceK200Filter('K200_DW')}
              className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                substanceK200Filter === 'K200_DW'
                  ? 'bg-sky-300 text-sky-950 font-semibold'
                  : 'bg-sky-50 text-sky-800 hover:bg-sky-100'
              }`}
            >
              K200 DW
            </button>
            <button
              type="button"
              onClick={() => setSubstanceK200Filter('NON_K200')}
              className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                substanceK200Filter === 'NON_K200'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Non-K200
            </button>
          </div>

          {availableFlutes.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              <span className="text-slate-400 shrink-0 mr-1">Flute:</span>
              <button
                type="button"
                onClick={() => setFluteFilter('ALL')}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
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
                  className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
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

        {availableCustomers.length > 1 && (
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100 text-[11px] overflow-x-auto py-0.5">
            <span className="text-slate-400 shrink-0 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              Customer:
            </span>
            <button
              type="button"
              onClick={() => setCustomerFilter('ALL')}
              className={`px-2 py-0.5 rounded-md font-medium transition-colors shrink-0 cursor-pointer ${
                customerFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua ({availableCustomers.length})
            </button>
            {availableCustomers.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setCustomerFilter(c.name)}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors shrink-0 inline-flex items-center gap-1 cursor-pointer ${
                  customerFilter === c.name
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{c.name}</span>
                <span className="text-[10px] font-mono opacity-75">{c.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Table matching Sales Order Schema */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="w-full text-xs text-left border-collapse border border-slate-300">
            {/* 2-Tier Header strictly aligned */}
            <thead className="bg-slate-100 text-slate-800 font-bold sticky top-0 z-20 select-none shadow-xs">
              {/* Row 1 of Header */}
              <tr>
                {/* Kolom A: Customers */}
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-left font-bold tracking-tight bg-slate-100 min-w-[150px] text-slate-900 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-600" />
                    <span>Customers</span>
                  </div>
                </th>
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
                {deliveryMode !== 'TOTAL_ACCUMULATION' && (
                  <th
                    rowSpan={2}
                    className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-tight bg-slate-100 min-w-[120px]"
                  >
                    Planning Date
                  </th>
                )}
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  Qty Planning
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  Kg Planning
                </th>
                {deliveryMode !== 'TOTAL_ACCUMULATION' && (
                  <>
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
                  </>
                )}
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  <div className="flex flex-col items-end">
                    <span>Qty Delivery</span>
                    {deliveryMode === 'TOTAL_ACCUMULATION' && (
                      <span className="text-[9px] text-emerald-700 font-normal font-mono">(Total PO)</span>
                    )}
                  </div>
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  <div className="flex flex-col items-end">
                    <span>Kg Delivery</span>
                    {deliveryMode === 'TOTAL_ACCUMULATION' && (
                      <span className="text-[9px] text-emerald-700 font-normal font-mono">(Total PO)</span>
                    )}
                  </div>
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  Harga (Rp)
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 border border-slate-300 text-right font-bold tracking-tight bg-slate-100 min-w-[100px]"
                >
                  Rp/Kg
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
                  <td
                    colSpan={deliveryMode === 'TOTAL_ACCUMULATION' ? 17 : 21}
                    className="px-4 py-12 text-center text-slate-400"
                  >
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
                      {/* 0. Customers (Kolom A) */}
                      <td className="px-3 py-2 border border-slate-200 font-semibold text-slate-800">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{r.customerName || customerName}</span>
                          {r.customerCode && r.customerCode !== '-' && (
                            <span
                              className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200"
                              title={`Kode Customer: ${r.customerCode}`}
                            >
                              {r.customerCode}
                            </span>
                          )}
                        </div>
                      </td>

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

                      {/* 11. Planning Date (Hanya di mode Fallback Detail SJ) */}
                      {deliveryMode !== 'TOTAL_ACCUMULATION' && (
                        <td className="px-3 py-2 border border-slate-200 text-center font-mono font-medium text-slate-800">
                          {r.deliveryDate || ''}
                        </td>
                      )}

                      {/* 12. Qty Planning (Rencana Qty Kirim) */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-medium text-slate-800">
                        {typeof r.qtyDelivery === 'number'
                          ? r.qtyDelivery.toLocaleString('id-ID')
                          : r.qtyDelivery || ''}
                      </td>

                      {/* 13. Kg Planning (Rencana Berat Kirim) */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-medium text-slate-800">
                        {typeof r.kgDelivery === 'number'
                          ? r.kgDelivery.toLocaleString('id-ID')
                          : r.kgDelivery || ''}
                      </td>

                      {/* 14. Remarks, Actual Delivery Date, No SJ (Hanya di mode Fallback Detail SJ) */}
                      {deliveryMode !== 'TOTAL_ACCUMULATION' && (
                        <>
                          <td className="px-2 py-2 border border-slate-200 text-center text-slate-300">
                            -
                          </td>
                          <td className="px-3 py-2 border border-slate-200 text-center font-mono text-slate-800">
                            {r.actualDeliveryDate || ''}
                          </td>
                          <td className="px-3 py-2 border border-slate-200 text-center font-mono">
                            {r.noSJ && r.noSJ !== '-' ? (
                              <span className="font-semibold text-slate-900">{r.noSJ}</span>
                            ) : r.noSJ === '-' ? (
                              <span className="text-slate-400">-</span>
                            ) : (
                              ''
                            )}
                          </td>
                        </>
                      )}

                      {/* Qty Delivery (Actual / Realisasi Kirim PCS) */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-medium text-slate-900">
                        {typeof r.actualQtyDelivery === 'number'
                          ? r.actualQtyDelivery.toLocaleString('id-ID')
                          : r.actualQtyDelivery || ''}
                      </td>

                      {/* Kg Delivery (Actual / Realisasi Kirim KG) */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-medium text-slate-900">
                        {typeof r.actualKgDelivery === 'number'
                          ? r.actualKgDelivery.toLocaleString('id-ID')
                          : r.actualKgDelivery || ''}
                      </td>

                      {/* Harga (Rp) */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-medium text-slate-900">
                        {r.harga !== '' && typeof r.harga === 'number'
                          ? `Rp ${r.harga.toLocaleString('id-ID')}`
                          : ''}
                      </td>

                      {/* Rp/Kg */}
                      <td className="px-3 py-2 border border-slate-200 text-right font-mono font-medium text-slate-900">
                        {r.rpPerKg !== '' && typeof r.rpPerKg === 'number'
                          ? `Rp ${r.rpPerKg.toLocaleString('id-ID')}`
                          : ''}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Footer: Clean, unified Grand Total row */}
            <tfoot className="sticky bottom-0 z-10 border-t-2 border-slate-300 shadow-md">
              <tr className="bg-slate-100 font-bold text-slate-900 text-xs">
                <td
                  colSpan={9}
                  className="px-3 py-2.5 border border-slate-300 text-center font-bold tracking-wider uppercase text-slate-800"
                >
                  GRAND TOTAL REKAPITULASI SALES ({totals.totalPos} NO PO / {totals.totalArtikels} ARTIKEL)
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-slate-900">
                  {totals.sumQtyPcs.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-slate-900">
                  {totals.sumQtyKg.toLocaleString('id-ID')}
                </td>
                {deliveryMode !== 'TOTAL_ACCUMULATION' && (
                  <td className="px-3 py-2.5 border border-slate-300 text-center text-slate-400">
                    -
                  </td>
                )}
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-slate-900 bg-slate-200/50">
                  {totals.sumQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-slate-900 bg-slate-200/50">
                  {totals.sumKgDelivery.toLocaleString('id-ID')}
                </td>
                {deliveryMode !== 'TOTAL_ACCUMULATION' && (
                  <>
                    <td className="px-2 py-2.5 border border-slate-300 text-center text-slate-400">
                      -
                    </td>
                    <td className="px-3 py-2.5 border border-slate-300 text-center text-slate-400">
                      -
                    </td>
                    <td className="px-3 py-2.5 border border-slate-300 text-center font-mono font-bold text-slate-700">
                      {totals.totalSJs > 0 ? `${totals.totalSJs} SJ` : '-'}
                    </td>
                  </>
                )}
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-emerald-800 bg-emerald-100/60">
                  {totals.sumActualQtyDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-right font-mono font-black text-emerald-800 bg-emerald-100/60">
                  {totals.sumActualKgDelivery.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-center text-slate-400">
                  -
                </td>
                <td className="px-3 py-2.5 border border-slate-300 text-center text-slate-400">
                  -
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal Manajemen "Data Customer" */}
      <CustomerDataModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        unregisteredCodes={unregisteredCustomerCodes}
        onDataChanged={() => setCustomerDataVersion((v) => v + 1)}
      />
    </div>
  );
};
