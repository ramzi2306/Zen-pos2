import { apiRequest } from './client';
import type { Product, ProductCategory, VariationGroup, VariationOption } from '../data';

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
}

interface ApiVariationGroup {
  id: string;
  name: string;
  options: ApiVariationOption[];
}

interface ApiVariationOption {
  id: string;
  name: string;
  price_adjustment: number;
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
    variations: (raw.variations || []).map((vg): VariationGroup => ({
      id: vg.id,
      name: vg.name,
      options: vg.options.map((vo): VariationOption => ({
        id: vo.id,
        name: vo.name,
        priceAdjustment: vo.price_adjustment,
      })),
    })),
  };
}

export async function listProducts(): Promise<Product[]> {
  const raw = await apiRequest<ApiProduct[]>('/products/');
  return raw.map(mapProduct);
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
  variations?: {
    id: string;
    name: string;
    options: { id: string; name: string; price_adjustment: number }[];
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
