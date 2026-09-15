-- ============================================================
-- Classroom ERP — upgrade migration 0016
-- SAP-comparison audit, priority #1: "no document has a tax field."
-- Adds an optional flat tax rate (e.g. 12% PH VAT) per document,
-- entered once on a quote/PO and carried forward through each
-- conversion step, with correct GL treatment: tax collected on a
-- sale is a liability owed to the government (not revenue), and tax
-- paid on a purchase is a recoverable asset (not an expense) — the
-- standard input/output VAT treatment.
--
-- tax_rate/tax_amount default to 0 on every table, so any tenant
-- that never touches the new field behaves exactly as before —
-- the same 2-line journal entry, no VAT Payable/Input Tax line.
-- ============================================================

-- ---------- New columns ----------

alter table quotes add column if not exists tax_rate numeric not null default 0;
alter table quotes add column if not exists tax_amount numeric not null default 0;
alter table sales_orders add column if not exists tax_rate numeric not null default 0;
alter table sales_orders add column if not exists tax_amount numeric not null default 0;
alter table invoices add column if not exists tax_rate numeric not null default 0;
alter table invoices add column if not exists tax_amount numeric not null default 0;
alter table purchase_orders add column if not exists tax_rate numeric not null default 0;
alter table purchase_orders add column if not exists tax_amount numeric not null default 0;
alter table bills add column if not exists tax_rate numeric not null default 0;
alter table bills add column if not exists tax_amount numeric not null default 0;

-- ---------- New accounts (existing tenants) ----------

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '2200', 'VAT Payable', 'liability', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '2200');

insert into accounts (tenant_id, code, name, type, is_bank)
select id, '1160', 'Input Tax (VAT)', 'asset', false from tenants
where not exists (select 1 from accounts a where a.tenant_id = tenants.id and a.code = '1160');

-- Seed the same two accounts for every NEW tenant going forward.
create or replace function create_tenant(tenant_name text)
returns uuid as $$
declare
  new_id uuid;
begin
  insert into tenants (name, owner_id) values (tenant_name, auth.uid()) returning id into new_id;

  insert into accounts (tenant_id, code, name, type, is_bank) values
    (new_id, '1000', 'Cash', 'asset', true),
    (new_id, '1100', 'Accounts Receivable', 'asset', false),
    (new_id, '1150', 'Employee Loans Receivable', 'asset', false),
    (new_id, '1160', 'Input Tax (VAT)', 'asset', false),
    (new_id, '1200', 'Inventory', 'asset', false),
    (new_id, '1500', 'Fixed Assets', 'asset', false),
    (new_id, '1590', 'Accumulated Depreciation', 'asset', false),
    (new_id, '2000', 'Accounts Payable', 'liability', false),
    (new_id, '2100', 'SSS Payable', 'liability', false),
    (new_id, '2110', 'PhilHealth Payable', 'liability', false),
    (new_id, '2120', 'Pag-IBIG Payable', 'liability', false),
    (new_id, '2130', 'Withholding Tax Payable', 'liability', false),
    (new_id, '2200', 'VAT Payable', 'liability', false),
    (new_id, '3000', 'Owner''s Equity', 'equity', false),
    (new_id, '4000', 'Sales Revenue', 'revenue', false),
    (new_id, '5000', 'Cost of Goods Sold', 'expense', false),
    (new_id, '5100', 'Operating Expenses', 'expense', false),
    (new_id, '5200', 'Marketing Expense', 'expense', false),
    (new_id, '5300', 'Payroll Expense', 'expense', false),
    (new_id, '5310', 'Payroll Tax Expense (Employer Share)', 'expense', false),
    (new_id, '5320', '13th Month Pay Expense', 'expense', false),
    (new_id, '5400', 'Depreciation Expense', 'expense', false);

  update profiles set tenant_id = new_id where id = auth.uid();
  return new_id;
end;
$$ language plpgsql security definer;

