import React from 'react';
import { CartItem } from '../../data';
import { useLocalization } from '../../context/LocalizationContext';
import { getSubtotal } from '../../utils/cartUtils';

/**
 * CartFloatingAction — mobile-only floating bar pinned above MobileNav.
 *
 * Shows the live order summary (total items + subtotal) and opens the
 * CartSidebar when tapped. Hidden on lg+ (desktop shows CartSidebar inline).
 *
 * @prop cart   - Current cart items array
 * @prop onOpen - Callback to open the CartSidebar
 */
export const CartFloatingAction = ({
  cart,
  onOpen,
}: {
  cart: CartItem[];
  onOpen: () => void;
}) => {
  const { formatCurrency } = useLocalization();
  const subtotal = getSubtotal(cart);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (cart.length === 0) return null;

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] md:w-full max-w-md z-40 lg:hidden cursor-pointer"
      onClick={onOpen}
    >
      <div className="bg-surface-container-high/90 backdrop-blur-xl border border-white/5 p-4 rounded-2xl shadow-2xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <span className="material-symbols-outlined text-secondary text-3xl">shopping_basket</span>
            <span className="absolute -top-1 -right-1 bg-tertiary text-on-tertiary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {totalItems}
            </span>
          </div>
          <div>
            <span className="text-xs text-on-surface-variant font-medium block">Order Summary</span>
            <span className="font-headline font-bold text-on-surface">View Order Details</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant block">Total</span>
          <span className="font-headline font-extrabold text-xl text-primary">{formatCurrency(subtotal)}</span>
        </div>
      </div>
    </div>
  );
};
