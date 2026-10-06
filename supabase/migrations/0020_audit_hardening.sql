-- ============================================================
-- Classroom ERP — upgrade migration 0020 (audit hardening)
--
--  1. Every money function now checks the caller belongs to the company the
--     record is in (teachers may act on any company). Signed-out visitors can
--     no longer run any of them.
--  2. Posted invoices/bills and all payments can't be rewritten through the
--     API: drafts can be edited/deleted, posted documents can only have their
--     due date changed, payments only via the Record payment functions.
--  3. Voiding a document that has payments now refunds them (reversing entry
--     plus an offsetting negative payment row) instead of dead-ending.
--  4. Invoices and bills post to the ledger on the document's own date.
--  5. Converting an order to an invoice / a PO to a bill takes a date and a
--     due date.
--  6. Company records are readable only by signed-in users; students can only
--     change their company's lock date and approval threshold.
--  7. All functions get a fixed search_path.
-- ============================================================

-- ---------- 1. Ownership check ----------
-- auth.uid() is null only for the database owner / service role (anon can no
-- longer reach these functions), which is allowed through.
create or replace function assert_tenant_access(tid uuid)
returns void as $$
begin
  if auth.uid() is null then return; end if;
  if tid is null then
    raise exception 'That record was not found.';
  end if;
  if tid is distinct from my_tenant_id() and is_teacher() is not true then
    raise exception 'You can only do this in your own company.';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function post_invoice(target_invoice_id uuid)
returns void as $$
declare
  inv invoices%rowtype;
  line record;
  it items%rowtype;
  je_id uuid;
  cogs numeric := 0;
  post_date date;
  ar_account uuid; rev_account uuid; cogs_account uuid; inv_account uuid; vat_payable_account uuid;
  threshold numeric;
begin
  select * into inv from invoices where id = target_invoice_id;
  perform assert_tenant_access(inv.tenant_id);
  if inv.status = 'fulfilled' then return; end if;
  if inv.status = 'void' then raise exception 'This invoice has been voided and can''t be posted.'; end if;

  select approval_threshold into threshold from tenants where id = inv.tenant_id;
  if threshold is not null and inv.total > threshold and not is_teacher() then
    update invoices set status = 'pending_approval' where id = target_invoice_id;
    return;
  end if;

  post_date := coalesce(inv.order_date, current_date);

  select id into ar_account from accounts where tenant_id = inv.tenant_id and code = '1100';
  select id into rev_account from accounts where tenant_id = inv.tenant_id and code = '4000';
  select id into cogs_account from accounts where tenant_id = inv.tenant_id and code = '5000';
  select id into inv_account from accounts where tenant_id = inv.tenant_id and code = '1200';
  select id into vat_payable_account from accounts where tenant_id = inv.tenant_id and code = '2200';

  for line in select * from invoice_lines where invoice_id = target_invoice_id loop
    if line.item_id is not null then
      select * into it from items where id = line.item_id;
      if found then
        cogs := cogs + line.qty * it.unit_cost;
        update items set qty_on_hand = greatest(0, qty_on_hand - line.qty) where id = it.id;
      end if;
    end if;
  end loop;

  insert into journal_entries (tenant_id, entry_date, memo, created_by, source_table, source_id)
  values (inv.tenant_id, post_date, 'Invoice ' || coalesce(inv.document_number, target_invoice_id::text), auth.uid(), 'invoices', target_invoice_id)
  returning id into je_id;

  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, ar_account, inv.total, 0),
    (je_id, rev_account, 0, inv.total - inv.tax_amount);
  if inv.tax_amount > 0 then
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values
      (je_id, vat_payable_account, 0, inv.tax_amount);
  end if;

  if cogs > 0 then
    insert into journal_entries (tenant_id, entry_date, memo, created_by, source_table, source_id)
    values (inv.tenant_id, post_date, 'COGS, invoice ' || coalesce(inv.document_number, target_invoice_id::text), auth.uid(), 'invoices', target_invoice_id)
    returning id into je_id;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values
      (je_id, cogs_account, round(cogs, 2), 0),
      (je_id, inv_account, 0, round(cogs, 2));
  end if;

  update invoices set status = 'fulfilled' where id = target_invoice_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function post_bill(target_bill_id uuid)
