import React from 'react';
import { Product } from '../../data';
import { useLocalization } from '../../context/LocalizationContext';

/**
 * ProductCard — grid card for a single menu item.
 *
 * @prop product  - The product to display
 * @prop layout   - 'vertical' (default): image top, info below.
 *                  'horizontal': image on right, text+button on left.
 * @prop onClick  - Receives the mouse event for VariationModal anchoring
 */
export const ProductCard = ({
  product,
  onClick,
  layout = 'vertical',
}: {
  product: Product;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  layout?: 'vertical' | 'horizontal';
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

  const stockDot = (
    <span
      className={`text-[9px] font-headline font-bold uppercase tracking-micro flex items-center gap-1.5 ${
        product.stockLevel === 'Low' ? 'text-error' : 'text-tertiary'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${product.stockLevel === 'Low' ? 'bg-error' : 'bg-tertiary'}`} />
      <span className="hidden sm:inline">{product.stockLevel === 'Low' ? 'Low Stock' : 'In Stock'}</span>
    </span>
  );

  const addBtn = (
    <button className="w-8 h-8 rounded bg-primary-container text-primary flex items-center justify-center hover:bg-secondary hover:text-on-secondary transition-colors shadow-sm flex-shrink-0">
      <span className="material-symbols-outlined text-lg">add</span>
    </button>
  );

  const thumbnail = (isHorizontal: boolean) => (
    <div
      className={`relative overflow-hidden bg-surface-container-lowest flex items-center justify-center flex-shrink-0 ${
        isHorizontal
          ? 'w-28 h-full rounded-r-lg'
          : 'w-full h-32 md:h-40 rounded-t-lg'
      }`}
    >
      {product.image ? (
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
          onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
        />
      ) : null}
      <span className={`material-symbols-outlined text-5xl text-outline-variant/30 absolute ${product.image ? 'hidden' : ''}`}>restaurant</span>
      {product.tags?.includes('Chef Choice') && (
        <div className="absolute top-2 left-2">
          <span className="bg-secondary text-on-secondary text-[8px] font-headline font-bold uppercase tracking-micro px-1.5 py-0.5 rounded-sm">
            Chef Choice
          </span>
        </div>
      )}
    </div>
  );

  if (layout === 'horizontal') {
    return (
      <div
        onClick={onClick}
        className="group bg-surface-container rounded-lg overflow-hidden flex flex-row hover:bg-surface-container-high transition-colors border border-transparent hover:border-outline-variant/20 cursor-pointer h-28"
      >
        {/* Left: info */}
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div>
            <h3 className="font-headline font-bold text-sm text-on-surface leading-tight line-clamp-2 mb-0.5">
              {product.name}
            </h3>
            <span className="font-headline font-bold text-primary text-sm">
              {priceLabel}
            </span>
            <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed mt-1">
              {product.description}
            </p>
          </div>
          <div className="flex justify-between items-center mt-auto">
            {stockDot}
            {addBtn}
          </div>
        </div>
        {/* Right: image */}
        {thumbnail(true)}
      </div>
    );
  }

  // --- vertical (default) ---
  return (
    <div
      onClick={onClick}
      className="group bg-surface-container rounded-lg overflow-hidden flex flex-col hover:bg-surface-container-high transition-colors border border-transparent hover:border-outline-variant/20 cursor-pointer"
    >
      {thumbnail(false)}
      <div className="flex-1 p-3 md:p-4 flex flex-col justify-between">
        <div className="mb-2 md:mb-4">
          <h3 className="font-headline font-bold text-sm md:text-base text-on-surface leading-tight line-clamp-2 mb-0.5">
            {product.name}
          </h3>
          <span className="font-headline font-bold text-primary text-sm md:text-base">
            {priceLabel}
          </span>
          <p className="hidden md:block text-xs text-on-surface-variant line-clamp-2 leading-relaxed mt-1">
            {product.description}
          </p>
        </div>
        <div className="flex justify-between items-end mt-auto">
          {stockDot}
          {addBtn}
        </div>
      </div>
    </div>
  );
};
