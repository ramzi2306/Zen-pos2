import React, { useState, useEffect } from 'react';
import { Product, VariationOption, SupplementOption } from '../data';
import { AnimatePresence } from 'motion/react';
import * as api from '../api';
import { ProductCard } from '../components/product/ProductCard';
import { VariationModal } from '../components/product/VariationModal';
import { CategoryFilter } from '../components/product/CategoryFilter';

export const MenuView = ({ addToCart }: { addToCart: (p: Product, variations?: Record<string, VariationOption>, supplements?: Record<string, SupplementOption>) => void }) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariations, setSelectedVariations] = useState<Record<string, VariationOption>>({});
  const [selectedSupplements, setSelectedSupplements] = useState<Record<string, SupplementOption>>({});
  const [productRect, setProductRect] = useState<DOMRect | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [dailySpecial, setDailySpecial] = useState('');
  const [showSpecialModal, setShowSpecialModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.products.listProducts(),
      api.products.listCategories(),
      api.settings.getBranding(),
    ]).then(([prods, cats, branding]) => {
      setProducts(prods);
      setCategories(['All', ...cats.map(c => c.name)]);
      setDailySpecial(branding.dailySpecial || '');
      setLoading(false);
      // Fetch images separately — doesn't block initial render
      api.products.listProductImages().then(images => {
        const map: Record<string, string> = {};
        images.forEach(i => { map[i.id] = i.image; });
        setProducts(prev => prev.map(p => ({ ...p, image: map[p.id] ?? p.image })));
      }).catch(() => {});
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filteredProducts = activeCategory === 'All'
    ? products
    : products.filter(p => p.category === activeCategory);

  const handleProductClick = (product: Product, e: React.MouseEvent<HTMLDivElement>) => {
    const hasVariations = product.variations && product.variations.length > 0;
    const hasSupplements = product.supplements && product.supplements.length > 0;

    if (hasVariations || hasSupplements) {
      const rect = e.currentTarget.getBoundingClientRect();
      const initialVariations: Record<string, VariationOption> = {};
      const initialSupplements: Record<string, SupplementOption> = {};
      
      product.variations?.forEach(v => {
        if (v.options.length > 0) initialVariations[v.id] = v.options[0];
      });
      
      setProductRect(rect);
      setSelectedProduct(product);
      setSelectedVariations(initialVariations);
      setSelectedSupplements(initialSupplements);
    } else {
      addToCart(product);
    }
  };

  const handleAddToCartWithVariations = () => {
    if (selectedProduct) {
      addToCart(selectedProduct, selectedVariations, selectedSupplements);
      setSelectedProduct(null);
      setSelectedVariations({});
      setSelectedSupplements({});
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-grid-pattern">
      <div className="max-w-5xl mx-auto">
        {/* Category filter */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <CategoryFilter
            categories={categories}
            activeCategory={activeCategory}
            onChange={setActiveCategory}
          />
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 pb-24">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden bg-surface-container animate-pulse">
                  <div className="aspect-square bg-surface-container-high" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-surface-container-high rounded w-3/4" />
                    <div className="h-3 bg-surface-container-high rounded w-1/2" />
                  </div>
                </div>
              ))
            : filteredProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={(e) => handleProductClick(product, e)}
                />
              ))
          }

          {/* Daily specials info banner — hidden when empty */}
          {dailySpecial && (
            <div className="col-span-full bg-surface-container-low border border-outline-variant/20 rounded-lg p-4 md:p-6 flex items-center gap-4 md:gap-6 mt-2">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded bg-surface-container-highest flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-xl md:text-2xl">star</span>
              </div>
              <div className="flex-1">
                <h4 className="font-headline font-bold text-sm md:text-base text-on-surface mb-1">Daily Market Specials</h4>
                <p className="text-[10px] md:text-xs text-on-surface-variant line-clamp-2">{dailySpecial}</p>
              </div>
              <button
                onClick={() => setShowSpecialModal(true)}
                className="px-4 md:px-6 py-2 bg-surface-container-highest hover:bg-surface-variant text-primary text-[10px] font-headline font-bold uppercase tracking-micro rounded transition-colors whitespace-nowrap"
              >
                View List
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Daily specials modal */}
      {showSpecialModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSpecialModal(false)} />
          <div className="relative w-full max-w-lg bg-surface-container rounded-2xl border border-outline-variant/20 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">star</span>
                <h2 className="text-lg font-headline font-bold text-on-surface">Today's Daily Specials</h2>
              </div>
              <button onClick={() => setShowSpecialModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant transition-colors">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{dailySpecial}</p>
            </div>
          </div>
        </div>
      )}

      {/* Variation modal (3D touch) */}
      <AnimatePresence>
        {selectedProduct && productRect && (selectedProduct.variations || selectedProduct.supplements) && (
          <VariationModal
            product={selectedProduct}
            productRect={productRect}
            selectedVariations={selectedVariations}
            selectedSupplements={selectedSupplements}
            onSelectVariation={(groupId, option) =>
              setSelectedVariations(prev => ({ ...prev, [groupId]: option }))
            }
            onSelectSupplement={(groupId, option) =>
              setSelectedSupplements(prev => {
                const next = { ...prev };
                if (next[groupId]?.id === option.id) {
                  delete next[groupId];
                } else {
                  next[groupId] = option;
                }
                return next;
              })
            }
            onClose={() => {
              setSelectedProduct(null);
              setSelectedVariations({});
              setSelectedSupplements({});
            }}
            onAdd={handleAddToCartWithVariations}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
