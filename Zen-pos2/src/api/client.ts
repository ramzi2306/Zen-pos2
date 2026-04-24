/// <reference types="vite/client" />
export const API_BASE = (import.meta as any).env?.PROD ? '' : ((import.meta as any).env?.VITE_API_URL || '');

export function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('access_token', accessToken);
  localStorage.setItem('refresh_token', refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

// Single shared promise — concurrent 401s all wait for the same refresh instead of
// the second caller getting null and triggering a logout.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const refresh = localStorage.getItem('refresh_token');
  
  if (!refresh) {
    clearTokens();
    localStorage.removeItem('zenpos_session_user');
    // Only redirect if not already on login page to avoid infinite reload loops
    if (window.location.pathname !== '/admin') {
      window.location.href = '/admin';
    }
    return null;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });

      if (res.status === 401 || res.status === 403) {
        // Token is genuinely revoked or invalid — must log out
        clearTokens();
        localStorage.removeItem('zenpos_session_user');
        
        // Only redirect if not already on login page to avoid infinite reload loops
        if (window.location.pathname !== '/admin') {
          window.location.href = '/admin';
        }
        return null;
      }

      if (!res.ok) {
        // Server error (5xx) or network hiccup — do NOT log out.
        return null;
      }

      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
      return data.access_token as string;
    } catch (err) {
      console.warn('[API] Refresh failed:', err);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  
  return refreshPromise;
}

/**
 * Returns a valid access token, refreshing it first if it expires within 5 minutes.
 * Used by the WebSocket client so it always connects with a fresh token.
 */
export async function getValidToken(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (typeof payload.exp === 'number' && payload.exp * 1000 - Date.now() < 5 * 60 * 1000) {
      return await refreshAccessToken();
    }
  } catch {
    // Non-decodable token — return as-is and let the server reject if needed
  }
  return token;
}

/** Public (unauthenticated) request — no Authorization header. */
export async function publicRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, options.headers);
    }
  }
  
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    const detail = error.detail;
    const msg = Array.isArray(detail)
      ? detail.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
      : detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, options.headers);
    }
  }

  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    const detail = error.detail;
    const msg = Array.isArray(detail)
      ? detail.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join('; ')
      : detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}
