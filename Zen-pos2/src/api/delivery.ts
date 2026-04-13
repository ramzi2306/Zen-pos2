import { apiRequest } from './client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeliveryPlace {
  id: string;
  name: string;
  wilaya: string;
  delivery_fee: number;
  is_active: boolean;
}

export interface DeliveryAgent {
  id: string;
  name: string;
  phone: string;
  vehicle_type: string;
  is_active: boolean;
}

// ── Delivery Places ──────────────────────────────────────────────────────────

export async function listPlaces(): Promise<DeliveryPlace[]> {
  return apiRequest('/delivery/places');
}

export async function listActivePlaces(): Promise<DeliveryPlace[]> {
  return apiRequest('/delivery/places/active');
}

export async function createPlace(data: Omit<DeliveryPlace, 'id'>): Promise<DeliveryPlace> {
  return apiRequest('/delivery/places', { method: 'POST', body: JSON.stringify(data) });
}

export async function updatePlace(id: string, data: Partial<DeliveryPlace>): Promise<DeliveryPlace> {
  return apiRequest(`/delivery/places/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deletePlace(id: string): Promise<void> {
  await apiRequest(`/delivery/places/${id}`, { method: 'DELETE' });
}

// ── Delivery Agents ──────────────────────────────────────────────────────────

export async function listAgents(): Promise<DeliveryAgent[]> {
  return apiRequest('/delivery/agents');
}

export async function createAgent(data: Omit<DeliveryAgent, 'id'>): Promise<DeliveryAgent> {
  return apiRequest('/delivery/agents', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateAgent(id: string, data: Partial<DeliveryAgent>): Promise<DeliveryAgent> {
  return apiRequest(`/delivery/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteAgent(id: string): Promise<void> {
  await apiRequest(`/delivery/agents/${id}`, { method: 'DELETE' });
}

// ── Assign agent to order ────────────────────────────────────────────────────

export async function assignAgentToOrder(orderId: string, agentId: string): Promise<{ ok: boolean }> {
  return apiRequest(`/delivery/orders/${orderId}/assign-agent`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId }),
  });
}
