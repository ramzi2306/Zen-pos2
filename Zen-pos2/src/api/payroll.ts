import { apiRequest } from './client';

export interface WithdrawalLog {
  id: string;
  userId: string;
  amount: number;
  netAmount: number;
  date: string;
  status: string;
}

export interface PayrollSummary {
  userId: string;
  userName: string;
  baseSalary: number;
  rewardBonus: number;
  sanctionDeduction: number;
  overtimeBonus: number;
  lateDeduction: number;
  earlyDepartureDeduction: number;
  netPayable: number;
  lateCount: number;
  earlyDepartureCount: number;
  overtimeHours: number;
}

export interface PerformanceLogEntry {
  id: string;
  userId: string;
  type: 'Reward' | 'Sanction';
  title: string;
  impact: string;
  date: string;
}

interface ApiWithdrawal {
  id: string;
  user_id: string;
  amount: number;
  net_amount: number;
  date: string;
  status: string;
}

interface ApiPayrollSummary {
  user_id: string;
  user_name: string;
  base_salary: number;
  reward_bonus: number;
  sanction_deduction: number;
  overtime_bonus: number;
  late_deduction: number;
  early_departure_deduction: number;
  net_payable: number;
  late_count: number;
  early_departure_count: number;
  overtime_hours: number;
}

interface ApiPerformanceLog {
  id: string;
  user_id: string;
  type: string;
  title: string;
  impact: string;
  date: string;
}

function mapWithdrawal(w: ApiWithdrawal): WithdrawalLog {
  return {
    id: w.id,
    userId: w.user_id,
    amount: w.amount,
    netAmount: w.net_amount,
    date: w.date,
    status: w.status,
  };
}

function mapSummary(s: ApiPayrollSummary): PayrollSummary {
  return {
    userId: s.user_id,
    userName: s.user_name,
    baseSalary: s.base_salary,
    rewardBonus: s.reward_bonus,
    sanctionDeduction: s.sanction_deduction,
    overtimeBonus: s.overtime_bonus,
    lateDeduction: s.late_deduction,
    earlyDepartureDeduction: s.early_departure_deduction,
    netPayable: s.net_payable,
    lateCount: s.late_count,
    earlyDepartureCount: s.early_departure_count,
    overtimeHours: s.overtime_hours,
  };
}

function mapPerformanceLog(l: ApiPerformanceLog): PerformanceLogEntry {
  return {
    id: l.id,
    userId: l.user_id,
    type: l.type as 'Reward' | 'Sanction',
    title: l.title,
    impact: l.impact,
    date: l.date,
  };
}

export async function getSummary(userId: string): Promise<PayrollSummary> {
  const raw = await apiRequest<ApiPayrollSummary>(`/payroll/summary/${userId}`);
  return mapSummary(raw);
}

export async function getWithdrawals(userId: string): Promise<WithdrawalLog[]> {
  const raw = await apiRequest<ApiWithdrawal[]>(`/payroll/withdrawals/${userId}`);
  return raw.map(mapWithdrawal);
}

export async function processWithdrawal(
  userId: string,
  amount: number,
  adminNotes = '',
  auditNotes = '',
): Promise<WithdrawalLog> {
  const raw = await apiRequest<ApiWithdrawal>('/payroll/withdraw', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      amount,
      admin_notes: adminNotes,
      audit_notes: auditNotes,
    }),
  });
  return mapWithdrawal(raw);
}

export async function getPerformanceLogs(userId?: string): Promise<PerformanceLogEntry[]> {
  const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
  const raw = await apiRequest<ApiPerformanceLog[]>(`/payroll/performance-logs${qs}`);
  return raw.map(mapPerformanceLog);
}

export async function deletePerformanceLog(logId: string): Promise<void> {
  await apiRequest<void>(`/payroll/performance-logs/${encodeURIComponent(logId)}`, { method: 'DELETE' });
}

export async function createPerformanceLog(
  userId: string,
  type: 'Reward' | 'Sanction',
  title: string,
  impact: string,
): Promise<PerformanceLogEntry> {
  const raw = await apiRequest<ApiPerformanceLog>('/payroll/performance-logs', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, type, title, impact }),
  });
  return mapPerformanceLog(raw);
}

export async function editSalaryWithdrawal(
  withdrawalId: string,
  data: { amount: number; admin_notes?: string; audit_notes?: string; status?: string },
): Promise<WithdrawalLog> {
  const raw = await apiRequest<ApiWithdrawal>(`/payroll/withdrawals/${encodeURIComponent(withdrawalId)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return mapWithdrawal(raw);
}

export async function deleteSalaryWithdrawal(withdrawalId: string): Promise<void> {
  await apiRequest<void>(`/payroll/withdrawals/${encodeURIComponent(withdrawalId)}`, { method: 'DELETE' });
}

export interface PayrollSnapshot {
  userId: string;
  userName: string;
  month: string;
  baseSalary: number;
  earnedBase: number;
  rewardBonus: number;
  sanctionDeduction: number;
  overtimeBonus: number;
  earlyArrivalBonus: number;
  lateDeduction: number;
  earlyDepartureDeduction: number;
  netPayable: number;
  workedDays: number;
  lateCount: number;
  earlyDepartureCount: number;
  earlyArrivalCount: number;
  overtimeHours: number;
}

interface ApiSnapshot {
  user_id: string;
  user_name: string;
  month: string;
  base_salary: number;
  earned_base: number;
  reward_bonus: number;
  sanction_deduction: number;
  overtime_bonus: number;
  early_arrival_bonus: number;
  late_deduction: number;
  early_departure_deduction: number;
  net_payable: number;
  worked_days: number;
  late_count: number;
  early_departure_count: number;
  early_arrival_count: number;
  overtime_hours: number;
}

function mapSnapshot(s: ApiSnapshot): PayrollSnapshot {
  return {
    userId: s.user_id,
    userName: s.user_name,
    month: s.month,
    baseSalary: s.base_salary,
    earnedBase: s.earned_base,
    rewardBonus: s.reward_bonus,
    sanctionDeduction: s.sanction_deduction,
    overtimeBonus: s.overtime_bonus,
    earlyArrivalBonus: s.early_arrival_bonus,
    lateDeduction: s.late_deduction,
    earlyDepartureDeduction: s.early_departure_deduction,
    netPayable: s.net_payable,
    workedDays: s.worked_days,
    lateCount: s.late_count,
    earlyDepartureCount: s.early_departure_count,
    earlyArrivalCount: s.early_arrival_count,
    overtimeHours: s.overtime_hours,
  };
}

export async function getAllSnapshots(month?: string): Promise<PayrollSnapshot[]> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  const raw = await apiRequest<ApiSnapshot[]>(`/payroll/snapshots${qs}`);
  return raw.map(mapSnapshot);
}

export async function getUserSnapshot(userId: string, month?: string): Promise<PayrollSnapshot> {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  const raw = await apiRequest<ApiSnapshot>(`/payroll/snapshots/${encodeURIComponent(userId)}${qs}`);
  return mapSnapshot(raw);
}

export async function refreshAllSnapshots(): Promise<number> {
  const res = await apiRequest<{ refreshed: number }>('/payroll/snapshots/refresh-all', { method: 'POST' });
  return res.refreshed;
}
