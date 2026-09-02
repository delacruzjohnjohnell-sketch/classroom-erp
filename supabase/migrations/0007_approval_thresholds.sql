-- ============================================================
-- Classroom ERP — upgrade migration 0007
-- Approval thresholds: any invoice or bill above a company-set
-- dollar amount can't post itself — it queues as "Pending approval"
-- until the teacher approves it. This is the single biggest thing
-- missing to make the system behave like a real ERP: nothing
-- currently gates a transaction behind review.
-- ============================================================

alter table tenants add column if not exists approval_threshold numeric;

-- Allow the new intermediate status on both document types.
alter table purchase_orders drop constraint if exists purchase_orders_status_check;
alter table purchase_orders add constraint purchase_orders_status_check
  check (status in ('draft', 'pending_approval', 'received'));

alter table sales_orders drop constraint if exists sales_orders_status_check;
alter table sales_orders add constraint sales_orders_status_check
  check (status in ('draft', 'pending_approval', 'fulfilled'));

-- Receiving a bill now checks the threshold. Students triggering a bill over the
-- threshold get queued instead of posted; a teacher calling the same function
-- (is_teacher() = true) always posts immediately, which is also how a teacher
-- approves a queued one — call it again as the teacher.
create or replace function receive_purchase_order(po_id uuid)
returns void as $$
declare
  po purchase_orders%rowtype;
  line record;
  existing_item items%rowtype;
  je_id uuid;
  inv_account uuid;
  ap_account uuid;
  threshold numeric;
begin
  select * into po from purchase_orders where id = po_id;
  if po.status = 'received' then return; end if;

  select approval_threshold into threshold from tenants where id = po.tenant_id;
  if threshold is not null and po.total > threshold and not is_teacher() then
    update purchase_orders set status = 'pending_approval' where id = po_id;
    return;
  end if;

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

-- Same gating for invoices.
create or replace function fulfill_sales_order(so_id uuid)
returns void as $$
declare
  so sales_orders%rowtype;
  line record;
  it items%rowtype;
  je_id uuid;
  cogs numeric := 0;
  ar_account uuid; rev_account uuid; cogs_account uuid; inv_account uuid;
  threshold numeric;
begin
  select * into so from sales_orders where id = so_id;
  if so.status = 'fulfilled' then return; end if;

  select approval_threshold into threshold from tenants where id = so.tenant_id;
  if threshold is not null and so.total > threshold and not is_teacher() then
    update sales_orders set status = 'pending_approval' where id = so_id;
    return;
  end if;

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
