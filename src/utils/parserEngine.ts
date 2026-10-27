// BlackEYE ERP Engine: Standard 15-Column SYMIX Stock & OS Parser + Detailed Surat Jalan (SJ) Parser
import * as XLSX from 'xlsx';
import {
  ExtractedRecord,
  ParseSummary,
  CoStatus,
  CoFilterStatus,
  ExcelExportScope,
  DeliveryRecord,
  FlattenedDeliveryRow,
  DetailSJExportScope,
  DeliveryScheduleRecord,
  SalesOrderRow,
  SalesOrderExportScope,
} from '../types';
import {
  calculateLeadTimeDays,
  getDeliveryStatusTag,
  calculateOrderAgingDetails,
} from './agingUtils';

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
 * Check if row[0] represents a parent Article Item:
 * Triggered when row[0] starts with "SH-" or "ST-" or "BX-" or "DC-"
 */
export function isParentArticleItem(val: string | undefined | null): boolean {
  if (!val) return false;
  const upper = String(val).trim().toUpperCase();
  return (
    upper.startsWith('SH-') ||
    upper.startsWith('ST-') ||
    upper.startsWith('BX-') ||
    upper.startsWith('DC-')
  );
}

/**
 * Check if a row is a Sales representative header in SyMix multi-customer files
 * e.g., Col A: "Sales : BE" | Col B: "RNHARD"
 * e.g., Col A: "Sales : FE" | Col B: "RIX S"
 */
export function isSalesRow(r: any[]): boolean {
  if (!r || r.length === 0) return false;
  const valA = getStr(r, 0).trim();
  if (isParentArticleItem(valA)) return false;

  const fullRowStr = r
    .map((c) => (c !== null && c !== undefined ? String(c).trim() : ''))
    .filter((s) => s.length > 0)
    .join(' ')
    .toUpperCase();

  return (
    /^SALES(\s*PERSON|\s*MAN|\s*REP)?\s*:/i.test(valA) ||
    /^SALES(\s*PERSON|\s*MAN|\s*REP)?\s*:/i.test(fullRowStr) ||
    /\bSALES\s*:\s*[A-Z0-9]+/i.test(fullRowStr)
  );
}

/**
 * Check if a row is a Customer/Company name header row in SyMix multi-customer files
 * e.g., Col A: "PT ADRIAN" | Col B: "PUTRA SEJAHTERA"
 * e.g., Col A: "PT. BERLIA" | Col B: "N UTAMA KARTON BOKS"
 */
export function isCustomerCompanyRow(r: any[]): boolean {
  if (!r || r.length === 0) return false;
  const valA = getStr(r, 0).trim();
  if (isParentArticleItem(valA)) return false;

  const fullRowStr = r
    .map((c) => (c !== null && c !== undefined ? String(c).trim() : ''))
    .filter((s) => s.length > 0)
    .join(' ')
    .toUpperCase();

  if (fullRowStr.includes('TOTAL') || fullRowStr.includes('P26')) return false;

  // Check corporate prefixes in Col A or full row (PT, CV, UD, PD, KOPERASI, TOKO, etc.)
  const hasCorporatePrefix =
    /^(PT\.?|CV\.?|UD\.?|PD\.?|KOPERASI|TOKO|FA\.?)\b/i.test(valA) ||
    /^(PT\.?|CV\.?|UD\.?|PD\.?|KOPERASI|TOKO|FA\.?)\b/i.test(fullRowStr);

  // Real CO rows have numbers in transaction columns (cols 4+)
  const hasTransactionNumbers = r.slice(4).some((cell) => isNumericCell(cell));

  if (hasCorporatePrefix && !hasTransactionNumbers) {
    return true;
  }

  return false;
}

/**
 * Check if a row is a Grouping header in SyMix reports
 * e.g., "UNGROUP", "GROUP", "GROUP : ...", "GROUP BY ..."
 */
export function isGroupHeaderRow(r: any[]): boolean {
  if (!r || r.length === 0) return false;
  const valA = getStr(r, 0).trim().toUpperCase();
  if (isParentArticleItem(valA)) return false;

  const fullRowStr = r
    .map((c) => (c !== null && c !== undefined ? String(c).trim() : ''))
    .filter((s) => s.length > 0)
    .join(' ')
    .toUpperCase();

  return (
    valA === 'UNGROUP' ||
    valA.startsWith('UNGROUP') ||
    valA === 'GROUP' ||
    valA.startsWith('GROUP') ||
    fullRowStr === 'UNGROUP' ||
    fullRowStr.startsWith('UNGROUP') ||
    /^GROUP(\s*BY|\s*:)?/i.test(fullRowStr)
  );
}

/**
 * Check if a row is an ERP page header, SYMIX banner, or table separator/column header that should be skipped.
 */
