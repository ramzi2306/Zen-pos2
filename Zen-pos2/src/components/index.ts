/**
 * ZEN-POS Component Library
 * =========================
 *
 * Organised into four namespaces:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  ui/           Atomic design-system primitives                  │
 * │                Switch · Toast · StatusBadge · CountBadge        │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  layout/       App-shell chrome                                 │
 * │                TopBar · Sidebar · MobileNav · ProfilePanel      │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  cart/         Shopping cart & checkout                         │
 * │                CartSidebar · SwipeableCartItem ·                │
 * │                CartFloatingAction                               │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  product/      Menu product display                             │
 * │                ProductCard · VariationModal · CategoryFilter    │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Standalone:
 *   VirtualKeyboard  On-screen keyboard for touchscreen kiosks
 *
 * Usage examples
 * --------------
 *   import { Switch, StatusBadge }    from './components/ui';
 *   import { TopBar, Sidebar }        from './components/layout';
 *   import { CartSidebar }            from './components/cart';
 *   import { ProductCard }            from './components/product';
 *   import { VirtualKeyboard }        from './components/VirtualKeyboard';
 *
 * Or import everything from the root barrel (less tree-shaking friendly):
 *   import { Switch, TopBar, CartSidebar, ProductCard } from './components';
 */

// UI primitives
export { Switch }                  from './ui/Switch';
export { Toast }                   from './ui/Toast';
export { StatusBadge, CountBadge } from './ui/Badge';

// App shell / navigation (explicit paths avoid case-conflict with Layout.tsx)
export { ProfilePanel }            from './layout/ProfilePanel';
export { Sidebar }                 from './layout/Sidebar';
export { TopBar }                  from './layout/TopBar';
export { MobileNav }               from './layout/MobileNav';

// Cart & checkout
export { CartSidebar }             from './cart/CartSidebar';
export { SwipeableCartItem }       from './cart/CartItem';
export { CartFloatingAction }      from './cart/CartFloatingAction';

// Menu product components
export { ProductCard }             from './product/ProductCard';
export { VariationModal }          from './product/VariationModal';
export { CategoryFilter }          from './product/CategoryFilter';

// Standalone
export { VirtualKeyboard }         from './VirtualKeyboard';
