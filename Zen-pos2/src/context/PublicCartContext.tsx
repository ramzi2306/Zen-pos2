import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { PublicCartItem, Product } from '../data';
import { getCartItemPrice } from '../utils/cartUtils';

const STORAGE_KEY = 'zenpos_public_cart';
const UI_STORAGE_KEY = 'zenpos_public_ui';

interface PublicUIState {
  view: 'cart' | 'checkout' | 'placed' | 'tracking' | 'history_phone' | 'history_otp' | 'history_list';
  checkoutStep: 'phone' | 'confirm_identity' | 'details';
  name: string;
  phone: string;
  address: string;
  note: string;
  trackingToken?: string;
  placedOrder?: { 
    orderId: string; 
    orderNumber: string; 
    trackingToken: string;
    items: { productId: string; name: string; quantity: number; price: number; image?: string; selectedVariations?: any }[];
    subtotal: number;
  };
}

const DEFAULT_UI: PublicUIState = {
  view: 'cart',
  checkoutStep: 'phone',
  name: '',
  phone: '',
  address: '',
  note: '',
};

function loadStorage<T>(key: string, def: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : def;
  } catch {
    return def;
  }
}

interface PublicCartContextValue {
  items: PublicCartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (item: Omit<PublicCartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (productId: string, variationKey?: string) => void;
  updateQty: (productId: string, delta: number, variationKey?: string) => void;
  updateNote: (productId: string, note: string, variationKey?: string) => void;
  clearCart: () => void;
  
  // UI State
  ui: PublicUIState;
  setUi: (update: Partial<PublicUIState>) => void;
  resetUi: () => void;
}

const PublicCartContext = createContext<PublicCartContextValue>(null!);

export function cartKey(productId: string, variations?: PublicCartItem['selectedVariations'], supplements?: PublicCartItem['selectedSupplements']): string {
  let key = productId;
  if (variations && Object.keys(variations).length > 0) {
    const vPart = Object.entries(variations).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v.id}`).join(',');
    key += `|v:${vPart}`;
  }
  if (supplements && Object.keys(supplements).length > 0) {
    const sPart = Object.entries(supplements).sort(([a], [b]) => a.localeCompare(b)).map(([k, s]) => `${k}:${s.id}`).join(',');
    key += `|s:${sPart}`;
  }
  return key;
}
export function itemKey(item: PublicCartItem): string { return cartKey(item.productId, item.selectedVariations, item.selectedSupplements); }

export function PublicCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<PublicCartItem[]>(() => loadStorage(STORAGE_KEY, []));
  const [ui, setUiState] = useState<PublicUIState>(() => {
    const saved = loadStorage(UI_STORAGE_KEY, DEFAULT_UI);
    // On page load, always start from the cart view — never land directly in checkout/phone step.
    // Persisted phone/name/address are kept so checkout pre-fills them.
    if (saved.view === 'checkout') return { ...saved, view: 'cart' };
    return saved;
  });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }, [items]);
  useEffect(() => { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(ui)); }, [ui]);

  const setUi = useCallback((update: Partial<PublicUIState>) => {
    setUiState(prev => ({ ...prev, ...update }));
  }, []);

  const resetUi = useCallback(() => {
    setUiState(DEFAULT_UI);
  }, []);

  const addItem = useCallback((item: Omit<PublicCartItem, 'quantity'> & { quantity?: number }) => {
    const qty = item.quantity ?? 1;
    const key = cartKey(item.productId, item.selectedVariations, item.selectedSupplements);
    setItems(prev => {
      const idx = prev.findIndex(i => itemKey(i) === key);
      return idx >= 0
        ? prev.map((i, n) => (n === idx ? { ...i, quantity: i.quantity + qty } : i))
        : [...prev, { ...item, quantity: qty }];
    });
    // Force view to cart when adding item
    setUiState(prev => ({ ...prev, view: 'cart' }));
  }, []);

  const removeItem = useCallback((productId: string, variationKey?: string) => {
    const key = variationKey ?? productId;
    setItems(prev => prev.filter(i => itemKey(i) !== key));
  }, []);

  const updateQty = useCallback((productId: string, delta: number, variationKey?: string) => {
    const key = variationKey ?? productId;
    setItems(prev => prev.map(i => (itemKey(i) === key ? { ...i, quantity: i.quantity + delta } : i)).filter(i => i.quantity > 0));
  }, []);

  const updateNote = useCallback((productId: string, note: string, variationKey?: string) => {
    const key = variationKey ?? productId;
    setItems(prev => prev.map(i => (itemKey(i) === key ? { ...i, note } : i)));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + getCartItemPrice(i as any) * i.quantity, 0);

  return (
    <PublicCartContext.Provider value={{
      items, itemCount, subtotal, addItem, removeItem, updateQty, updateNote, clearCart,
      ui, setUi, resetUi
    }}>
      {children}
    </PublicCartContext.Provider>
  );
}

export function usePublicCart() { return useContext(PublicCartContext); }
