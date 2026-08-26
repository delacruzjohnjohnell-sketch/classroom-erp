-- ============================================================
-- Classroom ERP — upgrade migration 0002
-- Adds: due dates on invoices/bills, partial payment tracking,
--       AR/AP aging support, bank reconciliation, file attachments.
-- Run this AFTER 0001_init.sql, in the same SQL Editor workflow.
-- ============================================================

-- ---------- Due dates on invoices (sales_orders) and bills (purchase_orders) ----------

alter table sales_orders add column if not exists due_date date;
alter table purchase_orders add column if not exists due_date date;

-- ---------- Payment tracking (partial payments) ----------

create table invoice_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  sales_order_id uuid references sales_orders(id) on delete cascade,
  amount numeric not null,
  payment_date date not null default current_date,
  method text default 'cash',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table bill_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  purchase_order_id uuid references purchase_orders(id) on delete cascade,
  amount numeric not null,
  payment_date date not null default current_date,
  method text default 'cash',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

select tenant_scoped_policy('invoice_payments');
select tenant_scoped_policy('bill_payments');

-- ---------- Bank reconciliation ----------

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  txn_date date not null,
  description text not null,
  amount numeric not null, -- positive = deposit, negative = withdrawal
  reconciled boolean not null default false,
  matched_journal_entry_id uuid references journal_entries(id),
  created_at timestamptz default now()
);

select tenant_scoped_policy('bank_transactions');

-- ---------- Attachments (receipts, invoice PDFs, etc.) ----------

create table attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  related_table text not null, -- e.g. 'sales_orders', 'purchase_orders'
  related_id uuid not null,
  file_path text not null,     -- path inside the 'attachments' storage bucket
  file_name text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now()
);

select tenant_scoped_policy('attachments');

-- Storage bucket + policies for attachment files.
-- Files are stored at: {tenant_id}/{related_table}/{related_id}/{filename}
-- so RLS can check the first path segment against the caller's tenant.
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
  on conflict (id) do nothing;

create policy "attachments read" on storage.objects for select
  using (bucket_id = 'attachments' and ((storage.foldername(name))[1])::uuid = my_tenant_id() or is_teacher());
create policy "attachments write" on storage.objects for insert
  with check (bucket_id = 'attachments' and (((storage.foldername(name))[1])::uuid = my_tenant_id() or is_teacher()));
create policy "attachments delete" on storage.objects for delete
  using (bucket_id = 'attachments' and ((storage.foldername(name))[1])::uuid = my_tenant_id() or is_teacher());

-- ============================================================
-- Updated business logic: invoices now post to Accounts Receivable
-- (credit terms) instead of Cash directly — this is what makes
-- due dates, partial payments, and AR aging meaningful.
-- ============================================================

create or replace function fulfill_sales_order(so_id uuid)
returns void as $$
declare
  so sales_orders%rowtype;
  line record;
  it items%rowtype;
  je_id uuid;
  cogs numeric := 0;
  ar_account uuid; rev_account uuid; cogs_account uuid; inv_account uuid;
begin
  select * into so from sales_orders where id = so_id;
  if so.status = 'fulfilled' then return; end if;

  select id into ar_account from accounts where tenant_id = so.tenant_id and code = '1100';
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

  -- Dr Accounts Receivable / Cr Revenue — this is now a credit-terms invoice,
  -- not an instant cash sale. Cash moves only when a payment is recorded.
  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (so.tenant_id, current_date, 'Invoice, order ' || so_id, auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, ar_account, so.total, 0),
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

-- Record a payment against an invoice: Dr Cash / Cr Accounts Receivable.
create or replace function record_invoice_payment(so_id uuid, pay_amount numeric, pay_date date, pay_method text)
returns void as $$
declare
  so sales_orders%rowtype;
  je_id uuid;
  cash_account uuid; ar_account uuid;
begin
  select * into so from sales_orders where id = so_id;
  select id into cash_account from accounts where tenant_id = so.tenant_id and code = '1000';
  select id into ar_account from accounts where tenant_id = so.tenant_id and code = '1100';

  insert into invoice_payments (tenant_id, sales_order_id, amount, payment_date, method, created_by)
  values (so.tenant_id, so_id, pay_amount, pay_date, pay_method, auth.uid());

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (so.tenant_id, pay_date, 'Payment received, order ' || so_id, auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, cash_account, pay_amount, 0),
    (je_id, ar_account, 0, pay_amount);
end;
$$ language plpgsql security definer;

-- Record a payment against a bill: Dr Accounts Payable / Cr Cash.
create or replace function record_bill_payment(po_id uuid, pay_amount numeric, pay_date date, pay_method text)
returns void as $$
declare
  po purchase_orders%rowtype;
  je_id uuid;
  cash_account uuid; ap_account uuid;
begin
  select * into po from purchase_orders where id = po_id;
  select id into cash_account from accounts where tenant_id = po.tenant_id and code = '1000';
  select id into ap_account from accounts where tenant_id = po.tenant_id and code = '2000';

  insert into bill_payments (tenant_id, purchase_order_id, amount, payment_date, method, created_by)
  values (po.tenant_id, po_id, pay_amount, pay_date, pay_method, auth.uid());

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (po.tenant_id, pay_date, 'Payment made, PO ' || po_id, auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, ap_account, pay_amount, 0),
    (je_id, cash_account, 0, pay_amount);
end;
$$ language plpgsql security definer;
