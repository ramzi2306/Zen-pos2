import { CartItem } from '../data';

export function getCartItemPrice(item: CartItem): number {
  if (item.manualPrice !== undefined && item.manualPrice !== null) {
    return item.manualPrice;
  }
  const selectedVars = Object.values(item.selectedVariations || {});
  const varPrice = selectedVars.reduce((sum, v) => sum + (v.price || 0), 0);
  const suppPrice = Object.values(item.selectedSupplements || {}).reduce((sum, s) => sum + (s.priceAdjustment || 0), 0);
  
  const hasOverrideVariation = selectedVars.some(v => v.price !== undefined);
  const base = hasOverrideVariation ? varPrice : item.price;
  
  return base + suppPrice;
}

export function formatCartItemModifiers(item: CartItem): string {
  const vars = Object.values(item.selectedVariations || {}).map(v => v.name);
  const supps = Object.values(item.selectedSupplements || {}).map(s => s.name);
  return [...vars, ...supps, item.notes].filter(Boolean).join(' | ');
}

export function getSubtotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => {
    const lineTotal = Math.round(getCartItemPrice(item) * item.quantity * (1 - (item.discount || 0) / 100) * 100) / 100;
    return Math.round((sum + lineTotal) * 100) / 100;
  }, 0);
}
