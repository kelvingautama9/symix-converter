export type CoStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export interface ExtractedRecord {
  CO: string;
  coStatus?: CoStatus;
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
  'Terkirim (PCS)': number;
  'Terkirim (KG)': number;
  Harga: number;
  _has_delivery?: boolean;
  _parentIndex?: number;
  _parentStockPcs?: number;
  _parentStockKg?: number;
}

export interface ParseSummary {
  totalPOs: number;
  totalUniqueItems: number;
  totalCOOpen: number;
  totalCOClosed: number;
  totalQtyOrderPcs: number;
  totalBeratOrderKg: number;
  totalStockPcs: number;
  totalStockKg: number;
  totalSisaOSPcs: number;
  totalSisaOSKg: number;
  totalTerkirimPcs: number;
  totalTerkirimKg: number;
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
export type CoFilterStatus = 'ALL' | 'OPEN' | 'CLOSED';
export type ExcelExportScope = 'ALL' | 'OPEN_ONLY' | 'CLOSED_ONLY';

