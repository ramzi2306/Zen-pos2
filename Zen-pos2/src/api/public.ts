/**
 * public.ts — Unauthenticated API calls for the customer-facing ordering module.
 * All requests go through publicRequest() which sends no Authorization header.
 */
import { publicRequest, apiRequest } from './client';
import { getCartItemPrice } from '../utils/cartUtils';
import type {
  PublicMenuCategory,
  PublicTrackingInfo,
  PublicOrder,
  OnlineOrderRequest,
} from '../data';

// ─── Menu ──────────────────────────────────────────────────────────────────────

export async function getPublicMenu(): Promise<PublicMenuCategory[]> {
  return publicRequest<PublicMenuCategory[]>('/public/menu');
}

export async function getPublicMenuImages(): Promise<{ id: string; image: string }[]> {
  return publicRequest<{ id: string; image: string }[]>('/public/images');
}

export async function getActiveDeliveryPlaces(): Promise<{ id: string; name: string; wilaya: string; delivery_fee: number }[]> {
  return publicRequest<{ id: string; name: string; wilaya: string; delivery_fee: number }[]>('/delivery/places/active');
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
      items: payload.items.map(i => {
        // Compute the real per-unit price (variation override + supplement adjustments)
        // so the backend receives an accurate unit_price and doesn't need to re-derive it.
        const unitPrice = getCartItemPrice({
          price: i.price,
          selectedVariations: i.selectedVariations as any,
          selectedSupplements: i.selectedSupplements as any,
          cartItemId: 'temp',
          quantity: 1,
        } as any);
        return {
          product_id: i.productId,
          product_name: i.name,
          unit_price: unitPrice,
          quantity: i.quantity,
          notes: i.note ?? '',
          // Variations as metadata only (price already baked into unit_price)
          selected_variations: Object.entries(i.selectedVariations ?? {}).map(([groupId, opt]) => ({
            group_id: groupId,
            option_id: opt.id,
            option_name: opt.name,
            price_adjustment: 0,
          })),
          // Supplements as metadata only
          selected_supplements: Object.entries(i.selectedSupplements ?? {}).map(([groupId, opt]) => ({
            group_id: groupId,
            option_id: opt.id,
            option_name: opt.name,
            price_adjustment: 0,
          })),
        };
      }),
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
  const raw = await publicRequest<any>(`/public/orders/track/${trackingToken}`);
  return {
    ...raw,
    orderId: raw.id, // Map 'id' from backend to 'orderId' used by frontend
    orderType: raw.order_type ?? raw.orderType,
  } as PublicTrackingInfo;
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
  return publicRequest<CustomerLookupResult>(
    `/public/customers/lookup?phone=${encodeURIComponent(phone)}`
  ).catch(() => null);
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
