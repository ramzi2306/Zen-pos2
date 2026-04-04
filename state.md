# ZEN-POS — Application State Audit
> Generated: 2026-04-04 | Auditor: Claude (deep-read of full codebase)

---

## 1. Project Overview

ZEN-POS is a restaurant Point-of-Sale system built for an omakase or full-service restaurant context. It has two runtimes:

| Layer | Stack | Entry |
|-------|-------|-------|
| Frontend | React 19 + TypeScript + Vite + Tailwind | `Zen-pos2/src/` |
| Backend | FastAPI + Beanie ORM + MongoDB | `zen-pos-api/app/` |

The backend serves the built frontend as a single binary (SPA fallback at `/`). In production they run as one process; in development they run on separate ports.

**Auth model:** JWT access token (15 min) + refresh token (stored in MongoDB, rotated on each use). Tokens live in `localStorage`.

---

## 2. Feature Map

### ✅ FULLY IMPLEMENTED (front-to-back, real data)

| Feature | Frontend | Backend | Notes |
|---------|----------|---------|-------|
| **Authentication** | `api/auth.ts` → `/auth/login`, `/me`, `/logout`, `/refresh` | `routers/auth.py` + `services/auth_service.py` | Token rotation, 5 s timeout on session restore |
| **Product catalog** | `MenuView.tsx`, `api/products.ts` | `routers/products.py`, `models/product.py` | Categories, variations, stock level |
| **Order creation (staff)** | `CartSidebar.tsx` → POST `/orders/` | `services/order_service.py` | Duplicate detection (60 s window), customer auto-upsert |
| **Order lifecycle** | `OrdersView.tsx` status buttons | `routers/orders.py` | Queued → Preparing → Served → Packaging → Out for delivery → Done |
| **Cook assignment** | `OrdersView.tsx` cook picker | `POST /orders/{id}/assign-cook` | Links cook + assistants to order |
| **Auto-transition** | `OrdersView.tsx` `useEffect` (timer) | — (frontend only) | Out for delivery → Done after 45 min |
| **Online storefront** | `PublicMenuPage.tsx`, `PublicCartContext` | `routers/public.py` | OTP-gated history, order tracking by token |
| **Order verification** | OrdersView "Verification" tab | `POST /orders/{id}/verify` | Online orders require cashier approval |
| **WebSocket notifications** | `api/websocket.ts`, `App.tsx` | `routers/ws.py` | new_order, status_update, urgent, order_done events |
| **Attendance check-in/out** | `AttendanceView.tsx` | `routers/attendance.py`, `services/attendance_service.py` | PIN verification, late/early/overtime flags |
| **Force checkout** | `App.tsx handleCloseRegister` | `POST /attendance/force-checkout/{id}` | No PIN required, management-initiated |
| **Users CRUD** | `AdminViews.tsx` DossierModal | `routers/users.py` | Role assignment, contract fields, personal documents |
| **Roles CRUD** | `AdminViews.tsx` role panel | `routers/roles.py` | System role protection (is_system flag) |
| **System roles seed** | — | `seeders.py` | Super Admin + Attendance Manager auto-created on startup |
| **Payroll** | `AdminViews.tsx` HR tab | `routers/payroll.py`, `services/payroll_service.py` | Computed from attendance + performance logs + withdrawals |
| **Customers** | `AdminViews.tsx` CustomersView | `routers/customers.py` | Auto-upserted on order; manual delete |
| **Inventory** | `AdminViews.tsx` InventoryView | `routers/ingredients.py` | Ingredients, purchase logs, usage logs |
| **Analytics** | `AdminViews.tsx` SalesView | `routers/analytics.py` | Bestsellers, kitchen leaderboard, revenue summary |
| **Settings** | `AdminViews.tsx` settings panels | `routers/settings.py` | Branding, localization, integration config |
| **Multi-location** | ProfilePanel location picker | `routers/locations.py` | Orders and users scoped by location_id |
| **Branding** | `App.tsx`, `TopBar` | `GET /settings/branding` | CSS variables, logo, restaurant name, cached in localStorage |
| **Personal documents** | DossierModal file list | via `PATCH /users/{id}` | URL-based links stored in UserDocument.personal_documents |
| **Receipt printing** | `OrdersView.tsx` handlePrintReceipt | — (client-side) | Same-tab print with @media print injection, optional QR code |
| **Draft orders** | `OrdersView.tsx` Draft tab | Partial — status stored in DB | Edit draft loads items back into cart |

