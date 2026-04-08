# ZEN-POS — Backend Scaffold

Architecture reference for the Python + MongoDB backend powering the ZEN-POS system.

---

## Stack Decisions

| Concern | Choice | Why |
|---|---|---|
| Framework | **FastAPI** | Async-first, auto Swagger UI at `/docs`, Pydantic v2 native, best-in-class Python performance |
| ODM | **Beanie** | Async MongoDB ODM built on Motor — model class is both the DB document and the Pydantic schema |
| Database | **MongoDB** | Flexible document model fits POS data (variable product variations, embedded order items) |
| Auth | **JWT — access + refresh** | Stateless, scalable; access token (15 min) + refresh token (7 days, stored in DB for revocation) |
| Password hashing | **bcrypt (passlib)** | Industry standard; used for both login passwords and kiosk PINs |
| Config | **pydantic-settings** | Typed `.env` → settings class, no string key lookups |
| Dev infra | **Docker Compose** | One command to start MongoDB + API |
| Testing | **pytest + httpx** | Async test client, ASGI transport (no real HTTP needed) |

---

## Project Layout

```
zen-pos-api/
├── app/
│   ├── main.py                  ← FastAPI app + lifespan (DB connect/disconnect)
│   ├── config.py                ← All env vars as typed Settings class
│   ├── database.py              ← Motor + Beanie initialization
│   ├── dependencies.py          ← get_current_user(), require_permission() deps
│   │
│   ├── models/                  ← Beanie Documents = MongoDB collections
│   │   ├── user.py              → collections: users, roles
│   │   ├── product.py           → collections: products, categories
│   │   ├── order.py             → collection: orders
│   │   ├── attendance.py        → collection: attendance_records
│   │   ├── payroll.py           → collections: payroll_withdrawals, performance_logs
│   │   └── token.py             → collection: refresh_tokens
│   │
│   ├── schemas/                 ← Pydantic request/response shapes (not DB docs)
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── product.py
│   │   ├── order.py
│   │   ├── attendance.py
│   │   └── payroll.py
│   │
│   ├── routers/                 ← One APIRouter file per resource
│   │   ├── auth.py
│   │   ├── products.py
│   │   ├── orders.py
│   │   ├── attendance.py
│   │   ├── payroll.py
│   │   ├── users.py
│   │   ├── roles.py
│   │   └── inventory.py
│   │
│   ├── services/                ← Business logic — routers call services, not DB directly
│   │   ├── auth_service.py
│   │   ├── order_service.py
│   │   ├── payroll_service.py
│   │   └── attendance_service.py
│   │
│   └── core/
│       ├── security.py          ← bcrypt + JWT helpers
│       ├── exceptions.py        ← Typed HTTP exceptions (NotFound, Forbidden, etc.)
│       └── middleware.py        ← Request logging middleware
│
├── scripts/
│   └── seed.py                  ← Seeds all mock data into MongoDB
│
├── tests/
│   ├── conftest.py              ← Test DB fixture, async client, admin token fixture
│   ├── test_auth.py
│   ├── test_orders.py
│   └── test_attendance.py
│
├── .env.example                 ← Copy to .env and fill in values
├── requirements.txt
├── pyproject.toml               ← Project metadata + ruff lint config
├── docker-compose.yml
└── Dockerfile
```

---

## MongoDB Collections

| Collection | Description | Key Indexes |
|---|---|---|
| `roles` | User roles with permission arrays | `name` (unique) |
| `users` | Staff accounts | `email` (unique) |
| `categories` | Product categories | `name` (unique) |
| `products` | Menu items with variations | `category`, `is_active` |
| `orders` | All orders (all statuses) | `status`, `order_number` (unique), `created_at` |
| `attendance_records` | Per-shift check-in/out | `user + date` compound |
| `payroll_withdrawals` | Salary disbursement records | `user + date` |
| `performance_logs` | Rewards and sanctions | `user`, `type` |
| `refresh_tokens` | JWT refresh tokens | TTL index on `expires_at` (auto-deleted) |
| `locations` | Venue records | `name` (unique), `is_active` |

