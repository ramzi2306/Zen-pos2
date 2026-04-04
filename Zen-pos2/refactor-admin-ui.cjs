const fs = require('fs');

let content = fs.readFileSync('src/views/AdminViews.tsx', 'utf8');

// For Variations, change `priceAdjustment` reference to `price` in the UI input binding
content = content.replace(/value=\{opt\.priceAdjustment \|\| \'\'\}/g, `value={opt.price || ''}`);

// Now duplicate the Variations UI block and make a Supplements UI block under it
const variationsBlockMatch = content.match(/<div className="flex justify-between items-center mb-4">[\s\S]*?<\/div> <!-- End of variations \/ ingredients wrapping div/);
// Wait, the regex might be too hard to guess exactly because I don't know the exact HTML structure closing.

content = content.replace(/\{variations\.map\(\(group, groupIndex\) => \([\s\S]*?Placeholder="e\.g\., \+2\.00"[\s\S]*?<\/div>\n                            \)\)\}\n                          <\/div>\n                        <\/div>\n                      \)\)\}/g,
function(match) {
  // We need to fix the '+2.00' placeholder into e.g. '15.00' for Variation price
  let replaced = match.replace(/Placeholder="e\.g\., \+2\.00"/g, 'placeholder="e.g., 15.00"');
  
  // Then we construct the Supplements block by replacing handlers
  let suppsBlock = match
    .replace(/variations/g, 'supplements')
    .replace(/group/g, 'sg')
    .replace(/groupIndex/g, 'sgIndex')
    .replace(/updateGroupName/g, 'updateSupplementGroupName')
    .replace(/removeGroup/g, 'removeSupplementGroup')
    .replace(/addOption/g, 'addSupplementOption')
    .replace(/updateOptionName/g, 'updateSupplementOptionName')
    .replace(/updateOptionPrice/g, 'updateSupplementOptionPrice')
    .replace(/removeOption/g, 'removeSupplementOption')
    .replace(/opt\.price \|\| \'\'/g, 'opt.priceAdjustment || \'\'');

  return replaced + `
                      {/* Supplements Section */}
                      <div className="flex justify-between items-center mb-4 mt-8 border-t border-outline-variant/20 pt-8">
                        <h4 className="font-bold text-on-surface text-lg flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary">extension</span>
                          Supplements
                        </h4>
                        <button
                          type="button"
                          onClick={addSupplementGroup}
                          className="flex items-center gap-2 text-sm font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">add</span>
                          Add Supplement Category
                        </button>
                      </div>
                      ` + suppsBlock;
});

fs.writeFileSync('src/views/AdminViews.tsx', content);
console.log('AdminViews UI updated');