export function isIgnoredHeaderRow(r: any[]): boolean {
  if (!r || r.length === 0) return true;

  // 1. Check if entirely empty
  const hasAnyContent = r.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '');
  if (!hasAnyContent) return true;

  const valA = getStr(r, 0);
  // Never ignore parent item records (SH-, ST-, BX-, DC-)
  if (isParentArticleItem(valA)) {
    return false;
  }

  // Multi-customer SyMix header check: Sales, Customer company, and Grouping (UNGROUP) headers
  if (isSalesRow(r) || isCustomerCompanyRow(r) || isGroupHeaderRow(r)) {
    return true;
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

  // Never ignore actual P26 / P25 / P27 delivery rows
  if (
    (getStr(r, 10).toUpperCase().includes('P2') ||
      getStr(r, 9).toUpperCase().includes('P2') ||
      getStr(r, 8).toUpperCase().includes('P2')) &&
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
    fullRowStr.includes('DLV.SC') ||
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
  if (
    isAllUnitTokens &&
    !tokens.some((t) => isParentArticleItem(t))
  ) {
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
 * Formats an Excel date cell (either string like "19/10/2026" or Excel serial number)
 */
function formatDateCell(val: any): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number' && val > 30000 && val < 70000) {
    // Convert Excel serial date to DD/MM/YYYY
    const utcDays = Math.floor(val - 25569);
    const dateObj = new Date(utcDays * 86400 * 1000);
    if (!isNaN(dateObj.getTime())) {
      const dd = String(dateObj.getUTCDate()).padStart(2, '0');
      const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = dateObj.getUTCFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  const str = String(val).trim();
  return str.length > 0 ? str : '-';
}

/**
 * Checks if a string looks like a valid Surat Jalan (SJ) number in SYMIX CO40-R
 * e.g., "P26102464", "P25110012", "P27010001", "SJ-...", etc.
 */
function isValidSJCode(str: string): boolean {
  if (!str) return false;
  const clean = str.trim().toUpperCase();
  if (!clean || clean === '-' || clean.includes('TOTAL') || clean.includes('S/J')) return false;
  // Exclude dates like 19/10/2026
  if (/^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(clean)) return false;
  // Standard SYMIX SJ: P followed by 5+ digits (e.g. P26102464), or alphanumeric code with letters & digits
  if (/^P\d{5,}/i.test(clean)) return true;
  if (/^(SJ|DO|DN)[A-Z0-9\-_\/]{3,}/i.test(clean)) return true;
  // Also allow general SJ token at col 10 if it contains both letter and digit (e.g. A26102464)
  if (/^[A-Z]{1,4}\d{4,}[A-Z0-9\-_\/]*$/i.test(clean)) return true;
  return false;
}

interface RawExtractedSJ {
  noSJ: string;
  tanggalKirim: string;
  qtyKirimPcs: number;
  beratKirimKg: number;
  rawBalancePcs: number | null;
  rawBalanceKg: number | null;
}

/**
 * Extracts Surat Jalan (SJ) delivery detail from a row (either a PO row or a sub-child delivery row).
 * In SYMIX CO40-R:
 * Col 10 = S/J No (e.g., P26102464)
 * Col 11 = S/J Date (e.g., 19/10/2026)
 * Col 12 = Qty.Ship PCS (e.g., 3600)
 * Col 13 = Qty.Ship KG (e.g., 956)
 * Col 14 = Balance PCS (e.g., 2500)
 * Col 15 = Balance KG (e.g., 664)
 */
function extractDeliveryFromRow(r: any[]): RawExtractedSJ | null {
  if (!r || r.length === 0) return null;

  // Never extract from TOTAL row
  for (let c = 0; c < r.length; c++) {
    const v = r[c];
    if (v !== null && v !== undefined && typeof v === 'string' && v.toUpperCase().includes('TOTAL')) {
      return null;
    }
  }

  // Prioritize column 10 first, then check 9, 11, 8 in case of column shift
  const candidateCols = [10, 9, 11, 8, 12];
  let sjCol = -1;

  for (const colIdx of candidateCols) {
    const val = getStr(r, colIdx);
    if (isValidSJCode(val)) {
      sjCol = colIdx;
      break;
    }
  }

  if (sjCol === -1) return null;

  const noSJ = getStr(r, sjCol);
  const tanggalKirim = r.length > sjCol + 1 ? formatDateCell(r[sjCol + 1]) : '-';
  const rawShipPcs = r.length > sjCol + 2 ? r[sjCol + 2] : null;
  const rawShipKg = r.length > sjCol + 3 ? r[sjCol + 3] : null;
  const rawBalPcs = r.length > sjCol + 4 ? r[sjCol + 4] : null;
  const rawBalKg = r.length > sjCol + 5 ? r[sjCol + 5] : null;

  const qtyKirimPcs = isNumericCell(rawShipPcs) ? parseCleanInt(rawShipPcs) : 0;
  const beratKirimKg = isNumericCell(rawShipKg) ? parseCleanInt(rawShipKg) : 0;
  const rawBalancePcs = isNumericCell(rawBalPcs) ? parseCleanInt(rawBalPcs) : null;
  const rawBalanceKg = isNumericCell(rawBalKg) ? parseCleanInt(rawBalKg) : null;

  return {
    noSJ,
    tanggalKirim,
    qtyKirimPcs,
    beratKirimKg,
    rawBalancePcs,
    rawBalanceKg,
  };
}

/**
 * Robust parsing for Substance and Flute separation.
 * Handles flute types: BC (2-chars, highest priority), C, B, E.
 * Examples:
 * "K200M100K125   C"  -> substance: "K200M100K125", flute: "C"
 * "K200M100K125   BC" -> substance: "K200M100K125", flute: "BC"
 * "K150M125K125   B"  -> substance: "K150M125K125", flute: "B"
 * "K125M125K125   E"  -> substance: "K125M125K125", flute: "E"
 */
export function parseSubstanceAndFlute(rawText: string | undefined | null): {
  substance: string;
  flute: string;
} {
  if (!rawText) return { substance: '-', flute: '-' };
  const clean = String(rawText).trim();
  if (!clean || clean === '-') return { substance: '-', flute: '-' };

  // 1. Ending with space(s) and flute type: BC must come first before B and C!
  const matchSpace = clean.match(/^(.*?)\s+(BC|B|C|E)$/i);
  if (matchSpace) {
    return {
      substance: matchSpace[1].trim(),
      flute: matchSpace[2].toUpperCase().trim(),
    };
  }

  // 2. Ending with delimiter like slash/dash/underscore: e.g. "K125/M125/K125/BC"
  const matchDelim = clean.match(/^(.*?)[/_\-](BC|B|C|E)$/i);
  if (matchDelim && !matchDelim[1].endsWith('B') && !matchDelim[1].endsWith('C')) {
    return {
      substance: matchDelim[1].trim(),
      flute: matchDelim[2].toUpperCase().trim(),
    };
  }

  // 3. Attached directly after digits: e.g. "K200M100K125BC" or "K200M100K125C"
  const matchDigits = clean.match(/^(.*?\d+)(BC|B|C|E)$/i);
  if (matchDigits) {
    return {
      substance: matchDigits[1].trim(),
      flute: matchDigits[2].toUpperCase().trim(),
    };
  }

  // 4. Standalone flute type
  if (/^(BC|B|C|E)$/i.test(clean)) {
    return {
      substance: '-',
      flute: clean.toUpperCase(),
    };
  }

  return {
    substance: clean,
    flute: '-',
  };
}

/**
 * Extracts Panjang (P) and Lebar (L) dimensions from size column or item description.
 * e.g., "PCS 1060 X 540 X " or "SHEET 1060X540 MM" -> P: 1060, L: 540
 */
export function parseDimensions(
  sizeStr: string | undefined | null,
  descStr: string | undefined | null
): { p: number | string; l: number | string; raw: string } {
  const combined = `${sizeStr || ''} ${descStr || ''}`.trim();
  if (!combined) return { p: '-', l: '-', raw: '-' };

  // Look for pattern: <P> X <L> (e.g. 1060 X 540 or 1060X540 or 1060*540)
  const match = combined.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/);
  if (match) {
    const pNum = parseFloat(match[1]);
    const lNum = parseFloat(match[2]);
    return {
      p: !isNaN(pNum) ? pNum : match[1],
      l: !isNaN(lNum) ? lNum : match[2],
      raw: `${match[1]} X ${match[2]}`,
    };
  }

  return { p: '-', l: '-', raw: sizeStr ? String(sizeStr).trim() : '-' };
}

/**
 * Extracts delivery schedule date and qty from a row.
 * In SyMix:
 * Col 8 = Dlv. Schedule Date
 * Col 9 = Dlv. Schedule QTY
 */
export function extractScheduleFromRow(
  r: any[]
): { scheduleDate: string; scheduleQty: number } | null {
  if (!r || r.length === 0) return null;
  // Never extract from total row
  for (let c = 0; c < r.length; c++) {
    const v = r[c];
    if (v !== null && v !== undefined && typeof v === 'string' && v.toUpperCase().includes('TOTAL')) {
      return null;
    }
  }

  const candidateCols = [8, 7, 9];
  for (const colIdx of candidateCols) {
    if (r.length <= colIdx) continue;
    const rawVal = r[colIdx];
    const formatted = formatDateCell(rawVal);
    if (formatted !== '-' && /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(formatted)) {
      const rawQty = r.length > colIdx + 1 ? r[colIdx + 1] : null;
      const qtyStr = getStr(r, colIdx + 1);
      if (!isValidSJCode(qtyStr) && isNumericCell(rawQty)) {
        return {
          scheduleDate: formatted,
          scheduleQty: parseCleanInt(rawQty),
        };
      }
      return {
        scheduleDate: formatted,
        scheduleQty: 0,
      };
    }
  }
  return null;
}

/**
 * Finalizes a PO's delivery records, running OS balances, total shipped, and final Sisa OS with complete fallback.
 */
function finalizeCurrentPO(po: ExtractedRecord): ExtractedRecord {
  const qtyPoPcs = po['QTY PO (pcs)'] || 0;
  const beratPoKg = po['Berat PO (KG)'] || 0;
  const rawDeliveries = po.deliveries || [];

  if (rawDeliveries.length === 0) {
    // Fallback when PO has NO deliveries (0 SJ)
    if (!po._has_delivery) {
      po['Sisa OS (pcs)'] = qtyPoPcs;
      po['Sisa OS (kg)'] = beratPoKg;
      po['Terkirim (PCS)'] = 0;
      po['Terkirim (KG)'] = 0;
    } else {
      po['Terkirim (PCS)'] = Math.max(0, qtyPoPcs - (po['Sisa OS (pcs)'] || 0) + (po['Over Kiriman (PCS)'] || 0));
      po['Terkirim (KG)'] = Math.max(0, beratPoKg - (po['Sisa OS (kg)'] || 0) + (po['Over Kiriman (KG)'] || 0));
    }

    po.deliveries = [
      {
        sequence: 0,
        noSJ: '-',
        tanggalKirim: '-',
        qtyKirimPcs: 0,
        beratKirimKg: 0,
        akumulasiKirimPcs: po['Terkirim (PCS)'] || 0,
        akumulasiKirimKg: po['Terkirim (KG)'] || 0,
        sisaOsBerjalanPcs: po['Sisa OS (pcs)'] ?? qtyPoPcs,
        sisaOsBerjalanKg: po['Sisa OS (kg)'] ?? beratPoKg,
        isFallbackNoDelivery: true,
      },
    ];
    return po;
  }

  // When PO has 1 or more SJ deliveries: compute step-by-step cumulative & running Sisa OS with fallback
  let runningShippedPcs = 0;
  let runningShippedKg = 0;
  let prevSisaPcs = qtyPoPcs;
  let prevSisaKg = beratPoKg;

  const finalizedDeliveries: DeliveryRecord[] = rawDeliveries.map((d, idx) => {
    let shipPcs = d.qtyKirimPcs || 0;
    let shipKg = d.beratKirimKg || 0;

    // Fallback: if shipPcs was 0/missing on the SJ row, but rawBalancePcs is present, infer from balance drop
    if (shipPcs === 0 && d._rawBalancePcs !== undefined && d._rawBalancePcs !== null) {
      const inferredPcs = prevSisaPcs - d._rawBalancePcs;
      if (inferredPcs > 0) shipPcs = inferredPcs;
    }
    if (shipKg === 0 && d._rawBalanceKg !== undefined && d._rawBalanceKg !== null) {
      const inferredKg = prevSisaKg - d._rawBalanceKg;
      if (inferredKg > 0) shipKg = inferredKg;
    }

    runningShippedPcs += shipPcs;
    runningShippedKg += shipKg;

    // Running Sisa OS after this SJ: use explicit Balance column if valid, else fallback to (QTY PO - runningShipped)
    let stepSisaPcs: number;
    if (d._rawBalancePcs !== undefined && d._rawBalancePcs !== null) {
      stepSisaPcs = Math.max(0, d._rawBalancePcs);
    } else {
      stepSisaPcs = Math.max(0, qtyPoPcs - runningShippedPcs);
    }

    let stepSisaKg: number;
    if (d._rawBalanceKg !== undefined && d._rawBalanceKg !== null) {
      stepSisaKg = Math.max(0, d._rawBalanceKg);
    } else {
      stepSisaKg = Math.max(0, beratPoKg - runningShippedKg);
    }

    prevSisaPcs = stepSisaPcs;
    prevSisaKg = stepSisaKg;

    return {
      sequence: idx + 1,
      noSJ: d.noSJ || '-',
      tanggalKirim: d.tanggalKirim || '-',
      qtyKirimPcs: shipPcs,
      beratKirimKg: shipKg,
      akumulasiKirimPcs: runningShippedPcs,
      akumulasiKirimKg: runningShippedKg,
      sisaOsBerjalanPcs: stepSisaPcs,
      sisaOsBerjalanKg: stepSisaKg,
      isFallbackNoDelivery: false,
    };
  });

  const lastDeliv = finalizedDeliveries[finalizedDeliveries.length - 1];

  // Overall Sisa OS Akhir & Total Terkirim for the PO
  const finalSisaPcs = lastDeliv ? lastDeliv.sisaOsBerjalanPcs : Math.max(0, qtyPoPcs - runningShippedPcs);
  const finalSisaKg = lastDeliv ? lastDeliv.sisaOsBerjalanKg : Math.max(0, beratPoKg - runningShippedKg);

  const totalTerkirimPcs = runningShippedPcs > 0 ? runningShippedPcs : Math.max(0, qtyPoPcs - finalSisaPcs);
  const totalTerkirimKg = runningShippedKg > 0 ? runningShippedKg : Math.max(0, beratPoKg - finalSisaKg);

  const overKirimanPcs = Math.max(po['Over Kiriman (PCS)'] || 0, Math.max(0, totalTerkirimPcs - qtyPoPcs));
  const overKirimanKg = Math.max(po['Over Kiriman (KG)'] || 0, Math.max(0, totalTerkirimKg - beratPoKg));

  po['Sisa OS (pcs)'] = finalSisaPcs;
  po['Sisa OS (kg)'] = finalSisaKg;
  po['Terkirim (PCS)'] = totalTerkirimPcs;
  po['Terkirim (KG)'] = totalTerkirimKg;
  po['Over Kiriman (PCS)'] = overKirimanPcs;
  po['Over Kiriman (KG)'] = overKirimanKg;
  po._has_delivery = true;
  po.deliveries = finalizedDeliveries;

  if (!po.schedules || po.schedules.length === 0) {
    po.schedules = [
      {
        sequence: 1,
        scheduleDate: po.scheduleDate || '-',
        scheduleQty: po.scheduleQty || qtyPoPcs,
      },
    ];
  }

  return po;
}

/**
 * Core Parser Engine translated directly from the reference Python logic + Detailed SJ Extraction + Sales Order Schema
 */
export function extractDataWithPoQty(rawRows: any[][]): ExtractedRecord[] {
  const rowsData: ExtractedRecord[] = [];
  let currentItemId: string | null = null;
  let currentItemDesc: string = '';
  let currentSubstance: string = '';
  let currentPureSubstance: string = '';
  let currentFlute: string = '-';
  let currentSizeP: number | string = '-';
  let currentSizeL: number | string = '-';
  let currentRawSize: string = '';
  let currentCustomerName: string = '';
  let currentStockPcs: number = 0;
  let currentStockKg: number = 0;
  let parentCount: number = 0;
  let currentPO: ExtractedRecord | null = null;
  let expectCustomerRow = false; // Pelacak pintar baris Nama Customer tepat setelah baris Sales

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
        rowsData.push(finalizeCurrentPO(currentPO));
        currentPO = null;
      }
      continue;
    }

    // Lewati baris kosong tanpa menghapus status expectCustomerRow
    const hasAnyContent = r.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasAnyContent) {
      continue;
    }

    // DETEKSI CERDAS MULTI-CUSTOMER: BARIS UNGROUP / GROUPING BANNER
    if (isGroupHeaderRow(r)) {
      if (currentPO) {
        rowsData.push(finalizeCurrentPO(currentPO));
        currentPO = null;
      }
      currentItemId = null;
      currentItemDesc = '';
      currentSubstance = '';
      currentStockPcs = 0;
      currentStockKg = 0;
      continue;
    }

    // DETEKSI CERDAS MULTI-CUSTOMER: BARIS 1 (SALES REP / SALES NAME)
    if (isSalesRow(r)) {
      if (currentPO) {
        rowsData.push(finalizeCurrentPO(currentPO));
        currentPO = null;
      }

      currentItemId = null;
      currentItemDesc = '';
      currentSubstance = '';
      currentStockPcs = 0;
      currentStockKg = 0;

      expectCustomerRow = true;
      continue;
    }

    // DETEKSI CERDAS MULTI-CUSTOMER: BARIS 2 (NAMA CUSTOMER / PERUSAHAAN)
    if (expectCustomerRow || isCustomerCompanyRow(r)) {
      expectCustomerRow = false;
      const custCandidate = `${getStr(r, 0)} ${getStr(r, 1)}`.replace(/\s+/g, ' ').trim();
      if (
        custCandidate &&
        !custCandidate.includes('---') &&
        !custCandidate.toUpperCase().includes('TOTAL')
      ) {
        currentCustomerName = custCandidate;
      }
      currentItemId = null;
      currentItemDesc = '';
      currentSubstance = '';
      currentPureSubstance = '';
      currentFlute = '-';
      currentSizeP = '-';
      currentSizeL = '-';
      currentRawSize = '';
      currentStockPcs = 0;
      currentStockKg = 0;
      continue;
    }

    // TAHAP FILTER HEADER ERP / SYMIX / DASH / REPEATED COLUMN HEADERS
    if (isIgnoredHeaderRow(r)) {
      continue;
    }

    const valA = getStr(r, 0);
    const valB = getStr(r, 1);
    const valC = getStr(r, 2);
    const valD = getStr(r, 3);

    // 1. TAHAP DETEKSI PARENT (BARIS ITEM CARTON/BOX: SH-, ST-, BX-, atau DC-)
    if (isParentArticleItem(valA)) {
      expectCustomerRow = false;
      if (currentPO) {
        rowsData.push(finalizeCurrentPO(currentPO));
        currentPO = null;
      }

      parentCount++;
      currentItemId = valA;
      currentItemDesc = valB;
      currentRawSize = valC;
      const dims = parseDimensions(valC, valB);
      currentSizeP = dims.p;
      currentSizeL = dims.l;
      const parsedSub = parseSubstanceAndFlute(valD);
      currentSubstance = valD;
      currentPureSubstance = parsedSub.substance;
      currentFlute = parsedSub.flute;

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
      !isSalesRow(r) &&
      !isCustomerCompanyRow(r) &&
      !isGroupHeaderRow(r) &&
      !valA.toUpperCase().startsWith('SALES') &&
      !valA.toUpperCase().startsWith('PT') &&
      !valA.toUpperCase().startsWith('UNGROUP') &&
      !valA.toUpperCase().startsWith('GROUP') &&
      (valB.includes('DAP') ||
        valB.includes('PO.') ||
        valB.includes('PO ') ||
        valB.includes('PO') ||
        valB.split(/\s+/).length > 1 ||
        (/\d/.test(valA) && valA.length >= 4)) &&
      !valA.startsWith('I t e m') &&
      !valA.startsWith('---') &&
      !valA.startsWith('Item') &&
      !valA.startsWith('TOTAL') &&
      !isParentArticleItem(valA)
    ) {
      if ((valA.length > 0 || valB.length > 3) && !valA.includes('Gramature') && !valA.includes('Stock')) {
        if (currentPO) {
          rowsData.push(finalizeCurrentPO(currentPO));
        }

        // Ekstraksi Data CO (Customer Order No dari Kolom A)
        const coNumber = valA ? valA.replace(/\s+/g, ' ').trim() : '-';

        // Mengekstrak Tanggal Input PO & Membersihkan Nomor PO
        let poDate = '-';
        let cleanPoNo = valB ? valB.trim() : '-';

        const dateMatch = valB.match(/^(\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s+(.+)$/);
        if (dateMatch) {
          poDate = dateMatch[1].trim();
          cleanPoNo = dateMatch[2].trim();
        } else {
          const partsB = valB.split(/\s+/);
          if (partsB.length > 1 && (partsB[0].includes('/') || partsB[0].includes('-')) && /\d/.test(partsB[0])) {
            poDate = partsB[0].trim();
            cleanPoNo = partsB.slice(1).join(' ').trim();
          }
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
        const rawScheduleDate = r.length > 8 ? formatDateCell(r[8]) : '-';

        const qtyOrderPcs = isNumericCell(rawQtyPcs) ? parseCleanInt(rawQtyPcs) : 0;
        const qtyOrderKg = isNumericCell(rawQtyKg) ? parseCleanInt(rawQtyKg) : 0;

        // Ekstraksi Delivery Schedule (Rencana Jadwal Kirim)
        const sched = extractScheduleFromRow(r);
        const schedDate = sched ? sched.scheduleDate : rawScheduleDate;
        const schedQty = sched && sched.scheduleQty > 0 ? sched.scheduleQty : qtyOrderPcs;
        const initialSchedules: DeliveryScheduleRecord[] = [
          {
            sequence: 1,
            scheduleDate: schedDate !== '-' ? schedDate : '-',
            scheduleQty: schedQty > 0 ? schedQty : qtyOrderPcs,
          },
        ];

        const sisaPcsRaw = r.length > 14 ? r[14] : null;
        const sisaKgRaw = r.length > 15 ? r[15] : null;

        const hasInitialDelivery = isNumericCell(sisaPcsRaw) || isNumericCell(sisaKgRaw);
        const rawSisaPcsVal = isNumericCell(sisaPcsRaw) ? parseCleanInt(sisaPcsRaw) : 0;
        const rawSisaKgVal = isNumericCell(sisaKgRaw) ? parseCleanInt(sisaKgRaw) : 0;

        const initialOverKirimanPcs = rawSisaPcsVal < 0 ? Math.abs(rawSisaPcsVal) : 0;
        const initialOverKirimanKg = rawSisaKgVal < 0 ? Math.abs(rawSisaKgVal) : 0;
        const sisaPcsVal = Math.max(0, rawSisaPcsVal);
        const sisaKgVal = Math.max(0, rawSisaKgVal);

        // Cek apakah pada baris pertama PO ini sudah langsung ada pengiriman ke-1 (misal: P26102464)
        const initialSJ = extractDeliveryFromRow(r);
        const initialDeliveries: DeliveryRecord[] = [];
        if (initialSJ) {
          initialDeliveries.push({
            sequence: 1,
            noSJ: initialSJ.noSJ,
            tanggalKirim: initialSJ.tanggalKirim,
            qtyKirimPcs: initialSJ.qtyKirimPcs,
            beratKirimKg: initialSJ.beratKirimKg,
            akumulasiKirimPcs: initialSJ.qtyKirimPcs,
            akumulasiKirimKg: initialSJ.beratKirimKg,
            sisaOsBerjalanPcs: initialSJ.rawBalancePcs !== null ? Math.max(0, initialSJ.rawBalancePcs) : Math.max(0, qtyOrderPcs - initialSJ.qtyKirimPcs),
            sisaOsBerjalanKg: initialSJ.rawBalanceKg !== null ? Math.max(0, initialSJ.rawBalanceKg) : Math.max(0, qtyOrderKg - initialSJ.beratKirimKg),
            _rawBalancePcs: initialSJ.rawBalancePcs,
            _rawBalanceKg: initialSJ.rawBalanceKg,
          });
        }

        currentPO = {
          CO: coNumber,
          coStatus: parseCoStatus(coNumber),
          Artikel: currentItemId,
          'Item Description': currentItemDesc,
          'Tanggal Input PO': poDate,
          'No PO': cleanPoNo,
          Substance: currentSubstance,
          PureSubstance: currentPureSubstance || currentSubstance,
          Flute: currentFlute || '-',
          SizeP: currentSizeP,
          SizeL: currentSizeL,
          RawSize: currentRawSize,
          'QTY PO (pcs)': qtyOrderPcs,
          'Berat PO (KG)': qtyOrderKg,
          'Stock (pcs)': 0,
          'Stock (kg)': 0,
          'Sisa OS (pcs)': sisaPcsVal,
          'Sisa OS (kg)': sisaKgVal,
          'Terkirim (PCS)': Math.max(0, qtyOrderPcs - sisaPcsVal + initialOverKirimanPcs),
          'Terkirim (KG)': Math.max(0, qtyOrderKg - sisaKgVal + initialOverKirimanKg),
          'Over Stock Gudang (PCS)': 0,
          'Over Stock Gudang (KG)': 0,
          'Over Kiriman (PCS)': initialOverKirimanPcs,
          'Over Kiriman (KG)': initialOverKirimanKg,
          'Over Produksi (PCS)': 0,
          'Over Produksi (KG)': 0,
          Harga: priceVal,
          scheduleDate: schedDate,
          scheduleQty: schedQty,
          schedules: initialSchedules,
          customerName: currentCustomerName,
          deliveries: initialDeliveries,
          _has_delivery: hasInitialDelivery || initialDeliveries.length > 0,
          _parentIndex: parentCount,
          _parentStockPcs: currentStockPcs,
          _parentStockKg: currentStockKg,
        };
      }
    }
    // 3. TAHAP DETEKSI SUB-CHILD (BARIS PENGIRIMAN / SISA OS TERBARU P26... / DELIVERY SCHEDULE)
    else if (
      currentPO &&
      (!r[0] || String(r[0]).trim() === '') &&
      (!r[1] || String(r[1]).trim() === '')
    ) {
      // Ekstrak detail jadwal kirim tambahan (Delivery Schedule) jika ada di baris sub-child
      const subSched = extractScheduleFromRow(r);
      if (subSched && subSched.scheduleDate !== '-') {
        if (!currentPO.schedules) currentPO.schedules = [];
        const isDup = currentPO.schedules.some(
          (s) => s.scheduleDate === subSched.scheduleDate && s.scheduleQty === subSched.scheduleQty
        );
        if (!isDup) {
          currentPO.schedules.push({
            sequence: currentPO.schedules.length + 1,
            scheduleDate: subSched.scheduleDate,
            scheduleQty: subSched.scheduleQty,
          });
        }
      }

      // Ekstrak detail SJ dari baris sub-child
      const subSJ = extractDeliveryFromRow(r);

      let hasDeliveryRecord = Boolean(subSJ);
      if (!hasDeliveryRecord) {
        for (let c = 6; c < Math.min(r.length, 14); c++) {
          const cellVal = getStr(r, c).toUpperCase();
          if (cellVal.startsWith('P26') || cellVal.startsWith('P25') || cellVal.startsWith('P27') || /P\d{5,}/i.test(cellVal)) {
            hasDeliveryRecord = true;
            break;
          }
        }
      }

      if (subSJ) {
        if (!currentPO.deliveries) currentPO.deliveries = [];
        currentPO.deliveries.push({
          sequence: currentPO.deliveries.length + 1,
          noSJ: subSJ.noSJ,
          tanggalKirim: subSJ.tanggalKirim,
          qtyKirimPcs: subSJ.qtyKirimPcs,
          beratKirimKg: subSJ.beratKirimKg,
          akumulasiKirimPcs: 0,
          akumulasiKirimKg: 0,
          sisaOsBerjalanPcs: subSJ.rawBalancePcs !== null ? Math.max(0, subSJ.rawBalancePcs) : 0,
          sisaOsBerjalanKg: subSJ.rawBalanceKg !== null ? Math.max(0, subSJ.rawBalanceKg) : 0,
          _rawBalancePcs: subSJ.rawBalancePcs,
          _rawBalanceKg: subSJ.rawBalanceKg,
        });
      }

      if (hasDeliveryRecord || getStr(r, 10).includes('P26') || getStr(r, 9).includes('P26')) {
        const sisaPcs = r.length > 14 ? r[14] : null;
        const sisaKg = r.length > 15 ? r[15] : null;

        // OVERWRITE nilai sisa OS dengan angka yang paling baru/terbawah
        if (isNumericCell(sisaPcs)) {
          const pVal = parseCleanInt(sisaPcs);
          if (pVal < 0) {
            currentPO['Over Kiriman (PCS)'] = Math.abs(pVal);
            currentPO['Sisa OS (pcs)'] = 0;
            currentPO['Terkirim (PCS)'] = (currentPO['QTY PO (pcs)'] || 0) + Math.abs(pVal);
          } else {
            currentPO['Over Kiriman (PCS)'] = 0;
            currentPO['Sisa OS (pcs)'] = pVal;
            currentPO['Terkirim (PCS)'] = Math.max(0, (currentPO['QTY PO (pcs)'] || 0) - pVal);
          }
          currentPO._has_delivery = true;
        }
        if (isNumericCell(sisaKg)) {
          const kVal = parseCleanInt(sisaKg);
          if (kVal < 0) {
            currentPO['Over Kiriman (KG)'] = Math.abs(kVal);
            currentPO['Sisa OS (kg)'] = 0;
            currentPO['Terkirim (KG)'] = (currentPO['Berat PO (KG)'] || 0) + Math.abs(kVal);
          } else {
            currentPO['Over Kiriman (KG)'] = 0;
            currentPO['Sisa OS (kg)'] = kVal;
            currentPO['Terkirim (KG)'] = Math.max(0, (currentPO['Berat PO (KG)'] || 0) - kVal);
          }
          currentPO._has_delivery = true;
        }
      }
    }
    // 4. TAHAP PENUTUP (FALLBACK & SAVING DATA)
    else if (isTotal || valA.startsWith('I t e m')) {
      if (currentPO) {
        rowsData.push(finalizeCurrentPO(currentPO));
        currentPO = null;
      }
    }
  }

  // Mengamankan baris terakhir yang mungkin menggantung saat file habis terbaca
  if (currentPO) {
    rowsData.push(finalizeCurrentPO(currentPO));
  }

  // 5. TAHAP ALOKASI STOK BERURUTAN (FIFO / TOP-TO-BOTTOM ACCUMULATION PER ARTIKEL)
  const allocated = recalculateFIFOStock(rowsData, 'ALL');

  return allocated.map((item, idx) => {
    const qtyPcs = item['QTY PO (pcs)'] || 0;
    const qtyKg = item['Berat PO (KG)'] || 0;
    const sisaPcs = Math.max(0, item['Sisa OS (pcs)'] || 0);
    const sisaKg = Math.max(0, item['Sisa OS (kg)'] || 0);
    const terkirimPcs = item['Terkirim (PCS)'] || 0;
    const terkirimKg = item['Terkirim (KG)'] || 0;

    const overStockPcs = item['Over Stock Gudang (PCS)'] || 0;
    const overStockKg = item['Over Stock Gudang (KG)'] || 0;
    const overKirimanPcs = item['Over Kiriman (PCS)'] !== undefined
      ? item['Over Kiriman (PCS)']!
      : Math.max(0, terkirimPcs - qtyPcs);
    const overKirimanKg = item['Over Kiriman (KG)'] !== undefined
      ? item['Over Kiriman (KG)']!
      : Math.max(0, terkirimKg - qtyKg);

    const cleaned: ExtractedRecord = {
      ...item,
      id: item.id || `po_rec_${idx + 1}`,
      'Sisa OS (pcs)': sisaPcs,
      'Sisa OS (kg)': sisaKg,
      'Over Stock Gudang (PCS)': overStockPcs,
      'Over Stock Gudang (KG)': overStockKg,
      'Over Kiriman (PCS)': overKirimanPcs,
      'Over Kiriman (KG)': overKirimanKg,
      'Over Produksi (PCS)': overStockPcs,
      'Over Produksi (KG)': overStockKg,
      'Terkirim (PCS)': terkirimPcs,
      'Terkirim (KG)': terkirimKg,
    };
    delete cleaned._has_delivery;
    return cleaned;
  });
}

