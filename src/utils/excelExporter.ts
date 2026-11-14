import * as XLSX from 'xlsx';
import {
  ExtractedRecord,
  ExcelExportScope,
  DetailSJExportScope,
  DeliveryStatusTag,
  SalesOrderExportScope,
  SalesDeliveryMode,
  SalesOrderRow,
} from '../types';
import {
  recalculateFIFOStock,
  flattenDeliveriesForDataEntry,
  flattenSalesOrderRows,
  comparePoNumberAsc,
  isK200Substance,
} from './parserEngine';
import {
  getDeliveryStatusTag,
  calculateOrderAgingDetails,
} from './agingUtils';

export const EXCEL_COLUMNS = [
  'CO',
  'Artikel',
  'Item Description',
  'Tanggal Input PO',
  'No PO',
  'Substance',
  'QTY PO (pcs)',
  'Berat PO (KG)',
  'Stock (pcs)',
  'Stock (kg)',
  'Sisa OS (pcs)',
  'Sisa OS (kg)',
  'Terkirim (PCS)',
  'Terkirim (KG)',
  'Over Stock Gudang (PCS)',
  'Over Stock Gudang (KG)',
  'Over Kiriman (PCS)',
  'Over Kiriman (KG)',
  'Harga',
] as const;

/**
 * 28-Column Master Data Entry Schema for Mode Detail Kiriman SJ:
 * A (0): CO
 * B (1): Status CO
 * C (2): Artikel
 * D (3): Item Description
 * E (4): Tanggal Input PO
 * F (5): No PO
 * G (6): Substance
 * H (7): QTY PO (pcs)
 * I (8): Berat PO (KG)
 * J (9): Urutan Kirim
 * K (10): No Surat Jalan (SJ)
 * L (11): Tanggal Kirim (SJ)
 * M (12): Lead Time SJ (Hari)
 * N (13): QTY Kirim SJ (pcs)
 * O (14): Berat Kirim SJ (KG)
 * P (15): Sisa OS Berjalan (pcs)
 * Q (16): Sisa OS Berjalan (KG)
 * R (17): Total Terkirim PO (pcs)
 * S (18): Total Terkirim PO (KG)
 * T (19): Sisa OS Akhir PO (pcs)
 * U (20): Sisa OS Akhir PO (KG)
 * V (21): % Pemenuhan PO
 * W (22): Status Pengiriman
 * X (23): Umur PO / Aging (Hari)
 * Y (24): Kategori Aging OS
 * Z (25): Stock Gudang (pcs)
 * AA (26): Stock Gudang (KG)
 * AB (27): Harga
 */
export const DETAIL_SJ_EXCEL_COLUMNS = [
  'CO',
  'Status CO',
  'Artikel',
  'Item Description',
  'Tanggal Input PO',
  'No PO',
  'Substance',
  'QTY PO (pcs)',
  'Berat PO (KG)',
  'Urutan Kirim',
  'No Surat Jalan (SJ)',
  'Tanggal Kirim (SJ)',
  'Lead Time SJ (Hari)',
  'QTY Kirim SJ (pcs)',
  'Berat Kirim SJ (KG)',
  'Sisa OS Berjalan (pcs)',
  'Sisa OS Berjalan (KG)',
  'Total Terkirim PO (pcs)',
  'Total Terkirim PO (KG)',
  'Sisa OS Akhir PO (pcs)',
  'Sisa OS Akhir PO (KG)',
  '% Pemenuhan PO',
  'Status Pengiriman',
  'Umur PO / Aging (Hari)',
  'Kategori Aging OS',
  'Stock Gudang (pcs)',
  'Stock Gudang (KG)',
  'Harga',
] as const;

export interface GenerateExcelResult {
  workbook: XLSX.WorkBook;
  outputFileName: string;
  blob: Blob;
  file: File;
  scopeTitleSuffix: string;
  recordCount: number;
}

export interface ShareExcelResult {
  success: boolean;
  method: 'web-share' | 'download-and-web' | 'cancelled';
  fileName: string;
  message: string;
}

/**
 * Helper: Creates a dynamic Excel numeric formula cell with cached result and number format.
 * Note: SheetJS formulas must NOT start with '='.
 */
export function fNum(
  formula: string,
  cachedVal: number,
  numFmt: string = '#,##0'
): XLSX.CellObject {
  return {
    t: 'n',
    f: formula,
    v: Number.isFinite(cachedVal) ? cachedVal : 0,
    z: numFmt,
  };
}

/**
 * Helper: Creates a dynamic Excel string formula cell with cached result.
 */
export function fStr(formula: string, cachedVal: string): XLSX.CellObject {
  return {
    t: 's',
    f: formula,
    v: cachedVal ?? '',
  };
}

/**
 * Resolves the export filename based on the uploaded file's original name and requested scope (Normal Mode).
 */
export function getExportFileName(
  uploadedFileName?: string | null,
  scope: ExcelExportScope | string = 'ALL'
): string {
  let baseName = 'Rekap_Customer';
  if (uploadedFileName) {
    let clean = uploadedFileName.trim();
    clean = clean.split(/[/\\]/).pop() || clean;
    const stripped = clean.replace(/\.[^/.]+$/, '');
    if (stripped) {
      baseName = stripped;
    }
  }

  switch (scope) {
    case 'OPEN_ONLY':
      return `${baseName}_CO_OPEN.xlsx`;
    case 'CLOSED_ONLY':
      return `${baseName}_CO_CLOSED.xlsx`;
    case 'STOCK_READY_ALL':
      return `${baseName}_STOCK_READY_SEMUA_CO.xlsx`;
    case 'STOCK_READY_OPEN':
      return `${baseName}_STOCK_READY_CO_OPEN.xlsx`;
    case 'STOCK_READY_CLOSED':
      return `${baseName}_STOCK_READY_CO_CLOSED.xlsx`;
    case 'OVER_STOCK_GUDANG':
    case 'OVER_PRODUCTION_ONLY':
      return `${baseName}_OVER_STOCK_GUDANG.xlsx`;
    case 'OVER_KIRIMAN':
      return `${baseName}_OVER_KIRIMAN.xlsx`;
    case 'ALL':
    default:
      return `${baseName}.xlsx`;
  }
}

/**
 * Resolves the export filename for Mode Detail Kiriman (Per Surat Jalan / SJ).
 */
export function getDetailSJExportFileName(
  uploadedFileName?: string | null,
  scope: DetailSJExportScope | string = 'ALL'
): string {
  let baseName = 'Rekap_Customer';
  if (uploadedFileName) {
    let clean = uploadedFileName.trim();
    clean = clean.split(/[/\\]/).pop() || clean;
    const stripped = clean.replace(/\.[^/.]+$/, '');
    if (stripped) {
      baseName = stripped;
    }
  }

  switch (scope) {
    case 'OPEN_ONLY':
      return `${baseName}_DETAIL_KIRIMAN_SJ_CO_OPEN.xlsx`;
    case 'CLOSED_ONLY':
      return `${baseName}_DETAIL_KIRIMAN_SJ_CO_CLOSED.xlsx`;
    case 'WITH_DELIVERY_ONLY':
      return `${baseName}_DETAIL_KIRIMAN_SJ_AKTIF.xlsx`;
    case 'MULTI_DELIVERY_ONLY':
      return `${baseName}_DETAIL_KIRIMAN_MULTI_SJ.xlsx`;
    case 'NO_DELIVERY_FALLBACK':
      return `${baseName}_DETAIL_BELUM_KIRIM.xlsx`;
    case 'HAS_SISA_OS':
      return `${baseName}_DETAIL_KIRIMAN_SISA_OS.xlsx`;
    case 'ALL':
    default:
      return `${baseName}_DETAIL_KIRIMAN_SJ.xlsx`;
  }
}

/**
 * Builds the 19-column Rekap PO / Rekap OS worksheet with dynamic Excel formulas.
 */
export function buildRekapOSWorksheet(
  filteredData: ExtractedRecord[],
  scopeTitleSuffix: string
): XLSX.WorkSheet {
  const normalPoCountMap = new Map<string, number>();
  for (const item of filteredData) {
    const cleanNoPO = String(item['No PO'] || '').trim();
    if (cleanNoPO && cleanNoPO !== '-') {
      normalPoCountMap.set(cleanNoPO, (normalPoCountMap.get(cleanNoPO) || 0) + 1);
    }
  }
  const normalUniquePONumbers =
    normalPoCountMap.size > 0 ? normalPoCountMap.size : filteredData.length;
  let normalMultiItemPOCount = 0;
  for (const [, count] of normalPoCountMap) {
    if (count > 1) normalMultiItemPOCount++;
  }

  const sheetData: any[][] = [];

  // Row 1: Title (index 0)
  sheetData.push([`REKAPITULASI STOCK & ORDER (OS) CUSTOMER - [${scopeTitleSuffix}]`]);

  // Row 2: Subtitle / Timestamp (index 1)
  const nowStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  sheetData.push([
    `Tanggal Rekap: ${nowStr} | Total No. PO Unik: ${normalUniquePONumbers} PO (${normalMultiItemPOCount} PO Multi-Item) | Total Baris PO-Item: ${filteredData.length} Baris | Filter: ${scopeTitleSuffix}`,
  ]);

  // Row 3: Empty spacing row (index 2)
  sheetData.push([]);

  // Row 4: Data headers start at row 4 (index 3) - 19 columns strictly ordered
  sheetData.push([...EXCEL_COLUMNS]);

  // Row 5+: Data rows (index 4+)
  let sumQtyPcs = 0;
  let sumBeratKg = 0;
  let sumStockPcs = 0;
  let sumStockKg = 0;
  let sumSisaPcs = 0;
  let sumSisaKg = 0;
  let sumTerkirimPcs = 0;
  let sumTerkirimKg = 0;
  let sumOverStockPcs = 0;
  let sumOverStockKg = 0;
  let sumOverKirimanPcs = 0;
  let sumOverKirimanKg = 0;

  for (let i = 0; i < filteredData.length; i++) {
    const item = filteredData[i];
    const excelRow = i + 5;
    const qtyPcs = Number(item['QTY PO (pcs)']) || 0;
    const beratKg = Number(item['Berat PO (KG)']) || 0;
    const stockPcs = Number(item['Stock (pcs)']) || 0;
    const stockKg = Number(item['Stock (kg)']) || 0;
    const sisaPcs = Number(item['Sisa OS (pcs)']) || 0;
    const sisaKg = Number(item['Sisa OS (kg)']) || 0;
    const terkirimPcs =
      item['Terkirim (PCS)'] !== undefined
        ? Number(item['Terkirim (PCS)'])
        : Math.max(0, qtyPcs - sisaPcs);
    const terkirimKg =
      item['Terkirim (KG)'] !== undefined
        ? Number(item['Terkirim (KG)'])
        : Math.max(0, beratKg - sisaKg);
    const overStockPcs = Number(item['Over Stock Gudang (PCS)']) || 0;
    const overStockKg = Number(item['Over Stock Gudang (KG)']) || 0;
    const overKirimanPcs = Number(item['Over Kiriman (PCS)']) || 0;
    const overKirimanKg = Number(item['Over Kiriman (KG)']) || 0;
    const harga = Number(item.Harga) || 0;

    sumQtyPcs += qtyPcs;
    sumBeratKg += beratKg;
    sumStockPcs += stockPcs;
    sumStockKg += stockKg;
    sumSisaPcs += sisaPcs;
    sumSisaKg += sisaKg;
    sumTerkirimPcs += terkirimPcs;
    sumTerkirimKg += terkirimKg;
    sumOverStockPcs += overStockPcs;
    sumOverStockKg += overStockKg;
    sumOverKirimanPcs += overKirimanPcs;
    sumOverKirimanKg += overKirimanKg;

    sheetData.push([
      item.CO || '',
      item.Artikel || '',
      item['Item Description'] || '',
      item['Tanggal Input PO'] || '-',
      item['No PO'] || '',
      item.Substance || '',
      qtyPcs,
      beratKg,
      stockPcs,
      stockKg,
      fNum(`MAX(0,G${excelRow}-M${excelRow})`, sisaPcs, '#,##0'),
      fNum(`MAX(0,H${excelRow}-N${excelRow})`, sisaKg, '#,##0'),
      terkirimPcs,
      terkirimKg,
      overStockPcs,
      overStockKg,
      fNum(`MAX(0,M${excelRow}-G${excelRow})`, overKirimanPcs, '#,##0'),
      fNum(`MAX(0,N${excelRow}-H${excelRow})`, overKirimanKg, '#,##0'),
      harga,
    ]);
  }

  const lastNormalRow = filteredData.length + 4;

  // Row Total Summary at the bottom with dynamic SUM formulas
  sheetData.push([
    `TOTAL REKAPITULASI (${normalUniquePONumbers} NO. PO UNIK / ${filteredData.length} BARIS ITEM)`,
    '',
    '',
    '',
    '',
    '',
    fNum(`SUM(G5:G${lastNormalRow})`, sumQtyPcs, '#,##0'),
    fNum(`SUM(H5:H${lastNormalRow})`, sumBeratKg, '#,##0'),
    fNum(`SUM(I5:I${lastNormalRow})`, sumStockPcs, '#,##0'),
    fNum(`SUM(J5:J${lastNormalRow})`, sumStockKg, '#,##0'),
    fNum(`SUM(K5:K${lastNormalRow})`, sumSisaPcs, '#,##0'),
    fNum(`SUM(L5:L${lastNormalRow})`, sumSisaKg, '#,##0'),
    fNum(`SUM(M5:M${lastNormalRow})`, sumTerkirimPcs, '#,##0'),
    fNum(`SUM(N5:N${lastNormalRow})`, sumTerkirimKg, '#,##0'),
    fNum(`SUM(O5:O${lastNormalRow})`, sumOverStockPcs, '#,##0'),
    fNum(`SUM(P5:P${lastNormalRow})`, sumOverStockKg, '#,##0'),
    fNum(`SUM(Q5:Q${lastNormalRow})`, sumOverKirimanPcs, '#,##0'),
    fNum(`SUM(R5:R${lastNormalRow})`, sumOverKirimanKg, '#,##0'),
    '',
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths for optimal legibility (19 columns)
  worksheet['!cols'] = [
    { wch: 18 }, // CO
    { wch: 18 }, // Artikel
    { wch: 38 }, // Item Description
    { wch: 18 }, // Tanggal Input PO
    { wch: 28 }, // No PO
    { wch: 16 }, // Substance
    { wch: 15 }, // QTY PO (pcs)
    { wch: 16 }, // Berat PO (KG)
    { wch: 14 }, // Stock (pcs)
    { wch: 14 }, // Stock (kg)
    { wch: 15 }, // Sisa OS (pcs)
    { wch: 15 }, // Sisa OS (kg)
    { wch: 16 }, // Terkirim (PCS)
    { wch: 16 }, // Terkirim (KG)
    { wch: 22 }, // Over Stock Gudang (PCS)
    { wch: 22 }, // Over Stock Gudang (KG)
    { wch: 18 }, // Over Kiriman (PCS)
    { wch: 18 }, // Over Kiriman (KG)
    { wch: 14 }, // Harga
  ];

  // Set merges for Title row (A1 to S1, index 0 to 18)
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 18 } }, // Title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 18 } }, // Subtitle
    { s: { r: sheetData.length - 1, c: 0 }, e: { r: sheetData.length - 1, c: 5 } }, // Total label
  ];

  return worksheet;
}

