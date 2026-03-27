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
  }>('/analytics/summary');
  return {
    totalOrders: raw.total_orders,
    totalRevenue: raw.total_revenue,
    avgOrderValue: raw.avg_order_value,
    ordersThisMonth: raw.orders_this_month,
    revenueThisMonth: raw.revenue_this_month,
  };
}
