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
  };

  const raw = await apiRequest<ApiRegisterReport>('/register/reports', {
    method: 'POST',
    body: JSON.stringify(apiPayload),
  });
  return mapRegisterReport(raw);
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
