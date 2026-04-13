import { apiRequest } from './client';
import type { Order, CartItem, User } from '../data';

interface ApiOrderItem {
  product_id: string;
  product_name: string;
  category: string;
  image?: string;
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
    is_supplement?: boolean;
  }[];
  manual_price?: number;
}

interface ApiOrder {
  id: string;
  order_number: string;
  table: string;
  status: string;
  payment_status: string;
  payment_method?: string;
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
  tracking_token?: string;
  created_at?: string;
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
    paymentMethod: (raw.payment_method as Order['paymentMethod']) || 'Cash',
    items: raw.items.map(item => {
      const allVars = item.selected_variations || [];
      const variations = allVars.filter(v => !v.is_supplement);
      const supplements = allVars.filter(v => !!v.is_supplement);

      return {
        cartItemId: allVars.length > 0
          ? `${item.product_id}|${allVars.map(v => `${v.group_id}:${v.option_id}`).sort().join('|')}`
          : item.product_id,
        id: item.product_id,
        name: item.product_name,
        description: '',
        price: item.unit_price,
        quantity: item.quantity,
        notes: item.notes,
        discount: item.discount,
        manualPrice: item.manual_price,
        category: item.category as any,
        image: item.image || '',
        inStock: true,
        selectedVariations: variations.reduce((acc, v) => ({
          ...acc,
          [v.group_id]: { id: v.option_id, name: v.option_name, price: v.price_adjustment },
        }), {} as Record<string, any>),
        selectedSupplements: supplements.reduce((acc, v) => ({
          ...acc,
          [v.group_id]: { id: v.option_id, name: v.option_name, priceAdjustment: v.price_adjustment },
        }), {} as Record<string, any>),
      };
    }),
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
    queueStartTime: raw.created_at ? new Date(raw.created_at).getTime() : undefined,
    createdAt: raw.created_at,
    isUrgent: raw.is_urgent,
    cook,
    assistants: assistants.length > 0 ? assistants : undefined,
    review: raw.review,
    trackingToken: raw.tracking_token,
    deliveryAgent: (raw as any).delivery_agent || undefined,
  };
}

export async function listOrders(users: User[] = [], date?: string, locationId?: string, startDate?: string, endDate?: string): Promise<Order[]> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  if (locationId) params.set('location_id', locationId);
  const qs = params.toString();
  const url = `/orders/${qs ? '?' + qs : ''}`;
  const raw = await apiRequest<ApiOrder[]>(url);
  return raw.map(o => mapOrder(o, users));
}

export async function getOrder(orderId: string, users: User[] = []): Promise<Order> {
  const raw = await apiRequest<ApiOrder>(`/orders/${orderId}`);
  return mapOrder(raw, users);
}

export async function createOrder(
  cart: CartItem[],
  orderType: 'dine_in' | 'takeaway' | 'delivery',
  table: string,
  customer: { name: string; phone: string; address?: string },
  notes: string,
  paymentStatus: 'Unpaid' | 'Paid' = 'Unpaid',
  status: 'Queued' | 'Draft' = 'Queued',
  paymentMethod: 'Cash' | 'Credit Card' | 'Other' = 'Cash',
): Promise<Order> {
  const payload = {
    table,
    order_type: orderType,
    customer,
    notes,
    payment_status: paymentStatus,
    payment_method: paymentMethod,
    status,
    items: cart.map(item => ({
      product_id: item.id,
      product_name: item.name,
      category: item.category || '',
      image: item.image,
      unit_price: item.price,
      manual_price: item.manualPrice,
      quantity: item.quantity,
      notes: item.notes || '',
      discount: item.discount || 0,
      selected_variations: [
        ...Object.entries(item.selectedVariations || {}).map(([groupId, opt]) => ({
          group_id: groupId,
          group_name: groupId,
          option_id: opt.id,
          option_name: opt.name,
          price_adjustment: (opt as any).price ?? (opt as any).priceAdjustment ?? 0,
          is_supplement: false,
        })),
        ...Object.entries(item.selectedSupplements || {}).map(([groupId, opt]) => ({
          group_id: groupId,
          group_name: groupId,
          option_id: opt.id,
          option_name: opt.name,
          price_adjustment: (opt as any).priceAdjustment ?? (opt as any).price ?? 0,
          is_supplement: true,
        })),
      ],
    })),
  };
  const raw = await apiRequest<ApiOrder>('/orders/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapOrder(raw);
}

export async function updateOrder(
  orderId: string,
  cart?: CartItem[],
  orderType?: 'dine_in' | 'takeaway' | 'delivery',
  table?: string,
  customer?: { name: string; phone: string; address?: string },
  notes?: string,
  paymentStatus?: 'Unpaid' | 'Paid',
  status?: string,
  paymentMethod?: 'Cash' | 'Credit Card' | 'Other',
): Promise<Order> {
  const payload: any = {};
  if (table !== undefined) payload.table = table;
  if (orderType !== undefined) payload.order_type = orderType;
  if (customer !== undefined) payload.customer = customer;
  if (notes !== undefined) payload.notes = notes;
  if (paymentStatus !== undefined) payload.payment_status = paymentStatus;
  if (paymentMethod !== undefined) payload.payment_method = paymentMethod;
  if (status !== undefined) payload.status = status;
  
  if (cart !== undefined) {
    payload.items = cart.map(item => ({
      product_id: item.id,
      product_name: item.name,
      category: item.category || '',
      image: item.image,
      unit_price: item.price,
      manual_price: item.manualPrice,
      quantity: item.quantity,
      notes: item.notes || '',
      discount: item.discount || 0,
      selected_variations: [
        ...Object.entries(item.selectedVariations || {}).map(([groupId, opt]) => ({
          group_id: groupId,
          group_name: groupId,
          option_id: opt.id,
          option_name: opt.name,
          price_adjustment: (opt as any).price ?? (opt as any).priceAdjustment ?? 0,
          is_supplement: false,
        })),
        ...Object.entries(item.selectedSupplements || {}).map(([groupId, opt]) => ({
          group_id: groupId,
          group_name: groupId,
          option_id: opt.id,
          option_name: opt.name,
          price_adjustment: (opt as any).priceAdjustment ?? (opt as any).price ?? 0,
          is_supplement: true,
        })),
      ],
    }));
  }

  const raw = await apiRequest<ApiOrder>(`/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapOrder(raw);
}

export async function updateOrderStatus(orderId: string, status: string, scheduledTime?: string): Promise<Order> {
  const body: Record<string, string> = { status };
  if (scheduledTime) body.scheduled_time = scheduledTime;
  const raw = await apiRequest<ApiOrder>(`/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return mapOrder(raw);
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
  const raw = await apiRequest<ApiOrder>(`/orders/${orderId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ notes: notes ?? '' }),
  });
  return mapOrder(raw);
}

export async function addToKitchenQueue(orderId: string): Promise<Order> {
  const raw = await apiRequest<ApiOrder>(`/orders/${orderId}/add-to-kitchen`, {
    method: 'POST',
  });
  return mapOrder(raw);
}

export async function cancelOnlineOrder(orderId: string, reason: string): Promise<Order> {
  const raw = await apiRequest<ApiOrder>(`/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Cancelled', cancellation_reason: reason }),
  });
  return mapOrder(raw);
}

export async function listOnlinePendingOrders(users: User[] = []): Promise<Order[]> {
  const raw = await apiRequest<ApiOrder[]>('/orders/?channel=online&status=Verification');
  return raw.map(o => mapOrder(o, users));
}
