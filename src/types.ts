// BlackEYE Data Types: Standard 15-Column Schema & Detailed SJ Delivery Schema
export type CoStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export type ConversionMode = 'NORMAL' | 'DETAIL_SJ' | 'SALES_ORDER';

export interface DeliveryScheduleRecord {
  sequence: number; // 1, 2, 3...
  scheduleDate: string; // e.g., "27/09/2026", or "-" if not scheduled
  scheduleQty: number; // e.g., 1900
}

export interface DeliveryRecord {
  sequence: number; // 1, 2, 3... (0 if fallback no delivery)
  noSJ: string; // e.g., "P26102464", or "-" if no delivery
  tanggalKirim: string; // e.g., "19/10/2026", or "-" if no delivery
  qtyKirimPcs: number; // e.g., 3600
  beratKirimKg: number; // e.g., 956
  akumulasiKirimPcs: number; // e.g., 3600 -> 4362 -> 5552
  akumulasiKirimKg: number; // e.g., 956 -> 1158 -> 1474
  sisaOsBerjalanPcs: number; // e.g., 2500 -> 1738 -> 548 (or QTY PO if no delivery)
  sisaOsBerjalanKg: number; // e.g., 664 -> 461 -> 145 (or Berat PO if no delivery)
  isFallbackNoDelivery?: boolean;
  _rawBalancePcs?: number | null;
  _rawBalanceKg?: number | null;
}

export interface ExtractedRecord {
  id?: string;
  CO: string;
  coStatus?: CoStatus;
  Artikel: string;
  'Item Description': string;
  'Tanggal Input PO': string;
  'No PO': string;
  Substance: string; // Full substance or pure substance
  PureSubstance?: string; // e.g., "K200M100K125"
  Flute?: string; // e.g., "C", "BC", "B", "E"
  SizeP?: number | string; // e.g., 1060
  SizeL?: number | string; // e.g., 540
  RawSize?: string; // e.g., "1060 X 540 X"
  'QTY PO (pcs)': number;
  'Berat PO (KG)': number;
  'Stock (pcs)': number;
  'Stock (kg)': number;
  'Sisa OS (pcs)': number;
  'Sisa OS (kg)': number;
  'Terkirim (PCS)': number;
  'Terkirim (KG)': number;
  'Over Stock Gudang (PCS)'?: number;
  'Over Stock Gudang (KG)'?: number;
  'Over Kiriman (PCS)'?: number;
  'Over Kiriman (KG)'?: number;
  'Over Produksi (PCS)'?: number;
  'Over Produksi (KG)'?: number;
  Harga: number;
  scheduleDate?: string;
  scheduleQty?: number;
  schedules?: DeliveryScheduleRecord[];
  customerName?: string;
  deliveries?: DeliveryRecord[];
  _has_delivery?: boolean;
  _parentIndex?: number;
  _parentStockPcs?: number;
  _parentStockKg?: number;
}

export type DeliveryStatusTag =
  | 'OVER DELIVERY'
  | 'COMPLETED / LUNAS'
  | 'PARTIAL / CICIL'
  | 'UNTOUCHED / BELUM KIRIM';

export interface FlattenedDeliveryRow {
  id: string;
  poRecordId: string;
  poIndex: number; // 1-based PO index
  CO: string;
  coStatus: CoStatus;
  Artikel: string;
  'Item Description': string;
  'Tanggal Input PO': string;
  'No PO': string;
  Substance: string;
  'QTY PO (pcs)': number;
  'Berat PO (KG)': number;
  frekuensiKirim: number; // 0 if no delivery, else count of SJ
  urutanKirim: number; // 0 if no delivery, else 1..N
  labelKiriman: string; // e.g. "Kiriman Ke-1 (dari 3)" or "Belum Kirim"
  'No Surat Jalan (SJ)': string;
  'Tanggal Kirim (SJ)': string;
  'Lead Time SJ (Hari)': number | null;
  'Rata-rata Lead Time PO (Hari)': number | null;
  'QTY Kirim SJ (pcs)': number;
  'Berat Kirim SJ (KG)': number;
  'Akumulasi Terkirim (pcs)': number;
  'Akumulasi Terkirim (KG)': number;
  'Sisa OS Berjalan (pcs)': number;
  'Sisa OS Berjalan (KG)': number;
  'Total Terkirim PO (pcs)': number;
  'Total Terkirim PO (KG)': number;
  'Sisa OS Akhir PO (pcs)': number;
  'Sisa OS Akhir PO (KG)': number;
  '% Pemenuhan PO': number; // decimal ratio e.g. 0.85 for 85.0%
  'Status Pengiriman': DeliveryStatusTag;
  'Umur PO / Aging (Hari)': number | null;
  'Kategori Aging OS': string;
  'Stock (pcs)': number;
  'Stock (kg)': number;
  'Over Stock Gudang (PCS)': number;
  'Over Stock Gudang (KG)': number;
  'Over Kiriman (PCS)': number;
  'Over Kiriman (KG)': number;
  Harga: number;
  isFirstRowOfPO: boolean;
  isLastRowOfPO: boolean;
  isFallbackNoDelivery: boolean;
}

