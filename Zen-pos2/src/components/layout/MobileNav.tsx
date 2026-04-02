import React from 'react';

/**
 * MobileNav — fixed bottom tab bar for small screens (hidden on lg+).
 *
 * Provides quick access to the four main sections plus the cart. Tabs are
 * permission-gated so cashier-only devices won't show inventory etc.
 *
 * @prop currentView    - Active view key (e.g. 'menu', 'orders')
 * @prop setCurrentView - Navigate to a view
 * @prop onOpenCart     - Open the CartSidebar (tapping the Cart tab)
 * @prop hasPermission  - Permission guard helper
 */
export const MobileNav = ({
  currentView,
  setCurrentView,
  onOpenCart,
  hasPermission,
}: {
  currentView: string;
  setCurrentView: (v: string) => void;
  onOpenCart: () => void;
  hasPermission: (p: any) => boolean;
}) => {
  const activeClass = 'bg-[#272a2e] text-[#ffb4a5]';
  const inactiveClass = 'text-[#c0c7d4] opacity-60 hover:opacity-100';
  const itemClass = 'flex flex-col items-center justify-center rounded-xl px-4 py-1 active:scale-98 transition-all duration-200 cursor-pointer';

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 bg-[#1d2024]/80 backdrop-blur-xl rounded-t-xl shadow-[0_-10px_30px_rgba(0,0,0,0.4)] lg:hidden">
      {hasPermission('view_menu') && (
        <div
          onClick={() => setCurrentView('menu')}
          className={`${itemClass} ${currentView === 'menu' ? activeClass : inactiveClass}`}
        >
          <span className="material-symbols-outlined">restaurant_menu</span>
          <span className="font-body text-[10px] font-medium tracking-tight">Menu</span>
        </div>
      )}

      {hasPermission('view_menu') && (
        <div
          onClick={onOpenCart}
          className={`flex flex-col items-center justify-center ${inactiveClass} px-4 py-1 cursor-pointer`}
        >
          <span className="material-symbols-outlined">shopping_cart</span>
          <span className="font-body text-[10px] font-medium tracking-tight">Cart</span>
        </div>
      )}

      {hasPermission('view_orders') && (
        <div
          onClick={() => setCurrentView('orders')}
          className={`${itemClass} ${currentView === 'orders' ? activeClass : inactiveClass}`}
        >
          <span className="material-symbols-outlined">receipt_long</span>
          <span className="font-body text-[10px] font-medium tracking-tight">Orders</span>
        </div>
      )}


    </nav>
  );
};
