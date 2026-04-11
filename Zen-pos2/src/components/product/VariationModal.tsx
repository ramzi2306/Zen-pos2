import React from 'react';
import { motion } from 'motion/react';
import { Product, VariationOption, SupplementOption } from '../../data';
import { useLocalization } from '../../context/LocalizationContext';
import { getCartItemPrice } from '../../utils/cartUtils';

/**
 * VariationModal — bottom-sheet (mobile) / centered modal (desktop).
 * Always renders a vertical product card regardless of the grid layout.
 * Works for all products, with or without variations.
 */
export const VariationModal = ({
  product,
  productRect: _productRect, // kept for API compat, not used for positioning
  selectedVariations,
  selectedSupplements,
  onSelectVariation,
  onSelectSupplement,
  onClose,
  onAdd,
}: {
  product: Product;
  productRect: DOMRect;
  selectedVariations: Record<string, VariationOption>;
  selectedSupplements: Record<string, SupplementOption>;
  onSelectVariation: (groupId: string, option: VariationOption) => void;
  onSelectSupplement: (groupId: string, option: SupplementOption) => void;
  onClose: () => void;
  onAdd: () => void;
}) => {
  const { formatCurrency } = useLocalization();
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

  const currentPrice = getCartItemPrice({
    ...product,
    cartItemId: 'temp',
    quantity: 1,
    selectedVariations,
    selectedSupplements,
  });

  const hasOptions =
    (product.variations && product.variations.length > 0) ||
    (product.supplements && product.supplements.length > 0);

  return (
    <div className="fixed inset-0 z-[150] flex items-end md:items-center md:justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Panel — always vertical, bottom-sheet on mobile, centered on desktop */}
      <motion.div
        initial={isDesktop ? { opacity: 0, scale: 0.95, y: 8 } : { y: '100%' }}
        animate={isDesktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
        exit={isDesktop ? { opacity: 0, scale: 0.95, y: 8 } : { y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="relative z-[160] w-full md:w-[420px] bg-surface-container-lowest rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        style={{ maxHeight: '90dvh' }}
      >
        {/* Product image */}
        <div className="relative w-full h-52 flex-shrink-0 bg-surface-container overflow-hidden">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="material-symbols-outlined text-7xl text-outline-variant/30">restaurant</span>
            </div>
          )}
          {/* Gradient so text below reads well */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/80 via-transparent to-transparent pointer-events-none" />
          {product.tags?.includes('Chef Choice') && (
            <div className="absolute top-3 left-3">
              <span className="bg-secondary text-on-secondary text-[8px] font-headline font-bold uppercase tracking-micro px-1.5 py-0.5 rounded-sm">
                Chef Choice
              </span>
            </div>
          )}
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
          {/* Drag handle (mobile only hint) */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/40 md:hidden pointer-events-none" />
        </div>

        {/* Name + price + description */}
        <div className="px-5 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-headline font-bold text-xl text-on-surface leading-tight flex-1">{product.name}</h3>
            <span className="font-headline font-bold text-primary text-lg flex-shrink-0">{formatCurrency(currentPrice)}</span>
          </div>
          {product.description && (
            <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">{product.description}</p>
          )}
          {product.stockLevel && (
            <span className={`mt-2 inline-flex items-center gap-1.5 text-[9px] font-headline font-bold uppercase tracking-micro ${
              product.stockLevel === 'Low' ? 'text-error' : 'text-tertiary'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${product.stockLevel === 'Low' ? 'bg-error' : 'bg-tertiary'}`} />
              {product.stockLevel === 'Low' ? 'Low Stock' : 'In Stock'}
            </span>
          )}
        </div>

        {/* Options — scrollable */}
        {hasOptions && (
          <div className="flex-1 overflow-y-auto px-5 py-2 space-y-6 min-h-0">
            {/* Variations */}
            {product.variations && product.variations.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/10">
                  <span className="material-symbols-outlined text-primary text-sm">settings_input_component</span>
                  <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">
                    Size / Style
                  </span>
                </div>
                {product.variations.map(group => (
                  <div key={group.id}>
                    <h4 className="font-headline font-bold text-xs text-on-surface mb-2 tracking-wide uppercase opacity-60">
                      {group.name}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {group.options.map(option => {
                        const isSelected = selectedVariations[group.id]?.id === option.id;
                        return (
                          <button
                            key={option.id}
                            onClick={() => onSelectVariation(group.id, option)}
                            className={`p-2.5 rounded-lg border text-left transition-all flex justify-between items-center ${
                              isSelected
                                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                : 'border-outline-variant/10 bg-surface-container hover:bg-surface-container-high text-on-surface'
                            }`}
                          >
                            <span className="font-bold text-sm">{option.name}</span>
                            <span className={`text-xs font-bold ${isSelected ? 'text-primary' : 'text-primary/60'}`}>
                              {formatCurrency(option.price || 0)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Supplements */}
            {product.supplements && product.supplements.length > 0 && (
              <div className="space-y-4 pb-2">
                <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/10">
                  <span className="material-symbols-outlined text-tertiary text-sm">add_circle</span>
                  <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">
                    Extras / Supplements
                  </span>
                </div>
                {product.supplements.map(group => (
                  <div key={group.id}>
                    <h4 className="font-headline font-bold text-xs text-on-surface mb-2 tracking-wide uppercase opacity-60">
                      {group.name}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {group.options.map(option => {
                        const isSelected = selectedSupplements[group.id]?.id === option.id;
                        return (
                          <button
                            key={option.id}
                            onClick={() => onSelectSupplement(group.id, option)}
                            className={`p-2.5 rounded-lg border text-left transition-all flex justify-between items-center ${
                              isSelected
                                ? 'border-tertiary bg-tertiary/10 text-tertiary shadow-sm'
                                : 'border-outline-variant/10 bg-surface-container hover:bg-surface-container-high text-on-surface'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`material-symbols-outlined text-[18px] transition-colors ${isSelected ? 'text-tertiary' : 'text-on-surface-variant/40'}`}>
                                {isSelected ? 'check_box' : 'check_box_outline_blank'}
                              </span>
                              <span className="font-bold text-sm">{option.name}</span>
                            </div>
                            {option.priceAdjustment ? (
                              <span className={`text-xs font-bold ${isSelected ? 'text-tertiary' : 'text-tertiary/60'}`}>
                                +{formatCurrency(option.priceAdjustment)}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer — confirm */}
        <div className="p-4 border-t border-outline-variant/10 bg-surface-container-low flex-shrink-0">
          <button
            onClick={onAdd}
            className="w-full py-4 bg-primary text-on-primary rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-lg shadow-primary/20 flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined">add_shopping_cart</span>
            Add to Cart — {formatCurrency(currentPrice)}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
