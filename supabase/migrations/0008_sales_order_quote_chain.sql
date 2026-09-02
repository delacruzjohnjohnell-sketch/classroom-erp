-- ============================================================
-- Classroom ERP — upgrade migration 0008
-- Splits the sales document lifecycle into real stages:
-- Quote -> Sales Order -> Invoice -> Payment.
--
-- The table that used to be called "sales_orders" was actually
-- functioning as an invoice (it posts to Accounts Receivable and
-- takes payments) — we rename it to what it really is, which frees
-- up "sales_orders" for the real pre-invoice stage. The financial
-- posting logic itself is UNCHANGED, only renamed.
-- ============================================================

-- ---------- Step 1: rename what was really always "invoices" ----------

alter table sales_orders rename to invoices;
alter table sales_order_lines rename to invoice_lines;
alter table invoice_lines rename column sales_order_id to invoice_id;
alter table invoice_payments rename column sales_order_id to invoice_id;

-- Function bodies need to point at the new names (table rename doesn't
-- rewrite SQL inside function bodies). Renaming the functions too, for clarity —
-- update both call sites in the app when you deploy this.

create or replace function post_invoice(target_invoice_id uuid)
returns void as $$
declare
  inv invoices%rowtype;
  line record;
  it items%rowtype;
  je_id uuid;
  cogs numeric := 0;
  ar_account uuid; rev_account uuid; cogs_account uuid; inv_account uuid;
  threshold numeric;
begin
  select * into inv from invoices where id = target_invoice_id;
  if inv.status = 'fulfilled' then return; end if;

  select approval_threshold into threshold from tenants where id = inv.tenant_id;
  if threshold is not null and inv.total > threshold and not is_teacher() then
    update invoices set status = 'pending_approval' where id = target_invoice_id;
    return;
  end if;

  select id into ar_account from accounts where tenant_id = inv.tenant_id and code = '1100';
  select id into rev_account from accounts where tenant_id = inv.tenant_id and code = '4000';
  select id into cogs_account from accounts where tenant_id = inv.tenant_id and code = '5000';
  select id into inv_account from accounts where tenant_id = inv.tenant_id and code = '1200';

  for line in select * from invoice_lines where invoice_id = target_invoice_id loop
    if line.item_id is not null then
      select * into it from items where id = line.item_id;
      if found then
        cogs := cogs + line.qty * it.unit_cost;
        update items set qty_on_hand = greatest(0, qty_on_hand - line.qty) where id = it.id;
      end if;
    end if;
  end loop;

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (inv.tenant_id, current_date, 'Invoice ' || coalesce(inv.document_number, target_invoice_id::text), auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, ar_account, inv.total, 0),
    (je_id, rev_account, 0, inv.total);

  if cogs > 0 then
    insert into journal_entries (tenant_id, entry_date, memo, created_by)
    values (inv.tenant_id, current_date, 'COGS, invoice ' || coalesce(inv.document_number, target_invoice_id::text), auth.uid()) returning id into je_id;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values
      (je_id, cogs_account, round(cogs, 2), 0),
      (je_id, inv_account, 0, round(cogs, 2));
  end if;

  update invoices set status = 'fulfilled' where id = target_invoice_id;
end;
$$ language plpgsql security definer;

-- Old name kept as a thin wrapper so nothing breaks if it's still referenced anywhere.
create or replace function fulfill_sales_order(so_id uuid) returns void as $$
begin
  perform post_invoice(so_id);
end;
$$ language plpgsql security definer;

create or replace function record_invoice_payment(so_id uuid, pay_amount numeric, pay_date date, pay_method text)
returns void as $$
declare
  inv invoices%rowtype;
  je_id uuid;
  cash_account uuid; ar_account uuid;
begin
  select * into inv from invoices where id = so_id;
  select id into cash_account from accounts where tenant_id = inv.tenant_id and code = '1000';
  select id into ar_account from accounts where tenant_id = inv.tenant_id and code = '1100';

  insert into invoice_payments (tenant_id, invoice_id, amount, payment_date, method, created_by)
  values (inv.tenant_id, so_id, pay_amount, pay_date, pay_method, auth.uid());

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (inv.tenant_id, pay_date, 'Payment received, invoice ' || coalesce(inv.document_number, so_id::text), auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, cash_account, pay_amount, 0),
    (je_id, ar_account, 0, pay_amount);
