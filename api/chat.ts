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
Estimasi Valuasi Sisa OS: ${summary.totalValue ? 'Rp ' + summary.totalValue.toLocaleString('id-ID') : '-'}

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
Anda adalah "BlackEYE AI Assistant", asisten ahli data ERP SYMIX, PPIC, dan Logistik Pergudangan.

PEDOMAN FORMAT JAWABAN (WAJIB DIIKUTI):
1. **TO THE POINT & STRUKTUR BERSIH**:
   - Jawab langsung ke inti pertanyaan secara jelas, ringkas, dan mudah dibaca tanpa basa-basi pembuka/penutup.
2. **HINDARI TEKS MEMANJANG KE SAMPING & DILARANG MEMBUAT TABEL IMITASI DENGAN TANDA '|'**:
   - DILARANG KERAS merangkai banyak data dalam satu baris panjang menggunakan pemisah pipa (misal: "Artikel | PO | Stok | Sisa OS | Status"). Ini sangat sulit dibaca!
   - DILARANG menggabungkan beberapa poin (bullet) ke dalam satu baris atau paragraf bersambung.
3. **ATURAN PEMILIHAN FORMAT (TABEL vs LIST)**:
   - **Gunakan TABEL MARKDOWN RESMI** jika menampilkan data dengan 3 atau lebih kolom informasi (seperti: Artikel, Ukuran, No PO, Stok, Sisa OS, Status). Web ini sudah mendukung render tabel interaktif yang sangat rapi!
     Contoh format tabel yang benar (selalu sertakan header dan newline antar baris):
     | No | Artikel | Ukuran | No PO | Stok Ready | Sisa OS | Status |
     |---|---|---|---|---|---|---|
     | 1 | SH-B011-00004-A | 1370X530 MM | PO.2026.09.00008 | 520 pcs | 520 pcs | OPEN |
   - **Gunakan LIST VERTIKAL KE BAWAH** hanya untuk data ringkas atau jika itemnya sedikit. Jika menggunakan list, buat struktur bertingkat ke bawah yang rapi tanpa tanda '|':
     - **SH-B011-00004-A** (1370X530 MM)
       • No PO: PO.2026.09.00008
       • Stok Ready: 520 pcs (156 kg)
       • Sisa OS: 520 pcs
       • Status: OPEN
4. **ANGKA, MATA UANG & NOTASI**:
   - Tampilkan angka dalam format ribuan yang jelas (misal: 10.100 pcs, 2.411 kg).
   - Format Penyingkatan Rupiah Indonesia (JANGAN gunakan 'M' untuk Juta!):
     • RB = Ribu (misal: Rp 500 RB)
     • JT = Juta (misal: Rp 268.4 JT)
     • M = Miliar (misal: Rp 1.5 M)
     • T = Triliun (misal: Rp 2.1 T)
   - Kategori Artikel: SH- (Sheet), ST- (Standard sheet), BX- (Box), DC- (Die-cut).
5. Jika data yang ditanyakan tidak ditemukan pada file, jawab singkat: "Data [nama/kode] tidak ditemukan pada tabel yang diunggah."
6. **INTEGRITAS DATA LENGKAP**:
   - Di antarmuka web, pengguna memiliki fitur kustomisasi untuk menyembunyikan (*hide*) Row/Kolom data tertentu (seperti 1. CO, 2. Artikel, 3. Item Description, dst) di layar untuk kenyamanan visual. Namun, kamu (AI Chatbot) tetap memiliki akses penuh terhadap seluruh data record PO asli. Jangan pernah menganggap data terhapus; jawablah dengan lengkap berdasarkan seluruh data konteks yang disediakan.

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
            maxOutputTokens: 2500, // cukup untuk tabel panjang & detail pesanan tanpa terpotong
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
