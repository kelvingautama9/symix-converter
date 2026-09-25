// BlackEYE Data Types: Standard 15-Column Schema
export type CoStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export interface ExtractedRecord {
  id?: string;
  CO: string;
  coStatus?: CoStatus;
  Artikel: string;
  'Item Description': string;
  'Tanggal Input PO': string;
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
  'Over Produksi (PCS)'?: number;
  'Over Produksi (KG)'?: number;
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
  totalOverProduksiPcs?: number;
  totalOverProduksiKg?: number;
  totalOverProduksiPOs?: number;
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

export type FilterStatus = 'ALL' | 'PARTIAL_DELIVERY' | 'FULL_PENDING' | 'STOCK_READY' | 'OVER_PRODUCTION';
export type CoFilterStatus = 'ALL' | 'OPEN' | 'CLOSED';
export type ExcelExportScope =
  | 'ALL'
  | 'OPEN_ONLY'
  | 'CLOSED_ONLY'
  | 'STOCK_READY_ALL'
  | 'STOCK_READY_OPEN'
  | 'STOCK_READY_CLOSED'
  | 'OVER_PRODUCTION_ONLY';

export type WhatsAppReportScope =
  | 'ALL'
  | 'OPEN_ONLY'
  | 'CLOSED_ONLY'
  | 'STOCK_READY_ALL'
  | 'STOCK_READY_OPEN'
  | 'STOCK_READY_CLOSED'
  | 'OVER_PRODUCTION_ONLY';

export type BatchItemStatus = 'pending' | 'processing' | 'success' | 'error';

export interface BatchFileItem {
  id: string;
  file?: File;
  rawFileName: string;
  rawFileSize?: number;
  status: BatchItemStatus;
  errorMessage?: string;
  data?: ExtractedRecord[];
  summary?: ParseSummary;
  excelBlob?: Blob;
  outputFileName?: string;
  durationMs?: number;
  rawBuffer?: ArrayBuffer;
  workbook?: any;
}

export interface BatchAggregateStats {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalPOs: number;
  totalUniqueArticles: number;
  totalQtyPcs: number;
  totalSisaOSPcs: number;
  totalTerkirimPcs: number;
  totalStockPcs: number;
  totalCOOpen: number;
  totalCOClosed: number;
}

