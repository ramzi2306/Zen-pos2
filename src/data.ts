export interface ProductCategory {
  id: string;
  name: string;
}

export const CATEGORIES: ProductCategory[] = [
  { id: 'cat_nigiri', name: 'Nigiri' },
  { id: 'cat_sashimi', name: 'Sashimi' },
  { id: 'cat_sake', name: 'Sake' },
  { id: 'cat_specials', name: 'Specials' },
  { id: 'cat_rolls', name: 'Rolls' },
];

export interface VariationOption {
  id: string;
  name: string;
  priceAdjustment?: number;
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
  category: 'Nigiri' | 'Sashimi' | 'Sake' | 'Specials' | 'Rolls';
  image: string;
  inStock: boolean;
  stockLevel?: 'Healthy' | 'Low' | 'Critical';
  tags?: string[];
  variations?: VariationGroup[];
}

export interface CartItem extends Product {
  cartItemId: string;
  quantity: number;
  notes?: string;
  discount?: number;
  selectedVariations?: Record<string, VariationOption>;
}

export type Permission = 
  | 'view_menu' 
  | 'view_orders' 
  | 'view_attendance' 
  | 'view_staff' 
  | 'view_hr' 
  | 'view_inventory' 
  | 'view_settings' 
  | 'manage_roles';

