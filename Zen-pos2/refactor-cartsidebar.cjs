const fs = require('fs');
let content = fs.readFileSync('src/components/cart/CartSidebar.tsx', 'utf8');

if (!content.includes('import { getCartItemPrice, getSubtotal }')) {
  content = content.replace("import { useLayout } from '../../context/LayoutContext';", "import { useLayout } from '../../context/LayoutContext';\nimport { getCartItemPrice, getSubtotal } from '../../utils/cartUtils';");
}

// 1. Line 59
content = content.replace(/\{formatCurrency\(\(item\.price \+ Object\.values\(item\.selectedVariations \|\| \{\}\)\.reduce\(\(vSum: number, opt: any\) => vSum \+ \(opt\.priceAdjustment \|\| 0\), 0\) - \(item\.discount \|\| 0\)\) \* item\.quantity\)\}/g, 
`{formatCurrency((getCartItemPrice(item) - (item.discount || 0)) * item.quantity)}`);

// 2. Line 161 (in receipt generation)
content = content.replace(/const varAdj = variations\.reduce\(\(s: number, o: any\) => s \+ \(o\.priceAdjustment \|\| 0\), 0\);/g, 
`const varAdj = variations.reduce((s: number, o: any) => s + (o.price || 0), 0);
      const supps = Object.values(item.selectedSupplements || {});
      const suppAdj = supps.reduce((s: number, o: any) => s + (o.priceAdjustment || 0), 0);`);
      
content = content.replace(/const lineTotal = \(\(item\.price \+ varAdj\) \* item\.quantity\) - \(item\.discount \|\| 0\);/g, 
`const lineTotal = (getCartItemPrice(item) * item.quantity) - (item.discount || 0);`);

// 3. Receipt iteration modifier list:
//   ${variations.map((v: any) => \`\n   Note: \${v.name}\`).join('')}
content = content.replace(/\$\{variations\.map\(\(v: any\) => \`\\n   Note: \$\{v\.name\}\`\)\.join\(\'\'\)\}/g,
`\${variations.map((v: any) => \`\\n   Note: \${v.name}\`).join('')}\${supps.map((s: any) => \`\\n   Add: \${s.name}\`).join('')}`);

// 4. Another place formatting variations (Line ~551)
content = content.replace(/\{formatCurrency\(\(item\.price \+ Object\.values\(item\.selectedVariations \|\| \{\}\)\.reduce\(\(sum: number, opt: any\) => sum \+ \(opt\.priceAdjustment \|\| 0\), 0\) - \(item\.discount \|\| 0\)\) \* item\.quantity\)\}/g, 
`{formatCurrency((getCartItemPrice(item) - (item.discount || 0)) * item.quantity)}`);

content = content.replace(/\{item\.quantity > 1 \? \`\$\{item\.quantity\}x @ \$\{formatCurrency\(item\.price \+ Object\.values\(item\.selectedVariations \|\| \{\}\)\.reduce\(\(sum: number, opt: any\) => sum \+ \(opt\.priceAdjustment \|\| 0\), 0\) - \(item\.discount \|\| 0\)\)\} \` : \'\'\}/g,
`{item.quantity > 1 ? \`\${item.quantity}x @ \${formatCurrency(getCartItemPrice(item) - (item.discount || 0))} \` : ''}`);

content = content.replace(/<div className="text-\[9px\] text-on-surface-variant flex flex-wrap gap-1 mt-0\.5">/g, 
`<div className="text-[9px] text-on-surface-variant flex flex-wrap gap-1 mt-0.5">
                              {Object.values(item.selectedSupplements || {}).map((s: any) => (
                                <span key={\`supp-\${s.id}\`}>+ {s.name}</span>
                              ))}`);

// 5. Line 1047: similar receipt generation map 
content = content.replace(/const varAdj = variations\.reduce\(\(s: number, o: any\) => s \+ \(o\.priceAdjustment \|\| 0\), 0\);/g, 
`const varAdj = variations.reduce((s: number, o: any) => s + (o.price || 0), 0);
                      const supps = Object.values(item.selectedSupplements || {});
                      const suppAdj = supps.reduce((s: number, o: any) => s + (o.priceAdjustment || 0), 0);`);
                      
content = content.replace(/const lineTotal = \(\(item\.price \+ varAdj\) \* item\.quantity\) - \(item\.discount \|\| 0\);/g, 
`const lineTotal = (getCartItemPrice(item) * item.quantity) - (item.discount || 0);`);

content = content.replace(/<div className="receipt-mod"> Note: \{v\.name\}<\/div>/g, 
`<div className="receipt-mod"> Note: {v.name}</div>`
); // Nothing to replace here, just keeping it, then adding supplements

content = content.replace(/\{variations\.length > 0 && variations\.map\(\(v: any\) => \(\n                        <div key=\{v\.id\} className="receipt-mod"> Note: \{v\.name\}<\/div>\n                      \)\)\}/g,
`{variations.length > 0 && variations.map((v: any) => (
                        <div key={v.id} className="receipt-mod"> Note: {v.name}</div>
                      ))}
                      {supps.length > 0 && supps.map((s: any) => (
                        <div key={s.id} className="receipt-mod"> Add: {s.name}</div>
                      ))}`);


fs.writeFileSync('src/components/cart/CartSidebar.tsx', content);
console.log('CartSidebar.tsx updated');
