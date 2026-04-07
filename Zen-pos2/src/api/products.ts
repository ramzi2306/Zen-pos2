import { apiRequest } from './client';
import type { Product, ProductCategory, VariationGroup, VariationOption, SupplementGroup, SupplementOption } from '../data';

interface ApiIngredient {
  id: string;
  name: string;
  amount: number;
  unit: string;
  waste_percent?: number;
}

interface ApiVariationOption {
  id: string;
  name: string;
  price?: number;
  ingredients?: ApiIngredient[];
}

interface ApiVariationGroup {
  id: string;
  name: string;
  options: ApiVariationOption[];
}

interface ApiSupplementOption {
  id: string;
  name: string;
  price_adjustment?: number;
  ingredients?: ApiIngredient[];
}

interface ApiSupplementGroup {
  id: string;
  name: string;
  options: ApiSupplementOption[];
}

interface ApiProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  in_stock: boolean;
  stock_level?: string;
  tags?: string[];
  variations?: ApiVariationGroup[];
  supplements?: ApiSupplementGroup[];
  ingredients?: ApiIngredient[];
}

function mapIngredient(ing: ApiIngredient) {
  return { id: ing.id, name: ing.name, amount: ing.amount, unit: ing.unit, wastePercent: ing.waste_percent };
}

function mapProduct(raw: ApiProduct): Product {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    price: raw.price,
    category: raw.category as Product['category'],
    image: raw.image,
    inStock: raw.in_stock,
    stockLevel: raw.stock_level as Product['stockLevel'],
    tags: raw.tags || [],
    ingredients: (raw.ingredients || []).map(mapIngredient),
    variations: (raw.variations || []).map((vg): VariationGroup => ({
      id: vg.id,
      name: vg.name,
      options: vg.options.map((vo): VariationOption => ({
        id: vo.id,
        name: vo.name,
        price: vo.price,
        ingredients: (vo.ingredients || []).map(mapIngredient),
      })),
    })),
    supplements: (raw.supplements || []).map((sg): SupplementGroup => ({
      id: sg.id,
      name: sg.name,
      options: sg.options.map((so): SupplementOption => ({
        id: so.id,
        name: so.name,
        priceAdjustment: so.price_adjustment,
        ingredients: (so.ingredients || []).map(mapIngredient),
      })),
    })),
  };
}

export async function listProducts(): Promise<Product[]> {
  const raw = await apiRequest<ApiProduct[]>('/products/');
  return raw.map(mapProduct);
}

export async function listProductImages(): Promise<{ id: string; image: string }[]> {
  return apiRequest<{ id: string; image: string }[]>('/products/images');
}

export async function listCategories(): Promise<ProductCategory[]> {
  const raw = await apiRequest<{ id: string; name: string }[]>('/products/categories');
  return raw;
}

export interface ProductPayload {
  name: string;
  description: string;
  price: number;
  category: string;
  image?: string;
  in_stock?: boolean;
  tags?: string[];
  ingredients?: { id: string; name: string; amount: number; unit: string; waste_percent?: number | null }[];
  variations?: {
    id: string;
    name: string;
    options: { id: string; name: string; price?: number; ingredients?: { id: string; name: string; amount: number; unit: string; waste_percent?: number | null }[] }[];
  }[];
  supplements?: {
    id: string;
    name: string;
    options: { id: string; name: string; price_adjustment?: number; ingredients?: { id: string; name: string; amount: number; unit: string; waste_percent?: number | null }[] }[];
  }[];
}

export async function createProduct(payload: ProductPayload): Promise<Product> {
  const raw = await apiRequest<ApiProduct>('/products/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return mapProduct(raw);
}

export async function updateProduct(id: string, payload: Partial<ProductPayload>): Promise<Product> {
  const raw = await apiRequest<ApiProduct>(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return mapProduct(raw);
}

export async function deleteProduct(id: string): Promise<void> {
  await apiRequest(`/products/${id}`, { method: 'DELETE' });
}

export async function createCategory(name: string): Promise<ProductCategory> {
  return apiRequest<ProductCategory>('/products/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await apiRequest(`/products/categories/${id}`, { method: 'DELETE' });
}
