import React from 'react';
import { Product } from '../../data';
import { useLocalization } from '../../context/LocalizationContext';

/**
 * ProductCard — grid card for a single menu item.
 *
 * **3D Touch behaviour (handled by parent MenuView):**
 * - If the product has `variations`, clicking calls `onClick` with the DOM rect
 *   so the parent can render the VariationModal anchored to the card.
 * - If no variations, clicking directly adds the item to the cart.
 *
 * Visual features:
 * - Product image with scale-on-hover transition
 * - "Chef Choice" badge (top-left overlay)
 * - Stock level dot indicator (Low → red, otherwise green)
 * - Price right-aligned in headline font
 *
 * @prop product  - The product to display
 * @prop onClick  - Receives the mouse event (used to capture the DOMRect for the
 *                  VariationModal anchor) or triggers addToCart for simple products
 */
export const ProductCard = ({
  product,
  onClick,
}: {
  product: Product;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}) => {
  const { formatCurrency } = useLocalization();

  const priceLabel = (() => {
    const prices = (product.variations ?? [])
      .flatMap(vg => vg.options.map(o => o.price ?? 0))
      .filter(p => p > 0);
    if (!prices.length) return formatCurrency(product.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
  })();

  return <div
    onClick={onClick}
    className="group bg-surface-container rounded-lg overflow-hidden flex flex-col hover:bg-surface-container-high transition-colors border border-transparent hover:border-outline-variant/20 cursor-pointer"
  >
    {/* Thumbnail */}
    <div className="w-full h-32 md:h-40 relative overflow-hidden bg-surface-container-lowest">
      <img
        src={product.image}
        alt={product.name}
        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
      />
      {product.tags?.includes('Chef Choice') && (
        <div className="absolute top-2 left-2">
          <span className="bg-secondary text-on-secondary text-[8px] font-headline font-bold uppercase tracking-micro px-1.5 py-0.5 rounded-sm">
            Chef Choice
          </span>
        </div>
      )}
    </div>

    {/* Info */}
    <div className="flex-1 p-3 md:p-4 flex flex-col justify-between">
      <div className="mb-2 md:mb-4">
        <div className="flex justify-between items-start mb-1 md:mb-2 gap-2">
          <h3 className="font-headline font-bold text-sm md:text-base text-on-surface leading-tight line-clamp-2">
            {product.name}
          </h3>
          <span className="font-headline font-bold text-primary text-sm md:text-base whitespace-nowrap">
            {priceLabel}
          </span>
        </div>
        <p className="hidden md:block text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
          {product.description}
        </p>
      </div>

      {/* Footer: stock + add button */}
      <div className="flex justify-between items-end mt-auto">
        <span
          className={`text-[9px] font-headline font-bold uppercase tracking-micro flex items-center gap-1.5 ${
            product.stockLevel === 'Low' ? 'text-error' : 'text-tertiary'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${product.stockLevel === 'Low' ? 'bg-error' : 'bg-tertiary'}`} />
          <span className="hidden sm:inline">{product.stockLevel === 'Low' ? 'Low Stock' : 'In Stock'}</span>
        </span>
        <button className="w-8 h-8 rounded bg-primary-container text-primary flex items-center justify-center hover:bg-secondary hover:text-on-secondary transition-colors shadow-sm">
          <span className="material-symbols-outlined text-lg">add</span>
        </button>
      </div>
    </div>
  </div>;
};
