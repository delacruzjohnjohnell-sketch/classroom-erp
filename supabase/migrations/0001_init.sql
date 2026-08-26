-- ============================================================
-- Classroom ERP — initial schema
-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Core tenancy ----------

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id),
  created_at timestamptz default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'student' check (role in ('student', 'teacher')),
  tenant_id uuid references tenants(id),
  created_at timestamptz default now()
);

-- Auto-create a profile row whenever someone signs up.
-- Reads role/full_name that the client passes in signUp() options.data.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Financials ----------

create table accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('asset','liability','equity','revenue','expense'))
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  entry_date date not null,
  memo text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid references journal_entries(id) on delete cascade,
  account_id uuid references accounts(id),
  debit numeric default 0,
  credit numeric default 0
);

-- ---------- Procurement ----------

create table vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  contact text
);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  vendor_id uuid references vendors(id),
  order_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','received')),
  total numeric not null default 0
);

create table purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references purchase_orders(id) on delete cascade,
  description text not null,
  qty numeric not null,
  unit_cost numeric not null
);

-- ---------- Inventory ----------

create table items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  sku text,
  name text not null,
  qty_on_hand numeric not null default 0,
  unit_cost numeric not null default 0,
  reorder_point numeric not null default 5
);

-- ---------- Sales / CRM ----------

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  email text
);

create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  customer_id uuid references customers(id),
  order_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','fulfilled')),
  total numeric not null default 0
);

create table sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid references sales_orders(id) on delete cascade,
  item_id uuid references items(id),
  description text not null,
  qty numeric not null,
  unit_price numeric not null
);

-- ---------- HR ----------

create table employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  title text,
  department text,
  salary numeric not null default 0
);

create table payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  run_date date not null default current_date,
  total numeric not null,
  headcount int not null
);

-- ============================================================
-- Row Level Security
-- Rule: a student sees/writes only their own tenant's rows.
--       a teacher sees/writes every tenant's rows.
-- ============================================================

create or replace function my_tenant_id() returns uuid as $$
  select tenant_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function is_teacher() returns boolean as $$
  select role = 'teacher' from profiles where id = auth.uid();
$$ language sql stable security definer;

-- profiles: everyone can read their own; teachers can read all
alter table profiles enable row level security;
create policy "read own or teacher reads all" on profiles for select
  using (id = auth.uid() or is_teacher());
create policy "update own profile" on profiles for update
  using (id = auth.uid());

-- tenants: students see their own tenant + can create new ones; teachers see all
alter table tenants enable row level security;
create policy "read tenants" on tenants for select
  using (id = my_tenant_id() or is_teacher() or true); -- readable so students can pick a company to join
create policy "create tenant" on tenants for insert
  with check (auth.uid() is not null);

-- generic tenant-scoped policy, reused for every operational table below
create or replace function tenant_scoped_policy(tbl text) returns void as $$
begin
  execute format('alter table %I enable row level security', tbl);
  execute format($f$create policy "tenant read" on %I for select using (tenant_id = my_tenant_id() or is_teacher())$f$, tbl);
  execute format($f$create policy "tenant write" on %I for all using (tenant_id = my_tenant_id() or is_teacher()) with check (tenant_id = my_tenant_id() or is_teacher())$f$, tbl);
end;
$$ language plpgsql;

select tenant_scoped_policy('accounts');
select tenant_scoped_policy('journal_entries');
select tenant_scoped_policy('vendors');
select tenant_scoped_policy('purchase_orders');
select tenant_scoped_policy('items');
select tenant_scoped_policy('customers');
select tenant_scoped_policy('sales_orders');
select tenant_scoped_policy('employees');
select tenant_scoped_policy('payroll_runs');

-- journal_lines / purchase_order_lines / sales_order_lines have no tenant_id of
-- their own — scope them through their parent row instead.
alter table journal_lines enable row level security;
create policy "line read" on journal_lines for select
  using (exists (select 1 from journal_entries e where e.id = journal_entry_id and (e.tenant_id = my_tenant_id() or is_teacher())));
create policy "line write" on journal_lines for all
  using (exists (select 1 from journal_entries e where e.id = journal_entry_id and (e.tenant_id = my_tenant_id() or is_teacher())));

alter table purchase_order_lines enable row level security;
create policy "po line read" on purchase_order_lines for select
  using (exists (select 1 from purchase_orders p where p.id = purchase_order_id and (p.tenant_id = my_tenant_id() or is_teacher())));
create policy "po line write" on purchase_order_lines for all
  using (exists (select 1 from purchase_orders p where p.id = purchase_order_id and (p.tenant_id = my_tenant_id() or is_teacher())));

alter table sales_order_lines enable row level security;
create policy "so line read" on sales_order_lines for select
  using (exists (select 1 from sales_orders s where s.id = sales_order_id and (s.tenant_id = my_tenant_id() or is_teacher())));
create policy "so line write" on sales_order_lines for all
  using (exists (select 1 from sales_orders s where s.id = sales_order_id and (s.tenant_id = my_tenant_id() or is_teacher())));

-- ============================================================
-- Business-logic functions (RPC) — keep multi-table actions atomic
-- ============================================================

-- Create a company: makes the tenant, seeds a default chart of accounts,
-- and attaches the calling user to it as its first member.
create or replace function create_tenant(tenant_name text)
returns uuid as $$
declare
  new_id uuid;