export interface ParseSummary {
  totalPOs: number; // Total baris PO-Item (e.g. 23 baris)
  totalUniquePONumbers?: number; // Total nomor dokumen PO unik (e.g. 18 No PO)
  totalMultiItemPONumbers?: number; // Jumlah No PO yang memiliki > 1 item/artikel
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
  totalOverStockGudangPcs?: number;
  totalOverStockGudangKg?: number;
  totalOverStockGudangPOs?: number;
  totalOverKirimanPcs?: number;
  totalOverKirimanKg?: number;
  totalOverKirimanPOs?: number;
  totalOverProduksiPcs?: number;
  totalOverProduksiKg?: number;
  totalOverProduksiPOs?: number;
  totalDeliveriesCount?: number;
  totalPOsWithMultiDelivery?: number;
  totalPOsWithoutDelivery?: number;
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

export type FilterStatus =
  | 'ALL'
  | 'PARTIAL_DELIVERY'
  | 'FULL_PENDING'
  | 'STOCK_READY'
  | 'OVER_STOCK_GUDANG'
  | 'OVER_KIRIMAN'
  | 'OVER_PRODUCTION';

export type CoFilterStatus = 'ALL' | 'OPEN' | 'CLOSED';
export type ExcelExportScope =
  | 'ALL'
  | 'OPEN_ONLY'
  | 'CLOSED_ONLY'
  | 'STOCK_READY_ALL'
  | 'STOCK_READY_OPEN'
  | 'STOCK_READY_CLOSED'
  | 'OVER_STOCK_GUDANG'
  | 'OVER_KIRIMAN'
  | 'OVER_PRODUCTION_ONLY';

export interface SalesOrderRow {
  id: string;
  poRecordId: string;
  coNumber: string;
  coStatus: CoStatus;
  noPO: string;
  dateReceivePO: string;
  substance: string;
  flute: string;
  wallType?: 'SINGLEWALL' | 'DOUBLEWALL';
  sizeP: number | string;
  sizeL: number | string;
  artikel: string;
  itemName: string;
  qtyPcs: number | '';
  qtyKg: number | '';
  deliveryDate: string;
  qtyDelivery: number | '';
  kgDelivery: number | '';
  remarks: string;
  actualDeliveryDate: string;
  noSJ: string;
  actualQtyDelivery: number | '';
  actualKgDelivery: number | '';
  isFirstScheduleOfPO: boolean;
  scheduleSequence: number;
  totalSchedulesCount: number;
}

export type SalesOrderExportScope = 'ALL' | 'OPEN_ONLY' | 'CLOSED_ONLY';

export type DetailSJExportScope =
  | 'ALL'
  | 'OPEN_ONLY'
  | 'CLOSED_ONLY'
  | 'WITH_DELIVERY_ONLY'
  | 'MULTI_DELIVERY_ONLY'
  | 'NO_DELIVERY_FALLBACK'
  | 'HAS_SISA_OS';

export type WhatsAppReportScope =
  | 'ALL'
  | 'OPEN_ONLY'
  | 'CLOSED_ONLY'
  | 'STOCK_READY_ALL'
  | 'STOCK_READY_OPEN'
  | 'STOCK_READY_CLOSED'
  | 'OVER_STOCK_GUDANG'
  | 'OVER_KIRIMAN'
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


