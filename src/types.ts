export interface ExtractedRecord {
  Artikel: string;
  'Item Description': string;
  'No PO': string;
  Substance: string;
  'QTY PO (pcs)': number;
  'Berat PO (KG)': number;
  'Stock (pcs)': number;
  'Stock (kg)': number;
  'Sisa OS (pcs)': number;
  'Sisa OS (kg)': number;
  Harga: number;
  _has_delivery?: boolean;
}

export interface ParseSummary {
  totalPOs: number;
  totalUniqueItems: number;
  totalQtyOrderPcs: number;
  totalBeratOrderKg: number;
  totalStockPcs: number;
  totalStockKg: number;
  totalSisaOSPcs: number;
  totalSisaOSKg: number;
  totalValue: number;
  itemsWithDelivery: number;
  itemsWithoutDelivery: number;
  fileName: string;
  fileSize: string;
  parsedAt: string;
  sheetNames: string[];
  activeSheetName: string;
  totalRawRows: number;
}

export type FilterStatus = 'ALL' | 'PARTIAL_DELIVERY' | 'FULL_PENDING' | 'STOCK_READY';
