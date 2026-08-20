import { useEffect, useState } from 'react';
import {
  ClipboardList,
  Plus,
  Search,
  Trash2,
  Edit,
  Eye,
  Clock,
  CheckCircle,
  FlaskConical,
  Package,
  Printer,
  Glasses,
  DollarSign,
  FileText,
} from 'lucide-react';
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

interface OrderItemForm {
  item_name: string;
  item_type: string;
  quantity: number;
  unit_price: number;
  notes?: string;
}

const emptyForm = {
  customer_id: '',
  examination_id: '',
  lens_details: {
    lens_type: 'مسافات',
    lens_material: 'بلاستيك مقاوم للخدش',
    coating: 'HMC / ضد الانعكاس',
    right_eye_notes: '',
    left_eye_notes: '',
  },
  notes: '',
  amount_paid: 0,
  items: [] as OrderItemForm[],
};

export default function Orders() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<(Order & { customers?: { name: string; phone?: string } })[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [exams, setExams] = useState<Examination[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [viewOrder, setViewOrder] = useState<
    (Order & { customers?: { name: string; phone?: string }; order_items?: any[]; examination?: any }) | null
  >(null);

  const [form, setForm] = useState({ ...emptyForm });
  const [newItem, setNewItem] = useState<OrderItemForm>({
    item_name: '',
    item_type: 'إطار',
    quantity: 1,
    unit_price: 0,
    notes: '',
  });

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
      const customersMap = new Map(customerList.map((c) => [c.id, { name: c.name, phone: c.phone }]));

      const formattedOrders = (ordRes.data || []).map((order) => {
        const cust = customersMap.get(order.customer_id);
        return {
          ...order,
          customers: { name: cust?.name || 'عميل غير معروف', phone: cust?.phone },
        };
      });

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
    const phone = o.customers?.phone || '';
    const matchSearch = name.toLowerCase().includes(search.toLowerCase()) || phone.includes(search);
    const matchStatus = filterStatus === 'all' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  function openNew() {
    setForm({ ...emptyForm });
    setEditingOrder(null);
    setShowModal(true);
  }

  async function openEdit(order: Order) {
    setEditingOrder(order);

    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);

    setForm({
      customer_id: order.customer_id,
      examination_id: order.examination_id || '',
      lens_details: (order as any).lens_details || emptyForm.lens_details,
      notes: order.notes || '',
      amount_paid: order.amount_paid || 0,
      items: (items || []).map((i) => ({
        item_name: i.item_name,
        item_type: i.item_type,
        quantity: i.quantity,
        unit_price: i.unit_price,
        notes: i.notes || '',
      })),
    });
    setShowModal(true);
  }

  function handleSelectInventoryItem(inventoryId: string) {
    const item = inventory.find((i) => i.id === inventoryId);
    if (!item) return;

    setNewItem({
      item_name: item.name,
      item_type: item.type || 'إطار',
      quantity: 1,
      unit_price: item.price || 0,
      notes: '',
    });
  }

  function addItem() {
    if (!newItem.item_name.trim()) return;
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { ...newItem }],
    }));
    setNewItem({ item_name: '', item_type: 'إطار', quantity: 1, unit_price: 0, notes: '' });
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
    const paid = Number(form.amount_paid) || 0;

    const orderPayload: Record<string, any> = {
      customer_id: form.customer_id,
      examination_id: form.examination_id && form.examination_id.trim() !== '' ? form.examination_id : null,
      status: editingOrder?.status || 'pending',
      total_amount: total,
      amount_paid: paid,
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
        notes: i.notes || null,
      }));

      await supabase.from('order_items').insert(itemsPayload);
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
      alert('خطأ في تغيير حالة الطلب: ' + error.message);
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
  }

  async function deleteOrder(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟')) return;
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) {
      alert('حدث خطأ أثناء الحذف: ' + error.message);
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }

  // جلب الفحص بشكل مضمون يدعم أشكال مسميات العقول المتعددة
  async function viewOrderDetails(order: Order & { customers?: { name: string; phone?: string } }) {
    let examData: any = null;

    if (order.examination_id) {
      const { data } = await supabase.from('examinations').select('*').eq('id', order.examination_id).maybeSingle();
      examData = data;
    }

    if (!examData && order.customer_id) {
      const { data } = await supabase
        .from('examinations')
        .select('*')
        .eq('customer_id', order.customer_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      examData = data;
    }

    // محاولة بحث إضافية بالهاتف أو الاسم إذا كان جدول الفحوصات غير مرتبطة بـ customer_id بشكل مباشر
    if (!examData && order.customers?.name) {
      const { data } = await supabase
        .from('examinations')
        .select('*')
        .ilike('patient_name', `%${order.customers.name}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      examData = data;
    }

    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);

    setViewOrder({
      ...order,
      order_items: items || [],
      examination: examData,
    });
  }

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <LoadingSpinner />;

  const customerExams = form.customer_id ? exams.filter((e) => e.customer_id === form.customer_id) : [];

  // Helper لجلب القياس مع دعم جميع الاحتمالات في أسماء الحقول
  const getVal = (obj: any, keys: string[]) => {
    if (!obj) return null;
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
        return obj[k];
      }
    }
    return null;
  };

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="إدارة الطلبيات والتصنيع"
          subtitle="متابعة دورة تصنيع النظارات من استلام الوصفة، تجهيز المعمل، وحتى التسليم"
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
                placeholder="ابحث باسم العميل أو رقم الهاتف..."
                className="input pr-10"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input sm:w-48"
            >
              <option value="all">جميع الحالات</option>
              {STATUS_FLOW.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Orders Grid */}
        {filtered.length === 0 ? (
          <div className="card">
            <EmptyState message="لا توجد طلبيات مسجلة حالياً" icon={<ClipboardList className="w-10 h-10" />} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((order) => {
              const Icon = STATUS_ICONS[order.status];
              const calculatedBalance = Math.max(0, order.total_amount - order.amount_paid);
              return (
                <div key={order.id} className="card card-hover p-4 border-l-4 border-l-brand-500">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {order.customers?.name || '—'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDate(order.created_at)} {order.customers?.phone && `• ${order.customers.phone}`}
                        </p>
                      </div>
                    </div>
                    <Badge text={ORDER_STATUS_LABELS[order.status]} color={STATUS_COLORS[order.status]} />
                  </div>

                  <div className="flex items-center justify-between mb-3 text-sm bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg">
                    <span className="text-slate-500 dark:text-slate-400">
                      الإجمالي:{' '}
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {formatCurrency(order.total_amount)}
                      </span>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      المدفوع:{' '}
                      <span className="font-semibold text-accent-600 dark:text-accent-400">
                        {formatCurrency(order.amount_paid)}
                      </span>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      المتبقي:{' '}
                      <span
                        className={`font-bold ${
                          calculatedBalance > 0 ? 'text-error-600 dark:text-error-400' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {formatCurrency(calculatedBalance)}
                      </span>
                    </span>
                  </div>

                  <div className="mb-3">
                    <p className="text-[11px] text-slate-400 mb-1 font-medium">مرحلة الطلب والتصنيع:</p>
                    <div className="flex items-center gap-1">
                      {STATUS_FLOW.map((s, i) => (
                        <button
                          key={s}
                          onClick={() => updateStatus(order, s)}
                          className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
                            order.status === s
                              ? 'bg-brand-600 text-white shadow-sm'
                              : STATUS_FLOW.indexOf(order.status) >= i
                              ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {ORDER_STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 border-t border-slate-100 dark:border-slate-700 pt-3">
                    <button onClick={() => viewOrderDetails(order)} className="btn-ghost flex-1 text-xs flex items-center justify-center gap-1">
                      <Eye className="w-4 h-4 text-brand-600" /> عرض وتجهيز الإيصال
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

      {/* Modal - New/Edit */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingOrder ? 'تعديل الطلبية' : 'إنشاء طلبية نظارة جديد'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">العميل / المريض *</label>
              <select
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value, examination_id: '' })}
                className="input"
              >
                <option value="">اختر العميل...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ربط بوصفة فحص النظارة</label>
              <select
                value={form.examination_id}
                onChange={(e) => setForm({ ...form, examination_id: e.target.value })}
                className="input"
                disabled={!form.customer_id}
              >
                <option value="">تلقائي (استخدام أحدث فحص للعميل)</option>
                {customerExams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    فحص بتاريخ {formatDate(ex.exam_date || (ex as any).created_at)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card p-3 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-600 dark:text-brand-400">
              <Glasses className="w-4 h-4" /> مواصفات العدسات والتصنيع الفني
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="label text-[11px]">نوع العدسة</label>
                <select
                  value={form.lens_details.lens_type}
                  onChange={(e) => setForm({ ...form, lens_details: { ...form.lens_details, lens_type: e.target.value } })}
                  className="input text-xs"
                >
                  <option>مسافات (Single Vision)</option>
                  <option>قراءة (Reading)</option>
                  <option>متعدد البؤر (Progressive)</option>
                  <option>ثنائي البؤرة (Bifocal)</option>
                  <option>عدسات لاصقة medical</option>
                </select>
              </div>
              <div>
                <label className="label text-[11px]">خامة العدسة</label>
                <input
                  type="text"
                  value={form.lens_details.lens_material}
                  onChange={(e) => setForm({ ...form, lens_details: { ...form.lens_details, lens_material: e.target.value } })}
                  placeholder="بلاستيك، مضغوط 1.61..."
                  className="input text-xs"
                />
              </div>
              <div>
                <label className="label text-[11px]">الحماية والتغليف (Coating)</label>
                <input
                  type="text"
                  value={form.lens_details.coating}
                  onChange={(e) => setForm({ ...form, lens_details: { ...form.lens_details, coating: e.target.value } })}
                  placeholder="HMC، Blue Cut، Photogray..."
                  className="input text-xs"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="label">عناصر الطلبية (الإطار والعدسات والإكسسوارات)</label>
            <div className="card p-3 bg-slate-50 dark:bg-slate-800/30 space-y-3">
              {inventory.length > 0 && (
                <div className="mb-2">
                  <select
                    onChange={(e) => handleSelectInventoryItem(e.target.value)}
                    className="input text-xs bg-white dark:bg-slate-700"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      اختيار سريع من سلع المخزن...
                    </option>
                    {inventory.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} — {formatCurrency(inv.price)} (المتوفر: {inv.quantity})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  value={newItem.item_name}
                  onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                  placeholder="اسم العنصر (مثال: إطار RayBan)"
                  className="input col-span-12 sm:col-span-4 text-xs"
                />
                <select
                  value={newItem.item_type}
                  onChange={(e) => setNewItem({ ...newItem, item_type: e.target.value })}
                  className="input col-span-6 sm:col-span-3 text-xs"
                >
                  <option>إطار</option>
                  <option>عدسات طبية</option>
                  <option>عدسات لاصقة</option>
                  <option>نظارة شمسية</option>
                  <option>إكسسوار / محلول</option>
                  <option>صيانة وتصنيع</option>
                </select>
                <input
                  type="number"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                  placeholder="الكمية"
                  className="input col-span-3 sm:col-span-2 text-xs text-center"
                />
                <input
                  type="number"
                  value={newItem.unit_price}
                  onChange={(e) => setNewItem({ ...newItem, unit_price: parseFloat(e.target.value) || 0 })}
                  placeholder="السعر"
                  className="input col-span-3 sm:col-span-2 text-xs text-left"
                />
                <button onClick={addItem} type="button" className="btn-primary col-span-12 sm:col-span-1 px-0 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {form.items.length > 0 && (
                <div className="space-y-1">
                  {form.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 text-xs">
                      <span className="text-slate-700 dark:text-slate-200">
                        <strong>{item.item_name}</strong> ({item.item_type}) × {item.quantity}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {formatCurrency(item.unit_price * item.quantity)}
                        </span>
                        <button onClick={() => removeItem(i)} type="button" className="text-error-500 hover:text-error-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">الدفعة المقدمة (المدفوع)</label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  value={form.amount_paid}
                  onChange={(e) => setForm({ ...form, amount_paid: parseFloat(e.target.value) || 0 })}
                  className="input pr-9"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="label">ملاحظات المعمل والطلب</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="input min-h-[40px] text-xs"
                placeholder="أي ملاحظات خاصة بالتنفيذ أو قياسات الإطار..."
              />
            </div>
          </div>

          <button onClick={save} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
            <Plus className="w-4 h-4" /> {editingOrder ? 'تحديث وتعديل الطلبية' : 'تأكيد وحفظ الطلبية'}
          </button>
        </div>
      </Modal>

      {/* View & Printable Receipt */}
      <Modal open={!!viewOrder} onClose={() => setViewOrder(null)} title="تفاصيل إيصال وتجهيز الطلب" size="lg">
        {viewOrder && (
          <div>
            <div className="no-print flex justify-end gap-2 mb-4">
              <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
                <Printer className="w-4 h-4" /> طباعة إيصال العمل والعميل
              </button>
            </div>

            {/* الإيصال الشامل القابل للطباعة والمعاينة */}
            <div className="printable-receipt border dark:border-slate-700 p-6 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
              <div className="text-center border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">المركز الإيطالي للبصريات والعيادة الطبية</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">إيصال طلب وتصنيع نظارة</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs mb-4 bg-slate-50 dark:bg-slate-700/50 p-3 rounded border border-slate-100 dark:border-slate-700">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">اسم العميل:</span> <strong className="text-slate-900 dark:text-slate-100">{viewOrder.customers?.name || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">الهاتف:</span> <strong className="text-slate-900 dark:text-slate-100">{viewOrder.customers?.phone || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">رقم الطلبية:</span> <strong className="text-slate-900 dark:text-slate-100">#{viewOrder.id.slice(0, 8)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">تاريخ الطلب:</span> <strong className="text-slate-900 dark:text-slate-100">{formatDate(viewOrder.created_at)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">حالة التصنيع:</span> <strong className="text-slate-900 dark:text-slate-100">{ORDER_STATUS_LABELS[viewOrder.status]}</strong>
                </div>
              </div>

              {/* قسم الوصفة الطبية (الفحص الكامل) */}
              <div className="mb-4 border border-brand-200 dark:border-brand-900/50 p-3 rounded bg-brand-50/20 dark:bg-brand-950/20">
                <div className="font-semibold text-brand-700 dark:text-brand-300 mb-2 text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4" /> الوصفة الطبية المرفقة (درجات الفحص):
                  </span>
                  {viewOrder.examination && (
                    <span className="text-[11px] text-slate-500 font-normal">
                      بتاريخ: {formatDate(viewOrder.examination.exam_date || viewOrder.examination.created_at)}
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-center text-xs border-collapse border border-slate-300 dark:border-slate-700">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                        <th className="border border-slate-300 dark:border-slate-700 p-2 font-bold">العين</th>
                        <th className="border border-slate-300 dark:border-slate-700 p-2 font-bold">SPH</th>
                        <th className="border border-slate-300 dark:border-slate-700 p-2 font-bold">CYL</th>
                        <th className="border border-slate-300 dark:border-slate-700 p-2 font-bold">AXIS</th>
                        <th className="border border-slate-300 dark:border-slate-700 p-2 font-bold">ADD</th>
                        <th className="border border-slate-300 dark:border-slate-700 p-2 font-bold">PD</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-300 dark:border-slate-700 p-2 font-bold">يمين (OD)</td>
                        <td className="border border-slate-300 dark:border-slate-700 p-2">
                          {getVal(viewOrder.examination, ['sph_right', 'right_sph', 'od_sph']) ?? '—'}
                        </td>
                        <td className="border border-slate-300 dark:border-slate-700 p-2">
                          {getVal(viewOrder.examination, ['cyl_right', 'right_cyl', 'od_cyl']) ?? '—'}
                        </td>
                        <td className="border border-slate-300 dark:border-slate-700 p-2">
                          {getVal(viewOrder.examination, ['axis_right', 'right_axis', 'od_axis']) ?? '—'}
                        </td>
                        <td className="border border-slate-300 dark:border-slate-700 p-2">
                          {getVal(viewOrder.examination, ['add_right', 'right_add', 'od_add']) ?? '—'}
                        </td>
                        <td className="border border-slate-300 dark:border-slate-700 p-2 font-bold" rowSpan={2}>
                          {getVal(viewOrder.examination, ['pd', 'ipd']) ?? '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 dark:border-slate-700 p-2 font-bold">يسار (OS)</td>
                        <td className="border border-slate-300 dark:border-slate-700 p-2">
                          {getVal(viewOrder.examination, ['sph_left', 'left_sph', 'os_sph']) ?? '—'}
                        </td>
                        <td className="border border-slate-300 dark:border-slate-700 p-2">
                          {getVal(viewOrder.examination, ['cyl_left', 'left_cyl', 'os_cyl']) ?? '—'}
                        </td>
                        <td className="border border-slate-300 dark:border-slate-700 p-2">
                          {getVal(viewOrder.examination, ['axis_left', 'left_axis', 'os_axis']) ?? '—'}
                        </td>
                        <td className="border border-slate-300 dark:border-slate-700 p-2">
                          {getVal(viewOrder.examination, ['add_left', 'left_add', 'os_add']) ?? '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* عناصر الأصناف بالنظارة */}
              {viewOrder.order_items && viewOrder.order_items.length > 0 ? (
                <table className="w-full text-right text-xs mb-4 border-collapse border border-slate-200 dark:border-slate-700">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 border-b">
                      <th className="p-2 border-b">الصنف/العنصر</th>
                      <th className="p-2 text-center border-b">الكمية</th>
                      <th className="p-2 text-left border-b">السعر الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewOrder.order_items.map((item: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-700">
                        <td className="p-2 font-medium">
                          {item.item_name} <span className="text-slate-400 text-[10px]">({item.item_type})</span>
                        </td>
                        <td className="p-2 text-center">{item.quantity}</td>
                        <td className="p-2 text-left font-bold">{formatCurrency(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-slate-400 text-center py-2 mb-3 bg-slate-50 dark:bg-slate-800 rounded">
                  لا توجد عناصر مسجلة في هذا الطلب
                </p>
              )}

              {/* الحسابات المادية */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3 text-xs space-y-1.5">
                <div className="flex justify-between font-bold text-sm">
                  <span>المجموع الكلي:</span>
                  <span>{formatCurrency(viewOrder.total_amount)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>المدفوع نقداً/الدفعة المقدمة:</span>
                  <span className="font-semibold text-accent-600">{formatCurrency(viewOrder.amount_paid)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>المتبقي عند الاستلام:</span>
                  <span className={(viewOrder.total_amount - viewOrder.amount_paid) > 0 ? 'text-red-500 font-bold' : 'font-semibold'}>
                    {formatCurrency(Math.max(0, viewOrder.total_amount - viewOrder.amount_paid))}
                  </span>
                </div>
              </div>

              {viewOrder.notes && (
                <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500">
                  <span className="font-semibold">ملاحظات الطلب:</span> {viewOrder.notes}
                </div>
              )}

              <div className="text-center text-[10px] text-slate-400 mt-6 border-t border-slate-100 dark:border-slate-700 pt-2">
                شكراً لزيارتكم - يرجى الاحتفاظ بهذا الإيصال عند استلام النظارة
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* التنسيقات المخصصة الحاكمة لإجبار الطباعة بكامل المحتوى */}
      <style>{`
        @media print {
          /* إخفاء عناصر الموقع والكونتينر والنافذة العائمة */
          body * {
            visibility: hidden !important;
          }
          
          /* توجيه الطباعة بالكامل لإظهار الإيصال فقط */
          .printable-receipt, .printable-receipt * {
            visibility: visible !important;
          }

          .printable-receipt {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            padding: 20px !important;
            margin: 0 !important;
            background-color: white !important;
            color: black !important;
            border: none !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .printable-receipt table, 
          .printable-receipt th, 
          .printable-receipt td {
            border-color: #000000 !important;
            color: #000000 !important;
          }

          .printable-receipt div, 
          .printable-receipt span, 
          .printable-receipt p, 
          .printable-receipt h2 {
            color: #000000 !important;
          }
        }
      `}</style>
    </div>
  );
}
