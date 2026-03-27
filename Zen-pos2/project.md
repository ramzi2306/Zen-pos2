# ZEN-POS — Project Map

A comprehensive reference document covering features, architecture, design, and technology of the ZEN-POS system.

---

## Overview

ZEN-POS is a full-featured **Point of Sale system** built for high-end omakase sushi restaurants. It combines order management, kitchen display, staff attendance tracking, HR/payroll management, and an admin control panel — all in a single responsive web application.

The project is currently in active development with all data mocked locally (no live backend database). The UI is highly polished with a Material Design 3 dark theme, smooth spring animations, and full touch/mobile support.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| UI Framework | React | 19.0.0 |
| Language | TypeScript | ~5.8.2 |
| Build Tool | Vite | 6.2.0 |
| Styling | Tailwind CSS | 4.1.14 |
| Animation | Motion (Framer Motion) | 12.23.24 |
| Icons | Lucide React | 0.546.0 |
| Icons (supplemental) | Google Material Symbols | — |
| Charts | Recharts | 3.8.0 |
| Backend (available) | Express.js | 4.21.2 |
| AI Integration | Google Generative AI SDK | 1.29.0 |

---

## Project Structure

```
Zen-pos2/
├── src/
│   ├── App.tsx                  # Root component — global state, auth, view routing
│   ├── main.tsx                 # Application entry point
│   ├── index.css                # Global styles, CSS variables, Material Design 3 theme
│   ├── data.ts                  # All data models (types) and mock data
│   ├── components/
│   │   ├── Layout.tsx           # Shared UI: TopBar, Sidebar, CartSidebar, ProfilePanel, etc.
│   │   └── VirtualKeyboard.tsx  # On-screen QWERTY keyboard for touch input
│   └── views/
│       ├── MenuView.tsx         # Product catalog and ordering interface
│       ├── OrdersView.tsx       # Kitchen order display and management
│       ├── AttendanceView.tsx   # Staff check-in / check-out (PIN-based)
│       ├── AdminLoginView.tsx   # Secure admin authentication form
│       └── AdminViews.tsx       # All admin panels: HR, payroll, inventory, settings
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── metadata.json
```

---

## Features

### Point of Sale
- **Menu Browsing** — Products grouped by category (Nigiri, Sashimi, Sake, Rolls, Specials)
- **Order Types** — Dine-in, Takeaway, Delivery
- **Product Variations** — Each product supports variation groups and options with price adjustments
- **Cart Management** — Add/remove/edit items, apply per-item discounts, add special instructions
- **Swipe-to-Delete** — Swipeable cart items on touch devices
- **Customer Details** — Capture customer name, phone, delivery address, scheduled time
- **Payment Processing** — Accept payment, auto-calculate change
- **Receipt Generation** — Digital receipt with itemized totals, print support
- **Previous Clients** — Quick-select repeat customers

### Kitchen Order Display
- Live order board showing all orders with status indicators
- **Order Statuses**: Queued → Preparing → Served/Packaging → Done
- Urgency flagging
- Cook assignment and assist staff selection
- Timer display for orders in preparation
- Order editing and cancellation
- Print recipe / preparation notes
- Review collection modal after completion

### Attendance & Time Tracking
- PIN-based staff check-in / check-out (4-digit PIN)
- Real-time digital clock
- Staff registry grid
- Activity log of recent check-ins/check-outs
- Fullscreen kiosk mode toggle

### HR & Payroll
- **Staff Dossiers** — Full personnel profiles with personal details, contract info, salary, documents
- **Payroll Disbursement** — Withdrawal modal with incident tracking (late arrivals, early departures, overtime), deduction calculation, and official receipt generation
- **Performance Tracking** — Logs for rewards and sanctions
- **Monthly Attendance Records** — Day-by-day attendance history per employee
- **Document Management** — Drag-and-drop file upload to staff dossiers
- **Print to PDF** — Dossiers and payroll receipts are printable

### Administration
- **Role-Based Access Control** — 5 user roles with granular permissions
- **POS Settings** — Branding, hardware (printer) configuration
- **Product Management** — Menu items and inventory
- **Team Management** — Staff directory and profiles
- **Inventory Management** — Stock levels and ingredients
- **Location Settings** — Multi-location configuration
- **Roles Management** — Define and edit roles/permissions