---

## Auth Flow

```
1. POST /auth/login  { email, password }
      ↓ bcrypt verify
      ↓ issue access_token (JWT, 15 min) + refresh_token (JWT, 7 days, stored in refresh_tokens)
      → { access_token, refresh_token }

2. All protected requests:
      Authorization: Bearer <access_token>
      → FastAPI dependency decodes JWT → loads UserDocument → checks permissions

3. POST /auth/refresh  { refresh_token }
      ↓ verify token in DB (not revoked, not expired)
      ↓ revoke old refresh token
      ↓ issue new access_token + new refresh_token (rotation)
      → { access_token }

4. POST /auth/logout  { refresh_token }
      ↓ mark refresh_token as revoked in DB
```

### Permission Guard

```python
# Protects any route by permission name — matches frontend Permission type
@router.get("/users", dependencies=[Depends(require_permission("view_staff"))])
```

Available permissions (matching frontend):
`view_menu` · `view_orders` · `view_attendance` · `view_staff` · `view_hr` · `view_inventory` · `view_settings` · `manage_roles` · `manage_locations`

---

## API Endpoints

### Auth
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/auth/login` | — | Login, returns tokens |
| GET | `/auth/me` | authenticated | Current user + permissions |
| POST | `/auth/refresh` | — | Rotate refresh token |
| POST | `/auth/logout` | — | Revoke refresh token |

### Products
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/products/` | — | List products (filterable by category, in_stock) |
| GET | `/products/{id}` | — | Get single product |
| POST | `/products/` | view_inventory | Create product |
| PATCH | `/products/{id}` | view_inventory | Update product |
| DELETE | `/products/{id}` | view_inventory | Soft-delete product |
| GET | `/products/categories` | — | List categories |
| POST | `/products/categories` | view_settings | Create category |

### Orders
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/orders/` | view_orders | List orders (filterable by status) |
| GET | `/orders/{id}` | view_orders | Get single order |
| POST | `/orders/` | view_menu | Create order from cart |
| PATCH | `/orders/{id}` | view_orders | Update status / payment / notes |
| POST | `/orders/{id}/assign-cook` | view_orders | Assign cook |
| POST | `/orders/{id}/assign-assistant` | view_orders | Add assistant |
| POST | `/orders/{id}/review` | view_orders | Submit review |
| DELETE | `/orders/{id}` | view_orders | Cancel order |

### Attendance (Kiosk — no token for check-in/out)
| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/attendance/check-in` | PIN only | Record check-in |
| POST | `/attendance/check-out` | PIN only | Record check-out |
| GET | `/attendance/today` | view_attendance | Today's records |
| GET | `/attendance/user/{id}` | view_attendance | User attendance history |

### Payroll & Performance
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/payroll/summary/{user_id}` | view_hr | Salary summary with deductions |
| POST | `/payroll/withdraw` | view_hr | Process payroll withdrawal |
| GET | `/payroll/withdrawals/{user_id}` | view_hr | Withdrawal history |
| GET | `/payroll/performance-logs` | view_hr | All performance logs |
| POST | `/payroll/performance-logs` | view_hr | Create reward/sanction |

### Users & Roles
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/users/` | view_staff | List all active users |
| GET | `/users/{id}` | view_staff | Get user |
| POST | `/users/` | view_staff | Create user |
| PATCH | `/users/{id}` | view_staff | Update user details |
| PUT | `/users/{id}/role` | manage_roles | Change user role |
| DELETE | `/users/{id}` | view_staff | Deactivate user |
| GET | `/roles/` | — | List roles |
| POST | `/roles/` | manage_roles | Create role |
| PATCH | `/roles/{id}` | manage_roles | Update role |
| DELETE | `/roles/{id}` | manage_roles | Delete role |

