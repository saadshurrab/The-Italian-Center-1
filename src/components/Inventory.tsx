import { useEffect, useState, useRef } from 'react';
import { Package, Plus, Search, Edit, Trash2, AlertTriangle, Barcode } from 'lucide-react';
import {
  supabase,
  formatCurrency,
  formatDate,
  generateBarcode,
  CATEGORY_LABELS,
  type Inventory,
  type InventoryCategory,
} from '@/lib/supabase';
import { PageHeader, Modal, Badge, LoadingSpinner, EmptyState } from '@/components/ui';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as InventoryCategory[];

const emptyForm = {
  barcode: '',
  name: '',
  category: 'frames' as InventoryCategory,
  brand: '',
  model: '',
  cost_price: '',
  sell_price: '',
  quantity: '',
  reorder_level: '5',
  supplier: '',
};

export default function Inventory() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Inventory[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  // المراجع الخاصة بالتركيز التلقائي عند المسح
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('inventory').select('*').order('name');
      setItems(data || []);
      setLoading(false);
    })();
  }, []);

  // تركيز تلقائي على حقل الباركود فور فتح النافذة
  useEffect(() => {
    if (showModal) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [showModal]);

  const filtered = items.filter((i) => {
    const matchSearch =
      i.name.includes(search) ||
      i.barcode.includes(search) ||
      (i.brand || '').includes(search);
    const matchCat = filterCat === 'all' || i.category === filterCat;
    return matchSearch && matchCat;
  });

  function openNew() {
    setForm({ ...emptyForm, barcode: '' }); // تفرغ لتصبح جاهزة لمسح القارئ
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(item: Inventory) {
    setForm({
      barcode: item.barcode,
      name: item.name,
      category: item.category,
      brand: item.brand || '',
      model: item.model || '',
      cost_price: item.cost_price.toString(),
      sell_price: item.sell_price.toString(),
      quantity: item.quantity.toString(),
      reorder_level: item.reorder_level.toString(),
      supplier: item.supplier || '',
    });
    setEditingId(item.id);
    setShowModal(true);
  }

  // التقاط مسح الباركود والانتقال لاسم المنتج تلقائياً
  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault(); // منع إرسال الفورم مبكراً
      if (form.barcode.trim()) {
        nameInputRef.current?.focus(); // الانتقال التلقائي إلى اسم المنتج
      }
    }
  }

  async function save() {
    if (!form.name || !form.barcode) {
      alert('الاسم والباركود مطلوبان');
      return;
    }
    const payload = {
      barcode: form.barcode,
      name: form.name,
      category: form.category,
      brand: form.brand || null,
      model: form.model || null,
      cost_price: parseFloat(form.cost_price) || 0,
      sell_price: parseFloat(form.sell_price) || 0,
      quantity: parseInt(form.quantity) || 0,
      reorder_level: parseInt(form.reorder_level) || 5,
      supplier: form.supplier || null,
    };

    if (editingId) {
      const { error } = await supabase.from('inventory').update(payload).eq('id', editingId);
      if (error) { alert('خطأ: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('inventory').insert(payload);
      if (error) { alert('خطأ: ' + error.message); return; }
    }

    const { data } = await supabase.from('inventory').select('*').order('name');
    setItems(data || []);
    setShowModal(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    await supabase.from('inventory').delete().eq('id', id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (loading) return <LoadingSpinner />;

  const totalValue = items.reduce((s, i) => s + i.cost_price * i.quantity, 0);
  const lowStockCount = items.filter((i) => i.quantity <= i.reorder_level).length;

  return (
    <div>
      <PageHeader
        title="إدارة المخزون"
        subtitle="المنتجات والباركود وتنبيهات الكمية"
        action={
          <button onClick={openNew} className="btn-primary">
            <Plus className="w-4 h-4" /> منتج جديد
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
            <Package className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400">إجمالي المنتجات</p>
            <p className="text-lg font-bold text-slate-800 dark:text-white">{items.length}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-50 dark:bg-accent-900/30 flex items-center justify-center">
            <Package className="w-5 h-5 text-accent-600 dark:text-accent-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400">قيمة المخزون</p>
            <p className="text-lg font-bold text-slate-800 dark:text-white">{formatCurrency(totalValue)}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-error-50 dark:bg-error-900/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-error-600 dark:text-error-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400">مخزون منخفض</p>
            <p className="text-lg font-bold text-slate-800 dark:text-white">{lowStockCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الباركود أو العلامة التجارية..."
              className="input pr-10"
            />
          </div>
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="input sm:w-48">
            <option value="all">كل الفئات</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState message="لا توجد منتجات" icon={<Package className="w-10 h-10" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الباركود</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">المنتج</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الفئة</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">سعر البيع</th>
                  <th className="text-center p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الكمية</th>
                  <th className="text-center p-3 text-sm font-medium text-slate-500 dark:text-slate-400">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="table-row">
                    <td className="p-3">
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{item.barcode}</span>
                    </td>
                    <td className="p-3">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.brand} {item.model}</p>
                    </td>
                    <td className="p-3">
                      <Badge text={CATEGORY_LABELS[item.category]} color="brand" />
                    </td>
                    <td className="p-3 text-sm font-bold text-brand-600 dark:text-brand-400">{formatCurrency(item.sell_price)}</td>
                    <td className="p-3 text-center">
                      <span className={`text-sm font-bold ${item.quantity <= item.reorder_level ? 'text-error-600 dark:text-error-400' : 'text-slate-700 dark:text-slate-200'}`}>
                        {item.quantity}
                      </span>
                      {item.quantity <= item.reorder_level && (
                        <AlertTriangle className="w-3.5 h-3.5 text-error-500 inline mr-1" />
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(item)} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteItem(item.id)} className="w-8 h-8 rounded-lg hover:bg-error-50 dark:hover:bg-error-900/30 text-error-500 flex items-center justify-center">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل منتج' : 'منتج جديد'} size="lg">
        <div className="space-y-4">
          {/* Barcode */}
          <div>
            <label className="label">الباركود</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900">
                <Barcode className="w-5 h-5 text-slate-400" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  onKeyDown={handleBarcodeKeyDown}
                  placeholder="امسح الباركود هنا..."
                  className="flex-1 bg-transparent outline-none font-mono text-sm text-slate-700 dark:text-slate-200"
                />
              </div>
              <button onClick={() => setForm({ ...form, barcode: generateBarcode() })} className="btn-secondary" type="button">
                <Barcode className="w-4 h-4" /> توليد
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">اسم المنتج *</label>
              <input
                ref={nameInputRef}
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input"
                placeholder="اسم المنتج"
              />
            </div>
            <div>
              <label className="label">الفئة</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as InventoryCategory })} className="input">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">العلامة التجارية</label>
              <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="input" placeholder="العلامة التجارية" />
            </div>
            <div>
              <label className="label">الموديل</label>
              <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input" placeholder="الموديل" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">سعر التكلفة (₪)</label>
              <input type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} className="input text-left" placeholder="0" />
            </div>
            <div>
              <label className="label">سعر البيع (₪)</label>
              <input type="number" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} className="input text-left" placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">الكمية</label>
              <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="input text-left" placeholder="0" />
            </div>
            <div>
              <label className="label">حد التنبيه</label>
              <input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} className="input text-left" placeholder="5" />
            </div>
          </div>

          <div>
            <label className="label">المورد</label>
            <input type="text" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="input" placeholder="اسم المورد" />
          </div>

          <button onClick={save} className="btn-primary w-full">
            <Plus className="w-4 h-4" /> {editingId ? 'حفظ التعديلات' : 'إضافة المنتج'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
