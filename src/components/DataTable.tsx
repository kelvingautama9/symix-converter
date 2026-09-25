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
  { key: 'harga', number: 15, label: '15. Harga', field: 'Harga', description: 'Total nilai uang / harga pesanan PO', badge: 'Finansial' },
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
  harga: true,
};

interface DataTableProps {
  data: ExtractedRecord[];
}

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
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
    let totalInCoScope = 0;

    scopedData.forEach((item) => {
      if (coFilter === 'OPEN' && item.coStatus !== 'OPEN') return;
      if (coFilter === 'CLOSED' && item.coStatus !== 'CLOSED') return;

      totalInCoScope++;
      const qty = item['QTY PO (pcs)'] || 0;
      const sisa = item['Sisa OS (pcs)'] || 0;
      const stockPcs = item['Stock (pcs)'] || 0;
      const stockKg = item['Stock (kg)'] || 0;

      if (sisa < qty && sisa > 0) partial++;
      if (sisa >= qty) pending++;
      if (stockPcs > 0 || stockKg > 0) stockReady++;
    });

    return { partial, pending, stockReady, all: totalInCoScope };
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
          ? "fixed inset-0 z-50 bg-[#F5F6F8]/95 backdrop-blur-2xl flex flex-col p-2.5 sm:p-4 overflow-hidden"
          : "glass-panel rounded-3xl overflow-hidden relative z-10"
      }
    >
      {/* Fullscreen Dedicated Top Bar */}
      {isFullscreen && (
        <div className="glass-panel-warm p-2.5 sm:p-3 rounded-2xl flex items-center justify-between gap-3 mb-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl glass-card text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
              <TableIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-bold tracking-tight text-[#1E2024] truncate">
                  Tabel Master ERP PO — Layar Penuh
                </h2>
                <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-700 text-[10px] font-mono font-bold rounded-full">
                  {filteredData.length} Baris PO
                </span>
              </div>
              <p className="text-[11px] text-[#5C6068] truncate hidden sm:block">
                Scroll leluasa vertikal & horizontal tanpa terhalang dashboard (Tekan ESC untuk keluar)
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

      {/* Table Controls Header */}
      <div className="p-3.5 sm:p-4 border-b border-zinc-200/60 bg-white/40 flex flex-col gap-3 shrink-0">
        {/* Row 1: Search & CO Status Quick Tabs */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-full lg:max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              id="table-search-input"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search PO, CO, Item, Description, Substance..."
              className="w-full pl-9 pr-4 py-2 bg-white/80 border border-white/90 rounded-full text-xs font-mono text-[#1E2024] placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#FF7B35]/40 shadow-sm min-h-[38px] transition-all"
            />
          </div>

          {/* Filter 1: CO Status (ALL / OPEN / CLOSED) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-[#5C6068] mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#EA5413]" />
              <span>Status CO:</span>
            </span>
            <div className="glass-segmented inline-flex items-center">
              <button
                type="button"
                id="filter-co-all"
                onClick={() => handleCoFilterChange('ALL')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                  coFilter === 'ALL'
                    ? 'glass-segmented-active text-[#EA5413]'
                    : 'text-[#5C6068] hover:text-[#1E2024]'
                }`}
              >
                Semua ({coCounts.all})
              </button>
              <button
                type="button"
                id="filter-co-open"
                onClick={() => handleCoFilterChange('OPEN')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                  coFilter === 'OPEN'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-[#5C6068] hover:text-emerald-700'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${coFilter === 'OPEN' ? 'bg-white' : 'bg-emerald-500'}`} />
                <span>Open ({coCounts.open})</span>
              </button>
              <button
                type="button"
                id="filter-co-closed"
                onClick={() => handleCoFilterChange('CLOSED')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer flex items-center gap-1.5 ${
                  coFilter === 'CLOSED'
                    ? 'bg-zinc-700 text-white shadow-sm'
                    : 'text-[#5C6068] hover:text-zinc-800'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${coFilter === 'CLOSED' ? 'bg-white' : 'bg-zinc-400'}`} />
                <span>Closed ({coCounts.closed})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Delivery Filters (Left) & Responsiveness/Scroll View Controls (Right) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2.5 border-t border-zinc-200/60">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-[#5C6068] mr-1">
              Status Kirim:
            </span>
            <div className="glass-segmented inline-flex items-center flex-wrap">
              <button
                type="button"
                onClick={() => handleDeliveryFilterChange('ALL')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                  filterStatus === 'ALL'
                    ? 'glass-segmented-active text-[#1E2024]'
                    : 'text-[#5C6068] hover:text-[#1E2024]'
                }`}
              >
                Semua ({filterCounts.all})
              </button>
              <button
                type="button"
                onClick={() => handleDeliveryFilterChange('PARTIAL_DELIVERY')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                  filterStatus === 'PARTIAL_DELIVERY'
                    ? 'bg-[#EA5413] text-white shadow-sm'
                    : 'text-[#5C6068] hover:text-[#EA5413]'
                }`}
              >
                Partial ({filterCounts.partial})
              </button>
              <button
                type="button"
                onClick={() => handleDeliveryFilterChange('FULL_PENDING')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                  filterStatus === 'FULL_PENDING'
                    ? 'bg-zinc-600 text-white shadow-sm'
                    : 'text-[#5C6068] hover:text-zinc-800'
                }`}
              >
                Pending ({filterCounts.pending})
              </button>
              <button
                type="button"
                onClick={() => handleDeliveryFilterChange('STOCK_READY')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                  filterStatus === 'STOCK_READY'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-[#5C6068] hover:text-emerald-700'
                }`}
              >
                Stock Ready ({filterCounts.stockReady})
              </button>
            </div>

            {/* Aging PO Filter (< 7h, 8-14h, > 14h) */}
            <div className="flex items-center gap-1.5 ml-0 sm:ml-2">
              <span className="text-[11px] font-semibold text-[#5C6068]">
                Umur PO:
              </span>
              <div className="glass-segmented inline-flex items-center flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setAgingFilter('ALL');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    agingFilter === 'ALL'
                      ? 'glass-segmented-active text-[#1E2024]'
                      : 'text-[#5C6068] hover:text-[#1E2024]'
                  }`}
                  title="Tampilkan semua umur PO"
                >
                  Semua ({agingCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setAgingFilter('SAFE');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    agingFilter === 'SAFE'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-[#5C6068] hover:text-emerald-700'
                  }`}
                  title="PO baru diinput kurang dari 7 hari (Aman / Baru)"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${agingFilter === 'SAFE' ? 'bg-white' : 'bg-emerald-500'}`} />
                  <span>&lt; 7h Aman ({agingCounts.safe})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setAgingFilter('FOLLOW_UP');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    agingFilter === 'FOLLOW_UP'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-[#5C6068] hover:text-amber-700'
                  }`}
                  title="PO berjalan 8 hingga 14 hari (Perlu Follow UP)"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${agingFilter === 'FOLLOW_UP' ? 'bg-white' : 'bg-amber-500'}`} />
                  <span>8–14h Follow Up ({agingCounts.followUp})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    setAgingFilter('CRITICAL');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    agingFilter === 'CRITICAL'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-[#5C6068] hover:text-rose-700'
                  }`}
                  title="PO lebih dari 14 hari / 30 hari (Kritis / Telat)"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${agingFilter === 'CRITICAL' ? 'bg-white' : 'bg-rose-500'}`} />
                  <span>&gt; 14h Kritis ({agingCounts.critical})</span>
                </button>
              </div>
            </div>
          </div>

          {/* Opsi Scroll & View Mode */}
          <div className="flex items-center gap-1.5 flex-wrap self-start md:self-auto">
            <span className="text-[11px] font-semibold text-[#5C6068] mr-0.5">
              Scroll:
            </span>

            {/* Segmented Control: Bebas Halaman vs Kunci Kotak */}
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
                    : 'text-[#5C6068] hover:text-[#1E2024]'
                }`}
                title="Scroll mouse bebas menggerakkan seluruh halaman web tanpa tersangkut di dalam tabel"
              >
                <Unlock className={`w-3 h-3 ${scrollMode === 'page' ? 'text-emerald-600' : 'text-zinc-400'}`} />
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
                    ? 'glass-segmented-active text-[#EA5413]'
                    : 'text-[#5C6068] hover:text-[#1E2024]'
                }`}
                title="Batasi tabel dalam kotak scroll 70vh dengan scrollbar internal"
              >
                <Lock className={`w-3 h-3 ${scrollMode === 'box' ? 'text-[#EA5413]' : 'text-zinc-400'}`} />
                <span>Kotak</span>
              </button>
            </div>

            {/* Fullscreen Table Mode Button */}
            <button
              type="button"
              onClick={() => {
                haptic.medium();
                setIsFullscreen(!isFullscreen);
              }}
              className="liquid-glass-clear inline-flex items-center gap-1 px-3 py-1 text-[11px] uppercase tracking-wider cursor-pointer"
              title={isFullscreen ? "Keluar layar penuh (ESC)" : "Buka tabel dalam mode layar penuh"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-[#EA5413]" />
                  <span>Keluar</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-[#EA5413]" />
                  <span>Layar Penuh</span>
                </>
              )}
            </button>

            {/* Custom Columns / Rows Button */}
            {hiddenColumnCount > 0 && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-800 text-[11px] font-medium rounded-full">
                <EyeOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>{hiddenColumnCount} Hide</span>
                <button
                  type="button"
                  onClick={showAllColumns}
                  className="ml-0.5 px-1.5 py-0.2 bg-amber-700 hover:bg-amber-800 text-white text-[9px] font-bold rounded-full cursor-pointer flex items-center gap-0.5 transition-colors"
                  title="Tampilkan semua row / kolom (Reset)"
                >
                  <RotateCcw className="w-2.5 h-2.5 text-white" />
                  <span>Reset</span>
                </button>
              </div>
            )}

            <button
              type="button"
              id="btn-kustom-row"
              onClick={() => {
                haptic.light();
                setIsManageColumnsOpen(true);
              }}
              className={`liquid-glass-clear inline-flex items-center gap-1.5 px-3 py-1 font-mono text-[11px] uppercase tracking-wider cursor-pointer ${
                hiddenColumnCount > 0 ? 'border-[#EA5413]/40 text-[#EA5413]' : ''
              }`}
              title="Kustomisasi Row / Kolom"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#EA5413]" />
              <span>Kustom Kolom {hiddenColumnCount > 0 ? `(${hiddenColumnCount})` : ''}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table Scroll Area with Sticky Header (Only sticky in 'box' and 'isFullscreen' modes) */}
      <div
        className={
          isFullscreen
            ? "flex-1 min-h-0 overflow-x-auto overflow-y-auto relative bg-white/30"
            : scrollMode === 'page'
            ? "overflow-x-auto relative"
            : "overflow-x-auto overflow-y-auto max-h-[68vh] sm:max-h-[74vh] relative"
        }
      >
        <table id="erp-extracted-table" className="w-full text-left text-xs whitespace-nowrap border-collapse">
          <thead className={`${isStickyHeader ? 'sticky top-0 z-20 shadow-sm' : 'relative z-10'} bg-[#1E2229]/95 backdrop-blur-md`}>
            <tr className="bg-[#1E2229]/95 text-white text-[11px] font-mono font-semibold tracking-wider">
              <th className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 pl-4 border-r border-white/10`}>#</th>

              {visibleColumns.co && (
                <th
                  onClick={() => handleSort('CO')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10 min-w-[160px]`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>1. CO (Customer Order)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.artikel && (
                <th
                  onClick={() => handleSort('Artikel')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>2. Artikel</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.itemDescription && (
                <th
                  onClick={() => handleSort('Item Description')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 cursor-pointer hover:bg-black/30 transition-colors min-w-[220px] border-r border-white/10`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>3. Item Description</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.tanggalInput && (
                <th
                  onClick={() => handleSort('Tanggal Input PO')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10 min-w-[155px]`}
                  title="Klik untuk mengurutkan berdasarkan tanggal / umur PO secara kronologis"
                >
                  <div className="flex items-center gap-1.5">
                    <span>4. Tanggal Input PO</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.noPo && (
                <th
                  onClick={() => handleSort('No PO')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>5. No PO (Clean)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.substance && (
                <th
                  onClick={() => handleSort('Substance')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>6. Substance</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.qtyPo && (
                <th
                  onClick={() => handleSort('QTY PO (pcs)')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>7. QTY PO (pcs)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.beratPo && (
                <th
                  onClick={() => handleSort('Berat PO (KG)')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>8. Berat PO (KG)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.stockPcs && (
                <th
                  onClick={() => handleSort('Stock (pcs)')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>9. Stock (pcs)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.stockKg && (
                <th
                  onClick={() => handleSort('Stock (kg)')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>10. Stock (kg)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.sisaOsPcs && (
                <th
                  onClick={() => handleSort('Sisa OS (pcs)')}
                  className={`${thStickyClass} py-3 px-3 text-right cursor-pointer hover:opacity-90 transition-colors border-r border-white/10 bg-[#EA5413]/90`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>11. Sisa OS (pcs)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-white/80" />
                  </div>
                </th>
              )}

              {visibleColumns.sisaOsKg && (
                <th
                  onClick={() => handleSort('Sisa OS (kg)')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>12. Sisa OS (kg)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.terkirimPcs && (
                <th
                  onClick={() => handleSort('Terkirim (PCS)')}
                  className={`${thStickyClass} py-3 px-3 text-right cursor-pointer hover:opacity-90 transition-colors border-r border-white/10 bg-[#059669]/90`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>13. Terkirim (PCS)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-white/80" />
                  </div>
                </th>
              )}

              {visibleColumns.terkirimKg && (
                <th
                  onClick={() => handleSort('Terkirim (KG)')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 text-right cursor-pointer hover:bg-black/30 transition-colors border-r border-white/10`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>14. Terkirim (KG)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}

              {visibleColumns.harga && (
                <th
                  onClick={() => handleSort('Harga')}
                  className={`${thStickyClass} bg-[#1E2229]/95 py-3 px-3 pr-4 text-right cursor-pointer hover:bg-black/30 transition-colors`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>15. Harga</span>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200/50 font-mono text-xs">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="py-12 text-center text-[#5C6068] font-sans font-medium">
                  Tidak ada data yang sesuai dengan filter atau pencarian saat ini.
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
                    className="hover:bg-[#FF7B35]/5 transition-colors group"
                  >
                    <td className="py-2.5 px-3 pl-4 text-zinc-400 border-r border-zinc-200/40 font-mono font-medium">
                      {originalIndex}
                    </td>

                    {visibleColumns.co && (
                      <td className="py-2.5 px-3 font-semibold text-[#1E2024] border-r border-zinc-200/40">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-white/70 border border-zinc-200/70 text-[#1E2024] text-[11px] font-mono rounded-md shadow-xs">
                            {row.CO || '-'}
                          </span>
                          {isCOOpen && (
                            <span
                              className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 text-[10px] font-bold uppercase rounded-full"
                              title="CO Status: OPEN (Masih Terbuka / Berjalan)"
                            >
                              OPEN
                            </span>
                          )}
                          {isCOClosed && (
                            <span
                              className="px-2 py-0.5 bg-zinc-200/60 border border-zinc-300/60 text-zinc-600 text-[10px] font-semibold uppercase rounded-full"
                              title="CO Status: CLOSED (Selesai / Ditutup)"
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
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border font-mono whitespace-nowrap ${aging.badgeClass}`}
                                  title={`Umur PO: ${aging.days} hari (${aging.label})`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${aging.dotClass}`} />
                                  <span>{aging.shortLabel}</span>
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
                        {row['Sisa OS (pcs)'].toLocaleString('id-ID')}
                        {isDeliveredPartial && (
                          <span className="ml-1 inline-block text-[10px] text-emerald-700 font-sans font-semibold">
                            (SJ✓)
                          </span>
                        )}
                      </td>
                    )}

                    {visibleColumns.sisaOsKg && (
                      <td className="py-2.5 px-3 text-right font-mono text-[#5C6068] border-r border-zinc-200/40">
                        {row['Sisa OS (kg)'].toLocaleString('id-ID')}
                      </td>
                    )}

                    {visibleColumns.terkirimPcs && (
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 border-r border-zinc-200/40 bg-emerald-500/5">
                        {terkirimPcs > 0 ? terkirimPcs.toLocaleString('id-ID') : '0'}
                      </td>
                    )}

                    {visibleColumns.terkirimKg && (
                      <td className="py-2.5 px-3 text-right font-mono text-[#5C6068] border-r border-zinc-200/40">
                        {terkirimKg > 0 ? terkirimKg.toLocaleString('id-ID') : '0'}
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
              Menampilkan semua <span className="font-bold">{filteredData.length}</span> PO Records (Tanpa Limit)
            </span>
          ) : (
            <span>
              Menampilkan baris <span className="font-bold text-[#1E2024]">{filteredData.length === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1}</span> -{' '}
              <span className="font-bold text-[#1E2024]">{Math.min(currentPage * effectivePageSize, filteredData.length)}</span> dari{' '}
              <span className="font-bold text-[#1E2024]">{filteredData.length}</span> PO
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
            title="Kembali ke atas tabel"
          >
            <ArrowUp className="w-3 h-3 text-[#EA5413]" />
            <span>Ke Atas</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 sm:gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold uppercase text-[10px] text-[#5C6068]">Baris:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="bg-white/80 border border-white/90 text-[#1E2024] font-semibold px-2.5 py-1 text-xs rounded-full focus:outline-none cursor-pointer shadow-xs"
            >
              <option value={0}>Semua (Unlimited)</option>
              <option value={25}>25 Baris</option>
              <option value={50}>50 Baris</option>
              <option value={100}>100 Baris</option>
              <option value={250}>250 Baris</option>
              <option value={500}>500 Baris</option>
              <option value={1000}>1000 Baris</option>
            </select>
          </div>

          {!isUnlimited && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                className="liquid-glass-clear p-1.5 rounded-full disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer text-zinc-600 hover:text-zinc-900"
                aria-label="Halaman sebelumnya"
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
                aria-label="Halaman berikutnya"
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
                    Kustomisasi Kolom Tabel
                  </h3>
                  <p className="text-[11px] text-[#5C6068]">
                    Pilih kolom yang ingin ditampilkan di tabel. Data AI Chatbot tetap membaca utuh.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManageColumnsOpen(false)}
                className="liquid-glass-clear p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 cursor-pointer"
                title="Tutup (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets & Quick Filters */}
            <div className="p-3 sm:p-4 bg-white/30 border-b border-zinc-200/60 flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-[#5C6068] mr-1">
                    Preset:
                  </span>
                  <button
                    type="button"
                    onClick={() => applyPreset('all')}
                    className="liquid-glass-clear px-2.5 py-1 text-[11px] cursor-pointer"
                  >
                    Semua (15)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('essential')}
                    className="liquid-glass-clear px-2.5 py-1 text-[11px] cursor-pointer"
                  >
                    Esensial
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('logistics')}
                    className="liquid-glass-clear px-2.5 py-1 text-[11px] cursor-pointer"
                  >
                    Logistik
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('financial')}
                    className="liquid-glass-clear px-2.5 py-1 text-[11px] cursor-pointer"
                  >
                    Finansial
                  </button>
                  <button
                    type="button"
                    onClick={showAllColumns}
                    className="liquid-glass-emerald px-2.5 py-1 text-[11px] cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-white" />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="text-[11px] font-mono font-semibold text-[#1E2024] bg-white/70 border border-white/90 px-2.5 py-0.5 rounded-full shadow-xs">
                  {ERP_COLUMNS.length - hiddenColumnCount} / {ERP_COLUMNS.length} Tampil
                </div>
              </div>

              {/* Search Bar inside column modal */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari kolom (contoh: CO, Artikel, Item Description, Stok, Harga)..."
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
                  Tidak ada kolom yang cocok dengan kata kunci &quot;{columnSearch}&quot;
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
                            <span className={`font-mono font-bold text-xs ${isVisible ? 'text-[#1E2024]' : 'text-zinc-400 line-through'}`}>
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
                              <span>Tampil</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                              <span>Hidden</span>
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
              <p className="text-[11px] text-[#5C6068]">
                Menyembunyikan kolom tidak menghapus data. AI Chatbot tetap membaca 15 kolom secara utuh.
              </p>
              <button
                type="button"
                onClick={() => setIsManageColumnsOpen(false)}
                className="liquid-glass-primary px-5 py-2 text-xs uppercase tracking-wider cursor-pointer text-center"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