### Register Management
- **Close Register** — End-of-shift reconciliation modal
- Payment method breakdown (Cash vs. Credit Card)
- Numeric keypad for amount entry
- Discrepancy detection and payroll summary

---

## Data Models

### Products & Cart

```typescript
ProductCategory    { id, name }
Ingredient         { id, name, amount, unit, wastePercent }
VariationOption    { id, name, priceAdjustment, ingredients[] }
VariationGroup     { id, name, options[] }
Product            { id, name, description, price, category, image, inStock,
                     stockLevel, tags, variations[], ingredients[] }
CartItem           extends Product + { cartItemId, quantity, notes,
                                       discount, selectedVariations }
```

### Orders

```typescript
Order {
  id, table, status, paymentStatus, items[], total, time,
  isUrgent, orderType, customer, scheduledTime, startTime,
  cook, assistants[], review
}
Review { stars, comment }
```

### Users & Roles

```typescript
Role        { id, name, permissions[] }
Permission  // Union: 'view_menu' | 'view_orders' | 'view_attendance' |
            //        'view_staff' | 'view_hr' | 'view_inventory' |
            //        'view_settings' | 'manage_roles'

User {
  id, name, email, password, phone, roleId, role, image,
  baseSalary, payrollDue, attendanceScore, shifts,
  monthlyAttendance[], rewards, sanctions, startDate,
  contractType, contractDate, contractExpiration,
  withdrawalLogs[], personalDocuments[]
}
```

### Attendance

```typescript
MonthlyAttendanceRecord {
  day, hours, isLate, isEarlyDeparture, isOvertime,
  checkIn, checkOut, rewardNote, sanctionNote
}
```

### Performance

```typescript
PerformanceLog { id, userId, type, title, asset, impact, date }
```

---

## State Management

State is managed entirely with React `useState` in `App.tsx` as the root container, with props drilled down to child components.

**Global state in App.tsx:**

| State | Type | Purpose |
|---|---|---|
| `currentUser` | `User \| null` | Authenticated user session |
| `currentView` | `string` | Active page/view |
| `currentSetting` | `string` | Active admin panel section |
| `cart` | `CartItem[]` | Shopping cart contents |
| `orders` | `Order[]` | All active orders |
| `isCartOpen` | `boolean` | Cart sidebar visibility |
| `isProfileOpen` | `boolean` | Profile panel visibility |

> No Redux, Zustand, or Context API is currently used. Suitable for current scale; a context layer or state library would benefit growth.

---

## Routing

Routing is implemented as **view-based string state** — no React Router.

| View Key | Description |
|---|---|
| `menu` | Product menu and cart |
| `orders` | Kitchen order board |
| `attendance` | Staff check-in/out kiosk |
| `inventory` | Inventory panel |
| `pos_settings` | POS branding & hardware |
| `admin_panel` | Full admin control panel |

**Admin sub-sections:**

| Setting Key | Description |
|---|---|
| `branding` | Logo, colors, restaurant name |
| `hardware` | Printer and peripheral setup |
| `products` | Menu item management |
| `team` | Staff directory |
| `hr` | HR and payroll management |
| `locations` | Multi-location settings |
| `roles` | Role and permission management |

---

## Design System

### Theme

Material Design 3 — **Dark Theme**

### Color Palette

| Role | Hex | Use |
|---|---|---|
| Primary | `#C0C7D4` | Main interactive elements |
| On-Primary | `#2A313C` | Text on primary |
| Primary-Container | `#404753` | Cards, surfaces |
| Secondary | `#FFB4A5` | Accents, highlights |
| Secondary-Container | `#73342D` | Notification badges |
| Tertiary | `#9DD761` | Success, positive states |
| Tertiary-Container | `#285000` | Success backgrounds |
| Error | `#FFB4AB` | Error states |
| Background | `#1A1C1E` | App background |
| Surface | `#1A1C1E` | Base surface |
| Surface-Container-High | `#292A2D` | Elevated cards |
| Surface-Container-Highest | `#333538` | Topmost surfaces |
| Outline | `#8E9099` | Borders and dividers |

### Typography

| Font | Usage |
|---|---|
| **Space Grotesk** | Headlines, titles, brand name |
| **Inter** | Body text, UI labels |
| **JetBrains Mono** | Receipts, codes, data display |

### Design Patterns

