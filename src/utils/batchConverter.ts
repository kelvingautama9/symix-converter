import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {
  BatchFileItem,
  BatchAggregateStats,
  ExcelExportScope,
  DetailSJExportScope,
  SalesOrderExportScope,
  SalesDeliveryMode,
  ExtractedRecord,
  ParseSummary,
} from '../types';
import {
  parseExcelBuffer,
  recalculateFIFOStock,
  flattenDeliveriesForDataEntry,
  flattenSalesOrderRows,
} from './parserEngine';
import {
  generateExcelBlobAndFile,
  getExportFileName,
  EXCEL_COLUMNS,
  generateDetailSJExcelBlobAndFile,
  getDetailSJExportFileName,
  DETAIL_SJ_EXCEL_COLUMNS,
  buildSalesOrderWorksheet,
  generateSalesOrderExcelBlobAndFile,
  getSalesOrderExportFileName,
} from './excelExporter';

/**
 * Triggers a browser file download from a Blob
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Processes a single raw ERP Excel/CSV file directly into ExtractedRecords, summary, and a ready-to-download Excel Blob.
 */
export async function convertSingleRawFile(
  file: File,
  scope: ExcelExportScope = 'ALL'
): Promise<{
  data: ExtractedRecord[];
  summary: ParseSummary;
  workbook: XLSX.WorkBook;
  excelBlob: Blob;
  outputFileName: string;
  durationMs: number;
  rawBuffer: ArrayBuffer;
}> {
  const start = performance.now();
  const rawBuffer = await file.arrayBuffer();
  const { data: parsedData, summary: parsedSummary, workbook } = parseExcelBuffer(
    rawBuffer,
    file.name
  );

  if (!parsedData || parsedData.length === 0) {
    throw new Error('Tidak ditemukan data PO valid (SH-/ST-/BX-/DC- dan DAP/PO).');
  }

  const { blob, outputFileName } = generateExcelBlobAndFile(parsedData, file.name, scope);
  const durationMs = Math.round(performance.now() - start);

  return {
    data: parsedData,
    summary: parsedSummary,
    workbook,
    excelBlob: blob,
    outputFileName,
    durationMs,
    rawBuffer,
  };
}

/**
 * Compiles all successful batch converted Excel files into a single ZIP archive (Rekap PO Mode).
 */
export async function downloadAllAsZip(
  items: BatchFileItem[],
  zipBaseName: string = 'BLACKEYE_REKAP_PO_BATCH'
): Promise<{ success: boolean; zipFileName: string; count: number }> {
  const validItems = items.filter(
    (item) => item.status === 'success' && item.excelBlob && item.outputFileName
  );

  if (validItems.length === 0) {
    throw new Error('Tidak ada file hasil konversi yang valid untuk diunduh.');
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const item of validItems) {
    if (!item.excelBlob || !item.outputFileName) continue;

    let targetName = item.outputFileName;
    if (usedNames.has(targetName)) {
      const dotIdx = targetName.lastIndexOf('.');
      const base = dotIdx !== -1 ? targetName.substring(0, dotIdx) : targetName;
      const ext = dotIdx !== -1 ? targetName.substring(dotIdx) : '.xlsx';
      let counter = 2;
      while (usedNames.has(`${base}_(${counter})${ext}`)) {
        counter++;
      }
      targetName = `${base}_(${counter})${ext}`;
    }
    usedNames.add(targetName);

    zip.file(targetName, item.excelBlob);
  }

  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
  const zipFileName = `${zipBaseName}_${dateTag}.zip`;

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  downloadBlob(zipBlob, zipFileName);

  return {
    success: true,
    zipFileName,
    count: validItems.length,
  };
}

/**
 * Compiles all converted files into a single ZIP archive (Detail Kiriman SJ Mode).
 */
export async function downloadAllDetailSJAsZip(
  items: BatchFileItem[],
  scope: DetailSJExportScope = 'ALL',
  zipBaseName: string = 'BLACKEYE_DETAIL_KIRIMAN_SJ_BATCH'
): Promise<{ success: boolean; zipFileName: string; count: number }> {
  const validItems = items.filter(
    (item) => item.status === 'success' && item.data && item.data.length > 0
  );

  if (validItems.length === 0) {
    throw new Error('Tidak ada file hasil konversi yang valid untuk diunduh.');
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const item of validItems) {
    if (!item.data) continue;
    const { blob } = generateDetailSJExcelBlobAndFile(item.data, item.rawFileName, scope);
    let targetName = getDetailSJExportFileName(item.rawFileName, scope);

    if (usedNames.has(targetName)) {
      const dotIdx = targetName.lastIndexOf('.');
      const base = dotIdx !== -1 ? targetName.substring(0, dotIdx) : targetName;
      const ext = dotIdx !== -1 ? targetName.substring(dotIdx) : '.xlsx';
      let counter = 2;
      while (usedNames.has(`${base}_(${counter})${ext}`)) {
        counter++;
      }
      targetName = `${base}_(${counter})${ext}`;
    }
    usedNames.add(targetName);
    zip.file(targetName, blob);
  }

  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
  const zipFileName = `${zipBaseName}_${dateTag}.zip`;

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  downloadBlob(zipBlob, zipFileName);

  return {
    success: true,
    zipFileName,
    count: validItems.length,
  };
}

/**
 * Compiles all converted files into a single ZIP archive (Rekap Sales Mode).
 */