### Locations
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/locations/` | — | List all active locations |
| POST | `/locations/` | manage_locations | Create a location |
| PUT | `/locations/{id}` | manage_locations | Update a location |
| DELETE | `/locations/{id}` | manage_locations | Soft-delete a location |

### Inventory
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/inventory/` | view_inventory | All products with stock info |
| GET | `/inventory/low-stock` | view_inventory | Low/Critical stock items |
| PATCH | `/inventory/{id}` | view_inventory | Update stock level |

---

## Multi-Location Architecture

ZEN-POS supports multiple physical venues (locations). Data is automatically scoped per location for all staff, with admins/owners able to see across all locations.

### MongoDB Collection

| Collection | Key Fields |
|---|---|
| `locations` | `name`, `address`, `phone`, `email`, `tables_count`, `bar_count`, `is_active` |

### Location Scoping Rules

| User Type | How data is scoped |
|---|---|
| Staff with `location_id` set | Backend automatically filters all queries to their location — no override possible |
| Admin / Owner (`location_id` is null) | Sees all data by default; can filter via `?location_id=<id>` query param |

The following collections carry a `location_id` field and are filtered at the API layer:

- **`orders`** — set automatically from `current_user.location_id` on create; filtered on `GET /orders/`
- **`attendance_records`** — set from user's `location_id` on check-in; filtered on `GET /attendance/today`
- **`users`** — filterable via `?location_id=` on `GET /users/`

### Backend Implementation Pattern

```python
# In any scoped endpoint, swap from:
dependencies=[Depends(require_permission("view_orders"))]
# to:
current_user: UserDocument = Depends(require_permission("view_orders"))
# so the user object is available for location filtering:
effective_location = current_user.location_id or location_id_query_param
if effective_location:
    query = query.find(Model.location_id == effective_location)
```

### Frontend Implementation

**State (App.tsx)**
```tsx
const [locations, setLocations] = useState<Location[]>([]);
const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
// null = show all (admin default); string = filter to that location
```

**Location switcher** — shown in two places:
1. **TopBar** — pill dropdown for admin; static badge for staff
2. **ProfilePanel** — select dropdown under user info section

**Automatic re-fetch** — a `useEffect` on `activeLocationId` refetches orders whenever the admin switches the active location.

**API client** — `listOrders(users, date?, locationId?)` appends `?location_id=` when provided.

### Adding a New Scoped Resource

To scope a future resource (e.g. `inventory`) by location:

1. Add `location_id: Optional[str] = None` to the Beanie model + index
2. Set it in the creation service from `current_user.location_id`
3. In the list endpoint, add `?location_id=` query param and filter logic (see orders router pattern)
4. Add `location_id` to the output schema
5. Update the frontend API client function to accept `locationId?` and append it as a query param

### To-Do for Complete Multi-Location Isolation

- [ ] **Inventory** — scope `GET /inventory/` by `location_id`; each location tracks its own stock
- [ ] **Menu** — optionally scope products by location (if venues offer different menus)
- [ ] **Analytics / Reports** — filter revenue, bestsellers, leaderboard by location
- [ ] **Receipt** — use location's `phone`/`email`/`address` fields (already stored) instead of global branding contact info
- [ ] **Seed script** — seed at least two locations and assign staff accordingly for testing

---

## Storage & CDN (BunnyCDN)

The system supports high-performance image delivery via **BunnyCDN**. When enabled, all uploads are automatically pushed to the configured edge storage and served via the global CDN.

### How it works:
1. **Upload**: The `/settings/upload` endpoint checks if BunnyCDN is active.
2. **Push**: If active, it performs an async `PUT` to `storage.bunnycdn.com` using the provided Storage Zone and Access Key.
3. **Save**: The backend returns the CDN URL (e.g., `https://zen-pos.bcdn.net/uuid.png`) which is saved in MongoDB.
4. **Fallback**: If disabled, files are saved locally to `STATIC_DIR/uploads`. **Note**: Local storage requires a Docker volume for persistence across container restarts.

