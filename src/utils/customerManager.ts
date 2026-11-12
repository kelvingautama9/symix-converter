import * as XLSX from 'xlsx';

/**
 * Customer Data Manager & Artikel Code Parser
 * Mengelola kamus "Data Customer" (Kode Customer -> Nama Customer)
 * Mendukung fitur CRUD (Tambah, Edit, Hapus) serta Import Excel (.xlsx / .xls)
 * Tersimpan otomatis di browser (LocalStorage) dengan default built-in.
 */

export interface CustomerMapping {
  code: string; // e.g. "P008", "C002", "D009", "D012", "M003", "G003"
  name: string; // e.g. "PT. PURBAYASA PUTRAPERKASA", "PT. GAMA INTI WAHANA"
  note?: string; // Opsional (disimpan untuk kompatibilitas data lama)
  updatedAt?: number;
}

export const CUSTOMER_STORAGE_KEY = 'rekap_sales_customer_data_v1';

/**
 * Daftar default bawaan Data Customer sesuai standar ERP
 */
export const DEFAULT_CUSTOMER_MAPPINGS: CustomerMapping[] = [
  { code: 'P008', name: 'PT. PURBAYASA PUTRAPERKASA' },
  { code: 'C002', name: 'PT. CENTURI KEMAS' },
  { code: 'D009', name: 'PT. DWI GLOBAL MEGABOX' },
  { code: 'D012', name: 'PT. DHARMA ANUGRAH PERKASA' },
  { code: 'M003', name: 'PT. MASTERCORRINDO' },
];

/**
 * Normalisasi Kode Customer secara cerdas (Smart Code Normalization):
 * - Jika sudah pas 4 karakter: 1 huruf + 3 digit (contoh: G003, P008, D012, B011),
 *   TIDAK PERLU di-parsing lagi, langsung kembalikan as-is.
 * - Jika format ERP dengan digit berlebih (contoh: G000003, P000008, S000046, D000012, T000023, I000015):
 *   Ambil huruf awal dan nomor intinya, lalu bentuk menjadi 1 huruf + 3 digit (contoh: G000003 -> G003, S000046 -> S046).
 * - Menangani 2-3 huruf awal (contoh: AB000012 -> AB012).
 */
export function normalizeCustomerCode(rawCode: any): string {
  if (rawCode === null || rawCode === undefined) return '';
  const clean = String(rawCode).trim().toUpperCase();
  if (!clean) return '';

  // 1. Jika sudah pas 4 karakter: 1 huruf + 3 digit (contoh: G003, P008, D012, S028, B011)
  if (/^[A-Z]\d{3}$/.test(clean)) {
    return clean;
  }

  // 2. Jika 1 huruf diikuti digit berlebih (contoh: G000003 -> G003, P000008 -> P008, S000046 -> S046)
  const singleLetterMatch = clean.match(/^([A-Z])0*(\d+)$/);
  if (singleLetterMatch) {
    const letter = singleLetterMatch[1];
    const num = parseInt(singleLetterMatch[2], 10);
    return `${letter}${String(num).padStart(3, '0')}`;
  }

  // 3. Jika 2-3 huruf diikuti digit berlebih (contoh: AB000012 -> AB012)
  const multiLetterMatch = clean.match(/^([A-Z]{2,3})0*(\d+)$/);
  if (multiLetterMatch) {
    const letters = multiLetterMatch[1];
    const num = parseInt(multiLetterMatch[2], 10);
    return `${letters}${String(num).padStart(3, '0')}`;
  }

  // 4. Jika format khusus lain, bersihkan spasi
  return clean.replace(/\s+/g, '');
}

/**
 * Membaca data customer yang tersimpan di LocalStorage (dengan fallback ke default bawaan)
 */
