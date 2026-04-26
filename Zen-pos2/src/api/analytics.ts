import { apiRequest } from './client';
import type { BestsellerItem, LeaderboardEntry, SalesSummary } from '../data';

export async function getBestsellers(limit = 5): Promise<BestsellerItem[]> {
  const raw = await apiRequest<{ product_name: string; total_quantity: number; total_revenue: number }[]>(
    `/analytics/bestsellers?limit=${limit}`
  );
  return raw.map(r => ({
    productName: r.product_name,
    totalQuantity: r.total_quantity,
    totalRevenue: r.total_revenue,
  }));
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const raw = await apiRequest<{ user_id: string; name: string; avatar: string; orders_completed: number; rank: number }[]>(
    '/analytics/leaderboard'
  );
  return raw.map(r => ({
    userId: r.user_id,
    name: r.name,
    avatar: r.avatar,
    ordersCompleted: r.orders_completed,
    rank: r.rank,
  }));
}

export async function getSalesSummary(): Promise<SalesSummary> {
  const raw = await apiRequest<{
    total_orders: number;
    total_revenue: number;
    avg_order_value: number;
    orders_this_month: number;
    revenue_this_month: number;
    reviews_count: number;
    reviews_avg_rating: number;
  }>('/analytics/summary');
  return {
    totalOrders: raw.total_orders,
    totalRevenue: raw.total_revenue,
    avgOrderValue: raw.avg_order_value,
    ordersThisMonth: raw.orders_this_month,
    revenueThisMonth: raw.revenue_this_month,
    reviewsCount: raw.reviews_count,
    reviewsAvgRating: raw.reviews_avg_rating,
  };
}

export async function getDailySales(start: string, end: string): Promise<{ date: string; income: number; order_count: number; avg_prep_time_minutes: number }[]> {
  return apiRequest<{ date: string; income: number; order_count: number; avg_prep_time_minutes: number }[]>(
    `/analytics/daily?start_date=${start}&end_date=${end}`
  );
}

export interface FinanceDayItem {
  date: string;
  income: number;
  expenses: number;
  profit: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  count: number;
}

export interface PurchaseItem {
  date: string;
  ingredient: string;
  vendor: string;
  quantity: number;
  unit: string;
  cost: number;
}

export interface SalaryItem {
  id: string;
  date: string;
  user_name: string;
  base_salary: number;
  net_amount: number;
}

export interface CashAdvanceItem {
  date: string;
  user_name: string;
  amount: number;
  status: string;
}

export interface ManualExpenseItem {
  id: string;
  category: string;
  title: string;
  amount: number;
  date: string;
  notes: string;
}

export interface FinanceReport {
  period_start: string;
  period_end: string;
  income_total: number;
  income_order_count: number;
  income_by_day: FinanceDayItem[];
  income_by_payment_method: PaymentMethodBreakdown[];
  expenses: {
    total: number;
    purchases_total: number;
    salaries_total: number;
    cash_advances_total: number;
    manual_expenses_total: number;
    purchases: PurchaseItem[];
    salaries: SalaryItem[];
    cash_advances: CashAdvanceItem[];
    manual_expenses: ManualExpenseItem[];
  };
  profit: number;
  profit_margin: number;
}

export async function getFinanceReport(start: string, end: string): Promise<FinanceReport> {
  return apiRequest<FinanceReport>(`/analytics/finance?start_date=${start}&end_date=${end}`);
}
