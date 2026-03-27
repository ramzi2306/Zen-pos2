import { apiRequest } from './client';

export interface Location {
  id: string;
  name: string;
  subtitle: string;
  address: string;
  phone: string;
  email: string;
  tablesCount: number;
  barCount: number;
  isActive: boolean;
}

interface ApiLocation {
  id: string;
  name: string;
  subtitle: string;
  address: string;
  phone: string;
  email: string;
  tables_count: number;
  bar_count: number;
  is_active: boolean;
}

function mapLocation(raw: ApiLocation): Location {
  return {
    id: raw.id,
    name: raw.name,
    subtitle: raw.subtitle ?? '',
    address: raw.address,
    phone: raw.phone,
    email: raw.email,
    tablesCount: raw.tables_count,
    barCount: raw.bar_count,
    isActive: raw.is_active,
  };
}

export async function listLocations(): Promise<Location[]> {
  const raw = await apiRequest<ApiLocation[]>('/locations/');
  return raw.map(mapLocation);
}

export async function createLocation(payload: Omit<Location, 'id' | 'isActive'>): Promise<Location> {
  const raw = await apiRequest<ApiLocation>('/locations/', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      subtitle: payload.subtitle,
      address: payload.address,
      phone: payload.phone,
      email: payload.email,
      tables_count: payload.tablesCount,
      bar_count: payload.barCount,
    }),
  });
  return mapLocation(raw);
}

export async function updateLocation(id: string, payload: Partial<Omit<Location, 'id' | 'isActive'>>): Promise<Location> {
  const raw = await apiRequest<ApiLocation>(`/locations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.subtitle !== undefined && { subtitle: payload.subtitle }),
      ...(payload.address !== undefined && { address: payload.address }),
      ...(payload.phone !== undefined && { phone: payload.phone }),
      ...(payload.email !== undefined && { email: payload.email }),
      ...(payload.tablesCount !== undefined && { tables_count: payload.tablesCount }),
      ...(payload.barCount !== undefined && { bar_count: payload.barCount }),
    }),
  });
  return mapLocation(raw);
}

export async function deleteLocation(id: string): Promise<void> {
  await apiRequest<void>(`/locations/${id}`, { method: 'DELETE' });
}
