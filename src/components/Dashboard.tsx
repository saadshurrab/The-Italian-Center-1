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
  customers?: { name: string } | null;
}

interface TransactionRecord {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  created_at: string;
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

  // استخراج المبلغ المدفوع من الطلبية
  const getOrderPaidAmount = (o: OrderRecord) => {
    return Number(o.amount_paid ?? o.paid_amount ?? o.paid ?? 0);
  };

  // مقارنة التواريخ حسب المنطقة الزمنية المحلية
  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isSameMonth = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth()
    );
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const now = new Date();

        // جلب البيانات من كافة أقسام النظام (المحاسبة، المبيعات، الطلبيات، المخزون، الفحوصات، العملاء)
        const [
          salesRes,
          ordersRes,
          transactionsRes,
          inventoryRes,
          examsRes,
          customersRes,
          itemsRes,
        ] = await Promise.all([
          supabase.from('sales').select('id, total, created_at'),
          supabase
            .from('orders')
            .select('id, status, total_amount, total, amount_paid, paid_amount, paid, created_at, customers(name)'),
          supabase.from('transactions').select('id, amount, type, created_at'),
          supabase.from('inventory').select('id, name, quantity, reorder_level'),
          supabase.from('examinations').select('id, exam_date, created_at'),
          supabase.from('customers').select('id', { count: 'exact', head: true }),
          supabase
            .from('sale_items')
            .select('item_name, quantity')
            .order('quantity', { ascending: false })
            .limit(5),
        ]);

        const sales: SaleRecord[] = salesRes.data || [];
        const orders: OrderRecord[] = ordersRes.data || [];
        const transactions: TransactionRecord[] = transactionsRes.data || [];

        // 1. حساب الإيرادات من المبيعات المباشرة
        const monthSalesTotal = sales
          .filter((s) => s.created_at && isSameMonth(new Date(s.created_at), now))
          .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

        const todaySalesTotal = sales
          .filter((s) => s.created_at && isSameDay(new Date(s.created_at), now))
          .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

        // 2. حساب مقبوضات الطلبيات
        const monthOrdersPaid = orders
          .filter((o) => o.created_at && isSameMonth(new Date(o.created_at), now))
          .reduce((sum, o) => sum + getOrderPaidAmount(o), 0);

        const todayOrdersPaid = orders
          .filter((o) => o.created_at && isSameDay(new Date(o.created_at), now))
          .reduce((sum, o) => sum + getOrderPaidAmount(o), 0);

        // 3. ربط معاملات قسم المحاسبة (سندات القبر والصرف العامة)
        const todayIncomeTx = transactions
          .filter((t) => t.type === 'income' && t.created_at && isSameDay(new Date(t.created_at), now))
          .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const monthIncomeTx = transactions
          .filter((t) => t.type === 'income' && t.created_at && isSameMonth(new Date(t.created_at), now))
          .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const todayExpenseTx = transactions
          .filter((t) => t.type === 'expense' && t.created_at && isSameDay(new Date(t.created_at), now))
          .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const monthExpenseTx = transactions
          .filter((t) => t.type === 'expense' && t.created_at && isSameMonth(new Date(t.created_at), now))
          .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        // الإيرادات الإجمالية للمحل (مبيعات + دفوعات طلبيات + المقبوضات الأخرى)
        const todayTotalRevenue = todaySalesTotal + todayOrdersPaid + todayIncomeTx;
        const monthTotalRevenue = monthSalesTotal + monthOrdersPaid + monthIncomeTx;

        // 4. الفحوصات والطلبيات والمخزون
        const todayExamsCount = (examsRes.data || []).filter((e) => {
          const date = e.exam_date || e.created_at;
          return date && isSameDay(new Date(date), now);
        }).length;

        const activeOrders = orders.filter((o) => ['pending', 'in_lab', 'ready'].includes(o.status));
        const lowStock = (inventoryRes.data || []).filter(
          (i) => Number(i.quantity) <= Number(i.reorder_level)
        );

        setStats({
          todaySales: todayTotalRevenue,
          monthSales: monthTotalRevenue,
          todayExpenses: todayExpenseTx,
          monthExpenses: monthExpenseTx,
          activeOrders: activeOrders.length,
          lowStock: lowStock.length,
          todayExams: todayExamsCount,
          totalCustomers: customersRes.count || 0,
        });

        // 5. رسم بياني لإيرادات أخر 7 أيام
        const daysData: { day: string; amount: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const targetDate = new Date();
          targetDate.setDate(now.getDate() - i);

          const daySales = sales
            .filter((s) => s.created_at && isSameDay(new Date(s.created_at), targetDate))
            .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

          const dayOrders = orders
            .filter((o) => o.created_at && isSameDay(new Date(o.created_at), targetDate))
            .reduce((sum, o) => sum + getOrderPaidAmount(o), 0);

          const dayIncome = transactions
            .filter((t) => t.type === 'income' && t.created_at && isSameDay(new Date(t.created_at), targetDate))
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

          daysData.push({
            day: new Intl.DateTimeFormat('ar', { weekday: 'short' }).format(targetDate),
            amount: daySales + dayOrders + dayIncome,
          });
        }
        setRevenueData(daysData);

        // 6. قوائم المنتجات والطلبيات والمخزون
        setTopItems((itemsRes.data || []).map((i) => ({ name: i.item_name, qty: Number(i.quantity) || 0 })));
        setLowStockItems(lowStock.slice(0, 5));

        const activeList = activeOrders.slice(0, 5).map((o) => ({
          id: o.id,
          status: o.status,
          total_amount: Number(o.total_amount ?? o.total ?? 0),
          customer_name: (Array.isArray(o.customers) ? o.customers[0]?.name : o.customers?.name) || 'عميل نقدي',
        }));
        setActiveOrdersList(activeList);
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
      {/* بطاقات المؤشرات المالية الرئيسية */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">
        <StatCard
          label="إيرادات اليوم"
          value={formatCurrency(stats.todaySales)}
          icon={<DollarSign className="w-6 h-6 text-white" />}
          color="accent"
        />
        <StatCard
          label="إيرادات الشهر"
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
          label="صافي إيراد الشهر"
          value={formatCurrency(stats.monthSales - stats.monthExpenses)}
          icon={<ArrowUpCircle className="w-6 h-6 text-white" />}
          color="brand"
        />
      </div>

      {/* بطاقات التشغيل والعملاء */}
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

      {/* الرسوم البيانية والأكثر مبيعاً */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="font-display font-bold text-lg text-slate-800 dark:text-white mb-4">
            إيرادات آخر 7 أيام (المبيعات + المقبوضات)
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
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{item.name}</span>
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

      {/* جداول المتابعة السريعة */}
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
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.name}</span>
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
                      {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] || order.status}
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
