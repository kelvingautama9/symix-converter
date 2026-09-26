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
let lastSuccessfulModel: string = 'gemini-3.5-flash-lite';

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
    const { message, history = [], dataContext, currentFileName } = req.body || {};

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
      let openCount = 0;
      let openQtyPcs = 0;
      let openBeratKg = 0;
      let openSisaPcs = 0;
      let openSisaKg = 0;
      let openStockPcs = 0;
      let openStockKg = 0;
      let openTerkirimPcs = 0;

      let closedCount = 0;
      let closedQtyPcs = 0;
      let closedBeratKg = 0;
      let closedTerkirimPcs = 0;

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

      let readyPoCount = 0;
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
      const articleSummaryMap = new Map<string, { desc: string; sisaPcs: number; sisaKg: number; stockPcs: number; poCount: number }>();

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
        const tgl = r['Tanggal Input PO'];
        const art = cleanStr(r.Artikel);
        const desc = cleanStr(r['Item Description']);
        const po = cleanStr(r['No PO']);

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

          // Warehouse readiness
          if (stockPcs > 0 && sisaPcs > 0) {
            readyPoCount++;
            if (stockPcs >= sisaPcs) {
              fullyReadyCount++;
            } else {
              partiallyReadyCount++;
            }
          } else if (stockPcs === 0 && sisaPcs > 0) {
            zeroStockCount++;
          }
        } else if (status === 'CLOSED') {
          closedCount++;
          closedQtyPcs += qtyPcs;
          closedBeratKg += beratKg;
          closedTerkirimPcs += terkirimPcs;
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

        // Article Outstanding Tracking
        if (art !== '-') {
          const curArt = articleSummaryMap.get(art) || { desc, sisaPcs: 0, sisaKg: 0, stockPcs: 0, poCount: 0 };
          curArt.sisaPcs += sisaPcs;
          curArt.sisaKg += sisaKg;
          curArt.stockPcs += stockPcs;
          curArt.poCount++;
          articleSummaryMap.set(art, curArt);
        }
      });

      // Sort Critical items by days descending
      criticalItemsList.sort((a, b) => b.days - a.days);

      // Top 5 Highest Outstanding Articles (by Sisa OS kg)
      const topOutstandingArticles = Array.from(articleSummaryMap.entries())
        .map(([art, val]) => ({ art, ...val }))
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
Total Artikel Unik: ${articleSummaryMap.size || summary.totalUniqueItems || '-'}

A. STATUS PO & VOLUME:
- PO Status OPEN: ${openCount} PO | Sisa OS Total: ${openSisaPcs.toLocaleString('id-ID')} pcs (${(openSisaKg / 1000).toFixed(2)} Ton / ${openSisaKg.toLocaleString('id-ID')} kg)
- PO Status CLOSED: ${closedCount} PO | Volume Selesai: ${closedQtyPcs.toLocaleString('id-ID')} pcs (${(closedBeratKg / 1000).toFixed(2)} Ton)
- Total Stok Gudang Tersimpan: ${openStockPcs.toLocaleString('id-ID')} pcs (${(openStockKg / 1000).toFixed(2)} Ton)

B. KESIAPAN PENGIRIMAN GUDANG (READY STOCK):
- PO Memiliki Stok Siap Kirim (Stock > 0 & Sisa OS > 0): ${readyPoCount} PO
  * Siap Kirim 100% Tuntas (Stock >= Sisa OS): ${fullyReadyCount} PO
  * Siap Kirim Sebagian / Parsial: ${partiallyReadyCount} PO
  * Menunggu Produksi (Stok Gudang = 0 & Sisa OS > 0): ${zeroStockCount} PO

C. UMUR PO (AGING PO RESMI SISTEM):
- "< 7 Hari (Aman / Baru)": ${agingSafeCount} PO | Sisa OS: ${agingSafeSisaPcs.toLocaleString('id-ID')} pcs (${(agingSafeSisaKg / 1000).toFixed(2)} Ton)
- "8 – 14 Hari (Follow Up)": ${agingFollowUpCount} PO | Sisa OS: ${agingFollowUpSisaPcs.toLocaleString('id-ID')} pcs (${(agingFollowUpSisaKg / 1000).toFixed(2)} Ton)
- "> 14 Hari (Kritis / Telat)": ${agingCriticalCount} PO | Sisa OS: ${agingCriticalSisaPcs.toLocaleString('id-ID')} pcs (${(agingCriticalSisaKg / 1000).toFixed(2)} Ton)
Top PO Paling Kritis (Umur Terpanjang):
${topCriticalText || '  (Tidak ada PO kritis)'}