export function getCustomerMappings(): CustomerMapping[] {
  if (typeof window === 'undefined') {
    return DEFAULT_CUSTOMER_MAPPINGS;
  }

  try {
    const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(DEFAULT_CUSTOMER_MAPPINGS));
      return DEFAULT_CUSTOMER_MAPPINGS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Pastikan semua kode dinormalisasi
      return parsed.map((item) => ({
        ...item,
        code: normalizeCustomerCode(item.code) || item.code,
      }));
    }
    return DEFAULT_CUSTOMER_MAPPINGS;
  } catch (err) {
    console.warn('Gagal membaca Data Customer dari localStorage, menggunakan default:', err);
    return DEFAULT_CUSTOMER_MAPPINGS;
  }
}

/**
 * Menyimpan seluruh daftar data customer ke LocalStorage
 */
export function saveCustomerMappings(mappings: CustomerMapping[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(mappings));
    window.dispatchEvent(new Event('customer-data-updated'));
  } catch (err) {
    console.error('Gagal menyimpan Data Customer ke localStorage:', err);
  }
}

/**
 * Menambah atau memperbarui Data Customer (Upsert)
 */
export function upsertCustomerMapping(
  code: string,
  name: string
): CustomerMapping[] {
  const current = getCustomerMappings();
  const cleanCode = normalizeCustomerCode(code);
  const cleanName = name.trim();

  if (!cleanCode || !cleanName) {
    throw new Error('Kode Customer dan Nama Customer tidak boleh kosong.');
  }

  const existingIdx = current.findIndex(
    (c) => normalizeCustomerCode(c.code) === cleanCode
  );
  let updated: CustomerMapping[];

  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = {
      ...updated[existingIdx],
      code: cleanCode,
      name: cleanName,
      updatedAt: Date.now(),
    };
  } else {
    updated = [
      ...current,
      {
        code: cleanCode,
        name: cleanName,
        updatedAt: Date.now(),
      },
    ];
  }

  // Urutkan berdasarkan Kode secara ascending
  updated.sort((a, b) => a.code.localeCompare(b.code));
  saveCustomerMappings(updated);
  return updated;
}

/**
 * Mengedit Data Customer yang sudah ada (bisa mengubah kode dan nama)
 */
export function editCustomerMapping(
  oldCode: string,
  newCode: string,
  newName: string
): CustomerMapping[] {
  const current = getCustomerMappings();
  const cleanOldCode = normalizeCustomerCode(oldCode);
  const cleanNewCode = normalizeCustomerCode(newCode);
  const cleanNewName = newName.trim();

  if (!cleanNewCode || !cleanNewName) {
    throw new Error('Kode Customer dan Nama Customer tidak boleh kosong.');
  }

  // Cek apakah kode baru sudah dipakai oleh data lain
  if (cleanNewCode !== cleanOldCode) {
    const isConflict = current.some(
      (c) => normalizeCustomerCode(c.code) === cleanNewCode
    );
    if (isConflict) {
      throw new Error(`Kode Customer "${cleanNewCode}" sudah digunakan oleh customer lain.`);
    }
  }

  const updated = current.map((item) => {
    if (normalizeCustomerCode(item.code) === cleanOldCode) {
      return {
        ...item,
        code: cleanNewCode,
        name: cleanNewName,
        updatedAt: Date.now(),
      };
    }
    return item;
  });

  updated.sort((a, b) => a.code.localeCompare(b.code));
  saveCustomerMappings(updated);
  return updated;
}

/**
 * Menghapus Data Customer berdasarkan Kode
 */
export function deleteCustomerMapping(code: string): CustomerMapping[] {
  const current = getCustomerMappings();
  const cleanCode = normalizeCustomerCode(code);
  const updated = current.filter(
    (c) => normalizeCustomerCode(c.code) !== cleanCode
  );
  saveCustomerMappings(updated);
  return updated;
}

/**
 * Mengembalikan Data Customer ke daftar default bawaan
 */
export function resetCustomerMappingsToDefault(): CustomerMapping[] {
  saveCustomerMappings(DEFAULT_CUSTOMER_MAPPINGS);
  return DEFAULT_CUSTOMER_MAPPINGS;
}

/**
 * Hasil proses impor Data Customer dari Excel
 */
export interface CustomerImportResult {
  success: boolean;
  totalRowsProcessed: number;
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  totalNow: number;
  message: string;
  importedItems: CustomerMapping[];
}

