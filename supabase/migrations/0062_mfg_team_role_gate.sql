-- ============================================================
-- Classroom ERP — migration 0062 (Manufacturing ERP: roles are enforced on the screens that write straight to a table)
--
-- Needs 0049. In a TEAM company the 69 posting functions already ask for the caller's role (mfg__my_tenant(area)). A few screens never went through that
-- door: they write directly to a table or call the shared Standard payment functions, so ANY member (even an Auditor, or a member with no role) could
-- add customers, take a payment, register an asset… This migration closes that gap, for team companies only.
--
--   mfg__team_need(tenant, area)   Raises "your role can't …" when the caller is a MEMBER of a TEAM company and holds no role with that area. Does nothing for
--                                  solo companies, the Standard ERP, the teacher, a caller who is not a member of that company, or a caller without a session
--                                  (database jobs). So the Standard ERP and every solo company behave exactly as before.
--   Triggers (one small function mfg__gate_trg, area as its argument):
--     sales      customers, quotes, quote lines (add / delete), sales orders (add, delete, and the confirm step while still a draft), sales order lines (add / delete), new invoices
--     purchasing vendors
--     master     work centers, units, unit conversions, storage locations, holidays
--     costing    activity rates, the overhead costing sheet, cost centers
--     finance    fixed assets, recurring entries (and their lines), adding or deleting chart-of-accounts rows
--   One line added to the Standard functions that team screens call, each only when the company is a team company:
--     post_invoice (Send invoice) -> sales · record_invoice_payment, record_depreciation, post_recurring_entry -> finance · record_bill_payment -> ap
--   mfg_area_label gets friendlier wording for the areas these checks use.
--   mfg_can_release_invoice(inv)  true when the caller may release that held invoice (the screen shows Release only then).
--   mfg_approve_held_invoice: in a team company the Finance manager (area 'approve') may release a vendor invoice that is ON HOLD, as long as someone else entered it. Until now only the teacher could.
--
-- Roles that can do each area (unchanged, mfg__role_areas): PURCHASING purchasing, ap · WAREHOUSE stock, issue, shipping · PRODUCTION production, planning, master, issue ·
--   QUALITY quality · SALES sales, shipping · ACCOUNTANT finance, ap, costing, settle · FINANCE_MANAGER finance, ap, costing, settle, close, approve · AUDITOR none.
--
-- ROLLBACK: put back the teacher-only check in mfg_approve_held_invoice (migration 0050); drop the triggers named mfg_gate_* (drop trigger if exists … on …), drop function mfg__gate_trg(), mfg__gate_child_trg(), mfg__team_need(uuid, text);
--           re-run the definitions of the five Standard functions from their last migration (0002/0020 and later) to remove the added line; re-run 0049's mfg_area_label.
-- ============================================================

create or replace function mfg__team_need(p_tenant uuid, p_area text)
returns void as $$
declare
  mine text;
begin
  if p_tenant is null or auth.uid() is null or is_teacher() then return; end if;
  if not exists (select 1 from mfg_teams where tenant_id = p_tenant) then return; end if;                                   -- solo company or Standard ERP
  if not exists (select 1 from memberships where tenant_id = p_tenant and user_id = auth.uid()) then return; end if;        -- not a member: other rules apply
  if mfg__can(p_tenant, auth.uid(), p_area) then return; end if;
  select string_agg(mfg_role_label(r.role), ', ' order by r.role) into mine from mfg_company_roles r where r.tenant_id = p_tenant and r.user_id = auth.uid();
  raise exception 'In this team company your role (%) can''t %. Ask your teacher if you should hold another role.', coalesce(mine, 'none yet'), mfg_area_label(p_area);
end;
$$ language plpgsql stable security definer set search_path = public;
revoke execute on function mfg__team_need(uuid, text) from public, anon, authenticated;

