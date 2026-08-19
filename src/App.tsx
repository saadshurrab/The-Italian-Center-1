import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Eye,
  Package,
  ClipboardList,
  Wallet,
  Users,
  Contact,
  Moon,
  Sun,
  Glasses,
} from 'lucide-react';
import Dashboard from '@/components/Dashboard';
import POS from '@/components/POS';
import Examinations from '@/components/Examinations';
import Inventory from '@/components/Inventory';
import Orders from '@/components/Orders';
import Accounting from '@/components/Accounting';
import Employees from '@/components/Employees';
import Customers from '@/components/Customers';

export type ViewId =
  | 'dashboard'
  | 'pos'
  | 'examinations'
  | 'inventory'
  | 'orders'
  | 'accounting'
  | 'employees'
  | 'customers';

const NAV_ITEMS: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'pos', label: 'الكاشير والباركود', icon: ShoppingCart },
  { id: 'examinations', label: 'الفحوصات والأرشيف', icon: Eye },
  { id: 'inventory', label: 'المخزون', icon: Package },
  { id: 'orders', label: 'طلبيات العملاء', icon: ClipboardList },
  { id: 'accounting', label: 'المحاسبة والصندوق', icon: Wallet },
  { id: 'employees', label: 'الموظفين', icon: Users },
  { id: 'customers', label: 'إدارة العملاء', icon: Contact },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

export default function App() {
  const [view, setView] = useState<ViewId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { dark, toggle } = useTheme();

  const current = NAV_ITEMS.find((n) => n.id === view)!;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex" dir="rtl">
      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 right-0 z-50 w-64 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-200 dark:border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md">
            <Glasses className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display font-bold text-slate-800 dark:text-white text-sm leading-tight">
              المركز الإيطالي
            </h1>
            <p className="text-xs text-slate-400">للبصريات</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-brand-600 dark:text-brand-400' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={toggle}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {dark ? 'الوضع النهاري' : 'الوضع الليلي'}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <LayoutDashboard className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </button>
            <h2 className="font-display font-bold text-lg text-slate-800 dark:text-white">
              {current.label}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 dark:text-slate-400 hidden sm:block">
              {new Intl.DateTimeFormat('ar', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(new Date())}
            </span>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm">
              إ
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="animate-fade-in" key={view}>
            {view === 'dashboard' && <Dashboard />}
            {view === 'pos' && <POS />}
            {view === 'examinations' && <Examinations />}
            {view === 'inventory' && <Inventory />}
            {view === 'orders' && <Orders />}
            {view === 'accounting' && <Accounting />}
            {view === 'employees' && <Employees />}
            {view === 'customers' && <Customers />}
          </div>
        </main>
      </div>
    </div>
  );
}
