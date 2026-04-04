import { apiRequest } from './client';

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: 'active' | 'completed';
  hours?: number;
  isLate: boolean;
  isEarlyDeparture: boolean;
  isOvertime: boolean;
}

interface ApiRecord {
  id: string;
  user_id: string;
  user_name: string;
  date: string;
  check_in?: string;
  check_out?: string;
  status: string;
  hours?: number;
  is_late: boolean;
  is_early_departure: boolean;
  is_overtime: boolean;
}

function mapRecord(raw: ApiRecord): AttendanceRecord {
  return {
    id: raw.id,
    userId: raw.user_id,
    userName: raw.user_name,
    date: raw.date,
    checkIn: raw.check_in,
    checkOut: raw.check_out,
    status: raw.status as 'active' | 'completed',
    hours: raw.hours,
    isLate: raw.is_late,
    isEarlyDeparture: raw.is_early_departure,
    isOvertime: raw.is_overtime,
  };
}

export async function checkIn(userId: string, pin: string): Promise<AttendanceRecord> {
  const raw = await apiRequest<ApiRecord>('/attendance/check-in', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, pin }),
  });
  return mapRecord(raw);
}

export async function checkOut(userId: string, pin: string): Promise<AttendanceRecord> {
  const raw = await apiRequest<ApiRecord>('/attendance/check-out', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, pin }),
  });
  return mapRecord(raw);
}

/**
 * Force-checkout a user without their PIN.
 * Called by management when closing the register.
 * Returns true if the user was checked out, false if they weren't checked in (204).
 */
export async function forceCheckOut(userId: string): Promise<boolean> {
  // apiRequest returns {} as T on 204 — check for the id field to distinguish
  const result = await apiRequest<Partial<ApiRecord>>(`/attendance/force-checkout/${userId}`, { method: 'POST' });
  return !!(result as any)?.id;
}

export async function getUserStatus(userId: string): Promise<boolean> {
  const data = await apiRequest<{ checked_in: boolean }>(`/attendance/status/${userId}`);
  return data.checked_in;
}

export async function getTodayRecords(): Promise<AttendanceRecord[]> {
  const raw = await apiRequest<ApiRecord[]>('/attendance/today');
  return raw.map(mapRecord);
}

export interface AttendanceReportEntry extends AttendanceRecord {
  userImage: string;
}

export interface AttendanceReportSummary {
  userId: string;
  userName: string;
  userImage: string;
  totalDays: number;
  totalHours: number;
  lateCount: number;
  earlyDepartureCount: number;
  overtimeCount: number;
  records: AttendanceReportEntry[];
}

export interface AttendanceReport {
  startDate: string;
  endDate: string;
  summaries: AttendanceReportSummary[];
}

export async function getReport(startDate: string, endDate: string, userId?: string): Promise<AttendanceReport> {
  let url = `/attendance/report?start_date=${startDate}&end_date=${endDate}`;
  if (userId) url += `&user_id=${userId}`;
  const raw = await apiRequest<{
    start_date: string;
    end_date: string;
    summaries: {
      user_id: string; user_name: string; user_image: string;
      total_days: number; total_hours: number; late_count: number;
      early_departure_count: number; overtime_count: number;
      records: (ApiRecord & { user_image: string })[];
    }[];
  }>(url);
  return {
    startDate: raw.start_date,
    endDate: raw.end_date,
    summaries: raw.summaries.map(s => ({
      userId: s.user_id,
      userName: s.user_name,
      userImage: s.user_image,
      totalDays: s.total_days,
      totalHours: s.total_hours,
      lateCount: s.late_count,
      earlyDepartureCount: s.early_departure_count,
      overtimeCount: s.overtime_count,
      records: s.records.map(r => ({ ...mapRecord(r), userImage: s.user_image })),
    })),
  };
}
