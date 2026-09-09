import { ExtractedRecord, WhatsAppReportScope } from '../types';
import { recalculateFIFOStock } from './parserEngine';

/**
 * Extracts short CO number, e.g.:
 * - "17H8420 1 O" -> "8420"
 * - "18H8729 1 O" -> "8729"
 * - "18H6941 5 C" -> "6941"
 */
export function formatCOShort(co: string): string {
  if (!co) return '-';
  const clean = co.trim();

  // Pattern: Letter(s) followed by digits, e.g. 17H8420, H8420 -> extract 8420
  const matchH = clean.match(/[A-Za-z]+(\d+)/);
  if (matchH && matchH[1]) {
    return matchH[1];
  }

  // If no letter, take first token before space
  const firstToken = clean.split(/\s+/)[0];
  const digits = firstToken.replace(/\D/g, '');
  if (digits.length >= 3) {
    // If e.g. 6-digit number like 178420, last 4 digits are usually the order number
    return digits.length > 4 ? digits.slice(-4) : digits;
  }

  return firstToken || clean;
}

/**
 * Extracts short article number with "Art" prefix and leading zeroes stripped, e.g.:
 * - "SH-D009-00607-A" -> "Art 607"
 * - "SH-D009-00253-A" -> "Art 253"
 * - "ST-D001-00045-B" -> "Art 45"
 */
export function formatArtikelShort(artikel: string): string {
  if (!artikel) return 'Art -';
  const clean = artikel.trim();

  // Split into segments by dash, slash, or underscore
  const segments = clean.split(/[-_/]/);

  // Search from right to left for a segment of digits (e.g. "00607")
  let numCandidate = '';
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].trim();
    if (/^\d+$/.test(seg)) {
      numCandidate = seg;
      break;
    }
  }

  // If not found, match any sequence of 2+ digits
  if (!numCandidate) {
    const match = clean.match(/(\d{2,})/);
    if (match) {
      numCandidate = match[1];
    }
  }

  if (numCandidate) {
    // Strip leading zeroes, keep at least one '0' if all zero
    const stripped = numCandidate.replace(/^0+/, '') || '0';
    return `Art ${stripped}`;
  }

  if (/^art/i.test(clean)) {
    return clean;
  }

  return `Art ${clean}`;
}

/**
 * Extracts normalized ukuran / dimension from item description, e.g.:
 * - "SHEET 1157X529 MM (96:337:96)" -> "1157X529"
 * - "SHEET 1219X600 MM" -> "1219X600"
 * - "SHEET 1157 x 529 MM" -> "1157X529"
 * - "BOX 500X300X200 MM" -> "500X300X200"
 */
