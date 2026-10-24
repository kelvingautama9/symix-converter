// Utility for Purchase Order Aging Analysis (Analisis Umur PO)
export type AgingCategory = 'SAFE' | 'FOLLOW_UP' | 'CRITICAL' | 'UNKNOWN';

export interface AgingInfo {
  days: number;
  category: AgingCategory;
  label: string;
  shortLabel: string;
  badgeClass: string;
  dotClass: string;
  textClass: string;
}

/**
 * Parses diverse date formats into a standard Date object
 * Handles DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD, DD/MM/YY
 */
export function parsePoDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === '-' || trimmed === 'UNKNOWN') return null;

  // Pattern: YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(trimmed)) {
    const parts = trimmed.split(/[-/.]/);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Pattern: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(trimmed)) {
    const parts = trimmed.split(/[-/.]/);
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (year < 100) {
      year += 2000;
    }
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback native parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

/**
 * Calculates PO Aging based on Tanggal Input PO
 * Rule:
 *  - < 7 Hari: Aman / Baru (SAFE)
 *  - 8 – 14 Hari: Perlu Follow UP (FOLLOW_UP)
 *  - > 14 Hari / > 30 Hari: Kritis / Telat (CRITICAL)
 */
export function calculatePoAging(
  dateStr: string | null | undefined,
  refDate: Date = new Date()
): AgingInfo {
  const target = parsePoDate(dateStr);
  if (!target) {
    return {
      days: -1,
      category: 'UNKNOWN',
      label: 'Format tanggal tidak valid',
      shortLabel: '-',
      badgeClass: 'bg-zinc-100/80 text-zinc-500 border-zinc-200/60',
      dotClass: 'bg-zinc-400',
      textClass: 'text-zinc-500',
    };
  }

  // Compare dates normalized to midnight UTC to prevent time zone drift
  const refUtc = Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const diffMs = refUtc - targetUtc;
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (days <= 7) {
    return {
      days,
      category: 'SAFE',
      label: '< 7 Hari (Aman / Baru)',
      shortLabel: `${days}h Aman`,
      badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25',
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-700',
    };
  }

  if (days <= 14) {
    return {
      days,
      category: 'FOLLOW_UP',
      label: '8 – 14 Hari (Perlu Follow UP)',
      shortLabel: `${days}h Follow Up`,
      badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/25',
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-700',
    };
  }

  return {
    days,
    category: 'CRITICAL',
    label: days > 30 ? `> 30 Hari (${days} hari - Kritis)` : `> 14 Hari (${days} hari - Telat)`,
    shortLabel: `${days}h Kritis`,
    badgeClass: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-700',
  };
}

export type DeliveryStatusTag =
  | 'OVER DELIVERY'
  | 'COMPLETED / LUNAS'
  | 'PARTIAL / CICIL'
  | 'UNTOUCHED / BELUM KIRIM';

/**
 * Determines the standardized Master Data Delivery Status Tag for a PO-Item
 */
export function getDeliveryStatusTag(
  qtyPoPcs: number,
  totalTerkirimPcs: number,
  sisaAkhirPcs: number
): DeliveryStatusTag {
  const po = Number(qtyPoPcs) || 0;
  const sent = Number(totalTerkirimPcs) || 0;
  const rem = Number(sisaAkhirPcs) || 0;

  if (sent <= 0) {
    return 'UNTOUCHED / BELUM KIRIM';
  }
  if (po > 0 && sent > po) {
    return 'OVER DELIVERY';
  }
  if (rem <= 0) {
    return 'COMPLETED / LUNAS';
  }
  return 'PARTIAL / CICIL';
}

/**
 * Calculates Lead Time in calendar days between Tanggal Input PO and Tanggal Kirim (SJ)
 */
export function calculateLeadTimeDays(
  poDateStr: string | null | undefined,
  sjDateStr: string | null | undefined
): number | null {
  const poDate = parsePoDate(poDateStr);
  const sjDate = parsePoDate(sjDateStr);
  if (!poDate || !sjDate) return null;

  const poUtc = Date.UTC(poDate.getFullYear(), poDate.getMonth(), poDate.getDate());
  const sjUtc = Date.UTC(sjDate.getFullYear(), sjDate.getMonth(), sjDate.getDate());
  const diffDays = Math.round((sjUtc - poUtc) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Calculates Order Aging (Umur PO) & Aging Category for Master Data reporting:
 * - If COMPLETED / LUNAS (Sisa OS = 0 and Terkirim > 0): returns total days to complete (PO -> last SJ) and category "LUNAS (0 OS)"
 * - If still has Sisa OS (> 0) or UNTOUCHED: returns days elapsed since Tanggal Input PO and aging tier
 */
export function calculateOrderAgingDetails(
  poDateStr: string | null | undefined,
  lastSjDateStr: string | null | undefined,
  sisaAkhirPcs: number,
  totalTerkirimPcs: number,
  refDate: Date = new Date()
): { umurHari: number | null; kategoriAging: string } {
  const poDate = parsePoDate(poDateStr);
  if (!poDate) {
    return {
      umurHari: null,
      kategoriAging: sisaAkhirPcs <= 0 && totalTerkirimPcs > 0 ? 'LUNAS (0 OS)' : '-',
    };
  }

  const poUtc = Date.UTC(poDate.getFullYear(), poDate.getMonth(), poDate.getDate());

  // If PO is already fully delivered (Lunas OS)
  if (sisaAkhirPcs <= 0 && totalTerkirimPcs > 0) {
    const lastSjDate = parsePoDate(lastSjDateStr);
    if (lastSjDate) {
      const sjUtc = Date.UTC(
        lastSjDate.getFullYear(),
        lastSjDate.getMonth(),
        lastSjDate.getDate()
      );
      const completionDays = Math.max(0, Math.round((sjUtc - poUtc) / (1000 * 60 * 60 * 24)));
      return {
        umurHari: completionDays,
        kategoriAging: 'LUNAS (0 OS)',
      };
    }
    return {
      umurHari: 0,
      kategoriAging: 'LUNAS (0 OS)',
    };
  }

  // Otherwise PO still has outstanding Sisa OS
  const refUtc = Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const days = Math.max(0, Math.floor((refUtc - poUtc) / (1000 * 60 * 60 * 24)));

  if (days <= 7) {
    return { umurHari: days, kategoriAging: 'AMAN (<= 7 Hari)' };
  }
  if (days <= 14) {
    return { umurHari: days, kategoriAging: 'FOLLOW UP (8-14 Hari)' };
  }
  return { umurHari: days, kategoriAging: 'KRITIS (> 14 Hari)' };
}

