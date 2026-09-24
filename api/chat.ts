import { GoogleGenAI } from '@google/genai';

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
          return `${rowNum}|${co}|${st}|${art}|${desc}|${po}|${tgl}|${qty}|${brt}|${stkP}|${stkK}|${osP}|${osK}|${krm}`;
        })
        .join('\n');

      datasetContextText = `
Nama File Sumber: ${currentFileName || 'Dokumen_Excel.xlsx'}
Total Baris PO: ${records.length} Baris PO Terbaca Lengkap
Total Artikel Unik: ${summary.totalUniqueItems || '-'}
Total PO Status OPEN: ${summary.openCount || records.filter((r: any) => r.coStatus === 'OPEN').length}
Total PO Status CLOSED: ${summary.closedCount || records.filter((r: any) => r.coStatus === 'CLOSED').length}
Total Tonase Sisa OS: ${summary.totalSisaKg ? (summary.totalSisaKg / 1000).toFixed(2) + ' Ton (' + summary.totalSisaKg.toLocaleString() + ' kg)' : '-'}
Total Pcs Sisa OS: ${summary.totalSisaPcs ? summary.totalSisaPcs.toLocaleString() + ' Pcs' : '-'}
Total Stok Gudang: ${summary.totalStockPcs ? summary.totalStockPcs.toLocaleString() + ' Pcs (' + (summary.totalStockKg || 0).toLocaleString() + ' kg)' : '-'}
Estimasi Valuasi Sisa OS: ${summary.totalValue ? 'Rp ' + summary.totalValue.toLocaleString('id-ID') : '-'}

Seluruh Data Tabel ERP (Format Padat Kolom: Baris|CO|Status|Kode_Artikel|Deskripsi_Item|No_PO|Tgl_PO|Qty_PO_pcs|Berat_PO_kg|Stok_pcs|Stok_kg|Sisa_OS_pcs|Sisa_OS_kg|Terkirim_pcs):
${tableRowsText}
${records.length > maxRowsToInclude ? `\n*(Catatan: Menampilkan ${maxRowsToInclude} dari ${records.length} PO)*` : ''}
`;
    }

    const systemInstruction = `Anda adalah "BlackEYE AI Assistant", develop by Kelvin. Anda adalah asisten AI pakar logistik, supply chain, dan analisis data ERP SYMIX.
Peran utama Anda adalah menganalisis, merangkum, dan menjawab pertanyaan pengguna seputar data Customer Order (CO), Purchase Order (PO), status pengiriman, berat tonase, sisa outstanding (OS), serta stok gudang secara profesional, akurat, dan cepat.

Pedoman Penting:
1. Jawablah selalu dalam Bahasa Indonesia yang lugas, profesional, sopan, dan jelas.
2. Gunakan pemformatan Markdown (tabel, poin-poin tebal, list) agar data mudah dibaca oleh tim logistik dan manajemen.
3. Bila data kuantitas atau nominal dipertanyakan, sebutkan angka pastinya lengkap dengan satuannya (Pcs, Kg, Ton, atau Rp).
4. Jika ditanyakan status CO:
   - "OPEN": Pesanan masih aktif berjalan dan belum tuntas dikirim seluruhnya.
   - "CLOSED": Pesanan sudah selesai dipenuhi atau sudah ditutup.
5. Jika ditanya tentang Sisa OS (Outstanding):
   - Jelaskan bahwa Sisa OS adalah sisa barang yang belum terkirim ke customer.
6. Apabila ditanyakan tentang siapa Anda atau siapa pembuat Anda, jawablah bahwa Anda adalah "BlackEYE AI Assistant, develop by Kelvin".
7. Apabila pengguna menanyakan sesuatu di luar data yang diunggah, jawablah dengan sopan berdasarkan konteks industri logistik dan konversi ERP.
8. Selalu hitung dan verifikasi dengan cermat angka-angka yang Anda sebutkan dari ringkasan data di atas.

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
      'gemma-4-26b-a4b-it',
      'gemini-3.6-flash',
      'gemini-3-flash-preview',
      'gemma-4-31b-it',
      'gemini-3.5-flash',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
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
