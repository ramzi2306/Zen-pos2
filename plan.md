# ZEN-POS — Delivery Plan

**Project**: Omakase POS System
**Stack**: React 18 + TypeScript (Vite) · FastAPI · MongoDB (Beanie ODM)
**Last Audit**: 2026-03-26

---

## Current Status Overview

| Area | Status |
|---|---|
| Auth (login / logout / refresh) | ✅ Working |
| Menu browsing + Cart | ✅ Working |
| Order creation + status flow | ✅ Working |
| Attendance check-in / check-out | ✅ Working |
| Branding settings (colors, name) | ✅ Working |
| Location CRUD + subtitle | ✅ Working |
| Location switcher (ProfilePanel) | ✅ Working |
| Staff CRUD | ✅ Working |
| Inventory ingredients list | ✅ Working |
| Payroll withdrawals | ❌ No persistence — UI only |
| Performance logs (rewards/sanctions) | ❌ Not implemented |
| Role management CRUD | ❌ Read-only — no create/edit/delete UI |
| Customer tracking | ❌ No `/customers/` backend router |
| Ingredient stock auto-decrement | ❌ Never decrements on order fulfillment |
| Notifications | ❌ Hardcoded mock data |
| Localization section | ❌ Sidebar item — no implementation |
| Integration section | ❌ Sidebar item — no implementation |
| `api/payroll.ts` client module | ❌ Does not exist |
| Order category mapping | ⚠️ Hardcoded to "Nigiri" |
| User auth mapping (monthlyAttendance, hasPin, etc.) | ⚠️ Always empty/false from `/auth/me` |
| CloseRegister modal | ⚠️ Hardcoded cashier/location/date |
| Daily Specials banner | ⚠️ Hardcoded, "View List" does nothing |

---

## Phase 1 — Data Integrity (Critical, Ship-Blocker)

These are broken flows that would cause data loss or incorrect behavior in production.

---

### 1.1 — Create `api/payroll.ts` frontend client

**File to create**: `Zen-pos2/src/api/payroll.ts`

```typescript
// Functions to implement:
getWithdrawals(userId: string): Promise<WithdrawalLog[]>
processWithdrawal(userId: string, amount: number, comment: string): Promise<WithdrawalLog>
getSummary(userId: string): Promise<PayrollSummary>
getPerformanceLogs(userId?: string): Promise<PerformanceLog[]>
createPerformanceLog(userId: string, type: 'Reward'|'Sanction', amount: number, reason: string): Promise<void>
```

**Backend endpoints** (already exist, just need to be called):
- `GET /payroll/withdrawals/{user_id}`
- `POST /payroll/withdraw`
- `GET /payroll/summary/{user_id}`
- `GET /payroll/performance-logs`
- `POST /payroll/performance-logs`

Export from `api/index.ts` as `api.payroll.*`

---

### 1.2 — Wire Withdrawal Modal to Backend

**File**: `Zen-pos2/src/views/AdminViews.tsx`
**Problem**: `handleProcess()` in `WithdrawalModal` does `user.withdrawalLogs.unshift(newLog)` — in-memory only.

**Fix**:
1. Replace local state mutation with `await api.payroll.processWithdrawal(user.id, amount, comment)`
2. On mount, load withdrawal history: `api.payroll.getWithdrawals(user.id)`
3. After processing, refresh withdrawal list from API
4. The printed receipt should use data returned from the API (real ID, real date)

---

### 1.3 — Fix `/auth/me` User Mapping

**File**: `Zen-pos2/src/api/auth.ts` — `mapToUser()` function
**Problem**: Fields like `monthlyAttendance`, `hasPin`, `rewards`, `sanctions`, `withdrawalLogs`, `personalDocuments`, `payrollDue` are hardcoded as empty/zero/false.

**Fix**: The backend `/auth/me` response already returns all these fields. Update `mapToUser()` to map them fully — same logic as `api/users.ts` `getUser()` does. Consider extracting a single `mapApiUserToUser()` helper used by both auth and users modules.