create or replace function mfg_area_label(p_area text)
returns text as $$
  select case p_area
    when 'master' then 'change master data (items, bills of materials, routings, work centers, units, locations)' when 'costing' then 'work on cost estimates, activity rates and the overhead sheet'
    when 'purchasing' then 'create or change purchase orders and vendors' when 'ap' then 'enter or void vendor invoices and landed costs, or pay vendors'
    when 'planning' then 'run planning (MRP, forecasts, planned orders)' when 'production' then 'work on production orders and the shop floor'
    when 'issue' then 'issue materials to production' when 'stock' then 'post stock receipts, adjustments or transfers'
    when 'shipping' then 'deliver goods' when 'sales' then 'work on customers, quotes, sales orders and sales invoices' when 'quality' then 'record inspections and decisions'
    when 'finance' then 'prepare or reverse journal vouchers, record customer payments and depreciation, or manage assets and accounts' when 'settle' then 'settle orders or the month'
    when 'close' then 'close the month' when 'admin' then 'load the demo company' else 'do that' end;
$$ language sql immutable set search_path = public;

-- a trigger on a table that has a tenant_id column; the area is the trigger argument
create or replace function mfg__gate_trg()
returns trigger as $$
declare
  t uuid; a text := tg_argv[0]; scope text := coalesce(tg_argv[1], 'all');
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then t := old.tenant_id; else t := new.tenant_id; end if;
  -- 'draft' scope: an update only counts while the row is still a draft (the confirm step); later status changes are made by posting functions
  if tg_op = 'UPDATE' and scope = 'draft' and coalesce(to_jsonb(old) ->> 'status', '') <> 'draft' then return new; end if;
  perform mfg__team_need(t, a);
  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;
revoke execute on function mfg__gate_trg() from public, anon, authenticated;

