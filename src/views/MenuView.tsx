import React, { useState } from 'react';
import { PRODUCTS, Product, VariationOption } from '../data';
import { motion, AnimatePresence } from 'motion/react';

export const MenuView = ({ addToCart }: { addToCart: (p: Product, variations?: Record<string, VariationOption>) => void }) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariations, setSelectedVariations] = useState<Record<string, VariationOption>>({});
  const [productRect, setProductRect] = useState<DOMRect | null>(null);
  const categories = ['All', 'Nigiri', 'Sashimi', 'Sake', 'Specials', 'Rolls'];

  const filteredProducts = activeCategory === 'All' 
    ? PRODUCTS 
    : PRODUCTS.filter(p => p.category === activeCategory);

  const handleProductClick = (product: Product, e: React.MouseEvent<HTMLDivElement>) => {
    if (product.variations && product.variations.length > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const initialVariations: Record<string, VariationOption> = {};
      product.variations.forEach(v => {
        initialVariations[v.id] = v.options[0];
      });
      setProductRect(rect);
      setSelectedProduct(product);
      setSelectedVariations(initialVariations);
    } else {
      addToCart(product);
    }
  };

  const handleAddToCartWithVariations = () => {
    if (selectedProduct) {
      addToCart(selectedProduct, selectedVariations);
      setSelectedProduct(null);
      setSelectedVariations({});
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-grid-pattern">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div className="flex gap-2 bg-surface-container p-1 rounded-lg border border-outline-variant/10 overflow-x-auto no-scrollbar w-full md:w-auto">
            {categories.map(category => (
              <button 
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`whitespace-nowrap px-4 py-1.5 rounded text-[10px] font-headline font-bold uppercase tracking-micro transition-colors flex-shrink-0 ${
                  activeCategory === category 
                    ? 'bg-surface-container-highest text-primary shadow-sm' 
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 pb-24">
          {filteredProducts.map(product => (
            <div key={product.id} onClick={(e) => handleProductClick(product, e)} className="group bg-surface-container rounded-lg overflow-hidden flex flex-col hover:bg-surface-container-high transition-colors border border-transparent hover:border-outline-variant/20 cursor-pointer">
              <div className="w-full h-32 md:h-40 relative overflow-hidden bg-surface-container-lowest">
                <img src={product.image} alt={product.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                {product.tags?.includes('Chef Choice') && (
                  <div className="absolute top-2 left-2">
                    <span className="bg-secondary text-on-secondary text-[8px] font-headline font-bold uppercase tracking-micro px-1.5 py-0.5 rounded-sm">Chef Choice</span>
                  </div>
                )}
              </div>
              <div className="flex-1 p-3 md:p-4 flex flex-col justify-between">
                <div className="mb-2 md:mb-4">
                  <div className="flex justify-between items-start mb-1 md:mb-2 gap-2">
                    <h3 className="font-headline font-bold text-sm md:text-base text-on-surface leading-tight line-clamp-2">{product.name}</h3>
                    <span className="font-headline font-bold text-primary text-sm md:text-base whitespace-nowrap">${product.price.toFixed(2)}</span>
                  </div>
                  <p className="hidden md:block text-xs text-on-surface-variant line-clamp-2 leading-relaxed">{product.description}</p>
                </div>
                <div className="flex justify-between items-end mt-auto">
                  <span className={`text-[9px] font-headline font-bold uppercase tracking-micro flex items-center gap-1.5 ${product.stockLevel === 'Low' ? 'text-error' : 'text-tertiary'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${product.stockLevel === 'Low' ? 'bg-error' : 'bg-tertiary'}`}></span> 
                    <span className="hidden sm:inline">{product.stockLevel === 'Low' ? 'Low Stock' : 'In Stock'}</span>
                  </span>
                  <button className="w-8 h-8 rounded bg-primary-container text-primary flex items-center justify-center hover:bg-secondary hover:text-on-secondary transition-colors shadow-sm">
                    <span className="material-symbols-outlined text-lg">add</span>
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="col-span-full bg-surface-container-low border border-outline-variant/20 rounded-lg p-4 md:p-6 flex items-center gap-4 md:gap-6 mt-2">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded bg-surface-container-highest flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-xl md:text-2xl">info</span>
            </div>
            <div className="flex-1">
                <h4 className="font-headline font-bold text-sm md:text-base text-on-surface mb-1">Daily Market Specials</h4>
                <p className="text-[10px] md:text-xs text-on-surface-variant">Ask the head chef about today's seasonal arrivals directly from Toyosu Market, including Shima Aji and Kinmedai.</p>
            </div>
            <button className="px-4 md:px-6 py-2 bg-surface-container-highest hover:bg-surface-variant text-primary text-[10px] font-headline font-bold uppercase tracking-micro rounded transition-colors whitespace-nowrap">
                View List
            </button>
          </div>
        </div>
      </div>
      {/* 3D Touch Variations Overlay */}
      <AnimatePresence>
        {selectedProduct && productRect && selectedProduct.variations && (
          <div className="fixed inset-0 z-[80]">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
              onClick={() => setSelectedProduct(null)} 
            />
            
            {(() => {
              const menuHeight = 350; // Estimated height of variations menu
              const scale = 1.03;
              const scaledHeight = productRect.height * scale;
              const scaledWidth = productRect.width * scale;
              const isDesktop = window.innerWidth >= 768;
              
              let safeTop = productRect.top;
              let menuTop = 0;
              let menuLeft = 0;
              const menuWidth = Math.max(productRect.width, 280);
              let transformOrigin = 'top';

              if (isDesktop) {
                // Desktop: Position to the right
                if (safeTop + menuHeight > window.innerHeight - 20) {
                  safeTop = Math.max(20, window.innerHeight - 20 - menuHeight);
                }
                menuTop = safeTop;
                
                menuLeft = productRect.left + scaledWidth + 16;
                transformOrigin = 'left top';
                
                // If menu goes off right of screen, shift it to the left of the card
                if (menuLeft + menuWidth > window.innerWidth - 20) {
                  menuLeft = productRect.left - menuWidth - 16;
                  transformOrigin = 'right top';
                }
              } else {
                // Mobile: Position below
                if (safeTop + scaledHeight + 16 + menuHeight > window.innerHeight - 20) {
                  safeTop = Math.max(20, window.innerHeight - 20 - menuHeight - 16 - scaledHeight);
                }
                menuTop = safeTop + scaledHeight + 16;
                
                menuLeft = productRect.left;
                transformOrigin = 'top';
                
                if (menuLeft + menuWidth > window.innerWidth - 20) {
                  menuLeft = Math.max(20, window.innerWidth - 20 - menuWidth);
                }
              }

              return (
                <>
                  {/* Cloned Product Card */}
                  <motion.div
                    initial={{ 
                      top: productRect.top, 
                      left: productRect.left, 
                      width: productRect.width, 
                      height: productRect.height,
                      scale: 1
                    }}
                    animate={{ 
                      top: safeTop,
                      scale: scale,
                    }}
                    exit={{ 
                      top: productRect.top,
                      scale: 1,
                      opacity: 0
                    }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="fixed z-[90] bg-surface-container rounded-lg overflow-hidden flex flex-col border border-outline-variant/20 shadow-2xl pointer-events-none origin-top"
                  >
                    <div className="w-full h-32 md:h-40 relative overflow-hidden bg-surface-container-lowest">
                      <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" />
                      {selectedProduct.tags?.includes('Chef Choice') && (
                        <div className="absolute top-2 left-2">
                          <span className="bg-secondary text-on-secondary text-[8px] font-headline font-bold uppercase tracking-micro px-1.5 py-0.5 rounded-sm">Chef Choice</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 p-3 md:p-4 flex flex-col justify-between">
                      <div className="mb-2 md:mb-4">
                        <div className="flex justify-between items-start mb-1 md:mb-2 gap-2">
                          <h3 className="font-headline font-bold text-sm md:text-base text-on-surface leading-tight line-clamp-2">{selectedProduct.name}</h3>
                          <span className="font-headline font-bold text-primary text-sm md:text-base whitespace-nowrap">${selectedProduct.price.toFixed(2)}</span>
                        </div>
                        <p className="hidden md:block text-xs text-on-surface-variant line-clamp-2 leading-relaxed">{selectedProduct.description}</p>
                      </div>
                      <div className="flex justify-between items-end mt-auto">
                        <span className={`text-[9px] font-headline font-bold uppercase tracking-micro flex items-center gap-1.5 ${selectedProduct.stockLevel === 'Low' ? 'text-error' : 'text-tertiary'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${selectedProduct.stockLevel === 'Low' ? 'bg-error' : 'bg-tertiary'}`}></span> 
                          <span className="hidden sm:inline">{selectedProduct.stockLevel === 'Low' ? 'Low Stock' : 'In Stock'}</span>
                        </span>
                        <button className="w-8 h-8 rounded bg-primary-container text-primary flex items-center justify-center shadow-sm">
                          <span className="material-symbols-outlined text-lg">add</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>

                  {/* Variations Menu */}
                  <motion.div
                    initial={{ opacity: 0, y: isDesktop ? 0 : -20, x: isDesktop ? (transformOrigin === 'right top' ? 20 : -20) : 0, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                    exit={{ opacity: 0, y: isDesktop ? 0 : -20, x: isDesktop ? (transformOrigin === 'right top' ? 20 : -20) : 0, scale: 0.95 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300, delay: 0.05 }}
                    style={{
                      position: 'fixed',
                      top: menuTop,
                      left: menuLeft,
                      width: menuWidth,
                      transformOrigin: transformOrigin,
                    }}
                    className="z-[90] bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col"
                  >
                    <div className="p-4 overflow-y-auto max-h-[40vh] space-y-4">
                      {selectedProduct.variations.map(group => (
                        <div key={group.id}>
                          <h4 className="font-headline font-bold text-xs text-on-surface mb-2 uppercase tracking-wider">{group.name}</h4>
                          <div className="flex flex-col gap-2">
                            {group.options.map(option => {
                              const isSelected = selectedVariations[group.id]?.id === option.id;
                              return (
                                <button
                                  key={option.id}
                                  onClick={() => setSelectedVariations(prev => ({ ...prev, [group.id]: option }))}
                                  className={`p-2.5 rounded-lg border text-left transition-all flex justify-between items-center ${
                                    isSelected 
                                      ? 'border-primary bg-primary/10 text-primary' 
                                      : 'border-outline-variant/20 bg-surface-container hover:bg-surface-container-high text-on-surface'
                                  }`}
                                >
                                  <span className="font-bold text-sm">{option.name}</span>
                                  {option.priceAdjustment ? (
                                    <span className={`text-xs ${isSelected ? 'text-primary/80' : 'text-on-surface-variant'}`}>
                                      {option.priceAdjustment > 0 ? '+' : ''}${option.priceAdjustment.toFixed(2)}
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 border-t border-outline-variant/10 bg-surface-container-low">
                      <button 
                        onClick={handleAddToCartWithVariations}
                        className="w-full py-3 bg-primary text-on-primary rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors shadow-md flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
                        Add - ${(selectedProduct.price + Object.values(selectedVariations).reduce((sum: number, opt: any) => sum + (opt.priceAdjustment || 0), 0)).toFixed(2)}
                      </button>
                    </div>
                  </motion.div>
                </>
              );
            })()}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
