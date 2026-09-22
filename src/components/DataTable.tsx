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
      return true;
    });
  }, [scopedData, searchTerm, coFilter, filterStatus]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortField) return filteredData;
    return [...filteredData].sort((a, b) => {
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
          ? "fixed inset-0 z-50 bg-[#F0F0EE] flex flex-col p-2.5 sm:p-4 overflow-hidden"
          : "bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] overflow-hidden"
      }
    >
      {/* Fullscreen Dedicated Top Bar */}
      {isFullscreen && (
        <div className="bg-[#141414] text-white p-2.5 sm:p-3 border-2 border-[#141414] flex items-center justify-between gap-3 shadow-[2px_2px_0px_#141414] mb-2.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shrink-0">
              <TableIcon className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-black font-mono uppercase tracking-wider text-white truncate">
                  Tabel Master ERP PO — Mode Layar Penuh
                </h2>
                <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-400/40 text-[10px] font-mono font-bold">
                  {filteredData.length} Baris PO
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] font-mono text-white/60 truncate hidden sm:block">
                Gunakan scroll leluasa vertikal & horizontal tanpa terganggu komponen dashboard lain (Tekan ESC untuk keluar)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              haptic.medium();
              setIsFullscreen(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B35] hover:bg-[#ff5719] text-white border-2 border-white text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-[2px_2px_0px_white] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer shrink-0"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Keluar Layar Penuh (ESC)</span>
          </button>
        </div>
      )}

      {/* Table Controls Header */}
      <div className="p-3.5 sm:p-4 border-b-2 border-[#141414] flex flex-col gap-3 bg-[#F0F0EE] shrink-0">
        {/* Row 1: Search & CO Status Quick Tabs */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-full lg:max-w-md">
            <Search className="w-4 h-4 text-[#141414] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="table-search-input"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search PO, CO, Item, Description, Substance..."
              className="w-full pl-9 pr-4 py-2 bg-white border-2 border-[#141414] text-xs font-mono text-[#141414] placeholder-[#141414]/40 focus:outline-none shadow-[1px_1px_0px_#141414] min-h-[40px]"
            />
          </div>

          {/* Filter 1: CO Status (ALL / OPEN / CLOSED) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#141414] mr-0.5 sm:mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#FF6B35]" />
              <span>Status CO:</span>
            </span>
            <button
              type="button"
              id="filter-co-all"
              onClick={() => handleCoFilterChange('ALL')}
              className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold font-mono uppercase tracking-wider border-2 border-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 min-h-[36px] flex items-center justify-center ${
                coFilter === 'ALL'
                  ? 'bg-[#141414] text-white'
                  : 'bg-white text-[#141414] hover:bg-[#EAEAEA]'
              }`}
            >
              Semua CO ({coCounts.all})
            </button>
            <button
              type="button"
              id="filter-co-open"
              onClick={() => handleCoFilterChange('OPEN')}
              className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold font-mono uppercase tracking-wider border-2 border-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 min-h-[36px] flex items-center gap-1.5 ${
                coFilter === 'OPEN'
                  ? 'bg-[#2E7D32] text-white'
                  : 'bg-white text-[#2E7D32] hover:bg-emerald-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${coFilter === 'OPEN' ? 'bg-white' : 'bg-[#2E7D32]'}`} />
              <span>CO Open ({coCounts.open})</span>
            </button>
            <button
              type="button"
              id="filter-co-closed"
              onClick={() => handleCoFilterChange('CLOSED')}
              className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold font-mono uppercase tracking-wider border-2 border-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 min-h-[36px] flex items-center gap-1.5 ${
                coFilter === 'CLOSED'
                  ? 'bg-[#555] text-white'
                  : 'bg-white text-[#555] hover:bg-[#EAEAEA]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${coFilter === 'CLOSED' ? 'bg-white' : 'bg-[#555]'}`} />
              <span>CO Closed ({coCounts.closed})</span>
            </button>
          </div>
        </div>

        {/* Row 2: Delivery Filters (Left) & Responsiveness/Scroll View Controls (Right) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2 border-t border-[#141414]/15">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
            <span className="text-[10px] font-black uppercase text-[#141414]/70 mr-1">
              Status Kirim:
            </span>
            <button
              type="button"
              onClick={() => handleDeliveryFilterChange('ALL')}
              className={`px-2 sm:px-2.5 py-1 border-2 border-[#141414] transition-all cursor-pointer text-[10px] sm:text-[11px] shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 ${
                filterStatus === 'ALL'
                  ? 'bg-[#141414] text-white'
                  : 'bg-white text-[#141414] hover:bg-[#EAEAEA]'
              }`}
            >
              Semua ({filterCounts.all})
            </button>
            <button
              type="button"
              onClick={() => handleDeliveryFilterChange('PARTIAL_DELIVERY')}
              className={`px-2 sm:px-2.5 py-1 border-2 border-[#141414] transition-all cursor-pointer text-[10px] sm:text-[11px] shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 ${
                filterStatus === 'PARTIAL_DELIVERY'
                  ? 'bg-[#FF6B35] text-white'
                  : 'bg-white text-[#141414] hover:bg-[#EAEAEA]'
              }`}
            >
              Partial Delivery ({filterCounts.partial})
            </button>
            <button
              type="button"
              onClick={() => handleDeliveryFilterChange('FULL_PENDING')}
              className={`px-2 sm:px-2.5 py-1 border-2 border-[#141414] transition-all cursor-pointer text-[10px] sm:text-[11px] shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 ${
                filterStatus === 'FULL_PENDING'
                  ? 'bg-[#DEDEDE] text-[#141414]'
                  : 'bg-white text-[#141414] hover:bg-[#EAEAEA]'
              }`}
            >
              Pending Delivery ({filterCounts.pending})
            </button>
            <button
              type="button"
              onClick={() => handleDeliveryFilterChange('STOCK_READY')}
              className={`px-2 sm:px-2.5 py-1 border-2 border-[#141414] transition-all cursor-pointer text-[10px] sm:text-[11px] shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 ${
                filterStatus === 'STOCK_READY'
                  ? 'bg-[#25D366] text-white'
                  : 'bg-white text-[#141414] hover:bg-[#EAEAEA]'
              }`}
            >
              Stock Ready ({filterCounts.stockReady})
            </button>
          </div>

          {/* Opsi Scroll & View Mode */}
          <div className="flex items-center gap-1.5 flex-wrap self-start md:self-auto">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#141414]/70 mr-0.5">
              Mode Scroll:
            </span>

            {/* Segmented Control: Bebas Halaman vs Kunci Kotak */}
            <div className="inline-flex border-2 border-[#141414] bg-white p-0.5 shadow-[1px_1px_0px_#141414]">
              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setScrollMode('page');
                }}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] sm:text-[11px] font-mono font-bold uppercase transition-all cursor-pointer ${
                  scrollMode === 'page'
                    ? 'bg-[#141414] text-white shadow-[1px_1px_0px_#141414]'
                    : 'text-[#141414] hover:bg-[#EAEAEA]'
                }`}
                title="Scroll mouse bebas menggerakkan seluruh halaman web tanpa tersangkut di dalam tabel"
              >
                <Unlock className={`w-3 h-3 ${scrollMode === 'page' ? 'text-emerald-400' : 'text-[#141414]'}`} />
                <span>Bebas Halaman</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  setScrollMode('box');
                }}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] sm:text-[11px] font-mono font-bold uppercase transition-all cursor-pointer ${
                  scrollMode === 'box'
                    ? 'bg-[#141414] text-white shadow-[1px_1px_0px_#141414]'
                    : 'text-[#141414] hover:bg-[#EAEAEA]'
                }`}
                title="Batasi tabel dalam kotak scroll 70vh dengan scrollbar internal"
              >
                <Lock className={`w-3 h-3 ${scrollMode === 'box' ? 'text-amber-400' : 'text-[#141414]'}`} />
                <span>Kunci Kotak</span>
              </button>
            </div>

            {/* Fullscreen Table Mode Button */}
            <button
              type="button"
              onClick={() => {
                haptic.medium();
                setIsFullscreen(!isFullscreen);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-[#141414] text-[#141414] hover:text-white border-2 border-[#141414] font-mono font-bold text-[10px] sm:text-[11px] uppercase tracking-wider transition-all shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[30px]"
              title={isFullscreen ? "Keluar layar penuh (ESC)" : "Buka tabel dalam mode layar penuh (Full Spreadsheet View)"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-[#FF6B35]" />
                  <span>Keluar Full</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-[#FF6B35]" />
                  <span>Layar Penuh</span>
                </>
              )}
            </button>

            {/* Custom Columns / Rows Button */}
            {hiddenColumnCount > 0 && (
              <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-100 border-2 border-amber-800 text-amber-950 text-[10px] sm:text-[11px] font-mono font-bold shadow-[1px_1px_0px_#78350f]">
                <EyeOff className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                <span>{hiddenColumnCount} Row Tersembunyi</span>
                <button
                  type="button"
                  onClick={showAllColumns}
                  className="ml-1 px-1.5 py-0.5 bg-amber-800 hover:bg-amber-900 text-white text-[9px] font-bold uppercase shadow-[1px_1px_0px_black] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer flex items-center gap-1"
                  title="Tampilkan semua row / kolom (Reset)"
                >
                  <RotateCcw className="w-3 h-3 text-white" />
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
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 border-2 border-[#141414] font-mono font-bold text-[10px] sm:text-[11px] uppercase tracking-wider transition-all shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer min-h-[30px] ${
                hiddenColumnCount > 0
                  ? 'bg-amber-200 text-amber-950 hover:bg-amber-300 border-amber-800'
                  : 'bg-white hover:bg-[#EAEAEA] text-[#141414]'
              }`}
              title="Kustomisasi Row / Kolom (1. CO, 2. Artikel, 3. Item Description, dst)"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#141414]" />
              <span>Kustom Row {hiddenColumnCount > 0 ? `(${hiddenColumnCount} Hide)` : ''}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table Scroll Area with Sticky Header (Only sticky in 'box' and 'isFullscreen' modes) */}
      <div
        className={
          isFullscreen
            ? "flex-1 min-h-0 overflow-x-auto overflow-y-auto relative border-2 border-[#141414] bg-white"
            : scrollMode === 'page'
            ? "overflow-x-auto relative"
            : "overflow-x-auto overflow-y-auto max-h-[68vh] sm:max-h-[74vh] relative"
        }
      >
        <table id="erp-extracted-table" className="w-full text-left text-xs whitespace-nowrap border-collapse">
          <thead className={`${isStickyHeader ? 'sticky top-0 z-20 shadow-[0_2px_4px_rgba(0,0,0,0.15)]' : 'relative z-10'} bg-[#141414]`}>
            <tr className="bg-[#141414] text-white text-[11px] font-mono font-bold uppercase tracking-wider">
              <th className={`${thStickyClass} bg-[#141414] py-3 px-3 pl-4 border-r border-white/20`}>#</th>

              {visibleColumns.co && (
                <th
                  onClick={() => handleSort('CO')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 cursor-pointer hover:bg-black transition-colors border-r border-white/20 min-w-[160px]`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>1. CO (Customer Order)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.artikel && (
                <th
                  onClick={() => handleSort('Artikel')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 cursor-pointer hover:bg-black transition-colors border-r border-white/20`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>2. Artikel</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.itemDescription && (
                <th
                  onClick={() => handleSort('Item Description')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 cursor-pointer hover:bg-black transition-colors min-w-[220px] border-r border-white/20`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>3. Item Description</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.tanggalInput && (
                <th
                  onClick={() => handleSort('Tanggal Input PO')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 cursor-pointer hover:bg-black transition-colors border-r border-white/20 min-w-[140px]`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>4. Tanggal Input PO</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.noPo && (
                <th
                  onClick={() => handleSort('No PO')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 cursor-pointer hover:bg-black transition-colors border-r border-white/20`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>5. No PO (Clean)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.substance && (
                <th
                  onClick={() => handleSort('Substance')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 cursor-pointer hover:bg-black transition-colors border-r border-white/20`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>6. Substance</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.qtyPo && (
                <th
                  onClick={() => handleSort('QTY PO (pcs)')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>7. QTY PO (pcs)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.beratPo && (
                <th
                  onClick={() => handleSort('Berat PO (KG)')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>8. Berat PO (KG)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.stockPcs && (
                <th
                  onClick={() => handleSort('Stock (pcs)')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>9. Stock (pcs)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.stockKg && (
                <th
                  onClick={() => handleSort('Stock (kg)')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>10. Stock (kg)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.sisaOsPcs && (
                <th
                  onClick={() => handleSort('Sisa OS (pcs)')}
                  className={`${thStickyClass} py-3 px-3 text-right cursor-pointer hover:opacity-90 transition-colors border-r border-white/20 bg-[#FF6B35]`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>11. Sisa OS (pcs)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.sisaOsKg && (
                <th
                  onClick={() => handleSort('Sisa OS (kg)')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>12. Sisa OS (kg)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.terkirimPcs && (
                <th
                  onClick={() => handleSort('Terkirim (PCS)')}
                  className={`${thStickyClass} py-3 px-3 text-right cursor-pointer hover:opacity-90 transition-colors border-r border-white/20 bg-[#2E7D32]`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>13. Terkirim (PCS)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.terkirimKg && (
                <th
                  onClick={() => handleSort('Terkirim (KG)')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>14. Terkirim (KG)</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}

              {visibleColumns.harga && (
                <th
                  onClick={() => handleSort('Harga')}
                  className={`${thStickyClass} bg-[#141414] py-3 px-3 pr-4 text-right cursor-pointer hover:bg-black transition-colors`}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>15. Harga</span>
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141414]/15 font-mono text-xs">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="py-12 text-center text-[#141414]/60 font-sans font-medium">
                  Tidak ada data yang sesuai dengan filter Status CO atau pencarian saat ini.
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
                    className="hover:bg-[#F0F0EE] transition-colors group"
                  >
                    <td className="py-2.5 px-3 pl-4 text-[#141414]/70 border-r border-[#141414]/10 font-mono font-bold">
                      {originalIndex}
                    </td>

                    {visibleColumns.co && (
                      <td className="py-2.5 px-3 font-bold text-[#141414] border-r border-[#141414]/10">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-[#F0F0EE] border border-[#141414] text-[#141414] text-[11px] font-mono">
                            {row.CO || '-'}
                          </span>
                          {isCOOpen && (
                            <span
                              className="px-1.5 py-0.5 bg-emerald-100 border border-emerald-600 text-emerald-800 text-[9px] font-black uppercase"
                              title="CO Status: OPEN (Masih Terbuka / Berjalan)"
                            >
                              OPEN
                            </span>
                          )}
                          {isCOClosed && (
                            <span
                              className="px-1.5 py-0.5 bg-zinc-100 border border-zinc-400 text-zinc-600 text-[9px] font-bold uppercase"
                              title="CO Status: CLOSED (Selesai / Ditutup)"
                            >
                              CLOSED
                            </span>
                          )}
                        </div>
                      </td>
                    )}

                    {visibleColumns.artikel && (
                      <td className="py-2.5 px-3 font-bold text-[#141414] border-r border-[#141414]/10">
                        <span className="px-1.5 py-0.5 bg-[#DEDEDE] border border-[#141414] text-[#141414] text-[11px] font-mono">
                          {row.Artikel}
                        </span>
                      </td>
                    )}

                    {visibleColumns.itemDescription && (
                      <td className="py-2.5 px-3 text-[#141414] font-sans font-medium whitespace-normal max-w-xs line-clamp-1 group-hover:line-clamp-none border-r border-[#141414]/10">
                        {row['Item Description']}
                      </td>
                    )}

                    {visibleColumns.tanggalInput && (
                      <td className="py-2.5 px-3 text-[#141414] font-mono border-r border-[#141414]/10">
                        {row['Tanggal Input PO'] && row['Tanggal Input PO'] !== '-' ? (
                          <span className="px-1.5 py-0.5 bg-[#F0F0EE] border border-[#141414]/40 text-[#141414] text-[11px] font-mono font-medium whitespace-nowrap">
                            {row['Tanggal Input PO']}
                          </span>
                        ) : (
                          <span className="text-[#141414]/40">-</span>
                        )}
                      </td>
                    )}

                    {visibleColumns.noPo && (
                      <td className="py-2.5 px-3 font-bold text-[#141414] border-r border-[#141414]/10">
                        {row['No PO']}
                      </td>
                    )}

                    {visibleColumns.substance && (
                      <td className="py-2.5 px-3 text-[#141414]/70 font-sans border-r border-[#141414]/10">
                        {row.Substance || '-'}
                      </td>
                    )}

                    {visibleColumns.qtyPo && (
                      <td className="py-2.5 px-3 text-right text-[#141414] font-bold border-r border-[#141414]/10">
                        {row['QTY PO (pcs)'].toLocaleString('id-ID')}
                      </td>
                    )}

                    {visibleColumns.beratPo && (
                      <td className="py-2.5 px-3 text-right text-[#141414]/70 border-r border-[#141414]/10">
                        {row['Berat PO (KG)'].toLocaleString('id-ID')}
                      </td>
                    )}

                    {visibleColumns.stockPcs && (
                      <td className="py-2.5 px-3 text-right text-[#141414] font-medium border-r border-[#141414]/10">
                        {row['Stock (pcs)'].toLocaleString('id-ID')}
                      </td>
                    )}

                    {visibleColumns.stockKg && (
                      <td className="py-2.5 px-3 text-right text-[#141414]/70 border-r border-[#141414]/10">
                        {row['Stock (kg)'].toLocaleString('id-ID')}
                      </td>
                    )}

                    {visibleColumns.sisaOsPcs && (
                      <td className="py-2.5 px-3 text-right font-black text-[#141414] bg-[#FF6B35]/15 border-r border-[#141414]/10">
                        {row['Sisa OS (pcs)'].toLocaleString('id-ID')}
                        {isDeliveredPartial && (
                          <span className="ml-1 inline-block text-[10px] text-green-700 font-sans font-bold">
                            (SJ✓)
                          </span>
                        )}
                      </td>
                    )}

                    {visibleColumns.sisaOsKg && (
                      <td className="py-2.5 px-3 text-right text-[#141414]/80 border-r border-[#141414]/10">
                        {row['Sisa OS (kg)'].toLocaleString('id-ID')}
                      </td>
                    )}

                    {visibleColumns.terkirimPcs && (
                      <td className="py-2.5 px-3 text-right font-bold text-green-800 bg-green-50/60 border-r border-[#141414]/10">
                        {terkirimPcs > 0 ? terkirimPcs.toLocaleString('id-ID') : '0'}
                      </td>
                    )}

                    {visibleColumns.terkirimKg && (
                      <td className="py-2.5 px-3 text-right text-[#141414]/80 border-r border-[#141414]/10">
                        {terkirimKg > 0 ? terkirimKg.toLocaleString('id-ID') : '0'}
                      </td>
                    )}

                    {visibleColumns.harga && (
                      <td className="py-2.5 px-3 pr-4 text-right text-[#141414] font-bold">
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
      <div className="p-3 sm:p-4 border-t-2 border-[#141414] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs text-[#141414] font-mono bg-[#F0F0EE] shrink-0">
        <div className="flex items-center gap-2 flex-wrap text-center sm:text-left text-[11px] sm:text-xs">
          {isUnlimited ? (
            <span>
              Menampilkan semua <span className="font-bold">{filteredData.length}</span> PO Records (Tanpa Limit)
            </span>
          ) : (
            <span>
              Showing <span className="font-bold">{filteredData.length === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1}</span> -{' '}
              <span className="font-bold">{Math.min(currentPage * effectivePageSize, filteredData.length)}</span> of{' '}
              <span className="font-bold">{filteredData.length}</span> PO Records
            </span>
          )}

          {/* Quick scroll-to-top button */}
          <button
            type="button"
            onClick={() => {
              haptic.light();
              tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="inline-flex items-center gap-1 px-2 py-1 border-2 border-[#141414] bg-white hover:bg-[#DEDEDE] text-[#141414] font-bold text-[10px] shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer ml-1"
            title="Kembali ke atas tabel"
          >
            <ArrowUp className="w-3 h-3" />
            <span>Ke Atas Tabel</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 sm:gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-bold uppercase text-[10px]">Tampilkan:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="bg-white border-2 border-[#141414] text-[#141414] font-bold px-2 py-1.5 text-xs focus:outline-none cursor-pointer min-h-[36px]"
            >
              <option value={0}>Semua Data (Unlimited)</option>
              <option value={25}>25 Baris</option>
              <option value={50}>50 Baris</option>
              <option value={100}>100 Baris</option>
              <option value={250}>250 Baris</option>
              <option value={500}>500 Baris</option>
              <option value={1000}>1000 Baris</option>
              <option value={5000}>5000 Baris</option>
            </select>
          </div>

          {!isUnlimited && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                className="p-1.5 sm:p-1 border-2 border-[#141414] bg-white hover:bg-[#DEDEDE] text-[#141414] disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-bold font-mono text-[11px] sm:text-xs">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                className="p-1.5 sm:p-1 border-2 border-[#141414] bg-white hover:bg-[#DEDEDE] text-[#141414] disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
                aria-label="Halaman berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Dialog: Kelola & Kustomisasi Row / Kolom Tabel (Hide / Unhide) */}
      {isManageColumnsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={() => setIsManageColumnsOpen(false)}
        >
          <div
            className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_#141414] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-[#141414] text-white p-3.5 sm:p-4 flex items-center justify-between gap-3 border-b-2 border-[#141414]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-[#FF6B35]" />
                <div>
                  <h3 className="font-mono font-bold text-sm sm:text-base uppercase tracking-wider">
                    Kustomisasi Row / Kolom Tabel
                  </h3>
                  <p className="text-[11px] text-white/70 font-sans mt-0.5">
                    Pilih apa saja yang ingin ditampilkan (1. CO, 2. Artikel, 3. Item Description, dst). Data tetap utuh untuk AI Chatbot.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManageColumnsOpen(false)}
                className="p-1.5 hover:bg-white/20 text-white transition-colors cursor-pointer border border-white/20"
                title="Tutup (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Presets & Quick Filters */}
            <div className="p-3 sm:p-4 bg-[#F0F0EE] border-b-2 border-[#141414] flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono font-bold uppercase text-[#141414]/70 mr-1">
                    Preset Tampilan:
                  </span>
                  <button
                    type="button"
                    onClick={() => applyPreset('all')}
                    className="px-2 py-1 bg-white hover:bg-[#DEDEDE] border border-[#141414] text-[#141414] text-[10px] sm:text-[11px] font-mono font-bold shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                  >
                    Semua (15)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('essential')}
                    className="px-2 py-1 bg-white hover:bg-[#DEDEDE] border border-[#141414] text-[#141414] text-[10px] sm:text-[11px] font-mono font-bold shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                  >
                    Esensial
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('logistics')}
                    className="px-2 py-1 bg-white hover:bg-[#DEDEDE] border border-[#141414] text-[#141414] text-[10px] sm:text-[11px] font-mono font-bold shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                  >
                    Logistik & Stok
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('financial')}
                    className="px-2 py-1 bg-white hover:bg-[#DEDEDE] border border-[#141414] text-[#141414] text-[10px] sm:text-[11px] font-mono font-bold shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                  >
                    Finansial
                  </button>
                  <button
                    type="button"
                    onClick={showAllColumns}
                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 border border-[#141414] text-white text-[10px] sm:text-[11px] font-mono font-bold shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3 text-white" />
                    <span>Reset</span>
                  </button>
                </div>

                <div className="text-[11px] font-mono font-bold text-[#141414] bg-white border border-[#141414] px-2 py-0.5">
                  {ERP_COLUMNS.length - hiddenColumnCount} / {ERP_COLUMNS.length} Tampil
                </div>
              </div>

              {/* Search Bar inside column modal */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#141414]/60 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari row/kolom (contoh: CO, Artikel, Item Description, Stok, Harga)..."
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border-2 border-[#141414] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] font-mono font-medium"
                />
                {columnSearch && (
                  <button
                    type="button"
                    onClick={() => setColumnSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#141414]/50 hover:text-black"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* List of Columns with Toggle Switches */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#141414]/15 max-h-[50vh] p-2 bg-white">
              {filteredModalColumns.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#141414]/60 font-mono">
                  Tidak ada row/kolom yang cocok dengan kata kunci &quot;{columnSearch}&quot;
                </div>
              ) : (
                filteredModalColumns.map((col) => {
                  const isVisible = visibleColumns[col.key];

                  return (
                    <div
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className={`flex items-center justify-between gap-3 p-2.5 rounded transition-all cursor-pointer select-none ${
                        isVisible ? 'hover:bg-[#F0F0EE]' : 'bg-amber-50/50 hover:bg-amber-50 opacity-80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded bg-[#141414] text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                          {col.number}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-mono font-bold text-xs ${isVisible ? 'text-[#141414]' : 'text-[#141414]/60 line-through'}`}>
                              {col.label}
                            </span>
                            <span className="px-1.5 py-0.2 bg-[#F0F0EE] border border-[#141414]/40 text-[9px] font-mono font-bold text-[#141414]/80 uppercase">
                              {col.badge}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#141414]/65 font-sans truncate">
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
                          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-bold border-2 transition-all cursor-pointer shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 ${
                            isVisible
                              ? 'bg-emerald-100 border-emerald-800 text-emerald-950 hover:bg-emerald-200'
                              : 'bg-amber-100 border-amber-800 text-amber-950 hover:bg-amber-200'
                          }`}
                        >
                          {isVisible ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-800" />
                              <span>Tampil</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-amber-800" />
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
            <div className="p-3 sm:p-4 bg-[#F0F0EE] border-t-2 border-[#141414] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <p className="text-[11px] text-[#141414]/80 font-sans">
                <span className="font-bold">Info:</span> Menyembunyikan row pada tampilan web tidak menghapus data. AI Chatbot tetap membaca seluruh 15 row/kolom ERP secara utuh.
              </p>
              <button
                type="button"
                onClick={() => setIsManageColumnsOpen(false)}
                className="px-5 py-2 bg-[#141414] hover:bg-black text-white text-xs font-mono font-bold uppercase shadow-[2px_2px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-center"
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

