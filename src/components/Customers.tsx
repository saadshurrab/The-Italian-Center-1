import { useEffect, useState } from 'react';
import { Contact, Plus, Search, Edit, Trash2, Eye, Phone, Mail, Wallet, History } from 'lucide-react';
import {
  supabase,
  formatCurrency,
  formatDate,
  type Customer,
  type Examination,
  type Order,
  type Sale,
} from '@/lib/supabase';
import { PageHeader, Modal, Badge, LoadingSpinner, EmptyState, StatCard } from '@/components/ui';

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  date_of_birth: '',
  notes: '',
  balance: '0',
};

export default function Customers() {
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [viewData, setViewData] = useState<{
    exams: Examination[];
    orders: Order[];
    sales: Sale[];
  }>({ exams: [], orders: [], sales: [] });

  // جلب العملاء عند تحميل الصفحة
  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setCustomers(data || []);
    } catch (err: any) {
      console.error('Error fetching customers:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search) ||
      (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  async function save() {
    if (!form.name.trim()) {
      alert('الاسم مطلوب');
      return;
    }

    // تجهيز البيانات وتنظيف الحقول الفارغة
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      date_of_birth: form.date_of_birth || null,
      notes: form.notes.trim() || null,
      balance: parseFloat(form.balance) || 0,
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([payload]); // تمرير المصفوفة بشكل صريح لضمان التوافق

        if (error) throw error;
      }

      await fetchCustomers();
      setShowModal(false);
      setForm({ ...emptyForm });
      setEditingId(null);
    } catch (error: any) {
      console.error('Save customer error:', error);
      alert('حدث خطأ أثناء حفظ البيانات: ' + error.message);
    }
  }

  async function deleteCustomer(id: string) {
    if (!confirm('هل أنت متأكد؟ سيتم حذف جميع الفحوصات والطلبيات المرتبطة.')) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      setCustomers((prev) => prev.filter((c) => c.id !== id));
    } catch (error: any) {
      alert('حدث خطأ أثناء الحذف: ' + error.message);
    }
  }

  async function viewDetails(customer: Customer) {
    setViewCustomer(customer);
    try {
      const [examRes, orderRes, saleRes] = await Promise.all([
        supabase
          .from('examinations')
          .select('*')
          .eq('customer_id', customer.id)
          .order('exam_date', { ascending: false }),
        supabase
          .from('orders')
          .select('*')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('sales')
          .select('*')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
      ]);

      setViewData({
        exams: examRes.data || [],
        orders: orderRes.data || [],
        sales: saleRes.data || [],
      });
    } catch (err: any) {
      console.error('Error viewing customer details:', err.message);
    }
  }

  if (loading) return <LoadingSpinner />;

  const totalBalance = customers.reduce((s, c) => s + (c.balance || 0), 0);
  const customersWithBalance = customers.filter((c) => (c.balance || 0) > 0).length;

  return (
    <div>
      <PageHeader
        title="إدارة العملاء"
        subtitle="ملفات العملاء والوصفات والمشتريات والأرصدة"
        action={
          <button
            onClick={() => {
              setForm({ ...emptyForm });
              setEditingId(null);
              setShowModal(true);
            }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> عميل جديد
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="إجمالي العملاء" value={customers.length} icon={<Contact className="w-6 h-6 text-white" />} color="brand" />
        <StatCard label="عملاء برصيد مستحق" value={customersWithBalance} icon={<Wallet className="w-6 h-6 text-white" />} color="warning" />
        <StatCard label="إجمالي الأرصدة" value={formatCurrency(totalBalance)} icon={<Wallet className="w-6 h-6 text-white" />} color="error" />
      </div>

      {/* Search */}
      <div className="card p-4 mb-4">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الهاتف أو البريد..."
            className="input pr-10"
          />
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState message="لا يوجد عملاء" icon={<Contact className="w-10 h-10" />} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className="card card-hover p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-lg">
                    {c.name ? c.name.charAt(0) : '?'}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-white">{c.name}</p>
                    {c.phone && (
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {c.phone}
                      </p>
                    )}
                  </div>
                </div>
                {c.balance > 0 && <Badge text="مستحق" color="error" />}
              </div>

              {c.email && (
                <p className="text-xs text-slate-400 flex items-center gap-1 mb-2">
                  <Mail className="w-3 h-3" /> {c.email}
                </p>
              )}
              <div className="flex items-center justify-between mb-3 text-sm">
                <span className="text-slate-500 dark:text-slate-400">الرصيد:</span>
                <span
                  className={`font-bold ${
                    c.balance > 0
                      ? 'text-error-600 dark:text-error-400'
                      : 'text-accent-600 dark:text-accent-400'
                  }`}
                >
                  {formatCurrency(c.balance || 0)}
                </span>
              </div>

              <div className="flex gap-1 border-t border-slate-100 dark:border-slate-700 pt-3">
                <button onClick={() => viewDetails(c)} className="btn-ghost flex-1 text-xs">
                  <Eye className="w-4 h-4" /> عرض
                </button>
                <button
                  onClick={() => {
                    setForm({
                      name: c.name || '',
                      phone: c.phone || '',
                      email: c.email || '',
                      address: c.address || '',
                      date_of_birth: c.date_of_birth || '',
                      notes: c.notes || '',
                      balance: (c.balance || 0).toString(),
                    });
                    setEditingId(c.id);
                    setShowModal(true);
                  }}
                  className="btn-ghost text-xs"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => deleteCustomer(c.id)} className="btn-ghost text-error-500 text-xs">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Add modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل عميل' : 'عميل جديد'} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">الاسم *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input"
              placeholder="اسم العميل"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">الهاتف</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input"
                placeholder="05XX XXX XXX"
              />
            </div>
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
                placeholder="email@example.com"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">تاريخ الميلاد</label>
              <input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">الرصيد المستحق (₪)</label>
              <input
                type="number"
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                className="input text-left"
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="label">العنوان</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="input"
              placeholder="العنوان"
            />
          </div>
          <div>
            <label className="label">ملاحظات</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input min-h-[60px]"
              placeholder="ملاحظات..."
            />
          </div>
          <button onClick={save} className="btn-primary w-full">
            <Plus className="w-4 h-4" /> {editingId ? 'حفظ التعديلات' : 'إضافة العميل'}
          </button>
        </div>
      </Modal>

      {/* View customer details */}
      <Modal open={!!viewCustomer} onClose={() => setViewCustomer(null)} title={viewCustomer?.name || ''} size="lg">
        {viewCustomer && (
          <div className="space-y-4">
            <div className="card p-4 bg-slate-50 dark:bg-slate-700/30">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400">الهاتف: </span><span className="text-slate-700 dark:text-slate-200">{viewCustomer.phone || '—'}</span></div>
                <div><span className="text-slate-400">البريد: </span><span className="text-slate-700 dark:text-slate-200">{viewCustomer.email || '—'}</span></div>
                <div><span className="text-slate-400">العنوان: </span><span className="text-slate-700 dark:text-slate-200">{viewCustomer.address || '—'}</span></div>
                <div><span className="text-slate-400">تاريخ الميلاد: </span><span className="text-slate-700 dark:text-slate-200">{viewCustomer.date_of_birth ? formatDate(viewCustomer.date_of_birth) : '—'}</span></div>
                <div><span className="text-slate-400">الرصيد: </span><span className={`font-bold ${viewCustomer.balance > 0 ? 'text-error-600 dark:text-error-400' : 'text-accent-600 dark:text-accent-400'}`}>{formatCurrency(viewCustomer.balance || 0)}</span></div>
              </div>
              {viewCustomer.notes && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">ملاحظات: {viewCustomer.notes}</p>}
            </div>

            <div>
              <h4 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                <History className="w-4 h-4" /> الفحوصات ({viewData.exams.length})
              </h4>
              {viewData.exams.length === 0 ? (
                <p className="text-xs text-slate-400">لا توجد فحوصات</p>
              ) : (
                <div className="space-y-1">
                  {viewData.exams.slice(0, 5).map((ex) => (
                    <div key={ex.id} className="flex justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-700/30 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{formatDate(ex.exam_date)}</span>
                      <span className="text-slate-400">OD: {ex.od_sph ?? '—'} / OS: {ex.os_sph ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200 mb-2">الطلبيات ({viewData.orders.length})</h4>
              {viewData.orders.length === 0 ? (
                <p className="text-xs text-slate-400">لا توجد طلبيات</p>
              ) : (
                <div className="space-y-1">
                  {viewData.orders.slice(0, 5).map((o) => (
                    <div key={o.id} className="flex justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-700/30 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{formatDate(o.created_at)}</span>
                      <span className="font-medium text-slate-600 dark:text-slate-300">{formatCurrency(o.total_amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-display font-bold text-sm text-slate-700 dark:text-slate-200 mb-2">المشتريات ({viewData.sales.length})</h4>
              {viewData.sales.length === 0 ? (
                <p className="text-xs text-slate-400">لا توجد مشتريات</p>
              ) : (
                <div className="space-y-1">
                  {viewData.sales.slice(0, 5).map((s) => (
                    <div key={s.id} className="flex justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-700/30 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{formatDate(s.created_at)}</span>
                      <span className="font-medium text-slate-600 dark:text-slate-300">{formatCurrency(s.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