returns void as $$
declare
  b bills%rowtype;
  line record;
  existing_item items%rowtype;
  je_id uuid;
  post_date date;
  inv_account uuid;
  ap_account uuid;
  input_tax_account uuid;
  threshold numeric;
begin
  select * into b from bills where id = target_bill_id;
  perform assert_tenant_access(b.tenant_id);
  if b.status = 'received' then return; end if;
  if b.status = 'void' then raise exception 'This bill has been voided and can''t be posted.'; end if;

  select approval_threshold into threshold from tenants where id = b.tenant_id;
  if threshold is not null and b.total > threshold and not is_teacher() then
    update bills set status = 'pending_approval' where id = target_bill_id;
    return;
  end if;

  post_date := coalesce(b.order_date, current_date);

  select id into inv_account from accounts where tenant_id = b.tenant_id and code = '1200';
  select id into ap_account from accounts where tenant_id = b.tenant_id and code = '2000';
  select id into input_tax_account from accounts where tenant_id = b.tenant_id and code = '1160';

  for line in select * from bill_lines where bill_id = target_bill_id loop
    select * into existing_item from items where tenant_id = b.tenant_id and lower(name) = lower(line.description);
    if found then
      update items set qty_on_hand = qty_on_hand + line.qty, unit_cost = line.unit_cost where id = existing_item.id;
    else
      insert into items (tenant_id, sku, name, qty_on_hand, unit_cost, reorder_point)
      values (b.tenant_id, upper(left(line.description, 4)), line.description, line.qty, line.unit_cost, 5);
    end if;
  end loop;

  insert into journal_entries (tenant_id, entry_date, memo, created_by, source_table, source_id)
  values (b.tenant_id, post_date, 'Bill ' || coalesce(b.document_number, target_bill_id::text), auth.uid(), 'bills', target_bill_id)
  returning id into je_id;

  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, inv_account, b.total - b.tax_amount, 0),
    (je_id, ap_account, 0, b.total);
  if b.tax_amount > 0 then
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values
      (je_id, input_tax_account, b.tax_amount, 0);
  end if;

  update bills set status = 'received' where id = target_bill_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function record_invoice_payment(so_id uuid, pay_amount numeric, pay_date date, pay_method text)
returns void as $$
declare
  inv invoices%rowtype;
  je_id uuid;
  cash_account uuid; ar_account uuid;
begin
  select * into inv from invoices where id = so_id;
  perform assert_tenant_access(inv.tenant_id);
  if inv.status <> 'fulfilled' then raise exception 'Only a posted invoice can receive a payment.'; end if;
  if pay_amount is null or pay_amount <= 0 then raise exception 'Enter a payment amount greater than zero.'; end if;
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
$$ language plpgsql security definer set search_path = public;

create or replace function record_bill_payment(po_id uuid, pay_amount numeric, pay_date date, pay_method text)
returns void as $$
declare
  b bills%rowtype;
  je_id uuid;
  cash_account uuid; ap_account uuid;
begin
  select * into b from bills where id = po_id;
  perform assert_tenant_access(b.tenant_id);
  if b.status <> 'received' then raise exception 'Only a posted bill can be paid.'; end if;
  if pay_amount is null or pay_amount <= 0 then raise exception 'Enter a payment amount greater than zero.'; end if;
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
$$ language plpgsql security definer set search_path = public;

create or replace function reverse_journal_entry(original_id uuid, reversal_date date)
returns uuid as $$
declare
  orig journal_entries%rowtype;
  new_id uuid;
  line record;