export async function downloadAllSalesOrderAsZip(
  items: BatchFileItem[],
  scope: SalesOrderExportScope = 'ALL',
  sortByPoAsc: boolean = true,
  deliveryMode: SalesDeliveryMode = 'FALLBACK_DETAIL_SJ',
  zipBaseName: string = 'BLACKEYE_REKAP_SALES_BATCH'
): Promise<{ success: boolean; zipFileName: string; count: number }> {
  const validItems = items.filter(
    (item) => item.status === 'success' && item.data && item.data.length > 0
  );

  if (validItems.length === 0) {
    throw new Error('Tidak ada file hasil konversi yang valid untuk diunduh.');
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const item of validItems) {
    if (!item.data) continue;
    const { blob } = generateSalesOrderExcelBlobAndFile(
      item.data,
      undefined,
      scope,
      sortByPoAsc,
      deliveryMode
    );
    let targetName = getSalesOrderExportFileName(item.rawFileName, scope, sortByPoAsc, deliveryMode);

    if (usedNames.has(targetName)) {
      const dotIdx = targetName.lastIndexOf('.');
      const base = dotIdx !== -1 ? targetName.substring(0, dotIdx) : targetName;
      const ext = dotIdx !== -1 ? targetName.substring(dotIdx) : '.xlsx';
      let counter = 2;
      while (usedNames.has(`${base}_(${counter})${ext}`)) {
        counter++;
      }
      targetName = `${base}_(${counter})${ext}`;
    }
    usedNames.add(targetName);
    zip.file(targetName, blob);
  }

  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
  const zipFileName = `${zipBaseName}_${dateTag}.zip`;

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  downloadBlob(zipBlob, zipFileName);

  return {
    success: true,
    zipFileName,
    count: validItems.length,
  };
}

/**
 * Consolidates all converted files into one Master Consolidated Excel Workbook (Rekap PO Mode):
 * - Sheet 1: SUMMARY_REKAP_FILE (Summary table across all files + Grand Total SUM row)
 * - Sheet 2: MASTER_GABUNGAN (Combined data tagged with File Asal / Customer)
 * - Subsequent Sheets: Individual Customer sheets
 */