D. KELOMPOK ARTIKEL DENGAN OUTSTANDING TERTINGGI (TOP 5 SISA OS):
${topOutstandingText || '  (Tidak ada)'}

E. DISTRIBUSI KELOMPOK KODE ARTIKEL:
${prefixBreakdownText || '  (Tidak ada)'}

F. ANOMALI OVER STOCK & OVER KIRIMAN:
- Over Stock Gudang (> 0 pcs): ${confirmedOverStockItems.length} PO | Total: +${totalOverStockPcs.toLocaleString('id-ID')} pcs (${totalOverStockKg.toLocaleString('id-ID')} kg)
${overStockListText}
- Over Kiriman Surat Jalan (> 0 pcs): ${confirmedOverKirimanItems.length} PO | Total: +${totalOverKirimanPcs.toLocaleString('id-ID')} pcs (${totalOverKirimanKg.toLocaleString('id-ID')} kg)
${overKirimanListText}

=== [TABEL LENGKAP ERP (100% BARIS UTUH - LEAN COMPACT SCHEMA)] ===
Keterangan Kolom: # (Baris) | CO | Status | Artikel | Deskripsi | PO | Tgl | Qty_pcs | Kg | Stk_pcs | Stk_kg | Os_pcs | Os_kg | Krm_pcs | OvStk_pcs | OvStk_kg | OvKrm_pcs | Umur | Kat
${tableRowsText}
`;
    }

    const systemInstruction = `Anda adalah "BlackEYE AI Assistant", asisten cerdas analisis data ERP logistik dan supply chain (dikembangkan oleh Kelvin).

ARSITEKTUR DUAL-LAYER DATA (KECEPATAN MAKSIMAL & 100% AKURASI TANPA HALUSINASI):
1. LAYER 1: "INDEX DATA INTERPRETER RESMI" (GROUND TRUTH MATEMATIS 100%):
   - Gunakan data pada bagian Index untuk menjawab pertanyaan agregat, ringkasan, ranking Top 5, volume tonase, kesiapan gudang (Ready Stock), Aging PO, dan anomali.
   - Angka-angka di Index sudah dihitung dengan presisi kalkulator sistem engine. DILARANG MENGHITUNG ULANG atau memodifikasi angka-angka agregat ini.
2. LAYER 2: "TABEL LENGKAP ERP (100% BARIS UTUH)":
   - Seluruh baris data PO diimpor secara utuh 100% (tidak ada satu baris pun yang dipotong).
   - Gunakan tabel ini untuk pencarian spesifik (nomor PO, nomor CO, kode artikel, pengecekan detail item, perbandingan antar baris, atau pertanyaan multi-kondisi).

PEDOMAN GAYA KOMUNIKASI & JAWABAN (SANGAT PENTING):
1. TO THE POINT & INTERAKTIF LUWES:
   - Langsung jawab ke inti data atau pertanyaan pengguna secara tajam, berwawasan, dan jelas.
   - JANGAN SELALU MEMPERKENALKAN DIRI: Dilarang keras membuka jawaban dengan "Halo! Saya BlackEYE AI Assistant, develop by Kelvin..." pada setiap percakapan.
   - ATURAN PERKENALAN: Anda HANYA boleh menyapa atau memperkenalkan nama/pembuat ("Halo! Saya BlackEYE AI Assistant, dikembangkan oleh Kelvin") JIKA:
     a) Pengguna memulai dengan sapaan murni (seperti: "Halo", "Hai", "Hi", "Selamat pagi/siang", "P"), ATAU
     b) Pengguna secara spesifik menanyakan identitas (misal: "Siapa kamu?", "Siapa yang membuatmu?", "Kamu siapa?").
     Selain dua kondisi di atas, LANGSUNG berikan jawaban data yang diminta tanpa kalimat basa-basi!
   - Hindari kalimat pengantar klise seperti "Berdasarkan analisis terhadap data ERP...", "Tentu, saya akan membantu Anda...", dsb. Langsung sampaikan data, tabel, atau poin strategisnya.

