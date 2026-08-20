import { useEffect, useState } from 'react';
import { Eye, Plus, Search, Printer, History, Trash2, Edit } from 'lucide-react';
import {
  supabase,
  formatDate,
  type Customer,
  type Examination,
} from '@/lib/supabase';
import { PageHeader, Modal, Badge, LoadingSpinner, EmptyState } from '@/components/ui';

const emptyExam = {
  customer_id: '',
  exam_date: new Date().toISOString().slice(0, 10),
  od_sph: '',
  od_cyl: '',
  od_axis: '',
  od_add: '',
  od_pd: '',
  os_sph: '',
  os_cyl: '',
  os_axis: '',
  os_add: '',
  os_pd: '',
  visual_field: '',
  notes: '',
  doctor_name: '',
};

export default function Examinations() {
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<(Examination & { customers?: { name: string } })[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyExam });
  const [selectedExam, setSelectedExam] = useState<Examination | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [historyExams, setHistoryExams] = useState<Examination[]>([]);

  useEffect(() => {
    (async () => {
      const [examRes, custRes] = await Promise.all([
        supabase.from('examinations').select('*, customers(name)').order('created_at', { ascending: false }),
        supabase.from('customers').select('*').order('name'),
      ]);
      setExams(examRes.data || []);
      setCustomers(custRes.data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = exams.filter((e) => {
    const name = e.customers?.name || '';
    return name.includes(search) || (e.doctor_name || '').includes(search);
  });

  function openNew() {
    setForm({ ...emptyExam, exam_date: new Date().toISOString().slice(0, 10) });
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(exam: Examination) {
    setForm({
      customer_id: exam.customer_id,
      exam_date: exam.exam_date,
      od_sph: exam.od_sph?.toString() || '',
      od_cyl: exam.od_cyl?.toString() || '',
      od_axis: exam.od_axis?.toString() || '',
      od_add: exam.od_add?.toString() || '',
      od_pd: exam.od_pd?.toString() || '',
      os_sph: exam.os_sph?.toString() || '',
      os_cyl: exam.os_cyl?.toString() || '',
      os_axis: exam.os_axis?.toString() || '',
      os_add: exam.os_add?.toString() || '',
      os_pd: exam.os_pd?.toString() || '',
      visual_field: exam.visual_field || '',
      notes: exam.notes || '',
      doctor_name: exam.doctor_name || '',
    });
    setEditingId(exam.id);
    setShowModal(true);
  }

  async function save() {
    if (!form.customer_id) {
      alert('الرجاء اختيار العميل');
      return;
    }
    const payload = {
      customer_id: form.customer_id,
      exam_date: form.exam_date,
      od_sph: form.od_sph ? parseFloat(form.od_sph) : null,
      od_cyl: form.od_cyl ? parseFloat(form.od_cyl) : null,
      od_axis: form.od_axis ? parseInt(form.od_axis) : null,
      od_add: form.od_add ? parseFloat(form.od_add) : null,
      od_pd: form.od_pd ? parseFloat(form.od_pd) : null,
      os_sph: form.os_sph ? parseFloat(form.os_sph) : null,
      os_cyl: form.os_cyl ? parseFloat(form.os_cyl) : null,
      os_axis: form.os_axis ? parseInt(form.os_axis) : null,
      os_add: form.os_add ? parseFloat(form.os_add) : null,
      os_pd: form.os_pd ? parseFloat(form.os_pd) : null,
      visual_field: form.visual_field || null,
      notes: form.notes || null,
      doctor_name: form.doctor_name || null,
    };

    if (editingId) {
      const { error } = await supabase.from('examinations').update(payload).eq('id', editingId);
      if (error) { alert('خطأ: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('examinations').insert(payload);
      if (error) { alert('خطأ: ' + error.message); return; }
    }

    const { data } = await supabase.from('examinations').select('*, customers(name)').order('created_at', { ascending: false });
    setExams(data || []);
    setShowModal(false);
  }

  async function deleteExam(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الفحص؟')) return;
    await supabase.from('examinations').delete().eq('id', id);
    setExams((prev) => prev.filter((e) => e.id !== id));
  }

  async function viewHistory(customer: Customer) {
    setHistoryCustomer(customer);
    const { data } = await supabase
      .from('examinations')
      .select('*')
      .eq('customer_id', customer.id)
      .order('exam_date', { ascending: false });
    setHistoryExams(data || []);
    setShowHistory(true);
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* أنماط الطباعة الطولية والتقرير المخبري */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body * {
            visibility: hidden !important;
          }
          #print-prescription, #print-prescription * {
            visibility: visible !important;
          }
          #print-prescription {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important;
            padding: 30px !important;
            background: #ffffff !important;
            color: #000000 !important;
            z-index: 999999 !important;
            box-sizing: border-box !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <PageHeader
        title="الفحوصات والأرشيف الطبي"
        subtitle="سجل فحوصات النظر والوصفات الطبية"
        action={
          <button onClick={openNew} className="btn-primary">
            <Plus className="w-4 h-4" /> فحص جديد
          </button>
        }
      />

      {/* Search */}
      <div className="card p-4 mb-4">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم العميل أو الطبيب..."
            className="input pr-10"
          />
        </div>
      </div>

      {/* Exams table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState message="لا توجد فحوصات مسجلة" icon={<Eye className="w-10 h-10" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">العميل</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">التاريخ</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الطبيب</th>
                  <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الوصفة</th>
                  <th className="text-center p-3 text-sm font-medium text-slate-500 dark:text-slate-400">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((exam) => (
                  <tr key={exam.id} className="table-row">
                    <td className="p-3 text-sm font-medium text-slate-700 dark:text-slate-200">{exam.customers?.name || '—'}</td>
                    <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{formatDate(exam.exam_date)}</td>
                    <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{exam.doctor_name || '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-2 flex-wrap">
                        {exam.od_sph != null && <Badge text={`OD: ${exam.od_sph}`} color="brand" />}
                        {exam.os_sph != null && <Badge text={`OS: ${exam.os_sph}`} color="accent" />}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setSelectedExam(exam)} className="w-8 h-8 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/30 text-brand-600 flex items-center justify-center" title="عرض">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(exam)} className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center" title="تعديل">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteExam(exam.id)} className="w-8 h-8 rounded-lg hover:bg-error-50 dark:hover:bg-error-900/30 text-error-500 flex items-center justify-center" title="حذف">
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

      {/* Customer history quick access */}
      <div className="mt-6">
        <h3 className="font-display font-bold text-base text-slate-700 dark:text-slate-200 mb-3">أرشيف المرضى</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {customers.slice(0, 12).map((c) => (
            <button
              key={c.id}
              onClick={() => viewHistory(c)}
              className="card card-hover p-3 flex items-center gap-3 text-right"
            >
              <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
                <History className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{c.name}</p>
                <p className="text-xs text-slate-400">{c.phone || '—'}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* New/Edit modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل الفحص' : 'فحص بصري جديد'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">العميل *</label>
              <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className="input">
                <option value="">اختر العميل...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">تاريخ الفحص</label>
              <input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} className="input" />
            </div>
          </div>

          {/* Right Eye (OD) */}
          <div className="card p-4 bg-slate-50 dark:bg-slate-700/30 border border-brand-100 dark:border-brand-900/30">
            <h4 className="font-display font-bold text-sm text-brand-700 dark:text-brand-300 mb-3">العين اليمنى (OD)</h4>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              <div>
                <label className="label">SPH</label>
                <input type="number" step="0.25" value={form.od_sph} onChange={(e) => setForm({ ...form, od_sph: e.target.value })} className="input text-center" placeholder="0.00" />
              </div>
              <div>
                <label className="label">CYL</label>
                <input type="number" step="0.25" value={form.od_cyl} onChange={(e) => setForm({ ...form, od_cyl: e.target.value })} className="input text-center" placeholder="0.00" />
              </div>
              <div>
                <label className="label">AXIS</label>
                <input type="number" value={form.od_axis} onChange={(e) => setForm({ ...form, od_axis: e.target.value })} className="input text-center" placeholder="0" />
              </div>
              <div>
                <label className="label">ADD</label>
                <input type="number" step="0.25" value={form.od_add} onChange={(e) => setForm({ ...form, od_add: e.target.value })} className="input text-center" placeholder="0.00" />
              </div>
              <div>
                <label className="label">PD</label>
                <input type="number" step="0.5" value={form.od_pd} onChange={(e) => setForm({ ...form, od_pd: e.target.value })} className="input text-center" placeholder="0.0" />
              </div>
            </div>
          </div>

          {/* Left Eye (OS) */}
          <div className="card p-4 bg-slate-50 dark:bg-slate-700/30 border border-accent-100 dark:border-accent-900/30">
            <h4 className="font-display font-bold text-sm text-accent-700 dark:text-accent-300 mb-3">العين اليسرى (OS)</h4>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              <div>
                <label className="label">SPH</label>
                <input type="number" step="0.25" value={form.os_sph} onChange={(e) => setForm({ ...form, os_sph: e.target.value })} className="input text-center" placeholder="0.00" />
              </div>
              <div>
                <label className="label">CYL</label>
                <input type="number" step="0.25" value={form.os_cyl} onChange={(e) => setForm({ ...form, os_cyl: e.target.value })} className="input text-center" placeholder="0.00" />
              </div>
              <div>
                <label className="label">AXIS</label>
                <input type="number" value={form.os_axis} onChange={(e) => setForm({ ...form, os_axis: e.target.value })} className="input text-center" placeholder="0" />
              </div>
              <div>
                <label className="label">ADD</label>
                <input type="number" step="0.25" value={form.os_add} onChange={(e) => setForm({ ...form, os_add: e.target.value })} className="input text-center" placeholder="0.00" />
              </div>
              <div>
                <label className="label">PD</label>
                <input type="number" step="0.5" value={form.os_pd} onChange={(e) => setForm({ ...form, os_pd: e.target.value })} className="input text-center" placeholder="0.0" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">المجال البصري</label>
              <input type="text" value={form.visual_field} onChange={(e) => setForm({ ...form, visual_field: e.target.value })} className="input" placeholder="قياسات المجال البصري" />
            </div>
            <div>
              <label className="label">الطبيب</label>
              <input type="text" value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} className="input" placeholder="اسم الطبيب" />
            </div>
          </div>

          <div>
            <label className="label">ملاحظات سريرية</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[80px]" placeholder="ملاحظات إضافية..." />
          </div>

          <button onClick={save} className="btn-primary w-full">
            <Plus className="w-4 h-4" /> {editingId ? 'حفظ التعديلات' : 'حفظ الفحص'}
          </button>
        </div>
      </Modal>

      {/* View exam / prescription modal */}
      <Modal open={!!selectedExam} onClose={() => setSelectedExam(null)} title="تقرير الفحص البصري" size="lg">
        {selectedExam && (
          <div>
            {/* تقرير الفحص بتصميم طولي يماثل الفحوصات المخبرية */}
            <div id="print-prescription" className="p-8 bg-white text-slate-900 border border-slate-300 rounded-lg max-w-2xl mx-auto font-sans dir-rtl">
              
              {/* ترويسة التقرير / Header */}
              <div className="flex justify-between items-center pb-6 mb-6 border-b-2 border-slate-900">
                <div className="text-right">
                  <h1 className="font-bold text-2xl text-slate-900 tracking-wide">المركز الإيطالي للبصريات</h1>
                  <p className="text-xs text-slate-600 mt-1 uppercase font-semibold">Italian Optical Center - Vision Care</p>
                </div>
                <div className="text-left">
                  <div className="px-3 py-1 bg-slate-100 text-slate-800 font-bold text-xs uppercase border border-slate-300 rounded">
                    تقرير فحص نظر / Visual Exam Report
                  </div>
                </div>
              </div>

              {/* بطاقة معلومات المريض والطبيب */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-md border border-slate-200 mb-6 text-xs">
                <div>
                  <p className="text-slate-500 mb-1"><span className="font-bold text-slate-800">اسم المريض / Patient:</span></p>
                  <p className="text-sm font-bold text-slate-900">{selectedExam.customers?.name || customers.find(c => c.id === selectedExam.customer_id)?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1"><span className="font-bold text-slate-800">تاريخ الفحص / Exam Date:</span></p>
                  <p className="text-sm font-bold text-slate-900">{formatDate(selectedExam.exam_date)}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1"><span className="font-bold text-slate-800">الطبيب / الأخصائي:</span></p>
                  <p className="text-slate-900">{selectedExam.doctor_name || 'طبيب المركز'}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1"><span className="font-bold text-slate-800">رقم الفحص / Ref:</span></p>
                  <p className="text-slate-900 font-mono">#{selectedExam.id.slice(0, 8)}</p>
                </div>
              </div>

              {/* عنوان الجدول */}
              <div className="mb-2">
                <h3 className="font-bold text-sm text-slate-800 border-r-4 border-slate-800 pr-2">قياسات الانكسار والنظر (Refraction Results)</h3>
              </div>

              {/* جدول قياسات العينين طولي ومرتب بشكل مخبري */}
              <table className="w-full text-center border-collapse mb-6 text-xs">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="border border-slate-800 p-2 text-right">العين (Eye)</th>
                    <th className="border border-slate-800 p-2">SPH (الكروي)</th>
                    <th className="border border-slate-800 p-2">CYL (الأسطواني)</th>
                    <th className="border border-slate-800 p-2">AXIS (المحور)</th>
                    <th className="border border-slate-800 p-2">ADD (الإضافة)</th>
                    <th className="border border-slate-800 p-2">PD (مسافة البؤبؤ)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-300">
                    <td className="border border-slate-300 p-2 text-right font-bold bg-slate-50">العين اليمنى (O.D)</td>
                    <td className="border border-slate-300 p-2 font-mono text-sm">{selectedExam.od_sph ?? '—'}</td>
                    <td className="border border-slate-300 p-2 font-mono text-sm">{selectedExam.od_cyl ?? '—'}</td>
                    <td className="border border-slate-300 p-2 font-mono text-sm">{selectedExam.od_axis ?? '—'}</td>
                    <td className="border border-slate-300 p-2 font-mono text-sm">{selectedExam.od_add ?? '—'}</td>
                    <td className="border border-slate-300 p-2 font-mono text-sm">{selectedExam.od_pd ?? '—'}</td>
                  </tr>
                  <tr className="border-b border-slate-300">
                    <td className="border border-slate-300 p-2 text-right font-bold bg-slate-50">العين اليسرى (O.S)</td>
                    <td className="border border-slate-300 p-2 font-mono text-sm">{selectedExam.os_sph ?? '—'}</td>
                    <td className="border border-slate-300 p-2 font-mono text-sm">{selectedExam.os_cyl ?? '—'}</td>
                    <td className="border border-slate-300 p-2 font-mono text-sm">{selectedExam.os_axis ?? '—'}</td>
                    <td className="border border-slate-300 p-2 font-mono text-sm">{selectedExam.os_add ?? '—'}</td>
                    <td className="border border-slate-300 p-2 font-mono text-sm">{selectedExam.os_pd ?? '—'}</td>
                  </tr>
                </tbody>
              </table>

              {/* نتائج وفحوصات إضافية */}
              <div className="space-y-3 mb-8">
                {selectedExam.visual_field && (
                  <div className="border border-slate-200 p-3 rounded bg-slate-50 text-xs">
                    <span className="font-bold text-slate-800">المجال البصري (Visual Field): </span>
                    <span className="text-slate-700">{selectedExam.visual_field}</span>
                  </div>
                )}
                {selectedExam.notes && (
                  <div className="border border-slate-200 p-3 rounded bg-slate-50 text-xs">
                    <span className="font-bold text-slate-800">ملاحظات والتوصيات الطبية: </span>
                    <p className="text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">{selectedExam.notes}</p>
                  </div>
                )}
              </div>

              {/* ذيل الفحص والتوقيعات */}
              <div className="pt-12 border-t border-slate-300 flex justify-between items-end text-xs">
                <div className="text-center">
                  <p className="font-bold text-slate-800 mb-8">اعتماد الطبيب / الأخصائي</p>
                  <p className="text-slate-400">________________________</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-800 mb-8">ختم المركز</p>
                  <div className="w-20 h-20 border-2 border-dashed border-slate-300 rounded-full mx-auto flex items-center justify-center text-slate-300">
                    الختم Official
                  </div>
                </div>
              </div>

              {/* هامش التقرير أسفل الورقة */}
              <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-500">
                المركز الإيطالي للبصريات — هذا التقرير طبي ومعتمد لفحوصات النظر والعدسات.
              </div>
            </div>

            {/* أزرار التحكم - لا تظهر في الطباعة */}
            <div className="no-print flex gap-2 mt-4">
              <button onClick={() => window.print()} className="btn-primary flex-1">
                <Printer className="w-4 h-4" /> طباعة التقرير (طولي)
              </button>
              <button onClick={() => setSelectedExam(null)} className="btn-secondary flex-1">إغلاق</button>
            </div>
          </div>
        )}
      </Modal>

      {/* History modal */}
      <Modal open={showHistory} onClose={() => setShowHistory(false)} title={`أرشيف الفحوصات — ${historyCustomer?.name || ''}`} size="lg">
        {historyExams.length === 0 ? (
          <EmptyState message="لا توجد فحوصات سابقة" icon={<History className="w-10 h-10" />} />
        ) : (
          <div className="space-y-3">
            {historyExams.map((exam) => (
              <div key={exam.id} className="card p-4 cursor-pointer hover:shadow-card-hover" onClick={() => { setShowHistory(false); setSelectedExam(exam); }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatDate(exam.exam_date)}</span>
                  {exam.doctor_name && <Badge text={exam.doctor_name} color="brand" />}
                </div>
                <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                  <span>OD: {exam.od_sph ?? '—'} / {exam.od_cyl ?? '—'} x{exam.od_axis ?? '—'}</span>
                  <span>OS: {exam.os_sph ?? '—'} / {exam.os_cyl ?? '—'} x{exam.os_axis ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