export function exportCombinedMasterWorkbook(
  items: BatchFileItem[],
  scope: ExcelExportScope = 'ALL',
  masterBaseName: string = 'BLACKEYE_MASTER_GABUNGAN_REKAP_PO'
): string {
  const validItems = items.filter(
    (item) => item.status === 'success' && item.data && item.data.length > 0
  );

  if (validItems.length === 0) {
    throw new Error('Tidak ada data hasil konversi untuk digabungkan.');
  }

  const workbook = XLSX.utils.book_new();

  // 1. Build Sheet 1: SUMMARY_REKAP_FILE
  const summaryHeaders = [
    'No',
    'Nama File',
    'Total Baris PO',
    'Total Qty PO (pcs)',
    'Total Berat PO (kg)',
    'Total Stock (pcs)',
    'Total Stock (kg)',
    'Total Terkirim (pcs)',
    'Total Sisa OS (pcs)',
    'Total Sisa OS (kg)',
    'Total Over Stock (pcs)',
    'Total Over Kiriman (pcs)',
  ];

  const summaryRows: any[][] = [];
  summaryRows.push(['RINGKASAN REKAPITULASI PO PER FILE']);
  summaryRows.push([
    `Tanggal Generate: ${new Date().toLocaleString('id-ID')} | Total File: ${validItems.length} File | Filter Scope: ${scope}`,
  ]);
  summaryRows.push([]);
  summaryRows.push(summaryHeaders);

  let sumAllPOs = 0;
  let sumAllQtyPcs = 0;
  let sumAllBeratKg = 0;
  let sumAllStockPcs = 0;
  let sumAllStockKg = 0;
  let sumAllTerkirimPcs = 0;
  let sumAllSisaPcs = 0;
  let sumAllSisaKg = 0;
  let sumAllOverStockPcs = 0;
  let sumAllOverKirimanPcs = 0;

  validItems.forEach((item, fIdx) => {
    if (!item.data) return;
    const scoped = recalculateFIFOStock(item.data, scope);
    let fQtyPcs = 0;
    let fBeratKg = 0;
    let fStockPcs = 0;
    let fStockKg = 0;
    let fTerkirimPcs = 0;
    let fSisaPcs = 0;
    let fSisaKg = 0;
    let fOverStockPcs = 0;
    let fOverKirimanPcs = 0;

    scoped.forEach((r) => {
      const q = Number(r['QTY PO (pcs)']) || 0;
      const b = Number(r['Berat PO (KG)']) || 0;
      const stPcs = Number(r['Stock (pcs)']) || 0;
      const stKg = Number(r['Stock (kg)']) || 0;
      const sPcs = Number(r['Sisa OS (pcs)']) || 0;
      const sKg = Number(r['Sisa OS (kg)']) || 0;
      const tPcs = r['Terkirim (PCS)'] !== undefined ? Number(r['Terkirim (PCS)']) : Math.max(0, q - sPcs);
      const ovStPcs = Number(r['Over Stock Gudang (PCS)'] || r['Over Produksi (PCS)']) || 0;
      const ovKrPcs = Number(r['Over Kiriman (PCS)']) || 0;

      fQtyPcs += q;
      fBeratKg += b;
      fStockPcs += stPcs;
      fStockKg += stKg;
      fTerkirimPcs += tPcs;
      fSisaPcs += sPcs;
      fSisaKg += sKg;
      fOverStockPcs += ovStPcs;
      fOverKirimanPcs += ovKrPcs;
    });

    sumAllPOs += scoped.length;
    sumAllQtyPcs += fQtyPcs;
    sumAllBeratKg += fBeratKg;
    sumAllStockPcs += fStockPcs;
    sumAllStockKg += fStockKg;
    sumAllTerkirimPcs += fTerkirimPcs;
    sumAllSisaPcs += fSisaPcs;
    sumAllSisaKg += fSisaKg;
    sumAllOverStockPcs += fOverStockPcs;
    sumAllOverKirimanPcs += fOverKirimanPcs;

    const cleanSource = item.rawFileName.replace(/\.[^/.]+$/, '');
    summaryRows.push([
      fIdx + 1,
      cleanSource,
      scoped.length,
      { t: 'n', v: fQtyPcs, z: '#,##0' },
      { t: 'n', v: fBeratKg, z: '#,##0' },
      { t: 'n', v: fStockPcs, z: '#,##0' },
      { t: 'n', v: fStockKg, z: '#,##0' },
      { t: 'n', v: fTerkirimPcs, z: '#,##0' },
      { t: 'n', v: fSisaPcs, z: '#,##0' },
      { t: 'n', v: fSisaKg, z: '#,##0' },
      { t: 'n', v: fOverStockPcs, z: '#,##0' },
      { t: 'n', v: fOverKirimanPcs, z: '#,##0' },
    ]);
  });

  const firstDataRow = 5;
  const lastDataRow = 4 + validItems.length;
  summaryRows.push([
    'GRAND TOTAL KESELURUHAN (ALL FILES)',
    '',
    { t: 'n', f: `SUM(C${firstDataRow}:C${lastDataRow})`, v: sumAllPOs, z: '#,##0' },
    { t: 'n', f: `SUM(D${firstDataRow}:D${lastDataRow})`, v: sumAllQtyPcs, z: '#,##0' },
    { t: 'n', f: `SUM(E${firstDataRow}:E${lastDataRow})`, v: sumAllBeratKg, z: '#,##0' },
    { t: 'n', f: `SUM(F${firstDataRow}:F${lastDataRow})`, v: sumAllStockPcs, z: '#,##0' },
    { t: 'n', f: `SUM(G${firstDataRow}:G${lastDataRow})`, v: sumAllStockKg, z: '#,##0' },
    { t: 'n', f: `SUM(H${firstDataRow}:H${lastDataRow})`, v: sumAllTerkirimPcs, z: '#,##0' },
    { t: 'n', f: `SUM(I${firstDataRow}:I${lastDataRow})`, v: sumAllSisaPcs, z: '#,##0' },
    { t: 'n', f: `SUM(J${firstDataRow}:J${lastDataRow})`, v: sumAllSisaKg, z: '#,##0' },
    { t: 'n', f: `SUM(K${firstDataRow}:K${lastDataRow})`, v: sumAllOverStockPcs, z: '#,##0' },
    { t: 'n', f: `SUM(L${firstDataRow}:L${lastDataRow})`, v: sumAllOverKirimanPcs, z: '#,##0' },
  ]);

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [
    { wch: 6 },
    { wch: 36 },
    { wch: 15 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
  ];
  summarySheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
    { s: { r: summaryRows.length - 1, c: 0 }, e: { r: summaryRows.length - 1, c: 1 } },
  ];

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'SUMMARY_REKAP_FILE');

  // 2. Build Consolidated Master Sheet
  const masterHeaders = ['File Asal / Customer', ...EXCEL_COLUMNS];
  const masterRows: any[][] = [];

  masterRows.push(['MASTER REKAPITULASI STOCK & SISA ORDER STATUS (OS) - GABUNGAN SEMUA CUSTOMER']);
  masterRows.push([
    `Tanggal Generate: ${new Date().toLocaleString('id-ID')} | Total File: ${validItems.length} Customer | Filter Scope: ${scope}`,
  ]);
  masterRows.push([]);
  masterRows.push(masterHeaders);

  let grandQtyPcs = 0;
  let grandBeratKg = 0;
  let grandStockPcs = 0;
  let grandStockKg = 0;
  let grandSisaPcs = 0;
  let grandSisaKg = 0;
  let grandTerkirimPcs = 0;
  let grandTerkirimKg = 0;
  let grandOverStockPcs = 0;
  let grandOverStockKg = 0;
  let grandOverKirimanPcs = 0;
  let grandOverKirimanKg = 0;

  for (const item of validItems) {
    if (!item.data) continue;
    const scopedData = recalculateFIFOStock(item.data, scope);

    let filtered = scopedData;
    if (scope === 'OPEN_ONLY') {
      filtered = scopedData.filter((d) => d.coStatus === 'OPEN');
    } else if (scope === 'CLOSED_ONLY') {
      filtered = scopedData.filter((d) => d.coStatus === 'CLOSED');
    } else if (scope === 'STOCK_READY_ALL') {
      filtered = scopedData.filter((d) => (d['Stock (pcs)'] || 0) > 0);
    } else if (scope === 'STOCK_READY_OPEN') {
      filtered = scopedData.filter(
        (d) => d.coStatus === 'OPEN' && (d['Stock (pcs)'] || 0) > 0
      );
    } else if (scope === 'STOCK_READY_CLOSED') {
      filtered = scopedData.filter(
        (d) => d.coStatus === 'CLOSED' && (d['Stock (pcs)'] || 0) > 0
      );
    } else if (scope === 'OVER_STOCK_GUDANG' || scope === 'OVER_PRODUCTION_ONLY') {
      filtered = scopedData.filter(
        (d) => (d['Over Stock Gudang (PCS)'] || d['Over Produksi (PCS)'] || 0) > 0 || (d['Over Stock Gudang (KG)'] || d['Over Produksi (KG)'] || 0) > 0
      );
    } else if (scope === 'OVER_KIRIMAN') {
      filtered = scopedData.filter(
        (d) => (d['Over Kiriman (PCS)'] || 0) > 0 || (d['Over Kiriman (KG)'] || 0) > 0
      );
    }

    const cleanSource = item.rawFileName.replace(/\.[^/.]+$/, '');

    for (const row of filtered) {
      const qtyPcs = Number(row['QTY PO (pcs)']) || 0;
      const beratKg = Number(row['Berat PO (KG)']) || 0;
      const stockPcs = Number(row['Stock (pcs)']) || 0;
      const stockKg = Number(row['Stock (kg)']) || 0;
      const sisaPcs = Number(row['Sisa OS (pcs)']) || 0;
      const sisaKg = Number(row['Sisa OS (kg)']) || 0;
      const terkirimPcs =
        row['Terkirim (PCS)'] !== undefined
          ? Number(row['Terkirim (PCS)'])
          : Math.max(0, qtyPcs - sisaPcs);
      const terkirimKg =
        row['Terkirim (KG)'] !== undefined
          ? Number(row['Terkirim (KG)'])
          : Math.max(0, beratKg - sisaKg);
      const overStockPcs = Number(row['Over Stock Gudang (PCS)'] || row['Over Produksi (PCS)']) || 0;
      const overStockKg = Number(row['Over Stock Gudang (KG)'] || row['Over Produksi (KG)']) || 0;
      const overKirimanPcs = Number(row['Over Kiriman (PCS)']) || 0;
      const overKirimanKg = Number(row['Over Kiriman (KG)']) || 0;

      grandQtyPcs += qtyPcs;
      grandBeratKg += beratKg;
      grandStockPcs += stockPcs;
      grandStockKg += stockKg;
      grandSisaPcs += sisaPcs;
      grandSisaKg += sisaKg;
      grandTerkirimPcs += terkirimPcs;
      grandTerkirimKg += terkirimKg;
      grandOverStockPcs += overStockPcs;
      grandOverStockKg += overStockKg;
      grandOverKirimanPcs += overKirimanPcs;
      grandOverKirimanKg += overKirimanKg;

      masterRows.push([
        cleanSource,
        row.CO,
        row.Artikel,
        row['Item Description'],
        row['Tanggal Input PO'],
        row['No PO'],
        row.Substance,
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
        row.Harga,
      ]);
    }
  }

  const lastMasterRow = masterRows.length;
  const totMasterRow = lastMasterRow + 1;

  masterRows.push([
    'TOTAL KESELURUHAN (GABUNGAN SEMUA CUSTOMER)',
    '',
    '',
    '',
    '',
    '',
    '',
    { t: 'n', f: `SUM(H5:H${lastMasterRow})`, v: grandQtyPcs, z: '#,##0' },
    { t: 'n', f: `SUM(I5:I${lastMasterRow})`, v: grandBeratKg, z: '#,##0' },
    { t: 'n', f: `SUM(J5:J${lastMasterRow})`, v: grandStockPcs, z: '#,##0' },
    { t: 'n', f: `SUM(K5:K${lastMasterRow})`, v: grandStockKg, z: '#,##0' },
    { t: 'n', f: `SUM(L5:L${lastMasterRow})`, v: grandSisaPcs, z: '#,##0' },
    { t: 'n', f: `SUM(M5:M${lastMasterRow})`, v: grandSisaKg, z: '#,##0' },
    { t: 'n', f: `SUM(N5:N${lastMasterRow})`, v: grandTerkirimPcs, z: '#,##0' },
    { t: 'n', f: `SUM(O5:O${lastMasterRow})`, v: grandTerkirimKg, z: '#,##0' },
    { t: 'n', f: `SUM(P5:P${lastMasterRow})`, v: grandOverStockPcs, z: '#,##0' },
    { t: 'n', f: `SUM(Q5:Q${lastMasterRow})`, v: grandOverStockKg, z: '#,##0' },
    { t: 'n', f: `SUM(R5:R${lastMasterRow})`, v: grandOverKirimanPcs, z: '#,##0' },
    { t: 'n', f: `SUM(S5:S${lastMasterRow})`, v: grandOverKirimanKg, z: '#,##0' },
    '',
  ]);

  const masterSheet = XLSX.utils.aoa_to_sheet(masterRows);
  masterSheet['!cols'] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 20 },
    { wch: 34 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 15 },
    { wch: 15 },
    { wch: 14 },
    { wch: 14 },
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
    { wch: 16 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
  ];

  masterSheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 19 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 19 } },
    { s: { r: masterRows.length - 1, c: 0 }, e: { r: masterRows.length - 1, c: 6 } },
  ];

  XLSX.utils.book_append_sheet(workbook, masterSheet, 'MASTER_GABUNGAN');

  // 3. Build Individual Sheet for each file
  const usedSheetNames = new Set<string>(['SUMMARY_REKAP_FILE', 'MASTER_GABUNGAN']);

  for (const item of validItems) {
    if (!item.data) continue;
    const cleanSource = item.rawFileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[\\/?*[\]:]/g, '_')
      .trim();

    let sheetName = cleanSource.substring(0, 28);
    if (!sheetName) sheetName = 'Sheet';
    let counter = 1;
    let uniqueSheetName = sheetName;
    while (usedSheetNames.has(uniqueSheetName.toUpperCase())) {
      uniqueSheetName = `${sheetName.substring(0, 25)}_${counter}`;
      counter++;
    }
    usedSheetNames.add(uniqueSheetName.toUpperCase());

    try {
      const { workbook: singleWb } = generateExcelBlobAndFile(
        item.data,
        item.rawFileName,
        scope
      );
      const firstSingleSheet = singleWb.Sheets[singleWb.SheetNames[0]];
      if (firstSingleSheet) {
        XLSX.utils.book_append_sheet(workbook, firstSingleSheet, uniqueSheetName);
      }
    } catch (sheetErr) {
      console.warn(`Could not generate individual sheet for ${item.rawFileName} with scope ${scope}:`, sheetErr);
    }
  }

  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const fileName = `${masterBaseName}_${dateTag}.xlsx`;

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([excelBuffer], { type: mimeType });
  downloadBlob(blob, fileName);

  return fileName;
}

