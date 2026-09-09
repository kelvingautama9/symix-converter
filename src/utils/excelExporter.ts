import * as XLSX from 'xlsx';
import { ExtractedRecord, ExcelExportScope } from '../types';
import { recalculateFIFOStock } from './parserEngine';

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
 * Resolves the export filename based on the uploaded file's original name and requested scope.
 * E.g., if uploaded file is "jirec.xls":
 * - 'ALL' -> "jirec.xlsx"
 * - 'OPEN_ONLY' -> "jirec_CO_OPEN.xlsx"
 * - 'CLOSED_ONLY' -> "jirec_CO_CLOSED.xlsx"
 * - 'STOCK_READY_ALL' -> "jirec_STOCK_READY_SEMUA_CO.xlsx"
 * - 'STOCK_READY_OPEN' -> "jirec_STOCK_READY_CO_OPEN.xlsx"
 * - 'STOCK_READY_CLOSED' -> "jirec_STOCK_READY_CO_CLOSED.xlsx"
 *
 * If no uploaded filename is provided, defaults to "Rekap_Customer.xlsx".
 */
export function getExportFileName(
  uploadedFileName?: string | null,
  scope: ExcelExportScope | string = 'ALL'
): string {
  let baseName = 'Rekap_Customer';
  if (uploadedFileName) {
    let clean = uploadedFileName.trim();
    // Strip any directory path segments if present
    clean = clean.split(/[/\\]/).pop() || clean;
    // Strip extension (e.g. .xls, .xlsx, .csv)
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
    case 'ALL':
    default:
      return `${baseName}.xlsx`;
  }
}

/**
 * Builds the complete formatted Excel workbook, Blob, and File object in memory
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
  }

  if (filteredData.length === 0) {
    let scopeDesc = 'kondisi filter yang dipilih';
    if (scope === 'OPEN_ONLY') scopeDesc = 'status CO "OPEN"';
    else if (scope === 'CLOSED_ONLY') scopeDesc = 'status CO "CLOSED"';
    else if (scope === 'STOCK_READY_ALL') scopeDesc = 'kriteria "Stock Ready" (Semua CO)';
    else if (scope === 'STOCK_READY_OPEN') scopeDesc = 'kriteria "Stock Ready" (Khusus CO Open)';
    else if (scope === 'STOCK_READY_CLOSED') scopeDesc = 'kriteria "Stock Ready" (Khusus CO Closed)';
    throw new Error(`Tidak ada data dengan ${scopeDesc} untuk diekspor.`);
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
  sheetData.push([`Tanggal Rekap: ${nowStr} | Total Record: ${filteredData.length} PO | Filter: ${scopeTitleSuffix}`]);

  // Row 3: Empty spacing row (index 2)
  sheetData.push([]);

  // Row 4: Data headers start at row 4 (index 3) - 15 columns strictly ordered
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

  for (const item of filteredData) {
    const qtyPcs = Number(item['QTY PO (pcs)']) || 0;
    const beratKg = Number(item['Berat PO (KG)']) || 0;
    const stockPcs = Number(item['Stock (pcs)']) || 0;
    const stockKg = Number(item['Stock (kg)']) || 0;
    const sisaPcs = Number(item['Sisa OS (pcs)']) || 0;
    const sisaKg = Number(item['Sisa OS (kg)']) || 0;
    const terkirimPcs = item['Terkirim (PCS)'] !== undefined ? Number(item['Terkirim (PCS)']) : Math.max(0, qtyPcs - sisaPcs);
    const terkirimKg = item['Terkirim (KG)'] !== undefined ? Number(item['Terkirim (KG)']) : Math.max(0, beratKg - sisaKg);
    const harga = Number(item.Harga) || 0;

    sumQtyPcs += qtyPcs;
    sumBeratKg += beratKg;
    sumStockPcs += stockPcs;
    sumStockKg += stockKg;
    sumSisaPcs += sisaPcs;
    sumSisaKg += sisaKg;
    sumTerkirimPcs += terkirimPcs;
    sumTerkirimKg += terkirimKg;

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
      harga,
    ]);
  }

  // Row Total Summary at the bottom
  sheetData.push([
    'TOTAL REKAPITULASI',
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
    '',
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths for optimal legibility (15 columns)
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
    { wch: 14 }, // Harga
  ];

  // Set merges for Title row (A1 to O1, index 0 to 14)
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 14 } }, // Title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 14 } }, // Subtitle
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
 * Exports finalData to a formatted Excel file and downloads it locally
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
 * Shares the generated Excel file directly to WhatsApp:
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
