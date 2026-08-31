import * as XLSX from 'xlsx';
import { ExtractedRecord } from '../types';

export const EXCEL_COLUMNS = [
  'CO',
  'Artikel',
  'Item Description',
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

/**
 * Exports finalData to a formatted Excel file matching the exact requirements:
 * Row 1: Title "REKAPITULASI STOCK & ORDER (OS) CUSTOMER"
 * Row 4: Data headers (14 columns strictly ordered: CO, Artikel, Desc, No PO, ..., Sisa OS (kg), Terkirim (PCS), Terkirim (KG), Harga)
 * Row 5+: Data rows
 * Auto download: "Rekap_Customer_Terbaru.xlsx"
 */
export function exportToExcel(data: ExtractedRecord[], customFileName: string = 'Rekap_Customer_Terbaru.xlsx'): void {
  if (!data || data.length === 0) {
    throw new Error('Tidak ada data yang dapat diekspor.');
  }

  // Prepare 2D matrix
  const sheetData: any[][] = [];

  // Row 1: Title (index 0)
  sheetData.push(['REKAPITULASI STOCK & ORDER (OS) CUSTOMER']);

  // Row 2: Subtitle / Timestamp (index 1)
  const nowStr = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  sheetData.push([`Tanggal Rekap: ${nowStr} | Total PO: ${data.length} Transaksi`]);

  // Row 3: Empty spacing row (index 2)
  sheetData.push([]);

  // Row 4: Data headers start at row 4 (index 3)
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

  for (const item of data) {
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

  // Set column widths for optimal legibility
  worksheet['!cols'] = [
    { wch: 16 }, // CO
    { wch: 18 }, // Artikel
    { wch: 38 }, // Item Description
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

  // Set merges for Title row (A1 to N1)
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }, // Title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } }, // Subtitle
    { s: { r: sheetData.length - 1, c: 0 }, e: { r: sheetData.length - 1, c: 4 } }, // Total label
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap OS & Stock');

  // Trigger download
  const outputFileName = customFileName.endsWith('.xlsx') ? customFileName : `${customFileName}.xlsx`;
  XLSX.writeFile(workbook, outputFileName);
}
