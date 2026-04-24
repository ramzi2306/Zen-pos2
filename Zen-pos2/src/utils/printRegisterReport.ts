import { BrandingData } from '../api/settings';
import { firePrint } from './printUtils';

export interface RegisterReportPrintData {
  branding: BrandingData;
  cashierName: string;
  locationName: string;
  openedAt: number;
  closedAt: number;
  paymentMethods: {
    name: string;
    ordersCount: number;
    total: number;
    actual: number;
    difference: number;
  }[];
  expectedSales: number;
  actualSales: number;
  difference: number;
  notes?: string;
  openingFloat?: number;
  fondDeCaisse?: number;
  withdrawnCash: number;
  withdrawals?: { amount: number; notes?: string }[];
  formatCurrency: (n: number) => string;
}

export function buildRegisterReportHtml(d: RegisterReportPrintData): string {
  const { branding, formatCurrency } = d;
  const opened = new Date(d.openedAt);
  const closed = new Date(d.closedAt);
  
  const openedDateStr = opened.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const openedTimeStr = opened.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const closedDateStr = closed.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const closedTimeStr = closed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  
  const storeName = branding.restaurantName || 'ZEN POS';
  const addr = (branding.address || '').split('\n').filter(Boolean);

  const SEP = `<hr style="border:none;border-top:1px dashed #000;margin:6px 0;">`;
  const SEP2 = `<hr style="border:none;border-top:2px solid #000;margin:6px 0;">`;

  const totalOrders = d.paymentMethods.reduce((sum, pm) => sum + pm.ordersCount, 0);

  const methodRows = d.paymentMethods.map(pm => `
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;text-transform:uppercase;">
        <span>${pm.name} (${pm.ordersCount} orders)</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding-left:8px;">
        <span>Expected:</span>
        <span>${formatCurrency(pm.total)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding-left:8px;">
        <span>Counted:</span>
        <span>${pm.actual ? formatCurrency(pm.actual) : '—'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding-left:8px;font-weight:bold;color:${pm.difference === 0 ? '#000' : pm.difference > 0 ? '#000' : '#000'}">
        <span>Difference:</span>
        <span>${pm.difference !== 0 ? (pm.difference > 0 ? '+' : '') + formatCurrency(pm.difference) : formatCurrency(0)}</span>
      </div>
    </div>
  `).join('');

  const floatSection = (d.openingFloat !== undefined && d.fondDeCaisse !== undefined) ? `
    ${SEP}
    <div style="font-weight:900;font-size:13px;text-align:center;text-decoration:underline;margin-bottom:4px;">FLOAT RECONCILIATION</div>
    <div style="display:flex;justify-content:space-between;font-size:12px;">
      <span>Shift Start Float:</span>
      <span>${formatCurrency(d.openingFloat)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;">
      <span>Shift End Float:</span>
      <span>${formatCurrency(d.fondDeCaisse)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;">
      <span>Float Difference:</span>
      <span>${(d.openingFloat - d.fondDeCaisse) >= 0 ? '+' : ''}${formatCurrency(d.openingFloat - d.fondDeCaisse)}</span>
    </div>
  ` : d.fondDeCaisse ? `
    ${SEP}
    <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;">
      <span>FOND DE CAISSE (STAY):</span>
      <span>${formatCurrency(d.fondDeCaisse)}</span>
    </div>
  ` : '';

  const notesSection = d.notes
    ? `${SEP}<div style="font-size:13px;font-weight:900;color:#000;border:1px solid #000;padding:4px;margin-top:4px;">NOTES:<br>${d.notes}</div>`
    : '';

  const withdrawalsSection = (d.withdrawals && d.withdrawals.length > 0) ? `
    ${SEP}
    <div style="font-weight:900;font-size:13px;text-align:center;text-decoration:underline;margin-bottom:4px;">CASH WITHDRAWALS (DROPS)</div>
    ${d.withdrawals.map(w => `
      <div style="margin-bottom:4px;border-bottom:1px dotted #ccc;padding-bottom:2px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:bold;">
          <span>WITHDRAWN:</span>
          <span>${formatCurrency(w.amount)}</span>
        </div>
        ${w.notes ? `<div style="font-size:11px;font-style:italic;padding-left:8px;">Reason: ${w.notes}</div>` : ''}
      </div>
    `).join('')}
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900;margin-top:4px;">
      <span>TOTAL WITHDRAWN:</span>
      <span>${formatCurrency(d.withdrawnCash)}</span>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          width: 80mm; 
          margin: 0 auto; 
          padding: 4mm 2mm; 
          font-family: 'Courier New', Courier, monospace; 
          font-size: 13px; 
          font-weight: 700; 
          line-height: 1.4; 
          color: #000; 
          -webkit-print-color-adjust: exact; 
          print-color-adjust: exact; 
        }
      </style>
    </head>
    <body>
      <div style="text-align:center;margin-bottom:6px;">
        ${branding.logo ? `<img src="${branding.logo}" style="max-width:56px;max-height:56px;display:block;margin:0 auto 4px;filter:grayscale(1) contrast(2);" />` : ''}
        <div style="font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:1px;">${storeName}</div>
        <div style="font-size:14px;font-weight:900;margin-top:2px;border:2px solid #000;display:inline-block;padding:2px 8px;">REGISTER REPORT</div>
        ${addr.map(l => `<div style="font-size:11px;">${l}</div>`).join('')}
        ${branding.phone ? `<div style="font-size:11px;">${branding.phone}</div>` : ''}
      </div>

      ${SEP}
      
      <div>
        <div style="font-weight:900;">CASHIER: ${d.cashierName.toUpperCase()}</div>
        <div style="font-weight:900;">LOCATION: ${d.locationName.toUpperCase()}</div>
        <div style="font-size:11px;margin-top:2px;">
          <div>OPENED: ${openedDateStr} ${openedTimeStr}</div>
          <div>CLOSED: ${closedDateStr} ${closedTimeStr}</div>
        </div>
      </div>

      ${SEP}

      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:15px;background:#000;color:#fff;padding:2px 4px;">
        <span>TOTAL ORDERS:</span>
        <span>${totalOrders}</span>
      </div>

      <div style="margin-top:8px;">
        ${methodRows}
      </div>

      ${floatSection}
      ${withdrawalsSection}
      ${notesSection}

      ${SEP2}
      
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:16px;padding:4px 0;">
        <span>NET SALES:</span>
        <span>${formatCurrency(d.expectedSales - (d.openingFloat !== undefined && d.fondDeCaisse !== undefined ? d.openingFloat - d.fondDeCaisse : 0))}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;padding:4px 0;color:#333;">
        <span>FLOAT ADJUST:</span>
        <span>${(d.openingFloat !== undefined && d.fondDeCaisse !== undefined && (d.openingFloat - d.fondDeCaisse) >= 0) ? '+' : ''}${formatCurrency(d.openingFloat !== undefined && d.fondDeCaisse !== undefined ? d.openingFloat - d.fondDeCaisse : 0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:18px;padding:4px 0;border-top:1px solid #000;">
        <span>TOTAL EXPECTED:</span>
        <span>${formatCurrency(d.expectedSales)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:20px;padding:4px 0;border-top:1px solid #000;">
        <span>TOTAL ACTUAL:</span>
        <span>${formatCurrency(d.actualSales)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:16px;padding:4px 0;border-top:1px dashed #000;">
        <span>NET DIFF:</span>
        <span>${d.difference >= 0 ? '+' : ''}${formatCurrency(d.difference)}</span>
      </div>

      ${SEP2}
      
      <div style="text-align:center;font-size:10px;font-weight:bold;margin-top:8px;">
        *** END OF REPORT ***<br>
        ZEN POS - SYSTEM GENERATED
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;
}

export { firePrint };