begin
  insert into tenants (name, owner_id) values (tenant_name, auth.uid()) returning id into new_id;

  insert into accounts (tenant_id, code, name, type) values
    (new_id, '1000', 'Cash', 'asset'),
    (new_id, '1100', 'Accounts Receivable', 'asset'),
    (new_id, '1200', 'Inventory', 'asset'),
    (new_id, '2000', 'Accounts Payable', 'liability'),
    (new_id, '3000', 'Owner''s Equity', 'equity'),
    (new_id, '4000', 'Sales Revenue', 'revenue'),
    (new_id, '5000', 'Cost of Goods Sold', 'expense'),
    (new_id, '5100', 'Operating Expenses', 'expense'),
    (new_id, '5200', 'Marketing Expense', 'expense'),
    (new_id, '5300', 'Payroll Expense', 'expense');

  update profiles set tenant_id = new_id where id = auth.uid();
  return new_id;
end;
$$ language plpgsql security definer;

-- Join an existing company (student picks one at login).
create or replace function join_tenant(target_tenant uuid)
returns void as $$
begin
  update profiles set tenant_id = target_tenant where id = auth.uid();
end;
$$ language plpgsql security definer;

-- Receive a purchase order: bumps/creates inventory items, posts
-- Dr Inventory / Cr Accounts Payable, marks the PO received.
create or replace function receive_purchase_order(po_id uuid)
returns void as $$
declare
  po purchase_orders%rowtype;
  line record;
  existing_item items%rowtype;
  je_id uuid;
  inv_account uuid;
  ap_account uuid;
begin
  select * into po from purchase_orders where id = po_id;
  if po.status = 'received' then return; end if;

  select id into inv_account from accounts where tenant_id = po.tenant_id and code = '1200';
  select id into ap_account from accounts where tenant_id = po.tenant_id and code = '2000';

  for line in select * from purchase_order_lines where purchase_order_id = po_id loop
    select * into existing_item from items where tenant_id = po.tenant_id and lower(name) = lower(line.description);
    if found then
      update items set qty_on_hand = qty_on_hand + line.qty, unit_cost = line.unit_cost where id = existing_item.id;
    else
      insert into items (tenant_id, sku, name, qty_on_hand, unit_cost, reorder_point)
      values (po.tenant_id, upper(left(line.description, 4)), line.description, line.qty, line.unit_cost, 5);
    end if;
  end loop;

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (po.tenant_id, current_date, 'Received PO ' || po_id, auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, inv_account, po.total, 0),
    (je_id, ap_account, 0, po.total);

  update purchase_orders set status = 'received' where id = po_id;
end;
$$ language plpgsql security definer;

-- Fulfill a sales order: decrements inventory, posts Dr Cash / Cr Revenue
-- for the sale and Dr COGS / Cr Inventory for the cost, marks it fulfilled.
create or replace function fulfill_sales_order(so_id uuid)
returns void as $$
declare
  so sales_orders%rowtype;
  line record;
  it items%rowtype;
  je_id uuid;
  cogs numeric := 0;
  cash_account uuid; rev_account uuid; cogs_account uuid; inv_account uuid;
begin
  select * into so from sales_orders where id = so_id;
  if so.status = 'fulfilled' then return; end if;

  select id into cash_account from accounts where tenant_id = so.tenant_id and code = '1000';
  select id into rev_account from accounts where tenant_id = so.tenant_id and code = '4000';
  select id into cogs_account from accounts where tenant_id = so.tenant_id and code = '5000';
  select id into inv_account from accounts where tenant_id = so.tenant_id and code = '1200';

  for line in select * from sales_order_lines where sales_order_id = so_id loop
    if line.item_id is not null then
      select * into it from items where id = line.item_id;
      if found then
        cogs := cogs + line.qty * it.unit_cost;
        update items set qty_on_hand = greatest(0, qty_on_hand - line.qty) where id = it.id;
      end if;
    end if;
  end loop;

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (so.tenant_id, current_date, 'Sale, order ' || so_id, auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, cash_account, so.total, 0),
    (je_id, rev_account, 0, so.total);

  if cogs > 0 then
    insert into journal_entries (tenant_id, entry_date, memo, created_by)
    values (so.tenant_id, current_date, 'COGS, order ' || so_id, auth.uid()) returning id into je_id;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values
      (je_id, cogs_account, round(cogs, 2), 0),
      (je_id, inv_account, 0, round(cogs, 2));
  end if;

  update sales_orders set status = 'fulfilled' where id = so_id;
end;
$$ language plpgsql security definer;

-- Run monthly payroll for every employee in the tenant:
-- posts Dr Payroll Expense / Cr Cash for one month of total salary.
create or replace function run_payroll(target_tenant uuid)
returns void as $$
declare
  gross numeric;
  headcount int;
  je_id uuid;
  payroll_account uuid; cash_account uuid;
begin
  select coalesce(sum(salary) / 12.0, 0), count(*) into gross, headcount from employees where tenant_id = target_tenant;
  if gross <= 0 then return; end if;

  select id into payroll_account from accounts where tenant_id = target_tenant and code = '5300';
  select id into cash_account from accounts where tenant_id = target_tenant and code = '1000';

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (target_tenant, current_date, 'Monthly payroll', auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, payroll_account, round(gross, 2), 0),
    (je_id, cash_account, 0, round(gross, 2));

  insert into payroll_runs (tenant_id, run_date, total, headcount) values (target_tenant, current_date, round(gross, 2), headcount);
end;
$$ language plpgsql security definer;
