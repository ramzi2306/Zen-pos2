import { apiRequest } from './client';

export const EXPENSE_CATEGORIES = [
  'Rental',
  'Equipment',
  'Maintenance',
  'Construction',
  'Paperwork',
  'Other',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export interface ManualExpense {
  id: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  date: string;
  notes: string;
  is_recurring: boolean;
  frequency: string | null;
  next_occurrence: string | null;
  is_paused: boolean;
}

export async function getExpenses(start?: string, end?: string): Promise<ManualExpense[]> {
  const qs = new URLSearchParams();
  if (start) qs.set('start_date', start);
  if (end) qs.set('end_date', end);
  return apiRequest<ManualExpense[]>(`/expenses${qs.toString() ? `?${qs}` : ''}`);
}

export async function togglePauseExpense(id: string): Promise<ManualExpense> {
  return apiRequest<ManualExpense>(`/expenses/${encodeURIComponent(id)}/pause`, { method: 'PATCH' });
}

export async function createExpense(data: {
  category: string;
  title: string;
  amount: number;
  date: string;
  notes?: string;
  is_recurring?: boolean;
  frequency?: string;
}): Promise<ManualExpense> {
  return apiRequest<ManualExpense>('/expenses', {
    method: 'POST',
    body: JSON.stringify({ ...data, notes: data.notes ?? '' }),
  });
}

export async function deleteExpense(id: string): Promise<void> {
  await apiRequest<void>(`/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
