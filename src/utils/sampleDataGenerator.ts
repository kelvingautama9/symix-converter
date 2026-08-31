import * as XLSX from 'xlsx';

/**
 * Creates a realistic raw ERP Excel workbook replicating the messy Parent-Child-SubChild structure
 * so users can test immediately.
 */
export function generateRawSampleERPWorkbook(): { buffer: ArrayBuffer; filename: string } {
  // We build a 2D array matching the real ERP output
  const rawRows: any[][] = [];

  // Header banner in raw ERP
  rawRows.push(['LAPORAN MONITORING SISA ORDER DAN STOCK GUDANG', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  rawRows.push(['PERIODE: AKTIF S/D AGUSTUS 2026', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  rawRows.push(['PT. KARTON MAKMUR SEJAHTERA - ERP PRODUCTION LOG', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  rawRows.push(['---', '----------------------------------------', '------------------', '------------------', '', '', '', '', '', '', '', '', '', '', '', '']);

  // ITEM 1: SH-8092 (Parent) - Stock at Col 4 & 5
  // Col 0: 'SH-8092-A', Col 1: 'BOX MASTER 400X300X200 K150/M125', Col 3: 'K150/M125/K150 B/F', Col 4: 12500, Col 5: 3125
  rawRows.push(['SH-8092-A', 'BOX MASTER 400X300X200 K150/M125', '', 'K150/M125/K150 B/F', 12500, 3125, '', '', '', '', '', '', '', '', '', '']);

  // PO 1.1 (Child with CO in Col A, Date in PO name and delivery sub-child)
  // Col 0: '18H8559 1 O', Col 1: '12/08/2026 PO.88921/KMS/VIII/26', Col 2: 'GUDANG CIKARANG BLOK B 4850.00 EX-WORK', Col 3: '', Col 6: 10000, Col 7: 2500
  rawRows.push(['18H8559 1 O', '12/08/2026 PO.88921/KMS/VIII/26', 'GUDANG CIKARANG BLOK B 4850.00 EX-WORK', '', '', '', 10000, 2500, '', '', '', '', '', '', '', '']);
  
  // Delivery log 1 (Sub-child with P26 in Col 10, Sisa at Col 14 & 15)
  // Col 9: 'SJ-9901', Col 10: 'DO-P26-8801', Col 14: 6000, Col 15: 1500
  rawRows.push(['', '', '', '', '', '', '', '', '', 'SJ-9901', 'DO-P26-8801', '', '', '', 6000, 1500]);
  
  // Delivery log 2 (Latest overwrite with P26 in Col 10, Sisa 3500 pcs)
  rawRows.push(['', '', '', '', '', '', '', '', '', 'SJ-9988', 'DO-P26-8899', '', '', '', 3500, 875]);

  // PO 1.2 (Child with CO in Col A, '-' date in PO, NO DELIVERY LOG -> Fallback test)
  rawRows.push(['18H8532 1 O', '18-08-2026 PO.89012/DAP/KMS/26', 'GDG TANGERANG UTARA 4850.00 INC-PPN', '', '', '', 5000, 1250, '', '', '', '', '', '', '', '']);

  // Total Item 1
  rawRows.push(['TOTAL SH-8092-A', '', '', '', '', '', 15000, 3750, '', '', '', '', '', '', 8500, 2125]);
  rawRows.push(['---', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

  // ITEM 2: ST-4410 (Parent) - Stock at Col 6 & 7 (Shifted columns test)
  // Col 0: 'ST-4410-B', Col 1: 'INNER BOX DIE CUT 250X150X100 E/F', Col 3: 'WK150/M125 E/F', Col 4: '', Col 5: '', Col 6: 4500, Col 7: 675
  rawRows.push(['ST-4410-B', 'INNER BOX DIE CUT 250X150X100 E/F', '', 'WK150/M125 E/F', '', '', 4500, 675, '', '', '', '', '', '', '', '']);

  // PO 2.1 (Child DAP with CO)
  rawRows.push(['18H8885 1 O', 'DAP-PO.9001/FMCG/26', 'LOC-SURABAYA BARAT 2950.50 NETT', '', '', '', 8000, 1200, '', '', '', '', '', '', '', '']);
  // Delivery Log
  rawRows.push(['', '', '', '', '', '', '', '', '', 'P26-SURABAYA', 'SUR-P26-112', '', '', '', 2000, 300]);

  // PO 2.2 (Child with no delivery)
  rawRows.push(['18H8306 1 O', '20/08/2026 DAP-PO.9044/RETAIL/26', 'LOC-SEMARANG 2950.50 NETT', '', '', '', 12000, 1800, '', '', '', '', '', '', '', '']);

  // Total Item 2
  rawRows.push(['TOTAL ST-4410-B', '', '', '', '', '', 20000, 3000, '', '', '', '', '', '', 14000, 2100]);
  rawRows.push(['---', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);

  // ITEM 3: SH-1025-X (Parent)
  rawRows.push(['SH-1025-X', 'HEAVY DUTY CORRUGATED PALLET BOX', '', 'K275/M150x2/K275 CB/F', 800, 960, '', '', '', '', '', '', '', '', '', '']);

  // PO 3.1
  rawRows.push(['18H9011 1 O', 'PO 77123-EXPORT-SINGAPORE', 'PORT TANJUNG PRIOK 18500.00 FOB', '', '', '', 1500, 1800, '', '', '', '', '', '', '', '']);
  rawRows.push(['', '', '', '', '', '', '', '', 'LOG-P26-TRANSIT', 'P26-EXP-001', '', '', '', '', 500, 600]);

  // PO 3.2
  rawRows.push(['18H9144 1 O', '01/08/2026 PO.77440-REGULAR', 'PORT TANJUNG PRIOK 18500.00 FOB', '', '', '', 2000, 2400, '', '', '', '', '', '', '', '']);

  // TOTAL END
  rawRows.push(['TOTAL KESELURUHAN LAPORAN', '', '', '', '', '', 38500, 8950, '', '', '', '', '', '', 23000, 5125]);

  const worksheet = XLSX.utils.aoa_to_sheet(rawRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Raw_ERP_Data');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return {
    buffer: excelBuffer,
    filename: 'Sample_ERP_Raw_Export.xlsx',
  };
}
