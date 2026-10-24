# UNIVERSAL AI CHATBOT REPLICATION SKILL & MASTER BLUEPRINT
> **Panduan 100% Akurat & Agnostik Konteks untuk Mereplikasi Fitur AI Chatbot Asisten ke Website / Web App Apapun (React, Next.js, Vite, Node.js).**

---

## DAFTAR ISI
1. [Prinsip Desain Visual & Palet Warna Presisi](#1-prinsip-desain-visual--palet-warna-presisi)
2. [Floating Launcher Button & Animasi Sinar Biru Searah Jarum Jam](#2-floating-launcher-button--animasi-sinar-biru-searah-jarum-jam)
3. [Arsitektur UI Pop-Up Modal / Drawer (4 Mode Ukuran)](#3-arsitektur-ui-pop-up-modal--drawer-4-mode-ukuran)
4. [Struktur Bubble Chat & Rendering Markdown](#4-struktur-bubble-chat--rendering-markdown)
5. [Carousel Quick-Prompts (Drag, Wheel & Touch)](#5-carousel-quick-prompts-drag-wheel--touch)
6. [Sistem Manajemen API Key (BYOK & Masking)](#6-sistem-manajemen-api-key-byok--masking)
7. [Engine Model & Hierarki Cascade 100% Zero-Downtime](#7-engine-model--hierarki-cascade-100-zero-downtime)
8. [Cooling-Down Circuit Breaker (Anti-Spam 429 & 503)](#8-cooling-down-circuit-breaker-anti-spam-429--503)
9. [Universal Context Engine (Anti-Halusinasi & Agnostik Konteks)](#9-universal-context-engine-anti-halusinasi--agnostik-konteks)
10. [Fluid 60FPS Streaming Ticker Engine (SSE)](#10-fluid-60fps-streaming-ticker-engine-sse)
11. [Master Prompt Siap Copy-Paste untuk AI Coding Agent](#11-master-prompt-siap-copy-paste-untuk-ai-coding-agent)
12. [Kode Referensi Lengkap (Frontend, Backend, & CSS)](#12-kode-referensi-lengkap-frontend-backend--css)

---

## 1. PRINSIP DESAIN VISUAL & PALET WARNA PRESISI

Desain chatbot ini mengadopsi estetika **Apple Liquid Glass 2.0 (True Translucent Glassmorphism)**:

### Kode Warna Resmi (Hex Tokens)
| Elemen | Kode Hex / Nilai CSS | Keterangan |
|---|---|---|
| **Primary Blue** | `#19719C` | Warna dominan tombol aksi, header asisten, border aktif |
| **Accent Sky Blue** | `#83B3CA` | Sinar ambient glow, badge aksen, hairline highlight |
| **Light Blue Gradient** | `#1F83B4` s/d `#19719C` | Avatar bot, tombol kirim liquid-glass, bubble chat pengguna |
| **Primary Text** | `#000013` (Dark Slate) | Teks jawaban asisten, judul pop-up (kontras tinggi) |
| **Secondary Text** | `#5C5C68` (Muted) | Subtitle, timestamp, placeholder input |
| **Glass Backdrop** | `rgba(255, 255, 255, 0.65 - 0.88)` | Tingkat transparansi dasar panel kaca |
| **Glass Blur** | `backdrop-filter: blur(24px) saturate(180%)` | Pembiasan kaca frosted asli |

---

## 2. FLOATING LAUNCHER BUTTON & ANIMASI SINAR BIRU SEARAH JARUM JAM

Ini adalah fitur visual paling khas: tombol floating pil berbentuk kapsul dengan **sinar laser biru terang yang berputar mengelilingi tepian border secara searah jarum jam (Clockwise Conic Beam)**, sementara bagian tengah kapsul tetap tembus pandang (*translucent glass*).

```
   ┌────────────────────────────────────────────────────────┐
───┤     Sinar Biru Bergerak Searah Jarum Jam (Clockwise)    ├───►
   └────────────────────────────────────────────────────────┘
          ┌──────────────────────────────────────────────┐
          │ ( 🤖 )  AI Assistant  ✨                     │
          │         Tanya Data Apapun                   │
          └──────────────────────────────────────────────┘
```

### Teknik CSS Masking Presisi
Agar bagian tengah kapsul tidak ikut tertutup warna gradien, digunakan teknik **CSS Mask Composite (Exclude / XOR)**:

```css
/* 1. Keyframe Putaran Searah Jarum Jam (0deg -> 360deg) */
@keyframes border-beam-clockwise {
  0% {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  100% {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

.animate-border-beam-clockwise {
  animation: border-beam-clockwise 3.5s linear infinite;
  will-change: transform;
}

/* 2. Badan Tombol Kaca Transparan */
.apple-liquid-glass-badge {
  position: relative;
  background: rgba(255, 255, 255, 0.52);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  box-shadow:
    inset 0 1.5px 2px 0 rgba(255, 255, 255, 0.95),
    inset 0 -1.5px 2px 0 rgba(0, 0, 19, 0.05),
    0 16px 36px -6px rgba(0, 0, 19, 0.12),
    0 4px 12px -2px rgba(25, 113, 156, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.45);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 3. Ring Perimeter Sinar Biru (Dibatasi hanya pada garis batas 2px) */
.liquid-glass-beam-ring {
  position: absolute;
  inset: -1px;
  border-radius: 9999px;
  padding: 2px;
  overflow: hidden;
  pointer-events: none;
  z-index: 20;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
}

/* 4. Halo Cahaya Luar */
.liquid-glass-beam-halo {
  position: absolute;
  inset: -3px;
  border-radius: 9999px;
  padding: 4px;
  overflow: hidden;
  pointer-events: none;
  z-index: 5;
  filter: blur(5px);
  opacity: 0.70;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
}
```

### Struktur JSX Tombol Floating:
```tsx
<button
  type="button"
  onClick={onOpen}
  className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 rounded-full group cursor-pointer transition-all duration-300 hover:scale-[1.04] active:scale-[0.97] select-none shadow-[0_16px_36px_-6px_rgba(0,0,19,0.14)]"
>
  {/* Badan Tombol */}
  <div className="relative z-10 apple-liquid-glass-badge p-2 sm:px-3.5 sm:py-2 flex items-center gap-2.5 sm:gap-3 rounded-full">
    {/* Refleksi Kilau Spekular 3D */}
    <div className="absolute inset-x-0 top-0 h-[48%] rounded-t-full pointer-events-none bg-gradient-to-b from-white/70 via-white/20 to-transparent" />

    {/* Avatar Bola Biru */}
    <div className="relative w-8 h-8 rounded-full bg-gradient-to-b from-[#1F83B4] to-[#19719C] flex items-center justify-center text-white shadow-md border border-white/40 shrink-0">
      <Bot className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
      {hasData && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-white animate-pulse" />
      )}
    </div>

    {/* Label Teks */}
    <div className="hidden sm:block text-left font-sans select-none">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-[#000013] tracking-tight">AI Assistant</span>
        <Sparkles className="w-3.5 h-3.5 text-[#19719C]" />
      </div>
      <span className="text-[10px] text-[#19719C] font-semibold block leading-tight">
        {dataLabel || 'Tanya Data Web'}
      </span>
    </div>
  </div>

  {/* Sinar Laser Biru Berputar Searah Jarum Jam */}
  <div className="liquid-glass-beam-ring" aria-hidden="true">
    <div
      className="absolute left-1/2 top-1/2 w-[340px] h-[340px] pointer-events-none animate-border-beam-clockwise"
      style={{
        background:
          'conic-gradient(from 0deg, transparent 0deg, transparent 265deg, rgba(25,113,156,0.3) 285deg, #19719C 305deg, #0284C7 325deg, #38BDF8 345deg, #BAE6FD 356deg, #FFFFFF 360deg)',
      }}
    />
  </div>

  {/* Halo Cahaya Luar */}
  <div className="liquid-glass-beam-halo" aria-hidden="true">
    <div
      className="absolute left-1/2 top-1/2 w-[340px] h-[340px] pointer-events-none animate-border-beam-clockwise"
      style={{
        background:
          'conic-gradient(from 0deg, transparent 0deg, transparent 280deg, #19719C 310deg, #0EA5E9 335deg, #38BDF8 350deg, #FFFFFF 360deg)',
      }}
    />
  </div>
</button>
```

---

## 3. ARSITEKTUR UI POP-UP MODAL / DRAWER (4 MODE UKURAN)

Drawer terbuka dari sudut kanan bawah dengan 4 mode ukuran:

| Mode | Ukuran Layar | Keterangan Penggunaan |
|---|---|---|
| **`mini`** | `w-full sm:w-[420px] h-[60vh] sm:h-[490px]` | Mengambang kecil agar pengguna tetap leluasa melihat data latar |
| **`compact` (Normal)** | `w-full sm:w-[520px] h-[88vh] sm:h-[660px]` | Ukuran default yang paling seimbang untuk tanya-jawab harian |
| **`wide` (Lebar)** | `w-full sm:w-[860px] md:w-[940px] h-[92vh] sm:h-[740px]` | Mode luas untuk menampilkan tabel analitika multi-kolom |
| **`fullscreen`** | `inset-0 sm:inset-5 w-full h-full` | Mode layar penuh tanpa distraksi |

### Tombol Switcher Ukuran di Header:
Menggunakan **Frosted Glass Segmented Tray (`.glass-segmented`)**:
- Tombol `Mini`
- Tombol `Normal` (Aktif: `.glass-segmented-active` putih solid + bayangan)
- Tombol `Lebar` (Ikon `Columns2`)
- Tombol `Layar Penuh` (Ikon `Maximize2` / `Minimize2`)

---

## 4. STRUKTUR BUBBLE CHAT & RENDERING MARKDOWN

### A. Bubble Pengguna (User Message)
- **Posisi:** Rata kanan (`items-end`).
- **Warna:** Gradien biru `bg-gradient-to-b from-[#1F83B4] to-[#19719C]` dengan teks putih.
- **Bentuk:** `rounded-2xl rounded-tr-xs p-3.5 shadow-md border border-white/30`.

### B. Layout Jawaban AI Assistant (Full Width Minimalist)
- **Bukan bubble sempit:** Menggunakan lebar penuh (`w-full`) agar tabel dan blok teks leluasa dibaca.
- **Header Asisten:**
  - Avatar bot kecil (`w-5 h-5 bg-[#83B3CA]/20 text-[#19719C] rounded-md`).
  - Label nama (misal: `APP ASSISTANT`).
  - Badge model yang digunakan (misal: `gemini-2.5-flash`).
  - **Tombol Salin Cepat (`Copy` / `Check`):** Berubah otomatis menjadi ikon centang hijau selama 2 detik saat diklik.
- **Tabel Markdown:**
  - Header tabel berwarna biru `#19719C` dengan teks putih tebal.
  - Baris zebra striping halus (`even:bg-white/40`) dengan hover highlight `hover:bg-[#83B3CA]/10`.
  - Font angka tabular monospaced (`font-mono tabular-nums`).
- **Kode Program (`pre` / `code`):**
  - Background gelap `bg-zinc-900/95` dengan teks hijau emerald `text-emerald-400`.
- **Indikator Mengetik Bouncing Dots:**
  - Teks: `"Sedang mengetik, tunggu yaa..."` dengan 3 titik memantul bergantian.

---

## 5. CAROUSEL QUICK-PROMPTS (DRAG, WHEEL & TOUCH)

Di atas form input terdapat baris rekomendasi pertanyaan cepat:
1. **Dukungan Scroll Tiga Jalur:**
   - Geser klik kiri mouse (*mouse drag-to-scroll* dengan cursor grab/grabbing).
   - Scroll roda mouse (*horizontal wheel tilt*).
   - Tombol panah kiri (`ChevronLeft`) dan kanan (`ChevronRight`) dengan efek fade disabled saat di ujung list.
2. **Chip Desain:** `liquid-glass-clear px-3.5 py-1.5 text-[11px] font-medium text-[#000013] hover:text-[#19719C]`.

---

## 6. SISTEM MANAJEMEN API KEY (BYOK & MASKING)

Fitur **Bring Your Own Key** memungkinkan siapa saja menggunakan aplikasi tanpa membebani kuota pemilik:

1. **Prioritas Resolusi Kunci (Dual-Layer):**
   - **Tingkat 1:** Header HTTP `x-gemini-api-key` (dari browser pengguna via `localStorage`).
   - **Tingkat 2:** `process.env.GEMINI_API_KEY` (kunci server lingkungan bawaan).
2. **Penyimpanan Lokal:** Kunci disimpan di peramban pengguna (`localStorage.getItem('user_gemini_key')`). Kunci privat **TIDAK PERNAH** disimpan ke database server.
3. **Masking Form:** `AIzaSyB3...••••••••...x9K2`.
4. **Animasi Ketik "Private API Key":**
   Badge status di header yang secara otomatis mengetik dan menghapus tulisan `"Private API Key"` secara terus-menerus dengan kursor berkedip untuk memberi sinyal visual bahwa kuota pribadi sedang aktif.

---

## 7. ENGINE MODEL & HIERARKI CASCADE 100% ZERO-DOWNTIME

### Daftar Urutan Model Resmi SDK `@google/genai`:
```typescript
const baseCandidateModels = [
  'gemini-2.5-flash',       // 1. Prioritas Utama: Paling cepat, TTFT ~250ms, hemat kuota
  'gemini-2.5-pro',         // 2. Fallback Analitik: Penalaran tinggi, tabel kompleks
  'gemini-2.0-flash',       // 3. Fallback Stabil: Jalur kuota terpisah
  'gemini-2.0-flash-lite',  // 4. Fallback Darurat: Ultra ringan saat beban tinggi
];
```

### Logika Cascade Multi-Model:
```typescript
for (const modelName of candidateModels) {
  try {
    const stream = await ai.models.generateContentStream({
      model: modelName,
      contents,
      config: {
        systemInstruction,
        temperature: 0.2, // Rendah untuk anti-halusinasi kalkulasi
        maxOutputTokens: 8192,
      }
    });
    // Jika stream berhasil dimulai, kirim event meta dan stream chunk
    // Keluar dari loop!
    return;
  } catch (err: any) {
    // Model terkena 429 atau 503 -> Tandai cooldown, otomatis coba model berikutnya!
    markModelCooldown(modelName, String(err));
    continue;
  }
}
```

---

## 8. COOLING-DOWN CIRCUIT BREAKER (ANTI-SPAM 429 & 503)

Sistem ini mencegah server membuang waktu mencoba model yang kuotanya sedang habis:

```typescript
const modelCooldownUntil = new Map<string, number>();

function markModelCooldown(modelName: string, errorString: string) {
  let durationMs = 5 * 60 * 1000; // Standar 5 menit

  if (errorString.includes('429') || errorString.includes('RESOURCE_EXHAUSTED')) {
    // Parsing header retry jika ada
    const match = errorString.match(/retry in\s+([0-9.]+)\s*s/i);
    durationMs = match ? (Math.ceil(parseFloat(match[1])) + 20) * 1000 : 10 * 60 * 1000; // 10 menit
  } else if (errorString.includes('503') || errorString.includes('UNAVAILABLE')) {
    durationMs = 3 * 60 * 1000; // 3 menit lonjakan traffic
  } else if (errorString.includes('Timeout')) {
    durationMs = 2 * 60 * 1000; // 2 menit timeout
  }

  modelCooldownUntil.set(modelName, Date.now() + durationMs);
}

function isModelInCooldown(modelName: string): boolean {
  const expiry = modelCooldownUntil.get(modelName);
  if (!expiry) return false;
  if (Date.now() >= expiry) {
    modelCooldownUntil.delete(modelName);
    return false; // Cooldown habis, siap dipakai kembali!
  }
  return true;
}
```

---

## 9. UNIVERSAL CONTEXT ENGINE (ANTI-HALUSINASI & AGNOSTIK KONTEKS)

### Mengapa AI Menjadi "Halu" Saat Dipindahkan ke Proyek Lain?
Kebanyakan developer melakukan **hardcode** pada prompt (misalnya: `"Anda adalah asisten stok barang"`). Ketika dipakai di web Jurnal Trading, Manajemen Karyawan, atau Toko Online, AI akan memaksakan konteks stok barang dan mengarang angka!

### Solusi: Universal Context Aggregator (Pre-Computed Ground Truth)
Fungsi backend ini menerima data JSON / Array / Objek apapun dari frontend, secara otomatis menganalisis tipe datanya, dan menghitung ringkasan matematika baku di server sebelum diserahkan ke AI:

```typescript
export function buildUniversalDataContext(dataset: any): string {
  if (!dataset) return 'Tidak ada data aktif yang dimuat.';

  // Kasus 1: Dataset berupa Array Objek (Tabel Baris/Kolom)
  if (Array.isArray(dataset) && dataset.length > 0) {
    const totalRows = dataset.length;
    const sample = dataset[0];
    const keys = Object.keys(sample);

    const numericStats: Record<string, { sum: number; avg: number; min: number; max: number }> = {};
    const categoricalStats: Record<string, Record<string, number>> = {};

    keys.forEach((key) => {
      const isNum = dataset.every((row) => row[key] === null || row[key] === undefined || !isNaN(Number(row[key])));
      if (isNum) {
        let sum = 0;
        let min = Infinity;
        let max = -Infinity;
        let count = 0;
        dataset.forEach((row) => {
          const val = Number(row[key]);
          if (!isNaN(val)) {
            sum += val;
            count++;
            if (val < min) min = val;
            if (val > max) max = val;
          }
        });
        numericStats[key] = {
          sum: Number(sum.toFixed(2)),
          avg: count > 0 ? Number((sum / count).toFixed(2)) : 0,
          min: min === Infinity ? 0 : min,
          max: max === -Infinity ? 0 : max,
        };
      } else {
        // Kategori diskrit (status, kategori, nama)
        const freq: Record<string, number> = {};
        dataset.forEach((row) => {
          const val = String(row[key] || '-');
          freq[val] = (freq[val] || 0) + 1;
        });
        categoricalStats[key] = freq;
      }
    });

    return `
=== GROUND TRUTH DATA STATISTIK TERVERIFIKASI (100% DETERMINISTIK) ===
Total Baris Data: ${totalRows}

Kalkulasi Numerik Otomatis (Gunakan angka ini, DILARANG MENGHITUNG ULANG SENDIRI):
${JSON.stringify(numericStats, null, 2)}

Distribusi Kategori & Status:
${JSON.stringify(categoricalStats, null, 2)}

Contoh 5 Baris Teratas Dataset:
${JSON.stringify(dataset.slice(0, 5), null, 2)}
======================================================================`;
  }

  // Kasus 2: Dataset berupa Objek Tunggal / Key-Value
  if (typeof dataset === 'object') {
    return `=== DOKUMEN DATA AKTIF ===\n${JSON.stringify(dataset, null, 2)}\n==========================`;
  }

  return String(dataset);
}
```

### Dynamic System Prompt Generator:
```typescript
function generateSystemInstruction(appName: string, domainTopic: string, targetLanguage: string) {
  return `
Anda adalah "${appName} AI Assistant", spesialis dalam domain ${domainTopic}.
Tugas utama Anda adalah membaca, menganalisis, dan menjawab pertanyaan pengguna berdasarkan DATA GROUND TRUTH yang disediakan.

KODE ETIK & PERATURAN MUTLAK:
1. ANTI-HALUSINASI ANGKA: Jangan pernah mengarang angka, kuantitas, atau persentase. Selalu rujuk pada bagian "GROUND TRUTH DATA STATISTIK".
2. FORMAT JAWABAN: Jika menyajikan data rekapitulasi atau komparasi, gunakan TABEL MARKDOWN yang rapi.
3. BATASAN PENGETAHUAN: Jika pengguna bertanya tentang data yang tidak ada di dalam ringkasan konteks, katakan dengan jujur bahwa data tersebut tidak tercantum dalam dokumen aktif.
4. TONE & SIKAP: Profesional, lugas, solutif, langsung menjawab inti pertanyaan tanpa basa-basi berlebih.
5. BAHASA: Jawab seluruhnya dalam ${targetLanguage}.
`;
}
```

---

## 10. FLUID 60FPS STREAMING TICKER ENGINE (SSE)

Menggunakan `requestAnimationFrame` di frontend untuk menghaluskan output Server-Sent Events:

```typescript
const pumpTicker = () => {
  if (displayedLength < targetText.length) {
    const distance = targetText.length - displayedLength;
    // Laju adaptif berdasarkan buffer jarak
    let step = 1;
    if (distance > 160) step = Math.min(distance, Math.ceil(distance / 6));
    else if (distance > 60) step = Math.min(distance, Math.ceil(distance / 10));
    else if (distance > 20) step = 3;
    else if (distance > 6) step = 2;
    else step = 1;

    displayedLength = Math.min(targetText.length, displayedLength + step);
    const currentSlice = targetText.slice(0, displayedLength);

    updateMessageBubble(currentSlice);
  }

  if (!isStreamFinished || displayedLength < targetText.length) {
    requestAnimationFrame(pumpTicker);
  }
};
```

---

## 11. MASTER PROMPT SIAP COPY-PASTE UNTUK AI CODING AGENT

> **Salin teks di bawah ini ke AI Coding Agent Anda (Claude, Cursor, ChatGPT, dsb.) saat membangun proyek baru:**

```markdown
Tolong implementasikan fitur AI Chatbot Assistant ke aplikasi web saya dengan spesifikasi 100% PERSIS sesuai blueprint berikut:

1. FLOATING LAUNCHER BUTTON (Apple Liquid Glass + Clockwise Border Beam):
- Tombol kapsul melayang di pojok kanan bawah (fixed bottom-5 right-5 z-40).
- Desain Apple Liquid Glass dengan background rgba(255,255,255,0.52), backdrop-blur 28px, dan kilau spekular 3D.
- WAJIB memiliki animasi sinar biru laser terang yang berputar SEARAH JARUM JAM sepanjang 2px garis border menggunakan:
  * conic-gradient(from 0deg, transparent 0deg, transparent 265deg, rgba(25,113,156,0.3) 285deg, #19719C 305deg, #0284C7 325deg, #38BDF8 345deg, #BAE6FD 356deg, #FFFFFF 360deg)
  * CSS Masking (-webkit-mask-composite: xor / mask-composite: exclude) agar bagian tengah tombol tetap 100% kaca tembus pandang.

2. POP-UP MODAL / DRAWER (4 Mode Ukuran):
- Mendukung 4 mode ukuran fleksibel:
  * mini (w-[420px] h-[60vh])
  * compact / normal (w-[520px] h-[88vh])
  * wide / lebar (w-[940px] h-[92vh])
  * fullscreen (inset-5 w-full h-full)
- Segmented control switcher kaca di header untuk beralih mode.
- Tombol aksi di header: Bersihkan Riwayat (Trash), Pengaturan API Key (Key), dan Tutup (X).

3. BUBBLE & LAYOUT CHAT:
- Bubble user: Rata kanan, gradien biru (#1F83B4 ke #19719C), teks putih.
- Bubble AI: Rata kiri, LEBAR PENUH (full width) tanpa kungkungan bubble sempit, header avatar bot + label nama + tombol Salin jawaban + badge nama model yang dipakai.
- Rendering markdown lengkap: tabel bergaya zebra dengan header biru #19719C, syntax highlight code block, dan list tebal.
- Quick prompts carousel di atas input dengan fitur drag mouse, horizontal wheel scroll, dan tombol panah kiri-kanan.

4. LOGIKA ENGINE GEMINI & MULTI-MODEL FALLBACK CASCADE (Backend /api/chat):
- Gunakan SDK resmi @google/genai dengan koneksi Server-Sent Events (SSE) streaming.
- Prioritas urutan model cascade:
  1. gemini-2.5-flash (Utama)
  2. gemini-2.5-pro (Fallback penalaran tinggi)
  3. gemini-2.0-flash (Fallback cadangan stabil)
  4. gemini-2.0-flash-lite (Fallback darurat)
- Sirkuit Cooldown (Circuit Breaker):
  * Jika model terkena 429 (Resource Exhausted), istirahatkan 10 menit.
  * Jika terkena 503, istirahatkan 3 menit.
  * Loop otomatis mencoba model berikutnya tanpa melempar error ke layar user.

5. KEAMANAN & BYOK (Bring Your Own Key):
- Prioritaskan header x-gemini-api-key dari client (disimpan di localStorage), fallback ke process.env.GEMINI_API_KEY.
- Modal input key dengan masking sensor (AIzaSy...***).
- Typewriter text animation badge "Private API Key" di header saat user memakai kunci sendiri.

6. UNIVERSAL CONTEXT ENGINE (AGNOSTIK KONTEKS & ANTI-HALUSINASI):
- Jangan hardcode prompt ke satu jenis industri.
- Buat fungsi pembaca dataset dinamis yang secara otomatis menghitung ground-truth numerik (Total, Rata-rata, Min/Max, Distribusi Kategori) dari objek/array data yang sedang aktif di web.
- Masukkan ground-truth terhitung ini ke dalam System Prompt dengan instruksi temperature 0.2 agar kalkulasi AI 100% akurat dan tidak pernah berhalusinasi.
```

---

## 12. KODE REFERENSI LENGKAP (FRONTEND, BACKEND, & CSS)

File implementasi hidup yang dapat Anda salin langsung dari repositori ini:
1. **Frontend Component:** `/src/components/AIChatDrawer.tsx`
2. **Backend Route & Universal Engine:** `/api/chat.ts`
3. **CSS Keyframes & Liquid Glass Styling:** `/src/index.css` (baris 50 s/d 344)

*Dokumentasi ini siap dijadikan referensi standar untuk implementasi di seluruh proyek web Anda berikutnya.*
