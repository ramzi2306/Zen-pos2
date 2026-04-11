import React from 'react';
import { motion } from 'motion/react';
import { Product, VariationOption, SupplementOption } from '../../data';
import { useLocalization } from '../../context/LocalizationContext';
import { getCartItemPrice } from '../../utils/cartUtils';

/**
 * VariationModal — 3D-touch-style overlay anchored to the ProductCard.
 * The elevated card clone is always in vertical layout regardless of the
 * grid layout used (horizontal or vertical).
 */
export const VariationModal = ({
  product,
  productRect,
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

  // The clone is always a vertical card — fixed height regardless of card layout
  const CLONE_HEIGHT = 264;
  const menuHeight = 460;
  const scale = 1.03;
  const scaledHeight = CLONE_HEIGHT * scale;
  const scaledWidth = productRect.width * scale;
  const isDesktop = window.innerWidth >= 768;

  let safeTop = productRect.top;
  let menuTop = 0;
  let menuLeft = 0;
  const menuWidth = Math.max(productRect.width, 320);
  let transformOrigin = 'top';

  if (isDesktop) {
    if (safeTop + menuHeight > window.innerHeight - 20) {
      safeTop = Math.max(20, window.innerHeight - 20 - menuHeight);
    }
    menuTop = safeTop;
    menuLeft = productRect.left + scaledWidth + 16;
    transformOrigin = 'left top';
    if (menuLeft + menuWidth > window.innerWidth - 20) {
      menuLeft = productRect.left - menuWidth - 16;
      transformOrigin = 'right top';
    }
  } else {
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

  const currentPrice = getCartItemPrice({
    ...product,
    cartItemId: 'temp',
    quantity: 1,
    selectedVariations,
    selectedSupplements,
  });

  return (
    <div className="fixed inset-0 z-[150]">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/*
       * Elevated product card clone — always rendered as a vertical card.
       * Starts at the original card's position (productRect) and animates
       * to the safe position while expanding to vertical proportions.
       */}
      <motion.div
        initial={{
          top: productRect.top,
          left: productRect.left,
          width: productRect.width,
          height: productRect.height,
          scale: 1,
        }}
        animate={{ top: safeTop, height: CLONE_HEIGHT, scale }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed z-[160] bg-surface-container rounded-lg overflow-hidden flex flex-col border border-outline-variant/20 shadow-2xl pointer-events-none origin-top"
      >
        {/* Image — flex-shrink-0 so it always occupies its height */}
        <div className="w-full h-[140px] flex-shrink-0 relative overflow-hidden bg-surface-container-lowest flex items-center justify-center">
          {product.image ? (
            <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <span className="material-symbols-outlined text-5xl text-outline-variant/30 absolute">restaurant</span>
          )}
          {product.tags?.includes('Chef Choice') && (
            <div className="absolute top-2 left-2">
              <span className="bg-secondary text-on-secondary text-[8px] font-headline font-bold uppercase tracking-micro px-1.5 py-0.5 rounded-sm">
                Chef Choice
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 p-3 flex flex-col justify-between overflow-hidden">
          <div>
            <h3 className="font-headline font-bold text-sm text-on-surface leading-tight line-clamp-2 mb-0.5">
              {product.name}
            </h3>
            <span className="font-headline font-bold text-primary text-sm">
              {formatCurrency(currentPrice)}
            </span>
          </div>
          <div className="flex justify-between items-end mt-auto">
            <span className={`text-[9px] font-headline font-bold uppercase tracking-micro flex items-center gap-1.5 ${
              product.stockLevel === 'Low' ? 'text-error' : 'text-tertiary'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${product.stockLevel === 'Low' ? 'bg-error' : 'bg-tertiary'}`} />
              <span className="hidden sm:inline">{product.stockLevel === 'Low' ? 'Low Stock' : 'In Stock'}</span>
            </span>
            <button className="w-8 h-8 rounded bg-primary-container text-primary flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-lg">add</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Options + description panel */}
      <motion.div
        initial={{ opacity: 0, y: isDesktop ? 0 : -20, x: isDesktop ? (transformOrigin === 'right top' ? 20 : -20) : 0, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
        exit={{ opacity: 0, y: isDesktop ? 0 : -20, x: isDesktop ? (transformOrigin === 'right top' ? 20 : -20) : 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300, delay: 0.05 }}
        style={{ position: 'fixed', top: menuTop, left: menuLeft, width: menuWidth, transformOrigin }}
        className="z-[160] bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col"
      >
        <div className="p-4 overflow-y-auto max-h-[55vh] space-y-4">
          {/* Description — always shown */}
          {product.description && (
            <p className="text-xs text-on-surface-variant leading-relaxed border-b border-outline-variant/10 pb-4">
              {product.description}
            </p>
          )}

          {/* Variations */}
          {product.variations && product.variations.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/10">
                <span className="material-symbols-outlined text-primary text-sm">settings_input_component</span>
                <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">Size / Style</span>
              </div>
              {product.variations.map(group => (
                <div key={group.id}>
                  <h4 className="font-headline font-bold text-xs text-on-surface mb-2 tracking-wide uppercase opacity-60">{group.name}</h4>
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
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/10">
                <span className="material-symbols-outlined text-tertiary text-sm">add_circle</span>
                <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant">Extras / Supplements</span>
              </div>
              {product.supplements.map(group => (
                <div key={group.id}>
                  <h4 className="font-headline font-bold text-xs text-on-surface mb-2 tracking-wide uppercase opacity-60">{group.name}</h4>
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

        {/* Footer */}
        <div className="p-4 border-t border-outline-variant/10 bg-surface-container-low">
          <button
            onClick={onAdd}
            className="w-full py-4 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined">add_shopping_cart</span>
            Confirm — {formatCurrency(currentPrice)}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
