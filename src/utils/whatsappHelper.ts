import { ExtractedRecord } from '../types';

/**
 * Generates the WhatsApp summary string based on finalData
 */
export function generateWhatsAppSummary(data: ExtractedRecord[], maxItems: number = 10): string {
  if (!data || data.length === 0) {
    return 'Halo, belum ada data rekap Sisa Order Status (OS) yang diproses.';
  }

  let text = 'Halo, berikut adalah update rekap Sisa Order Status (OS):\n';

  const displayList = data.slice(0, maxItems);
  displayList.forEach((item, index) => {
    const co = item.CO ? `[CO: ${item.CO}] ` : '';
    const artikel = item.Artikel || '-';
    const noPo = item['No PO'] || '-';
    const qtyPo = (item['QTY PO (pcs)'] || 0).toLocaleString('id-ID');
    const sisaOs = (item['Sisa OS (pcs)'] || 0).toLocaleString('id-ID');
    const terkirim = ((item['Terkirim (PCS)'] !== undefined ? item['Terkirim (PCS)'] : Math.max(0, (item['QTY PO (pcs)'] || 0) - (item['Sisa OS (pcs)'] || 0)))).toLocaleString('id-ID');

    text += `${index + 1}. ${co}[${artikel}] - [${noPo}]\n`;
    text += `   Order: ${qtyPo} pcs | Terkirim: ${terkirim} pcs | Sisa: *${sisaOs}* pcs\n`;
  });

  if (data.length > maxItems) {
    const remainingCount = data.length - maxItems;
    text += `...dan ${remainingCount} item lainnya\n`;
  }

  // Calculate totals for a helpful footer summary
  const totalQtyPcs = data.reduce((acc, curr) => acc + (curr['QTY PO (pcs)'] || 0), 0);
  const totalSisaPcs = data.reduce((acc, curr) => acc + (curr['Sisa OS (pcs)'] || 0), 0);
  const totalTerkirimPcs = data.reduce((acc, curr) => acc + ((curr['Terkirim (PCS)'] !== undefined ? curr['Terkirim (PCS)'] : Math.max(0, (curr['QTY PO (pcs)'] || 0) - (curr['Sisa OS (pcs)'] || 0)))), 0);
  const totalItems = data.length;

  text += `\n📊 *Ringkasan Keseluruhan:*\n`;
  text += `• Total PO: ${totalItems} order\n`;
  text += `• Total Order: ${totalQtyPcs.toLocaleString('id-ID')} pcs\n`;
  text += `• Total Terkirim: ${totalTerkirimPcs.toLocaleString('id-ID')} pcs\n`;
  text += `• Total Sisa Kirim: *${totalSisaPcs.toLocaleString('id-ID')}* pcs`;

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
 * Opens WhatsApp Web/App with the prefilled message
 */
export function shareToWhatsApp(data: ExtractedRecord[], maxItems: number = 10): void {
  const summaryText = generateWhatsAppSummary(data, maxItems);
  const encodedText = encodeURIComponent(summaryText);
  const waUrl = `https://wa.me/?text=${encodedText}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
}