begin
  select * into orig from journal_entries where id = original_id;
  perform assert_tenant_access(orig.tenant_id);

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (orig.tenant_id, reversal_date, 'Reversal of: ' || coalesce(orig.memo, original_id::text), auth.uid())
  returning id into new_id;

  for line in select * from journal_lines where journal_entry_id = original_id loop
    insert into journal_lines (journal_entry_id, account_id, debit, credit)
    values (new_id, line.account_id, line.credit, line.debit); -- flipped
  end loop;

  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- 3. Void with payments = refund the payments ----------
create or replace function void_invoice(target_invoice_id uuid, void_date date)
returns void as $$
declare
  inv invoices%rowtype;
  paid numeric;
  je record;
  je_id uuid;
  line record;
  cash_account uuid; ar_account uuid;
begin
  select * into inv from invoices where id = target_invoice_id;
  perform assert_tenant_access(inv.tenant_id);
  if inv.status <> 'fulfilled' then
    raise exception 'Only a posted invoice can be voided.';
  end if;

  for je in select id from journal_entries where source_table = 'invoices' and source_id = target_invoice_id loop
    perform reverse_journal_entry(je.id, void_date);
  end loop;

  -- Payments already received are refunded: Dr A/R, Cr Cash, plus an offsetting
  -- negative payment row so the invoice's paid total returns to zero.
  select coalesce(sum(amount), 0) into paid from invoice_payments where invoice_id = target_invoice_id;
  if paid > 0 then
    select id into cash_account from accounts where tenant_id = inv.tenant_id and code = '1000';
    select id into ar_account from accounts where tenant_id = inv.tenant_id and code = '1100';
    insert into journal_entries (tenant_id, entry_date, memo, created_by)
    values (inv.tenant_id, void_date, 'Refund of payments, voided invoice ' || coalesce(inv.document_number, target_invoice_id::text), auth.uid())
    returning id into je_id;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values
      (je_id, ar_account, paid, 0),
      (je_id, cash_account, 0, paid);
    insert into invoice_payments (tenant_id, invoice_id, amount, payment_date, method, created_by)
    values (inv.tenant_id, target_invoice_id, -paid, void_date, 'Refund (invoice voided)', auth.uid());
  end if;

  for line in select * from invoice_lines where invoice_id = target_invoice_id loop
    if line.item_id is not null then
      update items set qty_on_hand = qty_on_hand + line.qty where id = line.item_id;
    end if;
  end loop;

  update invoices set status = 'void' where id = target_invoice_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function void_bill(target_bill_id uuid, void_date date)
returns void as $$
declare
  b bills%rowtype;
  paid numeric;
  je record;
  je_id uuid;
  line record;
  existing_item items%rowtype;
  cash_account uuid; ap_account uuid;
begin
  select * into b from bills where id = target_bill_id;
  perform assert_tenant_access(b.tenant_id);
  if b.status <> 'received' then
    raise exception 'Only a posted bill can be voided.';
  end if;

  for je in select id from journal_entries where source_table = 'bills' and source_id = target_bill_id loop
    perform reverse_journal_entry(je.id, void_date);
  end loop;

  -- Payments already made are refunded by the vendor: Dr Cash, Cr A/P, plus an
  -- offsetting negative payment row.
  select coalesce(sum(amount), 0) into paid from bill_payments where bill_id = target_bill_id;
  if paid > 0 then
    select id into cash_account from accounts where tenant_id = b.tenant_id and code = '1000';
    select id into ap_account from accounts where tenant_id = b.tenant_id and code = '2000';
    insert into journal_entries (tenant_id, entry_date, memo, created_by)
    values (b.tenant_id, void_date, 'Refund of payments, voided bill ' || coalesce(b.document_number, target_bill_id::text), auth.uid())
    returning id into je_id;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values
      (je_id, cash_account, paid, 0),
      (je_id, ap_account, 0, paid);
    insert into bill_payments (tenant_id, bill_id, amount, payment_date, method, created_by)
    values (b.tenant_id, target_bill_id, -paid, void_date, 'Refund (bill voided)', auth.uid());
  end if;

  for line in select * from bill_lines where bill_id = target_bill_id loop
    select * into existing_item from items where tenant_id = b.tenant_id and lower(name) = lower(line.description);
    if found then
      update items set qty_on_hand = greatest(0, qty_on_hand - line.qty) where id = existing_item.id;
    end if;
  end loop;

  update bills set status = 'void' where id = target_bill_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- 5. Conversions take a date and a due date ----------
