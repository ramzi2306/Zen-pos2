/**
 * public.ts — Unauthenticated API calls for the customer-facing ordering module.
 * All requests go through publicRequest() which sends no Authorization header.
 */
import { publicRequest, apiRequest } from './client';
import type {
  PublicMenuCategory,
  PublicTrackingInfo,
  PublicOrder,
  OnlineOrderRequest,
} from '../data';

// ─── Menu ──────────────────────────────────────────────────────────────────────

export async function getPublicMenu(): Promise<PublicMenuCategory[]> {
  // Try the dedicated public endpoint first
  try {
    return await publicRequest<PublicMenuCategory[]>('/public/menu');
  } catch {
    // Fallback: assemble from the regular products + categories APIs
    const [rawProducts, categories] = await Promise.all([
      apiRequest<any[]>('/products/'),
      apiRequest<{ id: string; name: string }[]>('/products/categories'),
    ]);
    return categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      products: rawProducts
        .filter((p: any) => p.category === cat.id || p.category === cat.name)
        .map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? '',
          price: p.price,
          category: p.category,
          image: p.image ?? '',
          inStock: p.in_stock !== false,
          stockLevel: p.stock_level,
          tags: p.tags ?? [],
          variations: (p.variations ?? []).map((vg: any) => ({
            id: vg.id,
            name: vg.name,
            options: (vg.options ?? []).map((vo: any) => ({
              id: vo.id,
              name: vo.name,
              priceAdjustment: vo.price_adjustment ?? 0,
            })),
          })),
        })),
    }));
  }
}

// ─── Online order creation ─────────────────────────────────────────────────────

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  trackingToken: string;
  sessionToken?: string;
}

export async function createOnlineOrder(
  payload: OnlineOrderRequest
): Promise<CreateOrderResponse> {
  const raw = await publicRequest<any>('/public/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: payload.items.map(i => ({
        product_id: i.productId,
        product_name: i.name,
        unit_price: i.price,
        quantity: i.quantity,
        notes: i.note ?? '',
        selected_variations: Object.entries(i.selectedVariations ?? {}).map(
          ([groupId, opt]) => ({
            group_id: groupId,
            option_id: opt.id,
            option_name: opt.name,
            price_adjustment: opt.priceAdjustment,
          })
        ),
      })),
      customer: {
        name: payload.customer.name,
        phone: payload.customer.phone,
        address: payload.customer.address,
        note: payload.customer.note ?? '',
      },
      location_id: payload.locationId,
    }),
  });

  return {
    orderId: raw.id,
    orderNumber: raw.order_number,
    trackingToken: raw.tracking_token,
    sessionToken: raw.session_token,
  };
}

// ─── Order tracking ────────────────────────────────────────────────────────────

export async function getOrderTracking(
  trackingToken: string
): Promise<PublicTrackingInfo> {
  return publicRequest<PublicTrackingInfo>(
    `/public/orders/track/${trackingToken}`
  );
}

/** Manually confirm delivery of an order. */
export async function confirmDelivery(token: string): Promise<void> {
  await publicRequest(`/public/orders/confirm-delivery/${token}`, { method: 'POST' });
}

// ─── Customer order history (OTP-gated) ───────────────────────────────────────

/** Step 1: request a one-time code sent via SMS to the given phone number. */
export async function requestOTP(phone: string): Promise<void> {
  await publicRequest<void>('/public/auth/request-otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

/** Step 2: exchange OTP for a short-lived session token (30 min TTL). */
export async function verifyOTP(
  phone: string,
  otp: string
): Promise<{ sessionToken: string; expiresAt: string }> {
  return publicRequest('/public/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ phone, otp }),
  });
}

/** Authenticate using only phone number if SMS is disabled. */
export async function loginNoOTP(phone: string): Promise<{ sessionToken: string; expiresAt: string }> {
  return publicRequest('/public/auth/login-no-otp', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

/** Fetch past orders for authenticated customer session. */
export async function getCustomerHistory(
  sessionToken: string
): Promise<PublicOrder[]> {
  return publicRequest<PublicOrder[]>('/public/orders/history', {
    headers: { 'X-Customer-Session': sessionToken },
  });
}

// ─── Customer profile lookup (public, unauthenticated) ────────────────────────

export interface CustomerLookupResult {
  id: string;
  name: string;
  address?: string;
}

/**
 * Look up a customer by phone — returns null if not found.
 * Used by checkout to pre-fill details for returning customers.
 */
export async function lookupCustomerByPhone(phone: string): Promise<CustomerLookupResult | null> {
  try {
    return await publicRequest<CustomerLookupResult>(
      `/public/customers/lookup?phone=${encodeURIComponent(phone)}`
    );
  } catch {
    // Fall back to locally-stored mock customers
    try {
      const raw = localStorage.getItem('zenpos_mock_customers');
      const customers: { id: string; name: string; phone: string; address?: string }[] = raw ? JSON.parse(raw) : [];
      const normalised = phone.replace(/\D/g, '');
      const found = customers.find(c => c.phone.replace(/\D/g, '') === normalised);
      return found ? { id: found.id, name: found.name, address: found.address } : null;
    } catch {
      return null;
    }
  }
}

/**
 * Update a customer's display name / address.
 * Called when a returning customer says "Not me" and provides new info.
 */
export async function updateCustomerProfile(
  customerId: string,
  data: { name: string; address?: string },
  sessionToken: string,
): Promise<void> {
  try {
    await publicRequest<void>(`/public/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'X-Customer-Session': sessionToken },
      body: JSON.stringify(data),
    });
  } catch {
    // Best-effort — non-fatal
  }
}

/** Submit a review for a completed order. */
export async function submitCustomerReview(
  orderId: string,
  stars: number,
  comment: string,
  sessionToken: string
): Promise<void> {
  await publicRequest<void>(`/public/orders/${orderId}/review`, {
    method: 'POST',
    headers: { 'X-Customer-Session': sessionToken },
    body: JSON.stringify({ stars, comment }),
  });
}
