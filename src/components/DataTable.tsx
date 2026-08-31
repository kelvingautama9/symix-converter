import React, { useState, useMemo } from 'react';
import { ExtractedRecord, FilterStatus } from '../types';
import { Search, ChevronLeft, ChevronRight, ChevronsUpDown, Filter, ArrowDownUp, ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';

interface DataTableProps {
  data: ExtractedRecord[];
}

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sortField, setSortField] = useState<keyof ExtractedRecord | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Filter and search
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      // Search matches
      const search = searchTerm.toLowerCase().trim();
      const matchSearch =
        !search ||
        (item.CO && item.CO.toLowerCase().includes(search)) ||
        (item.Artikel && item.Artikel.toLowerCase().includes(search)) ||
        (item['Item Description'] && item['Item Description'].toLowerCase().includes(search)) ||
        (item['No PO'] && item['No PO'].toLowerCase().includes(search)) ||
        (item.Substance && item.Substance.toLowerCase().includes(search));

      if (!matchSearch) return false;

      // Status filter
      const qty = item['QTY PO (pcs)'] || 0;
      const sisa = item['Sisa OS (pcs)'] || 0;
      const stock = item['Stock (pcs)'] || 0;

      if (filterStatus === 'PARTIAL_DELIVERY') {
        return sisa < qty && sisa > 0;
      }
      if (filterStatus === 'FULL_PENDING') {
        return sisa >= qty;
      }
      if (filterStatus === 'STOCK_READY') {
        return stock >= sisa && sisa > 0;
      }
      return true;
    });
  }, [data, searchTerm, filterStatus]);

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

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (field: keyof ExtractedRecord) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  return (
    <div id="data-table-container" className="bg-white border-2 border-[#141414] shadow-[2px_2px_0px_#141414] overflow-hidden">
      {/* Table Controls Header */}
      <div className="p-4 border-b-2 border-[#141414] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#F0F0EE]">
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
            placeholder="Search PO, Item, Description, Substance..."
            className="w-full pl-9 pr-4 py-2 bg-white border-2 border-[#141414] text-xs font-mono text-[#141414] placeholder-[#141414]/40 focus:outline-none shadow-[1px_1px_0px_#141414]"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
          <button
            type="button"
            onClick={() => {
              setFilterStatus('ALL');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 border-2 border-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_#141414] ${
              filterStatus === 'ALL'
                ? 'bg-[#141414] text-white'
                : 'bg-white text-[#141414] hover:bg-[#EAEAEA]'
            }`}
          >
            All ({data.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterStatus('PARTIAL_DELIVERY');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 border-2 border-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_#141414] ${
              filterStatus === 'PARTIAL_DELIVERY'
                ? 'bg-[#FF6B35] text-white'
                : 'bg-white text-[#141414] hover:bg-[#EAEAEA]'
            }`}
          >
            Partial Delivery
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterStatus('FULL_PENDING');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 border-2 border-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_#141414] ${
              filterStatus === 'FULL_PENDING'
                ? 'bg-[#DEDEDE] text-[#141414]'
                : 'bg-white text-[#141414] hover:bg-[#EAEAEA]'
            }`}
          >
            Pending Delivery
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterStatus('STOCK_READY');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 border-2 border-[#141414] transition-all cursor-pointer shadow-[1px_1px_0px_#141414] ${
              filterStatus === 'STOCK_READY'
                ? 'bg-[#25D366] text-white'
                : 'bg-white text-[#141414] hover:bg-[#EAEAEA]'
            }`}
          >
            Stock Ready
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
                className="py-3 px-3 cursor-pointer hover:bg-black transition-colors border-r border-white/20"
              >
                <div className="flex items-center gap-1.5">
                  <span>1. CO</span>
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
                onClick={() => handleSort('Harga')}
                className="py-3 px-3 pr-4 text-right cursor-pointer hover:bg-black transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>12. Harga</span>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141414]/15 font-mono text-xs">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-12 text-center text-[#141414]/60 font-sans font-medium">
                  Tidak ada data yang sesuai dengan pencarian atau filter.
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                const globalIndex = (currentPage - 1) * pageSize + idx + 1;
                const isDeliveredPartial = row['Sisa OS (pcs)'] < row['QTY PO (pcs)'];

                return (
                  <tr
                    key={`${row.CO}-${row.Artikel}-${row['No PO']}-${idx}`}
                    className="hover:bg-[#F0F0EE] transition-colors group"
                  >
                    <td className="py-2.5 px-3 pl-4 text-[#141414]/60 border-r border-[#141414]/10">
                      {globalIndex}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-[#141414] border-r border-[#141414]/10">
                      <span className="px-1.5 py-0.5 bg-[#F0F0EE] border border-[#141414] text-[#141414] text-[11px] font-mono">
                        {row.CO || '-'}
                      </span>
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
          Showing <span className="font-bold">{filteredData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> -{' '}
          <span className="font-bold">{Math.min(currentPage * pageSize, filteredData.length)}</span> of{' '}
          <span className="font-bold">{filteredData.length}</span> PO Records
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-bold uppercase text-[10px]">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border-2 border-[#141414] text-[#141414] font-bold px-2 py-0.5 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 border-2 border-[#141414] bg-white hover:bg-[#DEDEDE] text-[#141414] disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[1px_1px_0px_#141414] active:translate-x-0.5 active:translate-y-0.5"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
