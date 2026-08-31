import React, { useState, useMemo } from 'react';
import { ExtractedRecord, FilterStatus, CoFilterStatus } from '../types';
import { Search, ChevronLeft, ChevronRight, ChevronsUpDown, Filter, Layers, CheckCircle2, Clock } from 'lucide-react';
import { haptic } from '../utils/haptics';

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

  // Tab counts based on current CO filter
  const filterCounts = useMemo(() => {
    let partial = 0;
    let pending = 0;
    let stockReady = 0;
    let totalInCoScope = 0;

    data.forEach((item) => {
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
  }, [data, coFilter]);

  // Filter and search
  const filteredData = useMemo(() => {
    return data.filter((item) => {
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
  }, [data, searchTerm, coFilter, filterStatus]);

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

  return (
    <div id="data-table-container" className="bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] overflow-hidden">
      {/* Table Controls Header */}
      <div className="p-4 border-b-2 border-[#141414] flex flex-col gap-3.5 bg-[#F0F0EE]">
        {/* Row 1: Search & CO Status Quick Tabs */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
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
              className="w-full pl-9 pr-4 py-2 bg-white border-2 border-[#141414] text-xs font-mono text-[#141414] placeholder-[#141414]/40 focus:outline-none shadow-[1px_1px_0px_#141414]"
            />
          </div>

          {/* Filter 1: CO Status (ALL / OPEN / CLOSED) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#141414] mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#FF6B35]" />
              <span>Status CO:</span>
            </span>
            <button
              type="button"
              id="filter-co-all"
              onClick={() => handleCoFilterChange('ALL')}
              className={`px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider border-2 border-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_#141414] ${
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
              className={`px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider border-2 border-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_#141414] flex items-center gap-1.5 ${
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
              className={`px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider border-2 border-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_#141414] flex items-center gap-1.5 ${
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

        {/* Row 2: Delivery & Stock Secondary Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-wider pt-1 border-t border-[#141414]/15">
          <span className="text-[10px] font-black uppercase text-[#141414]/70 mr-1">
            Status Kirim:
          </span>
          <button
            type="button"
            onClick={() => handleDeliveryFilterChange('ALL')}
            className={`px-2.5 py-1 border-2 border-[#141414] transition-all cursor-pointer text-[11px] shadow-[1px_1px_0px_#141414] ${
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
            className={`px-2.5 py-1 border-2 border-[#141414] transition-all cursor-pointer text-[11px] shadow-[1px_1px_0px_#141414] ${
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
            className={`px-2.5 py-1 border-2 border-[#141414] transition-all cursor-pointer text-[11px] shadow-[1px_1px_0px_#141414] ${
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
            className={`px-2.5 py-1 border-2 border-[#141414] transition-all cursor-pointer text-[11px] shadow-[1px_1px_0px_#141414] ${
              filterStatus === 'STOCK_READY'
                ? 'bg-[#25D366] text-white'
                : 'bg-white text-[#141414] hover:bg-[#EAEAEA]'
            }`}
          >
            Stock Ready ({filterCounts.stockReady})
          </button>
        </div>
      </div>

      {/* Table Scroll Area */}
      <div className="overflow-x-auto">
        <table id="erp-extracted-table" className="w-full text-left text-xs whitespace-nowrap border-collapse">
          <thead>
            <tr className="bg-[#141414] text-white text-[11px] font-mono font-bold uppercase tracking-wider">
              <th className="py-3 px-3 pl-4 border-r border-white/20">#</th>
              <th
                onClick={() => handleSort('CO')}
                className="py-3 px-3 cursor-pointer hover:bg-black transition-colors border-r border-white/20 min-w-[160px]"
              >
                <div className="flex items-center gap-1.5">
                  <span>1. CO (Customer Order)</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Artikel')}
                className="py-3 px-3 cursor-pointer hover:bg-black transition-colors border-r border-white/20"
              >
                <div className="flex items-center gap-1.5">
                  <span>2. Artikel</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Item Description')}
                className="py-3 px-3 cursor-pointer hover:bg-black transition-colors min-w-[220px] border-r border-white/20"
              >
                <div className="flex items-center gap-1.5">
                  <span>3. Item Description</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('No PO')}
                className="py-3 px-3 cursor-pointer hover:bg-black transition-colors border-r border-white/20"
              >
                <div className="flex items-center gap-1.5">
                  <span>4. No PO (Clean)</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Substance')}
                className="py-3 px-3 cursor-pointer hover:bg-black transition-colors border-r border-white/20"
              >
                <div className="flex items-center gap-1.5">
                  <span>5. Substance</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('QTY PO (pcs)')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>6. QTY PO (pcs)</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Berat PO (KG)')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>7. Berat PO (KG)</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Stock (pcs)')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>8. Stock (pcs)</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Stock (kg)')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>9. Stock (kg)</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Sisa OS (pcs)')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20 bg-[#FF6B35]"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>10. Sisa OS (pcs)</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Sisa OS (kg)')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>11. Sisa OS (kg)</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Terkirim (PCS)')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20 bg-[#2E7D32]"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>12. Terkirim (PCS)</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Terkirim (KG)')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-black transition-colors border-r border-white/20"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>13. Terkirim (KG)</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('Harga')}
                className="py-3 px-3 pr-4 text-right cursor-pointer hover:bg-black transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>14. Harga</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141414]/15 font-mono text-xs">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={15} className="py-12 text-center text-[#141414]/60 font-sans font-medium">
                  Tidak ada data yang sesuai dengan filter Status CO atau pencarian saat ini.
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                const globalIndex = isUnlimited
                  ? idx + 1
                  : (currentPage - 1) * effectivePageSize + idx + 1;
                const isDeliveredPartial = row['Sisa OS (pcs)'] < row['QTY PO (pcs)'];
                const terkirimPcs = row['Terkirim (PCS)'] !== undefined ? row['Terkirim (PCS)'] : Math.max(0, row['QTY PO (pcs)'] - row['Sisa OS (pcs)']);
                const terkirimKg = row['Terkirim (KG)'] !== undefined ? row['Terkirim (KG)'] : Math.max(0, row['Berat PO (KG)'] - row['Sisa OS (kg)']);
                const isCOOpen = row.coStatus === 'OPEN';
                const isCOClosed = row.coStatus === 'CLOSED';

                return (
                  <tr
                    key={`${row.CO}-${row.Artikel}-${row['No PO']}-${idx}`}
                    className="hover:bg-[#F0F0EE] transition-colors group"
                  >
                    <td className="py-2.5 px-3 pl-4 text-[#141414]/60 border-r border-[#141414]/10">
                      {globalIndex}
                    </td>
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
                    <td className="py-2.5 px-3 font-bold text-[#141414] border-r border-[#141414]/10">
                      <span className="px-1.5 py-0.5 bg-[#DEDEDE] border border-[#141414] text-[#141414] text-[11px] font-mono">
                        {row.Artikel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#141414] font-sans font-medium whitespace-normal max-w-xs line-clamp-1 group-hover:line-clamp-none border-r border-[#141414]/10">
                      {row['Item Description']}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-[#141414] border-r border-[#141414]/10">
                      {row['No PO']}
                    </td>
                    <td className="py-2.5 px-3 text-[#141414]/70 font-sans border-r border-[#141414]/10">
                      {row.Substance || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#141414] font-bold border-r border-[#141414]/10">
                      {row['QTY PO (pcs)'].toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#141414]/70 border-r border-[#141414]/10">
                      {row['Berat PO (KG)'].toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#141414] font-medium border-r border-[#141414]/10">
                      {row['Stock (pcs)'].toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#141414]/70 border-r border-[#141414]/10">
                      {row['Stock (kg)'].toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-[#141414] bg-[#FF6B35]/15 border-r border-[#141414]/10">
                      {row['Sisa OS (pcs)'].toLocaleString('id-ID')}
                      {isDeliveredPartial && (
                        <span className="ml-1 inline-block text-[10px] text-green-700 font-sans font-bold">
                          (SJ✓)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#141414]/80 border-r border-[#141414]/10">
                      {row['Sisa OS (kg)'].toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-green-800 bg-green-50/60 border-r border-[#141414]/10">
                      {terkirimPcs > 0 ? terkirimPcs.toLocaleString('id-ID') : '0'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#141414]/80 border-r border-[#141414]/10">
                      {terkirimKg > 0 ? terkirimKg.toLocaleString('id-ID') : '0'}
                    </td>
                    <td className="py-2.5 px-3 pr-4 text-right text-[#141414] font-bold">
                      {row.Harga > 0 ? `Rp ${row.Harga.toLocaleString('id-ID')}` : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Pagination Footer */}
      <div className="p-4 border-t-2 border-[#141414] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#141414] font-mono bg-[#F0F0EE]">
        <div>
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
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-bold uppercase text-[10px]">Tampilkan:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="bg-white border-2 border-[#141414] text-[#141414] font-bold px-2 py-1 text-xs focus:outline-none cursor-pointer"
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                className="p-1 border-2 border-[#141414] bg-white hover:bg-[#DEDEDE] text-[#141414] disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-bold font-mono">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                className="p-1 border-2 border-[#141414] bg-white hover:bg-[#DEDEDE] text-[#141414] disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

