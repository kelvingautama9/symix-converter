import { ExtractedRecord, WhatsAppReportScope } from '../types';
import { recalculateFIFOStock } from './parserEngine';

/**
 * Generates the WhatsApp summary string based on records with support for:
 * - All CO
 * - CO Open Only
 * - CO Closed Only
 * - Stock Ready (All CO)
 * - Stock Ready (CO Open Only)
 * - Stock Ready (CO Closed Only)
 */
export function generateWhatsAppSummary(
  data: ExtractedRecord[],
  scope: WhatsAppReportScope = 'ALL'
): string {
  if (!data || data.length === 0) {
    return 'Halo, belum ada data rekap Sisa Order Status (OS) yang diproses.';
  }

  // Recalculate FIFO stock strictly according to the scope target
  const fifoTargetScope =
    scope === 'OPEN_ONLY' || scope === 'STOCK_READY_OPEN'
      ? 'OPEN'
      : scope === 'CLOSED_ONLY' || scope === 'STOCK_READY_CLOSED'
      ? 'CLOSED'
      : 'ALL';

  const scopedData = recalculateFIFOStock(data, fifoTargetScope);

  let filtered = scopedData;
  let headerTitle = 'Halo, berikut adalah update rekap Sisa Order Status (OS):';
  const isStockReadyScope =
    scope === 'STOCK_READY_ALL' || scope === 'STOCK_READY_OPEN' || scope === 'STOCK_READY_CLOSED';

  if (scope === 'OPEN_ONLY') {
    filtered = scopedData.filter((d) => d.coStatus === 'OPEN');
    headerTitle = 'Halo, berikut adalah update rekap Sisa Order Status (OS) - *Khusus CO Open (O)*:';
  } else if (scope === 'CLOSED_ONLY') {
    filtered = scopedData.filter((d) => d.coStatus === 'CLOSED');
    headerTitle = 'Halo, berikut adalah update rekap Sisa Order Status (OS) - *Khusus CO Closed (C)*:';
  } else if (scope === 'STOCK_READY_ALL') {
    filtered = scopedData.filter((d) => (d['Stock (pcs)'] || 0) > 0);
    headerTitle = 'Halo, berikut adalah update rekap *⚡ STOCK READY (SIAP KIRIM)* - Semua CO:';
  } else if (scope === 'STOCK_READY_OPEN') {
    filtered = scopedData.filter((d) => d.coStatus === 'OPEN' && (d['Stock (pcs)'] || 0) > 0);
    headerTitle = 'Halo, berikut adalah update rekap *⚡ STOCK READY (SIAP KIRIM)* - Khusus CO Open (O):';
  } else if (scope === 'STOCK_READY_CLOSED') {
    filtered = scopedData.filter((d) => d.coStatus === 'CLOSED' && (d['Stock (pcs)'] || 0) > 0);
    headerTitle = 'Halo, berikut adalah update rekap *⚡ STOCK READY (SIAP KIRIM)* - Khusus CO Closed (C):';
  }

  if (filtered.length === 0) {
    if (isStockReadyScope) {
      return `Halo, saat ini tidak ada item yang memiliki *Stock Ready (> 0 pcs)* pada kategori ${
        scope === 'STOCK_READY_OPEN' ? 'CO Open' : scope === 'STOCK_READY_CLOSED' ? 'CO Closed' : 'Semua CO'
      }.`;
    }
    return `Halo, tidak ada data PO pada filter yang dipilih.`;
  }

  let text = `${headerTitle}\n\n`;

  filtered.forEach((item, index) => {
    const co = item.CO ? `[CO: ${item.CO}] ` : '';
    const artikel = item.Artikel || '-';
    const noPo = item['No PO'] || '-';
    const qtyPo = (item['QTY PO (pcs)'] || 0).toLocaleString('id-ID');
    const sisaOs = (item['Sisa OS (pcs)'] || 0).toLocaleString('id-ID');
    const terkirim = ((item['Terkirim (PCS)'] !== undefined ? item['Terkirim (PCS)'] : Math.max(0, (item['QTY PO (pcs)'] || 0) - (item['Sisa OS (pcs)'] || 0)))).toLocaleString('id-ID');
    const stockPcs = (item['Stock (pcs)'] || 0).toLocaleString('id-ID');
    const stockKg = (item['Stock (kg)'] || 0).toLocaleString('id-ID');

    text += `${index + 1}. ${co}[${artikel}] - [${noPo}]\n`;
    if (isStockReadyScope) {
      text += `   Order: ${qtyPo} pcs | Sisa: ${sisaOs} pcs | *⚡ Stock Ready: ${stockPcs} pcs* (${stockKg} kg)\n`;
    } else {
      const stockInfo = (item['Stock (pcs)'] || 0) > 0 ? ` | Stock: ${stockPcs} pcs` : '';
      text += `   Order: ${qtyPo} pcs | Terkirim: ${terkirim} pcs | Sisa: *${sisaOs}* pcs${stockInfo}\n`;
    }
  });

  // Calculate totals for a helpful footer summary
  const totalQtyPcs = filtered.reduce((acc, curr) => acc + (curr['QTY PO (pcs)'] || 0), 0);
  const totalSisaPcs = filtered.reduce((acc, curr) => acc + (curr['Sisa OS (pcs)'] || 0), 0);
  const totalTerkirimPcs = filtered.reduce((acc, curr) => acc + ((curr['Terkirim (PCS)'] !== undefined ? curr['Terkirim (PCS)'] : Math.max(0, (curr['QTY PO (pcs)'] || 0) - (curr['Sisa OS (pcs)'] || 0)))), 0);
  const totalStockPcs = filtered.reduce((acc, curr) => acc + (curr['Stock (pcs)'] || 0), 0);
  const totalStockKg = filtered.reduce((acc, curr) => acc + (curr['Stock (kg)'] || 0), 0);
  const totalItems = filtered.length;

  if (isStockReadyScope) {
    text += `\n📦 *Ringkasan Stock Siap Kirim:*\n`;
    text += `• Total PO Ready: ${totalItems} order\n`;
    text += `• *Total Stock Siap Kirim: ${totalStockPcs.toLocaleString('id-ID')} pcs* (${totalStockKg.toLocaleString('id-ID')} kg)\n`;
    text += `• Total Sisa Kirim (OS): ${totalSisaPcs.toLocaleString('id-ID')} pcs\n`;
    text += `• Total Order PO: ${totalQtyPcs.toLocaleString('id-ID')} pcs`;
  } else {
    text += `\n📊 *Ringkasan Keseluruhan:*\n`;
    text += `• Total PO: ${totalItems} order\n`;
    text += `• Total Order: ${totalQtyPcs.toLocaleString('id-ID')} pcs\n`;
    text += `• Total Terkirim: ${totalTerkirimPcs.toLocaleString('id-ID')} pcs\n`;
    text += `• Total Sisa Kirim: *${totalSisaPcs.toLocaleString('id-ID')}* pcs\n`;
    if (totalStockPcs > 0) {
      text += `• Total Stock Ready: *${totalStockPcs.toLocaleString('id-ID')} pcs* (${totalStockKg.toLocaleString('id-ID')} kg)`;
    }
  }

  return text;
}

/**
 * Copies text safely to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('navigator.clipboard failed, attempting fallback...', err);
  }

  // Fallback using temporary textarea
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Copy fallback failed:', err);
    return false;
  }
}

/**
 * Opens WhatsApp Web/App with the prefilled message containing scoped records
 */
export function shareToWhatsApp(
  data: ExtractedRecord[],
  scope: WhatsAppReportScope = 'ALL'
): void {
  const summaryText = generateWhatsAppSummary(data, scope);
  const encodedText = encodeURIComponent(summaryText);
  const waUrl = `https://wa.me/?text=${encodedText}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
}