/**
 * Flattens ExtractedRecord[] into FlattenedDeliveryRow[] for Mode Detail Kiriman (Per Surat Jalan).
 * Every PO with N deliveries produces N rows; a PO with 0 deliveries produces 1 fallback row with Sisa OS = QTY PO.
 */
export function flattenDeliveriesForDataEntry(
  records: ExtractedRecord[],
  scope: CoFilterStatus | DetailSJExportScope = 'ALL'
): FlattenedDeliveryRow[] {
  if (!records || records.length === 0) return [];

  const fifoScope: CoFilterStatus =
    scope === 'OPEN_ONLY' || scope === 'OPEN'
      ? 'OPEN'
      : scope === 'CLOSED_ONLY' || scope === 'CLOSED'
      ? 'CLOSED'
      : 'ALL';

  const scopedRecords = recalculateFIFOStock(records, fifoScope);

  const filteredPOs = scopedRecords.filter((po) => {
    if (scope === 'OPEN_ONLY' || scope === 'OPEN') return po.coStatus === 'OPEN';
    if (scope === 'CLOSED_ONLY' || scope === 'CLOSED') return po.coStatus === 'CLOSED';

    const realDeliveries = (po.deliveries || []).filter((d) => !d.isFallbackNoDelivery && d.noSJ !== '-');
    if (scope === 'WITH_DELIVERY_ONLY') {
      return realDeliveries.length > 0;
    }
    if (scope === 'MULTI_DELIVERY_ONLY') {
      return realDeliveries.length > 1;
    }
    if (scope === 'NO_DELIVERY_FALLBACK') {
      return realDeliveries.length === 0;
    }
    if (scope === 'HAS_SISA_OS') {
      return (po['Sisa OS (pcs)'] || 0) > 0 || (po['Sisa OS (kg)'] || 0) > 0;
    }
    return true;
  });

  const flatRows: FlattenedDeliveryRow[] = [];

  filteredPOs.forEach((po, poIdx) => {
    const qtyPoPcs = Number(po['QTY PO (pcs)']) || 0;
    const beratPoKg = Number(po['Berat PO (KG)']) || 0;
    const sisaAkhirPcs = Number(po['Sisa OS (pcs)']) || 0;
    const sisaAkhirKg = Number(po['Sisa OS (kg)']) || 0;
    const totalTerkirimPcs = Number(po['Terkirim (PCS)']) || 0;
    const totalTerkirimKg = Number(po['Terkirim (KG)']) || 0;
    const stockPcs = Number(po['Stock (pcs)']) || 0;
    const stockKg = Number(po['Stock (kg)']) || 0;
    const overStockPcs = Number(po['Over Stock Gudang (PCS)'] || po['Over Produksi (PCS)']) || 0;
    const overStockKg = Number(po['Over Stock Gudang (KG)'] || po['Over Produksi (KG)']) || 0;
    const overKirimanPcs = Number(po['Over Kiriman (PCS)']) || 0;
    const overKirimanKg = Number(po['Over Kiriman (KG)']) || 0;
    const harga = Number(po.Harga) || 0;
    const poRecordId = po.id || `po_${poIdx + 1}`;

    const rawDeliveries =
      po.deliveries && po.deliveries.length > 0
        ? po.deliveries
        : [
            {
              sequence: 0,
              noSJ: '-',
              tanggalKirim: '-',
              qtyKirimPcs: 0,
              beratKirimKg: 0,
              akumulasiKirimPcs: totalTerkirimPcs,
              akumulasiKirimKg: totalTerkirimKg,
              sisaOsBerjalanPcs: sisaAkhirPcs,
              sisaOsBerjalanKg: sisaAkhirKg,
              isFallbackNoDelivery: true,
            },
          ];

    const realDeliveriesForPO = rawDeliveries.filter(
      (d) => !d.isFallbackNoDelivery && d.noSJ !== '-'
    );
    const realSJCount = realDeliveriesForPO.length;

    // Calculate Lead Time per SJ & average Lead Time for this PO
    const validLeadTimes: number[] = [];
    realDeliveriesForPO.forEach((d) => {
      const lt = calculateLeadTimeDays(po['Tanggal Input PO'], d.tanggalKirim);
      if (lt !== null) validLeadTimes.push(lt);
    });
    const avgLeadTimePO =
      validLeadTimes.length > 0
        ? Math.round((validLeadTimes.reduce((a, b) => a + b, 0) / validLeadTimes.length) * 10) / 10
        : null;

    // Last SJ date for completion aging calculation
    const lastSjDateStr =
      realDeliveriesForPO.length > 0
        ? realDeliveriesForPO[realDeliveriesForPO.length - 1].tanggalKirim
        : null;

    const { umurHari, kategoriAging } = calculateOrderAgingDetails(
      po['Tanggal Input PO'],
      lastSjDateStr,
      sisaAkhirPcs,
      totalTerkirimPcs
    );

    const fulfillmentRate = qtyPoPcs > 0 ? totalTerkirimPcs / qtyPoPcs : 0;
    const statusPengiriman = getDeliveryStatusTag(qtyPoPcs, totalTerkirimPcs, sisaAkhirPcs);

    rawDeliveries.forEach((deliv, dIdx) => {
      const isFallback = Boolean(deliv.isFallbackNoDelivery || deliv.noSJ === '-');
      const isFirst = dIdx === 0;
      const isLast = dIdx === rawDeliveries.length - 1;
      const urutan = isFallback ? 0 : dIdx + 1;
      const labelKiriman = isFallback
        ? 'Belum Kirim'
        : `Kiriman Ke-${urutan} (dari ${realSJCount})`;

      const leadTimeSJ = isFallback
        ? null
        : calculateLeadTimeDays(po['Tanggal Input PO'], deliv.tanggalKirim);

      flatRows.push({
        id: `${poRecordId}_sj_${dIdx + 1}`,
        poRecordId,
        poIndex: poIdx + 1,
        CO: po.CO || '-',
        coStatus: po.coStatus || parseCoStatus(po.CO),
        Artikel: po.Artikel || '-',
        'Item Description': po['Item Description'] || '-',
        'Tanggal Input PO': po['Tanggal Input PO'] || '-',
        'No PO': po['No PO'] || '-',
        Substance: po.Substance || '-',
        'QTY PO (pcs)': qtyPoPcs,
        'Berat PO (KG)': beratPoKg,
        frekuensiKirim: realSJCount,
        urutanKirim: urutan,
        labelKiriman,
        'No Surat Jalan (SJ)': deliv.noSJ || '-',
        'Tanggal Kirim (SJ)': deliv.tanggalKirim || '-',
        'Lead Time SJ (Hari)': leadTimeSJ,
        'Rata-rata Lead Time PO (Hari)': avgLeadTimePO,
        'QTY Kirim SJ (pcs)': Number(deliv.qtyKirimPcs) || 0,
        'Berat Kirim SJ (KG)': Number(deliv.beratKirimKg) || 0,
        'Akumulasi Terkirim (pcs)': Number(deliv.akumulasiKirimPcs) || 0,
        'Akumulasi Terkirim (KG)': Number(deliv.akumulasiKirimKg) || 0,
        'Sisa OS Berjalan (pcs)': Number(deliv.sisaOsBerjalanPcs) ?? sisaAkhirPcs,
        'Sisa OS Berjalan (KG)': Number(deliv.sisaOsBerjalanKg) ?? sisaAkhirKg,
        'Total Terkirim PO (pcs)': totalTerkirimPcs,
        'Total Terkirim PO (KG)': totalTerkirimKg,
        'Sisa OS Akhir PO (pcs)': sisaAkhirPcs,
        'Sisa OS Akhir PO (KG)': sisaAkhirKg,
        '% Pemenuhan PO': fulfillmentRate,
        'Status Pengiriman': statusPengiriman,
        'Umur PO / Aging (Hari)': umurHari,
        'Kategori Aging OS': kategoriAging,
        'Stock (pcs)': stockPcs,
        'Stock (kg)': stockKg,
        'Over Stock Gudang (PCS)': overStockPcs,
        'Over Stock Gudang (KG)': overStockKg,
        'Over Kiriman (PCS)': overKirimanPcs,
        'Over Kiriman (KG)': overKirimanKg,
        Harga: harga,
        isFirstRowOfPO: isFirst,
        isLastRowOfPO: isLast,
        isFallbackNoDelivery: isFallback,
      });
    });
  });

  return flatRows;
}