/**
 * Consolidates all converted files into one Master Consolidated Excel Workbook for Mode Detail Kiriman SJ:
 * - Sheet 1: SUMMARY_REKAP_FILE (Summary of each file's key SJ metrics + Grand Total SUM row)
 * - Sheet 2: MASTER_DETAIL_SJ (Combined all files with Source File / Customer column)
 * - Subsequent Sheets: Individual Customer Detail Kiriman SJ sheets
 */
export function exportCombinedDetailSJMasterWorkbook(
  items: BatchFileItem[],
  scope: DetailSJExportScope = 'ALL',
  masterBaseName: string = 'BLACKEYE_MASTER_DETAIL_KIRIMAN_SJ'
): string {
  const validItems = items.filter(
    (item) => item.status === 'success' && item.data && item.data.length > 0
  );

  if (validItems.length === 0) {
    throw new Error('Tidak ada data hasil konversi untuk digabungkan.');
  }

  const workbook = XLSX.utils.book_new();

  // 1. Build Sheet 1: SUMMARY_REKAP_FILE
  const summaryHeaders = [
    'No',
    'Nama File',
    'Total No PO',
    'Total Kiriman SJ',
    'Total Qty PO (pcs)',
    'Total Berat PO (kg)',
    'Total Qty Kirim SJ (pcs)',
    'Total Berat Kirim SJ (kg)',
    'Total Terkirim PO (pcs)',
    'Total Terkirim PO (kg)',
    'Total Sisa OS (pcs)',
    'Total Sisa OS (kg)',
  ];

  const summaryRows: any[][] = [];
  summaryRows.push(['RINGKASAN DETAIL KIRIMAN SJ PER FILE']);
  summaryRows.push([
    `Tanggal Generate: ${new Date().toLocaleString('id-ID')} | Total File: ${validItems.length} File | Filter Scope: ${scope}`,
  ]);
  summaryRows.push([]);
  summaryRows.push(summaryHeaders);

  let sumAllPOs = 0;
  let sumAllSJs = 0;
  let sumAllQtyPoPcs = 0;
  let sumAllBeratPoKg = 0;
  let sumAllQtyKirimPcs = 0;
  let sumAllBeratKirimKg = 0;
  let sumAllTerkirimPcs = 0;
  let sumAllTerkirimKg = 0;
  let sumAllSisaPcs = 0;
  let sumAllSisaKg = 0;

  validItems.forEach((item, fIdx) => {
    if (!item.data) return;
    const flatRows = flattenDeliveriesForDataEntry(item.data, scope);
    let fPOs = 0;
    let fSJs = 0;
    let fQtyPo = 0;
    let fBeratPo = 0;
    let fQtyKirim = 0;
    let fBeratKirim = 0;
    let fTerkirimPcs = 0;
    let fTerkirimKg = 0;
    let fSisaPcs = 0;
    let fSisaKg = 0;

    flatRows.forEach((r) => {
      if (r.isFirstRowOfPO) {
        fPOs++;
        fQtyPo += r['QTY PO (pcs)'];
        fBeratPo += r['Berat PO (KG)'];
      }
      if (!r.isFallbackNoDelivery) {
        fSJs++;
        fQtyKirim += r['QTY Kirim SJ (pcs)'];
        fBeratKirim += r['Berat Kirim SJ (KG)'];
      }
      if (r.isLastRowOfPO) {
        fTerkirimPcs += r['Total Terkirim PO (pcs)'];
        fTerkirimKg += r['Total Terkirim PO (KG)'];
        fSisaPcs += r['Sisa OS Akhir PO (pcs)'];
        fSisaKg += r['Sisa OS Akhir PO (KG)'];
      }
    });

    sumAllPOs += fPOs;
    sumAllSJs += fSJs;
    sumAllQtyPoPcs += fQtyPo;
    sumAllBeratPoKg += fBeratPo;
    sumAllQtyKirimPcs += fQtyKirim;
    sumAllBeratKirimKg += fBeratKirim;
    sumAllTerkirimPcs += fTerkirimPcs;
    sumAllTerkirimKg += fTerkirimKg;
    sumAllSisaPcs += fSisaPcs;
    sumAllSisaKg += fSisaKg;

    const cleanSource = item.rawFileName.replace(/\.[^/.]+$/, '');
    summaryRows.push([
      fIdx + 1,
      cleanSource,
      fPOs,
      fSJs,
      { t: 'n', v: fQtyPo, z: '#,##0' },
      { t: 'n', v: fBeratPo, z: '#,##0' },
      { t: 'n', v: fQtyKirim, z: '#,##0' },
      { t: 'n', v: fBeratKirim, z: '#,##0' },
      { t: 'n', v: fTerkirimPcs, z: '#,##0' },
      { t: 'n', v: fTerkirimKg, z: '#,##0' },
      { t: 'n', v: fSisaPcs, z: '#,##0' },
      { t: 'n', v: fSisaKg, z: '#,##0' },
    ]);
  });

  const firstDataRow = 5;
  const lastDataRow = 4 + validItems.length;
  summaryRows.push([
    'GRAND TOTAL KESELURUHAN (ALL FILES)',
    '',
    { t: 'n', f: `SUM(C${firstDataRow}:C${lastDataRow})`, v: sumAllPOs, z: '#,##0' },
    { t: 'n', f: `SUM(D${firstDataRow}:D${lastDataRow})`, v: sumAllSJs, z: '#,##0' },
    { t: 'n', f: `SUM(E${firstDataRow}:E${lastDataRow})`, v: sumAllQtyPoPcs, z: '#,##0' },
    { t: 'n', f: `SUM(F${firstDataRow}:F${lastDataRow})`, v: sumAllBeratPoKg, z: '#,##0' },
    { t: 'n', f: `SUM(G${firstDataRow}:G${lastDataRow})`, v: sumAllQtyKirimPcs, z: '#,##0' },
    { t: 'n', f: `SUM(H${firstDataRow}:H${lastDataRow})`, v: sumAllBeratKirimKg, z: '#,##0' },
    { t: 'n', f: `SUM(I${firstDataRow}:I${lastDataRow})`, v: sumAllTerkirimPcs, z: '#,##0' },
    { t: 'n', f: `SUM(J${firstDataRow}:J${lastDataRow})`, v: sumAllTerkirimKg, z: '#,##0' },
    { t: 'n', f: `SUM(K${firstDataRow}:K${lastDataRow})`, v: sumAllSisaPcs, z: '#,##0' },
    { t: 'n', f: `SUM(L${firstDataRow}:L${lastDataRow})`, v: sumAllSisaKg, z: '#,##0' },
  ]);

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [
    { wch: 6 },
    { wch: 36 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 20 },
    { wch: 20 },
  ];
  summarySheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
    { s: { r: summaryRows.length - 1, c: 0 }, e: { r: summaryRows.length - 1, c: 1 } },
  ];

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'SUMMARY_REKAP_FILE');

  // 2. Build Consolidated Master Sheet
  const masterHeaders = ['File Asal / Customer', ...DETAIL_SJ_EXCEL_COLUMNS];
  const masterRows: any[][] = [];

  masterRows.push([
    'MASTER REKAPITULASI DETAIL KIRIMAN PER SURAT JALAN (SJ) & SISA OS - GABUNGAN SEMUA CUSTOMER',
  ]);
  masterRows.push([
    `Tanggal Generate: ${new Date().toLocaleString('id-ID')} | Total File: ${validItems.length} Customer | Filter Scope: ${scope}`,
  ]);
  masterRows.push([]);
  masterRows.push(masterHeaders);

  let grandTotalPOs = 0;
  let grandTotalSJs = 0;
  let grandQtyPoPcs = 0;
  let grandBeratPoKg = 0;
  let grandQtyKirimSJPcs = 0;
  let grandBeratKirimSJKg = 0;
  let grandTotalTerkirimPcs = 0;
  let grandTotalTerkirimKg = 0;
  let grandSisaOSAkhirPcs = 0;
  let grandSisaOSAkhirKg = 0;
  let grandStockPcs = 0;
  let grandStockKg = 0;

  for (const item of validItems) {
    if (!item.data) continue;
    const cleanSource = item.rawFileName.replace(/\.[^/.]+$/, '');
    const flatRows = flattenDeliveriesForDataEntry(item.data, scope);

    for (const r of flatRows) {
      if (r.isFirstRowOfPO) {
        grandTotalPOs++;
        grandQtyPoPcs += r['QTY PO (pcs)'];
        grandBeratPoKg += r['Berat PO (KG)'];
      }
      if (!r.isFallbackNoDelivery) {
        grandTotalSJs++;
        grandQtyKirimSJPcs += r['QTY Kirim SJ (pcs)'];
        grandBeratKirimSJKg += r['Berat Kirim SJ (KG)'];
      }
      if (r.isLastRowOfPO) {
        grandTotalTerkirimPcs += r['Total Terkirim PO (pcs)'];
        grandTotalTerkirimKg += r['Total Terkirim PO (KG)'];
        grandSisaOSAkhirPcs += r['Sisa OS Akhir PO (pcs)'];
        grandSisaOSAkhirKg += r['Sisa OS Akhir PO (KG)'];
        grandStockPcs += r['Stock (pcs)'];
        grandStockKg += r['Stock (kg)'];
      }

      masterRows.push([
        cleanSource,
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
        r['Sisa OS Berjalan (pcs)'],
        r['Sisa OS Berjalan (KG)'],
        r.isLastRowOfPO ? r['Total Terkirim PO (pcs)'] : '',
        r.isLastRowOfPO ? r['Total Terkirim PO (KG)'] : '',
        r.isLastRowOfPO ? r['Sisa OS Akhir PO (pcs)'] : '',
        r.isLastRowOfPO ? r['Sisa OS Akhir PO (KG)'] : '',
        r.isLastRowOfPO
          ? {
              t: 'n',
              v: r['% Pemenuhan PO'],
              z: '0.0%',
            }
          : '',
        r.isLastRowOfPO ? r['Status Pengiriman'] : '',
        r.isLastRowOfPO && r['Umur PO / Aging (Hari)'] !== null ? r['Umur PO / Aging (Hari)'] : '',
        r.isLastRowOfPO ? r['Kategori Aging OS'] : '',
        r.isLastRowOfPO ? r['Stock (pcs)'] : '',
        r.isLastRowOfPO ? r['Stock (kg)'] : '',
        r.isFirstRowOfPO ? r.Harga : '',
      ]);
    }
  }

  const lastMasterRow = masterRows.length;
  const totMasterRow = lastMasterRow + 1;

  masterRows.push([
    'TOTAL KESELURUHAN (GABUNGAN SEMUA CUSTOMER)',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    { t: 'n', f: `SUM(I5:I${lastMasterRow})`, v: grandQtyPoPcs, z: '#,##0' },
    { t: 'n', f: `SUM(J5:J${lastMasterRow})`, v: grandBeratPoKg, z: '#,##0' },
    '',
    '',
    '',
    '',
    { t: 'n', f: `SUM(O5:O${lastMasterRow})`, v: grandQtyKirimSJPcs, z: '#,##0' },
    { t: 'n', f: `SUM(P5:P${lastMasterRow})`, v: grandBeratKirimSJKg, z: '#,##0' },
    '',
    '',
    { t: 'n', f: `SUM(S5:S${lastMasterRow})`, v: grandTotalTerkirimPcs, z: '#,##0' },
    { t: 'n', f: `SUM(T5:T${lastMasterRow})`, v: grandTotalTerkirimKg, z: '#,##0' },
    { t: 'n', f: `SUM(U5:U${lastMasterRow})`, v: grandSisaOSAkhirPcs, z: '#,##0' },
    { t: 'n', f: `SUM(V5:V${lastMasterRow})`, v: grandSisaOSAkhirKg, z: '#,##0' },
    {
      t: 'n',
      f: `IF(I${totMasterRow}>0,S${totMasterRow}/I${totMasterRow},0)`,
      v: grandQtyPoPcs > 0 ? grandTotalTerkirimPcs / grandQtyPoPcs : 0,
      z: '0.0%',
    },
    '',
    '',
    '',
    { t: 'n', f: `SUM(AA5:AA${lastMasterRow})`, v: grandStockPcs, z: '#,##0' },
    { t: 'n', f: `SUM(AB5:AB${lastMasterRow})`, v: grandStockKg, z: '#,##0' },
    '',
  ]);

  const masterSheet = XLSX.utils.aoa_to_sheet(masterRows);
  masterSheet['!cols'] = [
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 20 },
    { wch: 34 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 15 },
    { wch: 15 },
    { wch: 24 },
    { wch: 20 },
    { wch: 18 },
    { wch: 19 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 21 },
    { wch: 21 },
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
    { wch: 24 },
    { wch: 20 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
  ];

  masterSheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 28 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 28 } },
    { s: { r: masterRows.length - 1, c: 0 }, e: { r: masterRows.length - 1, c: 7 } },
  ];

  XLSX.utils.book_append_sheet(workbook, masterSheet, 'MASTER_DETAIL_SJ');

  // 3. Build Individual Sheet for each file
  const usedSheetNames = new Set<string>(['SUMMARY_REKAP_FILE', 'MASTER_DETAIL_SJ']);

  for (const item of validItems) {
    if (!item.data) continue;
    const cleanSource = item.rawFileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[\\/?*[\]:]/g, '_')
      .trim();

    let sheetName = cleanSource.substring(0, 28);
    if (!sheetName) sheetName = 'Sheet';
    let counter = 1;
    let uniqueSheetName = sheetName;
    while (usedSheetNames.has(uniqueSheetName.toUpperCase())) {
      uniqueSheetName = `${sheetName.substring(0, 25)}_${counter}`;
      counter++;
    }
    usedSheetNames.add(uniqueSheetName.toUpperCase());

    try {
      const { workbook: singleWb } = generateDetailSJExcelBlobAndFile(
        item.data,
        item.rawFileName,
        scope
      );
      const firstSingleSheet = singleWb.Sheets[singleWb.SheetNames[0]];
      if (firstSingleSheet) {
        XLSX.utils.book_append_sheet(workbook, firstSingleSheet, uniqueSheetName);
      }
    } catch (sheetErr) {
      console.warn(`Could not generate individual Detail SJ sheet for ${item.rawFileName}:`, sheetErr);
    }
  }

  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const fileName = `${masterBaseName}_${dateTag}.xlsx`;

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([excelBuffer], { type: mimeType });
  downloadBlob(blob, fileName);

  return fileName;
}

