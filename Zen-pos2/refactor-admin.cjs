const fs = require('fs');

let content = fs.readFileSync('src/views/AdminViews.tsx', 'utf8');

// 1. Initial State
// const [variations, setVariations] = useState<VariationGroup[]>(product?.variations || []);
// Add supplements state
content = content.replace(/const \[variations, setVariations\] = useState<VariationGroup\[\]>\(product\?\.variations \|\| \[\]\);/g, 
`const [variations, setVariations] = useState<any[]>(product?.variations || []);
    const [supplements, setSupplements] = useState<any[]>(product?.supplements || []);`);

// 2. Handlers hooks
// I need to duplicate the group handles for supplements
content = content.replace(/const updateOptionPrice = \(groupIndex: number, optionIndex: number, price: string\) => \{\n    const newVars = \[\.\.\.variations\];\n    newVars\[groupIndex\]\.options\[optionIndex\]\.priceAdjustment = parseFloat\(price\) \|\| 0;\n    setVariations\(newVars\);\n  \};/g,
`const updateOptionPrice = (groupIndex: number, optionIndex: number, price: string) => {
    const newVars = [...variations];
    newVars[groupIndex].options[optionIndex].price = parseFloat(price) || 0;
    setVariations(newVars);
  };

  const addSupplementGroup = () => {
    setSupplements([...supplements, { id: \`sg_\${Date.now()}\`, name: '', options: [] }]);
  };

  const updateSupplementGroupName = (index: number, name: string) => {
    const newSupps = [...supplements];
    newSupps[index].name = name;
    setSupplements(newSupps);
  };

  const removeSupplementGroup = (index: number) => {
    setSupplements(supplements.filter((_, i) => i !== index));
  };

  const addSupplementOption = (groupIndex: number) => {
    const newSupps = [...supplements];
    newSupps[groupIndex].options.push({ id: \`so_\${Date.now()}\`, name: '', priceAdjustment: 0 });
    setSupplements(newSupps);
  };

  const updateSupplementOptionName = (groupIndex: number, optionIndex: number, name: string) => {
    const newSupps = [...supplements];
    newSupps[groupIndex].options[optionIndex].name = name;
    setSupplements(newSupps);
  };

  const updateSupplementOptionPrice = (groupIndex: number, optionIndex: number, price: string) => {
    const newSupps = [...supplements];
    newSupps[groupIndex].options[optionIndex].priceAdjustment = parseFloat(price) || 0;
    setSupplements(newSupps);
  };

  const removeSupplementOption = (groupIndex: number, optionIndex: number) => {
    const newSupps = [...supplements];
    newSupps[groupIndex].options = newSupps[groupIndex].options.filter((_, i) => i !== optionIndex);
    setSupplements(newSupps);
  };
`);

// 3. handleSave payload
content = content.replace(/variations: variations\.map\(vg => \(\{ id: vg\.id, name: vg\.name, options: vg\.options\.map\(o => \(\{ id: o\.id, name: o\.name, price_adjustment: o\.priceAdjustment \|\| 0 \}\)\) \}\)\),/g, 
`variations: variations.map(vg => ({ id: vg.id, name: vg.name, options: vg.options.map((o: any) => ({ id: o.id, name: o.name, price: o.price || 0 })) })),
      supplements: supplements.map(sg => ({ id: sg.id, name: sg.name, options: sg.options.map((o: any) => ({ id: o.id, name: o.name, price_adjustment: o.priceAdjustment || 0 })) })),`);

// 4. In the UI JSX for the form:
// We hide base price if variations exist.
content = content.replace(/<div className="flex flex-col">\n                      <label className="text-sm font-bold text-on-surface mb-2">Price \(MAD\) \(\*\)<\/label>\n                      <input\n                        type="number"/g, 
`{variations.length === 0 && (
                        <div className="flex flex-col">
                          <label className="text-sm font-bold text-on-surface mb-2">Price (MAD) (*)</label>
                          <input
                            type="number"`);

content = content.replace(/onChange=\{\(e\) => setPrice\(e\.target\.value\)\}\n                      \/>\n                    <\/div>/g, 
`onChange={(e) => setPrice(e.target.value)}
                          />
                        </div>
                      )}`);

// Then we must duplicate the whole "Variations" section and call it "Supplements"


fs.writeFileSync('src/views/AdminViews.tsx', content);
console.log('AdminViews.tsx updated');
