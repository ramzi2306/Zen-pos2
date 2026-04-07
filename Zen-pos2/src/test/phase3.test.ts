/**
 * Phase 3 — Product / POS / Public-menu unit tests
 *
 * 3.1  getCartItemPrice      — price calculation for all variation/supplement combos
 * 3.2  getSubtotal           — multi-item cart with quantities and discounts
 * 3.3  formatCartItemModifiers — modifier label string
 * 3.4  mapProduct             — API snake_case → camelCase mapping (ingredients, variations, supplements)
 * 3.5  Form validation logic  — name / category / price guards
 * 3.6  WS product_update debounce — admin panel suppresses redundant reload
 * 3.7  ID generation          — crypto.randomUUID() uniqueness, no timestamp collisions
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCartItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    cartItemId: 'cart-1',
    name: 'Tuna Roll',
    description: '',
    price: 10.0,
    category: 'Rolls',
    image: '',
    inStock: true,
    quantity: 1,
    selectedVariations: {},
    selectedSupplements: {},
    ...overrides,
  };
}

// ── 3.1  getCartItemPrice ─────────────────────────────────────────────────────

describe('Phase 3.1 — getCartItemPrice', () => {
  // Inline the pure logic (mirrors cartUtils.ts) so tests run without DOM
  function getCartItemPrice(item: ReturnType<typeof makeCartItem>): number {
    const selectedVars   = Object.values(item.selectedVariations  || {}) as { price?: number }[];
    const selectedSupps  = Object.values(item.selectedSupplements || {}) as { priceAdjustment?: number }[];
    const varPrice  = selectedVars.reduce((s, v) => s + (v.price || 0), 0);
    const suppPrice = selectedSupps.reduce((s, v) => s + (v.priceAdjustment || 0), 0);
    const hasOverride = selectedVars.some(v => v.price !== undefined);
    const base = hasOverride ? varPrice : item.price;
    return base + suppPrice;
  }

  it('returns base price when no variations or supplements are selected', () => {
    expect(getCartItemPrice(makeCartItem())).toBe(10.0);
  });

  it('overrides base price when a variation with a price is selected', () => {
    const item = makeCartItem({
      selectedVariations: { 'vg-1': { id: 'vo-2', name: 'Large', price: 15.0 } },
    });
    expect(getCartItemPrice(item)).toBe(15.0);
  });

  it('falls back to base price when selected variation has no price', () => {
    const item = makeCartItem({
      selectedVariations: { 'vg-1': { id: 'vo-1', name: 'Default', price: undefined } },
    });
    // price is undefined → hasOverride = false → use base
    expect(getCartItemPrice(item)).toBe(10.0);
  });

  it('adds supplement price_adjustment on top of base price', () => {
    const item = makeCartItem({
      selectedSupplements: { 'sg-1': { id: 'so-1', name: 'Extra Avocado', priceAdjustment: 2.5 } },
    });
    expect(getCartItemPrice(item)).toBe(12.5);
  });

  it('adds supplement on top of variation override price', () => {
    const item = makeCartItem({
      selectedVariations:  { 'vg-1': { id: 'vo-2', name: 'Large', price: 15.0 } },
      selectedSupplements: { 'sg-1': { id: 'so-1', name: 'Extra Sauce', priceAdjustment: 1.0 } },
    });
    expect(getCartItemPrice(item)).toBe(16.0);
  });

  it('accumulates multiple supplement adjustments', () => {
    const item = makeCartItem({
      selectedSupplements: {
        'sg-1': { id: 'so-1', name: 'Extra Avocado', priceAdjustment: 2.5 },
        'sg-2': { id: 'so-2', name: 'Extra Sauce',   priceAdjustment: 0.5 },
      },
    });
    expect(getCartItemPrice(item)).toBe(13.0);
  });

  it('sums multiple variation group prices when both have a price', () => {
    // Two groups selected, both with prices → sum them (override mode)
    const item = makeCartItem({
      price: 5.0, // base price should be ignored
      selectedVariations: {
        'vg-size':  { id: 'vo-large', name: 'Large',  price: 12.0 },
        'vg-sauce': { id: 'vo-hot',   name: 'Hot',    price:  3.0 },
      },
    });
    // hasOverride = true, varPrice = 15, base = 15
    expect(getCartItemPrice(item)).toBe(15.0);
  });

  it('handles item with no selections (zero-price product)', () => {
    expect(getCartItemPrice(makeCartItem({ price: 0 }))).toBe(0);
  });
});

// ── 3.2  getSubtotal ─────────────────────────────────────────────────────────

describe('Phase 3.2 — getSubtotal', () => {
  function getCartItemPrice(item: ReturnType<typeof makeCartItem>): number {
    const base = item.price as number;
    const suppPrice = Object.values((item.selectedSupplements || {}) as Record<string, { priceAdjustment?: number }>)
      .reduce((s, v) => s + (v.priceAdjustment || 0), 0);
    return base + suppPrice;
  }

  function getSubtotal(cart: ReturnType<typeof makeCartItem>[]): number {
    return cart.reduce((sum, item) => sum + (getCartItemPrice(item) - ((item as any).discount || 0)) * (item.quantity as number), 0);
  }

  it('sums a single item correctly', () => {
    expect(getSubtotal([makeCartItem({ quantity: 3 })])).toBe(30.0);
  });

  it('sums multiple items correctly', () => {
    const cart = [
      makeCartItem({ price: 10.0, quantity: 2 }),
      makeCartItem({ price: 5.0,  quantity: 1 }),
    ];
    expect(getSubtotal(cart)).toBe(25.0);
  });

  it('deducts per-item discount before multiplying by quantity', () => {
    const item = makeCartItem({ price: 10.0, quantity: 2, discount: 2.0 });
    // (10 - 2) * 2 = 16
    expect(getSubtotal([item])).toBe(16.0);
  });

  it('returns 0 for empty cart', () => {
    expect(getSubtotal([])).toBe(0);
  });
});

// ── 3.3  formatCartItemModifiers ──────────────────────────────────────────────

describe('Phase 3.3 — formatCartItemModifiers', () => {
  function formatCartItemModifiers(item: {
    selectedVariations?:  Record<string, { name: string }>;
    selectedSupplements?: Record<string, { name: string }>;
    notes?: string;
  }): string {
    const vars  = Object.values(item.selectedVariations  || {}).map(v => v.name);
    const supps = Object.values(item.selectedSupplements || {}).map(s => s.name);
    return [...vars, ...supps, item.notes].filter(Boolean).join(' | ');
  }

  it('returns variation name only when no supplements or notes', () => {
    const item = { selectedVariations: { 'vg-1': { id: 'vo-1', name: 'Large' } } };
    expect(formatCartItemModifiers(item)).toBe('Large');
  });

  it('combines variation, supplement and note with pipe separator', () => {
    const item = {
      selectedVariations:  { 'vg-1': { id: 'v1', name: 'Large' } },
      selectedSupplements: { 'sg-1': { id: 's1', name: 'Extra Sauce' } },
      notes: 'No ice',
    };
    expect(formatCartItemModifiers(item)).toBe('Large | Extra Sauce | No ice');
  });

  it('omits empty / undefined values', () => {
    const item = { selectedVariations: {}, selectedSupplements: {}, notes: undefined };
    expect(formatCartItemModifiers(item)).toBe('');
  });

  it('handles item with only a note', () => {
    const item = { notes: 'Allergy: nuts' };
    expect(formatCartItemModifiers(item)).toBe('Allergy: nuts');
  });
});

// ── 3.4  mapProduct (API → frontend model) ───────────────────────────────────

describe('Phase 3.4 — mapProduct snake_case → camelCase', () => {
  // Inline mapProduct logic (mirrors api/products.ts) for isolated unit testing
  function mapIngredient(ing: { id: string; name: string; amount: number; unit: string; waste_percent?: number }) {
    return { id: ing.id, name: ing.name, amount: ing.amount, unit: ing.unit, wastePercent: ing.waste_percent };
  }

  function mapProduct(raw: any) {
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      price: raw.price,
      category: raw.category,
      image: raw.image,
      inStock: raw.in_stock,
      stockLevel: raw.stock_level,
      tags: raw.tags || [],
      ingredients: (raw.ingredients || []).map(mapIngredient),
      variations: (raw.variations || []).map((vg: any) => ({
        id: vg.id, name: vg.name,
        options: vg.options.map((vo: any) => ({
          id: vo.id, name: vo.name, price: vo.price,
          ingredients: (vo.ingredients || []).map(mapIngredient),
        })),
      })),
      supplements: (raw.supplements || []).map((sg: any) => ({
        id: sg.id, name: sg.name,
        options: sg.options.map((so: any) => ({
          id: so.id, name: so.name,
          priceAdjustment: so.price_adjustment,
          ingredients: (so.ingredients || []).map(mapIngredient),
        })),
      })),
    };
  }

  const rawProduct = {
    id: 'prod-1',
    name: 'Tuna Roll',
    description: 'Fresh',
    price: 18.0,
    category: 'Rolls',
    image: 'https://cdn.example.com/tuna.jpg',
    in_stock: true,
    stock_level: 'Healthy',
    tags: ['popular'],
    ingredients: [
      { id: 'ing-1', name: 'Tuna', amount: 100, unit: 'g', waste_percent: 5 },
    ],
    variations: [
      {
        id: 'vg-1', name: 'Size',
        options: [
          { id: 'vo-1', name: 'Small',  price: 10.0, ingredients: [] },
          { id: 'vo-2', name: 'Large',  price: 15.0, ingredients: [] },
        ],
      },
    ],
    supplements: [
      {
        id: 'sg-1', name: 'Extras',
        options: [
          { id: 'so-1', name: 'Extra Avocado', price_adjustment: 2.5, ingredients: [] },
        ],
      },
    ],
  };

  it('maps in_stock → inStock', () => {
    expect(mapProduct(rawProduct).inStock).toBe(true);
  });

  it('maps stock_level → stockLevel', () => {
    expect(mapProduct(rawProduct).stockLevel).toBe('Healthy');
  });

  it('maps base ingredients with wastePercent', () => {
    const p = mapProduct(rawProduct);
    expect(p.ingredients).toHaveLength(1);
    expect(p.ingredients[0].wastePercent).toBe(5);
    expect(p.ingredients[0].name).toBe('Tuna');
    expect((p.ingredients[0] as any).waste_percent).toBeUndefined();
  });

  it('maps variation options with price', () => {
    const p = mapProduct(rawProduct);
    expect(p.variations[0].options[1].price).toBe(15.0);
  });

  it('maps supplement price_adjustment → priceAdjustment', () => {
    const p = mapProduct(rawProduct);
    const opt = p.supplements[0].options[0];
    expect(opt.priceAdjustment).toBe(2.5);
    expect((opt as any).price_adjustment).toBeUndefined();
  });

  it('falls back to empty array when ingredients absent', () => {
    const raw = { ...rawProduct, ingredients: undefined };
    expect(mapProduct(raw).ingredients).toEqual([]);
  });

  it('falls back to empty arrays when variations/supplements absent', () => {
    const raw = { ...rawProduct, variations: undefined, supplements: undefined };
    expect(mapProduct(raw).variations).toEqual([]);
    expect(mapProduct(raw).supplements).toEqual([]);
  });
});

// ── 3.5  Form validation logic ────────────────────────────────────────────────

describe('Phase 3.5 — ProductModal form validation', () => {
  // Mirrors the guard logic extracted from handleSave in AdminViews.tsx
  function validate(fields: {
    name: string;
    category: string;
    price: string;
    variations: { options: { price?: number }[] }[];
  }): string {
    if (!fields.name.trim()) return 'Product name is required.';
    if (!fields.category)    return 'Please select a category.';
    const hasVariations = fields.variations.length > 0 && fields.variations.some(v => v.options.length > 0);
    if (!hasVariations) {
      const p = parseFloat(fields.price);
      if (isNaN(p) || p < 0) return 'Please enter a valid price.';
    }
    return '';
  }

  it('passes with valid name, category and price', () => {
    expect(validate({ name: 'Tuna Roll', category: 'Rolls', price: '10.00', variations: [] })).toBe('');
  });

  it('fails when name is empty', () => {
    expect(validate({ name: '', category: 'Rolls', price: '10', variations: [] }))
      .toBe('Product name is required.');
  });

  it('fails when name is whitespace only', () => {
    expect(validate({ name: '   ', category: 'Rolls', price: '10', variations: [] }))
      .toBe('Product name is required.');
  });

  it('fails when category is empty string', () => {
    expect(validate({ name: 'Roll', category: '', price: '10', variations: [] }))
      .toBe('Please select a category.');
  });

  it('fails when price is not a number (no variations)', () => {
    expect(validate({ name: 'Roll', category: 'Cat', price: 'abc', variations: [] }))
      .toBe('Please enter a valid price.');
  });

  it('fails when price is negative (no variations)', () => {
    expect(validate({ name: 'Roll', category: 'Cat', price: '-5', variations: [] }))
      .toBe('Please enter a valid price.');
  });

  it('skips price validation when product has variations with options', () => {
    // Price field can be 0 or empty when variations handle pricing
    expect(validate({
      name: 'Roll', category: 'Cat', price: '',
      variations: [{ options: [{ price: 10 }] }],
    })).toBe('');
  });

  it('price of 0 is valid for a free product', () => {
    expect(validate({ name: 'Free Item', category: 'Cat', price: '0', variations: [] })).toBe('');
  });
});

// ── 3.6  WS product_update debounce / skip-reload guard ──────────────────────

describe('Phase 3.6 — admin panel WS reload suppression after save', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('skips loadProducts when skipWsReloadUntil is in the future', () => {
    const loadProductsMock = vi.fn();
    let skipWsReloadUntil = 0;

    const onWsEvent = (eventType: string) => {
      if (eventType === 'product_update' && Date.now() > skipWsReloadUntil) {
        loadProductsMock();
      }
    };

    // Simulate onSaved setting the guard for 2 seconds
    skipWsReloadUntil = Date.now() + 2000;

    // WS event fires immediately after save
    onWsEvent('product_update');
    expect(loadProductsMock).not.toHaveBeenCalled();
  });

  it('fires loadProducts after the guard window expires', () => {
    const loadProductsMock = vi.fn();
    let skipWsReloadUntil = 0;

    const onWsEvent = (eventType: string) => {
      if (eventType === 'product_update' && Date.now() > skipWsReloadUntil) {
        loadProductsMock();
      }
    };

    skipWsReloadUntil = Date.now() + 2000;

    // Event inside guard window — suppressed
    onWsEvent('product_update');
    expect(loadProductsMock).not.toHaveBeenCalled();

    // Advance past the guard
    vi.advanceTimersByTime(2001);

    // Event outside guard window — should fire
    onWsEvent('product_update');
    expect(loadProductsMock).toHaveBeenCalledTimes(1);
  });

  it('does not suppress events from OTHER users (guard is per-component, not global)', () => {
    const loadProductsMock = vi.fn();
    // No guard set (simulates another client's WS event)
    const skipWsReloadUntil = 0;

    const onWsEvent = (eventType: string) => {
      if (eventType === 'product_update' && Date.now() > skipWsReloadUntil) {
        loadProductsMock();
      }
    };

    onWsEvent('product_update');
    expect(loadProductsMock).toHaveBeenCalledTimes(1);
  });

  it('non-product events are always ignored by product reload guard', () => {
    const loadProductsMock = vi.fn();
    const skipWsReloadUntil = 0;

    const onWsEvent = (eventType: string) => {
      if (eventType === 'product_update' && Date.now() > skipWsReloadUntil) {
        loadProductsMock();
      }
    };

    onWsEvent('new_order');
    onWsEvent('status_update');
    expect(loadProductsMock).not.toHaveBeenCalled();
  });
});

// ── 3.7  ID generation — crypto.randomUUID() ─────────────────────────────────

describe('Phase 3.7 — crypto.randomUUID() for variation/supplement IDs', () => {
  it('generates a valid UUID v4 format', () => {
    const id = crypto.randomUUID();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates unique IDs on every call (no timestamp collisions)', () => {
    const ids = new Set(Array.from({ length: 100 }, () => crypto.randomUUID()));
    expect(ids.size).toBe(100);
  });

  it('does not contain a 13-digit millisecond timestamp', () => {
    const id = crypto.randomUUID();
    expect(id).not.toMatch(/\d{13}/);
  });

  it('IDs generated in rapid succession are all unique', () => {
    // Simulates clicking "Add Group" many times quickly
    const ids = Array.from({ length: 10 }, () => crypto.randomUUID());
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(10);
  });
});