/**
 * Consolidates all converted files into a Master Consolidated Excel Workbook for Rekap Sales:
 * - Sheet 1: SUMMARY_REKAP_FILE (Summary of each file's key totals + Grand Total SUM row)
 * - Sheet 2: MASTER_GABUNGAN_SALES (All rows combined into 1 consolidated Rekap Sales worksheet)
 * - Subsequent Sheets: Individual customer/file sheets with full Rekap Sales layout & formulas
 */
export function exportCombinedSalesOrderMasterWorkbook(
  items: BatchFileItem[],
  scope: SalesOrderExportScope = 'ALL',
  sortByPoAsc: boolean = true,
  deliveryMode: SalesDeliveryMode = 'FALLBACK_DETAIL_SJ',
  masterBaseName: string = 'Rekap_Sales_Master_Gabungan'
): string {
  const validItems = items.filter(
    (item) => item.status === 'success' && item.data && item.data.length > 0
  );

  if (validItems.length === 0) {
    throw new Error('Tidak ada data hasil konversi untuk digabungkan.');
  }

  const workbook = XLSX.utils.book_new();

  // 1. Build Sheet 1: SUMMARY_REKAP_FILE
  const summaryHeaders = [
    'No',
    'Nama File',
    'Total No PO',
    'Total Artikel',
    'Total Qty PO (Pcs)',
    'Total Berat PO (Kg)',
    'Total Qty Planning (Pcs)',
    'Total Kg Planning (Kg)',
    'Total Qty Realisasi Kirim (Pcs)',
    'Total Kg Realisasi Kirim (Kg)',
    'Total Nilai Order (Rp)',
    'K200 SW (Pcs)',
    'K200 DW (Pcs)',
  ];

  const summaryRows: any[][] = [];
  summaryRows.push(['RINGKASAN REKAPITULASI SALES PER FILE']);
  summaryRows.push([
    `Tanggal Generate: ${new Date().toLocaleString('id-ID')} | Total File: ${validItems.length} File | Mode: ${
      deliveryMode === 'TOTAL_ACCUMULATION' ? 'Total Keseluruhan (Akumulasi)' : 'Detail per SJ (Fallback)'
    }`,
  ]);
  summaryRows.push([]);
  summaryRows.push(summaryHeaders);

  let grandTotalPOs = 0;
  let grandTotalArtikels = 0;
  let grandQtyPcs = 0;
  let grandBeratKg = 0;
  let grandQtyPlanning = 0;
  let grandKgPlanning = 0;
  let grandQtyDelivery = 0;
  let grandKgDelivery = 0;
  let grandNilaiOrderRp = 0;
  let grandK200SwPcs = 0;
  let grandK200DwPcs = 0;

  const allCombinedData: ExtractedRecord[] = [];

  validItems.forEach((item, fIdx) => {
    if (!item.data) return;
    allCombinedData.push(...item.data);

    const rows = flattenSalesOrderRows(item.data, scope, sortByPoAsc, deliveryMode);
    const uniquePos = new Set<string>();
    const uniqueArtikels = new Set<string>();
    let fileQtyPcs = 0;
    let fileBeratKg = 0;
    let fileQtyPlanning = 0;
    let fileKgPlanning = 0;
    let fileQtyDelivery = 0;
    let fileKgDelivery = 0;
    let fileNilaiOrder = 0;
    let fileK200SwPcs = 0;
    let fileK200DwPcs = 0;

    rows.forEach((r) => {
      if (r.noPO && r.noPO !== '-') uniquePos.add(r.noPO);
      if (r.artikel && r.artikel !== '-') uniqueArtikels.add(r.artikel);

      if (typeof r.qtyPcs === 'number') fileQtyPcs += r.qtyPcs;
      if (typeof r.qtyKg === 'number') fileBeratKg += r.qtyKg;
      if (typeof r.qtyDelivery === 'number') fileQtyPlanning += r.qtyDelivery;
      if (typeof r.kgDelivery === 'number') fileKgPlanning += r.kgDelivery;
      if (typeof r.actualQtyDelivery === 'number') fileQtyDelivery += r.actualQtyDelivery;
      if (typeof r.actualKgDelivery === 'number') fileKgDelivery += r.actualKgDelivery;
      if (typeof r.harga === 'number' && typeof r.qtyPcs === 'number' && r.qtyPcs > 0) {
        fileNilaiOrder += r.harga * r.qtyPcs;
      }

      if (r.k200Type === 'K200_SW' && typeof r.qtyPcs === 'number') {
        fileK200SwPcs += r.qtyPcs;
      }
      if (r.k200Type === 'K200_DW' && typeof r.qtyPcs === 'number') {
        fileK200DwPcs += r.qtyPcs;
      }
    });

    grandTotalPOs += uniquePos.size;
    grandTotalArtikels += uniqueArtikels.size;
    grandQtyPcs += fileQtyPcs;
    grandBeratKg += fileBeratKg;
    grandQtyPlanning += fileQtyPlanning;
    grandKgPlanning += fileKgPlanning;
    grandQtyDelivery += fileQtyDelivery;
    grandKgDelivery += fileKgDelivery;
    grandNilaiOrderRp += fileNilaiOrder;
    grandK200SwPcs += fileK200SwPcs;
    grandK200DwPcs += fileK200DwPcs;

    const cleanName = item.rawFileName.replace(/\.[^/.]+$/, '');

    summaryRows.push([
      fIdx + 1,
      cleanName,
      uniquePos.size,
      uniqueArtikels.size,
      { t: 'n', v: fileQtyPcs, z: '#,##0' },
      { t: 'n', v: fileBeratKg, z: '#,##0' },
      { t: 'n', v: fileQtyPlanning, z: '#,##0' },
      { t: 'n', v: fileKgPlanning, z: '#,##0' },
      { t: 'n', v: fileQtyDelivery, z: '#,##0' },
      { t: 'n', v: fileKgDelivery, z: '#,##0' },
      { t: 'n', v: fileNilaiOrder, z: '#,##0' },
      { t: 'n', v: fileK200SwPcs, z: '#,##0' },
      { t: 'n', v: fileK200DwPcs, z: '#,##0' },
    ]);
  });

  const firstDataRow = 5;
  const lastDataRow = 4 + validItems.length;
  summaryRows.push([
    'GRAND TOTAL KESELURUHAN (ALL FILES)',
    '',
    { t: 'n', f: `SUM(C${firstDataRow}:C${lastDataRow})`, v: grandTotalPOs, z: '#,##0' },
    { t: 'n', f: `SUM(D${firstDataRow}:D${lastDataRow})`, v: grandTotalArtikels, z: '#,##0' },
    { t: 'n', f: `SUM(E${firstDataRow}:E${lastDataRow})`, v: grandQtyPcs, z: '#,##0' },
    { t: 'n', f: `SUM(F${firstDataRow}:F${lastDataRow})`, v: grandBeratKg, z: '#,##0' },
    { t: 'n', f: `SUM(G${firstDataRow}:G${lastDataRow})`, v: grandQtyPlanning, z: '#,##0' },
    { t: 'n', f: `SUM(H${firstDataRow}:H${lastDataRow})`, v: grandKgPlanning, z: '#,##0' },
    { t: 'n', f: `SUM(I${firstDataRow}:I${lastDataRow})`, v: grandQtyDelivery, z: '#,##0' },
    { t: 'n', f: `SUM(J${firstDataRow}:J${lastDataRow})`, v: grandKgDelivery, z: '#,##0' },
    { t: 'n', f: `SUM(K${firstDataRow}:K${lastDataRow})`, v: grandNilaiOrderRp, z: '#,##0' },
    { t: 'n', f: `SUM(L${firstDataRow}:L${lastDataRow})`, v: grandK200SwPcs, z: '#,##0' },
    { t: 'n', f: `SUM(M${firstDataRow}:M${lastDataRow})`, v: grandK200DwPcs, z: '#,##0' },
  ]);

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs['!cols'] = [
    { wch: 6 },
    { wch: 38 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 24 },
    { wch: 24 },
    { wch: 20 },
    { wch: 16 },
    { wch: 16 },
  ];

  summaryWs['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
    { s: { r: summaryRows.length - 1, c: 0 }, e: { r: summaryRows.length - 1, c: 1 } },
  ];

  XLSX.utils.book_append_sheet(workbook, summaryWs, 'SUMMARY_REKAP_FILE');

  // 2. Build Sheet 2: MASTER_GABUNGAN_SALES
  const masterWs = buildSalesOrderWorksheet(
    allCombinedData,
    scope,
    'GABUNGAN SEMUA CUSTOMER',
    sortByPoAsc,
    deliveryMode
  );
  XLSX.utils.book_append_sheet(workbook, masterWs, 'MASTER_GABUNGAN_SALES');

  // 3. Subsequent Sheets: Individual Customer sheets
  const usedSheetNames = new Set<string>(['SUMMARY_REKAP_FILE', 'MASTER_GABUNGAN_SALES']);
  validItems.forEach((item) => {
    if (!item.data) return;
    const cleanSource = item.rawFileName.replace(/\.[^/.]+$/, '').trim();
    let baseSheet = cleanSource.slice(0, 25);
    let sheetName = baseSheet;
    let counter = 2;
    while (usedSheetNames.has(sheetName.toUpperCase())) {
      sheetName = `${baseSheet}_${counter}`.slice(0, 31);
      counter++;
    }
    usedSheetNames.add(sheetName.toUpperCase());

    const fileCustName = item.data[0]?.customerName || cleanSource;
    const fileWs = buildSalesOrderWorksheet(item.data, scope, fileCustName, sortByPoAsc, deliveryMode);
    XLSX.utils.book_append_sheet(workbook, fileWs, sheetName);
  });

  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
  const outFileName = `${masterBaseName}_${deliveryMode === 'TOTAL_ACCUMULATION' ? 'Total_Akumulasi' : 'Detail_SJ'}_${dateTag}.xlsx`;

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([excelBuffer], { type: mimeType });
  downloadBlob(blob, outFileName);

  return outFileName;
}

