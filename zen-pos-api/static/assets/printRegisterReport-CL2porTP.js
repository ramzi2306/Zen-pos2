import{f as E}from"./view-orders-aYEPCHnf.js";import"./vendor-react-D8kplJxr.js";import"./view-menu-DGjoW3K9.js";import"./vendor-motion-CgPT1QKI.js";import"./vendor-qr-DkvNQtXe.js";function D(e){const{branding:i,formatCurrency:n}=e,s=new Date(e.openedAt),a=new Date(e.closedAt),d=s.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}),l=s.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}),r=a.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}),f=a.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}),c=i.restaurantName||"ZEN POS",x=(i.address||"").split(`
`).filter(Boolean),o='<hr style="border:none;border-top:1px dashed #000;margin:6px 0;">',p='<hr style="border:none;border-top:2px solid #000;margin:6px 0;">',g=e.paymentMethods.reduce((t,w)=>t+w.ordersCount,0),y=e.paymentMethods.map(t=>`
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;text-transform:uppercase;">
        <span>${t.name} (${t.ordersCount} orders)</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding-left:8px;">
        <span>Expected:</span>
        <span>${n(t.total)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding-left:8px;">
        <span>Counted:</span>
        <span>${t.actual?n(t.actual):"—"}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding-left:8px;font-weight:bold;color:${t.difference===0||t.difference>0,"#000"}">
        <span>Difference:</span>
        <span>${t.difference!==0?(t.difference>0?"+":"")+n(t.difference):n(0)}</span>
      </div>
    </div>
  `).join(""),v=e.openingFloat!==void 0&&e.fondDeCaisse!==void 0?`
    ${o}
    <div style="font-weight:900;font-size:13px;text-align:center;text-decoration:underline;margin-bottom:4px;">FLOAT RECONCILIATION</div>
    <div style="display:flex;justify-content:space-between;font-size:12px;">
      <span>Shift Start Float:</span>
      <span>${n(e.openingFloat)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;">
      <span>Shift End Float:</span>
      <span>${n(e.fondDeCaisse)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;">
      <span>Float Difference:</span>
      <span>${e.openingFloat-e.fondDeCaisse>=0?"+":""}${n(e.openingFloat-e.fondDeCaisse)}</span>
    </div>
  `:e.fondDeCaisse?`
    ${o}
    <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;">
      <span>FOND DE CAISSE (STAY):</span>
      <span>${n(e.fondDeCaisse)}</span>
    </div>
  `:"",m=e.notes?`${o}<div style="font-size:13px;font-weight:900;color:#000;border:1px solid #000;padding:4px;margin-top:4px;">NOTES:<br>${e.notes}</div>`:"",h=e.withdrawals&&e.withdrawals.length>0?`
    ${o}
    <div style="font-weight:900;font-size:13px;text-align:center;text-decoration:underline;margin-bottom:4px;">CASH WITHDRAWALS (DROPS)</div>
    ${e.withdrawals.map(t=>`
      <div style="margin-bottom:4px;border-bottom:1px dotted #ccc;padding-bottom:2px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:bold;">
          <span>WITHDRAWN:</span>
          <span>${n(t.amount)}</span>
        </div>
        ${t.notes?`<div style="font-size:11px;font-style:italic;padding-left:8px;">Reason: ${t.notes}</div>`:""}
      </div>
    `).join("")}
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900;margin-top:4px;">
      <span>TOTAL WITHDRAWN:</span>
      <span>${n(e.withdrawnCash)}</span>
    </div>
  `:"";return`
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
        ${i.logo?`<img src="${i.logo}" style="max-width:56px;max-height:56px;display:block;margin:0 auto 4px;filter:grayscale(1) contrast(2);" />`:""}
        <div style="font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:1px;">${c}</div>
        <div style="font-size:14px;font-weight:900;margin-top:2px;border:2px solid #000;display:inline-block;padding:2px 8px;">REGISTER REPORT</div>
        ${x.map(t=>`<div style="font-size:11px;">${t}</div>`).join("")}
        ${i.phone?`<div style="font-size:11px;">${i.phone}</div>`:""}
      </div>

      ${o}
      
      <div>
        <div style="font-weight:900;">CASHIER: ${e.cashierName.toUpperCase()}</div>
        <div style="font-weight:900;">LOCATION: ${e.locationName.toUpperCase()}</div>
        <div style="font-size:11px;margin-top:2px;">
          <div>OPENED: ${d} ${l}</div>
          <div>CLOSED: ${r} ${f}</div>
        </div>
      </div>

      ${o}

      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:15px;background:#000;color:#fff;padding:2px 4px;">
        <span>TOTAL ORDERS:</span>
        <span>${g}</span>
      </div>

      <div style="margin-top:8px;">
        ${y}
      </div>

      ${v}
      ${h}
      ${m}

      ${p}
      
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:16px;padding:4px 0;">
        <span>NET SALES:</span>
        <span>${n(e.expectedSales-(e.openingFloat!==void 0&&e.fondDeCaisse!==void 0?e.openingFloat-e.fondDeCaisse:0))}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;padding:4px 0;color:#333;">
        <span>FLOAT ADJUST:</span>
        <span>${e.openingFloat!==void 0&&e.fondDeCaisse!==void 0&&e.openingFloat-e.fondDeCaisse>=0?"+":""}${n(e.openingFloat!==void 0&&e.fondDeCaisse!==void 0?e.openingFloat-e.fondDeCaisse:0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:18px;padding:4px 0;border-top:1px solid #000;">
        <span>TOTAL EXPECTED:</span>
        <span>${n(e.expectedSales)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:20px;padding:4px 0;border-top:1px solid #000;">
        <span>TOTAL ACTUAL:</span>
        <span>${n(e.actualSales)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:16px;padding:4px 0;border-top:1px dashed #000;">
        <span>NET DIFF:</span>
        <span>${e.difference>=0?"+":""}${n(e.difference)}</span>
      </div>

      ${p}
      
      <div style="text-align:center;font-size:10px;font-weight:bold;margin-top:8px;">
        *** END OF REPORT ***<br>
        ZEN POS - SYSTEM GENERATED
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `}export{D as buildRegisterReportHtml,E as firePrint};