---

### 1.4 — Fix Order Item Category Mapping

**File**: `Zen-pos2/src/api/orders.ts`
**Problem**: Line ~72 has `category: 'Nigiri' as any` — every product in every order shows as "Nigiri".

**Fix**: The backend `OrderItem` includes `product_id`. When mapping orders, either:
- (A) Enrich by calling `GET /products/` once and joining by `product_id`
- (B) Have the backend return `category` on the `OrderItem` (simpler — add `category: str` to `OrderItemOut` schema and populate from the product at order-creation time in `order_service.py`)

Option B is cleaner. Add `category` to backend `OrderItemDocument` and set it when creating the order.

---

### 1.5 — Create `/customers/` Backend Router + Frontend Client

**Problem**: The `customers` section in the admin panel has no backend. Customer names are stored in orders but never in a customer collection.

**Backend files to create**:
- `zen-pos-api/app/models/customer.py` — `CustomerDocument`: `name, phone, email, notes, location_id, created_at`
- `zen-pos-api/app/schemas/customer.py` — `CustomerCreate`, `CustomerUpdate`, `CustomerOut`
- `zen-pos-api/app/routers/customers.py` — CRUD: `GET /customers/`, `POST /customers/`, `PUT /{id}`, `DELETE /{id}`
- Register router in `main.py`

**Frontend file to create**: `Zen-pos2/src/api/customers.ts`
**Wire up**: When an order is created with a customer name, auto-create or upsert the customer record.

---

## Phase 2 — Missing Features (Core Functionality)

---

### 2.1 — Performance Logs (Rewards & Sanctions) UI

**File**: `Zen-pos2/src/views/AdminViews.tsx`
**Problem**: The HR section shows `rewards` and `sanctions` totals but:
- They come from the user object (static, never refreshed)
- No UI to add a new reward or sanction
- `PerformanceLog[]` is always empty

**Fix**:
1. On HR view mount, load `api.payroll.getPerformanceLogs(userId)` for selected user
2. Add "Add Reward" / "Add Sanction" button → modal with amount + reason → `api.payroll.createPerformanceLog()`
3. Show list of past logs with date, type (Reward/Sanction), amount, reason
4. Totals update reactively

---

### 2.2 — Role Management CRUD UI

**File**: `Zen-pos2/src/views/AdminViews.tsx` — `roles` section
**Problem**: The roles section loads and displays roles but has no create/edit/delete controls. The backend has full CRUD at `/roles/`.

**Fix**:
1. Add "New Role" button → modal with name + permission checkboxes
2. Edit button on each role card → same modal pre-filled
3. Delete button with confirmation
4. API calls: `api.roles.createRole()`, `api.roles.updateRole()`, `api.roles.deleteRole()`
5. Create `Zen-pos2/src/api/roles.ts` if it doesn't exist

---

### 2.3 — Ingredient Stock Auto-Decrement on Order Fulfillment

**File**: `zen-pos-api/app/services/order_service.py`
**Problem**: When an order is marked as "Done" (or created), ingredient stock levels are never reduced. Manual inventory log entry is the only way.

**Fix** (backend-side):
1. In `order_service.py`, when an order transitions to `done` status, iterate through `order.items`
2. For each `CartItem`, look up the product's `variationGroups` / `ingredients` mapping
3. Call `ingredient.stock_level -= qty_used` and save
4. Create a `UsageLog` record linking to the order

This requires the product→ingredient relationship to be populated on order creation (store `ingredient_id` + `quantity_per_unit` on `OrderItemDocument`).

---

### 2.4 — Fix CloseRegister Modal (Real Session Data)

**File**: `Zen-pos2/src/components/layout/ProfilePanel.tsx` — `CloseRegisterModal`
**Problem**: Hardcoded `POS: Kouba`, `CASHIER: ramzi`, `OPENED: MARCH 21, 2026 AT 3:19 PM`.

