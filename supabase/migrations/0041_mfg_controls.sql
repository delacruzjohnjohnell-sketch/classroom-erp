-- ============================================================
-- Classroom ERP — migration 0041 (Manufacturing ERP, Phase 8a: integrity and controls)
--
-- Needs 0023–0040. Closes the integrity gaps found in the audit of 2026-10-18. Everything is scoped to MANUFACTURING companies by
-- tenant_edition(); a Standard company behaves exactly as before (proved by regression_standard.sql and the fingerprints in the 8a test).
-- The user approved the two triggers on existing Standard tables (items, bills) — see MANUFACTURING_AUDIT.md section 7.
--
--   R1  items          A student could change items.qty_on_hand and unit_cost directly through the API, with no stock document and no
--                      journal entry. trg_mfg_items_guard refuses client changes to those two columns (and a client insert with a
--                      quantity or cost) in a Manufacturing company. The functions that move stock run as the database owner, so they
--                      are not affected (the same current_user test guard_tenant_update uses).
--   R2  control accounts  guard_mfg_control_accounts (ours, from 0029) refused a manual line on an inventory, WIP, GR/IR or applied-cost
--                      account only when the entry had no source_table, so naming any source_table got round it. It now also refuses
--                      every line a client (anon/authenticated) inserts on those accounts, whatever the entry says.
--   R3  Standard bills  post_bill and void_bill are Standard functions that move stock and cost by item name; used on a Manufacturing
--                      company's bill they would double-count. trg_mfg_bills_guard refuses, in a Manufacturing company, posting a bill
--                      (draft -> received) and voiding one unless the void comes from the Manufacturing vendor-invoice / landed-cost
--                      void functions, which now say so with a transaction-local setting (mfg.system). Manufacturing creates its bills
--                      already 'received', so nothing it does is affected.
--   R5  exposure       mfg_order_wip and mfg_account (security definer, no tenant check) and the trigger function guard_mfg_membership
--                      are no longer executable by clients; five arithmetic helpers get a fixed search path.
--
-- ROLLBACK (restores the previous behaviour; then re-run 0029 and 0033 to restore the two guard/void functions):
--   drop trigger if exists trg_mfg_items_guard on items; drop trigger if exists trg_mfg_bills_guard on bills;
--   drop function if exists mfg_items_guard(), mfg_bills_guard();
--   grant execute on function mfg_order_wip(uuid), mfg_account(uuid, text) to authenticated;
-- ============================================================

-- ---------- R1: the stock and cost columns on items belong to the stock functions ----------
create or replace function mfg_items_guard()
returns trigger as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;                 -- a Manufacturing function (runs as the owner)
  if tenant_edition(new.tenant_id) is distinct from 'MANUFACTURING' then return new; end if; -- Standard companies are untouched
  if tg_op = 'INSERT' then
    if coalesce(new.qty_on_hand, 0) <> 0 or coalesce(new.unit_cost, 0) <> 0 then
      raise exception 'In a Manufacturing company stock and cost are set by stock documents, not typed on the item. Create the item with no quantity and post an opening balance under Inventory.';
    end if;
  elsif new.qty_on_hand is distinct from old.qty_on_hand or new.unit_cost is distinct from old.unit_cost then
    raise exception 'In a Manufacturing company stock on hand and unit cost change only through stock documents (receipts, issues, counts) so the books always agree. Use Inventory → Adjust and transfer.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;                      -- runs as the caller on purpose: current_user is the test

drop trigger if exists trg_mfg_items_guard on items;
create trigger trg_mfg_items_guard before insert or update on items
  for each row execute function mfg_items_guard();

-- ---------- R2: no client line on a control account, whatever the entry claims ----------
create or replace function guard_mfg_control_accounts()
returns trigger as $$
declare
  e record;
  k text;
begin
  select tenant_id, source_table into e from journal_entries where id = new.journal_entry_id;
  if e.tenant_id is null then return new; end if;
  if tenant_edition(e.tenant_id) <> 'MANUFACTURING' then return new; end if;
  if e.source_table is not null and current_user not in ('anon', 'authenticated') then return new; end if;   -- a system posting from a function
  select d.key into k from mfg_account_determination d
   where d.tenant_id = e.tenant_id and d.account_id = new.account_id
     and d.key in ('RM_INVENTORY', 'WIP', 'FG_INVENTORY', 'PACKAGING_INVENTORY', 'GR_IR', 'APPLIED_LABOR', 'APPLIED_MACHINE', 'APPLIED_FIXED_OH', 'LANDED_COST_CLEARING')
   limit 1;
  if k is not null then
    raise exception 'This account is run by the system, so it can''t take a manual journal line. Inventory, work in process, GR/IR and applied cost accounts change only through stock and production documents — use the Inventory, Purchasing or Production screens instead.';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;                      -- runs as the caller on purpose: current_user is the test

-- ---------- R3: the Standard bill functions do not post or void a Manufacturing company's bills ----------
create or replace function mfg_bills_guard()
returns trigger as $$
begin
  if tenant_edition(new.tenant_id) is distinct from 'MANUFACTURING' then return new; end if;
  if new.status = 'received' and old.status is distinct from 'received' and coalesce(current_setting('mfg.system', true), '') <> '1' then
    raise exception 'A Manufacturing company records vendor bills under Purchasing → Vendor invoice (matched to the purchase order and the goods received), not with the Standard bill posting, which would count the stock twice.';
  end if;
  if new.status = 'void' and old.status is distinct from 'void' and coalesce(current_setting('mfg.system', true), '') <> '1' then
    raise exception 'Void a Manufacturing vendor invoice or landed-cost voucher from Purchasing, where the stock, the clearing account and the payable are reversed together.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_mfg_bills_guard on bills;