/**
 * Builds the complete formatted Excel workbook, Blob, and File object in memory (Normal Mode)
 */
export function generateExcelBlobAndFile(
  data: ExtractedRecord[],
  customFileName?: string,
  scope: ExcelExportScope = 'ALL',
  sortByPoAsc: boolean = false
): GenerateExcelResult {
  if (!data || data.length === 0) {
    throw new Error('Tidak ada data yang dapat diekspor.');
  }

  // Dynamically recalculate FIFO stock according to the requested export scope
  const scopedData = recalculateFIFOStock(data, scope);

  // Filter based on selected scope
  let filteredData = scopedData;
  let scopeTitleSuffix = 'SELURUH CO';
  let defaultFilePrefix = 'Rekap_Customer_Semua_CO';
  let sheetName = 'Rekap OS';

  if (scope === 'OPEN_ONLY') {
    filteredData = scopedData.filter((d) => d.coStatus === 'OPEN');
    scopeTitleSuffix = 'KHUSUS CO OPEN (O)';
    defaultFilePrefix = 'Rekap_Customer_CO_Open_Only';
    sheetName = 'Rekap OS (CO Open)';
  } else if (scope === 'CLOSED_ONLY') {
    filteredData = scopedData.filter((d) => d.coStatus === 'CLOSED');
    scopeTitleSuffix = 'KHUSUS CO CLOSED (C)';
    defaultFilePrefix = 'Rekap_Customer_CO_Closed_Only';
    sheetName = 'Rekap OS (CO Closed)';
  } else if (scope === 'STOCK_READY_ALL') {
    filteredData = scopedData.filter((d) => (d['Stock (pcs)'] || 0) > 0);
    scopeTitleSuffix = 'STOCK READY (SEMUA CO)';
    defaultFilePrefix = 'Rekap_Customer_Stock_Ready_Semua_CO';
    sheetName = 'Stock Ready (Semua CO)';
  } else if (scope === 'STOCK_READY_OPEN') {
    filteredData = scopedData.filter((d) => d.coStatus === 'OPEN' && (d['Stock (pcs)'] || 0) > 0);
    scopeTitleSuffix = 'STOCK READY (KHUSUS CO OPEN)';
    defaultFilePrefix = 'Rekap_Customer_Stock_Ready_CO_Open_Only';
    sheetName = 'Stock Ready (CO Open)';
  } else if (scope === 'STOCK_READY_CLOSED') {
    filteredData = scopedData.filter((d) => d.coStatus === 'CLOSED' && (d['Stock (pcs)'] || 0) > 0);
    scopeTitleSuffix = 'STOCK READY (KHUSUS CO CLOSED)';
    defaultFilePrefix = 'Rekap_Customer_Stock_Ready_CO_Closed_Only';
    sheetName = 'Stock Ready (CO Closed)';
  } else if (scope === 'OVER_STOCK_GUDANG' || scope === 'OVER_PRODUCTION_ONLY') {
    filteredData = scopedData.filter(
      (d) => (d['Over Stock Gudang (PCS)'] || 0) > 0 || (d['Over Stock Gudang (KG)'] || 0) > 0
    );
    scopeTitleSuffix = 'KHUSUS OVER STOCK GUDANG (READY GUDANG)';
    defaultFilePrefix = 'Rekap_Customer_Over_Stock_Gudang_Only';
    sheetName = 'Over Stock Gudang';
  } else if (scope === 'OVER_KIRIMAN') {
    filteredData = scopedData.filter(
      (d) => (d['Over Kiriman (PCS)'] || 0) > 0 || (d['Over Kiriman (KG)'] || 0) > 0
    );
    scopeTitleSuffix = 'KHUSUS OVER KIRIMAN (SJ DI ATAS PO)';
    defaultFilePrefix = 'Rekap_Customer_Over_Kiriman_Only';
    sheetName = 'Over Kiriman';
  }

  // Sort by PO number ascending (abjad & angka) if requested
  if (sortByPoAsc) {
    filteredData = [...filteredData].sort((a, b) => comparePoNumberAsc(a['No PO'], b['No PO']));
    scopeTitleSuffix += ' (URUT NO. PO ASC)';
    defaultFilePrefix += '_Urut_NoPO';
  }

  if (filteredData.length === 0) {
    let scopeDesc = 'kondisi filter yang dipilih';
    if (scope === 'OPEN_ONLY') scopeDesc = 'status CO "OPEN"';
    else if (scope === 'CLOSED_ONLY') scopeDesc = 'status CO "CLOSED"';
    else if (scope === 'STOCK_READY_ALL') scopeDesc = 'kriteria "Stock Ready" (Semua CO)';
    else if (scope === 'STOCK_READY_OPEN') scopeDesc = 'kriteria "Stock Ready" (Khusus CO Open)';
    else if (scope === 'STOCK_READY_CLOSED') scopeDesc = 'kriteria "Stock Ready" (Khusus CO Closed)';
    else if (scope === 'OVER_STOCK_GUDANG' || scope === 'OVER_PRODUCTION_ONLY')
      scopeDesc = 'kriteria "Over Stock Gudang"';
    else if (scope === 'OVER_KIRIMAN') scopeDesc = 'kriteria "Over Kiriman"';
    throw new Error(`Tidak ada data dengan ${scopeDesc} untuk diekspor.`);
  }

  const worksheet = buildRekapOSWorksheet(filteredData, scopeTitleSuffix);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const finalFileName = customFileName || `${defaultFilePrefix}.xlsx`;
  const outputFileName = finalFileName.endsWith('.xlsx') ? finalFileName : `${finalFileName}.xlsx`;

  // Write workbook to array buffer
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([excelBuffer], { type: mimeType });
  const file = new File([blob], outputFileName, { type: mimeType });

  return {
    workbook,
    outputFileName,
    blob,
    file,
    scopeTitleSuffix,
    recordCount: filteredData.length,
  };
}

/**
 * Exports finalData to a formatted Excel file and downloads it locally (Normal Mode)
 */
export function exportToExcel(
  data: ExtractedRecord[],
  customFileName?: string,
  scope: ExcelExportScope = 'ALL',
  sortByPoAsc: boolean = false
): void {
  const { workbook, outputFileName } = generateExcelBlobAndFile(
    data,
    customFileName,
    scope,
    sortByPoAsc
  );
  XLSX.writeFile(workbook, outputFileName);
}

/**
 * Builds the Master Data Entry Excel Workbook for Mode Detail Kiriman (Per Surat Jalan / SJ).
 * Includes 3 focused sheets with Dynamic Excel Formulas:
 * 1. "Detail Kiriman SJ" — Standard Data Entry tabular sheet (dynamic formulas for Running OS, Total Sent, Final OS, % Fulfillment, Delivery Status, Lead Time & Aging)
 * 2. "Ringkasan" — Executive Dashboard & KPI Summary (live cross-sheet formulas for Fulfillment Rate, Delivery Status distribution, Lead Time & Aging, and Top Priority OS Backlog)
 * 3. "Rekap OS" — Standard Rekap PO & Sisa OS Customer table (19 columns with dynamic formulas)
 */