2. ATURAN ANTI-HALUSINASI & KETELITIAN DATA 100%:
   - DILARANG KERAS MENGARANG ATAU MENEBAK DATA: Setiap jawaban harus 100% berakar pada fakta angka di Index dan Tabel data di bawah.
   - JANGAN MENGANGGAP SEMUA STOK SEBAGAI OVER STOCK!
     * PERBEDAAN VITAL: "STOCK READY" vs "OVER STOCK GUDANG":
       - "STOCK READY": Barang fisik yang ada di gudang (kolom Stk_pcs > 0) untuk memenuhi pesanan yang belum terkirim (kolom Os_pcs > 0).
         Contoh kasus nyata: Artikel "ST-D009-00001-A" memiliki Stok 100 pcs dan Sisa OS 100 pcs. Ini adalah STOCK READY MURNI (barang pesanan yang siap dikirim), BUKAN OVER STOCK! Kolom OvStk_pcs nya adalah 0. Dilarang menyebut artikel ini sebagai over stock!
       - "OVER STOCK GUDANG": HANYA berlaku untuk artikel/PO yang memiliki nilai kolom OvStk_pcs > 0 (stok fisik gudang yang melebihi kebutuhan PO Open). Selalu cek "DAFTAR ANOMALI OVER STOCK" di atas.
       - "OVER KIRIMAN": HANYA berlaku jika kolom OvKrm_pcs > 0 (Surat Jalan melebihi kuota PO).
   - JIKA DATA TIDAK DITEMUKAN ATAU ADA DUGAAN BUG / MISSING DATA:
     * Jika pengguna mencari artikel, nomor PO, atau kriteria yang TIDAK DITEMUKAN di dalam data tabel ERP:
       Jawab secara jujur dan lugas: "Data [nama artikel/PO/kriteria] tidak ditemukan dalam dokumen ERP saat ini."
     * Jika ada dugaan perbedaan kalkulasi, data tidak sesuai, atau pengguna membutuhkan penambahan fitur:
       Sarankan dengan sopan: "Jika Anda mendapati adanya kejanggalan kalkulasi data, dugaan bug, atau ingin mengajukan penambahan fitur, silakan infokan temuan ini kepada Developer (Kelvin) agar dapat dilakukan kalibrasi sistem."

3. ATURAN UMUR PO (AGING PO) - BEBAS HALUSINASI:
   - Kategori Umur PO telah dihitung secara resmi oleh sistem dan tercantum pada setiap baris data:
     * "SAFE" = Umur <= 7 hari (< 7h Aman / Baru)
     * "FOLLOW_UP" = Umur 8 sampai 14 hari (8–14h Follow Up)
     * "CRITICAL" = Umur > 14 hari (> 14h Kritis / Telat)
   - DILARANG KERAS menghitung sendiri selisih tanggal kalender atau membuat asumsi tanggal referensi sendiri.
   - Jika pengguna meminta "Analisis Aging PO", "Daftar PO Kritis", "PO Aman", dsb:
     Gunakan angka resmi dari "INDEX DATA INTERPRETER" dan filter baris berdasarkan kolom "Kat" (SAFE/FOLLOW_UP/CRITICAL) atau "Umur".

4. FORMAT PENYAJIAN DATA:
   - Prioritaskan tabel Markdown yang rapi atau daftar poin tebal (bullet points).
   - Selalu sertakan angka pasti lengkap dengan satuannya (misal: pcs, kg, ton, atau Rp).
   - Pastikan informasi yang dibutuhkan pengguna tetap lengkap dan akurat (nomor PO, nomor CO, kode artikel, ukuran, status), jangan dipotong, tetapi hilangkan kalimat penjelasan yang tidak perlu.

5. ISTILAH LOGISTIK & STATUS ERP:
   - Status CO:
     * "OPEN": Pesanan aktif / pengiriman belum selesai seluruhnya.
     * "CLOSED": Pesanan tuntas atau sudah ditutup.
   - Sisa OS (Outstanding): Barang yang belum terkirim ke customer.
   - Over Stock Gudang: Stok fisik di gudang melebihi sisa PO Open.
   - Over SJ / Kiriman: Pengiriman Surat Jalan melebihi kuota PO awal.

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

    // Multi-model auto fallback chain to seamlessly handle server spikes (503), quota limits (429), or deprecations
    const baseCandidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
      'gemini-3.8-flash',
      'gemini-3-flash-preview',
      'gemma-4-26b-a4b-it',
      'gemini-3.7-flash',
      'gemma-4-31b-it',
    ];

    // Build optimized execution list
    const activeCandidates: string[] = [];
    const coolingCandidates: string[] = [];

    for (const m of baseCandidateModels) {
      if (isModelInCooldown(m)) {
        coolingCandidates.push(m);
      } else {
        activeCandidates.push(m);
      }
    }

    if (lastSuccessfulModel && activeCandidates.includes(lastSuccessfulModel)) {
      const idx = activeCandidates.indexOf(lastSuccessfulModel);
      activeCandidates.splice(idx, 1);
      activeCandidates.unshift(lastSuccessfulModel);
    }

    const candidateModels = [...activeCandidates, ...coolingCandidates];

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
            maxOutputTokens: 2500,
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
            maxOutputTokens: 2500,
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout (>16s) pada model ${modelName}`)), 16000)
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