---

### ❌ BROKEN — Frontend calls a backend that does not exist

| Feature | Frontend | Backend | Impact |
|---------|----------|---------|--------|
| **Register Reports** | `api/register.ts` → POST/GET `/register/reports`; `App.tsx handleCloseRegister`; `AdminViews SalesView` | **No router, no model, not registered in main.py** | Every register close silently fails (try/catch swallows the 404). The "Register Reports" table in Sales admin always shows "No register closures logged yet." |

---

### ⚠️ PARTIALLY BROKEN — Feature exists but has logic bugs

| Issue | Location | Description |
|-------|----------|-------------|
| **Cashier attendance gate** | `App.tsx` line 575–590 | The `/attendance` route checks `hasPermission('view_attendance')`. A cashier role does not have this permission. The `hasPermission` fallback only grants `view_attendance` when `roleName.includes('attendance')` — which is false for "cashier". A cashier navigates to `/attendance` and sees `<AccessDenied />` instead of the kiosk. The fix is to also allow any non-`excludeFromAttendance` user. |
| **forceCheckOut uses dynamic imports** | `api/attendance.ts` forceCheckOut | Uses `(await import('./client')).API_BASE` and `.getAccessToken()` instead of the standard `apiRequest()` helper. This is fragile, untested, and likely fails silently if the module path changes. |
| **Session sales counter** | `ProfilePanel.tsx` line 348–351 | `sessionOrders` filters by `sessionOpenedAt` from sessionStorage. After register close, `sessionOpenedAt` is removed. On next check-in, it is reset. The filter works correctly only if `o.createdAt` timestamps are accurate from the backend. If `o.queueStartTime` (frontend-derived) is used and is 0, the order falls through to `createdAt` which is correct — but this dual-source logic is fragile. |
| **Payment method tracking** | `CloseRegisterModal.tsx` line 40 | `cashOrders` = all orders where `paymentStatus === 'Paid'`. There is no `paymentMethod` field on orders (cash vs card). So every paid order is counted as cash. Card row is always 0. The register reconciliation numbers will be wrong when multiple payment types exist. |
| **Print Report button** | `ProfilePanel.tsx` line 208 | The "Print Report" button in CloseRegisterModal has no `onClick` handler. It is dead UI. |

---

### 🔶 MOCK / PLACEHOLDER DATA — UI exists but data is hardcoded

| Feature | Location | What's mocked | What should be real |
|---------|----------|---------------|---------------------|
| **Card payment row** | `CloseRegisterModal.tsx` lines 40–48 | `cardOrders: Order[] = []`, `expectedCard = 0` | Orders paid by card (requires `paymentMethod` field on OrderDocument) |
| **Refunds column** | `CloseRegisterModal.tsx` | `refunds: 0` hardcoded for all payment methods | A refund/void system (none exists) |
| **Pagination footer** | `CloseRegisterModal.tsx` line 175 | `1-1 of 1` static text | Dynamic count of payment rows |
| **Customers localStorage fallback** | `api/customers.ts` | Falls back to localStorage mock orders when API is unavailable | Should fail cleanly or retry |
| **Public order history (offline)** | `PublicMenuPage.tsx` | `localStorage` used as source when API is down | Should surface an error state |
| **SMS/OTP** | `routers/public.py` | OTP is logged (or simulated), not actually sent | Real SMS provider integration |
| **Firebase / CDN config** | `settings.ts` + `AdminViews IntegrationView` | Fields exist and are stored in MongoDB | No code actually reads them for uploads or push notifications |

---

### 🧟 DEAD CODE / ORPHAN CODE