### Configuration Checklist:
- `bunny_enabled`: Set to `true` in Integrations settings.
- `bunny_storage_zone`: Name of the storage zone.
- `bunny_api_key`: Access Key found in the Storage Zone settings.
- `bunny_cdn_hostname`: The Pull Zone URL (e.g., `yourzone.bcdn.net`).
- `bunny_storage_region`: (Optional) e.g., `ny`, `la`, `sg`. Defaults to `de`.

---

## Getting Started

### 1. Prerequisites
- Python 3.11+
- Docker + Docker Compose

### 2. Setup

```bash
cd zen-pos-api

# Copy env file and fill in values
cp .env.example .env

# Start MongoDB (Docker)
docker-compose up mongo -d

# Install Python dependencies
pip install -r requirements.txt

# Seed database with initial data
python -m scripts.seed

# Start API server (with hot reload)
uvicorn app.main:app --reload
```

### 3. Verify

- API running: http://localhost:8000
- Swagger docs: http://localhost:8000/docs
- Health check: `GET /health`

### 4. Test login

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@zenpos.com", "password": "admin"}'
```

### 5. Run tests

```bash
# Requires a running MongoDB (test DB is auto-created and dropped)
pytest
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGO_DB_NAME` | `zenpos` | Database name |
| `JWT_SECRET` | — | **Required.** Generate: `openssl rand -hex 32` |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `JWT_ACCESS_EXPIRE_MINUTES` | `15` | Access token lifetime |
| `JWT_REFRESH_EXPIRE_DAYS` | `7` | Refresh token lifetime |
| `CORS_ORIGINS` | `http://localhost:3001,http://localhost:5173` | Allowed frontend origins |
| `APP_ENV` | `development` | Environment name |

---

## Business Logic Notes

### Order Tax
- Tax rate is **8%**, calculated server-side in `order_service.py`
- `total = subtotal * 1.08`

### Order Status Machine
```
Draft → Queued → Preparing → Served / Packaging → Done
                           ↘ Out for delivery   → Done
Queued → Scheduled → Queued
Any non-terminal → Cancelled
```

### Payroll Calculation
```
net = base_salary
    + reward_bonus       (from PerformanceLogs type=Reward)
    + overtime_bonus     ($30/hr over 8h)
    - sanction_deduction (from PerformanceLogs type=Sanction)
    - late_deduction     ($20 per late arrival)
    - early_departure    ($20 per early departure)
```

### Attendance Kiosk
- Check-in and check-out endpoints are **public** (no JWT required)
- Authentication is by 4-digit PIN only (bcrypt-verified against `hashed_pin`)
- One record per user per day; duplicate check-in returns 400

---

## Next Steps (Frontend Integration)

1. Replace all `PRODUCTS`, `ORDERS`, `USERS` arrays in `data.ts` with API calls
2. Store `access_token` in `localStorage` and `refresh_token` in an httpOnly cookie
3. Add an Axios/fetch interceptor to refresh the access token automatically on 401
4. Pass `Authorization: Bearer <access_token>` on all authenticated requests
5. Use `GET /auth/me` on app load to restore session

---

## Frontend Component Library

All reusable UI pieces live in `Zen-pos2/src/components/`.
**Rule: never build a one-off UI element inline if it can be a reusable component.**

### Structure