/**
 * Flattens ExtractedRecord[] into SalesOrderRow[] matching the 13-column Sales Order format requested:
 * Col A: NO PO
 * Col B: Date Receive PO (empty)
 * Col C: Substance (pure substance without flute)
 * Col D: Flute (BC, C, B, E)
 * Col E: Size P
 * Col F: Size L
 * Col G: Artikel
 * Col H: Item Name
 * Col I: Qty (Pcs) - PO Qty
 * Col J: Qty (Kg) - PO Weight
 * Col K: Delivery Date - Rencana jadwal kirim
 * Col L: Qty Delivery - Rencana qty kirim (PCS)
 * Col M: Kg Delivery - Rencana berat kirim (KG)
 * Col N: Remarks (empty)
 * Col O: Actual Delivery Date - Realisasi tanggal kirim Surat Jalan
 * Col P: No SJ (terfallback kebawahnya) - Nomor Surat Jalan
 * Col Q: Qty Delivery - Realisasi qty kirim SJ (PCS)
 * Col R: Kg Delivery - Realisasi berat kirim SJ (KG)
 *
 * If a PO has multiple delivery schedules or multiple Surat Jalan, row 1 contains PO info, schedule 1, and SJ 1,
 * and subsequent schedules / SJs are placed on row 2+ directly beneath it with columns A..J left blank (terfallback kebawahnya).
 */
