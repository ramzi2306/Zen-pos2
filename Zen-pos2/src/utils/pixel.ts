/**
 * Meta Pixel Tracking Utility
 * 
 * Injects the Meta Pixel script and provides helper tracking functions.
 * Browser-side only.
 */

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
  }
}

export function initPixel(pixelId: string) {
  if (typeof window === 'undefined') return;
  if (window.fbq) return;

  const n: any = window.fbq = function() {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = !0;
  n.version = '2.0';
  n.queue = [];

  const t = document.createElement('script');
  t.async = !0;
  t.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const s = document.getElementsByTagName('script')[0];
  s.parentNode?.insertBefore(t, s);

  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');
}

export function trackEvent(name: string, data?: any, options?: { eventID?: string }) {
  if (typeof window !== 'undefined' && window.fbq) {
    if (options && options.eventID) {
      window.fbq('track', name, data, { eventID: options.eventID });
    } else {
      window.fbq('track', name, data);
    }
  }
}

export function trackViewContent(product: { id: string; name: string; price: number; category?: string }) {
  trackEvent('ViewContent', {
    content_ids: [product.id],
    content_name: product.name,
    content_category: product.category,
    content_type: 'product',
    value: product.price,
    currency: 'DZD', // Default currency, could be dynamic
  });
}

export function trackAddToCart(product: { id: string; name: string; price: number; quantity: number }) {
  trackEvent('AddToCart', {
    content_ids: [product.id],
    content_name: product.name,
    content_type: 'product',
    value: product.price * product.quantity,
    quantity: product.quantity,
    currency: 'DZD',
  });
}

export function trackPurchase(order: { id: string; total: number; items: any[] }, eventId?: string) {
  trackEvent('Purchase', {
    content_ids: order.items.map(i => i.product_id || i.id),
    content_type: 'product',
    value: order.total,
    currency: 'DZD',
    num_items: order.items.reduce((acc, i) => acc + i.quantity, 0),
  }, eventId ? { eventID: eventId } : undefined);
}