```
src/components/
├── index.ts                     ← root barrel — import anything from here
├── Layout.tsx                   ← backwards-compat re-export (do not edit)
├── VirtualKeyboard.tsx          ← on-screen keyboard for kiosk mode
│
├── ui/                          Atomic primitives (no API calls, no state)
│   ├── Switch.tsx               Toggle (aria-checked, accessible)
│   ├── Toast.tsx                Animated notification pill
│   ├── Badge.tsx                StatusBadge · CountBadge
│   └── index.ts
│
├── layout/                      App-shell chrome
│   ├── TopBar.tsx               Header: brand · nav tabs · search · notifications · avatar
│   ├── Sidebar.tsx              Left nav for settings/admin sections
│   ├── MobileNav.tsx            Fixed bottom tab bar (hidden on lg+)
│   ├── ProfilePanel.tsx         Slide-in cashier panel + CloseRegisterModal
│   └── index.ts
│
├── cart/                        Shopping cart & checkout flow
│   ├── CartSidebar.tsx          Full panel: customer · items · receipt · payment
│   ├── CartItem.tsx             Swipeable row with 3D-touch editor (portal)
│   ├── CartFloatingAction.tsx   Mobile FAB above bottom nav
│   └── index.ts
│
└── product/                     Menu product display
    ├── ProductCard.tsx          Grid card: image · price · stock · add button
    ├── VariationModal.tsx       3D-touch anchored variation picker
    ├── CategoryFilter.tsx       Horizontal pill tabs
    └── index.ts
```

### How to import

```tsx
// Preferred — import from the sub-package (best tree-shaking)
import { ProductCard }    from './components/product';
import { TopBar }         from './components/layout';
import { CartSidebar }    from './components/cart';
import { Switch, Toast }  from './components/ui';

// Alternatively — root barrel (convenience, slightly larger bundle)
import { ProductCard, TopBar, CartSidebar, Switch } from './components';
```

### Contribution rule — **use it or create it**

> **Before writing any UI element inline, check the library first.**
> If a matching component already exists, use it.
> If it does not exist, create it in the correct sub-folder, document it,
> and export it from the sub-folder's `index.ts` and from `components/index.ts`.

Step-by-step for adding a new component:

1. **Pick the right folder**

   | What it does | Folder |
   |---|---|
   | Pure visual primitive (button variant, icon pill, divider…) | `ui/` |
   | Part of the page frame (header, sidebar, nav…) | `layout/` |
   | Belongs to the cart or checkout flow | `cart/` |
   | Displays or selects a menu product | `product/` |
   | Doesn't fit any of the above | Create a new sub-folder |

2. **Write the component with a JSDoc header**

   ```tsx
   /**
    * MyComponent — one-line description.
    *
    * @prop foo - what it does
    * @prop bar - what it does
    *
    * @example
    * <MyComponent foo="x" bar={42} />
    */
   export const MyComponent = ({ foo, bar }: { foo: string; bar: number }) => { … };
   ```

3. **Export it from the sub-folder barrel**

   ```ts
   // e.g. src/components/ui/index.ts
   export { MyComponent } from './MyComponent';
   ```

4. **Export it from the root barrel**

   ```ts
   // src/components/index.ts
   export { MyComponent } from './ui/MyComponent';
   ```

5. **Run the TypeScript check** — zero errors required before committing.

   ```bash
   cd Zen-pos2 && npx tsc --noEmit
   ```

### Design tokens (Tailwind)

All components use the Material Design 3 colour tokens configured in Tailwind:

| Token | Usage |
|---|---|
| `bg-surface-container` | Default card/panel background |
| `bg-surface-container-lowest` | Elevated surfaces (modals, headers) |
| `text-on-surface` | Primary body text |
| `text-on-surface-variant` | Secondary / muted text |
| `text-primary` / `bg-primary` | Brand accent (deep orange) |
| `text-secondary` / `bg-secondary` | Highlight / active states |
| `text-tertiary` / `bg-tertiary` | Success / in-stock indicators |
| `text-error` / `bg-error` | Errors, low stock, destructive actions |
| `border-outline-variant` | Subtle borders (`/10`, `/20` opacity) |

Icon font: **Material Symbols Outlined** — use `<span className="material-symbols-outlined">icon_name</span>`.

---

*Updated: 2026-03-26 — added multi-location architecture*
