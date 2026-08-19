import { useEffect, useState } from 'react';
import { Users, Plus, Search, Edit, Trash2, Clock, UserCheck, UserX } from 'lucide-react';
import {
  supabase,
  formatCurrency,
  formatDate,
  formatDateTime,
  ROLE_LABELS,
  ATTENDANCE_LABELS,
  type Employee,
  type EmployeeRole,
  type Attendance,
} from '@/lib/supabase';
import { PageHeader, Modal, Badge, LoadingSpinner, EmptyState, StatCard } from '@/components/ui';

const ROLES = Object.keys(ROLE_LABELS) as EmployeeRole[];

const emptyForm = {
  name: '',
  role: 'cashier' as EmployeeRole,
  phone: '',
  email: '',
  salary: '',
  hire_date: new Date().toISOString().slice(0, 10),
  status: 'active' as 'active' | 'inactive',
};

export default function Employees() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'attendance'>('list');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<(Attendance & { employees?: { name: string } })[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [attForm, setAttForm] = useState({
    employee_id: '',
    date: new Date().toISOString().slice(0, 10),
    check_in: '',
    check_out: '',
    status: 'present' as 'present' | 'absent' | 'late' | 'leave',
    notes: '',
  });

  useEffect(() => {
    (async () => {
      const [empRes, attRes] = await Promise.all([
        supabase.from('employees').select('*').order('name'),
        supabase.from('attendance').select('*, employees(name)').order('date', { ascending: false }),
      ]);
      setEmployees(empRes.data || []);
      setAttendance(attRes.data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = employees.filter((e) => e.name.includes(search) || (e.phone || '').includes(search));

  async function save() {
    if (!form.name) { alert('الاسم مطلوب'); return; }
    const payload = {
      name: form.name,
      role: form.role,
      phone: form.phone || null,
      email: form.email || null,
      salary: parseFloat(form.salary) || 0,
      hire_date: form.hire_date,
      status: form.status,
    };

    if (editingId) {
      const { error } = await supabase.from('employees').update(payload).eq('id', editingId);
      if (error) { alert('خطأ: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('employees').insert(payload);
      if (error) { alert('خطأ: ' + error.message); return; }
    }

    const { data } = await supabase.from('employees').select('*').order('name');
    setEmployees(data || []);
    setShowModal(false);
  }

  async function deleteEmp(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    await supabase.from('employees').delete().eq('id', id);
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  }

  async function saveAttendance() {
    if (!attForm.employee_id) { alert('اختر موظف'); return; }
    const { error } = await supabase.from('attendance').insert({
      employee_id: attForm.employee_id,
      date: attForm.date,
      check_in: attForm.check_in ? new Date(`${attForm.date}T${attForm.check_in}`).toISOString() : null,
      check_out: attForm.check_out ? new Date(`${attForm.date}T${attForm.check_out}`).toISOString() : null,
      status: attForm.status,
      notes: attForm.notes || null,
    });
    if (error) { alert('خطأ: ' + error.message); return; }
    const { data } = await supabase.from('attendance').select('*, employees(name)').order('date', { ascending: false });
    setAttendance(data || []);
    setShowAttendanceModal(false);
    setAttForm({ ...attForm, employee_id: '', check_in: '', check_out: '', notes: '' });
  }

  if (loading) return <LoadingSpinner />;

  const totalSalaries = employees.filter((e) => e.status === 'active').reduce((s, e) => s + e.salary, 0);
  const activeCount = employees.filter((e) => e.status === 'active').length;
  const todayAttendance = attendance.filter((a) => a.date === new Date().toISOString().slice(0, 10));

  return (
    <div>
      <PageHeader title="إدارة الموظفين" subtitle="الموظفين والرواتب والدوام — بدون عمولات" />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="الموظفين النشطين" value={activeCount} icon={<UserCheck className="w-6 h-6 text-white" />} color="accent" />
        <StatCard label="إجمالي الرواتب" value={formatCurrency(totalSalaries)} icon={<Users className="w-6 h-6 text-white" />} color="brand" />
        <StatCard label="حضور اليوم" value={todayAttendance.length} icon={<Clock className="w-6 h-6 text-white" />} color="warning" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
        {([
          { id: 'list', label: 'قائمة الموظفين' },
          { id: 'attendance', label: 'سجل الدوام' },
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

      {tab === 'list' && (
        <div>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن موظف..." className="input pr-10" />
            </div>
            <button onClick={() => { setForm({ ...emptyForm }); setEditingId(null); setShowModal(true); }} className="btn-primary">
              <Plus className="w-4 h-4" /> موظف جديد
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="card"><EmptyState message="لا يوجد موظفون" icon={<Users className="w-10 h-10" />} /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((emp) => (
                <div key={emp.id} className="card card-hover p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-lg">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white">{emp.name}</p>
                        <Badge text={ROLE_LABELS[emp.role]} color="brand" />
                      </div>
                    </div>
                    <Badge text={emp.status === 'active' ? 'نشط' : 'موقوف'} color={emp.status === 'active' ? 'accent' : 'slate'} />
                  </div>
                  <div className="space-y-1 text-sm text-slate-500 dark:text-slate-400 mb-3">
                    <p>{emp.phone || '—'}</p>
                    <p>{emp.email || '—'}</p>
                    <p>الراتب: <span className="font-bold text-slate-700 dark:text-slate-200">{formatCurrency(emp.salary)}</span></p>
                    <p>التعيين: {formatDate(emp.hire_date)}</p>
                  </div>
                  <div className="flex gap-1 border-t border-slate-100 dark:border-slate-700 pt-3">
                    <button onClick={() => { setForm({ name: emp.name, role: emp.role, phone: emp.phone || '', email: emp.email || '', salary: emp.salary.toString(), hire_date: emp.hire_date, status: emp.status }); setEditingId(emp.id); setShowModal(true); }} className="btn-ghost flex-1 text-xs">
                      <Edit className="w-4 h-4" /> تعديل
                    </button>
                    <button onClick={() => deleteEmp(emp.id)} className="btn-ghost text-error-500 text-xs">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowAttendanceModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> تسجيل دوام
            </button>
          </div>

          {attendance.length === 0 ? (
            <div className="card"><EmptyState message="لا توجد سجلات دوام" icon={<Clock className="w-10 h-10" />} /></div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الموظف</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">التاريخ</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الحضور</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الانصراف</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">الحالة</th>
                      <th className="text-right p-3 text-sm font-medium text-slate-500 dark:text-slate-400">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((a) => (
                      <tr key={a.id} className="table-row">
                        <td className="p-3 text-sm font-medium text-slate-700 dark:text-slate-200">{a.employees?.name || '—'}</td>
                        <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{formatDate(a.date)}</td>
                        <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{a.check_in ? formatDateTime(a.check_in) : '—'}</td>
                        <td className="p-3 text-sm text-slate-500 dark:text-slate-400">{a.check_out ? formatDateTime(a.check_out) : '—'}</td>
                        <td className="p-3"><Badge text={ATTENDANCE_LABELS[a.status]} color={a.status === 'present' ? 'accent' : a.status === 'absent' ? 'error' : 'warning'} /></td>
                        <td className="p-3 text-sm text-slate-400">{a.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Employee modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل موظف' : 'موظف جديد'} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">الاسم *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="اسم الموظف" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">الدور</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as EmployeeRole })} className="input">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">الراتب (₪)</label>
              <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="input text-left" placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">الهاتف</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" placeholder="07XX XXX XXXX" />
            </div>
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" placeholder="email@example.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">تاريخ التعيين</label>
              <input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">الحالة</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })} className="input">
                <option value="active">نشط</option>
                <option value="inactive">موقوف</option>
              </select>
            </div>
          </div>
          <button onClick={save} className="btn-primary w-full">
            <Plus className="w-4 h-4" /> {editingId ? 'حفظ التعديلات' : 'إضافة الموظف'}
          </button>
        </div>
      </Modal>

      {/* Attendance modal */}
      <Modal open={showAttendanceModal} onClose={() => setShowAttendanceModal(false)} title="تسجيل دوام" size="md">
        <div className="space-y-4">
          <div>
            <label className="label">الموظف *</label>
            <select value={attForm.employee_id} onChange={(e) => setAttForm({ ...attForm, employee_id: e.target.value })} className="input">
              <option value="">اختر موظف...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">التاريخ</label>
              <input type="date" value={attForm.date} onChange={(e) => setAttForm({ ...attForm, date: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">الحالة</label>
              <select value={attForm.status} onChange={(e) => setAttForm({ ...attForm, status: e.target.value as 'present' | 'absent' | 'late' | 'leave' })} className="input">
                <option value="present">حاضر</option>
                <option value="absent">غائب</option>
                <option value="late">متأخر</option>
                <option value="leave">إجازة</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">وقت الحضور</label>
              <input type="time" value={attForm.check_in} onChange={(e) => setAttForm({ ...attForm, check_in: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">وقت الانصراف</label>
              <input type="time" value={attForm.check_out} onChange={(e) => setAttForm({ ...attForm, check_out: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">ملاحظات</label>
            <input type="text" value={attForm.notes} onChange={(e) => setAttForm({ ...attForm, notes: e.target.value })} className="input" placeholder="ملاحظات..." />
          </div>
          <button onClick={saveAttendance} className="btn-primary w-full">
            <Clock className="w-4 h-4" /> حفظ السجل
          </button>
        </div>
      </Modal>
    </div>
  );
}
