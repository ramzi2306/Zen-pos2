const fs = require('fs');

let content = fs.readFileSync('src/views/public/PublicMenuPage.tsx', 'utf8');

if (!content.includes('import { getCartItemPrice, getSubtotal }')) {
  // Try to insert the import somewhere near top
  content = content.replace("import React,", "import React,\nimport { getCartItemPrice, getSubtotal } from '../../utils/cartUtils';\nimport ");
  // actually wait, let's just insert it at the top
  content = "import { getCartItemPrice, getSubtotal } from '../../utils/cartUtils';\n" + content;
}

// 1. Line 55
// const lineTotal = ((item.price + varAdj) * item.quantity);
// -> const lineTotal = getCartItemPrice(item) * item.quantity;
content = content.replace(/const varAdj = Object\.values\(item\.selectedVariations \?\? \{\}\)\.reduce\(\(s, v\) => s \+ \(v\.priceAdjustment \?\? 0\), 0\);\n    const lineTotal = \(\(item\.price \+ varAdj\) \* item\.quantity\);/g, 
`const lineTotal = getCartItemPrice(item as any) * item.quantity;`);

// 2. Line 285
content = content.replace(/subtotal: items\.reduce\(\(s, i\) => s \+ \(i\.price \+ Object\.values\(i\.selectedVariations \?\? \{\}\)\.reduce\(\(a, v\) => a \+ \(v\.priceAdjustment \?\? 0\), 0\)\) \* i\.quantity, 0\)/g, 
`subtotal: items.reduce((s, i) => s + getCartItemPrice(i as any) * i.quantity, 0)`);

// 3. Line 754
content = content.replace(/const varAdj = Object\.values\(item\.selectedVariations \?\? \{\}\)\.reduce\(\(s, v\) => s \+ \(v\.priceAdjustment \?\? 0\), 0\);\n                        return \(\n                          <div key=\{item\.cartItemId\}/g,
`return (
                          <div key={item.cartItemId}`);
content = content.replace(/\{formatCurrency\(\(item\.price \+ varAdj\) \* item\.quantity\)\}/g,
`{formatCurrency((getCartItemPrice(item as any)) * item.quantity)}`);

// 4. Line 875
content = content.replace(/const varAdj = Object\.values\(item\.selectedVariations \?\? \{\}\)\.reduce\(\(s, v\) => s \+ \(v\.priceAdjustment \?\? 0\), 0\);\n                    return \(\n                      <div key=\{item\.cartItemId\}/g,
`return (
                      <div key={item.cartItemId}`);
// Line 891
content = content.replace(/<span className="text-primary text-lg">\{formatCurrency\(cartSnapshot\.reduce\(\(s, i\) => s \+ \(i\.price \+ Object\.values\(i\.selectedVariations \?\? \{\}\)\.reduce\(\(a, v\) => a \+ \(v\.priceAdjustment \?\? 0\), 0\)\) \* i\.quantity, 0\)\)\}<\/span>/g,
`<span className="text-primary text-lg">{formatCurrency(cartSnapshot.reduce((s, i) => s + getCartItemPrice(i as any) * i.quantity, 0))}</span>`);

// Variations iteration UI display
content = content.replace(/\{item\.selectedVariations && Object\.keys\(item\.selectedVariations\)\.length > 0 && \(\n                            <div className="flex flex-wrap gap-1 mt-0\.5">/g,
`{((item.selectedVariations && Object.keys(item.selectedVariations).length > 0) || (item.selectedSupplements && Object.keys(item.selectedSupplements).length > 0)) && (
                            <div className="flex flex-wrap gap-1 mt-0.5">`);

content = content.replace(/\{Object\.values\(item\.selectedVariations \?\? \{\}\)\.map\(\(opt: any\) => \(\n                                <span key=\{opt\.id\} className="text-\[9px\] text-on-surface-variant bg-surface-container-highest px-1\.5 py-0\.5 rounded-sm font-medium">/g,
`{Object.values(item.selectedVariations ?? {}).map((opt: any) => (
                                <span key={opt.id} className="text-[9px] text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded-sm font-medium">`);

content = content.replace(/\{opt\.name\} \{opt\.priceAdjustment \? \`\(\\\+\\\$\{formatCurrency\(opt\.priceAdjustment\)\}\)\` : \'\'\}/g,
`{opt.name} {opt.price ? \`(+\${formatCurrency(opt.price)})\` : ''}`);

content = content.replace(/<\/span>\n                              \)\)\}/g,
`</span>
                              ))}
                              {Object.values((item as any).selectedSupplements ?? {}).map((opt: any) => (
                                <span key={\`supp-\${opt.id}\`} className="text-[9px] text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded-sm font-medium border border-primary/20">
                                  {opt.name} {opt.priceAdjustment ? \`(+\${formatCurrency(opt.priceAdjustment)})\` : ''}
                                </span>
                              ))}`);

fs.writeFileSync('src/views/public/PublicMenuPage.tsx', content);
console.log('PublicMenuPage.tsx updated');
