import { GoogleGenAI } from '@google/genai';

/**
 * Vercel Serverless Function & Express Route Handler
 * Endpoint: POST /api/chat
 */
export default async function handler(req: any, res: any) {
  // Handle CORS if needed
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

  try {
    const { message, history = [], dataContext, currentFileName } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message tidak boleh kosong.' });
    }

    // Lazy initialization of Gemini API Key:
    // 1. First check header 'x-gemini-api-key' (if user configured client-side key)
    // 2. Then check environment variable process.env.GEMINI_API_KEY (Vercel Environment Variables)
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

      // Limit records in prompt to prevent token overflow if thousands of records, but include full statistical summary
      const sampleLimit = 150;
      const sampledRecords = records.slice(0, sampleLimit);

      datasetContextText = `
Nama File Sumber: ${currentFileName || 'Dokumen_Excel.xlsx'}
Total Baris PO: ${records.length}
Total Artikel Unik: ${summary.totalUniqueItems || '-'}
Total PO Status OPEN: ${summary.openCount || records.filter((r: any) => r.coStatus === 'OPEN').length}
Total PO Status CLOSED: ${summary.closedCount || records.filter((r: any) => r.coStatus === 'CLOSED').length}
Total Tonase Sisa OS: ${summary.totalSisaKg ? (summary.totalSisaKg / 1000).toFixed(2) + ' Ton (' + summary.totalSisaKg.toLocaleString() + ' kg)' : '-'}
Total Pcs Sisa OS: ${summary.totalSisaPcs ? summary.totalSisaPcs.toLocaleString() + ' Pcs' : '-'}
Total Stok Gudang: ${summary.totalStockPcs ? summary.totalStockPcs.toLocaleString() + ' Pcs (' + (summary.totalStockKg || 0).toLocaleString() + ' kg)' : '-'}

Daftar Data Record PO (Format JSON Singkat):
${JSON.stringify(
  sampledRecords.map((r: any) => ({
    CO: r.CO,
    status: r.coStatus,
    Artikel: r.Artikel,
    ItemDesc: r['Item Description'],
    NoPO: r['No PO'],
    TglPO: r['Tanggal Input PO'],
    QtyPO_pcs: r['QTY PO (pcs)'],
    BeratPO_kg: r['Berat PO (KG)'],
    Stock_pcs: r['Stock (pcs)'],
    Stock_kg: r['Stock (kg)'],
    SisaOS_pcs: r['Sisa OS (pcs)'],
    SisaOS_kg: r['Sisa OS (kg)'],
    Terkirim_pcs: r['Terkirim (PCS)'],
    Harga: r.Harga,
  })),
  null,
  2
)}
${records.length > sampleLimit ? `\n*(Catatan: Menampilkan ${sampleLimit} dari total ${records.length} PO dalam sampel context prompt)*` : ''}
`;
    }

    const systemInstruction = `
Anda adalah "BlackEYE AI Assistant", asisten data ERP SYMIX, PPIC, dan Logistik Pergudangan.

PEDOMAN PENTING & GAYA JAWABAN (HEMAT TOKEN):
1. **TO THE POINT & SINGKAT**: Jawab langsung ke inti pertanyaan atau data angka yang ditanyakan. Jangan ada basa-basi pembuka ("Tentu saya akan membantu...", "Berdasarkan data yang Anda berikan...") ataupun penutup klise ("Semoga membantu...").
2. **MAKSIMAL 2-4 KALIMAT** atau 1 tabel ringkas, kecuali jika pengguna secara eksplisit meminta penjelasan panjang atau rincian lengkap.
3. **FORMAT DATA**: Gunakan poin ringkas (bullet points) atau tabel Markdown kecil yang rapi untuk angka/kuantitas.
4. **DOMAIN DATA**:
   - Status Customer Order (CO): OPEN (O) vs CLOSED (C).
   - Kategori Artikel: SH- (Sheet), ST- (Standard sheet), BX- (Box), DC- (Die-cut).
   - Stok Ready: ketersediaan stock gudang untuk pemenuhan PO.
   - Sisa OS: sisa pesanan belum terkirim (pcs & kg/tonase).
   - Terkirim: akumulasi kirim Surat Jalan (P26).
5. Jika data yang ditanyakan tidak ditemukan pada file, jawab singkat: "Data [nama/kode] tidak ditemukan pada tabel yang diunggah."

DATA KONTEKS:
${datasetContextText}
`;

    // Format chat history into contents array for Gemini
    const contents: any[] = [];

    if (Array.isArray(history) && history.length > 0) {
      for (const h of history) {
        if (h && h.role && h.content) {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: String(h.content) }],
          });
        }
      }
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    // Multi-model fallback chain to handle Google server load spikes (503 / 429)
    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
    ];

    let lastError: any = null;
    let replyText = '';

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            temperature: 0.2, // low temperature for analytical accuracy
            maxOutputTokens: 800, // batasan output agar hemat token dan tidak bertele-tele
          },
        });

        if (response && response.text) {
          replyText = response.text;
          break; // successfully got response, exit loop
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} failed (${err?.message || err}), switching to next fallback...`);
      }
    }

    if (!replyText) {
      throw lastError || new Error('Semua model AI sedang sibuk. Silakan coba kembali.');
    }

    return res.status(200).json({
      success: true,
      reply: replyText,
    });
  } catch (error: any) {
    console.error('Error in /api/chat Gemini processing:', error);

    let friendlyMessage = error?.message || 'Terjadi kesalahan saat memproses pertanyaan dengan AI.';

    // Clean up raw JSON error messages from upstream Google API
    if (typeof friendlyMessage === 'string') {
      if (friendlyMessage.includes('503') || friendlyMessage.includes('high demand') || friendlyMessage.includes('UNAVAILABLE')) {
        friendlyMessage = 'Server Google AI sedang mengalami lonjakan trafik sementara (503). Silakan klik tombol "Coba Lagi" atau ulangi sesaat lagi.';
      } else if (friendlyMessage.includes('429') || friendlyMessage.includes('RESOURCE_EXHAUSTED')) {
        friendlyMessage = 'Batas kuota gratis harian tercapai atau terlalu cepat mengirim pesan. Silakan tunggu 30 detik lalu coba lagi.';
      }
    }

    return res.status(500).json({
      error: 'GEMINI_PROCESSING_ERROR',
      message: friendlyMessage,
    });
  }
}
