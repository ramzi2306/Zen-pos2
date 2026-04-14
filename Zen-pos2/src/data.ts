export interface ProductCategory {
  id: string;
  name: string;
}

export interface Ingredient {
  id: string;
  name: string;
  amount: number;
  unit: string;
  wastePercent?: number;
}

export interface SupplementOption {
  id: string;
  name: string;
  priceAdjustment?: number;
  ingredients?: Ingredient[];
}

export interface SupplementGroup {
  id: string;
  name: string;
  options: SupplementOption[];
}

export interface VariationOption {
  id: string;
  name: string;
  price?: number;
  ingredients?: Ingredient[];
}

export interface VariationGroup {
  id: string;
  name: string;
  options: VariationOption[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
  inStock: boolean;
  stockLevel?: 'Healthy' | 'Low' | 'Critical';
  tags?: string[];
  variations?: VariationGroup[];
  supplements?: SupplementGroup[];
  ingredients?: Ingredient[];
}

export interface CartItem extends Product {
  cartItemId: string;
  quantity: number;
  notes?: string;
  discount?: number;
  manualPrice?: number;
  selectedVariations?: Record<string, VariationOption>;
  selectedSupplements?: Record<string, SupplementOption>;
}

export type Permission =
  | 'view_menu'
  | 'view_orders'
  | 'view_attendance'
  | 'view_staff'
  | 'view_hr'
  | 'view_inventory'
  | 'view_settings'
  | 'manage_roles'
  | 'manage_locations';

export interface Role {
  id: string;
  name: string;
  permissions: Permission[];
  excludeFromAttendance: boolean;
  inOrderPrep: boolean;
  isSystem: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleId: string;
  role: string;
  permissions: string[];
  image: string;
  baseSalary: number;
  payrollDue: string;
  attendanceScore: number;
  /** Tablet station group: "kitchen" | "cashier" | "admin" | "" (all tablets) */
  attendanceGroup: string;
  /** True if a kiosk PIN has been configured for this user */
  hasPin: boolean;
  /** True if this user's role is excluded from attendance tracking */
  excludeFromAttendance: boolean;
  /** True if this user's role is a system role (e.g. Super Admin) */
  isSystem: boolean;
  /** True if this user's role should appear in order preparation cook/assistant menus */
  inOrderPrep: boolean;
  shifts: Record<string, string>;
  monthlyAttendance: {
    day: string;
    hours: number;
    isLate: boolean;
    isEarlyDeparture: boolean;
    isOvertime: boolean;
    checkIn?: string;
    checkOut?: string;
    rewardNote?: string;
    sanctionNote?: string;
  }[];
  rewards: number;
  sanctions: number;
  startDate: string;
  contractType: string;
  contractDate: string;
  contractExpiration?: string;
  withdrawalLogs: {
    id: string;
    amount: number;
    date: string;
    status: 'Completed' | 'Pending';
  }[];
  personalDocuments: {
    id: string;
    name: string;
    type: string;
    url: string;
  }[];
  locationId?: string;
  locationName?: string;
}

export interface PerformanceLog {
  id: string;
  userId: string;
  type: 'Reward' | 'Sanction';
  title: string;
  asset: string;
  impact: string;
  date: string;
}

export interface Review {
  stars: number;
  comment: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  notes: string;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate?: string;
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  createdAt?: string;
  total: number;
  status: string;
  orderType: string;
  itemsCount: number;
  review?: { stars: number; comment: string };
}

export interface CustomerDetail extends Customer {
  orders: CustomerOrder[];
}

export interface BestsellerItem {
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  avatar: string;
  ordersCompleted: number;
  rank: number;
}

export interface SalesSummary {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  ordersThisMonth: number;
  revenueThisMonth: number;
}

export interface RegisterReport {
  id: string;
  openedAt: number;
  closedAt: number;
  cashierName: string;
  expectedSales: number;
  actualSales: number;
  difference: number;
  notes?: string;
  locationId?: string;
}

export interface VerificationMetadata {
  verifiedBy?: string;
  verifiedAt?: string;
  attempts: number;
  notes?: string;
  outcome?: 'verified' | 'cancelled' | 'unreachable';
}

export interface Order {
  id: string;
  orderNumber?: string;
  table: string;
  status: 'Queued' | 'Scheduled' | 'Preparing' | 'Served' | 'Packaging' | 'Out for delivery' | 'Done' | 'Cancelled' | 'Draft' | 'Verification';
  paymentStatus: 'Unpaid' | 'Paid';
  paymentMethod?: 'Cash' | 'Credit Card' | 'Other';
  items: CartItem[];
  subtotal?: number;
  tax?: number;
  total: number;
  time: string;
  isUrgent?: boolean;
  orderType: 'dine_in' | 'takeaway' | 'delivery' | 'online';
  channel?: 'online';
  trackingToken?: string;
  verificationMetadata?: VerificationMetadata;
  notes?: string;
  customer?: {
    name: string;
    phone: string;
    address?: string;
  };
  scheduledTime?: string;
  startTime?: number;
  endTime?: number;
  queueStartTime?: number;
  createdAt?: string;
  cook?: User;
  assistants?: User[];
  review?: Review;
  locationId?: string;
  deliveryAgent?: { agent_id: string; name: string; phone: string };
}

// ─── Public ordering types ─────────────────────────────────────────────────────

export interface PublicCartItem {
  productId: string;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  note?: string;
  selectedVariations?: Record<string, { id: string; name: string; price: number }>;
  selectedSupplements?: Record<string, { id: string; name: string; priceAdjustment: number }>;
}

export interface OnlineOrderRequest {
  items: PublicCartItem[];
  customer: { name: string; phone: string; address: string; note?: string };
  locationId?: string;
}

export interface PublicTrackingInfo {
  orderId: string;
  orderNumber: string;
  status: string;
  orderType?: string;
  channel: 'online';
  items: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  tax: number;
  total: number;
  customer: { name: string; maskedPhone: string; address: string };
  createdAt: string;
  updatedAt: string;
  trackingToken: string;
  estimatedDelivery?: string;
  courier?: { name: string; phone?: string; avatar?: string };
  delivery_agent?: { agent_id: string; name: string; phone: string };
  review?: Review;
}

export interface PublicOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  items: { name: string; quantity: number }[];
  createdAt: string;
  review?: Review;
  trackingToken: string;
  customer: { name: string; phone: string; address?: string };
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  products: Product[];
}
