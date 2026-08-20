import { useEffect, useState, useRef } from 'react';
import {
  Search,
  ScanLine,
  Trash2,
  ShoppingCart,
  Printer,
  Plus,
  Minus,
  UserPlus,
  CheckCircle,
} from 'lucide-react';
import {
  supabase,
  formatCurrency,
  formatDateTime,
  PAYMENT_LABELS,
  type Inventory,
  type Customer,
} from '@/lib/supabase';
import { PageHeader, Modal, Badge, LoadingSpinner, EmptyState } from '@/components/ui';

type CartItem = {
  inventory_id: string;
  name: string;
  barcode: string;
  price: number;
  qty: number;
  stock: number;
};

export default function POS() {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'partial'>('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [discount, setDiscount] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [invRes, custRes] = await Promise.all([
        supabase.from('inventory').select('*').gt('quantity', 0).order('name'),
        supabase.from('customers').select('*').order('name'),
      ]);
      setInventory(invRes.data || []);
      setCustomers(custRes.data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = inventory.filter(
    (i) =>
      i.name.includes(search) ||
      i.barcode.includes(search) ||
      (i.brand || '').includes(search)
  );

  function addToCart(item: Inventory) {
    setCart((prev) => {
      const existing = prev.find((c) => c.inventory_id === item.id);
      if (existing) {
        if (existing.qty >= item.quantity) return prev;
        return prev.map((c) =>
          c.inventory_id === item.id ? { ...c, qty: c.qty + 1 } : c
        );
      }
      return [
        ...prev,
        {
          inventory_id: item.id,
          name: item.name,
          barcode: item.barcode,
          price: item.sell_price,
          qty: 1,
          stock: item.quantity,
        },
      ];
    });
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.inventory_id !== id) return c;
          const newQty = c.qty + delta;
          if (newQty > c.stock) return c;
          return { ...c, qty: newQty };
        })
        .filter((c) => c.qty > 0)
    );
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((c) => c.inventory_id !== id));
  }

  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const item = inventory.find((i) => i.barcode === barcodeInput.trim());
    if (item) {
      addToCart(item);
      setBarcodeInput('');
    } else {
      barcodeRef.current?.classList.add('border-error-500');
      setTimeout(() => barcodeRef.current?.classList.remove('border-error-500'), 600);
    }
  }

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const discountNum = parseFloat(discount) || 0;
  const total = Math.max(0, subtotal - discountNum);
  const paid = parseFloat(amountPaid) || 0;
  const change = paymentMethod === 'cash' ? Math.max(0, paid - total) : 0;

  async function handleCheckout() {
    if (cart.length === 0) return;
    setProcessing(true);

    try {
      // 1. إنشاء سجل المبيعات الرئيسي
      const { data: sale, error: saleErr } = await supabase
        .from('sales')
        .insert({
          customer_id: selectedCustomer || null,
          subtotal,
          discount: discountNum,
          tax: 0,
          total,
          payment_method: paymentMethod,
          amount_paid: paymentMethod === 'cash' ? paid : total,
          change_due: change,
        })
        .select()
        .single();

      if (saleErr) {
        console.error('فشل إنشاء سجل المبيعات (Sales):', saleErr);
        throw saleErr;
      }

      // 2. تجهيز عناصر السلة للإدراج (بدون line_total لأنه عمود يُحسب تلقائياً)
      const saleItems = cart.map((c) => {
        const itemData: any = {
          sale_id: sale.id,
          item_name: c.name || 'منتج',
          barcode: c.barcode || '',
          quantity: Number(c.qty),
          unit_price: Number(c.price),
        };

        if (c.inventory_id) {
          itemData.inventory_id = c.inventory_id;
        }

        return itemData;
      });

      // 3. إدراج العناصر في جدول sale_items
      const { error: itemsErr } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsErr) {
        console.error('تفاصيل خطأ sale_items:', {
          message: itemsErr.message,
          details: itemsErr.details,
          hint: itemsErr.hint,
          code: itemsErr.code,
        });
        throw itemsErr;
      }

      // 4. تحديث الكميات في المخزون
      for (const item of cart) {
        if (item.inventory_id) {
          const inv = inventory.find((i) => i.id === item.inventory_id);
          if (inv) {
            await supabase
              .from('inventory')
              .update({ quantity: Math.max(0, inv.quantity - item.qty) })
              .eq('id', item.inventory_id);
          }
        }
      }

      // 5. إعداد الإيصال وتفريغ السلة
      const customer = customers.find((c) => c.id === selectedCustomer);

      setReceiptData({
        saleId: sale.id,
        items: [...cart],
        subtotal,
        discount: discountNum,
        total,
        paymentMethod,
        amountPaid: paymentMethod === 'cash' ? paid : total,
        change,
        customer: customer?.name || 'عميل نقدي',
        date: new Date().toISOString(),
      });
      setShowReceipt(true);

      setCart([]);
      setSelectedCustomer(null);
      setDiscount('');
      setAmountPaid('');
      setPaymentMethod('cash');

      // إعادة تحميل المخزون لتحديث الشاشة
      const { data: newInv } = await supabase
        .from('inventory')
        .select('*')
        .gt('quantity', 0)
        .order('name');
      setInventory(newInv || []);

    } catch (err: any) {
      console.error('Sale Processing Error:', err);
      alert(
        `حدث خطأ أثناء إتمام البيع:\n${err.message || 'يرجى التحقق من صحة البيانات أو قيود المفاتيح في Supabase'}`
      );
    } finally {
      setProcessing(false);
    }
  }

  async function addQuickCustomer() {
    if (!newCustomerName.trim()) return;
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: newCustomerName, phone: newCustomerPhone || null })
      .select()
      .single();
    if (!error && data) {
      setCustomers((prev) => [...prev, data]);
      setSelectedCustomer(data.id);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setShowCustomerModal(false);
    }
  }

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* CSS الخاص بالطباعة لمنع مشاكل تقطيع وإخفاء الصفحة */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #receipt-print-area, #receipt-print-area * {
            visibility: visible !important;
          }
          #receipt-print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            margin: 0 auto !important;
            padding: 10px !important;
            background: #fff !important;
            color: #000 !important;
            font-family: sans-serif !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <PageHeader title="الكاشير والباركود" subtitle="إدارة المبيعات ودعم الباركود" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Inventory & Search */}
        <div className="lg:col-span-2 space-y-4">
          <form onSubmit={handleBarcodeSubmit} className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
                <ScanLine className="w-6 h-6 text-brand-600 dark:text-brand-400" />
              </div>
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="امسح أو أدخل الباركود..."
                className="input flex-1 text-lg font-mono"
                autoFocus
              />
              <button type="submit" className="btn-primary">
                <Plus className="w-4 h-4" /> إضافة
              </button>
            </div>
          </form>

          <div className="card p-4">
            <div className="relative mb-4">
              <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن منتج بالاسم أو العلامة التجارية..."
                className="input pr-10"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState message="لا توجد منتجات مطابقة" />
                </div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="card card-hover p-3 text-right group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <ShoppingCart className="w-5 h-5 text-slate-400 group-hover:text-brand-500 transition-colors" />
                      </div>
                      <Badge text={`${item.quantity} متوفر`} color={item.quantity <= item.reorder_level ? 'warning' : 'accent'} />
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{item.name}</p>
                    <p className="text-xs text-slate-400 mb-2">{item.brand}</p>
                    <p className="text-sm font-bold text-brand-600 dark:text-brand-400">{formatCurrency(item.sell_price)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Cart */}
        <div className="card p-4 flex flex-col h-fit sticky top-20">
          <div className="mb-4">
            <label className="label">العميل</label>
            <div className="flex gap-2">
              <select
                value={selectedCustomer || ''}
                onChange={(e) => setSelectedCustomer(e.target.value || null)}
                className="input flex-1"
              >
                <option value="">عميل نقدي</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={() => setShowCustomerModal(true)}
                className="btn-secondary px-3"
                title="إضافة عميل"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[200px] max-h-[300px] overflow-y-auto mb-4">
            {cart.length === 0 ? (
              <EmptyState message="السلة فارغة — امسح باركود أو اختر منتج" icon={<ShoppingCart className="w-10 h-10" />} />
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.inventory_id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">{formatCurrency(item.price)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.inventory_id, -1)} className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                      <button onClick={() => updateQty(item.inventory_id, 1)} className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button onClick={() => removeFromCart(item.inventory_id)} className="w-7 h-7 rounded-lg text-error-500 flex items-center justify-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">المجموع الفرعي</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-500 dark:text-slate-400">الخصم</span>
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className="input w-24 text-sm text-left"
              />
            </div>
            <div className="flex items-center justify-between text-lg font-bold border-t border-slate-200 dark:border-slate-700 pt-2">
              <span className="text-slate-800 dark:text-white">الإجمالي</span>
              <span className="text-brand-600 dark:text-brand-400">{formatCurrency(total)}</span>
            </div>

            <div>
              <label className="label">طريقة الدفع</label>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'card', 'partial'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      paymentMethod === m
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {PAYMENT_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div>
                <label className="label">المبلغ المدفوع</label>
                <input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder={total.toString()}
                  className="input text-left"
                />
                {paid > 0 && (
                  <p className="text-sm text-accent-600 dark:text-accent-400 mt-1">
                    الباقي: {formatCurrency(change)}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || processing}
              className="btn-primary w-full text-base py-3"
            >
              {processing ? 'جاري المعالجة...' : 'إتمام البيع'}
            </button>
          </div>
        </div>
      </div>

      {/* Quick customer modal */}
      <Modal open={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="إضافة عميل سريع" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">الاسم *</label>
            <input type="text" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} className="input" placeholder="اسم العميل" />
          </div>
          <div>
            <label className="label">رقم الهاتف</label>
            <input type="text" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} className="input" placeholder="07XX XXX XXXX" />
          </div>
          <button onClick={addQuickCustomer} className="btn-primary w-full">
            <CheckCircle className="w-4 h-4" /> حفظ
          </button>
        </div>
      </Modal>

      {/* Receipt Modal & Printable Template */}
      <Modal open={showReceipt} onClose={() => setShowReceipt(false)} title="إيصال البيع" size="sm">
        {receiptData && (
          <div>
            <div id="receipt-print-area" className="p-4 bg-white text-slate-900 rounded-lg dir-rtl text-right font-sans">
              <div className="text-center mb-4 pb-3 border-b border-dashed border-slate-300">
                <h2 className="font-bold text-xl text-slate-900 mb-1">الرؤيا النقية للبصريات</h2>
                <p className="text-xs text-slate-500">إيصال بيع رسمي</p>
                <p className="text-xs text-slate-500 mt-1">{formatDateTime(receiptData.date)}</p>
                <p className="text-xs text-slate-500">رقم الفاتورة: #{receiptData.saleId.slice(0, 8)}</p>
                <p className="text-xs text-slate-600 font-medium mt-1">العميل: {receiptData.customer}</p>
              </div>

              <table className="w-full text-xs mb-4 border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-700">
                    <th className="text-right py-1">الصنف</th>
                    <th className="text-center py-1">العدد</th>
                    <th className="text-left py-1">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptData.items.map((item: CartItem, i: number) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 font-medium">{item.name}</td>
                      <td className="text-center py-1.5">{item.qty}</td>
                      <td className="text-left py-1.5 font-bold">{formatCurrency(item.price * item.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-dashed border-slate-300 pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>المجموع الفرعي:</span>
                  <span>{formatCurrency(receiptData.subtotal)}</span>
                </div>
                {receiptData.discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>الخصم:</span>
                    <span>-{formatCurrency(receiptData.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-slate-900 border-t pt-1 border-slate-200">
                  <span>الإجمالي:</span>
                  <span>{formatCurrency(receiptData.total)}</span>
                </div>
                <div className="flex justify-between text-slate-600 pt-1">
                  <span>طريقة الدفع:</span>
                  <span>{PAYMENT_LABELS[receiptData.paymentMethod]}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>المدفوع:</span>
                  <span>{formatCurrency(receiptData.amountPaid)}</span>
                </div>
                {receiptData.change > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>الباقي:</span>
                    <span>{formatCurrency(receiptData.change)}</span>
                  </div>
                )}
              </div>

              <div className="text-center text-xs text-slate-500 mt-6 pt-3 border-t border-slate-200">
                <p>شكراً لزيارتكم — نتمنى لكم دوام الصحة</p>
              </div>
            </div>

            <div className="no-print mt-5 flex gap-2">
              <button onClick={handlePrint} className="btn-primary flex-1 py-2.5">
                <Printer className="w-4 h-4" /> طباعة الإيصال
              </button>
              <button onClick={() => setShowReceipt(false)} className="btn-secondary flex-1 py-2.5">
                إغلاق
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