drop function if exists convert_sales_order_to_invoice(uuid, date);
create or replace function convert_sales_order_to_invoice(so_id uuid, due_date date, invoice_date date default null)
returns uuid as $$
declare
  so sales_orders%rowtype;
  new_id uuid;
begin
  select * into so from sales_orders where id = so_id;
  perform assert_tenant_access(so.tenant_id);

  insert into invoices (tenant_id, customer_id, order_date, due_date, total, tax_rate, tax_amount, status)
  values (so.tenant_id, so.customer_id, coalesce(invoice_date, current_date), due_date, so.total, so.tax_rate, so.tax_amount, 'draft')
  returning id into new_id;

  insert into invoice_lines (invoice_id, item_id, description, qty, unit_price)
  select new_id, item_id, description, qty, unit_price from sales_order_lines where sales_order_id = so.id;

  update sales_orders set status = 'invoiced' where id = so_id;
  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

drop function if exists create_bill_from_po(uuid);
create or replace function create_bill_from_po(target_po_id uuid, bill_date date default null, due_date date default null)
returns uuid as $$
declare
  po purchase_orders%rowtype;
  new_id uuid;
begin
  select * into po from purchase_orders where id = target_po_id;
  perform assert_tenant_access(po.tenant_id);

  insert into bills (tenant_id, vendor_id, order_date, due_date, total, tax_rate, tax_amount, status)
  values (po.tenant_id, po.vendor_id, coalesce(bill_date, current_date), due_date, po.total, po.tax_rate, po.tax_amount, 'draft')
  returning id into new_id;

  insert into bill_lines (bill_id, description, qty, unit_cost)
  select new_id, description, qty, unit_cost from purchase_order_lines where purchase_order_id = target_po_id;

  update purchase_orders set status = 'closed' where id = target_po_id;
  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function convert_quote_to_sales_order(target_quote_id uuid, expected_date date)
returns uuid as $$
declare
  q quotes%rowtype;
  new_id uuid;
begin
  select * into q from quotes where id = target_quote_id;
  perform assert_tenant_access(q.tenant_id);

  insert into sales_orders (tenant_id, customer_id, order_date, expected_date, total, tax_rate, tax_amount, status)
  values (q.tenant_id, q.customer_id, current_date, expected_date, q.total, q.tax_rate, q.tax_amount, 'draft')
  returning id into new_id;

  insert into sales_order_lines (sales_order_id, item_id, description, qty, unit_price)
  select new_id, item_id, description, qty, unit_price from quote_lines where quote_id = target_quote_id;

  update quotes set status = 'converted' where id = target_quote_id;
  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- 1 (cont.) Remaining functions ----------
create or replace function issue_employee_loan(target_tenant uuid, target_employee_id uuid, loan_principal numeric, loan_monthly_deduction numeric, loan_date date)
returns uuid as $$
declare
  new_id uuid;
  je_id uuid;
  loans_account uuid; cash_account uuid;
begin
  perform assert_tenant_access(target_tenant);
  if not exists (select 1 from employees where id = target_employee_id and tenant_id = target_tenant) then
    raise exception 'That employee isn''t in this company.';
  end if;

  insert into employee_loans (tenant_id, employee_id, principal, monthly_deduction, balance_remaining, start_date)
  values (target_tenant, target_employee_id, loan_principal, loan_monthly_deduction, loan_principal, loan_date)
  returning id into new_id;

  select id into loans_account from accounts where tenant_id = target_tenant and code = '1150';
  select id into cash_account from accounts where tenant_id = target_tenant and code = '1000';

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (target_tenant, loan_date, 'Employee loan issued', auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, loans_account, loan_principal, 0),
    (je_id, cash_account, 0, loan_principal);

  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function next_doc_number(target_tenant uuid, dtype text, prefix text)