create trigger trg_mfg_bills_guard before update of status on bills
  for each row execute function mfg_bills_guard();

-- the two Manufacturing void functions (ours, from 0033) now declare themselves
create or replace function mfg_void_vendor_invoice(p_inv uuid, p_date date default current_date, p_reason text default null)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v_date date := coalesce(p_date, current_date);
  i mfg_vendor_invoices; v_paid numeric;
begin
  perform set_config('mfg.system', '1', true);                       -- tells the bills guard this void comes from a Manufacturing function
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are voiding it — the reason stays on the record.'; end if;
  select * into i from mfg_vendor_invoices where id = p_inv and tenant_id = v_t for update;
  if i.id is null then raise exception 'That vendor invoice was not found.'; end if;
  if i.status <> 'POSTED' then raise exception 'Only a posted invoice can be voided (this one is %).', lower(i.status); end if;
  if v_date < i.invoice_date then raise exception 'The void can''t be dated before the invoice (%).', to_char(i.invoice_date, 'Mon DD, YYYY'); end if;
  select coalesce(sum(amount), 0) into v_paid from bill_payments where bill_id = i.bill_id;
  if v_paid <> 0 then raise exception 'A payment of % has been made on this invoice, so it can''t be voided. Only an unpaid invoice can be.', v_paid; end if;
  perform mfg__reverse_entry(v_t, i.journal_entry_id, v_date, 'Void of vendor invoice ' || i.document_number, 'mfg_vendor_invoices', i.id);
  update bills set status = 'void' where id = i.bill_id;
  update mfg_vendor_invoices set status = 'VOID', note = trim(p_reason) where id = p_inv;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'vendor_invoice_voided', jsonb_build_object('invoice', i.document_number, 'reason', p_reason), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_void_landed_cost(p_voucher uuid, p_date date default current_date, p_reason text default null)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v_date date := coalesce(p_date, current_date);
  c mfg_landed_cost_vouchers; v_paid numeric; r record; v_onhand numeric; v_avg numeric;
begin
  perform set_config('mfg.system', '1', true);                       -- tells the bills guard this void comes from a Manufacturing function
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are voiding it — the reason stays on the record.'; end if;
  select * into c from mfg_landed_cost_vouchers where id = p_voucher and tenant_id = v_t for update;
  if c.id is null then raise exception 'That landed cost was not found.'; end if;
  if c.status <> 'POSTED' then raise exception 'Only a posted landed cost can be voided (this one is %).', lower(c.status); end if;
  if v_date < c.voucher_date then raise exception 'The void can''t be dated before the landed cost (%).', to_char(c.voucher_date, 'Mon DD, YYYY'); end if;
  select coalesce(sum(amount), 0) into v_paid from bill_payments where bill_id = c.bill_id;
  if v_paid <> 0 then raise exception 'A payment of % has been made on this invoice, so it can''t be voided. Only an unpaid invoice can be.', v_paid; end if;

  for r in select item_id, sum(capitalised) as cap from mfg_landed_cost_lines where voucher_id = p_voucher group by item_id having sum(capitalised) > 0 loop
    select coalesce(sum(qty), 0) into v_onhand from mfg_stock where tenant_id = v_t and item_id = r.item_id;
    if v_onhand <= 0 then
      raise exception 'The goods this cost was added to are no longer in stock, so it can''t be taken back out of their cost. Leave it in place.';
    end if;
    select moving_avg_cost into v_avg from mfg_item_master where item_id = r.item_id;
    v_avg := greatest(round(v_avg - r.cap / v_onhand, 6), 0);
    update mfg_item_master set moving_avg_cost = v_avg where item_id = r.item_id;
    update items set unit_cost = v_avg where id = r.item_id;
  end loop;
  perform mfg__reverse_entry(v_t, c.journal_entry_id, v_date, 'Void of landed cost ' || c.document_number, 'mfg_landed_cost_vouchers', c.id);
  update bills set status = 'void' where id = c.bill_id;
  update mfg_landed_cost_vouchers set status = 'VOID', note = trim(p_reason) where id = p_voucher;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- R5: exposure ----------
alter function mfg__inv_key(text) set search_path = public;
alter function mfg__avg_after(numeric, numeric, numeric, numeric) set search_path = public;
alter function mfg__bucket(date, date, int, int) set search_path = public;
alter function mfg__lot_qty(text, numeric, numeric, numeric, numeric) set search_path = public;
alter function mfg_moving_average(numeric, numeric, numeric, numeric) set search_path = public;
revoke execute on function mfg_order_wip(uuid) from public, anon, authenticated;
revoke execute on function mfg_account(uuid, text) from public, anon, authenticated;
revoke execute on function guard_mfg_membership() from public, anon, authenticated;
revoke execute on function mfg_items_guard() from public, anon, authenticated;
revoke execute on function mfg_bills_guard() from public, anon, authenticated;
revoke execute on function mfg_void_vendor_invoice(uuid, date, text) from public, anon;
revoke execute on function mfg_void_landed_cost(uuid, date, text) from public, anon;
grant execute on function mfg_void_vendor_invoice(uuid, date, text) to authenticated;
grant execute on function mfg_void_landed_cost(uuid, date, text) to authenticated;
