import { createClient } from '@supabase/supabase-js';

// معالجة وتنظيف متغيرات البيئة لمنع الأخطاء البرمجية في المسارات
const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseUrl = rawUrl.trim().replace(/\/+$/, '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder', 
  {
    auth: {
      persistSession: false,
    },
  }
);

// ============ TYPES ============

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  notes: string | null;
  balance: number;
  created_at: string;
};

export type Examination = {
  id: string;
  customer_id: string;
  exam_date: string;
  od_sph: number | null;
  od_cyl: number | null;
  od_axis: number | null;
  od_add: number | null;
  od_pd: number | null;
  os_sph: number | null;
  os_cyl: number | null;
  os_axis: number | null;
  os_add: number | null;
  os_pd: number | null;
  visual_field: string | null;
  notes: string | null;
  doctor_name: string | null;
  created_at: string;
};

export type InventoryCategory =
  | 'frames'
  | 'sunglasses'
  | 'contact_lenses'
  | 'lenses'
  | 'solutions'
  | 'accessories';

export type Inventory = {
  id: string;
  barcode: string;
  name: string;
  category: InventoryCategory;
  brand: string | null;
  model: string | null;
  cost_price: number;
  sell_price: number;
  quantity: number;
  reorder_level: number;
  supplier: string | null;
  created_at: string;
};

export type Sale = {
  id: string;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: 'cash' | 'card' | 'partial' | 'installment';
  amount_paid: number;
  change_due: number;
  employee_id: string | null;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  inventory_id: string | null;
  item_name: string;
  barcode: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type OrderStatus = 'pending' | 'in_lab' | 'ready' | 'delivered';

export type Order = {
  id: string;
  customer_id: string;
  examination_id: string | null;
  status: OrderStatus;
  total_amount: number;
  amount_paid: number;
  balance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  inventory_id: string | null;
  item_name: string;
  item_type: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type CashRegister = {
  id: string;
  register_date: string;
  opening_balance: number;
  cash_in: number;
  cash_out: number;
  closing_balance: number;
  notes: string | null;
  employee_id: string | null;
  created_at: string;
};

export type ExpenseCategory =
  | 'rent'
  | 'utilities'
  | 'lab_fees'
  | 'supplier_payments'
  | 'salaries'
  | 'maintenance'
  | 'other';

export type Expense = {
  id: string;
  expense_date: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  payment_method: 'cash' | 'card' | 'transfer';
  created_at: string;
};

export type EmployeeRole = 'admin' | 'optometrist' | 'cashier';

export type Employee = {
  id: string;
  name: string;
  role: EmployeeRole;
  phone: string | null;
  email: string | null;
  salary: number;
  hire_date: string;
  status: 'active' | 'inactive';
  created_at: string;
};

export type Attendance = {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: 'present' | 'absent' | 'late' | 'leave';
  notes: string | null;
  created_at: string;
};

// ============ LABELS ============

export const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  frames: 'إطارات طبية',
  sunglasses: 'نظارات شمسية',
  contact_lenses: 'عدسات لاصقة',
  lenses: 'عدسات طبية',
  solutions: 'محاليل',
  accessories: 'إكسسوارات',
};

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'نقدي',
  card: 'بطاقة',
  partial: 'جزئي / أقساط',
  installment: 'تقسيط',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'قيد الانتظار',
  in_lab: 'في المختبر',
  ready: 'جاهز للاستلام',
  delivered: 'تم التسليم',
};

export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  rent: 'إيجار',
  utilities: 'مرافق',
  lab_fees: 'رسوم مختبر',
  supplier_payments: 'مدفوعات موردين',
  salaries: 'رواتب',
  maintenance: 'صيانة',
  other: 'أخرى',
};

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  admin: 'مدير',
  optometrist: 'طبيب بصريات',
  cashier: 'كاشير',
};

export const ATTENDANCE_LABELS: Record<string, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  leave: 'إجازة',
};

// ============ HELPERS ============

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('ar', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(d: string | null): string {
  if (!d) return '-';
  try {
    return new Intl.DateTimeFormat('ar', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(d));
  } catch {
    return d;
  }
}

export function formatDateTime(d: string | null): string {
  if (!d) return '-';
  try {
    return new Intl.DateTimeFormat('ar', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(d));
  } catch {
    return d;
  }
}

export function generateBarcode(): string {
  const prefix = '847';
  const random = Math.floor(1000000 + Math.random() * 9000000);
  return prefix + random.toString();
} 