/**
 * Mengimpor Data Customer dari file Excel (.xlsx / .xls / .csv)
 * Menerima file yang memiliki kolom:
 * - Kolom A: Code / Kode (contoh: P000008, S000046, G000003, G003, D012)
 * - Kolom B: Customers / Customer / Nama Customer (contoh: PT. PURBAYASA PUTRAPERKASA)
 * Otomatis menormalisasi kode berlebih 7 digit (G000003 -> G003) dan menyimpan ke LocalStorage.
 */
export async function importCustomerMappingsFromExcel(file: File): Promise<CustomerImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('File Excel tidak memuat lembar kerja (worksheet) yang valid.');
  }

  // Gunakan sheet pertama
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Konversi ke array of arrays
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('File Excel kosong atau tidak memiliki data.');
  }

  // Deteksi letak baris header dan index kolom
  let headerRowIndex = 0;
  let codeColIndex = 0;
  let nameColIndex = 1;
  let foundHeader = false;

  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || '').trim().toLowerCase();
      if (cellText === 'code' || cellText === 'kode' || cellText.includes('kode customer')) {
        codeColIndex = c;
        foundHeader = true;
        headerRowIndex = r;
      }
      if (
        cellText === 'customers' ||
        cellText === 'customer' ||
        cellText === 'nama customer' ||
        cellText === 'name' ||
        cellText.includes('nama pelanggan')
      ) {
        nameColIndex = c;
        foundHeader = true;
        headerRowIndex = r;
      }
    }

    if (foundHeader && codeColIndex !== nameColIndex) {
      break;
    }
  }

  const startRow = foundHeader ? headerRowIndex + 1 : 0;
  const current = getCustomerMappings();
  const mapByCode = new Map<string, CustomerMapping>();

  // Masukkan data yang sudah ada ke map
  current.forEach((item) => {
    const norm = normalizeCustomerCode(item.code);
    if (norm) {
      mapByCode.set(norm, { ...item, code: norm });
    }
  });

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let totalRowsProcessed = 0;
  const importedList: CustomerMapping[] = [];

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    const rawCode = row[codeColIndex];
    const rawName = row[nameColIndex];

    const cleanCode = normalizeCustomerCode(rawCode);
    const cleanName = String(rawName || '').trim();

    // Lewati baris jika kode atau nama kosong
    if (!cleanCode || !cleanName) {
      skippedCount++;
      continue;
    }

    totalRowsProcessed++;

    if (mapByCode.has(cleanCode)) {
      // Update data jika nama berbeda
      const existing = mapByCode.get(cleanCode)!;
      if (existing.name !== cleanName) {
        mapByCode.set(cleanCode, {
          ...existing,
          code: cleanCode,
          name: cleanName,
          updatedAt: Date.now(),
        });
        updatedCount++;
      } else {
        skippedCount++;
      }
    } else {
      // Tambah baru
      const newItem: CustomerMapping = {
        code: cleanCode,
        name: cleanName,
        updatedAt: Date.now(),
      };
      mapByCode.set(cleanCode, newItem);
      addedCount++;
    }

    importedList.push({
      code: cleanCode,
      name: cleanName,
    });
  }

  // Simpan seluruh data yang telah digabung ke LocalStorage
  const resultList = Array.from(mapByCode.values());
  resultList.sort((a, b) => a.code.localeCompare(b.code));
  saveCustomerMappings(resultList);

  return {
    success: true,
    totalRowsProcessed,
    addedCount,
    updatedCount,
    skippedCount,
    totalNow: resultList.length,
    message: `Berhasil mengimpor: ${addedCount} baru ditambahkan, ${updatedCount} diperbarui. Total kini ${resultList.length} customer tersimpan.`,
    importedItems: importedList,
  };
}

/**
 * Mengunduh template Excel untuk import Data Customer
 */