end;
$$ language plpgsql security definer;

-- ---------- Step 2: Quotes (informal, no GL impact) ----------

create table quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  customer_id uuid references customers(id),
  quote_date date not null default current_date,
  expiry_date date,
  status text not null default 'draft' check (status in ('draft', 'accepted', 'declined', 'converted')),
  total numeric not null default 0,
  document_number text
);

create table quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id) on delete cascade,
  item_id uuid references items(id),
  description text not null,
  qty numeric not null,
  unit_price numeric not null
);

select tenant_scoped_policy('quotes');
alter table quote_lines enable row level security;
create policy "quote line read" on quote_lines for select
  using (exists (select 1 from quotes q where q.id = quote_id and (q.tenant_id = my_tenant_id() or is_teacher())));
create policy "quote line write" on quote_lines for all
  using (exists (select 1 from quotes q where q.id = quote_id and (q.tenant_id = my_tenant_id() or is_teacher())));

create or replace function assign_quote_number() returns trigger as $$
begin
  if new.document_number is null then
    new.document_number := next_doc_number(new.tenant_id, 'quote', 'QT');
  end if;
  return new;
end;
$$ language plpgsql security definer;
create trigger trg_quote_number before insert on quotes
  for each row execute function assign_quote_number();

-- ---------- Step 3: Sales Orders (confirmed commitment, still no GL impact) ----------

create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  customer_id uuid references customers(id),
  order_date date not null default current_date,
  expected_date date,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'invoiced', 'cancelled')),
  total numeric not null default 0,
  document_number text
);

create table sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid references sales_orders(id) on delete cascade,
  item_id uuid references items(id),
  description text not null,
  qty numeric not null,
  unit_price numeric not null
);

select tenant_scoped_policy('sales_orders');
alter table sales_order_lines enable row level security;
create policy "so line read" on sales_order_lines for select
  using (exists (select 1 from sales_orders s where s.id = sales_order_id and (s.tenant_id = my_tenant_id() or is_teacher())));
create policy "so line write" on sales_order_lines for all
  using (exists (select 1 from sales_orders s where s.id = sales_order_id and (s.tenant_id = my_tenant_id() or is_teacher())));

create or replace function assign_new_so_number() returns trigger as $$
begin
  if new.document_number is null then
    new.document_number := next_doc_number(new.tenant_id, 'sales_order', 'SO');
  end if;
  return new;
end;
$$ language plpgsql security definer;
create trigger trg_new_so_number before insert on sales_orders
  for each row execute function assign_new_so_number();

-- ---------- Step 4: conversions between stages ----------

create or replace function convert_quote_to_sales_order(target_quote_id uuid, expected_date date)
returns uuid as $$
declare
  q quotes%rowtype;
  new_id uuid;
begin
  select * into q from quotes where id = target_quote_id;

  insert into sales_orders (tenant_id, customer_id, order_date, expected_date, total, status)
  values (q.tenant_id, q.customer_id, current_date, expected_date, q.total, 'draft')
  returning id into new_id;

  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price)
  select new_id, item_id, description, qty, unit_price from quote_lines where quote_id = target_quote_id;

  update quotes set status = 'converted' where id = target_quote_id;
  return new_id;
end;
$$ language plpgsql security definer;

create or replace function convert_sales_order_to_invoice(so_id uuid, due_date date)
returns uuid as $$
declare
  so sales_orders%rowtype;
  new_id uuid;
begin
  select * into so from sales_orders where id = so_id;

  insert into invoices (tenant_id, customer_id, order_date, due_date, total, status)
  values (so.tenant_id, so.customer_id, current_date, due_date, so.total, 'draft')
  returning id into new_id;

  insert into invoice_lines (invoice_id, item_id, description, qty, unit_price)
  select new_id, item_id, description, qty, unit_price from sales_order_lines where sales_order_id = so.id;

  update sales_orders set status = 'invoiced' where id = so_id;
  return new_id;
end;
$$ language plpgsql security definer;