returns text as $$
declare
  n int;
begin
  perform assert_tenant_access(target_tenant);
  insert into doc_counters (tenant_id, doc_type, next_number) values (target_tenant, dtype, 2)
  on conflict (tenant_id, doc_type) do update set next_number = doc_counters.next_number + 1
  returning next_number - 1 into n;
  return prefix || '-' || lpad(n::text, 4, '0');
end;
$$ language plpgsql security definer set search_path = public;

create or replace function post_recurring_entry(target_recurring_id uuid, post_date date)
returns uuid as $$
declare
  rec recurring_entries%rowtype;
  je_id uuid;
  line record;
  next_date date;
begin
  select * into rec from recurring_entries where id = target_recurring_id;
  perform assert_tenant_access(rec.tenant_id);
  if not rec.active then return null; end if;

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (rec.tenant_id, post_date, rec.memo || ' (recurring)', auth.uid()) returning id into je_id;

  for line in select * from recurring_entry_lines where recurring_entry_id = target_recurring_id loop
    insert into journal_lines (journal_entry_id, account_id, debit, credit)
    values (je_id, line.account_id, line.debit, line.credit);
  end loop;

  if rec.frequency = 'weekly' then
    next_date := (rec.next_run_date + interval '7 days')::date;
  else
    next_date := (rec.next_run_date + interval '1 month')::date;
  end if;

  update recurring_entries set
    next_run_date = next_date,
    active = case when rec.end_date is not null and next_date > rec.end_date then false else rec.active end
  where id = target_recurring_id;

  return je_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function record_depreciation(asset_id uuid, dep_amount numeric, dep_date date)
returns void as $$
declare
  fa fixed_assets%rowtype;
  je_id uuid;
  dep_exp_account uuid; accum_dep_account uuid;
begin
  select * into fa from fixed_assets where id = asset_id;
  perform assert_tenant_access(fa.tenant_id);
  select id into dep_exp_account from accounts where tenant_id = fa.tenant_id and code = '5400';
  select id into accum_dep_account from accounts where tenant_id = fa.tenant_id and code = '1590';

  insert into journal_entries (tenant_id, entry_date, memo, created_by)
  values (fa.tenant_id, dep_date, 'Depreciation, ' || fa.name, auth.uid()) returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, dep_exp_account, dep_amount, 0),
    (je_id, accum_dep_account, 0, dep_amount);

  insert into depreciation_entries (tenant_id, fixed_asset_id, entry_date, amount)
  values (fa.tenant_id, asset_id, dep_date, dep_amount);

  update fixed_assets set accumulated_depreciation = accumulated_depreciation + dep_amount where id = asset_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function run_payroll(target_tenant uuid)
returns void as $$
declare
  gross numeric;
  headcount int;
  je_id uuid;
  payroll_account uuid; cash_account uuid;
begin
  perform assert_tenant_access(target_tenant);
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
$$ language plpgsql security definer set search_path = public;

-- run_payroll_ph and post_13th_month_pay are long; prepend the check to the
-- live definitions rather than restating them.
do $$
declare
  r record;
  def text;
begin
  for r in select p.oid from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('run_payroll_ph', 'post_13th_month_pay') loop
    def := pg_get_functiondef(r.oid);
    if position('assert_tenant_access' in def) = 0 then
      def := regexp_replace(def, E'\nbegin\n', E'\nbegin\n  perform assert_tenant_access(target_tenant);\n');
      execute def;
    end if;
  end loop;
end $$;

