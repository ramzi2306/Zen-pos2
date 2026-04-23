import { apiRequest, setTokens, clearTokens } from './client';
import { mapUserDetail, type ApiUserDetail } from './users';
import type { User } from '../data';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  resumable?: boolean;
  register_session?: any;
}

export interface AuthLoginResult {
  user: User;
  resumable: boolean;
  registerSession?: any;
}

export async function login(email: string, password: string): Promise<AuthLoginResult> {
  const data = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setTokens(data.access_token, data.refresh_token);
  const user = await me();
  return {
    user,
    resumable: !!data.resumable,
    registerSession: data.register_session
  };
}

export async function heartbeat(): Promise<void> {
  await apiRequest('/auth/heartbeat', { method: 'POST' });
}

export async function me(): Promise<User> {
  const raw = await apiRequest<ApiUserDetail>('/auth/me');
  return mapUserDetail(raw);
}

export async function logout(): Promise<void> {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } finally {
    clearTokens();
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}
