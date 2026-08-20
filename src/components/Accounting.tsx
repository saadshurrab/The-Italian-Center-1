import { useEffect, useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Plus,
  Search,
} from 'lucide-react';
import { supabase, formatCurrency, formatDate, PAYMENT_LABELS } from '@/lib/supabase';
import { PageHeader, Modal, Badge, LoadingSpinner, EmptyState } from '@/components/ui';

interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  payment_method: string;
  expense_date: string;
}

interface CashRegister {
  id: string;
  opening_balance: number;
  closing_balance: number;
  total_in: number;
  total_out: number;
  notes: string;
  register_date: string;
}

interface OrderRecord {
  id: string;
  total_amount?: number;
  total?: number;
  amount_paid?: number;
  paid_amount?: number;
  paid?: number;
  payment_method?: string;
  created_at: string;
}

export default function Accounting() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'expenses' | 'cash'>('overview');

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [expenseSearch, setExpenseSearch] = useState('');

  const [expenseForm, setExpenseForm] = useState({
    category: 'مشتريات وبضاعة',
    amount: '',
    description: '',
    payment_method: 'cash',
    expense_date: new Date().toISOString().split('T')[0],
  });

  const [cashForm, setCashForm] = useState({
    opening_balance: '',
    closing_balance: '',
    notes: '',
    register_date: new Date().toISOString().split('T')[0],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expRes, cashRes, salesRes, ordersRes] = await Promise.all([
        supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('cash_register').select('*').order('register_date', { ascending: false }),
        supabase.from('sales').select('total, payment_method, created_at').order('created_at', { ascending: false }),
        // جلب جميع حقول المبالغ المحتملة للطلبيات
        supabase.from('orders').select('id, total_amount, total, amount_paid, paid_amount, paid, payment_method, created_at').order('created_at', { ascending: false }),
      ]);

      if (expRes.error) throw expRes.error;
      if (cashRes.error) throw cashRes.error;

      setExpenses(expRes.data || []);
      setCashRegisters(cashRes.data || []);
      setSales(salesRes.data || []);
      setOrders(ordersRes.data || []);
    } catch (error: any) {
      console.error('خطأ في جلب البيانات المالية:', error);
      alert('حدث خطأ أثناء تحميل البيانات: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 1. حساب مبيعات المعرض المباشرة
  const monthSalesTotal = sales
    .filter((s) => s.created_at >= monthStart)
    .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  const todaySalesTotal = sales
    .filter((s) => s.created_at >= todayStart)
    .reduce((sum, s) => sum + (Number(s.total) || 0), 0);

  // 2. حساب إجمالي قيم الطلبيات (المبلغ الكلي لكل طلبية)
  const monthOrdersTotalAmount = orders
    .filter((o) => o.created_at >= monthStart)
    .reduce((sum, o) => sum + Number(o.total_amount ?? o.total ?? 0), 0);

  // 3. حساب المقبوضات الفعلية المدفوعة من الطلبيات
  const monthOrdersPaid = orders
    .filter((o) => o.created_at >= monthStart)
    .reduce((sum, o) => sum + Number(o.amount_paid ?? o.paid_amount ?? o.paid ?? 0), 0);

  const todayOrdersPaid = orders
    .filter((o) => o.created_at >= todayStart)
    .reduce((sum, o) => sum + Number(o.amount_paid ?? o.paid_amount ?? o.paid ?? 0), 0);

  // 4. المجموع الإجمالي للإيرادات المقبوضة (المبيعات + مدفوعات الطلبيات)
  const monthTotalRevenue = monthSalesTotal + monthOrdersPaid;
  const todayTotalRevenue = todaySalesTotal + todayOrdersPaid;

  // المصاريف
  const monthExpensesTotal = expenses
    .filter((e) => e.expense_date >= monthStart.split('T')[0])
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const todayExpensesTotal = expenses
    .filter((e) => e.expense_date >= todayStart.split('T')[0])
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // صافي الأرباح
  const monthNetProfit = monthTotalRevenue - monthExpensesTotal;
  const todayNetProfit = todayTotalRevenue - todayExpensesTotal;

  // تجميع المبيعات حسب طرق الدفع
  const paymentStats = [...sales, ...orders].reduce(
    (acc, item) => {
      const method = item.payment_method || 'cash';
      const amount = Number(item.amount_paid ?? item.paid_amount ?? item.paid ?? item.total ?? 0);
      if (method === 'cash') acc.cash += amount;
      else if (method === 'card') acc.card += amount;
      else if (method === 'transfer') acc.transfer += amount;
      return acc;
    },
    { cash: 0, card: 0, transfer: 0 }
  );

  const handleSaveExpense = async () => {
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      alert('يرجى إدخال مبلغ صحيح للمصروف');
      return;
    }

    try {
      const { error } = await supabase.from('expenses').insert({
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        description: expenseForm.description,
        payment_method: expenseForm.payment_method,
        expense_date: expenseForm.expense_date,
      });

      if (error) throw error;

      setShowExpenseModal(false);
      setExpenseForm({
        category: 'مشتريات وبضاعة',
        amount: '',
        description: '',
        payment_method: 'cash',
        expense_date: new Date().toISOString().split('T')[0],
      });
      fetchData();
    } catch (error: any) {
      alert('خطأ أثناء حفظ المصروف: ' + error.message);
    }
  };

  const handleSaveCashRegister = async () => {
    const opening = Number(cashForm.opening_balance) || 0;
    const closing = Number(cashForm.closing_balance) || 0;

    try {
      const { error } = await supabase.from('cash_register').insert({
        opening_balance: opening,
        closing_balance: closing,
        total_in: todayTotalRevenue,
        total_out: todayExpensesTotal,
        notes: cashForm.notes,
        register_date: cashForm.register_date,
      });

      if (error) throw error;

      setShowCashModal(false);
      setCashForm({
        opening_balance: '',
        closing_balance: '',
        notes: '',
        register_date: new Date().toISOString().split('T')[0],
      });
      fetchData();
    } catch (error: any) {
      alert('خطأ أثناء تسجيل الصندوق: ' + error.message);
    }
  };

  const filteredExpenses = expenses.filter(
    (e) =>
      e.description?.toLowerCase().includes(expenseSearch.toLowerCase()) ||
      e.category?.toLowerCase().includes(expenseSearch.toLowerCase())
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="المحاسبة والشؤون المالية"
        subtitle="إدارة وتتبع الإيرادات، المصروفات، تسوية الصندوق، وحساب صافي الأرباح"
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowCashModal(true)} className="btn-secondary flex items-center gap-2">
              <Wallet className="w-4 h-4" /> تسوية الصندوق
            </button>
            <button onClick={() => setShowExpenseModal(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> إضافة مصروف
            </button>
          </div>
        }
      />

      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'overview'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          نظرة عامة والملخص المالي
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'expenses'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          سجل المصروفات والنفقات
        </button>
        <button
          onClick={() => setActiveTab('cash')}
          className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'cash'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          حركة وتقفيل الصندوق (الكاش)
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent-100 dark:bg-accent-900/40 text-accent-600 dark:text-accent-400 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">إجمالي المقبوضات الإجمالية</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(monthTotalRevenue)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">مقبوضات اليوم: {formatCurrency(todayTotalRevenue)}</p>
              </div>
            </div>

            <div className="card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-error-100 dark:bg-error-900/40 text-error-600 dark:text-error-400 flex items-center justify-center">
                <TrendingDown className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">مصروفات الشهر الحالي</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(monthExpensesTotal)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">اليوم: {formatCurrency(todayExpensesTotal)}</p>
              </div>
            </div>

            <div className="card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">صافي أرباح الشهر</p>
                <p className={`text-xl font-bold ${monthNetProfit >= 0 ? 'text-accent-600 dark:text-accent-400' : 'text-error-600'}`}>
                  {formatCurrency(monthNetProfit)}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">اليوم: {formatCurrency(todayNetProfit)}</p>
              </div>
            </div>

            <div className="card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">رصيد الصندوق الحالي</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {formatCurrency(cashRegisters[0]?.closing_balance || paymentStats.cash)}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">آخر تسوية: {cashRegisters[0] ? formatDate(cashRegisters[0].register_date) : 'لا يوجد'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card p-5 lg:col-span-2 space-y-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">المبيعات والمقبوضات حسب طريقة الدفع</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">نقداً (كاش)</span>
                  <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatCurrency(paymentStats.cash)}</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">بطاقة إلكترونية</span>
                  <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatCurrency(paymentStats.card)}</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                  <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">تحويل بنكي</span>
                  <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatCurrency(paymentStats.transfer)}</span>
                </div>
              </div>
            </div>

            <div className="card p-5 space-y-4">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">تفاصيل مقبوضات الشهر</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-500">مبيعات المعرض المباشرة:</span>
                  <span className="font-semibold">{formatCurrency(monthSalesTotal)}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-500">مدفوعات ومقدمات الطلبيات:</span>
                  <span className="font-semibold text-accent-600">+{formatCurrency(monthOrdersPaid)}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-500">إجمالي قيمة الطلبيات الكلية:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(monthOrdersTotalAmount)}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                  <span className="text-slate-500">إجمالي النفقات:</span>
                  <span className="font-semibold text-error-600">-{formatCurrency(monthExpensesTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                placeholder="ابحث في سجل المصروفات..."
                className="input pr-10"
              />
            </div>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="card">
              <EmptyState message="لا توجد مصروفات مسجلة" icon={<TrendingDown className="w-10 h-10" />} />
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">التصنيف</th>
                    <th className="p-3">الوصف / التفاصيل</th>
                    <th className="p-3">طريقة الدفع</th>
                    <th className="p-3 text-left">المبلغ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(expense.expense_date)}</td>
                      <td className="p-3 font-semibold">{expense.category}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{expense.description || '—'}</td>
                      <td className="p-3">
                        <Badge text={PAYMENT_LABELS[expense.payment_method] || expense.payment_method} color="slate" />
                      </td>
                      <td className="p-3 text-left font-bold text-error-600 dark:text-error-400">
                        {formatCurrency(expense.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'cash' && (
        <div className="space-y-4">
          {cashRegisters.length === 0 ? (
            <div className="card">
              <EmptyState message="لا توجد سجلات لتسوية الصندوق" icon={<Wallet className="w-10 h-10" />} />
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">الرصيد الافتتاحي</th>
                    <th className="p-3">إجمالي المقبوضات</th>
                    <th className="p-3">إجمالي المصروفات</th>
                    <th className="p-3">الرصيد الختامي</th>
                    <th className="p-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {cashRegisters.map((reg) => (
                    <tr key={reg.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(reg.register_date)}</td>
                      <td className="p-3 font-medium">{formatCurrency(reg.opening_balance)}</td>
                      <td className="p-3 font-semibold text-accent-600">+{formatCurrency(reg.total_in)}</td>
                      <td className="p-3 font-semibold text-error-600">-{formatCurrency(reg.total_out)}</td>
                      <td className="p-3 font-bold text-brand-600 dark:text-brand-400">{formatCurrency(reg.closing_balance)}</td>
                      <td className="p-3 text-slate-400">{reg.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={showExpenseModal} onClose={() => setShowExpenseModal(false)} title="إضافة مصروف جديد">
        <div className="space-y-4">
          <div>
            <label className="label">تصنيف المصروف</label>
            <select
              value={expenseForm.category}
              onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              className="input"
            >
              <option>مشتريات وبضاعة</option>
              <option>إيجار ومرافق</option>
              <option>رواتب وإكراميات</option>
              <option>صيانة وأدوات</option>
              <option>تسويق وإعلانات</option>
              <option>نثريات ومصروفات أخرى</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">المبلغ *</label>
              <input
                type="number"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                placeholder="0.00"
                className="input"
              />
            </div>
            <div>
              <label className="label">طريقة الدفع</label>
              <select
                value={expenseForm.payment_method}
                onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                className="input"
              >
                <option value="cash">نقدي (كاش)</option>
                <option value="card">بطاقة</option>
                <option value="transfer">تحويل بنكي</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">التاريخ</label>
            <input
              type="date"
              value={expenseForm.expense_date}
              onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
              className="input"
            />
          </div>

          <div>
            <label className="label">تفاصيل المصروف</label>
            <textarea
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              placeholder="اكتب بيان المصروف..."
              className="input min-h-[70px]"
            />
          </div>

          <button onClick={handleSaveExpense} className="btn-primary w-full py-2.5">
            حفظ المصروف
          </button>
        </div>
      </Modal>

      <Modal open={showCashModal} onClose={() => setShowCashModal(false)} title="تسوية وإغلاق الصندوق">
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs space-y-1">
            <div className="flex justify-between">
              <span>مقبوضات اليوم الإجمالية:</span>
              <span className="font-bold text-accent-600">{formatCurrency(todayTotalRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span>مصروفات اليوم الإجمالية:</span>
              <span className="font-bold text-error-600">{formatCurrency(todayExpensesTotal)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">الرصيد الافتتاحي</label>
              <input
                type="number"
                value={cashForm.opening_balance}
                onChange={(e) => setCashForm({ ...cashForm, opening_balance: e.target.value })}
                placeholder="0.00"
                className="input"
              />
            </div>
            <div>
              <label className="label">الرصيد الختامي (الفعلي بالدرج)</label>
              <input
                type="number"
                value={cashForm.closing_balance}
                onChange={(e) => setCashForm({ ...cashForm, closing_balance: e.target.value })}
                placeholder="0.00"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">تاريخ التسوية</label>
            <input
              type="date"
              value={cashForm.register_date}
              onChange={(e) => setCashForm({ ...cashForm, register_date: e.target.value })}
              className="input"
            />
          </div>

          <div>
            <label className="label">ملاحظات والتسوية</label>
            <textarea
              value={cashForm.notes}
              onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })}
              placeholder="أي فروقات أو ملاحظات حول الصندوق..."
              className="input min-h-[60px]"
            />
          </div>

          <button onClick={handleSaveCashRegister} className="btn-primary w-full py-2.5">
            حفظ تسوية الصندوق
          </button>
        </div>
      </Modal>
    </div>
  );
}
