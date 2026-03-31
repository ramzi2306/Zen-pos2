import { apiRequest } from './client';
import type { User, Role } from '../data';

interface ApiUserPublic {
  id: string;
  name: string;
  email: string;
  phone: string;
  role_id: string;
  role_name: string;
  permissions: string[];
  image: string;
  base_salary: number;
  attendance_score: number;
  attendance_group: string;
  has_pin: boolean;
  is_active: boolean;
  location_id?: string;
  location_name?: string;
}

export interface ApiUserDetail extends ApiUserPublic {
  attendance_group: string;
  has_pin: boolean;
  shifts: Record<string, string>;
  payroll_due: string;
  rewards: number;
  sanctions: number;
  start_date: string;
  contract_type: string;
  contract_date: string;
  contract_expiration?: string;
  monthly_attendance: {
    day: string;
    hours: number;
    is_late: boolean;
    is_early_departure: boolean;
    is_overtime: boolean;
    check_in?: string;
    check_out?: string;
    reward_note?: string;
    sanction_note?: string;
  }[];
  withdrawal_logs: { id: string; amount: number; date: string; status: string }[];
  personal_documents: { id: string; name: string; type: string; url: string }[];
}

function mapUserPublic(raw: ApiUserPublic): User {
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    roleId: raw.role_id,
    role: raw.role_name,
    permissions: (raw.permissions || []).map(p => p.toLowerCase()),
    image: raw.image,
    baseSalary: raw.base_salary,
    attendanceScore: raw.attendance_score || 0,
    attendanceGroup: raw.attendance_group || '',
    hasPin: raw.has_pin || false,
    payrollDue: '',
    shifts: {},
    monthlyAttendance: [],
    rewards: 0,
    sanctions: 0,
    startDate: '',
    contractType: '',
    contractDate: '',
    withdrawalLogs: [],
    personalDocuments: [],
    locationId: raw.location_id,
    locationName: raw.location_name,
  };
}

export function mapUserDetail(raw: ApiUserDetail): User {
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    roleId: raw.role_id,
    role: raw.role_name,
    permissions: (raw.permissions || []).map(p => p.toLowerCase()),
    image: raw.image,
    baseSalary: raw.base_salary,
    attendanceScore: raw.attendance_score || 0,
    attendanceGroup: raw.attendance_group || '',
    hasPin: raw.has_pin || false,
    payrollDue: raw.payroll_due || '',
    shifts: raw.shifts || {},
    monthlyAttendance: (raw.monthly_attendance || []).map(a => ({
      day: a.day,
      hours: a.hours,
      isLate: a.is_late,
      isEarlyDeparture: a.is_early_departure,
      isOvertime: a.is_overtime,
      checkIn: a.check_in,
      checkOut: a.check_out,
      rewardNote: a.reward_note,
      sanctionNote: a.sanction_note,
    })),
    rewards: raw.rewards || 0,
    sanctions: raw.sanctions || 0,
    startDate: raw.start_date || '',
    contractType: raw.contract_type || '',
    contractDate: raw.contract_date || '',
    contractExpiration: raw.contract_expiration,
    withdrawalLogs: (raw.withdrawal_logs || []).map(w => ({
      id: w.id,
      amount: w.amount,
      date: w.date,
      status: w.status as 'Completed' | 'Pending',
    })),
    personalDocuments: (raw.personal_documents || []).map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      url: d.url,
    })),
    locationId: raw.location_id,
    locationName: raw.location_name,
  };
}

export async function listUsers(group?: string): Promise<User[]> {
  const url = group ? `/users/?group=${encodeURIComponent(group)}` : '/users/';
  const raw = await apiRequest<ApiUserPublic[]>(url);
  return raw.map(mapUserPublic);
}

export async function updatePin(userId: string, pin: string): Promise<void> {
  await apiRequest<void>(`/users/${userId}/pin`, {
    method: 'PUT',
    body: JSON.stringify({ pin }),
  });
}

export async function getUser(id: string): Promise<User> {
  const raw = await apiRequest<ApiUserDetail>(`/users/${id}`);
  return mapUserDetail(raw);
}

export interface UserCreatePayload {
  name: string;
  email: string;
  password: string;
  pin?: string;
  phone: string;
  role_id: string;
  location_id?: string;
  image?: string;
  base_salary?: number;
  contract_type?: string;
  start_date?: string;
}

export async function createUser(payload: UserCreatePayload): Promise<User> {
  const raw = await apiRequest<ApiUserPublic>('/users/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapUserPublic(raw);
}

export interface UserUpdatePayload {
  name?: string;
  email?: string;
  phone?: string;
  image?: string;
  base_salary?: number;
  contract_type?: string;
  contract_date?: string;
  contract_expiration?: string;
  shifts?: Record<string, string>;
  attendance_group?: string;
  is_active?: boolean;
}

export async function updateUser(id: string, payload: UserUpdatePayload): Promise<void> {
  await apiRequest<unknown>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function listRoles(): Promise<Role[]> {
  const raw = await apiRequest<{ id: string; name: string; permissions: string[]; exclude_from_attendance?: boolean }[]>('/roles/');
  return raw.map(r => ({ 
    id: r.id, 
    name: r.name, 
    permissions: r.permissions as any,
    excludeFromAttendance: r.exclude_from_attendance || false
  }));
}

export async function createRole(name: string): Promise<Role> {
  const raw = await apiRequest<{ id: string; name: string; permissions: string[]; exclude_from_attendance: boolean }>('/roles/', {
    method: 'POST',
    body: JSON.stringify({ name, permissions: [], exclude_from_attendance: false }),
  });
  return { 
    id: raw.id, 
    name: raw.name, 
    permissions: raw.permissions as any,
    excludeFromAttendance: raw.exclude_from_attendance
  };
}

export async function updateRole(id: string, payload: { permissions?: string[]; exclude_from_attendance?: boolean }): Promise<void> {
  await apiRequest(`/roles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteRole(id: string): Promise<void> {
  await apiRequest(`/roles/${id}`, { method: 'DELETE' });
}

export async function deleteUser(id: string): Promise<void> {
  await apiRequest(`/users/${id}`, { method: 'DELETE' });
}
