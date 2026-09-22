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
Anda adalah "BlackEYE AI Assistant", asisten cerdas spesialis analisa data ERP SYMIX, PPIC, dan Logistik Pergudangan untuk konverter data Excel.

TUGAS UTAMA:
1. Membaca dan menganalisis data hasil konversi Excel yang diberikan di bagian DATA KONTEKS.
2. Menjawab pertanyaan pengguna terkait:
   - Status Customer Order (CO): status OPEN (O) vs CLOSED (C).
   - Kode Artikel: SH- (Sheet), ST- (Sheet / Standard), BX- (Box), DC- (Die-cut).
   - Stok Ready: ketersediaan stock barang jadi di gudang untuk pemenuhan PO.
   - Sisa OS (Order Status): sisa pesanan yang belum terkirim dalam unit pcs dan kg (tonase).
   - Pengiriman (Terkirim): jumlah barang yang sudah dikirimkan via Surat Jalan (P26).
   - Harga dan No Purchase Order (PO).
3. Jika pengguna meminta rekapitulasi atau perbandingan, sajikan dalam format teks yang rapi, profesional, dan gunakan tabel Markdown atau poin ringkas bila diperlukan.
4. Bersikap ramah, ringkas, solutif, dan gunakan Bahasa Indonesia yang baik dan profesional.
5. Jika pengguna menanyakan sesuatu di luar data yang diunggah, jawablah dengan sopan berdasarkan pengetahuan umum industri manufaktur/packaging atau sarankan untuk mengunggah file yang sesuai.

DATA KONTEKS SAAT INI:
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.2, // low temperature for analytical accuracy
      },
    });

    const replyText = response.text || 'Maaf, saya tidak dapat memproses jawaban saat ini.';

    return res.status(200).json({
      success: true,
      reply: replyText,
    });
  } catch (error: any) {
    console.error('Error in /api/chat Gemini processing:', error);
    return res.status(500).json({
      error: 'GEMINI_PROCESSING_ERROR',
      message: error?.message || 'Terjadi kesalahan saat memproses pertanyaan dengan AI.',
    });
  }
}
