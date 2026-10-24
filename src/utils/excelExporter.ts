import * as XLSX from 'xlsx';
import { ExtractedRecord, ExcelExportScope, DetailSJExportScope } from '../types';
import { recalculateFIFOStock, flattenDeliveriesForDataEntry } from './parserEngine';

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
  'QTY Kirim SJ (pcs)',
  'Berat Kirim SJ (KG)',
  'Sisa OS Berjalan (pcs)',
  'Sisa OS Berjalan (KG)',
  'Total Terkirim PO (pcs)',
  'Total Terkirim PO (KG)',
  'Sisa OS Akhir PO (pcs)',
  'Sisa OS Akhir PO (KG)',
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
      return `${baseName}_DETAIL_BELUM_KIRIM_FALLBACK_OS.xlsx`;
    case 'HAS_SISA_OS':
      return `${baseName}_DETAIL_KIRIMAN_SISA_OS.xlsx`;
    case 'ALL':
    default:
      return `${baseName}_DETAIL_KIRIMAN_SJ.xlsx`;
  }
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
  let sheetName = 'Rekap Seluruh CO';

  if (scope === 'OPEN_ONLY') {
    filteredData = scopedData.filter((d) => d.coStatus === 'OPEN');
    scopeTitleSuffix = 'KHUSUS CO OPEN (O)';
    defaultFilePrefix = 'Rekap_Customer_CO_Open_Only';
    sheetName = 'CO Open Only';
  } else if (scope === 'CLOSED_ONLY') {
    filteredData = scopedData.filter((d) => d.coStatus === 'CLOSED');
    scopeTitleSuffix = 'KHUSUS CO CLOSED (C)';
    defaultFilePrefix = 'Rekap_Customer_CO_Closed_Only';
    sheetName = 'CO Closed Only';
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
    else if (scope === 'OVER_STOCK_GUDANG' || scope === 'OVER_PRODUCTION_ONLY') scopeDesc = 'kriteria "Over Stock Gudang"';
    else if (scope === 'OVER_KIRIMAN') scopeDesc = 'kriteria "Over Kiriman"';
    throw new Error(`Tidak ada data dengan ${scopeDesc} untuk diekspor.`);
  }

  // Compute unique No PO count vs PO-Item line count
  const normalPoCountMap = new Map<string, number>();
  for (const item of filteredData) {
    const cleanNoPO = String(item['No PO'] || '').trim();
    if (cleanNoPO && cleanNoPO !== '-') {
      normalPoCountMap.set(cleanNoPO, (normalPoCountMap.get(cleanNoPO) || 0) + 1);
    }
  }
  const normalUniquePONumbers = normalPoCountMap.size > 0 ? normalPoCountMap.size : filteredData.length;
  let normalMultiItemPOCount = 0;
  for (const [, count] of normalPoCountMap) {
    if (count > 1) normalMultiItemPOCount++;
  }

  // Prepare 2D matrix
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

  for (const item of filteredData) {
    const qtyPcs = Number(item['QTY PO (pcs)']) || 0;
    const beratKg = Number(item['Berat PO (KG)']) || 0;
    const stockPcs = Number(item['Stock (pcs)']) || 0;
    const stockKg = Number(item['Stock (kg)']) || 0;
    const sisaPcs = Number(item['Sisa OS (pcs)']) || 0;
    const sisaKg = Number(item['Sisa OS (kg)']) || 0;
    const terkirimPcs = item['Terkirim (PCS)'] !== undefined ? Number(item['Terkirim (PCS)']) : Math.max(0, qtyPcs - sisaPcs);
    const terkirimKg = item['Terkirim (KG)'] !== undefined ? Number(item['Terkirim (KG)']) : Math.max(0, beratKg - sisaKg);
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
      sisaPcs,
      sisaKg,
      terkirimPcs,
      terkirimKg,
      overStockPcs,
      overStockKg,
      overKirimanPcs,
      overKirimanKg,
      harga,
    ]);
  }

  // Row Total Summary at the bottom
  sheetData.push([
    `TOTAL REKAPITULASI (${normalUniquePONumbers} NO. PO UNIK / ${filteredData.length} BARIS ITEM)`,
    '',
    '',
    '',
    '',
    '',
    sumQtyPcs,
    sumBeratKg,
    sumStockPcs,
    sumStockKg,
    sumSisaPcs,
    sumSisaKg,
    sumTerkirimPcs,
    sumTerkirimKg,
    sumOverStockPcs,
    sumOverStockKg,
    sumOverKirimanPcs,
    sumOverKirimanKg,
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
 * Builds the Professional Standard Data Entry Excel Workbook for Mode Detail Kiriman (Per Surat Jalan / SJ).
 * Includes 5 structured sheets:
 * 1. "Detail Kiriman SJ" — Standard Data Entry tabular sheet (non-duplicated PO totals so column SUM is exact)
 * 2. "Rekap per No PO Unik" — Deduplicated by No PO Only (1 row per unique No PO, e.g. 18 PO, consolidating multi-item POs)
 * 3. "Grup PO & Sub-Total OS" — Grouped per PO-Item with explicit SUB-TOTAL & SISA OS row under each PO
 * 4. "Database Flat SJ" — Full repeated PO fields on every row for single-row SJ filter/VLOOKUP
 * 5. "Matriks Horizontal SJ" — 1 row per PO-Item with side-by-side columns SJ #1, SJ #2, SJ #3... and Sisa OS Akhir
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
  else if (scope === 'WITH_DELIVERY_ONLY') scopeTitleSuffix = 'KHUSUS PO SUDAH ADA KIRIMAN (SJ AKTIF)';
  else if (scope === 'MULTI_DELIVERY_ONLY') scopeTitleSuffix = 'KHUSUS PO MULTI-KIRIMAN (2+ SURAT JALAN)';
  else if (scope === 'NO_DELIVERY_FALLBACK') scopeTitleSuffix = 'KHUSUS PO BELUM KIRIM';
  else if (scope === 'HAS_SISA_OS') scopeTitleSuffix = 'KHUSUS PO MASIH ADA SISA OS (> 0 PCS)';

  const nowStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Compute accurate PO-Item line count AND Unique No PO document count
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

  for (const r of flatRows) {
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
    }
    if (r.isLastRowOfPO) {
      sumTotalTerkirimPOPcs += r['Total Terkirim PO (pcs)'];
      sumTotalTerkirimPOKg += r['Total Terkirim PO (KG)'];
      sumSisaOSAkhirPcs += r['Sisa OS Akhir PO (pcs)'];
      sumSisaOSAkhirKg += r['Sisa OS Akhir PO (KG)'];
      sumStockPcs += r['Stock (pcs)'];
      sumStockKg += r['Stock (kg)'];
    }
  }

  const totalUniqueNoPOs = uniqueNoPoCounts.size > 0 ? uniqueNoPoCounts.size : totalPOItemLines;
  let totalMultiItemNoPOs = 0;
  for (const [, count] of uniqueNoPoCounts) {
    if (count > 1) totalMultiItemNoPOs++;
  }

  const colWidths23 = [
    { wch: 16 }, // 1. CO
    { wch: 12 }, // 2. Status CO
    { wch: 18 }, // 3. Artikel
    { wch: 34 }, // 4. Item Description
    { wch: 16 }, // 5. Tanggal Input PO
    { wch: 26 }, // 6. No PO
    { wch: 16 }, // 7. Substance
    { wch: 15 }, // 8. QTY PO (pcs)
    { wch: 15 }, // 9. Berat PO (KG)
    { wch: 24 }, // 10. Urutan Kirim
    { wch: 20 }, // 11. No Surat Jalan (SJ)
    { wch: 18 }, // 12. Tanggal Kirim (SJ)
    { wch: 18 }, // 13. QTY Kirim SJ (pcs)
    { wch: 18 }, // 14. Berat Kirim SJ (KG)
    { wch: 20 }, // 15. Sisa OS Berjalan (pcs)
    { wch: 20 }, // 16. Sisa OS Berjalan (KG)
    { wch: 21 }, // 17. Total Terkirim PO (pcs)
    { wch: 21 }, // 18. Total Terkirim PO (KG)
    { wch: 20 }, // 19. Sisa OS Akhir PO (pcs)
    { wch: 20 }, // 20. Sisa OS Akhir PO (KG)
    { wch: 18 }, // 21. Stock Gudang (pcs)
    { wch: 18 }, // 22. Stock Gudang (KG)
    { wch: 14 }, // 23. Harga
  ];

  // =========================================================================
  // SHEET 1: Detail Kiriman SJ (Standard Data Entry Professional)
  // QTY PO is placed on the first row of each PO, and Total Terkirim PO + Sisa OS Akhir PO
  // are placed on the last row of each PO so Excel column SUM() is 100% exact without double-counting!
  // =========================================================================
  const sheet1Data: any[][] = [];
  sheet1Data.push([`REKAPITULASI DETAIL KIRIMAN PER SURAT JALAN (SJ) & SISA OS - [${scopeTitleSuffix}]`]);
  sheet1Data.push([
    `Tanggal Rekap: ${nowStr} | Total No. PO Unik: ${totalUniqueNoPOs} PO (${totalMultiItemNoPOs} PO Multi-Item) | Total Baris PO-Item: ${totalPOItemLines} Baris | Total Transaksi SJ: ${totalRealSJCount} Kiriman | Total QTY PO: ${sumQtyPoPcs.toLocaleString('id-ID')} PCS | Total Terkirim: ${sumTotalTerkirimPOPcs.toLocaleString('id-ID')} PCS | Total Sisa OS: ${sumSisaOSAkhirPcs.toLocaleString('id-ID')} PCS`,
  ]);
  sheet1Data.push([]);
  sheet1Data.push([...DETAIL_SJ_EXCEL_COLUMNS]);

  for (const r of flatRows) {
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
      r['QTY Kirim SJ (pcs)'],
      r['Berat Kirim SJ (KG)'],
      r['Sisa OS Berjalan (pcs)'],
      r['Sisa OS Berjalan (KG)'],
      r.isLastRowOfPO ? r['Total Terkirim PO (pcs)'] : '',
      r.isLastRowOfPO ? r['Total Terkirim PO (KG)'] : '',
      r.isLastRowOfPO ? r['Sisa OS Akhir PO (pcs)'] : '',
      r.isLastRowOfPO ? r['Sisa OS Akhir PO (KG)'] : '',
      r.isLastRowOfPO ? r['Stock (pcs)'] : '',
      r.isLastRowOfPO ? r['Stock (kg)'] : '',
      r.isFirstRowOfPO ? r.Harga : '',
    ]);
  }

  sheet1Data.push([
    'TOTAL REKAPITULASI KESELURUHAN',
    '',
    '',
    '',
    '',
    `${totalUniqueNoPOs} PO Unik / ${totalPOItemLines} Item`,
    `${totalRealSJCount} SJ`,
    sumQtyPoPcs,
    sumBeratPoKg,
    '',
    '',
    '',
    sumQtyKirimSJPcs,
    sumBeratKirimSJKg,
    '',
    '',
    sumTotalTerkirimPOPcs,
    sumTotalTerkirimPOKg,
    sumSisaOSAkhirPcs,
    sumSisaOSAkhirKg,
    sumStockPcs,
    sumStockKg,
    '',
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = colWidths23;
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 22 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 22 } },
    { s: { r: sheet1Data.length - 1, c: 0 }, e: { r: sheet1Data.length - 1, c: 4 } },
  ];

  // =========================================================================
  // SHEET 2: Grup per PO & Sub-Total OS (Hierarchical with Sub-Total row after each PO)
  // =========================================================================
  const sheet2Data: any[][] = [];
  sheet2Data.push([`REKAPITULASI GRUP PER PO & RINCIAN SURAT JALAN (DENGAN SUB-TOTAL SISA OS PER PO)`]);
  sheet2Data.push([
    `Tanggal Rekap: ${nowStr} | Total No. PO Unik: ${totalUniqueNoPOs} PO | Total Baris PO-Item: ${totalPOItemLines} Baris | Setiap PO dilengkapi rincian tahapan Surat Jalan (SJ) beserta baris Sub-Total & Sisa OS Akhir.`,
  ]);
  sheet2Data.push([]);
  sheet2Data.push([...DETAIL_SJ_EXCEL_COLUMNS]);

  for (const r of flatRows) {
    sheet2Data.push([
      r.isFirstRowOfPO ? r.CO : '',
      r.isFirstRowOfPO ? r.coStatus : '',
      r.isFirstRowOfPO ? r.Artikel : '',
      r.isFirstRowOfPO ? r['Item Description'] : '',
      r.isFirstRowOfPO ? r['Tanggal Input PO'] : '',
      r.isFirstRowOfPO ? r['No PO'] : '',
      r.isFirstRowOfPO ? r.Substance : '',
      r.isFirstRowOfPO ? r['QTY PO (pcs)'] : '',
      r.isFirstRowOfPO ? r['Berat PO (KG)'] : '',
      r.isFallbackNoDelivery ? 'Belum Kirim' : r.labelKiriman,
      r['No Surat Jalan (SJ)'],
      r['Tanggal Kirim (SJ)'],
      r['QTY Kirim SJ (pcs)'],
      r['Berat Kirim SJ (KG)'],
      r['Sisa OS Berjalan (pcs)'],
      r['Sisa OS Berjalan (KG)'],
      r.isLastRowOfPO ? r['Total Terkirim PO (pcs)'] : '',
      r.isLastRowOfPO ? r['Total Terkirim PO (KG)'] : '',
      r.isLastRowOfPO ? r['Sisa OS Akhir PO (pcs)'] : '',
      r.isLastRowOfPO ? r['Sisa OS Akhir PO (KG)'] : '',
      r.isLastRowOfPO ? r['Stock (pcs)'] : '',
      r.isLastRowOfPO ? r['Stock (kg)'] : '',
      r.isFirstRowOfPO ? r.Harga : '',
    ]);

    if (r.isLastRowOfPO) {
      const statusInfo = r.isFallbackNoDelivery
        ? 'Belum Kirim'
        : `TOTAL ${r.frekuensiKirim}X KIRIM SJ`;
      sheet2Data.push([
        `   ↳ SUB-TOTAL PO: ${r['No PO']} (${r.Artikel})`,
        r.coStatus,
        r.Artikel,
        statusInfo,
        r['Tanggal Input PO'],
        r['No PO'],
        r.Substance,
        r['QTY PO (pcs)'],
        r['Berat PO (KG)'],
        r.isFallbackNoDelivery ? 'Belum Kirim' : `REKAP PO (${r.frekuensiKirim} SJ)`,
        '-',
        '-',
        r['Total Terkirim PO (pcs)'],
        r['Total Terkirim PO (KG)'],
        r['Sisa OS Akhir PO (pcs)'],
        r['Sisa OS Akhir PO (KG)'],
        r['Total Terkirim PO (pcs)'],
        r['Total Terkirim PO (KG)'],
        r['Sisa OS Akhir PO (pcs)'],
        r['Sisa OS Akhir PO (KG)'],
        r['Stock (pcs)'],
        r['Stock (kg)'],
        r.Harga,
      ]);
      // Blank separator row between POs for visual clarity
      sheet2Data.push([]);
    }
  }

  sheet2Data.push([
    'GRAND TOTAL KESELURUHAN',
    '',
    '',
    '',
    '',
    `${totalUniqueNoPOs} PO Unik / ${totalPOItemLines} Item`,
    `${totalRealSJCount} SJ`,
    sumQtyPoPcs,
    sumBeratPoKg,
    '',
    '',
    '',
    sumQtyKirimSJPcs,
    sumBeratKirimSJKg,
    '',
    '',
    sumTotalTerkirimPOPcs,
    sumTotalTerkirimPOKg,
    sumSisaOSAkhirPcs,
    sumSisaOSAkhirKg,
    sumStockPcs,
    sumStockKg,
    '',
  ]);

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = colWidths23;
  ws2['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 22 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 22 } },
  ];

  // =========================================================================
  // SHEET 3: Data Entry Flat Penuh (All columns repeated on every row for Pivot / Filter)
  // =========================================================================
  const sheet3Data: any[][] = [];
  sheet3Data.push([`TABEL DATABASE FLAT DETAIL SURAT JALAN (UNTUK FILTER & PIVOT EXCEL)`]);
  sheet3Data.push([
    `Tanggal Rekap: ${nowStr} | Total No. PO Unik: ${totalUniqueNoPOs} PO | Total Baris PO-Item: ${totalPOItemLines} Baris | Seluruh atribut PO diulang penuh pada setiap baris SJ.`,
  ]);
  sheet3Data.push([]);
  sheet3Data.push([...DETAIL_SJ_EXCEL_COLUMNS]);

  for (const r of flatRows) {
    sheet3Data.push([
      r.CO,
      r.coStatus,
      r.Artikel,
      r['Item Description'],
      r['Tanggal Input PO'],
      r['No PO'],
      r.Substance,
      r['QTY PO (pcs)'],
      r['Berat PO (KG)'],
      r.isFallbackNoDelivery ? 'Belum Kirim' : r.labelKiriman,
      r['No Surat Jalan (SJ)'],
      r['Tanggal Kirim (SJ)'],
      r['QTY Kirim SJ (pcs)'],
      r['Berat Kirim SJ (KG)'],
      r['Sisa OS Berjalan (pcs)'],
      r['Sisa OS Berjalan (KG)'],
      r['Total Terkirim PO (pcs)'],
      r['Total Terkirim PO (KG)'],
      r['Sisa OS Akhir PO (pcs)'],
      r['Sisa OS Akhir PO (KG)'],
      r['Stock (pcs)'],
      r['Stock (kg)'],
      r.Harga,
    ]);
  }

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  ws3['!cols'] = colWidths23;
  ws3['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 22 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 22 } },
  ];

  // =========================================================================
  // SHEET 4: Matriks Horizontal (1 Baris = 1 PO-Item, Kolom Menyamping SJ #1, SJ #2, SJ #3...)
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
    if (scope === 'HAS_SISA_OS') return (po['Sisa OS (pcs)'] || 0) > 0 || (po['Sisa OS (kg)'] || 0) > 0;
    return true;
  });

  const maxSJ = Math.max(
    1,
    ...scopedPOs.map((po) =>
      (po.deliveries || []).filter((d) => !d.isFallbackNoDelivery && d.noSJ !== '-').length
    )
  );

  const horizHeaders: string[] = [
    'CO',
    'Status CO',
    'Artikel',
    'Item Description',
    'Tanggal Input PO',
    'No PO',
    'Substance',
    'QTY PO (pcs)',
    'Berat PO (KG)',
    'Frekuensi Kirim (Kali)',
  ];

  for (let i = 1; i <= maxSJ; i++) {
    horizHeaders.push(
      `SJ #${i} - No SJ`,
      `SJ #${i} - Tgl Kirim`,
      `SJ #${i} - Qty Kirim (pcs)`,
      `SJ #${i} - Berat Kirim (KG)`
    );
  }

  horizHeaders.push(
    'Total Terkirim (pcs)',
    'Total Terkirim (KG)',
    'Sisa OS Akhir (pcs)',
    'Sisa OS Akhir (KG)',
    'Stock Gudang (pcs)',
    'Stock Gudang (KG)',
    'Harga'
  );

  const sheet4Data: any[][] = [];
  sheet4Data.push([`MATRIKS HORIZONTAL DETAIL KIRIMAN SURAT JALAN (1 BARIS = 1 BARIS PO-ITEM)`]);
  sheet4Data.push([
    `Tanggal Rekap: ${nowStr} | Total No. PO Unik: ${totalUniqueNoPOs} PO | Total Baris PO-Item: ${totalPOItemLines} Baris | Maksimal Tahapan Kirim: ${maxSJ}x Surat Jalan`,
  ]);
  sheet4Data.push([]);
  sheet4Data.push(horizHeaders);

  for (const po of scopedPOs) {
    const realSJs = (po.deliveries || []).filter((d) => !d.isFallbackNoDelivery && d.noSJ !== '-');
    const rowArr: any[] = [
      po.CO || '-',
      po.coStatus || 'UNKNOWN',
      po.Artikel || '-',
      po['Item Description'] || '-',
      po['Tanggal Input PO'] || '-',
      po['No PO'] || '-',
      po.Substance || '-',
      Number(po['QTY PO (pcs)']) || 0,
      Number(po['Berat PO (KG)']) || 0,
      realSJs.length,
    ];

    for (let i = 0; i < maxSJ; i++) {
      const sj = realSJs[i];
      if (sj) {
        rowArr.push(sj.noSJ, sj.tanggalKirim, sj.qtyKirimPcs, sj.beratKirimKg);
      } else {
        rowArr.push('-', '-', 0, 0);
      }
    }

    rowArr.push(
      Number(po['Terkirim (PCS)']) || 0,
      Number(po['Terkirim (KG)']) || 0,
      Number(po['Sisa OS (pcs)']) || 0,
      Number(po['Sisa OS (kg)']) || 0,
      Number(po['Stock (pcs)']) || 0,
      Number(po['Stock (kg)']) || 0,
      Number(po.Harga) || 0
    );

    sheet4Data.push(rowArr);
  }

  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);
  ws4['!cols'] = horizHeaders.map((h) => ({ wch: Math.max(16, h.length + 3) }));

  // =========================================================================
  // SHEET 5: Rekap per No PO Unik (By PO Only — 1 Row = 1 Unique No PO)
  // Consolidates POs that contain multiple items/articles under the same No PO
  // =========================================================================
  const uniquePOMap = new Map<
    string,
    {
      noPO: string;
      tanggalInputPO: string;
      coList: string[];
      artikelList: string[];
      itemDescList: string[];
      lineCount: number;
      qtyPoPcs: number;
      beratPoKg: number;
      terkirimPcs: number;
      terkirimKg: number;
      sisaOSPcs: number;
      sisaOSKg: number;
      stockPcs: number;
      stockKg: number;
      sjList: string[];
    }
  >();

  for (const po of scopedPOs) {
    const key = String(po['No PO'] || '-').trim();
    const realSJs = (po.deliveries || []).filter((d) => !d.isFallbackNoDelivery && d.noSJ !== '-');
    if (!uniquePOMap.has(key)) {
      uniquePOMap.set(key, {
        noPO: key,
        tanggalInputPO: po['Tanggal Input PO'] || '-',
        coList: [],
        artikelList: [],
        itemDescList: [],
        lineCount: 0,
        qtyPoPcs: 0,
        beratPoKg: 0,
        terkirimPcs: 0,
        terkirimKg: 0,
        sisaOSPcs: 0,
        sisaOSKg: 0,
        stockPcs: 0,
        stockKg: 0,
        sjList: [],
      });
    }
    const entry = uniquePOMap.get(key)!;
    entry.lineCount++;
    if (po.CO && !entry.coList.includes(po.CO)) entry.coList.push(po.CO);
    if (po.Artikel && !entry.artikelList.includes(po.Artikel)) entry.artikelList.push(po.Artikel);
    if (po['Item Description'] && !entry.itemDescList.includes(po['Item Description'])) {
      entry.itemDescList.push(po['Item Description']);
    }
    entry.qtyPoPcs += Number(po['QTY PO (pcs)']) || 0;
    entry.beratPoKg += Number(po['Berat PO (KG)']) || 0;
    entry.terkirimPcs += Number(po['Terkirim (PCS)']) || 0;
    entry.terkirimKg += Number(po['Terkirim (KG)']) || 0;
    entry.sisaOSPcs += Number(po['Sisa OS (pcs)']) || 0;
    entry.sisaOSKg += Number(po['Sisa OS (kg)']) || 0;
    entry.stockPcs += Number(po['Stock (pcs)']) || 0;
    entry.stockKg += Number(po['Stock (kg)']) || 0;
    for (const sj of realSJs) {
      const sjTag = `${sj.noSJ} (${sj.tanggalKirim}: ${sj.qtyKirimPcs})`;
      if (!entry.sjList.includes(sjTag)) entry.sjList.push(sjTag);
    }
  }

  const sheet5Headers = [
    'No',
    'No PO (Unik)',
    'Tanggal Input PO',
    'Jumlah Item di PO',
    'Tipe PO',
    'Daftar Artikel',
    'Daftar CO',
    'Total QTY PO (pcs)',
    'Total Berat PO (KG)',
    'Status Pengiriman',
    'Jumlah Transaksi SJ',
    'Rincian Surat Jalan (SJ)',
    'Total Terkirim (pcs)',
    'Total Terkirim (KG)',
    'Total Sisa OS Akhir (pcs)',
    'Total Sisa OS Akhir (KG)',
    'Total Stock Gudang (pcs)',
  ];

  const sheet5Data: any[][] = [];
  sheet5Data.push([`REKAPITULASI KONSOLIDASI PER NOMOR PO UNIK (BY NO. PO ONLY - TANPA DUPLIKAT PO MULTI-ITEM)`]);
  sheet5Data.push([
    `Tanggal Rekap: ${nowStr} | Total Dokumen No. PO Unik: ${uniquePOMap.size} PO | Total Baris PO-Item: ${totalPOItemLines} Baris (${totalMultiItemNoPOs} No. PO memiliki lebih dari 1 Artikel/Item)`,
  ]);
  sheet5Data.push([]);
  sheet5Data.push(sheet5Headers);

  let idxPoUnik = 0;
  for (const [, entry] of uniquePOMap) {
    idxPoUnik++;
    const statusKirim =
      entry.sjList.length === 0
        ? 'Belum Kirim'
        : entry.sisaOSPcs <= 0
        ? 'Lunas Terkirim'
        : `Terkirim Sebagian (${entry.sjList.length} SJ)`;
    sheet5Data.push([
      idxPoUnik,
      entry.noPO,
      entry.tanggalInputPO,
      entry.lineCount,
      entry.lineCount > 1 ? `Multi-Item (${entry.lineCount} Artikel)` : 'Single-Item (1 Artikel)',
      entry.artikelList.join(', '),
      entry.coList.join(', '),
      entry.qtyPoPcs,
      entry.beratPoKg,
      statusKirim,
      entry.sjList.length,
      entry.sjList.length > 0 ? entry.sjList.join(' | ') : 'Belum Kirim',
      entry.terkirimPcs,
      entry.terkirimKg,
      entry.sisaOSPcs,
      entry.sisaOSKg,
      entry.stockPcs,
    ]);
  }

  sheet5Data.push([
    'TOTAL KESELURUHAN',
    `${uniquePOMap.size} No. PO Unik`,
    '',
    `${totalPOItemLines} Baris Item`,
    `${totalMultiItemNoPOs} PO Multi-Item`,
    '',
    '',
    sumQtyPoPcs,
    sumBeratPoKg,
    '',
    totalRealSJCount,
    '',
    sumTotalTerkirimPOPcs,
    sumTotalTerkirimPOKg,
    sumSisaOSAkhirPcs,
    sumSisaOSAkhirKg,
    sumStockPcs,
  ]);

  const ws5 = XLSX.utils.aoa_to_sheet(sheet5Data);
  ws5['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 16 },
    { wch: 18 },
    { wch: 24 },
    { wch: 36 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 24 },
    { wch: 18 },
    { wch: 45 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
  ];
  ws5['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 16 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 16 } },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws1, 'Detail Kiriman SJ');
  XLSX.utils.book_append_sheet(workbook, ws5, 'Rekap per No PO Unik');
  XLSX.utils.book_append_sheet(workbook, ws2, 'Grup PO & Sub-Total OS');
  XLSX.utils.book_append_sheet(workbook, ws3, 'Database Flat SJ');
  XLSX.utils.book_append_sheet(workbook, ws4, 'Matriks Horizontal SJ');

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
  const { workbook, outputFileName } = generateDetailSJExcelBlobAndFile(data, customFileName, scope);
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

  // Check if Web Share API with files is available on this browser/device
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canShareFiles) {
    try {
      // Pass ONLY the file document — strictly no text / no caption ("tanpa ketikan")
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

  // Fallback for desktop or browsers without native file share:
  // 1. Trigger instant download of the file to Downloads folder
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = outputFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  // 2. Open WhatsApp directly with NO text parameters ("tanpa ketikan")
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const waUrl = isMobile ? 'https://wa.me/' : 'https://web.whatsapp.com/';
  window.open(waUrl, '_blank', 'noopener,noreferrer');

  return {
    success: true,
    method: 'download-and-web',
    fileName: outputFileName,
    message: `File "${outputFileName}" berhasil diunduh & WhatsApp dibuka (hanya file .xlsx, tanpa ketikan). Silakan lampirkan file ke chat.`,
  };
}

