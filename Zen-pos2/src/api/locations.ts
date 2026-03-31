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
  openingTime?: string;
  closingTime?: string;
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
  opening_time?: string;
  closing_time?: string;
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
    openingTime: raw.opening_time,
    closingTime: raw.closing_time,
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
      opening_time: payload.openingTime,
      closing_time: payload.closingTime,
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
      ...(payload.openingTime !== undefined && { opening_time: payload.openingTime }),
      ...(payload.closingTime !== undefined && { closing_time: payload.closingTime }),
    }),
  });
  return mapLocation(raw);
}

export async function deleteLocation(id: string): Promise<void> {
  await apiRequest<void>(`/locations/${id}`, { method: 'DELETE' });
}
