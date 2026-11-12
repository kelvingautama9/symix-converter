/**
 * Customer Data Manager & Artikel Code Parser
 * Mengelola kamus "Data Customer" (Kode Customer -> Nama Customer)
 * Mendukung fitur CRUD (Tambah, Edit, Hapus) tersimpan di LocalStorage dengan default built-in.
 */

export interface CustomerMapping {
  code: string; // e.g. "P008", "C002", "D009", "D012", "M003"
  name: string; // e.g. "Purbayasa", "Centuri Kemas", "Dwi Global Megabox", "Dharma Anugrah", "Mastercorrindo"
  note?: string;
  updatedAt?: number;
}

export const CUSTOMER_STORAGE_KEY = 'rekap_sales_customer_data_v1';

/**
 * Daftar default bawaan Data Customer sesuai standar ERP dan transaksi yang sering digunakan
 */
export const DEFAULT_CUSTOMER_MAPPINGS: CustomerMapping[] = [
  { code: 'P008', name: 'Purbayasa', note: 'PT Purbayasa' },
  { code: 'C002', name: 'Centuri Kemas', note: 'PT Centuri Kemas' },
  { code: 'D009', name: 'Dwi Global Megabox', note: 'PT Dwi Global Megabox' },
  { code: 'D012', name: 'Dharma Anugrah', note: 'PT Dharma Anugrah Pratama' },
  { code: 'M003', name: 'Mastercorrindo', note: 'PT Mastercorrindo' },
];

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
      // Simpan default pertama kali
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(DEFAULT_CUSTOMER_MAPPINGS));
      return DEFAULT_CUSTOMER_MAPPINGS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
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
  name: string,
  note?: string
): CustomerMapping[] {
  const current = getCustomerMappings();
  const cleanCode = code.trim().toUpperCase();
  const cleanName = name.trim();

  if (!cleanCode || !cleanName) {
    throw new Error('Kode Customer dan Nama Customer tidak boleh kosong.');
  }

  const existingIdx = current.findIndex((c) => c.code.toUpperCase() === cleanCode);
  let updated: CustomerMapping[];

  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = {
      ...updated[existingIdx],
      code: cleanCode,
      name: cleanName,
      note: note !== undefined ? note.trim() : updated[existingIdx].note,
      updatedAt: Date.now(),
    };
  } else {
    updated = [
      ...current,
      {
        code: cleanCode,
        name: cleanName,
        note: note ? note.trim() : '',
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
  newName: string,
  newNote?: string
): CustomerMapping[] {
  const current = getCustomerMappings();
  const cleanOldCode = oldCode.trim().toUpperCase();
  const cleanNewCode = newCode.trim().toUpperCase();
  const cleanNewName = newName.trim();

  if (!cleanNewCode || !cleanNewName) {
    throw new Error('Kode Customer dan Nama Customer tidak boleh kosong.');
  }

  // Cek apakah kode baru sudah dipakai oleh data lain
  if (cleanNewCode !== cleanOldCode) {
    const isConflict = current.some((c) => c.code.toUpperCase() === cleanNewCode);
    if (isConflict) {
      throw new Error(`Kode Customer "${cleanNewCode}" sudah digunakan oleh customer lain.`);
    }
  }

  const updated = current.map((item) => {
    if (item.code.toUpperCase() === cleanOldCode) {
      return {
        ...item,
        code: cleanNewCode,
        name: cleanNewName,
        note: newNote !== undefined ? newNote.trim() : item.note,
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
  const cleanCode = code.trim().toUpperCase();
  const updated = current.filter((c) => c.code.toUpperCase() !== cleanCode);
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
 * Mengekstrak Kode Customer dari nomor Artikel.
 * Format standar artikel ERP:
 * - SH-P008-01307-A   -> Kode: "P008"
 * - ST-C002-00001-A   -> Kode: "C002"
 * - ST-D009-00008-A   -> Kode: "D009"
 * - ST-D012-00038-A   -> Kode: "D012"
 * - ST-M003-00001-A   -> Kode: "M003"
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
    // Validasi pola kode customer: huruf diawali 1-2 huruf kapital diikuti angka (e.g. P008, C002, D009, D012, M003)
    if (/^[A-Z]{1,3}\d{2,4}[A-Z]?$/i.test(candidate)) {
      return candidate.toUpperCase();
    }
    if (/^[A-Z0-9]{3,6}$/i.test(candidate)) {
      return candidate.toUpperCase();
    }
  }

  // Pola 2: Regex pencocokan kode di antara pembatas strip
  const match = clean.match(/[-_]([A-Z]\d{2,4}[A-Z]?)[-_]/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
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
    const found = mappings.find((m) => m.code.toUpperCase() === code);
    if (found) {
      return {
        customerCode: code,
        customerName: found.name,
        isKnown: true,
      };
    }

    // Jika kode terdeteksi namun belum terdaftar di Data Customer
    return {
      customerCode: code,
      customerName: fallbackCustomerName && !fallbackCustomerName.toUpperCase().includes('ALL')
        ? fallbackCustomerName
        : `Customer ${code}`,
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
