import { apiRequest } from './client';
import type { RegisterReport } from '../data';

interface ApiRegisterReport {
  id: string;
  opened_at: number;
  closed_at: number;
  cashier_name: string;
  expected_sales: number;
  actual_sales: number;
  difference: number;
  notes?: string;
  location_id?: string;
  opening_float?: number;
  net_cash_collected?: number;
  total_cash_withdrawn?: number;
  counted_closing_float?: number;
  discrepancy?: number;
}

export interface FloatSummary {
  opening_float: number;
  net_cash_collected: number;
  total_cash_withdrawn: number;
  expected_closing_float: number;
}

function mapRegisterReport(raw: ApiRegisterReport): RegisterReport {
  return {
    id: raw.id,
    openedAt: raw.opened_at,
    closedAt: raw.closed_at,
    cashierName: raw.cashier_name,
    expectedSales: raw.expected_sales,
    actualSales: raw.actual_sales,
    difference: raw.difference,
    notes: raw.notes,
    locationId: raw.location_id,
    openingFloat: raw.opening_float,
    netCashCollected: raw.net_cash_collected,
    totalCashWithdrawn: raw.total_cash_withdrawn,
    countedClosingFloat: raw.counted_closing_float,
    discrepancy: raw.discrepancy,
  };
}

export async function submitRegisterReport(
  payload: Omit<RegisterReport, 'id'>
): Promise<RegisterReport> {
  const apiPayload = {
    opened_at: payload.openedAt,
    closed_at: payload.closedAt,
    cashier_name: payload.cashierName,
    expected_sales: payload.expectedSales,
    actual_sales: payload.actualSales,
    difference: payload.difference,
    notes: payload.notes,
    location_id: payload.locationId,
    opening_float: payload.openingFloat,
    net_cash_collected: payload.netCashCollected,
    total_cash_withdrawn: payload.totalCashWithdrawn,
    counted_closing_float: payload.countedClosingFloat,
    discrepancy: payload.discrepancy,
  };

  const raw = await apiRequest<ApiRegisterReport>('/register/reports', {
    method: 'POST',
    body: JSON.stringify(apiPayload),
  });
  return mapRegisterReport(raw);
}

export async function getSessionFloatSummary(): Promise<FloatSummary> {
  return await apiRequest<FloatSummary>('/register/session/float-summary');
}

export async function recordWithdrawal(amount: number, notes?: string): Promise<void> {
  await apiRequest<void>(`/register/session/withdrawal`, {
    method: 'POST',
    body: JSON.stringify({ amount, notes }),
  });
}

export async function listRegisterReports(locationId?: string, limit?: number): Promise<RegisterReport[]> {
  const params = new URLSearchParams();
  if (locationId) params.set('location_id', locationId);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const url = `/register/reports${qs ? '?' + qs : ''}`;
  const raw = await apiRequest<ApiRegisterReport[]>(url);
  return raw.map(mapRegisterReport);
}
