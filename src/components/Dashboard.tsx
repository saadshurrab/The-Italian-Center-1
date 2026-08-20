import { useEffect, useState } from 'react';
import {
  TrendingUp,
  ShoppingCart,
  Package,
  Eye,
  AlertTriangle,
  DollarSign,
  Clock,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-react';
import { supabase, formatCurrency, ORDER_STATUS_LABELS } from '@/lib/supabase';
import { StatCard, LoadingSpinner } from '@/components/ui';

interface SaleRecord {
  id?: string;
  total?: number;
  payment_method?: string;
  created_at: string;
}

interface OrderRecord {
  id: string;
  status: string;
  total_amount?: number;
  total?: number;
  amount_paid?: number;
  paid_amount?: number;
  paid?: number;
  created_at: string;
  customers?: { name: string } | { name: string }[];
}

interface PaymentRecord {
  id: string;
  amount: number;
  payment_date?: string;
  created_at?: string;
}

interface ExpenseRecord {
  id: string;
  amount: number;
  expense_date?: string;
  created_at?: string;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todaySales: 0,
    monthSales: 0,
    todayExpenses: 0,
    monthExpenses: 0,
    activeOrders: 0,
    lowStock: 0,
    todayExams: 0,
    totalCustomers: 0,
  });

  const [revenueData, setRevenueData] = useState<{ day: string; amount: number }[]>([]);
  const [topItems, setTopItems] = useState<{ name: string; qty: number }[]>([]);
  const [lowStockItems, setLowStockItems] = useState<
    { id: string; name: string; quantity: number; reorder_level: number }[]
  >([]);
  const [activeOrdersList, setActiveOrdersList] = useState<
    { id: string; status: string; total_amount: number; customer_name: string }[]
  >([]);

  // دوال التحقق من التواريخ
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  const isThisMonth = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  };

  const isToday = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return (
      d.getFullYear() === currentYear &&
      d.getMonth() === currentMonth &&
      d.getDate() === currentDay
    );
  };

  const isSameDay = (dateStr: string, targetDate: Date) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    return (
      d.getFullYear() === targetDate.getFullYear() &&
      d.getMonth() === targetDate.getMonth() &&
      d.getDate() === targetDate.getDate()
    );
  };

  const getOrderTotalAmount = (o: OrderRecord) => {
    return Number(o.total_amount ?? o.total ?? 0);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [
          salesRes,
          ordersRes,
          paymentsRes,
          expensesRes,
          inventoryRes,
          examsRes,
          customersRes,
          itemsRes,
        ] = await Promise.all([
          supabase.from('sales').select('id, total, created_at'),
          supabase.from('orders').select('*, customers(name)'),
          // جلب جدول المدفوعات إن وجد أو الاعتماد على تفاصيل مدفوعات الطلبيات
          supabase.from('order_payments').select('id, amount, created_at, payment_date'),
          supabase.from('expenses').select('*'),
          supabase.from('inventory').select('*'),
          supabase.from('examinations').select('*'),
          supabase.from('customers').select('id', { count: 'exact', head: true }),
          supabase
            .from('sale_items')
            .select('item_name, quantity')
            .order('quantity', { ascending: false })
            .limit(5),
        ]);

        const sales: SaleRecord[] = salesRes.data || [];
        const orders: OrderRecord[] = ordersRes.data || [];
        const payments: PaymentRecord[] = paymentsRes.data || [];
        const expenses: ExpenseRecord[] = expensesRes.data || [];

        // 1. مبيعات المعرض المباشرة
        const todaySalesDirect = sales
          .filter((s) => isToday(s.created_at))
          .reduce((sum, s) => sum + Number(s.total || 0), 0);

        const monthSalesDirect = sales
          .filter((s) => isThisMonth(s.created_at))
          .reduce((sum, s) => sum + Number(s.total || 0), 0);

        // 2. مدفوعات ومقدمات الطلبيات المقبوضة
        let todayPaymentsTotal = 0;
        let monthPaymentsTotal = 0;

        if (payments.length > 0) {
          // إذا كان جدول المدفوعات متوفر وسجلت به المقدمات
          todayPaymentsTotal = payments
            .filter((p) => isToday(p.payment_date || p.created_at))
            .reduce((sum, p) => sum + Number(p.amount || 0), 0);

          monthPaymentsTotal = payments
            .filter((p) => isThisMonth(p.payment_date || p.created_at))
            .reduce((sum, p) => sum + Number(p.amount || 0), 0);
        } else {
          // fallback: حساب مجموع المبالغ المدفوعة من جدول الطلبيات
          todayPaymentsTotal = orders
            .reduce((sum, o) => sum + Number(o.amount_paid ?? o.paid_amount ?? o.paid ?? 0), 0);

          monthPaymentsTotal = todayPaymentsTotal;
        }

        // الإيرادات الإجمالية المقبوضة = مبيعات المعرض + مقدمات/مدفوعات الطلبيات
        const todayRevenue = todaySalesDirect + todayPaymentsTotal;
        const monthRevenue = monthSalesDirect + monthPaymentsTotal;

        // 3. المصروفات
        const todayExpenses = expenses
          .filter((e) => isToday(e.expense_date || e.created_at))
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);

        const monthExpenses = expenses
          .filter((e) => isThisMonth(e.expense_date || e.created_at))
          .reduce((sum, e) => sum + Number(e.amount || 0), 0);

        // 4. مؤشرات الطلبيات والمخزون
        const activeOrders = orders.filter((o) =>
          ['pending', 'in_lab', 'ready'].includes(o.status)
        );

        const lowStock = (inventoryRes.data || []).filter(
          (i) => Number(i.quantity) <= Number(i.reorder_level)
        );

        const todayExams = (examsRes.data || []).filter((e) =>
          isToday(e.exam_date || e.created_at)
        ).length;

        setStats({
          todaySales: todayRevenue,
          monthSales: monthRevenue,
          todayExpenses: todayExpenses,
          monthExpenses: monthExpenses,
          activeOrders: activeOrders.length,
          lowStock: lowStock.length,
          todayExams: todayExams,
          totalCustomers: customersRes.count || 0,
        });

        // 5. رسم بياني للإيرادات لآخر 7 أيام
        const daysData: { day: string; amount: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const targetDate = new Date();
          targetDate.setDate(now.getDate() - i);

          const daySales = sales
            .filter((s) => isSameDay(s.created_at, targetDate))
            .reduce((sum, s) => sum + Number(s.total || 0), 0);

          const dayPayments = payments.length > 0
            ? payments
                .filter((p) => isSameDay(p.payment_date || p.created_at || '', targetDate))
                .reduce((sum, p) => sum + Number(p.amount || 0), 0)
            : (isSameDay(now.toISOString(), targetDate) ? todayPaymentsTotal : 0);

          daysData.push({
            day: new Intl.DateTimeFormat('ar', { weekday: 'short' }).format(targetDate),
            amount: daySales + dayPayments,
          });
        }
        setRevenueData(daysData);

        // 6. القوائم الجانبية
        setTopItems(
          (itemsRes.data || []).map((i) => ({
            name: i.item_name,
            qty: Number(i.quantity) || 0,
          }))
        );

        setLowStockItems(
          lowStock.slice(0, 5).map((i) => ({
            id: i.id,
            name: i.name,
            quantity: Number(i.quantity) || 0,
            reorder_level: Number(i.reorder_level) || 0,
          }))
        );

        setActiveOrdersList(
          activeOrders.slice(0, 5).map((o) => ({
            id: o.id,
            status: o.status,
            total_amount: getOrderTotalAmount(o),
            customer_name:
              (Array.isArray(o.customers) ? o.customers[0]?.name : o.customers?.name) ||
              'عميل نقدي',
          }))
        );
      } catch (error) {
        console.error('خطأ في جلب بيانات لوحة التحكم:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const maxRevenue = Math.max(...revenueData.map((d) => d.amount), 1);
  const maxItemQty = Math.max(...topItems.map((i) => i.qty), 1);

  return (
    <div className="space-y-6">
      {/* بطاقات المقبوضات والأرباح */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="إيرادات اليوم المقبوضة"
          value={formatCurrency(stats.todaySales)}
          icon={<DollarSign className="w-6 h-6 text-white" />}
          color="accent"
        />
        <StatCard
          label="إجمالي المقبوضات الشهرية"
          value={formatCurrency(stats.monthSales)}
          icon={<TrendingUp className="w-6 h-6 text-white" />}
          color="brand"
        />
        <StatCard
          label="مصروفات اليوم"
          value={formatCurrency(stats.todayExpenses)}
          icon={<ArrowDownCircle className="w-6 h-6 text-white" />}
          color="error"
        />
        <StatCard
          label="صافي أرباح الشهر"
          value={formatCurrency(stats.monthSales - stats.monthExpenses)}
          icon={<ArrowUpCircle className="w-6 h-6 text-white" />}
          color="brand"
        />
      </div>

      {/* المؤشرات الأخرى */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="طلبيات نشطة"
          value={stats.activeOrders}
          icon={<ShoppingCart className="w-6 h-6 text-white" />}
          color="warning"
        />
        <StatCard
          label="تنبيه المخزون"
          value={stats.lowStock}
          icon={<AlertTriangle className="w-6 h-6 text-white" />}
          color="error"
        />
        <StatCard
          label="فحوصات اليوم"
          value={stats.todayExams}
          icon={<Eye className="w-6 h-6 text-white" />}
          color="brand"
        />
        <StatCard
          label="إجمالي العملاء"
          value={stats.totalCustomers}
          icon={<Package className="w-6 h-6 text-white" />}
          color="accent"
        />
      </div>

      {/* الرسم البياني والأكثر مبيعاً */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="font-display font-bold text-lg text-slate-800 dark:text-white mb-4">
            إيرادات آخر 7 أيام (المقبوضات الفعلية)
          </h3>
          <div className="flex items-end justify-between gap-2 h-48">
            {revenueData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-[10px] text-slate-400 font-medium">
                  {d.amount > 0 ? formatCurrency(d.amount) : ''}
                </span>
                <div
                  className="w-full bg-gradient-to-t from-brand-500 to-brand-300 rounded-t-lg transition-all duration-500 hover:from-brand-600 hover:to-brand-400"
                  style={{ height: `${(d.amount / maxRevenue) * 100}%`, minHeight: '4px' }}
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display font-bold text-lg text-slate-800 dark:text-white mb-4">
            أكثر المنتجات مبيعاً
          </h3>
          {topItems.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">لا توجد بيانات بعد</p>
          ) : (
            <div className="space-y-3">
              {topItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                        {item.name}
                      </span>
                      <span className="text-xs text-slate-400">{item.qty} قطعة</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-l from-accent-400 to-accent-600 rounded-full transition-all duration-500"
                        style={{ width: `${(item.qty / maxItemQty) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* التنبيهات والطلبيات */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-error-500" />
            <h3 className="font-display font-bold text-lg text-slate-800 dark:text-white">
              تنبيهات المخزون المنخفض
            </h3>
          </div>
          {lowStockItems.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">جميع المنتجات بمخزون كافٍ</p>
          ) : (
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-100 dark:border-error-900/40"
                >
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {item.name}
                  </span>
                  <span className="text-sm font-bold text-error-600 dark:text-error-400">
                    {item.quantity} / {item.reorder_level}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-warning-500" />
            <h3 className="font-display font-bold text-lg text-slate-800 dark:text-white">
              الطلبيات النشطة
            </h3>
          </div>
          {activeOrdersList.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">لا توجد طلبيات نشطة</p>
          ) : (
            <div className="space-y-2">
              {activeOrdersList.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/40"
                >
                  <div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {order.customer_name}
                    </span>
                    <span className="text-xs text-slate-400 block">
                      {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ||
                        order.status}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    {formatCurrency(order.total_amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
