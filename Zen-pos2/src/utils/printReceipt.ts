import QRCodeLib from 'qr.js/lib/QRCode';
import ErrorCorrectLevel from 'qr.js/lib/ErrorCorrectLevel';

/** Generate an inline SVG QR code — no external network request needed. */
function generateQrSvg(value: string, size: number): string {
  const qr = new QRCodeLib(-1, ErrorCorrectLevel['L']);
  qr.addData(value);
  qr.make();
  const cells: boolean[][] = qr.modules;
  const n = cells.length;
  const fgD = cells.map((row: boolean[], r: number) =>
    row.map((cell: boolean, c: number) => cell ? `M ${c} ${r} l 1 0 0 1 -1 0 Z` : '').join(' ')
  ).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" style="display:block;margin:6px auto;"><path d="${fgD}" fill="#000000"/></svg>`;
}

export interface ReceiptBranding {
  restaurantName?: string;
  address?: string;
  phone?: string;
  logo?: string;
  footerText?: string;
  printQrCode?: boolean;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  lineTotal: number;
  modifiers?: string;
  notes?: string;
}

export interface ReceiptData {
  branding: ReceiptBranding;
  orderNumber?: string;
  orderType: string;
  date?: Date;
  items: ReceiptItem[];
  customer?: { name?: string; phone?: string; address?: string };
  notes?: string;
  subtotal: number;
  taxAmount: number;
  taxRate?: number;
  gratuityAmount?: number;
  gratuityRate?: number;
  total: number;
  paidAmount?: number;
  trackingUrl?: string;
  formatCurrency: (n: number) => string;
}

export function buildReceiptHtml(d: ReceiptData): string {
  const { branding, formatCurrency } = d;
  const now = d.date ?? new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const storeName = branding.restaurantName || 'ZEN POS';
  const addr = (branding.address || '').split('\n').filter(Boolean);
  const footer = branding.footerText || 'Thank you for your order!';

  const SEP = `<hr style="border:none;border-top:1px dashed #000;margin:6px 0;">`;
  const SEP2 = `<hr style="border:none;border-top:2px solid #000;margin:6px 0;">`;

  const itemRows = d.items.map(item => {
    const noteStr = [item.modifiers, item.notes].filter(Boolean).join(' | ');
    return `<div style="margin-bottom:6px;"><div style="display:flex;justify-content:space-between;"><span>${item.quantity}x ${item.name}</span><span style="white-space:nowrap;margin-left:8px;">${formatCurrency(item.lineTotal)}</span></div>${noteStr ? `<div style="padding-left:16px;font-size:11px;color:#444;">${noteStr}</div>` : ''}</div>`;
  }).join('');

  const hasCustomer = d.customer && (d.customer.name || d.customer.phone || d.customer.address);
  const customerSection = hasCustomer
    ? `${SEP}<div style="font-weight:bold;margin-bottom:4px;">CUSTOMER DETAILS:</div>${d.customer!.name ? `<div>${d.customer!.name}</div>` : ''}${d.customer!.phone ? `<div>${d.customer!.phone}</div>` : ''}${d.customer!.address ? `<div>${d.customer!.address}</div>` : ''}`
    : '';

  const taxLabel = d.taxRate ? `Tax (${d.taxRate}%):` : 'Tax:';
  const gratuityLabel = d.gratuityRate ? `Gratuity (${d.gratuityRate}%):` : 'Gratuity:';

  const paidAmount = d.paidAmount ?? 0;
  const changeAmt = paidAmount > d.total ? paidAmount - d.total : 0;
  const paidSection = paidAmount > 0
    ? `${SEP}<div style="display:flex;justify-content:space-between;"><span>Cash Paid:</span><span>${formatCurrency(paidAmount)}</span></div><div style="display:flex;justify-content:space-between;font-weight:bold;color:#166534;"><span>Change:</span><span>${formatCurrency(changeAmt)}</span></div>`
    : '';

  const qrSvg = d.trackingUrl ? generateQrSvg(d.trackingUrl, 110) : '';
  const qrSection = d.trackingUrl
    ? `${SEP}<div style="text-align:center;padding:6px 0;"><div style="font-weight:bold;letter-spacing:1px;">*** FIDELITY PROGRAM ***</div><div style="font-size:11px;margin:4px 0;">Scan QR to collect points<br>Redeem discounts &amp; free delivery</div>${qrSvg}<div style="font-size:11px;font-weight:bold;letter-spacing:2px;margin-top:4px;">SCAN ME</div></div>`
    : '';

  const notesSection = d.notes
    ? `${SEP}<div style="font-size:11px;color:#444;font-style:italic;">Note: ${d.notes}</div>`
    : '';

  const orderTypeDisplay = (d.orderType || 'dine_in').replace(/_/g, ' ');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:0;}*{box-sizing:border-box;margin:0;padding:0;}body{width:80mm;margin:0 auto;padding:4mm;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.4;color:#000;}</style></head><body><div style="text-align:center;margin-bottom:6px;">${branding.logo ? `<img src="${branding.logo}" style="max-width:56px;max-height:56px;display:block;margin:0 auto 4px;filter:grayscale(1) contrast(2);" />` : ''}<div style="font-size:16px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">${storeName}</div>${addr.map(l => `<div style="font-size:11px;">${l}</div>`).join('')}${branding.phone ? `<div style="font-size:11px;">${branding.phone}</div>` : ''}</div>${SEP}<div><div>Order: #${d.orderNumber || '\u2014'}</div><div>Date:  ${dateStr}  ${timeStr}</div><div>Type:  ${orderTypeDisplay}</div></div>${customerSection}${SEP}${itemRows}${notesSection}${SEP}<div style="display:flex;justify-content:space-between;font-size:11px;"><span>Subtotal:</span><span>${formatCurrency(d.subtotal)}</span></div>${d.taxAmount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;"><span>${taxLabel}</span><span>${formatCurrency(d.taxAmount)}</span></div>` : ''}${(d.gratuityAmount ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;"><span>${gratuityLabel}</span><span>${formatCurrency(d.gratuityAmount!)}</span></div>` : ''}${SEP2}<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:15px;"><span>TOTAL:</span><span>${formatCurrency(d.total)}</span></div>${SEP2}${paidSection}${qrSection}${SEP}<div style="text-align:center;font-size:11px;padding:4px 0;">${footer}</div><script>window.onload=function(){window.print();};<\/script></body></html>`;
}

export function firePrint(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  if (iframe.contentWindow) {
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(html);
    iframe.contentWindow.document.close();
    iframe.contentWindow.addEventListener('afterprint', () => {
      setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1000);
    });
  }
}
