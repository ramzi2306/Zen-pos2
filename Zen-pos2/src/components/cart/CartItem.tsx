import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'motion/react';
import { CartItem as CartItemType } from '../../data';
import { useLocalization } from '../../context/LocalizationContext';
import { getCartItemPrice } from '../../utils/cartUtils';

/**
 * SwipeableCartItem — a single row in the cart with gesture-based deletion
 * and a 3D-touch-style inline editor.
 *
 * **Interactions:**
 * - Swipe left ≥80 px → removes the item from the cart
 * - Tap → expands the "Edit Item" panel (rendered via a portal to escape scroll containers)
 * - Edit panel → qty, discount, price, preparation notes
 *
 * This component is used internally by CartSidebar but exported for reuse
 * and standalone testing.
 *
 * @prop item               - The cart item to render
 * @prop expandedItemId     - ID of the currently-expanded item (single-open)
 * @prop setExpandedItemId  - Setter for expandedItemId (from parent state)
 * @prop updateQuantity     - Increment / decrement item quantity
 * @prop updateCartItem     - Patch arbitrary fields on the cart item
 */
export const SwipeableCartItem = ({
  item,
  expandedItemId,
  setExpandedItemId,
  updateQuantity,
  updateCartItem,
}: {
  item: CartItemType;
  expandedItemId: string | null;
  setExpandedItemId: (id: string | null) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  updateCartItem: (cartItemId: string, updates: Partial<CartItemType>) => void;
}) => {
  const { formatCurrency } = useLocalization();
  const x = useMotionValue(0);
  const opacity = useTransform(x, [0, -80], [0, 1]);
  const background = useTransform(x, [0, -80], ['#00000000', '#d32f2f']);
  const isExpanded = expandedItemId === item.cartItemId;
  const [editMenuRect, setEditMenuRect] = useState<DOMRect | null>(null);
  const [hasFocus, setHasFocus] = useState(false);

  const handleDragEnd = (_event: any, info: any) => {
    if (info.offset.x < -80) {
      updateQuantity(item.cartItemId, -item.quantity);
    } else {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  };

  const handleItemClick = (e: React.MouseEvent) => {
    if (isExpanded) {
      setExpandedItemId(null);
      setEditMenuRect(null);
    } else {
      setExpandedItemId(item.cartItemId);
      setEditMenuRect(e.currentTarget.getBoundingClientRect());
    }
  };

  // Shared item display used both in the collapsed row and in the editor header
  const itemContent = (
    <>
      <div className="w-12 h-12 rounded bg-surface-container-lowest overflow-hidden flex-shrink-0 border border-outline-variant/10">
        <img src={item.image} alt={item.name} className="w-full h-full object-cover opacity-80" />
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-start leading-tight mb-1">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-on-surface group-hover:text-primary transition-colors">{item.name}</h4>
              <span
                className="material-symbols-outlined text-on-surface-variant text-[16px] transition-transform duration-200"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                expand_more
              </span>
            </div>
            {(
              (item.selectedVariations && Object.keys(item.selectedVariations).length > 0) ||
              (item.selectedSupplements && Object.keys(item.selectedSupplements).length > 0)
            ) && (
              <div className="flex flex-wrap gap-1">
                {item.selectedVariations && Object.values(item.selectedVariations).map((opt: any) => (
                  <span key={opt.id} className="text-[9px] text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded-sm font-medium">
                    {opt.name} {opt.price !== undefined ? `(${formatCurrency(opt.price)})` : ''}
                  </span>
                ))}
                {item.selectedSupplements && Object.values(item.selectedSupplements).map((opt: any) => (
                  <span key={opt.id} className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm font-medium">
                    +{opt.name} {opt.priceAdjustment ? `(+${formatCurrency(opt.priceAdjustment)})` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center border border-outline-variant/20 rounded px-2 py-0.5 text-xs font-bold">
              {item.quantity}
            </div>
            <div className="text-right w-16">
              {item.discount ? (
                <div className="flex flex-col items-end">
                  <span className="font-bold text-sm text-primary">
                    {formatCurrency((getCartItemPrice(item) - (item.discount || 0)) * item.quantity)}
                  </span>
                  <span className="text-[10px] text-on-surface-variant line-through">
                    {formatCurrency(getCartItemPrice(item) * item.quantity)}
                  </span>
                </div>
              ) : (
                <span className="font-bold text-sm text-primary">
                  {formatCurrency(getCartItemPrice(item) * item.quantity)}
                </span>
              )}
            </div>
          </div>
        </div>
        {item.notes && !isExpanded && (
          <div className="mt-1">
            <span className="inline-block bg-tertiary-container text-tertiary text-[8px] font-headline font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm">{item.notes}</span>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="relative border-b border-outline-variant/10 last:border-0 overflow-hidden">
      {/* Background delete indicator */}
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-white font-bold"
        style={{ background, opacity, width: '100%' }}
      >
        <span className="material-symbols-outlined">delete</span>
      </motion.div>

      {/* Foreground item */}
      <motion.div
        className="relative bg-surface-container pb-4 px-4 -mx-4"
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
      >
        <div
          className={`flex gap-4 cursor-pointer group transition-opacity duration-200 ${isExpanded ? 'opacity-0' : 'opacity-100'}`}
          onClick={handleItemClick}
        >
          {itemContent}
        </div>

        {/* Expanded edit panel — rendered into document.body via portal */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {isExpanded && editMenuRect && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[85] bg-black/20 backdrop-blur-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedItemId(null);
                    setEditMenuRect(null);
                  }}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 0, top: editMenuRect.top - 16 }}
                  animate={{
                    opacity: 1,
                    scale: 1.02,
                    y: -4,
                    top: Math.max(16, Math.min(editMenuRect.top - 16, window.innerHeight - 550)),
                  }}
                  exit={{ opacity: 0, scale: 0.95, y: 0, top: editMenuRect.top - 16 }}
                  className="fixed z-[90] bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl flex flex-col overflow-y-auto max-h-[calc(100vh-32px)]"
                  style={{
                    left: Math.max(16, Math.min(editMenuRect.left - 16, window.innerWidth - (editMenuRect.width + 32))),
                    width: editMenuRect.width + 32,
                    transformOrigin: 'top center',
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onFocus={() => setHasFocus(true)}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setHasFocus(false);
                  }}
                >
                  {/* Elevated product row */}
                  <div
                    className="flex gap-4 p-4 border-b border-outline-variant/10 bg-surface-container cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedItemId(null);
                      setEditMenuRect(null);
                    }}
                  >
                    {itemContent}
                  </div>

                  {/* Edit form */}
                  <div className="p-4 space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-bold text-on-surface">Edit Item</h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedItemId(null);
                          setEditMenuRect(null);
                        }}
                        className="text-on-surface-variant hover:text-on-surface"
                      >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>

                    {/* Product Name */}
                    <div className="border border-outline-variant/20 rounded-lg p-2.5 flex flex-col bg-surface-container">
                      <span className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Product Name</span>
                      <input
                        type="text"
                        className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-on-surface"
                        value={item.name}
                        onChange={(e) => updateCartItem(item.cartItemId, { name: e.target.value })}
                      />
                    </div>

                    {/* Qty / Discount / Price */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="border border-outline-variant/20 rounded-lg p-2.5 flex flex-col bg-surface-container">
                        <span className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Qty</span>
                        <div className="flex justify-between items-center">
                          <input
                            type="number"
                            className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-on-surface"
                            value={item.quantity}
                            onChange={(e) => {
                              const newQty = parseInt(e.target.value);
                              if (!isNaN(newQty)) updateQuantity(item.cartItemId, newQty - item.quantity);
                            }}
                          />
                          <div className="flex flex-col gap-1">
                            <button onClick={() => updateQuantity(item.cartItemId, 1)} className="text-on-surface-variant hover:text-primary"><span className="material-symbols-outlined text-[14px]">keyboard_arrow_up</span></button>
                            <button onClick={() => updateQuantity(item.cartItemId, -1)} className="text-on-surface-variant hover:text-primary"><span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span></button>
                          </div>
                        </div>
                      </div>
                      <div className="border border-outline-variant/20 rounded-lg p-2.5 flex flex-col bg-surface-container">
                        <span className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Discount</span>
                        <input
                          type="number"
                          className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-on-surface"
                          value={item.discount || ''}
                          placeholder="0.00"
                          onChange={(e) => updateCartItem(item.cartItemId, { discount: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="border border-outline-variant/20 rounded-lg p-2.5 flex flex-col bg-surface-container">
                        <span className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Price</span>
                        <input
                          type="number"
                          className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-on-surface"
                          value={item.price}
                          onChange={(e) => updateCartItem(item.cartItemId, { price: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="border border-outline-variant/20 rounded-lg p-2.5 flex flex-col bg-surface-container">
                      <span className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Preparation Notes</span>
                      <input
                        type="text"
                        className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-on-surface"
                        placeholder="e.g. No onions, well done..."
                        value={item.notes || ''}
                        onChange={(e) => updateCartItem(item.cartItemId, { notes: e.target.value })}
                      />
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedItemId(null);
                        setEditMenuRect(null);
                      }}
                      className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[20px]">check_circle</span>
                      Save Changes
                    </button>
                  </div>
                </motion.div>

                {/* Floating keyboard button — fixed to viewport, only while an input is focused */}
                <AnimatePresence>
                  {hasFocus && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8, y: 20 }}
                      className="fixed bottom-6 right-6 z-[95] w-16 h-16 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        document.dispatchEvent(new CustomEvent('zen:openKeyboard'));
                      }}
                    >
                      <span className="material-symbols-outlined text-3xl">keyboard</span>
                    </motion.button>
                  )}
                </AnimatePresence>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
      </motion.div>
    </div>
  );
};
