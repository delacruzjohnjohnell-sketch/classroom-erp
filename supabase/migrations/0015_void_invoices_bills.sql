-- ============================================================
-- Classroom ERP — upgrade migration 0015
-- AUDIT.md, missing features: "No editing or voiding of past
-- transactions". Journal entries already have a "Reverse" button
-- (0004). This extends the same pattern to invoices and bills: void
-- an already-posted one and it posts a proper reversing entry
-- (Reverse, not delete — the original stays in the audit trail) and
-- rolls back its inventory effect.
--
-- Scope, stated plainly:
--   - Only a posted invoice (status 'fulfilled') or bill (status
--     'received') can be voided — a draft has no GL/inventory impact
--     to undo in the first place.
--   - Blocked if any payment has been recorded against it. Reverse
--     the payment's journal entry in Financials first, then void.
--     (A "void with payments" flow would need to also unwind the
--     payment atomically — deliberately out of scope for now rather
--     than half-building it.)
-- ============================================================

-- ---------- Link journal entries back to the document that posted them ----------
-- Needed so void_invoice/void_bill can find exactly which entries to reverse,
-- instead of guessing from the memo text.

alter table journal_entries add column if not exists source_table text;
alter table journal_entries add column if not exists source_id uuid;

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

  insert into journal_entries (tenant_id, entry_date, memo, created_by, source_table, source_id)
  values (inv.tenant_id, current_date, 'Invoice ' || coalesce(inv.document_number, target_invoice_id::text), auth.uid(), 'invoices', target_invoice_id)
  returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, ar_account, inv.total, 0),
    (je_id, rev_account, 0, inv.total);

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

  insert into journal_entries (tenant_id, entry_date, memo, created_by, source_table, source_id)
  values (b.tenant_id, current_date, 'Bill ' || coalesce(b.document_number, target_bill_id::text), auth.uid(), 'bills', target_bill_id)
  returning id into je_id;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values
    (je_id, inv_account, b.total, 0),
    (je_id, ap_account, 0, b.total);

  update bills set status = 'received' where id = target_bill_id;
end;
$$ language plpgsql security definer;

-- ---------- Allow the new status ----------

alter table invoices drop constraint if exists sales_orders_status_check;
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check check (status in ('draft', 'pending_approval', 'fulfilled', 'void'));

alter table bills drop constraint if exists purchase_orders_status_check;
alter table bills drop constraint if exists bills_status_check;
alter table bills add constraint bills_status_check check (status in ('draft', 'pending_approval', 'received', 'void'));

-- ---------- Void an invoice / bill ----------

create or replace function void_invoice(target_invoice_id uuid, void_date date)
returns void as $$
declare
  inv invoices%rowtype;
  paid numeric;
  je record;
  line record;
begin
  select * into inv from invoices where id = target_invoice_id;
  if inv.status <> 'fulfilled' then
    raise exception 'Only a posted invoice can be voided.';
  end if;

  select coalesce(sum(amount), 0) into paid from invoice_payments where invoice_id = target_invoice_id;
  if paid > 0 then
    raise exception 'This invoice has payments recorded — reverse the payment(s) in Financials first, then void it.';
  end if;

  for je in select id from journal_entries where source_table = 'invoices' and source_id = target_invoice_id loop
    perform reverse_journal_entry(je.id, void_date);
  end loop;

  for line in select * from invoice_lines where invoice_id = target_invoice_id loop
    if line.item_id is not null then
      update items set qty_on_hand = qty_on_hand + line.qty where id = line.item_id;
    end if;
  end loop;

  update invoices set status = 'void' where id = target_invoice_id;
end;
$$ language plpgsql security definer;

create or replace function void_bill(target_bill_id uuid, void_date date)
returns void as $$
declare
  b bills%rowtype;
  paid numeric;
  je record;
  line record;
  existing_item items%rowtype;
begin
  select * into b from bills where id = target_bill_id;
  if b.status <> 'received' then
    raise exception 'Only a posted bill can be voided.';
  end if;

  select coalesce(sum(amount), 0) into paid from bill_payments where bill_id = target_bill_id;
  if paid > 0 then
    raise exception 'This bill has payments recorded — reverse the payment(s) in Financials first, then void it.';
  end if;

  for je in select id from journal_entries where source_table = 'bills' and source_id = target_bill_id loop
    perform reverse_journal_entry(je.id, void_date);
  end loop;

  for line in select * from bill_lines where bill_id = target_bill_id loop
    select * into existing_item from items where tenant_id = b.tenant_id and lower(name) = lower(line.description);
    if found then
      update items set qty_on_hand = greatest(0, qty_on_hand - line.qty) where id = existing_item.id;
    end if;
  end loop;

  update bills set status = 'void' where id = target_bill_id;
end;
$$ language plpgsql security definer;
