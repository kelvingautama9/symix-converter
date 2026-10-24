import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ExtractedRecord, FilterStatus, CoFilterStatus } from '../types';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Filter,
  Layers,
  CheckCircle2,
  Clock,
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  ArrowUp,
  Table as TableIcon,
  Eye,
  EyeOff,
  SlidersHorizontal,
  RotateCcw,
  X,
  Check,
} from 'lucide-react';
import { haptic } from '../utils/haptics';
import { recalculateFIFOStock } from '../utils/parserEngine';
import { calculatePoAging, parsePoDate } from '../utils/agingUtils';
import { useLanguage } from '../i18n/LanguageContext';

export type AgingFilterOption = 'ALL' | 'SAFE' | 'FOLLOW_UP' | 'CRITICAL';

export type ColumnKey =
  | 'co'
  | 'artikel'
  | 'itemDescription'
  | 'tanggalInput'
  | 'noPo'
  | 'substance'
  | 'qtyPo'
  | 'beratPo'
  | 'stockPcs'
  | 'stockKg'
  | 'sisaOsPcs'
  | 'sisaOsKg'
  | 'terkirimPcs'
  | 'terkirimKg'
  | 'overStockGudangPcs'
  | 'overStockGudangKg'
  | 'overKirimanPcs'
  | 'overKirimanKg'
  | 'harga';

export interface ColumnDefinition {
  key: ColumnKey;
  number: number;
  label: string;
  field: string;
  description: string;
  badge: string;
}

export const ERP_COLUMNS: ColumnDefinition[] = [
  { key: 'co', number: 1, label: '1. CO (Customer Order)', field: 'CO', description: 'Customer Order & Status OPEN/CLOSED', badge: 'Identitas' },
  { key: 'artikel', number: 2, label: '2. Artikel', field: 'Artikel', description: 'Kode artikel packaging (SH-, ST-, BX-, DC-)', badge: 'Identitas' },
  { key: 'itemDescription', number: 3, label: '3. Item Description', field: 'Item Description', description: 'Deskripsi & spesifikasi dimensi box', badge: 'Identitas' },
  { key: 'tanggalInput', number: 4, label: '4. Tanggal Input PO', field: 'Tanggal Input PO', description: 'Tanggal registrasi Purchase Order', badge: 'Identitas' },
  { key: 'noPo', number: 5, label: '5. No PO (Clean)', field: 'No PO', description: 'Nomor PO yang telah dibersihkan', badge: 'Identitas' },
  { key: 'substance', number: 6, label: '6. Substance', field: 'Substance', description: 'Gramatur & kualitas kertas packaging', badge: 'Spesifikasi' },
  { key: 'qtyPo', number: 7, label: '7. QTY PO (pcs)', field: 'QTY PO (pcs)', description: 'Total kuantitas pesanan (pcs)', badge: 'Kuantitas' },
  { key: 'beratPo', number: 8, label: '8. Berat PO (KG)', field: 'Berat PO (KG)', description: 'Total tonase pesanan (kg)', badge: 'Kuantitas' },
  { key: 'stockPcs', number: 9, label: '9. Stock (pcs)', field: 'Stock (pcs)', description: 'Stok siap kirim di gudang (pcs)', badge: 'Logistik' },
  { key: 'stockKg', number: 10, label: '10. Stock (kg)', field: 'Stock (kg)', description: 'Stok siap kirim di gudang (kg)', badge: 'Logistik' },
  { key: 'sisaOsPcs', number: 11, label: '11. Sisa OS (pcs)', field: 'Sisa OS (pcs)', description: 'Sisa order belum terkirim (pcs)', badge: 'Kuantitas' },
  { key: 'sisaOsKg', number: 12, label: '12. Sisa OS (kg)', field: 'Sisa OS (kg)', description: 'Sisa order belum terkirim (kg)', badge: 'Kuantitas' },
  { key: 'terkirimPcs', number: 13, label: '13. Terkirim (PCS)', field: 'Terkirim (PCS)', description: 'Total kuantitas yang sudah dikirim (pcs)', badge: 'Logistik' },
  { key: 'terkirimKg', number: 14, label: '14. Terkirim (KG)', field: 'Terkirim (KG)', description: 'Total tonase yang sudah dikirim (kg)', badge: 'Logistik' },
  { key: 'overStockGudangPcs', number: 15, label: '15. Over Stock Gudang (PCS)', field: 'Over Stock Gudang (PCS)', description: 'Sisa stok fisik di gudang melebihi PO Open (pcs)', badge: 'Surplus' },
  { key: 'overStockGudangKg', number: 16, label: '16. Over Stock Gudang (KG)', field: 'Over Stock Gudang (KG)', description: 'Sisa tonase fisik di gudang melebihi PO Open (kg)', badge: 'Surplus' },
  { key: 'overKirimanPcs', number: 17, label: '17. Over Kiriman (PCS)', field: 'Over Kiriman (PCS)', description: 'Kuantitas aktual terkirim melebihi kuota PO (pcs)', badge: 'Logistik' },
  { key: 'overKirimanKg', number: 18, label: '18. Over Kiriman (KG)', field: 'Over Kiriman (KG)', description: 'Tonase aktual terkirim melebihi kuota PO (kg)', badge: 'Logistik' },
  { key: 'harga', number: 19, label: '19. Harga', field: 'Harga', description: 'Total nilai uang / harga pesanan PO', badge: 'Finansial' },
];

export const DEFAULT_VISIBLE_COLUMNS: Record<ColumnKey, boolean> = {
  co: true,
  artikel: true,
  itemDescription: true,
  tanggalInput: true,
  noPo: true,
  substance: true,
  qtyPo: true,
  beratPo: true,
  stockPcs: true,
  stockKg: true,
  sisaOsPcs: true,
  sisaOsKg: true,
  terkirimPcs: true,
  terkirimKg: true,
  overStockGudangPcs: true,
  overStockGudangKg: true,
  overKirimanPcs: true,
  overKirimanKg: true,
  harga: true,
};