export function flattenSalesOrderRows(
  records: ExtractedRecord[],
  scope: CoFilterStatus | SalesOrderExportScope = 'ALL'
): SalesOrderRow[] {
  if (!records || records.length === 0) return [];

  const filteredPOs = records.filter((po) => {
    if (scope === 'OPEN_ONLY' || scope === 'OPEN') return po.coStatus === 'OPEN';
    if (scope === 'CLOSED_ONLY' || scope === 'CLOSED') return po.coStatus === 'CLOSED';
    return true;
  });

  const flatRows: SalesOrderRow[] = [];

  filteredPOs.forEach((po, poIdx) => {
    const qtyPoPcs = Number(po['QTY PO (pcs)']) || 0;
    const beratPoKg = Number(po['Berat PO (KG)']) || 0;

    // Resolve pure substance and flute
    const parsedSub = parseSubstanceAndFlute(po.PureSubstance || po.Substance);
    const pureSubstance = po.PureSubstance || parsedSub.substance || '-';
    const flute = po.Flute && po.Flute !== '-' ? po.Flute : parsedSub.flute;

    // Resolve dimensions P & L
    const dims = parseDimensions(po.RawSize, po['Item Description']);
    const sizeP = po.SizeP !== undefined && po.SizeP !== '-' ? po.SizeP : dims.p;
    const sizeL = po.SizeL !== undefined && po.SizeL !== '-' ? po.SizeL : dims.l;

    // Resolve schedules (Rencana Jadwal Kirim)
    const rawSchedules =
      po.schedules && po.schedules.length > 0
        ? po.schedules
        : [
            {
              sequence: 1,
              scheduleDate: po.scheduleDate || '-',
              scheduleQty: po.scheduleQty || qtyPoPcs,
            },
          ];

    // Resolve actual deliveries (Surat Jalan riil)
    const realDeliveries = (po.deliveries || []).filter(
      (d) => !d.isFallbackNoDelivery && d.noSJ && d.noSJ !== '-'
    );

    const cleanNoPO = po['No PO'] || '-';
    const poRecId = po.id || `po_rec_${poIdx + 1}`;

    // A PO spans enough rows to accommodate either multiple schedules or multiple SJs (fallback kebawahnya)
    const maxRows = Math.max(rawSchedules.length, realDeliveries.length, 1);

    for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
      const isFirst = rowIdx === 0;

      // 1. Planned Delivery Schedule info
      let deliveryDate = '';
      let qtyDelivery: number | '' = '';
      let kgDelivery: number | '' = '';

      if (rowIdx < rawSchedules.length) {
        const sched = rawSchedules[rowIdx];
        deliveryDate = sched.scheduleDate || '-';
        const sQty = sched.scheduleQty > 0 ? sched.scheduleQty : isFirst ? qtyPoPcs : 0;
        qtyDelivery = sQty;
        if (typeof sQty === 'number' && sQty > 0 && qtyPoPcs > 0 && beratPoKg > 0) {
          kgDelivery = Math.round((sQty / qtyPoPcs) * beratPoKg);
        } else if (sQty === 0) {
          kgDelivery = 0;
        } else {
          kgDelivery = isFirst ? beratPoKg : 0;
        }
      }

      // 2. Actual Delivery (Surat Jalan) info - terfallback kebawahnya
      let actualDeliveryDate = '';
      let noSJ = '';
      let actualQtyDelivery: number | '' = '';
      let actualKgDelivery: number | '' = '';

      if (realDeliveries.length > 0) {
        if (rowIdx < realDeliveries.length) {
          const sj = realDeliveries[rowIdx];
          actualDeliveryDate = sj.tanggalKirim || '-';
          noSJ = sj.noSJ || '-';
          actualQtyDelivery = sj.qtyKirimPcs;
          actualKgDelivery = sj.beratKirimKg;
        }
      } else {
        // No delivery recorded for this PO (belum kirim)
        if (isFirst) {
          actualDeliveryDate = '-';
          noSJ = '-';
          actualQtyDelivery = '';
          actualKgDelivery = '';
        }
      }

      flatRows.push({
        id: `${poRecId}_row_${rowIdx + 1}`,
        poRecordId: poRecId,
        coNumber: po.CO || '-',
        coStatus: po.coStatus || 'UNKNOWN',
        noPO: isFirst ? cleanNoPO : '',
        dateReceivePO: '',
        substance: isFirst ? pureSubstance : '',
        flute: isFirst ? flute : '',
        sizeP: isFirst ? sizeP : '',
        sizeL: isFirst ? sizeL : '',
        artikel: isFirst ? po.Artikel || '-' : '',
        itemName: isFirst ? po['Item Description'] || '-' : '',
        qtyPcs: isFirst ? qtyPoPcs : '',
        qtyKg: isFirst ? beratPoKg : '',
        deliveryDate,
        qtyDelivery,
        kgDelivery,
        remarks: '',
        actualDeliveryDate,
        noSJ,
        actualQtyDelivery,
        actualKgDelivery,
        isFirstScheduleOfPO: isFirst,
        scheduleSequence: rowIdx + 1,
        totalSchedulesCount: maxRows,
      });
    }
  });

  return flatRows;
}

