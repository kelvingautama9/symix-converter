import * as XLSX from 'xlsx';
import { ExtractedRecord, ParseSummary, CoStatus } from '../types';

/**
 * Detect CO Status from CO string (e.g., "18H6941 5 C" -> CLOSED, "18H8550 1 O" -> OPEN)
 * C = Closed, O = Open
 */
export function parseCoStatus(coText: string | undefined | null): CoStatus {
  if (!coText || typeof coText !== 'string') return 'UNKNOWN';
  const clean = coText.trim().toUpperCase();
  if (!clean || clean === '-') return 'UNKNOWN';

  const tokens = clean.split(/\s+/);
  const lastToken = tokens[tokens.length - 1];

  if (lastToken === 'C' || lastToken === 'CLOSED') {
    return 'CLOSED';
  }
  if (lastToken === 'O' || lastToken === '0' || lastToken === 'OPEN') {
    return 'OPEN';
  }

  if (/\s+C$/i.test(clean)) return 'CLOSED';
  if (/\s+[O0]$/i.test(clean)) return 'OPEN';

  return 'UNKNOWN';
}

/**
 * Check if a row is an ERP page header, SYMIX banner, or table separator/column header that should be skipped.
 */
export function isIgnoredHeaderRow(r: any[]): boolean {
  if (!r || r.length === 0) return true;

  // 1. Check if entirely empty
  const hasAnyContent = r.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '');
  if (!hasAnyContent) return true;

  const valA = getStr(r, 0).toUpperCase();
  // Never ignore parent item records
  if (valA.startsWith('SH-') || valA.startsWith('ST-')) {
    return false;
  }

  // Join all cells in row for holistic keyword search
  const fullRowStr = r
    .map((c) => (c !== null && c !== undefined ? String(c).trim() : ''))
    .filter((s) => s.length > 0)
    .join(' ')
    .toUpperCase();

  // Never ignore TOTAL row (it closes current PO group)
  if (fullRowStr.includes('TOTAL')) {
    return false;
  }

  // Never ignore actual P26 delivery rows
  if (
    (getStr(r, 10).toUpperCase().includes('P26') ||
      getStr(r, 9).toUpperCase().includes('P26') ||
      getStr(r, 8).toUpperCase().includes('P26')) &&
    !fullRowStr.includes('S/J NO') &&
    !fullRowStr.includes('C/O NO')
  ) {
    return false;
  }

  // 2. Dash/separator line check (e.g., "--------- --------- ---------")
  const nonDashChars = fullRowStr.replace(/[\s\-_=.]/g, '');
  if (nonDashChars.length === 0) {
    return true;
  }

  // 3. ERP / SYMIX software & pagination header check
  if (
    fullRowStr.includes('SYMIX') ||
    fullRowStr.includes('CO40-R') ||
    fullRowStr.includes('CO40') ||
    fullRowStr.includes('REALISASI C/O') ||
    fullRowStr.includes('REALISASI') ||
    fullRowStr.includes('PAGE:') ||
    fullRowStr.includes('PA GE:') ||
    fullRowStr.includes('PAGE :')
  ) {
    return true;
  }

  // 4. Repeated Table Column Headers check
  if (
    fullRowStr.includes('C/O NO') ||
    fullRowStr.includes('C/O NO.') ||
    fullRowStr.includes('C/O NO. L S') ||
    fullRowStr.includes('C/O DATE') ||
    fullRowStr.includes('CUST P/O') ||
    fullRowStr.includes('CUST PO') ||
    fullRowStr.includes('CONTRACT PRICE') ||
    fullRowStr.includes('PRICE SHIP TO') ||
    fullRowStr.includes('QTY.ORDER') ||
    fullRowStr.includes('DIV.SCHEDULE') ||
    fullRowStr.includes('S/J NO') ||
    fullRowStr.includes('S/J DATE') ||
    fullRowStr.includes('QTY.SHIP') ||
    fullRowStr.includes('---BALANCE---') ||
    fullRowStr.includes('---QTY.ORDER---') ||
    fullRowStr.includes('---DIV.SCHEDULE---') ||
    fullRowStr.includes('---QTY.SHIP---')
  ) {
    return true;
  }

  // 5. Repeated Item Column Headers (e.g. "I t e m Description U/M Size Gramature Flute -----Stock")
  if (
    valA.startsWith('I T E M') ||
    valA === 'ITEM' ||
    (fullRowStr.includes('DESCRIPTION') && fullRowStr.includes('GRAMATURE')) ||
    (fullRowStr.includes('U/M') && fullRowStr.includes('SIZE')) ||
    fullRowStr.includes('---STOCK---') ||
    fullRowStr.includes('---STOCK')
  ) {
    return true;
  }

  // 6. Sub-header unit rows (e.g. "PCS KG Date QTY PCS KG PCS KG")
  const tokens = fullRowStr.split(/\s+/);
  const isAllUnitTokens =
    tokens.length > 0 &&
    tokens.every(
      (t) =>
        ['PCS', 'KG', 'DATE', 'QTY', '---PCS---', '---KG---', 'U/M', 'SIZE', 'GRAMATURE', 'FLUTE', 'COMPANY', 'SHIP', 'TO', '-'].includes(
          t
        ) || /^[-_]+$/.test(t)
    );
  if (isAllUnitTokens && !tokens.includes('SH-') && !tokens.includes('ST-')) {
    return true;
  }

  return false;
}

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
  let parentCount: number = 0;
  let currentPO: ExtractedRecord | null = null;

  for (let idx = 0; idx < rawRows.length; idx++) {
    const r = rawRows[idx] || [];

    // Deteksi baris TOTAL yang bisa berada di kolom manapun
    let isTotal = false;
    for (let c = 0; c < r.length; c++) {
      const colVal = r[c];
      if (colVal !== null && colVal !== undefined && typeof colVal === 'string' && colVal.toUpperCase().includes('TOTAL')) {
        isTotal = true;
        break;
      }
    }

    // TAHAP KHUSUS PENUTUP SUB-TOTAL (TOTAL)
    if (isTotal) {
      if (currentPO) {
        if (!currentPO._has_delivery) {
          currentPO['Sisa OS (pcs)'] = currentPO['QTY PO (pcs)'];
          currentPO['Sisa OS (kg)'] = currentPO['Berat PO (KG)'];
          currentPO['Terkirim (PCS)'] = 0;
          currentPO['Terkirim (KG)'] = 0;
        } else {
          currentPO['Terkirim (PCS)'] = Math.max(0, (currentPO['QTY PO (pcs)'] || 0) - (currentPO['Sisa OS (pcs)'] || 0));
          currentPO['Terkirim (KG)'] = Math.max(0, (currentPO['Berat PO (KG)'] || 0) - (currentPO['Sisa OS (kg)'] || 0));
        }
        rowsData.push(currentPO);
        currentPO = null;
      }
      continue;
    }

    // TAHAP FILTER HEADER ERP / SYMIX / DASH / REPEATED COLUMN HEADERS
    // Langsung lewati tanpa mereset currentPO (agar pengiriman P26 yang terpotong header tetap masuk ke currentPO)
    if (isIgnoredHeaderRow(r)) {
      continue;
    }

    const valA = getStr(r, 0);
    const valB = getStr(r, 1);
    const valC = getStr(r, 2);
    const valD = getStr(r, 3);

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

      parentCount++;
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
      (valB.includes('DAP') ||
        valB.includes('PO.') ||
        valB.includes('PO ') ||
        valB.includes('PO') ||
        valB.split(/\s+/).length > 1 ||
        valA.length >= 4) &&
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
        const sisaPcsVal = isNumericCell(sisaPcsRaw) ? parseCleanInt(sisaPcsRaw) : 0;
        const sisaKgVal = isNumericCell(sisaKgRaw) ? parseCleanInt(sisaKgRaw) : 0;

        // Membangun struktur kerangka 14 Kolom (dengan CO di posisi pertama dan Terkirim di samping Sisa OS)
        currentPO = {
          CO: coNumber,
          coStatus: parseCoStatus(coNumber),
          Artikel: currentItemId,
          'Item Description': currentItemDesc,
          'No PO': cleanPoNo,
          Substance: currentSubstance,
          'QTY PO (pcs)': qtyOrderPcs,
          'Berat PO (KG)': qtyOrderKg,
          'Stock (pcs)': 0, // Dialokasikan secara proporsional/FIFO setelah seluruh Sisa OS terhitung
          'Stock (kg)': 0,  // Dialokasikan secara proporsional/FIFO setelah seluruh Sisa OS terhitung
          'Sisa OS (pcs)': sisaPcsVal,
          'Sisa OS (kg)': sisaKgVal,
          'Terkirim (PCS)': Math.max(0, qtyOrderPcs - sisaPcsVal),
          'Terkirim (KG)': Math.max(0, qtyOrderKg - sisaKgVal),
          Harga: priceVal,
          _has_delivery: hasInitialDelivery,
          _parentIndex: parentCount,
          _parentStockPcs: currentStockPcs,
          _parentStockKg: currentStockKg,
        };
      }
    }
    // 3. TAHAP DETEKSI SUB-CHILD (BARIS PENGIRIMAN / SISA OS TERBARU P26...)
    else if (
      currentPO &&
      (!r[0] || String(r[0]).trim() === '') &&
      (!r[1] || String(r[1]).trim() === '')
    ) {
      // Cek apakah ada nomor surat jalan P26xxx di rentang kolom pengiriman
      let hasDeliveryRecord = false;
      for (let c = 6; c < Math.min(r.length, 14); c++) {
        const cellVal = getStr(r, c).toUpperCase();
        if (cellVal.startsWith('P26') || cellVal.startsWith('P25') || cellVal.startsWith('P27') || /P\d{6,}/i.test(cellVal)) {
          hasDeliveryRecord = true;
          break;
        }
      }

      if (hasDeliveryRecord || getStr(r, 10).includes('P26') || getStr(r, 9).includes('P26')) {
        const sisaPcs = r.length > 14 ? r[14] : null;
        const sisaKg = r.length > 15 ? r[15] : null;

        // OVERWRITE nilai sisa OS dengan angka yang paling baru/terbawah
        if (isNumericCell(sisaPcs)) {
          const pVal = parseCleanInt(sisaPcs);
          currentPO['Sisa OS (pcs)'] = pVal;
          currentPO['Terkirim (PCS)'] = Math.max(0, (currentPO['QTY PO (pcs)'] || 0) - pVal);
          currentPO._has_delivery = true;
        }
        if (isNumericCell(sisaKg)) {
          const kVal = parseCleanInt(sisaKg);
          currentPO['Sisa OS (kg)'] = kVal;
          currentPO['Terkirim (KG)'] = Math.max(0, (currentPO['Berat PO (KG)'] || 0) - kVal);
          currentPO._has_delivery = true;
        }
      }
    }
    // 4. TAHAP PENUTUP (FALLBACK & SAVING DATA)
    else if (isTotal || valA.startsWith('I t e m')) {
      if (currentPO) {
        if (!currentPO._has_delivery) {
          currentPO['Sisa OS (pcs)'] = currentPO['QTY PO (pcs)'];
          currentPO['Sisa OS (kg)'] = currentPO['Berat PO (KG)'];
          currentPO['Terkirim (PCS)'] = 0;
          currentPO['Terkirim (KG)'] = 0;
        } else {
          currentPO['Terkirim (PCS)'] = Math.max(0, (currentPO['QTY PO (pcs)'] || 0) - (currentPO['Sisa OS (pcs)'] || 0));
          currentPO['Terkirim (KG)'] = Math.max(0, (currentPO['Berat PO (KG)'] || 0) - (currentPO['Sisa OS (kg)'] || 0));
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
      currentPO['Terkirim (PCS)'] = 0;
      currentPO['Terkirim (KG)'] = 0;
    } else {
      currentPO['Terkirim (PCS)'] = Math.max(0, (currentPO['QTY PO (pcs)'] || 0) - (currentPO['Sisa OS (pcs)'] || 0));
      currentPO['Terkirim (KG)'] = Math.max(0, (currentPO['Berat PO (KG)'] || 0) - (currentPO['Sisa OS (kg)'] || 0));
    }
    rowsData.push(currentPO);
  }

  // 5. TAHAP ALOKASI STOK BERURUTAN (FIFO / TOP-TO-BOTTOM ACCUMULATION PER ARTIKEL)
  // Menghindari duplikasi stok untuk artikel/item yang sama dengan beberapa baris PO.
  // KONDISIONAL FIFO: Jika Sisa OS under 51 pcs (< 51 pcs), PO tersebut diabaikan dari alokasi FIFO stok (Stock = 0),
  // sehingga saldo stok gudang dialokasikan sepenuhnya ke PO berikutnya yang Sisa OS >= 51 pcs.
  const parentStockMap = new Map<number, { remainingPcs: number; remainingKg: number }>();

  // Inisialisasi saldo stok awal per parent header
  for (const item of rowsData) {
    const pIdx = item._parentIndex ?? 0;
    if (!parentStockMap.has(pIdx)) {
      parentStockMap.set(pIdx, {
        remainingPcs: item._parentStockPcs || 0,
        remainingKg: item._parentStockKg || 0,
      });
    }
  }

  // Alokasi berurutan dari atas ke bawah terhadap Sisa OS masing-masing PO
  for (const item of rowsData) {
    const pIdx = item._parentIndex ?? 0;
    const stockState = parentStockMap.get(pIdx);

    if (stockState) {
      const sisaPcs = item['Sisa OS (pcs)'] || 0;
      const sisaKg = item['Sisa OS (kg)'] || 0;

      // Kondisional: Sisa OS under 51 pcs (< 51 pcs) TIDAK diikutkan ke perhitungan FIFO stock (dianggap 0)
      if (sisaPcs < 51) {
        item['Stock (pcs)'] = 0;
        item['Stock (kg)'] = 0;
        continue;
      }

      // Alokasi Stock (PCS):
      // Mengambil minimum antara sisa saldo stok gudang dan Sisa OS PO ini
      const allocPcs = Math.max(0, Math.min(stockState.remainingPcs, sisaPcs));
      item['Stock (pcs)'] = allocPcs;
      stockState.remainingPcs = Math.max(0, stockState.remainingPcs - allocPcs);

      // Alokasi Stock (KG):
      const allocKg = Math.max(0, Math.min(stockState.remainingKg, sisaKg));
      item['Stock (kg)'] = allocKg;
      stockState.remainingKg = Math.max(0, stockState.remainingKg - allocKg);
    } else {
      item['Stock (pcs)'] = 0;
      item['Stock (kg)'] = 0;
    }
  }

  // Membersihkan metadata internal sebelum dikembalikan
  return rowsData.map((item) => {
    const qtyPcs = item['QTY PO (pcs)'] || 0;
    const qtyKg = item['Berat PO (KG)'] || 0;
    const sisaPcs = item['Sisa OS (pcs)'] || 0;
    const sisaKg = item['Sisa OS (kg)'] || 0;

    const cleaned: ExtractedRecord = {
      ...item,
      'Terkirim (PCS)': Math.max(0, qtyPcs - sisaPcs),
      'Terkirim (KG)': Math.max(0, qtyKg - sisaKg),
    };
    delete cleaned._has_delivery;
    delete cleaned._parentIndex;
    delete cleaned._parentStockPcs;
    delete cleaned._parentStockKg;
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
  const totalCOOpen = finalData.filter((d) => d.coStatus === 'OPEN').length;
  const totalCOClosed = finalData.filter((d) => d.coStatus === 'CLOSED').length;
  const totalQtyOrderPcs = finalData.reduce((sum, d) => sum + (d['QTY PO (pcs)'] || 0), 0);
  const totalBeratOrderKg = finalData.reduce((sum, d) => sum + (d['Berat PO (KG)'] || 0), 0);
  const totalStockPcs = finalData.reduce((sum, d) => sum + (d['Stock (pcs)'] || 0), 0);
  const totalStockKg = finalData.reduce((sum, d) => sum + (d['Stock (kg)'] || 0), 0);
  const totalSisaOSPcs = finalData.reduce((sum, d) => sum + (d['Sisa OS (pcs)'] || 0), 0);
  const totalSisaOSKg = finalData.reduce((sum, d) => sum + (d['Sisa OS (kg)'] || 0), 0);
  const totalTerkirimPcs = finalData.reduce((sum, d) => sum + (d['Terkirim (PCS)'] || 0), 0);
  const totalTerkirimKg = finalData.reduce((sum, d) => sum + (d['Terkirim (KG)'] || 0), 0);
  const totalValue = finalData.reduce((sum, d) => sum + (d['Sisa OS (pcs)'] || 0) * (d.Harga || 0), 0);

  const itemsWithDelivery = finalData.filter((d) => d['Sisa OS (pcs)'] < d['QTY PO (pcs)']).length;
  const itemsWithoutDelivery = finalData.length - itemsWithDelivery;

  const fileSizeStr = buffer.byteLength > 1024 * 1024
    ? `${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB`
    : `${(buffer.byteLength / 1024).toFixed(1)} KB`;

  const summary: ParseSummary = {
    totalPOs: finalData.length,
    totalUniqueItems: uniqueItems,
    totalCOOpen,
    totalCOClosed,
    totalQtyOrderPcs,
    totalBeratOrderKg,
    totalStockPcs,
    totalStockKg,
    totalSisaOSPcs,
    totalSisaOSKg,
    totalTerkirimPcs,
    totalTerkirimKg,
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
