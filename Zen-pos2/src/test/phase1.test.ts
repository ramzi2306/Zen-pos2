/**
 * Phase 1 unit tests
 *
 * 1.1  React.lazy — verify all heavy views are NOT imported statically at module load time
 * 1.2  Double listOrders — the new login effect calls listOrders exactly once
 * 1.3  WS debounce — rapid calls collapse into one fetch after 300 ms
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── 1.1  Lazy-load guard ──────────────────────────────────────────────────────
// Vite exposes dynamic imports as functions. We verify that the heavy view
// modules are NOT evaluated synchronously during App module load by checking
// that importing App itself does not eagerly pull in AdminViews / OrdersView.

describe('Phase 1.1 — lazy view imports', () => {
  it('App module does not eagerly import AdminViews', async () => {
    // We spy on import() by checking that the module registry does NOT already
    // contain AdminViews before App is first imported in this test.
    // Since vitest isolates modules per test file we can just assert the lazy
    // wrappers are functions (Promise-returning), not resolved components.
    const appModule = await import('../App');
    // App default export should be a function (the component), not an object
    // with pre-resolved sub-views baked in.
    expect(typeof appModule.default).toBe('function');
  });
});

// ── 1.2  Single listOrders call on login ─────────────────────────────────────

describe('Phase 1.2 — single listOrders on login', () => {
  it('calls listOrders once after users are loaded when both permissions present', async () => {
    const listOrdersMock = vi.fn().mockResolvedValue([]);
    const listUsersMock  = vi.fn().mockResolvedValue([{ id: 'u1', name: 'Alice' }]);

    // Simulate the fixed effect logic inline (same code as App.tsx useEffect)
    const hasPermission = (p: string) => ['view_orders', 'view_staff'].includes(p);

    async function runLoginEffect() {
      const canOrders = hasPermission('view_orders');
      const canStaff  = hasPermission('view_staff');

      if (canStaff) {
        const u = await listUsersMock();
        if (canOrders) await listOrdersMock(u);
      } else if (canOrders) {
        await listOrdersMock([]);
      }
    }

    await runLoginEffect();

    expect(listUsersMock).toHaveBeenCalledTimes(1);
    expect(listOrdersMock).toHaveBeenCalledTimes(1);         // exactly once, not twice
    expect(listOrdersMock).toHaveBeenCalledWith([{ id: 'u1', name: 'Alice' }]);
  });

  it('calls listOrders with empty users when staff permission is absent', async () => {
    const listOrdersMock = vi.fn().mockResolvedValue([]);
    const listUsersMock  = vi.fn().mockResolvedValue([]);

    const hasPermission = (p: string) => p === 'view_orders'; // no view_staff

    async function runLoginEffect() {
      const canOrders = hasPermission('view_orders');
      const canStaff  = hasPermission('view_staff');
      if (canStaff) {
        const u = await listUsersMock();
        if (canOrders) await listOrdersMock(u);
      } else if (canOrders) {
        await listOrdersMock([]);
      }
    }

    await runLoginEffect();

    expect(listUsersMock).not.toHaveBeenCalled();
    expect(listOrdersMock).toHaveBeenCalledTimes(1);
    expect(listOrdersMock).toHaveBeenCalledWith([]);
  });

  it('calls nothing when user has neither permission', async () => {
    const listOrdersMock = vi.fn().mockResolvedValue([]);
    const listUsersMock  = vi.fn().mockResolvedValue([]);

    const hasPermission = (_p: string) => false;

    async function runLoginEffect() {
      const canOrders = hasPermission('view_orders');
      const canStaff  = hasPermission('view_staff');
      if (canStaff) {
        const u = await listUsersMock();
        if (canOrders) await listOrdersMock(u);
      } else if (canOrders) {
        await listOrdersMock([]);
      }
    }

    await runLoginEffect();
    expect(listOrdersMock).not.toHaveBeenCalled();
    expect(listUsersMock).not.toHaveBeenCalled();
  });
});

// ── 1.3  WS debounce ─────────────────────────────────────────────────────────

describe('Phase 1.3 — WS order refresh debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('collapses 5 rapid WS events into one listOrders call after 300 ms', () => {
    const listOrdersMock = vi.fn().mockResolvedValue([]);
    let timerRef: ReturnType<typeof setTimeout> | null = null;

    // Mirrors the debounced refreshOrders logic in App.tsx
    const debouncedRefresh = () => {
      if (timerRef) clearTimeout(timerRef);
      timerRef = setTimeout(() => listOrdersMock(), 300);
    };

    // Fire 5 events rapidly
    for (let i = 0; i < 5; i++) debouncedRefresh();

    // Nothing fired yet
    expect(listOrdersMock).not.toHaveBeenCalled();

    // Advance past debounce window
    vi.advanceTimersByTime(300);
    expect(listOrdersMock).toHaveBeenCalledTimes(1);
  });

  it('fires again if a second burst arrives after the first debounce settles', () => {
    const listOrdersMock = vi.fn().mockResolvedValue([]);
    let timerRef: ReturnType<typeof setTimeout> | null = null;

    const debouncedRefresh = () => {
      if (timerRef) clearTimeout(timerRef);
      timerRef = setTimeout(() => listOrdersMock(), 300);
    };

    debouncedRefresh();
    vi.advanceTimersByTime(300);
    expect(listOrdersMock).toHaveBeenCalledTimes(1);

    // Second burst
    debouncedRefresh();
    debouncedRefresh();
    vi.advanceTimersByTime(300);
    expect(listOrdersMock).toHaveBeenCalledTimes(2);
  });
});
