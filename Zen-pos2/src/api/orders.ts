import { apiRequest } from './client';
import type { Order, CartItem, User } from '../data';

interface ApiOrderItem {
  product_id: string;
  product_name: string;
  category: string;
  unit_price: number;
  quantity: number;
  notes?: string;
  discount: number;
  selected_variations: {
    group_id: string;
    group_name: string;
    option_id: string;
    option_name: string;
    price_adjustment: number;
  }[];
}

interface ApiOrder {
  id: string;
  order_number: string;
  table: string;
  status: string;
  payment_status: string;
  items: ApiOrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  order_type: string;
  channel?: string;
  customer: { name: string; phone: string; address?: string };
  scheduled_time?: string;
  start_time?: number;
  end_time?: number;
  is_urgent: boolean;
  notes: string;
  cook_id?: string;
  assistant_ids: string[];
  review?: { stars: number; comment: string };
  created_at?: string;
}

// ─── Mock online order store (localStorage fallback when backend is unavailable) ─

const MOCK_ORDERS_KEY = 'zenpos_mock_online_orders';

function loadMockOrders(): ApiOrder[] {
  try {
    const raw = localStorage.getItem(MOCK_ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function patchMockOrder(orderId: string, updates: Partial<ApiOrder>): ApiOrder | null {
  try {
    const orders = loadMockOrders();
    const updated = orders.map(o => o.id === orderId ? { ...o, ...updates } : o);
    localStorage.setItem(MOCK_ORDERS_KEY, JSON.stringify(updated));
    return updated.find(o => o.id === orderId) ?? null;
  } catch { return null; }
}

/** Parse a datetime string from the backend as UTC epoch ms.
 *  Motor/MongoDB sometimes strips the timezone, returning bare ISO strings
 *  like "2024-01-01T10:00:00" — without a Z suffix JavaScript treats them
 *  as local time, causing the timer to be off by the user's UTC offset.
 */
function parseUtcMs(dt?: string | null): number | undefined {
  if (!dt) return undefined;
  const s = /[Z+]/.test(dt) ? dt : dt + 'Z';
  return new Date(s).getTime();
}

function timeAgo(ms?: number): string {
  if (!ms) return 'Just now';
  const diff = Math.floor((Date.now() - ms) / 60000);
  if (diff < 1) return 'Just now';
  if (diff === 1) return '1m ago';
  return `${diff}m ago`;
}

function mapOrder(raw: ApiOrder, users: User[] = []): Order {
  const cook = raw.cook_id ? users.find(u => u.id === raw.cook_id) : undefined;
  const assistants = (raw.assistant_ids || [])
    .map(id => users.find(u => u.id === id))
    .filter(Boolean) as User[];

  return {
    id: raw.id,
    orderNumber: raw.order_number,
    table: raw.table,
    status: raw.status as Order['status'],
    paymentStatus: raw.payment_status as Order['paymentStatus'],
    items: raw.items.map(item => ({
      cartItemId: item.selected_variations.length > 0
        ? `${item.product_id}|${item.selected_variations.map(v => `${v.group_id}:${v.option_id}`).sort().join('|')}`
        : item.product_id,
      id: item.product_id,
      name: item.product_name,
      description: '',
      price: item.unit_price,
      quantity: item.quantity,
      notes: item.notes,
      discount: item.discount,
      category: item.category as any,
      image: '',
      inStock: true,
      selectedVariations: item.selected_variations.reduce((acc, v) => ({
        ...acc,
        [v.group_id]: { id: v.option_id, name: v.option_name, priceAdjustment: v.price_adjustment },
      }), {} as Record<string, any>),
    })),
    subtotal: raw.subtotal,
    tax: raw.tax,
    total: raw.total,
    time: timeAgo(raw.start_time),
    notes: raw.notes || '',
    orderType: raw.order_type as Order['orderType'],
    channel: raw.channel as 'online' | undefined,
    customer: raw.customer?.name ? raw.customer : undefined,
    scheduledTime: raw.scheduled_time,
    startTime: raw.start_time,
    endTime: raw.end_time,
    queueStartTime: parseUtcMs(raw.created_at),
    createdAt: raw.created_at,
    isUrgent: raw.is_urgent,
    cook,
    assistants: assistants.length > 0 ? assistants : undefined,
    review: raw.review,
  };
}

export async function listOrders(users: User[] = [], date?: string, locationId?: string): Promise<Order[]> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (locationId) params.set('location_id', locationId);
  const qs = params.toString();
  const url = `/orders/${qs ? '?' + qs : ''}`;
  const mockRaw = loadMockOrders();
  try {
    const raw = await apiRequest<ApiOrder[]>(url);
    const apiOrders = raw.map(o => mapOrder(o, users));
    // Merge locally-created mock orders not yet synced to the backend
    const onlyLocal = mockRaw
      .filter(m => !apiOrders.some(o => o.id === m.id))
      .map(m => mapOrder(m, users));
    return [...apiOrders, ...onlyLocal];
  } catch (err) {
    // Backend unavailable — serve mock orders so POS still shows online orders
    if (mockRaw.length > 0) return mockRaw.map(m => mapOrder(m, users));
    throw err;
  }
}

export async function createOrder(
  cart: CartItem[],
  orderType: 'dine_in' | 'takeaway' | 'delivery',
  table: string,
  customer: { name: string; phone: string; address?: string },
  notes: string,
  paymentStatus: 'Unpaid' | 'Paid' = 'Unpaid',
  status: 'Queued' | 'Draft' = 'Queued',
): Promise<Order> {
  const payload = {
    table,
    order_type: orderType,
    customer,
    notes,
    payment_status: paymentStatus,
    status,
    items: cart.map(item => ({
      product_id: item.id,
      product_name: item.name,
      category: item.category || '',
      unit_price: item.price,
      quantity: item.quantity,
      notes: item.notes || '',
      discount: item.discount || 0,
      selected_variations: Object.entries(item.selectedVariations || {}).map(([groupId, opt]) => ({
        group_id: groupId,
        group_name: groupId,
        option_id: opt.id,
        option_name: opt.name,
        price_adjustment: opt.priceAdjustment || 0,
      })),
    })),
  };
  const raw = await apiRequest<ApiOrder>('/orders/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapOrder(raw);
}

export async function updateOrderStatus(orderId: string, status: string, scheduledTime?: string): Promise<Order> {
  const body: Record<string, string> = { status };
  if (scheduledTime) body.scheduled_time = scheduledTime;
  try {
    const raw = await apiRequest<ApiOrder>(`/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return mapOrder(raw);
  } catch (err) {
    const patched = patchMockOrder(orderId, { status });
    if (patched) return mapOrder(patched);
    throw err;
  }
}

export async function updateOrderPayment(orderId: string, paymentStatus: string): Promise<Order> {
  const raw = await apiRequest<ApiOrder>(`/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ payment_status: paymentStatus }),
  });
  return mapOrder(raw);
}

export async function assignCook(orderId: string, cookId: string, users: User[] = []): Promise<Order> {
  const raw = await apiRequest<ApiOrder>(`/orders/${orderId}/assign-cook`, {
    method: 'POST',
    body: JSON.stringify({ cook_id: cookId }),
  });
  return mapOrder(raw, users);
}

export async function assignAssistant(orderId: string, userId: string, users: User[] = []): Promise<Order> {
  const raw = await apiRequest<ApiOrder>(`/orders/${orderId}/assign-assistant`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
  return mapOrder(raw, users);
}

export async function submitReview(orderId: string, stars: number, comment: string): Promise<Order> {
  const raw = await apiRequest<ApiOrder>(`/orders/${orderId}/review`, {
    method: 'POST',
    body: JSON.stringify({ stars, comment }),
  });
  return mapOrder(raw);
}

// ─── Online order cashier actions ─────────────────────────────────────────────

export async function verifyOnlineOrder(orderId: string, notes?: string): Promise<Order> {
  try {
    const raw = await apiRequest<ApiOrder>(`/orders/${orderId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ notes: notes ?? '' }),
    });
    return mapOrder(raw);
  } catch (err) {
    const patched = patchMockOrder(orderId, { status: 'Verified', notes: notes ?? '' });
    if (patched) return mapOrder(patched);
    throw err;
  }
}

export async function addToKitchenQueue(orderId: string): Promise<Order> {
  try {
    const raw = await apiRequest<ApiOrder>(`/orders/${orderId}/add-to-kitchen`, {
      method: 'POST',
    });
    return mapOrder(raw);
  } catch (err) {
    const patched = patchMockOrder(orderId, { status: 'Queued' });
    if (patched) return mapOrder(patched);
    throw err;
  }
}

export async function cancelOnlineOrder(orderId: string, reason: string): Promise<Order> {
  try {
    const raw = await apiRequest<ApiOrder>(`/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Cancelled', cancellation_reason: reason }),
    });
    return mapOrder(raw);
  } catch (err) {
    const patched = patchMockOrder(orderId, { status: 'Cancelled' });
    if (patched) return mapOrder(patched);
    throw err;
  }
}

export async function listOnlinePendingOrders(users: User[] = []): Promise<Order[]> {
  const raw = await apiRequest<ApiOrder[]>('/orders/?channel=online&status=Verification');
  return raw.map(o => mapOrder(o, users));
}
