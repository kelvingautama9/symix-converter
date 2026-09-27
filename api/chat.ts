import { GoogleGenAI, ThinkingLevel } from '@google/genai';

/**
 * Self-contained Date & PO Aging helper to ensure 100% compatibility with
 * Vercel Serverless Functions without cross-folder module resolution issues.
 */
function parsePoDate(dateStr: string | null | undefined): Date | null {
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

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

function calculatePoAging(dateStr: string | null | undefined, refDate: Date = new Date()) {
  const target = parsePoDate(dateStr);
  if (!target) {
    return { days: -1, category: 'UNKNOWN', shortLabel: '-' };
  }
  const refUtc = Date.UTC(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const diffMs = refUtc - targetUtc;
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (days <= 7) return { days, category: 'SAFE', shortLabel: `${days}h Aman` };
  if (days <= 14) return { days, category: 'FOLLOW_UP', shortLabel: `${days}h Follow Up` };
  return { days, category: 'CRITICAL', shortLabel: `${days}h Kritis` };
}

// In-memory cooldown & healthy model tracker:
// If a model hits 429 (quota exhausted) or 503 (high demand), it gets a longer cooldown (e.g. 5-10 minutes).
// While in cooldown, requests SKIP that model immediately (0ms delay) and directly use healthy models.
// As soon as the cooldown window expires, the model is tested again automatically!
const modelCooldownUntil = new Map<string, number>();
let lastSuccessfulModel: string = 'gemini-3.6-flash';

function markModelCooldown(modelName: string, errorString: string) {
  // Optimal cooldown durations:
  // 429 Resource Exhausted / Quota Limit: 10 minutes (prevents spamming Google when rate limit is reached)
  // 503 Server High Demand / Spike: 3 minutes (allows Google server queue to clear)
  // Timeout: 2 minutes
  let cooldownDurationMs = 5 * 60 * 1000; // default 5 minutes

  if (errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED')) {
    // Check if error contains explicit retry suggestion
    const match = errorString.match(/retry in\s+([0-9.]+)\s*s/i) || errorString.match(/retryDelay"?:\s*"(\d+)s"/i);
    if (match && match[1]) {
      const sec = parseFloat(match[1]);
      cooldownDurationMs = Math.max(60, Math.ceil(sec) + 30) * 1000;
    } else {
      cooldownDurationMs = 10 * 60 * 1000; // 10 minutes for 429
    }
  } else if (errorString.includes('503') || errorString.includes('high demand') || errorString.includes('UNAVAILABLE')) {
    cooldownDurationMs = 3 * 60 * 1000; // 3 minutes for 503 traffic spike
  } else if (errorString.includes('Timeout')) {
    cooldownDurationMs = 2 * 60 * 1000; // 2 minutes for Timeout
  } else if (errorString.includes('404') || errorString.includes('NOT_FOUND') || errorString.includes('no longer available')) {
    cooldownDurationMs = 24 * 60 * 60 * 1000; // 24 hours for deprecated
  }

  modelCooldownUntil.set(modelName, Date.now() + cooldownDurationMs);
  console.log(`[AI Speed-Up] Model ${modelName} diistirahatkan selama ${Math.round(cooldownDurationMs / 1000)}s.`);
}

function isModelInCooldown(modelName: string): boolean {
  const expiry = modelCooldownUntil.get(modelName);
  if (!expiry) return false;
  if (Date.now() >= expiry) {
    modelCooldownUntil.delete(modelName);
    return false; // Cooldown expired, ready to be used again!
  }
  return true;
}

/**
 * Vercel Serverless Function & Express Route Handler
 * Endpoint: POST /api/chat
 * Supports both Streaming SSE (stream: true) and standard JSON response.
 */
export default async function handler(req: any, res: any) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-gemini-api-key'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Gunakan method POST.' });
  }

  const isStreamRequest = req.body?.stream !== false; // Default to streaming SSE for fastest TTFT

  try {
    const { message, history = [], dataContext, currentFileName, language = 'id' } = req.body || {};

    const langNameMap: Record<string, string> = {
      id: 'Bahasa Indonesia',
      en: 'English',
      th: 'ภาษาไทย (Thai)',
      zh: '中文 (Chinese / Mandarin)',
      ja: '日本語 (Japanese)',
    };
    const targetLanguageName = langNameMap[language] || 'Bahasa Indonesia';

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message tidak boleh kosong.' });
    }

    const apiKey = (req.headers['x-gemini-api-key'] as string) || process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(401).json({
        error: 'GEMINI_API_KEY_NOT_CONFIGURED',
        message:
          'GEMINI_API_KEY belum dipasang. Silakan tambahkan GEMINI_API_KEY pada Vercel Settings > Environment Variables, atau masukkan API Key di menu pengaturan Chatbot.',
      });
    }

    // Initialize GoogleGenAI client
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Build context summary for the prompt
    let datasetContextText = 'Belum ada data file Excel yang diunggah oleh pengguna.';
    if (dataContext && Array.isArray(dataContext.records) && dataContext.records.length > 0) {
      const records = dataContext.records;
      const summary = dataContext.summary || {};

      // -------------------------------------------------------------
      // 1. LEAN CLEANERS (Pembersihan Karakter Sampah & Redudansi)
      // -------------------------------------------------------------
      const cleanNum = (val: any): number => {
        if (val === undefined || val === null || val === '') return 0;
        const num = typeof val === 'number' ? val : Number(val);
        if (isNaN(num)) return 0;
        return num % 1 === 0 ? num : Number(num.toFixed(2));
      };

      const cleanStr = (val: any): string => {
        if (!val || typeof val !== 'string') return '-';
        const cleaned = val.replace(/[\r\n\t|]/g, ' ').replace(/\s+/g, ' ').trim();
        return cleaned || '-';
      };

      const cleanDate = (val: any): string => {
        if (!val || typeof val !== 'string') return '-';
        const trimmed = val.trim();
        const match = trimmed.match(/^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
        if (match) return match[1];
        return trimmed || '-';
      };

      // -------------------------------------------------------------
      // 2. DATA INTERPRETER ENGINE (Pre-Computed Aggregation Index)
      //    100% Deterministic Ground Truth - 0% Calculation Hallucination
      // -------------------------------------------------------------
      // A. GRAND TOTAL SELURUH BARIS FILE ERP (Sesuai Dashboard & Excel)
      let grandTotalStockPcs = 0;
      let grandTotalStockKg = 0;
      let grandTotalQtyPcs = 0;
      let grandTotalBeratKg = 0;
      let grandTotalSisaPcs = 0;
      let grandTotalSisaKg = 0;
      let grandTotalTerkirimPcs = 0;
      let grandTotalTerkirimKg = 0;

      // B. BREAKDOWN STATUS PO
      let openCount = 0;
      let openQtyPcs = 0;
      let openBeratKg = 0;
      let openSisaPcs = 0;
      let openSisaKg = 0;
      let openStockPcs = 0;
      let openStockKg = 0;
      let openTerkirimPcs = 0;
      let openTerkirimKg = 0;

      let closedCount = 0;
      let closedQtyPcs = 0;
      let closedBeratKg = 0;
      let closedSisaPcs = 0;
      let closedSisaKg = 0;
      let closedStockPcs = 0;
      let closedStockKg = 0;
      let closedTerkirimPcs = 0;
      let closedTerkirimKg = 0;

      let agingSafeCount = 0;
      let agingSafeSisaPcs = 0;
      let agingSafeSisaKg = 0;

      let agingFollowUpCount = 0;
      let agingFollowUpSisaPcs = 0;
      let agingFollowUpSisaKg = 0;

      let agingCriticalCount = 0;
      let agingCriticalSisaPcs = 0;
      let agingCriticalSisaKg = 0;

      const criticalItemsList: Array<{
        row: number;
        po: string;
        art: string;
        desc: string;
        days: number;
        sisaPcs: number;
        sisaKg: number;
      }> = [];

      // C. READY STOCK DETAIL LIST (PO dengan Stok Siap Kirim)
      const readyStockItemsList: Array<{
        row: number;
        po: string;
        art: string;
        desc: string;
        qtyPcs: number;
        stockPcs: number;
        stockKg: number;
        sisaPcs: number;
        sisaKg: number;
        readiness: string;
      }> = [];
      let totalReadyStockPcs = 0;
      let totalReadyStockKg = 0;
      let fullyReadyCount = 0;
      let partiallyReadyCount = 0;
      let zeroStockCount = 0;

      const confirmedOverStockItems: Array<{
        row: number;
        po: string;
        art: string;
        desc: string;
        pcs: number;
        kg: number;
      }> = [];
      let totalOverStockPcs = 0;
      let totalOverStockKg = 0;

      const confirmedOverKirimanItems: Array<{
        row: number;
        po: string;
        art: string;
        desc: string;
        pcs: number;
        kg: number;
      }> = [];
      let totalOverKirimanPcs = 0;
      let totalOverKirimanKg = 0;

      const prefixMap = new Map<string, { count: number; sisaPcs: number; sisaKg: number; stockPcs: number }>();
      const articleSummaryMap = new Map<string, {
        desc: string;
        sisaPcs: number;
        sisaKg: number;
        stockPcs: number;
        stockKg: number;
        qtyPcs: number;
        poCount: number;
        poNumbers: Set<string>;
      }>();

      // -------------------------------------------------------------
      // 3. EXECUTE ENGINE ON 100% OF ROWS (Zero Truncation)
      // -------------------------------------------------------------
      records.forEach((r: any, idx: number) => {
        const rowNum = idx + 1;
        const status = (r.coStatus || '').toUpperCase().trim();
        const qtyPcs = cleanNum(r['QTY PO (pcs)']);
        const beratKg = cleanNum(r['Berat PO (KG)']);
        const sisaPcs = cleanNum(r['Sisa OS (pcs)']);
        const sisaKg = cleanNum(r['Sisa OS (kg)']);
        const stockPcs = cleanNum(r['Stock (pcs)']);
        const stockKg = cleanNum(r['Stock (kg)']);
        const terkirimPcs = cleanNum(r['Terkirim (PCS)']);
        const terkirimKg = cleanNum(r['Terkirim (KG)']);
        const tgl = r['Tanggal Input PO'];
        const art = cleanStr(r.Artikel);
        const desc = cleanStr(r['Item Description']);
        const po = cleanStr(r['No PO']);

        // Accumulate Grand Total Across ALL Rows
        grandTotalStockPcs += stockPcs;
        grandTotalStockKg += stockKg;
        grandTotalQtyPcs += qtyPcs;
        grandTotalBeratKg += beratKg;
        grandTotalSisaPcs += sisaPcs;
        grandTotalSisaKg += sisaKg;
        grandTotalTerkirimPcs += terkirimPcs;
        grandTotalTerkirimKg += terkirimKg;

        // Status-based indexing
        if (status === 'OPEN') {
          openCount++;
          openQtyPcs += qtyPcs;
          openBeratKg += beratKg;
          openSisaPcs += sisaPcs;
          openSisaKg += sisaKg;
          openStockPcs += stockPcs;
          openStockKg += stockKg;
          openTerkirimPcs += terkirimPcs;
          openTerkirimKg += terkirimKg;

          // Warehouse readiness on OPEN POs
          if (stockPcs > 0 && sisaPcs > 0) {
            const isFull = stockPcs >= sisaPcs;
            if (isFull) {
              fullyReadyCount++;
            } else {
              partiallyReadyCount++;
            }
            totalReadyStockPcs += stockPcs;
            totalReadyStockKg += stockKg;

            readyStockItemsList.push({
              row: rowNum,
              po,
              art,
              desc,
              qtyPcs,
              stockPcs,
              stockKg,
              sisaPcs,
              sisaKg,
              readiness: isFull ? 'SIAP 100% (Stok >= Sisa OS)' : 'PARSIAL (Stok < Sisa OS)',
            });
          } else if (stockPcs === 0 && sisaPcs > 0) {
            zeroStockCount++;
          }
        } else if (status === 'CLOSED') {
          closedCount++;
          closedQtyPcs += qtyPcs;
          closedBeratKg += beratKg;
          closedSisaPcs += sisaPcs;
          closedSisaKg += sisaKg;
          closedStockPcs += stockPcs;
          closedStockKg += stockKg;
          closedTerkirimPcs += terkirimPcs;
          closedTerkirimKg += terkirimKg;
        }

        // Aging calculation
        const aging = calculatePoAging(tgl);
        if (aging.category === 'SAFE') {
          agingSafeCount++;
          agingSafeSisaPcs += sisaPcs;
          agingSafeSisaKg += sisaKg;
        } else if (aging.category === 'FOLLOW_UP') {
          agingFollowUpCount++;
          agingFollowUpSisaPcs += sisaPcs;
          agingFollowUpSisaKg += sisaKg;
        } else if (aging.category === 'CRITICAL') {
          agingCriticalCount++;
          agingCriticalSisaPcs += sisaPcs;
          agingCriticalSisaKg += sisaKg;
          criticalItemsList.push({
            row: rowNum,
            po,
            art,
            desc,
            days: aging.days,
            sisaPcs,
            sisaKg,
          });
        }

        // Over Stock
        const ovStockP = cleanNum(r['Over Stock Gudang (PCS)'] || r['Over Produksi (PCS)']);
        const ovStockK = cleanNum(r['Over Stock Gudang (KG)'] || r['Over Produksi (KG)']);
        if (ovStockP > 0 || ovStockK > 0) {
          totalOverStockPcs += ovStockP;
          totalOverStockKg += ovStockK;
          confirmedOverStockItems.push({
            row: rowNum,
            po,
            art,
            desc,
            pcs: ovStockP,
            kg: ovStockK,
          });
        }

        // Over Kiriman
        const ovKirimP = cleanNum(r['Over Kiriman (PCS)']);
        const ovKirimK = cleanNum(r['Over Kiriman (KG)']);
        if (ovKirimP > 0 || ovKirimK > 0) {
          totalOverKirimanPcs += ovKirimP;
          totalOverKirimanKg += ovKirimK;
          confirmedOverKirimanItems.push({
            row: rowNum,
            po,
            art,
            desc,
            pcs: ovKirimP,
            kg: ovKirimK,
          });
        }

        // Prefix Categorization
        const prefixMatch = art.match(/^([A-Za-z0-9]+)-/);
        const prefix = prefixMatch ? prefixMatch[1].toUpperCase() : 'LAINNYA';
        const curPrefix = prefixMap.get(prefix) || { count: 0, sisaPcs: 0, sisaKg: 0, stockPcs: 0 };
        curPrefix.count++;
        curPrefix.sisaPcs += sisaPcs;
        curPrefix.sisaKg += sisaKg;
        curPrefix.stockPcs += stockPcs;
        prefixMap.set(prefix, curPrefix);

        // Article Tracking with dimensions & metrics
        if (art !== '-') {
          const curArt = articleSummaryMap.get(art) || {
            desc,
            sisaPcs: 0,
            sisaKg: 0,
            stockPcs: 0,
            stockKg: 0,
            qtyPcs: 0,
            poCount: 0,
            poNumbers: new Set<string>(),
          };
          curArt.sisaPcs += sisaPcs;
          curArt.sisaKg += sisaKg;
          curArt.stockPcs += stockPcs;
          curArt.stockKg += stockKg;
          curArt.qtyPcs += qtyPcs;
          curArt.poCount++;
          if (po !== '-') curArt.poNumbers.add(po);
          articleSummaryMap.set(art, curArt);
        }
      });

      // Synchronize with summary from frontend if available
      const officialTotalStockKg = summary.totalStockKg !== undefined ? summary.totalStockKg : grandTotalStockKg;
      const officialTotalStockPcs = summary.totalStockPcs !== undefined ? summary.totalStockPcs : grandTotalStockPcs;
      const officialTotalQtyPcs = summary.totalQtyOrderPcs !== undefined ? summary.totalQtyOrderPcs : grandTotalQtyPcs;
      const officialTotalBeratKg = summary.totalBeratOrderKg !== undefined ? summary.totalBeratOrderKg : grandTotalBeratKg;
      const officialTotalSisaPcs = summary.totalSisaOSPcs !== undefined ? summary.totalSisaOSPcs : grandTotalSisaPcs;
      const officialTotalSisaKg = summary.totalSisaOSKg !== undefined ? summary.totalSisaOSKg : grandTotalSisaKg;
      const officialTotalTerkirimPcs = summary.totalTerkirimPcs !== undefined ? summary.totalTerkirimPcs : grandTotalTerkirimPcs;
      const officialTotalTerkirimKg = summary.totalTerkirimKg !== undefined ? summary.totalTerkirimKg : grandTotalTerkirimKg;

      // Sort Critical items by days descending
      criticalItemsList.sort((a, b) => b.days - a.days);

      // Unique Articles List with dimensions
      const uniqueArticlesList = Array.from(articleSummaryMap.entries())
        .map(([art, val]) => ({
          art,
          desc: val.desc,
          poCount: val.poCount,
          sisaPcs: val.sisaPcs,
          sisaKg: val.sisaKg,
          stockPcs: val.stockPcs,
          stockKg: val.stockKg,
          qtyPcs: val.qtyPcs,
        }))
        .sort((a, b) => a.art.localeCompare(b.art));

      // Ready Stock Detailed Table Text
      const readyStockTableText =
        readyStockItemsList.length === 0
          ? 'TIDAK ADA PO dengan Stok Ready saat ini (Semua stok 0 pcs atau pesanan sudah tertutup).'
          : readyStockItemsList
              .map(
                (item, i) =>
                  `  ${i + 1}. [Baris #${item.row}] PO: ${item.po} | Artikel: ${item.art} | Ukuran: ${item.desc} | QTY PO: ${item.qtyPcs.toLocaleString('id-ID')} pcs | Stok Gudang: ${item.stockPcs.toLocaleString('id-ID')} pcs (${item.stockKg.toLocaleString('id-ID')} kg) | Sisa OS: ${item.sisaPcs.toLocaleString('id-ID')} pcs (${item.sisaKg.toLocaleString('id-ID')} kg) | Kesiapan: ${item.readiness}`
              )
              .join('\n');

      // Unique Articles Dimensions Table Text
      const uniqueArticlesTableText = uniqueArticlesList
        .map(
          (u, i) =>
            `  ${i + 1}. [${u.art}] ${u.desc} | Total PO: ${u.poCount} | Sisa OS: ${u.sisaPcs.toLocaleString('id-ID')} pcs (${(u.sisaKg / 1000).toFixed(2)} Ton) | Stok Gudang: ${u.stockPcs.toLocaleString('id-ID')} pcs (${(u.stockKg / 1000).toFixed(2)} Ton)`
        )
        .join('\n');

      // Top 5 Highest Outstanding Articles (by Sisa OS kg)
      const topOutstandingArticles = [...uniqueArticlesList]
        .sort((a, b) => b.sisaKg - a.sisaKg)
        .slice(0, 5);

      // Prefix breakdown text
      const prefixBreakdownText = Array.from(prefixMap.entries())
        .map(([pfx, stats]) => `  * Kategori ${pfx}: ${stats.count} PO | Sisa OS: ${stats.sisaPcs.toLocaleString('id-ID')} pcs (${(stats.sisaKg / 1000).toFixed(2)} Ton) | Stok: ${stats.stockPcs.toLocaleString('id-ID')} pcs`)
        .join('\n');

      // Top 5 Outstanding Text
      const topOutstandingText = topOutstandingArticles
        .map((a, i) => `  ${i + 1}. [${a.art}] ${a.desc} -> Sisa OS: ${a.sisaPcs.toLocaleString('id-ID')} pcs (${(a.sisaKg / 1000).toFixed(2)} Ton) | ${a.poCount} PO | Stok: ${a.stockPcs.toLocaleString('id-ID')} pcs`)
        .join('\n');

      // Top Critical POs Text
      const topCriticalText = criticalItemsList.slice(0, 8)
        .map((c) => `  * Baris ${c.row}: [${c.art}] PO: ${c.po} | Umur: ${c.days} Hari | Sisa OS: ${c.sisaPcs.toLocaleString('id-ID')} pcs (${(c.sisaKg / 1000).toFixed(2)} Ton)`)
        .join('\n');

      const overStockListText =
        confirmedOverStockItems.length === 0
          ? 'TIDAK ADA PO yang Over Stock Gudang (Semua baris bernilai 0 pcs).'
          : confirmedOverStockItems
              .map((r) => `  * Baris ${r.row}: [${r.art}] ${r.desc} | PO: ${r.po} | Over Stock: +${r.pcs.toLocaleString('id-ID')} pcs (${r.kg.toLocaleString('id-ID')} kg)`)
              .join('\n');

      const overKirimanListText =
        confirmedOverKirimanItems.length === 0
          ? 'TIDAK ADA PO yang Over Kiriman (Semua baris bernilai 0 pcs).'
          : confirmedOverKirimanItems
              .map((r) => `  * Baris ${r.row}: [${r.art}] ${r.desc} | PO: ${r.po} | Over Kiriman: +${r.pcs.toLocaleString('id-ID')} pcs (${r.kg.toLocaleString('id-ID')} kg)`)
              .join('\n');

      // -------------------------------------------------------------
      // 4. 100% UNTRUNCATED FULL ERP TABLE (LEAN COMPACT SCHEMA)
      //    Zero rows dropped, zero records truncated!
      // -------------------------------------------------------------
      const tableRowsText = records
        .map((r: any, idx: number) => {
          const rowNum = idx + 1;
          const co = cleanStr(r.CO);
          const st = cleanStr(r.coStatus);
          const art = cleanStr(r.Artikel);
          const desc = cleanStr(r['Item Description']);
          const po = cleanStr(r['No PO']);
          const tgl = cleanDate(r['Tanggal Input PO']);
          const qty = cleanNum(r['QTY PO (pcs)']);
          const brt = cleanNum(r['Berat PO (KG)']);
          const stkP = cleanNum(r['Stock (pcs)']);
          const stkK = cleanNum(r['Stock (kg)']);
          const osP = cleanNum(r['Sisa OS (pcs)']);
          const osK = cleanNum(r['Sisa OS (kg)']);
          const krm = cleanNum(r['Terkirim (PCS)']);
          const ovStkP = cleanNum(r['Over Stock Gudang (PCS)'] || r['Over Produksi (PCS)']);
          const ovStkK = cleanNum(r['Over Stock Gudang (KG)'] || r['Over Produksi (KG)']);
          const ovKrmP = cleanNum(r['Over Kiriman (PCS)']);
          const aging = calculatePoAging(r['Tanggal Input PO']);
          const agingDays = aging.days >= 0 ? `${aging.days}h` : '-';
          const agingCat = aging.category;
          return `${rowNum}|${co}|${st}|${art}|${desc}|${po}|${tgl}|${qty}|${brt}|${stkP}|${stkK}|${osP}|${osK}|${krm}|${ovStkP}|${ovStkK}|${ovKrmP}|${agingDays}|${agingCat}`;
        })
        .join('\n');

      datasetContextText = `
=== [INDEX DATA INTERPRETER RESMI - KALKULASI PASTI 100% (GROUND TRUTH)] ===
Nama File: ${currentFileName || 'Dokumen_Excel.xlsx'}
Total Baris PO Diimpor: ${records.length} Baris PO (100% UTUH TERSEDIA DI TABEL)
Total Artikel Unik: ${uniqueArticlesList.length} Artikel Unik

A. REKAPITULASI RESMI STOK GUDANG & VOLUME DOKUMEN (GROUND TRUTH MATEMATIS):
- TOTAL SELURUH STOK FISIK GUDANG (SEMUA BARIS DI EXCEL / SESUAI KARTU DASHBOARD):
  * ${officialTotalStockPcs.toLocaleString('id-ID')} pcs (${(officialTotalStockKg / 1000).toFixed(2)} Ton / ${officialTotalStockKg.toLocaleString('id-ID')} kg)
  * Rincian Distribusi Stok Fisik:
    1. Stok pada PO Status OPEN: ${openStockPcs.toLocaleString('id-ID')} pcs (${(openStockKg / 1000).toFixed(2)} Ton / ${openStockKg.toLocaleString('id-ID')} kg)
    2. Stok pada PO Status CLOSED: ${closedStockPcs.toLocaleString('id-ID')} pcs (${(closedStockKg / 1000).toFixed(2)} Ton / ${closedStockKg.toLocaleString('id-ID')} kg)
    3. Stok Alokasi Siap Kirim (Ready Stock): ${totalReadyStockPcs.toLocaleString('id-ID')} pcs (${(totalReadyStockKg / 1000).toFixed(2)} Ton / ${totalReadyStockKg.toLocaleString('id-ID')} kg)
- TOTAL SISA ORDER OUTSTANDING (SISA OS): ${officialTotalSisaPcs.toLocaleString('id-ID')} pcs (${(officialTotalSisaKg / 1000).toFixed(2)} Ton)
- TOTAL KUOTA ORDER AWAL (QTY PO): ${officialTotalQtyPcs.toLocaleString('id-ID')} pcs (${(officialTotalBeratKg / 1000).toFixed(2)} Ton)
- TOTAL BARANG TERKIRIM: ${officialTotalTerkirimPcs.toLocaleString('id-ID')} pcs (${(officialTotalTerkirimKg / 1000).toFixed(2)} Ton)
- JUMLAH STATUS PO: ${openCount} PO Berstatus OPEN | ${closedCount} PO Berstatus CLOSED

B. KESIAPAN PENGIRIMAN GUDANG (READY STOCK):
- Total PO Memiliki Stok Siap Kirim (Stock > 0 & Sisa OS > 0): ${readyStockItemsList.length} PO | Total Stok Ready: ${totalReadyStockPcs.toLocaleString('id-ID')} pcs (${(totalReadyStockKg / 1000).toFixed(2)} Ton)
  * Siap Kirim 100% Tuntas (Stock >= Sisa OS): ${fullyReadyCount} PO
  * Siap Kirim Sebagian / Parsial (Stock < Sisa OS): ${partiallyReadyCount} PO
  * Menunggu Produksi (Stok Gudang = 0 & Sisa OS > 0): ${zeroStockCount} PO

DAFTAR LENGKAP PO DENGAN STOK READY (${readyStockItemsList.length} PO):
${readyStockTableText}

C. DAFTAR ARTIKEL UNIK & SPESIFIKASI UKURAN (${uniqueArticlesList.length} Artikel Unik):
${uniqueArticlesTableText}

D. UMUR PO (AGING PO RESMI SISTEM):
- "< 7 Hari (Aman / Baru)": ${agingSafeCount} PO | Sisa OS: ${agingSafeSisaPcs.toLocaleString('id-ID')} pcs (${(agingSafeSisaKg / 1000).toFixed(2)} Ton)
- "8 – 14 Hari (Follow Up)": ${agingFollowUpCount} PO | Sisa OS: ${agingFollowUpSisaPcs.toLocaleString('id-ID')} pcs (${(agingFollowUpSisaKg / 1000).toFixed(2)} Ton)
- "> 14 Hari (Kritis / Telat)": ${agingCriticalCount} PO | Sisa OS: ${agingCriticalSisaPcs.toLocaleString('id-ID')} pcs (${(agingCriticalSisaKg / 1000).toFixed(2)} Ton)
Top PO Paling Kritis (Umur Terpanjang):
${topCriticalText || '  (Tidak ada PO kritis)'}

E. KELOMPOK ARTIKEL DENGAN OUTSTANDING TERTINGGI (TOP 5 SISA OS):
${topOutstandingText || '  (Tidak ada)'}

F. DISTRIBUSI KELOMPOK KODE ARTIKEL:
${prefixBreakdownText || '  (Tidak ada)'}

G. ANOMALI OVER STOCK & OVER KIRIMAN:
- Over Stock Gudang (> 0 pcs): ${confirmedOverStockItems.length} PO | Total: +${totalOverStockPcs.toLocaleString('id-ID')} pcs (${totalOverStockKg.toLocaleString('id-ID')} kg)
${overStockListText}
- Over Kiriman Surat Jalan (> 0 pcs): ${confirmedOverKirimanItems.length} PO | Total: +${totalOverKirimanPcs.toLocaleString('id-ID')} pcs (${totalOverKirimanKg.toLocaleString('id-ID')} kg)
${overKirimanListText}

=== [TABEL LENGKAP ERP (100% BARIS UTUH - LEAN COMPACT SCHEMA)] ===
Keterangan Kolom: # (Baris) | CO | Status | Artikel | Deskripsi & Ukuran | PO | Tgl | Qty_pcs | Berat_kg | Stk_pcs | Stk_kg | Os_pcs | Os_kg | Krm_pcs | OvStk_pcs | OvStk_kg | OvKrm_pcs | Umur | Kat
${tableRowsText}
`;
    }

    const systemInstruction = `Anda adalah "BlackEYE AI Assistant", asisten cerdas analisis data ERP logistik dan supply chain (dikembangkan oleh Kelvin).

PRINSIP UTAMA: KELENGKAPAN, KEAKURATAN TINGGI, DAN ANTI TERPOTONG (PRIORITASKAN KUALITAS & DETAIL DATA LENGKAP):
Pengguna sangat mengutamakan kelengkapan dan kebenaran data di atas penghematan token. Dilarang keras memotong penyajian data, dilarang membuang kolom angka penting, dan dilarang menghentikan tabel di tengah jalan!

ARSITEKTUR DUAL-LAYER DATA (GROUND TRUTH RESMI 100%):
1. LAYER 1: "INDEX DATA INTERPRETER RESMI":
   - Merupakan kebenaran mutlak (Ground Truth) hasil hitungan pasti sistem engine.
   - Gunakan data pada Index untuk menjawab pertanyaan agregat, total stok fisik gudang, stok ready, aging PO, top artikel, dan anomali.
2. LAYER 2: "TABEL LENGKAP ERP (100% BARIS UTUH)":
   - Seluruh baris data PO diimpor secara utuh 100%. Gunakan untuk pencarian baris spesifik, nomor PO tertentu, nomor CO, atau perbandingan rinci.

ATURAN KRUSIAL PENYAJIAN DATA (WAJIB DITAATI):

1. ATURAN PERHITUNGAN TOTAL STOK GUDANG (AGAR TIDAK SALAH HITUNG!):
   - Jika pengguna menanyakan "Berapa total stok gudang?", "Total stok fisik", atau "Cara hitung stok":
     * Jawab bahwa TOTAL SELURUH STOK FISIK GUDANG di file ERP adalah angka pada Bagian A Index: misal ${(dataContext?.summary?.totalStockKg ? dataContext.summary.totalStockKg / 1000 : 0).toFixed(2)} Ton (${dataContext?.summary?.totalStockPcs || 0} pcs).
     * Terangkan rincian pembagiannya dengan transparan:
       a) Stok pada PO status OPEN: berapa Ton / pcs.
       b) Stok pada PO status CLOSED (sudah selesai/stok sisa): berapa Ton / pcs.
       c) Alokasi Stok yang Siap Kirim (Ready Stock): berapa Ton / pcs.
     * DILARANG KERAS mengklaim bahwa stok pada PO OPEN adalah total keseluruhan gudang! Selalu jelaskan pembagian antara PO OPEN dan PO CLOSED agar hasil perhitungan sesuai dengan hitungan manual pengguna dan kartu dashboard web.

2. ATURAN MENJAWAB "CEK ARTIKEL YANG MEMILIKI STOK READY GUDANG":
   - Ketika pengguna meminta daftar Stok Ready gudang, WAJIB sajikan data yang LENGKAP dan DETAIL dalam tabel Markdown!
   - DILARANG HANYA MENAMPILKAN NO & KODE ARTIKEL! Kolom operasional berikut WAJIB ADA:
     | # | No PO | Kode Artikel | Deskripsi & Ukuran | QTY PO (pcs) | Stok Gudang (pcs) | Stok Gudang (kg) | Sisa OS (pcs) | Sisa OS (kg) | Status Kesiapan |
   - Tuliskan angka pcs, kg, serta status (misal: "SIAP 100%" jika Stok >= Sisa OS, atau "PARSIAL" jika Stok < Sisa OS).
   - Di akhir tabel, berikan kesimpulan ringkas total tonase Ready Stock yang siap dikirim.

3. ATURAN MENJAWAB "DAFTAR UKURAN SEMUA ARTIKEL":
   - Jika pengguna meminta "Daftar ukuran semua artikel" / "Ukuran artikel":
     * Gunakan data dari Bagian C Index ("DAFTAR ARTIKEL UNIK & SPESIFIKASI UKURAN").
     * Sajikan dalam tabel terstruktur rapi per **Artikel Unik**:
       | No | Kode Artikel | Ukuran & Spesifikasi Deskripsi | Jumlah PO | Total Sisa OS (pcs) | Total Sisa OS (Ton) | Stok Gudang (pcs) |
     * Ini menyajikan seluruh spesifikasi ukuran yang ada secara lengkap dan efisien tanpa menduplikasi artikel yang sama berulang kali.
     * Jika pengguna meminta secara spesifik "rincian ukuran per nomor PO", sajikan tabel lengkap per PO hingga selesai tanpa terputus.

4. FORMAT PENYAJIAN TABEL MARKDOWN:
   - Pastikan setiap tabel Markdown tertutup dengan rapi.
   - Format angka ribuan dengan pemisah titik (misal: 1.500 pcs, 2.750 kg).
   - Selalu sertakan satuan yang jelas (pcs, kg, Ton, atau Rp).

5. GAYA KOMUNIKASI & IDENTITAS:
   - Langsung ke inti data, profesional, ramah, dan solutif.
   - HANYA menyapa/memperkenalkan nama "BlackEYE AI Assistant, develop by Kelvin" jika pengguna menyapa duluan ("Halo", "Hai") atau bertanya siapa pembuatnya. Untuk pertanyaan data, langsung sajikan data dan tabelnya.

6. BAHASA RESPON UTAMA:
   - Pengguna saat ini memilih antarmuka bahasa: "${targetLanguageName}".
   - Jawab seluruh pertanyaan, analisis, dan tabel DALAM BAHASA "${targetLanguageName}".

Berikut adalah informasi data saat ini:
===============================
${datasetContextText}
===============================`;

    // Format chat history
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (Array.isArray(history)) {
      for (const item of history) {
        if (!item || !item.content) continue;
        const role = item.role === 'user' ? 'user' : 'model';
        contents.push({
          role,
          parts: [{ text: String(item.content) }],
        });
      }
    }

    // Append current user message
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    // Multi-model auto fallback chain:
    // 1. gemini-3.6-flash (Prioritas Utama / Default)
    // 2. gemini-3.5-flash (Fallback otomatis saat token habis / 429 / 503 tanpa pesan error)
    // 3. gemini-3.8-flash (Fallback lanjutan dengan kapasitas penalaran tinggi)
    // 4. gemini-3.5-flash-lite (Fallback hemat token)
    // 5. gemini-flash-latest (Cadangan alias resmi Google)
    // 6. gemini-3.1-flash-lite (Cadangan lite berikutnya)
    // 7. gemini-3.7-flash (Cadangan penalaran tinggi)
    const baseCandidateModels = [
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.7-flash',
    ];

    // Build optimized execution list preserving strict priority:
    // Active (healthy) models are tried first in order of priority.
    // Models in cooldown are kept at the end in case all active models fail.
    const activeCandidates = baseCandidateModels.filter((m) => !isModelInCooldown(m));
    const coolingCandidates = baseCandidateModels.filter((m) => isModelInCooldown(m));

    const candidateModels = activeCandidates.length > 0 ? [...activeCandidates, ...coolingCandidates] : baseCandidateModels;

    // -------------------------------------------------------------
    // OPTION A: STREAMING SSE RESPONSE (Fastest TTFT ~200-400ms)
    // -------------------------------------------------------------
    if (isStreamRequest) {
      // Set SSE headers immediately so client knows stream has started
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering on nginx/proxies
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      let lastError: any = null;
      let streamStarted = false;
      let usedModel = '';

      for (const modelName of candidateModels) {
        try {
          console.log(`[AI Chat Stream] Mencoba model: ${modelName}...`);

          const streamConfig: any = {
            systemInstruction,
            temperature: 0.2,
            maxOutputTokens: 8192, // Maximum output tokens so large responses are never cut off
          };
          if (modelName.includes('gemini-3')) {
            streamConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          }

          const stream = await ai.models.generateContentStream({
            model: modelName,
            contents,
            config: streamConfig,
          });

          for await (const chunk of stream) {
            const textChunk = chunk.text;
            if (textChunk) {
              if (!streamStarted) {
                streamStarted = true;
                usedModel = modelName;
                lastSuccessfulModel = modelName;
                // Emit initial metadata event with model used
                res.write(`event: meta\ndata: ${JSON.stringify({ modelUsed: modelName })}\n\n`);
              }
              // Send text chunk to browser
              res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
              if (typeof (res as any).flush === 'function') {
                (res as any).flush();
              }
            }
          }

          if (streamStarted) {
            // Completed stream successfully
            res.write(`event: done\ndata: {}\n\n`);
            res.end();
            return;
          }
        } catch (err: any) {
          lastError = err;
          const errDesc = String(err?.status || err?.message || err);
          console.warn(`[AI Chat Stream] Model ${modelName} gagal (${errDesc}), mencatat cooldown & beralih ke fallback...`);
          markModelCooldown(modelName, errDesc);

          if (streamStarted) {
            // Already started streaming to client, send error event inside stream
            res.write(`event: error\ndata: ${JSON.stringify({ message: 'Terjadi pemutusan stream AI: ' + errDesc })}\n\n`);
            res.end();
            return;
          }
        }
      }

      // If loop finished and no stream started, format clean error message
      let friendlyMessage = lastError?.message || 'Semua model AI sedang sibuk. Silakan coba kembali.';
      if (friendlyMessage.includes('503') || friendlyMessage.includes('high demand') || friendlyMessage.includes('UNAVAILABLE')) {
        friendlyMessage = 'Server Google AI sedang mengalami lonjakan antrean trafik padat (503). Silakan tekan tombol "Coba Lagi".';
      } else if (friendlyMessage.includes('429') || friendlyMessage.includes('RESOURCE_EXHAUSTED')) {
        friendlyMessage = 'Batas kuota harian atau batas frekuensi permintaan tercapai. Silakan tunggu sebentar lalu coba lagi.';
      }

      res.write(`event: error\ndata: ${JSON.stringify({ message: friendlyMessage })}\n\n`);
      res.end();
      return;
    }

    // -------------------------------------------------------------
    // OPTION B: STANDARD JSON RESPONSE (FALLBACK IF STREAM=FALSE)
    // -------------------------------------------------------------
    let lastError: any = null;
    let replyText = '';
    let usedModel = '';

    for (const modelName of candidateModels) {
      try {
        console.log(`[AI Chat JSON] Mencoba model: ${modelName}...`);

        const generatePromise = ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout (>30s) pada model ${modelName}`)), 30000)
        );

        const response = await Promise.race([generatePromise, timeoutPromise]);

        if (response && response.text) {
          replyText = response.text;
          usedModel = modelName;
          lastSuccessfulModel = modelName;
          break;
        }
      } catch (err: any) {
        lastError = err;
        const errDesc = String(err?.status || err?.message || err);
        markModelCooldown(modelName, errDesc);
      }
    }

    if (!replyText) {
      throw lastError || new Error('Semua model AI sedang sibuk. Silakan coba kembali.');
    }

    return res.status(200).json({
      success: true,
      reply: replyText,
      modelUsed: usedModel,
    });
  } catch (error: any) {
    console.error('Error in /api/chat Gemini processing:', error);

    let friendlyMessage = error?.message || 'Terjadi kesalahan saat memproses pertanyaan dengan AI.';
    if (typeof friendlyMessage === 'string') {
      if (friendlyMessage.includes('503') || friendlyMessage.includes('high demand') || friendlyMessage.includes('UNAVAILABLE')) {
        friendlyMessage = 'Server Google AI sedang mengalami lonjakan antrean trafik padat (503). Silakan tekan tombol "Coba Lagi".';
      } else if (friendlyMessage.includes('429') || friendlyMessage.includes('RESOURCE_EXHAUSTED')) {
        friendlyMessage = 'Batas kuota harian atau batas frekuensi permintaan per menit tercapai. Silakan tunggu 30 detik lalu coba lagi, atau gunakan API Key pribadi via ikon kunci (🔑) di atas.';
      }
    }

    return res.status(500).json({
      error: 'GEMINI_PROCESSING_ERROR',
      message: friendlyMessage,
    });
  }
}