| Item | Location | Status |
|------|----------|--------|
| **`RegisterReport` type import in App.tsx** | `App.tsx` line 13 | Imported but never used as a state type (it's used in the API call but not stored) |
| **`inventory.py` router** | `zen-pos-api/app/routers/inventory.py` | Registered in main.py but content unknown — likely a stub or duplicate of `ingredients.py` |
| **`roles.py` router** | `zen-pos-api/app/routers/roles.py` + `users.py` | Both handle role CRUD. `roles.py` is registered separately but overlaps with `users.py` role endpoints |
| **`changePassword` route** | `schemas/user.py` `ChangePasswordRequest` exists | No `POST /users/{id}/change-password` endpoint in `users.py` router (though `POST /auth/change-password` exists in auth router) |
| **`VirtualKeyboard` component** | `App.tsx` line 604 | Rendered unconditionally inside the main layout but no visible trigger in the codebase — unclear how it activates |
| **`utils/sounds.ts`** | Referenced in `App.tsx` | Not audited — assumed to contain audio playback helpers. Unclear if audio files are actually bundled |

---

### 🔗 MISSING CONNECTIONS — Features that exist but don't talk to each other

| Missing Link | What exists | What's needed |
|-------------|-------------|---------------|
| **Inventory deduction on order** | `IngredientInventoryDocument` tracks stock; `ProductDocument` has `ingredients[]` | When an order is created, ingredient quantities should be decremented. No such logic in `order_service.py`. |
| **Payment method on orders** | `OrderDocument` has `payment_status` (Unpaid/Paid) | No `payment_method` field (Cash/Card/etc.). CloseRegisterModal cannot split by payment type. CartSidebar does ask about payment but doesn't persist method. |
| **Register session isolation** | `sessionOpenedAt` in sessionStorage; orders list from API | Orders from previous sessions are in `orders` state but filtered client-side by timestamp. If the orders list is re-fetched on re-login, old orders appear briefly until `sessionOpenedAt` is set. There is a race window. |
| **Real-time attendance on AttendanceView** | AttendanceView fetches user status on mount | No WebSocket event for attendance check-in/out. If two tablets show the same attendance kiosk, they don't sync. |
| **Order review → analytics** | `POST /orders/{id}/review` saves stars + comment | `GET /analytics/summary` does not aggregate review data. No review dashboard exists. |
| **Withdrawal → payroll display** | `PayrollWithdrawalDocument` records withdrawals | The "payrollDue" field on users is computed but never automatically updated — it appears to be manually managed |

---

## 3. Data Flow Analysis

### Register Open/Close Flow (Current State)

```
User logs in
  └─ excludeFromAttendance?
       ├─ YES → _routeToLanding() → POS as normal
       └─ NO  → navigate('/attendance') + setIsRegisterOpen(false)
                 └─ /attendance route guard: hasPermission('view_attendance')
                       ← BUG: cashier has no view_attendance permission
                       └─ shows <AccessDenied /> instead of kiosk

  [WHEN FIXED] → AttendanceView shown with isLocked=true, no exit button
  User checks in via PIN → attendance_service.check_in() → AttendanceRecord created
  onCurrentUserCheckedIn() fires:
    ├─ sessionStorage.setItem('sessionOpenedAt', Date.now())
    ├─ setIsRegisterOpen(true)
    └─ _routeToLanding() → navigate('/menu')

  [POS in use]
  ProfilePanel shows:
    ├─ totalOrders: session orders count
    └─ totalSales: sum of session order totals (filtered by sessionOpenedAt)

  User clicks Close Register → CloseRegisterModal opens
  Cashier enters counted cash amount
  Clicks "Close Register" → onConfirm fires with { actualSales, expectedSales, difference, notes }

  handleCloseRegister():
    ├─ api.register.submitRegisterReport() → POST /register/reports
    │     ← FAILS: 404, error swallowed by try/catch
    ├─ sessionStorage.removeItem('sessionOpenedAt')
    ├─ api.attendance.forceCheckOut(userId) → POST /attendance/force-checkout/{id}
    │     ← WORKS (if the dynamic import issue doesn't break it)
    ├─ setIsRegisterOpen(false)
    └─ navigate('/attendance') → attendance screen reappears locked
```

### Order Lifecycle (Staff)

```
MenuView → addToCart() [App.tsx state]
  └─ CartSidebar → customer lookup/create, payment, POST /orders/
        └─ order_service.create_order()
              ├─ Duplicate check (60 s, same phone + items)
              ├─ CustomerDocument upsert (auto)
              ├─ OrderDocument insert
              └─ WebSocket broadcast "new_order"
                    └─ App.tsx onEvent → setOrders refresh (debounced 300 ms)

OrdersView:
  Queued → [assign cook] → Preparing → Served → [Packaging for delivery]
  → Out for delivery → [auto 45 min timer] → Done
  Verification (online orders) → [cashier clicks Verify] → Queued
```

### Payroll Computation

```
AttendanceRecordDocument (daily)
  + PerformanceLogDocument (rewards/sanctions)
  + UserDocument (base_salary, shifts)
  → payroll_service.get_payroll_summary()
      ├─ total_days, late_days, early_days, overtime_days
      ├─ deductions (late/early × rate), bonuses (overtime × rate)
      └─ net_payable = base_salary - deductions + bonuses - total_withdrawn
```

---

## 4. My Comprehension of the Project

ZEN-POS is a well-architected, ambitious restaurant management system that goes far beyond a simple POS. It encompasses:

**Core POS loop** — Menu → Cart → Order → Kitchen → Done — is complete and functional. The kitchen workflow (cook assignment, status transitions) is thoughtfully designed. The 45-minute auto-delivery transition is a practical operational shortcut.

**Attendance-as-a-gate** is the most distinctive design choice. Rather than a simple login, the system uses attendance check-in as a register unlock mechanism. Staff cannot access the POS until they physically check in at the kiosk. When they close their shift, they are automatically checked out. This creates a reliable audit trail of who operated the register during which hours. The system supports a dedicated "kiosk tablet" role (Attendance Manager) that runs permanently without access to the POS itself.

**Multi-role architecture** is well thought out. System roles (Super Admin, Attendance Manager) are seeded and protected from deletion. Regular roles have a granular permissions matrix. The `exclude_from_attendance` flag correctly separates management (who don't check in) from staff (who do). The permission fallback system in `App.tsx hasPermission()` is pragmatic — it catches common role names (cashier, chef, manager) without requiring permissions to be explicitly set on every role.

**Online storefront** is a complete secondary channel. It supports public menu browsing, online ordering with tracking tokens, OTP-gated order history, and cashier verification of online orders. This is production-quality and shows the system is designed for a real restaurant, not just as a demo.

**HR and payroll** are surprisingly complete. The system tracks attendance metrics (late arrivals, early departures, overtime), performance logs (rewards/sanctions), and computes net payroll automatically. Withdrawal logs track salary disbursements. This rivals standalone HR software for a small restaurant.

**The register report gap** is the most critical incomplete feature. The entire frontend pipeline for register reports (data type, API layer, close modal, admin display) is fully built and wired up — it just calls a backend endpoint that doesn't exist. This means every register close is a silent no-op from a financial reporting perspective.

**Payment tracking is the structural weak point.** Orders have `payment_status` (Paid/Unpaid) but no `payment_method` (Cash/Card/etc.). The Close Register modal is designed for multi-method reconciliation but can only show Cash (because all paid orders are assumed cash) and always shows Card as zero. Fixing this requires adding a `payment_method` field to the order model and having CartSidebar persist it when creating an order.

---

## 5. Recommendations for Future Development

### Priority 1 — Critical (breaks core workflow)

**1. Implement the Register Reports backend**

Create `zen-pos-api/app/models/register.py`:
```python
class RegisterReportDocument(Document):
    opened_at: int          # epoch ms
    closed_at: int
    cashier_name: str
    expected_sales: float
    actual_sales: float
    difference: float
    notes: Optional[str] = None
    location_id: Optional[str] = None
    class Settings:
        name = "register_reports"
```

Create `zen-pos-api/app/routers/register.py` with `POST /register/reports` and `GET /register/reports?location_id=`.
Register it in `main.py` at prefix `/register`.

**2. Fix the cashier attendance route guard**

In `App.tsx` line 576, change:
```tsx
hasPermission('view_attendance')
```
to:
```tsx
hasPermission('view_attendance') || (!!currentUser && !currentUser.excludeFromAttendance)
```

**3. Fix forceCheckOut in api/attendance.ts**

Replace the dynamic-import pattern with `apiRequest`:
```ts
export async function forceCheckOut(userId: string): Promise<boolean> {
  try {
    await apiRequest(`/attendance/force-checkout/${userId}`, { method: 'POST' });
    return true;
  } catch { return false; }
}
```

### Priority 2 — High (financial accuracy)

**4. Add payment_method to orders**

Add `payment_method: str = "Cash"` to `OrderDocument`. CartSidebar knows which method was used (the payment numpad tracks this). Persist it in the order creation payload. This unlocks correct cash/card split in the Close Register modal.

**5. Wire payment_method into CloseRegisterModal**

Once orders have `paymentMethod`, replace the hardcoded `cardOrders = []` with real filtering. The modal UI is already designed for this.

### Priority 3 — Medium (operational improvements)

**6. Inventory deduction on order creation**

In `order_service.create_order()`, after inserting the order, look up each `OrderItem`'s product ingredients and decrement `IngredientInventoryDocument.current_stock`. Add a usage log entry per ingredient. Guard against going below zero (optional: warn cashier).

**7. Real-time attendance sync**

Emit a WebSocket event on check-in/check-out so multiple kiosk tablets stay in sync without polling. Useful for restaurants with multiple entry points.

**8. Clarify the `sessionOpenedAt` race condition**

There is a brief window between `setIsRegisterOpen(true)` and the user creating their first order where the orders list may contain previous-session orders. Consider storing `sessionOpenedAt` as React state (not just sessionStorage) and passing it down to ProfilePanel to avoid the localStorage/React mismatch.

### Priority 4 — Low (housekeeping)

**9. Add onClick to "Print Report" button** in `CloseRegisterModal` — this should print the register closure report using the same same-tab print pattern used for order receipts.

**10. Audit `inventory.py` router** — it is registered in `main.py` but unclear what it contains vs `ingredients.py`. Likely either a stub or duplicate. Consolidate or delete.

**11. Add `payment_method` to the `OrderDocument`** (mentioned above) and expose it in the analytics endpoint for revenue-by-payment-method reporting.

**12. Remove or connect `VirtualKeyboard`** — if it has a real use case (touch-screen POS tablets), document how to activate it. If not, remove from the render tree.

**13. Protect WebSocket token** — Tokens in URL query strings (`/ws/notifications?token=...`) appear in server access logs. This is standard for WS connections (browsers cannot set Authorization headers on WS). Acceptable trade-off, but consider short-lived WS tokens distinct from access tokens.

**14. Wire SMS provider** — The integration settings UI is built. The OTP flow (`public.py`) is implemented. Only the actual SMS dispatch is missing. Connect to Twilio or any SMS gateway using the credentials already stored in `IntegrationDocument`.

---

## 6. File Quick Reference

| Path | Purpose |
|------|---------|
| `Zen-pos2/src/App.tsx` | Root: auth, cart, orders state, routing, register gate, WS |
| `Zen-pos2/src/data.ts` | All TypeScript type definitions |
| `Zen-pos2/src/api/index.ts` | API module barrel export |
| `Zen-pos2/src/api/register.ts` | Register report API (calls non-existent backend) |
| `Zen-pos2/src/api/attendance.ts` | Attendance API (forceCheckOut has dynamic import bug) |
| `Zen-pos2/src/views/AdminViews.tsx` | All admin panels: Sales, HR, Inventory, Products, Settings |
| `Zen-pos2/src/views/AttendanceView.tsx` | Kiosk screen (check-in/out, locked mode, forever mode) |
| `Zen-pos2/src/views/OrdersView.tsx` | Order board, receipt printing, status transitions |
| `Zen-pos2/src/components/layout/ProfilePanel.tsx` | User panel + CloseRegisterModal |
| `Zen-pos2/src/components/cart/CartSidebar.tsx` | Checkout panel, payment numpad, order creation |
| `Zen-pos2/src/context/LocalizationContext.tsx` | Currency/language/tax formatting |
| `Zen-pos2/src/context/PublicCartContext.tsx` | Public storefront cart state |
| `zen-pos-api/app/main.py` | FastAPI app, router registration, SPA fallback |
| `zen-pos-api/app/models/` | All MongoDB document models |
| `zen-pos-api/app/routers/` | All REST endpoints |
| `zen-pos-api/app/services/` | Business logic (order, attendance, payroll, auth) |
| `zen-pos-api/app/seeders.py` | System role seeder (runs on startup) |
| `zen-pos-api/app/dependencies.py` | Auth middleware (get_current_user, require_permission) |