export function generateDetailSJExcelBlobAndFile(
  data: ExtractedRecord[],
  customFileName?: string,
  scope: DetailSJExportScope = 'ALL',
  sortByPoAsc: boolean = false
): GenerateExcelResult {
  if (!data || data.length === 0) {
    throw new Error('Tidak ada data yang dapat diekspor.');
  }

  const flatRows = flattenDeliveriesForDataEntry(data, scope, sortByPoAsc);
  if (flatRows.length === 0) {
    throw new Error('Tidak ada data kiriman / PO yang sesuai dengan filter yang dipilih.');
  }

  let scopeTitleSuffix = 'SELURUH PO & SURAT JALAN';
  if (scope === 'OPEN_ONLY') scopeTitleSuffix = 'KHUSUS CO OPEN (O)';
  else if (scope === 'CLOSED_ONLY') scopeTitleSuffix = 'KHUSUS CO CLOSED (C)';
  else if (scope === 'WITH_DELIVERY_ONLY')
    scopeTitleSuffix = 'KHUSUS PO SUDAH ADA KIRIMAN (SJ AKTIF)';
  else if (scope === 'MULTI_DELIVERY_ONLY')
    scopeTitleSuffix = 'KHUSUS PO MULTI-KIRIMAN (2+ SURAT JALAN)';
  else if (scope === 'NO_DELIVERY_FALLBACK') scopeTitleSuffix = 'KHUSUS PO BELUM KIRIM';
  else if (scope === 'HAS_SISA_OS') scopeTitleSuffix = 'KHUSUS PO MASIH ADA SISA OS (> 0 PCS)';

  if (sortByPoAsc) {
    scopeTitleSuffix += ' (URUT NO. PO ASC)';
  }

  const nowStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Compute accurate PO-Item line count, Unique No PO document count, Lead Time & Aging metrics
  let totalPOItemLines = 0;
  let totalRealSJCount = 0;
  let sumQtyPoPcs = 0;
  let sumBeratPoKg = 0;
  let sumQtyKirimSJPcs = 0;
  let sumBeratKirimSJKg = 0;
  let sumTotalTerkirimPOPcs = 0;
  let sumTotalTerkirimPOKg = 0;
  let sumSisaOSAkhirPcs = 0;
  let sumSisaOSAkhirKg = 0;
  let sumStockPcs = 0;
  let sumStockKg = 0;

  const uniqueNoPoCounts = new Map<string, number>();
  const allLeadTimes: number[] = [];
  const allAgingDays: number[] = [];

  // Status & Aging distribution counters (per PO-Item line)
  const statusStats: Record<
    DeliveryStatusTag,
    { count: number; qtyPo: number; terkirim: number; sisaOS: number }
  > = {
    'COMPLETED / LUNAS': { count: 0, qtyPo: 0, terkirim: 0, sisaOS: 0 },
    'PARTIAL / CICIL': { count: 0, qtyPo: 0, terkirim: 0, sisaOS: 0 },
    'UNTOUCHED / BELUM KIRIM': { count: 0, qtyPo: 0, terkirim: 0, sisaOS: 0 },
    'OVER DELIVERY': { count: 0, qtyPo: 0, terkirim: 0, sisaOS: 0 },
  };

  const agingStats: Record<
    string,
    { count: number; sisaOSPcs: number; sisaOSKg: number; stockPcs: number }
  > = {
    'AMAN (<= 7 Hari)': { count: 0, sisaOSPcs: 0, sisaOSKg: 0, stockPcs: 0 },
    'FOLLOW UP (8-14 Hari)': { count: 0, sisaOSPcs: 0, sisaOSKg: 0, stockPcs: 0 },
    'KRITIS (> 14 Hari)': { count: 0, sisaOSPcs: 0, sisaOSKg: 0, stockPcs: 0 },
    'LUNAS (0 OS)': { count: 0, sisaOSPcs: 0, sisaOSKg: 0, stockPcs: 0 },
  };

  // Pre-compute Sheet 1 Excel row bounds (1-based) per poRecordId (data starts at row 5)
  const sheet1PoBounds = new Map<string, { firstRow: number; lastRow: number }>();

  flatRows.forEach((r, idx) => {
    const excelRow = idx + 5;
    if (!sheet1PoBounds.has(r.poRecordId)) {
      sheet1PoBounds.set(r.poRecordId, { firstRow: excelRow, lastRow: excelRow });
    } else {
      sheet1PoBounds.get(r.poRecordId)!.lastRow = excelRow;
    }

    if (r.isFirstRowOfPO) {
      totalPOItemLines++;
      sumQtyPoPcs += r['QTY PO (pcs)'];
      sumBeratPoKg += r['Berat PO (KG)'];
      const cleanNoPO = String(r['No PO'] || '').trim();
      if (cleanNoPO && cleanNoPO !== '-') {
        uniqueNoPoCounts.set(cleanNoPO, (uniqueNoPoCounts.get(cleanNoPO) || 0) + 1);
      }
    }
    if (!r.isFallbackNoDelivery) {
      totalRealSJCount++;
      sumQtyKirimSJPcs += r['QTY Kirim SJ (pcs)'];
      sumBeratKirimSJKg += r['Berat Kirim SJ (KG)'];
      if (r['Lead Time SJ (Hari)'] !== null) {
        allLeadTimes.push(r['Lead Time SJ (Hari)']);
      }
    }
    if (r.isLastRowOfPO) {
      sumTotalTerkirimPOPcs += r['Total Terkirim PO (pcs)'];
      sumTotalTerkirimPOKg += r['Total Terkirim PO (KG)'];
      sumSisaOSAkhirPcs += r['Sisa OS Akhir PO (pcs)'];
      sumSisaOSAkhirKg += r['Sisa OS Akhir PO (KG)'];
      sumStockPcs += r['Stock (pcs)'];
      sumStockKg += r['Stock (kg)'];

      if (r['Umur PO / Aging (Hari)'] !== null) {
        allAgingDays.push(r['Umur PO / Aging (Hari)']);
      }

      const st = r['Status Pengiriman'];
      if (statusStats[st]) {
        statusStats[st].count++;
        statusStats[st].qtyPo += r['QTY PO (pcs)'];
        statusStats[st].terkirim += r['Total Terkirim PO (pcs)'];
        statusStats[st].sisaOS += r['Sisa OS Akhir PO (pcs)'];
      }

      const agKey = r['Kategori Aging OS'];
      if (agingStats[agKey]) {
        agingStats[agKey].count++;
        agingStats[agKey].sisaOSPcs += r['Sisa OS Akhir PO (pcs)'];
        agingStats[agKey].sisaOSKg += r['Sisa OS Akhir PO (KG)'];
        agingStats[agKey].stockPcs += r['Stock (pcs)'];
      }
    }
  });

  const totalUniqueNoPOs = uniqueNoPoCounts.size > 0 ? uniqueNoPoCounts.size : totalPOItemLines;
  let totalMultiItemNoPOs = 0;
  for (const [, count] of uniqueNoPoCounts) {
    if (count > 1) totalMultiItemNoPOs++;
  }

  const avgLeadTimeSJ =
    allLeadTimes.length > 0
      ? Math.round((allLeadTimes.reduce((a, b) => a + b, 0) / allLeadTimes.length) * 10) / 10
      : 0;
  const minLeadTimeSJ = allLeadTimes.length > 0 ? Math.min(...allLeadTimes) : 0;
  const maxLeadTimeSJ = allLeadTimes.length > 0 ? Math.max(...allLeadTimes) : 0;

  const avgAgingPO =
    allAgingDays.length > 0
      ? Math.round((allAgingDays.reduce((a, b) => a + b, 0) / allAgingDays.length) * 10) / 10
      : 0;

  const overallFulfillmentRate = sumQtyPoPcs > 0 ? sumTotalTerkirimPOPcs / sumQtyPoPcs : 0;
  const overallBacklogRate = sumQtyPoPcs > 0 ? sumSisaOSAkhirPcs / sumQtyPoPcs : 0;
  const overallStatusTag = getDeliveryStatusTag(
    sumQtyPoPcs,
    sumTotalTerkirimPOPcs,
    sumSisaOSAkhirPcs
  );

  // 28 Column Widths (A..AB)
  const colWidths28 = [
    { wch: 16 }, // 1. A: CO
    { wch: 12 }, // 2. B: Status CO
    { wch: 18 }, // 3. C: Artikel
    { wch: 34 }, // 4. D: Item Description
    { wch: 16 }, // 5. E: Tanggal Input PO
    { wch: 26 }, // 6. F: No PO
    { wch: 16 }, // 7. G: Substance
    { wch: 15 }, // 8. H: QTY PO (pcs)
    { wch: 15 }, // 9. I: Berat PO (KG)
    { wch: 22 }, // 10. J: Urutan Kirim
    { wch: 20 }, // 11. K: No Surat Jalan (SJ)
    { wch: 18 }, // 12. L: Tanggal Kirim (SJ)
    { wch: 19 }, // 13. M: Lead Time SJ (Hari)
    { wch: 18 }, // 14. N: QTY Kirim SJ (pcs)
    { wch: 18 }, // 15. O: Berat Kirim SJ (KG)
    { wch: 20 }, // 16. P: Sisa OS Berjalan (pcs)
    { wch: 20 }, // 17. Q: Sisa OS Berjalan (KG)
    { wch: 21 }, // 18. R: Total Terkirim PO (pcs)
    { wch: 21 }, // 19. S: Total Terkirim PO (KG)
    { wch: 20 }, // 20. T: Sisa OS Akhir PO (pcs)
    { wch: 20 }, // 21. U: Sisa OS Akhir PO (KG)
    { wch: 16 }, // 22. V: % Pemenuhan PO
    { wch: 24 }, // 23. W: Status Pengiriman
    { wch: 20 }, // 24. X: Umur PO / Aging (Hari)
    { wch: 22 }, // 25. Y: Kategori Aging OS
    { wch: 18 }, // 26. Z: Stock Gudang (pcs)
    { wch: 18 }, // 27. AA: Stock Gudang (KG)
    { wch: 14 }, // 28. AB: Harga
  ];

  // =========================================================================
  // SHEET 1: Detail Kiriman SJ (Standard Data Entry + Dynamic Excel Formulas)
  // =========================================================================
  const sheet1Data: any[][] = [];
  sheet1Data.push([
    `REKAPITULASI DETAIL KIRIMAN PER SURAT JALAN (SJ) & SISA OS - [${scopeTitleSuffix}]`,
  ]);
  sheet1Data.push([
    `Tanggal Rekap: ${nowStr} | Total No. PO Unik: ${totalUniqueNoPOs} PO (${totalMultiItemNoPOs} PO Multi-Item) | Total Baris PO-Item: ${totalPOItemLines} Baris | Total Transaksi SJ: ${totalRealSJCount} Kiriman | Total QTY PO: ${sumQtyPoPcs.toLocaleString('id-ID')} PCS | Total Terkirim: ${sumTotalTerkirimPOPcs.toLocaleString('id-ID')} PCS (${(overallFulfillmentRate * 100).toFixed(1)}%) | Total Sisa OS: ${sumSisaOSAkhirPcs.toLocaleString('id-ID')} PCS`,
  ]);
  sheet1Data.push([]);
  sheet1Data.push([...DETAIL_SJ_EXCEL_COLUMNS]);

  flatRows.forEach((r, idx) => {
    const excelRow = idx + 5;
    const bounds = sheet1PoBounds.get(r.poRecordId)!;
    const firstRow = bounds.firstRow;
    const lastRow = bounds.lastRow;

    const runningOSPcsCell = r.isFirstRowOfPO
      ? fNum(`MAX(0,H${firstRow}-N${excelRow})`, r['Sisa OS Berjalan (pcs)'], '#,##0')
      : fNum(`MAX(0,P${excelRow - 1}-N${excelRow})`, r['Sisa OS Berjalan (pcs)'], '#,##0');

    const runningOSKgCell = r.isFirstRowOfPO
      ? fNum(`MAX(0,I${firstRow}-O${excelRow})`, r['Sisa OS Berjalan (KG)'], '#,##0')
      : fNum(`MAX(0,Q${excelRow - 1}-O${excelRow})`, r['Sisa OS Berjalan (KG)'], '#,##0');

    sheet1Data.push([
      r.CO,
      r.coStatus,
      r.Artikel,
      r['Item Description'],
      r['Tanggal Input PO'],
      r['No PO'],
      r.Substance,
      r.isFirstRowOfPO ? r['QTY PO (pcs)'] : '',
      r.isFirstRowOfPO ? r['Berat PO (KG)'] : '',
      r.isFallbackNoDelivery ? 'Belum Kirim' : r.labelKiriman,
      r['No Surat Jalan (SJ)'],
      r['Tanggal Kirim (SJ)'],
      r['Lead Time SJ (Hari)'] !== null ? r['Lead Time SJ (Hari)'] : '',
      r['QTY Kirim SJ (pcs)'],
      r['Berat Kirim SJ (KG)'],
      runningOSPcsCell,
      runningOSKgCell,
      r.isLastRowOfPO
        ? fNum(`SUM(N${firstRow}:N${lastRow})`, r['Total Terkirim PO (pcs)'], '#,##0')
        : '',
      r.isLastRowOfPO
        ? fNum(`SUM(O${firstRow}:O${lastRow})`, r['Total Terkirim PO (KG)'], '#,##0')
        : '',
      r.isLastRowOfPO
        ? fNum(`MAX(0,H${firstRow}-R${excelRow})`, r['Sisa OS Akhir PO (pcs)'], '#,##0')
        : '',
      r.isLastRowOfPO
        ? fNum(`MAX(0,I${firstRow}-S${excelRow})`, r['Sisa OS Akhir PO (KG)'], '#,##0')
        : '',
      r.isLastRowOfPO
        ? fNum(`IF(H${firstRow}>0,R${excelRow}/H${firstRow},0)`, r['% Pemenuhan PO'], '0.0%')
        : '',
      r.isLastRowOfPO
        ? fStr(
            `IF(R${excelRow}=0,"UNTOUCHED / BELUM KIRIM",IF(R${excelRow}>H${firstRow},"OVER DELIVERY",IF(T${excelRow}<=0,"COMPLETED / LUNAS","PARTIAL / CICIL")))`,
            r['Status Pengiriman']
          )
        : '',
      r.isLastRowOfPO && r['Umur PO / Aging (Hari)'] !== null ? r['Umur PO / Aging (Hari)'] : '',
      r.isLastRowOfPO ? r['Kategori Aging OS'] : '',
      r.isLastRowOfPO ? r['Stock (pcs)'] : '',
      r.isLastRowOfPO ? r['Stock (kg)'] : '',
      r.isFirstRowOfPO ? r.Harga : '',
    ]);
  });

  const lastDataRow1 = flatRows.length + 4;
  const totRow1 = lastDataRow1 + 1;

  sheet1Data.push([
    'TOTAL REKAPITULASI KESELURUHAN',
    '',
    '',
    '',
    '',
    `${totalUniqueNoPOs} PO Unik / ${totalPOItemLines} Item`,
    `${totalRealSJCount} SJ`,
    fNum(`SUM(H5:H${lastDataRow1})`, sumQtyPoPcs, '#,##0'),
    fNum(`SUM(I5:I${lastDataRow1})`, sumBeratPoKg, '#,##0'),
    '',
    '',
    'Rata-rata Lead Time:',
    fNum(`IFERROR(AVERAGE(M5:M${lastDataRow1}),0)`, avgLeadTimeSJ, '0.0'),
    fNum(`SUM(N5:N${lastDataRow1})`, sumQtyKirimSJPcs, '#,##0'),
    fNum(`SUM(O5:O${lastDataRow1})`, sumBeratKirimSJKg, '#,##0'),
    '',
    '',
    fNum(`SUM(R5:R${lastDataRow1})`, sumTotalTerkirimPOPcs, '#,##0'),
    fNum(`SUM(S5:S${lastDataRow1})`, sumTotalTerkirimPOKg, '#,##0'),
    fNum(`SUM(T5:T${lastDataRow1})`, sumSisaOSAkhirPcs, '#,##0'),
    fNum(`SUM(U5:U${lastDataRow1})`, sumSisaOSAkhirKg, '#,##0'),
    fNum(`IF(H${totRow1}>0,R${totRow1}/H${totRow1},0)`, overallFulfillmentRate, '0.0%'),
    fStr(
      `IF(R${totRow1}=0,"UNTOUCHED / BELUM KIRIM",IF(R${totRow1}>H${totRow1},"OVER DELIVERY",IF(T${totRow1}<=0,"COMPLETED / LUNAS","PARTIAL / CICIL")))`,
      overallStatusTag
    ),
    fNum(`IFERROR(AVERAGE(X5:X${lastDataRow1}),0)`, avgAgingPO, '0.0'),
    '',
    fNum(`SUM(Z5:Z${lastDataRow1})`, sumStockPcs, '#,##0'),
    fNum(`SUM(AA5:AA${lastDataRow1})`, sumStockKg, '#,##0'),
    '',
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = colWidths28;
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 27 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 27 } },
    { s: { r: sheet1Data.length - 1, c: 0 }, e: { r: sheet1Data.length - 1, c: 4 } },
  ];

  // =========================================================================
  // SHEET 2: Ringkasan (Executive KPI Summary Dashboard)
  // Live cross-sheet formulas referencing 'Detail Kiriman SJ'
  // =========================================================================
  const fifoScope =
    scope === 'OPEN_ONLY' ? 'OPEN' : scope === 'CLOSED_ONLY' ? 'CLOSED' : 'ALL';
  const scopedPOs = recalculateFIFOStock(data, fifoScope).filter((po) => {
    if (scope === 'OPEN_ONLY') return po.coStatus === 'OPEN';
    if (scope === 'CLOSED_ONLY') return po.coStatus === 'CLOSED';
    const realSJs = (po.deliveries || []).filter((d) => !d.isFallbackNoDelivery && d.noSJ !== '-');
    if (scope === 'WITH_DELIVERY_ONLY') return realSJs.length > 0;
    if (scope === 'MULTI_DELIVERY_ONLY') return realSJs.length > 1;
    if (scope === 'NO_DELIVERY_FALLBACK') return realSJs.length === 0;
    if (scope === 'HAS_SISA_OS')
      return (po['Sisa OS (pcs)'] || 0) > 0 || (po['Sisa OS (kg)'] || 0) > 0;
    return true;
  });

  const kpiSheetData: any[][] = [];
  kpiSheetData.push([
    `DASHBOARD RINGKASAN EKSEKUTIF (KPI SUMMARY & AUDIT MASTER DATA) - [${scopeTitleSuffix}]`,
  ]);
  kpiSheetData.push([
    `Tanggal Rekap: ${nowStr} | Seluruh angka metrik di lembar ini terhubung dengan Formula Dinamis ke lembar 'Detail Kiriman SJ'.`,
  ]);
  kpiSheetData.push([]);

  // Section A: Executive Volume & Fulfillment KPIs (Starts at Row 4)
  kpiSheetData.push([
    'A. INDIKATOR KINERJA UTAMA (KPI VOLUME, PEMENUHAN ORDER & KESIAPAN STOCK)',
    '',
    '',
    '',
    '',
    '',
  ]);
  kpiSheetData.push([
    'No',
    'Indikator Kinerja Utama (KPI)',
    'Nilai Utama (PCS / Dokumen)',
    'Nilai Sekunder (KG / Detail)',
    'Satuan / Rasio',
    'Keterangan Analitis Master Data',
  ]);

  // Row 6..15 in Excel (1-based)
  kpiSheetData.push([
    1,
    'Total Dokumen Nomor PO Unik (By No. PO Only)',
    totalUniqueNoPOs,
    totalMultiItemNoPOs,
    'Dokumen PO Unik',
    `${totalMultiItemNoPOs} No. PO memiliki lebih dari 1 Artikel (Multi-Item PO)`,
  ]);
  kpiSheetData.push([
    2,
    'Total Baris Item PO (By PO-Artikel Line)',
    fNum(`COUNTA('Detail Kiriman SJ'!H5:H${lastDataRow1})`, totalPOItemLines, '#,##0'),
    totalRealSJCount,
    'Baris PO-Item',
    `Total ${totalRealSJCount} Transaksi Surat Jalan (SJ) aktif tercatat`,
  ]);
  kpiSheetData.push([
    3,
    'Total Kuota Order PO Customer',
    fNum(`'Detail Kiriman SJ'!H${totRow1}`, sumQtyPoPcs, '#,##0'),
    fNum(`'Detail Kiriman SJ'!I${totRow1}`, sumBeratPoKg, '#,##0'),
    'PCS & KG',
    'Total beban pemenuhan pesanan sesuai dokumen PO',
  ]);
  kpiSheetData.push([
    4,
    'Total Realisasi Terkirim (Akumulasi SJ)',
    fNum(`'Detail Kiriman SJ'!R${totRow1}`, sumTotalTerkirimPOPcs, '#,##0'),
    fNum(`'Detail Kiriman SJ'!S${totRow1}`, sumTotalTerkirimPOKg, '#,##0'),
    'PCS & KG',
    'Akumulasi barang yang sudah dikirim via Surat Jalan (SJ)',
  ]);
  kpiSheetData.push([
    5,
    'Total Sisa Outstanding Order (Sisa OS Akhir)',
    fNum(`'Detail Kiriman SJ'!T${totRow1}`, sumSisaOSAkhirPcs, '#,##0'),
    fNum(`'Detail Kiriman SJ'!U${totRow1}`, sumSisaOSAkhirKg, '#,##0'),
    'PCS & KG',
    'Kewajiban pengiriman yang masih menggantung (Backlog OS)',
  ]);
  kpiSheetData.push([
    6,
    'Persentase Pemenuhan Order (% Fulfillment Rate)',
    fNum(`IF(C8>0,C9/C8,0)`, overallFulfillmentRate, '0.0%'),
    fNum(`IF(D8>0,D9/D8,0)`, sumBeratPoKg > 0 ? sumTotalTerkirimPOKg / sumBeratPoKg : 0, '0.0%'),
    '% Terkirim',
    'Rasio penyelesaian pengiriman terhadap total kuota PO',
  ]);
  kpiSheetData.push([
    7,
    'Persentase Sisa OS Menggantung (% Backlog Rate)',
    fNum(`IF(C8>0,C10/C8,0)`, overallBacklogRate, '0.0%'),
    fNum(`IF(D8>0,D10/D8,0)`, sumBeratPoKg > 0 ? sumSisaOSAkhirKg / sumBeratPoKg : 0, '0.0%'),
    '% Sisa OS',
    'Persentase sisa order yang belum terpenuhi',
  ]);
  kpiSheetData.push([
    8,
    'Total Stock Gudang Tersedia (Alokasi FIFO)',
    fNum(`'Detail Kiriman SJ'!Z${totRow1}`, sumStockPcs, '#,##0'),
    fNum(`'Detail Kiriman SJ'!AA${totRow1}`, sumStockKg, '#,##0'),
    'PCS & KG',
    'Stok fisik di gudang yang siap dialokasikan ke Sisa OS',
  ]);
  kpiSheetData.push([
    9,
    'Rasio Kesiapan Stock terhadap Sisa OS (% Stock Coverage)',
    fNum(
      `IF(C10>0,C13/C10,1)`,
      sumSisaOSAkhirPcs > 0 ? sumStockPcs / sumSisaOSAkhirPcs : 1,
      '0.0%'
    ),
    '',
    '% Coverage OS',
    sumStockPcs >= sumSisaOSAkhirPcs && sumSisaOSAkhirPcs > 0
      ? 'Stock gudang mencukupi untuk menutup seluruh Sisa OS'
      : 'Perlu tambahan produksi untuk menutup selisih Sisa OS',
  ]);

  kpiSheetData.push([]);

  // Section B: Delivery Status Breakdown (Starts at Row 16)
  kpiSheetData.push([
    'B. DISTRIBUSI STATUS PENGIRIMAN PO-ITEM (DELIVERY STATUS BREAKDOWN)',
    '',
    '',
    '',
    '',
    '',
  ]);
  kpiSheetData.push([
    'Status Pengiriman (Tag)',
    'Jumlah Baris PO-Item',
    '% Porsi PO',
    'Total Terkirim (PCS)',
    'Total Sisa OS (PCS)',
    'Tindak Lanjut Operasional',
  ]);

  // Rows 18..21 in Excel (total at Row 22)
  const statusOrder: { tag: DeliveryStatusTag; desc: string }[] = [
    {
      tag: 'COMPLETED / LUNAS',
      desc: 'Selesai 100% — Siap rekonsiliasi penagihan / tutup CO',
    },
    {
      tag: 'PARTIAL / CICIL',
      desc: 'Pengiriman bertahap berjalan — Pantau jadwal SJ berikutnya',
    },
    {
      tag: 'UNTOUCHED / BELUM KIRIM',
      desc: 'Belum ada Surat Jalan sama sekali — Cek kesiapan barang / jadwal truk',
    },
    {
      tag: 'OVER DELIVERY',
      desc: 'Kirim melebihi kuota PO — Verifikasi toleransi over-delivery customer',
    },
  ];

  statusOrder.forEach((stItem, sIdx) => {
    const excelRow = 18 + sIdx;
    const stStat = statusStats[stItem.tag];
    const ratio = totalPOItemLines > 0 ? stStat.count / totalPOItemLines : 0;
    kpiSheetData.push([
      stItem.tag,
      fNum(
        `COUNTIF('Detail Kiriman SJ'!W5:W${lastDataRow1},"${stItem.tag}")`,
        stStat.count,
        '#,##0'
      ),
      fNum(`IF($B$22>0,B${excelRow}/$B$22,0)`, ratio, '0.0%'),
      fNum(
        `SUMIF('Detail Kiriman SJ'!W5:W${lastDataRow1},"${stItem.tag}",'Detail Kiriman SJ'!R5:R${lastDataRow1})`,
        stStat.terkirim,
        '#,##0'
      ),
      fNum(
        `SUMIF('Detail Kiriman SJ'!W5:W${lastDataRow1},"${stItem.tag}",'Detail Kiriman SJ'!T5:T${lastDataRow1})`,
        stStat.sisaOS,
        '#,##0'
      ),
      stItem.desc,
    ]);
  });

  // Row 22: Total Status Breakdown
  kpiSheetData.push([
    'TOTAL BARIS PO-ITEM',
    fNum(`SUM(B18:B21)`, totalPOItemLines, '#,##0'),
    fNum(`SUM(C18:C21)`, 1, '0.0%'),
    fNum(`SUM(D18:D21)`, sumTotalTerkirimPOPcs, '#,##0'),
    fNum(`SUM(E18:E21)`, sumSisaOSAkhirPcs, '#,##0'),
    '100% Terkonsolidasi dengan Sheet 1',
  ]);

  kpiSheetData.push([]);

  // Section C: Speed & Aging Analysis (Starts at Row 24)
  kpiSheetData.push([
    'C. ANALISIS KECEPATAN KIRIM (LEAD TIME SJ) & UMUR TUNGGAKAN ORDER (AGING OS)',
    '',
    '',
    '',
    '',
    '',
  ]);
  kpiSheetData.push([
    'Kategori Aging / Metrik Kecepatan',
    'Jumlah PO / Nilai (Hari)',
    'Total Sisa OS (PCS)',
    'Total Sisa OS (KG)',
    'Stock Siap (PCS)',
    'Prioritas & Status SLA Pengiriman',
  ]);

  // Rows 26..28: Lead Time summary rows
  kpiSheetData.push([
    'Rata-rata Lead Time Pengiriman (Tgl PO -> Tgl SJ)',
    fNum(`IFERROR(AVERAGE('Detail Kiriman SJ'!M5:M${lastDataRow1}),0)`, avgLeadTimeSJ, '0.0'),
    '',
    '',
    '',
    `Rata-rata kecepatan respons kirim sejak PO turun (${totalRealSJCount} SJ)`,
  ]);
  kpiSheetData.push([
    'Lead Time Pengiriman Tercepat (Minimum Hari)',
    fNum(`MIN('Detail Kiriman SJ'!M5:M${lastDataRow1})`, minLeadTimeSJ, '#,##0'),
    '',
    '',
    '',
    'Respons pengiriman tercepat (Hari Kalender)',
  ]);
  kpiSheetData.push([
    'Lead Time Pengiriman Terlama (Maksimum Hari)',
    fNum(`MAX('Detail Kiriman SJ'!M5:M${lastDataRow1})`, maxLeadTimeSJ, '#,##0'),
    '',
    '',
    '',
    'Rentang waktu pengiriman terlama sejak tanggal input PO',
  ]);

  // Rows 29..32: Aging Buckets
  const agingBuckets: { key: string; desc: string }[] = [
    {
      key: 'AMAN (<= 7 Hari)',
      desc: 'Aman / PO Baru (<= 7 Hari) — Dalam rentang SLA produksi normal',
    },
    {
      key: 'FOLLOW UP (8-14 Hari)',
      desc: 'Perlu Follow-Up (8-14 Hari) — Koordinasi jadwal kirim dengan PPIC / Ekspedisi',
    },
    {
      key: 'KRITIS (> 14 Hari)',
      desc: 'Kritis / Overdue (> 14 Hari) — Prioritas utama penyelesaian Sisa OS!',
    },
    {
      key: 'LUNAS (0 OS)',
      desc: 'Sudah Lunas Terkirim (Sisa OS = 0 PCS) — Kewajiban kirim terpenuhi',
    },
  ];

  agingBuckets.forEach((agItem) => {
    const agStat = agingStats[agItem.key] || {
      count: 0,
      sisaOSPcs: 0,
      sisaOSKg: 0,
      stockPcs: 0,
    };
    kpiSheetData.push([
      agItem.key,
      fNum(
        `COUNTIF('Detail Kiriman SJ'!Y5:Y${lastDataRow1},"${agItem.key}")`,
        agStat.count,
        '#,##0'
      ),
      fNum(
        `SUMIF('Detail Kiriman SJ'!Y5:Y${lastDataRow1},"${agItem.key}",'Detail Kiriman SJ'!T5:T${lastDataRow1})`,
        agStat.sisaOSPcs,
        '#,##0'
      ),
      fNum(
        `SUMIF('Detail Kiriman SJ'!Y5:Y${lastDataRow1},"${agItem.key}",'Detail Kiriman SJ'!U5:U${lastDataRow1})`,
        agStat.sisaOSKg,
        '#,##0'
      ),
      fNum(
        `SUMIF('Detail Kiriman SJ'!Y5:Y${lastDataRow1},"${agItem.key}",'Detail Kiriman SJ'!Z5:Z${lastDataRow1})`,
        agStat.stockPcs,
        '#,##0'
      ),
      agItem.desc,
    ]);
  });

  kpiSheetData.push([]);

  // Section D: Top 15 Priority Backlog POs with Sisa OS > 0
  kpiSheetData.push([
    'D. DAFTAR PRIORITAS PENYELESAIAN SISA OS TERBESAR & REKOMENDASI TINDAK LANJUT PPIC',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  kpiSheetData.push([
    'Prioritas',
    'No PO',
    'CO (Status)',
    'Artikel',
    'Item Description',
    'Tanggal Input PO',
    'Umur PO (Hari)',
    'Kategori Aging',
    'QTY PO (pcs)',
    'Terkirim (pcs)',
    'Sisa OS Akhir (pcs)',
    'Stock Gudang (pcs)',
    'Rekomendasi Tindak Lanjut Master Data',
  ]);

  const backlogPOs = scopedPOs
    .filter((p) => (Number(p['Sisa OS (pcs)']) || 0) > 0)
    .sort((a, b) => (Number(b['Sisa OS (pcs)']) || 0) - (Number(a['Sisa OS (pcs)']) || 0))
    .slice(0, 15);

  if (backlogPOs.length === 0) {
    kpiSheetData.push([
      '-',
      'SELURUH PO SUDAH LUNAS TERKIRIM (SISA OS = 0 PCS)',
      '-',
      '-',
      '-',
      '-',
      0,
      'LUNAS (0 OS)',
      0,
      0,
      0,
      0,
      'Tidak ada tunggakan Sisa OS',
    ]);
  } else {
    backlogPOs.forEach((po, bIdx) => {
      const qPo = Number(po['QTY PO (pcs)']) || 0;
      const qSent = Number(po['Terkirim (PCS)']) || 0;
      const qRem = Number(po['Sisa OS (pcs)']) || 0;
      const qStk = Number(po['Stock (pcs)']) || 0;
      const realSJs = (po.deliveries || []).filter(
        (d) => !d.isFallbackNoDelivery && d.noSJ !== '-'
      );
      const lastSj = realSJs.length > 0 ? realSJs[realSJs.length - 1].tanggalKirim : null;
      const { umurHari, kategoriAging } = calculateOrderAgingDetails(
        po['Tanggal Input PO'],
        lastSj,
        qRem,
        qSent
      );

      let rekomendasi = 'FOLLOW UP PRODUKSI PPIC (STOCK 0)';
      if (qStk >= qRem && qRem > 0) {
        rekomendasi = `SIAP KIRIM PENUH DARI STOCK (${qStk.toLocaleString('id-ID')} PCS READY)`;
      } else if (qStk > 0 && qStk < qRem) {
        rekomendasi = `KIRIM PARSIAL STOCK (${qStk.toLocaleString('id-ID')} PCS) & PRODUKSI SISA ${(qRem - qStk).toLocaleString('id-ID')} PCS`;
      }

      kpiSheetData.push([
        `#${bIdx + 1}`,
        po['No PO'] || '-',
        `${po.CO || '-'} (${po.coStatus || '-'})`,
        po.Artikel || '-',
        po['Item Description'] || '-',
        po['Tanggal Input PO'] || '-',
        umurHari !== null ? umurHari : '-',
        kategoriAging,
        qPo,
        qSent,
        qRem,
        qStk,
        rekomendasi,
      ]);
    });
  }

  const wsKPI = XLSX.utils.aoa_to_sheet(kpiSheetData);
  wsKPI['!cols'] = [
    { wch: 36 },
    { wch: 44 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 52 },
    { wch: 18 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 48 },
  ];
  wsKPI['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 5 } },
    { s: { r: 15, c: 0 }, e: { r: 15, c: 5 } },
    { s: { r: 23, c: 0 }, e: { r: 23, c: 5 } },
    { s: { r: 33, c: 0 }, e: { r: 33, c: 12 } },
  ];

  // =========================================================================
  // SHEET 3: Rekap OS (Output dari Rekap PO — 19 Kolom dengan Formula Dinamis)
  // =========================================================================
  const wsRekapOS = buildRekapOSWorksheet(scopedPOs, scopeTitleSuffix);

  // Assemble the 3-Sheet Workbook: Detail Kiriman SJ, Ringkasan, Rekap OS
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws1, 'Detail Kiriman SJ');
  XLSX.utils.book_append_sheet(workbook, wsKPI, 'Ringkasan');
  XLSX.utils.book_append_sheet(workbook, wsRekapOS, 'Rekap OS');

  const resolvedFileName = customFileName
    ? customFileName.endsWith('.xlsx')
      ? customFileName
      : getDetailSJExportFileName(customFileName, scope)
    : getDetailSJExportFileName(null, scope);

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([excelBuffer], { type: mimeType });
  const file = new File([blob], resolvedFileName, { type: mimeType });

  return {
    workbook,
    outputFileName: resolvedFileName,
    blob,
    file,
    scopeTitleSuffix,
    recordCount: flatRows.length,
  };
}