-- ---------- 2. No rewriting posted documents or payments through the API ----------
-- "Direct" = a statement sent by a signed-in or signed-out client. Statements
-- run by the Post/Void/Record-payment functions execute as the function owner
-- and pass straight through.
create or replace function guard_document_write()
returns trigger as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception 'New documents start as drafts — use Send / Post to book them.';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.status not in ('draft', 'pending_approval') then
      raise exception 'A posted document can''t be deleted — void it instead.';
    end if;
    return old;
  else
    if old.status in ('draft', 'pending_approval') then
      if new.status is distinct from old.status then
        raise exception 'Use Send / Post to change a document''s status.';
      end if;
      return new;
    end if;
    -- posted or voided: only the due date may change
    if (to_jsonb(new) - 'due_date') is distinct from (to_jsonb(old) - 'due_date') then
      raise exception 'A posted document can''t be changed — void it and create a new one. (The due date can still be edited.)';
    end if;
    return new;
  end if;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists trg_guard_invoice_write on invoices;
create trigger trg_guard_invoice_write before insert or update or delete on invoices
  for each row execute function guard_document_write();
drop trigger if exists trg_guard_bill_write on bills;
create trigger trg_guard_bill_write before insert or update or delete on bills
  for each row execute function guard_document_write();

-- TG_ARGV[0] = parent table, TG_ARGV[1] = foreign-key column on the lines table.
create or replace function guard_document_lines()
returns trigger as $$
declare
  parent_status text;
  parent_id uuid;
begin
  if current_user not in ('anon', 'authenticated') then
    return coalesce(new, old);
  end if;
  parent_id := (to_jsonb(coalesce(new, old)) ->> tg_argv[1])::uuid;
  execute format('select status from %I where id = $1', tg_argv[0]) into parent_status using parent_id;
  if parent_status is not null and parent_status not in ('draft', 'pending_approval') then
    raise exception 'The lines of a posted document can''t be changed — void it and create a new one.';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql set search_path = public;

drop trigger if exists trg_guard_invoice_lines on invoice_lines;
create trigger trg_guard_invoice_lines before insert or update or delete on invoice_lines
  for each row execute function guard_document_lines('invoices', 'invoice_id');
drop trigger if exists trg_guard_bill_lines on bill_lines;
create trigger trg_guard_bill_lines before insert or update or delete on bill_lines
  for each row execute function guard_document_lines('bills', 'bill_id');

create or replace function block_direct_payment_write()
returns trigger as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'Payments are recorded with the Record payment form — they can''t be edited directly.';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql set search_path = public;

drop trigger if exists trg_block_invoice_payment_write on invoice_payments;
create trigger trg_block_invoice_payment_write before insert or update or delete on invoice_payments
  for each row execute function block_direct_payment_write();
drop trigger if exists trg_block_bill_payment_write on bill_payments;
create trigger trg_block_bill_payment_write before insert or update or delete on bill_payments
  for each row execute function block_direct_payment_write();

-- ---------- 6. Company records ----------
drop policy if exists "read tenants" on tenants;
create policy "read tenants" on tenants for select using (auth.uid() is not null);
-- create_tenant() is the only way to make a company; it doesn't need this.
drop policy if exists "create tenant" on tenants;

create or replace function guard_tenant_update()
returns trigger as $$
begin
  if current_user in ('anon', 'authenticated') and is_teacher() is not true then
    if (to_jsonb(new) - 'books_locked_through' - 'approval_threshold')
       is distinct from (to_jsonb(old) - 'books_locked_through' - 'approval_threshold') then
      raise exception 'Only the books lock date and the approval threshold can be changed here.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists trg_guard_tenant_update on tenants;
create trigger trg_guard_tenant_update before update on tenants
  for each row execute function guard_tenant_update();

-- ---------- 7. Fixed search_path + who may call what ----------
do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proconfig is null loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;

  -- Callable functions: signed-in users only. Trigger functions can't be called
  -- directly and keep their defaults; is_teacher()/my_tenant_id() are used by
  -- row-level-security policies and stay open.
  for r in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
             and p.prorettype <> 'trigger'::regtype
             and p.proname not in ('is_teacher', 'my_tenant_id') loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
