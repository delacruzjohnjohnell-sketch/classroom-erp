-- ============================================================
-- Classroom ERP — upgrade migration 0009
-- Splits procurement into real stages:
-- Purchase Order -> Goods Receipt -> Bill -> Payment.
--
-- Same rename logic as migration 0008's sales side: the table
-- called "purchase_orders" was really functioning as a bill (it
-- posts to Accounts Payable and takes payments) — renamed to what
-- it really is, freeing up "purchase_orders" for the real
-- pre-bill stage. Posting logic is UNCHANGED, only renamed.
--
-- Goods Receipts are informational/tracking only in this version —
-- they record what physically arrived against a PO (supporting
-- partial deliveries) but don't touch inventory quantities or the
-- ledger themselves. The Bill remains the single source of truth
-- for both inventory quantity and the GL entry, exactly as before,
-- which avoids double-counting inventory between a receipt and a
-- bill. A "Create bill from PO" action pre-fills a bill from the
-- PO so you're not re-typing line items.
-- ============================================================

-- ---------- Step 1: rename what was really always "bills" ----------

alter table purchase_orders rename to bills;
alter table purchase_order_lines rename to bill_lines;
alter table bill_lines rename column purchase_order_id to bill_id;
alter table bill_payments rename column purchase_order_id to bill_id;

create or replace function post_bill(target_bill_id uuid)
returns void as $$
declare
  b bills%rowtype;
  line record;
  existing_item items%rowtype;
  je_id uuid;
  inv_account uuid;
  ap_account uuid;
  threshold numeric;
begin
  select * into b from bills where id = target_bill_id;
  if b.status = 'received' then return; end if;

  select approval_threshold into threshold from tenants where id = b.tenant_id;
  if threshold is not null and b.total > threshold and not is_teacher() then
    update bills set status = 'pending_approval' where id = target_bill_id;
    return;
  end if;

  select id into inv_account from accounts where tenant_id = b.tenant_id and code = '1200';
  select id into ap_account from accounts where tenant_id = b.tenant_id and code = '2000';

  for line in select * from bill_lines where bill_id = target_bill_id loop
    select * into existing_item from items where tenant_id = b.tenant_id and lower(name) = lower(line.description);
    if found then
      update items set qty_on_hand = qty_on_hand + line.qty, unit_cost = line.unit_cost where id = existing_item.id;
    else
      insert into items (tenant_id, sku, name, qty_on_hand, unit_cost, reorder_point)
      values (b.tenant_id, upper(left(line.description, 4)), line.description, line.qty, line.unit_cost, 5);
    end if;
  end loop;

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (b.tenant_id, current_date, 'Bill ' || coalesce(b.document_number, target_bill_id::text), auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, inv_account, b.total, 0),
    (je_id, ap_account, 0, b.total);

  update bills set status = 'received' where id = target_bill_id;
end;
$$ language plpgsql security definer;

-- Old name kept as a thin wrapper so nothing breaks if it's still referenced anywhere.
create or replace function receive_purchase_order(po_id uuid) returns void as $$
begin
  perform post_bill(po_id);
end;
$$ language plpgsql security definer;

create or replace function record_bill_payment(po_id uuid, pay_amount numeric, pay_date date, pay_method text)
returns void as $$
declare
  b bills%rowtype;
  je_id uuid;
  cash_account uuid; ap_account uuid;
begin
  select * into b from bills where id = po_id;
  select id into cash_account from accounts where tenant_id = b.tenant_id and code = '1000';
  select id into ap_account from accounts where tenant_id = b.tenant_id and code = '2000';

  insert into bill_payments (tenant_id, bill_id, amount, payment_date, method, created_by)
  values (b.tenant_id, po_id, pay_amount, pay_date, pay_method, auth.uid());

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (b.tenant_id, pay_date, 'Payment made, bill ' || coalesce(b.document_number, po_id::text), auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, ap_account, pay_amount, 0),
    (je_id, cash_account, 0, pay_amount);
end;
$$ language plpgsql security definer;

-- ---------- Step 2: Purchase Orders (the real pre-bill stage, no GL impact) ----------

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  vendor_id uuid references vendors(id),
  order_date date not null default current_date,
  expected_date date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'closed')),
  total numeric not null default 0,
  document_number text
);

create table purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references purchase_orders(id) on delete cascade,
  description text not null,
  qty numeric not null,
  unit_cost numeric not null
);

select tenant_scoped_policy('purchase_orders');
alter table purchase_order_lines enable row level security;
create policy "po line read" on purchase_order_lines for select
  using (exists (select 1 from purchase_orders p where p.id = purchase_order_id and (p.tenant_id = my_tenant_id() or is_teacher())));
create policy "po line write" on purchase_order_lines for all
  using (exists (select 1 from purchase_orders p where p.id = purchase_order_id and (p.tenant_id = my_tenant_id() or is_teacher())));

create or replace function assign_new_po_number() returns trigger as $$
begin
  if new.document_number is null then
    new.document_number := next_doc_number(new.tenant_id, 'purchase_order', 'PO');
  end if;
  return new;
end;
$$ language plpgsql security definer;
create trigger trg_new_po_number before insert on purchase_orders
  for each row execute function assign_new_po_number();

-- ---------- Step 3: Goods Receipts (tracking only, supports partial deliveries) ----------

create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  purchase_order_id uuid references purchase_orders(id) on delete cascade,
  receipt_date date not null default current_date,
  notes text,
  document_number text
);

create table goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid references goods_receipts(id) on delete cascade,
  description text not null,
  qty_received numeric not null
);

select tenant_scoped_policy('goods_receipts');
alter table goods_receipt_lines enable row level security;
create policy "gr line read" on goods_receipt_lines for select
  using (exists (select 1 from goods_receipts g where g.id = goods_receipt_id and (g.tenant_id = my_tenant_id() or is_teacher())));
create policy "gr line write" on goods_receipt_lines for all
  using (exists (select 1 from goods_receipts g where g.id = goods_receipt_id and (g.tenant_id = my_tenant_id() or is_teacher())));

create or replace function assign_gr_number() returns trigger as $$
begin
  if new.document_number is null then
    new.document_number := next_doc_number(new.tenant_id, 'goods_receipt', 'GR');
  end if;
  return new;
end;
$$ language plpgsql security definer;
create trigger trg_gr_number before insert on goods_receipts
  for each row execute function assign_gr_number();

-- ---------- Step 4: create a draft Bill pre-filled from a PO ----------

create or replace function create_bill_from_po(target_po_id uuid)
returns uuid as $$
declare
  po purchase_orders%rowtype;
  new_id uuid;
begin
  select * into po from purchase_orders where id = target_po_id;

  insert into bills (tenant_id, vendor_id, order_date, total, status)
  values (po.tenant_id, po.vendor_id, current_date, po.total, 'draft')
  returning id into new_id;

  insert into bill_lines (bill_id, description, qty, unit_cost)
  select new_id, description, qty, unit_cost from purchase_order_lines where purchase_order_id = target_po_id;

  update purchase_orders set status = 'closed' where id = target_po_id;
  return new_id;
end;
$$ language plpgsql security definer;
