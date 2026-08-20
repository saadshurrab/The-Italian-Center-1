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
  Receipt,
  Eye,
  History,
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
  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');
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

  // حالة سجل الفواتير
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    const [invRes, custRes] = await Promise.all([
      supabase.from('inventory').select('*').gt('quantity', 0).order('name'),
      supabase.from('customers').select('*').order('name'),
    ]);
    setInventory(invRes.data || []);
    setCustomers(custRes.data || []);
    setLoading(false);
  }

  // جلب سجل الفواتير
  async function fetchSalesHistory() {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        customers (name, phone),
        sale_items (*)
      `)
      .order('created_at', { ascending: false });

    if (!error) {
      setSalesHistory(data || []);
    }
    setLoadingHistory(false);
  }

  useEffect(() => {
    if (activeTab === 'history') {
      fetchSalesHistory();
    }
  }, [activeTab]);

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

  const actualPaid = paymentMethod === 'cash' || paymentMethod === 'partial'
    ? (amountPaid !== '' ? parseFloat(amountPaid) || 0 : total)
    : total;
    
  const remainingOrChange = actualPaid - total;

  async function handleCheckout() {
    if (cart.length === 0) return;
    setProcessing(true);

    try {
      const { data: sale, error: saleErr } = await supabase
        .from('sales')
        .insert({
          customer_id: selectedCustomer || null,
          subtotal,
          discount: discountNum,
          tax: 0,
          total,
          payment_method: paymentMethod,
          amount_paid: actualPaid,
          change_due: remainingOrChange > 0 ? remainingOrChange : 0,
        })
        .select()
        .single();

      if (saleErr) throw saleErr;

      const saleItems = cart.map((c) => ({
        sale_id: sale.id,
        item_name: c.name || 'منتج',
        barcode: c.barcode || '',
        quantity: Number(c.qty),
        unit_price: Number(c.price),
        inventory_id: c.inventory_id || null,
      }));

      const { error: itemsErr } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsErr) throw itemsErr;

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

      const customer = customers.find((c) => c.id === selectedCustomer);

      setReceiptData({
        saleId: sale.id,
        items: [...cart],
        subtotal,
        discount: discountNum,
        total,
        paymentMethod,
        amountPaid: actualPaid,
        remainingOrChange,
        customerName: customer?.name || 'عميل نقدي',
        customerPhone: customer?.phone || 'غير مسجل',
        date: new Date().toISOString(),
      });
      setShowReceipt(true);

      setCart([]);
      setSelectedCustomer(null);
      setDiscount('');
      setAmountPaid('');
      setPaymentMethod('cash');

      fetchInitialData();
    } catch (err: any) {
      console.error('Sale Processing Error:', err);
      alert(`حدث خطأ أثناء إتمام البيع:\n${err.message || 'يرجى التأكد من البيانات'}`);
    } finally {
      setProcessing(false);
    }
  }

  // عرض إيصال قديم من سجل الفواتير
  function viewPastReceipt(sale: any) {
    const itemsFormatted = sale.sale_items.map((si: any) => ({
      name: si.item_name,
      qty: si.quantity,
      price: si.unit_price,
    }));

    setReceiptData({
      saleId: sale.id,
      items: itemsFormatted,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      paymentMethod: sale.payment_method,
      amountPaid: sale.amount_paid,
      remainingOrChange: sale.amount_paid - sale.total,
      customerName: sale.customers?.name || 'عميل نقدي',
      customerPhone: sale.customers?.phone || 'غير مسجل',
      date: sale.created_at,
    });
    setShowReceipt(true);
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
    const printContent = document.getElementById('receipt-printable-content');
    if (!printContent) return;

    const printWindow = window.open('', '_blank', 'left=100,top=100,width=800,height=900');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <title>فاتورة - المركز الإيطالي للبصريات</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            body { font-family: system-ui, -apple-system, sans-serif; background: #fff !important; color: #000 !important; padding: 0; margin: 0; }
          </style>
        </head>
        <body onload="window.print(); setTimeout(function(){ window.close(); }, 500);">
          <div style="padding: 10px;">${printContent.innerHTML}</div>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const filteredHistory = salesHistory.filter((s) => {
    const customerName = s.customers?.name || 'عميل نقدي';
    const saleId = s.id.toLowerCase();
    const query = historySearch.toLowerCase();
    return customerName.toLowerCase().includes(query) || saleId.includes(query);
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader title="الكاشير والمبيعات" subtitle="نقطة البيع وسجل الفواتير والإيصالات" />
        
        {/* أزرار التبديل بين الكاشير وسجل الفواتير */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'pos'
                ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <ShoppingCart className="w-4 h-4" /> نقطة البيع
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'history'
                ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <History className="w-4 h-4" /> سجل الفواتير
          </button>
        </div>
      </div>

      {/* شاشة الكاشير الرئيسية */}
      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* اليسار: البحث والمنتجات */}
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

          {/* اليمين: السلة والدفع */}
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

              {(paymentMethod === 'cash' || paymentMethod === 'partial') && (
                <div>
                  <label className="label">المبلغ المدفوع (اتركه فارغاً إن دفع الكلي)</label>
                  <input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder={total.toString()}
                    className="input text-left"
                  />
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
      )}

      {/* شاشة سجل الفواتير والإيصالات */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="ابحث باسم العميل أو رقم الفاتورة..."
                className="input pr-10"
              />
            </div>
          </div>

          <div className="card overflow-hidden">
            {loadingHistory ? (
              <LoadingSpinner />
            ) : filteredHistory.length === 0 ? (
              <EmptyState message="لا توجد فواتير سابقة" icon={<Receipt className="w-10 h-10" />} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">رقم الفاتورة</th>
                      <th className="p-3">اسم العميل</th>
                      <th className="p-3">التاريخ والوقت</th>
                      <th className="p-3">طريقة الدفع</th>
                      <th className="p-3">الإجمالي</th>
                      <th className="p-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {filteredHistory.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="p-3 font-mono text-xs font-bold text-brand-600">
                          #{sale.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="p-3 font-medium">
                          {sale.customers?.name || 'عميل نقدي'}
                        </td>
                        <td className="p-3 text-xs text-slate-400">
                          {formatDateTime(sale.created_at)}
                        </td>
                        <td className="p-3">
                          <Badge text={PAYMENT_LABELS[sale.payment_method as keyof typeof PAYMENT_LABELS]} color="brand" />
                        </td>
                        <td className="p-3 font-bold font-mono">
                          {formatCurrency(sale.total)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => viewPastReceipt(sale)}
                            className="btn-secondary px-3 py-1 text-xs gap-1 inline-flex items-center"
                          >
                            <Eye className="w-3.5 h-3.5" /> عرض الفاتورة
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick customer modal */}
      <Modal open={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="إضافة عميل سريع" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">الاسم *</label>
            <input type="text" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} className="input" placeholder="اسم العميل" />
          </div>
          <div>
            <label className="label">رقم الهاتف</label>
            <input type="text" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} className="input" placeholder="059XXXXXXXX" />
          </div>
          <button onClick={addQuickCustomer} className="btn-primary w-full">
            <CheckCircle className="w-4 h-4" /> حفظ
          </button>
        </div>
      </Modal>

      {/* Receipt Modal (للطباعة والمعاينة) */}
      <Modal open={showReceipt} onClose={() => setShowReceipt(false)} title="إيصال البيع الرسمي" size="lg">
        {receiptData && (
          <div>
            <div id="receipt-printable-content" className="p-6 bg-white text-slate-900 dir-rtl text-right border border-slate-200 rounded-xl">
              
              {/* Header */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-4">
                <div>
                  <h1 className="font-extrabold text-2xl text-slate-900 tracking-tight">المركز الإيطالي للبصريات</h1>
                  <p className="text-xs text-slate-600 mt-1 font-medium">لتجهيز وقص جميع أنواع النظارات الطبية والشمسية</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">فاتورة بيع رسمية / إيصال استلام</p>
                </div>
                <div className="text-left text-xs text-slate-700 space-y-1">
                  <p><span className="font-bold text-slate-900">رقم الفاتورة:</span> #{receiptData.saleId.slice(0, 8).toUpperCase()}</p>
                  <p><span className="font-bold text-slate-900">التاريخ والوقت:</span> {formatDateTime(receiptData.date)}</p>
                  <p><span className="font-bold text-slate-900">طريقة الدفع:</span> {PAYMENT_LABELS[receiptData.paymentMethod as keyof typeof PAYMENT_LABELS]}</p>
                </div>
              </div>

              {/* Customer Info */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-500">اسم العميل: </span>
                  <span className="font-bold text-slate-900">{receiptData.customerName}</span>
                </div>
                <div>
                  <span className="text-slate-500">رقم الهاتف: </span>
                  <span className="font-medium text-slate-900">{receiptData.customerPhone}</span>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-xs mb-4 border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-y border-slate-300 text-slate-800">
                    <th className="text-right py-2 px-2">#</th>
                    <th className="text-right py-2 px-2">السلعة / المنتج</th>
                    <th className="text-center py-2 px-2">الكمية</th>
                    <th className="text-left py-2 px-2">سعر الوحدة</th>
                    <th className="text-left py-2 px-2">المجموع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {receiptData.items.map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="py-2.5 px-2 text-slate-400">{i + 1}</td>
                      <td className="py-2.5 px-2 font-bold text-slate-800">{item.name}</td>
                      <td className="py-2.5 px-2 text-center font-medium">{item.qty}</td>
                      <td className="py-2.5 px-2 text-left font-mono">{formatCurrency(item.price)}</td>
                      <td className="py-2.5 px-2 text-left font-bold font-mono text-slate-900">{formatCurrency(item.price * item.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-between items-start pt-3 border-t-2 border-slate-300">
                <div className="text-[11px] text-slate-500 space-y-1 max-w-[260px]">
                  <p>• البضاعة المبيعة ترجع أو تستبدل خلال 3 أيام بشرط حالتها الأصلية.</p>
                  <p>• يرجى الاحتفاظ بهذا الإيصال للمراجعة.</p>
                </div>

                <div className="w-56 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>المجموع الفرعي:</span>
                    <span className="font-mono">{formatCurrency(receiptData.subtotal)}</span>
                  </div>
                  {receiptData.discount > 0 && (
                    <div className="flex justify-between text-red-600 font-medium">
                      <span>الخصم:</span>
                      <span className="font-mono">-{formatCurrency(receiptData.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-extrabold text-sm text-slate-900 border-t border-b py-1.5 border-slate-300">
                    <span>الإجمالي النهائي:</span>
                    <span className="font-mono">{formatCurrency(receiptData.total)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700 pt-0.5">
                    <span>المبلغ المدفوع:</span>
                    <span className="font-mono font-bold">{formatCurrency(receiptData.amountPaid)}</span>
                  </div>
                  {receiptData.remainingOrChange > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>الباقي للعميل:</span>
                      <span className="font-mono">{formatCurrency(receiptData.remainingOrChange)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="text-center text-[11px] text-slate-500 mt-6 pt-3 border-t border-slate-200">
                <p className="font-bold text-slate-800 mb-0.5">شكراً لتسوقكم من المركز الإيطالي للبصريات</p>
                <p>نتمنى لكم دوام الصحة والعافية</p>
              </div>

            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={handlePrint} className="btn-primary flex-1 py-3 text-base">
                <Printer className="w-5 h-5" /> طباعة الإيصال
              </button>
              <button onClick={() => setShowReceipt(false)} className="btn-secondary px-6 py-3">
                إغلاق
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
