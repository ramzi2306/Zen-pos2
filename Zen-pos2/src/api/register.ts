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

export interface WithdrawalItem {
  id: string;
  amount: number;
  notes?: string;
  category: 'other' | 'salary_advance' | 'purchase';
  reference_id?: string;
  reference_label?: string;
}

export interface FloatSummary {
  opening_float: number;
  net_cash_collected: number;
  total_cash_withdrawn: number;
  withdrawals: WithdrawalItem[];
  expected_closing_float: number;
}

export interface AdvanceCandidate {
  id: string;
  name: string;
  avatar: string;
  base_salary: number;
  net_payable: number;
}

export interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  price_per_unit: number;
  in_stock: number;
}

export interface WithdrawalPayload {
  amount: number;
  notes?: string;
  category?: 'other' | 'salary_advance' | 'purchase';
  // salary_advance
  employee_id?: string;
  employee_name?: string;
  // purchase
  ingredient_id?: string;
  ingredient_name?: string;
  vendor?: string;
  quantity?: number;
  unit?: string;
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

export async function getAdvanceCandidates(): Promise<AdvanceCandidate[]> {
  return await apiRequest<AdvanceCandidate[]>('/register/session/advance-candidates');
}

export async function getIngredientOptions(): Promise<IngredientOption[]> {
  return await apiRequest<IngredientOption[]>('/register/session/ingredient-options');
}

export async function recordWithdrawal(payload: WithdrawalPayload): Promise<void> {
  await apiRequest<void>(`/register/session/withdrawal`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, category: payload.category ?? 'other' }),
  });
}

export async function deleteWithdrawal(withdrawalId: string): Promise<void> {
  await apiRequest<void>(`/register/session/withdrawal/${withdrawalId}`, {
    method: 'DELETE',
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