- **Dark mode first** — all surfaces use dark color tokens
- **Glass morphism** — backdrop blur on modals and overlays
- **Spring animations** — major UI transitions use spring easing (Motion library)
- **3D touch overlays** — long-press / deep-press contextual panels
- **Swipeable items** — gesture-based cart item deletion
- **Rounded UI** — `border-radius` consistently `xl` to `3xl`
- **Custom scrollbar** — 6px width, themed to surface-variant
- **Grid background** — subtle grid pattern on kiosk/fullscreen modes

---

## Components Reference

### Layout.tsx

| Component | Description |
|---|---|
| `TopBar` | Header with logo, view switcher, search, notifications, profile access |
| `Sidebar` | Left nav for admin/settings sections, permission-filtered |
| `CartSidebar` | Right panel for cart, order type, payment, receipt |
| `CartFloatingAction` | Mobile floating button showing cart summary |
| `MobileNav` | Bottom tab bar for mobile navigation |
| `SwipeableCartItem` | Cart item with swipe-to-delete, inline editing, variation display |
| `ProfilePanel` | Slide-out panel with user info, stats, logout, close-register |
| `CloseRegisterModal` | End-of-shift reconciliation with payment numpad and receipt |

### VirtualKeyboard.tsx

Full on-screen QWERTY keyboard rendered as a floating panel — activates on text input focus on non-mobile devices. Supports backspace, space, spring-animated appearance.

### Views

| View | File | Description |
|---|---|---|
| Menu | `views/MenuView.tsx` | Category filter, product cards, variation picker |
| Orders | `views/OrdersView.tsx` | Kitchen board, status management, cook assignment |
| Attendance | `views/AttendanceView.tsx` | PIN pad, staff grid, activity log |
| Admin Login | `views/AdminLoginView.tsx` | Email/password login form |
| Admin | `views/AdminViews.tsx` | HR, payroll, dossiers, settings panels |

#### AdminViews sub-components

| Component | Description |
|---|---|
| `WithdrawalModal` | Payroll disbursement with incident details, deductions, receipt |
| `DossierModal` | Staff profile viewer/editor with documents and attendance history |
| `SettingsView` | Container for all admin sub-panels |

---

## Build & Tooling

### Scripts

```bash
npm run dev       # Start dev server (port 3000, host 0.0.0.0)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # TypeScript type-check (tsc --noEmit)
npm run clean     # Remove dist/
```

### Vite Config Highlights

- React plugin with fast-refresh
- Tailwind CSS via `@tailwindcss/vite`
- Path alias: `@/` → project root
- `GEMINI_API_KEY` exposed to frontend via `import.meta.env`
- HMR disabled when `DISABLE_HMR=true`

### TypeScript Config

- Target: `ES2022`
- Module: `ESNext`, resolution: `bundler`
- JSX: `react-jsx` (automatic runtime)
- Path alias: `@/*` → `./*`
- Experimental decorators enabled

### Environment Variables

```
GEMINI_API_KEY     Google Generative AI key (available, not yet wired to UI)
APP_URL            Deployed app URL
DISABLE_HMR        Disable hot module replacement (set to 'true' to disable)
```

---

## Integrations

| Integration | Status | Purpose |
|---|---|---|
| Google Generative AI | Available, not yet active | AI-powered features (menu suggestions, inventory optimization) |
| Express.js | Available, not yet integrated | Backend API server |
| Recharts | Imported in AdminViews | Data visualization — charts ready to be wired up |

---

## Mock Data (data.ts)

The application currently runs entirely on local mock data:

- **5 Products**: Bluefin Otoro Nigiri, Sake Aburi, Hamachi Jalapeño, Hokkaido Uni, Kubota Manju, Spicy Tuna Roll (with full variations)
- **4 Users**: Super Admin, HR Manager, Cashier, Cook (each with distinct roles/permissions)
- **5 Categories**: Nigiri, Sashimi, Sake, Specials, Rolls
- **3 Sample Orders**: In various statuses (Queued, Preparing, Done)

All state resets on page reload — no persistence layer exists yet.

---

## Known Limitations / Future Work

- No backend API or database — all data is ephemeral
- State management via prop drilling — Context API or Zustand would improve scalability
- Google AI integration available but not wired to any UI feature
- Recharts imported but charts not yet fully implemented in views
- No real authentication — login validates against hardcoded USERS array
- No unit or integration tests

---

*Generated: 2026-03-24*
