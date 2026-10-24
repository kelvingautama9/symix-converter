import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {
  BatchFileItem,
  BatchAggregateStats,
  ExcelExportScope,
  DetailSJExportScope,
  ExtractedRecord,
  ParseSummary,
} from '../types';
import { parseExcelBuffer, recalculateFIFOStock, flattenDeliveriesForDataEntry } from './parserEngine';
import {
  generateExcelBlobAndFile,
  getExportFileName,
  EXCEL_COLUMNS,
  generateDetailSJExcelBlobAndFile,
  getDetailSJExportFileName,
  DETAIL_SJ_EXCEL_COLUMNS,
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

  // Generate standardized converted Excel file
  const outputFileName = getExportFileName(file.name, scope);
  const { blob } = generateExcelBlobAndFile(parsedData, file.name, scope);

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
 * Compiles all successful batch converted Excel files into a single ZIP archive and downloads it immediately (Normal Mode).
 */
export async function downloadAllAsZip(
  items: BatchFileItem[],
  zipBaseName: string = 'BLACKEYE_CONVERTED_BATCH'
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
 * Compiles all converted files into a single ZIP archive using the Detail Kiriman SJ format.
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
 * Consolidates all converted files into one Master Consolidated Excel Workbook (Normal Mode):
 * - Sheet 1: Master Rekapitulasi (Combined all files, tagged with Source File/Customer)
 * - Subsequent Sheets: Individual Customer sheets (named cleanly)
 */
export function exportCombinedMasterWorkbook(
  items: BatchFileItem[],
  scope: ExcelExportScope = 'ALL',
  masterBaseName: string = 'BLACKEYE_MASTER_GABUNGAN'
): string {
  const validItems = items.filter(
    (item) => item.status === 'success' && item.data && item.data.length > 0
  );

  if (validItems.length === 0) {
    throw new Error('Tidak ada data hasil konversi untuk digabungkan.');
  }

  const workbook = XLSX.utils.book_new();

  // 1. Build Consolidated Master Sheet
  const masterHeaders = ['File Asal / Customer', ...EXCEL_COLUMNS];
  const masterRows: any[][] = [];

  // Title
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

    // Filter based on scope
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
        row.CO || '',
        row.Artikel || '',
        row['Item Description'] || '',
        row['Tanggal Input PO'] || '-',
        row['No PO'] || '',
        row.Substance || '',
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
        Number(row.Harga) || 0,
      ]);
    }
  }

  // Grand Total Row
  masterRows.push([
    'GRAND TOTAL REKAPITULASI',
    '',
    '',
    '',
    '',
    '',
    '',
    grandQtyPcs,
    grandBeratKg,
    grandStockPcs,
    grandStockKg,
    grandSisaPcs,
    grandSisaKg,
    grandTerkirimPcs,
    grandTerkirimKg,
    grandOverStockPcs,
    grandOverStockKg,
    grandOverKirimanPcs,
    grandOverKirimanKg,
    '',
  ]);

  const masterSheet = XLSX.utils.aoa_to_sheet(masterRows);
  masterSheet['!cols'] = [
    { wch: 22 }, // Source File
    { wch: 18 }, // CO
    { wch: 18 }, // Artikel
    { wch: 36 }, // Item Description
    { wch: 18 }, // Tanggal Input PO
    { wch: 26 }, // No PO
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

  masterSheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 19 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 19 } },
    { s: { r: masterRows.length - 1, c: 0 }, e: { r: masterRows.length - 1, c: 6 } },
  ];

  XLSX.utils.book_append_sheet(workbook, masterSheet, 'MASTER_GABUNGAN');

  // 2. Build Individual Sheet for each file
  const usedSheetNames = new Set<string>(['MASTER_GABUNGAN']);

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
 * - Sheet 1: Master Detail Kiriman SJ (Combined all files with Source File / Customer column)
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
  const masterFulfillment = grandQtyPoPcs > 0 ? grandTotalTerkirimPcs / grandQtyPoPcs : 0;

  masterRows.push([
    'GRAND TOTAL REKAPITULASI',
    '',
    '',
    '',
    '',
    '',
    `${grandTotalPOs} PO`,
    `${grandTotalSJs} SJ`,
    { t: 'n', f: `SUM(I5:I${lastMasterRow})`, v: grandQtyPoPcs, z: '#,##0' },
    { t: 'n', f: `SUM(J5:J${lastMasterRow})`, v: grandBeratPoKg, z: '#,##0' },
    '',
    '',
    '',
    { t: 'n', f: `IFERROR(AVERAGE(N5:N${lastMasterRow}),0)`, v: 0, z: '0.0' },
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
      v: masterFulfillment,
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
    { wch: 22 }, // Source File
    { wch: 16 }, // CO
    { wch: 12 }, // Status CO
    { wch: 18 }, // Artikel
    { wch: 34 }, // Item Description
    { wch: 16 }, // Tanggal Input PO
    { wch: 26 }, // No PO
    { wch: 16 }, // Substance
    { wch: 15 }, // QTY PO (pcs)
    { wch: 15 }, // Berat PO (KG)
    { wch: 24 }, // Urutan Kirim
    { wch: 20 }, // No Surat Jalan (SJ)
    { wch: 18 }, // Tanggal Kirim (SJ)
    { wch: 19 }, // Lead Time SJ (Hari)
    { wch: 18 }, // QTY Kirim SJ (pcs)
    { wch: 18 }, // Berat Kirim SJ (KG)
    { wch: 20 }, // Sisa OS Berjalan (pcs)
    { wch: 20 }, // Sisa OS Berjalan (KG)
    { wch: 21 }, // Total Terkirim PO (pcs)
    { wch: 21 }, // Total Terkirim PO (KG)
    { wch: 20 }, // Sisa OS Akhir PO (pcs)
    { wch: 20 }, // Sisa OS Akhir PO (KG)
    { wch: 16 }, // % Pemenuhan PO
    { wch: 24 }, // Status Pengiriman
    { wch: 20 }, // Umur PO / Aging (Hari)
    { wch: 22 }, // Kategori Aging OS
    { wch: 18 }, // Stock Gudang (pcs)
    { wch: 18 }, // Stock Gudang (KG)
    { wch: 14 }, // Harga
  ];

  masterSheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 28 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 28 } },
    { s: { r: masterRows.length - 1, c: 0 }, e: { r: masterRows.length - 1, c: 5 } },
  ];

  XLSX.utils.book_append_sheet(workbook, masterSheet, 'MASTER_DETAIL_SJ');

  const usedSheetNames = new Set<string>(['MASTER_DETAIL_SJ']);

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