-- a trigger on a child table: the tenant is found through the parent row (argument 1 = parent table, 2 = the child's column that holds the parent id)
create or replace function mfg__gate_child_trg()
returns trigger as $$
declare
  t uuid; a text := tg_argv[0]; parent text := tg_argv[1]; col text := tg_argv[2]; k uuid;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then k := (to_jsonb(old) ->> col)::uuid; else k := (to_jsonb(new) ->> col)::uuid; end if;
  execute format('select tenant_id from %I where id = $1', parent) into t using k;
  perform mfg__team_need(t, a);
  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;
revoke execute on function mfg__gate_child_trg() from public, anon, authenticated;

do $do$
declare
  r record;
begin
  for r in select * from (values
    -- table, area, events, scope
    ('customers', 'sales', 'insert or update or delete', 'all'),
    ('quotes', 'sales', 'insert or update or delete', 'all'),
    ('sales_orders', 'sales', 'insert or update or delete', 'draft'),
    ('invoices', 'sales', 'insert', 'all'),
    ('vendors', 'purchasing', 'insert or update or delete', 'all'),
    ('mfg_work_centers', 'master', 'insert or update or delete', 'all'),
    ('mfg_uom', 'master', 'insert or update or delete', 'all'),
    ('mfg_uom_conversions', 'master', 'insert or update or delete', 'all'),
    ('mfg_storage_locations', 'master', 'insert or update or delete', 'all'),
    ('mfg_holidays', 'master', 'insert or update or delete', 'all'),
    ('mfg_activity_rates', 'costing', 'insert or update or delete', 'all'),
    ('mfg_costing_sheet', 'costing', 'insert or update or delete', 'all'),
    ('mfg_cost_centers', 'costing', 'insert or update or delete', 'all'),
    ('fixed_assets', 'finance', 'insert or update or delete', 'all'),
    ('recurring_entries', 'finance', 'insert or update or delete', 'all'),
    ('accounts', 'finance', 'insert or delete', 'all')
  ) as x(tbl, area, ev, scope) loop
    execute format('drop trigger if exists mfg_gate_%1$s on %1$I', r.tbl);
    execute format('create trigger mfg_gate_%1$s before %3$s on %1$I for each row execute function mfg__gate_trg(%2$L, %4$L)', r.tbl, r.area, r.ev, r.scope);
  end loop;
  for r in select * from (values
    ('sales_order_lines', 'sales', 'sales_orders', 'sales_order_id'),
    ('quote_lines', 'sales', 'quotes', 'quote_id'),
    ('recurring_entry_lines', 'finance', 'recurring_entries', 'recurring_entry_id')
  ) as x(tbl, area, parent, col) loop
    execute format('drop trigger if exists mfg_gate_%1$s on %1$I', r.tbl);
    execute format('create trigger mfg_gate_%1$s before insert or delete on %1$I for each row execute function mfg__gate_child_trg(%2$L, %3$L, %4$L)', r.tbl, r.area, r.parent, r.col);
  end loop;
end $do$;

-- the Standard functions that team screens call: one line each, after their own tenant check
do $do$
declare
  r record; d text; n text;
begin
  for r in select * from (values
    ('post_invoice(uuid)', 'inv.tenant_id', 'sales'),
    ('record_invoice_payment(uuid, numeric, date, text)', 'inv.tenant_id', 'finance'),
    ('record_bill_payment(uuid, numeric, date, text)', 'b.tenant_id', 'ap'),
    ('record_depreciation(uuid, numeric, date)', 'fa.tenant_id', 'finance'),
    ('post_recurring_entry(uuid, date)', 'rec.tenant_id', 'finance')
  ) as x(sig, tenant_expr, area) loop
    d := pg_get_functiondef(r.sig::regprocedure);
    if position('mfg__team_need' in d) > 0 then continue; end if;
    n := replace(d, 'perform assert_tenant_access(' || r.tenant_expr || E');\n', 'perform assert_tenant_access(' || r.tenant_expr || E');\n  perform mfg__team_need(' || r.tenant_expr || ', ' || quote_literal(r.area) || E');\n');
    if n = d then raise exception '% did not look as expected; nothing changed.', r.sig; end if;
    execute n;
  end loop;
end $do$;

-- a held vendor invoice may be released by the teacher, or in a TEAM company by its Finance manager (never by the person who entered it)
create or replace function mfg_approve_held_invoice(p_inv uuid)
returns void as $$
declare
  i mfg_vendor_invoices;
begin
  select * into i from mfg_vendor_invoices where id = p_inv;
  if i.id is null then raise exception 'That vendor invoice was not found.'; end if;
  if is_teacher() is not true then
    if not (i.tenant_id = my_tenant_id() and exists (select 1 from mfg_teams where tenant_id = i.tenant_id) and mfg__can(i.tenant_id, auth.uid(), 'approve')) then
      raise exception 'Only the teacher can release an invoice that is on hold (in a team company, its finance manager can too).';
    end if;
    if i.created_by is not distinct from auth.uid() then raise exception 'You entered this invoice, so someone else must release it.'; end if;
  end if;
  perform assert_mfg_tenant(i.tenant_id);
  if i.status <> 'HELD' then raise exception 'That invoice is not on hold (it is %).', lower(i.status); end if;
  perform mfg__vi_post(p_inv, auth.uid());
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (i.tenant_id, 'held_invoice_released', jsonb_build_object('invoice', i.document_number, 'reason', i.hold_reason), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- the vendor-invoice screen asks this to decide whether to show the Release button (same rule as the function above)
create or replace function mfg_can_release_invoice(p_inv uuid)
returns boolean as $$
declare
  i mfg_vendor_invoices;
begin
  select * into i from mfg_vendor_invoices where id = p_inv;
  if i.id is null or i.status <> 'HELD' then return false; end if;
  if is_teacher() then return true; end if;
  return i.tenant_id = my_tenant_id() and exists (select 1 from mfg_teams where tenant_id = i.tenant_id)
         and mfg__can(i.tenant_id, auth.uid(), 'approve') and i.created_by is distinct from auth.uid();
end;
$$ language plpgsql stable security definer set search_path = public;
revoke execute on function mfg_can_release_invoice(uuid) from public, anon;
grant execute on function mfg_can_release_invoice(uuid) to authenticated;
