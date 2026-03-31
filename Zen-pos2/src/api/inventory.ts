import { apiRequest } from './client';

export interface IngredientItem {
  id: string;
  name: string;
  sku: string;
  category: string[];
  unit: string;
  inStock: number;
  capacity: number;
  pricePerUnit: number;
  icon: string;
  stockLevel: string;
  levelPct: number;
  isActive: boolean;
}

export interface PurchaseLog {
  id: string;
  ingredientId: string;
  ingredientName?: string;
  vendor: string;
  quantity: number;
  unit: string;
  totalCost: number;
  date: string;
}

export interface UsageLog {
  id: string;
  ingredientId: string;
  ingredientName?: string;
  quantity: number;
  unit: string;
  reason: string;
  date: string;
}

interface ApiIngredient {
  id: string;
  name: string;
  sku: string;
  category: string[];
  unit: string;
  in_stock: number;
  capacity: number;
  price_per_unit: number;
  icon: string;
  stock_level: string;
  level_pct: number;
  is_active: boolean;
}

interface ApiPurchase {
  id: string;
  ingredient_id: string;
  ingredient_name?: string;
  vendor: string;
  quantity: number;
  unit: string;
  total_cost: number;
  date: string;
}

interface ApiUsage {
  id: string;
  ingredient_id: string;
  ingredient_name?: string;
  quantity: number;
  unit: string;
  reason: string;
  date: string;
}

function mapIngredient(raw: ApiIngredient): IngredientItem {
  return {
    id: raw.id,
    name: raw.name,
    sku: raw.sku,
    category: raw.category,
    unit: raw.unit,
    inStock: raw.in_stock,
    capacity: raw.capacity,
    pricePerUnit: raw.price_per_unit,
    icon: raw.icon,
    stockLevel: raw.stock_level,
    levelPct: raw.level_pct,
    isActive: raw.is_active,
  };
}

export async function listIngredients(): Promise<IngredientItem[]> {
  const raw = await apiRequest<ApiIngredient[]>('/ingredients/');
  return raw.map(mapIngredient);
}

export interface IngredientCreatePayload {
  name: string;
  sku: string;
  category: string[];
  unit: string;
  capacity: number;
  price_per_unit: number;
  icon?: string;
  in_stock?: number;
}

export async function createIngredient(payload: IngredientCreatePayload): Promise<IngredientItem> {
  const raw = await apiRequest<ApiIngredient>('/ingredients/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapIngredient(raw);
}

export async function logPurchase(payload: {
  ingredient_id: string;
  vendor: string;
  quantity: number;
  unit: string;
  total_cost: number;
}): Promise<PurchaseLog> {
  const raw = await apiRequest<ApiPurchase>('/ingredients/purchases/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    id: raw.id,
    ingredientId: raw.ingredient_id,
    vendor: raw.vendor,
    quantity: raw.quantity,
    unit: raw.unit,
    totalCost: raw.total_cost,
    date: raw.date,
  };
}

export async function logUsage(payload: {
  ingredient_id: string;
  quantity: number;
  unit: string;
  reason: string;
}): Promise<UsageLog> {
  const raw = await apiRequest<ApiUsage>('/ingredients/usage/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return {
    id: raw.id,
    ingredientId: raw.ingredient_id,
    quantity: raw.quantity,
    unit: raw.unit,
    reason: raw.reason,
    date: raw.date,
  };
}

export async function listPurchases(): Promise<PurchaseLog[]> {
  const raw = await apiRequest<ApiPurchase[]>('/ingredients/purchases/');
  return raw.map(r => ({
    id: r.id,
    ingredientId: r.ingredient_id,
    ingredientName: r.ingredient_name,
    vendor: r.vendor,
    quantity: r.quantity,
    unit: r.unit,
    totalCost: r.total_cost,
    date: r.date,
  }));
}

export async function updateIngredient(id: string, payload: Partial<IngredientCreatePayload>): Promise<IngredientItem> {
  const raw = await apiRequest<ApiIngredient>(`/ingredients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapIngredient(raw);
}

export async function deleteIngredient(id: string): Promise<void> {
  await apiRequest(`/ingredients/${id}`, { method: 'DELETE' });
}