export function downloadCustomerTemplateExcel(): void {
  const templateData = [
    ['Code', 'Customers'],
    ['P000008', 'PT. PURBAYASA PUTRAPERKASA'],
    ['S000046', 'PT. SURYA POLARIS JAYA'],
    ['G000003', 'PT. GAMA INTI WAHANA'],
    ['D000012', 'PT. DHARMA ANUGRAH PERKASA'],
    ['K000021', 'PT. KIARIA KREASI KEMASAN'],
    ['D000009', 'PT. DWI GLOBAL MEGABOX'],
    ['I000015', 'CV. INTERNUSA MEGA MANDIRI'],
    ['B000011', 'PT. BERLIAN UTAMA KARTON BOKS'],
    ['T000023', 'PT. TERANG KEMASAN INDAH'],
    ['P000033', 'PT. PERMATA ABADI BERSAUDARA'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(templateData);
  ws['!cols'] = [{ wch: 16 }, { wch: 45 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Customer');
  XLSX.writeFile(wb, 'Template_Import_Data_Customer.xlsx');
}

/**
 * Mengekspor seluruh Data Customer yang ada ke file Excel
 */
export function exportCustomerMappingsToExcel(): void {
  const mappings = getCustomerMappings();
  const rows = [
    ['Code', 'Customers'],
    ...mappings.map((m) => [m.code, m.name]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 45 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Customer');
  XLSX.writeFile(wb, `Data_Customer_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Mengekstrak Kode Customer dari nomor Artikel.
 * Format standar artikel ERP:
 * - SH-P008-01307-A   -> Kode: "P008"
 * - ST-C002-00001-A   -> Kode: "C002"
 * - ST-D009-00008-A   -> Kode: "D009"
 * - ST-G003-00001-A   -> Kode: "G003"
 */
export function extractCustomerCodeFromArtikel(artikel: string): string {
  if (!artikel) return '';
  const raw = String(artikel).trim().toUpperCase();
  // Hilangkan catatan dalam kurung e.g. "ST-D009-00008-A (204:381:204)"
  const clean = raw.replace(/\s*\(.*?\)/g, '').trim();

  // Pola 1: Pemisahan tanda strip "-", segmen ke-2 (index 1)
  const parts = clean.split('-');
  if (parts.length >= 2) {
    const candidate = parts[1].trim();
    // Validasi pola kode customer
    if (/^[A-Z]{1,3}\d{2,6}[A-Z]?$/i.test(candidate)) {
      return normalizeCustomerCode(candidate);
    }
  }

  // Pola 2: Regex pencocokan kode di antara pembatas strip
  const match = clean.match(/[-_]([A-Z]{1,3}\d{2,6}[A-Z]?)[-_]/i);
  if (match && match[1]) {
    return normalizeCustomerCode(match[1]);
  }

  return '';
}

/**
 * Mengambil nama customer berdasarkan artikel dan mapping yang tersedia
 */
export function resolveCustomerInfo(
  artikel: string,
  fallbackCustomerName?: string,
  customMappings?: CustomerMapping[]
): {
  customerCode: string;
  customerName: string;
  isKnown: boolean;
} {
  const code = extractCustomerCodeFromArtikel(artikel);
  const mappings = customMappings || getCustomerMappings();

  if (code) {
    const normalizedCode = normalizeCustomerCode(code);
    const found = mappings.find(
      (m) => normalizeCustomerCode(m.code) === normalizedCode
    );

    if (found) {
      return {
        customerCode: normalizedCode,
        customerName: found.name,
        isKnown: true,
      };
    }

    // Jika kode terdeteksi namun belum terdaftar di Data Customer
    return {
      customerCode: normalizedCode,
      customerName:
        fallbackCustomerName && !fallbackCustomerName.toUpperCase().includes('ALL')
          ? fallbackCustomerName
          : `Customer ${normalizedCode}`,
      isKnown: false,
    };
  }

  // Fallback jika tidak ada kode yang terdeteksi di artikel
  const cleanFallback = fallbackCustomerName ? fallbackCustomerName.trim() : '';
  return {
    customerCode: '-',
    customerName: cleanFallback || 'CUSTOMER',
    isKnown: Boolean(cleanFallback),
  };
}
