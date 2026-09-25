import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { BatchFileItem, BatchAggregateStats, ExcelExportScope, ExtractedRecord, ParseSummary, ConversionMode } from '../types';
import { parseExcelBuffer, recalculateFIFOStock } from './parserEngine';
import { generateExcelBlobAndFile, getExportFileName, EXCEL_COLUMNS } from './excelExporter';

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
  scope: ExcelExportScope = 'ALL',
  mode: ConversionMode = 'CUT_COLUMNS'
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
    file.name,
    undefined,
    mode
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
 * Compiles all successful batch converted Excel files into a single ZIP archive and downloads it immediately.
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
 * Consolidates all converted files into one Master Consolidated Excel Workbook:
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
  let grandOverPcs = 0;
  let grandOverKg = 0;

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

  XLSX.utils.book_append_sheet(workbook, masterSheet, 'MASTER_GABUNGAN');

  // 2. Build Individual Sheet for each file
  const usedSheetNames = new Set<string>(['MASTER_GABUNGAN']);

  for (const item of validItems) {
    if (!item.data) continue;
    const cleanSource = item.rawFileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[\\/?*[\]:]/g, '_')
      .trim();

    // Excel sheet name max 31 characters
    let sheetName = cleanSource.substring(0, 28);
    if (!sheetName) sheetName = 'Sheet';
    let counter = 1;
    let uniqueSheetName = sheetName;
    while (usedSheetNames.has(uniqueSheetName.toUpperCase())) {
      uniqueSheetName = `${sheetName.substring(0, 25)}_${counter}`;
      counter++;
    }
    usedSheetNames.add(uniqueSheetName.toUpperCase());

    const { workbook: singleWb } = generateExcelBlobAndFile(
      item.data,
      item.rawFileName,
      scope
    );
    const firstSingleSheet = singleWb.Sheets[singleWb.SheetNames[0]];
    if (firstSingleSheet) {
      XLSX.utils.book_append_sheet(workbook, firstSingleSheet, uniqueSheetName);
    }
  }

  const now = new Date();
  const dateTag = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const fileName = `${masterBaseName}_${dateTag}.xlsx`;

  XLSX.writeFile(workbook, fileName);
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