**Fix**:
- Pass `currentUser` (name, location) to `CloseRegisterModal`
- Store session open time in `localStorage` when user logs in (`sessionStorage.setItem('sessionOpenedAt', Date.now())`)
- Display real cashier name and computed "open since X hours ago"

---

### 2.5 — Fix `refreshOrders` After Status Mutations

**File**: `Zen-pos2/src/views/OrdersView.tsx`
**Problem**: Status changes update local state directly but never call the backend `refreshOrders()` if another device made changes. Also, after a mutation, the local state may drift from the DB.

**Fix**: After each `api.orders.updateOrder()` call resolves successfully, call `onRefresh()` to re-fetch from the backend. This ensures multi-device consistency.

---

## Phase 3 — Stub Sections (Feature Complete)

These sections appear in the sidebar but have no implementation.

---

### 3.1 — Localization Section

**Sidebar entry**: `id: 'localization'` in `Sidebar.tsx`
**Implementation needed in**: `AdminViews.tsx` → `SettingsView` → `case 'localization'`

Settings to expose:
- Currency (symbol, position, decimal separator)
- Timezone
- Date format
- Language (UI language toggle — French / English)
- Tax rate (%) — currently hardcoded in CartSidebar

**Backend**: Add `LocalizationDocument` to settings collection with these fields.
**Frontend**: New `api/localization.ts`, form in AdminViews.

---

### 3.2 — Integration Section

**Sidebar entry**: `id: 'integration'` in `Sidebar.tsx`

Settings to expose:
- API key management (generate / revoke)
- Webhook URL for order events
- Third-party delivery platform connection (toggle + API key field)

**Backend**: Add `IntegrationDocument` and a simple `/settings/integration` GET/PUT endpoint.
**Frontend**: Display API key with copy button, webhook config form.

---

### 3.3 — Real Notifications

**File**: `Zen-pos2/src/components/layout/TopBar.tsx`
**Problem**: `MOCK_NOTIFICATIONS` is static. Notification count badge always shows "3 Nouveaux".

**Fix options**:
- **Option A (Polling)**: Every 30s fetch `/orders/?status=ready&limit=10` and `/orders/?status=pending_verification` — derive notifications from delta
- **Option B (WebSocket)**: Backend emits order events via WebSocket (`/ws/notifications`) using FastAPI `WebSocket` + asyncio; frontend subscribes on login

Recommend **Option A** to start (simpler, no infrastructure change). Option B for v2.

---

### 3.4 — Daily Specials Banner (MenuView)

**File**: `Zen-pos2/src/views/MenuView.tsx`
**Problem**: Hardcoded "Toyosu Market" copy with non-functional "View List" button.

**Fix**:
- Add `daily_special: str` field to `BrandingDocument` (or create a `DailySpecial` collection)
- Editable from branding settings
- "View List" opens a modal with a text/markdown field the owner fills in each day
- Hide the banner entirely if `daily_special` is empty

---

## Phase 4 — Polish & Cleanup

---

### 4.1 — Clean Up Unused TopBar Props

**File**: `Zen-pos2/src/components/layout/TopBar.tsx`
After removing the location badge/switcher from the TopBar, the props `locations`, `activeLocationId`, `setActiveLocationId` are no longer used in the component. Remove them from the prop type and from the `App.tsx` call site.

---

### 4.2 — VirtualKeyboard: Wire or Remove

**File**: `Zen-pos2/src/components/VirtualKeyboard.tsx`
The component is mounted globally in `App.tsx` but never triggered. Either:
- Wire it to fire on `focus` of relevant inputs (PIN entry, search fields) on touch devices
- Or remove it if the attendance kiosk's built-in numpad covers the use case

---

### 4.3 — `hasPin` Correct Mapping

**File**: `Zen-pos2/src/api/auth.ts`
`hasPin` is always `false` for the currently logged-in user. Map `raw.has_pin` correctly in `mapToUser()`. The backend sets this based on whether `hashed_pin` is non-null on `UserDocument`.

