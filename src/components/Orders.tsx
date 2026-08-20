import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Search, Trash2, Edit, Eye, Clock, CheckCircle, FlaskConical, Package, Printer } from 'lucide-react';
import {
  supabase,
  formatCurrency,
  formatDate,
  ORDER_STATUS_LABELS,
  type Order,
  type OrderStatus,
  type Customer,
  type Examination,
  type Inventory,
} from '@/lib/supabase';
import { PageHeader, Modal, Badge, LoadingSpinner, EmptyState } from '@/components/ui';

const STATUS_FLOW: OrderStatus[] = ['pending', 'in_lab', 'ready', 'delivered'];
const STATUS_ICONS: Record<OrderStatus, typeof Clock> = {
  pending: Clock,
  in_lab: FlaskConical,
  ready: Package,
  delivered: CheckCircle,
};
const STATUS_COLORS: Record<OrderStatus, 'warning' | 'brand' | 'accent' | 'slate'> = {
  pending: 'warning',
  in_lab: 'brand',
  ready: 'accent',
  delivered: 'slate',
};

const emptyForm = {
  customer_id: '',
  examination_id: '',
  notes: '',
  items: [] as { item_name: string; item_type: string; quantity: number; unit_price: number }[],
};

export default function Orders() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<(Order & { customers?: { name: string } })[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [exams, setExams] = useState<Examination[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [viewOrder, setViewOrder] = useState<(Order & { customers?: { name: string }; order_items?: any[] }) | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [newItem, setNewItem] = useState({ item_name: '', item_type: 'إطار', quantity: 1, unit_price: 0 });

  // دالة جلب البيانات مع إسناد اسم العميل بأمان لتفادي خطأ 400
  const fetchOrdersData = async () => {
    try {
      const [ordRes, custRes, examRes, invRes] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('*').order('name'),
        supabase.from('examinations').select('*').order('exam_date', { ascending: false }),
        supabase.from('inventory').select('*').order('name'),
      ]);

      if (ordRes.error) throw ordRes.error;

      const customerList = custRes.data || [];
      const customersMap = new Map(customerList.map((c) => [c.id, c.name]));

      const formattedOrders = (ordRes.data || []).map((order) => ({
        ...order,
        customers: { name: customersMap.get(order.customer_id) || 'عميل غير معروف' },
      }));

      setOrders(formattedOrders);
      setCustomers(customerList);
      setExams(examRes.data || []);
      setInventory(invRes.data || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      alert('حدث خطأ أثناء تحميل البيانات: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersData();
  }, []);

  const filtered = orders.filter((o) => {
    const name = o.customers?.name || '';
    const matchSearch = name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  function openNew() {
    setForm({ ...emptyForm });
    setEditingOrder(null);
    setShowModal(true);
  }

  function openEdit(order: Order) {
    setEditingOrder(order);
    setForm({
      customer_id: order.customer_id,
      examination_id: order.examination_id || '',
      notes: order.notes || '',
      items: [],
    });
    setShowModal(true);
  }

  function addItem() {
    if (!newItem.item_name.trim()) return;
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { ...newItem }],
    }));
    setNewItem({ item_name: '', item_type: 'إطار', quantity: 1, unit_price: 0 });
  }

  function removeItem(idx: number) {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  }

  async function save() {
    if (!form.customer_id) {
      alert('الرجاء اختيار العميل');
      return;
    }

    const total = form.items.reduce((s, i) => s + (Number(i.unit_price) || 0) * (Number(i.quantity) || 1), 0);
    const paid = editingOrder?.amount_paid || 0;

    const orderPayload = {
      customer_id: form.customer_id,
      examination_id: form.examination_id ? form.examination_id : null,
      status: editingOrder?.status || 'pending',
      total_amount: total,
      amount_paid: paid,
      balance: total - paid,
      notes: form.notes ? form.notes : null,
    };

    let orderId = editingOrder?.id;

    if (editingOrder) {
      const { error } = await supabase
        .from('orders')
        .update({ ...orderPayload, updated_at: new Date().toISOString() })
        .eq('id', editingOrder.id);

      if (error) {
        alert('خطأ أثناء التحديث: ' + error.message);
        return;
      }
      await supabase.from('order_items').delete().eq('order_id', editingOrder.id);
    } else {
      const { data, error } = await supabase.from('orders').insert(orderPayload).select().single();
      if (error) {
        alert('خطأ أثناء الإنشاء: ' + error.message);
        return;
      }
      orderId = data.id;
    }

    if (form.items.length > 0 && orderId) {
      const itemsPayload = form.items.map((i) => ({
        order_id: orderId,
        item_name: i.item_name,
        item_type: i.item_type,
        quantity: Number(i.quantity) || 1,
        unit_price: Number(i.unit_price) || 0,
        line_total: (Number(i.unit_price) || 0) * (Number(i.quantity) || 1),
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(itemsPayload);
      if (itemsError) {
        console.error('Error inserting order items:', itemsError);
      }
    }

    await fetchOrdersData();
    setShowModal(false);
  }

  async function updateStatus(order: Order, status: OrderStatus) {
    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', order.id);

    if (error) {
      alert('خطأ: ' + error.message);
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
  }

  async function deleteOrder(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) {
      alert('حدث خطأ أثناء الحذف: ' + error.message);
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }

  async function viewOrderDetails(order: Order & { customers?: { name: string } }) {
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
    setViewOrder({ ...order, order_items: items || [] });
  }

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <LoadingSpinner />;

  const customerExams = form.customer_id ? exams.filter((e) => e.customer_id === form.customer_id) : [];

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="طلبيات العملاء"
          subtitle="متابعة دورة حياة الطلبات من الاستلام حتى التسليم"
          action={
            <button onClick={openNew} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> طلب جديد
            </button>
          }
        />

        {/* Filters */}
        <div className="card p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم العميل..."
                className="input pr-10"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input sm:w-48"
            >
              <option value="all">كل الحالات</option>
              {STATUS_FLOW.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Orders grid */}
        {filtered.length === 0 ? (
          <div className="card">
            <EmptyState message="لا توجد طلبيات" icon={<ClipboardList className="w-10 h-10" />} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((order) => {
              const Icon = STATUS_ICONS[order.status];
              return (
                <div key={order.id} className="card card-hover p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {order.customers?.name || '—'}
                        </p>
                        <p className="text-xs text-slate-400">{formatDate(order.created_at)}</p>
                      </div>
                    </div>
                    <Badge text={ORDER_STATUS_LABELS[order.status]} color={STATUS_COLORS[order.status]} />
                  </div>

                  <div className="flex items-center justify-between mb-3 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">
                      الإجمالي:{' '}
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {formatCurrency(order.total_amount)}
                      </span>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      المتبقي:{' '}
                      <span
                        className={`font-bold ${
                          order.balance > 0 ? 'text-error-600 dark:text-error-400' : 'text-accent-600 dark:text-accent-400'
                        }`}
                      >
                        {formatCurrency(order.balance)}
                      </span>
                    </span>
                  </div>

                  {/* Status flow buttons */}
                  <div className="flex items-center gap-1 mb-3">
                    {STATUS_FLOW.map((s, i) => (
                      <button
                        key={s}
                        onClick={() => updateStatus(order, s)}
                        className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                          order.status === s
                            ? 'bg-brand-600 text-white'
                            : STATUS_FLOW.indexOf(order.status) >= i
                            ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {ORDER_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 border-t border-slate-100 dark:border-slate-700 pt-3">
                    <button onClick={() => viewOrderDetails(order)} className="btn-ghost flex-1 text-xs flex items-center justify-center gap-1">
                      <Eye className="w-4 h-4" /> عرض
                    </button>
                    <button onClick={() => openEdit(order)} className="btn-ghost flex-1 text-xs flex items-center justify-center gap-1">
                      <Edit className="w-4 h-4" /> تعديل
                    </button>
                    <button onClick={() => deleteOrder(order.id)} className="btn-ghost text-error-500 text-xs p-2">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New/Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingOrder ? 'تعديل الطلب' : 'طلب جديد'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">العميل *</label>
              <select
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value, examination_id: '' })}
                className="input"
              >
                <option value="">اختر العميل...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">الوصفة الطبية</label>
              <select
                value={form.examination_id}
                onChange={(e) => setForm({ ...form, examination_id: e.target.value })}
                className="input"
                disabled={!form.customer_id}
              >
                <option value="">بدون وصفة</option>
                {customerExams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {formatDate(ex.exam_date)} — {ex.doctor_name || 'فحص'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Items */}
          <div>
            <label className="label">عناصر الطلب</label>
            <div className="card p-3 bg-slate-50 dark:bg-slate-700/30 space-y-3">
              <div className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  value={newItem.item_name}
                  onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                  placeholder="اسم العنصر"
                  className="input col-span-4 text-sm"
                />
                <select
                  value={newItem.item_type}
                  onChange={(e) => setNewItem({ ...newItem, item_type: e.target.value })}
                  className="input col-span-3 text-sm"
                >
                  <option>إطار</option>
                  <option>عدسة</option>
                  <option>عدسة لاصقة</option>
                  <option>إكسسوار</option>
                  <option>أخرى</option>
                </select>
                <input
                  type="number"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                  placeholder="الكمية"
                  className="input col-span-2 text-sm text-center"
                />
                <input
                  type="number"
                  value={newItem.unit_price}
                  onChange={(e) => setNewItem({ ...newItem, unit_price: parseFloat(e.target.value) || 0 })}
                  placeholder="السعر"
                  className="input col-span-2 text-sm text-left"
                />
                <button onClick={addItem} type="button" className="btn-primary col-span-1 px-0 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {form.items.length > 0 && (
                <div className="space-y-1">
                  {form.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">
                        {item.item_name} ({item.item_type}) × {item.quantity}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {formatCurrency(item.unit_price * item.quantity)}
                        </span>
                        <button onClick={() => removeItem(i)} type="button" className="text-error-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="label">ملاحظات</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input min-h-[60px]"
              placeholder="ملاحظات الطلب..."
            />
          </div>

          <button onClick={save} className="btn-primary w-full flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> {editingOrder ? 'حفظ التعديلات' : 'إنشاء الطلب'}
          </button>
        </div>
      </Modal>

      {/* View & Print Modal */}
      <Modal open={!!viewOrder} onClose={() => setViewOrder(null)} title="تفاصيل وإيصال الطلب" size="md">
        {viewOrder && (
          <div>
            <div className="no-print flex justify-end mb-4">
              <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
                <Printer className="w-4 h-4" /> طباعة الإيصال
              </button>
            </div>

            {/* Receipt Content Area */}
            <div className="printable-receipt border dark:border-slate-700 p-6 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
              <div className="text-center border-b pb-4 mb-4">
                <h2 className="text-xl font-bold">المركز الإيطالي للبصريات</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">إيصال طلبيّة بيع</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs mb-4 bg-slate-50 dark:bg-slate-700/50 p-3 rounded">
                <div>
                  <span className="text-slate-500">العميل:</span> <strong>{viewOrder.customers?.name || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">التاريخ:</span> <strong>{formatDate(viewOrder.created_at)}</strong>
                </div>
                <div>
                  <span className="text-slate-500">رقم الطلب:</span> <strong>#{viewOrder.id.slice(0, 8)}</strong>
                </div>
                <div>
                  <span className="text-slate-500">الحالة:</span> <strong>{ORDER_STATUS_LABELS[viewOrder.status]}</strong>
                </div>
              </div>

              {viewOrder.order_items && viewOrder.order_items.length > 0 ? (
                <table className="w-full text-right text-xs mb-4 border-collapse">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2">العنصر</th>
                      <th className="py-2 text-center">العدد</th>
                      <th className="py-2 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewOrder.order_items.map((item: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-700">
                        <td className="py-2">
                          {item.item_name} <span className="text-slate-400">({item.item_type})</span>
                        </td>
                        <td className="py-2 text-center">{item.quantity}</td>
                        <td className="py-2 text-left">{formatCurrency(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-slate-400 text-center py-3">لا توجد عناصر مسجلة</p>
              )}

              <div className="border-t pt-3 text-xs space-y-1">
                <div className="flex justify-between font-bold text-sm">
                  <span>المجموع الإجمالي:</span>
                  <span>{formatCurrency(viewOrder.total_amount)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>المدفوع:</span>
                  <span>{formatCurrency(viewOrder.amount_paid)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>المتبقي:</span>
                  <span className={viewOrder.balance > 0 ? 'text-red-500 font-semibold' : ''}>
                    {formatCurrency(viewOrder.balance)}
                  </span>
                </div>
              </div>

              {viewOrder.notes && (
                <div className="mt-4 pt-2 border-t text-xs text-slate-500">
                  <span className="font-semibold">ملاحظات:</span> {viewOrder.notes}
                </div>
              )}

              <div className="text-center text-[10px] text-slate-400 mt-6 border-t pt-2">
                شكراً لزيارتكم - يرجى الاحتفاظ بالإيصال
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* CSS Rules for Printing */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .no-print, nav, header, sidebar {
            display: none !important;
          }
          .printable-receipt {
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            color: black !important;
          }
          .printable-receipt * {
            color: black !important;
            background: transparent !important;
          }
        }
      `}</style>
    </div>
  );
}
