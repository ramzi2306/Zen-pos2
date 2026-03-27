import { apiRequest } from './client';
import type { Customer, CustomerDetail } from '../data';

interface ApiCustomer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  notes: string;
  created_at: string;
  order_count: number;
  total_spent: number;
  last_order_date?: string;
}

interface ApiCustomerDetail extends ApiCustomer {
  orders: {
    id: string;
    order_number: string;
    created_at?: string;
    total: number;
    status: string;
    order_type: string;
    items_count: number;
    review?: { stars: number; comment: string };
  }[];
}

function mapCustomer(c: ApiCustomer): Customer {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    notes: c.notes,
    createdAt: c.created_at,
    orderCount: c.order_count,
    totalSpent: c.total_spent,
    lastOrderDate: c.last_order_date,
  };
}

// ─── Mock customer store (localStorage fallback when backend is unavailable) ───

const MOCK_CUSTOMERS_KEY = 'zenpos_mock_customers';

function loadMockCustomers(): ApiCustomer[] {
  try {
    const raw = localStorage.getItem(MOCK_CUSTOMERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * Upsert a customer in the local mock store.
 * Called whenever a public online order is placed, so customers are always
 * recorded even when the backend is unavailable.
 */
export function saveMockCustomer(data: {
  id: string;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  totalSpent?: number;
}): void {
  try {
    const existing = loadMockCustomers();
    const normalPhone = data.phone.replace(/\D/g, '');
    const idx = existing.findIndex(c => c.phone.replace(/\D/g, '') === normalPhone);
    const prev = idx >= 0 ? existing[idx] : null;
    const customer: ApiCustomer = {
      id: data.id,
      name: data.name,
      phone: data.phone,
      address: data.address,
      notes: data.notes ?? prev?.notes ?? '',
      created_at: prev?.created_at ?? new Date().toISOString(),
      order_count: (prev?.order_count ?? 0) + 1,
      total_spent: (prev?.total_spent ?? 0) + (data.totalSpent ?? 0),
      last_order_date: new Date().toISOString(),
    };
    if (idx >= 0) existing[idx] = customer;
    else existing.push(customer);
    localStorage.setItem(MOCK_CUSTOMERS_KEY, JSON.stringify(existing));
  } catch {}
}

// ─── API functions ─────────────────────────────────────────────────────────────

export async function listCustomers(search?: string): Promise<Customer[]> {
  const mockRaw = loadMockCustomers();
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  try {
    const raw = await apiRequest<ApiCustomer[]>(`/customers/${params}`);
    const apiCustomers = raw.map(mapCustomer);
    // Merge local mock customers not yet in the backend
    const normalise = (p: string) => p.replace(/\D/g, '');
    const onlyLocal = mockRaw
      .filter(m => !apiCustomers.some(c => normalise(c.phone) === normalise(m.phone)))
      .map(mapCustomer);
    const filtered = search
      ? onlyLocal.filter(c =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.phone.includes(search)
        )
      : onlyLocal;
    return [...apiCustomers, ...filtered];
  } catch {
    // Backend unavailable — serve mock customers only
    let customers = mockRaw.map(mapCustomer);
    if (search) {
      customers = customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
      );
    }
    return customers;
  }
}

export async function getCustomer(id: string): Promise<CustomerDetail> {
  try {
    const raw = await apiRequest<ApiCustomerDetail>(`/customers/${id}`);
    return {
      ...mapCustomer(raw),
      orders: raw.orders.map(o => ({
        id: o.id,
        orderNumber: o.order_number,
        createdAt: o.created_at,
        total: o.total,
        status: o.status,
        orderType: o.order_type,
        itemsCount: o.items_count,
        review: o.review,
      })),
    };
  } catch {
    // Fallback: build detail from mock customers + mock orders
    const mockCustomers = loadMockCustomers();
    const mock = mockCustomers.find(c => c.id === id);
    if (!mock) throw new Error('Customer not found');
    const mockOrders: any[] = JSON.parse(
      localStorage.getItem('zenpos_mock_online_orders') ?? '[]'
    );
    const normalise = (p: string) => p.replace(/\D/g, '');
    const customerOrders = mockOrders
      .filter(o => normalise(o.customer?.phone ?? '') === normalise(mock.phone))
      .map(o => ({
        id: o.id,
        orderNumber: o.order_number,
        createdAt: o.created_at,
        total: o.total,
        status: o.status,
        orderType: o.order_type,
        itemsCount: (o.items ?? []).length,
        review: undefined as { stars: number; comment: string } | undefined,
      }));
    return { ...mapCustomer(mock), orders: customerOrders };
  }
}