export interface Role {
  id: string;
  name: string;
  permissions: Permission[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // Added for login
  phone: string;
  roleId: string; // Reference to Role
  role: string; // Display name
  image: string;
  baseSalary: number;
  payrollDue: string;
  attendanceScore: number;
  shifts: Record<string, string>; // e.g., { 'Mon': '09 - 17', 'Tue': '09 - 17' }
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
}

export interface PerformanceLog {
  id: string;
  userId: string;
  type: 'Reward' | 'Sanction';
  title: string;
  asset: string; // User name
  impact: string;
  date: string;
}

export interface Review {
  stars: number;
  comment: string;
}

export interface Order {
  id: string;
  table: string;
  status: 'Queued' | 'Scheduled' | 'Preparing' | 'Served' | 'Packaging' | 'Out for delivery' | 'Done' | 'Cancelled' | 'Draft';
  paymentStatus: 'Unpaid' | 'Paid';
  items: CartItem[];
  total: number;
  time: string;
  isUrgent?: boolean;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  customer?: {
    name: string;
    phone: string;
    address?: string;
  };
  scheduledTime?: string;
  startTime?: number; // timestamp when it moved to Preparing
  cook?: User;
  assistants?: User[];
  review?: Review;
}

export const ROLES: Role[] = [
  {
    id: 'r_super_admin',
    name: 'Super Admin',
    permissions: ['view_menu', 'view_orders', 'view_attendance', 'view_staff', 'view_hr', 'view_inventory', 'view_settings', 'manage_roles']
  },
  {
    id: 'r_hr_manager',
    name: 'HR Manager',
    permissions: ['view_staff', 'view_hr']
  },
  {
    id: 'r_attendance_manager',
    name: 'Attendance Manager',
    permissions: ['view_attendance']
  },
  {
    id: 'r_cashier',
    name: 'Cashier',
    permissions: ['view_menu', 'view_orders']
  },
  {
    id: 'r_cook',
    name: 'Cook',
    permissions: ['view_orders']
  }
];

export const USERS: User[] = [
  { 
    id: 'u1', 
    name: 'Kenji Sato', 
    email: 'admin@zenpos.com',
    password: 'admin',
    phone: '+81 90 1234 5678',
    roleId: 'r_super_admin',
    role: 'Super Admin', 
    image: 'https://i.pravatar.cc/150?u=u1',
    baseSalary: 5200,
    payrollDue: 'Mar 31, 2026',
    attendanceScore: 94,
    shifts: { 'Mon': '09 - 17', 'Tue': '09 - 17', 'Thu': '09 - 17', 'Fri': '11 - 21', 'Sat': '11 - 21' },
    monthlyAttendance: Array.from({ length: 31 }, (_, i) => {
      const isOff = [0, 6, 7].includes((i + 1) % 7);
      const hours = isOff ? 0 : (8 + Math.floor(Math.random() * 3));
      const isLate = !isOff && Math.random() > 0.9;
      const isEarlyDeparture = !isOff && Math.random() > 0.9;
      const isOvertime = !isOff && hours > 8;
      const hasReward = !isOff && Math.random() > 0.92;
      const hasSanction = !isOff && !hasReward && Math.random() > 0.95;
      return {
        day: `${i + 1}`,
        hours,
        isLate,
        isEarlyDeparture,
        isOvertime,
        rewardNote: hasReward ? 'Excellent performance & extra effort' : undefined,
        sanctionNote: hasSanction ? 'Unprofessional conduct' : undefined,
        checkIn: isOff ? undefined : (isLate ? '09:15' : '08:55'),
        checkOut: isOff ? undefined : (isEarlyDeparture ? `${9 + hours - 1}:30` : `${9 + hours}:00`)
      };
    }),
    rewards: 450,
    sanctions: 0,
    startDate: 'Jan 12, 2021',
    contractType: 'Full-Time Permanent',
    contractDate: 'Jan 12, 2021',
    withdrawalLogs: [
      { id: 'W-992', amount: 2000, date: 'Mar 05, 2026', status: 'Completed' },
      { id: 'W-881', amount: 1500, date: 'Feb 05, 2026', status: 'Completed' }
    ],
    personalDocuments: [
      { id: 'D-1', name: 'Contract_Kenji.pdf', type: 'PDF', url: '#' },
      { id: 'D-2', name: 'ID_Card_Scan.jpg', type: 'Image', url: '#' }
    ]
  },
  { 
    id: 'u2', 
    name: 'Miki Izumi', 
    email: 'miki@omakase.com',
    password: 'password',
    phone: '+81 90 2345 6789',
    roleId: 'r_hr_manager',
    role: 'HR Manager', 
    image: 'https://i.pravatar.cc/150?u=u2',
    baseSalary: 4850,
    payrollDue: 'Mar 31, 2026',
    attendanceScore: 78,
    shifts: { 'Tue': '10 - 18', 'Wed': '10 - 18', 'Thu': '10 - 18', 'Fri': '10 - 18', 'Sun': '12 - 22' },
    monthlyAttendance: Array.from({ length: 31 }, (_, i) => {
      const isOff = [1, 6].includes((i + 1) % 7);
      const hours = isOff ? 0 : (7 + Math.floor(Math.random() * 4));
      const isLate = !isOff && Math.random() > 0.7;
      const isEarlyDeparture = !isOff && Math.random() > 0.8;
      const isOvertime = !isOff && hours > 8;
      const hasReward = !isOff && Math.random() > 0.95;
      const hasSanction = !isOff && !hasReward && Math.random() > 0.85;
      return {
        day: `${i + 1}`,
        hours,
        isLate,
        isEarlyDeparture,
        isOvertime,
        rewardNote: hasReward ? 'High sales volume' : undefined,
        sanctionNote: hasSanction ? 'Late arrival without notice' : undefined,
        checkIn: isOff ? undefined : (isLate ? '10:45' : '09:55'),
        checkOut: isOff ? undefined : (isEarlyDeparture ? `${10 + hours - 1}:15` : `${10 + hours}:00`)
      };
    }),
    rewards: 200,
    sanctions: 120,
    startDate: 'Mar 22, 2022',
    contractType: 'Full-Time Permanent',
    contractDate: 'Mar 22, 2022',
    withdrawalLogs: [
      { id: 'W-772', amount: 1200, date: 'Mar 10, 2026', status: 'Completed' },
      { id: 'W-661', amount: 1000, date: 'Feb 10, 2026', status: 'Completed' }
    ],
    personalDocuments: [
      { id: 'D-3', name: 'Employment_Agreement.pdf', type: 'PDF', url: '#' }
    ]
  },
  { 
    id: 'u3', 
    name: 'Takashi Morita', 
    email: 'tmorita@omakase.com',
    password: 'password',
    phone: '+81 90 3456 7890',
    roleId: 'r_cashier',
    role: 'Cashier', 
    image: 'https://i.pravatar.cc/150?u=u3',
    baseSalary: 5200,
    payrollDue: 'Mar 31, 2026',
    attendanceScore: 94,
    shifts: { 'Mon': '08 - 16', 'Wed': '08 - 16', 'Fri': '08 - 16', 'Sat': '10 - 20' },
    monthlyAttendance: Array.from({ length: 31 }, (_, i) => {
      const isOff = [0, 2, 4, 6].includes((i + 1) % 7);
      const hours = isOff ? 0 : (8 + Math.floor(Math.random() * 2));
      const isLate = !isOff && Math.random() > 0.95;
      const isEarlyDeparture = !isOff && Math.random() > 0.9;
      const isOvertime = !isOff && hours > 8;
      const hasReward = !isOff && Math.random() > 0.9;
      const hasSanction = !isOff && !hasReward && Math.random() > 0.98;
      return {
        day: `${i + 1}`,
        hours,
        isLate,
        isEarlyDeparture,
        isOvertime,
        rewardNote: hasReward ? 'Perfect attendance week' : undefined,
        sanctionNote: hasSanction ? 'Safety protocol violation' : undefined,
        checkIn: isOff ? undefined : (isLate ? '08:15' : '07:55'),
        checkOut: isOff ? undefined : (isEarlyDeparture ? `${8 + hours - 1}:45` : `${8 + hours}:00`)
      };
    }),
    rewards: 300,
    sanctions: 0,
    startDate: 'Jun 05, 2021',
    contractType: 'Fixed-Term',
    contractDate: 'Jun 05, 2021',
    contractExpiration: 'Jun 05, 2024',
    withdrawalLogs: [
      { id: 'W-552', amount: 2500, date: 'Mar 02, 2026', status: 'Completed' }
    ],
    personalDocuments: [
      { id: 'D-4', name: 'Morita_Cert.pdf', type: 'PDF', url: '#' }
    ]
  },
  { 
    id: 'u4', 
    name: 'Yui Tanaka', 
    email: 'ytanaka@omakase.com',
    password: 'password',
    phone: '+81 90 4567 8901',
    roleId: 'r_cook',
    role: 'Cook', 
    image: 'https://i.pravatar.cc/150?u=u4',
    baseSalary: 4850,
    payrollDue: 'Mar 31, 2026',
    attendanceScore: 78,
    shifts: { 'Mon': '12 - 20', 'Tue': '12 - 20', 'Thu': '12 - 20', 'Sun': '10 - 18' },
    monthlyAttendance: Array.from({ length: 31 }, (_, i) => {
      const isOff = [3, 5, 6].includes((i + 1) % 7);
      const hours = isOff ? 0 : (8 + Math.floor(Math.random() * 1));
      const isLate = !isOff && Math.random() > 0.8;
      const isEarlyDeparture = !isOff && Math.random() > 0.85;
      const isOvertime = !isOff && hours > 8;
      const hasReward = !isOff && Math.random() > 0.94;
      const hasSanction = !isOff && !hasReward && Math.random() > 0.92;
      return {
        day: `${i + 1}`,
        hours,
        isLate,
        isEarlyDeparture,
        isOvertime,
        rewardNote: hasReward ? 'Customer compliment' : undefined,
        sanctionNote: hasSanction ? 'Till discrepancy' : undefined,
        checkIn: isOff ? undefined : (isLate ? '12:20' : '11:55'),
        checkOut: isOff ? undefined : (isEarlyDeparture ? `${12 + hours - 1}:20` : `${12 + hours}:00`)
      };
    }),
    rewards: 150,
    sanctions: 80,
    startDate: 'Aug 15, 2022',
    contractType: 'Part-Time',
    contractDate: 'Aug 15, 2022',
    contractExpiration: 'Aug 15, 2026',
    withdrawalLogs: [
      { id: 'W-442', amount: 800, date: 'Mar 12, 2026', status: 'Pending' }
    ],
    personalDocuments: [
      { id: 'D-5', name: 'Tanaka_Visa.pdf', type: 'PDF', url: '#' }
    ]
  },
];

export const PERFORMANCE_LOGS: PerformanceLog[] = [
  {
    id: 'TXN_PERF_882',
    userId: 'u1',
    type: 'Reward',
    title: 'EXCEPTIONAL SERVICE EXCELLENCE',
    asset: 'Kenji Sato',
    impact: 'PERFORMANCE BONUS TIER 1',
    date: 'MAR 18, 2026'
  },
  {
    id: 'TXN_PERF_874',
    userId: 'u2',
    type: 'Sanction',
    title: 'OPERATIONAL LATENCY VIOLATION',
    asset: 'Yui Tanaka',
    impact: 'FORMAL REPRIMAND 01',
    date: 'MAR 15, 2026'
  }
];

export const PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Bluefin Otoro',
    description: 'Fatty belly of Hon-Maguro. Melt-in-your-mouth texture with high marble content.',
    price: 24.00,
    category: 'Nigiri',
    image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&q=80&w=400',
    inStock: true,
    stockLevel: 'Healthy',
    tags: ['Chef Choice']
  },
  {
    id: 'p2',
    name: 'Sake Aburi',
    description: 'Flash-seared Atlantic Salmon topped with nikiri soy and house-made ikura.',
    price: 12.00,
    category: 'Nigiri',
    image: 'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&q=80&w=400',
    inStock: true,
    stockLevel: 'Healthy'
  },
  {
    id: 'p3',
    name: 'Hamachi Jalapeño',
    description: 'Yellowtail with a slice of serrano chili and yuzu-ponzu vinaigrette.',
    price: 14.00,
    category: 'Sashimi',
    image: 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?auto=format&fit=crop&q=80&w=400',
    inStock: true,
    stockLevel: 'Healthy'
  },
  {
    id: 'p4',
    name: 'Hokkaido Uni',
    description: 'Grade A Sea Urchin from Hokkaido. Creamy, oceanic, and sweet finish.',
    price: 28.00,
    category: 'Nigiri',
    image: 'https://images.unsplash.com/photo-1583623025817-d180a2221d0a?auto=format&fit=crop&q=80&w=400',
    inStock: true,
    stockLevel: 'Low'
  },
  {
    id: 'p5',
    name: 'Kubota Manju',
    description: 'Junmai Daiginjo. Elegant, floral, and complex.',
    price: 145.00,
    category: 'Sake',
    image: 'https://images.unsplash.com/photo-1560159898-009990b1bf7b?auto=format&fit=crop&q=80&w=400',
    inStock: true,
    stockLevel: 'Healthy'
  },
  {
    id: 'p6',
    name: 'Spicy Tuna Roll',
    description: 'Fresh tuna with spicy mayo, cucumber, and sesame seeds.',
    price: 12.00,
    category: 'Rolls',
    image: 'https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&q=80&w=400',
    inStock: true,
    stockLevel: 'Healthy',
    variations: [
      {
        id: 'v_size',
        name: 'Size',
        options: [
          { id: 'opt_4pcs', name: '4 Pcs' },
          { id: 'opt_8pcs', name: '8 Pcs', priceAdjustment: 8.00 }
        ]
      },
      {
        id: 'v_filling',
        name: 'Filling',
        options: [
          { id: 'opt_tuna', name: 'Tuna' },
          { id: 'opt_salmon', name: 'Salmon' },
          { id: 'opt_surimi', name: 'Surimi', priceAdjustment: -2.00 }
        ]
      }
    ]
  }
];

