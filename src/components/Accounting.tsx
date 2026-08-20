import { useEffect, useState } from 'react';
import { Wallet, Plus, Search, Trash2, TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import {
  supabase,
  formatCurrency,
  formatDate,
  EXPENSE_LABELS,
  PAYMENT_LABELS,
  type Expense,
  type ExpenseCategory,
  type CashRegister,
  type Employee,
} from '@/lib/supabase';
import { PageHeader, Modal, Badge, LoadingSpinner, EmptyState, StatCard } from '@/components/ui';

const EXPENSE_CATS = Object.keys(EXPENSE_LABELS) as ExpenseCategory[];

interface PaymentRecord {
  id: string;
  amount: number;
  payment_method: 'cash' | 'card' | 'transfer' | 'partial' | 'installment';
  created_at: string;
  source_type?: 'order' | 'invoice' | 'debt';
}

export default function Accounting() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'cash' | 'expenses'>('overview');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashEntries, setCashEntries] = useState<CashRegister[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  
  const [expenseForm, setExpenseForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    category: 'rent' as ExpenseCategory,
    description: '',
    amount: '',
    payment_method: 'cash' as 'cash' | 'card' | 'transfer',
  });
  
  const [cashForm, setCashForm] = useState({
    register_date: new Date().toISOString().slice(0, 10),
    opening_balance: '',
    cash_in: '',
    cash_out: '',
    closing_balance: '',
    notes: '',
    employee_id: '',
  });

  const fetchData = async () => {
    const [expRes, cashRes, payRes, empRes] = await Promise.all([
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('cash_register').select('*').order('register_date', { ascending: false }),
      // جلب جميع التدفقات المالية المقبوضة من جدول المدفوعات الموحد
      supabase.from('payments').select('id, amount, payment_method, created_at, source_type').order('created_at', { ascending: false }),
      supabase.from('employees').select('*').order('name'),
    ]);

    setExpenses(expRes.data || []);
    setCashEntries(cashRes.data || []);
    setPayments(payRes.data || []);
    setEmployees(empRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // تحديد بداية اليوم والشهر بدقة بحسب التواريخ الحالية
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // حساب المقبوضات الفعلية (الطلبيات + الفواتير + تسديد الديون)
  const monthSales = payments
    .filter((p) => p.created_at >= monthStart)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const todaySales = payments
    .filter((p) => p.created_at >= todayStart)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const monthExpenses = expenses
    .filter((e) => e.expense_date >= monthStart.slice(0, 10))
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const profit = monthSales - monthExpenses;

  const filteredExpenses = expenses.filter((e) => {
    const matchSearch = (e.description || '').includes(search) || (EXPENSE_LABELS[e.category] || '').includes(search);
    const matchCat = filterCat === 'all' || e.category === filterCat;
    return matchSearch && matchCat;
  });

  async function saveExpense() {
    if (!expenseForm.amount) { alert('الرجاء إدخال المبلغ'); return; }
    const { error } = await supabase.from('expenses').insert({
      expense_date: expenseForm.expense_date,
      category: expenseForm.category,
      description: expenseForm.description || null,
      amount: parseFloat(expenseForm.amount),
      payment_method: expenseForm.payment_method,
    });
    if (error) { alert('خطأ: ' + error.message); return; }
    
    await fetchData();
    setShowExpenseModal(false);
    setExpenseForm({ ...expenseForm, description: '', amount: '' });
  }

  async function saveCash() {
    const { error } = await supabase.from('cash_register').insert({
      register_date: cashForm.register_date,
      opening_balance: parseFloat(cashForm.opening_balance) || 0,
      cash_in: parseFloat(cashForm.cash_in) || 0,
      cash_out: parseFloat(cashForm.cash_out) || 0,
      closing_balance: parseFloat(cashForm.closing_balance) || 0,
      notes: cashForm.notes || null,
      employee_id: cashForm.employee_id || null,
    });
    if (error) { alert('خطأ: ' + error.message); return; }
    
    await fetchData();
    setShowCashModal(false);
    setCashForm({ ...cashForm, opening_balance: '', cash_in: '', cash_out: '', closing_balance: '', notes: '', employee_id: '' });
  }

  async function deleteExpense(id: string) {
    if (!confirm('هل أنت متأكد؟')) return;
    await supabase.from('expenses').delete().eq('id', id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="المحاسبة والصندوق" subtitle="إدارة النقدية والمصروفات والتقارير المالية" />

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
        {([
          { id: 'overview', label: 'نظرة عامة' },
          { id: 'cash', label: 'الصندوق' },
          { id: 'expenses', label: 'المصروفات' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="مبيعات اليوم (المقبوضات)" value={formatCurrency(todaySales)} icon={<DollarSign className="w-6 h-6 text-white" />} color="accent" />
            <StatCard label="مبيعات الشهر (المقبوضات)" value={formatCurrency(monthSales)} icon={<TrendingUp className="w-6 h-6 text-white" />} color="brand" />
            <StatCard label="مصروفات الشهر" value={formatCurrency(monthExpenses)} icon={<TrendingDown className="w-6 h-6 text-white" />} color="error" />
            <StatCard label="صافي الربح" value={formatCurrency(profit)} icon={<Wallet className="w-6 h-6 text-white" />} color={profit >= 0 ? 'accent' : 'error'} />
          </div>

          {/* Sales by payment method */}
          <div className="card p-6">
            <h3 className="font-display font-bold text-lg text-slate-800 dark:text-white mb-4">المبيعات حسب طريقة الدفع (الشهر الحالي)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(['cash', 'card', 'transfer', 'installment'] as const).map((m) => {
                const total = payments
                  .filter((p) => p.payment_method === m && p.created_at >= monthStart)
                  .reduce((sum, p) => sum + Number(p.amount || 0), 0);
                return (
                  <div key={m} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/40">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{PAYMENT_LABELS[m] || m}</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-white">{formatCurrency(total)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cash Register */}
      {tab === 'cash' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCashModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> تسجيل الصندوق
            </button>
          </div>
          {cashEntries.length === 0 ? (
            <div className="card"><EmptyState message="لا توجد سجلات للصندوق" icon={<Wallet className="w-10 h-10" />} /></div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">التاريخ</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">افتتاح</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">داخل</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">خارج</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">إغلاق</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashEntries.map((c) => (
                      <tr key={c.id} className="table-row">
                        <td className="p-3 text-sm text-slate-700 dark:text-slate-200">{formatDate(c.register_date)}</td>
                        <td className="p-3 text-sm text-slate-600 dark:text-slate-300">{formatCurrency(c.opening_balance)}</td>
                        <td className="p-3 text-sm text-accent-600 dark:text-accent-400">{formatCurrency(c.cash_in)}</td>
                        <td className="p-3 text-sm text-error-600 dark:text-error-400">{formatCurrency(c.cash_out)}</td>
                        <td className="p-3 text-sm font-bold text-slate-700 dark:text-slate-200">{formatCurrency(c.closing_balance)}</td>
                        <td className="p-3 text-sm text-slate-400">{c.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expenses */}
      {tab === 'expenses' && (
        <div>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في المصروفات..." className="input pr-10" />
            </div>
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="input sm:w-48">
              <option value="all">كل الفئات</option>
              {EXPENSE_CATS.map((c) => (
                <option key={c} value={c}>{EXPENSE_LABELS[c]}</option>
              ))}
            </select>
            <button onClick={() => setShowExpenseModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> مصروف جديد
            </button>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="card"><EmptyState message="لا توجد مصروفات" icon={<TrendingDown className="w-10 h-10" />} /></div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">التاريخ</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الفئة</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الوصف</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">المبلغ</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الدفع</th>
                      <th className="text-center p-3 text-sm font-medium text-slate-500 dark:text-slate-400">حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((e) => (
                      <tr key={e.id} className="table-row">
                        <td className="p-3 text-sm text-slate-700 dark:text-slate-200">{formatDate(e.expense_date)}</td>
                        <td className="p-3"><Badge text={EXPENSE_LABELS[e.category]} color="warning" /></td>
                        <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{e.description || '—'}</td>
                        <td className="p-3 text-sm font-bold text-error-600 dark:text-error-400">{formatCurrency(e.amount)}</td>
                        <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{PAYMENT_LABELS[e.payment_method] || e.payment_method}</td>
                        <td className="p-3 text-center">
                          <button onClick={() => deleteExpense(e.id)} className="w-8 h-8 rounded-lg hover:bg-error-50 dark:hover:bg-error-900/30 text-error-500 flex items-center justify-center mx-auto">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expense modal */}
      <Modal open={showExpenseModal} onClose={() => setShowExpenseModal(false)} title="تسجيل مصروف" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">التاريخ</label>
              <input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">الفئة</label>
              <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as ExpenseCategory })} className="input">
                {EXPENSE_CATS.map((c) => (
                  <option key={c} value={c}>{EXPENSE_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">الوصف</label>
            <input type="text" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="input" placeholder="وصف المصروف" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">المبلغ (₪)</label>
              <input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="input text-left" placeholder="0" />
            </div>
            <div>
              <label className="label">طريقة الدفع</label>
              <select value={expenseForm.payment_method} onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value as 'cash' | 'card' | 'transfer' })} className="input">
                <option value="cash">نقدي</option>
                <option value="card">بطاقة</option>
                <option value="transfer">تحويل</option>
              </select>
            </div>
          </div>
          <button onClick={saveExpense} className="btn-primary w-full">
            <Plus className="w-4 h-4" /> حفظ المصروف
          </button>
        </div>
      </Modal>

      {/* Cash register modal */}
      <Modal open={showCashModal} onClose={() => setShowCashModal(false)} title="تسجيل الصندوق اليومي" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">التاريخ</label>
              <input type="date" value={cashForm.register_date} onChange={(e) => setCashForm({ ...cashForm, register_date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">الموظف</label>
              <select value={cashForm.employee_id} onChange={(e) => setCashForm({ ...cashForm, employee_id: e.target.value })} className="input">
                <option value="">—</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">رصيد الافتتاح</label>
              <input type="number" value={cashForm.opening_balance} onChange={(e) => setCashForm({ ...cashForm, opening_balance: e.target.value })} className="input text-left" placeholder="0" />
            </div>
            <div>
              <label className="label">نقد داخل</label>
              <input type="number" value={cashForm.cash_in} onChange={(e) => setCashForm({ ...cashForm, cash_in: e.target.value })} className="input text-left" placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">نقد خارج</label>
              <input type="number" value={cashForm.cash_out} onChange={(e) => setCashForm({ ...cashForm, cash_out: e.target.value })} className="input text-left" placeholder="0" />
            </div>
            <div>
              <label className="label">رصيد الإغلاق</label>
              <input type="number" value={cashForm.closing_balance} onChange={(e) => setCashForm({ ...cashForm, closing_balance: e.target.value })} className="input text-left" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="label">ملاحظات</label>
            <textarea value={cashForm.notes} onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })} className="input min-h-[60px]" placeholder="ملاحظات..." />
          </div>
          <button onClick={saveCash} className="btn-primary w-full">
            <Calendar className="w-4 h-4" /> حفظ السجل
          </button>
        </div>
      </Modal>
    </div>
  );
}
