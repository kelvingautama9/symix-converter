import { GoogleGenAI } from '@google/genai';

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

      // Pre-extract confirmed Over Stock Gudang and Over Kiriman items for 100% ground truth
      const confirmedOverStockItems = records.filter(
        (r: any) =>
          (r['Over Stock Gudang (PCS)'] || r['Over Produksi (PCS)'] || 0) > 0 ||
          (r['Over Stock Gudang (KG)'] || r['Over Produksi (KG)'] || 0) > 0
      );
      const confirmedOverKirimanItems = records.filter(
        (r: any) => (r['Over Kiriman (PCS)'] || 0) > 0 || (r['Over Kiriman (KG)'] || 0) > 0
      );

      // Pre-calculate official Aging PO metrics directly from system engine
      let agingSafeCount = 0;
      let agingFollowUpCount = 0;
      let agingCriticalCount = 0;

      records.forEach((r: any) => {
        const aging = calculatePoAging(r['Tanggal Input PO']);
        if (aging.category === 'SAFE') agingSafeCount++;
        else if (aging.category === 'FOLLOW_UP') agingFollowUpCount++;
        else if (aging.category === 'CRITICAL') agingCriticalCount++;
      });

      const overStockListText =
        confirmedOverStockItems.length === 0
          ? 'TIDAK ADA PO yang Over Stock Gudang (Seluruh 146 PO bernilai 0 pcs).'
          : confirmedOverStockItems
              .map((r: any) => {
                const rowIdx = records.indexOf(r) + 1;
                const p = r['Over Stock Gudang (PCS)'] || r['Over Produksi (PCS)'] || 0;
                const k = r['Over Stock Gudang (KG)'] || r['Over Produksi (KG)'] || 0;
                return `  * Baris ${rowIdx}: [${r.Artikel}] ${r['Item Description']} | PO: ${r['No PO']} | Over Stock: +${p.toLocaleString('id-ID')} pcs (${k.toLocaleString('id-ID')} kg)`;
              })
              .join('\n');

      const overKirimanListText =
        confirmedOverKirimanItems.length === 0
          ? 'TIDAK ADA PO yang Over Kiriman (Seluruh PO bernilai 0 pcs).'
          : confirmedOverKirimanItems
              .map((r: any) => {
                const rowIdx = records.indexOf(r) + 1;
                const p = r['Over Kiriman (PCS)'] || 0;
                const k = r['Over Kiriman (KG)'] || 0;
                return `  * Baris ${rowIdx}: [${r.Artikel}] ${r['Item Description']} | PO: ${r['No PO']} | Over Kiriman SJ: +${p.toLocaleString('id-ID')} pcs (${k.toLocaleString('id-ID')} kg)`;
              })
              .join('\n');

      // Smart Compact Tabular Format (TSV / Pipe format):
      // Token-efficiency is 300% higher than repetitive JSON keys {"CO": "...", "Artikel": "..."}
      // Allows AI to read all 146+ rows (up to 1,500 rows) with zero missing items and low token footprint.
      const maxRowsToInclude = Math.min(records.length, 1200);
      const rowsToRender = records.slice(0, maxRowsToInclude);

      const tableRowsText = rowsToRender
        .map((r: any, idx: number) => {
          const rowNum = idx + 1;
          const co = (r.CO || '').trim();
          const st = (r.coStatus || '').trim();
          const art = (r.Artikel || '').trim();
          const desc = (r['Item Description'] || '').replace(/[\r\n\t]/g, ' ').trim();
          const po = (r['No PO'] || '').trim();
          const tgl = (r['Tanggal Input PO'] || '').trim();
          const qty = r['QTY PO (pcs)'] || 0;
          const brt = r['Berat PO (KG)'] || 0;
          const stkP = r['Stock (pcs)'] || 0;
          const stkK = r['Stock (kg)'] || 0;
          const osP = r['Sisa OS (pcs)'] || 0;
          const osK = r['Sisa OS (kg)'] || 0;
          const krm = r['Terkirim (PCS)'] || 0;
          const overStockP = r['Over Stock Gudang (PCS)'] || r['Over Produksi (PCS)'] || 0;
          const overStockK = r['Over Stock Gudang (KG)'] || r['Over Produksi (KG)'] || 0;
          const overKirimanP = r['Over Kiriman (PCS)'] || 0;
          const aging = calculatePoAging(tgl);
          const agingDays = aging.days >= 0 ? `${aging.days}h` : '-';
          const agingCat = aging.category; // SAFE | FOLLOW_UP | CRITICAL | UNKNOWN
          return `${rowNum}|${co}|${st}|${art}|${desc}|${po}|${tgl}|${qty}|${brt}|${stkP}|${stkK}|${osP}|${osK}|${krm}|${overStockP}|${overStockK}|${overKirimanP}|${agingDays}|${agingCat}`;
        })
        .join('\n');

      datasetContextText = `
Nama File Sumber: ${currentFileName || 'Dokumen_Excel.xlsx'}
Total Baris PO: ${records.length} Baris PO Terbaca Lengkap
Total Artikel Unik: ${summary.totalUniqueItems || '-'}
Total PO Status OPEN: ${summary.totalCOOpen || summary.openCount || records.filter((r: any) => r.coStatus === 'OPEN').length}
Total PO Status CLOSED: ${summary.totalCOClosed || summary.closedCount || records.filter((r: any) => r.coStatus === 'CLOSED').length}
Total Tonase Sisa OS: ${summary.totalSisaOSKg || summary.totalSisaKg ? ((summary.totalSisaOSKg || summary.totalSisaKg) / 1000).toFixed(2) + ' Ton (' + (summary.totalSisaOSKg || summary.totalSisaKg).toLocaleString() + ' kg)' : '-'}
Total Pcs Sisa OS: ${summary.totalSisaOSPcs || summary.totalSisaPcs ? (summary.totalSisaOSPcs || summary.totalSisaPcs).toLocaleString() + ' Pcs' : '-'}
Total Stok Gudang: ${summary.totalStockPcs ? summary.totalStockPcs.toLocaleString() + ' Pcs (' + (summary.totalStockKg || 0).toLocaleString() + ' kg)' : '-'}
Total Over Stock Gudang: ${summary.totalOverStockGudangPcs || summary.totalOverProduksiPcs || 0} Pcs (${summary.totalOverStockGudangKg || summary.totalOverProduksiKg || 0} kg) - Tersebar di ${confirmedOverStockItems.length} PO
Total Over Kiriman (SJ): ${summary.totalOverKirimanPcs || 0} Pcs (${summary.totalOverKirimanKg || 0} kg) - Tersebar di ${confirmedOverKirimanItems.length} PO
Estimasi Valuasi Sisa OS: ${summary.totalValue ? 'Rp ' + summary.totalValue.toLocaleString('id-ID') : '-'}

RINGKASAN RESMI KATEGORI UMUR PO (AGING PO HASIL KALKULASI SISTEM):
- Kategori "< 7 Hari (Aman / Baru)": ${agingSafeCount} PO
- Kategori "8 – 14 Hari (Follow Up)": ${agingFollowUpCount} PO
- Kategori "> 14 Hari (Kritis / Telat)": ${agingCriticalCount} PO
(CATATAN MUTLAK: Seluruh pembagian kategori umur di atas adalah hasil hitungan resmi sistem. DILARANG KERAS menghitung manual selisih tanggal kalender atau berasumsi tanggal referensi sendiri. Gunakan Kategori_Umur (SAFE/FOLLOW_UP/CRITICAL) dan Umur_Hari yang ada di tabel.)

DAFTAR RESMI ITEM OVER STOCK GUDANG (> 0 PCS):
${overStockListText}
(CATATAN MUTLAK: HANYA item-item di atas yang memiliki Over Stock Gudang! Di luar daftar ini, seluruh PO memiliki Over Stock = 0 pcs.)

DAFTAR RESMI ITEM OVER KIRIMAN / SURAT JALAN MELEBIHI PO (> 0 PCS):
${overKirimanListText}
(CATATAN MUTLAK: HANYA item-item di atas yang memiliki Over Kiriman SJ! Di luar daftar ini, seluruh PO memiliki Over Kiriman = 0 pcs.)

Seluruh Data Tabel ERP (Format Padat Kolom: Baris|CO|Status|Kode_Artikel|Deskripsi_Item|No_PO|Tgl_PO|Qty_PO_pcs|Berat_PO_kg|Stok_pcs|Stok_kg|Sisa_OS_pcs|Sisa_OS_kg|Terkirim_pcs|OverStockGudang_pcs|OverStockGudang_kg|OverKiriman_pcs|Umur_Hari|Kategori_Umur):
${tableRowsText}
${records.length > maxRowsToInclude ? `\n*(Catatan: Menampilkan ${maxRowsToInclude} dari ${records.length} PO)*` : ''}
`;
    }

    const systemInstruction = `Anda adalah "BlackEYE AI Assistant", asisten cerdas analisis data ERP logistik dan supply chain (dikembangkan oleh Kelvin).

PEDOMAN GAYA KOMUNIKASI & JAWABAN (SANGAT PENTING):
1. TO THE POINT & BEBAS BASA-BASI:
   - Langsung jawab ke inti data atau pertanyaan pengguna secara singkat, padat, dan jelas.
   - JANGAN SELALU MEMPERKENALKAN DIRI: Dilarang keras membuka jawaban dengan "Halo! Saya BlackEYE AI Assistant, develop by Kelvin..." pada setiap percakapan.
   - ATURAN PERKENALAN: Anda HANYA boleh menyapa atau memperkenalkan nama/pembuat ("Halo! Saya BlackEYE AI Assistant, dikembangkan oleh Kelvin") JIKA:
     a) Pengguna memulai dengan sapaan murni (seperti: "Halo", "Hai", "Hi", "Selamat pagi/siang", "P"), ATAU
     b) Pengguna secara spesifik menanyakan identitas (misal: "Siapa kamu?", "Siapa yang membuatmu?", "Kamu siapa?").
     Selain dua kondisi di atas, LANGSUNG berikan jawaban data yang diminta tanpa kalimat pembuka!
   - Hindari pengantar bertele-tele seperti "Berdasarkan analisis terhadap data ERP...", "Tentu, saya akan membantu Anda...", atau pengantar panjang lainnya. Langsung tulis ringkasan atau tabelnya.

2. ATURAN ANTI-HALUSINASI & KETELITIAN DATA 100%:
   - DILARANG KERAS MENGARANG ATAU MENEBAK DATA: Setiap jawaban harus 100% berakar pada fakta angka di tabel data di bawah.
   - JANGAN MENGANGGAP SEMUA STOK SEBAGAI OVER STOCK!
     * PERBEDAAN VITAL: "STOCK READY" vs "OVER STOCK GUDANG":
       - "STOCK READY": Barang fisik yang ada di gudang (kolom Stok_pcs > 0) untuk memenuhi pesanan yang belum terkirim (kolom Sisa_OS_pcs > 0).
         Contoh kasus nyata: Artikel "ST-D009-00001-A" (DOUBLE WALL DUMMY) memiliki Stok 100 pcs dan Sisa OS 100 pcs. Ini adalah STOCK READY MURNI (barang pesanan yang siap dikirim), BUKAN OVER STOCK! Kolom OverStockGudang_pcs nya adalah 0. Dilarang menyebut artikel ini sebagai over stock!
       - "OVER STOCK GUDANG": HANYA berlaku untuk artikel/PO yang memiliki nilai kolom OverStockGudang_pcs > 0 (stok fisik gudang yang melebihi kebutuhan PO Open). Selalu cek "DAFTAR RESMI ITEM OVER STOCK GUDANG" di atas.
       - "OVER KIRIMAN": HANYA berlaku jika kolom OverKiriman_pcs > 0 (Surat Jalan melebihi kuota PO).
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
     Gunakan angka resmi dari "RINGKASAN RESMI KATEGORI UMUR PO" dan filter baris berdasarkan kolom "Kategori_Umur" (SAFE/FOLLOW_UP/CRITICAL) atau "Umur_Hari".

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
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
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

          const stream = await ai.models.generateContentStream({
            model: modelName,
            contents,
            config: {
              systemInstruction,
              temperature: 0.2,
              maxOutputTokens: 2500,
            },
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
