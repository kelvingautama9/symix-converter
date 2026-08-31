import * as XLSX from 'xlsx';
import { ExtractedRecord, ParseSummary } from '../types';

/**
 * Clean numeric string and convert to integer or 0
 */
function parseCleanInt(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.round(val);
  }
  const str = String(val).trim();
  const cleaned = str.replace(/\./g, '').replace(/-/g, '').replace(/,/g, '').trim();
  if (cleaned.length > 0 && /^\d+$/.test(cleaned)) {
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
  }
  const flt = parseFloat(str.replace(/,/g, ''));
  return isNaN(flt) ? 0 : Math.round(flt);
}

/**
 * Check if a cell is numeric
 */
function isNumericCell(val: any): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number') return !isNaN(val);
  const str = String(val).trim();
  if (!str) return false;
  const cleaned = str.replace(/\./g, '').replace(/-/g, '').replace(/,/g, '').trim();
  return cleaned.length > 0 && /^\d+$/.test(cleaned);
}

/**
 * Safely get string from a row at given index
 */
function getStr(row: any[], colIdx: number): string {
  if (!row || row.length <= colIdx) return '';
  const val = row[colIdx];
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Core Parser Engine translated directly from the reference Python logic
 */
export function extractDataWithPoQty(rawRows: any[][]): ExtractedRecord[] {
  const rowsData: ExtractedRecord[] = [];
  let currentItemId: string | null = null;
  let currentItemDesc: string = '';
  let currentSubstance: string = '';
  let currentStockPcs: number = 0;
  let currentStockKg: number = 0;
  let currentPO: ExtractedRecord | null = null;

  for (let idx = 0; idx < rawRows.length; idx++) {
    const r = rawRows[idx] || [];

    const valA = getStr(r, 0);
    const valB = getStr(r, 1);
    const valC = getStr(r, 2);
    const valD = getStr(r, 3);

    // Deteksi baris TOTAL yang bisa berada di kolom manapun
    let isTotal = false;
    for (let c = 0; c < r.length; c++) {
      const colVal = r[c];
      if (colVal !== null && colVal !== undefined && typeof colVal === 'string' && colVal.toUpperCase().includes('TOTAL')) {
        isTotal = true;
        break;
      }
    }

    // 1. TAHAP DETEKSI PARENT (BARIS ITEM CARTON/BOX: SH- atau ST-)
    if (valA.startsWith('SH-') || valA.startsWith('ST-')) {
      if (currentPO) {
        if (!currentPO._has_delivery) {
          currentPO['Sisa OS (pcs)'] = currentPO['QTY PO (pcs)'];
          currentPO['Sisa OS (kg)'] = currentPO['Berat PO (KG)'];
        }
        rowsData.push(currentPO);
        currentPO = null;
      }

      currentItemId = valA;
      currentItemDesc = valB;
      currentSubstance = valD;

      // Deteksi stok gudang yang rentan bergeser kolomnya
      let stockPcs = 0;
      let stockKg = 0;

      if (r.length > 4 && isNumericCell(r[4])) {
        stockPcs = parseCleanInt(r[4]);
      } else if (r.length > 6 && isNumericCell(r[6])) {
        stockPcs = parseCleanInt(r[6]);
      }

      if (r.length > 5 && isNumericCell(r[5])) {
        stockKg = parseCleanInt(r[5]);
      } else if (r.length > 7 && isNumericCell(r[7])) {
        stockKg = parseCleanInt(r[7]);
      }

      currentStockPcs = stockPcs;
      currentStockKg = stockKg;
    }
    // 2. TAHAP DETEKSI CHILD (BARIS PURCHASE ORDER)
    else if (
      currentItemId &&
      (valB.includes('DAP') || valB.includes('PO.') || valB.includes('PO ') || valB.includes('PO') || valB.split(/\s+/).length > 1) &&
      !valA.startsWith('I t e m') &&
      !valA.startsWith('---') &&
      !valA.startsWith('Item') &&
      !valA.startsWith('TOTAL') &&
      !valA.startsWith('SH-') &&
      !valA.startsWith('ST-')
    ) {
      if ((valA.length > 0 || valB.length > 3) && !valA.includes('Gramature') && !valA.includes('Stock')) {
        if (currentPO) {
          if (!currentPO._has_delivery) {
            currentPO['Sisa OS (pcs)'] = currentPO['QTY PO (pcs)'];
            currentPO['Sisa OS (kg)'] = currentPO['Berat PO (KG)'];
          }
          rowsData.push(currentPO);
        }

        // Ekstraksi Data CO (Customer Order No dari Kolom A)
        const coNumber = valA ? valA.replace(/\s+/g, ' ').trim() : '-';

        // Membersihkan Nomor PO (Menghilangkan Tanggal)
        const partsB = valB.split(' ');
        let cleanPoNo = valB;
        if (partsB.length > 1 && (partsB[0].includes('/') || partsB[0].includes('-'))) {
          cleanPoNo = partsB.slice(1).join(' ');
        }

        // Mengekstrak Harga dari teks gabungan alamat gudang
        const parts = valC.split(/\s+/);
        let priceVal = 0.0;
        for (const part of parts) {
          const cleaned = part.replace(/,/g, '');
          if (part.includes('.')) {
            const parsed = parseFloat(cleaned);
            if (!isNaN(parsed) && parsed > 0) {
              priceVal = parsed;
              break;
            }
          }
        }

        const rawQtyPcs = r.length > 6 ? r[6] : null;
        const rawQtyKg = r.length > 7 ? r[7] : null;

        const qtyOrderPcs = isNumericCell(rawQtyPcs) ? parseCleanInt(rawQtyPcs) : 0;
        const qtyOrderKg = isNumericCell(rawQtyKg) ? parseCleanInt(rawQtyKg) : 0;

        const sisaPcsRaw = r.length > 14 ? r[14] : null;
        const sisaKgRaw = r.length > 15 ? r[15] : null;

        const hasInitialDelivery = isNumericCell(sisaPcsRaw) || isNumericCell(sisaKgRaw);

        // Membangun struktur kerangka 12 Kolom (dengan CO di posisi pertama)
        currentPO = {
          CO: coNumber,
          Artikel: currentItemId,
          'Item Description': currentItemDesc,
          'No PO': cleanPoNo,
          Substance: currentSubstance,
          'QTY PO (pcs)': qtyOrderPcs,
          'Berat PO (KG)': qtyOrderKg,
          'Stock (pcs)': currentStockPcs,
          'Stock (kg)': currentStockKg,
          'Sisa OS (pcs)': isNumericCell(sisaPcsRaw) ? parseCleanInt(sisaPcsRaw) : 0,
          'Sisa OS (kg)': isNumericCell(sisaKgRaw) ? parseCleanInt(sisaKgRaw) : 0,
          Harga: priceVal,
          _has_delivery: hasInitialDelivery,
        };
      }
    }
    // 3. TAHAP DETEKSI SUB-CHILD (BARIS PENGIRIMAN / SISA OS TERBARU)
    else if (
      currentPO &&
      (!r[0] || String(r[0]).trim() === '') &&
      (!r[1] || String(r[1]).trim() === '') &&
      (getStr(r, 10).includes('P26') || getStr(r, 9).includes('P26'))
    ) {
      const sisaPcs = r.length > 14 ? r[14] : null;
      const sisaKg = r.length > 15 ? r[15] : null;

      // OVERWRITE nilai sisa OS dengan angka yang paling baru/terbawah
      if (isNumericCell(sisaPcs)) {
        currentPO['Sisa OS (pcs)'] = parseCleanInt(sisaPcs);
        currentPO._has_delivery = true;
      }
      if (isNumericCell(sisaKg)) {
        currentPO['Sisa OS (kg)'] = parseCleanInt(sisaKg);
        currentPO._has_delivery = true;
      }
    }
    // 4. TAHAP PENUTUP (FALLBACK & SAVING DATA)
    else if (isTotal || valA.startsWith('I t e m')) {
      if (currentPO) {
        if (!currentPO._has_delivery) {
          currentPO['Sisa OS (pcs)'] = currentPO['QTY PO (pcs)'];
          currentPO['Sisa OS (kg)'] = currentPO['Berat PO (KG)'];
        }
        rowsData.push(currentPO);
        currentPO = null;
      }
    }
  }

  // Mengamankan baris terakhir yang mungkin menggantung saat file habis terbaca
  if (currentPO) {
    if (!currentPO._has_delivery) {
      currentPO['Sisa OS (pcs)'] = currentPO['QTY PO (pcs)'];
      currentPO['Sisa OS (kg)'] = currentPO['Berat PO (KG)'];
    }
    rowsData.push(currentPO);
  }

  // Membersihkan metadata sebelum dikembalikan
  return rowsData.map((item) => {
    const cleaned = { ...item };
    delete cleaned._has_delivery;
    return cleaned;
  });
}

/**
 * Reads an ArrayBuffer or binary data of an Excel workbook and parses the selected or first sheet
 */
export function parseExcelBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  targetSheetName?: string
): { data: ExtractedRecord[]; summary: ParseSummary; workbook: XLSX.WorkBook } {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('File Excel tidak memiliki sheet yang valid.');
  }

  const selectedSheet = targetSheetName && sheetNames.includes(targetSheetName)
    ? targetSheetName
    : sheetNames[0];

  const worksheet = workbook.Sheets[selectedSheet];
  if (!worksheet) {
    throw new Error(`Sheet "${selectedSheet}" tidak ditemukan.`);
  }

  // Read 2D array of rows
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  const finalData = extractDataWithPoQty(rawRows);

  // Compute summary metrics
  const uniqueItems = new Set(finalData.map((d) => d.Artikel)).size;
  const totalQtyOrderPcs = finalData.reduce((sum, d) => sum + (d['QTY PO (pcs)'] || 0), 0);
  const totalBeratOrderKg = finalData.reduce((sum, d) => sum + (d['Berat PO (KG)'] || 0), 0);
  const totalStockPcs = finalData.reduce((sum, d) => sum + (d['Stock (pcs)'] || 0), 0);
  const totalStockKg = finalData.reduce((sum, d) => sum + (d['Stock (kg)'] || 0), 0);
  const totalSisaOSPcs = finalData.reduce((sum, d) => sum + (d['Sisa OS (pcs)'] || 0), 0);
  const totalSisaOSKg = finalData.reduce((sum, d) => sum + (d['Sisa OS (kg)'] || 0), 0);
  const totalValue = finalData.reduce((sum, d) => sum + (d['Sisa OS (pcs)'] || 0) * (d.Harga || 0), 0);

  const itemsWithDelivery = finalData.filter((d) => d['Sisa OS (pcs)'] < d['QTY PO (pcs)']).length;
  const itemsWithoutDelivery = finalData.length - itemsWithDelivery;

  const fileSizeStr = buffer.byteLength > 1024 * 1024
    ? `${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB`
    : `${(buffer.byteLength / 1024).toFixed(1)} KB`;

  const summary: ParseSummary = {
    totalPOs: finalData.length,
    totalUniqueItems: uniqueItems,
    totalQtyOrderPcs,
    totalBeratOrderKg,
    totalStockPcs,
    totalStockKg,
    totalSisaOSPcs,
    totalSisaOSKg,
    totalValue,
    itemsWithDelivery,
    itemsWithoutDelivery,
    fileName,
    fileSize: fileSizeStr,
    parsedAt: new Date().toLocaleString('id-ID'),
    sheetNames,
    activeSheetName: selectedSheet,
    totalRawRows: rawRows.length,
  };

  return { data: finalData, summary, workbook };
}
