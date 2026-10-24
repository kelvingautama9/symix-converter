import * as XLSX from 'xlsx';
import {
  ExtractedRecord,
  ExcelExportScope,
  DetailSJExportScope,
  DeliveryStatusTag,
} from '../types';
import { recalculateFIFOStock, flattenDeliveriesForDataEntry } from './parserEngine';
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
  scope: ExcelExportScope = 'ALL'
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
  scope: ExcelExportScope = 'ALL'
): void {
  const { workbook, outputFileName } = generateExcelBlobAndFile(data, customFileName, scope);
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
  scope: DetailSJExportScope = 'ALL'
): GenerateExcelResult {
  if (!data || data.length === 0) {
    throw new Error('Tidak ada data yang dapat diekspor.');
  }

  const flatRows = flattenDeliveriesForDataEntry(data, scope);
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
  scope: DetailSJExportScope = 'ALL'
): void {
  const { workbook, outputFileName } = generateDetailSJExcelBlobAndFile(
    data,
    customFileName,
    scope
  );
  XLSX.writeFile(workbook, outputFileName);
}

/**
 * Shares the generated Detail SJ Excel file directly to WhatsApp
 */
export async function shareDetailSJExcelFileToWhatsApp(
  data: ExtractedRecord[],
  scope: DetailSJExportScope = 'ALL',
  customFileName?: string
): Promise<ShareExcelResult> {
  const { blob, file, outputFileName } = generateDetailSJExcelBlobAndFile(
    data,
    customFileName,
    scope
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