/**
 * Recalculates FIFO stock allocation for records dynamically based on the active CO scope
 */
export function recalculateFIFOStock(
  records: ExtractedRecord[],
  coScope: CoFilterStatus | ExcelExportScope = 'ALL'
): ExtractedRecord[] {
  if (!records || records.length === 0) return [];

  const targetScope =
    coScope === 'OPEN_ONLY' || coScope === 'OPEN' || coScope === 'STOCK_READY_OPEN'
      ? 'OPEN'
      : coScope === 'CLOSED_ONLY' || coScope === 'CLOSED' || coScope === 'STOCK_READY_CLOSED'
      ? 'CLOSED'
      : 'ALL';

  // Clone records to avoid mutating original objects
  const cloned: ExtractedRecord[] = records.map((r) => ({
    ...r,
    'Stock (pcs)': 0,
    'Stock (kg)': 0,
    'Over Stock Gudang (PCS)': 0,
    'Over Stock Gudang (KG)': 0,
    'Over Produksi (PCS)': 0,
    'Over Produksi (KG)': 0,
  }));

  // Kelompokkan item berdasarkan parent header (_parentIndex)
  const parentGroups = new Map<number, ExtractedRecord[]>();
  for (const item of cloned) {
    const pIdx = item._parentIndex ?? 0;
    if (!parentGroups.has(pIdx)) {
      parentGroups.set(pIdx, []);
    }
    parentGroups.get(pIdx)!.push(item);
  }

  // Alokasi berurutan dari atas ke bawah per parent
  for (const [, group] of parentGroups) {
    if (group.length === 0) continue;
    let remPcs = group[0]._parentStockPcs || 0;
    let remKg = group[0]._parentStockKg || 0;
    let lastOpenItem: ExtractedRecord | null = null;
    let lastEligibleItem: ExtractedRecord | null = null;

    for (const item of group) {
      if (item.coStatus === 'OPEN') {
        lastOpenItem = item;
      }

      if (targetScope === 'OPEN' && item.coStatus !== 'OPEN') {
        continue;
      }
      if (targetScope === 'CLOSED' && item.coStatus !== 'CLOSED') {
        continue;
      }

      lastEligibleItem = item;
      const sisaPcs = Math.max(0, item['Sisa OS (pcs)'] || 0);
      const sisaKg = Math.max(0, item['Sisa OS (kg)'] || 0);

      // Kondisional: Sisa OS under 51 pcs (< 51 pcs) TIDAK diikutkan ke alokasi FIFO stock (dianggap 0)
      if (sisaPcs < 51) {
        continue;
      }

      // Alokasi Stock (PCS):
      const allocPcs = Math.max(0, Math.min(remPcs, sisaPcs));
      item['Stock (pcs)'] = allocPcs;
      remPcs = Math.max(0, remPcs - allocPcs);

      // Alokasi Stock (KG):
      const allocKg = Math.max(0, Math.min(remKg, sisaKg));
      item['Stock (kg)'] = allocKg;
      remKg = Math.max(0, remKg - allocKg);
    }

    // Over Stock Gudang (Physical Surplus) allocation:
    if (remPcs > 0 || remKg > 0) {
      const targetItem = lastOpenItem || lastEligibleItem || group[group.length - 1];
      targetItem['Over Stock Gudang (PCS)'] = (targetItem['Over Stock Gudang (PCS)'] || 0) + remPcs;
      targetItem['Over Stock Gudang (KG)'] = (targetItem['Over Stock Gudang (KG)'] || 0) + remKg;
      targetItem['Over Produksi (PCS)'] = (targetItem['Over Produksi (PCS)'] || 0) + remPcs;
      targetItem['Over Produksi (KG)'] = (targetItem['Over Produksi (KG)'] || 0) + remKg;
    }
  }

  return cloned;
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

  // Compute summary metrics (distinguishing Total Baris PO-Item vs Total Nomor PO Unik)
  const uniqueItems = new Set(finalData.map((d) => d.Artikel)).size;
  const poCountMap = new Map<string, number>();
  for (const d of finalData) {
    const cleanNoPO = String(d['No PO'] || '').trim();
    if (cleanNoPO && cleanNoPO !== '-') {
      poCountMap.set(cleanNoPO, (poCountMap.get(cleanNoPO) || 0) + 1);
    }
  }
  const totalUniquePONumbers = poCountMap.size > 0 ? poCountMap.size : finalData.length;
  let totalMultiItemPONumbers = 0;
  for (const [, count] of poCountMap) {
    if (count > 1) totalMultiItemPONumbers++;
  }

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

  const totalOverStockGudangPcs = finalData.reduce((sum, d) => sum + (d['Over Stock Gudang (PCS)'] || 0), 0);
  const totalOverStockGudangKg = finalData.reduce((sum, d) => sum + (d['Over Stock Gudang (KG)'] || 0), 0);
  const totalOverStockGudangPOs = finalData.filter((d) => (d['Over Stock Gudang (PCS)'] || 0) > 0 || (d['Over Stock Gudang (KG)'] || 0) > 0).length;

  const totalOverKirimanPcs = finalData.reduce((sum, d) => sum + (d['Over Kiriman (PCS)'] || 0), 0);
  const totalOverKirimanKg = finalData.reduce((sum, d) => sum + (d['Over Kiriman (KG)'] || 0), 0);
  const totalOverKirimanPOs = finalData.filter((d) => (d['Over Kiriman (PCS)'] || 0) > 0 || (d['Over Kiriman (KG)'] || 0) > 0).length;

  // Delivery SJ summary metrics
  let totalDeliveriesCount = 0;
  let totalPOsWithMultiDelivery = 0;
  let totalPOsWithoutDelivery = 0;

  for (const d of finalData) {
    const realSJs = (d.deliveries || []).filter((sj) => !sj.isFallbackNoDelivery && sj.noSJ !== '-');
    totalDeliveriesCount += realSJs.length;
    if (realSJs.length > 1) totalPOsWithMultiDelivery++;
    if (realSJs.length === 0) totalPOsWithoutDelivery++;
  }

  const totalValue = finalData.reduce((sum, d) => sum + (d['Sisa OS (pcs)'] || 0) * (d.Harga || 0), 0);

  const itemsWithDelivery = finalData.filter((d) => d['Sisa OS (pcs)'] < d['QTY PO (pcs)']).length;
  const itemsWithoutDelivery = finalData.length - itemsWithDelivery;

  const fileSizeStr = buffer.byteLength > 1024 * 1024
    ? `${(buffer.byteLength / (1024 * 1024)).toFixed(2)} MB`
    : `${(buffer.byteLength / 1024).toFixed(1)} KB`;

  const summary: ParseSummary = {
    totalPOs: finalData.length,
    totalUniquePONumbers,
    totalMultiItemPONumbers,
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
    totalOverStockGudangPcs,
    totalOverStockGudangKg,
    totalOverStockGudangPOs,
    totalOverKirimanPcs,
    totalOverKirimanKg,
    totalOverKirimanPOs,
    totalOverProduksiPcs: totalOverStockGudangPcs,
    totalOverProduksiKg: totalOverStockGudangKg,
    totalOverProduksiPOs: totalOverStockGudangPOs,
    totalDeliveriesCount,
    totalPOsWithMultiDelivery,
    totalPOsWithoutDelivery,
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

