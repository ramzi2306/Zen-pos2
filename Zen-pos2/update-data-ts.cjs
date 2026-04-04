const fs = require('fs');

const dataFile = '/Users/1/Desktop/ZEN-POS/Zen-pos2/src/data.ts';
let dataContent = fs.readFileSync(dataFile, 'utf8');

dataContent = dataContent.replace(
  /export interface VariationOption \{\n  id: string;\n  name: string;\n  priceAdjustment\?: number;\n  ingredients\?: Ingredient\[\];\n\}\n\nexport interface VariationGroup \{\n  id: string;\n  name: string;\n  options: VariationOption\[\];\n\}/g,
  `export interface SupplementOption {
  id: string;
  name: string;
  priceAdjustment?: number;
  ingredients?: Ingredient[];
}

export interface SupplementGroup {
  id: string;
  name: string;
  options: SupplementOption[];
}

export interface VariationOption {
  id: string;
  name: string;
  price?: number;
  ingredients?: Ingredient[];
}

export interface VariationGroup {
  id: string;
  name: string;
  options: VariationOption[];
}`
);

dataContent = dataContent.replace(
  /  variations\?: VariationGroup\[\];\n  ingredients\?: Ingredient\[\];/g,
  `  variations?: VariationGroup[];
  supplements?: SupplementGroup[];
  ingredients?: Ingredient[];`
);

dataContent = dataContent.replace(
  /  selectedVariations\?: Record<string, VariationOption>;/g,
  `  selectedVariations?: Record<string, VariationOption>;
  selectedSupplements?: Record<string, SupplementOption>;`
);

fs.writeFileSync(dataFile, dataContent);
console.log('Frontend Data TS Updated');