export function formatUkuran(desc: string): string {
  if (!desc) return '-';
  const clean = desc.trim();

  // Matches dimensions like 1157X529, 1157x529, 1157*529, 500X300X200
  const dimMatch = clean.match(/(\d+\s*[xX*]\s*\d+(?:\s*[xX*]\s*\d+)?)/);
  if (dimMatch) {
    return dimMatch[1].replace(/\s*[xX*]\s*/g, 'X').toUpperCase();
  }

  // Fallback: strip common prefixes and suffixes
  const cleaned = clean
    .replace(/^(SHEET|BOX|CARTON|KARTON|INNER|OUTER)\s+/i, '')
    .replace(/\s+MM.*$/i, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  return cleaned || clean;
}

/**
 * Formats ton and kg summary string, e.g.:
 * - 567 kg -> "total = 0.5 ton (567kg)"
 * - 1250 kg -> "total = 1.2 ton (1.250kg)"
 */
export function formatTonAndKg(totalKg: number): string {
  const roundedKg = Math.round(totalKg);
  const tonVal = totalKg / 1000;
  let tonStr = '';
  if (tonVal <= 0) {
    tonStr = '0';
  } else if (tonVal < 0.1) {
    tonStr = tonVal.toFixed(2);
  } else {
    // Indonesian manufacturing floor convention: 567 kg is 0.5 ton (truncated to 1 decimal place)
    const truncated = Math.floor(tonVal * 10) / 10;
    tonStr = truncated.toFixed(1);
  }
  return `total = ${tonStr} ton (${roundedKg.toLocaleString('id-ID')}kg)`;
}

/**
 * Generates clean, WhatsApp-native report text strictly matching the user's template:
 *
 * *Update Stock :*
 * > (8420)-(Art 607) 1157X529 = 1000 (567kg)
 *
 * total = 0.5 ton (567kg)
 */
export function generateWhatsAppSummary(
  data: ExtractedRecord[],
  scope: WhatsAppReportScope = 'ALL'
): string {
  if (!data || data.length === 0) {
    return '*Update Stock :*\nTidak ada data untuk ditampilkan.';
  }

  // Recalculate FIFO stock strictly according to the scope target
  const fifoTargetScope =
    scope === 'OPEN_ONLY' || scope === 'STOCK_READY_OPEN'
      ? 'OPEN'
      : scope === 'CLOSED_ONLY' || scope === 'STOCK_READY_CLOSED'
      ? 'CLOSED'
      : 'ALL';

  const scopedData = recalculateFIFOStock(data, fifoTargetScope);

  const isStockReadyScope =
    scope === 'STOCK_READY_ALL' ||
    scope === 'STOCK_READY_OPEN' ||
    scope === 'STOCK_READY_CLOSED' ||
    scope === 'ALL';

  let filtered: ExtractedRecord[] = [];
  let headerTitle = '*Update Stock :*';

  if (scope === 'STOCK_READY_ALL') {
    filtered = scopedData.filter((d) => (d['Stock (pcs)'] || 0) > 0);
    headerTitle = '*Update Stock :*';
  } else if (scope === 'STOCK_READY_OPEN') {
    filtered = scopedData.filter((d) => d.coStatus === 'OPEN' && (d['Stock (pcs)'] || 0) > 0);
    headerTitle = '*Update Stock :*';
  } else if (scope === 'STOCK_READY_CLOSED') {
    filtered = scopedData.filter((d) => d.coStatus === 'CLOSED' && (d['Stock (pcs)'] || 0) > 0);
    headerTitle = '*Update Stock :*';
  } else if (scope === 'OPEN_ONLY') {
    // Sisa OS Open
    filtered = scopedData.filter((d) => d.coStatus === 'OPEN' && (d['Sisa OS (pcs)'] || 0) > 0);
    headerTitle = '*Update Sisa OS :*';
  } else if (scope === 'CLOSED_ONLY') {
    filtered = scopedData.filter((d) => d.coStatus === 'CLOSED' && (d['Sisa OS (pcs)'] || 0) > 0);
    headerTitle = '*Update Sisa OS :*';
  } else {
    // Default 'ALL': if stock ready items exist, prioritize clean Stock Ready report
    const stockItems = scopedData.filter((d) => (d['Stock (pcs)'] || 0) > 0);
    if (stockItems.length > 0) {
      filtered = stockItems;
      headerTitle = '*Update Stock :*';
    } else {
      filtered = scopedData.filter((d) => (d['Sisa OS (pcs)'] || 0) > 0);
      headerTitle = '*Update Sisa OS :*';
    }
  }

  if (filtered.length === 0) {
    return `${headerTitle}\nTidak ada item pada kategori ini.`;
  }

  const lines: string[] = [headerTitle];
  let totalKg = 0;

  filtered.forEach((item) => {
    const coShort = formatCOShort(item.CO || '');
    const artShort = formatArtikelShort(item.Artikel || '');
    const ukuran = formatUkuran(item['Item Description'] || '');

    if (isStockReadyScope || headerTitle.includes('Stock')) {
      const stockPcs = Math.round(item['Stock (pcs)'] || 0);
      let stockKg = Math.round(item['Stock (kg)'] || 0);

      // Fallback weight calculation if stockKg was 0 but weight/qty exists
      if (stockKg === 0 && stockPcs > 0 && (item['QTY PO (pcs)'] || 0) > 0 && (item['Berat PO (KG)'] || 0) > 0) {
        stockKg = Math.round((stockPcs / item['QTY PO (pcs)']) * item['Berat PO (KG)']);
      }

      totalKg += stockKg;
      // Format: > (8420)-(Art 607) 1157X529 = 1000 (567kg)
      lines.push(`> (${coShort})-(${artShort}) ${ukuran} = ${stockPcs} (${stockKg}kg)`);
    } else {
      // Sisa OS format: > (8420)-(Art 607) 1157X529 = 1000 (567kg)
      const sisaPcs = Math.round(item['Sisa OS (pcs)'] || 0);
      let sisaKg = Math.round(item['Sisa OS (kg)'] || item['Berat Sisa OS (kg)'] || 0);
      if (sisaKg === 0 && sisaPcs > 0 && (item['QTY PO (pcs)'] || 0) > 0 && (item['Berat PO (KG)'] || 0) > 0) {
        sisaKg = Math.round((sisaPcs / item['QTY PO (pcs)']) * item['Berat PO (KG)']);
      }
      totalKg += sisaKg;
      lines.push(`> (${coShort})-(${artShort}) ${ukuran} = ${sisaPcs} (${sisaKg}kg)`);
    }
  });

  // Empty line before total summary
  lines.push('');
  lines.push(formatTonAndKg(totalKg));

  return lines.join('\n');
}

/**
 * Copies text safely to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('navigator.clipboard failed, attempting fallback...', err);
  }

  // Fallback using temporary textarea
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Copy fallback failed:', err);
    return false;
  }
}

/**
 * Opens WhatsApp Web/App with the prefilled message containing scoped records
 */
export function shareToWhatsApp(
  data: ExtractedRecord[],
  scope: WhatsAppReportScope = 'ALL'
): void {
  const summaryText = generateWhatsAppSummary(data, scope);
  const encodedText = encodeURIComponent(summaryText);
  const waUrl = `https://wa.me/?text=${encodedText}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
}

export { shareExcelFileToWhatsApp, type ShareExcelResult } from './excelExporter';
