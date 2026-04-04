const fs = require('fs');
let content = fs.readFileSync('src/components/cart/CartItem.tsx', 'utf8');

if (!content.includes('import { getCartItemPrice }')) {
  content = content.replace("import { useLocalization } from '../../context/LocalizationContext';", "import { useLocalization } from '../../context/LocalizationContext';\nimport { getCartItemPrice } from '../../utils/cartUtils';");
}

content = content.replace(/item\.selectedVariations && Object\.keys\(item\.selectedVariations\)\.length > 0 && \(/g, `(
              (item.selectedVariations && Object.keys(item.selectedVariations).length > 0) ||
              (item.selectedSupplements && Object.keys(item.selectedSupplements).length > 0)
            ) && (`);

content = content.replace(/\{Object\.values\(item\.selectedVariations\)\.map\(\(opt: any\) => \(\n                  <span key=\{opt\.id}.*?\n                    \{opt\.name\} \{opt\.priceAdjustment \? \`\(\\\+\\\$\{formatCurrency\(opt\.priceAdjustment\)\}\)\` : \'\'\}\n                  <\/span>\n                \)\)\}/g, 
`{Object.values(item.selectedVariations || {}).map((opt: any) => (
                  <span key={opt.id} className="text-[9px] text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded-sm font-medium">
                    {opt.name} {opt.price ? \`(+\${formatCurrency(opt.price)})\` : ''}
                  </span>
                ))}
                {Object.values(item.selectedSupplements || {}).map((opt: any) => (
                  <span key={opt.id} className="text-[9px] text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded-sm font-medium border border-primary/20">
                    {opt.name} {opt.priceAdjustment ? \`(+\${formatCurrency(opt.priceAdjustment)})\` : ''}
                  </span>
                ))}`);

content = content.replace(/\{formatCurrency\(\(item\.price \+ Object\.values\(item\.selectedVariations \|\| \{\}\)\.reduce\(\(sum: number, opt: any\) => sum \+ \(opt\.priceAdjustment \|\| 0\), 0\) - item\.discount\) \* item\.quantity\)\}/g, 
`{formatCurrency((getCartItemPrice(item) - (item.discount || 0)) * item.quantity)}`);

content = content.replace(/\{formatCurrency\(\(item\.price \+ Object\.values\(item\.selectedVariations \|\| \{\}\)\.reduce\(\(sum: number, opt: any\) => sum \+ \(opt\.priceAdjustment \|\| 0\), 0\)\) \* item\.quantity\)\}/g, 
`{formatCurrency(getCartItemPrice(item) * item.quantity)}`);

fs.writeFileSync('src/components/cart/CartItem.tsx', content);
console.log('CartItem.tsx updated');