/**
 * Exports Detailed SJ Delivery data to a formatted multi-sheet Excel file and downloads it locally
 */
export function exportDetailSJToExcel(
  data: ExtractedRecord[],
  customFileName?: string,
  scope: DetailSJExportScope = 'ALL',
  sortByPoAsc: boolean = false
): void {
  const { workbook, outputFileName } = generateDetailSJExcelBlobAndFile(
    data,
    customFileName,
    scope,
    sortByPoAsc
  );
  XLSX.writeFile(workbook, outputFileName);
}

/**
 * Shares the generated Detail SJ Excel file directly to WhatsApp
 */
export async function shareDetailSJExcelFileToWhatsApp(
  data: ExtractedRecord[],
  scope: DetailSJExportScope = 'ALL',
  customFileName?: string,
  sortByPoAsc: boolean = false
): Promise<ShareExcelResult> {
  const { blob, file, outputFileName } = generateDetailSJExcelBlobAndFile(
    data,
    customFileName,
    scope,
    sortByPoAsc
  );

  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canShareFiles) {
    try {
      await navigator.share({
        files: [file],
      });
      return {
        success: true,
        method: 'web-share',
        fileName: outputFileName,
        message: `File Excel Detail SJ "${outputFileName}" berhasil dibagikan langsung!`,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return {
          success: false,
          method: 'cancelled',
          fileName: outputFileName,
          message: 'Berbagi file dibatalkan.',
        };
      }
      console.warn('Web Share failed, fallback to download + WhatsApp...', err);
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = outputFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const isMobile =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const waUrl = isMobile ? 'https://wa.me/' : 'https://web.whatsapp.com/';
  window.open(waUrl, '_blank', 'noopener,noreferrer');

  return {
    success: true,
    method: 'download-and-web',
    fileName: outputFileName,
    message: `File Detail SJ "${outputFileName}" berhasil diunduh & WhatsApp dibuka. Silakan lampirkan file ke chat.`,
  };
}

/**
 * Shares the generated Excel file directly to WhatsApp (Normal Mode):
 * - Strictly ONLY the .xlsx file is shared ("tanpa ketikan").
 * - On supported devices (Mobile / Web Share API L2): Direct native share with the .xlsx file attached (no text caption).
 * - On desktop browsers: Automatically downloads the .xlsx file and opens WhatsApp with no prefilled text.
 */
export async function shareExcelFileToWhatsApp(
  data: ExtractedRecord[],
  scope: ExcelExportScope = 'ALL',
  customFileName?: string
): Promise<ShareExcelResult> {
  const { blob, file, outputFileName } = generateExcelBlobAndFile(data, customFileName, scope);

  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canShareFiles) {
    try {
      await navigator.share({
        files: [file],
      });
      return {
        success: true,
        method: 'web-share',
        fileName: outputFileName,
        message: `File Excel "${outputFileName}" berhasil dibagikan langsung (hanya file .xlsx)!`,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return {
          success: false,
          method: 'cancelled',
          fileName: outputFileName,
          message: 'Berbagi file dibatalkan.',
        };
      }
      console.warn('Web Share failed or blocked, fallback to download + WhatsApp without text...', err);
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = outputFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const isMobile =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const waUrl = isMobile ? 'https://wa.me/' : 'https://web.whatsapp.com/';
  window.open(waUrl, '_blank', 'noopener,noreferrer');

  return {
    success: true,
    method: 'download-and-web',
    fileName: outputFileName,
    message: `File "${outputFileName}" berhasil diunduh & WhatsApp dibuka (hanya file .xlsx, tanpa ketikan). Silakan lampirkan file ke chat.`,
  };
}

/**
 * 13-Column Master Schema for Mode Rekap Order Sales (Matching Image 2):
 * A: NO PO
 * B: Date Receive PO (kosong/diabaikan)
 * C: Substance (pure substance tanpa flute)
 * D: Flute (BC, C, B, E)
 * E: Size P
 * F: Size L
 * G: Artikel
 * H: Item Name
 * I: Qty (Pcs) - Qty PO
 * J: Qty (Kg) - Berat PO
 * K: Delivery Date - Rencana jadwal kirim
 * L: Qty Delivery - Rencana qty kirim
 * M: Remarks (kosong/diabaikan)
 */
export const SALES_ORDER_EXCEL_COLUMNS = [
  'NO PO',
  'Date Receive PO',
  'Substance',
  'Flute',
  'P',
  'L',
  'Artikel',
  'Item Name',
  'Qty (Pcs)',
  'Qty (Kg)',
  'Planning Date',
  'Qty Planning',
  'Kg Planning',
  'Remarks',
  'Actual Delivery Date',
  'No SJ',
  'Qty Delivery',
  'Kg Delivery',
  'Harga',
  'Rp/Kg',
] as const;

/**
 * Resolves the export filename for Mode Rekap Order Sales.
 */
export function getSalesOrderExportFileName(
  uploadedFileName?: string | null,
  scope: SalesOrderExportScope = 'ALL',
  sortByPoAsc: boolean = false,
  deliveryMode: SalesDeliveryMode = 'FALLBACK_DETAIL_SJ'
): string {
  let baseName = 'Rekap_Order_Sales';
  if (uploadedFileName) {
    let clean = uploadedFileName.trim();
    clean = clean.split(/[/\\]/).pop() || clean;
    const stripped = clean.replace(/\.[^/.]+$/, '');
    if (stripped) {
      baseName = `Rekap_Order_Sales_${stripped}`;
    }
  }

  const modeSuffix = deliveryMode === 'TOTAL_ACCUMULATION' ? '_Total_Akumulasi' : '_Detail_SJ';
  const sortSuffix = sortByPoAsc ? '_Urut_NoPO' : '';

  if (scope === 'OPEN_ONLY') {
    return `${baseName}_CO_OPEN${modeSuffix}${sortSuffix}.xlsx`;
  }
  if (scope === 'CLOSED_ONLY') {
    return `${baseName}_CO_CLOSED${modeSuffix}${sortSuffix}.xlsx`;
  }
  if (scope === 'K200_ONLY') {
    return `${baseName}_KHUSUS_K200${modeSuffix}${sortSuffix}.xlsx`;
  }
  if (scope === 'K200_SW_ONLY') {
    return `${baseName}_KHUSUS_K200_SW${modeSuffix}${sortSuffix}.xlsx`;
  }
  if (scope === 'K200_DW_ONLY') {
    return `${baseName}_KHUSUS_K200_DW${modeSuffix}${sortSuffix}.xlsx`;
  }
  return `${baseName}${modeSuffix}${sortSuffix}.xlsx`;
}

/**
 * Builds the Rekap Order Sales worksheet with 2-tier headers matching user specification.
 * - When includeSourceFileColumn = true: Column A is Sumber File, Column B is Customers (17 cols in Total Accumulation, 21 in Fallback).
 * - When isCombinedMaster = true (and includeSourceFileColumn = false): Column A is Customers (16 cols in Total Accumulation, 20 in Fallback).
 * - When both false: Column A is NO PO (15 cols in Total Accumulation, 19 in Fallback).
 * - Row 1 has Size header merged over P & L, Row 2 has column titles, Row 3 starts data rows.
 */
export function buildSalesOrderWorksheet(
  data: ExtractedRecord[],
  scope: SalesOrderExportScope = 'ALL',
  customerTitle?: string,
  sortByPoAsc: boolean = false,
  deliveryMode: SalesDeliveryMode = 'FALLBACK_DETAIL_SJ',
  includeCustomerColumn: boolean = true,
  includeSourceFileColumn: boolean = false
): XLSX.WorkSheet {
  const isCombinedMaster = includeCustomerColumn;
  const isTotalAccumulation = deliveryMode === 'TOTAL_ACCUMULATION';
  const flatRows = flattenSalesOrderRows(data, scope, sortByPoAsc, deliveryMode);

  const sheetData: any[][] = [];

  // Define dynamic column letters
  let colSub: string;
  let colFlu: string;
  let colQtyPcs: string;
  let colQtyKg: string;
  let colPlanPcs: string;
  let colPlanKg: string;
  let colDelivPcs: string;
  let colDelivKg: string;
  let colHarga: string;
  let totalCols: number;
  let labelColSpan: number;

  if (includeSourceFileColumn) {
    // Column A: Sumber File, Column B: Customers, Column C: NO PO
    colSub = 'D';
    colFlu = 'E';
    colQtyPcs = 'J';
    colQtyKg = 'K';

    if (isTotalAccumulation) {
      colPlanPcs = 'L';
      colPlanKg = 'M';
      colDelivPcs = 'N';
      colDelivKg = 'O';
      colHarga = 'P';
      totalCols = 17;
    } else {
      colPlanPcs = 'M';
      colPlanKg = 'N';
      colDelivPcs = 'R';
      colDelivKg = 'S';
      colHarga = 'T';
      totalCols = 21;
    }
    labelColSpan = 9; // Cols A through I (indices 0..8)
  } else if (isCombinedMaster) {
    // Column A: Customers, Column B: NO PO
    colSub = 'C';
    colFlu = 'D';
    colQtyPcs = 'I';
    colQtyKg = 'J';

    if (isTotalAccumulation) {
      colPlanPcs = 'K';
      colPlanKg = 'L';
      colDelivPcs = 'M';
      colDelivKg = 'N';
      colHarga = 'O';
      totalCols = 16;
    } else {
      colPlanPcs = 'L';
      colPlanKg = 'M';
      colDelivPcs = 'Q';
      colDelivKg = 'R';
      colHarga = 'S';
      totalCols = 20;
    }
    labelColSpan = 8; // Cols A through H (indices 0..7)
  } else {
    // Column A: NO PO
    colSub = 'B';
    colFlu = 'C';
    colQtyPcs = 'H';
    colQtyKg = 'I';

    if (isTotalAccumulation) {
      colPlanPcs = 'J';
      colPlanKg = 'K';
      colDelivPcs = 'L';
      colDelivKg = 'M';
      colHarga = 'N';
      totalCols = 15;
    } else {
      colPlanPcs = 'K';
      colPlanKg = 'L';
      colDelivPcs = 'P';
      colDelivKg = 'Q';
      colHarga = 'R';
      totalCols = 19;
    }
    labelColSpan = 7; // Cols A through G (indices 0..6)
  }

  // Row 1 & Row 2: 2-Tier Table Header Rows
  // In Excel vertical merge (Row 1:Row 2), Excel displays the value of the top cell (Row 1).
  // Therefore, all column titles are placed in Row 1, with 'Size' spanning P & L.
  // Row 2 only contains 'P' and 'L' under the Size column, while other cells are blank for the vertical merge.
  if (isTotalAccumulation) {
    if (includeSourceFileColumn) {
      sheetData.push([
        'Sumber File',
        'Customers',
        'NO PO',
        'Substance',
        'Flute',
        'Size',
        '', // Merged with F for Size
        'Artikel',
        'Item Name',
        'Qty (Pcs)',
        'Qty (Kg)',
        'Qty Planning',
        'Kg Planning',
        'Qty Delivery',
        'Kg Delivery',
        'Harga',
        'Rp/Kg',
      ]);
      sheetData.push([
        '',
        '',
        '',
        '',
        '',
        'P',
        'L',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    } else if (isCombinedMaster) {
      sheetData.push([
        'Customers',
        'NO PO',
        'Substance',
        'Flute',
        'Size',
        '', // Merged with E for Size
        'Artikel',
        'Item Name',
        'Qty (Pcs)',
        'Qty (Kg)',
        'Qty Planning',
        'Kg Planning',
        'Qty Delivery',
        'Kg Delivery',
        'Harga',
        'Rp/Kg',
      ]);
      sheetData.push([
        '',
        '',
        '',
        '',
        'P',
        'L',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    } else {
      sheetData.push([
        'NO PO',
        'Substance',
        'Flute',
        'Size',
        '', // Merged with D for Size
        'Artikel',
        'Item Name',
        'Qty (Pcs)',
        'Qty (Kg)',
        'Qty Planning',
        'Kg Planning',
        'Qty Delivery',
        'Kg Delivery',
        'Harga',
        'Rp/Kg',
      ]);
      sheetData.push([
        '',
        '',
        '',
        'P',
        'L',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    }
  } else {
    // Mode Detail per SJ (Fallback)
    if (includeSourceFileColumn) {
      sheetData.push([
        'Sumber File',
        'Customers',
        'NO PO',
        'Substance',
        'Flute',
        'Size',
        '', // Merged with F for Size
        'Artikel',
        'Item Name',
        'Qty (Pcs)',
        'Qty (Kg)',
        'Planning Date',
        'Qty Planning',
        'Kg Planning',
        'Remarks',
        'Actual Delivery Date',
        'No SJ',
        'Qty Delivery',
        'Kg Delivery',
        'Harga',
        'Rp/Kg',
      ]);
      sheetData.push([
        '',
        '',
        '',
        '',
        '',
        'P',
        'L',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    } else if (isCombinedMaster) {
      sheetData.push([
        'Customers',
        'NO PO',
        'Substance',
        'Flute',
        'Size',
        '', // Merged with E for Size
        'Artikel',
        'Item Name',
        'Qty (Pcs)',
        'Qty (Kg)',
        'Planning Date',
        'Qty Planning',
        'Kg Planning',
        'Remarks',
        'Actual Delivery Date',
        'No SJ',
        'Qty Delivery',
        'Kg Delivery',
        'Harga',
        'Rp/Kg',
      ]);
      sheetData.push([
        '',
        '',
        '',
        '',
        'P',
        'L',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    } else {
      sheetData.push([
        'NO PO',
        'Substance',
        'Flute',
        'Size',
        '', // Merged with D for Size
        'Artikel',
        'Item Name',
        'Qty (Pcs)',
        'Qty (Kg)',
        'Planning Date',
        'Qty Planning',
        'Kg Planning',
        'Remarks',
        'Actual Delivery Date',
        'No SJ',
        'Qty Delivery',
        'Kg Delivery',
        'Harga',
        'Rp/Kg',
      ]);
      sheetData.push([
        '',
        '',
        '',
        'P',
        'L',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    }
  }

  // Row 3+: Data rows
  let sumQtyPcs = 0;
  let sumQtyKg = 0;
  let sumQtyDelivery = 0;
  let sumKgDelivery = 0;
  let sumActualQtyDelivery = 0;
  let sumActualKgDelivery = 0;

  // Singlewall (B, C, E) & Doublewall (BC) counters
  let swQtyPcs = 0;
  let swQtyKg = 0;
  let swQtyDelivery = 0;
  let swKgDelivery = 0;
  let swActualQtyDelivery = 0;
  let swActualKgDelivery = 0;

  let dwQtyPcs = 0;
  let dwQtyKg = 0;
  let dwQtyDelivery = 0;
  let dwKgDelivery = 0;
  let dwActualQtyDelivery = 0;
  let dwActualKgDelivery = 0;

  // Substance K200 specific counters
  let k200SwQtyPcs = 0;
  let k200SwQtyKg = 0;
  let k200SwQtyDelivery = 0;
  let k200SwKgDelivery = 0;
  let k200SwActualQtyDelivery = 0;
  let k200SwActualKgDelivery = 0;

  let k200DwQtyPcs = 0;
  let k200DwQtyKg = 0;
  let k200DwQtyDelivery = 0;
  let k200DwKgDelivery = 0;
  let k200DwActualQtyDelivery = 0;
  let k200DwActualKgDelivery = 0;

  let nonK200QtyPcs = 0;
  let nonK200QtyKg = 0;
  let nonK200QtyDelivery = 0;
  let nonK200KgDelivery = 0;
  let nonK200ActualQtyDelivery = 0;
  let nonK200ActualKgDelivery = 0;

  let eFluteQtyPcs = 0;
  let eFluteQtyKg = 0;
  let eFluteQtyDelivery = 0;
  let eFluteKgDelivery = 0;
  let eFluteActualQtyDelivery = 0;
  let eFluteActualKgDelivery = 0;

  flatRows.forEach((r, idx) => {
    const numQtyPcs = typeof r.qtyPcs === 'number' ? r.qtyPcs : 0;
    const numQtyKg = typeof r.qtyKg === 'number' ? r.qtyKg : 0;
    const numQtyDelivery = typeof r.qtyDelivery === 'number' ? r.qtyDelivery : 0;
    const numKgDelivery = typeof r.kgDelivery === 'number' ? r.kgDelivery : 0;
    const numActualQtyDelivery = typeof r.actualQtyDelivery === 'number' ? r.actualQtyDelivery : 0;
    const numActualKgDelivery = typeof r.actualKgDelivery === 'number' ? r.actualKgDelivery : 0;

    sumQtyPcs += numQtyPcs;
    sumQtyKg += numQtyKg;
    sumQtyDelivery += numQtyDelivery;
    sumKgDelivery += numKgDelivery;
    sumActualQtyDelivery += numActualQtyDelivery;
    sumActualKgDelivery += numActualKgDelivery;

    const cleanFlute = String(r.flute || '').trim().toUpperCase();
    const isDw = cleanFlute === 'BC';
    const isK = Boolean(r.isK200 || isK200Substance(r.substance) || isK200Substance(r.poSubstance));

    if (isDw) {
      dwQtyPcs += numQtyPcs;
      dwQtyKg += numQtyKg;
      dwQtyDelivery += numQtyDelivery;
      dwKgDelivery += numKgDelivery;
      dwActualQtyDelivery += numActualQtyDelivery;
      dwActualKgDelivery += numActualKgDelivery;
    } else {
      swQtyPcs += numQtyPcs;
      swQtyKg += numQtyKg;
      swQtyDelivery += numQtyDelivery;
      swKgDelivery += numKgDelivery;
      swActualQtyDelivery += numActualQtyDelivery;
      swActualKgDelivery += numActualKgDelivery;
    }

    if (cleanFlute === 'E') {
      eFluteQtyPcs += numQtyPcs;
      eFluteQtyKg += numQtyKg;
      eFluteQtyDelivery += numQtyDelivery;
      eFluteKgDelivery += numKgDelivery;
      eFluteActualQtyDelivery += numActualQtyDelivery;
      eFluteActualKgDelivery += numActualKgDelivery;
    }

    if (isK) {
      if (isDw) {
        k200DwQtyPcs += numQtyPcs;
        k200DwQtyKg += numQtyKg;
        k200DwQtyDelivery += numQtyDelivery;
        k200DwKgDelivery += numKgDelivery;
        k200DwActualQtyDelivery += numActualQtyDelivery;
        k200DwActualKgDelivery += numActualKgDelivery;
      } else {
        k200SwQtyPcs += numQtyPcs;
        k200SwQtyKg += numQtyKg;
        k200SwQtyDelivery += numQtyDelivery;
        k200SwKgDelivery += numKgDelivery;
        k200SwActualQtyDelivery += numActualQtyDelivery;
        k200SwActualKgDelivery += numActualKgDelivery;
      }
    } else {
      nonK200QtyPcs += numQtyPcs;
      nonK200QtyKg += numQtyKg;
      nonK200QtyDelivery += numQtyDelivery;
      nonK200KgDelivery += numKgDelivery;
      nonK200ActualQtyDelivery += numActualQtyDelivery;
      nonK200ActualKgDelivery += numActualKgDelivery;
    }

    const excelRow = idx + 3;
    const hargaCell =
      typeof r.harga === 'number' && r.harga > 0
        ? fNum(String(r.harga), r.harga, '#,##0')
        : '';

    const rpPerKgCell =
      typeof r.rpPerKg === 'number' && r.rpPerKg > 0
        ? fNum(
            `IF(AND(${colQtyPcs}${excelRow}>0,${colQtyKg}${excelRow}>0,ISNUMBER(${colHarga}${excelRow}),${colHarga}${excelRow}>0),${colHarga}${excelRow}/(${colQtyKg}${excelRow}/${colQtyPcs}${excelRow}),"")`,
            r.rpPerKg,
            '#,##0'
          )
        : '';

    const rowSourceFile = r.sourceFileName || '';
    const rowCustomer =
      r.customerName ||
      (customerTitle && customerTitle !== 'GABUNGAN SEMUA CUSTOMER' ? customerTitle : '') ||
      (data.length > 0 && data[0].customerName ? data[0].customerName : '') ||
      '';

    if (isTotalAccumulation) {
      if (includeSourceFileColumn) {
        sheetData.push([
          rowSourceFile,
          rowCustomer,
          r.noPO,
          r.substance,
          r.flute,
          r.sizeP !== '' ? r.sizeP : '',
          r.sizeL !== '' ? r.sizeL : '',
          r.artikel,
          r.itemName,
          r.qtyPcs !== '' ? r.qtyPcs : '',
          r.qtyKg !== '' ? r.qtyKg : '',
          r.qtyDelivery !== '' ? r.qtyDelivery : '',
          r.kgDelivery !== '' ? r.kgDelivery : '',
          r.actualQtyDelivery !== '' ? r.actualQtyDelivery : '',
          r.actualKgDelivery !== '' ? r.actualKgDelivery : '',
          hargaCell,
          rpPerKgCell,
        ]);
      } else if (isCombinedMaster) {
        sheetData.push([
          rowCustomer,
          r.noPO,
          r.substance,
          r.flute,
          r.sizeP !== '' ? r.sizeP : '',
          r.sizeL !== '' ? r.sizeL : '',
          r.artikel,
          r.itemName,
          r.qtyPcs !== '' ? r.qtyPcs : '',
          r.qtyKg !== '' ? r.qtyKg : '',
          r.qtyDelivery !== '' ? r.qtyDelivery : '',
          r.kgDelivery !== '' ? r.kgDelivery : '',
          r.actualQtyDelivery !== '' ? r.actualQtyDelivery : '',
          r.actualKgDelivery !== '' ? r.actualKgDelivery : '',
          hargaCell,
          rpPerKgCell,
        ]);
      } else {
        sheetData.push([
          r.noPO,
          r.substance,
          r.flute,
          r.sizeP !== '' ? r.sizeP : '',
          r.sizeL !== '' ? r.sizeL : '',
          r.artikel,
          r.itemName,
          r.qtyPcs !== '' ? r.qtyPcs : '',
          r.qtyKg !== '' ? r.qtyKg : '',
          r.qtyDelivery !== '' ? r.qtyDelivery : '',
          r.kgDelivery !== '' ? r.kgDelivery : '',
          r.actualQtyDelivery !== '' ? r.actualQtyDelivery : '',
          r.actualKgDelivery !== '' ? r.actualKgDelivery : '',
          hargaCell,
          rpPerKgCell,
        ]);
      }
    } else {
      // FALLBACK_DETAIL_SJ
      if (includeSourceFileColumn) {
        sheetData.push([
          rowSourceFile,
          rowCustomer,
          r.noPO,
          r.substance,
          r.flute,
          r.sizeP !== '' ? r.sizeP : '',
          r.sizeL !== '' ? r.sizeL : '',
          r.artikel,
          r.itemName,
          r.qtyPcs !== '' ? r.qtyPcs : '',
          r.qtyKg !== '' ? r.qtyKg : '',
          r.deliveryDate,
          r.qtyDelivery !== '' ? r.qtyDelivery : '',
          r.kgDelivery !== '' ? r.kgDelivery : '',
          r.remarks || '',
          r.actualDeliveryDate || '',
          r.noSJ || '',
          r.actualQtyDelivery !== '' ? r.actualQtyDelivery : '',
          r.actualKgDelivery !== '' ? r.actualKgDelivery : '',
          hargaCell,
          rpPerKgCell,
        ]);
      } else if (isCombinedMaster) {
        sheetData.push([
          rowCustomer,
          r.noPO,
          r.substance,
          r.flute,
          r.sizeP !== '' ? r.sizeP : '',
          r.sizeL !== '' ? r.sizeL : '',
          r.artikel,
          r.itemName,
          r.qtyPcs !== '' ? r.qtyPcs : '',
          r.qtyKg !== '' ? r.qtyKg : '',
          r.deliveryDate,
          r.qtyDelivery !== '' ? r.qtyDelivery : '',
          r.kgDelivery !== '' ? r.kgDelivery : '',
          r.remarks || '',
          r.actualDeliveryDate || '',
          r.noSJ || '',
          r.actualQtyDelivery !== '' ? r.actualQtyDelivery : '',
          r.actualKgDelivery !== '' ? r.actualKgDelivery : '',
          hargaCell,
          rpPerKgCell,
        ]);
      } else {
        sheetData.push([
          r.noPO,
          r.substance,
          r.flute,
          r.sizeP !== '' ? r.sizeP : '',
          r.sizeL !== '' ? r.sizeL : '',
          r.artikel,
          r.itemName,
          r.qtyPcs !== '' ? r.qtyPcs : '',
          r.qtyKg !== '' ? r.qtyKg : '',
          r.deliveryDate,
          r.qtyDelivery !== '' ? r.qtyDelivery : '',
          r.kgDelivery !== '' ? r.kgDelivery : '',
          r.remarks || '',
          r.actualDeliveryDate || '',
          r.noSJ || '',
          r.actualQtyDelivery !== '' ? r.actualQtyDelivery : '',
          r.actualKgDelivery !== '' ? r.actualKgDelivery : '',
          hargaCell,
          rpPerKgCell,
        ]);
      }
    }
  });

  const lastRow = Math.max(3, flatRows.length + 2);

  const getColIdx = (letter: string) => letter.charCodeAt(0) - 'A'.charCodeAt(0);
  const labelColIdx = labelColSpan - 1; // Kolom Item Name (tepat sebelum Qty Pcs)

  // Grand Total Row
  const gtRowIndex = sheetData.length;
  const gtRow = gtRowIndex + 1;

  const gtRowData: any[] = Array(totalCols).fill('');
  gtRowData[labelColIdx] = 'GRAND TOTAL ORDER & PENGIRIMAN';

  gtRowData[getColIdx(colQtyPcs)] = fNum(`SUM(${colQtyPcs}$3:${colQtyPcs}$${lastRow})`, sumQtyPcs, '#,##0');
  gtRowData[getColIdx(colQtyKg)] = fNum(`SUM(${colQtyKg}$3:${colQtyKg}$${lastRow})`, sumQtyKg, '#,##0');
  gtRowData[getColIdx(colPlanPcs)] = fNum(`SUM(${colPlanPcs}$3:${colPlanPcs}$${lastRow})`, sumQtyDelivery, '#,##0');
  gtRowData[getColIdx(colPlanKg)] = fNum(`SUM(${colPlanKg}$3:${colPlanKg}$${lastRow})`, sumKgDelivery, '#,##0');
  gtRowData[getColIdx(colDelivPcs)] = fNum(`SUM(${colDelivPcs}$3:${colDelivPcs}$${lastRow})`, sumActualQtyDelivery, '#,##0');
  gtRowData[getColIdx(colDelivKg)] = fNum(`SUM(${colDelivKg}$3:${colDelivKg}$${lastRow})`, sumActualKgDelivery, '#,##0');

  sheetData.push(gtRowData);

  // Section 1: Dedicated Summary Box by Flute (SW, DW, Khusus E Flute)
  sheetData.push([]);
  const kpiTitleIndex = sheetData.length;
  const kpiTitleRowData: any[] = Array(totalCols).fill('');
  kpiTitleRowData[labelColIdx] = 'TOTAL PO BERDASARKAN TIPE FLUTE (SW & DW)';
  sheetData.push(kpiTitleRowData);

  const kpiHeaderIndex = sheetData.length;
  const kpiHeaderRowData: any[] = Array(totalCols).fill('');
  kpiHeaderRowData[labelColIdx] = 'KATEGORI FLUTE';
  kpiHeaderRowData[getColIdx(colQtyPcs)] = 'Qty PO (Pcs)';
  kpiHeaderRowData[getColIdx(colQtyKg)] = 'Qty PO (Kg)';
  kpiHeaderRowData[getColIdx(colPlanPcs)] = 'Qty Planning (Pcs)';
  kpiHeaderRowData[getColIdx(colPlanKg)] = 'Kg Planning (Kg)';
  kpiHeaderRowData[getColIdx(colDelivPcs)] = 'Qty Realisasi (Pcs)';
  kpiHeaderRowData[getColIdx(colDelivKg)] = 'Kg Realisasi (Kg)';
  sheetData.push(kpiHeaderRowData);

  // SW Row
  const kpiSwIndex = sheetData.length;
  const kpiSwRowData: any[] = Array(totalCols).fill('');
  kpiSwRowData[labelColIdx] = '1. SINGLEWALL (Flute B, C, E)';
  kpiSwRowData[getColIdx(colQtyPcs)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"B",${colQtyPcs}$3:${colQtyPcs}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"C",${colQtyPcs}$3:${colQtyPcs}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colQtyPcs}$3:${colQtyPcs}$${lastRow})`, swQtyPcs, '#,##0');
  kpiSwRowData[getColIdx(colQtyKg)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"B",${colQtyKg}$3:${colQtyKg}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"C",${colQtyKg}$3:${colQtyKg}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colQtyKg}$3:${colQtyKg}$${lastRow})`, swQtyKg, '#,##0');
  kpiSwRowData[getColIdx(colPlanPcs)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"B",${colPlanPcs}$3:${colPlanPcs}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"C",${colPlanPcs}$3:${colPlanPcs}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colPlanPcs}$3:${colPlanPcs}$${lastRow})`, swQtyDelivery, '#,##0');
  kpiSwRowData[getColIdx(colPlanKg)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"B",${colPlanKg}$3:${colPlanKg}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"C",${colPlanKg}$3:${colPlanKg}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colPlanKg}$3:${colPlanKg}$${lastRow})`, swKgDelivery, '#,##0');
  kpiSwRowData[getColIdx(colDelivPcs)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"B",${colDelivPcs}$3:${colDelivPcs}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"C",${colDelivPcs}$3:${colDelivPcs}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colDelivPcs}$3:${colDelivPcs}$${lastRow})`, swActualQtyDelivery, '#,##0');
  kpiSwRowData[getColIdx(colDelivKg)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"B",${colDelivKg}$3:${colDelivKg}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"C",${colDelivKg}$3:${colDelivKg}$${lastRow})+SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colDelivKg}$3:${colDelivKg}$${lastRow})`, swActualKgDelivery, '#,##0');
  sheetData.push(kpiSwRowData);

  // DW Row
  const kpiDwIndex = sheetData.length;
  const kpiDwRowData: any[] = Array(totalCols).fill('');
  kpiDwRowData[labelColIdx] = '2. DOUBLEWALL (Flute BC)';
  kpiDwRowData[getColIdx(colQtyPcs)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"BC",${colQtyPcs}$3:${colQtyPcs}$${lastRow})`, dwQtyPcs, '#,##0');
  kpiDwRowData[getColIdx(colQtyKg)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"BC",${colQtyKg}$3:${colQtyKg}$${lastRow})`, dwQtyKg, '#,##0');
  kpiDwRowData[getColIdx(colPlanPcs)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"BC",${colPlanPcs}$3:${colPlanPcs}$${lastRow})`, dwQtyDelivery, '#,##0');
  kpiDwRowData[getColIdx(colPlanKg)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"BC",${colPlanKg}$3:${colPlanKg}$${lastRow})`, dwKgDelivery, '#,##0');
  kpiDwRowData[getColIdx(colDelivPcs)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"BC",${colDelivPcs}$3:${colDelivPcs}$${lastRow})`, dwActualQtyDelivery, '#,##0');
  kpiDwRowData[getColIdx(colDelivKg)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"BC",${colDelivKg}$3:${colDelivKg}$${lastRow})`, dwActualKgDelivery, '#,##0');
  sheetData.push(kpiDwRowData);

  // Khusus E Flute Row
  const kpiEFluteIndex = sheetData.length;
  const kpiEFluteRowData: any[] = Array(totalCols).fill('');
  kpiEFluteRowData[labelColIdx] = '3. KHUSUS E FLUTE';
  kpiEFluteRowData[getColIdx(colQtyPcs)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colQtyPcs}$3:${colQtyPcs}$${lastRow})`, eFluteQtyPcs, '#,##0');
  kpiEFluteRowData[getColIdx(colQtyKg)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colQtyKg}$3:${colQtyKg}$${lastRow})`, eFluteQtyKg, '#,##0');
  kpiEFluteRowData[getColIdx(colPlanPcs)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colPlanPcs}$3:${colPlanPcs}$${lastRow})`, eFluteQtyDelivery, '#,##0');
  kpiEFluteRowData[getColIdx(colPlanKg)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colPlanKg}$3:${colPlanKg}$${lastRow})`, eFluteKgDelivery, '#,##0');
  kpiEFluteRowData[getColIdx(colDelivPcs)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colDelivPcs}$3:${colDelivPcs}$${lastRow})`, eFluteActualQtyDelivery, '#,##0');
  kpiEFluteRowData[getColIdx(colDelivKg)] = fNum(`SUMIF(${colFlu}$3:${colFlu}$${lastRow},"E",${colDelivKg}$3:${colDelivKg}$${lastRow})`, eFluteActualKgDelivery, '#,##0');
  sheetData.push(kpiEFluteRowData);

  // Section 2: Special Sales Recap Box for Substance K200 (SW & DW)
  sheetData.push([]);
  const k200TitleIndex = sheetData.length;
  const k200TitleRowData: any[] = Array(totalCols).fill('');
  k200TitleRowData[labelColIdx] = 'TOTAL ORDER SUBSTANCE K200 (SW & DW)';
  sheetData.push(k200TitleRowData);

  const k200HeaderIndex = sheetData.length;
  const k200HeaderRowData: any[] = Array(totalCols).fill('');
  k200HeaderRowData[labelColIdx] = 'KATEGORI SUBSTANCE K200';
  k200HeaderRowData[getColIdx(colQtyPcs)] = 'Qty PO (Pcs)';
  k200HeaderRowData[getColIdx(colQtyKg)] = 'Qty PO (Kg)';
  k200HeaderRowData[getColIdx(colPlanPcs)] = 'Qty Planning (Pcs)';
  k200HeaderRowData[getColIdx(colPlanKg)] = 'Kg Planning (Kg)';
  k200HeaderRowData[getColIdx(colDelivPcs)] = 'Qty Realisasi (Pcs)';
  k200HeaderRowData[getColIdx(colDelivKg)] = 'Kg Realisasi (Kg)';
  sheetData.push(k200HeaderRowData);

  // K200 SW Row
  const k200SwIndex = sheetData.length;
  const k200SwExcelRow = k200SwIndex + 1;
  const k200SwRowData: any[] = Array(totalCols).fill('');
  k200SwRowData[labelColIdx] = '1. K200 SW (Flute B, C, E)';
  k200SwRowData[getColIdx(colQtyPcs)] = fNum(`SUMIFS(${colQtyPcs}$3:${colQtyPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"B")+SUMIFS(${colQtyPcs}$3:${colQtyPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"C")+SUMIFS(${colQtyPcs}$3:${colQtyPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"E")`, k200SwQtyPcs, '#,##0');
  k200SwRowData[getColIdx(colQtyKg)] = fNum(`SUMIFS(${colQtyKg}$3:${colQtyKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"B")+SUMIFS(${colQtyKg}$3:${colQtyKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"C")+SUMIFS(${colQtyKg}$3:${colQtyKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"E")`, k200SwQtyKg, '#,##0');
  k200SwRowData[getColIdx(colPlanPcs)] = fNum(`SUMIFS(${colPlanPcs}$3:${colPlanPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"B")+SUMIFS(${colPlanPcs}$3:${colPlanPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"C")+SUMIFS(${colPlanPcs}$3:${colPlanPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"E")`, k200SwQtyDelivery, '#,##0');
  k200SwRowData[getColIdx(colPlanKg)] = fNum(`SUMIFS(${colPlanKg}$3:${colPlanKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"B")+SUMIFS(${colPlanKg}$3:${colPlanKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"C")+SUMIFS(${colPlanKg}$3:${colPlanKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"E")`, k200SwKgDelivery, '#,##0');
  k200SwRowData[getColIdx(colDelivPcs)] = fNum(`SUMIFS(${colDelivPcs}$3:${colDelivPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"B")+SUMIFS(${colDelivPcs}$3:${colDelivPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"C")+SUMIFS(${colDelivPcs}$3:${colDelivPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"E")`, k200SwActualQtyDelivery, '#,##0');
  k200SwRowData[getColIdx(colDelivKg)] = fNum(`SUMIFS(${colDelivKg}$3:${colDelivKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"B")+SUMIFS(${colDelivKg}$3:${colDelivKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"C")+SUMIFS(${colDelivKg}$3:${colDelivKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"E")`, k200SwActualKgDelivery, '#,##0');
  sheetData.push(k200SwRowData);

  // K200 DW Row
  const k200DwIndex = sheetData.length;
  const k200DwExcelRow = k200DwIndex + 1;
  const k200DwRowData: any[] = Array(totalCols).fill('');
  k200DwRowData[labelColIdx] = '2. K200 DW (Flute BC)';
  k200DwRowData[getColIdx(colQtyPcs)] = fNum(`SUMIFS(${colQtyPcs}$3:${colQtyPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"BC")`, k200DwQtyPcs, '#,##0');
  k200DwRowData[getColIdx(colQtyKg)] = fNum(`SUMIFS(${colQtyKg}$3:${colQtyKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"BC")`, k200DwQtyKg, '#,##0');
  k200DwRowData[getColIdx(colPlanPcs)] = fNum(`SUMIFS(${colPlanPcs}$3:${colPlanPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"BC")`, k200DwQtyDelivery, '#,##0');
  k200DwRowData[getColIdx(colPlanKg)] = fNum(`SUMIFS(${colPlanKg}$3:${colPlanKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"BC")`, k200DwKgDelivery, '#,##0');
  k200DwRowData[getColIdx(colDelivPcs)] = fNum(`SUMIFS(${colDelivPcs}$3:${colDelivPcs}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"BC")`, k200DwActualQtyDelivery, '#,##0');
  k200DwRowData[getColIdx(colDelivKg)] = fNum(`SUMIFS(${colDelivKg}$3:${colDelivKg}$${lastRow},${colSub}$3:${colSub}$${lastRow},"*K200*",${colFlu}$3:${colFlu}$${lastRow},"BC")`, k200DwActualKgDelivery, '#,##0');
  sheetData.push(k200DwRowData);

  // K200 Subtotal Row
  const k200SubtotalIndex = sheetData.length;
  const k200SubtotalExcelRow = k200SubtotalIndex + 1;
  const k200TotalQtyPcs = k200SwQtyPcs + k200DwQtyPcs;
  const k200TotalQtyKg = k200SwQtyKg + k200DwQtyKg;
  const k200TotalQtyDelivery = k200SwQtyDelivery + k200DwQtyDelivery;
  const k200TotalKgDelivery = k200SwKgDelivery + k200DwKgDelivery;
  const k200TotalActualQtyDelivery = k200SwActualQtyDelivery + k200DwActualQtyDelivery;
  const k200TotalActualKgDelivery = k200SwActualKgDelivery + k200DwActualKgDelivery;

  const k200SubtotalRowData: any[] = Array(totalCols).fill('');
  k200SubtotalRowData[labelColIdx] = 'SUBTOTAL ORDER K200 (SW & DW)';
  k200SubtotalRowData[getColIdx(colQtyPcs)] = fNum(`${colQtyPcs}${k200SwExcelRow}+${colQtyPcs}${k200DwExcelRow}`, k200TotalQtyPcs, '#,##0');
  k200SubtotalRowData[getColIdx(colQtyKg)] = fNum(`${colQtyKg}${k200SwExcelRow}+${colQtyKg}${k200DwExcelRow}`, k200TotalQtyKg, '#,##0');
  k200SubtotalRowData[getColIdx(colPlanPcs)] = fNum(`${colPlanPcs}${k200SwExcelRow}+${colPlanPcs}${k200DwExcelRow}`, k200TotalQtyDelivery, '#,##0');
  k200SubtotalRowData[getColIdx(colPlanKg)] = fNum(`${colPlanKg}${k200SwExcelRow}+${colPlanKg}${k200DwExcelRow}`, k200TotalKgDelivery, '#,##0');
  k200SubtotalRowData[getColIdx(colDelivPcs)] = fNum(`${colDelivPcs}${k200SwExcelRow}+${colDelivPcs}${k200DwExcelRow}`, k200TotalActualQtyDelivery, '#,##0');
  k200SubtotalRowData[getColIdx(colDelivKg)] = fNum(`${colDelivKg}${k200SwExcelRow}+${colDelivKg}${k200DwExcelRow}`, k200TotalActualKgDelivery, '#,##0');
  sheetData.push(k200SubtotalRowData);

  // Non-K200 Row
  const nonK200Index = sheetData.length;
  const nonK200RowData: any[] = Array(totalCols).fill('');
  nonK200RowData[labelColIdx] = '3. SUBSTANCE NON-K200 (Substance Lainnya)';
  nonK200RowData[getColIdx(colQtyPcs)] = fNum(`${colQtyPcs}${gtRow}-${colQtyPcs}${k200SubtotalExcelRow}`, nonK200QtyPcs, '#,##0');
  nonK200RowData[getColIdx(colQtyKg)] = fNum(`${colQtyKg}${gtRow}-${colQtyKg}${k200SubtotalExcelRow}`, nonK200QtyKg, '#,##0');
  nonK200RowData[getColIdx(colPlanPcs)] = fNum(`${colPlanPcs}${gtRow}-${colPlanPcs}${k200SubtotalExcelRow}`, nonK200QtyDelivery, '#,##0');
  nonK200RowData[getColIdx(colPlanKg)] = fNum(`${colPlanKg}${gtRow}-${colPlanKg}${k200SubtotalExcelRow}`, nonK200KgDelivery, '#,##0');
  nonK200RowData[getColIdx(colDelivPcs)] = fNum(`${colDelivPcs}${gtRow}-${colDelivPcs}${k200SubtotalExcelRow}`, nonK200ActualQtyDelivery, '#,##0');
  nonK200RowData[getColIdx(colDelivKg)] = fNum(`${colDelivKg}${gtRow}-${colDelivKg}${k200SubtotalExcelRow}`, nonK200ActualKgDelivery, '#,##0');
  sheetData.push(nonK200RowData);

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Column Widths
  if (includeSourceFileColumn) {
    if (isTotalAccumulation) {
      worksheet['!cols'] = [
        { wch: 22 }, // A: Sumber File
        { wch: 24 }, // B: Customers
        { wch: 22 }, // C: NO PO
        { wch: 20 }, // D: Substance
        { wch: 10 }, // E: Flute
        { wch: 10 }, // F: P
        { wch: 10 }, // G: L
        { wch: 20 }, // H: Artikel
        { wch: 44 }, // Item Name (cukup lebar untuk item & label ringkasan)
        { wch: 14 }, // J: Qty (Pcs)
        { wch: 14 }, // K: Qty (Kg)
        { wch: 16 }, // L: Qty Planning
        { wch: 16 }, // M: Kg Planning
        { wch: 16 }, // N: Qty Delivery
        { wch: 16 }, // O: Kg Delivery
        { wch: 14 }, // P: Harga
        { wch: 14 }, // Q: Rp/Kg
      ];
    } else {
      worksheet['!cols'] = [
        { wch: 22 }, // A: Sumber File
        { wch: 24 }, // B: Customers
        { wch: 22 }, // C: NO PO
        { wch: 20 }, // D: Substance
        { wch: 10 }, // E: Flute
        { wch: 10 }, // F: P
        { wch: 10 }, // G: L
        { wch: 20 }, // H: Artikel
        { wch: 44 }, // Item Name (cukup lebar untuk item & label ringkasan)
        { wch: 14 }, // J: Qty (Pcs)
        { wch: 14 }, // K: Qty (Kg)
        { wch: 16 }, // L: Planning Date
        { wch: 16 }, // M: Qty Planning
        { wch: 16 }, // N: Kg Planning
        { wch: 18 }, // O: Remarks
        { wch: 20 }, // P: Actual Delivery Date
        { wch: 18 }, // Q: No SJ
        { wch: 16 }, // R: Qty Delivery
        { wch: 16 }, // S: Kg Delivery
        { wch: 14 }, // T: Harga
        { wch: 14 }, // U: Rp/Kg
      ];
    }
  } else if (isCombinedMaster) {
    if (isTotalAccumulation) {
      worksheet['!cols'] = [
        { wch: 24 }, // A: Customers
        { wch: 22 }, // B: NO PO
        { wch: 20 }, // C: Substance
        { wch: 10 }, // D: Flute
        { wch: 10 }, // E: P
        { wch: 10 }, // F: L
        { wch: 20 }, // G: Artikel
        { wch: 44 }, // Item Name (cukup lebar untuk item & label ringkasan)
        { wch: 14 }, // I: Qty (Pcs)
        { wch: 14 }, // J: Qty (Kg)
        { wch: 16 }, // K: Qty Planning
        { wch: 16 }, // L: Kg Planning
        { wch: 16 }, // M: Qty Delivery
        { wch: 16 }, // N: Kg Delivery
        { wch: 14 }, // O: Harga
        { wch: 14 }, // P: Rp/Kg
      ];
    } else {
      worksheet['!cols'] = [
        { wch: 24 }, // A: Customers
        { wch: 22 }, // B: NO PO
        { wch: 20 }, // C: Substance
        { wch: 10 }, // D: Flute
        { wch: 10 }, // E: P
        { wch: 10 }, // F: L
        { wch: 20 }, // G: Artikel
        { wch: 44 }, // Item Name (cukup lebar untuk item & label ringkasan)
        { wch: 14 }, // I: Qty (Pcs)
        { wch: 14 }, // J: Qty (Kg)
        { wch: 16 }, // K: Planning Date
        { wch: 16 }, // L: Qty Planning
        { wch: 16 }, // M: Kg Planning
        { wch: 18 }, // N: Remarks
        { wch: 20 }, // O: Actual Delivery Date
        { wch: 18 }, // P: No SJ
        { wch: 16 }, // Q: Qty Delivery
        { wch: 16 }, // R: Kg Delivery
        { wch: 14 }, // S: Harga
        { wch: 14 }, // T: Rp/Kg
      ];
    }
  } else {
    // Individual Customer sheet (NO Customers column)
    if (isTotalAccumulation) {
      worksheet['!cols'] = [
        { wch: 22 }, // A: NO PO
        { wch: 20 }, // B: Substance
        { wch: 10 }, // C: Flute
        { wch: 10 }, // D: P
        { wch: 10 }, // E: L
        { wch: 20 }, // F: Artikel
        { wch: 44 }, // Item Name (cukup lebar untuk item & label ringkasan)
        { wch: 14 }, // H: Qty (Pcs)
        { wch: 14 }, // I: Qty (Kg)
        { wch: 16 }, // J: Qty Planning
        { wch: 16 }, // K: Kg Planning
        { wch: 16 }, // L: Qty Delivery
        { wch: 16 }, // M: Kg Delivery
        { wch: 14 }, // N: Harga
        { wch: 14 }, // O: Rp/Kg
      ];
    } else {
      worksheet['!cols'] = [
        { wch: 22 }, // A: NO PO
        { wch: 20 }, // B: Substance
        { wch: 10 }, // C: Flute
        { wch: 10 }, // D: P
        { wch: 10 }, // E: L
        { wch: 20 }, // F: Artikel
        { wch: 44 }, // Item Name (cukup lebar untuk item & label ringkasan)
        { wch: 14 }, // H: Qty (Pcs)
        { wch: 14 }, // I: Qty (Kg)
        { wch: 16 }, // J: Planning Date
        { wch: 16 }, // K: Qty Planning
        { wch: 16 }, // L: Kg Planning
        { wch: 18 }, // M: Remarks
        { wch: 20 }, // N: Actual Delivery Date
        { wch: 18 }, // O: No SJ
        { wch: 16 }, // P: Qty Delivery
        { wch: 16 }, // Q: Kg Delivery
        { wch: 14 }, // R: Harga
        { wch: 14 }, // S: Rp/Kg
      ];
    }
  }

  // Merges (hanya untuk 2-tier table header; baris Grand Total & Ringkasan tidak di-merge agar sejajar rapi di kolom Item Name)
  const merges: XLSX.Range[] = [];

  if (includeSourceFileColumn) {
    // Size is cols 5 & 6 (F1:G1)
    merges.push({ s: { r: 0, c: 5 }, e: { r: 0, c: 6 } });
    for (let c = 0; c < totalCols; c++) {
      if (c !== 5 && c !== 6) {
        merges.push({ s: { r: 0, c }, e: { r: 1, c } });
      }
    }
  } else if (isCombinedMaster) {
    // Size is cols 4 & 5 (E1:F1)
    merges.push({ s: { r: 0, c: 4 }, e: { r: 0, c: 5 } });
    for (let c = 0; c < totalCols; c++) {
      if (c !== 4 && c !== 5) {
        merges.push({ s: { r: 0, c }, e: { r: 1, c } });
      }
    }
  } else {
    // Size is cols 3 & 4 (D1:E1)
    merges.push({ s: { r: 0, c: 3 }, e: { r: 0, c: 4 } });
    for (let c = 0; c < totalCols; c++) {
      if (c !== 3 && c !== 4) {
        merges.push({ s: { r: 0, c }, e: { r: 1, c } });
      }
    }
  }

  worksheet['!merges'] = merges;

  return worksheet;
}

/**
 * Builds the complete formatted Excel workbook, Blob, and File object in memory (Sales Order Mode)
 */
export function generateSalesOrderExcelBlobAndFile(
  data: ExtractedRecord[],
  customFileName?: string,
  scope: SalesOrderExportScope = 'ALL',
  sortByPoAsc: boolean = false,
  deliveryMode: SalesDeliveryMode = 'FALLBACK_DETAIL_SJ'
): GenerateExcelResult {
  if (!data || data.length === 0) {
    throw new Error('Tidak ada data yang dapat diekspor.');
  }

  const workbook = XLSX.utils.book_new();
  const customerName = data[0]?.customerName || 'PURBAYASA';
  const cleanCustName = customerName.replace(/^PT\.?\s*/i, '').trim().toUpperCase();
  const sheetName = `RECAP ORDER ${cleanCustName || 'PURBAYASA'}`.slice(0, 31);
  const worksheet = buildSalesOrderWorksheet(data, scope, customerName, sortByPoAsc, deliveryMode);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const outputFileName =
    customFileName || getSalesOrderExportFileName(undefined, scope, sortByPoAsc, deliveryMode);
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const file = new File([blob], outputFileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    lastModified: Date.now(),
  });

  return {
    workbook,
    outputFileName,
    blob,
    file,
    scopeTitleSuffix: `${scope}${sortByPoAsc ? ' (URUT NO. PO ASC)' : ''}${deliveryMode === 'TOTAL_ACCUMULATION' ? ' (TOTAL AKUMULASI)' : ''}`,
    recordCount: data.length,
  };
}

/**
 * Exports the Sales Order recap Excel file directly to client download (.xlsx)
 */
export function exportSalesOrderToExcel(
  data: ExtractedRecord[],
  scope: SalesOrderExportScope = 'ALL',
  customFileName?: string,
  sortByPoAsc: boolean = false,
  deliveryMode: SalesDeliveryMode = 'FALLBACK_DETAIL_SJ'
): void {
  const result = generateSalesOrderExcelBlobAndFile(data, customFileName, scope, sortByPoAsc, deliveryMode);
  XLSX.writeFile(result.workbook, result.outputFileName, { compression: true });
}

/**
 * Shares the generated Sales Order Excel file directly to WhatsApp:
 * Strictly ONLY the .xlsx file is shared without message text.
 */
export async function shareSalesOrderExcelFileToWhatsApp(
  data: ExtractedRecord[],
  scope: SalesOrderExportScope = 'ALL',
  customFileName?: string,
  sortByPoAsc: boolean = false,
  deliveryMode: SalesDeliveryMode = 'FALLBACK_DETAIL_SJ'
): Promise<ShareExcelResult> {
  const { blob, file, outputFileName } = generateSalesOrderExcelBlobAndFile(
    data,
    customFileName,
    scope,
    sortByPoAsc,
    deliveryMode
  );

  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canShareFiles) {
    try {
      await navigator.share({
        files: [file],
      });
      return {
        success: true,
        method: 'web-share',
        fileName: outputFileName,
        message: `File Excel Sales "${outputFileName}" berhasil dibagikan langsung!`,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return {
          success: false,
          method: 'cancelled',
          fileName: outputFileName,
          message: 'Berbagi file dibatalkan.',
        };
      }
      console.warn('Web Share failed or blocked, fallback to download + WhatsApp...', err);
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = outputFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const isMobile =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const waUrl = isMobile ? 'https://wa.me/' : 'https://web.whatsapp.com/';
  window.open(waUrl, '_blank', 'noopener,noreferrer');

  return {
    success: true,
    method: 'download-and-web',
    fileName: outputFileName,
    message: `File Sales "${outputFileName}" berhasil diunduh & WhatsApp dibuka. Silakan lampirkan file ke chat.`,
  };
}