export const ORDERS: Order[] = [
  {
    id: '204',
    table: '08',
    status: 'Preparing',
    paymentStatus: 'Unpaid',
    time: '12m ago',
    total: 156.00,
    orderType: 'dine_in',
    startTime: Date.now() - 12 * 60000,
    cook: USERS[0],
    items: [
      { ...PRODUCTS[0], cartItemId: 'c1', quantity: 2 },
      { ...PRODUCTS[1], cartItemId: 'c2', quantity: 1, notes: '+ Extra Wasabi' }
    ]
  },
  {
    id: '205',
    table: '12',
    status: 'Served',
    paymentStatus: 'Paid',
    time: '18m ago',
    total: 84.50,
    orderType: 'dine_in',
    cook: USERS[1],
    items: [
      { ...PRODUCTS[2], cartItemId: 'c3', quantity: 4 },
      { ...PRODUCTS[3], cartItemId: 'c4', quantity: 2 }
    ]
  },
  {
    id: '207',
    table: 'VIP 01',
    status: 'Queued',
    paymentStatus: 'Unpaid',
    time: 'Just now',
    total: 1240.00,
    isUrgent: true,
    orderType: 'dine_in',
    items: [
      { ...PRODUCTS[0], cartItemId: 'c5', quantity: 4 },
      { ...PRODUCTS[4], cartItemId: 'c6', quantity: 2 }
    ]
  }
];