-- ---------- Carry tax forward through the document chain ----------
-- Same conversion logic as before, just copying tax_rate/tax_amount along
-- with everything else instead of re-entering it at each stage.

create or replace function convert_quote_to_sales_order(target_quote_id uuid, expected_date date)
returns uuid as $$
declare
  q quotes%rowtype;
  new_id uuid;
begin
  select * into q from quotes where id = target_quote_id;

  insert into sales_orders (tenant_id, customer_id, order_date, expected_date, total, tax_rate, tax_amount, status)
  values (q.tenant_id, q.customer_id, current_date, expected_date, q.total, q.tax_rate, q.tax_amount, 'draft')
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

  insert into invoices (tenant_id, customer_id, order_date, due_date, total, tax_rate, tax_amount, status)
  values (so.tenant_id, so.customer_id, current_date, due_date, so.total, so.tax_rate, so.tax_amount, 'draft')
  returning id into new_id;

  insert into invoice_lines (invoice_id, item_id, description, qty, unit_price)
  select new_id, item_id, description, qty, unit_price from sales_order_lines where sales_order_id = so.id;

  update sales_orders set status = 'invoiced' where id = so_id;
  return new_id;
end;
$$ language plpgsql security definer;

create or replace function create_bill_from_po(target_po_id uuid)
returns uuid as $$
declare
  po purchase_orders%rowtype;
  new_id uuid;
begin
  select * into po from purchase_orders where id = target_po_id;

  insert into bills (tenant_id, vendor_id, order_date, total, tax_rate, tax_amount, status)
  values (po.tenant_id, po.vendor_id, current_date, po.total, po.tax_rate, po.tax_amount, 'draft')
  returning id into new_id;

  insert into bill_lines (bill_id, description, qty, unit_cost)
  select new_id, description, qty, unit_cost from purchase_order_lines where purchase_order_id = target_po_id;

  update purchase_orders set status = 'closed' where id = target_po_id;
  return new_id;
end;
$$ language plpgsql security definer;

-- ---------- Post with correct output-VAT treatment ----------
-- Dr AR (total, incl. tax) / Cr Revenue (subtotal) / Cr VAT Payable (tax, if any).
-- The VAT Payable line is only inserted when tax_amount > 0, so an untaxed
-- invoice still gets exactly the same 2-line entry as before this migration.

create or replace function post_invoice(target_invoice_id uuid)
returns void as $$
declare
  inv invoices%rowtype;
  line record;
  it items%rowtype;
  je_id uuid;
  cogs numeric := 0;
  ar_account uuid; rev_account uuid; cogs_account uuid; inv_account uuid; vat_payable_account uuid;
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
  values (inv.tenant_id, current_date, 'Invoice ' || coalesce(inv.document_number, target_invoice_id::text), auth.uid(), 'invoices', target_invoice_id)
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
    values (inv.tenant_id, current_date, 'COGS, invoice ' || coalesce(inv.document_number, target_invoice_id::text), auth.uid(), 'invoices', target_invoice_id)
    returning id into je_id;
    insert into journal_lines (journal_entry_id, account_id, debit, credit) values
      (je_id, cogs_account, round(cogs, 2), 0),
      (je_id, inv_account, 0, round(cogs, 2));
  end if;

  update invoices set status = 'fulfilled' where id = target_invoice_id;
end;
$$ language plpgsql security definer;

-- ---------- Post with correct input-VAT treatment ----------
-- Dr Inventory (subtotal) / Dr Input Tax (tax, if any) / Cr AP (total, incl. tax).

create or replace function post_bill(target_bill_id uuid)
returns void as $$
declare
  b bills%rowtype;
  line record;
  existing_item items%rowtype;
  je_id uuid;
  inv_account uuid;
  ap_account uuid;
  input_tax_account uuid;
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
  values (b.tenant_id, current_date, 'Bill ' || coalesce(b.document_number, target_bill_id::text), auth.uid(), 'bills', target_bill_id)
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
$$ language plpgsql security definer;
