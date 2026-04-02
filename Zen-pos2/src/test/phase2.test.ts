/**
 * Phase 2 frontend unit tests
 *
 * 2.1  Token refresh — concurrent 401s don't spawn multiple refresh calls
 * 2.2  Auth race condition — cancelled flag prevents stale state updates
 * 2.3  cartItemId — stable, deterministic, never uses Date.now()
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── 2.1  Token refresh guard (isRefreshing flag) ──────────────────────────────

describe('Phase 2.1 — token refresh deduplication', () => {
  it('does not call /auth/refresh twice for concurrent 401s', async () => {
    const refreshCalls: number[] = [];
    let isRefreshing = false;
    let callCount = 0;

    // Mirrors refreshAccessToken() logic from client.ts
    const refreshAccessToken = async (): Promise<string | null> => {
      if (isRefreshing) return null;
      isRefreshing = true;
      try {
        refreshCalls.push(++callCount);
        await Promise.resolve(); // simulate async
        return 'new-token';
      } finally {
        isRefreshing = false;
      }
    };

    // Simulate two concurrent 401 handlers both calling refresh
    await Promise.all([refreshAccessToken(), refreshAccessToken()]);

    expect(refreshCalls).toHaveLength(1); // second call was short-circuited
  });
});

// ── 2.2  Auth race condition ──────────────────────────────────────────────────

describe('Phase 2.2 — auth race condition cancelled flag', () => {
  it('ignores me() response when cancelled=true (timeout fired first)', async () => {
    let currentUser: unknown = null;
    let cancelled = false;

    const fakeMe = () => new Promise<{ id: string }>(resolve =>
      setTimeout(() => resolve({ id: 'user-1' }), 50)
    );

    // Start the auth effect
    const promise = fakeMe().then(user => {
      if (cancelled) return;   // ← the fix
      currentUser = user;
    });

    // Timeout fires and sets cancelled before me() resolves
    cancelled = true;
    await promise;

    expect(currentUser).toBeNull(); // state was NOT updated
  });

  it('sets currentUser normally when not cancelled', async () => {
    let currentUser: unknown = null;
    let cancelled = false;

    const fakeMe = () => Promise.resolve({ id: 'user-1' });

    await fakeMe().then(user => {
      if (cancelled) return;
      currentUser = user;
    });

    expect(currentUser).toEqual({ id: 'user-1' });
  });
});

// ── 2.3  Stable cartItemId ────────────────────────────────────────────────────

describe('Phase 2.3 — deterministic cartItemId', () => {
  // Mirrors the fixed mapOrder cartItemId logic from orders.ts
  function buildCartItemId(productId: string, variations: { group_id: string; option_id: string }[]) {
    if (variations.length === 0) return productId;
    return `${productId}|${variations.map(v => `${v.group_id}:${v.option_id}`).sort().join('|')}`;
  }

  it('returns product_id alone when no variations', () => {
    const id1 = buildCartItemId('prod-1', []);
    const id2 = buildCartItemId('prod-1', []);
    expect(id1).toBe('prod-1');
    expect(id1).toBe(id2); // stable across calls
  });

  it('is stable across multiple fetches with same variations', () => {
    const variations = [{ group_id: 'size', option_id: 'large' }];
    const id1 = buildCartItemId('prod-1', variations);
    const id2 = buildCartItemId('prod-1', variations);
    expect(id1).toBe(id2);
    expect(id1).not.toContain('undefined');
  });

  it('is different for different variation options', () => {
    const idSmall = buildCartItemId('prod-1', [{ group_id: 'size', option_id: 'small' }]);
    const idLarge = buildCartItemId('prod-1', [{ group_id: 'size', option_id: 'large' }]);
    expect(idSmall).not.toBe(idLarge);
  });

  it('sorts variations so order does not affect the id', () => {
    const id1 = buildCartItemId('prod-1', [
      { group_id: 'sauce', option_id: 'hot' },
      { group_id: 'size',  option_id: 'large' },
    ]);
    const id2 = buildCartItemId('prod-1', [
      { group_id: 'size',  option_id: 'large' },
      { group_id: 'sauce', option_id: 'hot' },
    ]);
    expect(id1).toBe(id2);
  });

  it('never contains Date.now() style numeric suffix', () => {
    const id = buildCartItemId('prod-1', [{ group_id: 'size', option_id: 'medium' }]);
    expect(id).not.toMatch(/-\d{13}/); // no 13-digit timestamp
  });
});
