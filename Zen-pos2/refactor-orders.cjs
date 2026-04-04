const fs = require('fs');
let content = fs.readFileSync('src/views/OrdersView.tsx', 'utf8');

content = content.replace(/const variationsPrice = Object\.values\(item\.selectedVariations \|\| \{\}\)\.reduce\(\(vSum: number, opt: any\) => vSum \+ \(opt\.priceAdjustment \|\| 0\), 0\);/g, 
`const varPrice = Object.values(item.selectedVariations || {}).reduce((vSum: number, opt: any) => vSum + (opt.price || 0), 0);
      const suppPrice = Object.values(item.selectedSupplements || {}).reduce((vSum: number, opt: any) => vSum + (opt.priceAdjustment || 0), 0);
      const variationsPrice = varPrice + suppPrice; // using old name to preserve variable`);

content = content.replace(/const varAdj = Object\.values\(item\.selectedVariations \|\| \{\}\)\.reduce\(\(s: number, o: any\) => s \+ \(o\.priceAdjustment \|\| 0\), 0\);/g, 
`const varPrice = Object.values(item.selectedVariations || {}).reduce((s: number, o: any) => s + (o.price || 0), 0);
                        const suppPrice = Object.values(item.selectedSupplements || {}).reduce((s: number, o: any) => s + (o.priceAdjustment || 0), 0);
                        const varAdj = varPrice + suppPrice;`);

fs.writeFileSync('src/views/OrdersView.tsx', content);
console.log('OrdersView.tsx updated');
