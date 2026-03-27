/**
 * Layout.tsx — backwards-compatibility barrel.
 *
 * All layout and cart components have been extracted to their own files:
 *   components/layout/  → ProfilePanel, Sidebar, TopBar, MobileNav
 *   components/cart/    → CartSidebar, CartItem (SwipeableCartItem), CartFloatingAction
 *
 * This file re-exports them so existing imports (e.g. in App.tsx) continue
 * to work without modification.
 *
 * Prefer importing directly from the sub-packages in new code:
 *   import { TopBar }      from './components/layout';
 *   import { CartSidebar } from './components/cart';
 */
export { ProfilePanel }       from './layout/ProfilePanel';
export { Sidebar }            from './layout/Sidebar';
export { TopBar }             from './layout/TopBar';
export { MobileNav }          from './layout/MobileNav';
export { CartFloatingAction } from './cart/CartFloatingAction';
export { CartSidebar }        from './cart/CartSidebar';