/**
 * Calculates aggregate summary metrics across all items in the batch
 */
export function computeBatchStats(items: BatchFileItem[]): BatchAggregateStats {
  const completed = items.filter((i) => i.status === 'success' && i.data);
  const failed = items.filter((i) => i.status === 'error');

  let totalPOs = 0;
  const articlesSet = new Set<string>();
  let totalQtyPcs = 0;
  let totalSisaOSPcs = 0;
  let totalTerkirimPcs = 0;
  let totalStockPcs = 0;
  let totalCOOpen = 0;
  let totalCOClosed = 0;

  for (const item of completed) {
    if (!item.data) continue;
    totalPOs += item.data.length;
    for (const d of item.data) {
      if (d.Artikel) articlesSet.add(d.Artikel);
      totalQtyPcs += d['QTY PO (pcs)'] || 0;
      totalSisaOSPcs += d['Sisa OS (pcs)'] || 0;
      totalTerkirimPcs += d['Terkirim (PCS)'] || 0;
      totalStockPcs += d['Stock (pcs)'] || 0;
      if (d.coStatus === 'OPEN') totalCOOpen++;
      if (d.coStatus === 'CLOSED') totalCOClosed++;
    }
  }

  return {
    totalFiles: items.length,
    completedFiles: completed.length,
    failedFiles: failed.length,
    totalPOs,
    totalUniqueArticles: articlesSet.size,
    totalQtyPcs,
    totalSisaOSPcs,
    totalTerkirimPcs,
    totalStockPcs,
    totalCOOpen,
    totalCOClosed,
  };
}
