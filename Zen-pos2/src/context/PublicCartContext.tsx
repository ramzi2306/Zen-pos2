import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { PublicCartItem } from '../data';

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

export function cartKey(productId: string, variations?: PublicCartItem['selectedVariations']): string {
  if (!variations || Object.keys(variations).length === 0) return productId;
  const vPart = Object.entries(variations).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v.id).join(',');
  return `${productId}|${vPart}`;
}
export function itemKey(item: PublicCartItem): string { return cartKey(item.productId, item.selectedVariations); }

export function PublicCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<PublicCartItem[]>(() => loadStorage(STORAGE_KEY, []));
  const [ui, setUiState] = useState<PublicUIState>(() => loadStorage(UI_STORAGE_KEY, DEFAULT_UI));

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
    const key = cartKey(item.productId, item.selectedVariations);
    setItems(prev => {
      const idx = prev.findIndex(i => itemKey(i) === key);
      return idx >= 0
        ? prev.map((i, n) => (n === idx ? { ...i, quantity: i.quantity + qty } : i))
        : [...prev, { ...item, quantity: qty }];
    });
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
  const subtotal = items.reduce((s, i) => {
    const varAdj = Object.values(i.selectedVariations ?? {}).reduce((a, v) => a + (v.priceAdjustment ?? 0), 0);
    return s + (i.price + varAdj) * i.quantity;
  }, 0);

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
