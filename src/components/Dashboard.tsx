import { useEffect, useState } from 'react';
import {
  TrendingUp,
  ShoppingCart,
  Package,
  Eye,
  AlertTriangle,
  DollarSign,
  Clock,
} from 'lucide-react';
import { supabase, formatCurrency, ORDER_STATUS_LABELS } from '@/lib/supabase';
import { StatCard, LoadingSpinner } from '@/components/ui';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todaySales: 0,
    monthSales: 0,
    activeOrders: 0,
    lowStock: 0,
    todayExams: 0,
    totalCustomers: 0,
  });
  const [recentSales, setRecentSales] = useState<
    { id: string; total: number; payment_method: string; created_at: string }[]
  >([]);
  const [revenueData, setRevenueData] = useState<{ day: string; amount: number }[]>([]);
  const [topItems, setTopItems] = useState<{ name: string; qty: number }[]>([]);
  const [lowStockItems, setLowStockItems] = useState<
    { id: string; name: string; quantity: number; reorder_level: number }[]
  >([]);
  const [activeOrdersList, setActiveOrdersList] = useState<
    { id: string; status: string; total_amount: number; customer_name: string }[]
  >([]);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [salesRes, monthSalesRes, ordersRes, inventoryRes, examsRes, customersRes] =
        await Promise.all([
          supabase.from('sales').select('total, payment_method, created_at').gte('created_at', todayStart),
          supabase.from('sales').select('total').gte('created_at', monthStart),
          supabase.from('orders').select('id, status, total_amount, customer_id, customers(name)').in('status', ['pending', 'in_lab', 'ready']),
          supabase.from('inventory').select('id, name, quantity, reorder_level, category'),
          supabase.from('examinations').select('id').gte('exam_date', todayStart.slice(0, 10)),
          supabase.from('customers').select('id', { count: 'exact', head: true }),
        ]);

      const todayTotal = (salesRes.data || []).reduce((s, r) => s + Number(r.total), 0);
      const monthTotal = (monthSalesRes.data || []).reduce((s, r) => s + Number(r.total), 0);
      const lowStock = (inventoryRes.data || []).filter((i) => i.quantity <= i.reorder_level);

      setStats({
        todaySales: todayTotal,
        monthSales: monthTotal,
        activeOrders: (ordersRes.data || []).length,
        lowStock: lowStock.length,
        todayExams: (examsRes.data || []).length,
        totalCustomers: customersRes.count || 0,
      });

      setRecentSales((salesRes.data || []).slice(-5).reverse());

      // Revenue last 7 days
      const days: { day: string; amount: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
        const { data } = await supabase
          .from('sales')
          .select('total')
          .gte('created_at', dayStart)
          .lt('created_at', dayEnd);
        const amt = (data || []).reduce((s, r) => s + Number(r.total), 0);
        days.push({
          day: new Intl.DateTimeFormat('ar', { weekday: 'short' }).format(d),
          amount: amt,
        });
      }
      setRevenueData(days);

      // Top selling items
      const { data: itemsData } = await supabase
        .from('sale_items')
        .select('item_name, quantity')
        .order('quantity', { ascending: false })
        .limit(5);
      setTopItems((itemsData || []).map((i) => ({ name: i.item_name, qty: i.quantity })));

      setLowStockItems(lowStock.slice(0, 5));

      // Active orders with customer names
      const ordersWithNames = (ordersRes.data || []).slice(0, 5).map((o: any) => ({
        id: o.id,
        status: o.status,
        total_amount: o.total_amount,
        customer_name: o.customers?.name || '—',
      }));
      setActiveOrdersList(ordersWithNames);
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const maxRevenue = Math.max(...revenueData.map((d) => d.amount), 1);
  const maxItemQty = Math.max(...topItems.map((i) => i.qty), 1);

  return (
    <div>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <StatCard label="مبيعات اليوم" value={formatCurrency(stats.todaySales)} icon={<DollarSign className="w-6 h-6 text-white" />} color="accent" />
        <StatCard label="مبيعات الشهر" value={formatCurrency(stats.monthSales)} icon={<TrendingUp className="w-6 h-6 text-white" />} color="brand" />
        <StatCard label="طلبيات نشطة" value={stats.activeOrders} icon={<ShoppingCart className="w-6 h-6 text-white" />} color="warning" />
        <StatCard label="تنبيه المخزون" value={stats.lowStock} icon={<AlertTriangle className="w-6 h-6 text-white" />} color="error" />
        <StatCard label="فحوصات اليوم" value={stats.todayExams} icon={<Eye className="w-6 h-6 text-white" />} color="brand" />
        <StatCard label="إجمالي العملاء" value={stats.totalCustomers} icon={<Package className="w-6 h-6 text-white" />} color="accent" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Revenue chart */}
        <div className="card p-6">
          <h3 className="font-display font-bold text-lg text-slate-800 dark:text-white mb-4">
            إيرادات آخر 7 أيام
          </h3>
          <div className="flex items-end justify-between gap-2 h-48">
            {revenueData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">
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

        {/* Top items */}
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

      {/* Low stock + Active orders */}
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
                      {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS]}
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