---

### 4.4 — Auto-Link Customer on Order Creation

**File**: `Zen-pos2/src/components/layout/CartSidebar.tsx`
When an order is placed with a customer name, attempt `POST /customers/` (upsert by phone if available). Store the returned `customer_id` on the order. This enables the customer history view in the admin panel to actually show real customers.

---

### 4.5 — Attendance: Multi-Day Report Accuracy

**File**: `Zen-pos2/src/views/AdminViews.tsx` — HR / attendance report section
The payroll summary modal computes late fees and overtime locally with simplified logic (`totalLateHours = lateIncidents.reduce((sum, a) => sum + 0.5, 0)`). This should use the actual check-in times vs. shift start/end from the backend report endpoint which already returns precise hours.

---

## File Creation Checklist

| File | Phase | Action |
|---|---|---|
| `Zen-pos2/src/api/payroll.ts` | 1.1 | Create |
| `zen-pos-api/app/models/customer.py` | 1.5 | Create |
| `zen-pos-api/app/schemas/customer.py` | 1.5 | Create |
| `zen-pos-api/app/routers/customers.py` | 1.5 | Create |
| `Zen-pos2/src/api/customers.ts` | 1.5 | Create |
| `Zen-pos2/src/api/roles.ts` | 2.2 | Create (if missing) |
| `Zen-pos2/src/api/localization.ts` | 3.1 | Create |
| `zen-pos-api/app/models/localization.py` | 3.1 | Create |

---

## File Modification Checklist

| File | Phase | Change |
|---|---|---|
| `Zen-pos2/src/api/auth.ts` | 1.3, 4.3 | Full user mapping from `/auth/me` |
| `Zen-pos2/src/api/orders.ts` | 1.4 | Fix category mapping |
| `Zen-pos2/src/api/index.ts` | 1.1 | Export `payroll`, `customers` |
| `zen-pos-api/app/main.py` | 1.5 | Register customers router |
| `zen-pos-api/app/models/order.py` | 1.4 | Add `category` to `OrderItemDocument` |
| `zen-pos-api/app/schemas/order.py` | 1.4 | Add `category` to `OrderItemOut` |
| `zen-pos-api/app/services/order_service.py` | 1.4, 2.3 | Set category on create; decrement stock on done |
| `Zen-pos2/src/views/AdminViews.tsx` | 1.2, 2.1, 2.2, 3.1, 3.2 | Multiple sections |
| `Zen-pos2/src/components/layout/ProfilePanel.tsx` | 2.4 | Real session data in CloseRegister |
| `Zen-pos2/src/views/OrdersView.tsx` | 2.5 | Call `onRefresh()` after mutations |
| `Zen-pos2/src/components/layout/TopBar.tsx` | 3.3, 4.1 | Real notifications; remove unused props |
| `Zen-pos2/src/views/MenuView.tsx` | 3.4 | Dynamic daily specials |
| `Zen-pos2/src/App.tsx` | 4.1 | Remove unused TopBar props |
| `zen-pos-api/app/models/settings.py` | 3.4 | Add `daily_special` field |

---

## Priority Order (Suggested Execution Sequence)

```
1.3 → Fix auth mapping (unblocks all user-data-dependent features)
1.1 → Create api/payroll.ts
1.2 → Wire withdrawal modal
1.4 → Fix order category
1.5 → Customers backend + frontend
2.1 → Performance logs UI
2.2 → Role management CRUD UI
2.4 → CloseRegister real data
2.5 → refreshOrders after mutations
2.3 → Ingredient stock decrement (most complex)
3.1 → Localization section
3.2 → Integration section
3.4 → Daily specials
3.3 → Notifications (polling)
4.1–4.5 → Polish
```

---

## Out of Scope (v2)

- WebSocket real-time order updates
- Kitchen Display System (KDS) view
- Online ordering integration
- Multi-currency support
- Receipt printer hardware integration
- Mobile app (React Native)
