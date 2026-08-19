-- تفعيل إضافة توليد المعرفات الفريدة UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. جدول العملاء (Customers)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    date_of_birth DATE,
    notes TEXT,
    balance NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. جدول الموظفين (Employees)
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('admin', 'optometrist', 'cashier')) DEFAULT 'cashier',
    phone VARCHAR(50),
    email VARCHAR(255),
    salary NUMERIC(10, 2) DEFAULT 0.00,
    hire_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. سجل الحضور والدوام (Attendance)
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    check_in TIME,
    check_out TIME,
    status VARCHAR(20) CHECK (status IN ('present', 'absent', 'late', 'leave')) DEFAULT 'present',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. جدول المخزون (Inventory)
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) CHECK (category IN ('frames', 'sunglasses', 'contact_lenses', 'lenses', 'solutions', 'accessories')) NOT NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    cost_price NUMERIC(10, 2) DEFAULT 0.00,
    sell_price NUMERIC(10, 2) DEFAULT 0.00,
    quantity INT DEFAULT 0,
    reorder_level INT DEFAULT 5,
    supplier VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. جدول الفحوصات والأرشيف البصري (Examinations)
CREATE TABLE IF NOT EXISTS public.examinations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
    doctor_name VARCHAR(255),
    exam_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    od_sph NUMERIC(4, 2),
    od_cyl NUMERIC(4, 2),
    od_axis INT,
    od_add NUMERIC(4, 2),
    od_pd NUMERIC(4, 2),
    os_sph NUMERIC(4, 2),
    os_cyl NUMERIC(4, 2),
    os_axis INT,
    os_add NUMERIC(4, 2),
    os_pd NUMERIC(4, 2),
    visual_field TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. جدول طلبيات العملاء (Orders)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT NOT NULL,
    examination_id UUID REFERENCES public.examinations(id) ON DELETE SET NULL,
    status VARCHAR(50) CHECK (status IN ('pending', 'in_lab', 'ready', 'delivered')) DEFAULT 'pending',
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(10, 2) DEFAULT 0.00,
    balance NUMERIC(10, 2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. تفاصيل أجزاء الطلبية (Order Items)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    inventory_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
    item_name VARCHAR(255) NOT NULL,
    item_type VARCHAR(50),
    quantity INT DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    line_total NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- 8. جدول المبيعات/الكاشير (Sales)
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    subtotal NUMERIC(10, 2) NOT NULL,
    discount NUMERIC(10, 2) DEFAULT 0.00,
    tax NUMERIC(10, 2) DEFAULT 0.00,
    total NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50) CHECK (payment_method IN ('cash', 'card', 'partial', 'installment')) DEFAULT 'cash',
    amount_paid NUMERIC(10, 2) NOT NULL,
    change_due NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. تفاصيل فاتورة المبيعات (Sale Items)
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
    inventory_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
    item_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(100),
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    line_total NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- 10. المحاسبة والصندوق (Cash Register)
CREATE TABLE IF NOT EXISTS public.cash_register (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    register_date DATE DEFAULT CURRENT_DATE NOT NULL,
    opening_balance NUMERIC(10, 2) DEFAULT 0.00,
    cash_in NUMERIC(10, 2) DEFAULT 0.00,
    cash_out NUMERIC(10, 2) DEFAULT 0.00,
    closing_balance NUMERIC(10, 2) DEFAULT 0.00,
    notes TEXT,
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. المصروفات (Expenses)
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    expense_date DATE DEFAULT CURRENT_DATE NOT NULL,
    category VARCHAR(50) CHECK (category IN ('rent', 'utilities', 'lab_fees', 'supplier_payments', 'salaries', 'maintenance', 'other')) NOT NULL,
    description TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50) CHECK (payment_method IN ('cash', 'card', 'transfer')) DEFAULT 'cash',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =======================================================
-- السماح بجميع العمليات للـ Anon API Key (لإلغاء قيود RLS)
-- =======================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public full access" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access" ON public.employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access" ON public.attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access" ON public.inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access" ON public.examinations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access" ON public.order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access" ON public.sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access" ON public.sale_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access" ON public.cash_register FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public full access" ON public.expenses FOR ALL USING (true) WITH CHECK (true);