interface DataTableProps {
  data: ExtractedRecord[];
}

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [coFilter, setCoFilter] = useState<CoFilterStatus>('ALL');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [agingFilter, setAgingFilter] = useState<AgingFilterOption>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(0); // 0 = Unlimited / Show All Rows
  const [sortField, setSortField] = useState<keyof ExtractedRecord | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Scroll Mode: 'page' (Bebas Halaman - auto height, cursor scrolls window freely) vs 'box' (Terkunci dalam container 70vh)
  const [scrollMode, setScrollMode] = useState<'page' | 'box'>('page');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Kustomisasi Row/Kolom state (1. CO, 2. Artikel, 3. Item Description, dst)
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem('blackeye_visible_columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_VISIBLE_COLUMNS, ...parsed };
      }
    } catch {
      // ignore
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });

  const [isManageColumnsOpen, setIsManageColumnsOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');

  const tableRef = useRef<HTMLDivElement>(null);

  // Sync visibleColumns changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('blackeye_visible_columns', JSON.stringify(visibleColumns));
    } catch {
      // ignore
    }
  }, [visibleColumns]);

  // Keyboard shortcut: ESC to exit fullscreen or modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isManageColumnsOpen) {
          setIsManageColumnsOpen(false);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isManageColumnsOpen]);

  // Lock body scroll when fullscreen modal is active
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

  // Dynamically calculate FIFO stock based on current CO scope (ALL / OPEN / CLOSED)
  const scopedData = useMemo(() => {
    return recalculateFIFOStock(data, coFilter);
  }, [data, coFilter]);

  // CO Counts
  const coCounts = useMemo(() => {
    let open = 0;
    let closed = 0;
    data.forEach((item) => {
      if (item.coStatus === 'OPEN') open++;
      else if (item.coStatus === 'CLOSED') closed++;
    });
    return { all: data.length, open, closed };
  }, [data]);

  // Tab counts based on current CO filter and scoped FIFO stock
  const filterCounts = useMemo(() => {
    let partial = 0;
    let pending = 0;
    let stockReady = 0;
    let overStockGudang = 0;
    let overKiriman = 0;
    let totalInCoScope = 0;

    scopedData.forEach((item) => {
      if (coFilter === 'OPEN' && item.coStatus !== 'OPEN') return;
      if (coFilter === 'CLOSED' && item.coStatus !== 'CLOSED') return;

      totalInCoScope++;
      const qty = item['QTY PO (pcs)'] || 0;
      const sisa = item['Sisa OS (pcs)'] || 0;
      const stockPcs = item['Stock (pcs)'] || 0;
      const stockKg = item['Stock (kg)'] || 0;
      const overStockPcs = item['Over Stock Gudang (PCS)'] || item['Over Produksi (PCS)'] || 0;
      const overStockKg = item['Over Stock Gudang (KG)'] || item['Over Produksi (KG)'] || 0;
      const overKirimanPcs = item['Over Kiriman (PCS)'] || 0;
      const overKirimanKg = item['Over Kiriman (KG)'] || 0;

      if (sisa < qty && sisa > 0) partial++;
      if (sisa >= qty) pending++;
      if (stockPcs > 0 || stockKg > 0) stockReady++;
      if (overStockPcs > 0 || overStockKg > 0) overStockGudang++;
      if (overKirimanPcs > 0 || overKirimanKg > 0) overKiriman++;
    });

    return {
      partial,
      pending,
      stockReady,
      overStockGudang,
      overKiriman,
      overProduction: overStockGudang,
      all: totalInCoScope,
    };
  }, [scopedData, coFilter]);

  // Aging counts based on current CO filter scope
  const agingCounts = useMemo(() => {
    let safe = 0;
    let followUp = 0;
    let critical = 0;
    let total = 0;

    scopedData.forEach((item) => {
      if (coFilter === 'OPEN' && item.coStatus !== 'OPEN') return;
      if (coFilter === 'CLOSED' && item.coStatus !== 'CLOSED') return;

      total++;
      const aging = calculatePoAging(item['Tanggal Input PO']);
      if (aging.category === 'SAFE') safe++;
      else if (aging.category === 'FOLLOW_UP') followUp++;
      else if (aging.category === 'CRITICAL') critical++;
    });

    return { all: total, safe, followUp, critical };
  }, [scopedData, coFilter]);

  // Filter and search
  const filteredData = useMemo(() => {
    return scopedData.filter((item) => {
      // 1. CO Status Filter
      if (coFilter === 'OPEN' && item.coStatus !== 'OPEN') return false;
      if (coFilter === 'CLOSED' && item.coStatus !== 'CLOSED') return false;

      // 2. Search matches
      const search = searchTerm.toLowerCase().trim();
      const matchSearch =
        !search ||
        (item.CO && item.CO.toLowerCase().includes(search)) ||
        (item.Artikel && item.Artikel.toLowerCase().includes(search)) ||
        (item['Item Description'] && item['Item Description'].toLowerCase().includes(search)) ||
        (item['Tanggal Input PO'] && item['Tanggal Input PO'].toLowerCase().includes(search)) ||
        (item['No PO'] && item['No PO'].toLowerCase().includes(search)) ||
        (item.Substance && item.Substance.toLowerCase().includes(search)) ||
        (search === 'open' && item.coStatus === 'OPEN') ||
        (search === 'closed' && item.coStatus === 'CLOSED');

      if (!matchSearch) return false;

      // 3. Delivery / Stock Status filter
      const qty = item['QTY PO (pcs)'] || 0;
      const sisa = item['Sisa OS (pcs)'] || 0;
      const stockPcs = item['Stock (pcs)'] || 0;
      const stockKg = item['Stock (kg)'] || 0;

      if (filterStatus === 'PARTIAL_DELIVERY') {
        return sisa < qty && sisa > 0;
      }
      if (filterStatus === 'FULL_PENDING') {
        return sisa >= qty;
      }
      if (filterStatus === 'STOCK_READY') {
        return stockPcs > 0 || stockKg > 0;
      }
      if (filterStatus === 'OVER_STOCK_GUDANG' || filterStatus === 'OVER_PRODUCTION') {
        const overPcs = item['Over Stock Gudang (PCS)'] || item['Over Produksi (PCS)'] || 0;
        const overKg = item['Over Stock Gudang (KG)'] || item['Over Produksi (KG)'] || 0;
        return overPcs > 0 || overKg > 0;
      }
      if (filterStatus === 'OVER_KIRIMAN') {
        const overPcs = item['Over Kiriman (PCS)'] || 0;
        const overKg = item['Over Kiriman (KG)'] || 0;
        return overPcs > 0 || overKg > 0;
      }

      // 4. Aging PO Filter (< 7 Hari, 8–14 Hari, > 14 Hari)
      if (agingFilter !== 'ALL') {
        const aging = calculatePoAging(item['Tanggal Input PO']);
        if (agingFilter === 'SAFE' && aging.category !== 'SAFE') return false;
        if (agingFilter === 'FOLLOW_UP' && aging.category !== 'FOLLOW_UP') return false;
        if (agingFilter === 'CRITICAL' && aging.category !== 'CRITICAL') return false;
      }

      return true;
    });
  }, [scopedData, searchTerm, coFilter, filterStatus, agingFilter]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortField) return filteredData;
    return [...filteredData].sort((a, b) => {
      // Specialized chronological sort for Tanggal Input PO
      if (sortField === 'Tanggal Input PO') {
        const timeA = parsePoDate(a['Tanggal Input PO'])?.getTime() ?? 0;
        const timeB = parsePoDate(b['Tanggal Input PO'])?.getTime() ?? 0;
        if (timeA !== timeB) {
          return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        }
      }

      const valA = a[sortField];
      const valB = b[sortField];

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      const strA = String(valA || '');
      const strB = String(valB || '');
      return sortOrder === 'asc'
        ? strA.localeCompare(strB, 'id-ID')
        : strB.localeCompare(strA, 'id-ID');
    });
  }, [filteredData, sortField, sortOrder]);

  // Pagination (pageSize === 0 means Unlimited / Show All)
  const isUnlimited = pageSize === 0;
  const effectivePageSize = isUnlimited ? sortedData.length || 1 : pageSize;
  const totalPages = isUnlimited ? 1 : Math.ceil(sortedData.length / effectivePageSize) || 1;

  const paginatedData = useMemo(() => {
    if (isUnlimited) return sortedData;
    const start = (currentPage - 1) * effectivePageSize;
    return sortedData.slice(start, start + effectivePageSize);
  }, [sortedData, currentPage, effectivePageSize, isUnlimited]);

  const handleSort = (field: keyof ExtractedRecord) => {
    haptic.selection();
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleCoFilterChange = (status: CoFilterStatus) => {
    haptic.selection();
    setCoFilter(status);
    setCurrentPage(1);
  };

  const handleDeliveryFilterChange = (status: FilterStatus) => {
    haptic.selection();
    setFilterStatus(status);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (val: number) => {
    haptic.selection();
    setPageSize(val);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    haptic.light();
    setCurrentPage(newPage);
  };

  // Toggle single column / row
  const toggleColumn = (key: ColumnKey) => {
    haptic.selection();
    setVisibleColumns((prev) => {
      const current = prev[key];
      // Prevent disabling the last remaining visible column
      const currentVisibleCount = Object.values(prev).filter(Boolean).length;
      if (current && currentVisibleCount <= 1) {
        haptic.error();
        return prev;
      }
      return { ...prev, [key]: !current };
    });
  };

  // Show all 15 columns / rows
  const showAllColumns = () => {
    haptic.medium();
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
  };

  // Preset layouts for quick column customization
  const applyPreset = (preset: 'all' | 'essential' | 'logistics' | 'financial') => {
    haptic.medium();
    if (preset === 'all') {
      setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
    } else if (preset === 'essential') {
      setVisibleColumns({
        co: true,
        artikel: true,
        itemDescription: true,
        tanggalInput: false,
        noPo: true,
        substance: false,
        qtyPo: true,
        beratPo: false,
        stockPcs: false,
        stockKg: false,
        sisaOsPcs: true,
        sisaOsKg: false,
        terkirimPcs: true,
        terkirimKg: false,
        overStockGudangPcs: false,
        overStockGudangKg: false,
        overKirimanPcs: false,
        overKirimanKg: false,
        harga: false,
      });
    } else if (preset === 'logistics') {
      setVisibleColumns({
        co: false,
        artikel: true,
        itemDescription: true,
        tanggalInput: false,
        noPo: true,
        substance: false,
        qtyPo: true,
        beratPo: true,
        stockPcs: true,
        stockKg: true,
        sisaOsPcs: true,
        sisaOsKg: true,
        terkirimPcs: true,
        terkirimKg: true,
        overStockGudangPcs: true,
        overStockGudangKg: true,
        overKirimanPcs: true,
        overKirimanKg: true,
        harga: false,
      });
    } else if (preset === 'financial') {
      setVisibleColumns({
        co: true,
        artikel: true,
        itemDescription: false,
        tanggalInput: true,
        noPo: true,
        substance: false,
        qtyPo: true,
        beratPo: false,
        stockPcs: false,
        stockKg: false,
        sisaOsPcs: true,
        sisaOsKg: false,
        terkirimPcs: false,
        terkirimKg: false,
        overStockGudangPcs: false,
        overStockGudangKg: false,
        overKirimanPcs: false,
        overKirimanKg: false,
        harga: true,
      });
    }
  };

  // Number of hidden columns
  const hiddenColumnCount = useMemo(() => {
    return ERP_COLUMNS.filter((c) => !visibleColumns[c.key]).length;
  }, [visibleColumns]);

  // Total visible columns (including the '#' index column)
  const visibleColumnCount = useMemo(() => {
    return 1 + ERP_COLUMNS.filter((c) => visibleColumns[c.key]).length;
  }, [visibleColumns]);

  // Filtered columns for search inside the customization modal
  const filteredModalColumns = useMemo(() => {
    if (!columnSearch.trim()) return ERP_COLUMNS;
    const q = columnSearch.toLowerCase();
    return ERP_COLUMNS.filter(
      (col) =>
        col.label.toLowerCase().includes(q) ||
        col.description.toLowerCase().includes(q) ||
        col.field.toLowerCase().includes(q)
    );
  }, [columnSearch]);

  // Sticky header is strictly active in 'box' mode (inside its 74vh container) or 'isFullscreen' mode (taking the full screen).
  // In 'page' mode (Bebas Halaman), the header is NOT floating or sticky over rows, which completely fixes the bug where header blocked rows 1 and 2!
  const isStickyHeader = scrollMode === 'box' || isFullscreen;
  const thStickyClass = isStickyHeader ? 'sticky top-0 z-20' : 'relative z-10';

  return (
    <div
      ref={tableRef}
      id="data-table-container"
      className={
        isFullscreen
          ? "fixed inset-0 z-50 bg-[#F8FAFC] flex flex-col p-3 sm:p-4 overflow-hidden"
          : "glass-panel rounded-xl overflow-hidden relative z-10"
      }
    >
      {/* Fullscreen Dedicated Top Bar */}
      {isFullscreen && (
        <div className="bg-white border border-slate-200 p-2.5 sm:p-3 rounded-xl flex items-center justify-between gap-3 mb-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {t.poRecapTableTitle}
            </h2>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-mono font-semibold rounded-md">
              {filteredData.length} {t.rowsLabel}
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

      {/* Table Controls Header */}
      <div className="p-3 sm:p-3.5 border-b border-slate-200 bg-white flex flex-col gap-2.5 shrink-0">
        {/* Row 1: Search Bar (Left) & Table View Actions (Right) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-full sm:max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              id="table-search-input"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t.searchPlaceholder}
              className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#EA5413] min-h-[34px] transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                title={t.clearFilters}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Table Controls (Scroll Mode, Fullscreen, Manage Columns) */}
          <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 flex-wrap shrink-0">
            {/* Scroll Mode */}
            <div className="glass-segmented inline-flex items-center shrink-0">
              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setScrollMode('page');
                }}
                className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scrollMode === 'page'
                    ? 'glass-segmented-active text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={t.scrollFree}
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
                className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scrollMode === 'box'
                    ? 'glass-segmented-active text-slate-900'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title={t.scrollBox}
              >
                <Lock className="w-3 h-3" />
                <span>{t.scrollBox}</span>
              </button>
            </div>

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={() => {
                haptic.medium();
                setIsFullscreen(!isFullscreen);
              }}
              className="liquid-glass-clear inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs cursor-pointer shrink-0"
              title={isFullscreen ? t.exitBtn : t.fullscreenBtn}
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

            {/* Custom Columns Button */}
            {hiddenColumnCount > 0 && (
              <button
                type="button"
                onClick={showAllColumns}
                className="inline-flex items-center gap-1 px-2 py-0.5 sm:py-1 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] sm:text-xs font-medium rounded-lg cursor-pointer shrink-0"
                title={t.resetBtnShort}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t.resetBtnShort} ({hiddenColumnCount})</span>
              </button>
            )}

            <button
              type="button"
              id="btn-kustom-row"
              onClick={() => {
                haptic.light();
                setIsManageColumnsOpen(true);
              }}
              className={`liquid-glass-clear inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs cursor-pointer shrink-0 ${
                hiddenColumnCount > 0 ? 'border-[#EA5413]/40 text-[#EA5413]' : ''
              }`}
              title={t.columnsBtn}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
              <span>{t.columnsBtn}{hiddenColumnCount > 0 ? ` (${hiddenColumnCount})` : ''}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Dedicated Filter Toolbar (Status CO, Status Kirim, Umur PO) */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          {/* Scrollable Filter Pill Lane */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
            {/* Filter 1: Status CO */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 shrink-0">CO:</span>
              <div className="glass-segmented inline-flex items-center shrink-0 flex-nowrap">
                <button
                  type="button"
                  id="filter-co-all"
                  onClick={() => handleCoFilterChange('ALL')}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    coFilter === 'ALL'
                      ? 'glass-segmented-active text-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.filterAll} ({coCounts.all})
                </button>
                <button
                  type="button"
                  id="filter-co-open"
                  onClick={() => handleCoFilterChange('OPEN')}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    coFilter === 'OPEN'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  {t.statusOpenShort} ({coCounts.open})
                </button>
                <button
                  type="button"
                  id="filter-co-closed"
                  onClick={() => handleCoFilterChange('CLOSED')}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    coFilter === 'CLOSED'
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.statusClosedShort} ({coCounts.closed})
                </button>
              </div>
            </div>

            <div className="w-px h-3.5 bg-slate-200 shrink-0" />

            {/* Filter 2: Status Kirim */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 shrink-0">
                {t.filterStatusLabel}
              </span>
              <div className="glass-segmented inline-flex items-center shrink-0 flex-nowrap">
                <button
                  type="button"
                  onClick={() => handleDeliveryFilterChange('ALL')}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    filterStatus === 'ALL'
                      ? 'glass-segmented-active text-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.filterAll} ({filterCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => handleDeliveryFilterChange('PARTIAL_DELIVERY')}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    filterStatus === 'PARTIAL_DELIVERY'
                      ? 'bg-[#EA5413] text-white font-semibold'
                      : 'text-slate-600 hover:text-[#EA5413]'
                  }`}
                >
                  {t.filterPartial} ({filterCounts.partial})
                </button>
                <button
                  type="button"
                  onClick={() => handleDeliveryFilterChange('FULL_PENDING')}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    filterStatus === 'FULL_PENDING'
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.filterPending} ({filterCounts.pending})
                </button>
                <button
                  type="button"
                  onClick={() => handleDeliveryFilterChange('STOCK_READY')}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    filterStatus === 'STOCK_READY'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  {t.filterStockReady} ({filterCounts.stockReady})
                </button>
                <button
                  type="button"
                  onClick={() => handleDeliveryFilterChange('OVER_STOCK_GUDANG')}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    filterStatus === 'OVER_STOCK_GUDANG' || filterStatus === 'OVER_PRODUCTION'
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-indigo-700'
                  }`}
                >
                  {t.filterOverStock} ({filterCounts.overStockGudang})
                </button>
                <button
                  type="button"
                  onClick={() => handleDeliveryFilterChange('OVER_KIRIMAN')}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    filterStatus === 'OVER_KIRIMAN'
                      ? 'bg-teal-700 text-white font-semibold'
                      : 'text-slate-600 hover:text-teal-700'
                  }`}
                >
                  {t.filterOverKirim} ({filterCounts.overKiriman})
                </button>
              </div>
            </div>

            <div className="w-px h-3.5 bg-slate-200 shrink-0" />

            {/* Filter 3: Umur PO */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 shrink-0">
                {t.filterAgingLabel}
              </span>
              <div className="glass-segmented inline-flex items-center shrink-0 flex-nowrap">
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setAgingFilter('ALL');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    agingFilter === 'ALL'
                      ? 'glass-segmented-active text-slate-900'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.filterAll} ({agingCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setAgingFilter('SAFE');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    agingFilter === 'SAFE'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  {t.agingSafeShort} ({agingCounts.safe})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setAgingFilter('FOLLOW_UP');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    agingFilter === 'FOLLOW_UP'
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-amber-700'
                  }`}
                >
                  {t.agingFollowUpShort} ({agingCounts.followUp})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setAgingFilter('CRITICAL');
                  }}
                  className={`px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    agingFilter === 'CRITICAL'
                      ? 'bg-rose-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-rose-700'
                  }`}
                >
                  {t.agingCriticalShort} ({agingCounts.critical})
                </button>
              </div>
            </div>
          </div>

          {/* Reset Filters Button */}
          {(coFilter !== 'ALL' || filterStatus !== 'ALL' || agingFilter !== 'ALL' || searchTerm.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                haptic.selection();
                setCoFilter('ALL');
                setFilterStatus('ALL');
                setAgingFilter('ALL');
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] sm:text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
              title={t.clearFilters}
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t.resetBtnShort}</span>
            </button>
          )}
        </div>
      </div>

      {/* Table Scroll Area with Sticky Header */}
      <div
        className={
          isFullscreen
            ? "flex-1 min-h-0 overflow-x-auto overflow-y-auto relative bg-white"
            : scrollMode === 'page'
            ? "overflow-x-auto relative"
            : "overflow-x-auto overflow-y-auto max-h-[68vh] sm:max-h-[74vh] relative"
        }
      >
        <table id="erp-extracted-table" className="w-full text-left text-xs whitespace-nowrap border-collapse">
          <thead className={`${isStickyHeader ? 'sticky top-0 z-20 shadow-xs' : 'relative z-10'} bg-[#18222C]`}>
            <tr className="bg-[#18222C] text-white text-[11px] font-mono font-semibold tracking-wider">
              <th className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 pl-4 border-r border-white/10`}>#</th>

              {visibleColumns.co && (
                <th
                  onClick={() => handleSort('CO')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10 min-w-[140px]`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{t.thNoCO}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.artikel && (
                <th
                  onClick={() => handleSort('Artikel')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{t.thArtikel}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.itemDescription && (
                <th
                  onClick={() => handleSort('Item Description')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 cursor-pointer hover:bg-black/30 transition-colors min-w-[200px] border-r border-white/10`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{t.thDeskripsi}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.tanggalInput && (
                <th
                  onClick={() => handleSort('Tanggal Input PO')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10 min-w-[135px]`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{t.thTglPO}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.noPo && (
                <th
                  onClick={() => handleSort('No PO')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{t.thNoPO}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.substance && (
                <th
                  onClick={() => handleSort('Substance')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{t.thSubstance}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.qtyPo && (
                <th
                  onClick={() => handleSort('QTY PO (pcs)')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thQtyPO}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.beratPo && (
                <th
                  onClick={() => handleSort('Berat PO (KG)')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thBeratPO}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.stockPcs && (
                <th
                  onClick={() => handleSort('Stock (pcs)')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thStockPcs}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.stockKg && (
                <th
                  onClick={() => handleSort('Stock (kg)')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thStockKg}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.sisaOsPcs && (
                <th
                  onClick={() => handleSort('Sisa OS (pcs)')}
                  className={`${thStickyClass} py-2.5 px-3 text-right cursor-pointer hover:opacity-90 transition-colors border-r border-white/10 bg-[#EA5413]`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thSisaOS}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-white/80" />
                  </div>
                </th>
              )}

              {visibleColumns.sisaOsKg && (
                <th
                  onClick={() => handleSort('Sisa OS (kg)')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thSisaOSKg}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.terkirimPcs && (
                <th
                  onClick={() => handleSort('Terkirim (PCS)')}
                  className={`${thStickyClass} py-2.5 px-3 text-right cursor-pointer hover:opacity-90 transition-colors border-r border-white/10 bg-[#059669]`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thTerkirim}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-white/80" />
                  </div>
                </th>
              )}

              {visibleColumns.terkirimKg && (
                <th
                  onClick={() => handleSort('Terkirim (KG)')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thTerkirimKg}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.overStockGudangPcs && (
                <th
                  onClick={() => handleSort('Over Stock Gudang (PCS)' as keyof ExtractedRecord)}
                  className={`${thStickyClass} py-2.5 px-3 text-right cursor-pointer hover:opacity-90 transition-colors border-r border-white/10 bg-indigo-900 text-indigo-100`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thOverStock}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-indigo-300" />
                  </div>
                </th>
              )}

              {visibleColumns.overStockGudangKg && (
                <th
                  onClick={() => handleSort('Over Stock Gudang (KG)' as keyof ExtractedRecord)}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thOverStockKg}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.overKirimanPcs && (
                <th
                  onClick={() => handleSort('Over Kiriman (PCS)' as keyof ExtractedRecord)}
                  className={`${thStickyClass} py-2.5 px-3 text-right cursor-pointer hover:opacity-90 transition-colors border-r border-white/10 bg-teal-900 text-teal-100`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thOverKirim}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-teal-300" />
                  </div>
                </th>
              )}

              {visibleColumns.overKirimanKg && (
                <th
                  onClick={() => handleSort('Over Kiriman (KG)' as keyof ExtractedRecord)}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thOverKirimKg}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}

              {visibleColumns.harga && (
                <th
                  onClick={() => handleSort('Harga')}
                  className={`${thStickyClass} bg-[#18222C] py-2.5 px-3 pr-4 text-right cursor-pointer hover:bg-black/30 transition-colors`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>{t.thHarga}</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono text-xs">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="py-12 text-center text-slate-500 font-sans font-medium">
                  {t.noMatchingRecords}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                const originalIndex = isUnlimited
                  ? idx + 1
                  : (currentPage - 1) * effectivePageSize + idx + 1;
                const rowKey = row.id || `row_${row.CO}_${row['No PO'] || ''}_${idx}`;
                const isDeliveredPartial = row['Sisa OS (pcs)'] < row['QTY PO (pcs)'];
                const terkirimPcs = row['Terkirim (PCS)'] !== undefined ? row['Terkirim (PCS)'] : Math.max(0, row['QTY PO (pcs)'] - row['Sisa OS (pcs)']);
                const terkirimKg = row['Terkirim (KG)'] !== undefined ? row['Terkirim (KG)'] : Math.max(0, row['Berat PO (KG)'] - row['Sisa OS (kg)']);
                const isCOOpen = row.coStatus === 'OPEN';
                const isCOClosed = row.coStatus === 'CLOSED';

                return (
                  <tr
                    key={rowKey}
                    className="hover:bg-slate-50 transition-colors group"
                  >
                    <td className="py-2 px-3 pl-4 text-slate-400 border-r border-slate-200/60 font-mono font-medium">
                      {originalIndex}
                    </td>

                    {visibleColumns.co && (
                      <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200/60">
                        <div className="flex items-center gap-1.5">
                          <span>{row.CO || '-'}</span>
                          {isCOOpen && (
                            <span
                              className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold uppercase rounded"
                              title="CO Status: OPEN"
                            >
                              OPEN
                            </span>
                          )}
                          {isCOClosed && (
                            <span
                              className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase rounded"
                              title="CO Status: CLOSED"
                            >
                              CLOSED
                            </span>
                          )}
                        </div>
                      </td>
                    )}

                    {visibleColumns.artikel && (
                      <td className="py-2.5 px-3 font-semibold text-[#1E2024] border-r border-zinc-200/40">
                        <span className="px-2 py-0.5 bg-white/80 border border-zinc-200/80 text-[#1E2024] text-[11px] font-mono rounded-md">
                          {row.Artikel}
                        </span>
                      </td>
                    )}

                    {visibleColumns.itemDescription && (
                      <td className="py-2.5 px-3 text-[#1E2024] font-sans font-medium whitespace-normal max-w-xs line-clamp-1 group-hover:line-clamp-none border-r border-zinc-200/40">
                        {row['Item Description']}
                      </td>
                    )}

                    {visibleColumns.tanggalInput && (
                      <td className="py-2.5 px-3 text-[#5C6068] font-mono border-r border-zinc-200/40">
                        {row['Tanggal Input PO'] && row['Tanggal Input PO'] !== '-' ? (
                          <div className="flex flex-col gap-1 items-start">
                            <span className="px-2 py-0.5 bg-white/60 border border-zinc-200/60 text-[#5C6068] text-[11px] font-mono rounded whitespace-nowrap">
                              {row['Tanggal Input PO']}
                            </span>
                            {(() => {
                              const aging = calculatePoAging(row['Tanggal Input PO']);
                              if (aging.category === 'UNKNOWN') return null;
                              const translatedWord =
                                aging.category === 'SAFE'
                                  ? t.agingSafeWord
                                  : aging.category === 'FOLLOW_UP'
                                  ? t.agingFollowUpWord
                                  : t.agingCriticalWord;
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border font-mono whitespace-nowrap ${aging.badgeClass}`}
                                  title={`${aging.days}${t.dayUnitShort} (${translatedWord})`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${aging.dotClass}`} />
                                  <span>
                                    {aging.days}
                                    {t.dayUnitShort} {translatedWord}
                                  </span>
                                </span>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-zinc-400">-</span>
                        )}
                      </td>
                    )}

                    {visibleColumns.noPo && (
                      <td className="py-2.5 px-3 font-semibold text-[#1E2024] font-mono border-r border-zinc-200/40">
                        {row['No PO'] || '-'}
                      </td>
                    )}

                    {visibleColumns.substance && (
                      <td className="py-2.5 px-3 text-[#5C6068] font-sans border-r border-zinc-200/40">
                        {row.Substance || '-'}
                      </td>
                    )}

                    {visibleColumns.qtyPo && (
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1E2024] border-r border-zinc-200/40">
                        {row['QTY PO (pcs)'].toLocaleString('id-ID')}
                      </td>
                    )}

                    {visibleColumns.beratPo && (
                      <td className="py-2.5 px-3 text-right font-mono text-[#5C6068] border-r border-zinc-200/40">
                        {row['Berat PO (KG)'].toLocaleString('id-ID')}
                      </td>
                    )}

                    {visibleColumns.stockPcs && (
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1E2024] border-r border-zinc-200/40">
                        {row['Stock (pcs)'] > 0 ? (
                          <span className="text-emerald-700 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            {row['Stock (pcs)'].toLocaleString('id-ID')}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>
                    )}

                    {visibleColumns.stockKg && (
                      <td className="py-2.5 px-3 text-right font-mono text-[#5C6068] border-r border-zinc-200/40">
                        {row['Stock (kg)'].toLocaleString('id-ID')}
                      </td>
                    )}

                    {visibleColumns.sisaOsPcs && (
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#EA5413] border-r border-zinc-200/40 bg-[#EA5413]/5">
                        <div className="flex flex-col items-end">
                          <div>
                            {row['Sisa OS (pcs)'].toLocaleString('id-ID')}
                            {isDeliveredPartial && (
                              <span className="ml-1 inline-block text-[10px] text-emerald-700 font-sans font-semibold">
                                (SJ✓)
                              </span>
                            )}
                          </div>
                          {((row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)'] || 0) > 0) && (
                            <span
                              className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold font-mono bg-indigo-500/10 text-indigo-700 border border-indigo-500/25"
                              title={`Stok fisik gudang melebihi PO Open sebesar ${(row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)'] || 0).toLocaleString('id-ID')} pcs (${(row['Over Stock Gudang (KG)'] || row['Over Produksi (KG)'] || 0).toLocaleString('id-ID')} kg). Butuh penawaran sales ke customer.`}
                            >
                              <span className="w-1 h-1 rounded-full bg-indigo-500" />
                              <span>
                                +{(row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)'] || 0).toLocaleString('id-ID')} pcs
                                {((row['Over Stock Gudang (KG)'] || row['Over Produksi (KG)'] || 0) > 0) && ` (${(row['Over Stock Gudang (KG)'] || row['Over Produksi (KG)'] || 0).toLocaleString('id-ID')} kg)`} Over Stock
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                    )}

                    {visibleColumns.sisaOsKg && (
                      <td className="py-2.5 px-3 text-right font-mono text-[#5C6068] border-r border-zinc-200/40">
                        {row['Sisa OS (kg)'].toLocaleString('id-ID')}
                      </td>
                    )}

                    {visibleColumns.terkirimPcs && (
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 border-r border-zinc-200/40 bg-emerald-500/5">
                        <div className="flex flex-col items-end">
                          <div>{terkirimPcs > 0 ? terkirimPcs.toLocaleString('id-ID') : '0'}</div>
                          {((row['Over Kiriman (PCS)'] || 0) > 0) && (
                            <span
                              className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold font-mono bg-teal-500/15 text-teal-800 border border-teal-500/30"
                              title={`Kuantitas terkirim di Surat Jalan (SJ) melebihi PO sebesar ${(row['Over Kiriman (PCS)'] || 0).toLocaleString('id-ID')} pcs (${(row['Over Kiriman (KG)'] || 0).toLocaleString('id-ID')} kg).`}
                            >
                              <span className="w-1 h-1 rounded-full bg-teal-600" />
                              <span>
                                +{(row['Over Kiriman (PCS)'] || 0).toLocaleString('id-ID')} pcs
                                {((row['Over Kiriman (KG)'] || 0) > 0) && ` (${(row['Over Kiriman (KG)'] || 0).toLocaleString('id-ID')} kg)`} Over SJ
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                    )}

                    {visibleColumns.terkirimKg && (
                      <td className="py-2.5 px-3 text-right font-mono text-[#5C6068] border-r border-zinc-200/40">
                        {terkirimKg > 0 ? terkirimKg.toLocaleString('id-ID') : '0'}
                      </td>
                    )}

                    {visibleColumns.overStockGudangPcs && (
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-700 border-r border-zinc-200/40 bg-indigo-500/5">
                        {((row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)'] || 0) > 0) ? (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/25">
                            +{((row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)'] || 0)).toLocaleString('id-ID')}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-normal">0</span>
                        )}
                      </td>
                    )}

                    {visibleColumns.overStockGudangKg && (
                      <td className="py-2.5 px-3 text-right font-mono text-[#5C6068] border-r border-zinc-200/40">
                        {((row['Over Stock Gudang (KG)'] || row['Over Produksi (KG)'] || 0) > 0) ? (
                          <span className="text-indigo-900 font-semibold">
                            +{((row['Over Stock Gudang (KG)'] || row['Over Produksi (KG)'] || 0)).toLocaleString('id-ID')}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-normal">0</span>
                        )}
                      </td>
                    )}

                    {visibleColumns.overKirimanPcs && (
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-teal-700 border-r border-zinc-200/40 bg-teal-500/5">
                        {((row['Over Kiriman (PCS)'] || 0) > 0) ? (
                          <span className="px-1.5 py-0.5 rounded bg-teal-500/15 border border-teal-500/25">
                            +{((row['Over Kiriman (PCS)'] || 0)).toLocaleString('id-ID')}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-normal">0</span>
                        )}
                      </td>
                    )}

                    {visibleColumns.overKirimanKg && (
                      <td className="py-2.5 px-3 text-right font-mono text-[#5C6068] border-r border-zinc-200/40">
                        {((row['Over Kiriman (KG)'] || 0) > 0) ? (
                          <span className="text-teal-900 font-semibold">
                            +{((row['Over Kiriman (KG)'] || 0)).toLocaleString('id-ID')}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-normal">0</span>
                        )}
                      </td>
                    )}

                    {visibleColumns.harga && (
                      <td className="py-2.5 px-3 pr-4 text-right font-mono font-medium text-[#1E2024]">
                        {row.Harga > 0 ? `Rp ${row.Harga.toLocaleString('id-ID')}` : '-'}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Pagination & Navigation Footer */}
      <div className="p-3 sm:p-4 border-t border-zinc-200/60 bg-white/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs text-[#5C6068] font-mono shrink-0">
        <div className="flex items-center gap-2 flex-wrap text-center sm:text-left text-[11px] sm:text-xs">
          {isUnlimited ? (
            <span className="font-semibold text-[#1E2024]">
              {t.showing} <span className="font-bold">{filteredData.length}</span> {t.entries}
            </span>
          ) : (
            <span>
              {t.showing}{' '}
              <span className="font-bold text-[#1E2024]">
                {filteredData.length === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1}
              </span>{' '}
              -{' '}
              <span className="font-bold text-[#1E2024]">
                {Math.min(currentPage * effectivePageSize, filteredData.length)}
              </span>{' '}
              {t.of} <span className="font-bold text-[#1E2024]">{filteredData.length}</span>{' '}
              {t.unitPo}
            </span>
          )}

          {/* Quick scroll-to-top button */}
          <button
            type="button"
            onClick={() => {
              haptic.light();
              tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="liquid-glass-clear inline-flex items-center gap-1 px-2.5 py-1 text-[11px] cursor-pointer ml-1 text-zinc-600 hover:text-zinc-900"
            title={t.toTopBtn}
          >
            <ArrowUp className="w-3 h-3 text-[#EA5413]" />
            <span>{t.toTopBtn}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 sm:gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold uppercase text-[10px] text-[#5C6068]">
              {t.rowsLabel}:
            </span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="bg-white/80 border border-white/90 text-[#1E2024] font-semibold px-2.5 py-1 text-xs rounded-full focus:outline-none cursor-pointer shadow-xs"
            >
              <option value={0}>{t.allUnlimited}</option>
              <option value={25}>25 {t.rowsLabel}</option>
              <option value={50}>50 {t.rowsLabel}</option>
              <option value={100}>100 {t.rowsLabel}</option>
              <option value={250}>250 {t.rowsLabel}</option>
              <option value={500}>500 {t.rowsLabel}</option>
              <option value={1000}>1000 {t.rowsLabel}</option>
            </select>
          </div>

          {!isUnlimited && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                className="liquid-glass-clear p-1.5 rounded-full disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer text-zinc-600 hover:text-zinc-900"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-bold font-mono text-xs text-[#1E2024]">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                className="liquid-glass-clear p-1.5 rounded-full disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer text-zinc-600 hover:text-zinc-900"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Dialog: Kelola & Kustomisasi Row / Kolom Tabel */}
      {isManageColumnsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
          onClick={() => setIsManageColumnsOpen(false)}
        >
          <div
            className="glass-panel rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 flex items-center justify-between gap-3 border-b border-zinc-200/60 bg-white/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl glass-card text-[#EA5413] flex items-center justify-center shadow-xs">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-[#1E2024]">
                    {t.customColTitle}
                  </h3>
                  <p className="text-[11px] text-[#5C6068]">{t.customColSubtitle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManageColumnsOpen(false)}
                className="liquid-glass-clear p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 cursor-pointer"
                title={t.closeBtn}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets & Quick Filters */}
            <div className="p-3 sm:p-4 bg-white/30 border-b border-zinc-200/60 flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-[#5C6068] mr-1">
                    {t.presetLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => applyPreset('all')}
                    className="liquid-glass-clear px-2.5 py-1 text-[11px] cursor-pointer"
                  >
                    {t.presetAll} ({ERP_COLUMNS.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('essential')}
                    className="liquid-glass-clear px-2.5 py-1 text-[11px] cursor-pointer"
                  >
                    {t.presetEssential}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('logistics')}
                    className="liquid-glass-clear px-2.5 py-1 text-[11px] cursor-pointer"
                  >
                    {t.presetLogistics}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('financial')}
                    className="liquid-glass-clear px-2.5 py-1 text-[11px] cursor-pointer"
                  >
                    {t.presetFinancial}
                  </button>
                  <button
                    type="button"
                    onClick={showAllColumns}
                    className="liquid-glass-emerald px-2.5 py-1 text-[11px] cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-white" />
                    <span>{t.resetBtnShort}</span>
                  </button>
                </div>

                <div className="text-[11px] font-mono font-semibold text-[#1E2024] bg-white/70 border border-white/90 px-2.5 py-0.5 rounded-full shadow-xs">
                  {ERP_COLUMNS.length - hiddenColumnCount} / {ERP_COLUMNS.length}{' '}
                  {t.visibleCountLabel}
                </div>
              </div>

              {/* Search Bar inside column modal */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t.searchColPlaceholder}
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs bg-white/80 border border-white/90 rounded-full focus:outline-none focus:ring-2 focus:ring-[#FF7B35]/40 font-mono shadow-xs"
                />
                {columnSearch && (
                  <button
                    type="button"
                    onClick={() => setColumnSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 hover:text-zinc-700"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* List of Columns with Toggle Switches */}
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-200/50 max-h-[50vh] p-2 bg-transparent">
              {filteredModalColumns.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#5C6068] font-mono">
                  {t.noColMatch} &quot;{columnSearch}&quot;
                </div>
              ) : (
                filteredModalColumns.map((col) => {
                  const isVisible = visibleColumns[col.key];

                  return (
                    <div
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-2xl transition-all cursor-pointer select-none ${
                        isVisible ? 'hover:bg-white/60' : 'bg-amber-500/5 hover:bg-amber-500/10 opacity-75'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-xl bg-zinc-800 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                          {col.number}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-mono font-bold text-xs ${
                                isVisible ? 'text-[#1E2024]' : 'text-zinc-400 line-through'
                              }`}
                            >
                              {col.label}
                            </span>
                            <span className="px-2 py-0.2 bg-white/80 border border-zinc-200/80 text-[9px] font-mono font-medium text-zinc-600 rounded-full uppercase">
                              {col.badge}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#5C6068] truncate">
                            {col.description}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColumn(col.key);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                            isVisible
                              ? 'liquid-glass-emerald'
                              : 'bg-amber-500/15 text-amber-800 border border-amber-500/30'
                          }`}
                        >
                          {isVisible ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-white" />
                              <span>{t.visibleCountLabel}</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                              <span>{t.hiddenLabel}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer Note & Done Button */}
            <div className="p-3.5 sm:p-4 bg-white/40 border-t border-zinc-200/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <p className="text-[11px] text-[#5C6068]">{t.customColFooterNote}</p>
              <button
                type="button"
                onClick={() => setIsManageColumnsOpen(false)}
                className="liquid-glass-primary px-5 py-2 text-xs uppercase tracking-wider cursor-pointer text-center"
              >
                {t.doneBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

