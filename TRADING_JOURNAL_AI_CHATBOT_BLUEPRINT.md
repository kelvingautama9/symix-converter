# Blueprint Arsitektur & Prompts: AI Trading Journal Assistant
> **Dokumentasi Komprehensif Desain UI/UX, Engine Model, Fallback System, Cooling-Down, Keamanan BYOK, dan Prompts Siap Pakai untuk Dashboard Jurnal Trading.**

---

## DAFTAR ISI
1. [Desain UI/UX & Pop-up Modal / Drawer](#1-desain-uiux--pop-up-modal--drawer)
   - [Mode Ukuran (Multi-Size Responsive)](#mode-ukuran-multi-size-responsive)
   - [Efek Kaca & Transparansi (Glassmorphism 2.0)](#efek-kaca--transparansi-glassmorphism-20)
   - [Fluid 60FPS Streaming Ticker Engine](#fluid-60fps-streaming-ticker-engine)
   - [Carousel Quick-Prompts (Drag & Wheel)](#carousel-quick-prompts-drag--wheel)
2. [Engine Model & Hierarchy Selection](#2-engine-model--hierarchy-selection)
   - [Daftar Prioritas Model](#daftar-prioritas-model)
   - [Konfigurasi Thinking Engine & Token](#konfigurasi-thinking-engine--token)
3. [Fallback System & Zero-Downtime Cascade](#3-fallback-system--zero-downtime-cascade)
   - [Alur Kerja Auto-Cascade](#alur-kerja-auto-cascade)
   - [Penanganan Error 429, 503, dan Timeout](#penanganan-error-429-503-dan-timeout)
4. [Cooling-Down System (Circuit Breaker In-Memory)](#4-cooling-down-system-circuit-breaker-in-memory)
   - [Arsitektur Cooldown Map](#arsitektur-cooldown-map)
   - [Durasi Isolasi Adaptif](#durasi-isolasi-adaptif)
5. [Keamanan & Manajemen API Key (BYOK)](#5-keamanan--manajemen-api-key-byok)
   - [Dual-Layer Key Resolution](#dual-layer-key-resolution)
   - [Masking & Penyimpanan Lokal Aman](#masking--penyimpanan-lokal-aman)
   - [Indikator UI "Private API Key" Typewriter](#indikator-ui-private-api-key-typewriter)
6. [Master System Prompt Khusus Jurnal Trading](#6-master-system-prompt-khusus-jurnal-trading)
   - [Persona & Kode Etik Analis](#persona--kode-etik-analis)
   - [Struktur Data Jurnal (Ground Truth Index)](#struktur-data-jurnal-ground-truth-index)
   - [Template Prompt Siap Pakai](#template-prompt-siap-pakai)
7. [Panduan Implementasi Kode (Full-Stack Blueprint)](#7-panduan-implementasi-kode-full-stack-blueprint)

---

## 1. DESAIN UI/UX & POP-UP MODAL / DRAWER

### Mode Ukuran (Multi-Size Responsive)
Chatbot dirancang dengan 4 mode dimensi fleksibel agar tidak menutupi chart atau tabel posisi trading yang sedang dianalisis:

```typescript
type ChatSizeMode = 'mini' | 'compact' | 'wide' | 'fullscreen';
```

1. **Mini Mode (`w-[420px] h-[60vh] max-h-[490px]`)**
   - **Tujuan:** Quick glance saat trader sedang memantau chart TradingView/broker.
   - **Posisi:** Melayang di kanan bawah (`fixed bottom-5 right-5`).
2. **Compact Mode (`w-[520px] h-[88vh] max-h-[660px]`)**
   - **Tujuan:** Mode standar untuk tanya-jawab harian, evaluasi 1-2 trade, atau konsultasi psikologi entry.
3. **Wide Mode (`w-[860px] md:w-[940px] h-[92vh] max-h-[740px]`)**
   - **Tujuan:** Full review mingguan/bulanan. Menampilkan tabel komparasi Risk:Reward (RR), distribusi win-rate, dan kurva equity.
4. **Fullscreen Mode (`inset-0 sm:inset-5 w-full h-full rounded-3xl`)**
   - **Tujuan:** Mode audit menyeluruh tanpa distraksi untuk analisis akhir pekan (*Weekend Market Preparation*).

---

### Efek Kaca & Transparansi (Glassmorphism 2.0)
Untuk dashboard trading (baik Dark Mode maupun Light Mode), transparansi kaca memberikan kedalaman estetika profesional tanpa mengurangi keterbacaan teks (*legibility*).

#### Spesifikasi Tailwind CSS:
- **Dark Theme (Trading Station):**
  ```css
  bg-zinc-950/80 backdrop-blur-2xl border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)]
  ```
- **Light Theme (Paper Journal):**
  ```css
  bg-white/85 backdrop-blur-2xl border border-white/80 shadow-[0_20px_60px_-15px_rgba(0,0,19,0.18)]
  ```
- **Ambient Ambient Gradient Glow:**
  Gunakan elemen radial di sudut kanan atas panel chat untuk kesan modern:
  ```html
  <div class="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-transparent rounded-bl-full pointer-events-none" />
  ```

---

### Fluid 60FPS Streaming Ticker Engine
Masalah umum chatbot AI adalah teks yang muncul "menyentak" (*chunk popping*) saat chunk SSE tiba dari server. Blueprint ini menggunakan **Adaptive 60FPS Micro-Ticker** dengan `requestAnimationFrame`:

```typescript
// Client-side ticker smoother
const pumpTicker = () => {
  if (displayedLength < targetText.length) {
    const distance = targetText.length - displayedLength;
    // Langkah adaptif: halus saat dekat ujung, cepat saat ada burst data besar
    let step = 1;
    if (distance > 160) step = Math.min(distance, Math.ceil(distance / 6));
    else if (distance > 60) step = Math.min(distance, Math.ceil(distance / 10));
    else if (distance > 20) step = 3;
    else if (distance > 6) step = 2;
    else step = 1;

    displayedLength = Math.min(targetText.length, displayedLength + step);
    setCurrentSlice(targetText.slice(0, displayedLength));
  }
  if (!isStreamFinished || displayedLength < targetText.length) {
    requestAnimationFrame(pumpTicker);
  }
};
```
**Hasil:** Efek ketikan tampak sangat alami seperti manusia mengetik dengan kecepatan tinggi, tanpa jeda atau gerakan patah-patah.

---

### Carousel Quick-Prompts (Drag & Wheel)
Di atas kolom input chat, sediakan deretan tombol saran cepat (*quick chips*) khusus trading yang mendukung:
- **Mouse Drag-to-Scroll** (geser horizontal dengan drag mouse).
- **Mouse Wheel Tilt** (scroll horizontal menggunakan roda mouse).
- **Tombol Navigasi Panah Kiri/Kanan** yang muncul otomatis jika konten meluap (*overflow*).

**Contoh Quick Chips Jurnal Trading:**
1. 📊 *Hitung Win Rate & Profit Factor minggu ini*
2. ⚠️ *Deteksi trade yang melanggar Stop Loss*
3. 🧠 *Evaluasi psikologi & revenge trading*
4. ⚖️ *Audit Risk-to-Reward (RR) rata-rata*
5. 🏆 *Review trade terbaik vs trade terburuk*

---

## 2. ENGINE MODEL & HIERARCHY SELECTION

Untuk aplikasi keuangan dan analitika jurnal trading, urutan model harus menyeimbangkan **kecepatan respons (Time-to-First-Token)** dan **keakuratan logika matematika**.

### Daftar Prioritas Model (Google GenAI SDK `@google/genai`)

| Prioritas | Nama Model | Kegunaan Utama | Alasan Pemilihan |
|---|---|---|---|
| **Tier 1 (Utama)** | `gemini-2.5-flash` | Analisis harian & streaming cepat | Sangat cepat (TTFT ~250ms), hemat kuota, cerdas dalam membaca JSON/tabel |
| **Tier 2 (Fallback 1)** | `gemini-2.5-pro` | Audit mendalam, kalkulasi multi-tahap | Penalaran tinggi (*deep reasoning*), terbaik untuk evaluasi portofolio kompleks |
| **Tier 3 (Fallback 2)** | `gemini-2.0-flash` | Cadangan stabil berkecepatan tinggi | Kuota terpisah dari seri 2.5, sangat andal saat jam sibuk server |
| **Tier 4 (Fallback 3)** | `gemini-2.0-flash-lite` | Darurat saat kuota menipis | Sangat hemat token, respons instan untuk query ringan |

### Konfigurasi Thinking Engine & Token

```typescript
const streamConfig = {
  systemInstruction: TRADING_SYSTEM_INSTRUCTION,
  temperature: 0.2, // Rendah untuk kepastian angka & disiplin analitikal (anti-halusinasi)
  maxOutputTokens: 8192, // Mencegah pemotongan tabel rekapitulasi panjang
  thinkingConfig: {
    thinkingLevel: ThinkingLevel.LOW // LOW untuk kecepatan interaksi chat; gunakan HIGH hanya untuk evaluasi tahunan
  }
};
```

---

## 3. FALLBACK SYSTEM & ZERO-DOWNTIME CASCADE

Ketika pengguna sedang trading aktif di pasar yang bergerak cepat, chatbot tidak boleh menampilkan pesan "Error 500" atau "Quota Exceeded". Sistem harus berpindah model secara otomatis di belakang layar.

### Alur Kerja Auto-Cascade

```
[Request Pengguna]
       │
       ▼
[Cek Model Cooldown Map] ──> Filter model yang sedang diistirahatkan
       │
       ▼
[Coba Model Prioritas 1 (gemini-2.5-flash)]
       │
   Sukses? ──YES──> Stream SSE ke Client (Header: event: meta, modelUsed)
       │
      NO (429 / 503 / Timeout)
       │
       ▼
[Tandai Model 1 Masuk Cooldown Map]
       │
       ▼
[Otomatis Coba Model Prioritas 2 (gemini-2.5-pro)]
       │
   Sukses? ──YES──> Stream SSE ke Client
       │
      NO ──> Lanjut ke Tier 3 (gemini-2.0-flash) ...
```

---

## 4. COOLING-DOWN SYSTEM (CIRCUIT BREAKER IN-MEMORY)

Sistem ini mencegah server membuang-buang waktu mencoba model yang jelas-jelas sedang limit (HTTP 429) atau sedang down (HTTP 503).

### Implementasi Circuit Breaker (`api/chat.ts`)

```typescript
const modelCooldownUntil = new Map<string, number>();

export function markModelCooldown(modelName: string, errorString: string) {
  let durationMs = 5 * 60 * 1000; // Standar 5 menit

  if (errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED')) {
    // Cek apakah ada header retry-after dari API
    const match = errorString.match(/retry in\s+([0-9.]+)\s*s/i);
    if (match && match[1]) {
      durationMs = (Math.ceil(parseFloat(match[1])) + 20) * 1000;
    } else {
      durationMs = 10 * 60 * 1000; // Istirahatkan 10 menit untuk kuota harian habis
    }
  } else if (errorString.includes('503') || errorString.includes('UNAVAILABLE')) {
    durationMs = 3 * 60 * 1000; // Istirahatkan 3 menit untuk lonjakan server
  } else if (errorString.includes('Timeout')) {
    durationMs = 2 * 60 * 1000; // Istirahatkan 2 menit untuk timeout jaringan
  }

  modelCooldownUntil.set(modelName, Date.now() + durationMs);
  console.warn(`[Circuit Breaker] Model ${modelName} diistirahatkan ${durationMs / 1000} detik.`);
}

export function isModelInCooldown(modelName: string): boolean {
  const expiry = modelCooldownUntil.get(modelName);
  if (!expiry) return false;
  if (Date.now() >= expiry) {
    modelCooldownUntil.delete(modelName); // Otomatis aktif kembali saat masa isolasi habis
    return false;
  }
  return true;
}
```

---

## 5. KEAMANAN & MANAJEMEN API KEY (BYOK)

Fitur **BYOK (Bring Your Own Key)** sangat penting bagi aplikasi trading personal agar trader tidak terikat limit kuota publik aplikasi.

### Dual-Layer Key Resolution
1. **Prioritas 1 (Private Key):** Header `x-gemini-api-key` yang dikirim dari browser pengguna. Jika ada, backend langsung menggunakan key pribadi ini.
2. **Prioritas 2 (Shared Server Key):** Jika user tidak memasukkan key pribadi, sistem menggunakan `process.env.GEMINI_API_KEY` dari server/Vercel.

### Masking & Penyimpanan Lokal Aman
- Key hanya disimpan di `localStorage` peramban lokal (`blackeye_trading_gemini_key`).
- Pada form pengaturan, key selalu di-mask: `AIzaSyB3...••••••••••••••••...x9K2`.
- Tambahkan tombol "Tes Koneksi & Validasi Key" sebelum disimpan.

### Indikator UI "Private API Key" Typewriter
Saat user menggunakan key sendiri, tampilkan badge minimalis dengan animasi mesin ketik di pojok header chat:

```tsx
const TypingPrivateApiKey = () => {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-mono text-emerald-600">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
      <span>Private API Key</span>
    </span>
  );
};
```

---

## 6. MASTER SYSTEM PROMPT KHUSUS JURNAL TRADING

Gunakan system prompt berikut sebagai instruksi dasar model untuk menghasilkan analisa layaknya **Head Risk Manager** di hedge fund profesional:

```markdown
Anda adalah "TRADEVISION AI" - Senior Trading Performance Analyst & Risk Management Mentor profesional.
Tugas utama Anda adalah mengevaluasi jurnal trading pengguna, mengaudit kedisiplinan eksekusi aturan, menghitung metrik statistik performa, serta membimbing psikologi trading secara objektif dan berbasis data murni.

=======================================================
1. KODE ETIK & PERILAKU ANALIS:
=======================================================
- Anda BUKAN sinyal generator masa depan. Anda adalah AUDITOR PERFORMA MASA LALU dan RISK MANAGER.
- JANGAN PERNAH menyarankan "Beli sekarang" atau "Jual instrumen X di harga Y". Fokuskan analisa pada:
  * Kepatuhan terhadap Trading Plan
  * Rasio Risk-to-Reward (RR) riil vs terencana
  * Efisiensi Win Rate vs Profit Factor
  * Gejala psikologis: Overtrading, Revenge Trading, Moving Stop Loss, Early Exit.
- Berbicara dengan nada: Tenang, objektif, disiplin, konstruktif, dan berbasis fakta matematika.

=======================================================
2. FORMULA MATEMATIKA BAKU (WAJIB AKURAT 100%):
=======================================================
- Win Rate (%) = (Total Trade Menang / Total Trade Selesai) * 100
- Profit Factor = Total Gross Profit ($/Rp) / Total Gross Loss ($/Rp)
  * > 2.0 = Sangat Unggul (Exceptional)
  * 1.5 - 2.0 = Bagus (Healthy profitable)
  * 1.0 - 1.4 = Rawan Breakeven (High commission sensitivity)
  * < 1.0 = Sistem Merugi (Losing Strategy)
- Average RR = Rata-rata ($ Keuntungan per Trade Menang / $ Kerugian per Trade Kalah)
- Expectancy ($ per trade) = (Win Rate * Avg Win) - (Loss Rate * Avg Loss)

=======================================================
3. FORMAT PENYAJIAN TABEL AUDIT:
=======================================================
Setiap kali pengguna meminta rekap atau audit performa, sajikan tabel ringkas dengan format Markdown:

| Metrik Trading | Nilai Statistik | Status / Keterangan | Rekomendasi Tindakan |
|---|---|---|---|
| Total Trades | 18 Trade | Sampel Cukup | Pertahankan konsistensi jurnal |
| Win Rate | 55.5% | Stabil | Kombinasikan dengan RR >= 1:2 |
| Profit Factor | 1.85 | Sehat & Menguntungkan | Hindari memperbesar lot drastis |
| Avg Risk:Reward | 1 : 2.1 | Sangat Baik | Biarkan pemenang berjalan hingga TP |
| Max Consecutive Loss | 3 Trade | Wajar | Batasi max 2 trade/hari saat draw |

=======================================================
4. DETEKSI ANOMALI PSIKOLOGI TRADER:
=======================================================
Jika mendeteksi salah satu kondisi berikut dalam riwayat jurnal:
1. Trade beruntun dalam selang waktu < 10 menit setelah trade loss -> Tandai sebagai "REVENGE TRADING ALERT".
2. Kerugian pada trade tertentu > 2.5x dari rata-rata kerugian normal -> Tandai sebagai "STOP LOSS VIOLATION / OVERLEVERAGE".
3. Frekuensi trade meningkat tajam di sesi tertentu dibanding hari biasa -> Tandai sebagai "OVERTRADING SYNDROME".

Berikan saran psikologi yang menenangkan, dorong trader untuk istirahat sejenak dari layar (Step away from the chart).
```

---

## 7. PANDUAN IMPLEMENTASI KODE (FULL-STACK BLUEPRINT)

### A. Endpoint Backend (`/api/chat.ts` - Node.js Express / Vercel Serverless)

```typescript
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  const { message, history = [], journalData } = req.body;
  const apiKey = req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(401).json({ error: 'API_KEY_REQUIRED' });
  }

  const ai = new GoogleGenAI({ apiKey });

  // Format data konteks trade ke dalam prompt
  const dataContextPrompt = `
DATA JURNAL TRADING AKTIF:
- Total Trade Tercatat: ${journalData?.trades?.length || 0}
- Data JSON Ringkasan:
${JSON.stringify(journalData?.summary || {}, null, 2)}
`;

  // Setup Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const candidateModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];

  for (const model of candidateModels) {
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: [
          ...history.map((h: any) => ({ role: h.role, parts: [{ text: h.content }] })),
          { role: 'user', parts: [{ text: `${dataContextPrompt}\n\nPertanyaan: ${message}` }] }
        ],
        config: {
          systemInstruction: 'Anda adalah Senior Trading Analyst...',
          temperature: 0.2,
        }
      });

      res.write(`event: meta\ndata: ${JSON.stringify({ modelUsed: model })}\n\n`);

      for await (const chunk of stream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }

      res.write(`event: done\ndata: {}\n\n`);
      return res.end();
    } catch (err: any) {
      console.error(`Model ${model} gagal, mencoba model berikutnya...`, err?.message);
      // Lanjut ke loop model berikutnya secara otomatis
    }
  }

  res.write(`event: error\ndata: ${JSON.stringify({ message: 'Semua model sedang sibuk. Coba sesaat lagi.' })}\n\n`);
  res.end();
}
```

---

## Ringkasan Fitur Unggulan untuk Dashboard Jurnal Trading Anda
1. **Multi-Size Pop-up:** Trader bisa mengecilkan chat saat melihat chart, dan memperbesarnya saat weekend review.
2. **Kaca Modern (Glassmorphism 2.0):** Memberikan tampilan terminal trading mewah (*Bloomberg / TradingView style*).
3. **Tanpa Macet / Zero Layout Shift:** Berjalan di thread SSE independen dengan 60FPS micro-ticker.
4. **Keamanan BYOK:** Trader leluasa memakai API Key Gemini gratis mereka sendiri tanpa takut limit aplikasi dipakai bersama.
5. **Anti Halusinasi Angka:** Temperature 0.2 memastikan kalkulasi Win Rate, PnL, dan Risk-to-Reward selalu akurat.
